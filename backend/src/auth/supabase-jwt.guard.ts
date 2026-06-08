import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { SupabaseJwtPayload } from './types/supabase-jwt.types';

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseJwtGuard.name);
  private readonly supabase: SupabaseClient | null = null;

  constructor(private readonly reflector: Reflector) {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && serviceKey) {
      this.supabase = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request as { headers?: { authorization?: string } });
    if (!token) throw new UnauthorizedException();

    if (!this.supabase) {
      this.logger.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
      throw new UnauthorizedException('Auth not configured');
    }

    try {
      const { data: { user }, error } = await this.supabase.auth.getUser(token);
      if (error || !user) {
        this.logger.warn('JWT verification failed', error?.message ?? 'no user');
        throw new UnauthorizedException('Invalid token');
      }
      const payload: SupabaseJwtPayload = {
        sub: user.id,
        email: user.email,
        role: user.role ?? 'authenticated',
        app_metadata: user.app_metadata as SupabaseJwtPayload['app_metadata'],
        user_metadata: user.user_metadata,
        iat: 0,
        exp: 0,
      };
      (request as Record<string, unknown>).user = payload;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.warn('JWT verification error', err instanceof Error ? err.message : String(err));
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractToken(request: { headers?: { authorization?: string } }): string | null {
    const auth = request.headers?.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    return auth.slice(7);
  }
}
