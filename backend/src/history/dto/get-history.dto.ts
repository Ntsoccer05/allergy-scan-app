import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/** GET /history のクエリパラメータ DTO。 */
export class GetHistoryDto {
  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @IsString()
  @IsIn(['all', 'ng', 'partial', 'ok'])
  judgment?: string;

  /** 商品名の部分一致検索キーワード。 */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** 店舗名（location.store_name）の部分一致フィルタ。 */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  store?: string;
}
