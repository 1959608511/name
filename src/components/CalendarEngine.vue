<script setup lang="ts">
/**
 * 日历引擎：连续周滑动窗口 + 三形态动态视口
 * - 全屏态网格上下 1:1 跟手 + rAF 纯惯性（滑到哪停到哪，再次触摸立即刹停）
 * - 窄条态横向 1:1 跟手 + 纯惯性（无跳周、无吸附、不自动修改 selectedDate）
 * - 滑动与选中彻底解耦：仅单击日期格才更新选中
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { DaySummary, ISODate } from '../types/schema';
import {
  addDaysISO, addMonths, buildStripDays, buildWeekRow, capsuleOpacity, collapseRatio,
  diffDays, firstWeekStartOfMonth, isStripHeight, monthKeyOf, parseISO, rowHeightFor,
  weekStartOf, type CalendarGeometry, type DayCell,
} from '../utils/calendarHelper';
import { useCrmStore } from '../store/useCrmStore';
import CalendarCell from './CalendarCell.vue';

const props = defineProps<{
  calendarHeight: number;
  geometry: CalendarGeometry;
  isResizing: boolean;
  selectedDate: ISODate;
  today: ISODate;
}>();
const emit = defineEmits<{
  (e: 'select', date: ISODate): void;
  (e: 'double-tap', date: ISODate): void;
  (e: 'long-press', date: ISODate): void;
  (e: 'resize', dy: number): void;
  (e: 'resize-end', vel: number): void;
  (e: 'grab'): void;
}>();

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const store = useCrmStore();
const summaryMap = computed<Record<ISODate, DaySummary>>(() => store.summaryMap);

/* ---------------- 视图锚点与滚动 ---------------- */
const initialPage = firstWeekStartOfMonth(parseISO(props.selectedDate).y, parseISO(props.selectedDate).m);
const anchorWeek = ref<ISODate>(initialPage);
const scrollRows = ref(0);
const stripAnchor = ref<ISODate>(weekStartOf(props.selectedDate));
const stripOffset = ref(0);
const stripEl = ref<HTMLElement | null>(null);

const h = computed(() => props.calendarHeight);
const g = computed(() => props.geometry);
const isStrip = computed(() => isStripHeight(h.value, g.value));
const rowH = computed(() => rowHeightFor(h.value, g.value));
const ratio = computed(() => collapseRatio(h.value, g.value));
const pillOp = computed(() => capsuleOpacity(h.value, g.value));
const visibleRows = computed(() => h.value / Math.max(1, rowH.value));

const selectedWeek = computed(() => weekStartOf(props.selectedDate));
const selectedRowIndex = computed(() => Math.round(diffDays(anchorWeek.value, selectedWeek.value) / 7));
const columnFrac = computed(() => stripOffset.value - Math.floor(stripOffset.value));

const centerDate = computed<ISODate>(() => {
  if (isStrip.value) return addDaysISO(stripAnchor.value, Math.round(stripOffset.value + 3));
  const idx = Math.round(scrollRows.value + Math.max(1, visibleRows.value) / 2);
  return addDaysISO(anchorWeek.value, idx * 7 + 3);
});
const titleText = computed(() => {
  const p = parseISO(centerDate.value);
  return `${p.y}年${String(p.m).padStart(2, '0')}月`;
});

/* 行数据只在整数行变化时重建，滚动分数位移走 transform，保证 DOM 极简 */
const baseRows = computed(() => {
  const base = Math.floor(scrollRows.value);
  const refMonth = monthKeyOf(centerDate.value);
  const list: Array<{ key: string; k: number; cells: DayCell[] }> = [];
  for (let i = -1; i <= 7; i += 1) {
    const k = base + i;
    const start = addDaysISO(anchorWeek.value, k * 7);
    list.push({ key: start, k, cells: buildWeekRow(start, props.selectedDate, props.today, refMonth) });
  }
  return list;
});
function rowTop(k: number): number {
  const shift = (selectedRowIndex.value - scrollRows.value) * ratio.value;
  return (k - scrollRows.value - shift) * rowH.value;
}

const stripBase = computed(() => {
  const base = Math.floor(stripOffset.value);
  const start = addDaysISO(stripAnchor.value, base - 1);
  return buildStripDays(start, 10, props.selectedDate, props.today);
});
function stripLeft(i: number): number {
  return ((i - 1 - columnFrac.value) * 100) / 7;
}
function summaryOf(date: ISODate): DaySummary | undefined {
  return summaryMap.value[date];
}

/* ---------------- 月份翻页 ---------------- */
function focusSelectedMonth(): void {
  const p = parseISO(props.selectedDate);
  anchorWeek.value = firstWeekStartOfMonth(p.y, p.m);
  scrollRows.value = 0;
}
function shiftMonth(delta: number): void {
  const c = parseISO(centerDate.value);
  const next = addMonths(c.y, c.m, delta);
  anchorWeek.value = firstWeekStartOfMonth(next.y, next.m);
  scrollRows.value = 0;
}
function goToday(): void {
  const p = parseISO(props.today);
  anchorWeek.value = firstWeekStartOfMonth(p.y, p.m);
  scrollRows.value = 0;
  emit('select', props.today);
}

watch(isStrip, (nowStrip, wasStrip) => {
  if (nowStrip) {
    stripAnchor.value = weekStartOf(props.selectedDate);
    stripOffset.value = diffDays(stripAnchor.value, props.selectedDate) - 3;
  } else if (wasStrip) {
    focusSelectedMonth();
  }
});
watch(
  () => h.value > g.value.H_NORMAL + 0.5,
  (over, wasOver) => {
    // 从全屏态收缩进入正常月历态：聚焦回选中日所在月，避免残留任意滚位
    if (wasOver && !over && !isStrip.value) focusSelectedMonth();
  },
);

/* ---------------- 三级手势 + 纯惯性 ---------------- */
type Gesture = 'none' | 'resize' | 'scrollY' | 'scrollX' | 'undecided';
let gesture: Gesture = 'none';
let startX = 0;
let startY = 0;
let lastX = 0;
let lastY = 0;
let lastT = 0;
let moved = false;
let startCell: ISODate | null = null;
let suppressTap = false;
let longFired = false;
let longTimer = 0;
let velResize = 0;
let velY = 0;
let velX = 0;
let momentum: { axis: 'y' | 'x'; vel: number } | null = null;
let rafId = 0;
let lastTap: { date: ISODate; time: number } | null = null;

function clampRows(v: number): number {
  return Math.max(-3000, Math.min(3000, v));
}
function clampOffset(v: number): number {
  return Math.max(-20000, Math.min(20000, v));
}
function stopMomentum(): boolean {
  const wasActive = momentum !== null;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  momentum = null;
  return wasActive;
}
function startMomentum(axis: 'y' | 'x', vel: number): void {
  if (Math.abs(vel) < 0.0012) return;
  momentum = { axis, vel };
  const step = (): void => {
    if (!momentum) return;
    momentum.vel *= 0.95;
    if (Math.abs(momentum.vel) < 0.00035) {
      momentum = null;
      rafId = 0;
      return;
    }
    const delta = momentum.vel * 16;
    if (momentum.axis === 'y') scrollRows.value = clampRows(scrollRows.value + delta);
    else stripOffset.value = clampOffset(stripOffset.value + delta);
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}
function stopLongPress(): void {
  if (longTimer) {
    window.clearTimeout(longTimer);
    longTimer = 0;
  }
}
function onTouchStart(e: TouchEvent): void {
  const t = e.touches[0];
  if (!t) return;
  const wasMoving = stopMomentum();
  emit('grab');
  suppressTap = wasMoving;
  longFired = false;
  moved = false;
  gesture = 'none';
  startCell = null;
  startX = t.clientX;
  startY = t.clientY;
  lastX = startX;
  lastY = startY;
  lastT = performance.now();
  const target = e.target as HTMLElement | null;
  if (target && typeof target.closest === 'function') {
    if (target.closest('.ce-bar') || target.closest('.ce-weekdays')) return;
    const cellNode = target.closest('[data-date]') as HTMLElement | null;
    startCell = cellNode ? cellNode.getAttribute('data-date') : null;
    if (target.closest('.ce-handle')) gesture = 'resize';
    else if (isStrip.value) gesture = 'undecided';
    else gesture = h.value > g.value.H_NORMAL + 0.5 ? 'scrollY' : 'resize';
  }
  velResize = 0;
  velY = 0;
  velX = 0;
  if (startCell && !suppressTap) {
    longTimer = window.setTimeout(() => {
      longTimer = 0;
      if (moved || !startCell) return;
      longFired = true;
      emit('long-press', startCell);
    }, 450);
  }
}
function onTouchMove(e: TouchEvent): void {
  const t = e.touches[0];
  if (!t) return;
  const totalDx = t.clientX - startX;
  const totalDy = t.clientY - startY;
  if (!moved && (Math.abs(totalDx) > 8 || Math.abs(totalDy) > 8)) {
    moved = true;
    stopLongPress();
  }
  if (!moved) return;
  if (gesture === 'undecided') gesture = Math.abs(totalDx) > Math.abs(totalDy) ? 'scrollX' : 'resize';
  const dx = t.clientX - lastX;
  const dy = t.clientY - lastY;
  const now = performance.now();
  const dt = Math.max(1, now - lastT);
  if (gesture === 'resize') {
    if (dy) {
      emit('resize', dy);
      velResize = dy / dt;
    }
  } else if (gesture === 'scrollY') {
    if (dy) {
      velY = -dy / rowH.value / dt;
      scrollRows.value = clampRows(scrollRows.value - dy / rowH.value);
    }
  } else if (gesture === 'scrollX') {
    const width = stripEl.value?.getBoundingClientRect().width ?? 0;
    const cellW = width > 0 ? width / 7 : 1;
    if (dx) {
      velX = -dx / cellW / dt;
      stripOffset.value = clampOffset(stripOffset.value - dx / cellW);
    }
  }
  lastX = t.clientX;
  lastY = t.clientY;
  lastT = now;
}
function handleTap(date: ISODate): void {
  const now = Date.now();
  if (lastTap && lastTap.date === date && now - lastTap.time < 280) {
    lastTap = null;
    emit('double-tap', date);
    return;
  }
  lastTap = { date, time: now };
  emit('select', date);
}
function onTouchEnd(): void {
  stopLongPress();
  if (moved) {
    if (gesture === 'resize') emit('resize-end', velResize);
    else if (gesture === 'scrollY') startMomentum('y', velY);
    else if (gesture === 'scrollX') startMomentum('x', velX);
  } else if (!longFired && !suppressTap && startCell) {
    handleTap(startCell);
  }
  gesture = 'none';
  moved = false;
  startCell = null;
  suppressTap = false;
}

onBeforeUnmount(() => {
  stopMomentum();
  stopLongPress();
});
</script>

<template>
  <div
    class="ce-root"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
  >
    <div class="ce-bar">
      <span class="ce-title">{{ titleText }}</span>
      <div v-if="!isStrip" class="ce-actions">
        <button class="ce-btn" type="button" @click="shiftMonth(-1)">‹ 上月</button>
        <button class="ce-btn ce-btn-today" type="button" @click="goToday">今天</button>
        <button class="ce-btn" type="button" @click="shiftMonth(1)">下月 ›</button>
      </div>
    </div>
    <div class="ce-weekdays">
      <span v-for="w in WEEK_LABELS" :key="w" class="ce-weekday">{{ w }}</span>
    </div>
    <div class="ce-viewport" :style="{ height: calendarHeight + 'px' }">
      <div v-if="isStrip" ref="stripEl" class="ce-strip">
        <CalendarCell
          v-for="(cell, i) in stripBase"
          :key="cell.date"
          class="ce-strip-cell"
          :style="{ left: stripLeft(i) + '%' }"
          :cell="cell"
          :summary="summaryOf(cell.date)"
          mode="strip"
          :pill-opacity="0"
        />
      </div>
      <div v-else class="ce-grid">
        <div
          v-for="row in baseRows"
          :key="row.key"
          class="ce-row"
          :style="{ height: rowH + 'px', transform: `translate3d(0, ${rowTop(row.k)}px, 0)` }"
        >
          <CalendarCell
            v-for="cell in row.cells"
            :key="cell.date"
            :cell="cell"
            :summary="summaryOf(cell.date)"
            :mode="pillOp > 0.02 ? 'full' : 'normal'"
            :pill-opacity="pillOp"
          />
        </div>
      </div>
    </div>
    <div class="ce-handle" :class="{ 'ce-handle-active': isResizing }">
      <div class="ce-handle-bar" />
    </div>
  </div>
</template>

<style scoped>
.ce-root {
  display: flex; flex-direction: column; height: 100%; background: #fff; overflow: hidden;
  touch-action: none; -webkit-touch-callout: none;
}
.ce-bar {
  height: 40px; flex-shrink: 0; padding: 0 10px;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid #f1f5f9;
}
.ce-title { font-size: 15px; font-weight: 600; color: #1e293b; letter-spacing: 0.5px; }
.ce-actions { display: flex; gap: 5px; }
.ce-btn {
  border: 1px solid #e2e8f0; background: #f8fafc; color: #475569;
  font-size: 11px; padding: 3px 8px; border-radius: 8px; line-height: 1.5;
  -webkit-tap-highlight-color: transparent;
}
.ce-btn-today { color: #4f46e5; border-color: #c7d2fe; background: #eef2ff; }
.ce-weekdays {
  height: 24px; flex-shrink: 0; display: grid;
  grid-template-columns: repeat(7, 1fr); align-items: center;
}
.ce-weekday { text-align: center; font-size: 11px; color: #94a3b8; }
.ce-viewport { position: relative; flex-shrink: 0; overflow: hidden; }
.ce-grid { position: absolute; inset: 0; overflow: hidden; will-change: transform; }
.ce-row {
  position: absolute; left: 0; right: 0; top: 0; display: grid;
  grid-template-columns: repeat(7, 1fr); will-change: transform;
}
.ce-strip { position: absolute; inset: 0; overflow: hidden; }
.ce-strip-cell { position: absolute; top: 0; width: 14.2857%; height: 100%; }
.ce-handle {
  height: 22px; flex-shrink: 0; display: flex;
  align-items: center; justify-content: center; background: #fff;
}
.ce-handle-active .ce-handle-bar { background: #6366f1; }
.ce-handle-bar { width: 36px; height: 4px; border-radius: 2px; background: #cbd5e1; }
</style>
