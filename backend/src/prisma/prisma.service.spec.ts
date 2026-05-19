import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;
  let connectSpy: jest.SpyInstance;
  let disconnectSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);

    // PrismaClient を継承しているため、インスタンスメソッドをスパイ
    connectSpy = jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    disconnectSpy = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('onModuleInit calls $connect', async () => {
    await service.onModuleInit();
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('onModuleDestroy calls $disconnect', async () => {
    await service.onModuleDestroy();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
