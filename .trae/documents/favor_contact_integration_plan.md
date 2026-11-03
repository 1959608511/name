# 通讯录一体化与人情往来 实施计划

## Repository Research

* **数据层**：`db/core.ts` 已实现 `upsertFavor(contactId, favor)` 与 `removeFavor(contactId, favorId)`，`FavorRecord` 已有 `id/date/title/amount/direction/note` 字段；`ContactPerson.favors` 为内嵌数组。

* **Store 层**：`useCrmStore.ts` 仅有 `upsertContact/removeContact`，未暴露人情往来方法；`selectDate` 只更新 `selectedDate`；`editingId` 为单一字符串，无法同时承载 contactId + favorId。

* **UI 层**：`WorkspaceCard.vue` 仅支持单个 `action-label` 按钮（不在允许修改列表内），`ContactWidget.vue` 目前用它的 action 作为「新增联系人」入口；`ContactSheet.vue` 仅支持新建/编辑（通过 `editId`），无联系人选择器；`ActionSheetModal.vue` 的 `PanelType` 不含 `'favor'`。

* **门禁**：单文件 ≤ 450 行，组件内禁止直连 localStorage，禁止 v1 残留标识。

## Files and Modules

| 文件                                           | 变更类型 | 说明                                                                                                                                                                               |
| -------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/schema.ts`                        | 修改   | `FavorRecord` 加 `tag?: string`；`PanelType` 加 `'favor'`                                                                                                                           |
| `src/store/useCrmStore.ts`                   | 修改   | 加 `contactScope` 状态与 `setContactScope`；`selectDate` 时重置 scope；暴露 `upsertFavor/removeFavor`；加 `allFavors` 派生（全部模式倒序）；加 `historyFavorTags`；加人情编辑上下文 `favorEdit` 与 `openFavorPanel` |
| `src/services/db/core.ts`                    | 修改   | 加 `collectFavorTags(contacts)` 纯函数                                                                                                                                               |
| `src/components/ActionSheetModal.vue`        | 修改   | `PANEL_TITLE` 加 `favor`；渲染 `FavorSheet`，传入 `contactId/favorId`                                                                                                                   |
| `src/components/sheet/ContactSheet.vue`      | 修改   | 姓名框右侧加下拉箭头按钮 → 展开 `ContactPicker`；选中联系人后填充全部字段 + id；顶部显示「正在编辑：{姓名}」+「× 切回新建」                                                                                                     |
| `src/components/sheet/ContactPicker.vue`     | 新建   | 已有联系人下拉选择面板（搜索：姓名/别名/电话/标签）                                                                                                                                                      |
| `src/components/sheet/FavorSheet.vue`        | 新建   | 人情往来 4 字段表单：联系人选择、内容(title)、日期、标签；amount=0/direction='out' 静默                                                                                                                    |
| `src/components/workspace/ContactWidget.vue` | 修改   | 头部加 3 个胶囊按钮（新增/修改联系人、人情往来添加、全部）；全部模式展示所有人情倒序；点击人情行打开 FavorSheet 编辑/删除                                                                                                            |
| `src/components/RecordWorkspace.vue`         | 修改   | 透传 `favor` 相关事件                                                                                                                                                                  |

## Implementation Steps

1. **schema.ts**：`FavorRecord.tag?: string`；`PanelType` 联合加 `'favor'`。
2. **db/core.ts**：新增 `collectFavorTags(contacts): string[]`，遍历所有联系人的 favors.tag 去重排序。
3. **useCrmStore.ts**：

   * 状态：`contactScope = ref<'day'|'all'>('day')`，`favorEdit = ref<{contactId?:string; favorId?:string}|null>(null)`。

   * `setContactScope(s)`：设置 scope。

   * `selectDate(date)`：设置日期并 `contactScope.value = 'day'`。

   * `openFavorPanel(contactId?, favorId?)`：`activePanel='favor'`，写入 `favorEdit`。

   * `closePanel` 时清空 `favorEdit`。

   * `upsertFavor(contactId, favor)` / `removeFavor(contactId, favorId)`：调 db 并 `contacts.value = db...`。

   * 派生：`allFavors`（拍平所有人情，按 date 倒序，附带 contactId/contactName）；`historyFavorTags`。
4. **ActionSheetModal.vue**：标题加 `favor: '人情往来'`；`panel==='favor'` 时渲染 `<FavorSheet :date :contact-id :favor-id @close>`。
5. **ContactPicker.vue**（新建）：受控面板 `visible/selectedId`，内含搜索框 + 过滤列表（name/aliases/phone/tags 包含匹配），选中 emit `select(contact)`，支持 `@close`。
6. **ContactSheet.vue**：

   * 姓名行改为 flex：input + 箭头按钮（≥40x40，`@touchstart.stop` 切换 picker）。

   * 引入 `ContactPicker`，选中后 `Object.assign(contactForm, 全部字段 + id)`。

   * 当 `contactForm.id` 存在时，顶部显示「正在编辑：{name}」+「× 切回新建」按钮（清空 id 与字段回到新建态）。

   * 保存逻辑不变（已有 id 则更新，否则新建）。
7. **FavorSheet.vue**（新建）：

   * props: `date`, `contactId?`, `favorId?`。

   * 表单：联系人（ContactPicker 选择；若输入新姓名则保存时自动建联系人）、内容(title)、日期(默认 props.date)、标签(tag + 历史胶囊候选)。

   * 静默：amount=0, direction='out', note=''。

   * 编辑态：由 `contactId+favorId` 定位 favor，回填 4 字段；底部显示删除按钮。

   * 保存：若选已有联系人→upsertFavor；若新姓名→先 upsertContact 建联系人再 upsertFavor。
8. **ContactWidget.vue**：

   * 不再依赖 WorkspaceCard 单 action；`action-label=""` 并用 `:deep(.wc-action:empty){display:none}` 隐藏空按钮。

   * body 顶部 sticky 胶囊行：\[新增/修改联系人] \[人情往来添加] \[全部]（全部高亮当 scope==='all'）。

   * 内容：

     * day 模式：仅 `selectedDate` 当天的人情（联系人姓名 · 内容 · 标签胶囊）。

     * all 模式：`store.allFavors` 倒序，多显示日期。

   * 点击人情行 → `store.openFavorPanel(contactId, favorId)`。

   * 新增事件：`@favor` 透传给 RecordWorkspace/HomeView（或直接调 store）。
9. **RecordWorkspace.vue**：增加 `favor` 事件透传（实际 ContactWidget 直接调 store.openFavorPanel 即可，RecordWorkspace 无需改动 emit，但需确认不破坏既有契约）。
10. **校验**：`node .\node_modules\vue-tsc\bin\vue-tsc.js --noEmit && node check-gate.mjs`。

## Dependencies and Considerations

* `editingId` 单一字符串不足以承载 favor 编辑（需 contactId + favorId），故新增 `favorEdit` 状态，避免污染既有 `editingId` 语义。

* `WorkspaceCard` 不在允许修改列表，ContactWidget 用 sticky 按钮行 + `:deep()` 隐藏空 action 按钮实现 3 按钮头部。

* 人情往来「amount=0, direction='out'」静默填充，符合任务要求且不破坏既有 FavorRecord 必填字段。

* 全部模式点击日历日期自动回 day 模式：在 `store.selectDate` 中统一重置 `contactScope`。

* 单文件 450 行门禁：ContactSheet 改动较大，需控制行数；FavorSheet/ContactPicker 新建文件各自控制在 450 行内。

## Validation

* `node .\node_modules\vue-tsc\bin\vue-tsc.js --noEmit`：零类型报错。

* `node check-gate.mjs`：所有 .vue/.ts ≤ 450 行，无 localStorage 直连，无 v1 残留。

* 手动核对：ContactSheet 选择联系人后字段填充正确；FavorSheet 4 字段保存正确；全部/当日切换与日历选日联动正确。

## Risks

* **风险**：ContactWidget 直接调用 `store.openFavorPanel` 绕过 RecordWorkspace 事件链 → 处理：保持一致，ContactWidget 直接调 store（与既有 `store.upsertContact` 等一致，store 是唯一数据源）。

* **风险**：favor 编辑时 contactId 可能已变 → 处理：编辑态锁定 contactId，不允许在 FavorSheet 中切换联系人（新建态才允许选/建）。

* **风险**：`selectDate` 重置 scope 可能影响用户在全部模式下选日期的预期 → 处理：符合任务明确要求「点击日历任意日期自动退出全部模式」。

