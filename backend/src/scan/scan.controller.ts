import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ScanService } from './scan.service';
import { BarcodeScandDto } from './dto/barcode-scan.dto';
import { OcrScanDto } from './dto/ocr-scan.dto';
import type { BarcodeScanResult, PresignedUrlResult } from './scan.service';
import type { GeminiOcrResponse } from '../shared/types/gemini.types';
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

  /** POST /scan/ocr: S3 キーを受け取り OCR + アレルゲン判定を行う。 */
  @Post('ocr')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_OCR_TTL, limit: THROTTLE_OCR_LIMIT } })
  async scanOcr(
    @Body() dto: OcrScanDto,
    @Req() req: Request,
  ): Promise<GeminiOcrResponse> {
    const userId = req.cookies?.[COOKIE_NAME] as string | undefined;
    return this.scanService.processOcr(dto.s3_key, userId);
  }
}
