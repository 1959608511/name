/**
 * FishCRM v2.0 全局类型契约（唯一事实来源，严禁 any）
 */

/** ISO 日期字符串，格式 'YYYY-MM-DD' */
export type ISODate = string;

/** 人情往来记录（红包 / 礼物 / 请客等） */
export interface FavorRecord {
  id: string;
  date: ISODate;
  title: string;
  amount: number;
  direction: 'in' | 'out';
  note: string;
  /** 人情往来标签（如 婚礼/生日/乔迁） */
  tag?: string;
}

/** 通讯录联系人 */
export interface ContactPerson {
  id: string;
  name: string;
  aliases: string[];
  phone: string;
  birthday: string;
  tags: string[];
  favors: FavorRecord[];
  note: string;
  createdAt: number;
  /** 建档归属的日历日期（用于工作台"新增联系人"展示） */
  createdDate?: ISODate;
}

/** 记账类别：支出 | 收入 | 其他（专用于借钱/还钱往来） */
export type LedgerCategory = 'expense' | 'income' | 'other';

/** 记账小模块展示范围：当日 | 全部支出收入 | 借还 */
export type LedgerScope = 'day' | 'all' | 'loan';

/** 通讯录小模块展示范围：当日 | 全部联系人 | 全部人情往来 */
export type ContactScope = 'day' | 'contacts' | 'favors';

/** 日记·待办小模块展示范围：当日 | 全部待办 | 全部日记 */
export type DiaryScope = 'day' | 'todos' | 'diaries';

/** 借还账目的单笔资金往来记录（repay = 部分还款 / borrow = 追加借出） */
export interface LedgerRepayment {
  id: string;
  date: ISODate;
  amount: number;
  type?: 'repay' | 'borrow';
  note?: string;
  createdAt: number;
}

/** 记账条目（amount 统一存正数绝对值，方向由 category 表达） */
export interface LedgerItem {
  id: string;
  date: ISODate;
  category: LedgerCategory;
  amount: number;
  contactId?: string;
  contactName?: string;
  remark: string;
  /** 兼容旧数据的临时便签 */
  tempNote?: string;
  /** 记录时间，格式 'HH:mm' */
  time?: string;
  /** 记账标签（支出/收入/借还表单通用） */
  tag?: string;
  /** 借还收支方向：'out' 付出 | 'in' 收到 */
  direction?: 'out' | 'in';
  createdAt: number;
  /** 借还账目：是否全部已还 */
  isSettled?: boolean;
  /** 借还账目：是否标记为危险（置顶警示） */
  isDanger?: boolean;
  /** 借还账目：部分还款追加记录 */
  repayments?: LedgerRepayment[];
}

/** 日记 */
export interface DiaryItem {
  id: string;
  date: ISODate;
  content: string;
  createdAt: number;
}

/** 待办（可通过 diaryId 内嵌于日记，与独立待办列表双向同步） */
export interface TodoItem {
  id: string;
  date: ISODate;
  text: string;
  done: boolean;
  /** 重要待办：未完成前跨日常驻置顶 */
  isImportant?: boolean;
  /** 可选提醒时间，格式 'HH:mm' */
  time?: string;
  diaryId?: string;
  createdAt: number;
}

/** 关系图谱边 */
export interface RelationEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  weight: number;
}

/** 日历单格缩略胶囊 */
export interface DayCapsule {
  text: string;
  tone: 'expense' | 'income' | 'todo' | 'diary' | 'favor';
}

/** 日历单格聚合字典项 */
export interface DaySummary {
  date: ISODate;
  undoneTodosCount: number;
  netAmount: number;
  hasDiary: boolean;
  /** 全屏态单格纵向缩略信息（记账/待办/日记/人情） */
  capsules: DayCapsule[];
}

/** 当前激活的底部面板类型 */
export type PanelType = 'none' | 'choose' | 'todo' | 'contact' | 'ledger' | 'diary' | 'favor';

/** v2.0 数据库整包结构（JSON 导入导出单元） */
export interface V2Database {
  contacts: ContactPerson[];
  ledger: LedgerItem[];
  diaries: DiaryItem[];
  todos: TodoItem[];
  relations: RelationEdge[];
}

/** AI 解析结果（自然语言 / 抓屏文本统一入口） */
export interface AiParsedEntry {
  kind: 'ledger' | 'todo' | 'diary';
  date: ISODate;
  category?: LedgerCategory;
  amount?: number;
  text: string;
}
