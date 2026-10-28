<script setup lang="ts">
/**
 * 双页 Tab 导航：
 * 第一页 📅 人际日历与模块（HomeView）
 * 第二页 🕸️ 关系网图谱（GraphView，首次切换时懒挂载）
 */
import { ref } from 'vue'
import HomeView from '@/views/HomeView.vue'
import GraphView from '@/views/GraphView.vue'

type TabKey = 'home' | 'graph'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'home', label: '📅 人际日历与模块' },
  { key: 'graph', label: '🕸️ 关系网图谱' },
]

const activeTab = ref<TabKey>('home')
const graphVisited = ref(false)

function switchTab(tab: TabKey): void {
  activeTab.value = tab
  if (tab === 'graph') graphVisited.value = true
}
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <HomeView v-show="activeTab === 'home'" />
    <GraphView v-if="graphVisited" v-show="activeTab === 'graph'" />

    <nav class="fixed inset-x-0 bottom-0 z-40 h-14 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div class="mx-auto flex h-full max-w-md items-stretch">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          type="button"
          class="flex-1 text-sm font-semibold transition"
          :class="
            activeTab === tab.key
              ? 'bg-gradient-to-t from-cyan-50 to-transparent text-cyan-600'
              : 'text-slate-400 hover:text-slate-600'
          "
          @click="switchTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>
    </nav>
  </div>
</template>
