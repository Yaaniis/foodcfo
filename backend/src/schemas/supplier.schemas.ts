import { z } from 'zod';

export const orderChannelSchema = z.enum(['EMAIL', 'PHONE', 'SMS', 'WHATSAPP', 'WEB_PORTAL', 'FAX']);

export const createSupplierSchema = z.object({
  name: z.string().min(1, 'Nom du fournisseur requis.'),
  category: z.string().min(1, 'Catégorie requise.'),
  preferredChannel: orderChannelSchema,
  contactEmail: z.string().email('Adresse email invalide.').optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
