import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ScanService } from './scan.service';
import { BarcodeScandDto } from './dto/barcode-scan.dto';
import { OcrScanDto } from './dto/ocr-scan.dto';
import type { BarcodeScanResult, OcrScanResult, PresignedUrlResult } from './scan.service';
import { COOKIE_NAME } from '../users/users.constants';
import {
  THROTTLE_OCR_TTL,
  THROTTLE_OCR_LIMIT,
  THROTTLE_BARCODE_TTL,
  THROTTLE_BARCODE_LIMIT,
} from '../shared/throttler.constants';

@Controller('scan')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  /** GET /scan/presigned-url: S3 Presigned PUT URL を発行する。 */
  @Get('presigned-url')
  async getPresignedUrl(): Promise<PresignedUrlResult> {
    return this.scanService.getPresignedUrl();
  }

  /** POST /scan/barcode: JAN コード照合。found フィールドを必ず含むレスポンスを返す。 */
  @Post('barcode')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { ttl: THROTTLE_BARCODE_TTL, limit: THROTTLE_BARCODE_LIMIT },
  })
  async scanBarcode(@Body() dto: BarcodeScandDto): Promise<BarcodeScanResult> {
    return this.scanService.scanBarcode(dto.jan_code);
  }

  /** POST /scan/ocr: S3 キーを受け取り OCR + アレルギー判定を行う。 */
  @Post('ocr')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_OCR_TTL, limit: THROTTLE_OCR_LIMIT } })
  async scanOcr(
    @Body() dto: OcrScanDto,
    @Req() req: Request,
  ): Promise<OcrScanResult> {
    const userId = req.cookies?.[COOKIE_NAME] as string | undefined;
    return this.scanService.processOcr(dto.s3_key, userId, dto.lat, dto.lng, dto.allow_low_confidence);
  }

  /**
   * POST /scan/ocr-stream: OCR + アレルギー判定を SSE でストリーミング返却する。
   * raw_text が確定するたびに raw_text イベントを送信し、完了後に result イベントを送信する。
   * ⚠️ Lambda 環境では Response Streaming が必要（ローカル開発では通常の SSE で動作する）。
   */
  @Post('ocr-stream')
  @Throttle({ default: { ttl: THROTTLE_OCR_TTL, limit: THROTTLE_OCR_LIMIT } })
  async ocrStream(
    @Body() dto: OcrScanDto,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const userId = req.cookies?.[COOKIE_NAME] as string | undefined;

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
