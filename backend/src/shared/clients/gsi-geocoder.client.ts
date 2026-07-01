import { Injectable, Logger } from '@nestjs/common';
import { GSI_GEOCODER_TIMEOUT_MS } from '../places/places.constants';

/** 国土地理院 逆ジオコーダ API のエンドポイント */
const GSI_REVERSE_GEOCODER_URL =
  'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress';

/** muniCd → 市区町村名の対応表（GSI.MUNI_ARRAY）を定義した JS ファイル */
const GSI_MUNI_JS_URL = 'https://maps.gsi.go.jp/js/muni.js';

/** 逆ジオコーダ API のレスポンス型 */
type GsiReverseGeocodeResponse = {
  results?: {
    muniCd?: string;
    lv01Nm?: string;
  };
};

/**
 * 国土地理院 逆ジオコーダクライアント（無料・日本特化）。
 * 緯度経度から「都道府県名+市区町村名+町丁目」の住所文字列を解決する。
 * 失敗・タイムアウト時は null を返す（例外を投げない）。
 */
@Injectable()
export class GsiGeocoderClient {
  private readonly logger = new Logger(GsiGeocoderClient.name);

  // muniCd → 「都道府県名+市区町村名」のメモリキャッシュ。
  // Lambda 再起動でリセットされる前提（muni.js はほぼ不変のマスターデータ）
  private muniMap: Map<string, string> | null = null;

  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
      const [geocode, muniMap] = await Promise.all([
        this.fetchGeocode(lat, lng),
        this.loadMuniMap(),
      ]);

      const muniCd = geocode?.results?.muniCd;
      if (!muniCd || !muniMap) return null;

      // muni.js のキーは先頭ゼロなし（例: "1100"）。API は先頭ゼロ付きで返す場合があるため両方を引く
      const muniName =
        muniMap.get(muniCd) ?? muniMap.get(String(Number(muniCd)));
      if (!muniName) {
        this.logger.warn(`muniCd を解決できませんでした: ${muniCd}`);
        return null;
      }

      const lv01Nm = geocode?.results?.lv01Nm;
      // lv01Nm は「－」（該当なし）の場合があるため除外する
      const town = lv01Nm && lv01Nm !== '－' ? lv01Nm : '';
      return `${muniName}${town}`;
    } catch (error) {
      this.logger.warn(
        'GSI 逆ジオコーダ呼び出し失敗',
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  private async fetchGeocode(
    lat: number,
    lng: number,
  ): Promise<GsiReverseGeocodeResponse | null> {
    const res = await this.fetchWithTimeout(
      `${GSI_REVERSE_GEOCODER_URL}?lat=${lat}&lon=${lng}`,
    );
    if (!res) return null;
    return (await res.json()) as GsiReverseGeocodeResponse;
  }

  /**
   * muni.js を取得して muniCd → 「都道府県名+市区町村名」の Map を構築する。
   * 行形式: GSI.MUNI_ARRAY["1100"] = '1,北海道,1100,札幌市';
   */
  private async loadMuniMap(): Promise<Map<string, string> | null> {
    if (this.muniMap) return this.muniMap;

    const res = await this.fetchWithTimeout(GSI_MUNI_JS_URL);
    if (!res) return null;
    const text = await res.text();

    const map = new Map<string, string>();
    const pattern = /GSI\.MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']+)'/g;
    for (const match of text.matchAll(pattern)) {
      const parts = match[2].split(',');
      if (parts.length < 4) continue;
      const prefName = parts[1];
      // 政令市の区は「札幌市　中央区」のように全角空白区切りのため除去して連結する
      const muniName = parts[3].replace(/　/g, '');
      map.set(match[1], `${prefName}${muniName}`);
    }

    if (map.size === 0) {
      this.logger.warn('muni.js のパース結果が空でした');
      return null;
    }
    this.muniMap = map;
    return map;
  }

  /** タイムアウト付き fetch。HTTP エラー時は null を返す */
  private async fetchWithTimeout(url: string): Promise<Response | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      GSI_GEOCODER_TIMEOUT_MS,
    );
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        this.logger.warn(`GSI API 返却エラー: status=${res.status} url=${url}`);
        return null;
      }
      return res;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
