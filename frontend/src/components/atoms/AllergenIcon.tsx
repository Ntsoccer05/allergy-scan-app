import Image from 'next/image'

const ICON_NAME_MAP: Record<string, string> = {
  えび: 'ebi',
  かに: 'kani',
  カシューナッツ: 'cashew',
  くるみ: 'walnut',
  小麦: 'wheat',
  そば: 'soba',
  卵: 'egg',
  乳: 'milk',
  落花生: 'peanut',
  アーモンド: 'almond',
  あわび: 'abalone',
  いか: 'squid',
  いくら: 'salmon-roe',
  オレンジ: 'orange',
  キウイフルーツ: 'kiwi',
  牛肉: 'beef',
  ごま: 'sesame',
  さけ: 'salmon',
  さば: 'mackerel',
  大豆: 'soybean',
  鶏肉: 'chicken',
  バナナ: 'banana',
  ピスタチオ: 'pistachio',
  豚肉: 'pork',
  マカダミアナッツ: 'macadamia',
  もも: 'peach',
  りんご: 'apple',
  やまいも: 'yam',
  ゼラチン: 'gelatin',
  アルコール: 'alcohol',
  カフェイン: 'caffeine',
  糖質: 'carbs',
  食品添加物: 'additive',
  トランス脂肪酸: 'trans-fat',
  砂糖: 'sugar',
}

type AllergenIconProps = {
  /** allergens.name フィールドの値（日本語）または icon_name（英語スラッグ） */
  name: string
  size?: number
  className?: string
  alt?: string
}

export function AllergenIcon({ name, size = 32, className, alt }: AllergenIconProps) {
  const iconName = ICON_NAME_MAP[name] ?? name
  const src = `/icons/allergens/${iconName}.svg`

  return (
    <Image
      src={src}
      alt={alt ?? name}
      width={size}
      height={size}
      className={className}
      // SVG icons should not be blurred on load
      placeholder="empty"
    />
  )
}
