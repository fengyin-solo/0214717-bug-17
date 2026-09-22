<template>
  <div class="tables-page">
    <header class="page-header">
      <div class="header-content">
        <span class="page-tag">在线预约</span>
        <h1>球桌预约</h1>
        <p>选择您喜欢的球桌类型，开始您的台球时光</p>
      </div>
    </header>

    <div class="filter-section">
      <div class="filter-group">
        <div class="filter-tabs">
          <button 
            v-for="type in tableTypes" 
            :key="type.id"
            :class="{ active: selectedType === type.id }"
            @click="selectedType = type.id"
          >
            <span class="tab-icon">{{ type.icon }}</span>
            <span>{{ type.name }}</span>
          </button>
        </div>
      </div>
      <div class="filter-right">
        <div class="date-picker">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          <input v-model="selectedDate" type="date" />
        </div>
      </div>
    </div>

    <div class="tables-grid" :class="{ loading: isLoadingTables }">
      <div v-if="isLoadingTables" class="loading-overlay">
        <div class="loading-spinner"></div>
        <span>加载中...</span>
      </div>
      <div 
        v-for="table in filteredTables" 
        :key="table.id" 
        class="table-card"
        :class="{ available: table.available, unavailable: !table.available }"
      >
        <div class="card-header">
          <div class="table-type-badge">{{ table.type }}</div>
          <div class="status-indicator" :class="table.available ? 'online' : 'offline'">
            <span class="status-dot"></span>
            <span>{{ table.available ? '可预约' : '已占用' }}</span>
          </div>
        </div>
        
        <div class="table-visual">
          <div class="table-3d">
            <div class="table-surface">
              <div class="pocket tl"></div>
              <div class="pocket tr"></div>
              <div class="pocket ml"></div>
              <div class="pocket mr"></div>
              <div class="pocket bl"></div>
              <div class="pocket br"></div>
            </div>
          </div>
        </div>

        <div class="card-content">
          <h3>{{ table.name }}</h3>
          <div class="table-specs">
            <div class="spec">
              <span class="spec-label">尺寸</span>
              <span class="spec-value">{{ table.size }}</span>
            </div>
            <div class="spec">
              <span class="spec-label">品牌</span>
              <span class="spec-value">{{ table.brand }}</span>
            </div>
          </div>
          <div class="price-row">
            <div class="price">
              <span class="amount">¥{{ table.price }}</span>
              <span class="unit">/小时</span>
            </div>
            <button 
              class="btn-book" 
              :disabled="!table.available"
              @click="openBooking(table)"
            >
              {{ table.available ? '立即预约' : '暂不可用' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Booking Modal -->
    <Modal
      v-model="showBookingModal"
      title="预约球桌"
      subtitle="请选择预约时段"
      size="medium"
      confirm-text="确认预约"
      :loading="bookingLoading"
      @confirm="confirmBooking"
    >
      <div v-if="selectedTable" class="booking-form">
        <div class="booking-table-info">
          <div class="table-preview">
            <div class="preview-surface"></div>
          </div>
          <div class="table-details">
            <h4>{{ selectedTable.name }}</h4>
            <p>{{ selectedTable.type }} · {{ selectedTable.brand }}</p>
            <span class="table-price">¥{{ selectedTable.price }}/小时</span>
          </div>
        </div>

        <div class="form-group">
          <label>预约日期</label>
          <div class="date-input">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
            <input v-model="bookingDate" type="date" :min="today" />
          </div>
        </div>

        <div class="form-group">
          <label>选择时段</label>
          <div class="time-slots">
            <button 
              v-for="slot in timeSlots" 
              :key="slot.id"
              class="time-slot"
              :class="{ active: selectedTimeSlot === slot.id, disabled: !slot.available }"
              :disabled="!slot.available"
              @click="selectedTimeSlot = slot.id"
            >
              <span class="slot-time">{{ slot.time }}</span>
              <span class="slot-status">{{ slot.available ? '可预约' : '已满' }}</span>
            </button>
          </div>
        </div>

        <div class="form-group">
          <label>预约时长</label>
          <div class="duration-selector">
            <button 
              v-for="d in durations" 
              :key="d"
              class="duration-btn"
              :class="{ active: duration === d }"
              @click="duration = d"
            >
              {{ d }}小时
            </button>
          </div>
        </div>

        <div class="booking-summary">
          <div class="summary-row">
            <span>球桌费用</span>
            <span>¥{{ selectedTable.price }} × {{ duration }}小时</span>
          </div>
          <div class="summary-row total">
            <span>合计</span>
            <span class="total-price">¥{{ selectedTable.price * duration }}</span>
          </div>
        </div>
      </div>
    </Modal>

    <!-- Success Modal -->
    <Modal
      v-model="showSuccessModal"
      icon="🎉"
      icon-type="success"
      title="预约成功"
      :subtitle="successMessage"
      size="small"
      :show-cancel="false"
      confirm-text="我知道了"
      @confirm="showSuccessModal = false"
    >
      <div v-if="bookingResult" class="success-details">
        <div class="detail-item">
          <span class="label">预约编号</span>
          <span class="value">{{ bookingResult.orderNo }}</span>
        </div>
        <div class="detail-item">
          <span class="label">球桌</span>
          <span class="value">{{ bookingResult.tableName }}</span>
        </div>
        <div class="detail-item">
          <span class="label">时间</span>
          <span class="value">{{ bookingResult.date }} {{ bookingResult.time }}</span>
        </div>
      </div>
    </Modal>

    <!-- Toast -->
    <Toast v-model="showToast" :type="toastType" :title="toastTitle" :message="toastMessage" />
  </div>
</template>

<script>
import Modal from '../components/Modal.vue'
import Toast from '../components/Toast.vue'
import { requireLogin } from '../utils/auth'
import { api } from '../utils/api'

export default {
  name: 'Tables',
  components: { Modal, Toast },
  data() {
    return {
      selectedType: 'all',
      selectedDate: new Date().toISOString().split('T')[0],
      isLoadingTables: false,
      showBookingModal: false,
      showSuccessModal: false,
      bookingLoading: false,
      selectedTable: null,
      bookingDate: new Date().toISOString().split('T')[0],
      selectedTimeSlot: 1,
      duration: 2,
      durations: [1, 2, 3, 4],
      bookingResult: null,
      successMessage: '',
      showToast: false,
      toastType: 'success',
      toastTitle: '',
      toastMessage: '',
      tableTypes: [
        { id: 'all', name: '全部', icon: '🎱' },
        { id: 'snooker', name: '斯诺克', icon: '🟢' },
        { id: 'pool', name: '美式九球', icon: '🟡' },
        { id: 'chinese', name: '中式八球', icon: '⚫' }
      ],
      timeSlots: [
        { id: 1, time: '10:00 - 12:00', available: true },
        { id: 2, time: '12:00 - 14:00', available: true },
        { id: 3, time: '14:00 - 16:00', available: true },
        { id: 4, time: '16:00 - 18:00', available: false },
        { id: 5, time: '18:00 - 20:00', available: true },
        { id: 6, time: '20:00 - 22:00', available: true }
      ],
      tables: [
        { id: 1, name: '1号球桌', type: '斯诺克', typeId: 'snooker', price: 80, available: true, size: '12尺', brand: '星牌' },
        { id: 2, name: '2号球桌', type: '斯诺克', typeId: 'snooker', price: 80, available: false, size: '12尺', brand: '星牌' },
        { id: 3, name: '3号球桌', type: '美式九球', typeId: 'pool', price: 60, available: true, size: '9尺', brand: 'Brunswick' },
        { id: 4, name: '4号球桌', type: '美式九球', typeId: 'pool', price: 60, available: true, size: '9尺', brand: 'Brunswick' },
        { id: 5, name: '5号球桌', type: '中式八球', typeId: 'chinese', price: 50, available: false, size: '9尺', brand: '乔氏' },
        { id: 6, name: '6号球桌', type: '中式八球', typeId: 'chinese', price: 50, available: true, size: '9尺', brand: '乔氏' }
      ]
    }
  },
  computed: {
    filteredTables() {
      if (this.selectedType === 'all') return this.tables
      return this.tables.filter(t => t.typeId === this.selectedType)
    },
    today() {
      return new Date().toISOString().split('T')[0]
    }
  },
  watch: {
    selectedDate() {
      this.loadTablesForDate()
    }
  },
  methods: {
    async loadTablesForDate() {
      this.isLoadingTables = true
      // 模拟API请求延迟
      await new Promise(resolve => setTimeout(resolve, 800))
      // 模拟不同日期的球桌可用状态变化
      this.tables = this.tables.map(table => ({
        ...table,
        available: Math.random() > 0.3
      }))
      this.isLoadingTables = false
    },
    async openBooking(table) {
      // 未登录则拉起全局登录弹窗；登录成功后自动继续预约，取消则中止
      const loggedIn = await requireLogin('预约球桌')
      if (!loggedIn) return
      this.selectedTable = table
      this.bookingDate = this.selectedDate
      this.selectedTimeSlot = 1
      this.duration = 2
      this.showBookingModal = true
    },
    async confirmBooking() {
      this.bookingLoading = true

      const slot = this.timeSlots.find(s => s.id === this.selectedTimeSlot)
      // 受保护写操作：服务端凭令牌归属创建任务，禁止写入其它账号
      const result = await api.bookTable({
        table: this.selectedTable,
        date: this.bookingDate,
        time: slot.time,
        duration: this.duration
      })

      this.bookingLoading = false

      if (!result.success) {
        this.showBookingModal = false
        this.showNotification('error', '预约失败', result.error || '请稍后重试')
        return
      }

      this.bookingResult = {
        orderNo: result.data.orderNo,
        tableName: result.data.tableName,
        date: result.data.date,
        time: result.data.time
      }
      this.successMessage = `${result.data.date} ${result.data.time}`

      this.showBookingModal = false
      this.showSuccessModal = true

      this.showNotification('info', '已添加到任务中心', `您可以在任务中心查看并管理此预约`)
    },
    showNotification(type, title, message) {
      this.toastType = type
      this.toastTitle = title
      this.toastMessage = message
      this.showToast = true
    }
  }
}
</script>

<style scoped>
.tables-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 3rem 4rem;
}

.page-header {
  text-align: center;
  padding: 2rem 0 4rem;
}

.page-tag {
  display: inline-block;
  background: rgba(0, 217, 165, 0.1);
  color: var(--primary);
  padding: 0.5rem 1rem;
  border-radius: 50px;
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 1rem;
}

.page-header h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 3rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
}

.page-header p {
  color: var(--text-secondary);
  font-size: 1.1rem;
}

/* Filter Section */
.filter-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.filter-tabs {
  display: flex;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.4rem;
  gap: 0.25rem;
}

.filter-tabs button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: transparent;
  border: none;
  padding: 0.75rem 1.25rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 500;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s;
}

.filter-tabs button:hover {
  color: var(--text-primary);
}

.filter-tabs button.active {
  background: var(--primary);
  color: var(--bg-dark);
}

.tab-icon {
  font-size: 1rem;
}

.date-picker {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.75rem 1rem;
}

.date-picker svg {
  width: 20px;
  height: 20px;
  color: var(--text-secondary);
}

.date-picker input {
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 0.9rem;
  outline: none;
}

.date-picker input::-webkit-calendar-picker-indicator {
  filter: invert(1);
  cursor: pointer;
}

/* Tables Grid */
.tables-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 1.5rem;
  position: relative;
  min-height: 200px;
}

.tables-grid.loading {
  pointer-events: none;
}

.tables-grid.loading .table-card {
  opacity: 0.3;
  filter: blur(2px);
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  z-index: 10;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.table-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 20px;
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.table-card.available:hover {
  transform: translateY(-6px);
  border-color: var(--primary);
  box-shadow: var(--shadow-glow);
}

.table-card.unavailable {
  opacity: 0.6;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
}

.table-type-badge {
  background: rgba(255, 255, 255, 0.05);
  padding: 0.4rem 0.8rem;
  border-radius: 8px;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-indicator.online .status-dot {
  background: var(--primary);
  box-shadow: 0 0 10px var(--primary);
}

.status-indicator.online {
  color: var(--primary);
}

.status-indicator.offline .status-dot {
  background: #ff6b6b;
}

.status-indicator.offline {
  color: #ff6b6b;
}

/* Table Visual */
.table-visual {
  padding: 1rem 1.5rem;
}

.table-3d {
  perspective: 500px;
}

.table-surface {
  position: relative;
  height: 100px;
  background: linear-gradient(135deg, #1B5E20 0%, #2E7D32 100%);
  border-radius: 8px;
  border: 6px solid #5D4037;
  box-shadow: 
    inset 0 0 20px rgba(0,0,0,0.3),
    0 10px 30px rgba(0,0,0,0.3);
  transform: rotateX(10deg);
}

.pocket {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #1a1a1a;
  border-radius: 50%;
}

.pocket.tl { top: 4px; left: 4px; }
.pocket.tr { top: 4px; right: 4px; }
.pocket.ml { top: 50%; left: 4px; transform: translateY(-50%); }
.pocket.mr { top: 50%; right: 4px; transform: translateY(-50%); }
.pocket.bl { bottom: 4px; left: 4px; }
.pocket.br { bottom: 4px; right: 4px; }

/* Card Content */
.card-content {
  padding: 1.25rem 1.5rem 1.5rem;
}

.card-content h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.table-specs {
  display: flex;
  gap: 2rem;
  margin-bottom: 1.25rem;
}

.spec {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.spec-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.spec-value {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border);
}

.price .amount {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--primary);
}

.price .unit {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.btn-book {
  background: var(--gradient-1);
  color: var(--bg-dark);
  border: none;
  padding: 0.75rem 1.5rem;
  font-size: 0.9rem;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-book:hover:not(:disabled) {
  transform: scale(1.02);
  box-shadow: 0 5px 20px var(--primary-glow);
}

.btn-book:disabled {
  background: var(--bg-card-hover);
  color: var(--text-muted);
  cursor: not-allowed;
}

/* Booking Form */
.booking-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.booking-table-info {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 14px;
}

.table-preview {
  width: 80px;
  height: 50px;
  flex-shrink: 0;
}

.preview-surface {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #1B5E20 0%, #2E7D32 100%);
  border-radius: 6px;
  border: 4px solid #5D4037;
}

.table-details h4 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.table-details p {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
}

.table-price {
  font-size: 0.9rem;
  color: var(--primary);
  font-weight: 600;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.form-group label {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.date-input {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.75rem 1rem;
}

.date-input svg {
  width: 18px;
  height: 18px;
  color: var(--text-secondary);
}

.date-input input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 0.9rem;
  outline: none;
}

.date-input input::-webkit-calendar-picker-indicator {
  filter: invert(1);
  cursor: pointer;
}

.time-slots {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.time-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.time-slot:hover:not(.disabled) {
  border-color: var(--primary);
}

.time-slot.active {
  background: rgba(0, 217, 165, 0.1);
  border-color: var(--primary);
}

.time-slot.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.slot-time {
  font-size: 0.9rem;
  font-weight: 500;
}

.slot-status {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.time-slot.active .slot-status {
  color: var(--primary);
}

.duration-selector {
  display: flex;
  gap: 0.5rem;
}

.duration-btn {
  flex: 1;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.duration-btn:hover {
  border-color: var(--primary);
}

.duration-btn.active {
  background: rgba(0, 217, 165, 0.1);
  border-color: var(--primary);
  color: var(--primary);
}

.booking-summary {
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  color: var(--text-secondary);
  padding: 0.5rem 0;
}

.summary-row.total {
  border-top: 1px solid var(--border);
  margin-top: 0.5rem;
  padding-top: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.total-price {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.25rem;
  color: var(--primary);
}

/* Success Details */
.success-details {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  text-align: left;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
}

.detail-item .label {
  color: var(--text-secondary);
}

.detail-item .value {
  font-weight: 500;
}

@media (max-width: 768px) {
  .tables-page {
    padding: 0 1.5rem 3rem;
  }
  
  .page-header h1 {
    font-size: 2rem;
  }
  
  .filter-section {
    flex-direction: column;
    align-items: stretch;
  }
  
  .filter-tabs {
    overflow-x: auto;
  }
  
  .tables-grid {
    grid-template-columns: 1fr;
  }
  
  .time-slots {
    grid-template-columns: 1fr;
  }
}
</style>
