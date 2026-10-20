import { applyPlatformMedia, cloneSeed, farms, mergePlatformEntities, mockDelay, products, purchaseSupplies, readPlatformEntities, readPlatformMedia, selectableProducts } from '@agritainment/shared'
import type { BusinessMediaValue, MockScenario, Product, StoreAccount } from '@agritainment/shared'

/** 门店订货商城本地补充的中台可订货商品（补齐套餐券/预制菜等分类展示） */
const storeExtras: Product[] = [
  { id: 'SP01', emoji: '🎫', name: '中台联名·农家欢聚套餐券', category: '套餐券', price: 288, cost: 198, stock: 300, sales: 56, source: 'platform', status: 'active', image: '/static/images/farmhouse.webp', supplier: '中台供应链', tags: ['中台甄选', '到店核销'], farmIds: [], skus: [{ id: 'SP01-4P', name: '四人欢聚', price: 288, cost: 198, stock: 300 }] },
  { id: 'SP02', emoji: '🍲', name: '山泉土鸡汤礼盒 2 只装', category: '预制菜', price: 108, cost: 66, stock: 260, sales: 128, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['中台甄选', '冷链直配'], farmIds: [], skus: [{ id: 'SP02-2', name: '2 只装', price: 108, cost: 66, stock: 260 }] },
  { id: 'SP03', emoji: '🧵', name: '湘西苗绣香囊礼盒', category: '伴手礼', price: 66, cost: 42, stock: 520, sales: 214, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '湘西非遗工坊', tags: ['中台甄选', '非遗手作'], farmIds: [], skus: [{ id: 'SP03-1', name: '单盒装', price: 66, cost: 42, stock: 520 }] },
  { id: 'SP04', emoji: '🍶', name: '农家自酿米酒 5L', category: '酒水饮料', price: 56, cost: 32, stock: 460, sales: 322, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['中台甄选', '烹饪/待客'], farmIds: [], skus: [{ id: 'SP04-1', name: '5L 装', price: 56, cost: 32, stock: 460 }] },
  { id: 'SP05', emoji: '🎟', name: '中台联名·双人欢聚套餐券', category: '套餐券', price: 168, cost: 108, stock: 380, sales: 96, source: 'platform', status: 'active', image: '/static/images/farmhouse.webp', supplier: '中台供应链', tags: ['中台甄选', '到店核销'], farmIds: [], skus: [{ id: 'SP05-2', name: '双人套餐', price: 168, cost: 108, stock: 380 }] },
  { id: 'SP06', emoji: '🍱', name: '湘西腊味合家欢礼盒', category: '预制菜', price: 128, cost: 78, stock: 240, sales: 168, source: 'platform', status: 'active', image: '/static/images/bacon.webp', supplier: '湘西腊味合作社', tags: ['中台甄选', '加热即食'], farmIds: [], skus: [{ id: 'SP06-1', name: '合家欢装', price: 128, cost: 78, stock: 240 }] },
  { id: 'SP07', emoji: '🫒', name: '中台精选·山茶油 1L', category: '食材调料', price: 89, cost: 52, stock: 620, sales: 245, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['中台甄选', '物理压榨'], farmIds: [], skus: [{ id: 'SP07-1', name: '1L 装', price: 89, cost: 52, stock: 620 }] },
  { id: 'SP08', emoji: '🍵', name: '高山云雾茶 250g', category: '伴手礼', price: 98, cost: 62, stock: 410, sales: 187, source: 'platform', status: 'active', image: '/static/images/tea.webp', supplier: '安化茶业集团', tags: ['中台甄选', '高山明前'], farmIds: [], skus: [{ id: 'SP08-1', name: '250g 罐装', price: 98, cost: 62, stock: 410 }] },
  { id: 'SP09', emoji: '🥚', name: '高山土鸡蛋 30 枚', category: '生鲜农产', price: 52, cost: 32, stock: 1200, sales: 486, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '湘西高山农场', tags: ['中台甄选', '散养土鸡'], farmIds: [], skus: [{ id: 'SP09-30', name: '30 枚装', price: 52, cost: 32, stock: 800 }, { id: 'SP09-60', name: '60 枚装', price: 92, cost: 58, stock: 400 }] },
  { id: 'SP10', emoji: '🍊', name: '时令鲜果礼盒 5 斤', category: '生鲜农产', price: 78, cost: 45, stock: 520, sales: 264, source: 'platform', status: 'active', image: '/static/images/peach.webp', supplier: '炎陵果业有限公司', tags: ['产地直发', '当季现摘'], farmIds: [], skus: [{ id: 'SP10-5J', name: '5 斤礼盒', price: 78, cost: 45, stock: 520 }] },
  { id: 'SP11', emoji: '🥩', name: '农家土猪肉 2kg', category: '生鲜农产', price: 108, cost: 68, stock: 320, sales: 198, source: 'platform', status: 'active', image: '/static/images/bacon.webp', supplier: '湘西腊味合作社', tags: ['中台甄选', '冷鲜直配'], farmIds: [], skus: [{ id: 'SP11-2K', name: '2kg 装', price: 108, cost: 68, stock: 320 }] },
  { id: 'SP12', emoji: '🎍', name: '高山雷笋干 500g', category: '土特产', price: 68, cost: 40, stock: 460, sales: 152, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['中台甄选', '自然晾晒'], farmIds: [], skus: [{ id: 'SP12-1', name: '500g 袋装', price: 68, cost: 40, stock: 460 }] },
  { id: 'SP13', emoji: '🍄', name: '高山香菇干货 250g', category: '土特产', price: 58, cost: 35, stock: 540, sales: 176, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['中台甄选', '菌菇干货'], farmIds: [], skus: [{ id: 'SP13-1', name: '250g 袋装', price: 58, cost: 35, stock: 540 }] },
  { id: 'SP14', emoji: '🌶', name: '手工辣椒酱 3 瓶', category: '土特产', price: 36, cost: 18, stock: 680, sales: 342, source: 'platform', status: 'active', image: '/static/images/chili.webp', supplier: '湘西辣味坊', tags: ['农家手作', '下饭'], farmIds: [], skus: [{ id: 'SP14-3', name: '3 瓶装', price: 36, cost: 18, stock: 680 }] },
  { id: 'SP15', emoji: '💍', name: '湘西银饰手镯', category: '伴手礼', price: 198, cost: 120, stock: 180, sales: 86, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '凤凰银匠铺', tags: ['非遗手作', '中台甄选'], farmIds: [], skus: [{ id: 'SP15-1', name: '单只装', price: 198, cost: 120, stock: 180 }] },
  { id: 'SP16', emoji: '👜', name: '蜡染蓝印花布包', category: '伴手礼', price: 98, cost: 55, stock: 260, sales: 124, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '湘西非遗工坊', tags: ['非遗手作', '文创'], farmIds: [], skus: [{ id: 'SP16-1', name: '单只装', price: 98, cost: 55, stock: 260 }] },
  { id: 'SP17', emoji: '🍃', name: '古丈毛尖绿茶 250g', category: '茶饮', price: 128, cost: 75, stock: 380, sales: 208, source: 'platform', status: 'active', image: '/static/images/tea.webp', supplier: '古丈茶业', tags: ['中台甄选', '明前绿茶'], farmIds: [], skus: [{ id: 'SP17-1', name: '250g 罐装', price: 128, cost: 75, stock: 380 }] },
  { id: 'SP18', emoji: '☕', name: '石门红茶 200g', category: '茶饮', price: 118, cost: 68, stock: 340, sales: 172, source: 'platform', status: 'active', image: '/static/images/tea.webp', supplier: '石门茶厂', tags: ['中台甄选', '功夫红茶'], farmIds: [], skus: [{ id: 'SP18-1', name: '200g 罐装', price: 118, cost: 68, stock: 340 }] },
  { id: 'SP19', emoji: '🧱', name: '安化黑茶砖 1kg', category: '茶饮', price: 168, cost: 96, stock: 240, sales: 132, source: 'platform', status: 'active', image: '/static/images/tea.webp', supplier: '安化茶业集团', tags: ['中台甄选', '陈年茶砖'], farmIds: [], skus: [{ id: 'SP19-1', name: '1kg 砖', price: 168, cost: 96, stock: 240 }] },
  { id: 'SP20', emoji: '🛢', name: '土榨菜籽油 5L', category: '粮油调味', price: 118, cost: 70, stock: 300, sales: 226, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['中台甄选', '物理压榨'], farmIds: [], skus: [{ id: 'SP20-1', name: '5L 装', price: 118, cost: 70, stock: 300 }] },
  { id: 'SP21', emoji: '🍚', name: '富硒大米面组合 10kg', category: '粮油调味', price: 98, cost: 58, stock: 280, sales: 168, source: 'platform', status: 'active', image: '/static/images/rice.webp', supplier: '中台供应链', tags: ['生态种植', '组合装'], farmIds: [], skus: [{ id: 'SP21-1', name: '10kg 组合', price: 98, cost: 58, stock: 280 }] },
  { id: 'SP22', emoji: '🍷', name: '杨梅果酒 750ml', category: '酒水饮料', price: 76, cost: 42, stock: 420, sales: 188, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '靖州杨梅合作社', tags: ['中台甄选', '果香浓郁'], farmIds: [], skus: [{ id: 'SP22-1', name: '750ml 单瓶', price: 76, cost: 42, stock: 420 }] },
  { id: 'SP23', emoji: '🥃', name: '湘西苞谷酒 2.5L', category: '酒水饮料', price: 66, cost: 38, stock: 360, sales: 214, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['本地烧酒', '待客佳品'], farmIds: [], skus: [{ id: 'SP23-1', name: '2.5L 桶', price: 66, cost: 38, stock: 360 }] },
  { id: 'SP24', emoji: '🧺', name: '加厚浴巾三件套', category: '民宿用品', price: 72, cost: 45, stock: 260, sales: 156, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['民宿用品', '加厚亲肤'], farmIds: [], skus: [{ id: 'SP24-1', name: '三件套', price: 72, cost: 45, stock: 260 }] },
  { id: 'SP25', emoji: '🩴', name: '软底防滑拖鞋 20 双', category: '民宿用品', price: 96, cost: 60, stock: 200, sales: 118, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['民宿用品', '整箱装'], farmIds: [], skus: [{ id: 'SP25-1', name: '20 双/箱', price: 96, cost: 60, stock: 200 }] },
  { id: 'SP26', emoji: '🛍', name: '食品级保鲜袋 500 只', category: '包装耗材', price: 28, cost: 15, stock: 900, sales: 342, source: 'platform', status: 'active', image: '/static/images/field.webp', supplier: '中台供应链', tags: ['包装耗材', '食品级'], farmIds: [], skus: [{ id: 'SP26-1', name: '500 只/箱', price: 28, cost: 15, stock: 900 }] },
  { id: 'SP27', emoji: '🍙', name: '端午手工粽子礼盒', category: '预制菜', price: 88, cost: 52, stock: 240, sales: 92, source: 'platform', status: 'active', image: '/static/images/farmhouse.webp', supplier: '中台供应链', tags: ['中台甄选', '加热即食'], farmIds: [], skus: [{ id: 'SP27-1', name: '10 只礼盒', price: 88, cost: 52, stock: 240 }] }
]

const p014 = products.find((item) => item.id === 'P014')

/** 供应链可订货目录：平台零售商品 + 门店物料 + 本地补充 */
export const storeCatalog: Product[] = [
  ...selectableProducts,
  ...(p014 ? [p014] : []),
  ...purchaseSupplies,
  ...storeExtras
]

export interface StoreInfo {
  name: string
  image: BusinessMediaValue
  shortName: string
  region: string
  city: string
  address: string
  phone: string
  contact: string
  hours: string
  accountNo: string
  account: string
}

export const storeInfo: StoreInfo = {
  name: '石板溪农家乐·门店',
  image: '/static/images/farmhouse.webp',
  shortName: '石板溪',
  region: '湖南·湘西州',
  city: '湘西州',
  address: '湖南省湘西州永顺县石板溪村',
  phone: '0743-888-xxxx',
  contact: '王店长',
  hours: '09:00–21:30',
  accountNo: 'SBX·门店 8829',
  account: '账期月结 · 授信额度 ¥20,000'
}

export function storeInfoForFarm(farmId: string, account?: StoreAccount): StoreInfo {
  const farm = farms.find((item) => item.id === farmId) || farms[0]
  return {
    ...storeInfo,
    name: `${farm.name}·门店`,
    image: farm.image,
    shortName: farm.name.replace(/农家乐|农庄|山景/g, '').slice(0, 6),
    region: `湖南·${farm.city}`,
    city: farm.city,
    address: `湖南省${farm.region}`,
    contact: account?.name || storeInfo.contact,
    accountNo: `${farm.id}·门店`,
  }
}

export interface StoreMetrics {
  activeCount: number
  savedTotal: number
  hotOrders: Array<{ id: string; name: string; emoji: string; image: BusinessMediaValue; times: number; amount: number }>
}

/** 门店商城指标：从真实商品目录派生 */
export function deriveStoreMetrics(products: Product[]): StoreMetrics {
  const activeCount = products.filter((product) => product.status === 'active').length
  const savedTotal = Math.round(products.reduce((sum, product) => sum + (product.price - product.cost) * product.sales, 0) * 100) / 100
  const hotOrders = [...products]
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 3)
    .map((product) => ({ id: product.id, name: product.name, emoji: product.emoji || '📦', image: product.image, times: product.sales, amount: Math.round(product.sales * product.price) }))
  return { activeCount, savedTotal, hotOrders }
}

export const storeRepository = {
  loadStore: (scenario: MockScenario = 'normal', farmId = 'F001', account?: StoreAccount) => {
    const info = storeInfoForFarm(farmId, account)
    const platformProducts = mergePlatformEntities(cloneSeed(selectableProducts), readPlatformEntities()?.products)
    const storeProducts = cloneSeed([...platformProducts, ...(p014 ? [p014] : []), ...purchaseSupplies, ...storeExtras])
    applyPlatformMedia(null, storeProducts)
    const media = readPlatformMedia()
    if (media?.farms[farmId]) info.image = media.farms[farmId]
    return mockDelay(
      { info, products: storeProducts },
      180,
      scenario,
      { info, products: [] }
    )
  }
}
