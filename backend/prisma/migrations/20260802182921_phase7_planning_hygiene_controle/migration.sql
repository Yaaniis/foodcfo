-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'VALIDATED');

-- CreateEnum
CREATE TYPE "ControlOrganism" AS ENUM ('URSSAF', 'DDPP', 'DGCCRF', 'DGFIP', 'INSPECTION_TRAVAIL');

-- CreateTable
CREATE TABLE "employee_availabilities" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekday" "Weekday",
    "specificDate" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staffing_requirements" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "role" "UserRole" NOT NULL,
    "startTime" TIME NOT NULL,
    "endTime" TIME NOT NULL,
    "requiredCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staffing_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIME NOT NULL,
    "endTime" TIME NOT NULL,
    "wasManuallyAdjusted" BOOLEAN NOT NULL DEFAULT false,
    "actualStartTime" TIME,
    "actualEndTime" TIME,
    "isAbsent" BOOLEAN NOT NULL DEFAULT false,
    "absenceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hygiene_reference_items" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaData" BYTEA,
    "mediaMimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hygiene_reference_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cleaning_checklist_templates" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cleaning_checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cleaning_checklist_template_items" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "cleaning_checklist_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cleaning_checklist_completions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "completedById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cleaning_checklist_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cleaning_checklist_completion_items" (
    "id" TEXT NOT NULL,
    "completionId" TEXT NOT NULL,
    "templateItemId" TEXT NOT NULL,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3),

    CONSTRAINT "cleaning_checklist_completion_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_documents" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "organism" "ControlOrganism" NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fileData" BYTEA NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_availabilities_restaurantId_userId_idx" ON "employee_availabilities"("restaurantId", "userId");

-- CreateIndex
CREATE INDEX "staffing_requirements_restaurantId_weekday_idx" ON "staffing_requirements"("restaurantId", "weekday");

-- CreateIndex
CREATE INDEX "schedules_restaurantId_periodStart_idx" ON "schedules"("restaurantId", "periodStart");

-- CreateIndex
CREATE INDEX "shift_assignments_scheduleId_idx" ON "shift_assignments"("scheduleId");

-- CreateIndex
CREATE INDEX "shift_assignments_userId_date_idx" ON "shift_assignments"("userId", "date");

-- CreateIndex
CREATE INDEX "hygiene_reference_items_restaurantId_idx" ON "hygiene_reference_items"("restaurantId");

-- CreateIndex
CREATE INDEX "cleaning_checklist_templates_restaurantId_idx" ON "cleaning_checklist_templates"("restaurantId");

-- CreateIndex
CREATE INDEX "cleaning_checklist_template_items_templateId_idx" ON "cleaning_checklist_template_items"("templateId");

-- CreateIndex
CREATE INDEX "cleaning_checklist_completions_restaurantId_serviceDate_idx" ON "cleaning_checklist_completions"("restaurantId", "serviceDate");

-- CreateIndex
CREATE INDEX "cleaning_checklist_completion_items_completionId_idx" ON "cleaning_checklist_completion_items"("completionId");

-- CreateIndex
CREATE UNIQUE INDEX "cleaning_checklist_completion_items_completionId_templateIt_key" ON "cleaning_checklist_completion_items"("completionId", "templateItemId");

-- CreateIndex
CREATE INDEX "control_documents_restaurantId_organism_idx" ON "control_documents"("restaurantId", "organism");

-- AddForeignKey
ALTER TABLE "employee_availabilities" ADD CONSTRAINT "employee_availabilities_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_availabilities" ADD CONSTRAINT "employee_availabilities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_requirements" ADD CONSTRAINT "staffing_requirements_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hygiene_reference_items" ADD CONSTRAINT "hygiene_reference_items_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_checklist_templates" ADD CONSTRAINT "cleaning_checklist_templates_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_checklist_template_items" ADD CONSTRAINT "cleaning_checklist_template_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "cleaning_checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_checklist_completions" ADD CONSTRAINT "cleaning_checklist_completions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_checklist_completions" ADD CONSTRAINT "cleaning_checklist_completions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "cleaning_checklist_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_checklist_completions" ADD CONSTRAINT "cleaning_checklist_completions_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_checklist_completion_items" ADD CONSTRAINT "cleaning_checklist_completion_items_completionId_fkey" FOREIGN KEY ("completionId") REFERENCES "cleaning_checklist_completions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_checklist_completion_items" ADD CONSTRAINT "cleaning_checklist_completion_items_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "cleaning_checklist_template_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_documents" ADD CONSTRAINT "control_documents_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_documents" ADD CONSTRAINT "control_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

