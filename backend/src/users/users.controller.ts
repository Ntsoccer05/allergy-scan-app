import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { UsersRepository } from './users.repository';
import { COOKIE_NAME, COOKIE_MAX_AGE } from './users.constants';
import {
  THROTTLE_USERS_INIT_TTL,
  THROTTLE_USERS_INIT_LIMIT,
} from '../shared/throttler.constants';
import type { UserAllergies } from '../shared/types/db.types';

type InitResponse = {
  created: boolean;
};

type UserMeResponse = {
  id: string;
  allergies: UserAllergies;
  locale: string;
};

class UpdateUserDto {
  @IsOptional()
  @IsObject()
  allergies?: UserAllergies;

  @IsOptional()
  @IsString()
  locale?: string;
}

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
      const user = await this.usersRepository.findById(existingUserId);
      if (user) {
        res.json({
          created: false,
        } satisfies InitResponse);
        return;
      }
      // Cookie に userId があるが DB に存在しない場合（DB リセット等）→ 新規作成して Cookie を上書き
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
    res.status(201).json({
      created: true,
    } satisfies InitResponse);
  }

  /** GET /users/me: Cookie からユーザー情報を取得する */
  @Get('me')
  async getMe(@Req() req: Request): Promise<UserMeResponse> {
    const userId = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!userId) {
      throw new UnauthorizedException();
    }
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('ユーザーが見つかりません');
    }
    return {
      id: user.id,
      allergies: user.allergies,
      locale: user.locale,
    };
  }

  /** PUT /users/me: アレルギー設定・ロケールを更新する */
  @Put('me')
  async updateMe(
    @Req() req: Request,
    @Body() dto: UpdateUserDto,
  ): Promise<UserMeResponse> {
    const userId = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!userId) {
      throw new UnauthorizedException();
    }
    const updated = await this.usersRepository.update(userId, {
      allergies: dto.allergies,
      locale: dto.locale,
    });
    return {
      id: updated.id,
      allergies: updated.allergies,
      locale: updated.locale,
    };
  }

  /** DELETE /users/me: ユーザーデータを削除する（要配慮個人情報の削除権） */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMe(@Req() req: Request, @Res() res: Response): Promise<void> {
    const userId = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!userId) {
      throw new UnauthorizedException();
    }
    // Cookie を即時削除する
    res.clearCookie(COOKIE_NAME, { path: '/' });
    // ユーザーデータの物理削除（要配慮個人情報削除権に対応）
    await this.usersRepository.deleteById(userId);
    res.status(HttpStatus.NO_CONTENT).end();
  }
}
