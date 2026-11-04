/**
 * 日历高度统一管理器（单例）
 * 小横条 / 底部导航栏 / 小模块右半区 三处共用同一份 calH：
 * - 拖动实时 1:1 跟手
 * - 松手仅对形态高度做 rAF 平滑吸附
 */
import { computed, ref } from 'vue';
import { SNAP_MS, clampHeight, getGeometry, snapHeight, type CalendarGeometry } from '../utils/calendarHelper';

const viewportH = ref(typeof window === 'undefined' ? 800 : window.innerHeight);
const availH = ref(viewportH.value);
const geometry = computed<CalendarGeometry>(() => getGeometry(availH.value, viewportH.value));
const calH = ref(geometry.value.H_FULL);
const isResizing = ref(false);

let snapRaf = 0;
let glideRaf = 0;

function cancelSnap(): void {
  if (snapRaf) cancelAnimationFrame(snapRaf);
  snapRaf = 0;
}

/** 功能模块滚动容器（下半屏）：与日历高度共用同一手势状态机，实现无缝接力 */
function getScroller(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>('.rw-root');
}

function cancelGlide(): void {
  if (glideRaf) cancelAnimationFrame(glideRaf);
  glideRaf = 0;
}

/** 松手后的惯性衰减：直接驱动功能模块容器滚动，不参与日历形态变化 */
function glideScroll(scroller: HTMLElement, velocity: number): void {
  cancelGlide();
  let step = -velocity * 16;
  if (Math.abs(step) < 0.4) return;
  const tick = (): void => {
    step *= 0.94;
    if (Math.abs(step) < 0.4) { glideRaf = 0; return; }
    const before = scroller.scrollTop;
    scroller.scrollTop = before + step;
    // 触顶 / 触底（scrollTop 被夹紧且不再变化）立刻停止滑行
    if (scroller.scrollTop === before) { glideRaf = 0; return; }
    glideRaf = requestAnimationFrame(tick);
  };
  glideRaf = requestAnimationFrame(tick);
}

/** 吸附动画：只改变形态高度，不参与任何内部滚动 */
function animateTo(target: number): void {
  cancelSnap();
  const from = calH.value;
  const to = clampHeight(target, geometry.value);
  const delta = to - from;
  if (Math.abs(delta) < 0.5) {
    calH.value = to;
    return;
  }
  const t0 = performance.now();
  const step = (now: number): void => {
    const p = Math.min(1, (now - t0) / SNAP_MS);
    const eased = 1 - (1 - p) ** 3;
    calH.value = from + delta * eased;
    if (p < 1) {
      snapRaf = requestAnimationFrame(step);
    } else {
      calH.value = to;
      snapRaf = 0;
    }
  };
  snapRaf = requestAnimationFrame(step);
}

/** 容器尺寸变化时同步可用高度（全屏态保持全屏，其余夹紧） */
function syncViewport(avail: number): void {
  viewportH.value = window.innerHeight;
  if (avail <= 0 || Math.abs(avail - availH.value) <= 1) return;
  const wasFull = calH.value >= geometry.value.H_FULL - 2;
  availH.value = avail;
  calH.value = wasFull ? geometry.value.H_FULL : clampHeight(calH.value, geometry.value);
}

/** 手势开始：立刻刹停吸附与惯性动画 */
function beginDrag(): void {
  cancelSnap();
  cancelGlide();
}

/** 1:1 跟手位移：日历缩放与功能模块滚动无缝接力 */
function dragBy(dy: number): void {
  cancelSnap();
  cancelGlide();
  isResizing.value = true;
  const scroller = getScroller();

  if (dy < 0) {
    // 向上：优先缩小日历，缩到最小窄条后剩余位移直接滚动功能模块
    const shrinkable = Math.max(0, calH.value - geometry.value.H_STRIP);
    const usedByCal = Math.min(shrinkable, -dy);
    if (usedByCal > 0) calH.value = clampHeight(calH.value - usedByCal, geometry.value);
    const leftover = -dy - usedByCal;
    if (leftover > 0 && scroller) scroller.scrollTop += leftover;
    return;
  }

  if (dy > 0) {
    // 向下：优先把功能模块滚回顶部，到顶后剩余位移无缝展开日历
    const usedByScroll = scroller ? Math.min(dy, Math.max(0, scroller.scrollTop)) : 0;
    if (usedByScroll > 0 && scroller) scroller.scrollTop -= usedByScroll;
    const leftover = dy - usedByScroll;
    if (leftover > 0) calH.value = clampHeight(calH.value + leftover, geometry.value);
  }
}

/** 手势结束：窄条态且功能模块未回顶时保持窄条并惯性滑行，否则按速度吸附锚点 */
function endDrag(velocity: number): void {
  isResizing.value = false;
  const scroller = getScroller();
  if (scroller && calH.value <= geometry.value.H_STRIP + 0.5 && scroller.scrollTop > 0) {
    calH.value = geometry.value.H_STRIP;
    glideScroll(scroller, velocity);
    return;
  }
  animateTo(snapHeight(calH.value, velocity, geometry.value));
}

export function useCalendarHeight() {
  return { calH, isResizing, geometry, animateTo, syncViewport, beginDrag, dragBy, endDrag };
}
