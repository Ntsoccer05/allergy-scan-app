import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { UserDailyScansService } from '../users/user-daily-scans.service'
import type { SupabaseJwtPayload } from '../auth/types/supabase-jwt.types'

@Injectable()
export class DailyScanLimitGuard implements CanActivate {
  constructor(private readonly userDailyScansService: UserDailyScansService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const user = request.user as SupabaseJwtPayload | undefined
    if (!user?.sub) {
      throw new UnauthorizedException()
    }
    const userId = user.sub
    const canScan = await this.userDailyScansService.canUserScan(userId)
    if (!canScan) {
      throw new HttpException(
        { message: 'scan.error.dailyLimitExceeded' },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    return true
  }
}
