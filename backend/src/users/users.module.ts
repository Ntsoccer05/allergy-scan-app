import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { UsersRepository } from './users.repository'
import { UserDailyScansRepository } from './user-daily-scans.repository'
import { UserDailyScansService } from './user-daily-scans.service'
import { BackupCodesRepository } from './backup-codes.repository'

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersRepository,
    UserDailyScansRepository,
    UserDailyScansService,
    BackupCodesRepository,
  ],
  exports: [UsersRepository, UsersService, UserDailyScansService],
})
export class UsersModule {}
