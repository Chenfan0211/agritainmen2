import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('用户端移动商城契约', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../../../src/pages/index/index.wxml'), 'utf8')
  const script = readFileSync(resolve(import.meta.dirname, '../../../src/pages/index/index.ts'), 'utf8')
  const operationsScript = readFileSync(resolve(import.meta.dirname, '../../../src/pages/operations/index.ts'), 'utf8')
  const app = readFileSync(resolve(import.meta.dirname, '../../../src/app.json'), 'utf8')

  it('使用四栏导航并将订单入口收进个人中心', () => {
    expect(source).toContain("activeTab === 'home'")
    expect(source).toContain("activeTab === 'category'")
    expect(source).toContain("activeTab === 'cart'")
    expect(source).toContain('<text>首页</text>')
    expect(source).toContain('<text>分类</text>')
    expect(source).toContain('<text>购物车</text>')
    expect(source).toContain('查看全部订单')
  })

  it('团长身份显示四个运营入口且商品分享带推广人与商品参数', () => {
    expect(source).toContain('我的收入')
    // 宫格入口名受「不超过四字」限制，下级用户入口在宫格显示为「下级用户」，完整名称在运营页标题
    expect(source).toContain('<text class="pc-tile-label">下级用户</text>')
    expect(operationsScript).toContain('我的下级用户')
    expect(source).toContain('团队订单')
    expect(source).toContain('团队业绩')
    expect(script).toContain('promoter=${store.currentDistributor.promoterId}')
    expect(script).toContain('product=${product.id}')
    expect(app).toContain('pages/operations/index')
  })
})