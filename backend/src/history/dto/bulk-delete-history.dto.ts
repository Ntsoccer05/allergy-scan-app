import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class BulkDeleteHistoryDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  ids!: string[];
}
