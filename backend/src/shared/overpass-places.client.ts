import { Injectable, Logger } from '@nestjs/common';
import type { StoreCandidate, StoreCandidateProvider } from './places.interface';
import { PLACES_SEARCH_RADIUS_M, OVERPASS_TIMEOUT_MS } from './places.constants';

/** Overpass API のエンドポイント */
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

/** Overpass API のレスポンス型（elements 配列要素） */
type OverpassElement = {
  id: number;
  tags?: Record<string, string>;
};

/** Overpass API のレスポンス型 */
type OverpassResponse = {
  elements: OverpassElement[];
};

@Injectable()
export class OverpassPlacesClient implements StoreCandidateProvider {
  private readonly logger = new Logger(OverpassPlacesClient.name);

  /**
   * 指定緯度経度の近くにあるコンビニ・スーパーの候補を返す。
   * エラー・タイムアウト・空 elements の場合は [] を返す（例外を投げない）。
   */
  async getStoreCandidates(
    lat: number,
    lng: number,
  ): Promise<StoreCandidate[]> {
    const query = [
      '[out:json][timeout:5];',
      '(',
      `  node["shop"~"convenience|supermarket|grocery"](around:${PLACES_SEARCH_RADIUS_M},${lat},${lng});`,
      ');',
      'out body;',
    ].join('\n');

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      OVERPASS_TIMEOUT_MS,
    );

    try {
      const res = await fetch(OVERPASS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      if (!res.ok) {
        this.logger.warn(`Overpass API 返却エラー: status=${res.status}`);
        return [];
      }

      const data = (await res.json()) as OverpassResponse;
      const elements = data.elements ?? [];

      return elements
        .filter(
          (el): el is OverpassElement & { tags: { name: string } } =>
            typeof el.tags?.name === 'string',
        )
        .map((el) => ({ name: el.tags.name, placeId: String(el.id) }));
    } catch (error) {
      this.logger.warn(
        'Overpass API 呼び出し失敗',
        error instanceof Error ? error.message : String(error),
      );
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
