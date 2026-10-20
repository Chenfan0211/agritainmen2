<template>
  <!-- 登录 -->
  <view v-if="!store.auth.isLoggedIn" class="login-page">
    <view class="login-card">
      <view class="pc-login-hero">
        <view class="pc-login-mark"><UiIcon name="package" :size="26" /></view>
        <text class="pc-login-brand">供应商配送工作台</text>
        <text class="pc-login-sub">供应链 · 供应商与司机双角色配送履约</text>
      </view>
      <view class="login-body">
      <view class="role-tabs" role="tablist">
        <button :class="{ active: loginRole === 'supplier' }" role="tab" :aria-selected="loginRole === 'supplier'" @click="switchLoginRole('supplier')">供应商</button>
        <button :class="{ active: loginRole === 'driver' }" role="tab" :aria-selected="loginRole === 'driver'" @click="switchLoginRole('driver')">司机</button>
      </view>
      <view class="login-fields">
        <label class="form-field"><text>账号</text><input v-model="loginAccount" placeholder="请输入账号" confirm-type="done" @confirm="submitLogin" /></label>
        <label class="form-field"><text>密码</text><input v-model="loginPassword" type="password" placeholder="请输入密码" confirm-type="done" @confirm="submitLogin" /></label>
      </view>
      <text v-if="store.error" class="form-error login-error">{{ store.error }}</text>
      <text v-else-if="store.loginError" class="form-error login-error">{{ store.loginError }}</text>
      <button v-if="store.error" class="outline-button login-button" :class="{ 'is-loading': store.loading }" :disabled="store.loading" @click="refreshSharedState">重新加载</button>
      <button v-else class="primary-button login-button" :class="{ 'is-loading': busy || store.loading }" :disabled="busy || !store.initialized || store.loading" @click="submitLogin">登 录</button>
      <text class="login-hint">{{ loginRole === 'supplier' ? '演示供应商：13787366688 / 13787366688（已自动填充）' : '演示司机：driver01 / 123456（已自动填充）' }}</text>
      </view>
    </view>
  </view>

  <!-- 工作区 -->
  <view v-else class="app-shell">
    <view v-if="store.loading" class="page-state pc-loading"><text>正在准备配送工作台...</text></view>
    <view v-else-if="store.error" class="page-state pc-error"><text>{{ store.error }}</text><button class="primary-button mini-button state-retry" @click="refreshSharedState">重新加载</button></view>

    <template v-else>
      <!-- 司机头部 -->
      <view v-if="store.auth.role === 'driver' && !driverRouteDetailId && !driverAuxView" class="hero driver-hero-panel">
        <view class="hero-top">
          <view class="hero-avatar"><UiIcon name="user-round" :size="22" /></view>
          <view class="driver-hero-identity"><text class="hero-title">{{ store.auth.name }}</text><view class="hero-sub">司机 · {{ store.auth.account }}</view><view class="driver-hero-warehouse"><UiIcon name="map-pin" :size="12" /><text>所属供应商 · {{ currentDriverWarehouse?.contact || '所属供应商待维护' }}</text></view></view>
          <button class="hero-logout logout-danger" @click="logout">退出</button>
        </view>
        <view class="hero-stats driver-hero-stats">
          <view class="hero-stat"><text class="hero-stat-label">今日线路</text><text class="hero-stat-value">{{ driverTodayRouteCount }}</text></view>
          <view class="hero-stat"><text class="hero-stat-label">已完成门店</text><text class="hero-stat-value">{{ driverCompletedStoreCount }}</text></view>
          <view class="hero-stat"><text class="hero-stat-label">待处理缺货</text><text class="hero-stat-value">{{ driverPendingShortageRouteCount }}</text></view>
        </view>
      </view>
      <!-- 供应商模块 -->
      <template v-if="store.auth.role === 'supplier'">
        <view v-if="active === 'orders' && !secondaryWorkspace" class="page-pad" data-visual-view="supplier-orders">
          <view class="hero-stats">
            <view class="hero-stat"><text class="hero-stat-label">今日门店</text><text class="hero-stat-value">{{ store.todayFarmhouseQuantities.storeCount }}</text></view>
            <view class="hero-stat"><text class="hero-stat-label">今日件数</text><text class="hero-stat-value">{{ store.todayFarmhouseQuantities.itemCount }}</text></view>
            <view class="hero-stat"><text class="hero-stat-label">待发货件</text><text class="hero-stat-value">{{ store.todayFarmhouseQuantities.pendingShipItemCount }}</text></view>
            <view class="hero-stat"><text class="hero-stat-label">缺货件数</text><text class="hero-stat-value">{{ store.todayFarmhouseQuantities.shortageItemCount }}</text></view>
            <view class="hero-stat"><text class="hero-stat-label">配送中件</text><text class="hero-stat-value">{{ store.todayFarmhouseQuantities.deliveringItemCount }}</text></view>
          </view>
          <scroll-view class="order-filter-scroll" scroll-x>
            <view class="chips scroll-x">
              <button v-for="item in orderFilters" :key="item.key" class="chip" :class="{ active: orderFilter === item.key }" @click="orderFilter = item.key">{{ item.label }}<text class="chip-count" data-typography-compact>{{ item.count }}</text></button>
            </view>
          </scroll-view>
          <view class="search-bar"><UiIcon name="search" :size="16" /><input v-model="orderKeyword" placeholder="搜索单号 / 门店" confirm-type="search" /></view>
          <button v-if="selectedOrderIds.length" class="primary-button section-action" :class="{ 'is-loading': busyAction === 'batch-accept' }" :disabled="busyAction === 'batch-accept'" @click="batchAccept">批量接单（{{ selectedOrderIds.length }}）</button>
          <view v-if="filteredOrders.length" class="content-stack">
            <view v-for="order in filteredOrders" :key="order.id" class="list-card">
              <view class="row" @click="openOrder(order)">
                <view v-if="orderFilter === 'submitted'" class="order-check" @click.stop="toggleSelect(order.id)">
                  <view :class="{ checked: selectedOrderIds.includes(order.id) }"><UiIcon v-if="selectedOrderIds.includes(order.id)" name="check" :size="13" /></view>
                </view>
                <view class="row-main">
                  <view class="row-top">
                    <text class="order-no">{{ order.id }}</text>
                    <span class="badge" :class="orderFulfillment(order).status">{{ statusText(orderFulfillment(order).status, order) }}</span>
                    <span v-if="orderShortage(order).length" class="tag danger">缺货 {{ orderShortage(order).length }}</span>
                  </view>
                  <text class="muted">{{ isCourierOrder(order) ? `${courierSourceLabel(order)} · ${recipientLabel(order)}` : order.customer }} · {{ order.items?.length || 1 }} 项 · 共 {{ order.quantity }} 件</text>
                  <text class="muted">{{ order.createdAt }}{{ orderFulfillment(order).driverName ? ` · 司机 ${orderFulfillment(order).driverName}` : orderFulfillment(order).trackingNo ? ` · 运单 ${orderFulfillment(order).trackingNo}` : '' }}{{ orderFulfillment(order).deliverDate ? ` · 配送 ${orderFulfillment(order).deliverDate}` : '' }}</text>
                  <text v-if="routeStatusText(order)" class="route-status-hint">{{ routeStatusText(order) }}</text>
                  <text class="order-amount">{{ money(order.amount) }}</text>
                </view>
                <UiIcon name="chevron-right" :size="16" />
              </view>
              <view v-if="orderActions(order).length" class="order-actions">
                <button v-for="action in orderActions(order)" :key="action.key" class="outline-button mini-button" :class="{ 'is-loading': busyAction === action.key, 'primary-button': action.primary }" :disabled="busyAction === action.key" @click="runAction(action.key, order)">{{ action.label }}</button>
              </view>
            </view>
          </view>
          <view v-else class="empty-state pc-empty"><view class="pc-state-icon"><UiIcon name="search" :size="26" /></view><text>没有符合条件的配送订单</text></view>
        </view>

        <view v-else-if="active === 'mine' && !secondaryWorkspace" class="page-pad mine-page" data-visual-view="supplier-mine">
          <view class="pc-hero mine-hero">
            <span class="pc-hero-badge"><UiIcon name="store" :size="15" />供应商工作台</span>
            <text class="pc-hero-name">{{ store.currentSupplier?.name || store.auth.name || supplierInfo.name }}</text>
            <small class="pc-hero-uid meta">{{ store.currentSupplier?.region || supplierInfo.region }} · {{ store.currentSupplier?.category || supplierInfo.category }}</small>
            <view class="pc-hero-data"><view><small class="pc-hero-label meta">供应商编号</small><strong class="pc-hero-value val">{{ store.auth.supplierId || '—' }}</strong></view><view><small class="pc-hero-label meta">登录账号</small><strong class="pc-hero-value val">{{ store.auth.account }}</strong></view></view>
          </view>
          <view class="section-title">业务工作区</view>
        <view class="pc-tile-grid mine-tile-grid">
          <button v-for="(item, index) in supplierWorkItems" :key="item.key" class="work-link pc-tile" :class="'pc-tile--' + ['green','amber','blue','purple','coral','teal'][index % 6]" data-typography-compact @click="openSecondaryWorkspace(item.key)">
            <view class="pc-tile-icon"><UiIcon :name="item.icon" :size="26" /></view><text class="pc-tile-label">{{ item.label }}</text>
          </button>
        </view>
        <view class="mine-actions">
          <button class="outline-button" @click="askResetDemo">重置演示数据</button>
          <button class="hero-logout logout-danger" @click="logout">退出</button>
        </view>
        </view>

        <view v-else-if="secondaryWorkspace === 'drivers'" class="page-pad secondary-workspace" data-visual-view="workspace-drivers">
          <view class="secondary-head"><button class="page-back" aria-label="返回" @click="closeSecondaryWorkspace"><UiIcon name="arrow-left" :size="20" /></button><text>司机管理</text></view>
          <view class="secondary-body">
          <view class="chips">
            <button v-for="item in driverStatusFilters" :key="item" class="chip" :class="{ active: driverStatusFilter === item }" @click="driverStatusFilter = item">{{ item }}</button>
          </view>
          <view class="search-bar"><UiIcon name="search" :size="16" /><input v-model="driverSearch" placeholder="搜索姓名 / 账号 / 手机" confirm-type="search" /></view>
          <view v-if="filteredDrivers.length" class="content-stack">
            <view v-for="driver in filteredDrivers" :key="driver.id" class="list-card">
              <view class="row driver-row">
                <view class="driver-avatar"><UiIcon name="user-round" :size="20" /></view>
                <view class="row-main">
                  <view class="row-top"><text class="driver-name">{{ driver.name }}</text><span class="badge" :class="driver.status">{{ driver.status === 'active' ? '启用' : '停用' }}</span></view>
                  <text class="muted">{{ driver.account }} · {{ driver.phone }}</text>
                  <text class="muted">创建于 {{ driver.createdAt }} · 进行中任务 {{ store.driverTaskCounts[driver.id] || 0 }}</text>
                  <text class="muted">{{ namedRouteLabelForDriver(driver.id) }}</text>
                </view>
              </view>
              <view class="driver-actions">
                <button class="outline-button mini-button" @click="openDriverEdit(driver)">编辑</button>
                <button class="outline-button mini-button" @click="openReset(driver)">重置密码</button>
                <button class="outline-button mini-button" :class="{ danger: driver.status === 'active' }" @click="askToggle(driver)">{{ driver.status === 'active' ? '停用' : '启用' }}</button>
              </view>
            </view>
          </view>
          <view v-else class="empty-state pc-empty"><view class="pc-state-icon"><UiIcon name="users" :size="26" /></view><text>暂无司机账号，点击「新增司机」开通</text></view>
          </view>
          <view class="secondary-foot"><button class="primary-button section-action" @click="openDriverForm">新增司机</button></view>
        </view>

        <view v-else-if="secondaryWorkspace === 'outbound'" class="page-pad secondary-workspace handover-shared-page" data-visual-view="workspace-outbound">
          <view class="secondary-head">
            <button class="page-back" aria-label="返回" @click="selectedOutboundRoute ? closeOutboundRoute() : closeSecondaryWorkspace()"><UiIcon name="arrow-left" :size="20" /></button>
            <text>{{ selectedOutboundRoute ? '出仓交接单' : '出仓交接' }}</text>
          </view>
          <view v-if="!selectedOutboundRoute" class="secondary-body">
            <view class="form-fields outbound-date-field"><label class="form-field"><text>配送日期</text><input v-model="outboundDate" type="date" /></label></view>
            <view v-if="supplierOutboundRoutes.length" class="content-stack">
              <button v-for="route in supplierOutboundRoutes" :key="route.id" class="list-card outbound-route-card" @click="openOutboundRoute(route)">
                <view class="row-top"><text class="driver-name">{{ driverRouteName(route) }} · {{ routeDriverName(route) }} · {{ route.deliveryDate }}</text><span class="badge" :class="route.outboundHandover?.status">{{ outboundStatusText(route) }}</span></view>
                <view class="outbound-route-metrics"><text>{{ route.stopCount || route.stops.length }} 家门店</text><text>{{ routeGoodsQuantity(route) }} 件</text><text>{{ routeGoodsKinds(route) }} 种</text></view>
                <text class="muted">{{ route.outboundHandover ? `司机实发 ${route.outboundHandover.items.reduce((sum, item) => sum + item.driverActual, 0)} 件` : '司机尚未发起交接' }}</text>
              </button>
            </view>
            <view v-else class="empty-state pc-empty"><view class="pc-state-icon"><UiIcon name="package-check" :size="26" /></view><text>该配送日暂无线路</text></view>
          </view>
          <template v-else>
            <view class="secondary-body">
              <view class="outbound-summary-card driver-section-card">
                <view class="row-top"><text class="driver-name">{{ driverRouteName(selectedOutboundRoute) }}</text><span class="badge" :class="selectedOutboundRoute.outboundHandover?.status">{{ outboundStatusText(selectedOutboundRoute) }}</span></view>
                <view class="outbound-route-metrics"><text>配送日 {{ selectedOutboundRoute.deliveryDate }}</text><text>{{ selectedOutboundRoute.stopCount || selectedOutboundRoute.stops.length }} 家门店</text><text>{{ routeGoodsQuantity(selectedOutboundRoute) }} 件 · {{ routeGoodsKinds(selectedOutboundRoute) }} 种</text></view>
              </view>
              <view v-if="selectedOutboundRoute.outboundHandover?.rejectionReason" class="handover-rejection"><text>司机上交版本已驳回</text><text class="handover-result-sub">{{ selectedOutboundRoute.outboundHandover.rejectionReason }}</text></view>
              <view class="search-bar outbound-search"><UiIcon name="search" :size="16" /><input v-model="outboundKeyword" placeholder="搜索商品名称 / 规格" /></view>
              <label class="checkbox-field outbound-difference-toggle"><checkbox :checked="outboundShowDifferences" @click="outboundShowDifferences = !outboundShowDifferences" /><text>只看差异商品</text></label>
              <view class="section-title">商品明细 <span class="section-sub">图片 / 规格 / 应发数量</span></view>
              <view class="outbound-item-list">
                <view v-for="item in filteredSelectedOutboundItems" :key="item.skuId" class="outbound-item-card" data-visual-state="supplier-outbound-item">
                  <BusinessImage class="outbound-item-image" :src="item.image" mode="aspectFill" />
                  <view class="row-main">
                    <text class="outbound-item-name">{{ item.name }}</text>
                    <text class="muted">规格 {{ item.skuName || '规格待维护' }}</text>
                    <view class="outbound-quantity-grid"><view><small class="meta">应发</small><strong class="val">{{ item.expected }}</strong></view><view><small class="meta">仓数</small><strong class="val">{{ item.warehouseQuantity ?? '—' }}</strong></view><view><small class="meta">实发</small><strong class="val">{{ selectedOutboundRoute.outboundHandover?.status === 'pending_supplier' ? outboundActuals[item.skuId] : outboundItemActual(item) }}</strong></view><view :class="{ danger: item.expected !== outboundItemActual(item) }"><small class="meta">差异</small><strong class="val">{{ item.expected - outboundItemActual(item) }}</strong></view></view>
                    <label v-if="selectedOutboundRoute.outboundHandover?.status === 'pending_supplier'" class="outbound-inline-edit"><text>供应商实发</text><input v-model.number="outboundActuals[item.skuId]" type="number" min="0" :max="item.expected" /></label><button class="outbound-store-toggle" @click="toggleOutboundItem(item.skuId)">{{ isOutboundItemExpanded(item.skuId) ? '收起门店明细' : '门店明细' }}<UiIcon :name="isOutboundItemExpanded(item.skuId) ? 'chevron-left' : 'chevron-right'" :size="13" /></button><view v-if="isOutboundItemExpanded(item.skuId)" class="outbound-store-breakdown"><view v-for="stop in driverItemStores(selectedOutboundRoute, item)" :key="stop.storeId"><view class="row-top"><text>{{ stop.storeName }}</text><span class="tag">应发 {{ outboundItemStoreExpected(selectedOutboundRoute, item, stop) }}</span></view><text class="muted">实发 {{ outboundItemStoreActualText(selectedOutboundRoute, item, stop) }}</text><text v-if="outboundItemStoreNote(selectedOutboundRoute, item, stop)" class="danger">缺货备注：{{ outboundItemStoreNote(selectedOutboundRoute, item, stop) }}</text></view></view>
                  </view>
                </view>
              </view>
              <view class="outbound-totals"><text>应发 {{ selectedOutboundItems.reduce((sum, item) => sum + item.expected, 0) }} 件</text><text>实发 {{ selectedOutboundItems.reduce((sum, item) => sum + outboundItemActual(item), 0) }} 件</text><text class="danger">差异 {{ selectedOutboundItems.reduce((sum, item) => sum + item.expected - outboundItemActual(item), 0) }} 件</text></view>
              <view class="section-title">凭证照片</view>
              <view v-if="selectedOutboundRoute.outboundHandover?.proofImages?.length" class="proof-image-grid"><BusinessImage v-for="image in selectedOutboundRoute.outboundHandover.proofImages" :key="image" class="proof-image" :src="image" mode="aspectFill" /></view>
              <text v-else class="muted">历史交接单未上传凭证</text>
              <label class="form-field note-field"><text>审核备注（可选）</text><input v-model="outboundNote" :disabled="selectedOutboundRoute.outboundHandover?.status !== 'pending_supplier'" placeholder="审核备注" /></label>
              <view v-if="selectedOutboundRoute.outboundHandover?.reviewHistory?.length" class="review-history"><text class="section-title">审核记录</text><view v-for="(review, index) in selectedOutboundRoute.outboundHandover.reviewHistory" :key="index" class="muted">{{ review.action === 'confirmed' ? '确认' : '驳回' }} · {{ review.operatorName }} · {{ review.at.replace('T', ' ').slice(0, 16) }}{{ review.note ? ` · ${review.note}` : '' }}</view></view>
              <view v-if="supplierRejectMode" class="reject-editor"><label class="form-field"><text>驳回原因</text><input v-model="supplierRejectionReason" placeholder="请填写司机需要修改的内容" /></label><view class="sheet-actions"><button class="danger-button" :class="{ 'is-loading': busyAction === 'reject-outbound' }" :disabled="busyAction === 'reject-outbound'" @click="rejectSupplierOutbound(selectedOutboundRoute)">确认驳回</button><button class="outline-button" @click="supplierRejectMode = false">取消</button></view></view>
            </view>
            <view v-if="selectedOutboundRoute.outboundHandover?.status === 'pending_supplier'" class="secondary-foot sheet-actions"><button class="outline-button" @click="supplierRejectMode = true">驳回修改</button><button class="primary-button" :class="{ 'is-loading': busyAction === 'review-outbound' }" :disabled="busyAction === 'review-outbound'" @click="reviewSupplierOutbound(selectedOutboundRoute)">修改并确认交接单</button></view>
          </template>
        </view>

        <view v-else-if="secondaryWorkspace === 'settlements'" class="page-pad secondary-workspace" data-visual-view="workspace-settlements">
          <view class="secondary-head"><button class="page-back" aria-label="返回" @click="closeSecondaryWorkspace"><UiIcon name="arrow-left" :size="20" /></button><text>结算账单</text></view>
          <view class="secondary-body">
          <view v-if="store.mySettlements.length" class="content-stack">
            <view v-for="item in store.mySettlements" :key="item.id" class="list-card">
              <view class="row">
                <view class="row-main">
                  <view class="row-top"><text class="order-no">{{ item.id }}</text><span class="badge">{{ item.status || 'pending' }}</span></view>
                  <text class="muted">周期 {{ item.period }} · 关联订单 {{ item.orderIds.length }} 单</text>
                  <text class="order-amount">{{ money(item.amount) }}</text>
                </view>
              </view>
            </view>
          </view>
          <view v-else class="empty-state pc-empty"><view class="pc-state-icon"><UiIcon name="package-check" :size="26" /></view><text>暂无结算账单</text></view>
          </view>
        </view>

        <view v-else-if="secondaryWorkspace === 'handovers'" class="page-pad secondary-workspace" data-visual-view="workspace-handovers">
          <view class="secondary-head"><button class="page-back" aria-label="返回" @click="closeSecondaryWorkspace"><UiIcon name="arrow-left" :size="20" /></button><text>交接日志</text></view>
          <view class="secondary-body">
          <view class="chips">
            <button v-for="item in handoverTypeFilters" :key="item" class="chip" :class="{ active: handoverFilter === item }" @click="handoverFilter = item">{{ item }}</button>
          </view>
          <view class="chips scroll-x filter-row">
            <button v-for="item in handoverDriverFilters" :key="item" class="chip" :class="{ active: handoverDriverFilter === item }" @click="handoverDriverFilter = item">{{ item }}</button>
          </view>
          <view v-if="filteredHandovers.length" class="content-stack">
            <view v-for="log in filteredHandovers" :key="log.id" class="list-card">
              <view class="row">
                <view class="row-main">
                  <view class="row-top"><text class="order-no">{{ log.orderId }}</text><span class="tag" :class="log.type">{{ log.type === 'out' ? '出库交接' : '到店交接' }}</span></view>
                  <text class="muted">{{ log.customer }} · {{ log.time }}</text>
                  <text class="muted">操作人：{{ log.operatorName }}（{{ log.operatorRole === 'driver' ? '司机' : '供应商' }}）{{ log.shortageCount ? ` · 缺货 ${log.shortageCount} 项` : '' }}{{ log.note ? ` · ${log.note}` : '' }}</text>
                  <text v-if="handoverCheckInText(log.orderId)" class="muted">{{ handoverCheckInText(log.orderId) }}</text>
                </view>
              </view>
            </view>
          </view>
          <view v-else class="empty-state pc-empty"><view class="pc-state-icon"><UiIcon name="list-tree" :size="26" /></view><text>暂无交接日志</text></view>
          </view>
        </view>

        <view v-else-if="secondaryWorkspace === 'routes'" class="page-pad secondary-workspace" data-visual-view="workspace-routes">
          <view class="secondary-head"><button class="page-back" aria-label="返回" @click="closeNamedRouteEditor"><UiIcon name="arrow-left" :size="20" /></button><text>{{ namedRouteDraft ? (namedRouteDraft.id ? '编辑线路' : '新建线路') : '线路规划' }}</text></view>
          <view class="secondary-body">
          <template v-if="!namedRouteDraft">
            <view class="route-controls">
              <view class="route-section-intro"><view><text class="eyebrow">配送配置</text><text class="route-section-title">命名线路</text><text class="muted">先固定门店顺序，再为指定日期发布配送任务</text></view><button class="outline-button" :class="{ 'is-loading': routeBusy }" :disabled="routeBusy" @click="generateTodayRoutes">按今天补生成</button></view>
            </view>
            <view v-if="supplierNamedRoutes.length" class="content-stack">
              <view v-for="route in supplierNamedRoutes" :key="route.id" class="list-card route-template-card">
                <view class="row-top"><view class="route-template-heading"><text class="order-no">{{ route.name }}</text><span class="tag" :class="routePublishedStatus(route.id) === '已发布' ? 'out' : ''">{{ routePublishedStatus(route.id) }}</span></view><button class="outline-button mini-button" @click="openNamedRouteEditor(route)">规划</button></view>
                <text class="route-template-path">{{ route.storeIds.map((id) => storeDirectory[id]?.storeName || id).join(' → ') || '尚未挂门店' }}</text>
                <text class="muted">{{ route.storeIds.length }} 家门店 · 线路司机 {{ namedRouteDriverName(route.driverId) }}</text>
              </view>
            </view>
            <view v-else class="empty-state pc-empty"><view class="pc-state-icon"><UiIcon name="navigation" :size="26" /></view><text>还没有命名线路，先新建东线 / 西线</text></view>
          </template>
          <view v-else class="named-route-form">
            <view class="route-plan-editor">
            <view class="route-workbench-status"><view><text class="eyebrow">线路模板编辑</text><text class="route-section-title">{{ namedRouteDraft.name || '未命名线路' }}</text><text class="muted">{{ namedRouteDraft.storeIds.length }} 家门店 · 可拖动顺序后重新预览</text></view><span class="tag" :class="store.routeDraft && store.routeDraft.id === routePreviewId ? 'out' : 'warning-tag'">{{ store.routeDraft && store.routeDraft.id === routePreviewId ? '预览就绪' : '待生成预览' }}</span></view>
            <label class="form-field"><text>线路名称</text><input v-model="namedRouteDraft.name" placeholder="如：东线" /></label>
            <view class="form-field"><text>线路司机</text><picker mode="selector" :range="namedRouteDriverLabels" @change="setRoutePlanDriver($event)"><view class="picker-field">{{ namedRouteDriverName(routePlanDriverId || namedRouteDraft.driverId) }}</view></picker></view>
            <label class="form-field"><text>配送日期</text><input v-model="routePlanDate" class="route-date" type="date" /></label>
            <view class="form-field"><text>添加门店</text><view class="chips"><button v-for="destination in storeOptions" :key="destination.storeId" class="chip" :class="{ active: namedRouteDraft.storeIds.includes(destination.storeId) }" @click="toggleNamedRouteStore(destination.storeId)">{{ destination.storeName }}</button></view></view>
            <view v-for="(storeId, index) in namedRouteDraft.storeIds" :key="storeId" class="list-card route-stop">
              <view class="route-number">{{ index + 1 }}</view>
              <view class="row-main"><text>{{ storeDirectory[storeId]?.storeName || storeId }}</text><text class="muted">{{ storeDirectory[storeId]?.address }}</text></view>
              <view class="route-actions"><button class="icon-button route-order-button" aria-label="上移" title="上移" :disabled="index === 0" @click="moveNamedRouteStore(index, -1)"><UiIcon name="chevron-left" :size="16" /></button><button class="icon-button route-order-button" aria-label="下移" title="下移" :disabled="index === namedRouteDraft.storeIds.length - 1" @click="moveNamedRouteStore(index, 1)"><UiIcon name="chevron-right" :size="16" /></button></view>
            </view>
            </view>
            <view class="route-planning-map">
              <view class="route-plan-actions"><button class="outline-button" :class="{ 'is-loading': routePreviewBusy }" :disabled="routePreviewBusy || !namedRouteDraft.id || !routePlanDriverId" @click="previewNamedRoute"><UiIcon name="navigation" :size="16" />生成路线预览</button><text v-if="!namedRouteDraft.id" class="muted">请先保存线路模板，再生成配送预览</text><text v-else-if="!routePreviewId" class="route-status-hint warning-text">修改线路后请重新生成预览</text></view>
              <view v-if="store.routeDraft && store.routeDraft.id === routePreviewId" class="route-preview">
                <view class="stat-grid route-metrics"><view><strong class="val">{{ store.routeDraft.stops.length }}</strong><small class="meta">门店</small></view><view><strong class="val">{{ store.routeDraft.totalDistanceKm.toFixed(1) }} km</strong><small class="meta">总距离</small></view><view><strong class="val">{{ store.routeDraft.estimatedDurationMinutes }} 分钟</strong><small class="meta">预计时长</small></view></view>
                <view class="route-provider"><span class="tag">{{ routeProviderLabel(store.routeDraft.provider) }}</span><text class="muted">{{ store.routeDraft.sourceOrderIds.length }} 单待配送</text></view>
                <view v-if="store.routeDraft.warnings?.length" class="route-warnings"><text v-for="warning in store.routeDraft.warnings" :key="warning">{{ routeOptimizationWarningText(warning) }}</text></view>
                <DeliveryRouteMap :origin="store.routeDraft.origin" :stops="store.routeDraft.stops" :polyline="store.routeDraft.polyline" :selected-stop-id="selectedRouteStopId" :stop-count="store.routeDraft.stops.length" :total-distance-km="store.routeDraft.totalDistanceKm" :estimated-duration-minutes="store.routeDraft.estimatedDurationMinutes" @select-stop="selectRouteStop" />
                <view v-for="(stop, index) in store.routeDraft.stops" :key="stop.storeId" class="list-card route-stop" :class="{ 'route-stop-selected': selectedRouteStopId === stop.storeId }" @click="selectRouteStop(stop.storeId)">
                  <view class="route-number">{{ index + 1 }}</view><view class="row-main"><text>{{ stop.storeName }}</text><text class="muted">{{ stop.address }}</text><text class="muted">{{ stop.orderIds.length }} 单 · {{ stopItemCount(stop) }} 件</text></view>
                  <view class="route-actions"><button class="icon-button route-order-button" aria-label="上移" :disabled="index === 0" @click.stop="movePreviewStop(index, -1)">上移</button><button class="icon-button route-order-button" aria-label="下移" :disabled="index === store.routeDraft.stops.length - 1" @click.stop="movePreviewStop(index, 1)">下移</button></view>
                </view>
                <view v-if="selectedRouteStop" class="route-stop-detail"><text class="order-no">{{ selectedRouteStop.storeName }}</text><text class="muted">{{ selectedRouteStop.address }} · {{ selectedRouteStop.orderIds.length }} 单</text></view>
              </view>
            </view>
          </view>
          </view>
          <view class="secondary-foot route-bottom-actions"><template v-if="namedRouteDraft"><text class="muted route-bottom-hint">发布前请确认司机、日期和门店顺序</text><button class="outline-button route-publish" :class="{ 'is-loading': busyAction === 'save-route' }" :disabled="busyAction === 'save-route'" @click="saveNamedRouteDraft">保存线路模板</button><button class="primary-button route-publish" :class="{ 'is-loading': routePublishing }" :disabled="!store.routeDraft || store.routeDraft.id !== routePreviewId || routePublishing" @click="publishNamedRoute">发布配送线路</button></template><button v-else class="primary-button section-action" @click="openNamedRouteEditor()">新建线路</button></view>
        </view>

        <view v-else-if="secondaryWorkspace === 'warehouse'" class="page-pad secondary-workspace" data-visual-view="workspace-warehouse">
          <view class="secondary-head"><button class="page-back" aria-label="返回" @click="closeSecondaryWorkspace"><UiIcon name="arrow-left" :size="20" /></button><text>仓点设置</text></view>
          <view class="secondary-body">
          <view class="form-fields"><label class="form-field"><text>仓点地址</text><input v-model="warehouseForm.address" placeholder="请输入完整地址" /></label><label class="form-field"><text>仓点联系人</text><input v-model="warehouseForm.contactName" placeholder="如 王仓管" /></label><label class="form-field"><text>联系人手机号</text><input v-model="warehouseForm.contactPhone" maxlength="11" placeholder="请输入11位手机号" /></label></view>
          </view>
          <view class="secondary-foot"><button class="primary-button route-publish" :class="{ 'is-loading': busyAction === 'warehouse' }" :disabled="busyAction === 'warehouse'" @click="saveWarehouse">保存仓点</button></view>
        </view>
      </template>
      <!-- 司机模块 -->
      <template v-else>
        <view v-if="driverAuxView" class="page-pad secondary-workspace driver-aux-page driver-role-page">
          <view class="secondary-head"><button class="page-back" aria-label="返回" @click="closeDriverAux"><UiIcon name="arrow-left" :size="20" /></button><text>{{ driverAuxView === 'data' ? driverDataTitle : '交接记录' }}</text></view>
           <view v-if="driverAuxView === 'data'" class="secondary-body" data-visual-view="driver-data">
             <view class="driver-data-filters">
               <label class="form-field driver-data-date-field"><text>配送日期</text><view class="driver-data-date-control"><picker class="driver-data-date-picker" mode="date" :value="driverDataDate || todayString()" @change="setDriverDataDate"><view class="picker-field">{{ driverDataDate || '全部日期' }}</view></picker><button class="outline-button mini-button driver-data-date-clear" @click="driverDataDate = ''">全部日期</button></view></label>
               <view class="search-bar driver-data-search"><UiIcon name="search" :size="16" /><input v-model="driverDataKeyword" placeholder="搜索线路 / 门店 / 订单 / 状态" confirm-type="search" /></view>
             </view>
             <view class="driver-data-summary"><view><small class="meta">线路数量</small><strong class="val">{{ driverDeliverySummary.routeCount }}</strong></view><view><small class="meta">配送门店</small><strong class="val">{{ driverDeliverySummary.storeCount }}</strong></view><view><small class="meta">配送件数</small><strong class="val">{{ driverDeliverySummary.itemCount }}</strong></view><view><small class="meta">缺货件数</small><strong class="val">{{ driverDeliverySummary.shortageCount }}</strong></view><view><small class="meta">线路完成率</small><strong class="val">{{ driverDeliverySummary.completionRate }}%</strong></view></view>
             <view class="section-title">配送线路<text class="section-sub">{{ filteredDriverDataRoutes.length }} 条线路 · {{ driverDeliveryGroups.length }} 个配送日</text></view>
             <view v-if="filteredDriverDataRoutes.length" class="content-stack"><view v-for="group in driverDeliveryGroups" :key="group.date" class="driver-data-group"><view class="driver-data-date">{{ group.date }}</view><view v-for="route in group.routes" :key="route.id" class="driver-data-route driver-section-card" @click="openDriverRoute(route)"><view class="row-top"><text>{{ driverRouteName(route) }}</text><span class="badge" :class="driverRouteStage(route)">{{ driverRouteStageText(route) }}</span></view><view class="driver-history-meta"><text>{{ route.stops.length }} 家门店</text><text>{{ routeGoodsQuantity(route) }} 件</text><text>{{ routeGoodsKinds(route) }} 种</text><text>{{ route.totalDistanceKm.toFixed(1) }} km</text></view></view></view></view>
             <view v-else class="empty-state pc-empty"><text>{{ driverDataEmptyText }}</text></view>
           </view>
           <view v-else class="secondary-body" data-visual-view="driver-handovers">
             <view class="search-bar driver-handover-search"><UiIcon name="search" :size="16" /><input v-model="handoverKeyword" placeholder="搜索订单号 / 门店 / 司机 / 备注" confirm-type="search" /></view>
             <view class="section-title">交接记录<text class="section-sub">{{ filteredMyHandovers.length }}/{{ store.myHandovers.length }} 条</text></view>
             <view v-if="filteredMyHandovers.length" class="content-stack"><view v-for="log in filteredMyHandovers" :key="log.id" class="driver-handover-card driver-section-card"><view class="row-top driver-handover-head"><view><text class="driver-history-order">{{ log.orderId }}</text><text class="driver-handover-customer">{{ log.customer }}</text></view><span class="tag" :class="log.type">{{ log.type === 'out' ? '出仓交接' : '到店交接' }}</span></view><view class="driver-handover-meta"><text>{{ log.operatorRole === 'driver' ? '司机' : '供应商' }} · {{ log.operatorName }}</text><text>{{ log.time.replace('T', ' ').slice(0, 16) }}</text><text v-if="log.shortageCount">缺货 {{ log.shortageCount }} 项</text></view><text v-if="log.note" class="driver-handover-note">{{ log.note }}</text></view></view>
             <view v-else class="empty-state pc-empty"><text>{{ handoverKeyword.trim() ? '没有符合条件的交接记录' : '暂无交接记录' }}</text></view>
           </view>
          </view>

        <view v-else-if="driverRouteDetailId && selectedDriverRoute" class="page-pad secondary-workspace driver-route-page driver-role-page" data-visual-view="driver-route-detail">
          <view class="secondary-head"><button class="page-back" aria-label="返回" @click="driverStoreDetailId ? closeDriverStore() : driverOutboundView ? closeDriverOutbound() : driverWarehouseView ? closeDriverWarehouse() : driverShortageView ? closeDriverShortage() : closeDriverRoute()"><UiIcon name="arrow-left" :size="20" /></button><text>{{ driverWarehouseView ? '到仓打卡' : driverShortageView ? '门店缺货标记' : driverOutboundView ? '出仓交接' : driverStoreDetailId ? '门店商品' : '线路详情' }}</text></view>

          <template v-if="driverWarehouseView">
            <view class="secondary-body">
              <view class="outbound-summary-card"><view class="row-top"><text class="driver-name">{{ warehouseName(selectedDriverRoute) }}</text><span class="badge" :class="warehouseCheckInBadgeClass(selectedDriverRoute)">{{ warehouseCheckInStatusText(selectedDriverRoute) }}</span></view><text class="muted">{{ warehouseAddress(selectedDriverRoute) }}</text><text class="muted">{{ selectedDriverRoute.deliveryDate }} · {{ driverRouteName(selectedDriverRoute) }}</text><text v-if="selectedDriverRoute.warehouseCheckIn" class="muted">{{ warehouseCheckInLabel(selectedDriverRoute) }}</text></view>
              <view v-if="selectedDriverRoute.warehouseCheckIn && isAbnormalWarehouseCheckIn(selectedDriverRoute)" class="handover-rejection"><text>异常打卡已生效</text><text class="handover-result-sub">{{ warehouseReasonLabel(selectedDriverRoute.warehouseCheckIn.reasonCode) }}{{ selectedDriverRoute.warehouseCheckIn.reasonNote ? ' · ' + selectedDriverRoute.warehouseCheckIn.reasonNote : '' }}</text></view>
              <view v-else class="warehouse-checkin-card driver-section-card"><view class="warehouse-distance-ring" :class="{ 'in-range': warehouseDistanceM !== null && warehouseDistanceM <= 1000 }"><text>距仓库</text><strong class="val">{{ warehouseDistanceM === null ? '--' : warehouseDistanceM }}</strong><small class="meta">{{ warehouseDistanceM === null ? '位置待获取' : '米' }}</small></view><text class="warehouse-checkin-tip">{{ selectedDriverRoute.warehouseCheckIn ? '本线路已完成到仓打卡' : '进入 1000 米范围后可打卡' }}</text><text v-if="warehouseLocationError" class="form-error">{{ warehouseLocationError }}</text><button class="primary-button warehouse-checkin-action" :class="{ 'is-loading': busyAction === 'warehouse-checkin' }" :disabled="busyAction === 'warehouse-checkin' || !!selectedDriverRoute.warehouseCheckIn || warehouseDistanceM === null || warehouseDistanceM > 1000" @click="checkInWarehouse(selectedDriverRoute)">{{ selectedDriverRoute.warehouseCheckIn ? '已完成打卡' : '立即打卡' }}</button><button v-if="!selectedDriverRoute.warehouseCheckIn" class="outline-button" @click="warehouseAbnormalMode = !warehouseAbnormalMode">异常打卡</button><button class="outline-button" @click="refreshWarehouseDistance(selectedDriverRoute)">重新定位</button></view>
              <view v-if="warehouseAbnormalMode && !selectedDriverRoute.warehouseCheckIn" class="warehouse-abnormal-form"><text class="section-title">异常打卡原因</text><view class="warehouse-reason-options"><button v-for="item in warehouseAbnormalOptions" :key="item.value" class="chip" :class="{ active: warehouseAbnormalReason === item.value }" @click="warehouseAbnormalReason = item.value">{{ item.label }}</button></view><label class="form-field"><text>补充说明{{ warehouseAbnormalReason === 'other' ? '（必填）' : '（可选）' }}</text><input v-model="warehouseAbnormalNote" placeholder="请输入异常原因" /></label><button class="danger-button" :class="{ 'is-loading': busyAction === 'warehouse-abnormal-checkin' }" :disabled="busyAction === 'warehouse-abnormal-checkin'" @click="submitAbnormalWarehouseCheckIn(selectedDriverRoute)">确认异常打卡</button></view>
              <view class="section-title">打卡记录 <span class="section-sub">最近 {{ driverWarehouseHistory.length }} 次</span></view>
              <view v-if="driverWarehouseHistory.length" class="warehouse-history-timeline"><view v-for="item in driverWarehouseHistory" :key="item.id" class="warehouse-history-item"><view class="warehouse-history-dot"></view><view class="warehouse-history-content"><view class="row-top"><text class="order-no">{{ warehouseName(item) }}</text><span class="badge" :class="item.warehouseCheckIn?.type === 'abnormal' ? 'rejected' : ''">{{ item.warehouseCheckIn?.type === 'abnormal' ? '异常打卡' : `距 ${item.warehouseCheckIn?.distanceM} 米` }}</span></view><text class="muted">{{ item.deliveryDate }} · {{ item.warehouseCheckIn?.at.replace('T', ' ').slice(0, 16) }}</text></view></view></view>
              <view v-else class="empty-state compact-empty pc-empty"><text>暂无到仓打卡记录</text></view>
            </view>
          </template>

          <template v-else-if="driverShortageView">
            <view class="secondary-body">
              <view class="outbound-summary-card"><view class="row-top"><text class="driver-name">{{ driverRouteName(selectedDriverRoute) }}</text><span class="badge danger">待标记缺货</span></view><text class="muted">每个商品的缺口必须全部分配到门店，缺货备注可选。</text></view>
              <view class="outbound-item-list">
                <view v-for="item in selectedDriverRouteItems.filter((entry) => entry.expected > outboundItemActual(entry))" :key="item.skuId" class="outbound-item-card outbound-item-card--driver" data-visual-state="driver-shortage-item">
                  <BusinessImage class="outbound-item-image" :src="item.image" mode="aspectFill" />
                  <view class="row-main"><text class="outbound-item-name">{{ item.name }}</text><text class="muted">规格 {{ item.skuName || '—' }} · 应发 {{ item.expected }} · 实发 {{ outboundItemActual(item) }}</text><view class="shortage-progress"><view class="shortage-progress-head"><text>分配进度</text><text :class="{ danger: driverShortageRemaining(selectedDriverRoute, item) !== 0 }">{{ item.expected - outboundItemActual(item) - driverShortageRemaining(selectedDriverRoute, item) }}/{{ item.expected - outboundItemActual(item) }}</text></view><view class="shortage-progress-track"><view :style="{ width: ((item.expected - outboundItemActual(item) - driverShortageRemaining(selectedDriverRoute, item)) / Math.max(1, item.expected - outboundItemActual(item)) * 100) + '%' }"></view></view></view><view class="shortage-allocate-head"><text>门店缺货分配</text><text :class="{ danger: driverShortageRemaining(selectedDriverRoute, item) !== 0 }">剩余 {{ driverShortageRemaining(selectedDriverRoute, item) }}</text></view><view v-for="stop in driverItemStores(selectedDriverRoute, item)" :key="stop.storeId" class="shortage-allocate-row"><view class="row-main"><text>{{ stop.storeName }}</text><text class="muted">本店应发 {{ storeSkuQuantity(stop, item.skuId) }} 件</text><input v-model="driverShortageNotes[driverAllocationKey(item.skuId, stop.storeId)]" class="shortage-note-input" placeholder="缺货备注（可选）" /></view><input v-model.number="driverShortageDraft[driverAllocationKey(item.skuId, stop.storeId)]" type="number" min="0" :max="storeSkuQuantity(stop, item.skuId)" /></view></view>
                </view>
              </view>
            </view>
            <view class="secondary-foot sheet-actions"><button class="primary-button" :class="{ 'is-loading': busyAction === 'mark-outbound-shortages' }" :disabled="busyAction === 'mark-outbound-shortages' || !canDispatchRoute" @click="markDriverShortages(selectedDriverRoute)">保存缺货标记</button></view>
          </template>

          <template v-else-if="driverOutboundView">
            <view class="secondary-body">
              <view class="outbound-summary-card"><view class="row-top"><text class="driver-name">{{ driverRouteName(selectedDriverRoute) }}</text><span class="badge" :class="selectedDriverRoute.outboundHandover?.status">{{ outboundStatusText(selectedDriverRoute) }}</span></view><view class="outbound-route-metrics"><text>配送日 {{ selectedDriverRoute.deliveryDate }}</text><text>{{ warehouseName(selectedDriverRoute) }}</text><text>{{ routeGoodsQuantity(selectedDriverRoute) }} 件</text></view></view>
              <view v-if="selectedDriverRoute.outboundHandover?.status === 'rejected'" class="handover-rejection"><text>审核不通过</text><text class="handover-result-sub">{{ selectedDriverRoute.outboundHandover.rejectionReason }}</text></view>
              <view class="search-bar outbound-search"><UiIcon name="search" :size="16" /><input v-model="outboundKeyword" placeholder="搜索商品名称 / 规格" /></view>
              <label class="checkbox-field outbound-difference-toggle"><checkbox :checked="outboundShowDifferences" @click="outboundShowDifferences = !outboundShowDifferences" /><text>只看差异商品</text></label>
              <view class="section-title">商品明细 <span class="section-sub">图片 / 规格 / 应发数量</span></view>
              <view class="outbound-item-list">
                <view v-for="item in filteredSelectedDriverRouteItems" :key="item.skuId" class="outbound-item-card outbound-item-card--driver" data-visual-state="driver-outbound-item">
                  <BusinessImage class="outbound-item-image" :src="item.image" mode="aspectFill" />
                  <view class="row-main"><text class="outbound-item-name">{{ item.name }}</text><text class="muted">规格 {{ item.skuName || '规格待维护' }}</text><view class="outbound-quantity-grid"><view><small class="meta">应发</small><strong class="val">{{ item.expected }}</strong></view><view><small class="meta">仓数</small><strong class="val">{{ item.warehouseQuantity ?? '—' }}</strong></view><view><small class="meta">实发</small><strong class="val">{{ !selectedDriverRoute.outboundHandover || selectedDriverRoute.outboundHandover.status === 'rejected' ? driverHandoverActuals[item.skuId] : outboundItemActual(item) }}</strong></view><view :class="{ danger: item.expected !== (!selectedDriverRoute.outboundHandover || selectedDriverRoute.outboundHandover.status === 'rejected' ? Number(driverHandoverActuals[item.skuId] ?? item.driverActual) : outboundItemActual(item)) }"><small class="meta">差异</small><strong class="val">{{ item.expected - (!selectedDriverRoute.outboundHandover || selectedDriverRoute.outboundHandover.status === 'rejected' ? Number(driverHandoverActuals[item.skuId] ?? item.driverActual) : outboundItemActual(item)) }}</strong></view></view><label v-if="!selectedDriverRoute.outboundHandover || selectedDriverRoute.outboundHandover.status === 'rejected'" class="outbound-inline-edit"><text>司机实发</text><input v-model.number="driverHandoverActuals[item.skuId]" type="number" min="0" :max="item.expected" /></label><button class="outbound-store-toggle" @click="toggleOutboundItem(item.skuId)">{{ isOutboundItemExpanded(item.skuId) ? '收起门店明细' : '门店明细' }}<UiIcon :name="isOutboundItemExpanded(item.skuId) ? 'chevron-left' : 'chevron-right'" :size="13" /></button><view v-if="isOutboundItemExpanded(item.skuId)" class="outbound-store-breakdown"><view v-for="stop in driverItemStores(selectedDriverRoute, item)" :key="stop.storeId"><view class="row-top"><text>{{ stop.storeName }}</text><span class="tag">应发 {{ outboundItemStoreExpected(selectedDriverRoute, item, stop) }}</span></view><text class="muted">实发 {{ outboundItemStoreActualText(selectedDriverRoute, item, stop) }}</text><text v-if="outboundItemStoreNote(selectedDriverRoute, item, stop)" class="danger">缺货备注：{{ outboundItemStoreNote(selectedDriverRoute, item, stop) }}</text></view></view></view>
                </view>
              </view>
              <view class="outbound-totals"><text>应发 {{ selectedDriverRouteItems.reduce((sum, item) => sum + item.expected, 0) }} 件</text><text>实发 {{ selectedDriverRouteItems.reduce((sum, item) => sum + Number(driverHandoverActuals[item.skuId] ?? item.driverActual), 0) }} 件</text><text class="danger">差异 {{ selectedDriverRouteItems.reduce((sum, item) => sum + item.expected - Number(driverHandoverActuals[item.skuId] ?? item.driverActual), 0) }} 件</text></view>
              <view class="section-title">凭证照片 <span class="section-sub">必传，最多 6 张</span></view>
              <ImageUploader v-if="!selectedDriverRoute.outboundHandover || selectedDriverRoute.outboundHandover.status === 'rejected'" v-model="driverHandoverProofs" purpose="driver-outbound-proof" profile="normal" multiple :max-count="6" />
              <view v-else-if="selectedDriverRoute.outboundHandover.proofImages?.length" class="proof-image-grid"><BusinessImage v-for="image in selectedDriverRoute.outboundHandover.proofImages" :key="image" class="proof-image" :src="image" mode="aspectFill" /></view>
              <label v-if="!selectedDriverRoute.outboundHandover || selectedDriverRoute.outboundHandover.status === 'rejected'" class="form-field note-field"><text>交接备注（可选）</text><input v-model="driverHandoverNote" placeholder="交接备注" /></label>
              <text v-else-if="selectedDriverRoute.outboundHandover.driverNote" class="muted">备注：{{ selectedDriverRoute.outboundHandover.driverNote }}</text>
              <view v-if="selectedDriverRoute.outboundHandover?.status === 'pending_supplier'" class="handover-result"><text>已提交，等待供应商审核</text><text class="handover-result-sub">审核后可查看最终实发和需分配的门店缺货。</text></view>
              <view v-if="selectedDriverRoute.outboundHandover?.status === 'dispatched'" class="handover-result"><text>已发车 · 配送中</text><text class="handover-result-sub">{{ selectedDriverRoute.outboundHandover.dispatchedAt?.replace('T', ' ').slice(0, 16) }}</text></view>
            </view>
            <view class="secondary-foot sheet-actions">
              <button v-if="!selectedDriverRoute.outboundHandover || selectedDriverRoute.outboundHandover.status === 'rejected'" class="primary-button" :class="{ 'is-loading': busyAction === 'submit-outbound' }" :disabled="busyAction === 'submit-outbound'" @click="submitDriverOutbound(selectedDriverRoute)">{{ selectedDriverRoute.outboundHandover?.status === 'rejected' ? '重新提交出仓交接' : '提交出仓交接' }}</button>
              <template v-else-if="selectedDriverRoute.outboundHandover.status === 'pending_dispatch'">
                <button v-if="outboundHasShortage(selectedDriverRoute)" class="outline-button" @click="openDriverShortage(selectedDriverRoute)">标记门店缺货</button>
                <button class="primary-button" :class="{ 'is-loading': busyAction === 'dispatch-route' }" :disabled="busyAction === 'dispatch-route' || !canDispatchRoute" @click="dispatchDriverRoute(selectedDriverRoute)">发车</button>
              </template>
            </view>
          </template>

          <template v-else-if="driverStoreDetailId && selectedDriverStop">
            <view class="secondary-body">
              <view class="outbound-summary-card"><view class="row-top"><text class="driver-name">{{ selectedDriverStop.storeName }}</text><span class="badge" :class="selectedDriverStop.completedAt ? 'received' : selectedDriverStop.checkIn ? 'delivering' : 'warning-tag'">{{ selectedDriverStop.completedAt ? '已交接' : selectedDriverStop.checkIn ? '已打卡' : '待打卡' }}</span></view><text class="muted">{{ selectedDriverStop.address }}</text><text class="muted">{{ storeInfoOf(selectedDriverStop).contact }} {{ storeInfoOf(selectedDriverStop).phone }}</text><text class="muted">{{ selectedDriverStopOrders.length }} 单 · {{ stopItemCount(selectedDriverStop) }} 件</text></view>
              <view class="section-title">门店商品汇总 <span class="section-sub">只读确认</span></view>
              <view class="outbound-item-list"><view v-for="item in selectedDriverStopItems" :key="item.skuId" class="outbound-item-card" data-visual-state="driver-store-item"><BusinessImage class="outbound-item-image" :src="item.image" mode="aspectFill" /><view class="row-main"><text class="outbound-item-name">{{ item.name }}</text><text class="muted">规格 {{ item.skuName || '规格待维护' }}</text><view class="outbound-quantity-grid"><view><small class="meta">应发</small><strong class="val">{{ item.expected }}</strong></view><view><small class="meta">实收</small><strong class="val">{{ item.expected - storeSkuShortage(selectedDriverRoute, selectedDriverStop, item.skuId) }}</strong></view><view :class="{ danger: storeSkuShortage(selectedDriverRoute, selectedDriverStop, item.skuId) > 0 }"><small class="meta">缺货</small><strong class="val">{{ storeSkuShortage(selectedDriverRoute, selectedDriverStop, item.skuId) }}</strong></view></view><text v-if="storeSkuShortageNote(selectedDriverRoute, selectedDriverStop, item.skuId)" class="store-readonly-note">缺货备注：{{ storeSkuShortageNote(selectedDriverRoute, selectedDriverStop, item.skuId) }}</text></view></view></view>
            </view>
            <view class="secondary-foot sheet-actions"><button v-if="!selectedDriverStop.checkIn && selectedDriverRoute.outboundHandover?.status === 'dispatched'" class="primary-button" :class="{ 'is-loading': busyAction === 'checkin' }" :disabled="busyAction === 'checkin'" @click="checkInAtStop(selectedDriverStop)">到店打卡</button><text v-else-if="!selectedDriverStop.checkIn" class="muted store-action-hint">发车后可到店打卡</text><button v-else-if="!selectedDriverStop.completedAt && selectedDriverRoute.outboundHandover?.status === 'dispatched'" class="primary-button" :class="{ 'is-loading': busyAction === 'store-handover' }" :disabled="busyAction === 'store-handover'" @click="handoverDriverStop(selectedDriverRoute, selectedDriverStop)">确认到店交接</button><button v-else class="outline-button" @click="navigateToStop(selectedDriverStop)"><UiIcon name="navigation" :size="14" />导航</button></view>
          </template>

          <template v-else>
            <view class="secondary-body">
              <view class="outbound-summary-card"><view class="row-top"><text class="driver-name">{{ driverRouteName(selectedDriverRoute) }}</text><span class="badge" :class="selectedDriverRoute.outboundHandover?.status || selectedDriverRoute.status">{{ outboundStatusText(selectedDriverRoute) }}</span></view><view class="driver-route-card-grid"><view><small class="meta">配送日</small><strong class="val">{{ selectedDriverRoute.deliveryDate }}</strong></view><view><small class="meta">司机</small><strong class="val">{{ store.auth.name }}</strong></view><view><small class="meta">货物数量</small><strong class="val">{{ routeGoodsQuantity(selectedDriverRoute) }} 件</strong></view><view><small class="meta">货物种类</small><strong class="val">{{ routeGoodsKinds(selectedDriverRoute) }} 种</strong></view><view><small class="meta">门店数量</small><strong class="val">{{ selectedDriverRoute.stopCount || selectedDriverRoute.stops.length }} 家</strong></view><view><small class="meta">预计时间</small><strong class="val">{{ selectedDriverRoute.estimatedDurationMinutes }} 分钟</strong></view></view></view>
              <view class="warehouse-action-card driver-section-card"><view class="row-main"><text class="driver-name">仓库打卡</text><text class="muted">{{ warehouseCheckInLabel(selectedDriverRoute) }}</text></view><button class="outline-button mini-button" @click="openDriverWarehouse(selectedDriverRoute)">{{ selectedDriverRoute.warehouseCheckIn ? '打卡详情' : '到仓打卡' }}</button></view>
              <view class="route-mode-tabs"><button :class="{ active: driverRouteDisplayMode === 'list' }" @click="driverRouteDisplayMode = 'list'">列表模式</button><button :class="{ active: driverRouteDisplayMode === 'map' }" @click="driverRouteDisplayMode = 'map'">地图模式</button></view>
              <DeliveryRouteMap v-if="driverRouteDisplayMode === 'map'" :origin="selectedDriverRoute.origin" :stops="selectedDriverRoute.stops" :polyline="selectedDriverRoute.polyline" :selected-stop-id="driverSelectedStopId" :stop-count="selectedDriverRoute.stopCount || selectedDriverRoute.stops.length" :total-distance-km="selectedDriverRoute.totalDistanceKm" :estimated-duration-minutes="selectedDriverRoute.estimatedDurationMinutes" @select-stop="driverSelectedStopId = $event" />
              <view v-else class="driver-timeline">
                <view v-for="(stop, index) in selectedDriverRoute.stops" :key="stop.storeId" class="driver-timeline-item" :class="['is-' + driverStopStage(selectedDriverRoute, stop), { 'is-selected': driverSelectedStopId === stop.storeId, 'is-next': driverNextStop?.storeId === stop.storeId }]" data-visual-state="driver-stop-card">
                  <view class="driver-timeline-axis"><view class="route-number">{{ index + 1 }}</view><view v-if="index < selectedDriverRoute.stops.length - 1" class="driver-timeline-line"></view></view>
                  <view class="driver-timeline-card driver-section-card">
                    <view class="driver-timeline-head" @click="driverSelectedStopId = stop.storeId"><view class="row-main"><text class="driver-timeline-name">{{ stop.storeName }}</text><text class="muted">{{ stop.address }}</text></view><view class="driver-timeline-status"><span v-if="driverNextStop?.storeId === stop.storeId" class="tag next-stop">下一站</span><span class="badge" :class="driverStopStage(selectedDriverRoute, stop)">{{ driverStopStageText(selectedDriverRoute, stop) }}</span></view></view>
                    <view class="driver-timeline-metrics"><text>{{ stopItemCount(stop) }} 件</text><text>{{ stop.orderIds.length }} 单</text><text>{{ stopSegment(selectedDriverRoute, stop) ?? '距离待维护' }}{{ stopSegment(selectedDriverRoute, stop) !== undefined ? ' km' : '' }}</text></view>
                    <view class="driver-timeline-contact"><UiIcon name="map-pin" :size="13" /><text>{{ storeInfoOf(stop).contact }} {{ storeInfoOf(stop).phone }}</text></view>
                    <view class="driver-timeline-actions">
                      <button class="icon-button route-order-button" aria-label="上移" :disabled="!canMoveDriverStop(selectedDriverRoute, index, -1) || busyAction === 'reorder-stops'" @click.stop="moveDriverStop(selectedDriverRoute, index, -1)"><UiIcon name="chevron-left" :size="14" /></button>
                      <button class="icon-button route-order-button" aria-label="下移" :disabled="!canMoveDriverStop(selectedDriverRoute, index, 1) || busyAction === 'reorder-stops'" @click.stop="moveDriverStop(selectedDriverRoute, index, 1)"><UiIcon name="chevron-right" :size="14" /></button>
                      <button class="outline-button mini-button" @click.stop="callStore(storeInfoOf(stop).phone)">联系</button>
                      <button class="outline-button mini-button" @click.stop="navigateToStop(stop)"><UiIcon name="navigation" :size="13" />导航</button>
                      <button class="primary-button mini-button" @click.stop="openDriverStore(stop.storeId)">查看商品</button>
                    </view>
                  </view>
                </view>
              </view>
            </view>
          </template>
        </view>

        <template v-else>
        <view class="page-pad driver-role-page driver-today-page" data-visual-view="driver-today">
          <view class="section-title driver-records-title">作业记录</view>
          <view class="driver-quick-tools"><button @click="openDriverAux('data')"><view class="driver-quick-icon"><UiIcon name="layout-dashboard" :size="24" /></view><text>配送数据</text></button><button @click="openDriverAux('handovers')"><view class="driver-quick-icon"><UiIcon name="list-tree" :size="24" /></view><text>交接记录</text></button></view>
          <view class="driver-status-segments"><button v-for="item in driverRouteFilterOptions" :key="item" :class="{ active: driverRouteFilter === item }" @click="driverRouteFilter = item">{{ item }}</button></view>
          <view v-if="filteredTodayDriverRoutes.length" class="driver-route-list"><view v-for="route in filteredTodayDriverRoutes" :key="route.id" class="driver-route-card driver-section-card" data-visual-state="driver-route-card"><button class="driver-route-card-main" @click="openDriverRoute(route)"><view class="driver-route-card-head"><view><text class="driver-route-name">{{ driverRouteName(route) }}</text><text class="muted">{{ route.deliveryDate }} · {{ routeDriverName(route) }} · {{ warehouseName(route) }}</text></view><span class="badge" :class="driverRouteStage(route)">{{ driverRouteStageText(route) }}</span></view><view class="driver-route-metrics"><view><small class="meta">货物数量</small><strong class="val">{{ routeGoodsQuantity(route) }} 件</strong></view><view><small class="meta">门店数量</small><strong class="val">{{ route.stopCount || route.stops.length }} 家</strong></view><view><small class="meta">货物种类</small><strong class="val">{{ routeGoodsKinds(route) }} 种</strong></view><view><small class="meta">距离 / 时间</small><strong class="val">{{ route.totalDistanceKm.toFixed(1) }} km / {{ route.estimatedDurationMinutes }} 分</strong></view></view><view class="driver-route-progress"><view class="driver-route-progress-head"><text>配送进度</text><text>{{ driverRouteProgress(route).completed }}/{{ driverRouteProgress(route).total }} 家门店</text></view><view class="driver-route-progress-track"><view :style="{ width: driverRouteProgress(route).percent + '%' }"></view></view></view></button><view v-if="driverRouteStage(route) === 'pending_shortage'" class="driver-route-warning"><UiIcon name="package-check" :size="15" /><text>本次配送存在缺货，完成门店分配后才能发车</text></view><view class="route-card-actions"><button class="primary-button mini-button" :class="{ 'is-loading': busyAction === 'dispatch-route' && routeActionLabel(route) === '发车' }" :disabled="busyAction === 'dispatch-route' && routeActionLabel(route) === '发车'" @click="openDriverRouteAction(route)">{{ routeActionLabel(route) }}</button><button class="outline-button mini-button driver-action-secondary" @click="openDriverRoute(route)">线路详情</button></view></view></view>
          <view v-else class="empty-state compact-empty pc-empty"><view class="pc-state-icon"><UiIcon name="navigation" :size="28" /></view><text>当前没有{{ driverRouteFilter }}线路</text></view>
        </view>

      </template>
      </template>

      <view v-if="store.auth.role === 'supplier' && active === 'products' && productWorkspace && !secondaryWorkspace" class="page-pad product-work-page" data-visual-view="supplier-products">
        <view class="product-work-head"><button v-if="productEditor" class="page-back" aria-label="返回商品管理" @click="cancelProductEditor"><UiIcon name="arrow-left" :size="18" /></button><view><text class="product-work-title">{{ productEditor ? (productEditorFormalId ? '编辑商品' : '发布商品') : '商品管理' }}</text><text class="muted">{{ productEditor ? '资料修改后需重新审核' : `${allSupplierProductRows.length} 条商品记录` }}</text></view><button v-if="!productEditor" class="primary-button mini-button add-product-button" @click="openNewProduct">新增商品</button></view>
        <view class="product-work-body">
        <template v-if="!productEditor">
          <view class="product-summary"><view><strong class="val">{{ productStatusCount('active') }}</strong><small class="meta">已上架</small></view><view><strong class="val">{{ productStatusCount('pending') }}</strong><small class="meta">待审核</small></view><view><strong class="val">{{ productStatusCount('offline') }}</strong><small class="meta">已下架</small></view></view>
          <view class="search-bar product-search"><UiIcon name="search" :size="16" /><input v-model="productKeyword" placeholder="搜索商品名称 / 品类" confirm-type="search" /></view>
          <scroll-view class="product-filter-scroll" scroll-x><view class="product-filter-chips"><button v-for="item in productFilterStats" :key="item.label" :class="{ active: productFilter === item.label }" @click="productFilter = item.label">{{ item.label }}<text>{{ item.count }}</text></button></view></scroll-view>
          <view v-if="supplierProductRows.length" class="supplier-product-list">
            <view v-for="row in supplierProductRows" :key="row.key" class="supplier-product-card">
              <view class="supplier-product-main"><BusinessImage class="supplier-product-image" :src="row.product.image" mode="aspectFill" /><view class="row-main"><view class="row-top"><text class="supplier-product-name">{{ row.product.name }}</text><span class="badge" :class="row.status">{{ row.status === 'pending' ? '待审核' : row.status === 'rejected' ? '已驳回' : row.status === 'offline' ? '已下架' : '已上架' }}</span></view><view class="muted product-category-meta"><BusinessImage class="product-category-image" :src="productCategoryImage(row.product.category, productCategoryState)" :fallback="defaultProductCategoryImage(row.product.category)" :error-fallback="defaultProductCategoryImage()" :show-error="false" mode="aspectFill" /><text :title="row.product.category">{{ row.product.category }}</text><text>· {{ row.product.channel === 'store' ? '门店采购' : row.product.channel === 'live' ? '用户商城' : '全渠道' }}</text></view><view class="supplier-product-price"><strong class="val">¥{{ row.product.skus[0]?.retailPrice.toFixed(2) || '0.00' }}</strong><small class="meta">{{ row.product.skus.length }} 个规格 · 库存 {{ row.product.skus.reduce((sum, sku) => sum + sku.stock, 0) }}</small></view></view></view>
              <view class="supplier-product-skus"><text v-for="sku in row.product.skus.filter((item) => item.status !== 'retired')" :key="sku.id">{{ sku.name }}<small class="meta">¥{{ sku.retailPrice }} · 库存 {{ sku.stock }} · {{ sku.minimumOrderQuantity === 0 ? '无起订限制' : `起订 ${sku.minimumOrderQuantity || 1}` }}</small></text></view>
              <text v-if="row.submission?.reviewNote" class="product-reject-note">驳回原因：{{ row.submission.reviewNote }}</text>
              <view class="order-actions"><button v-if="row.status === 'rejected'" class="primary-button mini-button" @click="openProductEditor(row.product, row.submission)">重新提交</button><button v-else-if="row.status !== 'pending'" class="outline-button mini-button" @click="openProductEditor(row.product)">编辑</button><button v-if="row.status === 'active' || row.status === 'offline'" class="outline-button mini-button" :class="{ 'is-loading': busyAction === 'toggle-product' }" :disabled="busyAction === 'toggle-product'" @click="toggleSupplierProduct(row.product)">{{ row.status === 'active' ? '下架' : '上架' }}</button></view>
            </view>
          </view>
          <view v-else class="empty-state pc-empty"><view class="pc-state-icon"><UiIcon name="package" :size="26" /></view><text>暂无{{ productFilter }}商品</text></view>
        </template>
        <view v-else class="supplier-product-form">
          <view class="form-section"><text class="form-section-title">商品图片</text><view class="media-field"><text>商品主图</text><ImageUploader v-model="productEditor.image" purpose="supplier-catalog-main" profile="normal" /></view><view class="media-field"><text>商品图集（最多 9 张）</text><ImageUploader v-model="productEditor.images" purpose="supplier-catalog-gallery" profile="normal" multiple :max-count="9" /></view></view>
          <view class="form-section"><text class="form-section-title">基础信息</text><label class="form-field"><text>商品名称</text><input v-model="productEditor.name" placeholder="请输入商品名称" /></label><view class="form-field"><text>商品品类</text><button class="category-picker-trigger" type="button" @click="categoryPickerOpen = true"><view><BusinessImage class="category-picker-trigger-image" :src="productCategoryImage(productEditor.category, productCategoryState)" :fallback="defaultProductCategoryImage(productEditor.category)" :error-fallback="defaultProductCategoryImage()" :show-error="false" mode="aspectFill" /><text :title="productEditor.category">{{ productEditor.category || '请选择商品品类' }}</text></view><UiIcon name="chevron-right" :size="16" /></button></view><label class="form-field"><text>商品标签</text><input v-model="productTagText" placeholder="多个标签用逗号分隔" /></label><label class="form-field"><text>销售渠道</text><picker mode="selector" :range="productChannelLabels" @change="setProductChannel"><view class="picker-field">{{ productChannelLabel(productEditor.channel) }}</view></picker></label><label class="checkbox-field"><checkbox :checked="productEditor.expressDelivery" @click="productEditor.expressDelivery = !productEditor.expressDelivery" /><text>支持快递直发</text></label></view>
          <view class="form-section supplier-sku-form"><view class="sku-section-head"><view><text class="form-section-title">SKU 规格</text><small class="meta">价格、库存、起订量和分销金额</small></view><button class="outline-button mini-button" @click="addSupplierSku">添加规格</button></view><view v-for="(sku, index) in productEditor.skus" :key="sku.id" class="supplier-sku-fields" :class="{ retired: sku.status === 'retired' }"><view class="sku-card-head"><text>规格 {{ index + 1 }}</text><button v-if="sku.status === 'retired'" @click="restoreSupplierSku(index)">恢复</button><button v-else @click="removeSupplierSku(index)">删除</button></view><view class="sku-image-field"><text>规格图片</text><ImageUploader v-model="sku.image" :purpose="`supplier-catalog-sku-${sku.id}`" profile="normal" :disabled="sku.status === 'retired'" /></view><view class="sku-input-grid"><label><text>规格名称</text><input v-model="sku.name" :disabled="sku.status === 'retired'" placeholder="如：500g/盒" /></label><label><text>零售价</text><input v-model.number="sku.retailPrice" :disabled="sku.status === 'retired'" type="number" min="0" /></label><label><text>供货价</text><input v-model.number="sku.cost" :disabled="sku.status === 'retired'" type="number" min="0" /></label><label><text>库存</text><input v-model.number="sku.stock" :disabled="sku.status === 'retired'" type="number" min="0" /></label><label><text>起订量</text><input v-model.number="sku.minimumOrderQuantity" :disabled="sku.status === 'retired'" type="number" min="0" step="1" placeholder="0 表示无起订限制" /></label><label><text>一级分销金额</text><input v-model.number="sku.level1Amount" :disabled="sku.status === 'retired'" type="number" min="0" /></label><label><text>二级分销金额</text><input v-model.number="sku.level2Amount" :disabled="sku.status === 'retired'" type="number" min="0" /></label></view></view></view>
          <text v-if="productFormError" class="form-error">{{ productFormError }}</text>
        </view>
        </view>
        <view v-if="productEditor" class="product-form-actions"><button class="outline-button" @click="cancelProductEditor">取消</button><button v-if="productEditorFormalId" class="outline-button" :class="{ 'is-loading': busyAction === 'save-stock' }" :disabled="busyAction === 'save-stock'" @click="saveSupplierProductStock">仅保存库存</button><button class="primary-button" :class="{ 'is-loading': busyAction === 'submit-product' }" :disabled="busyAction === 'submit-product'" @click="submitSupplierProduct">{{ productEditorFormalId ? '提交资料审核' : '提交审核' }}</button></view>
      </view>

      <!-- 底部 tabbar -->
      <view v-if="store.auth.role === 'supplier' && !secondaryWorkspace && !driverRouteDetailId && !driverAuxView" class="tabbar">
        <button v-for="tab in currentTabs" :key="tab.key" class="tab-item bottom-tab" :class="{ active: isTabActive(tab.key) }" @click="switchTab(tab.key)">
          <UiIcon :name="tab.icon" :size="20" />
          <text>{{ tab.label }}</text>
          <span v-if="tab.badge()" class="tab-badge" data-typography-compact>{{ tab.badge() }}</span>
        </button>
      </view>
      <!-- 弹层 -->
      <view v-if="sheet" class="sheet-mask" @click.self="closeSheet">
        <view class="sheet-panel">
          <view class="sheet-handle"></view>
          <view v-if="sheet === 'order' && selectedOrder" class="order-detail" data-visual-sheet="order">
            <view class="sheet-head"><text class="sheet-title">{{ selectedOrder.id }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <scroll-view class="sheet-scroll" scroll-y>
            <view class="row detail-status-row"><span class="badge" :class="orderFulfillment(selectedOrder).status">{{ statusText(orderFulfillment(selectedOrder).status, selectedOrder) }}</span><text class="muted">{{ selectedOrder.createdAt }}</text></view>
            <view class="steps">
              <view v-for="(step, index) in fulfillmentSteps" :key="step" class="step" :class="{ done: stepIndex(selectedOrder) >= index }"><view class="step-dot">{{ index + 1 }}</view><text class="step-label">{{ stepLabel(step) }}</text></view>
            </view>
            <view class="section-title">商品明细</view>
            <view v-for="item in selectedOrder.items" :key="`${item.productId}-${item.skuId}`" class="order-item-line">
              <BusinessImage :src="item.image" mode="aspectFill" /><view class="row-main"><text>{{ item.name }}</text><text class="muted">{{ item.skuName }} ×{{ item.quantity }}</text></view><text class="order-item-price">{{ money(item.price * item.quantity) }}</text>
            </view>
            <view class="section-title">收货门店</view>
            <view class="store-line"><UiIcon name="map-pin" :size="16" /><view class="row-main"><text>{{ isCourierOrder(selectedOrder) ? '收货地址' : selectedOrder.customer }}</text><text class="muted">{{ addressLabel(selectedOrder) }}</text></view></view>
            <view v-if="orderShortage(selectedOrder).length" class="section-title">缺货清单 <span class="tag danger">缺货 {{ orderShortage(selectedOrder).length }} 项</span></view>
            <view v-if="orderShortage(selectedOrder).length">
              <view v-for="item in orderShortage(selectedOrder)" :key="item.skuId" class="shortage-line">
                <view class="row-main"><text>{{ item.name }}</text><text class="muted">应发 {{ item.ordered }} · 实发 {{ item.actual }}</text></view>
                <span class="tag" :class="item.handled ? 'out' : 'danger'">{{ item.handled ? '已补发' : '缺 ' + item.shortage }}</span>
                <button v-if="store.auth.role === 'supplier' && !item.handled" class="outline-button mini-button" :class="{ 'is-loading': busyAction === 'mark-handled' }" :disabled="busyAction === 'mark-handled'" @click="markHandled(item.skuId)">标记补发</button>
              </view>
            </view>
            <view class="section-title">交接记录</view>
            <view v-if="handoversOf(selectedOrder).length" class="log-list">
              <view v-for="log in handoversOf(selectedOrder)" :key="log.id" class="log-event"><view class="log-dot"></view><view class="row-main"><text>{{ log.type === 'out' ? '出库交接' : '到店交接' }} · {{ log.operatorName }}</text><text class="muted">{{ log.time }} · {{ log.operatorRole === 'driver' ? '司机' : '供应商' }}{{ log.shortageCount ? ` · 缺货 ${log.shortageCount} 项` : '' }}{{ log.note ? ` · ${log.note}` : '' }}</text></view></view>
            </view>
            <view v-else class="empty-state compact-empty pc-empty"><view class="pc-state-icon"><UiIcon name="list-tree" :size="26" /></view><text>暂无交接记录</text></view>
            <view class="section-title">流转记录</view>
            <view class="log-list">
              <view v-for="(event, index) in (selectedOrder.flow || [])" :key="index" class="log-event"><view class="log-dot"></view><view class="row-main"><text>{{ event.action }}</text><text class="muted">{{ event.time }} · {{ event.operator }}</text></view></view>
            </view>
            </scroll-view>
            <view v-if="orderActions(selectedOrder).length" class="sheet-actions sheet-foot">
              <button v-for="action in orderActions(selectedOrder)" :key="action.key" class="outline-button" :class="{ 'is-loading': busyAction === action.key, 'primary-button': action.primary }" :disabled="busyAction === action.key" @click="runAction(action.key, selectedOrder)">{{ action.label }}</button>
            </view>
          </view>

          <view v-else-if="sheet === 'courier' && selectedOrder" class="courier-sheet" data-visual-sheet="courier">
            <view class="sheet-head"><text class="sheet-title">快递直发</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <scroll-view class="sheet-scroll" scroll-y>
            <text class="muted">订单 {{ selectedOrder.id }} · {{ recipientLabel(selectedOrder) }}</text>
            </scroll-view>
            <view class="sheet-actions sheet-foot">
              <button class="primary-button" :class="{ 'is-loading': busyAction === 'courier' }" :disabled="busyAction === 'courier'" @click="confirmCourier">确认发货</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>

          <view v-else-if="sheet === 'handover-out' && selectedOrder" class="handover-sheet" data-visual-sheet="handover-out">
            <view class="sheet-head"><text class="sheet-title">出库交接</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <scroll-view class="sheet-scroll" scroll-y>
            <text class="muted">订单 {{ selectedOrder.id }} · {{ selectedOrder.customer }}，按明细录入实发数量（缺货自动计算）</text>
            <view v-if="handoverResult" class="handover-result">
              <text>交接完成</text>
              <text class="handover-result-sub" v-if="handoverResult.shortages.length">缺货 {{ handoverResult.shortages.length }} 项：{{ handoverResult.shortages.map((item) => `${item.name} 缺 ${item.shortage}`).join('、') }}</text>
              <text class="handover-result-sub" v-else>全部商品足量出库</text>
            </view>
            <view v-else class="actual-list">
              <view v-for="item in selectedOrder.items" :key="item.skuId" class="actual-line">
                <view class="row-main"><text>{{ item.name }}</text><text class="muted">{{ item.skuName }} · 应发 {{ item.quantity }}</text></view>
                <label class="actual-input"><text>实发</text><input type="number" :min="0" :max="item.quantity" v-model.number="actuals[item.skuId]" /></label>
              </view>
              <label class="form-field note-field"><text>备注（可选）</text><input v-model="handoverNote" placeholder="交接备注" /></label>
            </view>
            </scroll-view>
            <view class="sheet-actions sheet-foot">
              <button v-if="!handoverResult" class="primary-button" :class="{ 'is-loading': busyAction === 'handover-out' }" :disabled="busyAction === 'handover-out'" @click="confirmHandoverOut">确认交接</button>
              <button class="outline-button" @click="closeSheet">{{ handoverResult ? '完 成' : '取 消' }}</button>
            </view>
          </view>
          <view v-else-if="sheet === 'handover-in' && selectedOrder" class="handover-sheet" data-visual-sheet="handover-in">
            <view class="sheet-head"><text class="sheet-title">到店交接</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <scroll-view class="sheet-scroll" scroll-y>
            <view class="store-line"><UiIcon name="map-pin" :size="16" /><view class="row-main"><text>{{ selectedOrder.customer }}</text><text class="muted">{{ storeInfoOf(selectedOrder.customer).address }} · {{ storeInfoOf(selectedOrder.customer).contact }} {{ storeInfoOf(selectedOrder.customer).phone }}</text></view></view>
            <view class="section-title">商品明细</view>
            <view v-for="item in selectedOrder.items" :key="`${item.productId}-${item.skuId}`" class="order-item-line"><BusinessImage :src="item.image" mode="aspectFill" /><view class="row-main"><text>{{ item.name }}</text><text class="muted">{{ item.skuName }} ×{{ item.quantity }}</text></view><text class="order-item-price">{{ money(item.price * item.quantity) }}</text></view>
            <view v-if="orderShortage(selectedOrder).length" class="section-title">缺货提示</view>
            <view v-if="orderShortage(selectedOrder).length">
              <view v-for="item in orderShortage(selectedOrder)" :key="item.skuId" class="shortage-line"><text>{{ item.name }}</text><span class="tag danger">缺 {{ item.shortage }}</span></view>
            </view>
            <label class="form-field note-field"><text>备注（可选）</text><input v-model="handoverNote" placeholder="交接备注" /></label>
            </scroll-view>
            <view class="sheet-actions sheet-foot">
              <button class="primary-button" :class="{ 'is-loading': busyAction === 'handover-in' }" :disabled="busyAction === 'handover-in'" @click="confirmHandoverIn">确认已送达门店</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>

          <view v-else-if="sheet === 'driver-form' || sheet === 'driver-edit'" class="driver-form-sheet" data-visual-sheet="driver-form-edit">
            <view class="sheet-head"><text class="sheet-title">{{ sheet === 'driver-form' ? '新增司机' : '编辑司机' }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <scroll-view class="sheet-scroll" scroll-y>
            <view class="form-fields">
              <label class="form-field"><text>姓名</text><input v-model="driverForm.name" placeholder="司机姓名" /></label>
              <label class="form-field"><text>手机号</text><input v-model="driverForm.phone" type="number" maxlength="11" placeholder="11 位手机号" /></label>
              <label v-if="sheet === 'driver-form'" class="form-field"><text>账号</text><input v-model="driverForm.account" placeholder="4-20 位字母数字，登录用" /></label>
              <label v-if="sheet === 'driver-form'" class="form-field"><text>初始密码</text><input v-model="driverForm.password" placeholder="6-20 位" /></label>
            </view>
            <text v-if="driverFormError" class="form-error">{{ driverFormError }}</text>
            </scroll-view>
            <view class="sheet-actions sheet-foot">
              <button class="primary-button" :class="{ 'is-loading': busyAction === 'save-driver' }" :disabled="busyAction === 'save-driver'" @click="saveDriver">{{ sheet === 'driver-form' ? '创建账号' : '保存' }}</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>

          <view v-else-if="sheet === 'driver-reset' && editingDriver" class="driver-form-sheet" data-visual-sheet="driver-reset">
            <view class="sheet-head"><text class="sheet-title">重置密码 · {{ editingDriver.name }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <scroll-view class="sheet-scroll" scroll-y>
            <label class="form-field"><text>新密码</text><input v-model="resetPassword" type="password" placeholder="6-20 位" confirm-type="done" @confirm="confirmReset" /></label>
            <text v-if="driverFormError" class="form-error">{{ driverFormError }}</text>
            </scroll-view>
            <view class="sheet-actions sheet-foot">
              <button class="primary-button" :class="{ 'is-loading': busyAction === 'reset-password' }" :disabled="busyAction === 'reset-password'" @click="confirmReset">确认重置</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>

          <view v-else-if="sheet === 'reset-confirm'" class="driver-form-sheet" data-visual-sheet="reset-confirm">
            <view class="sheet-head"><text class="sheet-title">重置演示数据</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <scroll-view class="sheet-scroll" scroll-y>
            <text class="muted">将清空本地订单、司机与交接数据并恢复为初始演示数据（同源下其它端共享数据也会重置为演示集）。</text>
            </scroll-view>
            <view class="sheet-actions sheet-foot">
              <button class="primary-button" :class="{ 'is-loading': busyAction === 'reset-demo' }" :disabled="busyAction === 'reset-demo'" @click="confirmResetDemo">确认重置</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>

          <view v-else-if="sheet === 'driver-toggle-confirm' && driverStatusTarget" class="driver-form-sheet" data-visual-sheet="driver-toggle-confirm">
            <view class="sheet-head"><text class="sheet-title">{{ driverStatusTarget.status === 'active' ? '停用司机' : '启用司机' }}</text><button class="icon-button" aria-label="关闭" @click="closeSheet"><UiIcon name="x" :size="18" /></button></view>
            <scroll-view class="sheet-scroll" scroll-y>
            <text class="muted">{{ driverToggleMessage(driverStatusTarget) }}</text>
            </scroll-view>
            <view class="sheet-actions sheet-foot">
              <button :class="driverStatusTarget.status === 'active' ? 'danger-button' : 'primary-button'" @click="confirmToggle">{{ driverStatusTarget.status === 'active' ? '确认停用' : '确认启用' }}</button>
              <button class="outline-button" @click="closeSheet">取 消</button>
            </view>
          </view>
        </view>
      </view>
    </template>
  </view>

  <view v-if="categoryPickerOpen" class="category-picker-mask" @click.self="categoryPickerOpen = false">
    <view class="category-picker-sheet" data-visual-sheet="category-picker">
      <view class="sheet-head"><text class="sheet-title">选择商品品类</text><button class="icon-button" aria-label="关闭" @click="categoryPickerOpen = false"><UiIcon name="x" :size="18" /></button></view>
      <scroll-view class="category-picker-list" scroll-y>
        <button v-for="option in productCategoryOptions" :key="option.label" class="category-picker-option" :class="{ selected: productEditor?.category === option.label }" @click="selectProductCategory(option.label)">
          <view class="category-picker-option-main"><BusinessImage class="category-picker-option-image" :src="option.image" :fallback="defaultProductCategoryImage(option.label)" :error-fallback="defaultProductCategoryImage()" :show-error="false" mode="aspectFill" /><view><text :title="option.label">{{ option.label }}</text><small v-if="option.legacy" class="meta">历史分类</small></view></view>
          <UiIcon v-if="productEditor?.category === option.label" name="check" :size="18" />
        </button>
      </scroll-view>
    </view>
  </view>
  <view v-if="toastMsg" class="toast">{{ toastMsg }}</view>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { CatalogProduct, CatalogProductSubmission, DailyDeliveryRoute, DriverAccount, Order, PlatformDictionaryState, RouteOrigin, RouteOutboundHandoverItem, RouteOutboundShortageAllocation, RouteStop, RouteWarehouseCheckInReason, ShortageItem } from '@agritainment/shared'
import { PLATFORM_DICTIONARIES_STORAGE_KEY, aggregateRouteOutboundItems, defaultProductCategoryImage, distanceMeters, productCategoryImage, readPlatformDictionaries, validatePhone } from '@agritainment/shared'
import { PLATFORM_AUDIT_LOG_STORAGE_KEY, PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_DRIVERS_STORAGE_KEY, PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, configurePlatformProviders, createDrivingRouteOptimizationProvider, createGeocodeProviders, createId, geocodeAddress, installKeyboardButtonSupport, money, subscribePlatformChanges, todayString } from '@agritainment/shared'
import { BusinessImage, ImageUploader } from '@agritainment/ui'
import { routeOptimizationWarningText } from '../../delivery-map'
import DeliveryRouteMap from '../../components/DeliveryRouteMap.vue'
import UiIcon from '../../components/UiIcon.vue'
import { buildNavigationUrl, deliveryDistanceKm, resolveOrderStore, seedSupplierDemoRouteOnce, storeDirectory, storeInfoOf, supplierInfo, supplierWarehouseOf } from '../../services/repository'
import { useSupplierStore } from '../../stores/supplier'
import { createSharedRefreshRunner } from './shared-refresh'
import { buildProductCategoryOptions } from './product-categories'

const store = useSupplierStore()
let disposeKeyboardButtons: () => void = () => undefined
let disposeStorageSync: (() => void) | null = null
let disposePlatformChanges: (() => void) | null = null
let disposeVisibilitySync: (() => void) | null = null
const platformChangeKeys = [PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_DRIVERS_STORAGE_KEY, PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY, PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, PLATFORM_SUPPLIER_SETTLEMENTS_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY, PLATFORM_AUDIT_LOG_STORAGE_KEY, PLATFORM_DICTIONARIES_STORAGE_KEY]
const refreshSharedState = createSharedRefreshRunner(
  async () => { await store.refreshSharedState(); refreshProductCategoryLabels() },
  (error) => { store.error = error instanceof Error ? error.message : '数据加载失败' }
)
const busy = ref(false)
const busyAction = ref('')
const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

function toast(text: string) {
  toastMsg.value = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 2200)
}

async function runBusy<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (busyAction.value) return
  busyAction.value = key
  try {
    return await fn()
  } finally {
    busyAction.value = ''
  }
}

// ---------- 登录（自动填充）----------
const loginRole = ref<'supplier' | 'driver'>('supplier')
const loginAccount = ref('13787366688')
const loginPassword = ref('13787366688')

function switchLoginRole(role: 'supplier' | 'driver') {
  loginRole.value = role
  store.loginError = ''
  loginAccount.value = role === 'supplier' ? '13787366688' : 'driver01'
  loginPassword.value = role === 'supplier' ? '13787366688' : '123456'
}

function submitLogin() {
  if (!loginAccount.value.trim() || !loginPassword.value) {
    store.loginError = '请输入账号和密码'
    return
  }
  busy.value = true
  const ok = loginRole.value === 'supplier'
    ? store.loginSupplier(loginAccount.value, loginPassword.value)
    : store.loginDriver(loginAccount.value, loginPassword.value)
  busy.value = false
  if (ok) {
    toast(loginRole.value === 'supplier' ? '供应商登录成功' : `司机 ${store.auth.name} 登录成功`)
    active.value = 'orders'
    secondaryWorkspace.value = null
    void store.ensureTodayRoutes()
  }
}

function logout() {
  store.logout()
  closeSheet()
}

// ---------- 底部 tab（按角色）----------
type SupplierTab = 'orders' | 'products' | 'mine'
const active = ref<SupplierTab>('orders')
const supplierTabs = [
  { key: 'orders' as const, label: '订单', icon: 'package', badge: () => store.metrics.toAcceptCount },
  { key: 'products' as const, label: '商品', icon: 'package-check', badge: () => pendingProductCount.value },
  { key: 'mine' as const, label: '我的', icon: 'user-round', badge: () => 0 }
]
type SecondaryWorkspace = 'drivers' | 'routes' | 'outbound' | 'settlements' | 'handovers' | 'warehouse'
const secondaryWorkspace = ref<SecondaryWorkspace | null>(null)
const currentTabs = supplierTabs
function isTabActive(key: string) {
  return active.value === key
}
function switchTab(key: string) {
  secondaryWorkspace.value = null
  active.value = key as SupplierTab
  if (key === 'products') openProductWorkspace()
}
function openSecondaryWorkspace(key: SecondaryWorkspace) {
  active.value = 'mine'
  secondaryWorkspace.value = key
  if (key === 'warehouse') {
    const warehouse = supplierWarehouseOf(store.auth.supplierId, store.suppliers)
    warehouseForm.address = warehouse?.address || ''
    warehouseForm.contactName = warehouse?.contactName || ''
    warehouseForm.contactPhone = warehouse?.contactPhone || ''
  }
}
function closeSecondaryWorkspace() { secondaryWorkspace.value = null }

// ---------- 订单 ----------
const orderFilter = ref('全部')
const orderKeyword = ref('')
const orderStatusKeys = ['全部', 'submitted', 'accepted', 'shipped', 'delivering', 'received', 'cancelled', '缺货'] as const
const orderFilters = computed(() => orderStatusKeys.map((key) => ({
  key,
  label: key === '全部' ? '全部' : key === '缺货' ? '缺货' : store.statusText(key),
  count: store.supplierOrderCounts[key] ?? 0
})))
const filteredOrders = computed(() => store.supplierOrders.filter((order) => {
  const matchesFilter = orderFilter.value === '全部' || (orderFilter.value === '缺货' ? orderShortage(order).length > 0 : orderFulfillment(order).status === orderFilter.value)
  const keyword = orderKeyword.value.trim().toLowerCase()
  const matchesKeyword = !keyword || `${order.id}${order.customer}`.toLowerCase().includes(keyword)
  return matchesFilter && matchesKeyword
}))
const selectedOrder = ref<Order | null>(null)
const selectedOrderIds = ref<string[]>([])
const sheet = ref<null | 'order' | 'courier' | 'handover-out' | 'handover-in' | 'driver-form' | 'driver-edit' | 'driver-reset' | 'driver-toggle-confirm' | 'reset-confirm'>(null)

function orderFulfillment(order: Order) {
  return order.supplierFulfillment || { status: 'submitted', shortages: [], handovers: [], updatedAt: order.createdAt }
}

// ---------- 商品二级工作页 ----------
const productWorkspace = ref(false)
const productFilter = ref<'全部' | '待审核' | '已驳回' | '已下架' | '已上架'>('全部')
const productFilters = ['全部', '待审核', '已驳回', '已下架', '已上架'] as const
const productChannelOptions: CatalogProduct['channel'][] = ['store', 'live', 'all']
const productChannelLabels = ['门店采购', '用户商城', '全渠道']
const productEditor = ref<CatalogProduct | null>(null)
const productEditorFormalId = ref('')
const productFormError = ref('')
const productKeyword = ref('')
const productTagText = ref('')
const persistedSupplierSkuIds = ref<Set<string>>(new Set())
const categoryPickerOpen = ref(false)
const productCategoryState = ref<PlatformDictionaryState>(readPlatformDictionaries())
const productCategoryOptions = computed(() => buildProductCategoryOptions(productCategoryState.value, productEditor.value?.category))

function refreshProductCategoryLabels() {
  productCategoryState.value = readPlatformDictionaries()
}

function selectProductCategory(label: string) {
  if (productEditor.value) productEditor.value.category = label
  categoryPickerOpen.value = false
}

type SupplierProductRow = { key: string; product: CatalogProduct; status: 'pending' | 'rejected' | 'active' | 'offline'; submission?: CatalogProductSubmission }
const allSupplierProductRows = computed<SupplierProductRow[]>(() => {
  const formal = store.myCatalogProducts.map((product) => ({ key: `formal:${product.id}`, product, status: product.status as 'active' | 'offline' }))
  const submissions = store.myProductSubmissions.filter((item) => item.status !== 'approved').map((submission) => ({ key: `submission:${submission.id}`, product: submission.draft, status: submission.status as 'pending' | 'rejected', submission }))
  const submissionProductIds = new Set(submissions.map((row) => row.product.id))
  return [...submissions, ...formal.filter((row) => !submissionProductIds.has(row.product.id))]
})
const supplierProductRows = computed<SupplierProductRow[]>(() => {
  const keyword = productKeyword.value.trim().toLowerCase()
  return allSupplierProductRows.value.filter((row) => (productFilter.value === '全部'
    || (productFilter.value === '待审核' && row.status === 'pending')
    || (productFilter.value === '已驳回' && row.status === 'rejected')
    || (productFilter.value === '已下架' && row.status === 'offline')
    || (productFilter.value === '已上架' && row.status === 'active'))
    && (!keyword || `${row.product.name}${row.product.category}${row.product.tags.join('')}`.toLowerCase().includes(keyword)))
})
const productStatusCount = (status: SupplierProductRow['status']) => allSupplierProductRows.value.filter((row) => row.status === status).length
const productFilterStats = computed(() => productFilters.map((label) => ({ label, count: label === '全部' ? allSupplierProductRows.value.length : productStatusCount(label === '待审核' ? 'pending' : label === '已驳回' ? 'rejected' : label === '已下架' ? 'offline' : 'active') })))

function openProductWorkspace() {
  active.value = 'products'
  productWorkspace.value = true
  productEditor.value = null
}

function closeProductWorkspace() {
  productWorkspace.value = false
  productEditor.value = null
  productFormError.value = ''
  if (active.value === 'products') active.value = 'orders'
}

function openNewProduct() {
  refreshProductCategoryLabels()
  const supplier = store.currentSupplier
  productEditorFormalId.value = ''
  productEditor.value = {
    id: createId('P'), name: '', category: productCategoryOptions.value[0]?.label || '农产品', supplierId: store.auth.supplierId, supplierName: supplier?.name || store.auth.name,
    source: 'platform', status: 'active', image: '', images: [], tags: [], productType: 'goods', expressDelivery: true,
    channel: 'live', farmIds: [], promoterCommissionRate: 5, storeCommissionRate: 3,
    skus: [{ id: createId('SKU'), name: '默认规格', image: '', retailPrice: 59.9, cost: 30, stock: 0, minimumOrderQuantity: 1, level1Amount: 10, level2Amount: 15, status: 'active' }]
  }
  productTagText.value = ''
  persistedSupplierSkuIds.value = new Set()
  productFormError.value = ''
}

function openProductEditor(product: CatalogProduct, submission?: CatalogProductSubmission) {
  refreshProductCategoryLabels()
  productEditor.value = JSON.parse(JSON.stringify(submission?.draft || product)) as CatalogProduct
  productEditorFormalId.value = store.myCatalogProducts.some((item) => item.id === product.id) ? product.id : ''
  productTagText.value = productEditor.value.tags.join('，')
  persistedSupplierSkuIds.value = new Set(product.skus.map((sku) => sku.id))
  productFormError.value = ''
}

function cancelProductEditor() {
  categoryPickerOpen.value = false
  productEditor.value = null
  productFormError.value = ''
}

function addSupplierSku() {
  if (!productEditor.value) return
  productEditor.value.skus.push({ id: createId('SKU'), name: `规格 ${productEditor.value.skus.length + 1}`, image: productEditor.value.image, retailPrice: 0, cost: 0, stock: 0, minimumOrderQuantity: 1, level1Amount: 0, level2Amount: 0, status: 'active' })
}

function removeSupplierSku(index: number) {
  if (!productEditor.value) return
  const activeSkus = productEditor.value.skus.filter((sku) => sku.status !== 'retired')
  if (activeSkus.length <= 1) { productFormError.value = 'SKU 至少保留一个有效规格'; return }
  const sku = productEditor.value.skus[index]
  if (!sku) return
  if (persistedSupplierSkuIds.value.has(sku.id)) sku.status = 'retired'
  else productEditor.value.skus.splice(index, 1)
}

function restoreSupplierSku(index: number) {
  const sku = productEditor.value?.skus[index]
  if (sku) sku.status = 'active'
}

function setProductChannel(event: { detail: { value: string | number } }) {
  if (productEditor.value) productEditor.value.channel = productChannelOptions[Number(event.detail.value)] || 'store'
}

function productChannelLabel(channel: CatalogProduct['channel']) {
  return channel === 'store' ? '门店采购' : channel === 'live' ? '用户商城' : '全渠道'
}

function setProductFilter(event: { detail: { value: string | number } }) {
  const index = Number(event.detail.value)
  productFilter.value = productFilters[index] || productFilter.value
}

function validateSupplierProduct(product: CatalogProduct) {
  if (!product.image) return '请上传商品主图'
  if (!product.name.trim() || !product.category.trim() || !product.skus.some((sku) => sku.status !== 'retired')) return '请完善商品名称、品类和有效 SKU'
  for (const sku of product.skus.filter((item) => item.status !== 'retired')) {
    if (!sku.name.trim() || [sku.retailPrice, sku.cost, sku.stock, sku.level1Amount, sku.level2Amount].some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) return 'SKU 金额和库存不能为负数'
    if (!Number.isInteger(Number(sku.minimumOrderQuantity)) || Number(sku.minimumOrderQuantity) < 0) return '起订量必须为大于等于 0 的整数'
    if (Number(sku.retailPrice) < Number(sku.level1Amount) + Number(sku.level2Amount)) return '零售价不能低于分销金额合计'
  }
  return ''
}

async function submitSupplierProduct() {
  if (!productEditor.value) return
  const draft: CatalogProduct = {
    ...productEditor.value,
    name: productEditor.value.name.trim(),
    category: productEditor.value.category.trim(),
    tags: productTagText.value.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
    skus: productEditor.value.skus.map((sku) => ({ ...sku, name: sku.name.trim(), image: sku.image || productEditor.value!.image }))
  }
  const error = validateSupplierProduct(draft)
  if (error) { productFormError.value = error; return }
  await runBusy('submit-product', async () => {
    const result = await store.submitCatalogProduct(draft)
    if (!result.ok) { productFormError.value = result.message; return }
    productEditor.value = null
    toast('商品已提交审核')
  })
}

async function saveSupplierProductStock() {
  if (!productEditor.value || !productEditorFormalId.value) return
  const changes = productEditor.value.skus.filter((sku) => persistedSupplierSkuIds.value.has(sku.id)).map((sku) => ({ skuId: sku.id, stock: Number(sku.stock) }))
  await runBusy('save-stock', async () => {
    const result = await store.adjustCatalogProductStock(productEditorFormalId.value, changes)
    if (!result.ok) { productFormError.value = result.message; return }
    productEditor.value = null
    toast('库存已更新')
  })
}

async function toggleSupplierProduct(product: CatalogProduct) {
  await runBusy('toggle-product', async () => {
    const result = await store.toggleCatalogProduct(product.id)
    toast(result.ok ? (product.status === 'active' ? '商品已下架' : '商品已上架') : result.message)
  })
}

// ---------- 命名线路、每日线路与仓点 ----------
const pendingProductCount = computed(() => store.myProductSubmissions.filter((item) => item.status === 'pending').length)
const routeBusy = ref(false)
const warehouseForm = reactive<{ address: string; contactName: string; contactPhone: string }>({ address: '', contactName: '', contactPhone: '' })
const supplierWorkItems: Array<{ key: SecondaryWorkspace; label: string; icon: string; detail: string }> = [
  { key: 'drivers', label: '司机管理', icon: 'users', detail: '账号与启用状态' },
  { key: 'routes', label: '线路规划', icon: 'navigation', detail: '命名线路、门店顺序与派司机' },
  { key: 'outbound', label: '出仓交接', icon: 'package-check', detail: '司机发起、供应商审核与缺货标记' },
  { key: 'settlements', label: '结算账单', icon: 'package-check', detail: '查看账期和关联订单' },
  { key: 'handovers', label: '交接日志', icon: 'list-tree', detail: '出库和到店交接记录' },
  { key: 'warehouse', label: '仓点设置', icon: 'map-pin', detail: '按地址解析仓点坐标' }
]
const outboundDate = ref(todayString())
const outboundRouteId = ref('')
const outboundActuals = reactive<Record<string, number>>({})
const outboundNote = ref('')
const driverRouteDetailId = ref('')
const driverStoreDetailId = ref('')
const driverOutboundView = ref(false)
const driverHandoverActuals = reactive<Record<string, number>>({})
const driverHandoverNote = ref('')
const driverHandoverProofs = ref<string[]>([])
const driverShortageDraft = reactive<Record<string, number>>({})
const driverShortageNotes = reactive<Record<string, string>>({})
const driverWarehouseView = ref(false)
const driverShortageView = ref(false)
type DriverRouteFilter = '待配送' | '配送中' | '已完成'
type DriverRouteStage = 'pending_checkin' | 'pending_submission' | 'pending_review' | 'rejected' | 'pending_shortage' | 'ready_to_dispatch' | 'delivering' | 'completed'
type DriverStopStage = 'waiting' | 'in_transit' | 'checked_in' | 'completed'
const driverRouteFilter = ref<DriverRouteFilter>('待配送')
const driverRouteFilterOptions = ['待配送', '配送中', '已完成'] as const
const driverRouteDisplayMode = ref<'list' | 'map'>('list')
const driverSelectedStopId = ref('')
const driverAuxView = ref<'data' | 'handovers' | null>(null)
const driverDataDate = ref(todayString())
const driverDataKeyword = ref('')
const warehouseAbnormalMode = ref(false)
const warehouseAbnormalReason = ref<RouteWarehouseCheckInReason | ''>('')
const warehouseAbnormalNote = ref('')
const warehouseAbnormalOptions: Array<{ value: RouteWarehouseCheckInReason; label: string }> = [
  { value: 'location_failed', label: '定位失败' },
  { value: 'device_issue', label: '设备异常' },
  { value: 'warehouse_coordinate_error', label: '仓点坐标错误' },
  { value: 'other', label: '其他' }
]
const expandedOutboundItems = ref<string[]>([])
const warehouseDistanceM = ref<number | null>(null)
const warehouseLocationError = ref('')
const outboundShowDifferences = ref(false)
const outboundKeyword = ref('')
const supplierRejectMode = ref(false)
const supplierRejectionReason = ref('')
const filteredTodayDriverRoutes = computed(() => store.todayDriverRoutes.filter((route) => routeExecutionStatus(route) === driverRouteFilter.value))
const driverTodayRouteCount = computed(() => store.todayDriverRoutes.length)
const driverCompletedStoreCount = computed(() => store.todayDriverRoutes.reduce((sum, route) => sum + driverRouteProgress(route).completed, 0))
const driverPendingShortageRouteCount = computed(() => store.todayDriverRoutes.filter((route) => driverRouteStage(route) === 'pending_shortage').length)
const driverWarehouseHistory = computed(() => store.dailyRoutes
  .filter((route) => route.supplierId === store.auth.supplierId && route.driverId === store.auth.driverId && route.warehouseCheckIn)
  .sort((left, right) => (right.warehouseCheckIn?.at || '').localeCompare(left.warehouseCheckIn?.at || '')))
const supplierOutboundRoutes = computed(() => store.dailyRoutes
  .filter((route) => route.supplierId === store.auth.supplierId && route.deliveryDate === outboundDate.value)
  .sort((left, right) => {
    const rank = (route: DailyDeliveryRoute) => route.outboundHandover?.status === 'pending_supplier' ? 0 : route.outboundHandover?.status === 'pending_dispatch' ? 1 : route.status === 'completed' ? 3 : 2
    return rank(left) - rank(right) || left.id.localeCompare(right.id)
  }))
const selectedOutboundRoute = computed(() => store.dailyRoutes.find((route) => route.id === outboundRouteId.value && route.supplierId === store.auth.supplierId) || null)
const selectedOutboundOrders = computed(() => outboundRouteOrders(selectedOutboundRoute.value))
const selectedOutboundItems = computed<RouteOutboundHandoverItem[]>(() => {
  const handover = selectedOutboundRoute.value?.outboundHandover
  return handover?.items.length ? handover.items : aggregateRouteOutboundItems(selectedOutboundOrders.value)
})
const selectedDriverRoute = computed(() => store.dailyRoutes.find((route) => route.id === driverRouteDetailId.value && route.supplierId === store.auth.supplierId && route.driverId === store.auth.driverId) || store.currentDriverRoute)
const selectedDriverRouteOrders = computed(() => outboundRouteOrders(selectedDriverRoute.value))
const driverNextStop = computed(() => selectedDriverRoute.value?.stops.find((stop) => !stop.completedAt && stop.completedOrderIds?.length !== stop.orderIds.length) || null)
const selectedDriverRouteItems = computed<RouteOutboundHandoverItem[]>(() => selectedDriverRoute.value?.outboundHandover?.items.length ? selectedDriverRoute.value.outboundHandover.items : aggregateRouteOutboundItems(selectedDriverRouteOrders.value))
const selectedDriverStop = computed(() => selectedDriverRoute.value?.stops.find((stop) => stop.storeId === driverStoreDetailId.value) || null)
const selectedDriverStopOrders = computed(() => selectedDriverStop.value ? stopOrders(selectedDriverStop.value) : [])
const selectedDriverStopItems = computed(() => aggregateRouteOutboundItems(selectedDriverStopOrders.value))
const filteredSelectedOutboundItems = computed(() => selectedOutboundItems.value.filter((item) => {
  const keyword = outboundKeyword.value.trim().toLowerCase()
  const matchesKeyword = !keyword || `${item.name}${item.skuName}`.toLowerCase().includes(keyword)
  const matchesDifference = !outboundShowDifferences.value || item.expected !== outboundItemActual(item)
  return matchesKeyword && matchesDifference
}))
const filteredSelectedDriverRouteItems = computed(() => selectedDriverRouteItems.value.filter((item) => {
  const keyword = outboundKeyword.value.trim().toLowerCase()
  const matchesKeyword = !keyword || `${item.name}${item.skuName}`.toLowerCase().includes(keyword)
  const matchesDifference = !outboundShowDifferences.value || item.expected !== outboundItemActual(item)
  return matchesKeyword && matchesDifference
}))
const driverDataRoutes = computed(() => store.dailyRoutes
  .filter((route) => route.supplierId === store.auth.supplierId && route.driverId === store.auth.driverId && route.status !== 'draft')
  .sort((left, right) => right.deliveryDate.localeCompare(left.deliveryDate) || (right.publishedAt || right.generatedAt).localeCompare(left.publishedAt || left.generatedAt) || right.id.localeCompare(left.id)))
const filteredDriverDataRoutes = computed(() => {
  const keyword = driverDataKeyword.value.trim().toLowerCase()
  return driverDataRoutes.value.filter((route) => {
    const matchesDate = !driverDataDate.value || route.deliveryDate === driverDataDate.value
    const searchable = [
      driverRouteName(route),
      route.deliveryDate,
      driverRouteStageText(route),
      routeDriverName(route),
      warehouseName(route),
      ...route.stops.flatMap((stop) => [stop.storeName, ...stop.orderIds])
    ].join(' ').toLowerCase()
    return matchesDate && (!keyword || searchable.includes(keyword))
  })
})
const driverDataTitle = computed(() => driverDataDate.value === todayString()
  ? '今天配送数据'
  : driverDataDate.value ? `${driverDataDate.value} 配送数据` : '全部配送数据')
const driverDataEmptyText = computed(() => driverDataKeyword.value.trim()
  ? '没有符合条件的配送数据'
  : driverDataDate.value ? '该配送日暂无配送数据' : '暂无配送数据')
const driverDeliverySummary = computed(() => {
  const routes = filteredDriverDataRoutes.value
  const routeOrders = routes.flatMap((route) => outboundRouteOrders(route))
  const storeIds = new Set(routes.flatMap((route) => route.stops.map((stop) => stop.storeId)))
  return {
    routeCount: routes.length,
    storeCount: storeIds.size,
    itemCount: routeOrders.reduce((sum, order) => sum + (order.items || []).reduce((lineSum, item) => lineSum + item.quantity, 0), 0),
    shortageCount: routes.reduce((sum, route) => sum + (route.outboundHandover?.shortageAllocations || []).reduce((lineSum, item) => lineSum + item.quantity, 0), 0),
    completionRate: routes.length ? Math.round(routes.filter((route) => route.status === 'completed').length / routes.length * 100) : 0
  }
})
const driverDeliveryGroups = computed(() => {
  const groups = new Map<string, DailyDeliveryRoute[]>()
  for (const route of filteredDriverDataRoutes.value) {
    const list = groups.get(route.deliveryDate) || []
    list.push(route)
    groups.set(route.deliveryDate, list)
  }
  return [...groups.entries()].map(([date, routes]) => ({ date, routes }))
})
const canDispatchRoute = computed(() => {
  const route = selectedDriverRoute.value
  const handover = route?.outboundHandover
  if (!route || !handover || handover.status !== 'pending_dispatch') return false
  return handover.items.every((item) => driverShortageRemaining(route, item) === 0)
})
function resetNumberRecord(record: Record<string, number>) {
  Object.keys(record).forEach((key) => { delete record[key] })
}
function driverRouteStage(route: DailyDeliveryRoute): DriverRouteStage {
  if (route.status === 'completed') return 'completed'
  const handover = route.outboundHandover
  if (!route.warehouseCheckIn) return 'pending_checkin'
  if (!handover) return 'pending_submission'
  if (handover.status === 'pending_supplier') return 'pending_review'
  if (handover.status === 'rejected') return 'rejected'
  if (handover.status === 'pending_dispatch') return outboundHasShortage(route) ? 'pending_shortage' : 'ready_to_dispatch'
  return 'delivering'
}
function driverRouteStageText(route: DailyDeliveryRoute) {
  const stage = driverRouteStage(route)
  return stage === 'pending_checkin' ? '待到仓打卡'
    : stage === 'pending_submission' ? '待提交交接'
      : stage === 'pending_review' ? '审核中'
        : stage === 'rejected' ? '审核不通过'
          : stage === 'pending_shortage' ? '待标记缺货'
            : stage === 'ready_to_dispatch' ? '待发车'
              : stage === 'completed' ? '已完成' : '配送中'
}
function driverStopStage(route: DailyDeliveryRoute, stop: RouteStop): DriverStopStage {
  if (stop.completedAt || stop.completedOrderIds?.length === stop.orderIds.length) return 'completed'
  if (stop.checkIn) return 'checked_in'
  return route.outboundHandover?.status === 'dispatched' ? 'in_transit' : 'waiting'
}
function driverStopStageText(route: DailyDeliveryRoute, stop: RouteStop) {
  const stage = driverStopStage(route, stop)
  return stage === 'completed' ? '已完成' : stage === 'checked_in' ? '已到店' : stage === 'in_transit' ? '配送中' : '待配送'
}
function driverRouteProgress(route: DailyDeliveryRoute) {
  const total = route.stops.length
  const completed = route.stops.filter((stop) => driverStopStage(route, stop) === 'completed').length
  return { completed, total, percent: total ? Math.round(completed / total * 100) : 0 }
}
function setDriverDataDate(event: { detail: { value: string } }) {
  driverDataDate.value = event.detail.value
}
function saveDriverAuxFilters() {
  driverAuxFilterSnapshot = { date: driverDataDate.value, dataKeyword: driverDataKeyword.value, handoverKeyword: handoverKeyword.value }
}
function restoreDriverAuxFilters() {
  driverDataDate.value = driverAuxFilterSnapshot.date
  driverDataKeyword.value = driverAuxFilterSnapshot.dataKeyword
  handoverKeyword.value = driverAuxFilterSnapshot.handoverKeyword
}
function openDriverAux(view: 'data' | 'handovers') {
  restoreDriverAuxFilters()
  driverAuxView.value = view
}
function closeDriverAux() {
  saveDriverAuxFilters()
  driverAuxView.value = null
}
function warehouseCheckInLabel(route: DailyDeliveryRoute) {
  const checkIn = route.warehouseCheckIn
  if (!checkIn) return '到仓后完成打卡，才能发起出仓交接'
  if (checkIn.type === 'abnormal') return `异常打卡 · ${warehouseReasonLabel(checkIn.reasonCode)}`
  return `已打卡 · 距仓点 ${checkIn.distanceM ?? 0} 米`
}
function canMoveDriverStop(route: DailyDeliveryRoute, index: number, direction: -1 | 1) {
  const nextIndex = index + direction
  if (selectedDriverRoute.value?.outboundHandover?.status !== 'dispatched') return false
  if (nextIndex < 0 || nextIndex >= route.stops.length) return false
  const current = route.stops[index]
  const target = route.stops[nextIndex]
  return !current.completedAt && !target.completedAt
}
function warehouseCheckInBadgeClass(route: DailyDeliveryRoute) {
  if (isAbnormalWarehouseCheckIn(route)) return 'rejected'
  return route.warehouseCheckIn ? 'received' : 'warning-tag'
}
function warehouseCheckInStatusText(route: DailyDeliveryRoute) {
  if (isAbnormalWarehouseCheckIn(route)) return '异常打卡'
  return route.warehouseCheckIn ? '已打卡' : '待打卡'
}
function warehouseReasonLabel(reason?: RouteWarehouseCheckInReason) {
  return warehouseAbnormalOptions.find((item) => item.value === reason)?.label || '异常'
}
function isAbnormalWarehouseCheckIn(route: DailyDeliveryRoute) {
  return route.warehouseCheckIn?.type === 'abnormal'
}
function routeExecutionStatus(route: DailyDeliveryRoute): DriverRouteFilter {
  const stage = driverRouteStage(route)
  if (stage === 'delivering') return '配送中'
  if (stage === 'completed') return '已完成'
  return '待配送'
}
function routeWarehouse(route: DailyDeliveryRoute) {
  return supplierWarehouseOf(route.supplierId, store.suppliers)
}
function warehouseName(route: DailyDeliveryRoute) {
  return routeWarehouse(route)?.contact || store.currentSupplier?.name || '供应商仓库'
}
function warehouseAddress(route: DailyDeliveryRoute) {
  return routeWarehouse(route)?.address || '仓库地址待维护'
}
function outboundHasShortage(route: DailyDeliveryRoute) {
  return (route.outboundHandover?.items || []).some((item) => item.expected > outboundItemActual(item))
}
function routeActionLabel(route: DailyDeliveryRoute) {
  if (!route.warehouseCheckIn) return '到仓打卡'
  const handover = route.outboundHandover
  if (!handover) return '提交出仓交接'
  if (handover.status === 'pending_supplier') return '查看审核'
  if (handover.status === 'rejected') return '重新提交'
  if (handover.status === 'pending_dispatch') return outboundHasShortage(route) ? '标记缺货' : '发车'
  return route.status === 'completed' ? '配送记录' : '配送门店'
}
function toggleOutboundItem(skuId: string) {
  const index = expandedOutboundItems.value.indexOf(skuId)
  if (index >= 0) expandedOutboundItems.value.splice(index, 1)
  else expandedOutboundItems.value.push(skuId)
}
function isOutboundItemExpanded(skuId: string) {
  return expandedOutboundItems.value.includes(skuId)
}
function outboundItemStoreExpected(route: DailyDeliveryRoute, item: RouteOutboundHandoverItem, stop: RouteStop) {
  return storeSkuQuantity(stop, item.skuId)
}
function outboundItemStoreActualText(route: DailyDeliveryRoute, item: RouteOutboundHandoverItem, stop: RouteStop) {
  const handover = route.outboundHandover
  if (!handover) return '待提交'
  if (handover.status === 'pending_supplier') return '待审核'
  if (handover.status === 'rejected') return '待重提'
  const expected = outboundItemStoreExpected(route, item, stop)
  const shortage = item.expected - outboundItemActual(item)
  if (shortage <= 0) return String(expected)
  const allocation = handover.shortageAllocations.find((entry) => entry.skuId === item.skuId && entry.storeId === stop.storeId)
  return allocation ? String(expected - allocation.quantity) : '待分配'
}
function outboundItemStoreNote(route: DailyDeliveryRoute, item: RouteOutboundHandoverItem, stop: RouteStop) {
  return route.outboundHandover?.shortageAllocations.find((entry) => entry.skuId === item.skuId && entry.storeId === stop.storeId)?.note || ''
}
function openDriverRouteAction(route: DailyDeliveryRoute) {
  if (!route.warehouseCheckIn) { openDriverWarehouse(route); return }
  const handover = route.outboundHandover
  if (!handover || handover.status === 'rejected') { openDriverOutbound(route); return }
  if (handover.status === 'pending_supplier') { openDriverRoute(route); openDriverOutbound(route); return }
  if (handover.status === 'pending_dispatch') {
    if (outboundHasShortage(route)) openDriverShortage(route)
    else void dispatchDriverRoute(route)
    return
  }
  openDriverRoute(route)
}
function storeSkuShortage(route: DailyDeliveryRoute, stop: RouteStop, skuId: string) {
  return (route.outboundHandover?.shortageAllocations || [])
    .filter((allocation) => allocation.storeId === stop.storeId && allocation.skuId === skuId)
    .reduce((sum, allocation) => sum + allocation.quantity, 0)
}
function storeSkuShortageNote(route: DailyDeliveryRoute, stop: RouteStop, skuId: string) {
  return (route.outboundHandover?.shortageAllocations || []).find((allocation) => allocation.storeId === stop.storeId && allocation.skuId === skuId)?.note || ''
}
function outboundRouteOrders(route: DailyDeliveryRoute | null | undefined) {
  if (!route) return []
  const ids = new Set(route.sourceOrderIds)
  return store.orders.filter((order) => ids.has(order.id))
}
function routeGoodsQuantity(route: DailyDeliveryRoute) {
  return outboundRouteOrders(route).reduce((sum, order) => sum + (order.items || []).reduce((lineSum, item) => lineSum + item.quantity, 0), 0)
}
function routeGoodsKinds(route: DailyDeliveryRoute) {
  return new Set(outboundRouteOrders(route).flatMap((order) => (order.items || []).map((item) => item.skuId))).size
}
function routeDriverName(route: DailyDeliveryRoute) {
  return store.visibleDrivers.find((driver) => driver.id === route.driverId)?.name || route.driverId
}
function driverOrderRoute(order: Order) {
  return store.dailyRoutes.find((route) => route.sourceOrderIds.includes(order.id)) || null
}
function driverOrderRouteName(order: Order) {
  const route = driverOrderRoute(order)
  return route ? driverRouteName(route) : '配送线路'
}
function driverOrderCompletedAt(order: Order) {
  const route = driverOrderRoute(order)
  const stop = route?.stops.find((item) => item.orderIds.includes(order.id))
  return stop?.completedAt?.replace('T', ' ').slice(0, 16) || order.supplierFulfillment?.updatedAt?.replace('T', ' ').slice(0, 16) || ''
}
function outboundStatusText(route: DailyDeliveryRoute) {
  const handover = route.outboundHandover
  if (!route.warehouseCheckIn) return '待到仓打卡'
  if (!handover) return '待提交交接'
  if (handover.status === 'pending_supplier') return '待供应商审核'
  if (handover.status === 'rejected') return '审核不通过'
  if (handover.status === 'pending_dispatch') return handover.items.some((item) => item.expected > (item.supplierActual ?? item.driverActual)) ? '待标记缺货' : '待司机发车'
  return route.status === 'completed' ? '已完成' : '配送中'
}
function outboundItemActual(item: RouteOutboundHandoverItem) {
  return item.supplierActual ?? item.driverActual
}
function openOutboundRoute(route: DailyDeliveryRoute) {
  outboundRouteId.value = route.id
  outboundNote.value = route.outboundHandover?.supplierNote || route.outboundHandover?.driverNote || ''
  supplierRejectMode.value = false
  supplierRejectionReason.value = ''
  outboundKeyword.value = ''
  outboundShowDifferences.value = false
  resetNumberRecord(outboundActuals)
  const items = route.outboundHandover?.items.length ? route.outboundHandover.items : aggregateRouteOutboundItems(outboundRouteOrders(route))
  items.forEach((item) => { outboundActuals[item.skuId] = outboundItemActual(item) })
}
function closeOutboundRoute() {
  outboundRouteId.value = ''
  outboundNote.value = ''
  supplierRejectMode.value = false
  supplierRejectionReason.value = ''
  outboundKeyword.value = ''
  outboundShowDifferences.value = false
  resetNumberRecord(outboundActuals)
}
function openDriverRoute(route: DailyDeliveryRoute) {
  driverRouteDetailId.value = route.id
  driverSelectedStopId.value = route.stops.find((stop) => !stop.completedAt && stop.completedOrderIds?.length !== stop.orderIds.length)?.storeId || ''
  driverStoreDetailId.value = ''
  driverOutboundView.value = false
  driverWarehouseView.value = false
  driverShortageView.value = false
  driverRouteDisplayMode.value = 'list'
  expandedOutboundItems.value = []
  warehouseDistanceM.value = null
  warehouseLocationError.value = ''
  selectDriverRoute(route.id)
}
function openDriverStore(storeId: string) {
  driverStoreDetailId.value = storeId
}
function closeDriverStore() { driverStoreDetailId.value = '' }
function closeDriverRoute() {
  driverAuxView.value = null
  driverRouteDetailId.value = ''
  driverStoreDetailId.value = ''
  driverOutboundView.value = false
  driverWarehouseView.value = false
  driverShortageView.value = false
  driverSelectedStopId.value = ''
  expandedOutboundItems.value = []
  warehouseDistanceM.value = null
  warehouseLocationError.value = ''
}
function driverAllocationKey(skuId: string, storeId: string) {
  return `${skuId}\u0000${storeId}`
}
function stopContainsSku(_route: DailyDeliveryRoute, stop: RouteStop, skuId: string) {
  return store.orders.some((order) => stop.orderIds.includes(order.id) && (order.items || []).some((item) => item.skuId === skuId))
}
function initializeDriverShortageDraft(route: DailyDeliveryRoute) {
  resetNumberRecord(driverShortageDraft)
  Object.keys(driverShortageNotes).forEach((key) => { delete driverShortageNotes[key] })
  const handover = route.outboundHandover
  if (!handover || handover.status !== 'pending_dispatch') return
  handover.shortageAllocations.forEach((allocation) => {
    driverShortageDraft[driverAllocationKey(allocation.skuId, allocation.storeId)] = allocation.quantity
    if (allocation.note) driverShortageNotes[driverAllocationKey(allocation.skuId, allocation.storeId)] = allocation.note
  })
  for (const item of handover.items) {
    const shortage = item.expected - outboundItemActual(item)
    if (shortage <= 0) continue
    const eligible = route.stops.filter((stop) => stopContainsSku(route, stop, item.skuId))
    if (eligible.length === 1) driverShortageDraft[driverAllocationKey(item.skuId, eligible[0].storeId)] = shortage
  }
}
function openDriverOutbound(route: DailyDeliveryRoute) {
  driverRouteDetailId.value = route.id
  driverStoreDetailId.value = ''
  driverOutboundView.value = true
  driverWarehouseView.value = false
  driverShortageView.value = false
  driverHandoverNote.value = route.outboundHandover?.driverNote || ''
  driverHandoverProofs.value = [...(route.outboundHandover?.proofImages || [])]
  outboundKeyword.value = ''
  outboundShowDifferences.value = false
  resetNumberRecord(driverHandoverActuals)
  const items = route.outboundHandover?.items.length ? route.outboundHandover.items : aggregateRouteOutboundItems(outboundRouteOrders(route))
  items.forEach((item) => { driverHandoverActuals[item.skuId] = outboundItemActual(item) })
  initializeDriverShortageDraft(route)
}
function closeDriverOutbound() {
  driverOutboundView.value = false
  driverHandoverNote.value = ''
  driverHandoverProofs.value = []
  outboundKeyword.value = ''
  outboundShowDifferences.value = false
  resetNumberRecord(driverHandoverActuals)
}
function driverShortageRemaining(route: DailyDeliveryRoute, item: RouteOutboundHandoverItem) {
  const shortage = item.expected - outboundItemActual(item)
  if (shortage <= 0) return 0
  const allocated = route.stops.reduce((sum, stop) => sum + Number(driverShortageDraft[driverAllocationKey(item.skuId, stop.storeId)] || 0), 0)
  return shortage - allocated
}
function driverItemStores(route: DailyDeliveryRoute, item: RouteOutboundHandoverItem) {
  return route.stops.filter((stop) => stopContainsSku(route, stop, item.skuId))
}
function storeSkuQuantity(stop: RouteStop, skuId: string) {
  const ids = new Set(stop.orderIds)
  return store.orders.filter((order) => ids.has(order.id)).reduce((sum, order) => sum + (order.items || []).filter((item) => item.skuId === skuId).reduce((lineSum, item) => lineSum + item.quantity, 0), 0)
}
function getCurrentLocation() {
  return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    uni.getLocation({ type: 'gcj02', success: (res) => resolve({ latitude: res.latitude, longitude: res.longitude }), fail: reject })
  })
}
function openDriverWarehouse(route: DailyDeliveryRoute) {
  driverRouteDetailId.value = route.id
  warehouseAbnormalMode.value = false
  warehouseAbnormalReason.value = ''
  warehouseAbnormalNote.value = ''
  driverWarehouseView.value = true
  driverOutboundView.value = false
  driverShortageView.value = false
  driverStoreDetailId.value = ''
  void refreshWarehouseDistance(route)
}
function closeDriverWarehouse() {
  driverWarehouseView.value = false
  warehouseAbnormalMode.value = false
  warehouseDistanceM.value = null
  warehouseLocationError.value = ''
}
function openDriverShortage(route: DailyDeliveryRoute) {
  driverRouteDetailId.value = route.id
  driverShortageView.value = true
  driverOutboundView.value = false
  driverWarehouseView.value = false
  driverStoreDetailId.value = ''
  initializeDriverShortageDraft(route)
}
function closeDriverShortage() {
  driverShortageView.value = false
  resetNumberRecord(driverShortageDraft)
  Object.keys(driverShortageNotes).forEach((key) => { delete driverShortageNotes[key] })
}
async function refreshWarehouseDistance(route: DailyDeliveryRoute) {
  warehouseLocationError.value = ''
  try {
    const location = await getCurrentLocation()
    if (!route.origin) { warehouseDistanceM.value = null; warehouseLocationError.value = '仓点坐标待维护'; return }
    warehouseDistanceM.value = distanceMeters(route.origin, location)
  } catch {
    warehouseDistanceM.value = null
    warehouseLocationError.value = '无法获取定位，请开启定位权限'
  }
}
async function checkInWarehouse(route: DailyDeliveryRoute) {
  await runBusy('warehouse-checkin', async () => {
    try {
      const location = await getCurrentLocation()
      if (route.origin) warehouseDistanceM.value = distanceMeters(route.origin, location)
      const result = await store.checkInWarehouse(route.id, location)
      toast(result.ok ? `到仓打卡成功，距仓点 ${result.value?.distanceM} 米` : result.message)
    } catch {
      warehouseLocationError.value = '无法获取定位，请开启定位权限'
      toast(warehouseLocationError.value)
    }
  })
}
async function submitAbnormalWarehouseCheckIn(route: DailyDeliveryRoute) {
  if (!warehouseAbnormalReason.value) { toast('请选择异常打卡原因'); return }
  if (warehouseAbnormalReason.value === 'other' && !warehouseAbnormalNote.value.trim()) { toast('请填写其他异常原因'); return }
  await runBusy('warehouse-abnormal-checkin', async () => {
    let location: RouteOrigin | undefined
    try { location = await getCurrentLocation() } catch { location = undefined }
    const result = await store.checkInWarehouseAbnormal(route.id, { reasonCode: warehouseAbnormalReason.value as RouteWarehouseCheckInReason, reasonNote: warehouseAbnormalNote.value.trim() || undefined, location })
    if (result.ok) {
      warehouseAbnormalMode.value = false
      warehouseAbnormalReason.value = ''
      warehouseAbnormalNote.value = ''
      toast('异常打卡已提交，可继续出仓交接')
    } else toast(result.message)
  })
}
async function submitDriverOutbound(route: DailyDeliveryRoute) {
  if (!driverHandoverProofs.value.length) { toast('请至少上传 1 张出仓凭证'); return }
  await runBusy('submit-outbound', async () => {
    const result = await store.submitRouteOutbound(route.id, { actuals: { ...driverHandoverActuals }, proofImages: [...driverHandoverProofs.value], note: driverHandoverNote.value.trim() || undefined })
    toast(result.ok ? '出仓交接已提交，等待供应商审核' : result.message)
  })
}
async function reviewSupplierOutbound(route: DailyDeliveryRoute) {
  await runBusy('review-outbound', async () => {
    const result = await store.reviewRouteOutbound(route.id, { decision: 'confirm', actuals: { ...outboundActuals }, note: outboundNote.value.trim() || undefined })
    if (result.ok) { toast('交接单已审核锁定'); closeOutboundRoute() }
    else toast(result.message)
  })
}
async function rejectSupplierOutbound(route: DailyDeliveryRoute) {
  if (!supplierRejectionReason.value.trim()) { toast('请填写驳回原因'); return }
  await runBusy('reject-outbound', async () => {
    const result = await store.reviewRouteOutbound(route.id, { decision: 'reject', reason: supplierRejectionReason.value.trim() })
    if (result.ok) { toast('已驳回，等待司机重新提交'); closeOutboundRoute() }
    else toast(result.message)
  })
}
async function markDriverShortages(route: DailyDeliveryRoute) {
  await runBusy('mark-outbound-shortages', async () => {
    const allocations: RouteOutboundShortageAllocation[] = []
    for (const item of route.outboundHandover?.items || []) {
      for (const stop of driverItemStores(route, item)) {
        const quantity = Number(driverShortageDraft[driverAllocationKey(item.skuId, stop.storeId)] || 0)
        if (quantity > 0) {
          const note = driverShortageNotes[driverAllocationKey(item.skuId, stop.storeId)]?.trim()
          allocations.push({ skuId: item.skuId, storeId: stop.storeId, quantity, ...(note ? { note } : {}) })
        }
      }
    }
    const result = await store.markRouteShortages(route.id, allocations)
    if (result.ok) { toast('门店缺货已标记，可以发车'); closeDriverShortage() }
    else toast(result.message)
  })
}
async function moveDriverStop(route: DailyDeliveryRoute, index: number, direction: -1 | 1) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= route.stops.length) return
  const current = route.stops[index]
  const target = route.stops[nextIndex]
  if (current.completedAt || target.completedAt) { toast('已完成门店不可调整顺序'); return }
  const ids = route.stops.map((stop) => stop.storeId)
  ;[ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]]
  await runBusy('reorder-stops', async () => {
    const result = await store.reorderRouteStops(route.id, ids)
    toast(result.ok ? '门店顺序已更新' : result.message)
  })
}
function callStore(phone?: string) {
  if (!phone) { toast('门店电话待维护'); return }
  uni.makePhoneCall({ phoneNumber: phone })
}
async function dispatchDriverRoute(route: DailyDeliveryRoute) {
  await runBusy('dispatch-route', async () => {
    const result = await store.dispatchRoute(route.id)
    if (result.ok) { toast('已发车，线路进入配送中'); closeDriverShortage(); closeDriverOutbound() }
    else toast(result.message)
  })
}
async function handoverDriverStop(route: DailyDeliveryRoute, stop: RouteStop) {
  await runBusy('store-handover', async () => {
    const result = await store.handoverRouteStop(route.id, stop.storeId)
    if (result.ok) { toast('到店交接完成'); closeDriverStore() }
    else toast(result.message)
  })
}
const routeOrderCount = computed(() => store.currentDriverRoute?.sourceOrderIds.length || 0)
const routeCompletedOrderCount = computed(() => store.currentDriverRoute?.stops.reduce((count, stop) => count + (stop.completedOrderIds?.length || 0), 0) || 0)
const nextRouteStop = computed(() => store.currentDriverRoute?.stops.find((stop) => (stop.completedOrderIds?.length || 0) < stop.orderIds.length) || null)
const storeOptions = Object.values(storeDirectory)

const namedRouteDraft = ref<{ id?: string; name: string; storeIds: string[]; driverId?: string } | null>(null)
const routePlanId = ref('')
const routePreviewId = ref('')
const routePlanDate = ref(todayString())
const routePlanDriverId = ref('')
const selectedRouteStopId = ref('')
const routePreviewBusy = ref(false)
const routePublishing = ref(false)
const supplierNamedRoutes = computed(() => store.namedRoutes.filter((route) => route.supplierId === store.auth.supplierId))
const namedRouteDriverOptions = computed(() => ['', ...store.activeDrivers.map((driver) => driver.id)])
const namedRouteDriverLabels = computed(() => namedRouteDriverOptions.value.map((id) => namedRouteDriverName(id)))
function namedRouteDriverName(driverId?: string) {
  if (!driverId) return '未指派'
  return store.visibleDrivers.find((driver) => driver.id === driverId)?.name || driverId
}
function namedRouteLabelForDriver(driverId: string) {
  const routes = store.namedRoutes.filter((item) => item.supplierId === store.auth.supplierId && item.driverId === driverId)
  return routes.length ? `${routes.length} 条线路 · ${routes.reduce((sum, route) => sum + route.storeIds.length, 0)} 家门店` : '尚未配置线路'
}
function routePublishedStatus(routeId: string) {
  const published = store.dailyRoutes.find((route) => route.namedRouteId === routeId && route.deliveryDate === routePlanDate.value && ['published', 'stale', 'completed'].includes(route.status))
  return published ? (published.status === 'completed' ? '已完成' : published.status === 'stale' ? '需复核' : '已发布') : '未发布'
}
function invalidateRoutePreview() {
  store.invalidateRoutePreview()
  routePreviewId.value = ''
  selectedRouteStopId.value = ''
}
function openNamedRouteEditor(route?: { id: string; name: string; storeIds: string[]; driverId?: string }) {
  namedRouteDraft.value = route
    ? { id: route.id, name: route.name, storeIds: [...route.storeIds], driverId: route.driverId }
    : { name: '', storeIds: [], driverId: '' }
  routePlanId.value = route?.id || ''
  invalidateRoutePreview()
  routePlanDate.value = todayString()
  routePlanDriverId.value = route?.driverId || ''
  selectedRouteStopId.value = ''
}
function closeNamedRouteEditor() {
  if (namedRouteDraft.value) { namedRouteDraft.value = null; return }
  closeSecondaryWorkspace()
}
function toggleNamedRouteStore(storeId: string) {
  if (!namedRouteDraft.value) return
  namedRouteDraft.value.storeIds = namedRouteDraft.value.storeIds.includes(storeId)
    ? namedRouteDraft.value.storeIds.filter((id) => id !== storeId)
    : [...namedRouteDraft.value.storeIds, storeId]
  invalidateRoutePreview()
}
function moveNamedRouteStore(index: number, direction: -1 | 1) {
  if (!namedRouteDraft.value) return
  const target = index + direction
  const storeIds = [...namedRouteDraft.value.storeIds]
  if (target < 0 || target >= storeIds.length) return
  ;[storeIds[index], storeIds[target]] = [storeIds[target], storeIds[index]]
  namedRouteDraft.value.storeIds = storeIds
  invalidateRoutePreview()
}
async function saveNamedRouteDraft() {
  if (!namedRouteDraft.value) return
  await runBusy('save-route', async () => {
    const result = await store.saveNamedRoute({ ...namedRouteDraft.value!, driverId: routePlanDriverId.value || namedRouteDraft.value!.driverId || undefined })
    if (!result.ok) { toast(result.message); return }
    if (result.value) {
      namedRouteDraft.value = { id: result.value.id, name: result.value.name, storeIds: [...result.value.storeIds], driverId: result.value.driverId }
      routePlanId.value = result.value.id
      routePlanDriverId.value = result.value.driverId || ''
    }
    invalidateRoutePreview()
    toast('线路模板已保存')
  })
}
function setRoutePlanDriver(event: { detail: { value: string | number } }) {
  routePlanDriverId.value = namedRouteDriverOptions.value[Number(event.detail.value)] || ''
  if (namedRouteDraft.value) namedRouteDraft.value.driverId = routePlanDriverId.value || undefined
  invalidateRoutePreview()
}
watch(() => routePlanDate.value, () => invalidateRoutePreview())
watch(() => [namedRouteDraft.value?.name, namedRouteDraft.value?.storeIds.join(',')], () => {
  if (routePreviewId.value) invalidateRoutePreview()
})
async function previewNamedRoute() {
  const namedRouteId = namedRouteDraft.value?.id
  const driverId = routePlanDriverId.value || namedRouteDraft.value?.driverId || ''
  if (!namedRouteId || !driverId) { toast('请先保存线路并选择启用中的司机'); return }
  routePreviewBusy.value = true
  selectedRouteStopId.value = ''
  const result = await store.optimizeNamedRoute({ namedRouteId, driverId, deliveryDate: routePlanDate.value })
  routePreviewBusy.value = false
  if (!result.ok) { toast(result.message); return }
  routePlanId.value = namedRouteId
  routePreviewId.value = result.value?.id || ''
  toast('路线预览已生成')
}
const selectedRouteStop = computed(() => store.routeDraft?.id === routePreviewId.value
  ? store.routeDraft.stops.find((stop) => stop.storeId === selectedRouteStopId.value) || null
  : null)
function selectRouteStop(storeId: string) {
  selectedRouteStopId.value = storeId
}
function movePreviewStop(index: number, direction: -1 | 1) {
  if (!store.moveRouteStop(index, direction)) return
  selectedRouteStopId.value = store.routeDraft?.stops[index + direction]?.storeId || selectedRouteStopId.value
  toast('已调整门店顺序，距离已重新估算')
}
function routeProviderLabel(provider: string) {
  return provider === 'tencent-direction' ? '腾讯驾车距离' : provider === 'manual' ? '人工顺序 · 直线估算' : '直线估算'
}
async function publishNamedRoute() {
  if (!store.routeDraft || store.routeDraft.id !== routePreviewId.value) return
  routePublishing.value = true
  const result = await store.publishRoute()
  routePublishing.value = false
  toast(result.ok ? '配送线路已发布，订单已批量关联司机' : result.message)
}
function selectDriverRoute(routeId: string) {
  if (!store.selectDriverRoute(routeId)) return
  selectedRouteStopId.value = ''
}
function driverRouteName(route: { namedRouteId?: string; id: string; driverId?: string }) {
  const named = store.namedRoutes.find((item) => item.id === route.namedRouteId)
    || (route.driverId ? store.namedRoutes.find((item) => item.supplierId === store.auth.supplierId && item.driverId === route.driverId) : undefined)
  return named?.name || '今日配送线路'
}
function routeStatusText(order: Order) {
  if (isCourierOrder(order)) return ''
  const storeId = resolveOrderStore(order)?.storeId
  if (!storeId) return '门店资料待维护'
  const route = supplierNamedRoutes.value.find((item) => item.storeIds.includes(storeId))
  return route ? `已在线路中 · ${route.name}` : '待加入线路'
}
function handoverCheckInText(orderId: string) {
  const checkIn = store.dailyRoutes.flatMap((route) => route.stops).find((stop) => stop.orderIds.includes(orderId))?.checkIn
  return checkIn ? `打卡 ${checkIn.distanceM} 米 · ${checkIn.at.replace('T', ' ').slice(0, 16)}` : ''
}
async function checkInAtStop(stop: RouteStop) {
  await runBusy('checkin', async () => {
    const locate = () => new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
      uni.getLocation({ type: 'gcj02', success: (res) => resolve({ latitude: res.latitude, longitude: res.longitude }), fail: reject })
    })
    try {
      const location = await locate()
      const result = await store.checkInStop(stop.storeId, location)
      toast(result.ok ? `打卡成功，距门店 ${result.value?.distanceM} 米` : result.message)
    } catch {
      toast('无法获取定位，请开启定位权限')
    }
  })
}
async function generateTodayRoutes() {
  routeBusy.value = true
  const result = await store.ensureTodayRoutes()
  routeBusy.value = false
  toast(result.ok ? (result.value?.generated ? `已补生成 ${result.value.generated} 条今日线路` : '今日线路已是最新') : result.message)
}
async function saveWarehouse() {
  const address = warehouseForm.address.trim()
  if (!address) { toast('请输入仓点地址'); return }
  const contactPhone = warehouseForm.contactPhone.trim()
  if (contactPhone && !validatePhone(contactPhone)) { toast('请输入正确的11位联系人手机号'); return }
  await runBusy('warehouse', async () => {
    const located = await geocodeAddress({ address }, createGeocodeProviders({
      tencentProxy: String(import.meta.env.VITE_TENCENT_MAP_GATEWAY || '/api/tencent-map/geocode').trim()
    }))
    if (located.status !== 'resolved') {
      toast(located.reason === 'NOT_CONFIGURED' ? '地址解析未配置' : located.reason === 'TIMEOUT' ? '地址解析超时' : located.reason === 'INVALID_COORDINATE' ? '地址解析坐标无效' : '无法解析该地址')
      return
    }
    const result = await store.updateWarehouse({ address, longitude: located.coordinate.longitude, latitude: located.coordinate.latitude, contactName: warehouseForm.contactName, contactPhone })
    toast(result.ok ? '仓点已保存' : result.message)
  })
}
function stopItemCount(stop: RouteStop) {
  return store.orders.filter((order) => stop.orderIds.includes(order.id)).reduce((sum, order) => sum + (order.items || []).reduce((count, item) => count + item.quantity, 0), 0)
}
function stopOrders(stop: RouteStop) { return store.orders.filter((order) => stop.orderIds.includes(order.id)) }
function stopSegment(route: DailyDeliveryRoute, stop: RouteStop) {
  return route.segments?.find((segment) => segment.toStoreId === stop.storeId)?.distanceKm
}
function stopEstimatedMinutes(route: DailyDeliveryRoute, index: number) {
  return Math.ceil(route.estimatedDurationMinutes * (index + 1) / Math.max(1, route.stops.length))
}
function navigateToDestination(name: string, destination: { address: string; longitude?: number; latitude?: number }) {
  const url = buildNavigationUrl(name, { ...destination, contact: '', phone: '' })
  // #ifdef H5
  window.open(url, '_blank', 'noopener,noreferrer')
  // #endif
  // #ifndef H5
  if (destination.longitude !== undefined && destination.latitude !== undefined) {
    uni.openLocation({ longitude: destination.longitude, latitude: destination.latitude, name, address: destination.address })
  } else {
    uni.showToast({ title: '坐标待维护，请按地址搜索导航', icon: 'none' })
  }
  // #endif
}

function navigateToStop(stop: RouteStop) { navigateToDestination(stop.storeName, stop) }

function taskDistanceText(order: Order) {
  const distance = deliveryDistanceKm(supplierWarehouseOf(store.auth.supplierId, store.suppliers) || {}, storeInfoOf(order))
  return distance === null ? '距离待补充' : `约 ${distance.toFixed(1)} km`
}

function navigateToStore(order: Order) {
  navigateToDestination(order.storeName || order.customer, storeInfoOf(order))
}
function orderShortage(order: Order): ShortageItem[] {
  return order.supplierFulfillment?.shortages || []
}
function handoversOf(order: Order) {
  return order.supplierFulfillment?.handovers || []
}
function isCourierOrder(order: Order) {
  const source = order.supplierOrderLink?.source
  return source === 'c-mall' || source === 'farmhouse-courier'
}
function courierSourceLabel(order: Order) {
  return order.supplierOrderLink?.source === 'farmhouse-courier' ? '门店快递' : 'C端商城'
}
function recipientLabel(order: Order) {
  return isCourierOrder(order) ? order.supplierOrderLink?.deliveryAddress?.receiver || order.customer.replace(/ · C端商城$/, '') : order.customer
}
function addressLabel(order: Order) {
  const address = order.supplierOrderLink?.deliveryAddress
  return address ? `${address.region} ${address.detail} · ${address.receiver} ${address.phone}` : `${storeInfoOf(order).address} · ${storeInfoOf(order).contact} ${storeInfoOf(order).phone}`
}
function statusText(status: string, order?: Order) {
  if (order && isCourierOrder(order) && status === 'cancelled' && order.status === 'after-sale') return '售后处理中'
  return store.statusText(status)
}
const fulfillmentSteps = ['submitted', 'accepted', 'shipped', 'delivering', 'received']
function stepIndex(order: Order) {
  return fulfillmentSteps.indexOf(orderFulfillment(order).status)
}
function stepLabel(step: string) {
  return store.statusText(step)
}

function orderActions(order: Order): Array<{ key: string; label: string; primary?: boolean }> {
  const status = orderFulfillment(order).status
  const shipType = order.supplierFulfillment?.shipType
  if (status === 'submitted') return [{ key: 'accept', label: '接单', primary: true }]
  if (status === 'accepted') return [
    ...(isCourierOrder(order) ? [{ key: 'courier', label: '快递直发' }] : [])
  ]
  if (status === 'shipped' && shipType === 'courier') return [{ key: 'handover-out', label: '出库交接', primary: true }]
  if (status === 'delivering' && shipType === 'courier') return [{ key: 'courier-delivered', label: '确认快递签收', primary: true }]
  return []
}

async function runAction(key: string, order: Order) {
  if (key === 'accept') {
    await runBusy('accept', async () => {
      if (await store.acceptOrder(order.id)) toast('已接单')
      closeSheet()
    })
    return
  }
  if (key === 'courier') { openCourier(order); return }
  if (key === 'handover-out') { openHandoverOut(order); return }
  if (key === 'courier-delivered') {
    await runBusy('courier-delivered', async () => {
      if (await store.markCourierDelivered(order.id)) toast('已确认快递签收')
      closeSheet()
    })
  }
}

function toggleSelect(id: string) {
  const index = selectedOrderIds.value.indexOf(id)
  if (index >= 0) selectedOrderIds.value.splice(index, 1)
  else selectedOrderIds.value.push(id)
}
async function batchAccept() {
  await runBusy('batch-accept', async () => {
    const count = await store.batchAcceptOrders([...selectedOrderIds.value])
    selectedOrderIds.value = []
    toast(`已批量接单 ${count} 单`)
  })
}
function openOrder(order: Order) {
  selectedOrder.value = order
  sheet.value = 'order'
}
function hasUnhandledShortage(order: Order) {
  return orderShortage(order).some((item) => !item.handled)
}
async function markHandled(skuId: string) {
  const orderId = selectedOrder.value?.id
  if (!orderId) return
  await runBusy('mark-handled', async () => {
    if (await store.markShortageHandled(orderId, skuId)) {
      selectedOrder.value = store.orders.find((order) => order.id === orderId) || selectedOrder.value
      toast('已标记补发')
    }
  })
}
function askResetDemo() {
  sheet.value = 'reset-confirm'
}
async function confirmResetDemo() {
  await runBusy('reset-demo', async () => {
    await store.resetDemoData()
    closeSheet()
    active.value = 'orders'
    toast('演示数据已重置')
  })
}
function closeSheet() {
  sheet.value = null
  selectedOrder.value = null
  courierTracking.value = ''
  handoverNote.value = ''
  handoverResult.value = null
  driverFormError.value = ''
  editingDriver.value = null
  resetPassword.value = ''
  driverStatusTarget.value = null
  resetActuals()
}

const courierTracking = ref('')
function openCourier(order: Order) {
  selectedOrder.value = order
  courierTracking.value = ''
  sheet.value = 'courier'
}
async function confirmCourier() {
  if (!selectedOrder.value) return
  await runBusy('courier', async () => {
    if (await store.shipCourier(selectedOrder.value!.id)) {
      toast('已快递直发')
      closeSheet()
    }
  })
}

const actuals = reactive<Record<string, number>>({})
const handoverNote = ref('')
const handoverResult = ref<{ shortages: ShortageItem[] } | null>(null)
function resetActuals() {
  Object.keys(actuals).forEach((key) => { delete actuals[key] })
}
function openHandoverOut(order: Order) {
  selectedOrder.value = order
  handoverResult.value = null
  resetActuals()
  order.items?.forEach((item) => { actuals[item.skuId] = item.quantity })
  handoverNote.value = ''
  sheet.value = 'handover-out'
}
async function confirmHandoverOut() {
  if (!selectedOrder.value) return
  await runBusy('handover-out', async () => {
    const result = await store.handoverOut(selectedOrder.value!.id, { ...actuals }, handoverNote.value.trim() || undefined)
    if (result.ok) {
      handoverResult.value = { shortages: result.shortages }
      toast(result.shortages.length ? `交接完成，缺货 ${result.shortages.length} 项` : '出库交接完成')
    }
  })
}
async function confirmHandoverIn() {
  if (!selectedOrder.value) return
  await runBusy('handover-in', async () => {
    if (await store.handoverIn(selectedOrder.value!.id, handoverNote.value.trim() || undefined)) {
      toast('到店交接完成')
      closeSheet()
    }
  })
}
function openDriverHandover(order: Order) {
  selectedOrder.value = order
  handoverNote.value = ''
  sheet.value = 'handover-in'
}

// ---------- 司机管理 ----------
const driverSearch = ref('')
const driverStatusFilter = ref('全部')
const driverStatusFilters = ['全部', '启用', '停用']
const filteredDrivers = computed(() => store.visibleDrivers.filter((driver) => {
  const matchesStatus = driverStatusFilter.value === '全部' || (driverStatusFilter.value === '启用' ? driver.status === 'active' : driver.status === 'disabled')
  const keyword = driverSearch.value.trim().toLowerCase()
  const matchesKeyword = !keyword || `${driver.name}${driver.account}${driver.phone || ''}`.toLowerCase().includes(keyword)
  return matchesStatus && matchesKeyword
}))
const driverForm = reactive({ name: '', phone: '', account: '', password: '' })
const driverFormError = ref('')
const editingDriver = ref<DriverAccount | null>(null)
const resetPassword = ref('')
const driverStatusTarget = ref<DriverAccount | null>(null)

function openDriverForm() {
  editingDriver.value = null
  Object.assign(driverForm, { name: '', phone: '', account: '', password: '' })
  driverFormError.value = ''
  sheet.value = 'driver-form'
}
function openDriverEdit(driver: DriverAccount) {
  editingDriver.value = driver
  Object.assign(driverForm, { name: driver.name, phone: driver.phone || '', account: driver.account, password: '' })
  driverFormError.value = ''
  sheet.value = 'driver-edit'
}
async function saveDriver() {
  await runBusy('save-driver', async () => {
    if (sheet.value === 'driver-form') {
      const result = await store.addDriver({ name: driverForm.name, phone: driverForm.phone, account: driverForm.account, password: driverForm.password })
      if (!result.ok) { driverFormError.value = result.error || '保存失败'; return }
      toast(`司机账号已创建：${driverForm.account}`)
    } else if (editingDriver.value) {
      if (!store.updateDriver(editingDriver.value.id, { name: driverForm.name, phone: driverForm.phone })) {
        driverFormError.value = '姓名或手机号格式不正确'
        return
      }
      toast('司机信息已保存')
    }
    closeSheet()
  })
}
function openReset(driver: DriverAccount) {
  editingDriver.value = driver
  resetPassword.value = ''
  driverFormError.value = ''
  sheet.value = 'driver-reset'
}
function confirmReset() {
  if (!editingDriver.value) return
  if (resetPassword.value.length < 6 || resetPassword.value.length > 20) {
    driverFormError.value = '密码需 6-20 位'
    return
  }
  void runBusy('reset-password', async () => {
    store.resetDriverPassword(editingDriver.value!.id, resetPassword.value)
    toast('密码已重置')
    closeSheet()
  })
}
function askToggle(driver: DriverAccount) {
  driverStatusTarget.value = driver
  sheet.value = 'driver-toggle-confirm'
}
function driverToggleMessage(driver: DriverAccount) {
  if (driver.status !== 'active') return `启用后「${driver.name}」可重新登录。`
  const taskCount = store.driverTaskCounts[driver.id] || 0
  return taskCount > 0
    ? `停用后「${driver.name}」将无法登录，已派任务不受影响。该司机当前有 ${taskCount} 个进行中任务，建议先改派。`
    : `停用后「${driver.name}」将无法登录，已派任务不受影响。`
}
function confirmToggle() {
  if (!driverStatusTarget.value) return
  if (!store.toggleDriverStatus(driverStatusTarget.value.id)) return
  toast(driverStatusTarget.value.status === 'active' ? '已停用司机' : '已启用司机')
  closeSheet()
}

// ---------- 交接日志 ----------
const handoverFilter = ref('全部')
const handoverDriverFilter = ref('全部')
const handoverTypeFilters = ['全部', '出库交接', '到店交接']
const handoverDriverFilters = computed(() => ['全部', ...store.visibleDrivers.map((driver) => driver.name)])
const filteredHandovers = computed(() => store.allHandovers.filter((log) => {
  const matchesType = handoverFilter.value === '全部' || (handoverFilter.value === '出库交接' ? log.type === 'out' : log.type === 'in')
  const matchesDriver = handoverDriverFilter.value === '全部' || log.operatorName === handoverDriverFilter.value
  return matchesType && matchesDriver
}))
const handoverKeyword = ref('')
type DriverAuxFilterSnapshot = { date: string; dataKeyword: string; handoverKeyword: string }
let driverAuxFilterSnapshot: DriverAuxFilterSnapshot = { date: todayString(), dataKeyword: '', handoverKeyword: '' }
const filteredMyHandovers = computed(() => {
  const keyword = handoverKeyword.value.trim().toLowerCase()
  if (!keyword) return store.myHandovers
  return store.myHandovers.filter((log) => [
    log.orderId,
    log.customer,
    log.operatorName,
    log.operatorRole === 'driver' ? '司机' : '供应商',
    log.type === 'out' ? '出仓交接' : '到店交接',
    log.time,
    log.note,
    log.shortageCount ? `缺货 ${log.shortageCount} 项` : ''
  ].join(' ').toLowerCase().includes(keyword))
})
const recentHandovers = computed(() => store.allHandovers.slice(0, 5))

// ---------- 司机工作区 ----------
const currentDriverWarehouse = computed(() => supplierWarehouseOf(store.auth.supplierId, store.suppliers))
const driverDoneToday = computed(() => {
  const today = new Date().toLocaleDateString('zh-CN')
  return store.myHistory.filter((order) => order.supplierFulfillment?.handovers.some((log) => log.type === 'in' && log.time.includes(today))).length
})

onMounted(() => {
  refreshProductCategoryLabels()
  if (import.meta.env.VITE_E2E === '1') {
    const e2eWindow = window as typeof window & { __agritainmentE2E?: { setRouteProviderFailure: (enabled: boolean) => void } }
    e2eWindow.__agritainmentE2E = {
      setRouteProviderFailure(enabled) {
        configurePlatformProviders(enabled
          ? { routeOptimization: { async optimize() { return { ok: false, code: 'e2e_route_provider_failed', message: 'E2E route provider failure' } } } }
          : {})
      }
    }
  }
  if (import.meta.env.VITE_E2E !== '1') configurePlatformProviders({ routeOptimization: createDrivingRouteOptimizationProvider() })
  void store.initialize().then(async () => {
    seedSupplierDemoRouteOnce()
    if (store.auth.isLoggedIn) await store.ensureTodayRoutes()
  })
  disposeKeyboardButtons = installKeyboardButtonSupport()
  disposePlatformChanges = subscribePlatformChanges(refreshSharedState, platformChangeKeys)
  if (typeof window !== 'undefined') {
    const keys = new Set([...platformChangeKeys, ...platformChangeKeys.map((key) => `${key}:revision`)])
    const onStorage = (event: StorageEvent) => { if (!event.key || keys.has(event.key)) refreshSharedState() }
    window.addEventListener('storage', onStorage)
    disposeStorageSync = () => window.removeEventListener('storage', onStorage)
  }
  if (typeof document !== 'undefined') {
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') refreshSharedState() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    disposeVisibilitySync = () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }
})
onBeforeUnmount(() => {
  disposePlatformChanges?.()
  disposePlatformChanges = null
  disposeStorageSync?.()
  disposeStorageSync = null
  disposeVisibilitySync?.()
  disposeVisibilitySync = null
  disposeKeyboardButtons()
})
</script>
<style scoped lang="scss">
$green: var(--color-brand-primary);
$green-deep: var(--color-brand-primary-dark);
$green-soft: var(--color-brand-primary-soft);
$blue: var(--color-info);
$amber: var(--color-warning-dark);
$red: var(--color-danger);
$bg: var(--color-bg);
$panel: var(--color-card);
$ink: var(--color-ink);
$muted: var(--color-ink-2);
$line: var(--color-line);
$on-brand: var(--color-on-brand);
$price: var(--color-price);
$purple: var(--color-purple);
$info-soft: var(--color-info-soft);
$warning-soft: var(--color-warning-soft);
$danger-soft: var(--color-danger-soft);
$line-light: var(--color-line-light);
$overlay: var(--color-overlay);
$radius-card: var(--radius-card);
$radius-button: var(--radius-button);
$shadow-card: var(--shadow-card);
$space-page: var(--space-page);
$control: var(--control-size);

// ===== 登录页 =====
.login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: $space-page; background: $bg; }
/* #ifdef MP-WEIXIN */
.login-page { padding-top: calc(24px + var(--status-bar-height)); padding-right: 96px; }
/* #endif */
/* #ifdef H5 */
.login-page { padding-top: calc(24px + env(safe-area-inset-top)); }
/* #endif */
.login-card { width: 100%; max-width: 340px; background: $panel; border: 1px solid $line; border-radius: $radius-card; overflow: hidden; box-shadow: $shadow-card; }
.login-card .pc-login-hero { border-radius: 0; }
.login-body { padding: $space-page; }
.role-tabs { display: flex; gap: 4px; margin: 0 0 16px; padding: 4px; border-radius: $radius-card; background: $green-soft; }
.role-tabs button { flex: 1; min-height: $control; padding: 8px 0; border: 0; border-radius: $radius-button; background: transparent; color: $muted; font-size: 14px; }
.role-tabs button.active { background: $green; color: $on-brand; font-weight: 700; }
.login-fields { display: flex; flex-direction: column; gap: 12px; }
.login-button { margin-top: 18px; width: 100%; }
.login-hint { display: block; margin-top: 12px; text-align: center; font-size: 12px; line-height: 1.55; color: $muted; word-break: keep-all; }
.state-retry { margin-top: 12px; }
.section-action { width: 100%; margin-top: var(--space-gap); }
.route-bottom-actions > .section-action { grid-column: 1 / -1; margin-top: 0; }
.content-stack { margin-top: var(--space-gap); }
.filter-row { margin-top: 8px; }
.detail-status-row { margin-bottom: 12px; }
.note-field { margin-top: 12px; }

// ===== 订单 =====
.order-check { display: flex; align-items: center; flex: none; }
.order-check > view { width: 20px; height: 20px; border: 1.5px solid $line; border-radius: $radius-button; display: flex; align-items: center; justify-content: center; background: $panel; }
.order-check > view.checked { background: $green; border-color: $green; }
.order-actions { display: flex; gap: 8px; margin-top: 9px; padding-top: 9px; border-top: 1px solid $line; flex-wrap: wrap; justify-content: flex-end; }
.outline-button.danger { color: $red; border-color: $red; }
.mine-actions { display: grid; gap: var(--space-gap); margin-top: var(--space-section); }
.mine-actions button { width: 100%; margin: 0; }
/* #ifdef H5 */
.page-pad[data-visual-view="supplier-orders"],
.mine-page { padding-top: max($space-page, env(safe-area-inset-top)); }
/* #endif */

// ===== 司机 =====
.driver-avatar { width: 40px; height: 40px; border-radius: var(--radius-icon); background: $green-soft; display: flex; align-items: center; justify-content: center; color: $green; flex: none; }
.driver-row { align-items: flex-start; }
.driver-row .row-main { flex: 1; }
.driver-actions { display: flex; gap: 8px; margin-top: var(--space-gap); flex-wrap: wrap; }
.driver-name { font-size: var(--text-subtitle); font-weight: 600; }

// ===== 任务（司机端）=====
.task-store { display: flex; align-items: flex-start; gap: 8px; background: $green-soft; border: 1px solid $line; border-radius: $radius-card; padding: 10px 11px; margin-top: 9px; }
.distance-text { color: $green; font-size: 12px; margin-top: 4px; }
.task-nav { display: inline-flex; align-items: center; gap: 4px; flex: none; margin: 0; }
.task-items { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.task-item { display: flex; align-items: center; gap: 8px; }
.task-item image { width: 30px; height: 30px; border-radius: var(--radius-icon); background: $bg; flex: none; }
.task-item text { font-size: var(--text-body); flex: 1; }
.task-shortage { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }

// ===== 订单详情 =====
.steps { display: flex; gap: 6px; margin-bottom: 14px; overflow-x: auto; }
.step { display: flex; align-items: center; gap: 5px; flex: none; }
.step-dot { width: 20px; height: 20px; border-radius: 50%; background: $bg; color: $muted; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.step.done .step-dot { background: $green; color: $on-brand; }
.step-label { font-size: 12px; color: $muted; white-space: nowrap; flex: none; }
.order-item-line { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed $line; }
.order-item-line image { width: 36px; height: 36px; border-radius: var(--radius-icon); background: $bg; flex: none; }
.order-item-price { font-size: var(--text-body); font-weight: 700; flex: none; }
.store-line { display: flex; align-items: flex-start; gap: 8px; background: $green-soft; border: 1px solid $line; border-radius: $radius-card; padding: 10px 11px; }
.shortage-line { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px dashed $line; }
.log-list { display: flex; flex-direction: column; gap: 8px; }
.log-event { display: flex; gap: 10px; align-items: flex-start; }
.log-dot { width: 8px; height: 8px; border-radius: 50%; background: $green; margin-top: 5px; flex: none; }

// ===== 出库交接 =====
.actual-list { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.actual-line { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px dashed $line; }
.actual-input { display: flex; align-items: center; gap: 6px; flex: none; }
.actual-input text { font-size: var(--text-body); color: $muted; }
.actual-input input { width: 76px; height: $control; border: 1px solid $line; border-radius: $radius-button; padding: 0 8px; font-size: var(--text-body); text-align: center; }
.handover-result { display: flex; flex-direction: column; gap: 6px; background: $green-soft; border: 1px solid $line; border-radius: $radius-card; padding: 12px; margin-top: 12px; }
.handover-result text { font-size: 14px; font-weight: 700; color: $green; }
.handover-result-sub { font-size: 12px; color: $green; }
.order-amount { margin-left: auto; font-size: var(--text-subtitle); font-weight: 700; flex: none; }
/* Cross-device fulfillment layout guards. */
.c-mall-tag { background: $info-soft; color: $blue; }
.order-no, .muted, .row-main, .store-line, .task-store, .courier-sheet { min-width: 0; word-break: break-all; }
.row-top { min-width: 0; }
.row-top > text, .row-top > .order-no { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.order-actions, .sheet-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.order-actions button, .sheet-actions button { flex: 0 0 auto; min-width: 88px; min-height: 44px; }
.order-actions .primary-button, .sheet-actions .primary-button { min-width: 104px; }
.sheet-actions { z-index: 2; }
.store-line .row-main, .task-store .row-main { flex: 1; }
.task-item .business-image { width:30px;height:30px;border-radius:var(--radius-icon);flex:none; }.order-item-line .business-image { width:36px;height:36px;border-radius:var(--radius-icon);flex:none; }
.task-item > text:first-of-type { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-item > .muted { flex: none; white-space: nowrap; }
.product-work-page { display: flex; flex-direction: column; height: 100vh; overflow: hidden; padding-bottom: calc(var(--mobile-tab-height) + 12px + env(safe-area-inset-bottom)); box-sizing: border-box; background: $bg; color: $ink; }
.product-work-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; flex: none; padding: 2px 0 12px; border-bottom: 1px solid $line; }
.product-work-body { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; }
.product-work-head button { margin: 0; }
.product-work-title { display: block; font-size: 20px; font-weight: 750; }
.add-product-button { display:flex;align-items:center;gap:4px;white-space:nowrap; }
.product-summary { display:grid;grid-template-columns:repeat(3,1fr);margin:var(--space-section) 0 var(--space-gap);overflow:hidden;border:1px solid $line;border-radius:$radius-card;background:$green-soft; }
.product-summary view { padding:14px 6px;text-align:center; }
.product-summary view+view { border-left:1px solid $line; }
.product-summary .val,.product-summary .meta { display:block; }
.product-summary .val { color:$green-deep;font-size:20px;font-variant-numeric:tabular-nums; }.product-summary .meta{margin-top:4px;color:$muted;font-size:12px}
.product-search { margin-top:0; }
.product-filter-scroll { width:100%;margin:10px 0 12px;white-space:nowrap; }
.product-filter-scroll,.product-filter-scroll button{scrollbar-width:none}.product-filter-scroll::-webkit-scrollbar,.product-filter-scroll button::-webkit-scrollbar{display:none;width:0;height:0}
.product-filter-chips { display:inline-flex;gap:4px;padding-right:10px; }
.product-filter-chips button { position:relative;display:inline-flex;align-items:center;gap:5px;min-height:44px;margin:0;padding:0 10px 8px;border:0;border-radius:0;background:transparent;color:$muted;font-size:var(--text-body); }
.product-filter-chips button.active { border:0;background:transparent;color:$green;font-weight:800; }
.product-filter-chips button.active::after { content:'';position:absolute;left:50%;bottom:2px;width:20px;height:3px;border:none;border-radius:var(--mobile-radius-pill);background:currentColor;transform:translateX(-50%); }
.product-filter-chips button text{font-size:var(--text-body);opacity:.8}
.supplier-product-list { display: grid; gap: var(--space-gap); }
.supplier-product-card { min-width:0;padding:var(--space-card);border:1px solid $line;border-radius:$radius-card;background:$panel;box-shadow:$shadow-card; }
.supplier-product-main{display:flex;align-items:flex-start;gap:11px;min-width:0}.supplier-product-image { width: 78px; height: 78px; flex: none; border-radius: $radius-button; background: $line-light; }
.supplier-product-name{display:-webkit-box;min-width:0;overflow:hidden;font-size:14px;font-weight:700;line-height:1.35;-webkit-box-orient:vertical;-webkit-line-clamp:2}.supplier-product-price{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-top:9px}.supplier-product-price .val{color:$price;font-size:17px;font-variant-numeric:tabular-nums}.supplier-product-price .meta{min-width:0;color:$muted;font-size:12px;text-align:right;word-break:break-all}
.supplier-product-skus { display: grid; gap: 5px; margin-top: 10px;padding-top:9px;border-top:1px solid $line; color: $ink; font-size: 12px; }
.supplier-product-skus text{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;min-width:0}.supplier-product-skus .meta{color:$muted;font-size:12px;text-align:right;white-space:nowrap}
.product-reject-note { display: block; margin-top: 10px; padding: 9px 10px; border-left: 3px solid $red; background: $danger-soft; color: $red; font-size: 12px; }
.supplier-product-form { display: grid; gap: 12px; margin-top: 14px; }
.form-section{display:grid;gap:12px;padding:var(--space-card);border:1px solid $line;border-radius:$radius-card;background:$panel;box-shadow:$shadow-card}.form-section-title{display:block;font-size:15px;font-weight:750}.media-field{display:grid;gap:7px}.media-field>text,.sku-image-field>text{color:$muted;font-size:12px}
.picker-field { display: flex; align-items: center; min-height: $control; padding: 0 12px; border: 1px solid $line; border-radius: $radius-button; background: $panel; transition: border-color .16s ease; }
.picker-field:active { border-color: $green; }
.checkbox-field { display: flex; align-items: center; gap: 8px; min-height: $control; font-size: 13px; }
.supplier-sku-form { overflow:visible; }
.sku-section-head,.sku-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.sku-section-head>view>.meta{display:block;margin-top:3px;color:$muted;font-size:12px}.sku-section-head button{display:flex;align-items:center;gap:4px;margin:0}.supplier-sku-fields { display:grid;gap:10px;padding:12px;border:1px solid $line;border-radius:$radius-card;background:$green-soft; }
.supplier-sku-fields.retired{opacity:.6}.sku-card-head{font-size:13px;font-weight:700}.sku-card-head button{min-height:$control;margin:0;padding:0 8px;border:0;border-radius:$radius-button;background:transparent;color:$red;font-size:13px}.supplier-sku-fields.retired .sku-card-head button{color:$green}.sku-image-field{display:grid;gap:6px}.sku-input-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.sku-input-grid label { display: grid; gap: 5px; color: $muted; font-size: 13px; }.sku-input-grid label:first-child{grid-column:1/-1}
.sku-input-grid input { width: 100%; height: $control; box-sizing: border-box; padding: 0 9px; border: 1px solid $line; border-radius: $radius-button; color: $ink;background:$panel;transition:border-color .16s ease }
.sku-input-grid input:focus { border-color: $green; }
.product-form-actions { display: flex; justify-content: flex-end; gap: 8px; flex: none; flex-wrap: wrap; padding: 12px 0 calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid $line; background: $bg; }
.product-form-actions button { margin: 0; }
.app-shell { overflow-x: hidden; }
.bottom-tab { min-height: 44px; min-width: 0; }
.bottom-tab text { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mine-page { display: grid; gap: var(--space-gap); }
.mine-hero .pc-hero-badge { display: inline-flex; }
.mine-hero .pc-hero-name,
.mine-hero .pc-hero-uid { display: block; }
.mine-tile-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-gap); }
.mine-tile-grid .pc-tile-icon { color: $green; }
.mine-tile-grid .pc-tile--amber .pc-tile-icon { color: $amber; }
.mine-tile-grid .pc-tile--coral .pc-tile-icon { color: $red; }
.mine-tile-grid .pc-tile--blue .pc-tile-icon { color: $blue; }
.mine-tile-grid .pc-tile--purple .pc-tile-icon { color: $purple; }
.mine-tile-grid .pc-tile--teal .pc-tile-icon { color: $green-deep; }
.work-link { width: 100%; min-height: 60px; display: flex; align-items: center; gap: 12px; padding: 9px 11px; border: 1px solid $line; border-radius: $radius-card; background: $panel; color: $ink; text-align: left; box-shadow: $shadow-card; }
.mine-tile-grid .work-link { flex-direction: column; align-items: center; text-align: center; min-height: 96px; padding: 12px 6px; width: auto; }
.work-link .row-main { min-width: 0; }
.work-link .row-main > text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.driver-mine { display: grid; gap: 8px; }
.secondary-workspace { position: relative; display: flex; flex-direction: column; overflow: hidden; min-height: calc(100vh - var(--mobile-tab-height)); background: $bg; padding-top: 14px; padding-bottom: 0; }
.secondary-head { position: relative; top: auto; z-index: 2; flex: none; display: flex; align-items: center; gap: 10px; min-height: 56px; margin: 0 calc(var(--space-page) * -1); padding: 6px $space-page; border-bottom: 1px solid $line; background: $panel; font-size: var(--text-subtitle); font-weight: 700; }
.secondary-body { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; padding-top: var(--space-gap); }
.secondary-foot { flex: none; padding: 10px 0 calc(12px + env(safe-area-inset-bottom)); background: $bg; }
.secondary-head > text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.route-controls { display: grid; gap: 10px; }
.named-route-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-section); align-items: start; }
.route-plan-editor { display: grid; gap: 10px; min-width: 0; }
.route-planning-map { display: grid; gap: 10px; min-width: 0; }
.route-plan-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.route-plan-actions button { margin: 0; }
.route-preview { display: grid; gap: 10px; }
.route-metrics { margin: 0; }
.route-provider { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.route-warnings { display: grid; gap: 4px; padding: 9px 10px; border-left: 3px solid $amber; background: $warning-soft; color: $amber; font-size: 12px; line-height: 18px; }
.route-section-intro,.route-workbench-status { display:flex; align-items:center; justify-content:space-between; gap:14px; min-width:0; }
.route-section-intro > view,.route-workbench-status > view { display:grid; gap:3px; min-width:0; }
.route-section-intro button { flex:none; }
.eyebrow { display:block; color:$muted; font-size:12px; font-weight:700; letter-spacing:0; text-transform:uppercase; }
.route-section-title { display:block; color:$green-deep; font-size:18px; font-weight:800; line-height:24px; }
.route-template-card { display:grid; gap:7px; padding:13px 14px; }
.route-template-heading { display:flex; align-items:center; gap:8px; min-width:0; }
.route-template-path { display:block; color:$green-deep; font-size:13px; line-height:20px; word-break:break-all; }
.route-workbench-status { padding:12px; border:1px solid $line; border-radius:$radius-card; background:$green-soft; }
.warning-tag { background:$warning-soft; color:$amber; }
.warning-text { color:$amber; }
.route-plan-actions button { gap:5px; }
.route-bottom-actions { position:sticky; bottom:0; z-index:3; display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); align-items:center; gap:10px; margin:0; padding:10px 0 calc(10px + env(safe-area-inset-bottom)); border-top:1px solid $line; background:$bg; }
.route-bottom-actions .route-publish { width:100%; margin:0; }
.route-bottom-hint { min-width:0; grid-column:1 / -1; }
.route-stop-selected { border-color: $green; background: $green-soft; }
.route-stop-detail { display: grid; gap: 4px; padding: 10px; border: 1px solid $line; border-radius: $radius-card; background: $green-soft; }
.route-status-hint { display: block; margin-top: 3px; color: $green; font-size: 12px; }
.route-date { width: 100%; height: $control; padding: 0 12px; border: 1px solid $line; border-radius: $radius-card; background: $panel; }
.route-stop { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.route-number { width: 28px; height: 28px; flex: none; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: $green; color: $on-brand; font-weight: 700; }
.route-actions { display: flex; flex-direction: column; gap: 6px; flex: none; }
.route-actions .icon-button { width: $control; height: $control; padding: 0; line-height: 1; }
.route-order-button { font-size: 13px; }
.route-publish { width: 100%; margin-top: 6px; }
.route-driver-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.route-driver-summary > view { display: grid; gap: 3px; min-width: 0; }
.route-driver-summary .section-title { margin: 0; }
.delivery-route-map { margin-bottom: 10px; }
.route-stop .row-main > text:first-child { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.driver-hero-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.driver-hero-stats .hero-stat:nth-child(2) .hero-stat-value { color: $green; }
.task-orders { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.compact-empty { min-height: 96px; padding: 16px 0; }
.driver-route-switcher { display:flex; gap:8px; overflow-x:auto; padding:2px 0 10px; margin-bottom:10px; scrollbar-width:none; }
.driver-route-switcher::-webkit-scrollbar { display:none; width:0; height:0; }
.driver-route-tab { display:grid; gap:3px; flex:0 0 148px; min-height:58px; padding:9px 11px; border:1px solid $line; border-radius:$radius-card; background:$panel; color:$green-deep; text-align:left; }
.driver-route-tab text { overflow:hidden; font-size:var(--text-body); font-weight:750; text-overflow:ellipsis; white-space:nowrap; }
.driver-route-tab .meta { color:$muted; font-size:12px; }
.driver-route-tab.active { border-color:$green; background:$green-soft; color:$green-deep; box-shadow:inset 0 -2px 0 $green; }
.driver-route-tab.completed { color:$muted; }
.driver-route-active { min-width:0; }
@media (max-width: 375px) {
  .page-pad { padding-left: $space-page; padding-right: $space-page; }
  .task-store { flex-wrap: wrap; }
  .task-store .task-nav { margin-left: 24px; }
  .route-stop { align-items: flex-start; flex-wrap: wrap; }
  .route-stop .row-main { flex: 1 1 calc(100% - 38px); }
  .route-actions { flex-direction: row; width: 100%; padding-left: 38px; }
  .bottom-tab { padding-left: 2px; padding-right: 2px; }
  .route-plan-actions { align-items: stretch; flex-direction: column; }
  .route-plan-actions button { width: 100%; }
  .route-section-intro { align-items:stretch; flex-direction:column; }
  .route-section-intro button { width:100%; }
}
@media (max-width: 390px) {
  .driver-route-tab { flex-basis: 136px; }
  .route-driver-summary { gap: 8px; }
}
.route-workbench-status { align-items:flex-start; }
/* #ifdef MP-WEIXIN */
.app-shell { padding-bottom: var(--safe-area-inset-bottom, 0px); }
.product-work-page { padding-top: 16px; }
.product-work-head,
.secondary-head {
  padding-top: calc(6px + var(--status-bar-height));
  padding-right: 96px;
}
.secondary-workspace { padding-top: 14px; min-height: calc(100vh - var(--mobile-tab-height)); overflow: hidden; }
.page-pad[data-visual-view="supplier-orders"],
.mine-page { padding-top: calc(var(--space-page) + var(--status-bar-height)); padding-right: 96px; }
/* #endif */
/* #ifdef H5 */
 .product-work-page { padding-top: 16px; }
.secondary-workspace { padding-top: max(14px, env(safe-area-inset-top)); }
/* #endif */
.product-category-meta { display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden; }
.product-category-meta text { min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.product-category-meta text:last-child { flex:none; }
.product-category-image { width: 22px; height: 22px; flex:none;border-radius:4px;background:$line-light; }
.category-picker-trigger { width:100%;min-height:$control;margin:0;padding:0 12px;border:1px solid $line;border-radius:$radius-button;background:$panel;color:$ink;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:var(--text-body);text-align:left; transition: border-color .16s ease; }
.category-picker-trigger:active { border-color: $green; }
.category-picker-trigger>view { min-width:0;display:flex;align-items:center;gap:8px; }
.category-picker-trigger>view text { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.category-picker-trigger-image { width: 28px; height: 28px; flex:none;border-radius:5px;background:$line-light; }
.category-picker-mask { position:fixed;z-index:80;inset:0;display:flex;align-items:flex-end;background:$overlay; }
.category-picker-sheet { width:100%;max-height:80vh;display:flex;flex-direction:column;padding-bottom:0;border-radius:$radius-card $radius-card 0 0;background:$panel;overflow:hidden; }
.category-picker-sheet > .sheet-head { padding: 6px 12px; flex: none; }
.category-picker-list { flex: 1 1 auto; min-height: 0; height: auto; max-height: calc(80vh - 56px); padding-bottom: calc(24px + env(safe-area-inset-bottom)); box-sizing: border-box; }
.category-picker-option { width:100%;min-height:54px;margin:0;padding:8px 18px;border:0;border-bottom:1px solid $line;border-radius:0;background:$panel;color:$ink;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left; }
.category-picker-option.selected { color:$green;background:$green-soft; }
.category-picker-option-main { min-width:0;display:flex;align-items:center;gap:11px; }
.category-picker-option-image { width: 40px; height: 40px; flex:none;border-radius:$radius-button;background:$line-light; }
.category-picker-option-main>view { min-width:0; }
.category-picker-option-main>view text,.category-picker-option-main>view .meta { display:block; }
.category-picker-option-main>view text { overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:700; }
.category-picker-option-main>view .meta { margin-top:3px;color:$muted;font-size:12px; }
.category-picker-trigger::after,.category-picker-option::after { display:none; }
// ===== 出仓交接与司机线路 =====
.outbound-date-field { margin-bottom: 12px; }
.outbound-route-card { width: 100%; display: grid; gap: 8px; text-align: left; border: 1px solid $line; background: $panel; }
.outbound-route-metrics { display: flex; flex-wrap: wrap; gap: 6px 12px; color: $muted; font-size: 12px; }
.outbound-summary-card { display: grid; gap: 8px; padding: 12px; border: 1px solid $line; border-radius: $radius-card; background: $green-soft; }
.outbound-item-list { display: flex; flex-direction: column; gap: 8px; }
.outbound-item-card { display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid $line; border-radius: $radius-card; background: $panel; }
.outbound-item-card--driver { align-items: flex-start; }
.outbound-item-image { width: 58px; height: 58px; flex: none; border-radius: $radius-button; background: $line-light; }
.outbound-item-name { display: block; font-size: 15px; font-weight: 700; color: $ink; }
.outbound-quantity-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.outbound-final-value { flex: none; min-width: 42px; text-align: right; color: $green-deep; font-size: 18px; font-weight: 800; }
.shortage-allocate-head { display: flex; justify-content: space-between; gap: 8px; margin-top: 10px; color: $ink; font-size: 13px; font-weight: 700; }
.shortage-allocate-head .danger { color: $red; }
.shortage-allocate-row { display: grid; grid-template-columns: minmax(0, 1fr) 82px; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px dashed $line; }
.shortage-allocate-row input { width: 82px; height: 40px; padding: 0 8px; border: 1px solid $line; border-radius: $radius-button; background: $panel; color: $ink; text-align: center; }
.warehouse-action-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; margin: 12px 0; padding: 12px; border: 1px solid $line; border-radius: $radius-card; background: $panel; }
.driver-route-list { display: flex; flex-direction: column; gap: var(--space-gap); }
.driver-route-page .driver-route-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.driver-route-card { width: 100%; display: grid; gap: 10px; text-align: left; border: 1px solid $line; border-radius: $radius-card; background: $panel; }
.driver-route-card-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; width: 100%; }
.driver-route-card-grid view { min-width: 0; }
.driver-route-card-grid .meta, .driver-route-card-grid .val { display: block; }
.driver-route-card-grid .meta { margin-bottom: 3px; color: $muted; font-size: 12px; }
.driver-route-card-grid .val { overflow: hidden; color: $ink; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.route-card-foot { display: flex; align-items: center; justify-content: flex-end; gap: 4px; color: $muted; font-size: 12px; }
.driver-stop-card { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; text-align: left; border: 1px solid $line; background: $panel; }

// ===== 原司机端流程映射样式 =====
.outbound-search { margin-top: 12px; }
.outbound-difference-toggle { margin: 10px 0 2px; }
.outbound-totals { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-top: 12px; padding: 12px; border-radius: $radius-card; background: $green-soft; color: $ink; font-weight: 700; }
.proof-image-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.proof-image { width: 100%; height: 88px; border-radius: $radius-button; background: $line-light; }
.handover-rejection { display: grid; gap: 4px; margin-top: 12px; padding: 12px; border: 1px solid $danger-soft; border-radius: $radius-card; background: $danger-soft; color: $red; }
.review-history { display: grid; gap: 6px; margin-top: 14px; padding: 12px; border: 1px solid $line; border-radius: $radius-card; background: $bg; }
.reject-editor { display: grid; gap: 10px; margin-top: 14px; padding: 12px; border: 1px solid $line; border-radius: $radius-card; background: $panel; }
.warehouse-checkin-card { display: grid; gap: 10px; padding: 18px; border: 1px solid $line; border-radius: $radius-card; background: $panel; text-align: center; }
.warehouse-distance { display: grid; gap: 4px; }
.warehouse-distance text { color: $muted; font-size: 12px; }
.warehouse-distance .val { color: $green-deep; font-size: 28px; }
.route-status-filters { margin-bottom: 12px; }
.route-card-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.route-mode-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; margin: 12px 0; padding: 4px; border-radius: $radius-card; background: $green-soft; }
.route-mode-tabs button { min-height: 40px; border: 0; border-radius: $radius-button; background: transparent; color: $muted; }
.route-mode-tabs button.active { background: $green; color: $on-brand; font-weight: 700; }
.route-stop-actions { display: grid; grid-template-columns: repeat(2, $control); gap: 6px; flex: none; }
.route-stop-actions .primary-button { grid-column: 1 / -1; min-width: 0; width: calc($control * 2 + 6px); padding: 0 6px; }
.route-contact-button { font-size: 13px; }
.store-action-hint { align-self: center; padding: 12px; }
.shortage-allocate-row > input { width: 82px; height: 40px; padding: 0 8px; border: 1px solid $line; border-radius: $radius-button; background: $panel; color: $ink; text-align: center; }
.shortage-note-input { width: 100%; height: 38px; margin-top: 6px; padding: 0 9px; border: 1px solid $line; border-radius: $radius-button; background: $bg; color: $ink; text-align: left; }

// ===== 司机配送现代化视觉 =====
.driver-hero-panel { margin: 0 16px 12px; padding: 18px 16px 14px; border-radius: 24px; background: var(--gradient-brand); box-shadow: var(--shadow-card); }
.driver-hero-panel .hero-top { padding: 0; }
.driver-hero-panel .hero-avatar { background: rgba(255, 255, 255, .2); color: $on-brand; }
.driver-hero-panel .hero-title, .driver-hero-panel .hero-sub, .driver-hero-panel .hero-stat-label, .driver-hero-panel .hero-stat-value { color: $on-brand; }
.driver-hero-identity { display: grid; gap: 3px; min-width: 0; }
.driver-hero-warehouse { display: flex; align-items: center; gap: 5px; margin-top: 3px; color: var(--color-on-brand); font-size: var(--text-body); font-weight: 600; }
.driver-hero-panel .hero-stats { margin-top: 14px; border: 0; background: rgba(255, 255, 255, .12); }
.driver-hero-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; border-radius: 14px; overflow: hidden; }
.driver-hero-stats .hero-stat { border: 0; background: transparent; }
.driver-status-segments { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; margin-bottom: 14px; padding: 4px; border-radius: $radius-card; background: $green-soft; }
.driver-status-segments button { min-height: 40px; border: 0; border-radius: $radius-button; background: transparent; color: $muted; font-size: 14px; }
.driver-status-segments button.active { background: $green; color: $on-brand; font-weight: 700; box-shadow: var(--shadow-button-primary); }
.driver-route-card { width: 100%; display: grid; gap: 0; padding: 0; border: 1px solid $line; border-radius: 18px; background: $panel; box-shadow: $shadow-card; overflow: hidden; }
.driver-route-card-main { width: 100%; display: grid; gap: 12px; padding: var(--space-card); border: 0; background: transparent; text-align: left; }
.driver-route-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.driver-route-card-head > view { display: grid; gap: 3px; min-width: 0; }
.driver-route-card-head .muted { font-size: var(--text-body); line-height: 1.45; }
.driver-route-name { display: block; color: $ink; font-size: var(--text-title); font-weight: 800; }
.driver-route-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; width: 100%; padding: 12px; border-radius: $radius-card; background: $bg; }
.driver-route-metrics view { display: grid; gap: 2px; min-width: 0; }
.driver-route-metrics view:last-child .val { overflow: visible; white-space: normal; }
.driver-route-metrics .meta { color: $muted; font-size: var(--text-body); }
.driver-route-metrics .val { overflow: hidden; color: $ink; font-size: var(--text-subtitle); line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.driver-route-progress { display: grid; gap: 6px; }
.driver-route-progress-head { display: flex; justify-content: space-between; gap: 8px; color: $muted; font-size: var(--text-body); }
.driver-route-progress-track, .shortage-progress-track { height: 7px; overflow: hidden; border-radius: 999px; background: $line-light; }
.driver-route-progress-track > view, .shortage-progress-track > view { height: 100%; border-radius: inherit; background: $green; transition: width .2s ease; }
.driver-route-warning { display: flex; align-items: center; gap: 7px; margin: 0 15px 12px; padding: 10px 12px; border: 1px solid $warning-soft; border-radius: $radius-button; background: $warning-soft; color: $amber; font-size: 12px; }
.badge.pending_checkin, .badge.pending_submission { background: $warning-soft; color: $amber; }
.badge.pending_review { background: $info-soft; color: $blue; }
.badge.rejected { background: $danger-soft; color: $red; }
.badge.pending_shortage { background: $danger-soft; color: $red; }
.badge.ready_to_dispatch { background: $green-soft; color: $green-deep; }
.badge.delivering { background: $info-soft; color: $blue; }
.badge.completed, .badge.checked_in { background: $green-soft; color: $green-deep; }
.badge.waiting { background: $bg; color: $muted; }
.badge.in_transit { background: $info-soft; color: $blue; }
.driver-timeline { display: grid; gap: 0; }
.driver-timeline-item { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 10px; min-width: 0; }
.driver-timeline-axis { display: flex; flex-direction: column; align-items: center; }
.driver-timeline-axis .route-number { width: 30px; height: 30px; font-size: 13px; background: $line; color: $muted; }
.driver-timeline-line { width: 2px; flex: 1; min-height: 18px; background: $line; }
.driver-timeline-item.is-in_transit .route-number, .driver-timeline-item.is-checked_in .route-number, .driver-timeline-item.is-completed .route-number { background: $green; color: $on-brand; }
.driver-timeline-item.is-in_transit .driver-timeline-line, .driver-timeline-item.is-checked_in .driver-timeline-line, .driver-timeline-item.is-completed .driver-timeline-line { background: $green-soft; }
.driver-timeline-card { min-width: 0; margin-bottom: 12px; padding: 14px; border: 1px solid $line; border-radius: $radius-card; background: $panel; box-shadow: var(--shadow-card); }
.driver-timeline-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.driver-timeline-name { display: block; color: $ink; font-size: 16px; font-weight: 750; }
.driver-timeline-metrics { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.driver-timeline-metrics text { padding: 4px 8px; border-radius: 999px; background: $bg; color: $muted; font-size: 12px; }
.driver-timeline-contact { display: flex; align-items: center; gap: 5px; margin-top: 9px; color: $muted; font-size: 12px; }
.driver-timeline-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.driver-timeline-actions .icon-button { width: 40px; height: 40px; min-height: 40px; }
.driver-timeline-actions .mini-button { flex: 1; min-width: 72px; }
.warehouse-distance-ring { width: 150px; height: 150px; margin: 6px auto; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 10px solid $line-light; border-radius: 50%; background: $bg; color: $muted; transition: border-color .2s ease, transform .2s ease; }
.warehouse-distance-ring.in-range { border-color: $green; color: $green-deep; transform: scale(1.02); }
.warehouse-distance-ring text, .warehouse-distance-ring .meta { font-size: 12px; }
.warehouse-distance-ring .val { margin: 3px 0; font-size: 36px; line-height: 1; }
.warehouse-checkin-tip { font-weight: 700; }
.warehouse-checkin-action { min-height: 48px; }
.warehouse-history-timeline { display: grid; gap: 0; margin-top: 8px; }
.warehouse-history-item { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 8px; }
.warehouse-history-dot { width: 10px; height: 10px; margin: 5px auto 0; border: 2px solid $panel; border-radius: 50%; background: $green; box-shadow: 0 0 0 1px $green; }
.warehouse-history-content { position: relative; padding: 0 0 16px 2px; border-left: 1px solid $line; }
.warehouse-history-content::before { content: ''; position: absolute; left: -5px; top: 5px; width: 8px; height: 8px; border-radius: 50%; background: $green; }
.outbound-quantity-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-top: 10px; }
.outbound-quantity-grid > view { min-width: 0; padding: 8px 6px; border-radius: $radius-button; background: $bg; text-align: center; }
.outbound-quantity-grid .meta, .outbound-quantity-grid .val { display: block; }
.outbound-quantity-grid .meta { color: $muted; font-size: 12px; }
.outbound-quantity-grid .val { margin-top: 3px; color: $ink; font-size: 15px; }
.outbound-quantity-grid .danger { background: $danger-soft; color: $red; }
.outbound-inline-edit { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; padding: 8px 10px; border: 1px solid $green-soft; border-radius: $radius-button; background: $green-soft; color: $green-deep; font-size: 13px; }
.outbound-inline-edit input { width: 84px; height: 40px; padding: 0 8px; border: 1px solid $line; border-radius: $radius-button; background: $panel; text-align: center; }
.shortage-progress { display: grid; gap: 6px; margin-top: 10px; }
.shortage-progress-head { display: flex; justify-content: space-between; color: $muted; font-size: 12px; }
.store-readonly-note { display: block; margin-top: 8px; padding: 7px 9px; border-radius: $radius-button; background: $danger-soft; color: $red; font-size: 12px; }

// ===== 司机历史与门店明细补充 =====
.driver-timeline-item.is-selected .driver-timeline-card { border-color: $green; box-shadow: 0 0 0 2px $green-soft, var(--shadow-card); }
.driver-timeline-item.is-next .driver-timeline-name { color: $green-deep; }
.driver-timeline-status { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: none; }
.tag.next-stop { background: $green; color: $on-brand; }
.outbound-store-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 40px; margin-top: 10px; padding: 0 10px; border: 1px solid $line; border-radius: $radius-button; background: $panel; color: $green-deep; font-size: 13px; font-weight: 700; }
.outbound-store-breakdown { display: grid; gap: 8px; margin-top: 8px; padding: 10px; border-radius: $radius-card; background: $bg; }
.outbound-store-breakdown > view { display: grid; gap: 4px; padding: 10px; border: 1px solid $line; border-radius: $radius-button; background: $panel; }
.driver-history, .driver-mine { display: grid; gap: 12px; }
.driver-history-card, .driver-handover-card { display: grid; gap: 10px; padding: 14px; border: 1px solid $line; border-radius: 18px; background: $panel; box-shadow: $shadow-card; }
.driver-history-order { display: block; color: $ink; font-size: 16px; font-weight: 800; }
.driver-history-meta, .driver-handover-meta { display: flex; flex-wrap: wrap; gap: 6px 10px; color: $muted; font-size: 12px; }
.driver-history-meta text, .driver-handover-meta text { padding: 4px 8px; border-radius: 999px; background: $bg; }
.driver-handover-card { gap: 8px; }
.driver-handover-head { align-items: flex-start; }
.driver-handover-customer { display: block; margin-top: 3px; color: $muted; font-size: var(--text-body); line-height: 1.4; }
.driver-handover-meta { display: flex; gap: 4px 12px; padding-top: 8px; border-top: 1px solid $line; color: $muted; font-size: var(--text-caption); }
.driver-handover-meta text { padding: 0; background: transparent; }
.driver-handover-note { display: block; padding: 9px 10px; border-left: 3px solid var(--color-info); border-radius: 0 var(--radius-button) var(--radius-button) 0; background: var(--color-info-soft); color: var(--color-info-dark); font-size: var(--text-caption); line-height: 1.5; }
.driver-history-card .task-items { margin-top: 0; }
.driver-pending-card { border-radius: 18px; box-shadow: $shadow-card; }
.driver-pending-card .task-store { margin-top: 10px; }

// ===== 司机单页导航与异常打卡 =====
.driver-route-metrics { gap: 0; padding: 0; border: 1px solid $line; border-radius: 12px; background: $panel; overflow: hidden; }
.driver-route-metrics view { min-height: 58px; padding: 10px 12px; border-right: 1px solid $line; border-bottom: 1px solid $line; }
.driver-route-metrics view:nth-child(2n) { border-right: 0; }
.driver-route-metrics view:nth-last-child(-n + 2) { border-bottom: 0; }
.driver-records-title { margin: 0; }
.driver-quick-tools { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 0; }
.driver-quick-tools button { display: grid; justify-items: center; gap: 8px; min-height: 96px; padding: 12px 8px; border: 1px solid $line; border-radius: 18px; background: $panel; box-shadow: $shadow-card; }
.driver-quick-icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 15px; background: $green-soft; color: $green-deep; }
.driver-quick-tools text { color: $ink; font-size: var(--text-subtitle); font-weight: 800; }
.driver-aux-page { grid-template-rows: auto minmax(0, 1fr); padding-bottom: 20px; }
.driver-data-filters { display: grid; gap: 10px; margin-bottom: 14px; }
.driver-data-date-control { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.driver-data-date-picker, .driver-data-date-control input { min-width: 0; width: 100%; }
.driver-data-date-clear { min-width: 88px; }
.driver-data-search { margin-top: 0; }
.driver-data-search input { height: 40px; }
.driver-data-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.driver-data-summary > view { display: grid; gap: 3px; padding: 12px; border: 1px solid $line; border-radius: $radius-card; background: $panel; }
.driver-data-summary .meta { color: $muted; font-size: 12px; }
.driver-data-summary .val { color: $green-deep; font-size: 22px; }
.driver-data-summary > view:last-child { grid-column: 1 / -1; }
.driver-data-group { display: grid; gap: 8px; margin-bottom: 12px; }
.driver-data-date { color: $ink; font-size: 15px; font-weight: 800; }
.driver-data-route { display: grid; gap: 8px; padding: 12px; border: 1px solid $line; border-radius: $radius-card; background: $panel; }
.warehouse-abnormal-form { display: grid; gap: 12px; padding: 14px; border: 1px solid $line; border-radius: $radius-card; background: $panel; }
.warehouse-reason-options { display: flex; flex-wrap: wrap; gap: 8px; }
.warehouse-reason-options .chip { flex: 1 1 42%; }

// ===== 司机角色统一视觉层 =====
.driver-role-page { display: grid; gap: var(--space-section); padding-bottom: calc(var(--space-page) + env(safe-area-inset-bottom)); color: var(--color-ink); transition: background-color 160ms ease, color 160ms ease; }
.driver-role-page .driver-section-card { padding: var(--space-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); background: var(--color-card); box-shadow: var(--shadow-card); transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease; }
.driver-role-page .driver-route-card.driver-section-card { padding: 0; }
.handover-shared-page .driver-section-card { padding: var(--space-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); background: var(--color-card); box-shadow: var(--shadow-card); }
.driver-role-page .driver-action-secondary { min-height: var(--control-size); border: 1px solid var(--color-line); border-radius: var(--radius-button); background: var(--color-card); color: var(--color-brand-primary-dark); transition: border-color 160ms ease, background-color 160ms ease; }
.driver-role-page .badge.pending_review { background: var(--color-info-soft); color: var(--color-info-dark); }
.driver-role-page .badge.pending_shortage, .driver-role-page .badge.rejected { background: var(--color-danger-soft); color: var(--color-danger-dark); }
.driver-role-page .badge.pending_checkin, .driver-role-page .badge.pending_submission, .driver-role-page .badge.ready_to_dispatch { background: var(--color-warning-soft); color: var(--color-warning-dark); }
.driver-role-page .driver-route-card-main:active, .driver-role-page .driver-timeline-card:active, .driver-role-page .driver-quick-tools button:active, .driver-role-page .driver-data-route:active { transform: scale(.992); }
// ===== 布局重设计覆盖层（只动布局，零模板改动）=====
.login-fields { gap: 12px; padding: 14px; border: 1px solid $line; border-radius: $radius-card; background: $bg; }
.login-button { min-height: 48px; font-size: 15px; }
.secondary-head { min-height: 52px; }
.secondary-head .page-back { width: 34px; height: 34px; min-height: 34px; border: 1px solid $line; border-radius: 50%; background: $panel; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.secondary-foot { border-top: 1px solid $line; }
.steps { gap: 0; margin-bottom: 16px; }
.step:not(:last-child)::after { content: ''; width: 16px; height: 1.5px; background: $line; margin: 0 4px; }
.step.done:not(:last-child)::after { background: $green; }
.order-item-line { gap: 10px; padding: 9px 10px; border: 1px solid $line; border-radius: $radius-button; background: $panel; margin-bottom: 6px; }
.shortage-line { padding: 9px 10px; border: 1px solid $line; border-radius: $radius-button; background: $panel; margin-bottom: 6px; }
.actual-line { padding: 9px 10px; border: 1px solid $line; border-radius: $radius-button; background: $panel; }
.driver-form-sheet .form-fields { gap: 12px; padding: 14px; border: 1px solid $line; border-radius: $radius-card; background: $bg; }
.sku-card-head > text { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 999px; background: $green-soft; color: $green-deep; font-size: 12px; font-weight: 700; }
.supplier-sku-fields { background: $panel; box-shadow: $shadow-card; }
.order-amount { color: $price; }
.route-stop-selected { border-left: 3px solid $green; }
.mine-tile-grid { gap: 10px; }
.mine-tile-grid .work-link { min-height: 92px; }
.delivery-route-map { min-height: 200px; }
.delivery-route-map :deep(.delivery-route-map-canvas) { height: 200px; }
.delivery-route-map :deep(.delivery-route-map-overlay) { left: 10px; right: auto; max-width: calc(100% - 76px); padding: 6px 12px; border-radius: 999px; box-shadow: $shadow-card; }
@media (hover: hover) {
  .role-tabs button:not(.active):hover { background: var(--color-hover-bg); }
  .category-picker-option:hover { background: var(--color-hover-bg); }
  .work-link:hover { background: var(--color-hover-bg); }
}
</style>
<style lang="scss">
/* #ifdef MP-WEIXIN */
.app-shell,
.sheet-panel,
.category-picker-sheet {
  max-width: 100% !important;
}
.tabbar {
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  transform: none !important;
}
/* #endif */
</style>
