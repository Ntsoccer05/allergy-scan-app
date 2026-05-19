import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

/** GET /history のクエリパラメータ DTO。 */
export class GetHistoryDto {
  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @IsString()
  @IsIn(['all', 'ng', 'partial', 'ok'])
  judgment?: string;
}
