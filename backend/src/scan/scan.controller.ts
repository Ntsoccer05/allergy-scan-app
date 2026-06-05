import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ScanService } from './scan.service';
import { BarcodeScandDto } from './dto/barcode-scan.dto';
import { OcrScanDto } from './dto/ocr-scan.dto';
import type { BarcodeScanResult, OcrScanResult, PresignedUrlResult } from './scan.service';
import { Public } from '../auth/public.decorator';
import { DailyScanLimitGuard } from './daily-scan-limit.guard';
import type { SupabaseJwtPayload } from '../auth/types/supabase-jwt.types';
import {
  THROTTLE_OCR_TTL,
  THROTTLE_OCR_LIMIT,
  THROTTLE_BARCODE_TTL,
  THROTTLE_BARCODE_LIMIT,
} from '../shared/throttler.constants';

type AuthRequest = Request & { user?: SupabaseJwtPayload };

@Controller('scan')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  /** GET /scan/presigned-url: S3 Presigned PUT URL を発行する。 */
  @UseGuards(DailyScanLimitGuard)
  @Get('presigned-url')
  async getPresignedUrl(@Req() req: AuthRequest): Promise<PresignedUrlResult> {
    const userId = req.user?.sub;
    return this.scanService.getPresignedUrl(userId);
  }

  /** POST /scan/barcode: JAN コード照合。found フィールドを必ず含むレスポンスを返す。 */
  @UseGuards(DailyScanLimitGuard)
  @Post('barcode')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { ttl: THROTTLE_BARCODE_TTL, limit: THROTTLE_BARCODE_LIMIT },
  })
  async scanBarcode(@Body() dto: BarcodeScandDto, @Req() req: AuthRequest): Promise<BarcodeScanResult> {
    const userId = req.user?.sub;
    return this.scanService.scanBarcode(dto.jan_code, userId);
  }

  /** POST /scan/ocr: S3 キーを受け取り OCR + アレルギー判定を行う。 */
  @UseGuards(DailyScanLimitGuard)
  @Post('ocr')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_OCR_TTL, limit: THROTTLE_OCR_LIMIT } })
  async scanOcr(
    @Body() dto: OcrScanDto,
    @Req() req: AuthRequest,
  ): Promise<OcrScanResult> {
    const userId = req.user?.sub;
    return this.scanService.processOcr(dto.s3_key, userId, dto.lat, dto.lng, dto.allow_low_confidence);
  }

  /**
   * POST /scan/ocr-stream: OCR + アレルギー判定を SSE でストリーミング返却する。
   * raw_text が確定するたびに raw_text イベントを送信し、完了後に result イベントを送信する。
   * ⚠️ Lambda 環境では Response Streaming が必要（ローカル開発では通常の SSE で動作する）。
   */
  @Public()
  @Post('ocr-stream')
  @Throttle({ default: { ttl: THROTTLE_OCR_TTL, limit: THROTTLE_OCR_LIMIT } })
  async ocrStream(
    @Body() dto: OcrScanDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const userId = req.user?.sub;

    try {
      const stream = this.scanService.processOcrStream(
        dto.s3_key,
        userId,
        dto.lat,
        dto.lng,
        dto.allow_low_confidence,
      );
      for await (const event of stream) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OCR処理に失敗しました';
      res.write(`data: ${JSON.stringify({ type: 'error', code: 'INTERNAL', message })}\n\n`);
    } finally {
      res.end();
    }
  }
}
