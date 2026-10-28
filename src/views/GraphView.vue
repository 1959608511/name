<script setup lang="ts">
/**
 * 第二页：人物关系网（ECharts force 力导向图谱）
 *
 * - 以「我（SELF）」为中心高亮大节点，周围人物按状态着色
 * - 连线显示 relationLabel，粗细关联 weight（1~5）
 * - 节点可拖拽，弹簧物理回弹；点击人物节点弹出详情与流水摘要
 * - 右上角：新增/编辑关系连线、删除关系
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { Link2, Trash2, X } from '@lucide/vue'
import { useCrmStore } from '@/store/useCrmStore'
import type { PersonStatus } from '@/types/schema'

const crm = useCrmStore()

const SELF_ID = 'SELF'

const STATUS_COLORS: Record<PersonStatus, string> = {
  active: '#14b8a6',
  cutoff: '#94a3b8',
  deceased: '#a8a29e',
}

const STATUS_LABELS: Record<PersonStatus, string> = {
  active: '通讯录',
  cutoff: '不来往',
  deceased: '不在世',
}

const RECORD_TYPE_LABELS = { idea: '想法', gift: '礼物', ledger: '记账' } as const

// ---------- ECharts ----------
const chartEl = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

interface GraphNodeItem {
  id: string
  name: string
  symbolSize: number
  itemStyle: { color: string; shadowBlur?: number; shadowColor?: string }
  label: { fontSize: number; fontWeight?: number; color?: string }
}

interface GraphLinkItem {
  source: string
  target: string
  lineStyle: { width: number; color: string; opacity: number; curveness: number }
  label: { show: boolean; formatter: string; fontSize: number; color: string }
}

function buildOption(): echarts.EChartsOption {
  const { edges } = crm.getGraphData()
  const personIds = new Set(crm.persons.map((p) => p.id))

  const nodes: GraphNodeItem[] = [
    {
      id: SELF_ID,
      name: '我',
      symbolSize: 62,
      itemStyle: { color: '#0ea5e9', shadowBlur: 18, shadowColor: 'rgba(14,165,233,0.45)' },
      label: { fontSize: 15, fontWeight: 700, color: '#0c4a6e' },
    },
    ...crm.persons.map((p) => ({
      id: p.id,
      name: p.name,
      symbolSize: p.status === 'active' ? 42 : 34,
      itemStyle: { color: STATUS_COLORS[p.status] },
      label: { fontSize: 12 },
    })),
  ]

  const links: GraphLinkItem[] = []
  // 虚拟淡连线：把每个人物轻轻拉向「我」，保证 SELF 居中
  for (const p of crm.persons) {
    links.push({
      source: SELF_ID,
      target: p.id,
      lineStyle: { width: 1, color: '#cbd5e1', opacity: 0.25, curveness: 0 },
      label: { show: false, formatter: '', fontSize: 10, color: '#64748b' },
    })
  }
  // 真实关系连线：粗细关联 weight，显示 relationLabel
  for (const e of edges) {
    if (!personIds.has(e.sourcePersonId) || !personIds.has(e.targetPersonId)) continue
    links.push({
      source: e.sourcePersonId,
      target: e.targetPersonId,
      lineStyle: { width: 1 + e.weight, color: '#0e7490', opacity: 0.8, curveness: 0.12 },
      label: { show: true, formatter: e.relationLabel, fontSize: 11, color: '#475569' },
    })
  }

  return {
    animationDuration: 800,
    series: [
      {
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        data: nodes,
        links,
        force: { repulsion: 340, edgeLength: [90, 200], gravity: 0.08, friction: 0.15 },
        label: { show: true, position: 'bottom' },
        emphasis: { focus: 'adjacency' },
      },
    ],
  }
}

function renderChart(): void {
  chart?.setOption(buildOption(), true)
}

function onChartClick(params: unknown): void {
  const p = params as { dataType?: string; data?: { id?: string } }
  if (p.dataType === 'node' && p.data?.id && p.data.id !== SELF_ID) {
    selectedPersonId.value = p.data.id
  }
}

function onResize(): void {
  chart?.resize()
}

onMounted(() => {
  if (chartEl.value) {
    chart = echarts.init(chartEl.value)
    chart.on('click', onChartClick)
    renderChart()
  }
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  chart?.dispose()
  chart = null
})

watch(
  () => [crm.persons, crm.relations],
  () => renderChart(),
  { deep: true },
)

// ---------- 人物详情弹层 ----------
const selectedPersonId = ref<string | null>(null)

const selectedPerson = computed(() =>
  selectedPersonId.value ? crm.persons.find((p) => p.id === selectedPersonId.value) ?? null : null,
)

const selectedRecords = computed(() =>
  selectedPersonId.value ? crm.getRecordsByFilter({ personId: selectedPersonId.value }) : [],
)

const selectedNet = computed(() => selectedRecords.value.reduce((sum, r) => sum + r.amount, 0))

const selectedRelations = computed(() => {
  if (!selectedPersonId.value) return []
  return crm.relations
    .filter((e) => e.sourcePersonId === selectedPersonId.value || e.targetPersonId === selectedPersonId.value)
    .map((e) => {
      const otherId = e.sourcePersonId === selectedPersonId.value ? e.targetPersonId : e.sourcePersonId
      return { id: e.id, label: e.relationLabel, otherName: personNameOf(otherId) }
    })
})

function personNameOf(id: string): string {
  if (id === SELF_ID) return '我'
  return crm.persons.find((p) => p.id === id)?.name ?? '未知'
}

function signedMoney(value: number): string {
  if (value === 0) return '¥0'
  return `${value > 0 ? '+' : '-'}¥${Math.abs(value).toLocaleString('zh-CN')}`
}

// ---------- 新增/编辑关系连线 ----------
const showEdit = ref(false)
const editForm = reactive({ sourcePersonId: '', targetPersonId: '', relationLabel: '', weight: 3 })
const editError = ref('')

function openEdit(): void {
  const [first, second] = crm.persons
  editForm.sourcePersonId = first?.id ?? ''
  editForm.targetPersonId = second?.id ?? first?.id ?? ''
  editForm.relationLabel = ''
  editForm.weight = 3
  editError.value = ''
  showEdit.value = true
}

function saveEdit(): void {
  if (!editForm.sourcePersonId || !editForm.targetPersonId) {
    editError.value = '请选择两端人物'
    return
  }
  if (editForm.sourcePersonId === editForm.targetPersonId) {
    editError.value = '两端不能是同一人物'
    return
  }
  crm.upsertRelation({
    sourcePersonId: editForm.sourcePersonId,
    targetPersonId: editForm.targetPersonId,
    relationLabel: editForm.relationLabel.trim() || '认识',
    weight: editForm.weight,
  })
  showEdit.value = false
}

// ---------- 删除关系 ----------
const showDelete = ref(false)

function removeRelation(id: string): void {
  crm.deleteRelation(id)
  if (crm.relations.length === 0) showDelete.value = false
}
</script>

<template>
  <div class="relative flex h-[calc(100vh-3.5rem)] flex-col bg-slate-50">
    <header class="flex items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
      <div class="min-w-0">
        <h2 class="text-base font-bold tracking-tight text-slate-800">人物关系网</h2>
        <p class="truncate text-xs text-slate-400">
          {{ crm.persons.length }} 位人物 · {{ crm.relations.length }} 条关系连线（可拖拽节点）
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-cyan-500/25 transition hover:opacity-90"
          @click="openEdit"
        >
          <Link2 class="h-3.5 w-3.5" />
          新增/编辑关系连线
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:text-rose-600"
          @click="showDelete = true"
        >
          <Trash2 class="h-3.5 w-3.5" />
          删除关系
        </button>
      </div>
    </header>

    <div ref="chartEl" class="min-h-0 flex-1" />

    <!-- 图例 -->
    <div class="pointer-events-none absolute bottom-3 left-4 flex flex-wrap gap-3 text-[11px] text-slate-500">
      <span class="flex items-center gap-1"><i class="h-2.5 w-2.5 rounded-full bg-[#0ea5e9]" />我</span>
      <span class="flex items-center gap-1"><i class="h-2.5 w-2.5 rounded-full bg-[#14b8a6]" />通讯录</span>
      <span class="flex items-center gap-1"><i class="h-2.5 w-2.5 rounded-full bg-[#94a3b8]" />不来往</span>
      <span class="flex items-center gap-1"><i class="h-2.5 w-2.5 rounded-full bg-[#a8a29e]" />不在世</span>
      <span class="text-slate-400">连线越粗 = 亲密度越高</span>
    </div>

    <!-- 人物详情弹层 -->
    <div
      v-if="selectedPerson"
      class="absolute right-4 top-20 z-10 w-72 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur"
    >
      <div class="mb-2 flex items-start justify-between">
        <div>
          <h3 class="text-base font-bold text-slate-800">{{ selectedPerson.name }}</h3>
          <span
            class="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px]"
            :class="{
              'bg-cyan-50 text-cyan-600': selectedPerson.status === 'active',
              'bg-slate-100 text-slate-500': selectedPerson.status === 'cutoff',
              'bg-stone-100 text-stone-500': selectedPerson.status === 'deceased',
            }"
          >
            {{ STATUS_LABELS[selectedPerson.status] }}
          </span>
        </div>
        <button type="button" class="rounded-full p-1 text-slate-400 hover:bg-slate-100" @click="selectedPersonId = null">
          <X class="h-4 w-4" />
        </button>
      </div>

      <div v-if="selectedPerson.skills.length" class="mb-2 flex flex-wrap gap-1">
        <span
          v-for="skill in selectedPerson.skills"
          :key="skill"
          class="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] text-teal-600"
        >
          {{ skill }}
        </span>
      </div>
      <p v-if="selectedPerson.note" class="mb-2 text-xs leading-relaxed text-slate-500">{{ selectedPerson.note }}</p>

      <div v-if="selectedRelations.length" class="mb-2 text-xs text-slate-500">
        关系：
        <span v-for="rel in selectedRelations" :key="rel.id" class="mr-2">
          {{ rel.otherName }}（{{ rel.label }}）
        </span>
      </div>

      <div class="border-t border-slate-100 pt-2">
        <p class="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
          流水摘要（{{ selectedRecords.length }} 条）
          <span :class="selectedNet >= 0 ? 'text-emerald-600' : 'text-rose-600'">{{ signedMoney(selectedNet) }}</span>
        </p>
        <ul class="max-h-40 space-y-1 overflow-y-auto">
          <li
            v-for="record in selectedRecords"
            :key="record.id"
            class="flex items-center justify-between gap-2 text-xs text-slate-600"
          >
            <span class="truncate">
              <span class="mr-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">{{ RECORD_TYPE_LABELS[record.type] }}</span>
              {{ record.itemTitle }}
            </span>
            <span
              class="shrink-0 font-medium"
              :class="record.amount === 0 ? 'text-slate-400' : record.amount > 0 ? 'text-emerald-600' : 'text-rose-600'"
            >
              {{ signedMoney(record.amount) }}
            </span>
          </li>
          <li v-if="!selectedRecords.length" class="text-xs text-slate-400">暂无流水记录</li>
        </ul>
      </div>
    </div>

    <!-- 新增/编辑关系连线弹窗 -->
    <Teleport to="body">
      <div
        v-if="showEdit"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        @click.self="showEdit = false"
      >
        <div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-sm font-bold text-slate-800">新增 / 编辑关系连线</h3>
            <button type="button" class="rounded-full p-1 text-slate-400 hover:bg-slate-100" @click="showEdit = false">
              <X class="h-4 w-4" />
            </button>
          </div>
          <div class="space-y-3">
            <label class="block">
              <span class="mb-1 block text-xs text-slate-500">人物 A</span>
              <select v-model="editForm.sourcePersonId" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none">
                <option v-for="p in crm.persons" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-xs text-slate-500">人物 B</span>
              <select v-model="editForm.targetPersonId" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none">
                <option v-for="p in crm.persons" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-xs text-slate-500">关系标签（如 发小 / 客户 / 球友）</span>
              <input
                v-model="editForm.relationLabel"
                type="text"
                placeholder="认识"
                class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
              />
            </label>
            <label class="block">
              <span class="mb-1 block text-xs text-slate-500">亲密度权重：{{ editForm.weight }}（1~5，连线越粗）</span>
              <input v-model.number="editForm.weight" type="range" min="1" max="5" step="1" class="w-full accent-cyan-500" />
            </label>
            <p v-if="editError" class="text-xs text-rose-600">{{ editError }}</p>
          </div>
          <button
            type="button"
            class="mt-4 w-full rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 py-2 text-sm font-semibold text-white shadow-md shadow-cyan-500/30 transition hover:opacity-90"
            @click="saveEdit"
          >
            保存关系
          </button>
        </div>
      </div>
    </Teleport>

    <!-- 删除关系弹窗 -->
    <Teleport to="body">
      <div
        v-if="showDelete"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        @click.self="showDelete = false"
      >
        <div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-sm font-bold text-slate-800">删除关系连线</h3>
            <button type="button" class="rounded-full p-1 text-slate-400 hover:bg-slate-100" @click="showDelete = false">
              <X class="h-4 w-4" />
            </button>
          </div>
          <ul class="max-h-72 space-y-2 overflow-y-auto">
            <li
              v-for="e in crm.relations"
              :key="e.id"
              class="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm"
            >
              <span class="min-w-0 truncate text-slate-700">
                {{ personNameOf(e.sourcePersonId) }} — {{ personNameOf(e.targetPersonId) }}
                <span class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                  {{ e.relationLabel }} · {{ e.weight }}
                </span>
              </span>
              <button
                type="button"
                class="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                @click="removeRelation(e.id)"
              >
                <Trash2 class="h-4 w-4" />
              </button>
            </li>
            <li v-if="!crm.relations.length" class="py-6 text-center text-xs text-slate-400">暂无关系连线</li>
          </ul>
        </div>
      </div>
    </Teleport>
  </div>
</template>
