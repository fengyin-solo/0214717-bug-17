<template>
  <div class="shop-page">
    <header class="page-header">
      <div class="header-content">
        <span class="page-tag">正品保障</span>
        <h1>装备商城</h1>
        <p>精选台球装备，品质保证，助您提升球技</p>
      </div>
    </header>

    <div class="shop-layout">
      <aside class="sidebar">
        <h3 class="section-title">商品分类</h3>
        <div class="category-section">
          <div class="category-list">
            <button 
              v-for="cat in categories" 
              :key="cat.id"
              :class="{ active: selectedCategory === cat.id }"
              @click="selectedCategory = cat.id"
            >
              <span class="cat-icon">{{ cat.icon }}</span>
              <span class="cat-name">{{ cat.name }}</span>
              <span class="cat-count">{{ getCategoryCount(cat.id) }}</span>
            </button>
          </div>
        </div>
      </aside>

      <main class="main-content">
        <div class="content-header">
          <div class="result-count">共 <span>{{ filteredProducts.length }}</span> 件商品</div>
          <select v-model="sortBy" class="sort-select">
            <option value="default">默认排序</option>
            <option value="price-asc">价格从低到高</option>
            <option value="price-desc">价格从高到低</option>
          </select>
        </div>

        <div class="products-grid">
          <div v-for="product in sortedProducts" :key="product.id" class="product-card" @click="openProductDetail(product)">
            <div class="product-image">
              <div class="image-placeholder">{{ product.icon }}</div>
              <div class="product-badges">
                <span v-if="product.hot" class="badge hot">热销</span>
                <span v-if="product.new" class="badge new">新品</span>
              </div>
              <button class="quick-add" @click.stop="quickAddToCart(product)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              </button>
            </div>
            <div class="product-info">
              <span class="product-brand">{{ product.brand }}</span>
              <h3>{{ product.name }}</h3>
              <p class="product-desc">{{ product.description }}</p>
              <div class="product-footer">
                <div class="price-info">
                  <span class="current-price">¥{{ product.price }}</span>
                  <span v-if="product.originalPrice" class="original-price">¥{{ product.originalPrice }}</span>
                </div>
                <span class="sales">已售 {{ product.sales }}</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- Cart Float -->
    <div v-if="cart.length > 0" class="cart-float" @click="showCartModal = true">
      <div class="cart-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
        <span class="cart-count">{{ cart.length }}</span>
      </div>
      <div class="cart-total">¥{{ cartTotal }}</div>
    </div>

    <!-- Product Detail Modal -->
    <Modal v-model="showDetailModal" size="large" :show-footer="false">
      <div v-if="selectedProduct" class="product-detail">
        <div class="detail-image">
          <div class="detail-icon">{{ selectedProduct.icon }}</div>
        </div>
        <div class="detail-info">
          <span class="detail-brand">{{ selectedProduct.brand }}</span>
          <h2>{{ selectedProduct.name }}</h2>
          <p class="detail-desc">{{ selectedProduct.description }}</p>
          <div class="detail-specs">
            <div class="spec-item"><span class="label">分类</span><span class="value">{{ getCategoryName(selectedProduct.category) }}</span></div>
            <div class="spec-item"><span class="label">销量</span><span class="value">{{ selectedProduct.sales }}件</span></div>
          </div>
          <div class="detail-price">
            <span class="current">¥{{ selectedProduct.price }}</span>
            <span v-if="selectedProduct.originalPrice" class="original">¥{{ selectedProduct.originalPrice }}</span>
          </div>
          <div class="quantity-selector">
            <span class="qty-label">数量</span>
            <div class="qty-controls">
              <button @click="quantity > 1 && quantity--">-</button>
              <span>{{ quantity }}</span>
              <button @click="quantity++">+</button>
            </div>
          </div>
          <div class="detail-actions">
            <button class="btn-add-cart" @click="addToCartFromDetail">加入购物车</button>
            <button class="btn-buy-now" @click="buyNow">立即购买</button>
          </div>
        </div>
      </div>
    </Modal>

    <!-- Cart Modal -->
    <Modal v-model="showCartModal" title="购物车" size="medium" :show-footer="false">
      <div class="cart-content">
        <div v-if="cart.length > 0" class="cart-items">
          <div v-for="(item, index) in cart" :key="index" class="cart-item">
            <div class="item-icon">{{ item.icon }}</div>
            <div class="item-info"><h4>{{ item.name }}</h4><span class="item-brand">{{ item.brand }}</span></div>
            <div class="item-qty">x{{ item.qty }}</div>
            <div class="item-price">¥{{ item.price * item.qty }}</div>
            <button class="remove-btn" @click="removeFromCart(index)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div v-else class="cart-empty"><div class="empty-icon">🛒</div><p>购物车是空的</p></div>
        <div v-if="cart.length > 0" class="cart-footer">
          <div class="cart-summary"><span>共 {{ cartItemCount }} 件商品</span><span class="total">合计：<strong>¥{{ cartTotal }}</strong></span></div>
          <button class="btn-checkout" @click="checkout">去结算</button>
        </div>
      </div>
    </Modal>

    <!-- Checkout Modal -->
    <Modal v-model="showCheckoutModal" icon="🛒" icon-type="info" title="确认订单" size="small" confirm-text="确认支付" :loading="checkoutLoading" @confirm="confirmCheckout">
      <div class="checkout-info">
        <div class="info-row"><span class="label">商品数量</span><span class="value">{{ cartItemCount }} 件</span></div>
        <div class="info-row total"><span class="label">应付金额</span><span class="value price">¥{{ cartTotal }}</span></div>
      </div>
    </Modal>

    <!-- Success Modal -->
    <Modal v-model="showSuccessModal" icon="🎉" icon-type="success" title="支付成功" subtitle="您的订单已提交" size="small" :show-cancel="false" confirm-text="查看订单" @confirm="viewOrderDetail">
      <div v-if="orderResult" class="success-info">
        <div class="info-row"><span class="label">订单编号</span><span class="value">{{ orderResult.orderNo }}</span></div>
        <div class="info-row"><span class="label">支付金额</span><span class="value">¥{{ orderResult.amount }}</span></div>
      </div>
    </Modal>

    <!-- Orders Modal -->
    <Modal v-model="showOrdersModal" title="我的订单" size="medium" :show-footer="false">
      <div class="orders-content">
        <div v-if="orders.length > 0" class="orders-list">
          <div v-for="order in orders" :key="order.orderNo" class="order-card">
            <div class="order-header">
              <span class="order-no">{{ order.orderNo }}</span>
              <span class="order-status paid">已支付</span>
            </div>
            <div class="order-items">
              <div v-for="item in order.items" :key="item.id" class="order-item">
                <span class="item-icon">{{ item.icon }}</span>
                <span class="item-name">{{ item.name }}</span>
                <span class="item-qty">x{{ item.qty }}</span>
              </div>
            </div>
            <div class="order-footer">
              <span class="order-time">{{ order.createTime }}</span>
              <span class="order-amount">¥{{ order.amount }}</span>
            </div>
          </div>
        </div>
        <div v-else class="orders-empty">
          <div class="empty-icon">📦</div>
          <p>暂无订单</p>
        </div>
      </div>
    </Modal>

    <Toast v-model="showToast" :type="toastType" :title="toastTitle" :message="toastMessage" />
  </div>
</template>

<script>
import Modal from '../components/Modal.vue'
import Toast from '../components/Toast.vue'
import { requireLogin, isAuthenticated } from '../utils/auth'
import { api } from '../utils/api'

export default {
  name: 'Shop',
  components: { Modal, Toast },
  data() {
    return {
      selectedCategory: 'all',
      sortBy: 'default',
      showDetailModal: false,
      showCartModal: false,
      showCheckoutModal: false,
      showSuccessModal: false,
      checkoutLoading: false,
      selectedProduct: null,
      quantity: 1,
      cart: [],
      orderResult: null,
      orders: [], // 订单列表
      showOrdersModal: false, // 订单列表弹框
      showToast: false,
      toastType: 'success',
      toastTitle: '',
      toastMessage: '',
      pendingAction: null,
      pendingProduct: null,
      categories: [
        { id: 'all', name: '全部商品', icon: '🏷️' },
        { id: 'cue', name: '球杆', icon: '🏏' },
        { id: 'ball', name: '台球', icon: '🎱' },
        { id: 'accessory', name: '配件', icon: '🔧' },
        { id: 'clothing', name: '服装', icon: '👔' }
      ],
      products: [
        { id: 1, name: 'LP专业斯诺克球杆', brand: 'LP', price: 2999, originalPrice: 3599, category: 'cue', icon: '🏏', description: '进口白蜡木杆身，专业级配置', sales: 328, hot: true },
        { id: 2, name: 'Predator美式九球杆', brand: 'Predator', price: 4599, category: 'cue', icon: '🏏', description: '碳纤维前节，低偏转技术', sales: 156, new: true },
        { id: 3, name: '星牌比赛用球', brand: '星牌', price: 1299, originalPrice: 1499, category: 'ball', icon: '🎱', description: '国际比赛标准，酚醛树脂材质', sales: 892, hot: true },
        { id: 4, name: 'Aramith水晶球套装', brand: 'Aramith', price: 2199, category: 'ball', icon: '🎱', description: '比利时进口，透明水晶材质', sales: 234 },
        { id: 5, name: 'Master专业巧克粉', brand: 'Master', price: 39, category: 'accessory', icon: '🧊', description: '美国原装进口，防滑效果好', sales: 2341, hot: true },
        { id: 6, name: '球杆延长器', brand: 'Generic', price: 199, originalPrice: 259, category: 'accessory', icon: '🔧', description: '铝合金材质，轻便耐用', sales: 567 },
        { id: 7, name: 'Kamui台球手套', brand: 'Kamui', price: 89, category: 'accessory', icon: '🧤', description: '日本进口，透气舒适', sales: 1234 },
        { id: 8, name: '专业比赛马甲', brand: 'Billiard Pro', price: 299, category: 'clothing', icon: '🎽', description: '修身剪裁，舒适透气', sales: 445, new: true }
      ]
    }
  },
  computed: {
    filteredProducts() {
      if (this.selectedCategory === 'all') return this.products
      return this.products.filter(p => p.category === this.selectedCategory)
    },
    sortedProducts() {
      let result = [...this.filteredProducts]
      if (this.sortBy === 'price-asc') result.sort((a, b) => a.price - b.price)
      else if (this.sortBy === 'price-desc') result.sort((a, b) => b.price - a.price)
      return result
    },
    cartTotal() { return this.cart.reduce((sum, item) => sum + item.price * item.qty, 0) },
    cartItemCount() { return this.cart.reduce((sum, item) => sum + item.qty, 0) }
  },
  methods: {
    getCategoryCount(catId) {
      if (catId === 'all') return this.products.length
      return this.products.filter(p => p.category === catId).length
    },
    getCategoryName(catId) {
      return this.categories.find(c => c.id === catId)?.name || ''
    },
    openProductDetail(product) {
      this.selectedProduct = product
      this.quantity = 1
      this.showDetailModal = true
    },
    /**
     * 受保护操作前的登录检查：未登录则拉起全局登录弹窗。
     * 登录成功后统一调用 resumePendingAction 恢复原操作，取消则中止。
     * @returns {Promise<boolean>}
     */
    async checkLoginRequired(action, product = null) {
      if (isAuthenticated()) return true
      this.pendingAction = action
      this.pendingProduct = product
      const loggedIn = await requireLogin('购买商品')
      if (!loggedIn) {
        this.pendingAction = null
        this.pendingProduct = null
        return false
      }
      await this.resumePendingAction()
      return false // 原调用本次结束，操作已在恢复流程中执行
    },
    /** 登录成功后恢复用户触发的原始操作 */
    async resumePendingAction() {
      const action = this.pendingAction
      if (action === 'quickAdd' && this.pendingProduct) {
        this.addToCart(this.pendingProduct, 1)
        this.showNotification('success', '已加入购物车', this.pendingProduct.name)
      } else if (action === 'addFromDetail') {
        this.addToCart(this.selectedProduct, this.quantity)
        this.showNotification('success', '已加入购物车', `${this.selectedProduct.name} x${this.quantity}`)
        this.showDetailModal = false
      } else if (action === 'buyNow') {
        this.cart = [{ ...this.selectedProduct, qty: this.quantity }]
        this.showDetailModal = false
        this.showCheckoutModal = true
      } else if (action === 'checkout') {
        this.showCartModal = false
        this.showCheckoutModal = true
      }
      this.pendingAction = null
      this.pendingProduct = null
    },
    async quickAddToCart(product) {
      const allowed = await this.checkLoginRequired('quickAdd', product)
      if (!allowed) return
      this.addToCart(product, 1)
      this.showNotification('success', '已加入购物车', product.name)
    },
    async addToCartFromDetail() {
      const allowed = await this.checkLoginRequired('addFromDetail')
      if (!allowed) return
      this.addToCart(this.selectedProduct, this.quantity)
      this.showNotification('success', '已加入购物车', `${this.selectedProduct.name} x${this.quantity}`)
      this.showDetailModal = false
    },
    addToCart(product, qty) {
      const existing = this.cart.find(item => item.id === product.id)
      if (existing) { existing.qty += qty }
      else { this.cart.push({ ...product, qty }) }
    },
    removeFromCart(index) { this.cart.splice(index, 1) },
    async buyNow() {
      const allowed = await this.checkLoginRequired('buyNow')
      if (!allowed) return
      this.cart = [{ ...this.selectedProduct, qty: this.quantity }]
      this.showDetailModal = false
      this.showCheckoutModal = true
    },
    async checkout() {
      const allowed = await this.checkLoginRequired('checkout')
      if (!allowed) return
      this.showCartModal = false
      this.showCheckoutModal = true
    },
    async confirmCheckout() {
      this.checkoutLoading = true

      // 受保护写操作：订单只归属当前令牌账号
      const result = await api.createOrder({
        amount: this.cartTotal,
        items: this.cart.map(item => ({
          id: item.id,
          name: item.name,
          icon: item.icon,
          price: item.price,
          qty: item.qty
        }))
      })

      this.checkoutLoading = false

      if (!result.success) {
        this.showCheckoutModal = false
        this.showNotification('error', '下单失败', result.error || '请稍后重试')
        return
      }

      const order = {
        orderNo: result.data.orderNo,
        amount: result.data.amount,
        items: [...this.cart],
        status: result.data.status,
        createTime: result.data.createTime
      }
      this.orderResult = order
      this.orders.unshift(order)
      this.cart = []

      this.showCheckoutModal = false
      this.showSuccessModal = true

      this.showNotification('info', '已添加到任务中心', `您可以在任务中心查看并管理此订单`)
    },
    showNotification(type, title, message) {
      this.toastType = type
      this.toastTitle = title
      this.toastMessage = message
      this.showToast = true
    },
    viewOrderDetail() {
      this.showSuccessModal = false
      this.showOrdersModal = true
    }
  }
}
</script>

<style scoped>
.shop-page { max-width: 1400px; margin: 0 auto; padding: 0 3rem 4rem; }
.page-header { text-align: center; padding: 1.5rem 0 2rem; }
.page-tag { display: inline-block; background: rgba(0, 217, 165, 0.1); color: var(--primary); padding: 0.5rem 1rem; border-radius: 50px; font-size: 0.85rem; font-weight: 500; margin-bottom: 1rem; }
.page-header h1 { font-family: 'Space Grotesk', sans-serif; font-size: 3rem; font-weight: 700; margin-bottom: 0.75rem; }
.page-header p { color: var(--text-secondary); font-size: 1.1rem; }
.shop-layout { display: grid; grid-template-columns: 240px 1fr; gap: 2rem; align-items: start; }
.sidebar { position: sticky; top: 100px; height: fit-content; }
.section-title { font-size: 0.9rem; font-weight: 600; margin-bottom: 1rem; color: var(--text-secondary); }
.category-section { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 1rem; }
.category-list { display: flex; flex-direction: column; gap: 0.25rem; }
.category-list button { display: flex; align-items: center; gap: 0.75rem; width: 100%; background: transparent; border: none; padding: 0.75rem 1rem; color: var(--text-secondary); font-size: 0.9rem; border-radius: 10px; cursor: pointer; transition: all 0.3s; text-align: left; }
.category-list button:hover { background: rgba(255, 255, 255, 0.03); color: var(--text-primary); }
.category-list button.active { background: rgba(0, 217, 165, 0.1); color: var(--primary); }
.cat-icon { font-size: 1.1rem; }
.cat-name { flex: 1; }
.cat-count { font-size: 0.75rem; color: var(--text-muted); background: rgba(255, 255, 255, 0.05); padding: 0.2rem 0.5rem; border-radius: 10px; }
.category-list button.active .cat-count { background: rgba(0, 217, 165, 0.2); color: var(--primary); }
.content-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; margin-top: -6.8rem; }
.result-count { color: var(--text-secondary); font-size: 0.9rem; font-weight: 600; }
.result-count span { color: var(--primary); font-weight: 600; }
.sort-select { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem 1rem; color: var(--text-primary); font-size: 0.85rem; cursor: pointer; }
.products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1.25rem; }
.product-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; overflow: hidden; cursor: pointer; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
.product-card:hover { transform: translateY(-6px); border-color: rgba(255, 255, 255, 0.15); }
.product-image { position: relative; height: 160px; background: linear-gradient(135deg, var(--bg-card-hover) 0%, var(--bg-card) 100%); display: flex; align-items: center; justify-content: center; }
.image-placeholder { font-size: 4rem; opacity: 0.8; }
.product-badges { position: absolute; top: 0.75rem; left: 0.75rem; display: flex; gap: 0.4rem; }
.badge { padding: 0.3rem 0.6rem; border-radius: 6px; font-size: 0.7rem; font-weight: 600; }
.badge.hot { background: rgba(255, 107, 107, 0.2); color: #ff6b6b; }
.badge.new { background: rgba(0, 217, 165, 0.2); color: var(--primary); }
.quick-add { position: absolute; bottom: 0.75rem; right: 0.75rem; width: 40px; height: 40px; background: var(--primary); border: none; border-radius: 10px; color: var(--bg-dark); cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transform: translateY(10px); transition: all 0.3s; }
.product-card:hover .quick-add { opacity: 1; transform: translateY(0); }
.quick-add:hover { transform: scale(1.1); }
.quick-add svg { width: 20px; height: 20px; }
.product-info { padding: 1.25rem; }
.product-brand { font-size: 0.75rem; color: var(--primary); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
.product-info h3 { font-size: 1rem; font-weight: 600; margin: 0.4rem 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.product-desc { font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.product-footer { display: flex; justify-content: space-between; align-items: flex-end; }
.price-info { display: flex; align-items: baseline; gap: 0.5rem; }
.current-price { font-family: 'Space Grotesk', sans-serif; font-size: 1.25rem; font-weight: 700; color: var(--primary); }
.original-price { font-size: 0.8rem; color: var(--text-muted); text-decoration: line-through; }
.sales { font-size: 0.75rem; color: var(--text-muted); }
</style>

<style scoped>
.cart-float { position: fixed; bottom: 2rem; right: 2rem; display: flex; align-items: center; gap: 1rem; background: var(--bg-card); border: 1px solid var(--border); padding: 1rem 1.5rem; border-radius: 50px; cursor: pointer; transition: all 0.3s; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3); z-index: 100; }
.cart-float:hover { transform: translateY(-4px); border-color: var(--primary); box-shadow: var(--shadow-glow); }
.cart-icon { position: relative; }
.cart-icon svg { width: 24px; height: 24px; color: var(--primary); }
.cart-count { position: absolute; top: -8px; right: -8px; background: var(--primary); color: var(--bg-dark); width: 20px; height: 20px; border-radius: 50%; font-size: 0.7rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.cart-total { font-family: 'Space Grotesk', sans-serif; font-size: 1.1rem; font-weight: 700; color: var(--primary); }
.product-detail { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin: -20px -24px; }
.detail-image { background: linear-gradient(135deg, var(--bg-card-hover) 0%, var(--bg-card) 100%); display: flex; align-items: center; justify-content: center; min-height: 300px; }
.detail-icon { font-size: 8rem; }
.detail-info { padding: 2rem 2rem 2rem 0; display: flex; flex-direction: column; }
.detail-brand { font-size: 0.85rem; color: var(--primary); font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem; }
.detail-info h2 { font-family: 'Space Grotesk', sans-serif; font-size: 1.75rem; font-weight: 700; margin-bottom: 1rem; }
.detail-desc { color: var(--text-secondary); font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem; }
.detail-specs { display: flex; gap: 2rem; margin-bottom: 1.5rem; }
.spec-item { display: flex; flex-direction: column; gap: 0.25rem; }
.spec-item .label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; }
.spec-item .value { font-size: 0.9rem; }
.detail-price { display: flex; align-items: baseline; gap: 0.75rem; margin-bottom: 1.5rem; }
.detail-price .current { font-family: 'Space Grotesk', sans-serif; font-size: 2.5rem; font-weight: 700; color: var(--primary); }
.detail-price .original { font-size: 1.1rem; color: var(--text-muted); text-decoration: line-through; }
.quantity-selector { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
.qty-label { font-size: 0.9rem; color: var(--text-secondary); }
.qty-controls { display: flex; align-items: center; background: rgba(255, 255, 255, 0.05); border-radius: 10px; overflow: hidden; }
.qty-controls button { width: 40px; height: 40px; background: transparent; border: none; color: var(--text-primary); font-size: 1.25rem; cursor: pointer; transition: background 0.2s; }
.qty-controls button:hover { background: rgba(255, 255, 255, 0.1); }
.qty-controls span { width: 50px; text-align: center; font-weight: 600; }
.detail-actions { display: flex; gap: 1rem; margin-top: auto; }
.btn-add-cart, .btn-buy-now { flex: 1; padding: 1rem; font-size: 1rem; font-weight: 600; border-radius: 12px; cursor: pointer; transition: all 0.3s; }
.btn-add-cart { background: transparent; border: 1px solid var(--primary); color: var(--primary); }
.btn-add-cart:hover { background: rgba(0, 217, 165, 0.1); }
.btn-buy-now { background: var(--gradient-1); border: none; color: var(--bg-dark); }
.btn-buy-now:hover { box-shadow: 0 8px 25px var(--primary-glow); }
.cart-content { margin: -20px -24px -20px -24px; }
.cart-items { max-height: 400px; overflow-y: auto; padding: 1rem 1.5rem; }
.cart-item { display: flex; align-items: center; gap: 1rem; padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 12px; margin-bottom: 0.75rem; }
.item-icon { font-size: 2rem; width: 50px; height: 50px; background: var(--bg-card-hover); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
.item-info { flex: 1; }
.item-info h4 { font-size: 0.9rem; font-weight: 500; margin-bottom: 0.2rem; }
.item-brand { font-size: 0.75rem; color: var(--text-muted); }
.item-qty { font-size: 0.85rem; color: var(--text-secondary); }
.item-price { font-family: 'Space Grotesk', sans-serif; font-weight: 600; color: var(--primary); }
.remove-btn { background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 0.4rem; border-radius: 6px; transition: all 0.3s; }
.remove-btn:hover { background: rgba(255, 107, 107, 0.1); color: #ff6b6b; }
.remove-btn svg { width: 16px; height: 16px; }
.cart-empty { padding: 3rem; text-align: center; color: var(--text-muted); }
.empty-icon { font-size: 4rem; margin-bottom: 1rem; opacity: 0.5; }
.cart-footer { padding: 1.5rem; border-top: 1px solid var(--border); }
.cart-summary { display: flex; justify-content: space-between; margin-bottom: 1rem; color: var(--text-secondary); font-size: 0.9rem; }
.cart-summary .total strong { font-family: 'Space Grotesk', sans-serif; font-size: 1.25rem; color: var(--primary); }
.btn-checkout { width: 100%; background: var(--gradient-1); border: none; color: var(--bg-dark); padding: 1rem; font-size: 1rem; font-weight: 600; border-radius: 12px; cursor: pointer; transition: all 0.3s; }
.btn-checkout:hover { box-shadow: 0 8px 30px var(--primary-glow); }
.checkout-info, .success-info { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 12px; text-align: left; }
.info-row { display: flex; justify-content: space-between; font-size: 0.9rem; }
.info-row .label { color: var(--text-secondary); }
.info-row .value { font-weight: 500; }
.info-row.total { border-top: 1px solid var(--border); padding-top: 0.75rem; margin-top: 0.25rem; }
.info-row .value.price { font-family: 'Space Grotesk', sans-serif; font-size: 1.25rem; color: var(--primary); }
@media (max-width: 900px) { .shop-layout { grid-template-columns: 1fr; } .sidebar { position: static; } .product-detail { grid-template-columns: 1fr; } .detail-image { min-height: 200px; } .detail-info { padding: 1.5rem; } }
@media (max-width: 600px) { .shop-page { padding: 0 1.5rem 3rem; } .page-header h1 { font-size: 2rem; } .products-grid { grid-template-columns: repeat(2, 1fr); gap: 0.75rem; } .product-image { height: 120px; } .image-placeholder { font-size: 3rem; } }
</style>


<style scoped>
/* Orders Modal Styles */
.orders-content { margin: -20px -24px; }
.orders-list { max-height: 400px; overflow-y: auto; padding: 1rem 1.5rem; }
.order-card { background: rgba(255, 255, 255, 0.03); border-radius: 12px; padding: 1rem; margin-bottom: 0.75rem; }
.order-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
.order-no { font-family: monospace; font-size: 0.85rem; color: var(--text-secondary); }
.order-status { padding: 0.25rem 0.6rem; border-radius: 12px; font-size: 0.7rem; font-weight: 600; }
.order-status.paid { background: rgba(0, 217, 165, 0.15); color: var(--primary); }
.order-items { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
.order-item { display: flex; align-items: center; gap: 0.4rem; background: rgba(255, 255, 255, 0.05); padding: 0.4rem 0.6rem; border-radius: 8px; font-size: 0.8rem; }
.item-icon { font-size: 1rem; }
.item-name { color: var(--text-secondary); }
.item-qty { color: var(--text-muted); }
.order-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 0.75rem; border-top: 1px solid var(--border); }
.order-time { font-size: 0.75rem; color: var(--text-muted); }
.order-amount { font-family: 'Space Grotesk', sans-serif; font-weight: 700; color: var(--primary); }
.orders-empty { padding: 3rem; text-align: center; color: var(--text-muted); }
.orders-empty .empty-icon { font-size: 3rem; margin-bottom: 0.5rem; opacity: 0.5; }
</style>