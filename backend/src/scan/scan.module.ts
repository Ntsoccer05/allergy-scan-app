import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { DailyScanLimitGuard } from './daily-scan-limit.guard';
import { ProductsModule } from '../products/products.module';
import { AllergensModule } from '../allergens/allergens.module';
import { HistoryModule } from '../history/history.module';
import { UsersModule } from '../users/users.module';
import { S3Client } from '../shared/clients/s3.client';
import { GeminiClient } from '../shared/clients/gemini.client';
import { GsiGeocoderClient } from '../shared/clients/gsi-geocoder.client';
import { StoreCacheService } from '../shared/store-cache.service';
import { StoreCacheRepository } from '../shared/store-cache.repository';
import { YahooLocalSearchClient } from '../shared/clients/yahoo-local-search.client';
import { CacheJobController } from './cache-job.controller';
import { CACHE_TTL_MEMORY_SEC } from './scan.constants';

@Module({
  imports: [
    ProductsModule,
    AllergensModule,
    HistoryModule,
    UsersModule,
    CacheModule.register({
      ttl: CACHE_TTL_MEMORY_SEC * 1000,
    }),
  ],
  controllers: [ScanController, PlacesController, CacheJobController],
  providers: [
    ScanService,
    PlacesService,
    DailyScanLimitGuard,
    S3Client,
    GeminiClient,
    GsiGeocoderClient,
    StoreCacheService,
    StoreCacheRepository,
    YahooLocalSearchClient,
  ],
})
export class ScanModule {}
