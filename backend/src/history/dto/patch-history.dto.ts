import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** PATCH /history/:id の location フィールド DTO。 */
export class PatchLocationDto {
  @IsString()
  store_name!: string;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

/** PATCH /history/:id のリクエストボディ DTO。 */
export class PatchHistoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  product_name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  store_name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string | null;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @IsOptional()
  @ValidateIf((o: PatchHistoryDto) => o.thumbnail_url !== null)
  @IsUrl({ require_tld: false })
  thumbnail_url?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatchLocationDto)
  location?: PatchLocationDto;
}
