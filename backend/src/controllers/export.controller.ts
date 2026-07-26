import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { toCsv } from '../lib/csv';
import { invoiceExportQuerySchema } from '../schemas/export.schemas';
import { monthRangeInTimezone } from '../lib/timezone';

const UNIT_LABELS: Record<string, string> = { KG: 'kg', G: 'g', L: 'L', ML: 'mL', UNITE: 'unité' };

// Export comptable des achats fournisseurs : une ligne par ligne de
// facture validée sur la période demandée. Seules les factures
// VALIDATED sont incluses — une facture encore en brouillon ou en
// erreur d'extraction n'a pas de données fiables à exporter vers la
// comptabilité.
export async function exportInvoicesCsv(req: Request, res: Response) {
  const query = invoiceExportQuerySchema.parse(req.query);

  let from = query.from;
  let to = query.to;
  if (!from || !to) {
    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { id: req.user!.restaurantId },
      select: { timezone: true },
    });
    const currentMonth = monthRangeInTimezone(new Date(), restaurant.timezone);
    from = from ?? currentMonth.monthStart;
    to = to ?? currentMonth.monthEnd;
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      restaurantId: req.user!.restaurantId,
      status: 'VALIDATED',
      invoiceDate: { gte: from, lt: to },
    },
    include: {
      supplier: { select: { name: true } },
      lineItems: { include: { product: { select: { name: true, unit: true } } } },
    },
    orderBy: { invoiceDate: 'asc' },
  });

  const rows: (string | number)[][] = [];
  for (const invoice of invoices) {
    for (const line of invoice.lineItems) {
      rows.push([
        invoice.invoiceDate ? invoice.invoiceDate.toISOString().slice(0, 10) : '',
        invoice.supplier?.name ?? '',
        line.product?.name ?? line.rawLabel,
        Number(line.quantity),
        UNIT_LABELS[line.product?.unit ?? ''] ?? '',
        Number(line.unitPriceHT).toFixed(2),
        Number(line.totalPriceHT).toFixed(2),
      ]);
    }
  }

  const csv = toCsv(
    ['Date', 'Fournisseur', 'Produit', 'Quantité', 'Unité', 'Prix unitaire HT (€)', 'Total HT (€)'],
    rows,
  );

  const filename = `factures_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}
