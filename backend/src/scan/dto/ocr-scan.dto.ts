import { IsNotEmpty, IsString, Matches } from 'class-validator';

/** POST /scan/ocr のリクエストボディ。openapi.yaml OcrScanRequest 準拠。 */
export class OcrScanDto {
  @IsString()
  @IsNotEmpty({ message: 's3_key は空にできません' })
  // ⚠️ 安全設計: 任意パスへのアクセスを防ぐため、scan-images/ 配下の UUID ファイル名のみ許可する
  @Matches(/^scan-images\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/, {
    message: 's3_key の形式が不正です',
  })
  s3_key!: string;
}
