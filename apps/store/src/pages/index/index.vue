<template>
  <view v-if="!store.auth.isLoggedIn" class="login-page">
    <view class="login-card">
      <view class="pc-login-hero login-hero">
        <view class="pc-login-mark"><UiIcon name="shopping-bag" :size="26" /></view>
        <text class="pc-login-brand">门店订货商城</text>
        <text class="pc-login-sub">供应链 · 供货价直采 · 中台直配到店</text>
      </view>
      <view class="login-panel">
      <view class="login-body">
        <view class="login-roles" role="radiogroup" aria-label="登录身份">
          <button :class="{ active: loginRole === 'owner' }" role="radio" :aria-checked="loginRole === 'owner'" @click="switchLoginRole('owner')">门店账号</button>
          <button :class="{ active: loginRole === 'staff' }" role="radio" :aria-checked="loginRole === 'staff'" @click="switchLoginRole('staff')">业务员账号</button>
        </view>
        <view class="login-tabs">
          <button :class="{ active: loginTab === 'password' }" @click="loginTab = 'password'">密码登录</button>
          <button :class="{ active: loginTab === 'code' }" @click="loginTab = 'code'">验证码登录</button>
        </view>
        <view class="login-fields">
          <label class="login-field"><text>手机号</text><input v-model="loginPhone" type="number" maxlength="11" :placeholder="loginRole === 'owner' ? '请输入门店账号手机号' : '请输入业务员账号手机号'" /></label>
          <label v-if="loginTab === 'password'" class="login-field"><text>密码</text><input v-model="loginPassword" type="password" placeholder="请输入密码" confirm-type="done" @confirm="submitLogin" /></label>
          <label v-else class="login-field"><text>验证码</text><view class="code-input"><input v-model="loginCode" type="number" maxlength="6" placeholder="请输入验证码" confirm-type="done" @confirm="submitLogin" /><button class="code-button" :disabled="codeCountdown > 0" @click="sendCode">{{ codeCountdown > 0 ? codeCountdown + 's' : '发送验证码' }}</button></view></label>
        </view>
        <button class="login-button" @click="submitLogin">登 录</button>
        <text class="login-hint">{{ loginRole === 'owner' ? '门店演示账号 13800000001 / 123456' : '业务员演示账号 13800000002 / 123456' }}　验证码 123456</text>
      </view>
      </view>
    </view>
  </view>
  <view v-else class="app-shell" :class="{ 'has-cart-bar': (activeTab === 'home' || activeTab === 'category') && store.cartCount }">
    <view v-if="store.loading" class="loading pc-loading">正在准备门店订货商城...</view>
    <view v-else-if="store.error" class="state-page pc-empty">
      <view class="pc-state-icon"><UiIcon name="radio" :size="28" /></view>
      <text>{{ store.error }}</text>
      <button class="primary-button" @click="retryLoad">重新加载</button>
    </view>
    <template v-else>
      <view v-if="productView && selectedProduct" class="product-view" data-visual-view="product">
        <view class="detail-gallery-shell">
          <swiper class="detail-gallery" :current="detailGalleryIndex" :circular="detailGallery.length > 1" @change="onDetailGalleryChange">
            <swiper-item v-for="image in detailGallery" :key="mediaValueToImage(image)">
              <BusinessImage class="detail-gallery-image" :src="image" mode="aspectFill" />
            </swiper-item>
          </swiper>
          <button class="detail-gallery-back" aria-label="返回商品列表" @click="closeProductView"><UiIcon name="arrow-left" :size="21" /></button>
          <template v-if="detailGallery.length > 1">
            <text class="detail-gallery-count">{{ detailGalleryIndex + 1 }} / {{ detailGallery.length }}</text>
          </template>
          <text v-if="selectedProduct.source === 'platform'" class="detail-source-badge">中台供</text>
        </view>

        <view class="detail-body">
        <view class="detail-summary detail-section" data-visual-state="store-product">
          <view class="detail-price-row">
            <view class="detail-current-price">
              <strong class="val">{{ money(detailUnitPrice) }}</strong>
              <del v-if="selectedSku && detailUnitPrice !== levelPrice(selectedSku.cost)" class="strike">{{ money(levelPrice(selectedSku.cost)) }}</del>
            </view>
            <text v-if="detailSavePercent > 0" class="detail-saving">较零售价省 {{ detailSavePercent }}%</text>
          </view>
          <text v-if="!store.isStoreOwner" class="detail-level-badge">{{ store.priceLevelLabel }} 分销价</text>
          <text class="detail-retail-price">建议零售价 {{ money(selectedSku?.price ?? selectedProduct.price) }}</text>
          <text class="detail-product-name">{{ selectedProduct.name }}</text>
          <view class="detail-meta-row">
            <text>{{ selectedProduct.supplier }}</text>
            <text>已售 {{ selectedProduct.sales.toLocaleString('zh-CN') }}</text>
            <text :class="{ 'is-in-stock': !!selectedSku?.stock }">库存 {{ selectedSku?.stock ?? 0 }}</text>
          </view>
          <view v-if="selectedProduct.tags.length" class="detail-tag-row">
            <text v-for="tag in selectedProduct.tags" :key="tag">{{ tag }}</text>
          </view>
        </view>

        <view class="detail-purchase detail-section">
          <view class="detail-section-heading"><text>商品规格</text><small class="meta">{{ selectedProduct.skus.length }} 个可选规格</small></view>
          <view class="detail-sku-options" role="radiogroup" aria-label="商品规格">
            <button v-for="sku in selectedProduct.skus" :key="sku.id" class="detail-sku-option" :class="{ active: selectedSkuId === sku.id }" :disabled="!canStartOrder(sku)" role="radio" :aria-checked="selectedSkuId === sku.id" @click="selectDetailSku(sku.id)">
              <text>{{ sku.name }}</text>
              <small class="meta">{{ money(levelPrice(sku.cost)) }} · 库存 {{ sku.stock }} · 起订 {{ effectiveMinimumOrderQuantity(sku) }} 件</small>
            </button>
          </view>
          <view class="detail-quantity-row">
            <view><text>采购数量</text><small class="meta">当前规格起订量 {{ detailMinimumQuantity }} 件 · 可加 {{ detailRemainingStock }} 件</small></view>
            <view class="detail-quantity-stepper">
              <button aria-label="减少采购数量" :disabled="detailQuantity <= detailMinimumQuantity" @click="changeDetailQuantity(-1)">−</button>
              <input class="detail-quantity-input" type="number" inputmode="numeric" :value="detailQuantityText" @input="onDetailQuantityInput" @blur="commitDetailQuantity" @confirm="commitDetailQuantity" />
              <button aria-label="增加采购数量" :disabled="!selectedSku || detailQuantity >= detailRemainingStock" @click="changeDetailQuantity(1)">+</button>
            </view>
          </view>
          <view class="detail-purchase-total"><text>当前小计</text><strong class="val">{{ money(detailSubtotal) }}</strong></view>
          <small v-if="selectedSku && !detailCanAdd" class="stock-warning meta">库存不足或购买数量未达要求</small>
        </view>

        <view v-if="detailLadderTiers.length" class="detail-ladder-section detail-section">
          <view class="detail-section-heading"><text>阶梯采购价</text><small class="meta">数量越多，采购单价越低</small></view>
          <view class="detail-ladder-list">
            <view v-for="tier in detailLadderTiers" :key="tier.minQty" class="detail-ladder-row" :class="{ active: detailActiveTier?.minQty === tier.minQty }">
              <text>{{ tierRange(tier) }}</text><strong class="val">{{ money(tier.price) }} / 件</strong><small class="meta">让利 {{ tier.discountOff }}%</small>
            </view>
          </view>
          <text v-if="detailNextTier" class="detail-next-tier">再购 {{ detailNextTier.minQty - detailPricingQuantity }} 件，可享 {{ money(detailNextTier.price) }} / 件</text>
        </view>

        <view v-if="detailRichImages.length" class="detail-rich-images detail-section">
          <view class="detail-section-heading"><text>图文详情</text></view>
          <BusinessImage v-for="image in detailRichImages" :key="mediaValueToImage(image)" class="detail-rich-image" :src="image" mode="widthFix" />
        </view>
        </view>

        <view class="product-detail-bar">
          <button class="detail-bar-link" aria-label="返回首页" @click="goProductHome"><UiIcon name="house" :size="21" /><text>首页</text></button>
          <button class="detail-bar-link" aria-label="进入进货单" @click="goProductCart"><view class="detail-cart-icon"><UiIcon name="shopping-cart" :size="21" /><text v-if="store.cartCount" class="detail-cart-badge">{{ store.cartCount > 99 ? '99+' : store.cartCount }}</text></view><text>进货单</text></button>
          <button class="detail-bar-add" :disabled="!detailCanAdd" @click="addDetailProduct">加入进货单</button>
        </view>
      </view>
      <template v-else>
      <view v-if="activeTab === 'home'" class="tab-page shop-page">
        <view class="mall-hero">
          <text class="mall-hero-title">门店订货商城</text>
          <text class="mall-hero-sub">供应链 · 供货价直采 · 中台直配到店</text>
        </view>
        <view class="page-pad">
          <view class="search-bar"><UiIcon name="search" :size="18" /><input v-model="keyword" placeholder="搜索供应链商品 / 供应商" confirm-type="search" /></view>
          <view class="category-grid cat-card">
            <button v-for="item in homeCategories" :key="item.key" class="category-grid-item" :class="{ active: category === item.key }" @click="category = item.key"><BusinessImage class="category-grid-img" :src="productCategoryImage(item.key, dictionaryState)" :fallback="defaultProductCategoryImage(item.key)" :error-fallback="defaultProductCategoryImage()" :show-error="false" mode="aspectFill" /><text class="category-grid-label">{{ item.label }}</text></button>
          </view>
          <view v-if="visibleProducts.length" class="result-count">共 {{ visibleProducts.length }} 款商品 · 中台直配到店</view>
          <view v-if="visibleProducts.length" class="waterfall-grid">
            <view v-for="product in visibleProducts" :key="product.id" class="product-card">
              <button class="product-image product-open" :aria-label="`查看${product.name}`" @click="openProduct(product)">
                <BusinessImage class="product-emoji" :src="product.image" mode="aspectFill" />
                <text v-if="product.source === 'platform'" data-typography-compact>中台供</text>
              </button>
              <view class="product-body">
                <text class="item-title">{{ product.name }}</text>
                <text class="muted">已售 {{ product.sales.toLocaleString('zh-CN') }} · {{ canStartProductOrder(product) ? stockText(product) : '库存不足' }}</text>
                <view class="product-foot">
                  <view class="cost-prices"><strong class="val">{{ money(levelPrice(product.cost)) }}</strong><del v-if="product.price > product.cost" class="strike">{{ money(product.price) }}</del><span v-if="product.price > product.cost" class="chip">省 {{ savePercent(product) }}%</span></view>
                  <button class="add-btn" :aria-label="`加入${product.name}到进货单`" :disabled="!canStartProductOrder(product)" @click="addProduct(product)"><UiIcon name="plus" :size="16" /></button>
                </view>
              </view>
            </view>
          </view>
          <view v-else class="empty-page pc-empty"><view class="pc-state-icon"><UiIcon name="search" :size="26" /></view><text>没有找到相关商品</text><small class="pc-state-note meta">试试其他关键词或分类</small></view>
        </view>
      </view>

      <view v-else-if="activeTab === 'category'" class="tab-page category-page">
        <view class="mall-hero">
          <text class="mall-hero-title">商品分类</text>
          <text class="mall-hero-sub">供货价直采 · 中台直配到店</text>
        </view>
        <view class="page-pad">
          <view class="category-layout">
            <view class="category-side">
              <button v-for="item in categories" :key="item.key" class="side-item" :class="{ active: category === item.key }" :title="item.label" @click="category = item.key">{{ item.key === '全部' ? '所有商品' : item.label }}</button>
            </view>
            <view class="category-main">
              <view class="search-bar"><UiIcon name="search" :size="18" /><input v-model="keyword" placeholder="搜索供应链商品 / 供应商" confirm-type="search" /></view>
              <view v-if="visibleProducts.length" class="category-products">
                <view v-for="product in visibleProducts" :key="product.id" class="cat-product" @click="openProduct(product)">
                  <BusinessImage class="cat-product-img" :src="product.image" mode="aspectFill" />
                  <view class="cat-product-body">
                    <view class="tag-row"><text v-for="tag in product.tags.slice(0, 2)" :key="tag" class="tag" data-typography-compact>{{ tag }}</text></view>
                    <text class="cat-product-name">{{ product.name }}</text>
                    <text class="cat-stock">已售 {{ product.sales.toLocaleString('zh-CN') }} | 剩余 {{ product.stock }}</text>
                    <view class="cat-foot"><view class="cat-price-box"><strong class="cat-price val">{{ money(levelPrice(product.cost)) }}</strong><del v-if="product.price > product.cost" class="cat-original strike">{{ money(product.price) }}</del></view><button class="cat-add add-btn" :disabled="!canStartProductOrder(product)" :aria-label="`加入${product.name}到进货单`" @click.stop="addProduct(product)"><UiIcon name="plus" :size="16" /></button></view>
                  </view>
                </view>
              </view>
              <view v-else class="empty-page pc-empty"><view class="pc-state-icon"><UiIcon name="search" :size="26" /></view><text>该分类暂无商品</text></view>
            </view>
          </view>
        </view>
      </view>

      <view v-else-if="activeTab === 'cart'" class="tab-page cart-page">
        <view class="mall-hero">
          <text class="mall-hero-title">进货车</text>
          <text class="mall-hero-sub">共 {{ store.cartCount }} 件 · 供货价直采</text>
        </view>
        <view class="page-pad cart-page-content">
          <view v-if="!store.cart.length" class="empty-page pc-empty"><view class="pc-state-icon"><UiIcon name="shopping-cart" :size="26" /></view><text>进货单还是空的</text><small class="pc-state-note meta">去首页下一单吧～</small></view>
          <template v-else>
            <view v-for="item in store.cart" :key="`${item.productId}-${item.skuId}`" class="cart-row" :class="{ unavailable: item.unavailable }">
              <button class="cart-check" :class="{ on: store.isCheckoutSelected(item) }" :aria-label="`选择${item.name}`" @click="store.toggleCheckoutSelection(item)"><UiIcon name="check" :size="14" /></button>
              <BusinessImage class="cart-row-img" :src="item.image" mode="aspectFill" />
              <view class="cart-row-main">
                <text class="cart-row-name">{{ item.name }}</text>
                <view class="cart-row-meta">
                  <small class="cart-row-sub meta">{{ item.skuName }}</small>
                  <small class="cart-row-stock meta" :class="{ warn: item.unavailable }">剩余库存 {{ item.stock }}</small>
                </view>
                <view class="cart-row-bottom"><strong class="cart-row-price val">{{ money(item.price) }}</strong><view class="stepper"><button aria-label="减少数量" @click="changeCartQuantity(item, -1)">−</button><input class="cart-quantity-input" type="number" inputmode="numeric" :value="cartQuantityText(item)" @input="onCartQuantityInput(item, $event)" @blur="commitCartQuantity(item)" @confirm="commitCartQuantity(item)" /><button aria-label="增加数量" :disabled="item.quantity >= item.stock" @click="changeCartQuantity(item, 1)">+</button></view></view>
              </view>
            </view>
          </template>
        </view>
        <view v-if="store.cart.length" class="cart-footer">
          <button class="cart-all" @click="toggleCartAll"><span class="cart-all-check chip" :class="{ on: cartAllSelected }"><UiIcon name="check" :size="14" /></span><text>{{ cartAllSelected ? '取消全选' : '全选' }}</text></button>
          <view class="cart-footer-total"><text>已选</text><strong class="cart-selected-count val">{{ store.checkoutCount }} 件</strong><text>合计</text><strong class="cart-total-amount val">{{ money(store.checkoutTotal) }}</strong></view>
          <button class="cart-del" @click="removeSelectedCart">删除</button>
          <button class="cart-checkout" :disabled="!store.checkoutCount || store.checkoutHasUnavailable" @click="goCheckout">结算({{ store.checkoutCount }})</button>
        </view>
      </view>

      <view v-else-if="activeTab === 'mine' && mineSection === 'orders'" class="tab-page orders-page">
        <view class="mall-hero heading-with-back"><button class="page-back" aria-label="返回" @click="mineSection = 'main'"><UiIcon name="arrow-left" :size="20" /></button><view><text class="mall-hero-title">我的订货单</text><text class="mall-hero-sub">供应链中台统一履约 · 直配到店</text></view></view>
        <view class="page-pad">
        <view class="order-summary">
          <view class="order-stat"><small class="meta">采购订单数</small><strong class="val">{{ store.orders.length }} 单</strong></view>
          <view class="order-stat"><small class="meta">待收货数量</small><strong class="val">{{ store.orderMetrics.pendingReceipt }}</strong></view>
          <view class="order-stat order-stat--amount"><small class="meta">月采购额</small><strong class="val">{{ money(store.orderMetrics.monthAmount) }}</strong></view>
        </view>
        <view class="chip-scroll"><view class="chips order-chips"><button v-for="item in orderFilters" :key="item.key" :class="{ active: orderFilter === item.key }" @click="orderFilter = item.key">{{ item.label }}<text class="chip-count" data-typography-compact>{{ item.count }}</text></button></view></view>
        <view v-if="filteredOrders.length" class="order-list">
          <button v-for="order in filteredOrders" :key="order.id" class="order-card" data-typography-compact @click="openOrder(order.id)">
            <span class="order-accent chip" :class="order.status" aria-hidden="true"></span>
            <view class="order-head"><text class="order-no">订单号 {{ order.id }}</text><span class="status-badge chip" :class="order.status">{{ displayStatus(order) }}</span></view>
            <view class="order-main">
              <BusinessImage class="order-thumb" :src="order.items[0]?.image" mode="aspectFill" />
              <view class="order-info">
                <text class="order-title">{{ orderTitle(order) }}</text>
                <small class="order-sub meta">共 {{ order.itemCount }} 件 · {{ order.items.length }} 款商品</small>
                <small class="order-meta meta">{{ order.createdAt }}<template v-if="order.trackingNo"> · 运单 {{ order.trackingNo }}</template></small>
              </view>
            </view>
            <view class="order-bottom">
              <small v-if="order.saved" class="order-saved meta">较零售省 {{ money(order.saved) }}</small>
              <view class="order-amount"><small class="meta">合计</small><strong class="val">{{ money(order.amount) }}</strong></view>
              <UiIcon name="chevron-right" :size="17" />
            </view>
          </button>
        </view>
        <view v-else class="empty-page pc-empty"><view class="pc-state-icon"><UiIcon name="package" :size="26" /></view><text>暂无相关订货单</text><small class="pc-state-note meta">去商城下一单吧～</small></view>
        </view>
      </view>

      <view v-else class="tab-page store-page">
        <view class="store-hero">
          <view class="store-hero-top"><text class="mall-hero-title">门店工作台</text><text class="mall-hero-sub">供货价直采 · 供应链中台直配</text></view>
          <view class="store-identity">
            <BusinessImage class="store-emoji" :src="store.info.image" mode="aspectFit" />
            <view class="store-identity-main">
              <text>{{ store.info.name }}</text>
              <small class="meta">{{ store.info.region }} · {{ store.info.contact }}</small>
              <small class="store-identity-address meta">地址 {{ store.info.address }}</small>
              <small class="store-identity-level meta">{{ store.isStoreOwner ? '门店账号 · 门店价' : `业务员账号 · ${store.priceLevelLabel}` }}</small>
            </view>
          </view>
        </view>
        <view class="metric-band store-metrics">
          <view><small class="meta">月采购额</small><strong class="val">{{ money(store.orderMetrics.monthAmount) }}</strong></view>
          <view><small class="meta">采购订单数</small><strong class="val">{{ store.orderMetrics.orderCount }}</strong></view>
          <view><small class="meta">待收货数量</small><strong class="val">{{ store.orderMetrics.pendingReceipt }}</strong></view>
          <view><small class="meta">节省金额</small><strong class="val">{{ money(store.orderMetrics.savedAmount) }}</strong></view>
        </view>
        <view class="page-pad store-body">
          <view class="section-head compact"><view><span class="chip"></span><text>快捷入口</text></view></view>
<view class="quick-grid pc-tile-grid">
  <button class="pc-tile pc-tile--amber" @click="goOrders"><view class="pc-tile-icon"><UiIcon name="package-check" :size="26" /><text v-if="store.orders.length" class="pc-tile-badge">{{ store.orders.length > 99 ? '99+' : store.orders.length }}</text></view><text class="pc-tile-label">我的订单</text></button>
  <button class="pc-tile pc-tile--coral" @click="sheet = 'address'"><view class="pc-tile-icon"><UiIcon name="map-pin" :size="26" /></view><text class="pc-tile-label">收货地址</text></button>
  <button class="pc-tile pc-tile--blue" @click="sheet = 'contact'"><view class="pc-tile-icon"><UiIcon name="headset" :size="26" /></view><text class="pc-tile-label">联系客服</text></button>
</view>
          <view class="section-head compact"><view><span class="chip"></span><text>热销常订</text></view><small class="meta">按进货次数</small></view>
          <view v-if="!storeMetrics.hotOrders.length" class="hot-list pc-empty"><view class="pc-state-icon"><UiIcon name="package-check" :size="26" /></view><text>暂无常订商品</text></view>
          <view v-else class="hot-list">
            <view v-for="(item, index) in storeMetrics.hotOrders" :key="item.id" class="hot-item">
              <text class="hot-rank">{{ index + 1 }}</text>
              <BusinessImage class="hot-emoji" :src="item.image" mode="aspectFill" />
              <view class="hot-main"><text>{{ item.name }}</text><small class="meta">已订 {{ item.times }} 次</small></view>
              <strong class="val">{{ money(item.amount) }}</strong>
            </view>
          </view>
          <button class="logout-button logout-danger" @click="logout">退出登录</button>
          <view class="member-footer">平台支持 · 供应链中台 · 中台统一维护商品状态与库存</view>
        </view>
      </view>

      <view v-if="(activeTab === 'home' || activeTab === 'category') && store.cartCount" class="cart-bar">
        <button class="cart-count" @click="openCart"><UiIcon name="shopping-cart" :size="21" /><span class="chip">{{ store.cartCount }}</span></button>
        <view><small class="meta">合计</small><strong class="val">{{ money(store.checkoutTotal) }}</strong></view>
        <button @click="openCart">去结算</button>
      </view>
      </template>

      <view v-if="!productView" class="tabbar">
        <button v-for="tab in tabs" :key="tab.key" :class="{ active: activeTab === tab.key }" @click="chooseTab(tab.key)"><view class="tab-icon-wrap"><UiIcon :name="tab.icon" :size="21" /><text v-if="tab.key === 'cart' && store.cartCount" class="tab-badge" data-typography-compact>{{ store.cartCount > 99 ? '99+' : store.cartCount }}</text></view><text class="tab-label">{{ tab.label }}</text></button>
      </view>

      <view v-if="sheet" class="sheet-mask" @click.self="sheet = null">
        <view class="sheet">
          <view class="sheet-head">
            <text>{{ sheetTitle }}</text>
            <button aria-label="关闭弹层" @click="sheet = null"><UiIcon name="x" :size="19" /></button>
          </view>
          <scroll-view class="sheet-scroll" scroll-y>

          <view v-if="sheet === 'product' && selectedProduct" class="product-detail sku-sheet" data-visual-state="store-product">
            <view class="sku-sum">
              <BusinessImage class="sku-sum-img" :src="selectedProduct.image" mode="aspectFill" />
              <view class="sku-sum-main">
                <text class="sku-sum-name">{{ selectedProduct.name }}</text>
                <view class="sku-sum-price"><strong class="val">{{ money(selectedSku?.cost ?? selectedProduct.cost) }}</strong><del v-if="(selectedSku?.price ?? selectedProduct.price) > (selectedSku?.cost ?? selectedProduct.cost)" class="strike">{{ money(selectedSku?.price ?? selectedProduct.price) }}</del></view>
                <text class="sku-sum-meta">库存 {{ selectedSku?.stock ?? 0 }} · 已选：{{ selectedSku?.name }}</text>
              </view>
            </view>
            <text class="sku-label">选择规格</text>
            <view class="sku-options">
              <button v-for="sku in selectedProduct.skus" :key="sku.id" :class="{ active: selectedSkuId === sku.id }" :disabled="!canStartOrder(sku)" @click="selectDetailSku(sku.id)">
                <text>{{ sku.name }}</text>
                <small class="meta">{{ money(sku.cost) }} · 库存 {{ sku.stock }} · 起订 {{ effectiveMinimumOrderQuantity(sku) }} 件</small>
              </button>
            </view>
            <view class="sku-qty-row">
              <view><text>采购数量</text><small class="meta">起订 {{ detailMinimumQuantity }} 件 · 当前库存 {{ selectedSku?.stock ?? 0 }}</small></view>
              <view class="stepper">
                <button aria-label="减少采购数量" :disabled="detailQuantity <= detailMinimumQuantity" @click="changeDetailQuantity(-1)">−</button>
                <input class="detail-quantity-input" type="number" inputmode="numeric" :value="detailQuantityText" @input="onDetailQuantityInput" @blur="commitDetailQuantity" @confirm="commitDetailQuantity" />
                <button aria-label="增加采购数量" :disabled="!selectedSku || detailQuantity >= detailRemainingStock" @click="changeDetailQuantity(1)">+</button>
              </view>
            </view>
            <view class="sku-sum-total"><text>当前小计</text><strong class="val">{{ money(detailSubtotal) }}</strong></view>
            <small v-if="selectedSku && !canStartOrder(selectedSku)" class="stock-warning meta">库存不足或数量未达要求</small>
          </view>

          <view v-else-if="sheet === 'cart'" class="sheet-list" data-visual-state="store-cart">
            <view v-if="!store.cart.length" class="empty pc-empty"><view class="pc-state-icon"><UiIcon name="shopping-cart" :size="26" /></view><text>进货单还是空的</text></view>
            <view v-for="item in store.cart" :key="`${item.productId}-${item.skuId}`" class="sheet-line sheet-line--selectable" :class="{ shortage: item.unavailable, selected: store.isCheckoutSelected(item) }">
              <button class="cart-check sheet-check" :class="{ on: store.isCheckoutSelected(item) }" :aria-label="`选择${item.name}`" @click.stop="store.toggleCheckoutSelection(item)"><UiIcon name="check" :size="14" /></button>
              <BusinessImage :src="item.image" mode="aspectFill" />
              <view class="sheet-line-main">
                <text>{{ item.name }}</text>
                <small class="meta">{{ item.skuName }} · 库存 {{ item.stock }}</small>
                <small v-if="item.unavailable" class="stock-warning meta">库存不足或购买数量未达要求，不可结算</small>
                <view class="sheet-line-foot">
                  <strong class="val">{{ money(item.price) }}</strong>
                  <view class="stepper">
                    <button aria-label="减少数量" @click="changeCartQuantity(item, -1)">−</button>
                    <input class="cart-quantity-input" type="number" inputmode="numeric" :value="cartQuantityText(item)" @input="onCartQuantityInput(item, $event)" @blur="commitCartQuantity(item)" @confirm="commitCartQuantity(item)" />
                    <button aria-label="增加数量" :disabled="item.quantity >= item.stock" @click="changeCartQuantity(item, 1)">+</button>
                  </view>
                </view>
              </view>
            </view>
            <text v-if="store.checkoutError" class="cart-error">{{ store.checkoutError }}</text>
          </view>

          <view v-else-if="sheet === 'contact'" class="contact-sheet" data-visual-state="store-contact">
            <view class="contact-hero">
              <text>供应链 · 门店客服</text>
              <small class="meta">统一品控 · 统一履约 · 工作日 {{ store.info.hours }} 在线</small>
              <view class="contact-phone-mark"><UiIcon name="phone" :size="26" /></view>
            </view>
            <view class="contact-rows">
              <view class="contact-row"><small class="meta">客服电话</small><text>{{ store.info.phone }}</text></view>
              <view class="contact-row"><small class="meta">门店对接人</small><text>{{ store.info.contact }}</text></view>
              <view class="contact-row"><small class="meta">营业时间</small><text>{{ store.info.hours }}</text></view>
              <view class="contact-row"><small class="meta">收货地址</small><text>{{ store.info.address }}</text></view>
            </view>
          </view>

          <view v-else-if="sheet === 'address'" class="address-sheet" data-visual-state="store-address">
            <view class="address-card">
              <small class="meta">收货门店</small><text>{{ store.info.name }}</text>
              <small class="meta">收货人</small><text>{{ store.info.contact }} {{ store.info.phone }}</text>
              <small class="meta">收货地址</small><text>{{ store.info.address }}</text>
            </view>
            <text class="address-note">订单由供应链中台统一直配到店，到货后请当面验货签收。</text>
          </view>
          </scroll-view>
          <view v-if="sheet === 'product' && selectedProduct" class="product-detail-actions sheet-foot">
            <button class="outline-button" @click="sheet = null">再看看</button>
            <button class="primary-button" :disabled="!canStartOrder(selectedSku)" @click="addSelected">加入进货单</button>
          </view>
          <view v-else-if="sheet === 'cart' && store.cart.length" class="sheet-foot cart-sheet-foot">
            <view class="cart-sheet-summary">
              <button class="cart-all" @click="toggleCartAll"><span class="cart-all-check chip" :class="{ on: cartAllSelected }"><UiIcon name="check" :size="14" /></span><text>{{ cartAllSelected ? '取消全选' : '全选' }}</text></button>
              <view class="cart-footer-total"><text>已选</text><strong class="cart-selected-count val">{{ store.checkoutCount }} 件</strong><text>合计</text><strong class="cart-total-amount val">{{ money(store.checkoutTotal) }}</strong></view>
            </view>
            <button class="primary-button" :disabled="!store.checkoutCount || store.checkoutHasUnavailable" @click="goCheckout">确认下单</button>
          </view>
          <view v-else-if="sheet === 'contact'" class="contact-actions sheet-foot">
            <button class="primary-button" @click="makePhoneCall"><UiIcon name="phone" :size="18" /><text>拨打电话</text></button>
            <button class="outline-button" @click="copyPhone">复制客服电话</button>
          </view>
          <view v-else-if="sheet === 'address'" class="sheet-foot">
            <button class="primary-button" @click="copyAddress"><UiIcon name="link" :size="16" /><text>复制地址</text></button>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import type { BusinessMediaValue, PriceTier, Product, StoreRole } from '@agritainment/shared'
import { tieredUnitPrice } from '@agritainment/shared'
import { PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_MEDIA_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, PLATFORM_STORE_CATALOG_SELECTIONS_STORAGE_KEY, PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, createPlatformDictionaryCache, defaultProductCategoryImage, installKeyboardButtonSupport, matchesPolicyScope, mediaValueToImage, money, normalizeMinimumOrderQuantity, productCategoryImage, readPlatformAfterSaleStatus, readPlatformDictionaries, subscribePlatformChanges, validateCatalogSkuOrderQuantity, validatePhone } from '@agritainment/shared'
import { BusinessImage } from '@agritainment/ui'
import UiIcon from '../../components/UiIcon.vue'
import { seedDemoStoreCart } from '../../data/demo-cart'
import { deriveStoreMetrics } from '../../services/repository'
import { readStorePricePolicies, useStoreStore, type StoreOrderStatus } from '../../stores/store'
import { storeOrderFilterKeys, storeOrderStatusLabel } from '../../order-status'

type TabKey = 'home' | 'category' | 'cart' | 'mine'
type SheetKey = 'product' | 'cart' | 'address' | 'contact' | null

const store = useStoreStore()
const dictCache = createPlatformDictionaryCache()
const dictionaryState = ref(readPlatformDictionaries())
let disposeDictionaryImages: () => void = () => undefined
const storeMetrics = computed(() => deriveStoreMetrics(store.products))
const pricePolicyVersion = ref(0)
const activePolicies = computed(() => {
  void pricePolicyVersion.value
  return readStorePricePolicies()
})
const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'home', label: '首页', icon: 'house' },
  { key: 'category', label: '商品分类', icon: 'layout-dashboard' },
  { key: 'cart', label: '进货车', icon: 'shopping-cart' },
  { key: 'mine', label: '我的', icon: 'user-round' }
]

const activeTab = ref<TabKey>('home')
const mineSection = ref<'main' | 'orders'>('main')
const category = ref('全部')
const keyword = ref('')
const orderFilter = ref<'all' | StoreOrderStatus>('all')
const sheet = ref<SheetKey>(null)
const selectedProduct = ref<Product | null>(null)
const productView = ref(false)
const detailGalleryIndex = ref(0)
const detailQuantity = ref(1)
const detailQuantityText = ref('1')
const cartQuantityDrafts = ref<Record<string, string>>({})
const cartLineKey = (item: { productId: string; skuId: string }) => `${item.productId}:${item.skuId}`
const selectableCartLines = computed(() => store.cart.filter((item) => !item.unavailable))
const cartAllSelected = computed(() => selectableCartLines.value.length > 0 && selectableCartLines.value.every((item) => store.isCheckoutSelected(item)))
function toggleCartAll() {
  store.toggleAllCheckoutSelection()
}
function cartQuantityText(item: { productId: string; skuId: string; quantity: number }) {
  return cartQuantityDrafts.value[cartLineKey(item)] ?? String(item.quantity)
}
function inputEventValue(event: Event) {
  const payload = event as Event & { detail?: { value?: string }; target?: EventTarget | null }
  const target = payload.target as { value?: string } | null
  return String(payload.detail?.value ?? target?.value ?? '')
}
function onCartQuantityInput(item: { productId: string; skuId: string }, event: Event) {
  const raw = inputEventValue(event)
  cartQuantityDrafts.value[cartLineKey(item)] = raw.replace(/\D/g, '')
}
function commitCartQuantity(item: { productId: string; skuId: string; quantity: number; stock: number; minimumOrderQuantity?: number; name: string }) {
  const key = cartLineKey(item)
  const raw = cartQuantityDrafts.value[key]
  if (raw === undefined) return
  if (!raw || !/^\d+$/.test(raw)) {
    delete cartQuantityDrafts.value[key]
    toast('请输入有效的商品数量')
    return
  }
  const parsed = Number(raw)
  const minimum = Math.max(1, normalizeMinimumOrderQuantity(item.minimumOrderQuantity))
  const maximum = Math.max(0, item.stock)
  if (maximum < minimum) {
    delete cartQuantityDrafts.value[key]
    toast('该商品库存不足')
    return
  }
  const normalized = Math.min(maximum, Math.max(minimum, parsed))
  if (normalized !== parsed) toast(parsed < minimum ? `数量不能低于起订量 ${minimum} 件` : `数量不能超过库存 ${maximum} 件`)
  if (store.setCartQuantity(item.productId, item.skuId, normalized)) cartQuantityDrafts.value[key] = String(normalized)
  else delete cartQuantityDrafts.value[key]
}
function changeCartQuantity(item: { productId: string; skuId: string }, delta: number) {
  delete cartQuantityDrafts.value[cartLineKey(item)]
  store.changeCart(item.productId, item.skuId, delta)
}
function removeSelectedCart() {
  if (!store.checkoutLineKeys.length) return toast('请先选择要删除的商品')
  const keys = [...store.checkoutLineKeys]
  keys.forEach((key) => { const [pid, sid] = key.split(':'); store.removeLine(pid, sid) })
  cartQuantityDrafts.value = {}
  toast('已删除选中商品')
}
const selectedSkuId = ref('')

const displayStatus = (order: { status: StoreOrderStatus }) => storeOrderStatusLabel(order.status)
const afterSaleStatus = (orderId: string) => readPlatformAfterSaleStatus(orderId)

const categories = computed(() => {
  const keys = ['全部', ...new Set(store.products.map((item) => item.category))]
  return keys.map((key) => ({
    key,
    label: key,
    count: key === '全部' ? store.products.length : store.products.filter((product) => product.category === key).length
  }))
})

const homeCategories = computed(() => categories.value.filter((item) => item.key !== '全部').slice(0, 10))

const visibleProducts = computed(() => {
  const kw = keyword.value.trim()
  return store.products.filter((item) => {
    const matchesCategory = category.value === '全部' || item.category === category.value
    const matchesKeyword = !kw || item.name.includes(kw) || item.supplier.includes(kw) || item.tags.some((tag) => tag.includes(kw))
    return matchesCategory && matchesKeyword
  })
})

const orderFilters = computed(() => {
  const count = (key: 'all' | StoreOrderStatus) => key === 'all' ? store.orders.length : store.orders.filter((order) => order.status === key).length
  return storeOrderFilterKeys.map((key) => ({ key, label: key === 'all' ? '全部' : storeOrderStatusLabel(key), count: count(key) }))
})

const filteredOrders = computed(() => orderFilter.value === 'all' ? store.orders : store.orders.filter((order) => order.status === orderFilter.value))


const selectedSku = computed(() => {
  if (!selectedProduct.value) return null
  return selectedProduct.value.skus.find((sku) => sku.id === selectedSkuId.value) || selectedProduct.value.skus[0] || null
})

function uniqueMedia(items: Array<BusinessMediaValue | undefined>): BusinessMediaValue[] {
  const seen = new Set<string>()
  return items.filter((item): item is BusinessMediaValue => {
    if (!item) return false
    const key = mediaValueToImage(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const detailGallery = computed(() => {
  if (!selectedProduct.value) return []
  return uniqueMedia([selectedSku.value?.image, selectedProduct.value.image, ...(selectedProduct.value.images || [])])
})

const detailRichImages = computed(() => {
  if (!selectedProduct.value) return []
  const mainImage = mediaValueToImage(selectedProduct.value.image)
  return uniqueMedia(selectedProduct.value.images || []).filter((image) => mediaValueToImage(image) !== mainImage)
})

function minimumOrderQuantity(sku: Pick<Product['skus'][number], 'minimumOrderQuantity'> | null | undefined) {
  return normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity)
}

function effectiveMinimumOrderQuantity(sku: Pick<Product['skus'][number], 'minimumOrderQuantity'> | null | undefined) {
  return Math.max(1, minimumOrderQuantity(sku))
}

function canStartOrder(sku: Pick<Product['skus'][number], 'stock' | 'minimumOrderQuantity'> | null | undefined) {
  return !!sku && validateCatalogSkuOrderQuantity(sku, effectiveMinimumOrderQuantity(sku)).ok
}

function canStartProductOrder(product: Product) {
  return product.skus.some((sku) => canStartOrder(sku))
}

const sheetTitle = computed(() => {
  switch (sheet.value) {
    case 'product': return '选择规格'
    case 'cart': return '进货单'
    case 'address': return '收货信息'
    case 'contact': return '联系客服'
    default: return ''
  }
})

function savePercent(product: Product) {
  return Math.max(0, Math.round((1 - product.cost / product.price) * 100))
}
/** 分销价展示：按当前登录身份的档位折让（业务员差异价） */
function levelPrice(base: number) {
  return Math.round(base * store.priceDiscount * 100) / 100
}
function ladderTiersFor(product: Product | null | undefined): PriceTier[] {
  if (!product) return []
  return activePolicies.value.find((policy) => policy.enabled && policy.type === 'ladder' && matchesPolicyScope(policy.scope, product.category, product.name))?.tiers ?? []
}

const detailMinimumQuantity = computed(() => effectiveMinimumOrderQuantity(selectedSku.value))
const detailCartQuantity = computed(() => {
  if (!selectedProduct.value || !selectedSku.value) return 0
  return store.cart.find((line) => line.productId === selectedProduct.value?.id && line.skuId === selectedSku.value?.id)?.quantity ?? 0
})
const detailRemainingStock = computed(() => Math.max(0, (selectedSku.value?.stock ?? 0) - detailCartQuantity.value))
const detailPricingQuantity = computed(() => detailCartQuantity.value + detailQuantity.value)
const detailPricing = computed(() => {
  if (!selectedProduct.value || !selectedSku.value) return null
  return tieredUnitPrice({ category: selectedProduct.value.category, name: selectedProduct.value.name, basePrice: selectedSku.value.cost, quantity: detailPricingQuantity.value }, activePolicies.value)
})
const detailUnitPrice = computed(() => detailPricing.value?.unitPrice ?? selectedSku.value?.cost ?? selectedProduct.value?.cost ?? 0)
const detailSubtotal = computed(() => Math.round(detailUnitPrice.value * detailQuantity.value * 100) / 100)
const detailSavePercent = computed(() => {
  const retail = selectedSku.value?.price ?? selectedProduct.value?.price ?? 0
  return retail > 0 ? Math.max(0, Math.round((1 - detailUnitPrice.value / retail) * 100)) : 0
})
const detailLadderTiers = computed(() => ladderTiersFor(selectedProduct.value))
const detailActiveTier = computed(() => detailPricing.value?.tier ?? null)
const detailNextTier = computed(() => detailLadderTiers.value.find((tier) => tier.minQty > detailPricingQuantity.value) || null)
const detailCanAdd = computed(() => !!selectedSku.value && detailQuantity.value <= detailRemainingStock.value && validateCatalogSkuOrderQuantity(selectedSku.value, detailQuantity.value).ok)

function tierRange(tier: PriceTier) {
  return tier.maxQty === null ? `${tier.minQty} 件以上` : `${tier.minQty}–${tier.maxQty} 件`
}

function onDetailGalleryChange(event: { detail: { current: number } }) {
  detailGalleryIndex.value = event.detail.current
}

function moveDetailGallery(delta: number) {
  if (detailGallery.value.length < 2) return
  detailGalleryIndex.value = (detailGalleryIndex.value + delta + detailGallery.value.length) % detailGallery.value.length
}

function syncDetailQuantityText() {
  detailQuantityText.value = String(detailQuantity.value)
}

function selectDetailSku(skuId: string) {
  const sku = selectedProduct.value?.skus.find((item) => item.id === skuId)
  if (!sku || !canStartOrder(sku)) return
  selectedSkuId.value = sku.id
  detailQuantity.value = effectiveMinimumOrderQuantity(sku)
  syncDetailQuantityText()
  detailGalleryIndex.value = 0
}

function changeDetailQuantity(delta: number) {
  if (!selectedSku.value) return
  const next = detailQuantity.value + delta
  if (next < detailMinimumQuantity.value || next > detailRemainingStock.value) return
  detailQuantity.value = next
  syncDetailQuantityText()
}

function onDetailQuantityInput(event: Event) {
  detailQuantityText.value = inputEventValue(event).replace(/\D/g, '')
}

function commitDetailQuantity() {
  if (!selectedSku.value) return
  const raw = detailQuantityText.value
  if (!raw || !/^\d+$/.test(raw)) {
    syncDetailQuantityText()
    toast('请输入有效的采购数量')
    return
  }
  const parsed = Number(raw)
  const minimum = detailMinimumQuantity.value
  const maximum = detailRemainingStock.value
  if (maximum < minimum) {
    syncDetailQuantityText()
    toast('当前库存不足')
    return
  }
  const normalized = Math.min(maximum, Math.max(minimum, parsed))
  if (normalized !== parsed) toast(parsed < minimum ? `数量不能低于起订量 ${minimum} 件` : `数量不能超过可采库存 ${maximum} 件`)
  detailQuantity.value = normalized
  syncDetailQuantityText()
}

function totalStock(product: Product) {
  return product.skus.reduce((sum, sku) => sum + sku.stock, 0)
}

function stockClass(product: Product) {
  const stock = totalStock(product)
  if (stock <= 0) return 'stock-out'
  if (stock < 50) return 'stock-low'
  return 'stock-ok'
}

function stockText(product: Product) {
  const stock = totalStock(product)
  if (stock <= 0) return '已售罄'
  if (stock < 50) return `库存紧张 ${stock.toLocaleString('zh-CN')}`
  return `库存 ${stock.toLocaleString('zh-CN')}`
}



function orderTitle(order: { items: Array<{ name: string; quantity: number }> }) {
  const first = order.items[0]
  return first ? `${first.name} ×${first.quantity}` : ''
}

function toast(title: string) {
  uni.showToast({ title, icon: 'none' })
}

function retryLoad() {
  store.setMockScenario('normal')
  store.initialize(true)
}

function chooseTab(key: TabKey) {
  activeTab.value = key
  sheet.value = null
  if (key === 'mine') mineSection.value = 'main'
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}

function goShop() {
  activeTab.value = 'home'
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}

function goOrders() {
  activeTab.value = 'mine'
  mineSection.value = 'orders'
  orderFilter.value = 'all'
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}

function openProduct(product: Product) {
  selectedProduct.value = product
  const sku = product.skus.find((item) => canStartOrder(item)) || product.skus[0]
  selectedSkuId.value = sku?.id || ''
  detailQuantity.value = effectiveMinimumOrderQuantity(sku)
  syncDetailQuantityText()
  detailGalleryIndex.value = 0
  productView.value = true
  sheet.value = null
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}

function openSkuSheet(product: Product) {
  selectedProduct.value = product
  const sku = product.skus.find((item) => canStartOrder(item)) || product.skus[0]
  selectedSkuId.value = sku?.id || product.skus[0].id
  detailQuantity.value = effectiveMinimumOrderQuantity(sku)
  syncDetailQuantityText()
  sheet.value = 'product'
}

function closeProductView() {
  productView.value = false
}

function goProductHome() {
  productView.value = false
  chooseTab('home')
}

function goProductCart() {
  productView.value = false
  chooseTab('cart')
}

function addDetailProduct() {
  if (!selectedProduct.value || !selectedSku.value) return
  const result = store.addToCart(selectedProduct.value, selectedSku.value.id, detailQuantity.value)
  if (result === 'sku-required') return toast('请先选择商品规格')
  if (result === 'out-of-stock') return toast(store.checkoutError || '库存不足或购买数量未达要求')
  toast(`已加入 ${detailQuantity.value} 件`)
}

function addProduct(product: Product) {
  const result = store.addToCart(product)
  if (result === 'sku-required') return openSkuSheet(product)
  if (result === 'out-of-stock') return toast(store.checkoutError || '该规格库存不足')
  toast('已加入进货单')
}

function addSelected() {
  if (!selectedProduct.value) return
  const result = store.addToCart(selectedProduct.value, selectedSkuId.value, detailQuantity.value)
  if (result === 'sku-required') return toast('请先选择商品规格')
  if (result === 'out-of-stock') return toast(store.checkoutError || '该规格库存不足')
  sheet.value = null
  toast('已加入进货单')
}

function openCart() {
  sheet.value = 'cart'
}

function goCheckout() {
  if (!store.checkoutCount) return toast('请先选择要结算的商品')
  if (store.checkoutHasUnavailable) return toast('选中商品存在库存不足或起订量限制')
  sheet.value = null
  uni.navigateTo({ url: '/pages/checkout/index' })
}

function openOrder(id: string) {
  uni.navigateTo({ url: `/pages/order-detail/index?id=${encodeURIComponent(id)}` })
}

function makePhoneCall() {
  uni.makePhoneCall({ phoneNumber: store.info.phone, fail: () => toast('当前环境不支持拨号，请复制联系电话') })
}

function copyAddress() {
  uni.setClipboardData({ data: `${store.info.name} ${store.info.contact} ${store.info.phone} ${store.info.address}`, success: () => toast('收货信息已复制') })
}

function copyPhone() {
  uni.setClipboardData({ data: store.info.phone, success: () => toast('客服电话已复制') })
}

const loginTab = ref<'password' | 'code'>('password')
const loginRole = ref<StoreRole>('owner')
const loginPhone = ref('13800000001')
const loginPassword = ref('123456')
const loginCode = ref('123456')
const codeCountdown = ref(0)
let codeTimer: ReturnType<typeof setInterval> | null = null
function switchLoginRole(role: StoreRole) {
  if (loginRole.value === role) return
  loginRole.value = role
  loginPhone.value = role === 'owner' ? '13800000001' : '13800000002'
  loginPassword.value = '123456'
  loginCode.value = '123456'
}
function sendCode() {
  if (!validatePhone(loginPhone.value)) return toast('请输入正确的手机号')
  if (codeCountdown.value > 0) return
  codeCountdown.value = 60
  codeTimer = setInterval(() => {
    codeCountdown.value -= 1
    if (codeCountdown.value <= 0 && codeTimer) clearInterval(codeTimer)
  }, 1000)
  toast('验证码已发送（演示码 123456）')
}
function submitLogin() {
  const ok = loginTab.value === 'password'
    ? store.loginWithPassword(loginPhone.value, loginPassword.value, loginRole.value)
    : store.loginWithCode(loginPhone.value, loginCode.value, loginRole.value)
  if (!ok) {
    const role = store.storeAccountRole(loginPhone.value)
    if (role && role !== loginRole.value) {
      toast(role === 'owner' ? '该手机号是门店账号，请切换为门店账号登录' : '该手机号是业务员账号，请切换为业务员账号登录')
      return
    }
    toast(loginTab.value === 'password' ? '手机号或密码错误（演示 13800000001 / 123456）' : '手机号或验证码错误（演示验证码 123456）')
    return
  }
  store.cart = seedDemoStoreCart(store.cart, store.products, store.mockScenario)
  store.repriceCart()
  if (!store.checkoutLineKeys.length) store.toggleAllCheckoutSelection()
  store.saveCurrentTenantSession()
  toast('登录成功')
}
function logout() {
  store.logout()
  toast('已退出登录')
}

let disposeKeyboardButtons: (() => void) | undefined
let disposePlatformChanges: (() => void) | null = null
let disposeStorageSync: (() => void) | null = null
let disposeVisibilitySync: (() => void) | null = null
let paymentSweepTimer: ReturnType<typeof setInterval> | null = null
const platformChangeKeys = [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_STORE_CATALOG_SELECTIONS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_ENTITIES_STORAGE_KEY, PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, PLATFORM_SUPPLIER_ACCOUNTS_STORAGE_KEY, PLATFORM_MEDIA_STORAGE_KEY]
const refreshSharedState = () => {
  pricePolicyVersion.value += 1
  void store.refreshSharedState()
}
onLoad((query) => {
  if (query?.view === 'orders') { activeTab.value = 'mine'; mineSection.value = 'orders' }
  if (query?.view === 'cart') activeTab.value = 'cart'
})
onShow(() => { cartQuantityDrafts.value = {}; void store.sweepExpiredPaymentOrders() })
onMounted(async () => {
  disposeKeyboardButtons = installKeyboardButtonSupport()
  disposeDictionaryImages = dictCache.subscribe((state) => { dictionaryState.value = state })
  const scenario = uni.getLaunchOptionsSync().query?.mock
  if (scenario === 'empty' || scenario === 'failure') store.setMockScenario(scenario)
  await store.initialize()
  if (store.auth.isLoggedIn) {
    store.cart = seedDemoStoreCart(store.cart, store.products, store.mockScenario)
    store.repriceCart()
    if (!store.checkoutLineKeys.length) store.toggleAllCheckoutSelection()
    store.saveCurrentTenantSession()
  }
  disposePlatformChanges = subscribePlatformChanges(refreshSharedState, platformChangeKeys)
  if (typeof window !== 'undefined') {
    const keys = new Set(platformChangeKeys)
    const onStorage = (event: StorageEvent) => { if (!event.key || keys.has(event.key)) refreshSharedState() }
    window.addEventListener('storage', onStorage)
    disposeStorageSync = () => window.removeEventListener('storage', onStorage)
  }
  paymentSweepTimer = setInterval(() => { void store.sweepExpiredPaymentOrders() }, 30_000)
  if (typeof document !== 'undefined') {
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') { refreshSharedState(); void store.sweepExpiredPaymentOrders() } }
    document.addEventListener('visibilitychange', onVisibilityChange)
    disposeVisibilitySync = () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }
  if (typeof document !== 'undefined') {
    document.title = '门店订货商城'
  }
})
onBeforeUnmount(() => {
  disposeKeyboardButtons?.()
  disposeDictionaryImages()
  dictCache.dispose()
  disposePlatformChanges?.(); disposePlatformChanges = null
  disposeStorageSync?.(); disposeStorageSync = null
  disposeVisibilitySync?.(); disposeVisibilitySync = null
  if (paymentSweepTimer) clearInterval(paymentSweepTimer)
  if (codeTimer) clearInterval(codeTimer)
})
</script>

<style scoped lang="scss">
.app-shell { width:100%;min-height:100vh;background:var(--farm-bg);overflow-x:hidden; }
.loading { min-height:100vh;display:grid;place-items:center;color:var(--farm-muted); }
.page-pad { padding:0 16px; }
.cart-page { display:flex; flex-direction:column; height:100vh; min-height:100vh; box-sizing:border-box; }
.cart-page-content { flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column; }
.tab-page { min-height:100vh;padding-bottom:calc(var(--mobile-tab-height) + 12px + env(safe-area-inset-bottom)); }
.tab-page.cart-page { padding-bottom:calc(var(--mobile-tab-height) + 72px + env(safe-area-inset-bottom)); }
.tab-page.category-page { padding-bottom:0; }
.app-shell.has-cart-bar .shop-page { padding-bottom:calc(var(--mobile-tab-height) + var(--mobile-action-bar-height) + 12px + env(safe-area-inset-bottom)); }
.page-title { display:block;font-size:20px;font-weight:800; }
.page-sub { display:block;margin-top:5px;color:var(--farm-muted);font-size:12px; }

/* ===== 商城头部 ===== */
.mall-hero { position:relative;padding:calc(12px + env(safe-area-inset-top)) 16px 36px;background:var(--store-gradient);color:var(--store-on-brand); }
.mall-hero::after { content:"";position:absolute;left:0;right:0;bottom:0;height:24px;background:var(--farm-bg);border-radius:24px 24px 0 0; }
.mall-hero-title { display:block;font-size:20px;font-weight:800;position:relative;z-index:1; }
.mall-hero-sub { display:block;margin-top:5px;font-size:12px;line-height:1.4;word-break:break-word;opacity:.82;position:relative;z-index:1; }
.mall-hero-meta { display:flex;flex-wrap:wrap;gap:7px 14px;margin-top:11px; }
.mall-hero-meta>view { min-width:0;display:inline-flex;align-items:center;gap:5px; }
.mall-hero-meta text { max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;opacity:.9; }
.mall-hero-meta .ui-icon { opacity:.82; }

/* ===== 商城运营数据条 ===== */
.result-count { margin-top:13px;color:var(--farm-muted);font-size:12px; }

/* ===== 搜索 ===== */
.search-bar { height:42px;margin-top:4px;padding:0 14px;background:var(--mobile-surface);border:1px solid var(--store-line);border-radius:21px;display:flex;align-items:center;gap:8px;box-shadow:var(--mobile-shadow-card); }
.search-bar input { flex:1;height:100%;font-size:13px; }
.search-bar .ui-icon { opacity:.55; }
.cat-card { margin-top:12px;background:var(--mobile-surface);border:1px solid var(--store-line);border-radius:16px;padding:12px 6px 8px;box-shadow:var(--mobile-shadow-card); }
.cat-card.category-grid { gap:12px 2px;margin-bottom:0; }
.cat-card .category-grid-img { width:44px;height:44px; }
.cat-card button.active .category-grid-img,
.cat-card uni-button.active .category-grid-img { border:2px solid var(--farm-green);box-shadow:0 0 0 2px var(--farm-green-soft); }

/* ===== 订单汇总 ===== */
.order-summary { position:relative;z-index:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:-14px 0 0;padding:13px 0;background:var(--farm-panel);border:1px solid var(--store-line);border-radius:16px;box-shadow:var(--store-shadow-hero); }
.order-summary .order-stat { min-width:0;display:grid;gap:4px;justify-items:center;text-align:center; }
.order-summary .order-stat .meta { color:var(--farm-muted);font-size:12px; }
.order-summary .order-stat .val { font-size:16px;font-weight:800;color:var(--farm-ink);word-break:break-all; }
.order-summary .order-stat--amount .val { color:var(--farm-red); }
.chip-count { display:inline;min-width:0;height:auto;margin-left:4px;padding:0;border-radius:0;background:transparent;color:inherit;font-size:12px;font-weight:600;vertical-align:middle; }
.chips button.active .chip-count { background:transparent;color:inherit; }

/* ===== 分类 chips ===== */
.chip-scroll { margin:13px -8px 0;width:calc(100% + 16px);white-space:nowrap;overflow-x:auto;overflow-y:hidden; }
.chips { width:max-content;padding:0 8px;display:flex;gap:4px; }
.chips.order-chips { gap:14px; }
.chips button { position:relative;min-height:var(--mobile-touch-target);padding:0 11px 8px;border-radius:0;background:transparent;border:0;font-size:13px;color:var(--farm-muted); }
.order-chips button { min-height:var(--mobile-touch-target);padding:0 10px 8px;border-radius:0; }
.chips button.active { color:var(--farm-green);background:transparent;border:0;font-weight:800; }
.chips button.active::after { content:'';position:absolute;left:50%;bottom:2px;width:18px;height:3px;border:none;border-radius:var(--mobile-radius-pill);background:currentColor;transform:translateX(-50%); }

/* ===== 商品双列网格 ===== */
.waterfall-grid { display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;padding-bottom:12px; }
.product-card { min-width:0;min-height:0;background:var(--farm-panel);border:1px solid var(--store-line);border-radius:var(--mobile-radius-card);overflow:hidden;box-shadow:var(--mobile-shadow-card); }
.product-image { height:0;padding-bottom:100%;aspect-ratio:1 / 1;position:relative;width:100%;padding-top:0;border-radius:0;background:var(--mobile-surface-subtle);display:block;overflow:hidden; }
.product-image::after { display:none; }
.product-emoji { position:absolute;inset:0;width:100%;height:100%;display:block; }
.product-image text { position:absolute;left:8px;top:8px;padding:0 8px;height:22px;line-height:22px;border-radius:6px;background:var(--mobile-surface);color:var(--farm-green);font-size:12px;font-weight:800; }
.product-body { min-width:0;padding:9px 10px 11px;display:flex;flex-direction:column;gap:4px; }
.item-title { display:-webkit-box;width:100%;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:13px;font-weight:800;line-height:1.4; }
.muted { display:block;min-width:0;color:var(--farm-muted);font-size:12px;margin-top:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.cost-line { display:flex;flex-direction:column;align-items:flex-start;gap:4px;margin-top:0; }
.cost-prices { display:flex;align-items:baseline;gap:4px;min-width:0;flex-wrap:wrap; }
.cost-line .val,.cost-prices .val { font-size:17px;font-weight:800;color:var(--farm-red); }
.cost-line .strike,.cost-prices .strike { font-size:12px;color:var(--farm-muted); }
.cost-line .chip,.cost-prices .chip { font-size:12px;font-weight:800;color:var(--farm-green);background:var(--farm-green-soft);border-radius:5px;padding:2px 5px; }
.product-foot { min-height:0;margin-top:8px;display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:8px; }
.product-divider { height:1px;background:var(--store-line-light);margin:8px 0; }
.ladder-hint { margin-top:4px;font-size:12px;color:var(--farm-green);font-weight:700; }
.ladder-table { margin-top:12px;padding:10px 12px;border:1px solid var(--farm-line);border-radius:8px;background:var(--mobile-surface-subtle); }
.ladder-table-title { display:block;font-size:12px;font-weight:800;color:var(--farm-ink);margin-bottom:6px; }
.ladder-tier { display:block;font-size:12px;color:var(--farm-muted);line-height:1.6; }
.product-stats { display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-width:0;flex:1; }
.product-stats-top { display:flex;align-items:center;gap:4px;min-width:0; }
.product-stock { display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis; }
.product-stats text { color:var(--farm-muted);font-size:12px;white-space:nowrap; }
.product-stats .stat-dot { color:var(--farm-muted); }
.product-stats .stock-ok { color:var(--store-ok);font-weight:700; }
.product-stats .stock-low { color:var(--farm-gold);font-weight:700; }
.product-stats .stock-out { color:var(--farm-red);font-weight:700; }
.product-foot button { width:32px;height:32px;min-width:32px;min-height:32px;padding:0;border:0;border-radius:50%;background:var(--store-gradient);color:var(--store-on-brand);display:inline-flex;align-items:center;justify-content:center;flex:none;box-shadow:var(--store-shadow-cart); }
.product-foot button .ui-icon { filter:brightness(0) invert(1); }
.product-foot uni-button[disabled],
.product-foot button[disabled] { background:var(--store-disabled);box-shadow:none; }

/* ===== 底部进货车栏 ===== */
.cart-bar { position:fixed;left:12px;right:12px;bottom:calc(var(--mobile-tab-height) + 8px + env(safe-area-inset-bottom));height:56px;padding:6px 10px;overflow:visible;background:var(--store-gradient);color:var(--store-on-brand);border-radius:24px;z-index:22;display:flex;align-items:center;gap:10px;box-shadow:var(--store-shadow-cart); }
.cart-count { width:44px;height:44px;position:relative;overflow:visible;border-radius:50%;background:var(--store-glass);color:var(--store-on-brand);display:grid;place-items:center;padding:0; }
.cart-count .chip { position:absolute;right:-4px;top:-2px;z-index:1;min-width:17px;height:17px;border-radius:9px;border:1.5px solid var(--store-on-brand);background:var(--farm-red);color:var(--store-on-brand);display:grid;place-items:center;font-size:13px;font-weight:800; }
.cart-bar>view { flex:1; }
.cart-bar .meta,.cart-bar .val { display:block; }
.cart-bar .meta { opacity:.85;font-size:12px; }
.cart-bar .val { font-size:16px; }
.cart-bar>button:last-child { min-height:var(--mobile-touch-target);padding:0 16px;border-radius:var(--mobile-radius-pill);background:var(--store-on-brand);color:var(--farm-green-deep);font-weight:800;font-size:13px;display:inline-flex;align-items:center;justify-content:center; }

/* ===== 底部 tab ===== */
.tabbar { position:fixed;left:0;right:0;bottom:0;height:calc(var(--mobile-tab-height) + env(safe-area-inset-bottom));padding:10px 0 calc(10px + env(safe-area-inset-bottom));overflow:visible;background:var(--mobile-surface);border-top:1px solid var(--store-line-light);display:grid;grid-template-columns:repeat(4,1fr);z-index:20; }
.tabbar button { min-height:var(--mobile-touch-target);background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:var(--farm-muted);font-size:13px;font-weight:600; }
.tab-icon-wrap { position:relative;width:42px;height:32px;border-radius:13px;display:grid;place-items:center; }
.tab-badge { position:absolute;top:-2px;right:-4px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;border:1.5px solid var(--store-on-brand);background:var(--farm-red);color:var(--store-on-brand);display:grid;place-items:center;font-size:13px;font-weight:800; }
.tabbar button.active { color:var(--farm-green);font-weight:800; }
.tabbar button.active .tab-icon-wrap { background:var(--farm-green-soft); }
.tab-label { display:block;white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis; }

/* ===== 弹层 ===== */
.sheet-mask { position:fixed;inset:0;background:var(--store-mask);z-index:40;display:flex;align-items:flex-end; }
.sheet { width:100%;max-width:100%;max-height:var(--mobile-sheet-max-height);display:flex;flex-direction:column;overflow:hidden;background:var(--mobile-surface);border-radius:20px 20px 0 0;padding:0;box-shadow:var(--mobile-shadow-float); }
.sheet-scroll { width:100%;flex:1 1 auto;min-height:0;height:auto;max-height:calc(80vh - var(--mobile-sheet-header-height) - 16px);padding:14px 16px calc(12px + env(safe-area-inset-bottom));box-sizing:border-box; }
.sheet-head { position:relative;min-height:var(--mobile-sheet-header-height);display:flex;align-items:center;justify-content:center;padding:10px 14px 12px;border-bottom:1px solid var(--store-line-light); }
.sheet-head>text { flex:1;text-align:center;font-size:16px;font-weight:800; }
.sheet-head button { position:absolute;right:7px;top:3px;min-width:44px;min-height:44px;width:44px;height:44px;background:transparent;border-radius:9px;display:grid;place-items:center; }
.sheet-head button::before { content:"";position:absolute;inset:7px;width:30px;height:30px;border-radius:9px;background:var(--mobile-surface-subtle); }
.sheet-head button .ui-icon { position:relative;z-index:1; }
.sheet-head uni-button { margin: 0; }
.sheet-list { display:grid;gap:10px; }
.sheet-line { min-height:76px;padding:11px;border:0;border-radius:14px;background:var(--mobile-surface-subtle);display:grid;grid-template-columns:64px minmax(0,1fr);gap:10px;align-items:center; }
.sheet-line > view:nth-child(2) { min-width:0; }
.sheet-line--selectable { grid-template-columns:21px 64px minmax(0,1fr); }
.sheet-line--selectable .sheet-line-main { min-width:0; }
.sheet-line--selectable.selected { border:1px solid var(--farm-green); }
.sheet-line-main { min-width:0; }
.sheet-line image,.sheet-line .business-image { width:64px;height:64px;border-radius:10px; }
.sheet-line text,.sheet-line .val { display:block; }
.sheet-line text { font-size:13px;font-weight:800;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden; }
.sheet-line .meta { display:block;margin-top:4px;color:var(--farm-muted);font-size:12px; }
.sheet-line-foot { margin-top:6px;display:flex;align-items:center;justify-content:space-between;gap:8px; }
.sheet-line .val { margin-top:0;color:var(--farm-red);font-size:16px;font-weight:800; }
.sheet-line.shortage { background:var(--color-danger-soft, var(--mobile-surface-subtle)); }
.stepper { height:32px;display:flex;align-items:center;gap:0;border:1px solid var(--store-line);border-radius:16px;overflow:hidden; }
.stepper button { width:30px;height:32px;padding:0;border:0;border-radius:0;background:var(--mobile-surface);display:grid;place-items:center;font-size:15px;margin:0;color:var(--farm-muted); }
.stepper text { min-width:30px;text-align:center;font-size:13px;font-weight:800;border:0;background:transparent; }
.stepper button:disabled { background:var(--store-line-light);color:var(--farm-muted); }
.cart-error { display:block;margin:10px 0 0;padding:10px;border-radius:6px;background:var(--color-danger-soft, var(--mobile-surface-subtle));color:var(--farm-red);font-size:12px; }
.checkout-summary { padding-top:13px; }
.checkout-summary>view { display:flex;justify-content:space-between;margin-bottom:9px;font-size:12px; }
.checkout-summary .primary-button { margin-top:8px; }
.checkout-summary .save { color:var(--store-ok); }
.checkout-summary .remark { color:var(--farm-muted);font-size:12px;font-weight:600;text-align:right; }
.stock-list{max-height:320px;overflow-y:auto;border:1px solid var(--farm-line);border-radius:8px;padding:4px 10px;background:var(--mobile-surface)}.stock-row{display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px 0;border-bottom:1px solid var(--store-line-light)}.stock-row:last-child{border-bottom:0}.stock-main text{font-size:12px;font-weight:800;display:block}.stock-main .meta{display:block;margin-top:3px;color:var(--farm-muted);font-size:12px}.stock-skus{display:flex;gap:6px;flex-wrap:wrap}.stock-sku{display:flex;align-items:center;gap:4px}.stock-sku text{font-size:12px;color:var(--farm-muted)}.stock-sku input{width:52px;height:28px;border:1px solid var(--farm-line);border-radius:5px;padding:0 6px;font-size:13px}.stock-actions{display:flex;gap:6px;align-items:center}.stock-actions .compact-button{min-height:var(--mobile-control-compact);padding:0 8px;border-radius:var(--mobile-radius-pill);background:var(--farm-panel);color:var(--farm-green);border:1px solid var(--farm-green);font-size:13px;font-weight:700}.stock-actions .compact-button.off{background:var(--farm-panel);color:var(--farm-muted);border-color:var(--farm-line)}
.primary-button { width:100%;height:48px;border-radius:var(--mobile-radius-pill);background:var(--store-gradient);color:var(--store-on-brand);font-weight:800;font-size:15px;box-shadow:var(--store-shadow-cart); }
.outline-button { width:100%;min-height:var(--mobile-touch-target);height:auto;border-radius:var(--mobile-radius-pill);background:var(--mobile-surface);color:var(--farm-ink);border:1.5px solid var(--store-line);font-size:13px;font-weight:700; }
.empty { padding:28px 0;text-align:center;color:var(--farm-muted);font-size:12px; }
.empty-page { min-height:132px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--farm-muted); }
.cart-page-content > .empty-page { flex:1; }
.empty-page text,.empty-page .meta { display:block; }
.empty-page text { margin-top:10px;font-size:12px;font-weight:800; }
.empty-page .meta { margin-top:5px;font-size:12px; }

/* ===== 商品详情 ===== */
.product-view { min-height:100vh;padding-bottom:calc(96px + env(safe-area-inset-bottom));background:var(--farm-bg);overflow-x:hidden;box-sizing:border-box; }
.detail-gallery-shell { position:relative;width:100%;background:var(--mobile-surface);overflow:hidden; }
.detail-gallery { width:100%;height:100vw;max-height:430px;aspect-ratio:1 / 1;background:var(--mobile-surface-subtle); }
.detail-gallery-image { width:100%;height:100%;display:block; }
.detail-gallery-back { position:absolute;width:44px;height:44px;margin:0;padding:0;border:0;border-radius:50%;background:transparent;color:var(--farm-ink);display:grid;place-items:center;box-shadow:none;z-index:2;left:12px;top:calc(10px + env(safe-area-inset-top)); }
.detail-gallery-back::before { content:"";position:absolute;inset:4px;width:36px;height:36px;border-radius:50%;background:var(--store-back-bg);box-shadow:var(--mobile-shadow-card); }
.detail-gallery-back .ui-icon { position:relative;z-index:1; }
.detail-gallery-count { position:absolute;right:12px;bottom:28px;min-width:48px;height:22px;padding:0 9px;border-radius:11px;background:var(--store-overlay);color:var(--store-on-brand);font-size:12px;line-height:22px;text-align:center;z-index:2; }
.detail-source-badge { position:absolute;right:12px;top:calc(12px + env(safe-area-inset-top));padding:0 10px;height:24px;line-height:24px;border-radius:7px;background:var(--farm-green);color:var(--store-on-brand);font-size:12px;font-weight:800;z-index:2; }
.detail-body { margin-top:-16px;position:relative;z-index:1;padding:14px 16px 20px;border-radius:20px 20px 0 0;background:var(--farm-bg); }
.detail-body > .detail-section:first-child { margin-top:0; }
.detail-section { margin-top:12px;padding:12px 16px;background:var(--mobile-surface);border:1px solid var(--store-line);border-radius:14px;box-shadow:var(--mobile-shadow-card); }
.detail-summary { position:relative;padding-top:14px; }
.detail-price-row { display:flex;align-items:flex-end;justify-content:flex-start;gap:8px; }
.detail-current-price { min-width:0;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap; }
.detail-current-price .val { color:var(--farm-red);font-size:28px;font-weight:800;line-height:1.1; }
.detail-current-price .strike { color:var(--farm-muted);font-size:13px; }
.detail-saving { flex:none;padding:4px 7px;border-radius:4px;background:var(--farm-green-soft);color:var(--farm-red);font-size:12px;font-weight:800; }
.detail-retail-price { display:block;margin-top:4px;color:var(--farm-muted);font-size:12px; }
.detail-level-badge { display:inline-block;margin-top:6px;padding:3px 8px;border-radius:var(--radius-icon);background:var(--farm-green-soft);color:var(--farm-green);font-size:12px;font-weight:800; }
.detail-product-name { display:-webkit-box;margin-top:8px;overflow:hidden;color:var(--farm-ink);font-size:18px;font-weight:800;line-height:1.42;-webkit-box-orient:vertical;-webkit-line-clamp:2;word-break:break-all; }
.detail-meta-row { margin-top:6px;display:flex;align-items:center;gap:7px 12px;flex-wrap:wrap;color:var(--farm-muted);font-size:12px; }
.detail-meta-row .is-in-stock { color:var(--store-ok);font-weight:700; }
.detail-tag-row { margin-top:9px;display:flex;gap:6px;flex-wrap:wrap; }
.detail-tag-row text { padding:3px 8px;border:1px solid var(--store-line);border-radius:6px;background:var(--farm-green-soft);color:var(--farm-green-deep);font-size:12px;font-weight:700; }
.detail-section-heading { min-height:24px;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px; }
.detail-section-heading>text { color:var(--farm-ink);font-size:14px;font-weight:800; }
.detail-section-heading>.meta { color:var(--farm-muted);font-size:12px;text-align:right; }
.detail-sku-options { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px; }
.detail-sku-option { min-width:0;min-height:var(--mobile-touch-target);padding:9px 11px;border:1.5px solid var(--store-line);border-radius:11px;background:var(--mobile-surface);color:var(--farm-ink);text-align:left;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;line-height:1.35; }
.detail-sku-option>text { width:100%;font-size:13px;font-weight:700;white-space:normal;word-break:break-all; }
.detail-sku-option>.meta { width:100%;margin-top:3px;color:var(--farm-muted);font-size:12px;font-weight:600;white-space:normal;word-break:break-all; }
.detail-sku-option.active { border-color:var(--farm-green);background:var(--farm-green-soft);color:var(--farm-green-deep); }
.detail-sku-option.active>.meta { color:var(--farm-muted); }
.detail-sku-option:disabled { background:var(--store-line-light);color:var(--farm-muted);opacity:.72; }
.detail-quantity-row { min-height:60px;margin-top:12px;padding-top:11px;border-top:1px solid var(--store-line-light);display:flex;align-items:center;justify-content:space-between;gap:12px; }
.detail-quantity-row>view:first-child { min-width:0; }
.detail-quantity-row>view:first-child text,.detail-quantity-row>view:first-child .meta { display:block; }
.detail-quantity-row>view:first-child text { font-size:13px;font-weight:800; }
.detail-quantity-row>view:first-child .meta { margin-top:3px;color:var(--farm-muted);font-size:12px; }
.detail-quantity-stepper { width:150px;flex:none;display:grid;grid-template-columns:44px minmax(52px,1fr) 44px;border:1px solid var(--store-line);border-radius:16px;overflow:hidden;background:var(--mobile-surface); }
.detail-quantity-stepper button { width:44px;height:44px;margin:0;padding:0;border:0;border-radius:0;background:var(--mobile-surface);color:var(--farm-green-deep);font-size:20px;font-weight:700;display:grid;place-items:center; }
.detail-quantity-stepper button:disabled { color:var(--farm-muted);background:var(--store-line-light); }
.detail-quantity-input { min-width:0;width:100%;height:44px;padding:0 4px;border:0;border-left:1px solid var(--store-line);border-right:1px solid var(--store-line);background:var(--mobile-surface);color:var(--farm-ink);text-align:center;font-size:14px;font-weight:800;box-sizing:border-box; }
.detail-purchase-total { margin-top:12px;padding-top:11px;border-top:1px solid var(--store-line-light);display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;color:var(--farm-muted); }
.detail-purchase-total .val { color:var(--farm-red);font-size:18px;font-weight:800; }
.detail-ladder-list { border-top:1px solid var(--store-line-light); }
.detail-ladder-row { min-height:45px;padding:0 8px;display:grid;grid-template-columns:minmax(72px,1fr) auto auto;align-items:center;gap:8px;border-bottom:1px solid var(--store-line-light);font-size:12px; }
.detail-ladder-row>.val { color:var(--farm-red);font-size:13px;white-space:nowrap; }
.detail-ladder-row>.meta { color:var(--farm-muted);font-size:12px;white-space:nowrap; }
.detail-ladder-row.active { background:var(--farm-green-soft);box-shadow:inset 3px 0 0 var(--farm-green); }
.detail-ladder-row.active>text,.detail-ladder-row.active>.meta { color:var(--farm-green-deep);font-weight:800; }
.detail-next-tier { display:block;margin-top:10px;color:var(--farm-green-deep);font-size:12px;font-weight:700; }
.detail-info-row { min-height:36px;padding:8px 0;display:grid;grid-template-columns:92px minmax(0,1fr);align-items:start;gap:12px;border-bottom:1px solid var(--store-line-light); }
.detail-info-row:last-child { border-bottom:0; }
.detail-info-row>.meta { color:var(--farm-muted);font-size:12px; }
.detail-info-row>text { min-width:0;color:var(--farm-ink);font-size:12px;font-weight:700;text-align:right;word-break:break-all; }
.detail-rich-images { padding-left:0;padding-right:0;padding-bottom:0;overflow:hidden; }
.detail-rich-images .detail-section-heading { padding:0 14px; }
.detail-rich-image { width:100%;display:block; }
.product-detail-bar { position:fixed;left:12px;right:12px;bottom:16px;z-index:30;min-height:58px;padding:8px;padding-bottom:calc(8px + env(safe-area-inset-bottom));box-sizing:border-box;border:1px solid var(--store-line);border-radius:26px;background:var(--mobile-surface);display:grid;grid-template-columns:56px 56px minmax(0,1fr);align-items:center;gap:4px;box-shadow:var(--store-shadow-float); }
.detail-bar-link { position:relative;min-width:0;height:48px;margin:0;padding:0;border:0;background:transparent;color:var(--farm-muted);font-size:13px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px; }
.detail-cart-icon { position:relative; }
.detail-cart-badge { position:absolute;right:-6px;top:-2px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;border:1.5px solid var(--store-on-brand);background:var(--farm-red);color:var(--store-on-brand);font-size:12px;font-weight:800;line-height:17px;text-align:center;box-sizing:border-box; }
.detail-bar-add { min-width:0;height:42px;margin:0 0 0 4px;padding:0 16px;border:0;border-radius:21px;background:var(--store-gradient);color:var(--store-on-brand);font-size:14px;font-weight:800;white-space:nowrap;display:flex;align-items:center;justify-content:center;box-shadow:var(--store-shadow-cart); }
.detail-bar-add:disabled { background:var(--store-disabled);color:var(--store-on-brand);box-shadow:none; }

/* 列表加购时的规格弹层 */
.product-detail { padding-top:0; }
.sku-sum { display:flex;gap:12px;align-items:center;background:var(--mobile-surface-subtle);border-radius:14px;padding:12px; }
.sku-sum-img { width:72px;height:72px;border-radius:12px;flex:none;overflow:hidden; }
.sku-sum-main { min-width:0;flex:1; }
.sku-sum-name { display:block;font-size:14px;font-weight:800;line-height:1.35; }
.sku-sum-price { margin-top:4px;display:flex;align-items:baseline;gap:6px; }
.sku-sum-price .val { font-size:19px;font-weight:800;color:var(--farm-red); }
.sku-sum-price .strike { font-size:12px;color:var(--farm-muted); }
.sku-sum-meta { display:block;margin-top:4px;font-size:12px;color:var(--farm-muted); }
.sku-label { display:block;margin-top:14px;font-size:12px;font-weight:800; }
.sku-options { display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px; }
.sku-options button { min-height:var(--mobile-touch-target);padding:9px 11px;border:1.5px solid var(--store-line);border-radius:11px;background:var(--mobile-surface);color:var(--farm-ink);font-size:13px;font-weight:700;text-align:left;display:flex;flex-direction:column;align-items:flex-start;gap:3px; }
.sku-options button .meta { display:block;font-size:13px;color:var(--farm-muted);font-weight:600; }
.sku-options button.active { border-color:var(--farm-green);background:var(--farm-green-soft);color:var(--farm-green-deep); }
.sku-options button:disabled { opacity:.5; }
.sku-qty-row { display:flex;align-items:center;margin-top:12px;padding-top:11px;border-top:1px solid var(--store-line-light);gap:12px; }
.sku-qty-row>view:first-child { flex:1;min-width:0; }
.sku-qty-row text,.sku-qty-row .meta { display:block; }
.sku-qty-row text { font-size:13px;font-weight:800; }
.sku-qty-row .meta { margin-top:3px;font-size:12px;color:var(--farm-muted); }
.sku-sum-total { display:flex;align-items:center;margin-top:12px;padding-top:11px;border-top:1px solid var(--store-line-light);font-size:13px;color:var(--farm-muted); }
.sku-sum-total .val { margin-left:auto;font-size:18px;font-weight:800;color:var(--farm-red); }
.product-detail-actions { display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:0; }
.product-detail-actions .outline-button { margin:0;height:44px; }
.product-detail-actions .primary-button { margin:0;height:44px;font-size:14px; }

/* ===== 确认下单 ===== */
.checkout-form { padding-top:12px; }
.checkout-payment-fixed { min-height:54px; margin:10px 0; padding:11px 13px; display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:9px; border:1.5px solid var(--farm-green); border-radius:12px; background:var(--farm-green-soft); }
.checkout-payment-fixed view { min-width:0; }
.checkout-payment-fixed text,.checkout-payment-fixed .meta { display:block; }
.checkout-payment-fixed text { font-size:13px; font-weight:800; }
.checkout-payment-fixed .meta { margin-top:2px; color:var(--farm-muted); font-size:12px; }
.checkout-payment-fixed .chip { color:var(--farm-green); font-size:12px; font-weight:800; white-space:nowrap; }
.checkout-store { padding:11px 13px;background:var(--mobile-surface-subtle);border:0;border-radius:12px;display:grid;gap:9px; }
.checkout-store view { display:flex;justify-content:space-between;align-items:center;gap:12px; }
.checkout-store .meta { color:var(--farm-muted);font-size:13px;flex:none; }
.checkout-store text { font-size:13px;font-weight:800;text-align:right; }
.form-group { margin-top:14px; }
.form-group>text { display:block;margin-bottom:8px;font-size:12px;font-weight:800; }
.form-group textarea { width:100%;min-height:64px;padding:11px 13px;border:1px solid var(--store-line);border-radius:12px;font-size:13px;background:var(--mobile-surface);color:var(--farm-muted); }
.checkout-items { margin-top:10px;display:grid;gap:9px; }
.checkout-line { padding:10px 13px;background:var(--mobile-surface-subtle);border:0;border-radius:12px;display:flex;align-items:center;justify-content:space-between;gap:10px; }
.checkout-line > text { min-width:0;word-break:break-all;font-size:12px; }
.checkout-line .val { color:var(--farm-red);font-size:12px;white-space:nowrap; }

/* ===== 订单 ===== */
.order-chips { padding:0; }
.order-list { margin-top:10px;display:grid;gap:8px; }
.order-card { position:relative;display:block;width:100%;padding:11px 12px;background:var(--mobile-surface);border:1px solid var(--store-line);border-radius:var(--mobile-radius-card);text-align:left;color:var(--farm-ink);box-shadow:var(--mobile-shadow-card);overflow:hidden; }
.order-accent { position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--farm-muted); }
.order-accent.accepted,.order-accent.shipped { background:var(--store-info); }
.order-accent.delivering { background:var(--farm-gold); }
.order-accent.received,.order-accent.completed { background:var(--store-ok); }
.order-accent.pending-payment { background:var(--farm-gold); }
.order-accent.paid-cancelled,.order-accent.unpaid-cancelled { background:var(--farm-muted); }
.order-accent.cancelled { background:var(--farm-muted); }
.order-head { display:flex;align-items:center;justify-content:space-between;gap:10px; }
.order-no { font-size:12px;font-weight:800;color:var(--farm-ink);letter-spacing:.2px;white-space:nowrap;flex-shrink:0; }
.status-badge { flex:none;padding:0 8px;height:22px;line-height:22px;border-radius:6px;font-size:12px;font-weight:800; }
.status-badge.submitted { background:var(--farm-green-soft);color:var(--farm-green-deep); }
.status-badge.accepted { background:var(--store-info-soft);color:var(--store-info); }
.status-badge.shipped { background:var(--store-info-soft);color:var(--store-info); }
.status-badge.delivering { background:var(--farm-green-soft);color:var(--farm-gold); }
.status-badge.received { background:var(--store-ok-soft);color:var(--store-ok); }
.status-badge.completed { background:var(--mobile-surface-subtle);color:var(--farm-muted); }
.status-badge.pending-payment { background:var(--mobile-surface-subtle);color:var(--farm-gold); }
.status-badge.paid-cancelled,.status-badge.unpaid-cancelled { background:var(--mobile-surface-subtle);color:var(--farm-muted); }
.status-badge.cancelled { background:var(--mobile-surface-subtle);color:var(--farm-muted); }
.order-main { margin-top:9px;display:flex;align-items:flex-start;gap:10px; }
.order-thumb { width:58px;height:58px;border-radius:10px;display:block;flex-shrink:0;overflow:hidden;background:var(--mobile-surface-subtle); }
.order-info { flex:1;min-width:0;display:grid;gap:3px;align-content:start; }
.order-title { font-size:13px;font-weight:800;color:var(--farm-ink);line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all; }
.order-sub { font-size:12px;color:var(--farm-muted); }
.order-meta { font-size:12px;color:var(--farm-muted);word-break:break-all; }
.order-bottom { margin-top:10px;padding-top:9px;border-top:1px solid var(--store-line-light);display:flex;align-items:center;gap:8px; }
.order-saved { color:var(--farm-gold);font-size:12px;font-weight:700;white-space:nowrap; }
.order-amount { margin-left:auto;display:inline-flex;align-items:baseline;gap:3px;flex-shrink:0;white-space:nowrap; }
.order-amount .meta { font-size:12px;color:var(--farm-muted); }
.order-amount .val { font-size:16px;font-weight:800;color:var(--farm-red); }
.order-bottom .ui-icon { opacity:.55; }

/* ===== 订单详情 ===== */
.order-detail { padding-top:12px; }
.order-detail-head { display:flex;align-items:center;justify-content:space-between;gap:10px; }
.order-detail-head > text { min-width:0;word-break:break-all;font-size:13px;font-weight:900; }
.steps { margin-top:8px;display:grid;overflow-x:auto;grid-template-columns:repeat(6,minmax(56px,1fr));gap:2px; }
.step { text-align:center;position:relative; }
.step::after { content:'';position:absolute;left:50%;top:11px;width:100%;height:2px;background:var(--store-line); }
.step:last-child::after { display:none; }
.step.done::after,.step.current::after { background:var(--farm-green); }
.step-dot { width:22px;height:22px;margin:0 auto;border-radius:50%;background:var(--mobile-surface-subtle);color:var(--farm-muted);font-size:12px;font-weight:800;display:grid;place-items:center;position:relative;z-index:1;border:2px solid var(--mobile-surface);box-shadow:0 0 0 1px var(--store-line); }
.step.done .step-dot,.step.current .step-dot { background:var(--farm-green);color:var(--store-on-brand); }
.step .meta { display:block;margin-top:6px;color:var(--farm-muted);font-size:12px;white-space:nowrap; }
.step.current .meta { color:var(--farm-green);font-weight:800; }
.logistics { margin-top:8px;padding:11px 13px;background:var(--farm-green-soft);border:0;border-radius:12px;display:grid;gap:11px; }
.log-event { display:flex;gap:9px; }
.log-dot { width:8px;height:8px;margin-top:4px;border-radius:50%;background:var(--farm-green);flex:none; }
.log-event:first-child .log-dot { box-shadow:none; }
.log-event text,.log-event .meta { display:block; }
.log-event text { font-size:13px;font-weight:800;color:var(--farm-green-deep); }
.log-event .meta { margin-top:4px;color:var(--farm-muted);font-size:12px;line-height:1.5; }
.order-items { margin-top:8px;display:grid;gap:9px; }
.order-item-line { min-height:56px;padding:10px 12px;background:var(--mobile-surface-subtle);border:0;border-radius:12px;display:grid;grid-template-columns:46px minmax(0,1fr) auto;gap:10px;align-items:center; }
.order-item-line image { width:46px;height:46px;border-radius:9px; }
.order-item-line text,.order-item-line .meta { display:block; }
.order-item-line text { font-size:13px;font-weight:800; }
.order-item-line .meta { margin-top:3px;color:var(--farm-muted);font-size:12px; }
.order-item-line .val { font-size:14px;color:var(--farm-red);white-space:nowrap; }
.order-actions { margin-top:0;display:flex;flex-wrap:wrap;justify-content:center;gap:10px; }
.order-actions .outline-button,
.order-actions .primary-button { width:auto;height:42px;min-height:42px;padding:0 16px;border-radius:21px; }
.order-actions .outline-button { background:var(--mobile-surface);border:1.5px solid var(--store-line);color:var(--farm-ink); }
.order-actions .primary-button { background:var(--farm-green-soft);border:1.5px solid var(--farm-green-soft);color:var(--farm-green-deep);box-shadow:none; }
.after-sale-status{margin-top:14px;padding:10px 12px;border-radius:7px;background:var(--farm-green-soft);border:1px solid var(--store-line);color:var(--farm-gold);font-size:12px;font-weight:700}

/* ===== 门店工作台 ===== */
.store-hero { position:relative;padding:calc(12px + env(safe-area-inset-top)) 16px 36px;background:var(--store-gradient);color:var(--store-on-brand); }
.store-hero::after { content:"";position:absolute;left:0;right:0;bottom:0;height:24px;background:var(--farm-bg);border-radius:24px 24px 0 0; }
.store-hero-top .mall-hero-title,
.store-hero-top .mall-hero-sub { color:var(--store-on-brand);position:relative;z-index:1; }
.store-identity { margin:12px 0 8px;padding:12px;display:flex;align-items:flex-start;gap:11px;position:relative;z-index:1;background:var(--store-glass);border:1px solid var(--store-glass-line);border-radius:16px; }
.store-identity-main { min-width:0;flex:1; }
.store-emoji { width:52px;height:52px;border-radius:12px;display:block;flex-shrink:0;background:var(--store-glass); }
.store-identity text,.store-identity .meta { display:block; }
.store-identity text { font-size:15px;font-weight:800; }
.store-identity .meta { margin-top:3px;font-size:12px;opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.store-identity .store-identity-address { overflow:visible;text-overflow:unset;white-space:normal;word-break:break-word; }
.store-identity .store-identity-level { margin-top:6px;padding:3px 8px;border-radius:var(--radius-icon);background:var(--store-glass);color:var(--store-on-brand);font-size:12px;font-weight:800;display:inline-block;width:auto;overflow:visible;text-overflow:unset;white-space:normal; }
.metric-band { margin:14px 16px 0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));background:var(--mobile-surface);border:1px solid var(--store-line);border-radius:16px;box-shadow:var(--store-shadow-hero); }
.metric-band view { padding:13px 0;text-align:center;border-right:1px solid var(--store-line-light); }
.metric-band view:last-child { border:0; }
.metric-band text,.metric-band .meta,.metric-band .val { display:block; }
.metric-band text,.metric-band .meta { color:var(--farm-muted);font-size:12px; }
.metric-band .val { margin-top:5px;font-size:16px;color:var(--farm-ink); }
.store-metrics { grid-template-columns:repeat(4,minmax(0,1fr)); margin-top:-14px;position:relative;z-index:1; }
.store-metrics view, .store-metrics .val { min-width:0; word-break:break-word; }
.store-metrics view:nth-child(3) .val { color:var(--farm-green); }
.store-body { padding-top:12px; }
.section-head { padding:0 0 10px;display:flex;align-items:center;justify-content:space-between; }
.section-head > .meta { color:var(--farm-muted);font-size:12px; }
.section-head>view { display:flex;align-items:center;gap:7px; }
.section-head .chip { width:3px;height:16px;background:var(--farm-green);border-radius:2px; }
.section-head text { font-size:15px;font-weight:900; }
.quick-grid { margin:0 0 var(--mobile-section-gap);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px; }
.quick-grid button { min-width:0;width:100%;min-height:56px;padding:13px 0 11px;background:var(--mobile-surface);border:1px solid var(--store-line);border-radius:var(--mobile-radius-card);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;font-size:13px;color:var(--farm-ink);box-shadow:var(--mobile-shadow-card); }
.quick-grid .pc-tile-label { font-size:13px; }
.store-page .pc-tile-icon { width:42px;height:42px;border-radius:12px; }
.quick-grid button .meta { display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--farm-muted);font-size:13px;line-height:1.3; }
.hot-list { display:grid;gap:0;background:var(--mobile-surface);border:1px solid var(--store-line);border-radius:var(--mobile-radius-card);padding:4px 12px;box-shadow:var(--mobile-shadow-card); }
.hot-item { display:grid;grid-template-columns:22px 44px 1fr auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--store-line-light); }
.hot-item:last-child { border-bottom:0; }
.hot-rank { width:22px;height:22px;border-radius:7px;background:var(--mobile-surface-subtle);color:var(--farm-muted);display:grid;place-items:center;font-size:12px;font-weight:800; }
.hot-item:nth-child(1) .hot-rank { background:var(--farm-green);color:var(--store-on-brand); }
.hot-item:nth-child(2) .hot-rank { background:var(--farm-green-soft);color:var(--farm-green-deep); }
.hot-emoji { width:44px;height:44px;border-radius:9px;display:block;flex-shrink:0;background:var(--mobile-surface-subtle); }
.hot-main { min-width:0; }
.hot-main text,.hot-main .meta { display:block; }
.hot-main text { font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.hot-main .meta { margin-top:4px;color:var(--farm-muted);font-size:12px; }
.hot-item .val { font-size:13px;color:var(--farm-red);white-space:nowrap; }
.quick-grid .ui-icon { opacity:.7; }
.member-footer { margin-top:16px;padding-bottom:8px;text-align:center;color:var(--farm-muted);font-size:12px; }

/* ===== 联系客服 ===== */
.contact-sheet { padding-top:2px; }
.contact-hero { padding:10px 0 4px;background:transparent;border-radius:0;color:var(--farm-ink);text-align:center; }
.contact-hero .ui-icon { margin:0 auto; }
.contact-hero text { display:block;margin-top:0;font-size:15px;font-weight:800; }
.contact-hero .meta { display:block;margin-top:5px;font-size:12px;opacity:1;color:var(--farm-muted);line-height:1.5; }
.contact-phone-mark { width:64px;height:64px;margin:12px auto 0;border-radius:50%;background:var(--farm-green-soft);color:var(--farm-green);display:grid;place-items:center; }
.contact-rows { margin-top:14px;display:grid;background:var(--mobile-surface-subtle);border:0;border-radius:12px;overflow:hidden;padding:11px 13px;gap:9px; }
.contact-row { min-height:auto;padding:0;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:0; }
.contact-row:last-child { border:0; }
.contact-row .meta { color:var(--farm-muted);font-size:13px;flex:none; }
.contact-row text { min-width:0;font-size:13px;font-weight:800;text-align:right;word-break:break-all; }
.contact-actions { margin-top:0;display:grid;grid-template-columns:1fr 1fr;gap:10px; }
.contact-actions .primary-button,
.contact-actions .outline-button { height:44px;margin:0; }
.contact-actions .primary-button { display:flex;align-items:center;justify-content:center;gap:7px; }
.contact-actions .outline-button { background:var(--farm-green-soft);border-color:var(--farm-green-soft);color:var(--farm-green-deep); }
.contact-actions .primary-button .ui-icon { opacity:.9; }

/* ===== 收货地址 ===== */
.address-sheet { padding-top:2px; }
.address-card { padding:11px 13px;background:var(--mobile-surface-subtle);border:0;border-radius:12px;display:grid;gap:9px; }
.address-card .meta { color:var(--farm-muted);font-size:13px; }
.address-card text { font-size:13px;font-weight:800;line-height:1.5; }
.address-note { display:flex;gap:6px;margin:10px 0 0;color:var(--farm-muted);font-size:12px;line-height:1.6; }

/* ===== 状态页 ===== */
.state-page { min-height:100vh;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--farm-muted);text-align:center; }
.state-page .primary-button { max-width:240px; }
.emoji-thumb { flex:none;display:grid;place-items:center; }
.chip-scroll { scrollbar-width:none; }
.chip-scroll::-webkit-scrollbar { display:none; }

.sheet-foot .primary-button { margin-top:0;gap:7px; }
.contact-actions.sheet-foot { margin-top:0; }

@media (max-width: 375px) {
  .order-head { flex-wrap: wrap; }
  .order-no { white-space: normal; word-break: break-all; flex-shrink: 1; }
  .cart-footer { flex-wrap: wrap; }
  .cart-all, .cart-footer-total, .cart-del, .cart-checkout { flex: 1 1 40%; }
  .store-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 340px) {
  .detail-section { padding-left:12px;padding-right:12px; }
  .detail-sku-options { grid-template-columns:1fr; }
  .detail-quantity-row { gap:8px; }
  .detail-quantity-stepper { width:142px; }
  .detail-ladder-row { padding-left:6px;padding-right:6px;gap:5px; }
  .product-detail-bar { grid-template-columns:50px 56px minmax(0,1fr);padding-left:8px;padding-right:8px; }
  .detail-bar-add { padding:0 10px; }
}

/* ===== 键盘可访问 ===== */
.app-shell button:focus-visible,.app-shell input:focus-visible,.app-shell textarea:focus-visible { outline:3px solid var(--store-focus);outline-offset:2px; }
.app-shell input[type="number"] { -moz-appearance:textfield;appearance:textfield; }
.app-shell input[type="number"]::-webkit-outer-spin-button,.app-shell input[type="number"]::-webkit-inner-spin-button { -webkit-appearance:none;margin:0; }

/* ===== 按钮文字水平垂直居中（uni-button 默认 display:block 文字顶对齐，导致固定高度按钮文字偏上） ===== */
.chips uni-button,
.primary-button,
.outline-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
}

/* ===== 圆形/小图标按钮内容居中（uni-button 默认 padding:0 14px 挤压内容，导致图标右偏） ===== */
.product-foot uni-button,
.cart-count,
.page-back,
.sheet-head uni-button,
.stepper uni-button,
.detail-gallery-shell uni-button,
.product-detail-bar uni-button {
  padding: 0;
}

/* ===== 清除 uni-button 默认边框 ===== */
.chips uni-button::after, .primary-button::after, .outline-button::after,
.product-foot uni-button::after, .cart-count::after, .sheet-head uni-button::after,
.stepper uni-button::after, .login-tabs uni-button::after, .tabbar uni-button::after,
.code-button::after, .login-button::after, .logout-button::after, .quick-grid uni-button::after,
.detail-gallery-shell uni-button::after, .product-detail-bar uni-button::after, .detail-sku-options uni-button::after { border: none; }
.chips button.active::after,
.chips uni-button.active::after { content:'';position:absolute;left:50%;bottom:2px;width:18px;height:3px;border:none;border-radius:var(--mobile-radius-pill);background:currentColor;transform:translateX(-50%); }
.chips uni-button:active, .quick-grid uni-button:active, .primary-button:active, .outline-button:active { opacity: .88; }

/* ===== 登录页 ===== */
.login-page{position:relative;overflow:hidden;min-height:100vh;display:flex;flex-direction:column;background:var(--store-login-gradient);padding:0}
.login-page::before,.login-page::after{content:"";position:absolute;pointer-events:none;border-radius:50%;background:var(--store-glass)}
.login-page::before{width:240px;height:240px;top:-70px;right:-50px}
.login-page::after{width:200px;height:200px;left:-60px;top:38%}
.login-card{position:relative;z-index:1;width:100%;min-height:100vh;display:flex;flex-direction:column;background:transparent;border:0;border-radius:0;padding:0;overflow:hidden}
.login-card .pc-login-hero,.login-hero{flex:1 1 auto;min-height:200px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 24px 24px;border-radius:0;background:transparent;color:var(--store-on-brand);text-align:center}
.pc-login-mark{width:64px;height:64px;margin:0 auto 16px;border-radius:18px;background:var(--store-glass);border:1px solid var(--store-glass-line);display:grid;place-items:center;color:var(--store-on-brand)}
.pc-login-brand{display:block;font-size:23px;font-weight:800;letter-spacing:1px}
.pc-login-sub{display:block;margin-top:9px;font-size:13px;color:var(--store-on-brand);opacity:.85}
.login-panel{margin-top:auto;width:100%;background:var(--mobile-surface);border-radius:26px 26px 0 0;box-shadow:var(--store-shadow-hero)}
.login-body{padding:26px 24px 28px}
.login-roles{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
.login-roles button{min-height:var(--mobile-touch-target);height:auto;padding:4px 8px;border:1px solid var(--store-line);border-radius:12px;background:var(--mobile-surface);color:var(--farm-muted);font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center}
.login-roles button.active{background:var(--store-gradient);border-color:transparent;color:var(--store-on-brand);font-weight:800}
.login-tabs{display:grid;grid-template-columns:1fr 1fr;background:var(--mobile-surface-subtle);border-radius:12px;padding:4px;gap:4px;margin-bottom:0}
.login-tabs button{flex:1;min-height:var(--mobile-touch-target);height:auto;padding:3px 8px;border-radius:9px;font-size:14px;font-weight:700;color:var(--farm-muted);display:flex;align-items:center;justify-content:center}
.login-tabs button.active{background:var(--mobile-surface);color:var(--farm-green);box-shadow:var(--mobile-shadow-card);font-weight:800}
.login-fields{display:flex;flex-direction:column;gap:0;margin-bottom:0}
.login-field{display:flex;flex-direction:column;gap:8px;margin-top:18px}
.login-field text{font-size:12px;color:var(--farm-ink);font-weight:800}
.login-field input{height:48px;border:1.5px solid transparent;border-radius:12px;padding:0 14px;font-size:15px;background:var(--mobile-surface-subtle)}
.login-field input:focus{border-color:var(--farm-green);background:var(--mobile-surface);box-shadow:0 0 0 3px var(--store-focus)}
.code-input{display:flex;gap:8px;align-items:center}
.code-input input{flex:1;min-width:0}
.code-button{min-height:34px;height:34px;padding:0 12px;border-radius:17px;background:var(--farm-green);color:var(--store-on-brand);font-size:13px;font-weight:800;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center}
.code-button[disabled]{opacity:.55}
.login-button{min-height:48px;margin-top:22px;border-radius:var(--mobile-radius-pill);background:var(--store-gradient);color:var(--store-on-brand);font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:var(--store-shadow-cart)}
.login-hint{display:block;text-align:center;margin-top:16px;font-size:12px;color:var(--farm-muted);line-height:1.6}
.heading-with-back{display:flex;align-items:flex-start;gap:10px;position:relative;z-index:1}
.heading-with-back>view{min-width:0;padding-bottom:4px}
.page-back{width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--farm-ink);display:grid;place-items:center;flex:none;position:relative;z-index:1}
.page-back::before{content:"";position:absolute;inset:4px;width:36px;height:36px;border-radius:50%;background:var(--store-back-bg);box-shadow:var(--mobile-shadow-card)}
.page-back .ui-icon{position:relative;z-index:1}
.logout-button{width:100%;min-height:var(--mobile-touch-target);margin:20px 0 4px;border-radius:23px;font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center}
.logout-danger{background:var(--mobile-danger);color:var(--store-on-brand);box-shadow:var(--store-shadow-cart)}
.sheet-line .business-image{width:64px;height:64px;border-radius:10px}.order-item-line .business-image{width:46px;height:46px;border-radius:9px}
.chips button{display:inline-flex;align-items:center;justify-content:center;gap:5px}
/* ===== 商品分类页 ===== */
.category-page { display:flex;flex-direction:column;height:100vh;max-height:100vh;box-sizing:border-box; }
.category-page .page-pad { flex:1;min-height:0;display:flex;flex-direction:column; }
.category-layout { margin-top:12px;display:flex;gap:10px;align-items:stretch; }
.category-page .category-layout { flex:1;min-height:0;overflow:hidden;padding-bottom:calc(var(--mobile-tab-height) + 12px + env(safe-area-inset-bottom)); }
.app-shell.has-cart-bar .category-page .category-layout { padding-bottom:calc(var(--mobile-tab-height) + var(--mobile-action-bar-height) + 12px + env(safe-area-inset-bottom)); }
.category-side { width:88px;flex:none;align-self:stretch;max-height:100%;overflow-y:auto;background:transparent;border-right:0;display:grid;gap:4px;align-content:start; }
.category-page .category-side { max-height:none;min-height:0;clip-path:inset(0); }
.side-item { position:relative;min-width:0;min-height:40px;margin:0;padding:6px 10px;border:0;border-radius:10px;background:transparent;font-size:13px;line-height:1.25;color:var(--farm-muted);text-align:left;display:flex;align-items:center;overflow:visible;white-space:normal;word-break:break-word; }
.side-item.active { color:var(--farm-green);font-weight:800;background:var(--mobile-surface); }
.side-item.active::before { content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:2px;background:var(--farm-green); }
.category-main { flex:1;min-width:0;min-height:0;overflow-y:auto;margin-left:0; }
.category-main .search-bar { height:40px;margin-top:0;border-radius:20px; }
.category-products { margin-top:9px;display:grid;gap:9px; }
.cat-product { display:flex;gap:10px;padding:9px;background:var(--mobile-surface);border:1px solid var(--store-line);border-radius:13px;box-shadow:var(--mobile-shadow-card); }
.cat-product-img { width:82px;height:82px;border-radius:10px;flex:none;overflow:hidden;background:var(--mobile-surface-subtle); }
.cat-product-body { flex:1;min-width:0;display:flex;flex-direction:column;gap:6px; }
.cat-product-body .tag-row { display:flex;align-items:center;gap:4px;overflow:hidden; }
.cat-product-body .tag { font-size:12px;line-height:1.4;border-radius:4px;flex:none;max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:var(--farm-green-soft);color:var(--farm-green-deep);padding:1px 6px; }
.cat-product-name { width:100%;font-size:14px;font-weight:800;color:var(--farm-ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all;line-height:1.4; }

.cat-stock { font-size:12px;color:var(--farm-muted); }
.cat-foot { margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:8px; }
.cat-price { font-size:15px;font-weight:800;color:var(--farm-red); }
.cat-price-box { display:inline-flex;align-items:baseline;gap:4px; }
.cat-original { font-size:12px;color:var(--farm-muted); }
.cat-add { width:32px;height:32px;min-width:32px;min-height:32px;padding:0;border:0;border-radius:50%;background:var(--store-gradient);color:var(--store-on-brand);display:inline-flex;align-items:center;justify-content:center;flex:none; }
.cat-add .ui-icon { filter:brightness(0) invert(1); }
.cat-add[disabled] { background:var(--store-disabled); }

/* ===== 进货车页 ===== */
.cart-page-body { padding-top:0; }
.cart-row { display:grid;grid-template-columns:21px 64px minmax(0,1fr);gap:10px;align-items:stretch;padding:11px;background:var(--mobile-surface);border:1px solid var(--store-line);border-radius:var(--mobile-radius-card);box-shadow:var(--mobile-shadow-card);margin-bottom:10px; }
.cart-row.unavailable { opacity:.64; }
.cart-check { width:21px;height:21px;border-radius:50%;border:1.5px solid var(--store-line);background:var(--mobile-surface);display:inline-flex;align-items:center;justify-content:center;color:var(--store-on-brand);padding:0;align-self:center; }
.cart-check.on { background:var(--farm-green);border-color:var(--farm-green); }
.cart-check .ui-icon { opacity:0; }
.cart-check.on .ui-icon { opacity:1; }
.cart-row-img { width:64px;height:64px;border-radius:10px;overflow:hidden;background:var(--mobile-surface-subtle); }
.cart-row-main { min-width:0;display:flex;flex-direction:column;gap:4px; }
.cart-row-name { font-size:13px;font-weight:800;color:var(--farm-ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all; }
.cart-row-meta { display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0; }
.cart-row-sub { min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--farm-muted); }
.cart-row-stock { flex:none;font-size:12px;color:var(--farm-green); }
.cart-row-stock.warn { color:var(--farm-red); }
.cart-row-bottom { margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:8px; }
.cart-row-price { font-size:15px;font-weight:800;color:var(--farm-red); }
.cart-row-bottom .stepper { display:flex;align-items:stretch;gap:0;overflow:hidden;border:1px solid var(--store-line);border-radius:16px; }
.cart-row-bottom .stepper button { width:var(--mobile-control-compact);height:var(--mobile-control-compact);border:0;border-radius:0;background:var(--mobile-surface);display:grid;place-items:center;padding:0;font-size:15px; }
.cart-row-bottom .stepper input,.sheet-line .stepper input { width:var(--mobile-control-compact);min-width:var(--mobile-control-compact);height:var(--mobile-control-compact);padding:0 2px;border:0;border-left:1px solid var(--store-line);border-right:1px solid var(--store-line);background:var(--mobile-surface);color:var(--farm-ink);text-align:center;font-size:13px;font-weight:800;box-sizing:border-box; }
.cart-footer { position:fixed;left:12px;right:12px;bottom:calc(var(--mobile-tab-height) + 8px + env(safe-area-inset-bottom));z-index:22;flex:none;margin:0;padding:10px 12px;background:var(--mobile-surface);border:1px solid var(--store-line);border-radius:18px;display:flex;align-items:center;gap:10px;box-shadow:var(--store-shadow-float); }
.cart-all { display:inline-flex;align-items:center;gap:5px;color:var(--farm-muted);font-size:13px;padding:0;font-weight:700; }
.cart-all-check { width:18px;height:18px;border-radius:50%;border:1.5px solid var(--store-line);background:var(--mobile-surface);display:inline-flex;align-items:center;justify-content:center;color:var(--store-on-brand); }
.cart-all-check.on { background:var(--farm-green);border-color:var(--farm-green); }
.cart-all-check .ui-icon { opacity:0; }
.cart-all-check.on .ui-icon { opacity:1; }
.cart-footer-total { flex:1;min-width:0;display:flex;align-items:baseline;justify-content:center;gap:4px;color:var(--farm-muted);font-size:12px;white-space:nowrap; }
.cart-footer-total .val { font-size:16px;font-weight:800;color:var(--farm-red); }
.cart-footer-total .cart-selected-count { color:var(--farm-ink);font-size:13px; }
.cart-footer-total .cart-total-amount { font-size:19px; }
.cart-del { min-height:34px;height:34px;padding:0 12px;border-radius:var(--mobile-radius-pill);border:1px solid var(--store-line);color:var(--farm-muted);background:var(--mobile-surface);font-size:13px;font-weight:700;display:inline-flex;align-items:center;justify-content:center; }
.cart-checkout { min-height:38px;height:38px;padding:0 16px;border-radius:var(--mobile-radius-pill);background:var(--store-gradient);color:var(--store-on-brand);font-size:13px;font-weight:800;box-shadow:var(--store-shadow-cart);display:inline-flex;align-items:center;justify-content:center; }
.sheet-foot { flex:none;padding:12px 16px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--store-line-light);background:var(--mobile-surface); }
.cart-sheet-summary { min-height:38px;display:flex;align-items:center;gap:12px; }
.cart-sheet-summary .cart-footer-total { justify-content:flex-end; }
.cart-sheet-foot .primary-button { margin-top:10px; }

/* #ifdef H5 */
@media (min-width:431px) {
  .app-shell { max-width:430px;margin:0 auto;box-shadow:0 0 0 1px var(--store-line); }
  .login-page { max-width:430px; margin:0 auto; box-shadow:0 0 0 1px var(--store-line); }
  .tabbar { left:50%;right:auto;width:430px;transform:translateX(-50%); }
  .cart-bar { left:50%;right:auto;width:406px;transform:translateX(-50%); }
  .cart-footer { left:50%;right:auto;width:406px;transform:translateX(-50%); }
  .sheet { max-width:430px;margin:0 auto; }
  .sheet-mask { justify-content:center; }
  .product-detail-bar { left:50%;right:auto;width:406px;transform:translateX(-50%); }
}
/* #endif */

</style>
<style lang="scss">
/* #ifdef MP-WEIXIN */
.mall-hero,
.store-hero,
.state-page,
.loading {
  padding-top: calc(12px + var(--status-bar-height));
  padding-right: 96px;
}
.login-page {
  padding-top: calc(24px + var(--status-bar-height));
  padding-right: 96px;
}
.app-shell,
.sheet {
  max-width: 100% !important;
}
.tabbar {
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  transform: none !important;
}
.cart-bar,
.cart-footer,
.product-detail-bar {
  left: 12px !important;
  right: 12px !important;
  width: auto !important;
  transform: none !important;
}
/* #endif */
</style>
