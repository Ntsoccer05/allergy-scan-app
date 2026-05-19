import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { IsString, Matches } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { BackupCodeService } from './backup-code.service';
import { COOKIE_NAME } from './users.constants';
import { BACKUP_CODE_PATTERN } from './backup-code.constants';
import type {
  IssueBackupCodeResult,
  RestoreResult,
} from './backup-code.service';
import {
  THROTTLE_RESTORE_TTL,
  THROTTLE_RESTORE_LIMIT,
} from '../shared/throttler.constants';

class RestoreDto {
  @IsString()
  @Matches(BACKUP_CODE_PATTERN)
  code!: string;
}

@Controller('users')
export class BackupCodeController {
  constructor(private readonly backupCodeService: BackupCodeService) {}

  /** POST /users/backup-code: バックアップコードを発行する（Cookie 認証必須） */
  @Post('backup-code')
  @HttpCode(HttpStatus.CREATED)
  async issueBackupCode(@Req() req: Request): Promise<IssueBackupCodeResult> {
    const userId = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.backupCodeService.issueCode(userId);
  }

  /** POST /users/restore: バックアップコードで引き継ぎを実行する（Cookie 認証必須） */
  @Post('restore')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { ttl: THROTTLE_RESTORE_TTL, limit: THROTTLE_RESTORE_LIMIT },
  })
  async restore(
    @Body() dto: RestoreDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RestoreResult> {
    const userId = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.backupCodeService.restoreFromCode(dto.code, userId, res);
  }
}
