-- AlterTable: products に item_url を追加し store_name を削除する
-- store_name は scan_histories.location JSONB で管理するため不要
-- item_url は楽天アフィリエイト URL 用
ALTER TABLE "products" ADD COLUMN "item_url" TEXT;
ALTER TABLE "products" DROP COLUMN IF EXISTS "store_name";
