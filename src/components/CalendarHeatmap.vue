<script setup lang="ts">
/**
 * 顶部人际日历图
 *
 * 数据来源：useCrmStore 中的 records（与日历聚合同源，保证增删后实时刷新）。
 * 当日有事件时显示彩色圆点 + 净收支小字；点击日期向下平滑展开当日流水卡片。
 */
import { computed, ref } from 'vue'
import { CalendarDays, Trash, X } from '@lucide/vue'
import { useCrmStore } from '@/store/useCrmStore'
import type { CrmRecord, RecordType } from '@/types/schema'

const crm = useCrmStore()

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

const now = new Date()
const year = now.getFullYear()
const month = now.getMonth()
const monthKey = `${year}-${pad2(month + 1)}`
const todayKey = `${monthKey}-${pad2(now.getDate())}`

const weekLabels = ['日', '一', '二', '三', '四', '五', '六']

const TYPE_LABEL: Record<RecordType, string> = { idea: '想法', gift: '礼物', ledger: '记账' }
const TYPE_CLASS: Record<RecordType, string> = {
  idea: 'bg-amber-50 text-amber-600',
  gift: 'bg-rose-50 text-rose-600',
  ledger: 'bg-emerald-50 text-emerald-600',
}

interface DayCell {
  date: string
  day: number
  inMonth: boolean
  totalEvents: number
  netAmount: number
}

const selectedDate = ref<string | null>(null)

/** 当月每天的事件数 / 净收支聚合 */
const daySummary = computed(() => {
  const map = new Map<string, { totalEvents: number; netAmount: number }>()
  for (const record of crm.records) {
    if (!record.eventDate.startsWith(monthKey)) continue
    const agg = map.get(record.eventDate) ?? { totalEvents: 0, netAmount: 0 }
    agg.totalEvents += 1
    agg.netAmount += record.amount
    map.set(record.eventDate, agg)
  }
  return map
})

/** 当月整体统计 */
const monthTotals = computed(() => {
  let events = 0
  let net = 0
  for (const record of crm.records) {
    if (!record.eventDate.startsWith(monthKey)) continue
    events += 1
    net += record.amount
  }
  return { events, net }
})

/** 日历网格：前置空格 + 当月日期 */
const cells = computed<DayCell[]>(() => {
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const list: DayCell[] = []
  for (let i = 0; i < firstWeekday; i += 1) {
    list.push({ date: '', day: 0, inMonth: false, totalEvents: 0, netAmount: 0 })
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${pad2(day)}`
    const agg = daySummary.value.get(date)
    list.push({
      date,
      day,
      inMonth: true,
      totalEvents: agg?.totalEvents ?? 0,
      netAmount: agg?.netAmount ?? 0,
    })
  }
  return list
})

const selectedRecords = computed<CrmRecord[]>(() => {
  if (!selectedDate.value) return []
  return crm.records
    .filter((record) => record.eventDate === selectedDate.value)
    .sort((a, b) => b.createdAt - a.createdAt)
})

const selectedNet = computed(() =>
  selectedRecords.value.reduce((sum, record) => sum + record.amount, 0),
)

const selectedLabel = computed(() => {
  if (!selectedDate.value) return ''
  const parts = selectedDate.value.split('-')
  const weekday = weekLabels[new Date(`${selectedDate.value}T00:00:00`).getDay()]
  return `${Number(parts[0])} 年 ${Number(parts[1])} 月 ${Number(parts[2])} 日 · 周${weekday}`
})

function signedMoney(value: number): string {
  if (value === 0) return '¥0'
  return `${value > 0 ? '+' : '-'}¥${Math.abs(value).toLocaleString('zh-CN')}`
}

function amountClass(amount: number): string {
  if (amount > 0) return 'text-emerald-600'
  if (amount < 0) return 'text-rose-600'
  return 'text-slate-400'
}

function dotClass(net: number): string {
  if (net > 0) return 'bg-emerald-500'
  if (net < 0) return 'bg-rose-500'
  return 'bg-cyan-400'
}

function moneyClass(net: number): string {
  if (net > 0) return 'text-emerald-600'
  if (net < 0) return 'text-rose-600'
  return 'text-slate-400'
}

function cellClass(cell: DayCell): string {
  const base =
    'flex min-h-[64px] w-full flex-col items-start gap-1 rounded-xl border p-1.5 text-left transition sm:min-h-[78px] sm:p-2'
  if (cell.date === selectedDate.value) {
    return `${base} border-cyan-400 bg-cyan-50/80 ring-2 ring-cyan-200`
  }
  if (cell.totalEvents > 0) {
    return `${base} border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/40`
  }
  return `${base} border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white`
}

function toggleDate(cell: DayCell): void {
  if (!cell.inMonth) return
  selectedDate.value = selectedDate.value === cell.date ? null : cell.date
}
</script>

<template>
  <section class="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm sm:p-5">
    <header class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
          <CalendarDays class="h-5 w-5" />
        </span>
        <div>
          <h2 class="text-sm font-semibold text-slate-800">人际日历</h2>
          <p class="text-xs text-slate-400">{{ year }} 年 {{ month + 1 }} 月 · 点击日期查看当日流水</p>
        </div>
      </div>
      <div class="rounded-full bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">
        本月 {{ monthTotals.events }} 条 · 净收支
        <span class="font-semibold" :class="moneyClass(monthTotals.net)">
          {{ signedMoney(monthTotals.net) }}
        </span>
      </div>
    </header>

    <div class="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400">
      <div v-for="label in weekLabels" :key="label">{{ label }}</div>
    </div>

    <div class="mt-1 grid grid-cols-7 gap-1">
      <template v-for="(cell, index) in cells" :key="index">
        <button
          v-if="cell.inMonth"
          type="button"
          :class="cellClass(cell)"
          @click="toggleDate(cell)"
        >
          <span class="flex w-full items-center justify-between">
            <span
              class="text-[11px] font-medium sm:text-xs"
              :class="cell.date === todayKey ? 'text-cyan-600' : 'text-slate-600'"
            >
              {{ cell.day }}
            </span>
            <span
              v-if="cell.date === todayKey"
              class="rounded-full bg-cyan-100 px-1 text-[9px] leading-4 text-cyan-700"
            >
              今天
            </span>
          </span>

          <template v-if="cell.totalEvents > 0">
            <span class="flex items-center gap-1">
              <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="dotClass(cell.netAmount)"></span>
              <span class="text-[9px] font-medium sm:text-[10px]" :class="moneyClass(cell.netAmount)">
                {{ signedMoney(cell.netAmount) }}
              </span>
            </span>
            <span class="hidden text-[10px] text-slate-400 sm:block">{{ cell.totalEvents }} 条</span>
          </template>
        </button>
        <div v-else class="min-h-[64px] rounded-xl sm:min-h-[78px]"></div>
      </template>
    </div>

    <Transition name="expand">
      <div v-if="selectedDate" class="overflow-hidden">
        <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-sm font-semibold text-slate-700">{{ selectedLabel }}</p>
              <p class="mt-0.5 text-xs text-slate-500">
                <template v-if="selectedRecords.length > 0">
                  共 {{ selectedRecords.length }} 条 · 净收支
                  <span class="font-semibold" :class="moneyClass(selectedNet)">
                    {{ signedMoney(selectedNet) }}
                  </span>
                </template>
                <template v-else>这一天还没有人际事件</template>
              </p>
            </div>
            <button
              type="button"
              class="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-600"
              title="收起"
              @click="selectedDate = null"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <div v-if="selectedRecords.length > 0" class="mt-3 space-y-2">
            <article
              v-for="record in selectedRecords"
              :key="record.id"
              class="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-2.5"
            >
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500"
              >
                {{ record.personName.slice(0, 1) }}
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-xs font-semibold text-slate-700">{{ record.personName }}</span>
                  <span
                    class="rounded px-1.5 py-0.5 text-[10px]"
                    :class="TYPE_CLASS[record.type]"
                  >
                    {{ TYPE_LABEL[record.type] }}
                  </span>
                </div>
                <p class="truncate text-[11px] text-slate-500">{{ record.itemTitle }}</p>
              </div>
              <span
                v-if="record.type !== 'idea'"
                class="shrink-0 text-xs font-semibold"
                :class="amountClass(record.amount)"
              >
                {{ signedMoney(record.amount) }}
              </span>
              <button
                type="button"
                class="shrink-0 rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500"
                title="快捷删除"
                @click="crm.deleteRecord(record.id)"
              >
                <Trash class="h-3.5 w-3.5" />
              </button>
            </article>
          </div>

          <p v-else class="pb-1 pt-6 text-center text-[11px] text-slate-400">
            在「想法 / 礼物 / 记账」模块新增的流水会自动汇总到日历
          </p>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  overflow: hidden;
  transition: max-height 0.32s ease, opacity 0.28s ease, transform 0.28s ease;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-6px);
}

.expand-enter-to,
.expand-leave-from {
  max-height: 900px;
  opacity: 1;
  transform: translateY(0);
}
</style>
