/**
 * FishCRM AI 解析引擎（自然语言 / 无障碍抓屏文本 → 结构化落库）
 *
 * 双通道：
 * 1. 远端通道：OpenAI 兼容接口（API Key / BaseURL 存 localStorage，仅本服务可读写）
 * 2. 本地兜底：未配置 API Key 或远端失败时，使用正则规则解析中文口语，
 *    覆盖「给张三随礼500」「李四请吃饭花了200，他会修电脑」「王五最近想换工作」等句式。
 *
 * 落库统一经由 useCrmStore.applyAiParsedResult（组件不直接调用本服务的存储细节）。
 */
import type { AiApplyOutcome } from '@/services/dbService'
import { useCrmStore } from '@/store/useCrmStore'
import type { AiParsedResult, Person, RecordType } from '@/types/schema'

// ---------- 配置存取（服务层专属，组件禁止直接碰 localStorage） ----------
export interface AiConfig {
  baseUrl: string
  apiKey: string
  model: string
}

const CONFIG_KEY = 'fishcrm.ai.config.v1'

const DEFAULT_CONFIG: AiConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
}

export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<AiConfig>) }
  } catch {
    // 配置损坏时回落默认
  }
  return { ...DEFAULT_CONFIG }
}

export function saveAiConfig(config: AiConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

// ---------- 远端通道 ----------
const SYSTEM_PROMPT = `你是 FishCRM 人际关系管理软件的结构化解析器。用户会给你一句话，或一段微信无障碍抓屏文本（每行可能带 [Y:top, X:left] 或 [Y, X] 坐标前缀，需忽略坐标）。
请严格输出 JSON（不要输出任何其他文字），结构如下：
{
  "shouldRecord": boolean,        // 是否值得落库（纯闲聊为 false）
  "personName": string,           // 识别到的人物名（原文中的称呼/别名原样保留）
  "personStatus": "active" | "cutoff" | "deceased",   // 可选，缺省 active
  "newSkills": string[],          // 可选，识别到的人物技能标签
  "record": {                     // 可选，识别到的一条流水
    "type": "idea" | "gift" | "ledger",
    "amount": number,             // 收入/收到为正，支出/送出为负，想法为 0
    "itemTitle": string,          // 条目名，简短
    "eventDate": "YYYY-MM-DD"     // 相对日期（如"昨天"）请换算为绝对日期
  },
  "relationHint": {               // 可选，识别到的人物关系线索
    "targetPersonName": string,
    "relationLabel": string       // 如 发小 / 同事 / 客户
  }
}
规则：
- 礼物、随礼、份子钱 → type=gift，金额为负（送出）或正（收到）
- 吃饭请客、借款、转账等金钱往来 → type=ledger
- 想法、计划、动态（想换工作、打算结婚等）→ type=idea，amount=0
- "他会修电脑"这类描述 → 提取到 newSkills
- 金额缺单位时按元处理；"万"=×10000，"k"=×1000`

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>
}

/** 清洗远端 JSON，保证符合 AiParsedResult 契约 */
function sanitizeParsed(raw: unknown): AiParsedResult {
  const obj = (raw ?? {}) as Record<string, unknown>
  const result: AiParsedResult = {
    shouldRecord: Boolean(obj.shouldRecord),
    personName: typeof obj.personName === 'string' ? obj.personName.trim() : '',
  }
  if (obj.personStatus === 'active' || obj.personStatus === 'cutoff' || obj.personStatus === 'deceased') {
    result.personStatus = obj.personStatus
  }
  if (Array.isArray(obj.newSkills)) {
    result.newSkills = obj.newSkills.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
  }
  const rec = obj.record as Record<string, unknown> | undefined
  if (rec && typeof rec === 'object') {
    const type = rec.type === 'idea' || rec.type === 'gift' || rec.type === 'ledger' ? rec.type : 'ledger'
    const amount = typeof rec.amount === 'number' && Number.isFinite(rec.amount) ? rec.amount : 0
    const itemTitle = typeof rec.itemTitle === 'string' && rec.itemTitle.trim() ? rec.itemTitle.trim() : 'AI 识别条目'
    const eventDate = typeof rec.eventDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rec.eventDate)
      ? rec.eventDate
      : todayStr()
    result.record = { type, amount, itemTitle, eventDate }
  }
  const hint = obj.relationHint as Record<string, unknown> | undefined
  if (hint && typeof hint === 'object' && typeof hint.targetPersonName === 'string' && hint.targetPersonName.trim()) {
    result.relationHint = {
      targetPersonName: hint.targetPersonName.trim(),
      relationLabel: typeof hint.relationLabel === 'string' && hint.relationLabel.trim() ? hint.relationLabel.trim() : '认识',
    }
  }
  return result
}

async function callRemote(text: string, config: AiConfig): Promise<AiParsedResult> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
    }),
  })
  if (!res.ok) throw new Error(`AI 接口请求失败：HTTP ${res.status}`)
  const data = (await res.json()) as ChatCompletionResponse
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('AI 接口未返回内容')
  return sanitizeParsed(JSON.parse(content))
}

// ---------- 本地正则兜底解析器 ----------
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function todayStr(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 无障碍抓屏坐标前缀：兼容 `[Y:top, X:left]` 与旧版 `[Y, X]` 两种格式 */
const SCREEN_COORD_RE = /\[\s*(?:Y\s*:\s*)?\d+\s*,\s*(?:X\s*:\s*)?\d+\s*\]/

/** 剥离无障碍抓屏文本中的坐标前缀 */
function stripCoords(text: string): string {
  return text.replace(new RegExp(SCREEN_COORD_RE.source, 'g'), ' ').replace(/\s+/g, ' ').trim()
}

const INCOME_WORDS = ['收到', '还我', '还给我', '归还', '退回', '报销', '转我', '转给我', '收款', '入账', '发了工资']
const EXPENSE_WORDS = ['随礼', '份子', '请客', '请吃', '花了', '送出', '送了', '送', '买给', '借给', '转账给', '转给', '买单', '垫付', '发红包']
const GIFT_WORDS = ['随礼', '份子', '礼物', '红包', '伴手礼']
const IDEA_WORDS = ['想', '打算', '计划', '考虑', '准备要']
const RELATION_WORDS = ['发小', '同学', '同事', '亲戚', '朋友', '客户', '闺蜜', '兄弟', '哥们', '邻居', '老乡', '战友']

/** 从文本中定位人物：优先匹配库里已有姓名/别名，否则按口语句式抽取 */
function extractPersonName(text: string, knownPersons: Person[]): string {
  for (const p of knownPersons) {
    const candidates = [p.name, ...p.aliases]
    for (const c of candidates) {
      if (c && text.includes(c)) return p.name
    }
  }
  const patterns = [
    /给([\u4e00-\u9fa5]{2,4})(?:随|送|买|转|借|包)/, // 给张三随礼…
    /和([\u4e00-\u9fa5]{2,4})(?:吃|逛|聚|聊)/, // 和张三吃饭…
    /([\u4e00-\u9fa5]{2,4})(?:请|说|最近|想|打算|会|擅长|是|发|转)/, // 李四请吃饭… / 王五最近想…
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1] && !['他', '她', '我', '你', '大家', '朋友'].includes(m[1])) return m[1]
  }
  return ''
}

/** 金额抽取：支持 500 / 500块 / 200元 / 1万 / 2k */
function extractAmount(text: string): number {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(万|块|元|块钱|k|K)?/)
  if (!m) return 0
  let value = Number.parseFloat(m[1])
  if (m[2] === '万') value *= 10000
  if (m[2] === 'k' || m[2] === 'K') value *= 1000
  return Math.round(value * 100) / 100
}

function extractSkills(text: string): string[] {
  const skills: string[] = []
  const re = /(?:会|擅长|精通)([\u4e00-\u9fa5A-Za-z]{2,8})/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const skill = m[1].replace(/[的了呢吧啊哦].*$/, '')
    if (skill && !skills.includes(skill)) skills.push(skill)
  }
  return skills
}

function extractRelationHint(text: string, personName: string): AiParsedResult['relationHint'] {
  for (const word of RELATION_WORDS) {
    // “张三是我发小” / “他是我同事”
    const re = new RegExp(`(?:${personName}|[他她])是我(?:的)?${word}`)
    if (re.test(text)) return { targetPersonName: '我', relationLabel: word }
    // “我发小张三”
    const re2 = new RegExp(`我(?:的)?${word}(${personName})`)
    if (re2.test(text)) return { targetPersonName: '我', relationLabel: word }
  }
  return undefined
}

function pickItemTitle(text: string, type: RecordType, personName: string): string {
  if (type === 'gift') {
    if (text.includes('随礼')) return '随礼'
    if (text.includes('份子')) return '份子钱'
    if (text.includes('红包')) return '红包'
    return '礼物'
  }
  if (type === 'ledger') {
    if (text.includes('请吃') || text.includes('请客')) return '请客吃饭'
    if (text.includes('借')) return '借款往来'
    if (text.includes('报销')) return '报销'
  }
  const cleaned = text.replace(/[，。！？,.!?]/g, ' ').trim()
  return cleaned.length > 20 ? `${cleaned.slice(0, 20)}…` : cleaned || `${personName} 的动态`
}

/**
 * 本地规则解析（无 API Key 时的兜底通道）
 * 覆盖：随礼/份子、请客吃饭、借款归还、技能提取、想法动态、关系线索
 */
export function localParse(rawText: string, knownPersons: Person[]): AiParsedResult {
  const text = stripCoords(rawText)
  const personName = extractPersonName(text, knownPersons)
  const result: AiParsedResult = { shouldRecord: false, personName }
  if (!personName) return result

  const skills = extractSkills(text)
  if (skills.length) result.newSkills = skills

  const relationHint = extractRelationHint(text, personName)
  if (relationHint) result.relationHint = relationHint

  const hasGift = GIFT_WORDS.some((w) => text.includes(w))
  const hasIdea = IDEA_WORDS.some((w) => text.includes(w))
  const absAmount = extractAmount(text)
  const isIncome = INCOME_WORDS.some((w) => text.includes(w))
  const isExpense = EXPENSE_WORDS.some((w) => text.includes(w))

  let type: RecordType
  if (hasGift) type = 'gift'
  else if (absAmount > 0) type = 'ledger'
  else if (hasIdea) type = 'idea'
  else if (skills.length || relationHint) type = 'idea' // 仅技能/关系线索时记一条动态
  else return result // 什么都没识别到，不落库

  let amount = 0
  if (type !== 'idea') {
    amount = isIncome ? absAmount : -absAmount
    if (!isIncome && !isExpense) amount = -absAmount // 默认视为支出
  }

  const eventDate = text.includes('昨天') ? todayStr(-1) : text.includes('前天') ? todayStr(-2) : todayStr()

  result.shouldRecord = true
  result.record = {
    type,
    amount,
    itemTitle: pickItemTitle(text, type, personName),
    eventDate,
  }
  return result
}

// ---------- 对外主入口 ----------
export interface AiParseOutcome {
  parsed: AiParsedResult
  outcome: AiApplyOutcome
  /** true=本地兜底解析，false=远端 AI 解析 */
  usedFallback: boolean
}

/**
 * 解析并一键落库：
 * 1. 已配置 API Key → 走远端 OpenAI 兼容接口，失败自动降级本地规则
 * 2. 未配置 → 直接本地规则解析
 * 解析不出人物时抛错，不产生任何写入
 */
export async function parseAndApply(rawText: string): Promise<AiParseOutcome> {
  const text = rawText.trim()
  if (!text) throw new Error('请输入要识别的内容')

  const crm = useCrmStore()
  const config = loadAiConfig()

  let parsed: AiParsedResult
  let usedFallback = false
  if (config.apiKey) {
    try {
      parsed = await callRemote(text, config)
    } catch {
      parsed = localParse(text, crm.persons)
      usedFallback = true
    }
  } else {
    parsed = localParse(text, crm.persons)
    usedFallback = true
  }

  if (!parsed.personName) {
    throw new Error('未能识别出人物，请补充人名后重试')
  }

  // 抓屏文本（含 [Y,X] 坐标）标记为无障碍来源，普通一句话标记为手动
  const source = SCREEN_COORD_RE.test(rawText) ? 'accessibility_ai' : 'manual'
  const outcome = crm.applyAiParsedResult(parsed, text, source)
  return { parsed, outcome, usedFallback }
}
