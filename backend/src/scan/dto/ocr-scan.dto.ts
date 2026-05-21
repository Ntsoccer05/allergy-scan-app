import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from 'class-validator';

/** POST /scan/ocr のリクエストボディ。openapi.yaml OcrScanRequest 準拠。 */
export class OcrScanDto {
  @IsString()
  @IsNotEmpty({ message: 's3_key は空にできません' })
  // ⚠️ 安全設計: 任意パスへのアクセスを防ぐため、scan-images/ 配下の UUID ファイル名のみ許可する
  @Matches(/^images\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/, {
    message: 's3_key の形式が不正です',
  })
  s3_key!: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  /** PC（pointer: coarse 非対応）からのリクエスト時に true。confidence: low でも判定結果を返す。 */
  @IsOptional()
  @IsBoolean()
  allow_low_confidence?: boolean;
}
