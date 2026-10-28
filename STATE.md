# FishCRM 开发进度看板

> 规则：每完成一个阶段，原地更新本文件（勾选 `[x]` 并注明日期），并确保 `npx vue-tsc --noEmit` 0 报错。

## 阶段打卡列表

- [x] Phase 1 — 数据层开发（完成于 2026-10-28）
  - 工程脚手架：Vue 3 + TS + Vite + Tailwind + Pinia + ECharts + Lucide（@lucide/vue）
  - 架构宪章 `.traerules`、进度看板 `STATE.md`
  - 全局类型契约 `src/types/schema.ts`
  - 数据服务 `src/services/dbService.ts`（localStorage 持久化 + 中文 Mock 数据：6 人物 / 10 流水 / 6 关系）
  - 状态库 `src/store/useCrmStore.ts`（组件唯一数据入口）
- [x] Phase 2 — UI 骨架与通用抽屉（完成于 2026-10-28）
  - 顶部人际日历 `src/components/CalendarHeatmap.vue`（当月网格 + 事件圆点 / 净收支 + 点击展开当日流水卡片、支持快捷删除）
  - 底部 7 模块宫格 `src/components/ModuleGrid.vue`（配置驱动，图标 / 中文名 / 实时角标数量）
  - 通用抽屉组件 `src/components/UnifiedDrawer.vue`（7 模块共用，未拆分）
    - contacts / cutoff / deceased：人物卡片 + 搜索 + 新增/编辑表单（技能标签输入、状态切换）
    - ideas / gifts / ledger：流水列表（正负颜色区分）+ 快捷新增流水表单
    - skills：技能标签云 → 点击筛选掌握该技能的人物列表
  - 首页 `src/views/HomeView.vue` 完成组装，`App.vue` 接入
- [x] Phase 3 — 可视化与 AI 解析（完成于 2026-10-28）
  - 第二页人物关系网力导向图谱 `src/views/GraphView.vue`（ECharts `graph` force 布局：SELF 中心高亮大节点、人物按状态着色、连线显示 relationLabel 且粗细关联 weight、节点可拖拽物理回弹、点击弹出人物详情与流水摘要、右上角新增/编辑与删除关系弹窗；数据层补充 `deleteRelation`）
  - AI 自然语言与抓屏解析引擎 `src/services/aiService.ts`（OpenAI 兼容接口配置存 localStorage；内置精准 System Prompt；本地正则兜底解析器覆盖「给张三随礼500」「李四请吃饭花了200，他会修电脑」「王五最近想换工作」等句式，可识别人物/技能/金额/正负号/模块类型；落库统一走 `store.applyAiParsedResult`）
  - AI 快速栏 `src/components/AiQuickBar.vue`（首页底部悬浮，API 设置弹窗 + 模拟微信抓屏文本测试按钮）
  - 数据导入导出 UI 落地首页头部：导出 JSON 备份 / 导入 JSON 恢复 / 导出 CSV 账单（调用 dbService 已有方法触发下载/上传）
  - 双页 Tab 导航整合 `src/App.vue`（底部固定切换栏：📅 人际日历与模块 / 🕸️ 关系网图谱，GraphView 懒挂载）
- [x] Phase 4 — 安卓打包与无障碍抓屏（完成于 2026-10-28）
  - Capacitor 安卓原生工程：`capacitor.config.ts`（AppId `com.fishcrm.app` / AppName `我是鱼人际` / webDir `dist`），已执行 `npm run build` → `npx cap add android` → `npx cap sync` 生成 `android/` 原生目录并接入 Kotlin Gradle 插件
  - Kotlin 无障碍抓屏服务 `android/app/src/main/java/com/fishcrm/app/ScreenScraperService.kt`
    - `TYPE_ACCESSIBILITY_OVERLAY` 屏幕右缘半透明「🐟」悬浮球（系统无障碍通道保活，无需 SYSTEM_ALERT_WINDOW），支持上下拖动 / 轻点触发
    - 轻点后延迟 0.1s 递归遍历 `rootInActiveWindow` 可见节点，输出 `[Y:top, X:left] 文本`
    - 结果写入 `SharedPreferences("fish_crm_queue")` 队列（最多 50 条），发送 `com.fishcrm.app.ACTION_CAPTURE_READY` 广播并 Toast
  - 服务配置与注册：`res/xml/accessibility_config.xml`（`canRetrieveWindowContent="true"` + `flagRetrieveInteractiveWindows`）、`AndroidManifest.xml` 服务声明、中文服务说明字符串
  - 原生桥 `MainActivity.kt`：注入 `window.FishNativeBridge`（`pullPendingCaptures()` 读取并清空队列、`openAccessibilitySettings()` 跳系统无障碍设置、`isAccessibilityEnabled()`），广播到达时向 WebView 派发 `fishcrm:capture-ready`
  - 前端桥接 `src/services/nativeBridge.ts`：App 启动 / 回前台 / 收到广播自动拉取抓屏文本 → `aiService.parseAndApply` 静默解析入库 → store 刷新，日历响应式更新；`aiService` 坐标正则兼容 `[Y:top, X:left]` 新格式
  - 首页顶部「🐟 开启安卓无障碍悬浮球」入口（`HomeView.vue`），安卓真机点击经 Intent 直达系统无障碍设置页，并展示服务开启状态与入库结果
  - GitHub Actions `.github/workflows/build-apk.yml`：Node 22 + JDK 21 + Android SDK，自动 `npm ci` → 构建 Web → `cap sync` → `assembleDebug` → 上传 `fishcrm-debug-apk` artifact

## 当前状态

- 当前阶段：Phase 4 已完成，四个阶段全部完工
- 最近更新：2026-10-28
- 类型检查：`npx vue-tsc --noEmit` 通过，0 错误
- 构建验证：`npx vite build` 通过；`npx cap add android` / `npx cap sync` 执行成功
- UI 验收：日历 / 7 模块宫格 / 通用抽屉 / 关系网图谱 / AI 快速栏 / 导入导出 / 双页 Tab / 安卓无障碍悬浮球入口 均联调通过
- 安卓打包：本地未安装 Android SDK / JDK，APK 由 `.github/workflows/build-apk.yml` 在 CI 上编译并上传 artifact 下载安装
- 环境备注：Node.js v24.20.0（winget 用户级安装，终端需将 `node-v24.20.0-win-x64` 目录加入 PATH）；esbuild / vue-demi 的 install scripts 已通过 `npm install-scripts approve` 批准；Lucide 图标使用官方新包 `@lucide/vue`（旧包 lucide-vue-next 已弃用）
