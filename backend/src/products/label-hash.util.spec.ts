import { buildLabelHash } from './label-hash.util';

describe('buildLabelHash', () => {
  const productName = 'チキン南蛮弁当';
  const storeName = 'セブンイレブン渋谷店';
  const rawText = '鶏肉、卵、小麦粉、砂糖、醤油、みりん';

  it('同一引数では同一ハッシュを返す', () => {
    const hash1 = buildLabelHash(productName, storeName, rawText);
    const hash2 = buildLabelHash(productName, storeName, rawText);
    expect(hash1).toBe(hash2);
  });

  it('異なる商品名では異なるハッシュを返す', () => {
    const hash1 = buildLabelHash(productName, storeName, rawText);
    const hash2 = buildLabelHash('別の商品', storeName, rawText);
    expect(hash1).not.toBe(hash2);
  });

  it('異なる原材料テキストでは異なるハッシュを返す', () => {
    const hash1 = buildLabelHash(productName, storeName, rawText);
    const hash2 = buildLabelHash(productName, storeName, '別の原材料');
    expect(hash1).not.toBe(hash2);
  });

  it('返り値は64文字の16進文字列（SHA-256）', () => {
    const hash = buildLabelHash(productName, storeName, rawText);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('空文字の入力でもハッシュを返す', () => {
    const hash = buildLabelHash('', '', '');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
