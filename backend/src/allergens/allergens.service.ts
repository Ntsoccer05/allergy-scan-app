import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AllergenItem = {
  name: string;
  display_name: string;
  emoji: string | null;
  display_order: number;
  judgment_type: 'allergy' | 'caution';
};

type AllergenGroup = {
  category: 'mandatory' | 'recommended' | 'addiction' | 'skin';
  label: string;
  items: AllergenItem[];
};

const CATEGORY_LABELS: Record<string, string> = {
  mandatory: '特定原材料（表示義務）',
  recommended: '準ずるもの（表示推奨）',
  addiction: '依存性物質',
  skin: '皮膚系',
};

const CATEGORY_ORDER = ['mandatory', 'recommended', 'addiction', 'skin'];

const deriveJudgmentType = (category: string): 'allergy' | 'caution' =>
  category === 'mandatory' || category === 'recommended' ? 'allergy' : 'caution';

@Injectable()
export class AllergensService {
  constructor(private readonly prisma: PrismaService) {}

  async getGrouped(): Promise<AllergenGroup[]> {
    const allergens = await this.prisma.allergen.findMany({
      where: { deletedAt: null },
      select: {
        name: true,
        displayName: true,
        category: true,
        displayOrder: true,
        emoji: true,
      },
      orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }],
    });

    const grouped = new Map<string, AllergenItem[]>();
    for (const a of allergens) {
      if (!grouped.has(a.category)) {
        grouped.set(a.category, []);
      }
      grouped.get(a.category)!.push({
        name: a.name,
        display_name: a.displayName,
        emoji: a.emoji,
        display_order: a.displayOrder,
        judgment_type: deriveJudgmentType(a.category),
      });
    }

    return CATEGORY_ORDER.filter((c) => grouped.has(c)).map((c) => ({
      category: c as AllergenGroup['category'],
      label: CATEGORY_LABELS[c] ?? c,
      items: grouped.get(c)!,
    }));
  }
}
