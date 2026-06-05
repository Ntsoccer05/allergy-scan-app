import {
  Controller,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';

@Controller('users')
export class BackupCodeController {
  /** POST /users/backup-code: 廃止済み（Supabase Auth で代替） */
  @Post('backup-code')
  issueBackupCode(): never {
    throw new HttpException(
      'バックアップコード機能は廃止されました。Supabase Auth でアカウント復旧してください。',
      HttpStatus.GONE,
    );
  }

  /** POST /users/restore: 廃止済み（Supabase Auth で代替） */
  @Post('restore')
  restore(): never {
    throw new HttpException(
      'バックアップコード機能は廃止されました。Supabase Auth でアカウント復旧してください。',
      HttpStatus.GONE,
    );
  }
}
