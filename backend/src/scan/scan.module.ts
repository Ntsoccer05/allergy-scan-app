import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';
import { ProductsModule } from '../products/products.module';
import { AllergensModule } from '../allergens/allergens.module';
import { HistoryModule } from '../history/history.module';
import { UsersModule } from '../users/users.module';
import { OpenFoodFactsClient } from '../shared/open-food-facts.client';
import { S3Client } from '../shared/s3.client';
import { GeminiClient } from '../shared/gemini.client';
import { GooglePlacesClient } from '../shared/google-places.client';
import { OverpassPlacesClient } from '../shared/overpass-places.client';
import { HybridPlacesClient } from '../shared/hybrid-places.client';
import {
  PLACES_PROVIDER_TOKEN,
  type StoreCandidateProvider,
} from '../shared/places.interface';
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
  controllers: [ScanController],
  providers: [
    ScanService,
    OpenFoodFactsClient,
    S3Client,
    GeminiClient,
    GooglePlacesClient,
    OverpassPlacesClient,
    HybridPlacesClient,
    {
      provide: PLACES_PROVIDER_TOKEN,
      useFactory: (
        google: GooglePlacesClient,
        overpass: OverpassPlacesClient,
        hybrid: HybridPlacesClient,
      ): StoreCandidateProvider => {
        const provider = process.env.PLACES_PROVIDER;
        if (provider === 'google') return google;
        if (provider === 'overpass') return overpass;
        return hybrid; // デフォルト: hybrid
      },
      inject: [GooglePlacesClient, OverpassPlacesClient, HybridPlacesClient],
    },
  ],
})
export class ScanModule {}
