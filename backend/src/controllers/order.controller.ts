import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { buildOrderMessage } from '../lib/orderMessage';
import { sendOrderEmail, OrderEmailError } from '../lib/orderEmail';
import { createOrdersFromCartSchema, updateOrderLinesSchema, updateOrderStatusSchema } from '../schemas/order.schemas';

const ORDER_INCLUDE = {
  lineItems: { include: { product: { select: { id: true, name: true, unit: true } } } },
  supplier: { select: { id: true, name: true, contactEmail: true, preferredChannel: true } },
} as const;

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

// Génère le message de commande et tente l'envoi réel par email
// (Resend). En cas d'échec (clé absente/invalide, panne réseau, refus
// de l'API), la commande reste en DRAFT et le message généré est quand
// même renvoyé : le gérant peut le copier et l'envoyer manuellement par
// un autre canal (téléphone, WhatsApp — voir Supplier.preferredChannel).
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

  if (!order.supplier.contactEmail) {
    return res.status(400).json({
      error: 'MISSING_CONTACT_EMAIL',
      message: "Ce fournisseur n'a pas d'adresse email renseignée.",
      generatedMessage: message,
    });
  }

  try {
    await sendOrderEmail(order.supplier.contactEmail, message.subject, message.text);
  } catch (err) {
    const errorMessage = err instanceof OrderEmailError ? err.message : "Échec inattendu de l'envoi.";
    logger.warn({ err, orderId: order.id }, 'Envoi de commande par email échoué — message disponible pour envoi manuel');
    return res.status(502).json({ error: 'EMAIL_SEND_FAILED', message: errorMessage, generatedMessage: message });
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
