import { Test } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import type { SupabaseJwtPayload } from './types/supabase-jwt.types';

const buildContext = (appMetadataRole?: string): ExecutionContext => {
  const payload: Partial<SupabaseJwtPayload> = {
    sub: 'user-uuid',
    app_metadata: {
      provider: 'email',
      providers: ['email'],
      ...(appMetadataRole ? { role: appMetadataRole as 'admin' } : {}),
    },
    role: 'authenticated',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const request = { user: payload };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
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

describe('AdminGuard', () => {
  let guard: AdminGuard;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AdminGuard],
    }).compile();
    guard = moduleRef.get(AdminGuard);
  });

  it('should allow admin users', () => {
    expect(guard.canActivate(buildContext('admin'))).toBe(true);
  });

  it('should throw 403 for non-admin users', () => {
    expect(() => guard.canActivate(buildContext())).toThrow(ForbiddenException);
  });

  it('should throw 403 when user is null', () => {
    const request = { user: null };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
      getArgs: () => [],
      getArgByIndex: () => undefined,
      switchToRpc: () => ({ getData: () => ({}), getContext: () => ({}) }),
      switchToWs: () => ({ getData: () => ({}), getClient: () => ({}) }),
      getType: () => 'http' as const,
      _request: request,
    } as unknown as ExecutionContext & { _request: typeof request };
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should throw 403 when user has no app_metadata', () => {
    const payload: Partial<SupabaseJwtPayload> = {
      sub: 'user-uuid',
      role: 'authenticated',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      app_metadata: {
        provider: 'email',
        providers: ['email'],
      },
    };
    const request = { user: payload };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
      getArgs: () => [],
      getArgByIndex: () => undefined,
      switchToRpc: () => ({ getData: () => ({}), getContext: () => ({}) }),
      switchToWs: () => ({ getData: () => ({}), getClient: () => ({}) }),
      getType: () => 'http' as const,
      _request: request,
    } as unknown as ExecutionContext & { _request: typeof request };
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
