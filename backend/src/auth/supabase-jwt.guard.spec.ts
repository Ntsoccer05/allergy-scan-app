import * as jwt from 'jsonwebtoken';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SupabaseJwtGuard } from './supabase-jwt.guard';
import type { SupabaseJwtPayload } from './types/supabase-jwt.types';

const TEST_JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

// テスト用に jsonwebtoken で JWT を生成するヘルパー
function createTestToken(payload: Partial<SupabaseJwtPayload>, options?: jwt.SignOptions): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iat: now, ...payload },
    TEST_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: 3600, ...options },
  );
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
    };
    // expiresIn: -1 で即時期限切れトークンを生成する
    const token = createTestToken(payload, { expiresIn: -1 });
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
