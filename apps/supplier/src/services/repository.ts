import { buildTencentMapSearchUrl, buildTencentNavigationUrl, cloneSeed, demoDrivers, haversineKm, readDailyDeliveryRouteState, readDailyDeliveryRoutes, readPlatformDrivers, readPlatformEntities, readPlatformOrders, readPlatformSupplierSettlements, saveDailyDeliveryRoute, todayString, writePlatformDrivers, writePlatformOrder, writePlatformSupplierSettlement } from '@agritainment/shared'
import type { Order, OrderFlowEvent, Supplier, SupplierFulfillment } from '@agritainment/shared'
import { SUPPLIER_DEMO_ID } from '@agritainment/shared'

/** 演示供应商：湘西腊味合作社（S002） */
export const supplierInfo = {
  id: SUPPLIER_DEMO_ID,
  name: '湘西腊味合作社',
  emoji: '🥓',
  region: '湘西州',
  category: '腊味/预制菜',
  phone: '13787366688',
  certified: true,
  longitude: 109.8542,
  latitude: 28.6267
}

export interface DeliveryLocation {
  address: string
  contact: string
  phone: string
  /** 仓点维护人（清单「仓点设置」：供应商仓点 / 联系人维护），未维护时回落到供应商主体 */
  contactName?: string
  contactPhone?: string
  longitude?: number
  latitude?: number
}

export interface DeliveryStore extends DeliveryLocation {
  storeId: string
  storeName: string
}

/** 司机配送目录以稳定门店编号为主键；旧名称只在这里做一次精确兼容。 */
export const storeDirectory: Record<string, DeliveryStore> = {
  F001: { storeId: 'F001', storeName: '石板溪农家乐·门店', address: '湖南省湘西州永顺县石板溪村', contact: '王店长', phone: '0743-888-xxxx', longitude: 109.8542, latitude: 28.6267 },
  F002: { storeId: 'F002', storeName: '云上人家·门店', address: '湖南省张家界市武陵源区云上村', contact: '李店长', phone: '0744-666-xxxx', longitude: 110.4792, latitude: 29.1171 },
  F003: { storeId: 'F003', storeName: '稻香村生态农庄·门店', address: '湖南省常德市桃源县稻香村', contact: '门店', phone: '' }
}

const legacyStoreIds: Record<string, string> = {
  '石板溪农家乐': 'F001', '石板溪农家乐·门店': 'F001',
  '云上人家': 'F002', '云上人家·门店': 'F002', '云上人家山景农庄': 'F002',
  '稻香村生态农庄': 'F003', '稻香村生态农庄·门店': 'F003'
}

export function resolveOrderStore(order: Pick<Order, 'storeId'> & Partial<Pick<Order, 'storeName' | 'customer' | 'supplierOrderLink'>>): DeliveryStore | undefined {
  const stableId = order.storeId?.trim() || (order.supplierOrderLink?.source === 'store' ? order.supplierOrderLink.customerUserId?.trim() : '')
  if (stableId) return deliveryStoreById(stableId)
  const legacyName = order.storeName?.trim() || order.customer?.trim()
  return legacyName ? deliveryStoreById(legacyStoreIds[legacyName]) : undefined
}

function deliveryStoreById(storeId?: string): DeliveryStore | undefined {
  const base = storeId ? storeDirectory[storeId] : undefined
  if (!base) return undefined
  const farm = readPlatformEntities()?.farms?.[storeId!]
  if (!farm) return base
  return {
    ...base, storeName: `${farm.name}·门店`, address: farm.address || base.address,
    ...(farm.location ? { longitude: farm.location.longitude, latitude: farm.location.latitude } : { longitude: undefined, latitude: undefined })
  }
}

export function storeInfoOf(orderOrName: Pick<Order, 'storeId'> & Partial<Pick<Order, 'storeName' | 'customer' | 'supplierOrderLink'>> | string): DeliveryLocation {
  const resolved = typeof orderOrName === 'string'
    ? deliveryStoreById(legacyStoreIds[orderOrName.trim()])
    : resolveOrderStore(orderOrName)
  return resolved || { address: '门店地址以到店实际为准', contact: '门店', phone: '' }
}

export function deliveryDistanceKm(origin: { longitude?: number; latitude?: number }, destination?: DeliveryLocation): number | null {
  if (origin.longitude === undefined || origin.latitude === undefined || destination?.longitude === undefined || destination.latitude === undefined) return null
  return haversineKm(origin.latitude, origin.longitude, destination.latitude, destination.longitude)
}

/** 返回当前供应商的仓点；未配置坐标时由调用方按未知距离处理。 */
export function supplierWarehouseOf(supplierId: string, supplierDirectory?: readonly Supplier[]): DeliveryLocation | undefined {
  const supplier = supplierDirectory?.find((item) => item.id === supplierId)
  if (supplier?.warehouse) return { ...supplier.warehouse, contact: supplier.warehouse.contactName || supplier.name, phone: supplier.warehouse.contactPhone || supplier.contactPhone || '', contactName: supplier.warehouse.contactName, contactPhone: supplier.warehouse.contactPhone }
  return supplierId === supplierInfo.id
    ? { address: `湖南省${supplierInfo.region}仓点`, contact: supplierInfo.name, phone: supplierInfo.phone, longitude: supplierInfo.longitude, latitude: supplierInfo.latitude }
    : undefined
}

export function buildNavigationUrl(storeName: string, destination: DeliveryLocation): string {
  if (destination.longitude !== undefined && destination.latitude !== undefined) {
    return buildTencentNavigationUrl({ longitude: destination.longitude, latitude: destination.latitude, name: storeName }, 'agritainment-supplier')
  }
  return buildTencentMapSearchUrl(destination.address, 'agritainment-supplier')
}

function dateOnly(offsetDays: number): string {
  return dateTime(offsetDays, '00:00').slice(0, 10)
}

function dateTime(offsetDays: number, time: string): string {
  const date = new Date()
  date.setDate(date.getDate() - offsetDays)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d} ${time}`
}

interface SeedItem {
  productId: string
  skuId: string
  name: string
  skuName: string
  image: string
  quantity: number
  price: number
}

const bacon = (quantity: number): SeedItem => ({ productId: 'P001', skuId: 'P001-500', name: '湘西烟熏柴火腊肉', skuName: '500g', image: '/static/images/bacon.webp', quantity, price: 38 })
const chili = (quantity: number): SeedItem => ({ productId: 'SP14', skuId: 'SP14-3', name: '手工辣椒酱', skuName: '3 瓶装', image: '/static/images/chili.webp', quantity, price: 18 })
const egg = (quantity: number): SeedItem => ({ productId: 'SP09', skuId: 'SP09-30', name: '高山土鸡蛋', skuName: '30 枚装', image: '/static/images/field.webp', quantity, price: 32 })
const tea = (quantity: number): SeedItem => ({ productId: 'SP19', skuId: 'SP19-1', name: '安化黑茶砖', skuName: '1kg 砖', image: '/static/images/tea.webp', quantity, price: 96 })
const oil = (quantity: number): SeedItem => ({ productId: 'SP20', skuId: 'SP20-1', name: '土榨菜籽油', skuName: '5L 装', image: '/static/images/field.webp', quantity, price: 70 })
const fruit = (quantity: number): SeedItem => ({ productId: 'SP10', skuId: 'SP10-5J', name: '时令鲜果礼盒', skuName: '5 斤礼盒', image: '/static/images/peach.webp', quantity, price: 45 })
const honey = (quantity: number): SeedItem => ({ productId: 'P005', skuId: 'P005-500', name: '武陵山野生土蜂蜜', skuName: '500g', image: '/static/images/honey.webp', quantity, price: 88 })
const rice = (quantity: number): SeedItem => ({ productId: 'PP05', skuId: 'PP05-1', name: '生态富硒米', skuName: '25kg', image: '/static/images/rice.webp', quantity, price: 168 })

function orderAmount(items: SeedItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100
}

function fulfillmentOf(partial: Partial<SupplierFulfillment> & { status: SupplierFulfillment['status'] }): SupplierFulfillment {
  return { shortages: [], handovers: [], updatedAt: '', ...partial }
}

interface SeedSpec {
  id: string
  customer: string
  items: SeedItem[]
  createdAt: string
  status: Order['status']
  fulfillment: SupplierFulfillment
  trackingNo?: string
  flow: OrderFlowEvent[]
}

const submittedFlow = (createdAt: string): OrderFlowEvent[] => [{ time: createdAt, action: '订单已提交 · 门店向供应商直采', operator: '门店' }]
const acceptedFlow = (createdAt: string, acceptedAt: string): OrderFlowEvent[] => [
  ...submittedFlow(createdAt),
  { time: acceptedAt, action: '中台已接单 · 供应商已接单，备货中', operator: supplierInfo.name }
]

function toOrder(spec: SeedSpec): Order {
  return {
    id: spec.id,
    productName: spec.items[0].name,
    quantity: spec.items.reduce((sum, item) => sum + item.quantity, 0),
    amount: orderAmount(spec.items),
    customer: spec.customer,
    channel: 'purchase',
    status: spec.status,
    createdAt: spec.createdAt,
    trackingNo: spec.trackingNo,
    flow: spec.flow,
    items: spec.items,
    supplierId: SUPPLIER_DEMO_ID,
    supplierFulfillment: { ...spec.fulfillment, updatedAt: spec.fulfillment.updatedAt || spec.createdAt }
  }
}

function seedOrders(): Order[] {
  const today9 = dateTime(0, '09:12')
  const today10 = dateTime(0, '10:05')
  const d1_1430 = dateTime(1, '14:30')
  const d1_1520 = dateTime(1, '15:20')
  const d1_1100 = dateTime(1, '11:00')
  const d1_1610 = dateTime(1, '16:10')
  const d2_0940 = dateTime(2, '09:40')

  const specs: SeedSpec[] = [
    {
      id: 'SO-S001', customer: '石板溪农家乐·门店', items: [bacon(5), chili(10)], createdAt: today9,
      status: 'pending', fulfillment: fulfillmentOf({ status: 'submitted' }), flow: submittedFlow(today9)
    },
    {
      id: 'SO-S002', customer: '云上人家·门店', items: [egg(20)], createdAt: today10,
      status: 'pending', fulfillment: fulfillmentOf({ status: 'accepted' }), flow: acceptedFlow(today10, dateTime(0, '10:30'))
    },
    {
      id: 'SO-S003', customer: '石板溪农家乐·门店', items: [bacon(10)], createdAt: d1_1430,
      status: 'shipping',
      fulfillment: fulfillmentOf({ status: 'shipped', shipType: 'driver', driverId: 'D001', driverName: '张伟', deliverDate: dateOnly(0) }),
      flow: [...acceptedFlow(d1_1430, dateTime(1, '15:00')), { time: dateTime(1, '15:10'), action: '已发货 · 已指派司机 张伟 配送', operator: supplierInfo.name }]
    },
    {
      id: 'SO-S004', customer: '云上人家·门店', items: [tea(5)], createdAt: d1_1520,
      status: 'shipping',
      fulfillment: fulfillmentOf({
        status: 'delivering', shipType: 'driver', driverId: 'D002', driverName: '李强', deliverDate: dateOnly(0),
        handovers: [{ id: 'H-S004-OUT', type: 'out', orderId: 'SO-S004', time: dateTime(1, '16:00'), operatorId: SUPPLIER_DEMO_ID, operatorName: supplierInfo.name, operatorRole: 'supplier', shortageCount: 0 }]
      }),
      flow: [...acceptedFlow(d1_1520, dateTime(1, '15:40')), { time: dateTime(1, '16:00'), action: '出库交接完成 · 司机 李强 领货', operator: supplierInfo.name }]
    },
    {
      id: 'SO-S005', customer: '石板溪农家乐·门店', items: [fruit(8)], createdAt: d2_0940,
      status: 'delivered',
      fulfillment: fulfillmentOf({
        status: 'received', shipType: 'driver', driverId: 'D001', driverName: '张伟', deliverDate: dateOnly(2),
        handovers: [
          { id: 'H-S005-OUT', type: 'out', orderId: 'SO-S005', time: dateTime(2, '10:00'), operatorId: SUPPLIER_DEMO_ID, operatorName: supplierInfo.name, operatorRole: 'supplier', shortageCount: 0 },
          { id: 'H-S005-IN', type: 'in', orderId: 'SO-S005', time: dateTime(2, '13:20'), operatorId: 'D001', operatorName: '张伟', operatorRole: 'driver' }
        ]
      }),
      flow: [
        ...acceptedFlow(d2_0940, dateTime(2, '10:00')),
        { time: dateTime(2, '10:10'), action: '已发货 · 已指派司机 张伟 配送', operator: supplierInfo.name },
        { time: dateTime(2, '10:30'), action: '出库交接完成 · 司机 张伟 领货', operator: supplierInfo.name },
        { time: dateTime(2, '13:20'), action: '到店交接完成 · 司机 张伟 已与门店交接', operator: '张伟' }
      ]
    },
    {
      id: 'SO-S006', customer: '云上人家·门店', items: [oil(4)], createdAt: d1_1100, trackingNo: 'SF888800001',
      status: 'shipping',
      fulfillment: fulfillmentOf({ status: 'shipped', shipType: 'courier', trackingNo: 'SF888800001', deliverDate: dateOnly(0) }),
      flow: [...acceptedFlow(d1_1100, dateTime(1, '11:20')), { time: dateTime(1, '11:30'), action: '已发货 · 快递直发，运单 SF888800001', operator: supplierInfo.name }]
    },
    {
      id: 'SO-S007', customer: '石板溪农家乐·门店', items: [bacon(10), chili(5)], createdAt: d1_1610,
      status: 'shipping',
      fulfillment: fulfillmentOf({
        status: 'delivering', shipType: 'driver', driverId: 'D003', driverName: '王芳', deliverDate: dateOnly(0),
        shortages: [{ skuId: 'P001-500', name: '湘西烟熏柴火腊肉', ordered: 10, actual: 8, shortage: 2 }],
        handovers: [{ id: 'H-S007-OUT', type: 'out', orderId: 'SO-S007', time: dateTime(1, '16:40'), operatorId: SUPPLIER_DEMO_ID, operatorName: supplierInfo.name, operatorRole: 'supplier', shortageCount: 1 }]
      }),
      flow: [
        ...acceptedFlow(d1_1610, dateTime(1, '16:20')),
        { time: dateTime(1, '16:30'), action: '已发货 · 已指派司机 王芳 配送', operator: supplierInfo.name },
        { time: dateTime(1, '16:40'), action: '出库交接完成 · 司机 王芳 领货', operator: supplierInfo.name },
        { time: dateTime(1, '16:40'), action: '缺货 1 项：湘西烟熏柴火腊肉 -2', operator: supplierInfo.name }
      ]
    },
    {
      id: 'SO-S008', customer: '石板溪农家乐·门店', items: [honey(6)], createdAt: dateTime(0, '11:20'),
      status: 'pending', fulfillment: fulfillmentOf({ status: 'submitted' }), flow: submittedFlow(dateTime(0, '11:20'))
    },
    {
      id: 'SO-S009', customer: '云上人家·门店', items: [rice(4)], createdAt: dateTime(0, '11:35'),
      status: 'pending', fulfillment: fulfillmentOf({ status: 'accepted' }), flow: acceptedFlow(dateTime(0, '11:35'), dateTime(0, '12:00'))
    },
    {
      id: 'SO-S010', customer: '石板溪农家乐·门店', items: [tea(3), chili(6)], createdAt: dateTime(1, '09:10'),
      status: 'shipping', fulfillment: fulfillmentOf({ status: 'shipped', shipType: 'driver', driverId: 'D001', driverName: '张伟', deliverDate: dateOnly(0) }),
      flow: [...acceptedFlow(dateTime(1, '09:10'), dateTime(1, '09:30')), { time: dateTime(1, '09:40'), action: '已发货 · 已指派司机 张伟 配送', operator: supplierInfo.name }]
    },
    {
      id: 'SO-S011', customer: '云上人家·门店', items: [bacon(8), egg(12)], createdAt: dateTime(1, '10:05'),
      status: 'shipping', fulfillment: fulfillmentOf({
        status: 'delivering', shipType: 'driver', driverId: 'D002', driverName: '李强', deliverDate: dateOnly(0),
        shortages: [{ skuId: 'P001-500', name: '湘西烟熏柴火腊肉', ordered: 8, actual: 6, shortage: 2 }],
        handovers: [{ id: 'H-S011-OUT', type: 'out', orderId: 'SO-S011', time: dateTime(1, '10:40'), operatorId: SUPPLIER_DEMO_ID, operatorName: supplierInfo.name, operatorRole: 'supplier', shortageCount: 1 }]
      }),
      flow: [
        ...acceptedFlow(dateTime(1, '10:05'), dateTime(1, '10:20')),
        { time: dateTime(1, '10:30'), action: '已发货 · 已指派司机 李强 配送', operator: supplierInfo.name },
        { time: dateTime(1, '10:40'), action: '出库交接完成 · 司机 李强 领货', operator: supplierInfo.name },
        { time: dateTime(1, '10:40'), action: '缺货 1 项：湘西烟熏柴火腊肉 -2', operator: supplierInfo.name }
      ]
    },
    {
      id: 'SO-S012', customer: '石板溪农家乐·门店', items: [rice(6), oil(2)], createdAt: dateTime(3, '09:00'),
      status: 'delivered', fulfillment: fulfillmentOf({
        status: 'received', shipType: 'driver', driverId: 'D002', driverName: '李强', deliverDate: dateOnly(3),
        handovers: [
          { id: 'H-S012-OUT', type: 'out', orderId: 'SO-S012', time: dateTime(3, '10:00'), operatorId: SUPPLIER_DEMO_ID, operatorName: supplierInfo.name, operatorRole: 'supplier', shortageCount: 0 },
          { id: 'H-S012-IN', type: 'in', orderId: 'SO-S012', time: dateTime(3, '13:30'), operatorId: 'D002', operatorName: '李强', operatorRole: 'driver' }
        ]
      }),
      flow: [
        ...acceptedFlow(dateTime(3, '09:00'), dateTime(3, '09:30')),
        { time: dateTime(3, '09:40'), action: '已发货 · 已指派司机 李强 配送', operator: supplierInfo.name },
        { time: dateTime(3, '10:00'), action: '出库交接完成 · 司机 李强 领货', operator: supplierInfo.name },
        { time: dateTime(3, '13:30'), action: '到店交接完成 · 司机 李强 已与门店交接', operator: '李强' }
      ]
    },
    {
      id: 'SO-S013', customer: '云上人家·门店', items: [honey(4)], createdAt: dateTime(1, '14:00'), trackingNo: 'SF888800002',
      status: 'shipping', fulfillment: fulfillmentOf({ status: 'shipped', shipType: 'courier', trackingNo: 'SF888800002', deliverDate: dateOnly(0) }),
      flow: [...acceptedFlow(dateTime(1, '14:00'), dateTime(1, '14:20')), { time: dateTime(1, '14:30'), action: '已发货 · 快递直发，运单 SF888800002', operator: supplierInfo.name }]
    },
    {
      id: 'SO-S014', customer: '石板溪农家乐·门店', items: [fruit(4)], createdAt: dateTime(1, '15:00'),
      status: 'unpaid-cancelled', fulfillment: fulfillmentOf({ status: 'cancelled' }),
      flow: [...submittedFlow(dateTime(1, '15:00')), { time: dateTime(1, '15:20'), action: '订单已取消 · 门店取消进货单', operator: '门店' }]
    },
    {
      id: 'SO-S015', customer: '云上人家·门店', items: [egg(8), chili(4)], createdAt: dateTime(1, '16:00'),
      status: 'shipping', fulfillment: fulfillmentOf({
        status: 'delivering', shipType: 'driver', driverId: 'D001', driverName: '张伟', deliverDate: dateOnly(0),
        handovers: [{ id: 'H-S015-OUT', type: 'out', orderId: 'SO-S015', time: dateTime(1, '16:30'), operatorId: SUPPLIER_DEMO_ID, operatorName: supplierInfo.name, operatorRole: 'supplier', shortageCount: 0 }]
      }),
      flow: [
        ...acceptedFlow(dateTime(1, '16:00'), dateTime(1, '16:15')),
        { time: dateTime(1, '16:20'), action: '已发货 · 已指派司机 张伟 配送', operator: supplierInfo.name },
        { time: dateTime(1, '16:30'), action: '出库交接完成 · 司机 张伟 领货', operator: supplierInfo.name }
      ]
    },
    {
      id: 'SO-S016', customer: '石板溪农家乐·门店', items: [honey(4), rice(5)], createdAt: dateTime(2, '09:20'),
      status: 'delivered', fulfillment: fulfillmentOf({
        status: 'received', shipType: 'driver', driverId: 'D003', driverName: '王芳', deliverDate: dateOnly(2),
        handovers: [
          { id: 'H-S016-OUT', type: 'out', orderId: 'SO-S016', time: dateTime(2, '10:00'), operatorId: SUPPLIER_DEMO_ID, operatorName: supplierInfo.name, operatorRole: 'supplier', shortageCount: 0 },
          { id: 'H-S016-IN', type: 'in', orderId: 'SO-S016', time: dateTime(2, '14:00'), operatorId: 'D003', operatorName: '王芳', operatorRole: 'driver' }
        ]
      }),
      flow: [
        ...acceptedFlow(dateTime(2, '09:20'), dateTime(2, '09:40')),
        { time: dateTime(2, '09:50'), action: '已发货 · 已指派司机 王芳 配送', operator: supplierInfo.name },
        { time: dateTime(2, '10:00'), action: '出库交接完成 · 司机 王芳 领货', operator: supplierInfo.name },
        { time: dateTime(2, '14:00'), action: '到店交接完成 · 司机 王芳 已与门店交接', operator: '王芳' }
      ]
    },
    {
      id: 'SO-S017', customer: '云上人家·门店', items: [tea(3), chili(6)], createdAt: dateTime(3, '08:40'),
      status: 'delivered', fulfillment: fulfillmentOf({
        status: 'received', shipType: 'driver', driverId: 'D001', driverName: '张伟', deliverDate: dateOnly(3),
        handovers: [
          { id: 'H-S017-OUT', type: 'out', orderId: 'SO-S017', time: dateTime(3, '09:30'), operatorId: SUPPLIER_DEMO_ID, operatorName: supplierInfo.name, operatorRole: 'supplier', shortageCount: 0 },
          { id: 'H-S017-IN', type: 'in', orderId: 'SO-S017', time: dateTime(3, '12:40'), operatorId: 'D001', operatorName: '张伟', operatorRole: 'driver' }
        ]
      }),
      flow: [
        ...acceptedFlow(dateTime(3, '08:40'), dateTime(3, '09:00')),
        { time: dateTime(3, '09:10'), action: '已发货 · 已指派司机 张伟 配送', operator: supplierInfo.name },
        { time: dateTime(3, '09:30'), action: '出库交接完成 · 司机 张伟 领货', operator: supplierInfo.name },
        { time: dateTime(3, '12:40'), action: '到店交接完成 · 司机 张伟 已与门店交接', operator: '张伟' }
      ]
    },
    {
      id: 'SO-S018', customer: '石板溪农家乐·门店', items: [egg(15)], createdAt: dateTime(2, '10:10'),
      status: 'delivered', fulfillment: fulfillmentOf({
        status: 'received', shipType: 'driver', driverId: 'D002', driverName: '李强', deliverDate: dateOnly(2),
        handovers: [
          { id: 'H-S018-OUT', type: 'out', orderId: 'SO-S018', time: dateTime(2, '11:00'), operatorId: SUPPLIER_DEMO_ID, operatorName: supplierInfo.name, operatorRole: 'supplier', shortageCount: 0 },
          { id: 'H-S018-IN', type: 'in', orderId: 'SO-S018', time: dateTime(2, '15:20'), operatorId: 'D002', operatorName: '李强', operatorRole: 'driver' }
        ]
      }),
      flow: [
        ...acceptedFlow(dateTime(2, '10:10'), dateTime(2, '10:30')),
        { time: dateTime(2, '10:40'), action: '已发货 · 已指派司机 李强 配送', operator: supplierInfo.name },
        { time: dateTime(2, '11:00'), action: '出库交接完成 · 司机 李强 领货', operator: supplierInfo.name },
        { time: dateTime(2, '15:20'), action: '到店交接完成 · 司机 李强 已与门店交接', operator: '李强' }
      ]
    }
  ]
  return specs.map(toOrder)
}

const demoSupplierSettlements = [
  { id: 'SST-DEMO-S002-001', period: '2026-08', supplierIds: ['S002'], orderIds: ['SO-S006'], amount: 176, status: 'settled', createdAt: '2026-08-20 10:00', items: [{ supplierId: 'S002', supplierName: '湘西腊味合作社', orderIds: ['SO-S006'], amount: 176 }] },
  { id: 'SST-DEMO-S002-002', period: '2026-09', supplierIds: ['S002'], orderIds: ['SO-S001', 'SO-S003'], amount: 448.5, status: 'pending', createdAt: '2026-09-01 10:00', items: [{ supplierId: 'S002', supplierName: '湘西腊味合作社', orderIds: ['SO-S001', 'SO-S003'], amount: 448.5 }] }
]

/** 幂等种子：按 id 增量合并缺失的演示订单；司机存储为空或缺少演示司机时补全 */
export function seedSupplierDataOnce(): void {
  const published = readPlatformOrders() || {}
  seedOrders().forEach((order) => { if (!published[order.id]) writePlatformOrder(order) })
  const currentDrivers = readPlatformDrivers()
  if (!currentDrivers || currentDrivers.length === 0) {
    writePlatformDrivers(cloneSeed(demoDrivers))
  } else {
    const byId = new Set(currentDrivers.map((driver) => driver.id))
    const missingDrivers = demoDrivers.filter((driver) => !byId.has(driver.id))
    if (missingDrivers.length) writePlatformDrivers([...currentDrivers, ...cloneSeed(missingDrivers)])
  }
  const settlements = readPlatformSupplierSettlements() || {}
  demoSupplierSettlements.forEach((record) => { if (!settlements[record.id]) writePlatformSupplierSettlement(record) })
}

export function seedSupplierDemoRouteOnce(): boolean {
  const today = todayString()
  if (readDailyDeliveryRoutes('S002', 'D001').some((route) => route.deliveryDate === today && route.status === 'published')) return false
  const now = new Date().toISOString()
  const f001 = storeDirectory.F001
  const f002 = storeDirectory.F002
  return saveDailyDeliveryRoute({
    id: `DEMO-ROUTE-S002-D001-${today}`,
    supplierId: 'S002',
    driverId: 'D001',
    deliveryDate: today,
    status: 'published',
    stops: [
      { storeId: f001.storeId, storeName: f001.storeName, address: f001.address, longitude: f001.longitude, latitude: f001.latitude, orderIds: ['SO-S003', 'SO-S010'] }
    ],
    origin: { longitude: supplierInfo.longitude, latitude: supplierInfo.latitude },
    stopCount: 2,
    polyline: [
      { longitude: supplierInfo.longitude, latitude: supplierInfo.latitude },
      { longitude: f001.longitude!, latitude: f001.latitude! },
      { longitude: f002.longitude!, latitude: f002.latitude! }
    ],
    totalDistanceKm: 43.2,
    estimatedDurationMinutes: 70,
    sourceOrderIds: ['SO-S003', 'SO-S010'],
    provider: 'demo-seed',
    generatedAt: now,
    publishedAt: now
  }, readDailyDeliveryRouteState()?.revision ?? 0).ok
}
