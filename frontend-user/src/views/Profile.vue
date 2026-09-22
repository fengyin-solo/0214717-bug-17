<template>
  <div class="profile-page">
    <div class="profile-layout">
      <aside class="profile-sidebar">
        <div class="user-card">
          <div class="user-avatar"><span>{{ user.name.charAt(0) }}</span><div class="avatar-ring"></div></div>
          <h2>{{ user.name }}</h2>
          <div class="user-level"><span class="level-badge">{{ user.level }}</span><span class="level-text">会员</span></div>
          <div class="user-id">ID: {{ user.id }}</div>
          <button class="btn-edit-profile" @click="showEditModal = true">编辑资料</button>
        </div>

        <div class="points-card">
          <div class="points-header"><span class="points-label">可用积分</span><button class="points-history" @click="showPointsModal = true">明细</button></div>
          <div class="points-value">{{ user.points.toLocaleString() }}</div>
          <button class="btn-points" @click="showExchangeModal = true">积分兑换</button>
        </div>

        <nav class="profile-nav">
          <a href="#" class="nav-item" :class="{ active: activeNav === 'info' }" @click.prevent="handleNavClick('info')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>个人信息</span>
          </a>
          <a href="#" class="nav-item" :class="{ active: activeNav === 'bookings' }" @click.prevent="handleNavClick('bookings')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <span>我的预约</span>
          </a>
          <a href="#" class="nav-item" :class="{ active: activeNav === 'tasks' }" @click.prevent="handleNavClick('tasks')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            <span>任务中心</span>
          </a>
          <a href="#" class="nav-item" @click.prevent="showLogoutModal = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span>退出登录</span>
          </a>
        </nav>
      </aside>

      <main class="profile-main">
        <section class="stats-section">
          <div class="stats-grid">
            <div class="stat-card"><div class="stat-icon">⏱️</div><div class="stat-content"><span class="stat-value">{{ user.totalHours }}</span><span class="stat-label">累计打球(小时)</span></div></div>
            <div class="stat-card"><div class="stat-icon">🏆</div><div class="stat-content"><span class="stat-value">{{ user.competitions }}</span><span class="stat-label">参赛次数</span></div></div>
            <div class="stat-card"><div class="stat-icon">🥇</div><div class="stat-content"><span class="stat-value">{{ user.wins }}</span><span class="stat-label">获胜场次</span></div></div>
            <div class="stat-card"><div class="stat-icon">📚</div><div class="stat-content"><span class="stat-value">{{ user.courses }}</span><span class="stat-label">已学课程</span></div></div>
          </div>
        </section>

        <section class="bookings-section">
          <div class="section-header"><h3>最近预约</h3><button class="btn-view-all" @click="viewAllBookings">查看全部</button></div>
          <div class="bookings-list">
            <div v-for="booking in recentBookings" :key="booking.id" class="booking-card" @click="viewBookingDetail(booking)">
              <div class="booking-date"><span class="day">{{ getDay(booking.date) }}</span><span class="month">{{ getMonth(booking.date) }}</span></div>
              <div class="booking-info"><h4>{{ booking.tableName }}</h4><p class="booking-time"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>{{ booking.time }}</p></div>
              <div class="booking-status" :class="booking.status">{{ statusText[booking.status] }}</div>
            </div>
          </div>
        </section>

        <section class="actions-section">
          <div class="section-header"><h3>快捷服务</h3></div>
          <div class="actions-grid">
            <div v-for="action in quickActions" :key="action.id" class="action-card" @click="handleAction(action)">
              <div class="action-icon">{{ action.icon }}</div>
              <span class="action-name">{{ action.name }}</span>
              <svg class="action-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          </div>
        </section>
      </main>
    </div>

    <!-- Edit Profile Modal -->
    <Modal v-model="showEditModal" title="编辑资料" size="small" confirm-text="保存" :loading="saveLoading" @confirm="saveProfile">
      <div class="edit-form">
        <div class="form-group"><label>昵称</label><input v-model="editForm.name" type="text" placeholder="请输入昵称" /></div>
        <div class="form-group"><label>手机号</label><input v-model="editForm.phone" type="tel" placeholder="请输入手机号" /></div>
        <div class="form-group"><label>邮箱</label><input v-model="editForm.email" type="email" placeholder="请输入邮箱" /></div>
      </div>
    </Modal>

    <!-- Points History Modal -->
    <Modal v-model="showPointsModal" title="积分明细" size="medium" :show-footer="false">
      <div class="points-list">
        <div v-for="record in pointsHistory" :key="record.id" class="points-record">
          <div class="record-info"><span class="record-title">{{ record.title }}</span><span class="record-date">{{ record.date }}</span></div>
          <span class="record-amount" :class="record.type">{{ record.type === 'add' ? '+' : '-' }}{{ record.amount }}</span>
        </div>
      </div>
    </Modal>

    <!-- Exchange Modal -->
    <Modal v-model="showExchangeModal" icon="🎁" icon-type="info" title="积分兑换" subtitle="选择您想兑换的礼品" size="medium" :show-footer="false">
      <div class="exchange-list">
        <div v-for="gift in gifts" :key="gift.id" class="gift-card" @click="exchangeGift(gift)">
          <div class="gift-icon">{{ gift.icon }}</div>
          <div class="gift-info"><h4>{{ gift.name }}</h4><span class="gift-points">{{ gift.points }} 积分</span></div>
          <button class="btn-exchange" :disabled="user.points < gift.points">兑换</button>
        </div>
      </div>
    </Modal>

    <!-- Booking Detail Modal -->
    <Modal v-model="showBookingDetailModal" title="预约详情" size="small" :show-cancel="false" :confirm-text="selectedBooking?.status === 'upcoming' ? '取消预约' : '关闭'" :confirm-type="selectedBooking?.status === 'upcoming' ? 'danger' : 'primary'" @confirm="handleBookingAction">
      <div v-if="selectedBooking" class="booking-detail">
        <div class="detail-row"><span class="label">预约编号</span><span class="value">{{ selectedBooking.orderNo }}</span></div>
        <div class="detail-row"><span class="label">球桌</span><span class="value">{{ selectedBooking.tableName }}</span></div>
        <div class="detail-row"><span class="label">日期</span><span class="value">{{ selectedBooking.date }}</span></div>
        <div class="detail-row"><span class="label">时段</span><span class="value">{{ selectedBooking.time }}</span></div>
        <div class="detail-row"><span class="label">状态</span><span class="value status" :class="selectedBooking.status">{{ statusText[selectedBooking.status] }}</span></div>
      </div>
    </Modal>

    <!-- Logout Modal -->
    <Modal v-model="showLogoutModal" icon="warning" icon-type="warning" title="确认退出" subtitle="您确定要退出登录吗？" size="small" confirm-text="确认退出" confirm-type="danger" @confirm="handleLogout" />

    <!-- Success Modal -->
    <Modal v-model="showSuccessModal" icon="🎉" icon-type="success" :title="successTitle" :subtitle="successMessage" size="small" :show-cancel="false" confirm-text="我知道了" @confirm="showSuccessModal = false" />

    <Toast v-model="showToast" :type="toastType" :title="toastTitle" :message="toastMessage" />
  </div>
</template>

<script>
import Modal from '../components/Modal.vue'
import Toast from '../components/Toast.vue'
import { authState, logout, updateCurrentUser } from '../utils/auth'
import { logger } from '../utils/api'

export default {
  name: 'Profile',
  components: { Modal, Toast },
  data() {
    return {
      activeNav: 'info',
      showEditModal: false,
      showPointsModal: false,
      showExchangeModal: false,
      showBookingDetailModal: false,
      showLogoutModal: false,
      showSuccessModal: false,
      saveLoading: false,
      selectedBooking: null,
      successTitle: '',
      successMessage: '',
      showToast: false,
      toastType: 'success',
      toastTitle: '',
      toastMessage: '',
      editForm: { name: '', phone: '', email: '' },
      statusText: { completed: '已完成', upcoming: '待使用', cancelled: '已取消' },
      recentBookings: [
        { id: 1, orderNo: 'BK20260001', tableName: '3号球桌 - 美式九球', date: '2026-02-15', time: '14:00 - 16:00', status: 'upcoming' },
        { id: 2, orderNo: 'BK20260002', tableName: '1号球桌 - 斯诺克', date: '2026-02-10', time: '19:00 - 21:00', status: 'completed' },
        { id: 3, orderNo: 'BK20260003', tableName: '5号球桌 - 中式八球', date: '2026-02-08', time: '10:00 - 12:00', status: 'completed' }
      ],
      quickActions: [
        { id: 1, name: '任务中心', icon: '📋', action: 'tasks' },
        { id: 2, name: '优惠券', icon: '🎫', action: 'coupon' },
        { id: 3, name: '邀请好友', icon: '👥', action: 'invite' },
        { id: 4, name: '意见反馈', icon: '💬', action: 'feedback' },
        { id: 5, name: '帮助中心', icon: '❓', action: 'help' }
      ],
      pointsHistory: [
        { id: 1, title: '预约消费奖励', date: '2026-02-10', amount: 50, type: 'add' },
        { id: 2, title: '课程报名奖励', date: '2026-02-08', amount: 100, type: 'add' },
        { id: 3, title: '兑换优惠券', date: '2026-02-05', amount: 200, type: 'minus' },
        { id: 4, title: '比赛获奖', date: '2026-01-20', amount: 500, type: 'add' }
      ],
      gifts: [
        { id: 1, name: '10元优惠券', icon: '🎫', points: 200 },
        { id: 2, name: '1小时免费打球', icon: '🎱', points: 500 },
        { id: 3, name: '专业巧克粉', icon: '🧊', points: 300 },
        { id: 4, name: '台球手套', icon: '🧤', points: 800 }
      ]
    }
  },
  computed: {
    user() {
      return authState.user || { id: '', name: '游客', level: '普通', points: 0, totalHours: 0, competitions: 0, wins: 0, courses: 0 }
    }
  },
  mounted() {
    this.editForm = {
      name: this.user.name,
      phone: this.user.phone || '',
      email: this.user.email || ''
    }
  },
  methods: {
    getDay(date) { return new Date(date).getDate() },
    getMonth(date) { return ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'][new Date(date).getMonth()] },
    handleNavClick(nav) {
      this.activeNav = nav
      if (nav === 'info') {
        this.showEditModal = true
      } else if (nav === 'bookings') {
        this.showNotification('info', '我的预约', `您有 ${this.recentBookings.filter(b => b.status === 'upcoming').length} 个待使用的预约`)
      } else if (nav === 'tasks') {
        this.$router.push('/tasks')
      }
    },
    viewAllBookings() {
      this.showNotification('info', '全部预约', `共 ${this.recentBookings.length} 条预约记录`)
    },
    async saveProfile() {
      // 表单验证
      if (!this.editForm.name || this.editForm.name.trim().length < 2) {
        this.showNotification('error', '验证失败', '昵称至少需要2个字符')
        return
      }
      if (this.editForm.phone && !/^1[3-9]\d{9}$/.test(this.editForm.phone)) {
        this.showNotification('error', '验证失败', '请输入正确的手机号码')
        return
      }
      if (this.editForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.editForm.email)) {
        this.showNotification('error', '验证失败', '请输入正确的邮箱地址')
        return
      }
      this.saveLoading = true
      const result = await updateCurrentUser({
        name: this.editForm.name.trim(),
        phone: this.editForm.phone.trim(),
        email: this.editForm.email.trim()
      })
      this.saveLoading = false
      this.showEditModal = false
      if (result.success) {
        this.showNotification('success', '保存成功', '个人资料已更新')
        logger.info('Profile updated', { name: this.editForm.name })
      } else {
        this.showNotification('error', '保存失败', result.error || '请稍后重试')
      }
    },
    viewBookingDetail(booking) { this.selectedBooking = booking; this.showBookingDetailModal = true },
    handleBookingAction() {
      if (this.selectedBooking?.status === 'upcoming') {
        this.selectedBooking.status = 'cancelled'
        this.showBookingDetailModal = false
        this.showNotification('success', '取消成功', '预约已取消')
        logger.info('Booking cancelled', { orderNo: this.selectedBooking.orderNo })
      } else { this.showBookingDetailModal = false }
    },
    handleAction(action) {
      if (action.action === 'tasks') {
        this.$router.push('/tasks')
      } else {
        this.showNotification('info', action.name, '功能开发中，敬请期待')
      }
    },
    async exchangeGift(gift) {
      if (!authState.user || authState.user.points < gift.points) return
      const result = await updateCurrentUser({ points: authState.user.points - gift.points })
      if (result.success) {
        this.showExchangeModal = false
        this.successTitle = '兑换成功'
        this.successMessage = `您已成功兑换 ${gift.name}`
        this.showSuccessModal = true
        logger.info('Gift exchanged', { gift: gift.name, points: gift.points })
      }
    },
    async handleLogout() {
      this.showLogoutModal = false
      logger.info('User logging out')
      await logout()
      // 退出后回到首页（/login 不是真实页面，避免落在错误状态）
      if (this.$route.path !== '/') {
        this.$router.replace('/')
      }
    },
    showNotification(type, title, message) { this.toastType = type; this.toastTitle = title; this.toastMessage = message; this.showToast = true }
  }
}
</script>

<style scoped>
.profile-page { max-width: 1400px; margin: 0 auto; padding: 2rem 3rem 4rem; }
.profile-layout { display: grid; grid-template-columns: 300px 1fr; gap: 2rem; }
.profile-sidebar { display: flex; flex-direction: column; gap: 1rem; }
.user-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 24px; padding: 2rem; text-align: center; }
.user-avatar { position: relative; width: 100px; height: 100px; margin: 0 auto 1.5rem; }
.user-avatar span { position: absolute; inset: 4px; background: var(--gradient-1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; font-weight: 700; color: var(--bg-dark); }
.avatar-ring { position: absolute; inset: 0; border: 3px solid var(--primary); border-radius: 50%; animation: rotate 10s linear infinite; border-top-color: transparent; border-left-color: transparent; }
@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.user-card h2 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
.user-level { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.5rem; }
.level-badge { background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: var(--bg-dark); padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 0.75rem; font-weight: 700; }
.level-text { color: var(--text-secondary); font-size: 0.85rem; }
.user-id { color: var(--text-muted); font-size: 0.8rem; font-family: monospace; margin-bottom: 1rem; }
.btn-edit-profile { background: rgba(0, 217, 165, 0.1); border: 1px solid rgba(0, 217, 165, 0.3); color: var(--primary); padding: 0.6rem 1.5rem; border-radius: 10px; font-size: 0.85rem; cursor: pointer; transition: all 0.3s; }
.btn-edit-profile:hover { background: rgba(0, 217, 165, 0.2); }
.points-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; padding: 1.5rem; }
.points-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.points-label { color: var(--text-secondary); font-size: 0.85rem; }
.points-history { background: transparent; border: none; color: var(--primary); font-size: 0.8rem; cursor: pointer; }
.points-value { font-family: 'Space Grotesk', sans-serif; font-size: 2.5rem; font-weight: 700; color: var(--primary); margin-bottom: 1rem; }
.btn-points { width: 100%; background: rgba(0, 217, 165, 0.1); border: 1px solid rgba(0, 217, 165, 0.3); color: var(--primary); padding: 0.75rem; border-radius: 10px; font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: all 0.3s; }
.btn-points:hover { background: rgba(0, 217, 165, 0.2); }
.profile-nav { background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; padding: 0.75rem; }
.nav-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.875rem 1rem; color: var(--text-secondary); text-decoration: none; border-radius: 12px; transition: all 0.3s; }
.nav-item:hover { background: rgba(255, 255, 255, 0.03); color: var(--text-primary); }
.nav-item.active { background: rgba(0, 217, 165, 0.1); color: var(--primary); }
.nav-item svg { width: 20px; height: 20px; }
.profile-main { display: flex; flex-direction: column; gap: 1.5rem; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.section-header h3 { font-size: 1.1rem; font-weight: 600; }
.btn-view-all { background: transparent; border: none; color: var(--primary); font-size: 0.85rem; cursor: pointer; }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
.stat-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 1.5rem; display: flex; align-items: center; gap: 1rem; transition: all 0.3s; }
.stat-card:hover { border-color: rgba(255, 255, 255, 0.15); transform: translateY(-2px); }
.stat-icon { font-size: 2rem; }
.stat-content { display: flex; flex-direction: column; }
.stat-value { font-family: 'Space Grotesk', sans-serif; font-size: 1.75rem; font-weight: 700; color: var(--primary); line-height: 1; }
.stat-label { font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem; }
.bookings-section { background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; padding: 1.5rem; }
.bookings-list { display: flex; flex-direction: column; gap: 0.75rem; }
.booking-card { display: flex; align-items: center; gap: 1.25rem; padding: 1rem 1.25rem; background: rgba(255, 255, 255, 0.02); border-radius: 14px; transition: all 0.3s; cursor: pointer; }
.booking-card:hover { background: rgba(255, 255, 255, 0.04); }
.booking-date { display: flex; flex-direction: column; align-items: center; min-width: 50px; }
.booking-date .day { font-family: 'Space Grotesk', sans-serif; font-size: 1.5rem; font-weight: 700; line-height: 1; }
.booking-date .month { font-size: 0.75rem; color: var(--text-secondary); }
.booking-info { flex: 1; }
.booking-info h4 { font-size: 0.95rem; font-weight: 500; margin-bottom: 0.25rem; }
.booking-time { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--text-secondary); }
.booking-time svg { width: 14px; height: 14px; }
.booking-status { padding: 0.4rem 0.8rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
.booking-status.upcoming { background: rgba(0, 217, 165, 0.15); color: var(--primary); }
.booking-status.completed { background: rgba(108, 117, 125, 0.15); color: #6c757d; }
.booking-status.cancelled { background: rgba(255, 107, 107, 0.15); color: #ff6b6b; }
.actions-section { background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; padding: 1.5rem; }
.actions-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; }
.action-card { display: flex; align-items: center; gap: 0.75rem; padding: 1rem 1.25rem; background: rgba(255, 255, 255, 0.02); border-radius: 12px; cursor: pointer; transition: all 0.3s; }
.action-card:hover { background: rgba(255, 255, 255, 0.05); }
.action-icon { font-size: 1.25rem; }
.action-name { flex: 1; font-size: 0.9rem; }
.action-arrow { width: 16px; height: 16px; color: var(--text-muted); transition: transform 0.3s; }
.action-card:hover .action-arrow { transform: translateX(3px); color: var(--primary); }
.edit-form { display: flex; flex-direction: column; gap: 1rem; }
.form-group { display: flex; flex-direction: column; gap: 0.5rem; }
.form-group label { font-size: 0.85rem; color: var(--text-secondary); }
.form-group input { background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem 1rem; color: var(--text-primary); font-size: 0.9rem; }
.form-group input:focus { outline: none; border-color: var(--primary); }
.points-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 400px; overflow-y: auto; }
.points-record { display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 12px; }
.record-info { display: flex; flex-direction: column; }
.record-title { font-size: 0.9rem; font-weight: 500; }
.record-date { font-size: 0.75rem; color: var(--text-muted); }
.record-amount { font-family: 'Space Grotesk', sans-serif; font-size: 1.1rem; font-weight: 700; }
.record-amount.add { color: var(--primary); }
.record-amount.minus { color: #ff6b6b; }
.exchange-list { display: flex; flex-direction: column; gap: 0.75rem; }
.gift-card { display: flex; align-items: center; gap: 1rem; padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 12px; }
.gift-icon { font-size: 2rem; }
.gift-info { flex: 1; }
.gift-info h4 { font-size: 0.95rem; font-weight: 500; margin-bottom: 0.2rem; }
.gift-points { font-size: 0.8rem; color: var(--primary); }
.btn-exchange { background: var(--gradient-1); border: none; color: var(--bg-dark); padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
.btn-exchange:disabled { background: var(--bg-card-hover); color: var(--text-muted); cursor: not-allowed; }
.booking-detail { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 12px; }
.detail-row { display: flex; justify-content: space-between; font-size: 0.9rem; }
.detail-row .label { color: var(--text-secondary); }
.detail-row .value { font-weight: 500; }
.detail-row .value.status.upcoming { color: var(--primary); }
.detail-row .value.status.completed { color: #6c757d; }
.detail-row .value.status.cancelled { color: #ff6b6b; }
@media (max-width: 1100px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 900px) { .profile-layout { grid-template-columns: 1fr; } .profile-sidebar { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; } .user-card { grid-column: 1 / -1; } .profile-nav { grid-column: 1 / -1; } .actions-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px) { .profile-page { padding: 1rem 1.5rem 3rem; } .profile-sidebar { grid-template-columns: 1fr; } .stats-grid { grid-template-columns: repeat(2, 1fr); } .actions-grid { grid-template-columns: 1fr; } }
</style>
