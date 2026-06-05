import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException } from '@nestjs/common';
import { SupabaseJwtGuard } from './supabase-jwt.guard';
import type { SupabaseJwtPayload } from './types/supabase-jwt.types';

const TEST_JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

// テスト用に簡単な JWT を生成するヘルパー
function createTestToken(payload: Partial<SupabaseJwtPayload>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ iat: now, exp: now + 3600, ...payload })).toString('base64url');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('crypto') as typeof import('crypto');
  const sig = crypto.createHmac('sha256', TEST_JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

const buildContext = (authorization?: string) => {
  const request = { headers: { authorization }, user: undefined as unknown };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
    _request: request,
  };
};

describe('SupabaseJwtGuard', () => {
  let guard: SupabaseJwtGuard;

  beforeEach(async () => {
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
    const moduleRef = await Test.createTestingModule({
      providers: [
        SupabaseJwtGuard,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn().mockReturnValue(false) } },
      ],
    }).compile();
    guard = moduleRef.get(SupabaseJwtGuard);
  });

  it('should pass with valid JWT and set request.user', () => {
    const payload: Partial<SupabaseJwtPayload> = {
      sub: 'user-uuid',
      email: 'test@example.com',
      role: 'authenticated',
      app_metadata: { provider: 'email', providers: ['email'] },
    };
    const token = createTestToken(payload);
    const ctx = buildContext(`Bearer ${token}`);
    expect(guard.canActivate(ctx as any)).toBe(true);
    expect(ctx._request.user).toMatchObject({ sub: 'user-uuid' });
  });

  it('should throw 401 when no Authorization header', () => {
    const ctx = buildContext(undefined);
    expect(() => guard.canActivate(ctx as any)).toThrow(UnauthorizedException);
  });

  it('should throw 401 when token is invalid', () => {
    const ctx = buildContext('Bearer invalid-token');
    expect(() => guard.canActivate(ctx as any)).toThrow(UnauthorizedException);
  });

  it('should skip guard when @Public() is set', () => {
    const mockReflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    const publicGuard = new SupabaseJwtGuard(mockReflector as unknown as Reflector);
    const ctx = buildContext(undefined);
    expect(publicGuard.canActivate(ctx as any)).toBe(true);
  });
});
