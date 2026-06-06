import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SupabaseJwtGuard } from './supabase-jwt.guard';

// Supabase auth.getUser のモック
const mockGetUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

const buildContext = (authorization?: string): ExecutionContext => {
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
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    mockGetUser.mockReset();

    const moduleRef = await Test.createTestingModule({
      providers: [
        SupabaseJwtGuard,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn().mockReturnValue(false) } },
      ],
    }).compile();
    guard = moduleRef.get(SupabaseJwtGuard);
  });

  it('valid な JWT → canActivate が true を返し request.user をセットする', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-uuid',
          email: 'test@example.com',
          role: 'authenticated',
          app_metadata: { provider: 'email' },
          user_metadata: {},
        },
      },
      error: null,
    });

    const ctx = buildContext('Bearer valid-token');
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect((ctx as unknown as { _request: { user: { sub: string } } })._request.user).toMatchObject({
      sub: 'user-uuid',
    });
  });

  it('Authorization ヘッダーなし → 401 を throw する', async () => {
    const ctx = buildContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('Supabase がエラーを返す（無効なトークン）→ 401 を throw する', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Invalid JWT'),
    });

    const ctx = buildContext('Bearer invalid-token');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('Supabase が user: null を返す → 401 を throw する', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const ctx = buildContext('Bearer some-token');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('@Public() がセットされている場合 → token なしでも true を返す', async () => {
    const mockReflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    const publicGuard = new SupabaseJwtGuard(mockReflector as unknown as Reflector);
    const ctx = buildContext(undefined);
    const result = await publicGuard.canActivate(ctx);
    expect(result).toBe(true);
  });
});
