-- AlterTable: users に onboarding_done カラムと locale カラムを追加する
-- DEFAULT 付きで追加するためダウンタイムなし・既存レコードは全て false / 'ja' になる
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'ja';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_done" BOOLEAN NOT NULL DEFAULT false;
