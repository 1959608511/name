<script setup lang="ts">
/**
 * 小模块卡片：头部 / 可滚动正文 / 固定底部插槽
 * - 右半区物理拦截层 .wc-right-zone：touch-action:none 从合成器层禁止原生列表滚动，
 *   上下滑动 100% 只 1:1 驱动日历缩放，0 概率误滚模块
 * - 右半区轻点：临时 pointer-events:none + elementFromPoint 找到下层条目并 .click() 透传
 * - 标题栏（含右上角按钮区）：touch-action:none 彻底禁止原生滚动，上下滑动 1:1 缩放日历，
 *   轻点正常放行按钮 click，空白处长按 450ms 进入布局编辑态
 * - 长按 450ms（位移 > 6px 取消）进入布局编辑态；编辑态底边把手调高度、中部拖拽换位
 */
import { onBeforeUnmount, ref } from 'vue';
import { useCalendarHeight } from '../composables/useCalendarHeight';

const props = withDefaults(defineProps<{
  title: string;
  emoji: string;
  actionLabel?: string;
  meta?: string;
  accent?: 'indigo' | 'amber' | 'violet';
  height?: number;
  editing?: boolean;
}>(), { actionLabel: '', accent: 'indigo', height: 142, editing: false });

const emit = defineEmits<{
  (e: 'action'): void;
  (e: 'long-press'): void;
  (e: 'resize', dy: number): void;
  (e: 'move', dy: number): void;
  (e: 'move-end'): void;
}>();

const cal = useCalendarHeight();
const zoneEl = ref<HTMLDivElement | null>(null);

const LONG_MS = 450;
/** 纵向位移 > 3px 立即判定为「缩放日历」手势 */
const SCROLL_EPS = 3;
/** 长按 / 轻点允许的最大位移 */
const TAP_EPS = 6;

/* 右半区手势态 */
let startX = 0;
let startY = 0;
let lastY = 0;
let lastT = 0;
let velocity = 0;
let moved = false;
let longFired = false;
let longTimer = 0;
let suppressTill = 0;
let dragMode: 'none' | 'calendar' = 'none';
let editMode: 'none' | 'resize' | 'move' = 'none';

/* 左半区（正文滚动区）长按态 */
let bodyX = 0;
let bodyY = 0;
let bodyTimer = 0;

/* 标题栏（含右上角按钮区）手势态 */
const HEAD_EPS = 6;
let headX = 0;
let headY = 0;
let headLastY = 0;
let headLastT = 0;
let headVelocity = 0;
let headMoved = false;
let headLongFired = false;
let headTimer = 0;
let headDrag: 'none' | 'calendar' = 'none';

function clearLongTimer(): void {
  if (longTimer) {
    window.clearTimeout(longTimer);
    longTimer = 0;
  }
}
function clearBodyTimer(): void {
  if (bodyTimer) {
    window.clearTimeout(bodyTimer);
    bodyTimer = 0;
  }
}
/** 右半区长按：450ms 内位移 <= 6px 且未进入缩放才触发编辑态 */
function armZoneLongPress(): void {
  clearLongTimer();
  longTimer = window.setTimeout(() => {
    longTimer = 0;
    if (moved || longFired || dragMode !== 'none' || props.editing) return;
    longFired = true;
    suppressTill = Date.now() + 400;
    emit('long-press');
  }, LONG_MS);
}
function onClickCapture(e: MouseEvent): void {
  if (Date.now() < suppressTill) {
    e.preventDefault();
    e.stopPropagation();
  }
}

/** 轻点透传：临时关闭拦截层的命中，用坐标找到下层条目并触发 click */
function forwardTap(x: number, y: number): void {
  const zone = zoneEl.value;
  if (!zone) return;
  zone.style.pointerEvents = 'none';
  try {
    const hit = document.elementFromPoint(x, y);
    const el = hit ? hit.closest('button, a, input, textarea, select, [role="button"]') : null;
    if (el instanceof HTMLElement) el.click();
  } finally {
    zone.style.pointerEvents = '';
  }
}

/* ---------------- 右半区：上下滑动只缩放日历 + 轻点透传 + 长按编辑 ---------------- */
function onZoneStart(e: TouchEvent): void {
  const t = e.touches[0];
  if (!t) return;
  moved = false;
  longFired = false;
  dragMode = 'none';
  startX = t.clientX;
  startY = t.clientY;
  lastY = t.clientY;
  lastT = performance.now();
  velocity = 0;
  armZoneLongPress();
}
function onZoneMove(e: TouchEvent): void {
  const t = e.touches[0];
  if (!t) return;
  const dx = Math.abs(t.clientX - startX);
  const dy = Math.abs(t.clientY - startY);
  if (!moved && (dx > TAP_EPS || dy > TAP_EPS)) {
    moved = true;
    clearLongTimer();
  }
  if (dragMode === 'none') {
    // 纵向位移 > 3px 且纵向为主 → 立刻接管为日历缩放，绝不透给原生滚动
    if (dy <= SCROLL_EPS || dy <= dx) return;
    dragMode = 'calendar';
    cal.beginDrag();
  }
  const now = performance.now();
  const delta = t.clientY - lastY;
  const dt = Math.max(1, now - lastT);
  if (delta) {
    cal.dragBy(delta);
    velocity = delta / dt;
  }
  lastY = t.clientY;
  lastT = now;
}
function onZoneEnd(e: TouchEvent): void {
  const t = e.changedTouches[0];
  const x = t ? t.clientX : 0;
  const y = t ? t.clientY : 0;
  const isTap = !moved && !longFired && dragMode === 'none';
  clearLongTimer();
  if (dragMode === 'calendar') {
    cal.endDrag(velocity);
    suppressTill = Date.now() + 300;
  }
  dragMode = 'none';
  moved = false;
  longFired = false;
  if (isTap && !props.editing) forwardTap(x, y);
}
function onZoneCancel(): void {
  clearLongTimer();
  if (dragMode === 'calendar') cal.endDrag(0);
  dragMode = 'none';
  moved = false;
  longFired = false;
}

/* ---------------- 左半区：仅长按进入编辑，滚动完全交给原生 ---------------- */
function onBodyStart(e: TouchEvent): void {
  if (props.editing) return;
  const target = e.target as HTMLElement | null;
  if (target && typeof target.closest === 'function' && target.closest('button, input, textarea, select, a')) return;
  const t = e.touches[0];
  if (!t) return;
  bodyX = t.clientX;
  bodyY = t.clientY;
  clearBodyTimer();
  bodyTimer = window.setTimeout(() => {
    bodyTimer = 0;
    if (props.editing) return;
    suppressTill = Date.now() + 400;
    emit('long-press');
  }, LONG_MS);
}
function onBodyMove(e: TouchEvent): void {
  const t = e.touches[0];
  if (!t || !bodyTimer) return;
  if (Math.abs(t.clientX - bodyX) > TAP_EPS || Math.abs(t.clientY - bodyY) > TAP_EPS) clearBodyTimer();
}
function onBodyEnd(): void {
  clearBodyTimer();
}

/* ---------------- 标题栏：上下滑动只缩放日历 / 轻点放行按钮 / 空白长按编辑 ---------------- */
function clearHeadTimer(): void {
  if (headTimer) {
    window.clearTimeout(headTimer);
    headTimer = 0;
  }
}
function onHeadStart(e: TouchEvent): void {
  if (props.editing) return;
  const t = e.touches[0];
  if (!t) return;
  headMoved = false;
  headLongFired = false;
  headDrag = 'none';
  headX = t.clientX;
  headY = t.clientY;
  headLastY = t.clientY;
  headLastT = performance.now();
  headVelocity = 0;
  clearHeadTimer();
  // 只有按在非按钮空白处才允许长按进入编辑态；按钮上长按不应误触
  const target = e.target as HTMLElement | null;
  const onButton = !!(target && typeof target.closest === 'function'
    && target.closest('button, a, input, textarea, select, [role="button"]'));
  if (onButton) return;
  headTimer = window.setTimeout(() => {
    headTimer = 0;
    if (headMoved || headLongFired || headDrag !== 'none' || props.editing) return;
    headLongFired = true;
    suppressTill = Date.now() + 400;
    emit('long-press');
  }, LONG_MS);
}
function onHeadMove(e: TouchEvent): void {
  const t = e.touches[0];
  if (!t) return;
  const dx = Math.abs(t.clientX - headX);
  const dy = Math.abs(t.clientY - headY);
  if (!headMoved && (dx > HEAD_EPS || dy > HEAD_EPS)) {
    headMoved = true;
    clearHeadTimer();
  }
  if (headDrag === 'none') {
    // 纵向位移 > 6px 且纵向为主 → 立刻接管日历缩放，绝不让原生滚动启动
    if (dy <= HEAD_EPS || dy <= dx) return;
    headDrag = 'calendar';
    cal.beginDrag();
    headLastY = t.clientY;
    headLastT = performance.now();
  }
  const now = performance.now();
  const delta = t.clientY - headLastY;
  const dt = Math.max(1, now - headLastT);
  if (delta) {
    cal.dragBy(delta);
    headVelocity = delta / dt;
  }
  headLastY = t.clientY;
  headLastT = now;
}
function onHeadEnd(): void {
  clearHeadTimer();
  if (headDrag === 'calendar') {
    cal.endDrag(headVelocity);
    // 滑动结束后 300ms 内吞掉按钮 click，防止误触发弹窗
    suppressTill = Date.now() + 300;
  }
  headDrag = 'none';
  headMoved = false;
  headLongFired = false;
  headVelocity = 0;
}
function onHeadCancel(): void {
  clearHeadTimer();
  if (headDrag === 'calendar') cal.endDrag(0);
  headDrag = 'none';
  headMoved = false;
  headLongFired = false;
  headVelocity = 0;
}

/* ---------------- 编辑态：底边把手调高度 / 中部拖拽换位 ---------------- */
function onEditStart(e: TouchEvent, kind: 'resize' | 'move'): void {
  const t = e.touches[0];
  if (!t) return;
  editMode = kind;
  lastY = t.clientY;
}
function onEditMove(e: TouchEvent): void {
  const t = e.touches[0];
  if (!t || editMode === 'none') return;
  const dy = t.clientY - lastY;
  if (!dy) return;
  lastY = t.clientY;
  if (editMode === 'resize') emit('resize', dy);
  else emit('move', dy);
}
function onEditEnd(): void {
  if (editMode === 'move') emit('move-end');
  editMode = 'none';
}

onBeforeUnmount(() => {
  clearLongTimer();
  clearBodyTimer();
  clearHeadTimer();
});
</script>

<template>
  <section
    class="wc"
    :class="{ 'wc-editing': editing }"
    :style="{ height: `${height}px` }"
    @click.capture="onClickCapture"
  >
    <header
      class="wc-head"
      @touchstart="onHeadStart"
      @touchmove.prevent="onHeadMove"
      @touchend="onHeadEnd"
      @touchcancel="onHeadCancel"
    >
      <div class="wc-title">
        <span class="wc-emoji">{{ emoji }}</span>
        <span class="wc-name">{{ title }}</span>
        <span v-if="meta" class="wc-meta">{{ meta }}</span>
      </div>
      <div class="wc-actions">
        <slot name="actions">
          <button class="wc-action" :class="`wc-action-${accent}`" type="button" @click="emit('action')">
            {{ actionLabel }}
          </button>
        </slot>
      </div>
    </header>
    <div
      class="wc-body"
      :class="{ 'wc-body-frozen': editing }"
      @touchstart.passive="onBodyStart"
      @touchmove.passive="onBodyMove"
      @touchend="onBodyEnd"
      @touchcancel="onBodyEnd"
    >
      <div class="wc-scroll">
        <slot />
      </div>
      <!-- 右半区物理手势拦截层：touch-action:none 禁止一切原生滚动 -->
      <div
        v-if="!editing"
        ref="zoneEl"
        class="wc-right-zone"
        @touchstart.stop="onZoneStart"
        @touchmove.stop.prevent="onZoneMove"
        @touchend.stop="onZoneEnd"
        @touchcancel.stop="onZoneCancel"
      />
    </div>
    <div v-if="$slots.footer" class="wc-foot">
      <slot name="footer" />
    </div>
    <template v-if="editing">
      <div
        class="wc-move-layer"
        @touchstart.passive="onEditStart($event, 'move')"
        @touchmove.passive="onEditMove"
        @touchend="onEditEnd"
        @touchcancel="onEditEnd"
      />
      <div
        class="wc-handle"
        @touchstart.passive="onEditStart($event, 'resize')"
        @touchmove.passive="onEditMove"
        @touchend="onEditEnd"
        @touchcancel="onEditEnd"
      >
        <span class="wc-handle-bar" />
      </div>
    </template>
  </section>
</template>

<style scoped>
.wc {
  position: relative; flex-shrink: 0; display: flex; flex-direction: column;
  background: #fff; border: 1px solid #eef2f7; border-radius: 16px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); overflow: hidden;
}
.wc-editing { border: 2px dashed #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08); }
.wc-head {
  height: 36px; flex-shrink: 0; display: flex; align-items: center;
  justify-content: space-between; gap: 6px; padding: 0 10px 0 12px;
  border-bottom: 1px solid #f5f7fa;
  /* 合成器层彻底禁止标题栏 / 右上角按钮触发任何原生滚动 */
  touch-action: none; user-select: none; -webkit-user-select: none;
}
.wc-title { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; }
.wc-emoji { font-size: 13px; flex-shrink: 0; }
.wc-name { font-size: 13px; font-weight: 600; color: #1e293b; white-space: nowrap; }
.wc-meta { font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wc-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
/* 插槽内的按钮同样禁止原生滚动与长按选中 */
.wc-head :deep(button) { touch-action: none; user-select: none; -webkit-user-select: none; }
.wc-action {
  border: 0; border-radius: 9px; font-size: 11px; padding: 4px 9px;
  line-height: 1.5; -webkit-tap-highlight-color: transparent; flex-shrink: 0;
}
.wc-action-indigo { background: #eef2ff; color: #4f46e5; }
.wc-action-amber { background: #fffbeb; color: #d97706; }
.wc-action-violet { background: #f5f3ff; color: #7c3aed; }
/* 内容区外层：裁切 + 相对定位，真正的滚动交给 .wc-scroll */
.wc-body {
  position: relative; flex: 1; min-height: 0; overflow: hidden;
}
.wc-scroll {
  width: 100%; height: 100%; overflow-y: auto; overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch; padding: 4px 6px 4px 8px; box-sizing: border-box;
}
.wc-body-frozen .wc-scroll { overflow-y: hidden; }
/* 右半区拦截层：物理禁止原生滚动，仅承载日历缩放手势 */
.wc-right-zone {
  position: absolute; top: 0; right: 0; bottom: 0; width: 50%;
  z-index: 15; touch-action: none; user-select: none; -webkit-user-select: none;
  background: transparent;
}
.wc-foot {
  flex-shrink: 0; padding: 4px 6px 6px; background: #fff;
  border-top: 1px solid #f5f7fa;
}
/* 编辑态拖拽层与底边加粗把手 */
.wc-move-layer { position: absolute; inset: 0; z-index: 12; touch-action: none; }
.wc-handle {
  position: absolute; left: 0; right: 0; bottom: 0; height: 18px; z-index: 14;
  display: flex; align-items: center; justify-content: center; touch-action: none;
}
.wc-handle-bar {
  width: 54px; height: 6px; border-radius: 3px; background: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}
</style>
