/**
 * FishCRM 全局类型契约（锁死，修改前必须检查所有引用方）
 *
 * 数据层只有 3 张表：persons / records / relations。
 * 7 大模块（ModuleKey）只是这 3 张表的不同筛选视图。
 */

/** 底部 7 大功能模块 */
export type ModuleKey =
  | 'contacts'
  | 'ideas'
  | 'gifts'
  | 'ledger'
  | 'skills'
  | 'cutoff'
  | 'deceased'

/** 人物状态：active=通讯录，cutoff=不来往人物，deceased=不在世人物 */
export type PersonStatus = 'active' | 'cutoff' | 'deceased'

/** 流水类型：idea=想法，gift=礼物，ledger=记账 */
export type RecordType = 'idea' | 'gift' | 'ledger'

/** 记录来源：manual=手动录入，accessibility_ai=无障碍 AI 识别 */
export type RecordSource = 'manual' | 'accessibility_ai'

/** 人物表 persons */
export interface Person {
  id: string
  name: string
  /** 别名 / 昵称列表（AI 匹配人物时同时匹配 name 与 aliases） */
  aliases: string[]
  status: PersonStatus
  /** 技能标签（供 skills 模块聚合） */
  skills: string[]
  /** 自由标签（如 家人 / 同事 / 朋友） */
  tags: string[]
  phone?: string
  /** 生日，格式 YYYY-MM-DD */
  birthday?: string
  note?: string
  /** 创建时间戳（毫秒） */
  createdAt: number
}

/** 流水表 records
 * 金额约定：amount > 0 表示收入 / 收到；amount < 0 表示支出 / 送出；idea 通常为 0。
 */
export interface CrmRecord {
  id: string
  personId: string
  /** 冗余存人物名，便于列表渲染与 CSV 导出 */
  personName: string
  type: RecordType
  amount: number
  /** 条目名（礼物名 / 收支项 / 想法标题） */
  itemTitle: string
  /** 原始内容（手动备注或 AI 识别的原文） */
  rawContent: string
  /** 事件日期，格式 YYYY-MM-DD */
  eventDate: string
  source: RecordSource
  createdAt: number
}

/** 关系表 relations（有向边，UI 层可按无向渲染） */
export interface RelationEdge {
  id: string
  sourcePersonId: string
  targetPersonId: string
  /** 关系标签，如 夫妻 / 同事 / 球友 */
  relationLabel: string
  /** 亲密度权重 1~5 */
  weight: number
}

/** 日历某一天的聚合摘要 */
export interface CalendarDaySummary {
  /** 日期，格式 YYYY-MM-DD */
  date: string
  totalEvents: number
  /** 当天净收支（所有流水 amount 之和） */
  netAmount: number
  records: CrmRecord[]
}

/** AI 识别结果（无障碍抓取文本 → 结构化） */
export interface AiParsedResult {
  /** 是否值得落库；false 时仅可用于预填，不产生任何写入 */
  shouldRecord: boolean
  /** 识别到的人物名（可为别名） */
  personName: string
  /** 识别到的人物状态（新建人物时使用，缺省视为 active） */
  personStatus?: PersonStatus
  /** 识别到的新技能标签（追加到人物 skills，自动去重） */
  newSkills?: string[]
  /** 识别到的流水 */
  record?: {
    type: RecordType
    amount: number
    itemTitle: string
    eventDate: string
  }
  /** 识别到的人物关系线索 */
  relationHint?: {
    targetPersonName: string
    relationLabel: string
  }
}
