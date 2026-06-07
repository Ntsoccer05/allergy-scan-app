import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
} from '@nestjs/common'
import type { Request } from 'express'
import { IsObject, IsOptional, IsString } from 'class-validator'
import { UsersService } from './users.service'
import type { SupabaseJwtPayload } from '../auth/types/supabase-jwt.types'
import type { UserAllergies } from '../shared/types/db.types'

import { IsBoolean } from 'class-validator'

class UpdateUserDto {
  @IsOptional()
  @IsObject()
  allergies?: UserAllergies

  @IsOptional()
  @IsString()
  locale?: string

  @IsOptional()
  @IsBoolean()
  onboarding_done?: boolean
}

type AuthRequest = Request & { user: SupabaseJwtPayload }

@Controller('users/me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('init')
  @HttpCode(HttpStatus.OK)
  async initUser(@Req() req: AuthRequest) {
    return this.usersService.initUser(req.user.sub, req.user.email)
  }

  @Get()
  async getUser(@Req() req: AuthRequest) {
    return this.usersService.getUser(req.user.sub)
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateUser(@Req() req: AuthRequest, @Body() dto: UpdateUserDto) {
    await this.usersService.updateUser(req.user.sub, dto.allergies, dto.locale, dto.onboarding_done)
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@Req() req: AuthRequest) {
    await this.usersService.deleteUser(req.user.sub)
  }

  @Post('reset-data')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetUserData(@Req() req: AuthRequest) {
    await this.usersService.resetUserData(req.user.sub)
  }
}
