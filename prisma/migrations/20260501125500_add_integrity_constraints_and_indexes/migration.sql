-- Enforce non-negative/positive data integrity at DB level
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'StockBatch_unitsRemaining_non_negative'
  ) THEN
    ALTER TABLE "StockBatch"
      ADD CONSTRAINT "StockBatch_unitsRemaining_non_negative"
      CHECK ("unitsRemaining" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Product_price_positive'
  ) THEN
    ALTER TABLE "Product"
      ADD CONSTRAINT "Product_price_positive"
      CHECK ("price" > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PurchaseOrderItem_quantity_positive'
  ) THEN
    ALTER TABLE "PurchaseOrderItem"
      ADD CONSTRAINT "PurchaseOrderItem_quantity_positive"
      CHECK ("quantity" > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PurchaseOrderItem_costPrice_positive'
  ) THEN
    ALTER TABLE "PurchaseOrderItem"
      ADD CONSTRAINT "PurchaseOrderItem_costPrice_positive"
      CHECK ("costPrice" > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'DistributionItem_quantity_positive'
  ) THEN
    ALTER TABLE "DistributionItem"
      ADD CONSTRAINT "DistributionItem_quantity_positive"
      CHECK ("quantity" > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'DistributionItem_unitPrice_positive'
  ) THEN
    ALTER TABLE "DistributionItem"
      ADD CONSTRAINT "DistributionItem_unitPrice_positive"
      CHECK ("unitPrice" > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Distribution_deliveryFee_non_negative'
  ) THEN
    ALTER TABLE "Distribution"
      ADD CONSTRAINT "Distribution_deliveryFee_non_negative"
      CHECK ("deliveryFee" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Distribution_totalAmount_non_negative'
  ) THEN
    ALTER TABLE "Distribution"
      ADD CONSTRAINT "Distribution_totalAmount_non_negative"
      CHECK ("totalAmount" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Vehicle_defaultDeliveryFee_non_negative'
  ) THEN
    ALTER TABLE "Vehicle"
      ADD CONSTRAINT "Vehicle_defaultDeliveryFee_non_negative"
      CHECK ("defaultDeliveryFee" >= 0);
  END IF;
END $$;

-- Query performance / contention helpers
CREATE INDEX IF NOT EXISTS "StockBatch_product_expiresAt_idx"
  ON "StockBatch"("productId", "expiresAt");

CREATE INDEX IF NOT EXISTS "StockBatch_product_unitsRemaining_idx"
  ON "StockBatch"("productId", "unitsRemaining");

CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_createdAt_idx"
  ON "PurchaseOrder"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "Distribution_vehicle_scheduledFor_idx"
  ON "Distribution"("vehicleId", "scheduledFor");

