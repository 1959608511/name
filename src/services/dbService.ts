/**
 * FishCRM 数据服务层（唯一直接触达存储的模块）
 *
 * 持久化介质：localStorage（单 key 存储整库快照）。
 * 上层一律通过 useCrmStore 调用本模块，组件严禁直接访问。
 */
import type {
  AiParsedResult,
  CalendarDaySummary,
  CrmRecord,
  Person,
  PersonStatus,
  RecordSource,
  RecordType,
  RelationEdge,
} from '@/types/schema'

interface DbShape {
  persons: Person[]
  records: CrmRecord[]
  relations: RelationEdge[]
}

export interface PersonFilter {
  status?: PersonStatus
  hasSkill?: string
  keyword?: string
}

export interface RecordFilter {
  type?: RecordType
  /** 精确日期 YYYY-MM-DD */
  date?: string
  /** 月份 YYYY-MM */
  month?: string
  personId?: string
}

export interface GraphData {
  nodes: Array<{ id: string; name: string; status: PersonStatus }>
  edges: RelationEdge[]
}

export interface AiApplyOutcome {
  person: Person
  createdPerson: boolean
  record?: CrmRecord
  relation?: RelationEdge
}

const STORAGE_KEY = 'fishcrm.db.v1'

let db: DbShape | null = null

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** 以“今天”为基准生成当月某天的 YYYY-MM-DD */
function dayOfCurrentMonth(day: number): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(day)}`
}

function buildMockDb(): DbShape {
  const base = Date.now()
  const persons: Person[] = [
    {
      id: 'p1',
      name: '王芳',
      aliases: ['老妈', '妈'],
      status: 'active',
      skills: ['烹饪', '理财'],
      tags: ['家人'],
      phone: '13812345678',
      birthday: '1965-03-12',
      note: '母亲，重阳节记得送礼物',
      createdAt: base - 60_000,
    },
    {
      id: 'p2',
      name: '李建国',
      aliases: ['老爸'],
      status: 'active',
      skills: ['木工', '钓鱼'],
      tags: ['家人'],
      phone: '13987654321',
      birthday: '1963-11-02',
      note: '父亲，最近腰不太好',
      createdAt: base - 50_000,
    },
    {
      id: 'p3',
      name: '张伟',
      aliases: ['伟哥'],
      status: 'active',
      skills: ['前端开发', '羽毛球'],
      tags: ['同事', '朋友'],
      phone: '13700001111',
      note: '前端组同事，大学室友',
      createdAt: base - 40_000,
    },
    {
      id: 'p4',
      name: '陈静',
      aliases: ['静静'],
      status: 'active',
      skills: ['摄影', '烘焙', '瑜伽'],
      tags: ['朋友'],
      birthday: '1994-10-08',
      note: '闺蜜，婚礼定在下个月',
      createdAt: base - 30_000,
    },
    {
      id: 'p5',
      name: '刘明',
      aliases: [],
      status: 'cutoff',
      skills: ['销售'],
      tags: ['前同事'],
      note: '2024 年借款未还，不再来往',
      createdAt: base - 20_000,
    },
    {
      id: 'p6',
      name: '赵德海',
      aliases: ['爷爷'],
      status: 'deceased',
      skills: ['书法'],
      tags: ['家人'],
      birthday: '1940-01-20',
      note: '祖父，2023 年冬离世',
      createdAt: base - 10_000,
    },
  ]

  const records: CrmRecord[] = [
    { id: 'r1', personId: 'p1', personName: '王芳', type: 'gift', amount: -299, itemTitle: '重阳节按摩仪', rawContent: '重阳节给老妈买的颈椎按摩仪', eventDate: dayOfCurrentMonth(1), source: 'manual', createdAt: base - 9_000 },
    { id: 'r2', personId: 'p1', personName: '王芳', type: 'ledger', amount: -2000, itemTitle: '给母亲生活费', rawContent: '每月固定转账', eventDate: dayOfCurrentMonth(3), source: 'manual', createdAt: base - 8_500 },
    { id: 'r3', personId: 'p3', personName: '张伟', type: 'idea', amount: 0, itemTitle: '张伟想转行 AI', rawContent: '午饭时张伟提到想换工作去做 AI 方向', eventDate: dayOfCurrentMonth(5), source: 'manual', createdAt: base - 8_000 },
    { id: 'r4', personId: 'p4', personName: '陈静', type: 'gift', amount: -158, itemTitle: '生日手工蛋糕', rawContent: '陈静生日，亲手做的巴斯克蛋糕材料费', eventDate: dayOfCurrentMonth(8), source: 'manual', createdAt: base - 7_500 },
    { id: 'r5', personId: 'p4', personName: '陈静', type: 'ledger', amount: -86, itemTitle: 'AA 聚餐', rawContent: '生日饭局 AA 均摊', eventDate: dayOfCurrentMonth(8), source: 'manual', createdAt: base - 7_000 },
    { id: 'r6', personId: 'p3', personName: '张伟', type: 'ledger', amount: 500, itemTitle: '张伟还借款', rawContent: '上月借的 500 元已归还', eventDate: dayOfCurrentMonth(12), source: 'manual', createdAt: base - 6_500 },
    { id: 'r7', personId: 'p2', personName: '李建国', type: 'idea', amount: 0, itemTitle: '给爸买人体工学椅', rawContent: '爸最近腰不好，想给他换把人体工学椅', eventDate: dayOfCurrentMonth(15), source: 'manual', createdAt: base - 6_000 },
    { id: 'r8', personId: 'p2', personName: '李建国', type: 'gift', amount: -129, itemTitle: '护腰带', rawContent: '先买个护腰带应应急', eventDate: dayOfCurrentMonth(18), source: 'manual', createdAt: base - 5_500 },
    { id: 'r9', personId: 'p5', personName: '刘明', type: 'ledger', amount: -3000, itemTitle: '历史欠款登记', rawContent: '2024 年借款 3000 元未还，登记备查', eventDate: dayOfCurrentMonth(20), source: 'manual', createdAt: base - 5_000 },
    { id: 'r10', personId: 'p4', personName: '陈静', type: 'idea', amount: 0, itemTitle: '准备婚礼份子钱', rawContent: '静静婚礼定在下个月，提前准备份子钱', eventDate: dayOfCurrentMonth(25), source: 'manual', createdAt: base - 4_500 },
  ]

  const relations: RelationEdge[] = [
    { id: 'e1', sourcePersonId: 'p1', targetPersonId: 'p2', relationLabel: '夫妻', weight: 5 },
    { id: 'e2', sourcePersonId: 'p2', targetPersonId: 'p6', relationLabel: '父子', weight: 5 },
    { id: 'e3', sourcePersonId: 'p3', targetPersonId: 'p4', relationLabel: '球友', weight: 3 },
    { id: 'e4', sourcePersonId: 'p4', targetPersonId: 'p1', relationLabel: '干女儿', weight: 3 },
    { id: 'e5', sourcePersonId: 'p3', targetPersonId: 'p5', relationLabel: '前同事', weight: 1 },
    { id: 'e6', sourcePersonId: 'p1', targetPersonId: 'p5', relationLabel: '远房亲戚', weight: 1 },
  ]

  return { persons, records, relations }
}

function persist(): void {
  if (!db) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

function load(): DbShape {
  if (db) return db
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DbShape
      if (Array.isArray(parsed.persons) && Array.isArray(parsed.records) && Array.isArray(parsed.relations)) {
        db = parsed
        return db
      }
    } catch {
      // 数据损坏时回退到 Mock 重建
    }
  }
  db = buildMockDb()
  persist()
  return db
}

/** 按姓名或别名（忽略大小写）查找人物 */
function findPersonByName(name: string): Person | undefined {
  const target = name.trim().toLowerCase()
  if (!target) return undefined
  return load().persons.find(
    (p) =>
      p.name.toLowerCase() === target ||
      p.aliases.some((a) => a.toLowerCase() === target),
  )
}

export const dbService = {
  /** 初始化：本地无数据时注入中文 Mock 数据 */
  init(): void {
    load()
  },

  getPersonsByFilter(filter: PersonFilter): Person[] {
    const { status, hasSkill, keyword } = filter
    const kw = keyword?.trim().toLowerCase()
    return load().persons.filter((p) => {
      if (status && p.status !== status) return false
      if (hasSkill && !p.skills.includes(hasSkill)) return false
      if (kw) {
        const haystack = [p.name, ...p.aliases, ...p.tags, ...p.skills, p.note ?? '', p.phone ?? '']
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(kw)) return false
      }
      return true
    })
  },

  /** 有 id 则更新，无 id（或 id 不存在）则新建 */
  upsertPerson(person: Partial<Person> & { name: string }): Person {
    const state = load()
    const existing = person.id ? state.persons.find((p) => p.id === person.id) : undefined
    if (existing) {
      Object.assign(existing, person, { id: existing.id, createdAt: existing.createdAt })
      persist()
      return existing
    }
    const created: Person = {
      id: uid('p'),
      name: person.name,
      aliases: person.aliases ?? [],
      status: person.status ?? 'active',
      skills: person.skills ?? [],
      tags: person.tags ?? [],
      phone: person.phone,
      birthday: person.birthday,
      note: person.note,
      createdAt: Date.now(),
    }
    state.persons.push(created)
    persist()
    return created
  },

  /** 删除人物，并级联删除其流水与关系 */
  deletePerson(id: string): void {
    const state = load()
    state.persons = state.persons.filter((p) => p.id !== id)
    state.records = state.records.filter((r) => r.personId !== id)
    state.relations = state.relations.filter(
      (e) => e.sourcePersonId !== id && e.targetPersonId !== id,
    )
    persist()
  },

  getRecordsByFilter(filter: RecordFilter): CrmRecord[] {
    const { type, date, month, personId } = filter
    return load()
      .records.filter((r) => {
        if (type && r.type !== type) return false
        if (date && r.eventDate !== date) return false
        if (month && !r.eventDate.startsWith(month)) return false
        if (personId && r.personId !== personId) return false
        return true
      })
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate) || b.createdAt - a.createdAt)
  },

  addRecord(record: Omit<CrmRecord, 'id' | 'createdAt' | 'personName'> & { personName?: string }): CrmRecord {
    const state = load()
    const person = state.persons.find((p) => p.id === record.personId)
    const created: CrmRecord = {
      ...record,
      personName: record.personName ?? person?.name ?? '未知人物',
      id: uid('r'),
      createdAt: Date.now(),
    }
    state.records.push(created)
    persist()
    return created
  },

  deleteRecord(id: string): void {
    const state = load()
    state.records = state.records.filter((r) => r.id !== id)
    persist()
  },

  /** 技能 → 人物列表 聚合（供 skills 模块使用） */
  getSkillsMap(): Record<string, Person[]> {
    const map: Record<string, Person[]> = {}
    for (const p of load().persons) {
      for (const skill of p.skills) {
        if (!map[skill]) map[skill] = []
        map[skill].push(p)
      }
    }
    return map
  },

  /** 按月聚合日历摘要（仅返回有事件的日期，按日期升序） */
  getCalendarSummary(yearMonth: string): CalendarDaySummary[] {
    const byDay = new Map<string, CalendarDaySummary>()
    for (const r of this.getRecordsByFilter({ month: yearMonth })) {
      let day = byDay.get(r.eventDate)
      if (!day) {
        day = { date: r.eventDate, totalEvents: 0, netAmount: 0, records: [] }
        byDay.set(r.eventDate, day)
      }
      day.totalEvents += 1
      day.netAmount += r.amount
      day.records.push(r)
    }
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))
  },

  getGraphData(): GraphData {
    const state = load()
    return {
      nodes: state.persons.map((p) => ({ id: p.id, name: p.name, status: p.status })),
      edges: state.relations.map((e) => ({ ...e })),
    }
  },

  /** 同一对人物之间只保留一条边（更新标签与权重） */
  upsertRelation(edge: Partial<RelationEdge> & { sourcePersonId: string; targetPersonId: string }): RelationEdge {
    const state = load()
    const existing =
      (edge.id && state.relations.find((e) => e.id === edge.id)) ||
      state.relations.find(
        (e) =>
          (e.sourcePersonId === edge.sourcePersonId && e.targetPersonId === edge.targetPersonId) ||
          (e.sourcePersonId === edge.targetPersonId && e.targetPersonId === edge.sourcePersonId),
      )
    if (existing) {
      existing.relationLabel = edge.relationLabel ?? existing.relationLabel
      existing.weight = edge.weight ?? existing.weight
      persist()
      return existing
    }
    const created: RelationEdge = {
      id: uid('e'),
      sourcePersonId: edge.sourcePersonId,
      targetPersonId: edge.targetPersonId,
      relationLabel: edge.relationLabel ?? '认识',
      weight: edge.weight ?? 3,
    }
    state.relations.push(created)
    persist()
    return created
  },

  /** 按 id 删除一条关系边 */
  deleteRelation(id: string): void {
    const state = load()
    state.relations = state.relations.filter((e) => e.id !== id)
    persist()
  },

  /**
   * AI 识别结果一键落库：
   * 1. 按姓名/别名匹配人物，匹配不到则新建（状态取 personStatus，缺省 active）
   * 2. 追加新技能标签（去重）
   * 3. shouldRecord 且含 record 时写入流水（rawContent = 原文）
   * 4. 含 relationHint 时补建/更新关系边（目标人物不存在也会新建）
   */
  applyAiParsedResult(result: AiParsedResult, rawText: string, source: RecordSource): AiApplyOutcome {
    let createdPerson = false
    let person = findPersonByName(result.personName)
    if (!person) {
      person = this.upsertPerson({
        name: result.personName,
        status: result.personStatus ?? 'active',
        note: `由 AI 识别创建：${rawText.slice(0, 50)}`,
      })
      createdPerson = true
    }

    if (result.newSkills?.length) {
      const merged = new Set([...person.skills, ...result.newSkills])
      person = this.upsertPerson({ id: person.id, name: person.name, skills: [...merged] })
    }

    let record: CrmRecord | undefined
    if (result.shouldRecord && result.record) {
      record = this.addRecord({
        personId: person.id,
        type: result.record.type,
        amount: result.record.amount,
        itemTitle: result.record.itemTitle,
        rawContent: rawText,
        eventDate: result.record.eventDate,
        source,
      })
    }

    let relation: RelationEdge | undefined
    if (result.relationHint) {
      let target = findPersonByName(result.relationHint.targetPersonName)
      if (!target) {
        target = this.upsertPerson({ name: result.relationHint.targetPersonName })
      }
      if (target.id !== person.id) {
        relation = this.upsertRelation({
          sourcePersonId: person.id,
          targetPersonId: target.id,
          relationLabel: result.relationHint.relationLabel,
        })
      }
    }

    return { person, createdPerson, record, relation }
  },

  exportAllToJson(): string {
    return JSON.stringify(load(), null, 2)
  },

  /** 导入整库 JSON（结构非法时抛错，不写入） */
  importFromJson(json: string): void {
    const parsed = JSON.parse(json) as DbShape
    if (!Array.isArray(parsed.persons) || !Array.isArray(parsed.records) || !Array.isArray(parsed.relations)) {
      throw new Error('导入数据结构非法：必须包含 persons / records / relations 三个数组')
    }
    db = parsed
    persist()
  },

  /** 导出流水 CSV（带 BOM，Excel 可直接打开；可选过滤条件） */
  exportRecordsToCsv(filter: RecordFilter = {}): string {
    const rows = this.getRecordsByFilter(filter)
    const typeLabel: Record<RecordType, string> = { idea: '想法', gift: '礼物', ledger: '记账' }
    const escapeCell = (v: string | number): string => {
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = ['记录ID', '人物', '类型', '金额', '条目', '日期', '来源', '原始内容', '创建时间']
    const lines = rows.map((r) =>
      [
        r.id,
        r.personName,
        typeLabel[r.type],
        r.amount,
        r.itemTitle,
        r.eventDate,
        r.source === 'manual' ? '手动' : 'AI识别',
        r.rawContent,
        new Date(r.createdAt).toLocaleString('zh-CN'),
      ]
        .map(escapeCell)
        .join(','),
    )
    return '﻿' + [header.join(','), ...lines].join('\n')
  },
}
