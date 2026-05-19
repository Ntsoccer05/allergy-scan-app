import { Module } from '@nestjs/common';
import { ScanHistoryRepository } from './scan-history.repository';
import { HistoryService } from './history.service';
import { HistoryController } from './history.controller';

@Module({
  controllers: [HistoryController],
  providers: [HistoryService, ScanHistoryRepository],
  exports: [ScanHistoryRepository],
})
export class HistoryModule {}
