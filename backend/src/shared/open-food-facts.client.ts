import { Injectable, Logger } from '@nestjs/common';
import type {
  OpenFoodFactsProductFields,
  OpenFoodFactsResponse,
} from './types/open-food-facts.types';

const OFF_BASE_URL = 'https://world.openfoodfacts.org/api/v0/product';
/** Open Food Facts API のタイムアウト（ms）。 */
const OFF_TIMEOUT_MS = 5000;

@Injectable()
export class OpenFoodFactsClient {
  private readonly logger = new Logger(OpenFoodFactsClient.name);

  /**
   * JAN コードで Open Food Facts API を照合する。
   * ネットワークエラー・タイムアウト・商品未登録は null を返す（例外は投げない）。
   */
  async fetchByJanCode(
    janCode: string,
  ): Promise<OpenFoodFactsProductFields | null> {
    const url = `${OFF_BASE_URL}/${janCode}.json`;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.error(
          `Open Food Facts returned ${response.status} for JAN: ${janCode}`,
        );
        return null;
      }
      const data = (await response.json()) as OpenFoodFactsResponse;
      if (data.status !== 1 || !data.product) {
        return null;
      }
      return data.product;
    } catch (error) {
      this.logger.error(
        `Open Food Facts fetch failed for JAN: ${janCode}`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }
}
