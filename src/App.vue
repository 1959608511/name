<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { CalendarDays, Network, Settings } from '@lucide/vue';
import HomeView from './views/HomeView.vue';
import GraphView from './views/GraphView.vue';
import SettingsView from './views/SettingsView.vue';
import { exitApp, initNativeBridge, registerBackHandler } from './services/nativeBridge';
import { ingestCaptureLines } from './services/aiService';
import { useCrmStore } from './store/useCrmStore';
import { useCalendarHeight } from './composables/useCalendarHeight';

type TabKey = 'home' | 'graph' | 'settings';

const store = useCrmStore();
const cal = useCalendarHeight();
const activeTab = ref<TabKey>('home');
const toast = ref('');
let toastTimer = 0;
let lastBackTime = 0;
const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'home', label: '首页' },
  { key: 'graph', label: '图谱' },
  { key: 'settings', label: '设置' },
];

function showToast(msg: string): void {
  toast.value = msg;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.value = ''; toastTimer = 0; }, 2000);
}

/* ---------------- 底部导航栏手势（方案 A 仲裁版） ----------------
 * 上下滑动（|dy| > 8 且 |dy| > |dx|）→ 1:1 控制日历收缩/展开，并拦截松手后的 click
 * 轻点（位移 ≤ 8px）→ 正常切换页面
 */
let navStartX = 0;
let navStartY = 0;
let navLastY = 0;
let navLastT = 0;
let navVelocity = 0;
let navGesture: 'none' | 'pending' | 'resize' = 'none';
let navSuppressClickTill = 0;

function onNavTouchStart(e: TouchEvent): void {
  const t = e.touches[0];
  if (!t || activeTab.value !== 'home') {
    navGesture = 'none';
    return;
  }
  navGesture = 'pending';
  navStartX = t.clientX;
  navStartY = t.clientY;
  navLastY = t.clientY;
  navLastT = performance.now();
  navVelocity = 0;
  cal.beginDrag();
}

function onNavTouchMove(e: TouchEvent): void {
  if (navGesture === 'none') return;
  const t = e.touches[0];
  if (!t) return;
  if (navGesture === 'pending') {
    const dx = t.clientX - navStartX;
    const dy = t.clientY - navStartY;
    if (Math.abs(dy) <= 8 && Math.abs(dx) <= 8) return;
    if (Math.abs(dy) <= Math.abs(dx)) {
      navGesture = 'none';
      return;
    }
    navGesture = 'resize';
  }
  const now = performance.now();
  const dy = t.clientY - navLastY;
  const dt = Math.max(1, now - navLastT);
  if (dy) {
    cal.dragBy(dy);
    navVelocity = dy / dt;
  }
  navLastY = t.clientY;
  navLastT = now;
}

function onNavTouchEnd(): void {
  if (navGesture === 'resize') {
    cal.endDrag(navVelocity);
    navSuppressClickTill = Date.now() + 300;
  }
  navGesture = 'none';
}

function onTabClick(tab: TabKey): void {
  if (Date.now() < navSuppressClickTill) return;
  activeTab.value = tab;
}

let disposeBridge: (() => void) | null = null;
let unregisterBack: (() => void) | null = null;

onMounted(() => {
  // 抓屏队列静默入库后刷新响应式状态
  disposeBridge = initNativeBridge((lines) => {
    if (ingestCaptureLines(lines) > 0) store.loadAll();
  });
  // 返回键消费栈：先关面板 → 再回首页 → 否则双击退出
  unregisterBack = registerBackHandler(() => {
    if (store.activePanel !== 'none') {
      store.closePanel();
      return true;
    }
    if (activeTab.value !== 'home') {
      activeTab.value = 'home';
      return true;
    }
    const now = Date.now();
    if (now - lastBackTime < 2000) {
      exitApp();
    } else {
      lastBackTime = now;
      showToast('再按一次返回退出');
    }
    return true;
  });
});

onBeforeUnmount(() => {
  disposeBridge?.();
  unregisterBack?.();
  if (toastTimer) window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="flex h-[100dvh] flex-col bg-slate-50 text-slate-900">
    <main class="flex-1 overflow-hidden" style="padding-top: env(safe-area-inset-top)">
      <HomeView v-show="activeTab === 'home'" />
      <GraphView v-show="activeTab === 'graph'" />
      <SettingsView v-show="activeTab === 'settings'" />
    </main>
    <nav
      class="grid grid-cols-3 border-t border-slate-200 bg-white/90 backdrop-blur"
      style="padding-bottom: env(safe-area-inset-bottom)"
      @touchstart.passive="onNavTouchStart"
      @touchmove.passive="onNavTouchMove"
      @touchend="onNavTouchEnd"
      @touchcancel="onNavTouchEnd"
    >
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        class="flex flex-col items-center gap-1 py-2 text-xs transition-colors"
        :class="activeTab === t.key ? 'font-medium text-indigo-600' : 'text-slate-400'"
        @click="onTabClick(t.key)"
      >
        <CalendarDays v-if="t.key === 'home'" :size="20" />
        <Network v-else-if="t.key === 'graph'" :size="20" />
        <Settings v-else :size="20" />
        <span>{{ t.label }}</span>
      </button>
    </nav>
    <div v-if="toast" class="app-toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.app-toast {
  position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.85); color: #fff; font-size: 13px;
  padding: 8px 16px; border-radius: 20px; z-index: 100; pointer-events: none;
}
</style>
