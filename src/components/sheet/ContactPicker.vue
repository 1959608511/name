<script setup lang="ts">
/** 已有联系人下拉选择面板（支持按姓名 / 别名 / 电话 / 标签搜索） */
import { computed, ref, watch } from 'vue';
import type { ContactPerson } from '../../types/schema';
import { useCrmStore } from '../../store/useCrmStore';

const props = defineProps<{ visible: boolean; selectedId?: string }>();
const emit = defineEmits<{
  (e: 'select', contact: ContactPerson): void;
  (e: 'close'): void;
}>();

const store = useCrmStore();
const keyword = ref('');

const filtered = computed<ContactPerson[]>(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return store.contacts;
  return store.contacts.filter((c) =>
    c.name.toLowerCase().includes(kw) ||
    c.aliases.some((a) => a.toLowerCase().includes(kw)) ||
    c.phone.toLowerCase().includes(kw) ||
    c.tags.some((t) => t.toLowerCase().includes(kw)),
  );
});

// 每次打开时清空搜索词
watch(() => props.visible, (v) => {
  if (v) keyword.value = '';
});

function pick(c: ContactPerson): void {
  emit('select', c);
  keyword.value = '';
}
</script>

<template>
  <div v-if="visible" class="cp-panel">
    <input v-model="keyword" class="cp-search" placeholder="搜索 姓名 / 别名 / 电话 / 标签" />
    <div class="cp-list">
      <button
        v-for="c in filtered"
        :key="c.id"
        class="cp-item"
        :class="{ on: c.id === selectedId }"
        type="button"
        @click="pick(c)"
      >
        <span class="cp-name">{{ c.name }}</span>
        <span class="cp-sub">{{ c.phone || c.tags.join('、') || '—' }}</span>
      </button>
      <p v-if="!filtered.length" class="cp-empty">无匹配联系人</p>
    </div>
  </div>
</template>

<style scoped>
.cp-panel {
  position: absolute; left: 0; right: 0; top: calc(100% + 4px);
  z-index: 10; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); padding: 8px;
  max-height: 240px; display: flex; flex-direction: column;
}
.cp-search {
  width: 100%; box-sizing: border-box; border: 1px solid #e2e8f0; border-radius: 8px;
  padding: 7px 10px; font-size: 12px; color: #1e293b; background: #f8fafc;
}
.cp-search:focus { outline: none; border-color: #c7d2fe; }
.cp-list { flex: 1; overflow-y: auto; margin-top: 6px; display: flex; flex-direction: column; gap: 2px; }
.cp-item {
  display: flex; align-items: center; gap: 8px; padding: 7px 8px;
  border: 0; background: transparent; border-radius: 8px; text-align: left;
  -webkit-tap-highlight-color: transparent;
}
.cp-item:active, .cp-item.on { background: #eef2ff; }
.cp-name { font-size: 13px; color: #1e293b; flex-shrink: 0; }
.cp-sub { font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cp-empty { font-size: 12px; color: #b6c2d2; padding: 10px; text-align: center; }
</style>
