DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('dispatcher', 'admin');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'User'
      AND column_name = 'role'
      AND udt_name <> 'UserRole'
  ) THEN
    ALTER TABLE "User"
      ALTER COLUMN "role" TYPE "UserRole"
      USING "role"::"UserRole";
  END IF;
END $$;

ALTER TABLE "User"
  ALTER COLUMN "role" SET DEFAULT 'dispatcher';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductKind') THEN
    CREATE TYPE "ProductKind" AS ENUM ('pill', 'liquid', 'syringe', 'tablets');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DistributionStatus') THEN
    CREATE TYPE "DistributionStatus" AS ENUM ('pending', 'processing', 'delivered', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeliveryStopStatus') THEN
    CREATE TYPE "DeliveryStopStatus" AS ENUM ('done', 'active', 'next');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Outlet" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "area" TEXT NOT NULL,
  "phone" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Outlet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Outlet_name_key" ON "Outlet"("name");

CREATE TABLE IF NOT EXISTS "Vehicle" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "registrationNumber" TEXT NOT NULL,
  "driverName" TEXT NOT NULL,
  "defaultDeliveryFee" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_registrationNumber_key" ON "Vehicle"("registrationNumber");

CREATE TABLE IF NOT EXISTS "Product" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "kind" "ProductKind" NOT NULL,
  "price" INTEGER NOT NULL,
  "color" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Product_name_key" ON "Product"("name");

CREATE TABLE IF NOT EXISTS "StockBatch" (
  "id" TEXT NOT NULL,
  "batchNumber" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "outletId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "unitsRemaining" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StockBatch_batchNumber_key" ON "StockBatch"("batchNumber");

CREATE TABLE IF NOT EXISTS "Distribution" (
  "id" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "outletId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "status" "DistributionStatus" NOT NULL DEFAULT 'processing',
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "deliveryFee" INTEGER NOT NULL DEFAULT 0,
  "totalAmount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Distribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Distribution_orderNumber_key" ON "Distribution"("orderNumber");

CREATE TABLE IF NOT EXISTS "DistributionItem" (
  "id" TEXT NOT NULL,
  "distributionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DistributionItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DeliveryStop" (
  "id" TEXT NOT NULL,
  "distributionId" TEXT NOT NULL,
  "outletId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "routeCode" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "DeliveryStopStatus" NOT NULL DEFAULT 'next',
  "scheduledTime" TIMESTAMP(3) NOT NULL,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryStop_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryStop_distributionId_key" ON "DeliveryStop"("distributionId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockBatch_outletId_fkey') THEN
    ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_outletId_fkey"
      FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockBatch_productId_fkey') THEN
    ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Distribution_outletId_fkey') THEN
    ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_outletId_fkey"
      FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Distribution_vehicleId_fkey') THEN
    ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_vehicleId_fkey"
      FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DistributionItem_distributionId_fkey') THEN
    ALTER TABLE "DistributionItem" ADD CONSTRAINT "DistributionItem_distributionId_fkey"
      FOREIGN KEY ("distributionId") REFERENCES "Distribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DistributionItem_productId_fkey') THEN
    ALTER TABLE "DistributionItem" ADD CONSTRAINT "DistributionItem_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryStop_distributionId_fkey') THEN
    ALTER TABLE "DeliveryStop" ADD CONSTRAINT "DeliveryStop_distributionId_fkey"
      FOREIGN KEY ("distributionId") REFERENCES "Distribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryStop_outletId_fkey') THEN
    ALTER TABLE "DeliveryStop" ADD CONSTRAINT "DeliveryStop_outletId_fkey"
      FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryStop_vehicleId_fkey') THEN
    ALTER TABLE "DeliveryStop" ADD CONSTRAINT "DeliveryStop_vehicleId_fkey"
      FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
