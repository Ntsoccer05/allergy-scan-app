import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * GET /places/candidates のクエリパラメータ DTO。
 * クエリ文字列は string で届くため @Type(() => Number) で変換する
 * （main.ts の ValidationPipe は transform: true）。
 */
export class PlaceCandidatesDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsOptional()
  @IsString()
  q?: string;
}
