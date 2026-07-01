import type { ProductAllergens } from '../shared/types/db.types'

export const deriveRakutenConfidence = (allergens: ProductAllergens): 'high' | 'low' => {
  const hasAnyInfo =
    allergens.contains.length > 0 ||
    allergens.partial.length > 0 ||
    allergens.components.length > 0
  return hasAnyInfo ? 'high' : 'low'
}
