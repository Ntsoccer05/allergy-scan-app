import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ScanModule } from './scan/scan.module';
import { HistoryModule } from './history/history.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { AllergensModule } from './allergens/allergens.module';
import { ThrottlerExceptionFilter } from './shared/throttler-exception.filter';
import { AuthModule } from './auth/auth.module';
import { SupabaseJwtGuard } from './auth/supabase-jwt.guard';
import { AdminModule } from './admin/admin.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import {
  THROTTLE_DEFAULT_TTL_MS,
  THROTTLE_DEFAULT_LIMIT,
} from './shared/throttler.constants';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: THROTTLE_DEFAULT_TTL_MS,
        limit: THROTTLE_DEFAULT_LIMIT,
      },
    ]),
    PrismaModule,
    ScanModule,
    HistoryModule,
    UsersModule,
    ProductsModule,
    AllergensModule,
    AuthModule,
    AdminModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: SupabaseJwtGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: ThrottlerExceptionFilter,
    },
  ],
})
export class AppModule {}
