import { Module } from '@nestjs/common';
import { ScanHistoryRepository } from './scan-history.repository';
import { HistoryService } from './history.service';
import { HistoryController } from './history.controller';
import { PublicHistoryController } from './public-history.controller';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { AllergensModule } from '../allergens/allergens.module';

@Module({
  imports: [ProductsModule, UsersModule, AllergensModule],
  controllers: [HistoryController, PublicHistoryController],
  providers: [HistoryService, ScanHistoryRepository],
  exports: [ScanHistoryRepository],
})
export class HistoryModule {}
