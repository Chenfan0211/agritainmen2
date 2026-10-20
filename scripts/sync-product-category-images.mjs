import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** 商品品类图片母版清单（母版位于 assets/product-categories/master）。 */
export const PRODUCT_CATEGORY_IMAGE_FILES = [
  'agricultural-products.webp', 'prepared-foods.webp', 'ingredients-seasonings.webp',
  'featured-ingredients.webp', 'local-specialties.webp', 'souvenirs.webp',
  'cultural-tourism-gifts.webp', 'homestay-supplies.webp', 'packaging-consumables.webp',
  'package-vouchers.webp', 'fresh-produce.webp', 'seasonal-fruit.webp',
  'organic-vegetables.webp', 'grains-oils-noodles.webp', 'beverages.webp',
  'all.webp', 'fallback.webp'
]

/** 需要同步的端目录。 */
export const PRODUCT_CATEGORY_IMAGE_APPS = ['admin', 'store', 'user', 'supplier']

/** 计算同步计划：母版 → 各端目标路径（纯函数，便于单测）。 */
export function categoryImageSyncPlan({ root, files = PRODUCT_CATEGORY_IMAGE_FILES, apps = PRODUCT_CATEGORY_IMAGE_APPS }) {
  const sourceDirectory = join(root, 'assets', 'product-categories', 'master')
  return files.flatMap((file) => apps.map((app) => ({
    file,
    app,
    source: join(sourceDirectory, file),
    target: join(root, 'apps', app, 'src', 'static', 'images', 'categories', file)
  })))
}

export function fileHash(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

/** 校验同步结果：目标哈希必须与母版一致。 */
export function validateSyncedHash({ expectedHash, actualHash, app, file }) {
  return expectedHash === actualHash ? [] : [`${app} 商品品类图片同步失败: ${file}`]
}

/** 校验计划中的母版是否存在。 */
export function validateSourceFiles(plan, exists = existsSync) {
  const failures = []
  for (const item of plan) {
    if (item.app !== plan[0]?.app) continue
    if (!exists(item.source)) failures.push(`缺少商品品类图片母版: ${item.file}`)
  }
  return failures
}

export function syncProductCategoryImages(root = ROOT) {
  const plan = categoryImageSyncPlan({ root })
  const failures = validateSourceFiles(plan)
  if (failures.length) throw new Error(failures.join('\n'))
  for (const item of plan) {
    mkdirSync(dirname(item.target), { recursive: true })
    copyFileSync(item.source, item.target)
    const failed = validateSyncedHash({
      expectedHash: fileHash(item.source), actualHash: fileHash(item.target), app: item.app, file: item.file
    })
    if (failed.length) throw new Error(failed.join('\n'))
  }
  return { files: PRODUCT_CATEGORY_IMAGE_FILES.length, apps: PRODUCT_CATEGORY_IMAGE_APPS.length }
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  const { files, apps } = syncProductCategoryImages()
  console.log(`已将 ${files} 张商品品类图片同步到 ${apps} 个应用。`)
}
