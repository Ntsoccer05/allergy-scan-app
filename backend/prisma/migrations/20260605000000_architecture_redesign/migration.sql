-- CreateTable: plans
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "daily_scan_limit" INTEGER NOT NULL,
    "price_monthly_jpy" INTEGER NOT NULL DEFAULT 0,
    "price_yearly_jpy" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

-- CreateTable: user_subscriptions
CREATE TABLE "user_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "current_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_period_end" TIMESTAMP(3),
    "stripe_subscription_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "user_subscriptions_user_idx" ON "user_subscriptions"("user_id", "status");

-- CreateTable: user_daily_scans
CREATE TABLE "user_daily_scans" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scan_date" DATE NOT NULL,
    "scan_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "user_daily_scans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_daily_scans_user_id_scan_date_key" ON "user_daily_scans"("user_id", "scan_date");
CREATE INDEX "user_daily_scans_user_date_idx" ON "user_daily_scans"("user_id", "scan_date");

-- CreateTable: stripe_customers
CREATE TABLE "stripe_customers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stripe_customers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stripe_customers_user_id_key" ON "stripe_customers"("user_id");
CREATE UNIQUE INDEX "stripe_customers_stripe_customer_id_key" ON "stripe_customers"("stripe_customer_id");

-- AlterTable: users - add updated_at, remove onboarding_done / last_used_at
ALTER TABLE "users" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "users" DROP COLUMN IF EXISTS "onboarding_done";
ALTER TABLE "users" DROP COLUMN IF EXISTS "last_used_at";

-- AlterTable: scan_histories - add ocr_image_url, is_public
ALTER TABLE "scan_histories" ADD COLUMN "ocr_image_url" TEXT;
ALTER TABLE "scan_histories" ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT true;

-- DropTable: backup_codes (Supabase Auth で代替)
DROP TABLE IF EXISTS "backup_codes";

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_daily_scans" ADD CONSTRAINT "user_daily_scans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stripe_customers" ADD CONSTRAINT "stripe_customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
