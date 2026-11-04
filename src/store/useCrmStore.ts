/**
 * FishCRM v2.0 Pinia 唯一响应式数据中心
 * 所有组件只能通过本 store 读写数据，严禁直接触碰存储层。
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type {
  ContactPerson,
  ContactScope,
  DaySummary,
  DiaryItem,
  FavorRecord,
  ISODate,
  LedgerItem,
  LedgerRepayment,
  LedgerScope,
  PanelType,
  RelationEdge,
  TodoItem,
} from '../types/schema';
import * as db from '../services/dbService';
import { defaultLayout, loadLayout, saveLayout, type WidgetKey } from '../services/db/layout';

export const useCrmStore = defineStore('fishcrm-v2', () => {
  /* ---------- 数据状态 ---------- */
  const contacts = ref<ContactPerson[]>([]);
  const ledger = ref<LedgerItem[]>([]);
  const diaries = ref<DiaryItem[]>([]);
  const todos = ref<TodoItem[]>([]);
  const relations = ref<RelationEdge[]>([]);

  /* ---------- UI 状态 ---------- */
  const selectedDate = ref<ISODate>(db.todayStr());
  const activePanel = ref<PanelType>('none');
  /** 当前面板正在编辑的条目 id（undefined = 新建） */
  const editingId = ref<string | undefined>(undefined);
  /** 通讯录小模块展示范围：当日 / 全部联系人 / 全部人情往来 */
  const contactScope = ref<ContactScope>('day');
  /** 记账小模块展示范围：当日 / 全部 / 借还 */
  const ledgerScope = ref<LedgerScope>('day');
  /** 日记·待办小模块展示范围：当日 / 全部 */
  const diaryScope = ref<'day' | 'all'>('day');
  /** 人情往来编辑上下文（contactId + favorId，区别于通用 editingId） */
  const favorEdit = ref<{ contactId?: string; favorId?: string } | null>(null);
  /** 工作台小模块布局：排列顺序 + 各模块固定像素高度（fishcrm_v2_layout） */
  const layoutOrder = ref<WidgetKey[]>(defaultLayout().order);
  const layoutHeights = ref<Record<WidgetKey, number>>(defaultLayout().heights);

  function loadAll(): void {
    const data = db.loadAll();
    contacts.value = data.contacts;
    ledger.value = data.ledger;
    diaries.value = data.diaries;
    todos.value = data.todos;
    relations.value = data.relations;
  }

  /* ---------- 工作台布局 ---------- */
  function loadLayoutState(): void {
    const l = loadLayout();
    layoutOrder.value = l.order;
    layoutHeights.value = l.heights;
  }
  /** 保存本次布局编辑结果（排序 + 高度）并持久化 */
  function applyLayout(order: WidgetKey[], heights: Record<WidgetKey, number>): void {
    const saved = saveLayout({ order, heights });
    layoutOrder.value = saved.order;
    layoutHeights.value = saved.heights;
  }

  /* ---------- 日历与面板 ---------- */
  function selectDate(date: ISODate): void {
    selectedDate.value = date;
    // 点击日历任意日期自动退出「全部」模式，三个模块统一切回当日视图
    contactScope.value = 'day';
    ledgerScope.value = 'day';
    diaryScope.value = 'day';
  }
  function setContactScope(s: ContactScope): void {
    contactScope.value = s;
  }
  function setLedgerScope(s: LedgerScope): void {
    ledgerScope.value = s;
  }
  function setDiaryScope(s: 'day' | 'all'): void {
    diaryScope.value = s;
  }
  function openPanel(p: Exclude<PanelType, 'none'>, editId?: string): void {
    activePanel.value = p;
    editingId.value = editId;
    // 非人情面板一律清空人情编辑上下文，防止残留状态污染下次打开
    if (p !== 'favor') favorEdit.value = null;
  }
  /** 打开人情往来面板：新建（无参）或编辑指定联系人的指定人情 */
  function openFavorPanel(contactId?: string, favorId?: string): void {
    activePanel.value = 'favor';
    editingId.value = undefined;
    favorEdit.value = { contactId, favorId };
  }
  function closePanel(): void {
    activePanel.value = 'none';
    editingId.value = undefined;
    favorEdit.value = null;
  }

  /* ---------- 通讯录 ---------- */
  function upsertContact(c: ContactPerson): void {
    contacts.value = db.upsertContact(c);
  }
  function removeContact(id: string): void {
    contacts.value = db.removeContact(id);
  }

  /* ---------- 人情往来（内嵌于联系人） ---------- */
  function upsertFavor(contactId: string, favor: FavorRecord): void {
    contacts.value = db.upsertFavor(contactId, favor);
  }
  function removeFavor(contactId: string, favorId: string): void {
    contacts.value = db.removeFavor(contactId, favorId);
  }

  /* ---------- 记账 ---------- */
  function upsertLedger(item: LedgerItem): void {
    ledger.value = db.upsertLedger(item);
  }
  function removeLedger(id: string): void {
    ledger.value = db.removeLedger(id);
  }
  /** 切换「危险」标记：置顶红色警示 */
  function toggleLedgerDanger(id: string): void {
    const item = ledger.value.find((l) => l.id === id);
    if (!item) return;
    upsertLedger({ ...item, isDanger: !item.isDanger });
  }
  /** 标记 / 撤销「全部已还」；标记时可附备注，自动把剩余待还补记为一笔结清还款 */
  function markLedgerSettled(id: string, settled = true, note?: string): void {
    const item = ledger.value.find((l) => l.id === id);
    if (!item) return;
    const trimmed = note?.trim();
    if (settled && trimmed) {
      const paid = (item.repayments ?? []).reduce((sum, r) => (r.type !== 'borrow' ? sum + r.amount : sum), 0);
      const rem = Math.max(0, item.amount - paid);
      const repayments: LedgerRepayment[] = rem > 0
        ? [...(item.repayments ?? []), { id: db.uid(), date: selectedDate.value, amount: rem, type: 'repay', note: trimmed, createdAt: Date.now() }]
        : item.repayments ?? [];
      upsertLedger({ ...item, repayments, isSettled: true });
      return;
    }
    upsertLedger({ ...item, isSettled: settled });
  }
  /** 追加一笔部分还款（type: 'repay'，可带备注）；累计已还达到总额时自动标记为全部已还 */
  function addLedgerRepayment(id: string, amount: number, note?: string, date?: ISODate): void {
    const item = ledger.value.find((l) => l.id === id);
    if (!item || !Number.isFinite(amount) || amount <= 0) return;
    const record: LedgerRepayment = {
      id: db.uid(), date: date || selectedDate.value, amount: Math.abs(amount),
      type: 'repay', note: note?.trim() || undefined, createdAt: Date.now(),
    };
    const repayments = [...(item.repayments ?? []), record];
    // 已还总额仅累计还款记录，追加借出（type: 'borrow'）不计入
    const paid = repayments.reduce((sum, r) => (r.type !== 'borrow' ? sum + r.amount : sum), 0);
    upsertLedger({ ...item, repayments, isSettled: paid >= item.amount ? true : item.isSettled });
  }
  /** 借款未还清状态下继续追加借出：累加本金并向明细追加一笔 borrow 记录 */
  function addLedgerBorrow(id: string, amount: number, note?: string, date?: ISODate): void {
    const item = ledger.value.find((l) => l.id === id);
    if (!item || !Number.isFinite(amount) || amount <= 0) return;
    const record: LedgerRepayment = {
      id: db.uid(), date: date || selectedDate.value, amount: Math.abs(amount),
      type: 'borrow', note: note?.trim() || undefined, createdAt: Date.now(),
    };
    upsertLedger({
      ...item,
      amount: item.amount + Math.abs(amount),
      isSettled: false,
      repayments: [...(item.repayments ?? []), record],
    });
  }

  /* ---------- 日记 ---------- */
  function upsertDiary(d: DiaryItem): void {
    diaries.value = db.upsertDiary(d);
  }
  function removeDiary(id: string): void {
    diaries.value = db.removeDiary(id);
    // 日记删除后，其内嵌待办降级为独立待办（保留数据不丢失）
    todos.value = todos.value.map((t) => (t.diaryId === id ? { ...t, diaryId: undefined } : t));
    db.saveTodos(todos.value);
  }

  /* ---------- 待办（日记内嵌 ↔ 独立列表双向同步：同一 todos 数据源） ---------- */
  function upsertTodo(t: TodoItem): void {
    todos.value = db.upsertTodo(t);
  }
  function createTodo(text: string, isImportant?: boolean, customDate?: ISODate, customTime?: string): void;
  /** 兼容旧式「日期优先」调用（TodoSheet 仍按此顺序传参） */
  function createTodo(date: ISODate, text: string, isImportant?: boolean): void;
  function createTodo(a: string, b?: string | boolean, c?: string | boolean, d?: string): void {
    const legacy = typeof b === 'string';
    const text = legacy ? b : a;
    const important = legacy ? (typeof c === 'boolean' ? c : false) : (typeof b === 'boolean' ? b : false);
    const date = legacy ? a : (typeof c === 'string' && c ? c : selectedDate.value);
    const time = legacy ? undefined : d;
    const trimmed = text.trim();
    if (!trimmed) return;
    upsertTodo({
      id: db.uid(), date, text: trimmed, done: false,
      isImportant: important, time: time || undefined, createdAt: Date.now(),
    });
  }
  /** 在日记内嵌处新增待办：默认归属日记日期，可传入自定义日期 / 时间 */
  function addTodoForDiary(
    diaryId: string, text: string, isImportant = false, customDate?: ISODate, customTime?: string,
  ): void {
    const diary = diaries.value.find((d) => d.id === diaryId);
    const trimmed = text.trim();
    if (!trimmed) return;
    upsertTodo({
      id: db.uid(), date: customDate || diary?.date || selectedDate.value, text: trimmed,
      done: false, isImportant, time: customTime || undefined, diaryId, createdAt: Date.now(),
    });
  }
  /** 勾选/取消勾选：独立面板与日记内嵌视图读同一数据源，天然实时同步 */
  function toggleTodo(id: string): void {
    const target = todos.value.find((t) => t.id === id);
    if (!target) return;
    upsertTodo({ ...target, done: !target.done });
  }
  /** 切换「重要」标记：重要且未完成时跨日置顶常驻 */
  function toggleImportant(id: string): void {
    const target = todos.value.find((t) => t.id === id);
    if (!target) return;
    upsertTodo({ ...target, isImportant: !target.isImportant });
  }
  function removeTodo(id: string): void {
    todos.value = db.removeTodo(id);
  }

  /* ---------- 关系图谱 ---------- */
  function upsertRelation(r: RelationEdge): void {
    relations.value = db.upsertRelation(r);
  }
  function removeRelation(id: string): void {
    relations.value = db.removeRelation(id);
  }

  /* ---------- 派生数据 ---------- */
  /** 某日待办 = 全局未完成的重要待办（跨日常驻置顶）+ 当日待办 */
  function todosForDay(date: ISODate): TodoItem[] {
    const pinned = todos.value.filter((t) => t.isImportant && !t.done);
    const rest = todos.value.filter((t) => t.date === date && !(t.isImportant && !t.done));
    return [...pinned, ...rest];
  }
  const todosOfSelectedDate = computed<TodoItem[]>(() => todosForDay(selectedDate.value));
  const diaryOfSelectedDate = computed<DiaryItem | undefined>(() =>
    diaries.value.find((d) => d.date === selectedDate.value),
  );
  function todosOfDiary(diaryId: string): TodoItem[] {
    return todos.value.filter((t) => t.diaryId === diaryId);
  }
  /** 全量单格缩略聚合（直接消费内存数据，任一 ref 变更自动重算） */
  const summaryMap = computed<Record<ISODate, DaySummary>>(() =>
    db.getDaySummaryMap({
      contacts: contacts.value,
      ledger: ledger.value,
      diaries: diaries.value,
      todos: todos.value,
      relations: relations.value,
    }),
  );
  /** 历史标签去重候选（通讯录表单聚焦时弹出） */
  const historyTags = computed<string[]>(() => db.collectHistoryTags(contacts.value));
  /** 人情往来历史标签去重候选 */
  const historyFavorTags = computed<string[]>(() => db.collectFavorTags(contacts.value));
  /** 记账历史标签去重候选（记账表单聚焦时弹出，供标签胶囊快选） */
  const historyLedgerTags = computed<string[]>(() => {
    const seen = new Set<string>();
    for (const item of ledger.value) {
      const t = item.tag?.trim();
      if (t) seen.add(t);
    }
    return [...seen].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  });

  /** 全部人情往来拍平列表（按日期倒序，附带联系人信息，供「全部」模式展示） */
  interface FavorRow {
    favor: FavorRecord;
    contactId: string;
    contactName: string;
  }
  const allFavors = computed<FavorRow[]>(() => {
    const rows: FavorRow[] = [];
    for (const c of contacts.value) {
      for (const f of c.favors) {
        rows.push({ favor: f, contactId: c.id, contactName: c.name });
      }
    }
    rows.sort((a, b) => (a.favor.date < b.favor.date ? 1 : a.favor.date > b.favor.date ? -1 : 0));
    return rows;
  });

  loadAll();
  loadLayoutState();

  return {
    contacts, ledger, diaries, todos, relations,
    selectedDate, activePanel, editingId, contactScope, ledgerScope, diaryScope, favorEdit,
    layoutOrder, layoutHeights, loadLayoutState, applyLayout,
    loadAll, selectDate, setContactScope, setLedgerScope, setDiaryScope,
    openPanel, openFavorPanel, closePanel,
    upsertContact, removeContact, upsertFavor, removeFavor,
    upsertLedger, removeLedger,
    toggleLedgerDanger, markLedgerSettled, addLedgerRepayment, addLedgerBorrow,
    upsertDiary, removeDiary, upsertTodo, createTodo, addTodoForDiary,
    toggleTodo, toggleImportant, removeTodo,
    upsertRelation, removeRelation,
    todosForDay, todosOfSelectedDate, diaryOfSelectedDate, todosOfDiary,
    summaryMap, historyTags, historyFavorTags, historyLedgerTags, allFavors,
  };
});
