import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { SupabaseJwtPayload } from './types/supabase-jwt.types';

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseJwtGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request as { headers?: { authorization?: string } });
    if (!token) throw new UnauthorizedException();

    try {
      const secret = process.env.SUPABASE_JWT_SECRET;
      if (!secret) throw new Error('SUPABASE_JWT_SECRET not set');
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as SupabaseJwtPayload;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (request as Record<string, unknown>).user = decoded;
      return true;
    } catch (err) {
      this.logger.warn('JWT verification failed', err instanceof Error ? err.message : String(err));
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractToken(request: { headers?: { authorization?: string } }): string | null {
    const auth = request.headers?.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    return auth.slice(7);
  }
}
