import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { BackupCodeController } from './backup-code.controller';
import { BackupCodeService } from './backup-code.service';
import { BackupCodeRepository } from './backup-code.repository';
import { UserDailyScansRepository } from './user-daily-scans.repository';
import { UserDailyScansService } from './user-daily-scans.service';

@Module({
  controllers: [UsersController, BackupCodeController],
  providers: [
    UsersRepository,
    BackupCodeService,
    BackupCodeRepository,
    UserDailyScansRepository,
    UserDailyScansService,
  ],
  exports: [UsersRepository, UserDailyScansService],
})
export class UsersModule {}
