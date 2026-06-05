import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { SupabaseJwtPayload } from './types/supabase-jwt.types';
import type { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: SupabaseJwtPayload }>();
    const user = request.user;

    if (!user || user.app_metadata?.role !== 'admin') {
      this.logger.warn('Admin access denied', { userId: user?.sub });
      throw new ForbiddenException();
    }
    return true;
  }
}
