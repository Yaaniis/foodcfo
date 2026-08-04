-- CreateEnum
CREATE TYPE "PosProvider" AS ENUM ('LIGHTSPEED', 'LADDITION', 'ZELTY', 'INNOVORDER', 'CLYO_SYSTEMS');

-- CreateTable
CREATE TABLE "pos_connections" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "provider" "PosProvider" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),

    CONSTRAINT "pos_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sales" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "posConnectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sale_line_items" (
    "id" TEXT NOT NULL,
    "posSaleId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "rawLabel" TEXT NOT NULL,
    "quantity" DECIMAL(10,4) NOT NULL,
    "unitPriceTTC" DECIMAL(10,2) NOT NULL,
    "totalPriceTTC" DECIMAL(10,2) NOT NULL,
    "wasManuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_sale_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_connections_restaurantId_idx" ON "pos_connections"("restaurantId");

-- CreateIndex
CREATE INDEX "pos_connections_restaurantId_isActive_idx" ON "pos_connections"("restaurantId", "isActive");

-- CreateIndex
CREATE INDEX "pos_sales_restaurantId_idx" ON "pos_sales"("restaurantId");

-- CreateIndex
CREATE INDEX "pos_sales_restaurantId_soldAt_idx" ON "pos_sales"("restaurantId", "soldAt");

-- CreateIndex
CREATE UNIQUE INDEX "pos_sales_posConnectionId_externalId_key" ON "pos_sales"("posConnectionId", "externalId");

-- CreateIndex
CREATE INDEX "pos_sale_line_items_posSaleId_idx" ON "pos_sale_line_items"("posSaleId");

-- CreateIndex
CREATE INDEX "pos_sale_line_items_menuItemId_idx" ON "pos_sale_line_items"("menuItemId");

-- AddForeignKey
ALTER TABLE "pos_connections" ADD CONSTRAINT "pos_connections_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_posConnectionId_fkey" FOREIGN KEY ("posConnectionId") REFERENCES "pos_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_line_items" ADD CONSTRAINT "pos_sale_line_items_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "pos_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_line_items" ADD CONSTRAINT "pos_sale_line_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
