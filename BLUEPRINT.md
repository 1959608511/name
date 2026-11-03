# 《我是鱼人际》(FishCRM) v2.0 工程档案

> **文档定位**：跨平台交接、全新 AI 首次全面接管或排查底层机制时阅读。日常小修改只读 `STATE.md`。

***

## 一、 核心工程铁律

1. **单一数据源**：`src/types/schema.ts` 为唯一类型契约；`src/store/useCrmStore.ts` 为唯一响应式数据中心；组件禁止直接触碰存储层。
2. **存储隔离**：统一使用 `fishcrm_v2_*` 前缀读写 localStorage，与历史缓存完全隔离。
3. **单文件红线**：任何 `.vue` / `.ts` 文件不得超过 220 行，超限必须按职责拆分。
4. **演示数据**：`ensureSeed()` 仅在 `import.meta.env.DEV` 下写入演示数据，生产构建不注入。

***

## 二、 全局文件户口本

| 文件路径 | 唯一职责说明 |
| :--- | :--- |
| `.traerules` | AI 最高宪章：视觉规范、模块拆分、类型检查与交付省流要求 |
| `STATE.md` | 日常热看板：核心防退化铁律与最新版本号 |
| `BLUEPRINT.md` | 全量冷档案（本文件）：完整接口契约、原生协议与目录结构 |
| `check-gate.mjs` | 提交门禁：扫描 `src` 行数、组件内 localStorage 与历史残留标识 |
| `src/types/schema.ts` | 全局类型契约：`ContactPerson`、`LedgerItem`、`DiaryItem`、`TodoItem`、`RelationEdge`、`DaySummary` 等 |
| `src/services/dbService.ts` | 数据层统一出口：纯 barrel re-export（`core` / `seed` / `query` / `io`） |
| `src/services/db/core.ts` | 存储键、基础读写、整包读写、CRUD、人情往来增删 |
| `src/services/db/seed.ts` | 演示数据构建与 `ensureSeed()`（仅开发环境） |
| `src/services/db/query.ts` | `getDaySummaryMap(data, month?)` 按日聚合、历史标签聚合 |
| `src/services/db/io.ts` | JSON / CSV 导入导出、清空与重置 |
| `src/services/aiService.ts` | 本地正则解析：一句话记账 / 待办 / 日记与抓屏文本落库 |
| `src/services/nativeBridge.ts` | 安卓桥接：抓屏队列拉取、返回手势消费栈 |
| `src/store/useCrmStore.ts` | Pinia 数据中心：状态、面板开关、CRUD 代理与派生数据 |
| `src/components/CalendarEngine.vue` | 连续周滑动窗口月历 + 三形态动态视口 + 三级手势 |
| `src/components/CalendarCell.vue` | 单个日期格：缩略胶囊 / 圆点 / 窄条紧凑行 |
| `src/components/RecordWorkspace.vue` | 工作台容器：组合 3 个 Widget |
| `src/components/workspace/ContactWidget.vue` | 通讯录窗口：当日人情往来 / 生日 / 新增联系人 |
| `src/components/workspace/LedgerWidget.vue` | 记账窗口：当日收支流水与合计摘要 |
| `src/components/workspace/DiaryWidget.vue` | 日记·待办窗口：正文摘要与待办勾选、快加 |
| `src/components/ActionSheetModal.vue` | 底部面板容器：遮罩、滑出容器、标题栏、按 panel 分发 |
| `src/components/sheet/ChooseSheet.vue` | 长按新建选择 + AI 快记 |
| `src/components/sheet/TodoSheet.vue` | 待办管理面板 |
| `src/components/sheet/ContactSheet.vue` | 通讯录表单 |
| `src/components/sheet/LedgerSheet.vue` | 记账表单 |
| `src/components/sheet/DiarySheet.vue` | 日记表单（内嵌关联待办） |
| `src/views/HomeView.vue` | Tab 1 首页：日历高度交互 + 工作台 + 面板挂载 |
| `src/views/GraphView.vue` | Tab 2 关系图谱（占位，力导向图待接入） |
| `src/views/SettingsView.vue` | Tab 3 设置中心（占位，备份 / AI 配置待接入） |
| `src/App.vue` | 根容器：底部三 Tab、原生桥接初始化、返回手势拦截 |

***

## 三、 核心接口契约

- `ContactPerson`: `{ id, name, aliases: string[], phone, birthday, tags: string[], favors: FavorRecord[], note, createdAt, createdDate? }`
- `FavorRecord`: `{ id, date, title, amount, direction: 'in'|'out', note }`
- `LedgerItem`: `{ id, date, category: 'expense'|'income'|'other', amount, contactId?, contactName?, remark, tempNote?, createdAt }`
- `DiaryItem`: `{ id, date, content, createdAt }`
- `TodoItem`: `{ id, date, text, done, isImportant?, diaryId?, createdAt }`
- `RelationEdge`: `{ id, sourceId, targetId, label, weight }`
- `DaySummary`: `{ date, undoneTodosCount, netAmount, hasDiary, capsules: DayCapsule[] }`
- `V2Database`: `{ contacts, ledger, diaries, todos, relations }`

**数据层 API**：
- `core`：`uid` / `toISODate` / `todayStr` / `contactDateOf` / `loadAll` / `save*` / `upsert*` / `remove*` / `upsertFavor` / `removeFavor`
- `seed`：`ensureSeed()`（仅开发环境）
- `query`：`getDaySummaryMap(data, month?)` / `collectHistoryTags(contacts)`
- `io`：`exportJSON` / `importJSON` / `exportLedgerCSV` / `exportContactsCSV` / `categoryLabel` / `clearAllData` / `resetDemoData`

***

## 四、 原生桥接 (`window.FishNativeBridge`)

- `pullPendingCaptures()`：读取并清空抓屏队列（JSON 数组或换行纯文本均可，上限 50 条）。
- `openAccessibilitySettings()` / `isAccessibilityEnabled()`：跳转无障碍设置与检测开启状态。
- `exitApp()`：安卓原生 finish。
- 事件：抓屏完成 → `fishcrm:capture-ready`；返回键 → `fishcrm:back-pressed`（由 `registerBackHandler` 消费栈处理）。

***

## 五、 本地编译环境备忘

- **Node.js**: v24.20.0（需确保在 PATH 中）
- **JDK 21**: `d:\a\name\.jdk\jdk-21`（编译前需设 `JAVA_HOME`）
- **Android SDK**: `C:\Users\wr195\.local\share\android-sdk`（需设 `ANDROID_HOME`）
- **桌面 APK 输出路径**: `D:\Desktop\FishCRM-debug.apk`
