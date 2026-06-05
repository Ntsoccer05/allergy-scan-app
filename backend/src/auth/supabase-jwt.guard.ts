import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
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
      const payload = this.verifyHs256(token);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (request as Record<string, unknown>).user = payload;
      return true;
    } catch (err) {
      this.logger.warn('JWT verification failed', err instanceof Error ? err.message : String(err));
      throw new UnauthorizedException();
    }
  }

  private verifyHs256(token: string): SupabaseJwtPayload {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) throw new Error('SUPABASE_JWT_SECRET not set');

    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT format');
    const [header, payload, signature] = parts;

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    if (expectedSig !== signature) throw new Error('Invalid signature');

    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8'),
    ) as SupabaseJwtPayload;
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) throw new Error('Token expired');

    return decoded;
  }

  private extractToken(request: { headers?: { authorization?: string } }): string | null {
    const auth = request.headers?.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    return auth.slice(7);
  }
}
