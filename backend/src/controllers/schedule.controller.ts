import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { generateScheduleSchema } from '../schemas/schedule.schemas';
import { generateSchedule, type Weekday } from '../lib/scheduleGenerator';
import { parseTimeString, formatTimeToString } from '../lib/time';

function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const SCHEDULE_INCLUDE = {
  validatedBy: { select: { id: true, firstName: true, lastName: true } },
  shiftAssignments: {
    include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  },
} satisfies Prisma.ScheduleInclude;

function serializeAssignment(a: {
  id: string;
  userId: string;
  user: { id: string; firstName: string; lastName: string; role: string };
  role: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  wasManuallyAdjusted: boolean;
  isAbsent: boolean;
  absenceNote: string | null;
}) {
  return {
    id: a.id,
    user: a.user,
    role: a.role,
    date: toDateOnlyString(a.date),
    startTime: formatTimeToString(a.startTime),
    endTime: formatTimeToString(a.endTime),
    wasManuallyAdjusted: a.wasManuallyAdjusted,
    isAbsent: a.isAbsent,
    absenceNote: a.absenceNote,
  };
}

function serializeSchedule(schedule: {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  generatedAt: Date;
  validatedAt: Date | null;
  validatedBy: { id: string; firstName: string; lastName: string } | null;
  shiftAssignments: Parameters<typeof serializeAssignment>[0][];
}) {
  return {
    id: schedule.id,
    periodStart: toDateOnlyString(schedule.periodStart),
    periodEnd: toDateOnlyString(schedule.periodEnd),
    status: schedule.status,
    generatedAt: schedule.generatedAt,
    validatedAt: schedule.validatedAt,
    validatedBy: schedule.validatedBy,
    shiftAssignments: schedule.shiftAssignments.map(serializeAssignment),
  };
}

export async function listSchedules(req: Request, res: Response) {
  const schedules = await prisma.schedule.findMany({
    where: { restaurantId: req.user!.restaurantId },
    include: SCHEDULE_INCLUDE,
    orderBy: { periodStart: 'desc' },
  });
  res.json({ schedules: schedules.map(serializeSchedule) });
}

export async function getSchedule(req: Request, res: Response) {
  const schedule = await prisma.schedule.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
    include: SCHEDULE_INCLUDE,
  });
  if (!schedule) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Planning introuvable.' });
  }
  res.json({ schedule: serializeSchedule(schedule) });
}

// Génère un planning en brouillon (DRAFT) à partir des besoins de
// staffing et des disponibilités déjà saisis — jamais transmis aux
// équipes tel quel, une validation humaine explicite est requise
// ensuite (POST .../validate). Voir lib/scheduleGenerator.ts pour le
// détail des règles appliquées (portée volontairement limitée au socle
// légal stable, pas la convention HCR dans son intégralité).
export async function generateScheduleForRestaurant(req: Request, res: Response) {
  const input = generateScheduleSchema.parse(req.body);
  const restaurantId = req.user!.restaurantId;

  const [staffingRequirements, availabilities, employees] = await Promise.all([
    prisma.staffingRequirement.findMany({ where: { restaurantId } }),
    prisma.employeeAvailability.findMany({ where: { restaurantId } }),
    prisma.user.findMany({ where: { restaurantId, isActive: true }, select: { id: true, role: true } }),
  ]);

  const result = generateSchedule({
    periodStart: toDateOnlyString(input.periodStart),
    periodEnd: toDateOnlyString(input.periodEnd),
    staffingRequirements: staffingRequirements.map((r) => ({
      weekday: r.weekday as Weekday,
      role: r.role,
      startTime: formatTimeToString(r.startTime),
      endTime: formatTimeToString(r.endTime),
      requiredCount: r.requiredCount,
    })),
    availabilities: availabilities.map((a) => ({
      userId: a.userId,
      weekday: a.weekday as Weekday | null,
      specificDate: a.specificDate ? toDateOnlyString(a.specificDate) : null,
    })),
    employees,
  });

  const schedule = await prisma.$transaction(async (tx) => {
    const created = await tx.schedule.create({
      data: {
        restaurantId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: 'DRAFT',
        shiftAssignments: {
          create: result.shifts.map((shift) => ({
            userId: shift.userId,
            role: shift.role,
            date: new Date(`${shift.date}T00:00:00.000Z`),
            startTime: parseTimeString(shift.startTime),
            endTime: parseTimeString(shift.endTime),
          })),
        },
      },
      include: SCHEDULE_INCLUDE,
    });
    return created;
  });

  res.status(201).json({
    schedule: serializeSchedule(schedule),
    unmetRequirements: result.unmetRequirements,
    employeeIdsWithoutRestDay: result.employeeIdsWithoutRestDay,
  });
}

// Verrouille le planning : DRAFT → VALIDATED uniquement (jamais l'inverse,
// même philosophie que INVOICE_VALIDATED — voir invoice.controller.ts).
export async function validateSchedule(req: Request, res: Response) {
  const existing = await prisma.schedule.findFirst({
    where: { id: req.params.id, restaurantId: req.user!.restaurantId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Planning introuvable.' });
  }
  if (existing.status === 'VALIDATED') {
    return res.status(409).json({ error: 'ALREADY_VALIDATED', message: 'Ce planning a déjà été validé.' });
  }

  const schedule = await prisma.schedule.update({
    where: { id: existing.id },
    data: { status: 'VALIDATED', validatedAt: new Date(), validatedById: req.user!.id },
    include: SCHEDULE_INCLUDE,
  });

  res.json({ schedule: serializeSchedule(schedule) });
}
