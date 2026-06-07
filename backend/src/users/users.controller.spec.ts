import { Test } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import type { SupabaseJwtPayload } from '../auth/types/supabase-jwt.types'

const makeAuthReq = (overrides?: Partial<SupabaseJwtPayload>) => ({
  user: {
    sub: 'user-uuid',
    email: 'user@example.com',
    role: 'authenticated',
    app_metadata: { provider: 'email', providers: ['email'] },
    iat: 0,
    exp: 9999999999,
    ...overrides,
  } as SupabaseJwtPayload,
})

const mockService = {
  initUser: jest.fn(),
  getUser: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
  resetUserData: jest.fn(),
}

describe('UsersController', () => {
  let controller: UsersController

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockService }],
    }).compile()
    controller = module.get(UsersController)
  })

  afterEach(() => jest.clearAllMocks())

  describe('POST /users/me/init', () => {
    it('should call initUser with sub and email, return created:true', async () => {
      mockService.initUser.mockResolvedValue({ created: true })
      const result = await controller.initUser(makeAuthReq() as any)
      expect(result).toEqual({ created: true })
      expect(mockService.initUser).toHaveBeenCalledWith('user-uuid', 'user@example.com')
    })

    it('should return created:false when user already exists', async () => {
      mockService.initUser.mockResolvedValue({ created: false })
      const result = await controller.initUser(makeAuthReq() as any)
      expect(result).toEqual({ created: false })
    })
  })

  describe('GET /users/me', () => {
    it('should call getUser with sub', async () => {
      const userData = { id: 'user-uuid', allergies: {}, locale: 'ja', subscription: null }
      mockService.getUser.mockResolvedValue(userData)
      const result = await controller.getUser(makeAuthReq() as any)
      expect(result).toEqual(userData)
      expect(mockService.getUser).toHaveBeenCalledWith('user-uuid')
    })
  })

  describe('PUT /users/me', () => {
    it('should call updateUser with sub and dto', async () => {
      mockService.updateUser.mockResolvedValue(undefined)
      await controller.updateUser(makeAuthReq() as any, { locale: 'en' })
      expect(mockService.updateUser).toHaveBeenCalledWith('user-uuid', undefined, 'en', undefined)
    })
  })

  describe('DELETE /users/me', () => {
    it('should call deleteUser with sub', async () => {
      mockService.deleteUser.mockResolvedValue(undefined)
      await controller.deleteUser(makeAuthReq() as any)
      expect(mockService.deleteUser).toHaveBeenCalledWith('user-uuid')
    })
  })

  describe('POST /users/me/reset-data', () => {
    it('calls usersService.resetUserData with req.user.sub and returns 204', async () => {
      mockService.resetUserData.mockResolvedValue(undefined)
      const req = makeAuthReq({ sub: 'user-abc' })
      await controller.resetUserData(req as any)
      expect(mockService.resetUserData).toHaveBeenCalledWith('user-abc')
    })
  })
})
