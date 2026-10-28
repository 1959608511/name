<script setup lang="ts">
/**
 * 第一页：顶部人际日历 + 底部 7 大功能模块宫格 + 通用抽屉 + AI 快速栏
 * 头部提供数据互通：导出 JSON 备份 / 导入 JSON 恢复 / 导出 CSV 账单
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Download, FileSpreadsheet, Fish, Upload } from '@lucide/vue'
import { useCrmStore } from '@/store/useCrmStore'
import {
  initNativeBridge,
  isAccessibilityEnabled,
  isAndroidNative,
  openAccessibilitySettings,
  type CaptureDrainResult,
} from '@/services/nativeBridge'
import AiQuickBar from '@/components/AiQuickBar.vue'
import CalendarHeatmap from '@/components/CalendarHeatmap.vue'
import ModuleGrid from '@/components/ModuleGrid.vue'
import UnifiedDrawer from '@/components/UnifiedDrawer.vue'
import type { ModuleKey } from '@/types/schema'

const crm = useCrmStore()

const activeModule = ref<ModuleKey | null>(null)

// ---------- 安卓无障碍悬浮球 ----------
const nativeSupported = isAndroidNative()
const accessibilityOn = ref(false)
const nativeTip = ref<string | null>(null)
let nativeTipTimer: ReturnType<typeof setTimeout> | undefined
let disposeNativeBridge: (() => void) | null = null

function showNativeTip(text: string): void {
  nativeTip.value = text
  if (nativeTipTimer) clearTimeout(nativeTipTimer)
  nativeTipTimer = setTimeout(() => {
    nativeTip.value = null
  }, 6000)
}

function refreshAccessibilityState(): void {
  accessibilityOn.value = isAccessibilityEnabled()
}

function onCaptureDrained(result: CaptureDrainResult): void {
  showNativeTip(
    `🐟 已从微信抓屏入库 ${result.applied} 条${result.skipped > 0 ? `，跳过 ${result.skipped} 条` : ''}`,
  )
  refreshAccessibilityState()
}

function enableAccessibilityBall(): void {
  if (openAccessibilitySettings()) {
    showNativeTip('已跳转系统无障碍设置，请找到「我是鱼人际 · 抓屏」并开启')
  } else if (nativeSupported) {
    showNativeTip('无法打开系统设置，请手动前往：设置 → 无障碍 → 我是鱼人际')
  } else {
    showNativeTip('该功能仅在安卓 App 内可用，请安装 APK 后使用')
  }
}

onMounted(() => {
  crm.init()
  refreshAccessibilityState()
  disposeNativeBridge = initNativeBridge(onCaptureDrained)
  window.addEventListener('focus', refreshAccessibilityState)
  document.addEventListener('visibilitychange', refreshAccessibilityState)
})

onBeforeUnmount(() => {
  disposeNativeBridge?.()
  window.removeEventListener('focus', refreshAccessibilityState)
  document.removeEventListener('visibilitychange', refreshAccessibilityState)
  if (nativeTipTimer) clearTimeout(nativeTipTimer)
})

const now = new Date()
const monthKey = `${now.getFullYear()}-${now.getMonth() + 1 < 10 ? `0${now.getMonth() + 1}` : now.getMonth() + 1}`

const monthStats = computed(() => {
  let events = 0
  let net = 0
  for (const record of crm.records) {
    if (!record.eventDate.startsWith(monthKey)) continue
    events += 1
    net += record.amount
  }
  return { events, net }
})

function signedMoney(value: number): string {
  if (value === 0) return '¥0'
  return `${value > 0 ? '+' : '-'}¥${Math.abs(value).toLocaleString('zh-CN')}`
}

function openModule(key: ModuleKey): void {
  activeModule.value = key
}

function closeDrawer(): void {
  activeModule.value = null
}

// ---------- 数据导入导出 ----------
const importInput = ref<HTMLInputElement | null>(null)

function dateStamp(): string {
  const d = new Date()
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportJson(): void {
  downloadFile(`fishcrm-backup-${dateStamp()}.json`, crm.exportAllToJson(), 'application/json')
}

function exportCsv(): void {
  downloadFile(`fishcrm-records-${dateStamp()}.csv`, crm.exportRecordsToCsv(), 'text/csv;charset=utf-8')
}

function triggerImport(): void {
  importInput.value?.click()
}

async function onImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    crm.importFromJson(await file.text())
    window.alert('导入成功，数据已恢复')
  } catch (err) {
    window.alert(err instanceof Error ? `导入失败：${err.message}` : '导入失败：文件格式不正确')
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-800">
    <header class="border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div class="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4 sm:px-6">
        <span
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 text-white shadow-lg shadow-cyan-500/20"
        >
          <Fish class="h-6 w-6" />
        </span>
        <div class="min-w-0 flex-1">
          <h1 class="text-lg font-bold tracking-tight text-slate-800">FishCRM</h1>
          <p class="truncate text-xs text-slate-400">人际关系管理 · 把在意的人放在心上</p>
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          <div class="hidden rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-500 sm:block">
            本月 {{ monthStats.events }} 条 · 净收支
            <span
              class="font-semibold"
              :class="monthStats.net >= 0 ? 'text-emerald-600' : 'text-rose-600'"
            >
              {{ signedMoney(monthStats.net) }}
            </span>
          </div>
          <button
            type="button"
            title="导出 JSON 备份"
            class="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-cyan-300 hover:text-cyan-600"
            @click="exportJson"
          >
            <Download class="h-4 w-4" />
          </button>
          <button
            type="button"
            title="导入 JSON 恢复"
            class="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-cyan-300 hover:text-cyan-600"
            @click="triggerImport"
          >
            <Upload class="h-4 w-4" />
          </button>
          <button
            type="button"
            title="导出 CSV 账单"
            class="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-cyan-300 hover:text-cyan-600"
            @click="exportCsv"
          >
            <FileSpreadsheet class="h-4 w-4" />
          </button>
          <input
            ref="importInput"
            type="file"
            accept="application/json,.json"
            class="hidden"
            @change="onImportFile"
          />
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-4xl space-y-6 px-4 py-6 pb-32 sm:px-6">
      <!-- 安卓无障碍抓屏入口 -->
      <section
        class="flex items-center gap-3 rounded-2xl border border-cyan-100 bg-gradient-to-r from-cyan-50 to-teal-50 px-4 py-3"
      >
        <span
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xl shadow-sm"
        >
          🐟
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-slate-700">微信抓屏 · 安卓无障碍悬浮球</p>
          <p class="truncate text-[11px] text-slate-500">
            {{
              accessibilityOn
                ? '服务已开启：在微信界面轻点「🐟」即可抓屏，回到 App 自动入库'
                : '开启后屏幕边缘出现「🐟」，轻点抓取当前聊天 / 转账界面可见文字'
            }}
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-cyan-500/30 transition hover:opacity-90"
          @click="enableAccessibilityBall"
        >
          <span class="sm:hidden">🐟 开启</span>
          <span class="hidden sm:inline">🐟 开启安卓无障碍悬浮球</span>
        </button>
      </section>

      <p
        v-if="nativeTip"
        class="rounded-xl bg-slate-800/90 px-4 py-2 text-xs leading-relaxed text-white shadow-lg"
      >
        {{ nativeTip }}
      </p>

      <CalendarHeatmap />

      <ModuleGrid :active-module="activeModule" @select="openModule" />

      <p class="pb-4 text-center text-[11px] text-slate-400">
        所有模块共用 persons / records / relations 三张表
      </p>
    </main>

    <AiQuickBar />

    <UnifiedDrawer :active-module="activeModule" @close="closeDrawer" />
  </div>
</template>
