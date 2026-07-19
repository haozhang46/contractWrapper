import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { PageDefinition, FormField } from '../../../../libs/harness-headless-connect/src/types.js'

// ── Types ──────────────────────────────────────────────

interface DayTask {
  number: number
  title: string
  items: string[]
}

interface CompletionState {
  /** day number -> completed task indices (0-based) */
  [day: number]: { completed: number[]; note: string }
}

interface CalendarDay {
  date: string // "07/20"
  dayNumber: number // 1-63 (relative to start)
  phase: string
  weekLabel: string
  title: string
  items: string[]
}

// ── Calendar Data ──────────────────────────────────────
// Start date: 2026-07-20

const START_DATE = new Date(2026, 6, 20) // month is 0-based

const CALENDAR_DAYS: CalendarDay[] = [
  // ── Phase 0: Math + Python ──
  { date: '07/20', dayNumber: 1, phase: '打底数学', weekLabel: '第 1 周', title: '向量基础', items: ['向量加减法', '向量点积（相似度）', '手算练习'] },
  { date: '07/21', dayNumber: 2, phase: '打底数学', weekLabel: '第 1 周', title: '矩阵基础', items: ['矩阵乘法 W@X', '维度变换 (N)→(D)', '手算 3×2 × 2维'] },
  { date: '07/22', dayNumber: 3, phase: '打底数学', weekLabel: '第 1 周', title: '激活函数', items: ['ReLU 分段函数', 'Sigmoid S 曲线', 'GELU 近似式', '线性 vs 非线性'] },
  { date: '07/23', dayNumber: 4, phase: 'Python 数值计算', weekLabel: '第 1 周', title: 'numpy 环境 + 展平', items: ['装好 numpy', '4×4 灰度图 → 16 维向量', '归一化像素值'] },
  { date: '07/24', dayNumber: 5, phase: 'Python 数值计算', weekLabel: '第 1 周', title: '手写线性层 + ReLU', items: ['随机 W(8×16), b(8,)', 'Z = W@X + b', 'ReLU 逐元素', '16维→8维特征向量'] },
  { date: '07/25', dayNumber: 6, phase: 'Python 数值计算', weekLabel: '第 1 周', title: '余弦相似度', items: ['cos(A,B) 公式', '帧间 4×4 块特征对比', '完整代码输出'] },
  { date: '07/26', dayNumber: 7, phase: '复习', weekLabel: '第 1 周', title: '复习 & 整合', items: ['整合代码加注释', '回顾像素→特征向量链路', '弹性补进度'] },

  // ── Phase 1: Basic Neural Network ──
  { date: '07/27', dayNumber: 8, phase: '基础神经网络', weekLabel: '第 2 周', title: '单层→多层网络', items: ['线性+激活循环堆叠', 'forward(x, W_list, b_list)'] },
  { date: '07/28', dayNumber: 9, phase: '基础神经网络', weekLabel: '第 2 周', title: '升维/降维实验', items: ['16→32→16 维度实验', '宽层=更多特征通道'] },
  { date: '07/29', dayNumber: 10, phase: '基础神经网络', weekLabel: '第 2 周', title: '概念区分', items: ['线性层 vs 激活层', '浮空=非法区概念'] },
  { date: '07/30', dayNumber: 11, phase: '基础神经网络', weekLabel: '第 2 周', title: '损失函数 MSE', items: ['MSE 均方误差', '手动算 MSE', '坏画面被扣分'] },
  { date: '07/31', dayNumber: 12, phase: '基础神经网络', weekLabel: '第 2 周', title: '分块 Patch', items: ['大图→4×4 小块', '批量过线性层', '16×16→16个块'] },
  { date: '08/01', dayNumber: 13, phase: '基础神经网络', weekLabel: '第 2 周', title: '运动网络开工', items: ['前后帧 4×4 输入', '网络骨架搭建'] },
  { date: '08/02', dayNumber: 14, phase: '基础神经网络', weekLabel: '第 2 周', title: '运动网络完成', items: ['输出 h(高度) v(速度)', '浮空判断', '✅ 阶段验收'] },

  { date: '08/03', dayNumber: 15, phase: '基础神经网络', weekLabel: '第 3 周', title: '扩展输入', items: ['4×4→8×8', '感受计算量变化'] },
  { date: '08/04', dayNumber: 16, phase: '基础神经网络', weekLabel: '第 3 周', title: '批量测试', items: ['合成数据生成', '批量推理'] },
  { date: '08/05', dayNumber: 17, phase: '基础神经网络', weekLabel: '第 3 周', title: '多物体运动', items: ['特征叠加处理', '边界情况'] },
  { date: '08/06', dayNumber: 18, phase: '基础神经网络', weekLabel: '第 3 周', title: '特征可视化', items: ['画出特征向量', '观察运动模式'] },
  { date: '08/07', dayNumber: 19, phase: '基础神经网络', weekLabel: '第 3 周', title: '复习整理', items: ['整理代码到 notebook'] },
  { date: '08/08', dayNumber: 20, phase: '弹性', weekLabel: '第 3 周', title: '弹性补进度', items: ['补进度 / 休息'] },
  { date: '08/09', dayNumber: 21, phase: '弹性', weekLabel: '第 3 周', title: '预习 Transformer', items: ['补进度 / 预习背景'] },

  // ── Phase 2: Self-Attention & Transformer ──
  { date: '08/10', dayNumber: 22, phase: 'Transformer', weekLabel: '第 4 周', title: '前提明确', items: ['Transformer 输入=DL特征向量', '回顾前置流水线'] },
  { date: '08/11', dayNumber: 23, phase: 'Transformer', weekLabel: '第 4 周', title: 'Q/K/V 线性层', items: ['Q=Wq@X', 'K=Wk@X', 'V=Wv@X'] },
  { date: '08/12', dayNumber: 24, phase: 'Transformer', weekLabel: '第 4 周', title: '自注意力核心', items: ['softmax(Q@K^T/√d)@V', '手算 2 个 4 维向量'] },
  { date: '08/13', dayNumber: 25, phase: 'Transformer', weekLabel: '第 4 周', title: '完整自注意力代码', items: ['N 个 Patch→全局融合', '验证注意力权重'] },
  { date: '08/14', dayNumber: 26, phase: 'Transformer', weekLabel: '第 4 周', title: '时序注意力', items: ['多帧特征拼接', '注意力约束运动连贯'] },
  { date: '08/15', dayNumber: 27, phase: 'Transformer', weekLabel: '第 4 周', title: 'Transformer Block', items: ['残差连接+层归一化+GELU', '包装成 Block'] },
  { date: '08/16', dayNumber: 28, phase: 'Transformer', weekLabel: '第 4 周', title: '实操项目', items: ['所有 Patch 自注意力', '人物-地面约束', '对比有无注意力'] },

  { date: '08/17', dayNumber: 29, phase: 'Transformer', weekLabel: '第 5 周', title: '多帧时序', items: ['多帧注意力', '绑定前后帧运动'] },
  { date: '08/18', dayNumber: 30, phase: 'Transformer', weekLabel: '第 5 周', title: 'Multi-Head', items: ['single→multi-head', '观察效果'] },
  { date: '08/19', dayNumber: 31, phase: 'Transformer', weekLabel: '第 5 周', title: '位置编码', items: ['Patch 位置信息概念', 'sin/cos 编码'] },
  { date: '08/20', dayNumber: 32, phase: 'Transformer', weekLabel: '第 5 周', title: '位置编码实现', items: ['可学习位置编码', '写入代码'] },
  { date: '08/21', dayNumber: 33, phase: 'Transformer', weekLabel: '第 5 周', title: '完整跑通', items: ['Patch→位置编码→4层Transformer'] },
  { date: '08/22', dayNumber: 34, phase: '复习', weekLabel: '第 5 周', title: '复习整理', items: ['整理笔记', '复习'] },
  { date: '08/23', dayNumber: 35, phase: '复习', weekLabel: '第 5 周', title: '阶段验收', items: ['✅ 自注意力消除局部撕裂'] },

  // ── Phase 3: Diffusion / DiT ──
  { date: '08/24', dayNumber: 36, phase: 'Diffusion', weekLabel: '第 6 周', title: '扩散核心逻辑', items: ['前向加噪', '反向去噪', '模型学去噪'] },
  { date: '08/25', dayNumber: 37, phase: 'Diffusion', weekLabel: '第 6 周', title: '前向加噪代码', items: ['x₀→x₁→...→x_T', '逐步加高斯噪声'] },
  { date: '08/26', dayNumber: 38, phase: 'Diffusion', weekLabel: '第 6 周', title: 'UNet vs DiT', items: ['UNet 局部卷积', 'DiT 卷积+Transformer'] },
  { date: '08/27', dayNumber: 39, phase: 'Diffusion', weekLabel: '第 6 周', title: 'DiT 核心', items: ['替换中间层为 Transformer', '全局约束优势'] },
  { date: '08/28', dayNumber: 40, phase: 'Diffusion', weekLabel: '第 6 周', title: '时序条件', items: ['上帧特征拼当前帧', '"看过上一帧"'] },
  { date: '08/29', dayNumber: 41, phase: 'Diffusion', weekLabel: '第 6 周', title: '运动偏移 dx/dy', items: ['显式控制物体移动', '方向分支'] },
  { date: '08/30', dayNumber: 42, phase: 'Diffusion', weekLabel: '第 6 周', title: '物理损失', items: ['惩罚浮空/穿墙/突变', 'L_physics 概念'] },

  { date: '08/31', dayNumber: 43, phase: 'Diffusion', weekLabel: '第 7 周', title: 'DiT 项目开工', items: ['4×4 小块编码', 'Transformer 约束', '单帧生成'] },
  { date: '09/01', dayNumber: 44, phase: 'Diffusion', weekLabel: '第 7 周', title: '时间步嵌入', items: ['timestep embedding', '知道去噪到哪步'] },
  { date: '09/02', dayNumber: 45, phase: 'Diffusion', weekLabel: '第 7 周', title: '去噪循环', items: ['x_T→x_{T-1}→...→x₀', '完整单帧'] },
  { date: '09/03', dayNumber: 46, phase: 'Diffusion', weekLabel: '第 7 周', title: '逐帧生成', items: ['for 循环', '每帧以上帧为条件'] },
  { date: '09/04', dayNumber: 47, phase: 'Diffusion', weekLabel: '第 7 周', title: '特征缓存', items: ['缓存上帧特征', '传入当前帧 DiT'] },
  { date: '09/05', dayNumber: 48, phase: 'Diffusion', weekLabel: '第 7 周', title: '物理损失实战', items: ['加物理损失项', '对比崩坏率'] },
  { date: '09/06', dayNumber: 49, phase: 'Diffusion', weekLabel: '第 7 周', title: '10 帧视频', items: ['完整 10 帧生成', '✅ 无崩坏验收'] },

  { date: '09/07', dayNumber: 50, phase: 'Diffusion', weekLabel: '第 8 周', title: '噪声步数调节', items: ['T 步数 trade-off', '质量 vs 速度'] },
  { date: '09/08', dayNumber: 51, phase: 'Diffusion', weekLabel: '第 8 周', title: 'CFG 概念', items: ['Classifier-Free Guidance', '无条件+条件混合'] },
  { date: '09/09', dayNumber: 52, phase: 'Diffusion', weekLabel: '第 8 周', title: 'CFG 实现', items: ['写 CFG 采样代码'] },
  { date: '09/10', dayNumber: 53, phase: '弹性', weekLabel: '第 8 周', title: '弹性补进度', items: ['补进度/复习'] },
  { date: '09/11', dayNumber: 54, phase: '弹性', weekLabel: '第 8 周', title: '弹性补进度', items: ['反复跑通视频生成'] },
  { date: '09/12', dayNumber: 55, phase: '弹性', weekLabel: '第 8 周', title: '弹性补进度', items: ['复习 Diffusion'] },
  { date: '09/13', dayNumber: 56, phase: '弹性', weekLabel: '第 8 周', title: '弹性补进度', items: ['复习 / 补漏'] },

  // ── Phase 4: Engineering ──
  { date: '09/14', dayNumber: 57, phase: '工程落地', weekLabel: '第 9 周', title: 'PyTorch 基础', items: ['nn.Linear, nn.ReLU', 'numpy→PyTorch 对照'] },
  { date: '09/15', dayNumber: 58, phase: '工程落地', weekLabel: '第 9 周', title: 'OpenCV 视频', items: ['读取视频、切帧', '→Patch 矩阵'] },
  { date: '09/16', dayNumber: 59, phase: '工程落地', weekLabel: '第 9 周', title: '推理调度', items: ['for 帧循环', '特征缓存复用'] },
  { date: '09/17', dayNumber: 60, phase: '工程落地', weekLabel: '第 9 周', title: '轻量化', items: ['裁剪特征维度', '速度 vs 质量对比'] },
  { date: '09/18', dayNumber: 61, phase: '工程落地', weekLabel: '第 9 周', title: '工具栈整合', items: ['Python+PyTorch+OpenCV+FFmpeg', '完整 pipeline'] },
  { date: '09/19', dayNumber: 62, phase: '复习', weekLabel: '第 9 周', title: '整体复习', items: ['整理项目代码', '全链路贯通'] },
  { date: '09/20', dayNumber: 63, phase: '复习', weekLabel: '第 9 周', title: '🎉 结业', items: ['复习总结', '🎉 从像素到视频生成'] },
]

// ── State Persistence ──────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..')

function getStatePath(): string {
  return join(PROJECT_ROOT, '.harness', 'learning-calendar.json')
}

function readState(): CompletionState {
  const path = getStatePath()
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as CompletionState
  } catch {
    return {}
  }
}

function writeState(state: CompletionState): void {
  const path = getStatePath()
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(state, null, 2), 'utf-8')
}

// ── Helpers ────────────────────────────────────────────

function getTodayDayNumber(): number {
  const now = new Date()
  const diff = now.getTime() - START_DATE.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  return Math.max(1, Math.min(63, days + 1))
}

function getDayData(dayNumber: number): CalendarDay | undefined {
  return CALENDAR_DAYS.find(d => d.dayNumber === dayNumber)
}

function formatTasks(day: CalendarDay, completed: number[]): string {
  let md = `## Day ${day.dayNumber} — ${day.date}\n`
  md += `**${day.phase}** · ${day.weekLabel}\n\n`
  md += `### ${day.title}\n\n`
  day.items.forEach((item, i) => {
    const done = completed.includes(i) ? '✅' : '⬜'
    md += `- ${done} ${item}\n`
  })
  return md
}

function formatProgress(): string {
  const state = readState()
  const completedDays = new Set(Object.keys(state).map(Number))
  const total = CALENDAR_DAYS.length
  const done = completedDays.size
  const pct = Math.round((done / total) * 100)

  // Phase breakdown
  const phases: { name: string; days: number[] }[] = [
    { name: '打底数学+Python', days: [1,2,3,4,5,6,7] },
    { name: '基础神经网络', days: [8,9,10,11,12,13,14,15,16,17,18,19,20,21] },
    { name: 'Transformer', days: [22,23,24,25,26,27,28,29,30,31,32,33,34,35] },
    { name: 'Diffusion/DiT', days: [36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56] },
    { name: '工程落地', days: [57,58,59,60,61,62,63] },
  ]

  let md = `## 📊 学习进度\n\n`
  md += `**总进度**: ${done}/${total} 天完成 (${pct}%)\n\n`
  md += `| 阶段 | 进度 |\n|------|------|\n`
  for (const p of phases) {
    const phaseDone = p.days.filter(d => completedDays.has(d)).length
    const phaseTotal = p.days.length
    const barLen = 10
    const filled = Math.round((phaseDone / phaseTotal) * barLen)
    const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled)
    md += `| ${p.name} | ${bar} ${phaseDone}/${phaseTotal} |\n`
  }
  md += `\n**里程碑**:\n`
  const milestones: [number, string][] = [
    [7, '✅ 阶段 0: 像素→特征向量'],
    [21, '✅ 阶段 1: 运动网络 h/v+浮空'],
    [35, '✅ 阶段 2: 自注意力消除撕裂'],
    [56, '✅ 阶段 3: 视频无崩坏'],
    [63, '🎉 全路径完成'],
  ]
  for (const [threshold, label] of milestones) {
    if (done >= threshold) {
      md += `- ${label}\n`
    } else {
      const remain = threshold - done
      md += `- ⏳ 还剩 ${remain} 天 → ${label}\n`
    }
  }
  return md
}

// ── Local Page Definitions ─────────────────────────────

export const learningCalendarPages: PageDefinition[] = [
  {
    id: 'learning-today',
    description: '查看今天的学习任务',
    pageid: 'learning.today',
    prompt: '用户想查看今天的学习任务。显示今天的日期、Day N、任务列表及完成状态。',
    schema: {
      form: [
        {
          name: 'action',
          label: '操作',
          type: 'select',
          required: true,
          defaultValue: 'view',
          options: [
            { label: '查看今日任务', value: 'view' },
            { label: '查看进度总览', value: 'progress' },
          ],
        },
      ],
      request: {
        method: 'POST',
        url: '/api/headless/pages/learning-today/execute',
      },
    },
  },
  {
    id: 'learning-checkin',
    description: '打卡完成今天的学习任务',
    pageid: 'learning.checkin',
    prompt: '用户想标记今天的学习任务已完成。帮助用户打卡。',
    schema: {
      form: [
        {
          name: 'day',
          label: 'Day 编号',
          type: 'number',
          required: true,
          placeholder: '留空则默认为今天',
        },
        {
          name: 'task_numbers',
          label: '已完成的任务编号（逗号分隔）',
          type: 'text',
          required: true,
          placeholder: '例如: 0,1,2',
        },
        {
          name: 'note',
          label: '学习笔记/疑问（可选）',
          type: 'text',
          required: false,
          placeholder: '今天学到了什么？',
        },
      ],
      request: {
        method: 'POST',
        url: '/api/headless/pages/learning-checkin/execute',
      },
    },
  },
  {
    id: 'learning-progress',
    description: '查看完整学习进度',
    pageid: 'learning.progress',
    prompt: '用户想查看 AI 视频模型学习路径的完整进度。显示进度条、阶段完成情况和里程碑。',
    schema: {
      form: [
        {
          name: 'view',
          label: '查看总览',
          type: 'boolean',
          defaultValue: true,
        },
      ],
      request: {
        method: 'POST',
        url: '/api/headless/pages/learning-progress/execute',
      },
    },
  },
]

// ── Page Metadata (for list endpoint) ──────────────────

export function getLearningPagesMeta(): Array<{
  id: string
  description: string
  pageid: string
  hasSchema: boolean
}> {
  return learningCalendarPages.map(p => ({
    id: p.id,
    description: p.description,
    pageid: p.pageid,
    hasSchema: !!p.schema,
  }))
}

// ── Schema ─────────────────────────────────────────────

export function getLearningPageSchema(pageId: string): object | null {
  const page = learningCalendarPages.find(p => p.id === pageId)
  if (!page?.schema) return null
  return { id: page.id, pageid: page.pageid, description: page.description, schema: page.schema }
}

// ── Execute ────────────────────────────────────────────

export function executeLearningPage(pageId: string, formData: Record<string, unknown>): object {
  switch (pageId) {
    case 'learning-today': {
      const action = String(formData.action ?? 'view')
      if (action === 'progress') {
        return { status: 'ok', type: 'markdown', content: formatProgress() }
      }
      const dayNum = getTodayDayNumber()
      const day = getDayData(dayNum)
      if (!day) return { status: 'error', message: `Day ${dayNum} 不在学习日历范围内（1-63）` }
      const state = readState()
      const completed = state[dayNum]?.completed ?? []
      const note = state[dayNum]?.note ?? ''
      const md = formatTasks(day, completed) + (note ? `\n---\n📝 笔记: ${note}\n` : '')
      return { status: 'ok', type: 'markdown', content: md }
    }

    case 'learning-checkin': {
      const dayNum = Number(formData.day) || getTodayDayNumber()
      const day = getDayData(dayNum)
      if (!day) return { status: 'error', message: `Day ${dayNum} 不在学习日历范围内（1-63）` }

      const taskStr = String(formData.task_numbers ?? '')
      const taskIndices = taskStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
      const validIndices = taskIndices.filter(i => i >= 0 && i < day.items.length)

      if (validIndices.length === 0) {
        return { status: 'error', message: '请提供有效的任务编号（从 0 开始）' }
      }

      const state = readState()
      const existing = state[dayNum]?.completed ?? []
      const merged = [...new Set([...existing, ...validIndices])].sort()
      const note = String(formData.note ?? state[dayNum]?.note ?? '')

      state[dayNum] = { completed: merged, note }
      writeState(state)

      const total = day.items.length
      const done = merged.length
      const md = `## ✅ Day ${dayNum} 打卡成功！\n\n` +
        `今日完成: ${done}/${total} 项任务\n\n` +
        formatTasks(day, merged) +
        (note ? `\n---\n📝 笔记: ${note}\n` : '')
      return { status: 'ok', type: 'markdown', content: md }
    }

    case 'learning-progress': {
      return { status: 'ok', type: 'markdown', content: formatProgress() }
    }

    default:
      return { status: 'error', message: `未知页面: ${pageId}` }
  }
}
