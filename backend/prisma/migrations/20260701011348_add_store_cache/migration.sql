-- CreateTable
CREATE TABLE "store_cache" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "genre" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'realtime',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_cache_areas" (
    "id" TEXT NOT NULL,
    "grid_key" TEXT NOT NULL,
    "radius_km" INTEGER NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'regional',
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_cache_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cache_jobs" (
    "id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "cache_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_cache_uid_key" ON "store_cache"("uid");

-- CreateIndex
CREATE INDEX "store_cache_geo_idx" ON "store_cache"("lat", "lng");

-- CreateIndex
CREATE INDEX "store_cache_expires_idx" ON "store_cache"("expires_at");

-- CreateIndex
CREATE INDEX "store_cache_source_idx" ON "store_cache"("source", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "store_cache_areas_grid_key_key" ON "store_cache_areas"("grid_key");

-- CreateIndex
CREATE INDEX "store_cache_area_expires_idx" ON "store_cache_areas"("expires_at");

-- CreateIndex
CREATE INDEX "cache_jobs_status_idx" ON "cache_jobs"("status", "created_at");
