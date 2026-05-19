import { Controller, Logger, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { UsersRepository } from './users.repository';
import { COOKIE_MAX_AGE, COOKIE_NAME } from './users.constants';
import {
  THROTTLE_USERS_INIT_TTL,
  THROTTLE_USERS_INIT_LIMIT,
} from '../shared/throttler.constants';

type InitResponse = {
  created: boolean;
};

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersRepository: UsersRepository) {}

  /** POST /users/init: Cookie が未設定の場合は UUID を生成して users テーブルに INSERT し Cookie を発行する。 */
  @Post('init')
  @Throttle({
    default: { ttl: THROTTLE_USERS_INIT_TTL, limit: THROTTLE_USERS_INIT_LIMIT },
  })
  async init(@Req() req: Request, @Res() res: Response): Promise<void> {
    const existingUserId = req.cookies?.[COOKIE_NAME] as string | undefined;

    if (existingUserId) {
      res.json({ created: false } satisfies InitResponse);
      return;
    }

    const userId = randomUUID();
    await this.usersRepository.create(userId);

    // ⚠️ 安全設計: Secure 属性はローカル HTTP 環境で Cookie が保存されなくなるため production 時のみ付与する
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie(COOKIE_NAME, userId, {
      httpOnly: true,
      sameSite: 'strict',
      secure: isProduction,
      maxAge: COOKIE_MAX_AGE * 1000,
      path: '/',
    });

    this.logger.log('新規ユーザー Cookie を発行しました');
    res.status(201).json({ created: true } satisfies InitResponse);
  }
}
