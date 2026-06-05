import * as crypto from 'crypto';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SupabaseJwtGuard } from './supabase-jwt.guard';
import type { SupabaseJwtPayload } from './types/supabase-jwt.types';

const TEST_JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

// テスト用に簡単な JWT を生成するヘルパー
function createTestToken(payload: Partial<SupabaseJwtPayload>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ iat: now, exp: now + 3600, ...payload })).toString('base64url');
  const sig = crypto.createHmac('sha256', TEST_JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

// ExecutionContext はインターフェースのため完全実装が必要。テストでは最小限のモックで代替する。
const buildContext = (authorization?: string, isPublicOverride?: boolean): ExecutionContext => {
  const request = { headers: { authorization }, user: undefined as unknown };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}), getNext: () => ({}) }),
    getHandler: () => ({}),
    getClass: () => ({}),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({ getData: () => ({}), getContext: () => ({}) }),
    switchToWs: () => ({ getData: () => ({}), getClient: () => ({}) }),
    getType: () => 'http' as const,
    _request: request,
  } as unknown as ExecutionContext & { _request: typeof request };
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
    expect(guard.canActivate(ctx)).toBe(true);
    expect((ctx as unknown as { _request: { user: unknown } })._request.user).toMatchObject({ sub: 'user-uuid' });
  });

  it('should throw 401 when no Authorization header', () => {
    const ctx = buildContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw 401 when token is invalid', () => {
    const ctx = buildContext('Bearer invalid-token');
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw 401 when token is expired', () => {
    const payload: Partial<SupabaseJwtPayload> = {
      sub: 'user-uuid',
      email: 'test@example.com',
      role: 'authenticated',
      app_metadata: { provider: 'email', providers: ['email'] },
      exp: Math.floor(Date.now() / 1000) - 3600, // 1時間前に期限切れ
    };
    const token = createTestToken(payload);
    const ctx = buildContext(`Bearer ${token}`);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should skip guard when @Public() is set', () => {
    const mockReflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    const publicGuard = new SupabaseJwtGuard(mockReflector as unknown as Reflector);
    const ctx = buildContext(undefined);
    expect(publicGuard.canActivate(ctx)).toBe(true);
  });
});
