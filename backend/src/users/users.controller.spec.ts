import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { COOKIE_NAME, COOKIE_MAX_AGE } from './users.constants';
import type { Request, Response } from 'express';

const buildMockRes = (): {
  res: jest.Mocked<Pick<Response, 'cookie' | 'json' | 'status'>>;
  jsonFn: jest.Mock;
  cookieFn: jest.Mock;
  statusFn: jest.Mock;
} => {
  const jsonFn = jest.fn().mockReturnThis();
  const cookieFn = jest.fn().mockReturnThis();
  // status() は chainable なので json を返すモックにする
  const statusFn = jest.fn().mockReturnValue({ json: jsonFn });
  const res = {
    cookie: cookieFn,
    json: jsonFn,
    status: statusFn,
  } as unknown as jest.Mocked<Pick<Response, 'cookie' | 'json' | 'status'>>;
  return {
    res: res,
    jsonFn,
    cookieFn,
    statusFn,
  };
};

describe('UsersController', () => {
  let controller: UsersController;
  let repository: { create: jest.Mock };

  beforeEach(async () => {
    repository = { create: jest.fn().mockResolvedValue(undefined) };

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
      expect(jsonFn).toHaveBeenCalledWith({ created: true });
    });

    it('Cookie あり（userId 設定済み）で呼んだ場合、UsersRepository.create が呼ばれず { created: false } を返す', async () => {
      const req = {
        cookies: { [COOKIE_NAME]: 'existing-uuid' },
      } as unknown as Request;
      const { res, jsonFn, cookieFn } = buildMockRes();

      await controller.init(req, res as unknown as Response);

      expect(repository.create).not.toHaveBeenCalled();
      expect(cookieFn).not.toHaveBeenCalled();
      expect(jsonFn).toHaveBeenCalledWith({ created: false });
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
});
