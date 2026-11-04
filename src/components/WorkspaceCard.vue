<script setup lang="ts">
/**
 * 小模块卡片：头部 / 可滚动正文 / 固定底部插槽
 * - 右半区拦截层：上下滑 1:1 缩放日历；左右滑正交透传给下层 [data-hswipe] 容器（已还 / 危险）
 * - 轻点透传按钮 click；标题栏上下滑缩放；长按 450ms 进入布局编辑态
 */
import { onBeforeUnmount, ref } from 'vue';
import { useCalendarHeight } from '../composables/useCalendarHeight';

const props = withDefaults(defineProps<{
  title: string; emoji: string; actionLabel?: string; meta?: string;
  accent?: 'indigo' | 'amber' | 'violet'; height?: number; editing?: boolean;
}>(), { actionLabel: '', accent: 'indigo', height: 142, editing: false });

const emit = defineEmits<{
  (e: 'action'): void; (e: 'long-press'): void;
  (e: 'resize', dy: number): void; (e: 'move', dy: number): void; (e: 'move-end'): void;
}>();

const cal = useCalendarHeight();
const zoneEl = ref<HTMLDivElement | null>(null);

const LONG_MS = 450;
/** 纵向 > 7px 判定缩放；横向 > 6px 判定下层滑动；轻点 / 长按容差 7px（避免手指抖动吞掉点击） */
const SCROLL_EPS = 7, HSWIPE_EPS = 6, TAP_EPS = 7, HEAD_EPS = 6;

/* 右半区手势态 */
let startX = 0, startY = 0, lastY = 0, lastT = 0, velocity = 0;
let moved = false, longFired = false, longTimer = 0, suppressTill = 0;
/** 最近一次触摸轻点透传时间，用于抑制紧随其后的合成 click 双触发 */
let lastTouchTapAt = 0;
let dragMode: 'none' | 'calendar' | 'horiz' = 'none';
let swipeEl: Element | null = null;
let editMode: 'none' | 'resize' | 'move' = 'none';
/* 左半区 / 标题栏手势态 */
let bodyX = 0, bodyY = 0, bodyTimer = 0;
let headX = 0, headY = 0, headLastY = 0, headLastT = 0, headVelocity = 0;
let headMoved = false, headLongFired = false, headTimer = 0;
let headDrag: 'none' | 'calendar' = 'none';

function clearTimer(k: 'long' | 'body' | 'head'): void {
  if (k === 'long' && longTimer) { window.clearTimeout(longTimer); longTimer = 0; }
  else if (k === 'body' && bodyTimer) { window.clearTimeout(bodyTimer); bodyTimer = 0; }
  else if (k === 'head' && headTimer) { window.clearTimeout(headTimer); headTimer = 0; }
}
function armZoneLongPress(): void {
  clearTimer('long');
  longTimer = window.setTimeout(() => {
    longTimer = 0;
    if (moved || longFired || dragMode !== 'none' || props.editing) return;
    longFired = true; suppressTill = Date.now() + 400; emit('long-press');
  }, LONG_MS);
}
function onClickCapture(e: MouseEvent): void {
  if (Date.now() < suppressTill) { e.preventDefault(); e.stopPropagation(); }
}
/** 轻点透传：临时关闭拦截层命中，用坐标找到下层条目并触发 click */
function forwardTap(x: number, y: number): void {
  const zone = zoneEl.value;
  if (!zone) return;
  zone.style.pointerEvents = 'none';
  try {
    const hit = document.elementFromPoint(x, y);
    const el = hit
      ? hit.closest('button, a, input, textarea, select, [role="button"], .lw-row, .dw-todo, .dw-diary, .cw-row, .cw-contact-main')
      : null;
    if (el instanceof HTMLElement) el.click();
  } finally { zone.style.pointerEvents = ''; }
}
/** 拦截层点击：鼠标 / WebView 合成点击同样按坐标透传给下层按钮 */
function onZoneClick(e: MouseEvent): void {
  // 触摸轻点已由 touchend 透传，跳过紧随其后的合成 click 防止双触发
  if (props.editing || Date.now() < suppressTill || Date.now() - lastTouchTapAt < 500) return;
  forwardTap(e.clientX, e.clientY);
}

/* ---------------- 右半区：上下缩放 / 左右滑动 / 轻点 / 长按 ---------------- */
/** 横向手势启动：找到下层 data-hswipe 容器并派发开始事件 */
function startHoriz(): void {
  const zone = zoneEl.value;
  if (zone) zone.style.pointerEvents = 'none';
  const hit = document.elementFromPoint(startX, startY);
  swipeEl = hit ? hit.closest('[data-hswipe]') : null;
  if (swipeEl) swipeEl.dispatchEvent(new CustomEvent('hswipe-start', { detail: { x: startX, y: startY } }));
}
/** 横向手势收尾：派发结束事件并恢复拦截层命中 */
function endHoriz(): void {
  if (swipeEl) swipeEl.dispatchEvent(new CustomEvent('hswipe-end'));
  swipeEl = null;
  if (zoneEl.value) zoneEl.value.style.pointerEvents = '';
}
function onZoneStart(e: TouchEvent): void {
  const t = e.touches[0];
  if (!t) return;
  moved = false; longFired = false; dragMode = 'none'; swipeEl = null;
  startX = t.clientX; startY = t.clientY; lastY = t.clientY;
  lastT = performance.now(); velocity = 0;
  armZoneLongPress();
}
function onZoneMove(e: TouchEvent): void {
  const t = e.touches[0];
  if (!t) return;
  const dx = Math.abs(t.clientX - startX), dy = Math.abs(t.clientY - startY);
  if (!moved && (dx > TAP_EPS || dy > TAP_EPS)) { moved = true; clearTimer('long'); }
  // 已判定为横向：持续把坐标透传给下层滑动容器
  if (dragMode === 'horiz') {
    if (swipeEl) swipeEl.dispatchEvent(new CustomEvent('hswipe-move', { detail: { x: t.clientX, y: t.clientY } }));
    return;
  }
  // 正交方向仲裁：纵向为主 → 日历缩放；横向为主 → 下层左右滑动
  if (dragMode === 'none') {
    if (dy > SCROLL_EPS && dy > dx) { dragMode = 'calendar'; cal.beginDrag(); }
    else if (dx > HSWIPE_EPS && dx > dy) {
      dragMode = 'horiz';
      startHoriz();
      if (swipeEl) swipeEl.dispatchEvent(new CustomEvent('hswipe-move', { detail: { x: t.clientX, y: t.clientY } }));
      return;
    } else return;
  }
  const now = performance.now(), delta = t.clientY - lastY, dt = Math.max(1, now - lastT);
  if (delta) { cal.dragBy(delta); velocity = delta / dt; }
  lastY = t.clientY; lastT = now;
}
function onZoneEnd(e: TouchEvent): void {
  const t = e.changedTouches[0], x = t ? t.clientX : 0, y = t ? t.clientY : 0;
  const isTap = !moved && !longFired && dragMode === 'none';
  clearTimer('long');
  if (dragMode === 'calendar') { cal.endDrag(velocity); suppressTill = Date.now() + 300; }
  else if (dragMode === 'horiz') { endHoriz(); suppressTill = Date.now() + 300; }
  dragMode = 'none'; moved = false; longFired = false;
  if (isTap && !props.editing) {
    // 阻止浏览器在 touchend 后 20ms 合成幽灵 click 打到新弹出的弹窗遮罩上
    if (e.cancelable) e.preventDefault();
    lastTouchTapAt = Date.now();
    forwardTap(x, y);
  }
}
function onZoneCancel(): void {
  clearTimer('long');
  if (dragMode === 'calendar') cal.endDrag(0);
  else if (dragMode === 'horiz') { endHoriz(); suppressTill = Date.now() + 300; }
  dragMode = 'none'; moved = false; longFired = false;
}

/* ---------------- 左半区：仅长按进入编辑，滚动完全交给原生 ---------------- */
function onBodyStart(e: TouchEvent): void {
  if (props.editing) return;
  const target = e.target as HTMLElement | null;
  if (target && typeof target.closest === 'function' && target.closest('button, input, textarea, select, a')) return;
  const t = e.touches[0];
  if (!t) return;
  bodyX = t.clientX; bodyY = t.clientY;
  clearTimer('body');
  bodyTimer = window.setTimeout(() => {
    bodyTimer = 0;
    if (props.editing) return;
    suppressTill = Date.now() + 400; emit('long-press');
  }, LONG_MS);
}
function onBodyMove(e: TouchEvent): void {
  const t = e.touches[0];
  if (!t || !bodyTimer) return;
  if (Math.abs(t.clientX - bodyX) > TAP_EPS || Math.abs(t.clientY - bodyY) > TAP_EPS) clearTimer('body');
}
function onBodyEnd(): void { clearTimer('body'); }

/* ---------------- 标题栏：上下缩放 / 轻点放行按钮 / 空白长按编辑 ---------------- */
function onHeadStart(e: TouchEvent): void {
  if (props.editing) return;
  const t = e.touches[0];
  if (!t) return;
  headMoved = false; headLongFired = false; headDrag = 'none';
  headX = t.clientX; headY = t.clientY; headLastY = t.clientY;
  headLastT = performance.now(); headVelocity = 0;
  clearTimer('head');
  // 只有按在非按钮空白处才允许长按进入编辑态
  const target = e.target as HTMLElement | null;
  const onButton = !!(target && typeof target.closest === 'function'
    && target.closest('button, a, input, textarea, select, [role="button"]'));
  if (onButton) return;
  headTimer = window.setTimeout(() => {
    headTimer = 0;
    if (headMoved || headLongFired || headDrag !== 'none' || props.editing) return;
    headLongFired = true; suppressTill = Date.now() + 400; emit('long-press');
  }, LONG_MS);
}
function onHeadMove(e: TouchEvent): void {
  const t = e.touches[0];
  if (!t) return;
  const dx = Math.abs(t.clientX - headX), dy = Math.abs(t.clientY - headY);
  if (!headMoved && (dx > HEAD_EPS || dy > HEAD_EPS)) { headMoved = true; clearTimer('head'); }
  if (headDrag === 'none') {
    if (dy <= HEAD_EPS || dy <= dx) return;
    headDrag = 'calendar'; cal.beginDrag();
    headLastY = t.clientY; headLastT = performance.now();
  }
  const now = performance.now(), delta = t.clientY - headLastY, dt = Math.max(1, now - headLastT);
  if (delta) { cal.dragBy(delta); headVelocity = delta / dt; }
  headLastY = t.clientY; headLastT = now;
}
function onHeadEnd(): void {
  clearTimer('head');
  if (headDrag === 'calendar') { cal.endDrag(headVelocity); suppressTill = Date.now() + 300; }
  headDrag = 'none'; headMoved = false; headLongFired = false; headVelocity = 0;
}
function onHeadCancel(): void {
  clearTimer('head');
  if (headDrag === 'calendar') cal.endDrag(0);
  headDrag = 'none'; headMoved = false; headLongFired = false; headVelocity = 0;
}

/* ---------------- 编辑态：底边把手调高度 / 中部拖拽换位 ---------------- */
function onEditStart(e: TouchEvent, kind: 'resize' | 'move'): void {
  const t = e.touches[0];
  if (!t) return;
  editMode = kind; lastY = t.clientY;
}
function onEditMove(e: TouchEvent): void {
  const t = e.touches[0];
  if (!t || editMode === 'none') return;
  const dy = t.clientY - lastY;
  if (!dy) return;
  lastY = t.clientY;
  if (editMode === 'resize') emit('resize', dy); else emit('move', dy);
}
function onEditEnd(): void {
  if (editMode === 'move') emit('move-end');
  editMode = 'none';
}
onBeforeUnmount(() => { clearTimer('long'); clearTimer('body'); clearTimer('head'); });
</script>

<template>
  <section class="wc" :class="{ 'wc-editing': editing }" :style="{ height: `${height}px` }" @click.capture="onClickCapture">
    <header class="wc-head" @touchstart="onHeadStart" @touchmove.prevent="onHeadMove" @touchend="onHeadEnd" @touchcancel="onHeadCancel">
      <div class="wc-title">
        <span class="wc-emoji">{{ emoji }}</span>
        <span class="wc-name">{{ title }}</span>
        <span v-if="meta" class="wc-meta">{{ meta }}</span>
      </div>
      <div class="wc-actions">
        <slot name="actions">
          <button class="wc-action" :class="`wc-action-${accent}`" type="button" @click="emit('action')">{{ actionLabel }}</button>
        </slot>
      </div>
    </header>
    <div class="wc-body" :class="{ 'wc-body-frozen': editing }" @touchstart.passive="onBodyStart" @touchmove.passive="onBodyMove" @touchend="onBodyEnd" @touchcancel="onBodyEnd">
      <div class="wc-scroll"><slot /></div>
      <!-- 右半区物理手势拦截层：touch-action:none 禁止一切原生滚动 -->
      <div v-if="!editing" ref="zoneEl" class="wc-right-zone" @touchstart.stop="onZoneStart"
        @touchmove.stop.prevent="onZoneMove" @touchend.stop="onZoneEnd" @touchcancel.stop="onZoneCancel"
        @click.stop="onZoneClick" />
    </div>
    <div v-if="$slots.footer" class="wc-foot"
      @touchstart="onHeadStart" @touchmove.prevent="onHeadMove" @touchend="onHeadEnd" @touchcancel="onHeadCancel">
      <slot name="footer" />
    </div>
    <template v-if="editing">
      <div class="wc-move-layer" @touchstart.passive="onEditStart($event, 'move')" @touchmove.passive="onEditMove"
        @touchend="onEditEnd" @touchcancel="onEditEnd" />
      <div class="wc-handle" @touchstart.passive="onEditStart($event, 'resize')" @touchmove.passive="onEditMove"
        @touchend="onEditEnd" @touchcancel="onEditEnd"><span class="wc-handle-bar" /></div>
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
  height: 36px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  gap: 6px; padding: 0 10px 0 12px; border-bottom: 1px solid #f5f7fa;
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
.wc-action { border: 0; border-radius: 9px; font-size: 11px; padding: 4px 9px; line-height: 1.5; -webkit-tap-highlight-color: transparent; flex-shrink: 0; }
.wc-action-indigo { background: #eef2ff; color: #4f46e5; }
.wc-action-amber { background: #fffbeb; color: #d97706; }
.wc-action-violet { background: #f5f3ff; color: #7c3aed; }
/* 内容区外层：裁切 + 相对定位，真正的滚动交给 .wc-scroll */
.wc-body { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.wc-scroll {
  width: 100%; height: 100%; overflow-y: auto; overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch; padding: 4px 6px 4px 8px; box-sizing: border-box;
}
.wc-body-frozen .wc-scroll { overflow-y: hidden; }
/* 右半区拦截层：物理禁止原生滚动，承载日历缩放与横向透传 */
.wc-right-zone { position: absolute; top: 0; right: 0; bottom: 0; width: 50%; z-index: 15; touch-action: none; user-select: none; -webkit-user-select: none; background: transparent; }
.wc-foot {
  flex-shrink: 0; padding: 4px 6px 6px; background: #fff; border-top: 1px solid #f5f7fa;
  /* 底部输入栏同样接入上下滑缩放手势，禁止原生滚动 / 长按选中 */
  touch-action: none; user-select: none; -webkit-user-select: none;
}
/* 底部插槽内的按钮与输入框同步禁止原生滚动与长按选中 */
.wc-foot :deep(button), .wc-foot :deep(input) {
  touch-action: none; user-select: none; -webkit-user-select: none;
}
/* 编辑态拖拽层与底边加粗把手 */
.wc-move-layer { position: absolute; inset: 0; z-index: 12; touch-action: none; }
.wc-handle { position: absolute; left: 0; right: 0; bottom: 0; height: 18px; z-index: 14; display: flex; align-items: center; justify-content: center; touch-action: none; }
.wc-handle-bar { width: 54px; height: 6px; border-radius: 3px; background: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12); }
</style>
