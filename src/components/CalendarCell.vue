<script setup lang="ts">
/** 单个日期格：全屏态纵向缩略胶囊 / 正常态圆点 / 窄条态紧凑行 */
import { computed } from 'vue';
import type { DaySummary } from '../types/schema';
import type { DayCell } from '../utils/calendarHelper';

const props = defineProps<{
  cell: DayCell;
  summary?: DaySummary;
  mode: 'full' | 'normal' | 'strip';
  pillOpacity: number;
}>();

const pills = computed(() => props.summary?.capsules ?? []);
const shownPills = computed(() => pills.value.slice(0, 3));
const extraPills = computed(() => Math.max(0, pills.value.length - 3));
const dots = computed<string[]>(() => {
  const s = props.summary;
  const out: string[] = [];
  if (!s) return out;
  if (s.hasDiary) out.push('dot-indigo');
  if (s.undoneTodosCount > 0) out.push('dot-amber');
  if (s.netAmount !== 0) out.push(s.netAmount > 0 ? 'dot-green' : 'dot-rose');
  return out;
});
const showPills = computed(() => props.mode === 'full' && props.pillOpacity > 0.02 && pills.value.length > 0);
</script>

<template>
  <div
    class="cc"
    :class="{
      'cc-other': !cell.isCurrentMonth,
      'cc-today': cell.isToday,
      'cc-selected': cell.isSelected,
      'cc-strip': mode === 'strip',
    }"
    :data-date="cell.date"
  >
    <div class="cc-top">
      <span class="cc-day">{{ cell.day }}</span>
      <span class="cc-sub" :class="{ 'cc-festival': cell.meta.isFestival }">{{ cell.meta.label }}</span>
    </div>
    <div v-if="mode !== 'full' && dots.length" class="cc-dots">
      <i v-for="d in dots" :key="d" class="cc-dot" :class="d" />
    </div>
    <div v-if="showPills" class="cc-pills" :style="{ opacity: pillOpacity }">
      <span
        v-for="(p, i) in shownPills"
        :key="`${p.tone}-${i}`"
        class="cc-pill"
        :class="`cc-pill-${p.tone}`"
      >{{ p.text }}</span>
      <span v-if="extraPills > 0" class="cc-pill cc-pill-more">+{{ extraPills }}</span>
    </div>
  </div>
</template>

<style scoped>
.cc {
  position: relative; height: 100%; box-sizing: border-box; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; padding: 4px 3px 2px;
  user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  border-radius: 10px;
}
.cc-top {
  display: flex; flex-direction: column; align-items: center; width: 100%;
}
.cc-day { font-size: 16px; font-weight: 500; color: #0f172a; line-height: 1.15; }
.cc-sub {
  font-size: 10px; color: #94a3b8; margin-top: 1px; line-height: 1.2;
  max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cc-festival { color: #ef4444; }
.cc-other .cc-day { color: #cbd5e1; }
.cc-other .cc-sub { color: #e2e8f0; }
.cc-today .cc-day { color: #6366f1; font-weight: 700; }
.cc-selected { background: #eef2ff; }
.cc-selected .cc-day { color: #4f46e5; font-weight: 700; }
.cc-dots { display: flex; gap: 3px; margin-top: 3px; height: 4px; flex-shrink: 0; }
.cc-dot { width: 4px; height: 4px; border-radius: 50%; }
.dot-indigo { background: #6366f1; }
.dot-amber { background: #f59e0b; }
.dot-green { background: #10b981; }
.dot-rose { background: #f43f5e; }
.cc-pills {
  width: 100%; margin-top: 3px; display: flex; flex-direction: column;
  gap: 2px; align-items: stretch; overflow: hidden; min-height: 0;
}
.cc-pill {
  font-size: 9px; line-height: 13px; padding: 0 4px; border-radius: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left;
}
.cc-pill-expense { background: #fff1f2; color: #e11d48; }
.cc-pill-income { background: #ecfdf5; color: #059669; }
.cc-pill-todo { background: #fffbeb; color: #d97706; }
.cc-pill-diary { background: #eef2ff; color: #4f46e5; }
.cc-pill-favor { background: #f5f3ff; color: #7c3aed; }
.cc-pill-more { background: #f1f5f9; color: #94a3b8; text-align: center; }
.cc-strip { padding: 2px 1px; justify-content: center; border-radius: 0; }
.cc-strip .cc-day { font-size: 15px; }
</style>
