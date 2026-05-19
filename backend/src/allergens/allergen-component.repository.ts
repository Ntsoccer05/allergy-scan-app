import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** allergen_components テーブルのレコード型（Repository 外部公開用）。 */
export type AllergenComponentRecord = {
  id: string;
  allergenName: string;
  canonicalName: string;
  aliases: string[];
  componentType: string;
  detectionType: string;
  riskLevel: string;
  note: string | null;
};

@Injectable()
export class AllergenComponentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 指定アレルゲン名リストに対応する allergen_components を取得する。
   * exclude 型を含む全 component_type を返す（buildGeminiPrompt でフィルタリングする）。
   */
  async findByAllergens(
    allergenNames: string[],
  ): Promise<AllergenComponentRecord[]> {
    if (allergenNames.length === 0) return [];
    const records = await this.prisma.allergenComponent.findMany({
      where: { allergenName: { in: allergenNames } },
      select: {
        id: true,
        allergenName: true,
        canonicalName: true,
        aliases: true,
        componentType: true,
        detectionType: true,
        riskLevel: true,
        note: true,
      },
    });
    // aliases は JSONB 配列として格納されるため string[] に安全に narrowing する
    return records.map((r) => ({
      ...r,
      aliases: Array.isArray(r.aliases)
        ? (r.aliases as unknown[]).filter(
            (v): v is string => typeof v === 'string',
          )
        : [],
    }));
  }
}
