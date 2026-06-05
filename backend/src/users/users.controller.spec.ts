import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { COOKIE_NAME, COOKIE_MAX_AGE } from './users.constants';
import type { Request, Response } from 'express';
import type { UserRecord } from './users.repository';

const buildMockRes = (): {
  res: jest.Mocked<
    Pick<Response, 'cookie' | 'clearCookie' | 'json' | 'status' | 'end'>
  >;
  jsonFn: jest.Mock;
  cookieFn: jest.Mock;
  clearCookieFn: jest.Mock;
  statusFn: jest.Mock;
  endFn: jest.Mock;
} => {
  const jsonFn = jest.fn().mockReturnThis();
  const cookieFn = jest.fn().mockReturnThis();
  const clearCookieFn = jest.fn().mockReturnThis();
  const endFn = jest.fn().mockReturnThis();
  // status() は chainable なので json / end を返すモックにする
  const statusFn = jest.fn().mockReturnValue({ json: jsonFn, end: endFn });
  const res = {
    cookie: cookieFn,
    clearCookie: clearCookieFn,
    json: jsonFn,
    status: statusFn,
    end: endFn,
  } as unknown as jest.Mocked<
    Pick<Response, 'cookie' | 'clearCookie' | 'json' | 'status' | 'end'>
  >;
  return { res, jsonFn, cookieFn, clearCookieFn, statusFn, endFn };
};

const makeUserRecord = (overrides?: Partial<UserRecord>): UserRecord => ({
  id: 'user-1',
  allergies: {},
  locale: 'ja',
  ...overrides,
});

describe('UsersController', () => {
  let controller: UsersController;
  let repository: {
    create: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    deleteById: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      create: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(makeUserRecord()),
      update: jest
        .fn()
        .mockImplementation((_id: string, input: Partial<UserRecord>) =>
          Promise.resolve(makeUserRecord({ ...input })),
        ),
      deleteById: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersRepository, useValue: repository }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  describe('POST /users/init', () => {
    it('Cookie なしで呼んだ場合、UUID を生成して UsersRepository.create が1回呼ばれ { created: true } を返す', async () => {
      const req = { cookies: {} } as unknown as Request;
      const { res, statusFn, jsonFn, cookieFn } = buildMockRes();

      await controller.init(req, res as unknown as Response);

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(cookieFn).toHaveBeenCalledTimes(1);
      expect(statusFn).toHaveBeenCalledWith(201);
      expect(jsonFn).toHaveBeenCalledWith({
        created: true,
      });
    });

    it('Cookie あり（userId 設定済み）で呼んだ場合、UsersRepository.create が呼ばれず { created: false } を返す', async () => {
      repository.findById.mockResolvedValue(makeUserRecord());
      const req = {
        cookies: { [COOKIE_NAME]: 'existing-uuid' },
      } as unknown as Request;
      const { res, jsonFn, cookieFn } = buildMockRes();

      await controller.init(req, res as unknown as Response);

      expect(repository.create).not.toHaveBeenCalled();
      expect(cookieFn).not.toHaveBeenCalled();
      expect(jsonFn).toHaveBeenCalledWith({
        created: false,
      });
    });

    it('NODE_ENV=production 時、Set-Cookie に Secure 属性が含まれる', async () => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const req = { cookies: {} } as unknown as Request;
      const { res, cookieFn } = buildMockRes();

      await controller.init(req, res as unknown as Response);

      expect(cookieFn).toHaveBeenCalledWith(
        COOKIE_NAME,
        expect.any(String),
        expect.objectContaining({ secure: true }),
      );

      process.env.NODE_ENV = original;
    });

    it('NODE_ENV=development 時、Set-Cookie に Secure 属性が含まれない', async () => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const req = { cookies: {} } as unknown as Request;
      const { res, cookieFn } = buildMockRes();

      await controller.init(req, res as unknown as Response);

      expect(cookieFn).toHaveBeenCalledWith(
        COOKIE_NAME,
        expect.any(String),
        expect.objectContaining({ secure: false }),
      );

      process.env.NODE_ENV = original;
    });

    it('発行される Cookie の maxAge が COOKIE_MAX_AGE * 1000 (ms) で設定される', async () => {
      const req = { cookies: {} } as unknown as Request;
      const { res, cookieFn } = buildMockRes();

      await controller.init(req, res as unknown as Response);

      expect(cookieFn).toHaveBeenCalledWith(
        COOKIE_NAME,
        expect.any(String),
        expect.objectContaining({ maxAge: COOKIE_MAX_AGE * 1000 }),
      );
    });
  });

  describe('GET /users/me', () => {
    it('Cookie あり・ユーザー存在時にプロファイルを返す', async () => {
      repository.findById.mockResolvedValue(makeUserRecord());
      const req = {
        cookies: { [COOKIE_NAME]: 'user-1' },
      } as unknown as Request;

      const result = await controller.getMe(req);

      expect(result).toEqual({
        id: 'user-1',
        allergies: {},
        locale: 'ja',
      });
    });

    it('Cookie なしの場合 UnauthorizedException をスローする', async () => {
      const req = { cookies: {} } as unknown as Request;

      await expect(controller.getMe(req)).rejects.toThrow('Unauthorized');
    });
  });

  describe('PUT /users/me', () => {
    it('allergies と locale を渡すと UsersRepository.update が正しい引数で呼ばれる', async () => {
      const mockAllergies = { 乳: { enabled: true, partialAlert: true } };
      repository.update.mockResolvedValue(
        makeUserRecord({ allergies: mockAllergies, locale: 'en' }),
      );
      const req = {
        cookies: { [COOKIE_NAME]: 'user-1' },
      } as unknown as Request;

      await controller.updateMe(req, { allergies: mockAllergies, locale: 'en' });

      expect(repository.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ allergies: mockAllergies, locale: 'en' }),
      );
    });

    it('Cookie なしの場合 UnauthorizedException をスローする', async () => {
      const req = { cookies: {} } as unknown as Request;

      await expect(controller.updateMe(req, {})).rejects.toThrow(
        'Unauthorized',
      );
    });
  });

  describe('DELETE /users/me', () => {
    it('Cookie あり時に Cookie を削除してユーザーを削除する', async () => {
      const req = {
        cookies: { [COOKIE_NAME]: 'user-1' },
      } as unknown as Request;
      const { res, clearCookieFn, statusFn, endFn } = buildMockRes();

      await controller.deleteMe(req, res as unknown as Response);

      expect(clearCookieFn).toHaveBeenCalledWith(COOKIE_NAME, { path: '/' });
      expect(repository.deleteById).toHaveBeenCalledWith('user-1');
      expect(statusFn).toHaveBeenCalledWith(204);
      expect(endFn).toHaveBeenCalled();
    });

    it('Cookie なしの場合 UnauthorizedException をスローする', async () => {
      const req = { cookies: {} } as unknown as Request;
      const { res } = buildMockRes();

      await expect(
        controller.deleteMe(req, res as unknown as Response),
      ).rejects.toThrow('Unauthorized');
    });
  });
});
