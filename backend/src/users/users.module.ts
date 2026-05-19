import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { BackupCodeController } from './backup-code.controller';
import { BackupCodeService } from './backup-code.service';
import { BackupCodeRepository } from './backup-code.repository';

@Module({
  controllers: [UsersController, BackupCodeController],
  providers: [UsersRepository, BackupCodeService, BackupCodeRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
