import type { MediaReference } from './media'

export const PRODUCT_CATEGORY_IMAGE_DIRECTORY = '/static/images/categories'

const productCategoryImageFiles: Readonly<Record<string, string>> = {
  农产品: 'agricultural-products.jpg',
  预制菜: 'prepared-foods.jpg',
  '腊味/预制菜': 'prepared-foods.jpg',
  食材调料: 'ingredients-seasonings.jpg',
  特色食材: 'featured-ingredients.jpg',
  土特产: 'local-specialties.jpg',
  伴手礼: 'souvenirs.jpg',
  茶饮伴手礼: 'souvenirs.jpg',
  文旅伴手礼: 'cultural-tourism-gifts.jpg',
  民宿用品: 'homestay-supplies.jpg',
  包装耗材: 'packaging-consumables.jpg',
  套餐券: 'package-vouchers.jpg',
  生鲜农产: 'fresh-produce.jpg',
  生鲜水果: 'seasonal-fruit.jpg',
  时令水果: 'seasonal-fruit.jpg',
  有机蔬菜: 'organic-vegetables.jpg',
  粮油米面: 'grains-oils-noodles.jpg',
  酒水饮料: 'beverages.jpg'
}

function builtIn(file: string): MediaReference {
  return { source: 'builtin', path: `${PRODUCT_CATEGORY_IMAGE_DIRECTORY}/${file}` }
}

export function defaultProductCategoryImage(category = ''): MediaReference {
  const normalized = category.trim()
  if (normalized === '全部' || normalized === '全品类') return builtIn('all.jpg')
  return builtIn(productCategoryImageFiles[normalized] ?? 'fallback.jpg')
}
