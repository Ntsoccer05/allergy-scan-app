-- AlterTable: scan_histories に memo カラムを追加する
-- NULL 許容で追加するためダウンタイムなし・既存レコードは全て NULL になる
ALTER TABLE "scan_histories" ADD COLUMN IF NOT EXISTS "memo" TEXT;
