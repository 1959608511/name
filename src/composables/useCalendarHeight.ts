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

function cancelSnap(): void {
  if (snapRaf) cancelAnimationFrame(snapRaf);
  snapRaf = 0;
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

/** 手势开始：立刻刹停吸附动画 */
function beginDrag(): void {
  cancelSnap();
}

/** 1:1 跟手位移 */
function dragBy(dy: number): void {
  cancelSnap();
  isResizing.value = true;
  calH.value = clampHeight(calH.value + dy, geometry.value);
}

/** 手势结束：按速度吸附到最近形态锚点 */
function endDrag(velocity: number): void {
  isResizing.value = false;
  animateTo(snapHeight(calH.value, velocity, geometry.value));
}

export function useCalendarHeight() {
  return { calH, isResizing, geometry, animateTo, syncViewport, beginDrag, dragBy, endDrag };
}
