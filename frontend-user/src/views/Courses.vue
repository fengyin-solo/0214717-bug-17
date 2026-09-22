<template>
  <div class="courses-page">
    <header class="page-header">
      <div class="header-content">
        <span class="page-tag">专业培训</span>
        <h1>教学课程</h1>
        <p>专业教练团队，助您快速提升球技</p>
      </div>
    </header>

    <div class="courses-grid">
      <div 
        v-for="course in courses" 
        :key="course.id" 
        class="course-card"
        @click="openCourseDetail(course)"
      >
        <div class="card-visual">
          <div class="visual-bg" :style="{ background: course.gradient }"></div>
          <div class="course-icon">{{ course.icon }}</div>
          <div class="level-badge">{{ course.level }}</div>
        </div>
        
        <div class="card-content">
          <div class="course-meta">
            <span class="duration">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              {{ course.duration }}
            </span>
            <span class="students">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              {{ course.students }}人
            </span>
          </div>
          
          <h3>{{ course.name }}</h3>
          <p class="description">{{ course.description }}</p>
          
          <div class="coach-info">
            <div class="coach-avatar">{{ course.coach.charAt(0) }}</div>
            <div class="coach-details">
              <span class="coach-name">{{ course.coach }}</span>
              <span class="coach-title">{{ course.coachTitle }}</span>
            </div>
          </div>
          
          <div class="card-footer">
            <div class="price">
              <span class="amount">¥{{ course.price }}</span>
              <span v-if="course.originalPrice" class="original">¥{{ course.originalPrice }}</span>
            </div>
            <button class="btn-enroll" @click.stop="openEnrollModal(course)">
              <span>立即报名</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="card-hover-effect"></div>
      </div>
    </div>

    <!-- Course Detail Modal -->
    <Modal
      v-model="showDetailModal"
      size="large"
      :show-footer="false"
    >
      <div v-if="selectedCourse" class="course-detail">
        <div class="detail-header" :style="{ background: selectedCourse.gradient }">
          <div class="detail-icon">{{ selectedCourse.icon }}</div>
          <div class="detail-badge">{{ selectedCourse.level }}</div>
        </div>
        
        <div class="detail-content">
          <h2>{{ selectedCourse.name }}</h2>
          <p class="detail-desc">{{ selectedCourse.description }}</p>
          
          <div class="detail-stats">
            <div class="stat">
              <span class="stat-value">{{ selectedCourse.duration }}</span>
              <span class="stat-label">课程时长</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ selectedCourse.lessons }}</span>
              <span class="stat-label">课时数量</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ selectedCourse.students }}</span>
              <span class="stat-label">已报名</span>
            </div>
          </div>
          
          <div class="detail-coach">
            <div class="coach-avatar large">{{ selectedCourse.coach.charAt(0) }}</div>
            <div class="coach-info">
              <h4>{{ selectedCourse.coach }}</h4>
              <span class="title">{{ selectedCourse.coachTitle }}</span>
              <p class="bio">{{ selectedCourse.coachBio }}</p>
            </div>
          </div>
          
          <div class="course-outline">
            <h4>课程大纲</h4>
            <div class="outline-list">
              <div v-for="(item, index) in selectedCourse.outline" :key="index" class="outline-item">
                <span class="outline-num">{{ String(index + 1).padStart(2, '0') }}</span>
                <span class="outline-text">{{ item }}</span>
              </div>
            </div>
          </div>
          
          <div class="detail-footer">
            <div class="detail-price">
              <span class="current">¥{{ selectedCourse.price }}</span>
              <span v-if="selectedCourse.originalPrice" class="original">¥{{ selectedCourse.originalPrice }}</span>
            </div>
            <button class="btn-enroll-large" @click="openEnrollModal(selectedCourse)">
              立即报名
            </button>
          </div>
        </div>
      </div>
    </Modal>

    <!-- Enroll Modal -->
    <Modal
      v-model="showEnrollModal"
      icon="📚"
      icon-type="info"
      title="确认报名"
      :subtitle="enrollCourse?.name"
      size="small"
      confirm-text="确认支付"
      :loading="enrollLoading"
      @confirm="confirmEnroll"
    >
      <div v-if="enrollCourse" class="enroll-info">
        <div class="info-row">
          <span class="label">课程</span>
          <span class="value">{{ enrollCourse.name }}</span>
        </div>
        <div class="info-row">
          <span class="label">教练</span>
          <span class="value">{{ enrollCourse.coach }}</span>
        </div>
        <div class="info-row">
          <span class="label">课时</span>
          <span class="value">{{ enrollCourse.lessons }}</span>
        </div>
        <div class="info-row total">
          <span class="label">应付金额</span>
          <span class="value price">¥{{ enrollCourse.price }}</span>
        </div>
      </div>
    </Modal>

    <!-- Success Modal -->
    <Modal
      v-model="showSuccessModal"
      icon="🎉"
      icon-type="success"
      title="报名成功"
      subtitle="课程已添加到您的学习列表"
      size="small"
      :show-cancel="false"
      confirm-text="开始学习"
      @confirm="goToMyCourses"
    >
      <div v-if="enrollResult" class="success-info">
        <div class="info-row">
          <span class="label">订单编号</span>
          <span class="value">{{ enrollResult.orderNo }}</span>
        </div>
        <div class="info-row">
          <span class="label">课程</span>
          <span class="value">{{ enrollResult.courseName }}</span>
        </div>
        <div class="info-row">
          <span class="label">有效期至</span>
          <span class="value">{{ enrollResult.expireDate }}</span>
        </div>
      </div>
    </Modal>

    <!-- Toast -->
    <Toast v-model="showToast" :type="toastType" :title="toastTitle" :message="toastMessage" />

    <!-- My Courses Modal -->
    <Modal v-model="showMyCoursesModal" title="我的课程" size="medium" :show-footer="false">
      <div class="my-courses-content">
        <div v-if="myCourses.length > 0" class="my-courses-list">
          <div v-for="course in myCourses" :key="course.orderNo" class="my-course-card">
            <div class="course-icon-small">{{ course.courseIcon }}</div>
            <div class="course-info-main">
              <h4>{{ course.courseName }}</h4>
              <p>教练：{{ course.coach }} · {{ course.lessons }}</p>
              <div class="course-progress">
                <div class="progress-bar"><div class="progress-fill" :style="{ width: course.progress + '%' }"></div></div>
                <span>{{ course.progress }}%</span>
              </div>
            </div>
            <button class="btn-study" @click="startStudy(course)">开始学习</button>
          </div>
        </div>
        <div v-else class="courses-empty">
          <div class="empty-icon">📚</div>
          <p>暂无已报名课程</p>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script>
import Modal from '../components/Modal.vue'
import Toast from '../components/Toast.vue'
import { requireAuth } from '../utils/auth'
import { taskStore } from '../utils/taskStore'

export default {
  name: 'Courses',
  components: { Modal, Toast },
  data() {
    return {
      showDetailModal: false,
      showEnrollModal: false,
      showSuccessModal: false,
      showMyCoursesModal: false, // 我的课程弹框
      enrollLoading: false,
      selectedCourse: null,
      enrollCourse: null,
      enrollResult: null,
      myCourses: [], // 已报名课程列表
      showToast: false,
      toastType: 'success',
      toastTitle: '',
      toastMessage: '',
      courses: [
        {
          id: 1,
          name: '台球入门基础课',
          icon: '🎯',
          level: '入门',
          duration: '4周',
          lessons: '8课时',
          students: 156,
          price: 599,
          originalPrice: 799,
          description: '从零开始学习台球，掌握基本姿势、握杆方法和击球技巧，适合完全没有基础的新手',
          coach: '张明',
          coachTitle: '高级教练',
          coachBio: '10年教学经验，培养学员超过500人，擅长基础教学和纠正动作',
          gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          outline: ['台球基础知识介绍', '正确的站姿与握杆', '基本击球动作练习', '直线球练习', '简单角度球', '基础走位概念', '实战练习', '结业考核']
        },
        {
          id: 2,
          name: '斯诺克进阶训练',
          icon: '🎱',
          level: '进阶',
          duration: '6周',
          lessons: '12课时',
          students: 89,
          price: 1299,
          originalPrice: 1599,
          description: '深入学习斯诺克战术布局，提升走位和防守能力，掌握高级杆法技巧',
          coach: '李强',
          coachTitle: '国家级教练',
          coachBio: '前省队选手，15年执教经验，多次带队获得全国比赛冠军',
          gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          outline: ['斯诺克规则深度解析', '高级杆法：低杆与高杆', '塞球技术详解', '走位规划与执行', '防守策略', '清台技巧', '比赛心态调整', '模拟比赛训练']
        },
        {
          id: 3,
          name: '九球高级技巧',
          icon: '🏆',
          level: '高级',
          duration: '8周',
          lessons: '16课时',
          students: 45,
          price: 1999,
          originalPrice: 2499,
          description: '掌握高级杆法、塞球技术和复杂局面处理，提升比赛实战能力',
          coach: '王磊',
          coachTitle: '职业选手',
          coachBio: '现役职业选手，全国九球锦标赛前八，擅长实战技巧教学',
          gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          outline: ['九球比赛规则与策略', '开球技巧优化', '组合球与翻袋', '高级塞球应用', '困难球处理', '安全球战术', '关键球心理', '实战对抗训练']
        },
        {
          id: 4,
          name: '比赛心理训练',
          icon: '🧠',
          level: '专业',
          duration: '3周',
          lessons: '6课时',
          students: 32,
          price: 999,
          description: '提升比赛心理素质，学习压力管理和专注力训练，突破瓶颈期',
          coach: '赵芳',
          coachTitle: '运动心理师',
          coachBio: '国家认证运动心理咨询师，服务多支省级运动队',
          gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
          outline: ['运动心理学基础', '压力与焦虑管理', '专注力训练方法', '比赛前心理准备', '失误后的心态调整', '建立自信心']
        }
      ]
    }
  },
  computed: {
  },
  methods: {
    openCourseDetail(course) {
      this.selectedCourse = course
      this.showDetailModal = true
    },
    openEnrollModal(course) {
      // 受保护操作：未登录弹出全局登录框，登录成功后自动继续报名
      requireAuth(() => {
        this.enrollCourse = course
        this.showDetailModal = false
        this.showEnrollModal = true
      })
    },
    async confirmEnroll() {
      this.enrollLoading = true
      
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      const expireDate = new Date()
      expireDate.setMonth(expireDate.getMonth() + 6)
      const orderNo = 'CR' + Date.now().toString().slice(-8)
      
      const courseOrder = {
        orderNo,
        courseName: this.enrollCourse.name,
        courseIcon: this.enrollCourse.icon,
        coach: this.enrollCourse.coach,
        lessons: this.enrollCourse.lessons,
        price: this.enrollCourse.price,
        expireDate: expireDate.toISOString().split('T')[0],
        createTime: new Date().toLocaleString(),
        progress: 0
      }
      
      this.enrollResult = courseOrder
      this.myCourses.unshift(courseOrder) // 添加到我的课程
      
      // 添加到任务中心
      const enrollInfo = { orderNo }
      taskStore.addCourseTask(this.enrollCourse, enrollInfo)
      
      this.enrollLoading = false
      this.showEnrollModal = false
      this.showSuccessModal = true
      
      this.showNotification('info', '已添加到任务中心', `您可以在任务中心查看并管理此课程`)
    },
    goToMyCourses() {
      this.showSuccessModal = false
      this.showMyCoursesModal = true
    },
    startStudy(course) {
      this.showMyCoursesModal = false
      this.showNotification('success', '开始学习', `正在进入"${course.courseName}"课程`)
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
.courses-page {
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

/* Courses Grid */
.courses-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
}

.course-card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 24px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.course-card:hover {
  transform: translateY(-8px);
  border-color: rgba(255, 255, 255, 0.15);
}

.card-hover-effect {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 0%, rgba(0, 217, 165, 0.05) 100%);
  opacity: 0;
  transition: opacity 0.4s;
  pointer-events: none;
}

.course-card:hover .card-hover-effect {
  opacity: 1;
}

.card-visual {
  position: relative;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.visual-bg {
  position: absolute;
  inset: 0;
  opacity: 0.8;
}

.course-icon {
  font-size: 4rem;
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
}

.level-badge {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  padding: 0.4rem 0.8rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #fff;
}

.card-content {
  padding: 1.5rem;
}

.course-meta {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.course-meta span {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.course-meta svg {
  width: 14px;
  height: 14px;
}

.card-content h3 {
  font-size: 1.2rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.description {
  color: var(--text-secondary);
  font-size: 0.85rem;
  line-height: 1.6;
  margin-bottom: 1.25rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.coach-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  margin-bottom: 1.25rem;
}

.coach-avatar {
  width: 40px;
  height: 40px;
  background: var(--gradient-1);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: var(--bg-dark);
}

.coach-details {
  display: flex;
  flex-direction: column;
}

.coach-name {
  font-weight: 500;
  font-size: 0.9rem;
}

.coach-title {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border);
}

.price {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.price .amount {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--primary);
}

.price .original {
  font-size: 0.9rem;
  color: var(--text-muted);
  text-decoration: line-through;
}

.btn-enroll {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--gradient-1);
  color: var(--bg-dark);
  border: none;
  padding: 0.7rem 1.2rem;
  font-size: 0.85rem;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-enroll svg {
  width: 16px;
  height: 16px;
  transition: transform 0.3s;
}

.btn-enroll:hover {
  box-shadow: 0 5px 20px var(--primary-glow);
}

.btn-enroll:hover svg {
  transform: translateX(3px);
}

/* Course Detail Modal */
.course-detail {
  margin: -20px -24px;
}

.detail-header {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.detail-icon {
  font-size: 5rem;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,0.3));
}

.detail-badge {
  position: absolute;
  top: 1rem;
  left: 1rem;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  padding: 0.4rem 0.8rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #fff;
}

.detail-content {
  padding: 1.5rem;
}

.detail-content h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.detail-desc {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.6;
  margin-bottom: 1.5rem;
}

.detail-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.detail-stats .stat {
  text-align: center;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
}

.stat-value {
  display: block;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--primary);
  margin-bottom: 0.25rem;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.detail-coach {
  display: flex;
  gap: 1rem;
  padding: 1.25rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
  margin-bottom: 1.5rem;
}

.coach-avatar.large {
  width: 56px;
  height: 56px;
  font-size: 1.25rem;
  border-radius: 14px;
  flex-shrink: 0;
}

.detail-coach .coach-info {
  display: flex;
  flex-direction: column;
  padding: 0;
  background: none;
  margin: 0;
}

.detail-coach h4 {
  font-weight: 600;
  margin-bottom: 0.15rem;
}

.detail-coach .title {
  font-size: 0.8rem;
  color: var(--primary);
  margin-bottom: 0.5rem;
}

.detail-coach .bio {
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.course-outline {
  margin-bottom: 1.5rem;
}

.course-outline h4 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.outline-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.outline-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
}

.outline-num {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--primary);
}

.outline-text {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.detail-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
}

.detail-price {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.detail-price .current {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 2rem;
  font-weight: 700;
  color: var(--primary);
}

.detail-price .original {
  font-size: 1rem;
  color: var(--text-muted);
  text-decoration: line-through;
}

.btn-enroll-large {
  background: var(--gradient-1);
  color: var(--bg-dark);
  border: none;
  padding: 1rem 2rem;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-enroll-large:hover {
  transform: scale(1.02);
  box-shadow: 0 8px 30px var(--primary-glow);
}

/* Enroll Info */
.enroll-info, .success-info {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  text-align: left;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
}

.info-row .label {
  color: var(--text-secondary);
}

.info-row .value {
  font-weight: 500;
}

.info-row.total {
  border-top: 1px solid var(--border);
  padding-top: 0.75rem;
  margin-top: 0.25rem;
}

.info-row .value.price {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.25rem;
  color: var(--primary);
}

@media (max-width: 768px) {
  .courses-page {
    padding: 0 1.5rem 3rem;
  }
  
  .page-header h1 {
    font-size: 2rem;
  }
  
  .courses-grid {
    grid-template-columns: 1fr;
  }
  
  .outline-list {
    grid-template-columns: 1fr;
  }
}
</style>


<style scoped>
/* My Courses Modal Styles */
.my-courses-content { margin: -20px -24px; }
.my-courses-list { max-height: 400px; overflow-y: auto; padding: 1rem 1.5rem; }
.my-course-card { display: flex; align-items: center; gap: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 12px; padding: 1rem; margin-bottom: 0.75rem; }
.course-icon-small { font-size: 2rem; width: 50px; height: 50px; background: var(--bg-card-hover); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
.course-info-main { flex: 1; }
.course-info-main h4 { font-size: 0.95rem; font-weight: 500; margin-bottom: 0.25rem; }
.course-info-main p { font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem; }
.course-progress { display: flex; align-items: center; gap: 0.5rem; }
.progress-bar { flex: 1; height: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--primary); border-radius: 2px; transition: width 0.3s; }
.course-progress span { font-size: 0.75rem; color: var(--text-muted); min-width: 30px; }
.btn-study { background: var(--gradient-1); border: none; color: var(--bg-dark); padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.3s; }
.btn-study:hover { box-shadow: 0 4px 15px var(--primary-glow); }
.courses-empty { padding: 3rem; text-align: center; color: var(--text-muted); }
.courses-empty .empty-icon { font-size: 3rem; margin-bottom: 0.5rem; opacity: 0.5; }
</style>