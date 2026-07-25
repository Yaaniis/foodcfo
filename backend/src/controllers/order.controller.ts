import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { buildOrderMessage } from '../lib/orderMessage';
import { sendEmail, EmailError } from '../lib/email';
import { sendWhatsAppMessage, WhatsAppError } from '../lib/whatsapp';
import { sendSms, SmsError } from '../lib/sms';
import { createOrdersFromCartSchema, updateOrderLinesSchema, updateOrderStatusSchema } from '../schemas/order.schemas';

const ORDER_INCLUDE = {
  lineItems: { include: { product: { select: { id: true, name: true, unit: true } } } },
  supplier: {
    select: { id: true, name: true, contactEmail: true, contactPhone: true, preferredChannel: true },
  },
} as const;

// Décide quel canal automatique tenter selon la préférence du
// fournisseur (Supplier.preferredChannel). PHONE, WEB_PORTAL et FAX
// n'ont pas d'envoi automatisé possible ici — même repli qu'avant pour
// eux (message généré à copier manuellement).
type SendChannelResult =
  | { ok: true }
  // Coordonnée manquante (email/téléphone) : problème de configuration
  // du fournisseur, jamais tenté d'appel réseau → 400.
  | { ok: false; status: 400; error: string; message: string }
  // Échec réel de l'envoi (clé absente, panne réseau, refus de l'API)
  // → 502, la commande reste exploitable via le repli manuel.
  | { ok: false; status: 502; error: string; message: string };

async function sendViaPreferredChannel(
  channel: string,
  contactEmail: string | null,
  contactPhone: string | null,
  subject: string,
  text: string,
): Promise<SendChannelResult> {
  if (channel === 'WHATSAPP') {
    if (!contactPhone) {
      return {
        ok: false,
        status: 400,
        error: 'MISSING_CONTACT_PHONE',
        message: "Ce fournisseur n'a pas de numéro de téléphone renseigné.",
      };
    }
    try {
      await sendWhatsAppMessage(contactPhone, text);
      return { ok: true };
    } catch (err) {
      const message = err instanceof WhatsAppError ? err.message : "Échec inattendu de l'envoi WhatsApp.";
      return { ok: false, status: 502, error: 'WHATSAPP_SEND_FAILED', message };
    }
  }

  if (channel === 'SMS') {
    if (!contactPhone) {
      return {
        ok: false,
        status: 400,
        error: 'MISSING_CONTACT_PHONE',
        message: "Ce fournisseur n'a pas de numéro de téléphone renseigné.",
      };
    }
    try {
      await sendSms(contactPhone, text);
      return { ok: true };
    } catch (err) {
      const message = err instanceof SmsError ? err.message : "Échec inattendu de l'envoi SMS.";
      return { ok: false, status: 502, error: 'SMS_SEND_FAILED', message };
    }
  }

  // EMAIL (par défaut) — aussi le repli pour PHONE/WEB_PORTAL/FAX, qui
  // n'ont pas d'API d'envoi automatisé : si le fournisseur a quand même
  // une adresse email renseignée, on l'utilise plutôt que d'abandonner.
  if (!contactEmail) {
    return {
      ok: false,
      status: 400,
      error: 'MISSING_CONTACT_EMAIL',
      message: "Ce fournisseur n'a pas d'adresse email renseignée.",
    };
  }
  try {
    await sendEmail(contactEmail, subject, text);
    return { ok: true };
  } catch (err) {
    const message = err instanceof EmailError ? err.message : "Échec inattendu de l'envoi.";
    return { ok: false, status: 502, error: 'EMAIL_SEND_FAILED', message };
  }
}

// États suivants autorisés depuis chaque statut. SENT n'apparaît jamais
// ici : on n'y arrive que via /send, jamais via ce endpoint générique,
// pour garder `sentAt` fiable.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['CANCELLED'],
  SENT: ['CONFIRMED', 'DELIVERED', 'CANCELLED'],
  CONFIRMED: ['DELIVERED'],
};

export async function listOrders(req: Request, res: Response) {
  const orders = await prisma.order.findMany({
    where: { restaurantId: req.user!.restaurantId },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ orders });
}

export async function getOrder(req: Request, res: Response) {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
    include: ORDER_INCLUDE,
  });
  if (!order) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Commande introuvable.' });
  }
  res.json({ order });
}

// Suggestion de quantités basée sur l'historique : pour chaque produit,
// la quantité de sa commande la plus récente (toutes commandes
// confondues, y compris annulées — une quantité passée reste un
// indicateur utile même si la commande n'a pas abouti).
export async function getOrderSuggestions(req: Request, res: Response) {
  const lineItems = await prisma.orderLineItem.findMany({
    where: { order: { restaurantId: req.user!.restaurantId } },
    select: { productId: true, quantity: true },
    orderBy: { order: { createdAt: 'desc' } },
  });

  const suggestions: Record<string, number> = {};
  for (const line of lineItems) {
    if (!(line.productId in suggestions)) {
      suggestions[line.productId] = Number(line.quantity);
    }
  }
  res.json({ suggestions });
}

// Panier groupé par fournisseur : l'utilisateur choisit des produits
// (potentiellement de plusieurs fournisseurs différents) en une seule
// fois, et une commande brouillon distincte est créée par fournisseur —
// impossible d'envoyer une seule commande à deux fournisseurs à la fois.
export async function createOrdersFromCart(req: Request, res: Response) {
  const input = createOrdersFromCartSchema.parse(req.body);
  const productIds = input.items.map((i) => i.productId);

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, restaurantId: req.user!.restaurantId },
  });
  if (products.length !== new Set(productIds).size) {
    return res.status(400).json({ error: 'INVALID_PRODUCT', message: 'Un ou plusieurs produits sont invalides.' });
  }
  const productById = new Map(products.map((p) => [p.id, p]));

  const bySupplier = new Map<string, { productId: string; quantity: number }[]>();
  for (const item of input.items) {
    const product = productById.get(item.productId)!;
    const list = bySupplier.get(product.supplierId) ?? [];
    list.push({ productId: item.productId, quantity: item.quantity });
    bySupplier.set(product.supplierId, list);
  }

  const orders = await Promise.all(
    Array.from(bySupplier.entries()).map(([supplierId, items]) =>
      prisma.order.create({
        data: {
          restaurantId: req.user!.restaurantId,
          supplierId,
          status: 'DRAFT',
          lineItems: { create: items.map((i) => ({ productId: i.productId, quantity: i.quantity })) },
        },
        include: ORDER_INCLUDE,
      }),
    ),
  );

  res.status(201).json({ orders });
}

export async function updateOrderLines(req: Request, res: Response) {
  const input = updateOrderLinesSchema.parse(req.body);

  const order = await prisma.order.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!order) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Commande introuvable.' });
  }
  if (order.status !== 'DRAFT') {
    return res
      .status(400)
      .json({ error: 'INVALID_STATUS', message: "Seule une commande à l'état brouillon peut être modifiée." });
  }

  const productIds = input.lineItems.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, restaurantId: req.user!.restaurantId, supplierId: order.supplierId },
  });
  if (products.length !== new Set(productIds).size) {
    return res.status(400).json({
      error: 'INVALID_PRODUCT',
      message: "Un ou plusieurs produits n'appartiennent pas au fournisseur de cette commande.",
    });
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      lineItems: {
        deleteMany: {},
        create: input.lineItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      },
    },
    include: ORDER_INCLUDE,
  });
  res.json({ order: updated });
}

// Génère le message de commande et tente l'envoi réel par le canal
// préféré du fournisseur (email/Resend, WhatsApp Business, ou SMS/Twilio
// — Supplier.preferredChannel). En cas d'échec (clé absente/invalide,
// coordonnée manquante, panne réseau, refus de l'API), la commande
// reste en DRAFT et le message généré est quand même renvoyé : le
// gérant peut le copier et l'envoyer manuellement.
export async function sendOrder(req: Request, res: Response) {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
    include: { ...ORDER_INCLUDE, restaurant: { select: { name: true } } },
  });
  if (!order) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Commande introuvable.' });
  }
  if (order.status !== 'DRAFT') {
    return res
      .status(400)
      .json({ error: 'INVALID_STATUS', message: "Seule une commande à l'état brouillon peut être envoyée." });
  }
  if (order.lineItems.length === 0) {
    return res.status(400).json({ error: 'NO_LINES', message: 'La commande ne contient aucune ligne.' });
  }

  const message = buildOrderMessage(
    order.restaurant.name,
    order.lineItems.map((l) => ({ productName: l.product.name, quantity: Number(l.quantity), unit: l.product.unit })),
  );

  const result = await sendViaPreferredChannel(
    order.supplier.preferredChannel,
    order.supplier.contactEmail,
    order.supplier.contactPhone,
    message.subject,
    message.text,
  );

  if (!result.ok) {
    logger.warn(
      { orderId: order.id, channel: order.supplier.preferredChannel, error: result.error },
      'Envoi de commande échoué — message disponible pour envoi manuel',
    );
    return res.status(result.status).json({ error: result.error, message: result.message, generatedMessage: message });
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status: 'SENT', sentAt: new Date() },
    include: ORDER_INCLUDE,
  });
  res.json({ order: updated, generatedMessage: message });
}

export async function updateOrderStatus(req: Request, res: Response) {
  const input = updateOrderStatusSchema.parse(req.body);

  const order = await prisma.order.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!order) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Commande introuvable.' });
  }

  const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(input.status)) {
    return res.status(400).json({
      error: 'INVALID_TRANSITION',
      message: `Impossible de passer une commande de "${order.status}" à "${input.status}".`,
    });
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: input.status,
      ...(input.status === 'CONFIRMED' ? { confirmedAt: new Date() } : {}),
      ...(input.status === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
    },
    include: ORDER_INCLUDE,
  });
  res.json({ order: updated });
}
