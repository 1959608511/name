# FishCRM v2.0 交接报告（HANDOVER_REPORT）

> 生成时间：2026-10-30 ｜ 基线：`src/` 全量现有代码（未提交状态）
> 本文档为「紧急修复 + 交接」实证记录，所有行号均为修复后文件的当前行号。

---

## 一、Bug 修复说明与门禁实测结果

### Bug 1：无法添加新联系人 / 添加后在通讯录模块看不见

**根因（三处独立缺陷叠加）**

1. `ContactSheet.vue` 的初始化依赖 `Object.assign` 的隐式 `undefined` 回填，且未监听 `editId` 变化；面板复用/切换时旧数据可能残留。
2. `ContactPicker` 的锚点错误：`.cp-panel` 用 `top: calc(100% + 4px)` 定位，但最近定位祖先是整块 `.as-body`，面板被甩到表单最底部（视觉上像「卡住不能输入 / 选不了人」）。
3. 姓名右侧「▾」按钮同时绑定了 `@touchstart.stop` 与 `@click.stop` 双重 toggle：移动端一次轻点先 touchstart 开、再 click 关，等于永远打不开选择器。
4. `ContactWidget.vue` 当日模式只渲染 `favor.date === selectedDate` 的人情记录，**没有 favors 的新建联系人永远不显示**（这是「保存成功却看不见」的直接原因）。

**改动清单**

| 文件 | 行号 | 改动 |
| :--- | :--- | :--- |
| `src/components/sheet/ContactSheet.vue` | L27–41 | 新增 `resetForm()`：`id = undefined`，姓名/别名/电话/生日/标签/备注/`favors=[]`/`createdDate=props.date`、`pickerOpen=false`、`contactError=''` 全部归零 |
| 同上 | L43–54 | 重写 `initContact()`：先无条件 `resetForm()`，有 `editId` 才回填（`favors: [...c.favors]` 浅拷贝避免直连 store 数组） |
| 同上 | L71–73 | `switchToNew()` 精简为 `resetForm()`，消除双份重置逻辑不一致 |
| 同上 | L99 | 新增 `watch(() => props.editId, initContact)`，面板不关闭时切换编辑对象也能正确重载 |
| 同上 | L110–122 / L170–172 | 姓名区包裹 `.as-name-wrap`（`position: relative`），使 `ContactPicker` 精确贴在输入框正下方 |
| 同上 | L114 | 「▾」只保留 `@click.stop`，删除 `@touchstart.stop` 双重 toggle（修复移动端点不开选择器） |
| `src/components/sheet/FavorSheet.vue` | L105–128 / L180–182 | 同上：`.as-name-wrap` 锚点 + 去掉 `@touchstart.stop`（L119） |
| 同上 | L58–90（`saveFavor`） | 复核并确认「未选已有联系人」链路：先按 id → 按姓名匹配 → 都失败则 `uid()` 新建 `ContactPerson` 并 `store.upsertContact`，随后 `store.upsertFavor(contact.id, …)`，不再因空通讯录阻塞保存 |
| `src/components/workspace/ContactWidget.vue` | L44–56 | 新增 `dayContacts`（`contactDateOf(c) === selectedDate` 的联系人）、`bareContacts`（零人情记录联系人）、`contactRows`（day 模式取前者 / all 模式取后者）、`hasAny`、`meta` |
| 同上 | L68–70 | 新增 `addFavorFor(contactId)` → `store.openFavorPanel(contactId)`、`editContact(id)` → `emit('edit', id)` |
| 同上 | L118–136 | 新增「联系人条目」区块：`👤 {姓名}` + 标签胶囊 + 建档日期/电话，右侧 `[+记人情] [编辑]`；点击行主体进入 `ContactSheet` 编辑该联系人 |
| 同上 | L180–200 | 新增 `.cw-contacts / .cw-sect / .cw-contact / .cw-mini` 样式 |

**行为结果**

- 新建态必为空表单（`id: undefined`），保存即 `store.upsertContact` 生成新 `id` + `createdDate: props.date` 并立即 `emit('close')`。
- 当日新建的联系人一定出现在通讯录小窗口「当日新建联系人」区块；切「全部」时，零人情记录的联系人在「无往来记录联系人」区块兜底展示；两者均可点、可改、可直接「+记人情」。
- 人情往来面板在通讯录为空或输入新姓名时，保存会自动建档再写人情。

---

### Bug 2：模块右半区滑动变成滚动模块，吞掉日历缩放手势

**根因**：旧版 `.wc-gesture` 只是 `top: 36px; width: 50%; z-index: 2` 的**被动监听层**，没有 `touch-action` 约束，手指在右半区列表上滑动时浏览器原生 `overflow-y: auto` 滚动先被合成器接管，`touchmove` 被滚动判定吞掉，日历拿不到位移。

**改动清单（`src/components/WorkspaceCard.vue`）**

| 行号 | 改动 |
| :--- | :--- |
| L236–258 | 正文结构重构：`.wc-body`（外层，`position: relative; overflow: hidden;`）→ 内层 `.wc-scroll`（`width: 100%; height: 100%; overflow-y: auto;`）承载真正滚动 → 右半区叠放 `.wc-right-zone` |
| L247–253 | `.wc-right-zone` 绑定 `@touchstart.stop` / `@touchmove.stop.prevent` / `@touchend.stop` / `@touchcancel.stop`，非编辑态才渲染 |
| L302–310 | `.wc-body { position: relative; flex: 1; min-height: 0; overflow: hidden; }`；`.wc-scroll { width: 100%; height: 100%; overflow-y: auto; overscroll-behavior: contain; }` |
| L312–319 | `.wc-right-zone { position: absolute; top: 0; right: 0; bottom: 0; width: 50%; z-index: 15; touch-action: none; user-select: none; }`（从合成器层彻底禁止右半区原生滚动） |
| L102–114 | `onZoneStart`：记录起点、清态、启动 450ms 长按计时 |
| L115–139 | `onZoneMove`：`|dy| > 3px` 且纵向为主 → 立即 `dragMode='calendar'` 并 `cal.beginDrag()`，随后每帧 `cal.dragBy(delta)` 1:1 跟手；位移 > 6px 取消长按 |
| L140–155 | `onZoneEnd`：日历拖拽 → `cal.endDrag(velocity)`（速度吸附）+ 300ms 抑制点击；「位移 ≤ 6px 且未长按」→ 判定为轻点，调用 `forwardTap` |
| L88–101 | `forwardTap(x, y)`：临时 `zone.style.pointerEvents='none'` → `document.elementFromPoint(x,y)` → `closest('button, a, input, textarea, select, [role="button"]')` → `.click()` → `finally` 立即恢复 `pointerEvents=''` |
| L156–163 | `onZoneCancel`：`touchcancel` 收尾，不触发轻点透传 |
| L45–76 | `armZoneLongPress()`：450ms 内 `moved/longFired/dragMode!=='none'` 任一成立则不触发；触发后 `suppressTill = now + 400ms` 抑制误点 |
| L322–330 | 编辑态层级调整：`.wc-move-layer` z-index 12、`.wc-handle` z-index 14（拦截层 15 在编辑态被 `v-if` 移除，不抢把手） |

**行为结果**：右半区上下滑动 100% 只缩放日历（`touch-action:none` 物理禁止误滚，`preventDefault` 双保险）；右半区轻点通过 `elementFromPoint` 透传到下层条目/复选框/按钮；右半区长按 450ms 仍正常进入「小模块编辑状态」。

---

### 门禁实测结果

命令：

```powershell
node .\node_modules\vue-tsc\bin\vue-tsc.js --noEmit && node check-gate.mjs
```

实测输出（退出码 0）：

```
✅ [防屎山门禁通过] 行数、存储边界与纯净度全部合格！
```

- `vue-tsc --noEmit`：**0 错误、0 输出**（无任何类型报错）。
- `check-gate.mjs`：全部 `.vue/.ts` ≤ 450 行、组件内无 `localStorage` 直连、无 v1 残留标识（`UnifiedDrawer` / `ModuleGrid` / `fishcrm_persons` / `cutoff` / `deceased`）。

---

## 二、全量源码文件行数与职责表

统计口径与 `check-gate.mjs` 一致（`content.split('\n').length`），红线 450 行。

| # | 文件 | 行数 | 距 450 行余量 | 唯一职责 |
| :-: | :--- | --: | --: | :--- |
| 1 | `src/components/CalendarEngine.vue` | 387 | 63 | 连续周滑动窗口月历 + 三形态动态视口 + 三级手势（单击/双击/长按） |
| 2 | `src/components/WorkspaceCard.vue` | 332 | 118 | 小模块卡片骨架：头部 / `.wc-scroll` 滚动正文 / 右半区手势拦截层 / 编辑态调高换位 |
| 3 | `src/utils/calendarHelper.ts` | 299 | 151 | 日历几何（`getGeometry`）、高度夹紧 `clampHeight`、形态吸附 `snapHeight`、周计算工具 |
| 4 | `src/store/useCrmStore.ts` | 229 | 221 | Pinia 唯一响应式数据中心：状态、面板开关、CRUD 代理、布局持久化、派生数据 |
| 5 | `src/components/sheet/FavorSheet.vue` | 205 | 245 | 人情往来 4 字段表单（联系人/内容/日期/标签），新姓名自动建档 |
| 6 | `src/components/workspace/ContactWidget.vue` | 199 | 251 | 通讯录窗口：人情逐条 / 当日新建联系人 / 无记录兜底 / 全部切换 |
| 7 | `src/components/sheet/ContactSheet.vue` | 196 | 254 | 联系人新建·修改·删除一体化表单（含 ContactPicker、历史标签候选） |
| 8 | `src/App.vue` | 173 | 277 | 根容器：底部三 Tab、原生桥接初始化、返回手势拦截 |
| 9 | `src/services/db/core.ts` | 145 | 305 | 存储键、`uid`/日期工具、基础读写、整包读取、全量 CRUD、人情增删、标签聚合 |
| 10 | `src/components/RecordWorkspace.vue` | 141 | 309 | 下半屏工作台容器：按布局渲染 3 个 Widget、编辑态排序/调高/保存 |
| 11 | `src/components/sheet/DiarySheet.vue` | 140 | 310 | 日记表单（正文 + 内嵌关联待办） |
| 12 | `src/views/HomeView.vue` | 120 | 330 | Tab1 首页：日历高度单例联动、工作台装配、底部面板挂载、返回栈 |
| 13 | `src/services/nativeBridge.ts` | 120 | 330 | 安卓桥接：抓屏队列、无障碍状态、返回手势消费栈 |
| 14 | `src/components/sheet/LedgerSheet.vue` | 119 | 331 | 记账表单（支出/收入/其他，金额只存绝对值） |
| 15 | `src/services/db/seed.ts` | 118 | 332 | 演示数据构建与 `ensureSeed()`（仅 DEV） |
| 16 | `src/types/schema.ts` | 116 | 334 | 全局类型契约（唯一事实来源，严禁 any） |
| 17 | `src/components/workspace/DiaryWidget.vue` | 116 | 334 | 日记·待办窗口：正文摘要、待办勾选、重要星标、快加 |
| 18 | `src/components/CalendarCell.vue` | 103 | 347 | 单个日期格：缩略胶囊 / 圆点 / 窄条紧凑行 / 选中态 |
| 19 | `src/components/workspace/LedgerWidget.vue` | 88 | 362 | 记账窗口：当日流水与收支合计摘要 |
| 20 | `src/components/ActionSheetModal.vue` | 88 | 362 | 底部抽屉容器：遮罩、滑出动画、标题栏、按 panel 分发子表单 |
| 21 | `src/services/aiService.ts` | 87 | 363 | 本地正则解析：一句话记账 / 待办 / 日记与抓屏文本落库 |
| 22 | `src/components/sheet/ContactPicker.vue` | 81 | 369 | 已有联系人下拉选择（姓名/别名/电话/标签搜索） |
| 23 | `src/services/db/layout.ts` | 80 | 370 | 工作台布局持久化 `fishcrm_v2_layout`：排序、像素高度夹紧 110–420 |
| 24 | `src/components/sheet/TodoSheet.vue` | 79 | 371 | 待办管理面板（勾选/重要/删除/新增） |
| 25 | `src/composables/useCalendarHeight.ts` | 78 | 372 | 日历高度单例：1:1 跟手、rAF 吸附、视口同步（三处手势共用） |
| 26 | `src/services/db/query.ts` | 71 | 379 | 纯查询：`getDaySummaryMap` 按日聚合、历史标签去重 |
| 27 | `src/components/sheet/ChooseSheet.vue` | 69 | 381 | 长按新建选择（通讯录/记账/日记）+ AI 快记入口 |
| 28 | `src/services/db/io.ts` | 68 | 382 | JSON / CSV 导入导出、`categoryLabel`、清空与重建演示数据 |
| 29 | `src/views/SettingsView.vue` | 21 | 429 | Tab3 设置中心（占位壳子：数据总量 + 无障碍状态） |
| 30 | `src/views/GraphView.vue` | 18 | 432 | Tab2 关系图谱（占位壳子：节点/连线计数） |
| 31 | `src/main.ts` | 9 | 441 | 应用入口：挂载 Pinia + 根组件 |
| 32 | `src/services/dbService.ts` | 9 | 441 | 数据层 barrel re-export（core/seed/query/io） |

**合计 32 个文件，最大 387 行（`CalendarEngine.vue`），全部 ≤ 450 红线，无超限。**
风险提示：`CalendarEngine.vue`（387）与 `WorkspaceCard.vue`（332）余量最小，后续新增能力需先拆分。

---

## 三、核心代码契约快照

### 3.1 `src/types/schema.ts`（完整内容，116 行）

```ts
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

/** 记账条目（amount 统一存正数绝对值，方向由 category 表达） */
export interface LedgerItem {
  id: string;
  date: ISODate;
  category: LedgerCategory;
  amount: number;
  contactId?: string;
  contactName?: string;
  remark: string;
  tempNote?: string;
  createdAt: number;
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
```

### 3.2 `src/store/useCrmStore.ts` 导出签名（`defineStore('fishcrm-v2', setup)`）

**State（全部 `Ref`）**

| 名称 | 类型 | 说明 |
| :--- | :--- | :--- |
| `contacts` | `Ref<ContactPerson[]>` | 联系人（含内嵌 `favors`） |
| `ledger` | `Ref<LedgerItem[]>` | 记账条目 |
| `diaries` | `Ref<DiaryItem[]>` | 日记 |
| `todos` | `Ref<TodoItem[]>` | 待办（独立 + 日记内嵌同一数据源） |
| `relations` | `Ref<RelationEdge[]>` | 图谱连线 |
| `selectedDate` | `Ref<ISODate>` | 当前选中日期（默认今天） |
| `activePanel` | `Ref<PanelType>` | 当前底部面板 |
| `editingId` | `Ref<string \| undefined>` | 通用编辑对象 id（undefined = 新建） |
| `contactScope` | `Ref<'day' \| 'all'>` | 通讯录小模块展示范围 |
| `favorEdit` | `Ref<{ contactId?: string; favorId?: string } \| null>` | 人情往来编辑上下文 |
| `layoutOrder` | `Ref<WidgetKey[]>` | 工作台模块顺序 |
| `layoutHeights` | `Ref<Record<WidgetKey, number>>` | 工作台模块像素高度 |

**Computed / 派生函数**

| 名称 | 签名 |
| :--- | :--- |
| `todosForDay` | `(date: ISODate) => TodoItem[]`（重要未完成跨日置顶 + 当日） |
| `todosOfSelectedDate` | `ComputedRef<TodoItem[]>` |
| `diaryOfSelectedDate` | `ComputedRef<DiaryItem \| undefined>` |
| `todosOfDiary` | `(diaryId: string) => TodoItem[]` |
| `summaryMap` | `ComputedRef<Record<ISODate, DaySummary>>`（`db.getDaySummaryMap` 全量聚合） |
| `historyTags` | `ComputedRef<string[]>`（联系人标签去重候选） |
| `historyFavorTags` | `ComputedRef<string[]>`（人情标签去重候选） |
| `allFavors` | `ComputedRef<{ favor: FavorRecord; contactId: string; contactName: string }[]>`（按 date 倒序，`FavorRow` 为 store 内部 interface） |

**Actions**

```ts
loadAll(): void
loadLayoutState(): void
applyLayout(order: WidgetKey[], heights: Record<WidgetKey, number>): void

selectDate(date: ISODate): void            // 同时重置 contactScope = 'day'
setContactScope(s: 'day' | 'all'): void
openPanel(p: Exclude<PanelType, 'none'>, editId?: string): void
openFavorPanel(contactId?: string, favorId?: string): void
closePanel(): void

upsertContact(c: ContactPerson): void
removeContact(id: string): void
upsertFavor(contactId: string, favor: FavorRecord): void
removeFavor(contactId: string, favorId: string): void

upsertLedger(item: LedgerItem): void
removeLedger(id: string): void
upsertDiary(d: DiaryItem): void
removeDiary(id: string): void             // 内嵌待办降级为独立待办

upsertTodo(t: TodoItem): void
createTodo(date: ISODate, text: string, isImportant?: boolean): void
addTodoForDiary(diaryId: string, text: string, isImportant?: boolean): void
toggleTodo(id: string): void
toggleImportant(id: string): void
removeTodo(id: string): void

upsertRelation(r: RelationEdge): void
removeRelation(id: string): void
```

> 边界：所有写操作只经 `dbService`（`fishcrm_v2_*` 前缀）落库，组件不直接触达存储层。

### 3.3 五个核心组件结构与关键逻辑

**`WorkspaceCard.vue`（332 行）**

- Props：`title / emoji / actionLabel / meta? / accent? / height?=142 / editing?=false`；Emits：`action / long-press / resize(dy) / move(dy) / move-end`。
- 结构：`.wc`（section，`click.capture` 抑制）→ `.wc-head`（标题 + 右上 action）→ `.wc-body`（`position: relative; overflow: hidden`）→ `.wc-scroll`（唯一滚动层，slot 注入）→ `.wc-right-zone`（`v-if="!editing"`，absolute 右 50%，`z-index:15`，`touch-action:none`）→ `.wc-foot`（footer slot）→ 编辑态 `.wc-move-layer`(z12) + `.wc-handle`(z14)。
- 手势状态机：`dragMode: 'none'|'calendar'` + `editMode: 'none'|'resize'|'move'`；右半区 `|dy|>3px` 且纵向为主 → `cal.beginDrag()` → 每帧 `cal.dragBy()` → `cal.endDrag(velocity)`；位移 ≤6px 且未长按 → `forwardTap()`；450ms 未动 → `emit('long-press')`。
- 左半区（正文）仅长按（判定目标非 `button/input/textarea/select/a`），滚动 100% 交给 `.wc-scroll` 原生。

**`ContactWidget.vue`（199 行）**

- Props `selectedDate`；Emits `create`（新建/修改联系人入口）与 `edit(id)`。
- 顶部 sticky 胶囊行：`新增/修改联系人` / `人情往来添加` / `全部`（高亮当 `contactScope==='all'`）。
- 数据：`dayFavors`（当日人情）→ `favorRows`（all 模式用 `store.allFavors`）；`dayContacts`（`contactDateOf===selectedDate`）；`bareContacts`（零人情记录）；`contactRows` = all ? bare : day。
- 行交互：人情行 → `store.openFavorPanel(contactId, favorId)`；联系人行 → `emit('edit', id)` 打开 ContactSheet；`[+记人情]` → `store.openFavorPanel(contactId)`。
- 空态：day 提示「这天还没有人情往来记录，点上方新增/修改联系人建档」。

**`ContactSheet.vue`（196 行）**

- Props `date` / `editId?`；Emits `close`。
- `resetForm()` 全字段归零（`id=undefined`）→ `initContact()`（无 editId 直接返回；有则回填并浅拷贝 favors）→ `watch(editId)` 重载。
- `saveContact()`：`name.trim()` 必填校验 → `store.upsertContact({ id: contactForm.id ?? uid(), …, createdAt: 原值 ?? Date.now(), createdDate: contactForm.createdDate || props.date })` → `emit('close')`。
- 顶部编辑横幅：「正在编辑：{name}」+「× 切回新建」；姓名行带 `.as-name-wrap` 锚点 + ContactPicker；标签输入聚焦弹出 `store.historyTags` 胶囊；`isEdit` 时显示删除。

**`FavorSheet.vue`（205 行）**

- Props `date / contactId? / favorId?`；Emits `close`；`isEdit = !!contactId && !!favorId`（编辑态锁定联系人）。
- 四字段：联系人（输入 + Picker，`@input` 清 `contactId`）、内容 `title`、日期（默认 `props.date`）、标签（+ `store.historyFavorTags` 胶囊）。
- `saveFavor()`：空校验 → 定位联系人（id → 姓名 → 新建 `uid()` 建档并 `store.upsertContact`）→ `store.upsertFavor(contact.id, { id: existing?.id ?? uid(), date, title, amount: 0, direction: 'out', note: '', tag? })` → 关闭。
- `deleteFavor()` 走 `store.removeFavor(props.contactId, props.favorId)`。

**`HomeView.vue`（120 行）**

- 使用单例 `useCalendarHeight()`：`calH / isResizing / geometry / animateTo / syncViewport / beginDrag / dragBy / endDrag`。
- 布局：`.home-cal`（`height = calH + geom.CAL_OFFSET`）内嵌 `CalendarEngine`（`@grab/@resize/@resize-end/@select/@double-tap/@long-press`）→ `.home-work` 内嵌 `RecordWorkspace`（`@create`/`@edit` → `store.openPanel`）→ `ActionSheetModal`（`:panel/:date/:edit-id`）。
- `ResizeObserver` 同步可用高度；返回栈：日历非全屏时先 `animateTo(H_FULL)` 并消费返回事件。
- 双击日期 → 收为 `H_STRIP` + 打开待办面板；长按日期 → `panel='choose'`。

---

## 四、第 ①~④ 段整体完成度与遗留项

> 按项目四个交付段（①类型契约与数据层 ②日历引擎与手势 ③工作台三小模块与通讯录人情一体化 ④表单面板/首页装配与扩展能力）逐项核对。

### ① 类型契约与数据层

| 项 | 状态 |
| :--- | :--- |
| `schema.ts` 唯一类型契约（`FavorRecord.tag?`、`PanelType 'favor'`、`createdDate?`） | ✅ 完成 |
| 存储隔离 `fishcrm_v2_*` 前缀 + `dbService` 纯 barrel | ✅ 完成 |
| CRUD / `upsertFavor` / `removeFavor` / `collectFavorTags` | ✅ 完成 |
| 按日聚合 `getDaySummaryMap` + 历史标签 | ✅ 完成 |
| 演示数据仅 DEV 注入 | ✅ 完成 |
| JSON/CSV 导入导出、清空重建（`io.ts`） | ✅ 完成（**UI 入口未接线**，见 ④） |

**遗留**：无阻塞项。

### ② 日历引擎与手势

| 项 | 状态 |
| :--- | :--- |
| 三形态（全屏 / 正常月历 / 50px 窄条）连续像素高度 | ✅ 完成 |
| 上下 1:1 跟手 + rAF 动量衰减（0.95）、再触摸刹停 | ✅ 完成 |
| 单击 0 延迟选中 / 280ms 双击 / 450ms 长按（>8px 取消） | ✅ 完成 |
| 松手不跳周、不自动改选中日 | ✅ 完成 |
| 高度单例三处共用（小横条 / 导航栏 / 小模块右半区） | ✅ 完成 |

**遗留**：`CalendarEngine.vue` 已 387/450 行，后续加功能须先拆分。

### ③ 工作台三小模块与通讯录人情一体化

| 项 | 状态 |
| :--- | :--- |
| 通讯录：人情逐条 / 全部倒序 / 点击编辑删除 | ✅ 完成 |
| 通讯录：**当日新建联系人必显**（本次修复） | ✅ 完成 |
| 通讯录：全部模式零人情记录联系人兜底（本次修复） | ✅ 完成 |
| 联系人新建完整重置 + 选择器锚点/点击（本次修复） | ✅ 完成 |
| 人情往来新增自动建档（本次修复复核） | ✅ 完成 |
| 记账窗口：当日流水 + 收支合计 | ✅ 完成 |
| 日记·待办窗口：正文摘要 + 勾选 + 重要星标 + 快加 | ✅ 完成 |
| 小模块右半区滑动只缩放日历（本次修复） | ✅ 完成 |
| 小模块长按进入布局编辑、调高、换序、持久化 | ✅ 完成 |
| 右半区轻点透传（`elementFromPoint` + `.click()`） | ✅ 完成（地址栏式 `input` 聚焦在键盘弹起层面受浏览器限制，见遗留） |

**遗留（非阻塞）**

1. 右半区透传到 `<input>` 时 `.click()` 只能聚焦，移动端软键盘可能不弹（iOS Safari 限制非用户手势触发键盘）；当前 Widget 内输入框均位于 `.wc-foot`（不在拦截层范围内），实际不受影响。
2. 通讯录小模块同一联系人若「当日建档 + 当日本人情」，会同时出现在人情区块与「当日新建联系人」区块（刻意保留以保证 100% 可见，非缺陷）。

### ④ 表单面板 / 首页装配 / 扩展能力

| 项 | 状态 |
| :--- | :--- |
| `ActionSheetModal` 遮罩 + 滑出动画 + panel 分发（choose/todo/contact/ledger/diary/favor） | ✅ 完成 |
| `ContactSheet` / `LedgerSheet` / `DiarySheet` / `FavorSheet` / `TodoSheet` / `ChooseSheet` | ✅ 完成 |
| `HomeView` 三 Tab 装配、返回栈、ResizeObserver | ✅ 完成 |
| `ChooseSheet` AI 快记（`quickAdd` 正则解析） | ✅ 完成 |
| 原生桥接抓屏 / 无障碍状态 / 返回事件 | ✅ 完成（界面入口未接线） |
| 关系图谱 `GraphView` | ❌ **占位**（仅节点/连线计数，ECharts 力导向图与档案卡未接入） |
| 设置中心 `SettingsView` | ❌ **占位**（备份恢复 / JSON·CSV 导入导出 / AI 配置 / 清空重置均无 UI 入口） |
| 抓屏队列消费 UI（`pullPendingCaptures` → AI 落库） | ❌ 未接线 |
| 关系图谱 CRUD（`upsertRelation/removeRelation` 已有 store action，无 UI） | ❌ 未接线 |

**遗留优先级建议**

1. `GraphView` 力导向图 + 节点档案卡（依赖 `relations` 已就绪）。
2. `SettingsView` 接线 `io.ts`（`exportJSON/importJSON/exportLedgerCSV/exportContactsCSV/clearAllData/resetDemoData`）。
3. 抓屏队列 → `aiService` 落库闭环。
4. 单项行数预警：`CalendarEngine.vue` 387 行、`WorkspaceCard.vue` 332 行、`calendarHelper.ts` 299 行、`useCrmStore.ts` 229 行，新增能力前优先拆分子模块。
