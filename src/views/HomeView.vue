<script setup lang="ts">
/**
 * 首页 · 三形态动态视口日历 + 垂直独立小窗口工作台
 * 高度拖拽 1:1 跟手；松手仅对形态高度做 rAF 平滑吸附；日历滚动完全交给 CalendarEngine 的纯惯性
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import CalendarEngine from '../components/CalendarEngine.vue';
import RecordWorkspace from '../components/RecordWorkspace.vue';
import ActionSheetModal from '../components/ActionSheetModal.vue';
import { useCrmStore } from '../store/useCrmStore';
import { todayStr } from '../services/dbService';
import { registerBackHandler } from '../services/nativeBridge';
import { useCalendarHeight } from '../composables/useCalendarHeight';
import type { ISODate } from '../types/schema';

const store = useCrmStore();
const today = todayStr();
const rootEl = ref<HTMLElement | null>(null);

/* 日历高度由单例 composable 统一管理（导航栏 / 小模块右半区共用） */
const {
  calH, isResizing, geometry: geom, animateTo, syncViewport, beginDrag, dragBy, endDrag,
} = useCalendarHeight();

let ro: ResizeObserver | null = null;
let unregisterBack: (() => void) | null = null;

/* ---------------- 日期选择与面板 ---------------- */
function onSelect(date: ISODate): void {
  store.selectDate(date);
}
function onDoubleTap(date: ISODate): void {
  store.selectDate(date);
  animateTo(geom.value.H_STRIP);
  store.openPanel('todo');
}
function onLongPress(date: ISODate): void {
  store.selectDate(date);
  store.openPanel('choose');
}
function onCreate(kind: 'contact' | 'ledger' | 'diary'): void {
  store.openPanel(kind);
}
function onEdit(kind: 'contact' | 'ledger' | 'diary', id: string): void {
  store.openPanel(kind, id);
}

/* ---------------- 尺寸测量 ---------------- */
function syncSize(): void {
  const h = rootEl.value?.clientHeight ?? 0;
  if (h > 0) syncViewport(h);
}

onMounted(() => {
  syncSize();
  if (rootEl.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(syncSize);
    ro.observe(rootEl.value);
  }
  // 返回栈：首页日历处于折叠态时，先展开为全屏态（优先级低于弹窗与 Tab 切回）
  unregisterBack = registerBackHandler(() => {
    if (calH.value < geom.value.H_NORMAL - 1) {
      animateTo(geom.value.H_FULL);
      return true;
    }
    return false;
  });
});

onBeforeUnmount(() => {
  ro?.disconnect();
  ro = null;
  unregisterBack?.();
  unregisterBack = null;
});
</script>

<template>
  <div ref="rootEl" class="home-root">
    <div class="home-cal" :style="{ height: `${calH + geom.CAL_OFFSET}px` }">
      <CalendarEngine
        :calendar-height="calH"
        :geometry="geom"
        :is-resizing="isResizing"
        :selected-date="store.selectedDate"
        :today="today"
        @grab="beginDrag"
        @resize="dragBy"
        @resize-end="endDrag"
        @select="onSelect"
        @double-tap="onDoubleTap"
        @long-press="onLongPress"
      />
    </div>
    <div class="home-work">
      <RecordWorkspace
        :selected-date="store.selectedDate"
        @create="onCreate"
        @edit="onEdit"
      />
    </div>
    <ActionSheetModal
      :panel="store.activePanel"
      :date="store.selectedDate"
      :edit-id="store.editingId"
      @close="store.closePanel"
      @choose="onCreate"
    />
  </div>
</template>

<style scoped>
.home-root {
  display: flex; flex-direction: column; height: 100%;
  background: #f8fafc; overflow: hidden;
}
.home-cal { flex-shrink: 0; overflow: hidden; }
.home-work { flex: 1; min-height: 0; overflow: hidden; }
</style>
