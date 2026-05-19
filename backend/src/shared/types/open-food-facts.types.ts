/** Open Food Facts API v0 のプロダクトフィールド（必要最低限のみ定義）。 */
export type OpenFoodFactsProductFields = {
  product_name?: string;
  product_name_ja?: string;
  allergens_tags?: string[];
  allergens?: string;
  traces_tags?: string[];
  traces?: string;
  ingredients_text?: string;
  ingredients_text_ja?: string;
};

/** Open Food Facts API v0 の `/api/v0/product/{barcode}.json` レスポンス。 */
export type OpenFoodFactsResponse = {
  status: number; // 1: 見つかった / 0: 見つからない
  status_verbose: string;
  product?: OpenFoodFactsProductFields;
};
