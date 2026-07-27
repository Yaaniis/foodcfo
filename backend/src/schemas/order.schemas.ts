import { z } from 'zod';
import { DECIMAL_10_4_MAX } from './decimalLimits';

export const createOrdersFromCartSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1, 'Produit requis.'),
        quantity: z.coerce
          .number()
          .positive('La quantité doit être positive.')
          .max(DECIMAL_10_4_MAX, 'Quantité trop élevée.'),
      }),
    )
    .min(1, 'Le panier ne peut pas être vide.'),
});

export const updateOrderLinesSchema = z.object({
  lineItems: z
    .array(
      z.object({
        productId: z.string().min(1, 'Produit requis.'),
        quantity: z.coerce
          .number()
          .positive('La quantité doit être positive.')
          .max(DECIMAL_10_4_MAX, 'Quantité trop élevée.'),
      }),
    )
    .min(1, 'Une commande doit contenir au moins une ligne.'),
});

// SENT n'est jamais fixé via cette route : seul l'endpoint /send peut y
// amener une commande, pour garder `sentAt` cohérent avec l'envoi réel
// (ou tenté) du message.
export const updateOrderStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'DELIVERED', 'CANCELLED']),
});

export type CreateOrdersFromCartInput = z.infer<typeof createOrdersFromCartSchema>;
export type UpdateOrderLinesInput = z.infer<typeof updateOrderLinesSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
