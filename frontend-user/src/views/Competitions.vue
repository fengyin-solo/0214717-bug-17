<template>
  <div class="competitions-page">
    <header class="page-header">
      <div class="header-content">
        <span class="page-tag">精彩赛事</span>
        <h1>赛事活动</h1>
        <p>参与精彩赛事，展示您的球技，赢取丰厚奖金</p>
      </div>
    </header>

    <div class="tabs-container">
      <div class="tabs">
        <button v-for="tab in tabs" :key="tab.id" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
          <span class="tab-icon">{{ tab.icon }}</span>
          <span class="tab-text">{{ tab.name }}</span>
          <span class="tab-count">{{ getCount(tab.id) }}</span>
        </button>
      </div>
    </div>

    <div class="competitions-list">
      <div v-for="comp in filteredCompetitions" :key="comp.id" class="competition-card" :class="comp.status">
        <div class="card-left">
          <div class="date-block">
            <span class="month">{{ getMonth(comp.date) }}</span>
            <span class="day">{{ getDay(comp.date) }}</span>
          </div>
        </div>
        <div class="card-main">
          <div class="card-header">
            <div class="status-badge" :class="comp.status">
              <span class="status-dot"></span>
              <span>{{ statusText[comp.status] }}</span>
            </div>
            <div class="comp-type">{{ comp.type }}</div>
          </div>
          <h3>{{ comp.name }}</h3>
          <div class="comp-details">
            <div class="detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>{{ comp.location }}</span>
            </div>
            <div class="detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <span>{{ comp.participants }}/{{ comp.maxParticipants }}人</span>
            </div>
          </div>
        </div>
        <div class="card-right">
          <div class="prize-info"><span class="prize-label">奖金池</span><span class="prize-amount">¥{{ formatNumber(comp.prize) }}</span></div>
          <div class="fee-info"><span class="fee-label">报名费</span><span class="fee-amount">¥{{ comp.fee }}</span></div>
          <button class="btn-action" :class="comp.status" @click="handleAction(comp)">
            <span>{{ getActionText(comp.status) }}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div v-if="comp.status === 'upcoming'" class="progress-bar">
          <div class="progress" :style="{ width: (comp.participants / comp.maxParticipants * 100) + '%' }"></div>
        </div>
      </div>
    </div>

    <div v-if="filteredCompetitions.length === 0" class="empty-state">
      <div class="empty-icon">🏆</div>
      <h3>暂无{{ tabs.find(t => t.id === activeTab)?.name }}赛事</h3>
      <p>请关注其他类型的赛事或稍后再来查看</p>
    </div>

    <!-- Join Modal -->
    <Modal v-model="showJoinModal" icon="🏆" icon-type="info" title="报名参赛" :subtitle="selectedComp?.name" size="small" confirm-text="确认报名" :loading="joinLoading" @confirm="confirmJoin">
      <div v-if="selectedComp" class="join-info">
        <div class="info-row"><span class="label">比赛日期</span><span class="value">{{ selectedComp.date }}</span></div>
        <div class="info-row"><span class="label">比赛地点</span><span class="value">{{ selectedComp.location }}</span></div>
        <div class="info-row"><span class="label">奖金池</span><span class="value highlight">¥{{ formatNumber(selectedComp.prize) }}</span></div>
        <div class="info-row total"><span class="label">报名费</span><span class="value price">¥{{ selectedComp.fee }}</span></div>
      </div>
    </Modal>

    <!-- Success Modal -->
    <Modal v-model="showSuccessModal" icon="🎉" icon-type="success" title="报名成功" subtitle="祝您比赛取得好成绩" size="small" :show-cancel="false" confirm-text="查看详情" @confirm="viewJoinDetail">
      <div v-if="joinResult" class="success-info">
        <div class="info-row"><span class="label">报名编号</span><span class="value">{{ joinResult.regNo }}</span></div>
        <div class="info-row"><span class="label">比赛</span><span class="value">{{ joinResult.compName }}</span></div>
        <div class="info-row"><span class="label">参赛号</span><span class="value highlight">#{{ joinResult.playerNo }}</span></div>
      </div>
    </Modal>

    <!-- Live Modal -->
    <Modal v-model="showLiveModal" title="比赛直播" size="large" :show-footer="false">
      <div v-if="selectedComp" class="live-content">
        <div class="live-player">
          <div class="live-placeholder">
            <div class="live-icon">📺</div>
            <p>直播信号加载中...</p>
          </div>
        </div>
        <div class="live-info">
          <h3>{{ selectedComp.name }}</h3>
          <div class="live-stats">
            <div class="stat"><span class="value">{{ selectedComp.participants }}</span><span class="label">参赛选手</span></div>
            <div class="stat"><span class="value">¥{{ formatNumber(selectedComp.prize) }}</span><span class="label">奖金池</span></div>
          </div>
        </div>
      </div>
    </Modal>

    <!-- Result Modal -->
    <Modal v-model="showResultModal" title="比赛结果" size="medium" :show-footer="false">
      <div v-if="selectedComp" class="result-content">
        <div class="result-header">
          <h3>{{ selectedComp.name }}</h3>
          <p>{{ selectedComp.date }} · {{ selectedComp.location }}</p>
        </div>
        <div class="result-podium">
          <div class="podium-item second"><div class="rank">🥈</div><div class="name">李四</div><div class="prize">¥{{ Math.floor(selectedComp.prize * 0.3) }}</div></div>
          <div class="podium-item first"><div class="rank">🥇</div><div class="name">张三</div><div class="prize">¥{{ Math.floor(selectedComp.prize * 0.5) }}</div></div>
          <div class="podium-item third"><div class="rank">🥉</div><div class="name">王五</div><div class="prize">¥{{ Math.floor(selectedComp.prize * 0.2) }}</div></div>
        </div>
      </div>
    </Modal>

    <Toast v-model="showToast" :type="toastType" :title="toastTitle" :message="toastMessage" />
  </div>
</template>

<script>
import Modal from '../components/Modal.vue'
import Toast from '../components/Toast.vue'
import { requireLogin } from '../utils/auth'
import { api } from '../utils/api'

export default {
  name: 'Competitions',
  components: { Modal, Toast },
  data() {
    return {
      activeTab: 'upcoming',
      showJoinModal: false,
      showSuccessModal: false,
      showLiveModal: false,
      showResultModal: false,
      joinLoading: false,
      selectedComp: null,
      joinResult: null,
      showToast: false,
      toastType: 'success',
      toastTitle: '',
      toastMessage: '',
      tabs: [
        { id: 'upcoming', name: '即将开始', icon: '📅' },
        { id: 'ongoing', name: '进行中', icon: '🔴' },
        { id: 'finished', name: '已结束', icon: '✅' }
      ],
      statusText: { upcoming: '即将开始', ongoing: '进行中', finished: '已结束' },
      competitions: [
        { id: 1, name: '2026春季斯诺克公开赛', type: '斯诺克', date: '2026-03-15', location: '主馆A区', prize: 50000, fee: 200, participants: 28, maxParticipants: 32, status: 'upcoming' },
        { id: 2, name: '周末九球挑战赛', type: '美式九球', date: '2026-02-14', location: '主馆B区', prize: 10000, fee: 100, participants: 16, maxParticipants: 16, status: 'ongoing' },
        { id: 3, name: '新年中式八球锦标赛', type: '中式八球', date: '2026-01-20', location: '主馆A区', prize: 30000, fee: 150, participants: 64, maxParticipants: 64, status: 'finished' },
        { id: 4, name: '会员积分争霸赛', type: '综合', date: '2026-04-01', location: '主馆C区', prize: 20000, fee: 50, participants: 12, maxParticipants: 48, status: 'upcoming' },
        { id: 5, name: '女子台球精英赛', type: '美式九球', date: '2026-03-08', location: '主馆B区', prize: 15000, fee: 80, participants: 8, maxParticipants: 16, status: 'upcoming' }
      ]
    }
  },
  computed: {
    filteredCompetitions() { return this.competitions.filter(c => c.status === this.activeTab) }
  },
  methods: {
    getCount(status) { return this.competitions.filter(c => c.status === status).length },
    getMonth(date) { return ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'][new Date(date).getMonth()] },
    getDay(date) { return new Date(date).getDate() },
    formatNumber(num) { return num.toLocaleString() },
    getActionText(status) { return { upcoming: '立即报名', ongoing: '观看直播', finished: '查看结果' }[status] },
    async handleAction(comp) {
      this.selectedComp = comp
      if (comp.status === 'upcoming') {
        // 报名需要登录：未登录则拉起全局登录弹窗，成功后自动继续
        const loggedIn = await requireLogin('报名赛事')
        if (!loggedIn) return
        this.showJoinModal = true
      }
      else if (comp.status === 'ongoing') this.showLiveModal = true
      else this.showResultModal = true
    },
    async confirmJoin() {
      this.joinLoading = true

      // 受保护写操作：服务端凭令牌归属创建报名任务
      const result = await api.joinCompetition({ competitionId: this.selectedComp.id })

      this.joinLoading = false

      if (!result.success) {
        this.showJoinModal = false
        this.showNotification('error', '报名失败', result.error || '请稍后重试')
        return
      }

      this.joinResult = { ...result.data, compName: this.selectedComp.name }

      this.showJoinModal = false
      this.showSuccessModal = true

      this.showNotification('info', '已添加到任务中心', `您可以在任务中心查看并管理此赛事`)
    },
    viewJoinDetail() {
      this.showSuccessModal = false
      this.showNotification('success', '报名详情', `报名编号：${this.joinResult.regNo}，参赛号：#${this.joinResult.playerNo}`)
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
.competitions-page { max-width: 1200px; margin: 0 auto; padding: 0 3rem 4rem; }
.page-header { text-align: center; padding: 2rem 0 4rem; }
.page-tag { display: inline-block; background: rgba(0, 217, 165, 0.1); color: var(--primary); padding: 0.5rem 1rem; border-radius: 50px; font-size: 0.85rem; font-weight: 500; margin-bottom: 1rem; }
.page-header h1 { font-family: 'Space Grotesk', sans-serif; font-size: 3rem; font-weight: 700; margin-bottom: 0.75rem; }
.page-header p { color: var(--text-secondary); font-size: 1.1rem; }
.tabs-container { margin-bottom: 2.5rem; }
.tabs { display: flex; background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 0.5rem; gap: 0.5rem; }
.tabs button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.6rem; background: transparent; border: none; padding: 1rem 1.5rem; color: var(--text-secondary); font-size: 0.95rem; font-weight: 500; border-radius: 12px; cursor: pointer; transition: all 0.3s; }
.tabs button:hover { color: var(--text-primary); background: rgba(255, 255, 255, 0.03); }
.tabs button.active { background: var(--primary); color: var(--bg-dark); }
.tab-icon { font-size: 1.1rem; }
.tab-count { background: rgba(255, 255, 255, 0.15); padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
.tabs button.active .tab-count { background: rgba(0, 0, 0, 0.2); }
.competitions-list { display: flex; flex-direction: column; gap: 1rem; }
.competition-card { display: flex; align-items: stretch; background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; overflow: hidden; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); position: relative; }
.competition-card:hover { transform: translateX(8px); border-color: rgba(255, 255, 255, 0.15); }
.competition-card.upcoming:hover { border-color: var(--primary); box-shadow: var(--shadow-glow); }
.card-left { padding: 1.5rem; display: flex; align-items: center; border-right: 1px solid var(--border); }
.date-block { display: flex; flex-direction: column; align-items: center; min-width: 60px; }
.date-block .month { font-size: 0.75rem; color: var(--primary); font-weight: 600; text-transform: uppercase; }
.date-block .day { font-family: 'Space Grotesk', sans-serif; font-size: 2rem; font-weight: 700; line-height: 1; }
.card-main { flex: 1; padding: 1.5rem; }
.card-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
.status-badge { display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.75rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
.status-badge.upcoming { background: rgba(0, 217, 165, 0.15); color: var(--primary); }
.status-badge.ongoing { background: rgba(255, 193, 7, 0.15); color: #ffc107; }
.status-badge.finished { background: rgba(108, 117, 125, 0.15); color: #6c757d; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.status-badge.ongoing .status-dot { animation: blink 1.5s infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.comp-type { font-size: 0.75rem; color: var(--text-muted); padding: 0.3rem 0.6rem; background: rgba(255, 255, 255, 0.05); border-radius: 6px; }
.card-main h3 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.75rem; }
.comp-details { display: flex; gap: 1.5rem; }
.detail { display: flex; align-items: center; gap: 0.4rem; color: var(--text-secondary); font-size: 0.85rem; }
.detail svg { width: 16px; height: 16px; opacity: 0.7; }
.card-right { padding: 1.5rem; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 0.5rem; min-width: 180px; border-left: 1px solid var(--border); }
.prize-info, .fee-info { text-align: right; }
.prize-label, .fee-label { display: block; font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.prize-amount { font-family: 'Space Grotesk', sans-serif; font-size: 1.5rem; font-weight: 700; color: var(--primary); }
.fee-amount { font-size: 0.9rem; color: var(--text-secondary); }
.btn-action { display: flex; align-items: center; gap: 0.5rem; border: none; padding: 0.7rem 1.25rem; font-size: 0.85rem; font-weight: 600; border-radius: 10px; cursor: pointer; transition: all 0.3s; margin-top: 0.5rem; }
.btn-action.upcoming { background: var(--gradient-1); color: var(--bg-dark); }
.btn-action.ongoing { background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%); color: var(--bg-dark); }
.btn-action.finished { background: rgba(255, 255, 255, 0.1); color: var(--text-primary); }
.btn-action svg { width: 16px; height: 16px; transition: transform 0.3s; }
.btn-action:hover svg { transform: translateX(3px); }
.btn-action.upcoming:hover { box-shadow: 0 5px 20px var(--primary-glow); }
.progress-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: rgba(255, 255, 255, 0.05); }
.progress { height: 100%; background: var(--gradient-1); border-radius: 0 3px 3px 0; transition: width 0.5s ease; }
.empty-state { text-align: center; padding: 4rem 2rem; }
.empty-icon { font-size: 4rem; margin-bottom: 1rem; opacity: 0.5; }
.empty-state h3 { font-size: 1.25rem; margin-bottom: 0.5rem; color: var(--text-secondary); }
.empty-state p { color: var(--text-muted); font-size: 0.9rem; }
.join-info, .success-info { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 12px; text-align: left; }
.info-row { display: flex; justify-content: space-between; font-size: 0.9rem; }
.info-row .label { color: var(--text-secondary); }
.info-row .value { font-weight: 500; }
.info-row .value.highlight { color: var(--primary); }
.info-row.total { border-top: 1px solid var(--border); padding-top: 0.75rem; margin-top: 0.25rem; }
.info-row .value.price { font-family: 'Space Grotesk', sans-serif; font-size: 1.25rem; color: var(--primary); }
.live-content { margin: -20px -24px; }
.live-player { background: #000; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; }
.live-placeholder { text-align: center; color: var(--text-muted); }
.live-icon { font-size: 4rem; margin-bottom: 1rem; }
.live-info { padding: 1.5rem; }
.live-info h3 { font-size: 1.25rem; margin-bottom: 1rem; }
.live-stats { display: flex; gap: 2rem; }
.live-stats .stat { text-align: center; }
.live-stats .value { display: block; font-family: 'Space Grotesk', sans-serif; font-size: 1.5rem; font-weight: 700; color: var(--primary); }
.live-stats .label { font-size: 0.8rem; color: var(--text-secondary); }
.result-content { margin: -20px -24px; padding: 1.5rem; }
.result-header { text-align: center; margin-bottom: 2rem; }
.result-header h3 { font-size: 1.25rem; margin-bottom: 0.5rem; }
.result-header p { color: var(--text-secondary); font-size: 0.9rem; }
.result-podium { display: flex; align-items: flex-end; justify-content: center; gap: 1rem; }
.podium-item { text-align: center; padding: 1.5rem; background: rgba(255, 255, 255, 0.03); border-radius: 16px; }
.podium-item.first { order: 2; padding: 2rem 1.5rem; background: rgba(0, 217, 165, 0.1); }
.podium-item.second { order: 1; }
.podium-item.third { order: 3; }
.podium-item .rank { font-size: 2.5rem; margin-bottom: 0.5rem; }
.podium-item.first .rank { font-size: 3rem; }
.podium-item .name { font-weight: 600; margin-bottom: 0.25rem; }
.podium-item .prize { color: var(--primary); font-family: 'Space Grotesk', sans-serif; font-weight: 700; }
@media (max-width: 900px) { .competition-card { flex-direction: column; } .card-left { border-right: none; border-bottom: 1px solid var(--border); padding: 1rem 1.5rem; } .date-block { flex-direction: row; gap: 0.5rem; } .date-block .day { font-size: 1.5rem; } .card-right { border-left: none; border-top: 1px solid var(--border); flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; } .prize-info, .fee-info { text-align: left; } }
@media (max-width: 600px) { .competitions-page { padding: 0 1.5rem 3rem; } .page-header h1 { font-size: 2rem; } .tabs { flex-direction: column; } .tabs button { justify-content: flex-start; } }
</style>
