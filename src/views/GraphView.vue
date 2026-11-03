<script setup lang="ts">
// 关系图谱（本轮为占位壳子，ECharts 力导向图下一轮接入）
import { computed } from 'vue';
import { useCrmStore } from '../store/useCrmStore';

const store = useCrmStore();
const nodeCount = computed(() => store.contacts.length);
const edgeCount = computed(() => store.relations.length);
</script>

<template>
  <section class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
    <h1 class="text-xl font-semibold text-slate-800">关系图谱</h1>
    <p class="text-sm text-slate-500">联系人 {{ nodeCount }} 位 · 关系连线 {{ edgeCount }} 条</p>
    <p class="text-xs text-slate-300">力导向图与档案卡片将在下一轮接入</p>
  </section>
</template>
