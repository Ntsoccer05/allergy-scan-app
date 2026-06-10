import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/** GET /products/others のクエリパラメータ DTO。 */
export class GetOthersDto {
  @IsOptional()
  @IsISO8601()
  cursor?: string;

  /** ユーザー設定で導出した judgment によるフィルタ。 */
  @IsOptional()
  @IsString()
  @IsIn(['all', 'ng', 'partial', 'ok'])
  judgment?: 'all' | 'ng' | 'partial' | 'ok';

  /** 商品名の部分一致検索キーワード。 */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** 店舗名の部分一致フィルタ。 */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  store?: string;
}
