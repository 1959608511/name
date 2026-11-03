<script setup lang="ts">
// 设置中心：数据备份（JSON / CSV 导入导出，均支持用户指定位置）+ 无障碍入口
import { computed, ref } from 'vue';
import { useCrmStore } from '../store/useCrmStore';
import {
  exportFile,
  isAccessibilityEnabled,
  openAccessibilitySettings,
  pickFile,
} from '../services/nativeBridge';
import {
  exportContactsCSV,
  exportJSON,
  exportLedgerCSV,
  importContactsCSV,
  importJSON,
  importLedgerCSV,
  todayStr,
} from '../services/dbService';

type BackupFormat = 'json' | 'ledger-csv' | 'contacts-csv';

const store = useCrmStore();
const total = computed(
  () => store.contacts.length + store.ledger.length + store.diaries.length + store.todos.length,
);
const a11yText = computed(() => (isAccessibilityEnabled() ? '已开启' : '未开启'));

const stamp = todayStr().replace(/-/g, '');
const FORMAT_META: Record<BackupFormat, { ext: string; mime: string; hint: string }> = {
  json: {
    ext: 'json',
    mime: 'application/json',
    hint: '全量覆盖式恢复：须为本 App 导出的 .json 备份，导入后替换当前全部数据',
  },
  'ledger-csv': {
    ext: 'csv',
    mime: 'text/csv',
    hint: '追加式导入：按「日期+类别+金额+备注」自动去重，表头可省略',
  },
  'contacts-csv': {
    ext: 'csv',
    mime: 'text/csv',
    hint: '追加式导入：按「姓名」自动去重，人情往来明细请走 JSON 备份',
  },
};
const defaultName = (f: BackupFormat): string =>
  `fishcrm-${f === 'json' ? 'backup' : f === 'ledger-csv' ? 'ledger' : 'contacts'}-${stamp}.${FORMAT_META[f].ext}`;

const exportFormat = ref<BackupFormat>('json');
const exportName = ref(defaultName('json'));
const importFormat = ref<BackupFormat>('json');
const busy = ref(false);
const message = ref('');

function onExportFormatChange(): void {
  exportName.value = defaultName(exportFormat.value);
}

async function doExport(): Promise<void> {
  if (busy.value) return;
  const meta = FORMAT_META[exportFormat.value];
  const content =
    exportFormat.value === 'json'
      ? exportJSON()
      : exportFormat.value === 'ledger-csv'
        ? exportLedgerCSV()
        : exportContactsCSV();
  let name = exportName.value.trim() || defaultName(exportFormat.value);
  if (!name.toLowerCase().endsWith(`.${meta.ext}`)) name = `${name}.${meta.ext}`;
  busy.value = true;
  const ok = await exportFile(name, meta.mime, content);
  busy.value = false;
  message.value = ok ? `已导出：${name}` : '已取消导出';
}

async function doImport(): Promise<void> {
  if (busy.value) return;
  const meta = FORMAT_META[importFormat.value];
  busy.value = true;
  const file = await pickFile(`.${meta.ext}`);
  if (!file) {
    busy.value = false;
    message.value = '已取消导入';
    return;
  }
  if (importFormat.value === 'json') {
    if (!window.confirm('JSON 导入将【覆盖】当前全部数据，建议先导出备份。确定继续吗？')) {
      busy.value = false;
      message.value = '已取消导入';
      return;
    }
    const ok = importJSON(file.content);
    if (ok) store.loadAll();
    message.value = ok ? `已从 ${file.name} 恢复全量数据` : `${file.name} 不是合法的 FishCRM 备份文件`;
  } else {
    const r =
      importFormat.value === 'ledger-csv'
        ? importLedgerCSV(file.content)
        : importContactsCSV(file.content);
    store.loadAll();
    message.value = `已从 ${file.name} 导入：新增 ${r.added} 条，跳过 ${r.skipped} 条（重复或格式不符）`;
  }
  busy.value = false;
}
</script>

<template>
  <section class="flex h-full flex-col gap-4 overflow-y-auto p-4">
    <header>
      <h1 class="text-xl font-semibold text-slate-800">设置中心</h1>
      <p class="mt-1 text-sm text-slate-500">数据总量 {{ total }} 条 · 无障碍 {{ a11yText }}</p>
    </header>

    <!-- 导出 -->
    <div class="rounded-2xl bg-white p-4 shadow-sm">
      <h2 class="text-sm font-semibold text-slate-700">导出备份</h2>
      <select
        v-model="exportFormat"
        class="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"
        @change="onExportFormatChange"
      >
        <option value="json">JSON（全量备份，可完整恢复）</option>
        <option value="ledger-csv">CSV（记账流水，Excel 可读）</option>
        <option value="contacts-csv">CSV（通讯录，Excel 可读）</option>
      </select>
      <input
        v-model="exportName"
        type="text"
        placeholder="文件名（保存时可改目录）"
        class="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"
      />
      <button
        class="mt-3 w-full rounded-xl bg-emerald-500 py-2 text-sm font-medium text-white active:opacity-80 disabled:opacity-40"
        :disabled="busy"
        @click="doExport"
      >
        选择位置并导出
      </button>
    </div>

    <!-- 导入 -->
    <div class="rounded-2xl bg-white p-4 shadow-sm">
      <h2 class="text-sm font-semibold text-slate-700">导入恢复</h2>
      <select
        v-model="importFormat"
        class="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"
      >
        <option value="json">JSON（全量恢复，覆盖现有数据）</option>
        <option value="ledger-csv">CSV（记账流水，追加导入）</option>
        <option value="contacts-csv">CSV（通讯录，追加导入）</option>
      </select>
      <p class="mt-2 text-xs leading-5 text-slate-400">{{ FORMAT_META[importFormat].hint }}</p>
      <button
        class="mt-3 w-full rounded-xl bg-sky-500 py-2 text-sm font-medium text-white active:opacity-80 disabled:opacity-40"
        :disabled="busy"
        @click="doImport"
      >
        选择文件导入
      </button>
    </div>

    <p v-if="message" class="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600">{{ message }}</p>

    <!-- 无障碍 -->
    <div class="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
      <div>
        <h2 class="text-sm font-semibold text-slate-700">无障碍抓屏服务</h2>
        <p class="mt-1 text-xs text-slate-400">状态：{{ a11yText }}</p>
      </div>
      <button
        class="rounded-xl bg-slate-800 px-4 py-2 text-sm text-white active:opacity-80"
        @click="openAccessibilitySettings"
      >
        去开启
      </button>
    </div>
  </section>
</template>
