import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { ScanHistoryLocation } from '../../shared/types/db.types';

/** POST /history の location フィールド DTO。 */
class ScanHistoryLocationDto implements ScanHistoryLocation {
  @IsString()
  store_name!: string;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

/** POST /history のリクエストボディ DTO。 */
export class CreateHistoryDto {
  @IsOptional()
  @IsString()
  product_id?: string;

  @IsOptional()
  @IsString()
  product_name?: string;

  @IsString()
  @IsIn(['ng', 'partial', 'ok'])
  judgment!: 'ng' | 'partial' | 'ok';

  @IsArray()
  @IsString({ each: true })
  detected!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ScanHistoryLocationDto)
  location?: ScanHistoryLocation;

  @IsOptional()
  @IsUrl({ require_tld: false })
  thumbnail_url?: string;
}
