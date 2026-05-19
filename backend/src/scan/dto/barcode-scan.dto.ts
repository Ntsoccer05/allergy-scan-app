import { IsString, Matches } from 'class-validator';

/** POST /scan/barcode のリクエストボディ。openapi.yaml BarcodeScanRequest 準拠。 */
export class BarcodeScandDto {
  @IsString()
  @Matches(/^\d{8,13}$/, {
    message: 'jan_code は 8〜13 桁の数字である必要があります',
  })
  jan_code!: string;
}
