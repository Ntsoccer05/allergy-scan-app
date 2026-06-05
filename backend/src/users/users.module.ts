import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { UsersRepository } from './users.repository'
import { UserDailyScansRepository } from './user-daily-scans.repository'
import { UserDailyScansService } from './user-daily-scans.service'

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersRepository,
    UserDailyScansRepository,
    UserDailyScansService,
  ],
  exports: [UsersRepository, UsersService, UserDailyScansService],
})
export class UsersModule {}
