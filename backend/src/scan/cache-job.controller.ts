import { Controller, Post, Headers, UnauthorizedException, Logger } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { StoreCacheService } from '../shared/store-cache.service';

/**
 * バックグラウンド cache_jobs プロセッサー。
 * EventBridge Scheduler が定期的に呼び出す（ローカルは curl で手動実行）。
 * X-Internal-Secret ヘッダーで認証（環境変数 INTERNAL_SECRET と照合）。
 *
 * ローカル: curl -X POST -H "X-Internal-Secret: xxx" http://localhost:3001/internal/cache-jobs/process
 */
@Controller('internal/cache-jobs')
export class CacheJobController {
  private readonly logger = new Logger(CacheJobController.name);

  constructor(private readonly storeCacheService: StoreCacheService) {}

  @Post('process')
  @Public()
  async processNext(
    @Headers('x-internal-secret') secret: string | undefined,
  ): Promise<{ processed: boolean }> {
    const expected = process.env.INTERNAL_SECRET;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid internal secret');
    }

    const processed = await this.storeCacheService.processNextJob();
    this.logger.log(`cache_job 処理: processed=${processed}`);
    return { processed };
  }
}
