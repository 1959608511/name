<script setup lang="ts">
/** 长按新建选择 + AI 快记 */
import { ref } from 'vue';
import type { ISODate } from '../../types/schema';
import { useCrmStore } from '../../store/useCrmStore';
import { quickAdd } from '../../services/aiService';

const props = defineProps<{ date: ISODate }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'choose', kind: 'contact' | 'ledger' | 'diary'): void;
}>();

const store = useCrmStore();
const aiText = ref('');

function choose(kind: 'contact' | 'ledger' | 'diary'): void {
  emit('choose', kind);
}
function runAi(): void {
  if (!aiText.value.trim()) return;
  quickAdd(aiText.value.trim(), props.date);
  store.loadAll();
  aiText.value = '';
  emit('close');
}
</script>

<template>
  <div>
    <div class="as-choose">
      <button class="as-choice" type="button" @click="choose('contact')">
        <span class="as-choice-emoji">👥</span><span>通讯录</span>
      </button>
      <button class="as-choice" type="button" @click="choose('ledger')">
        <span class="as-choice-emoji">💳</span><span>记账</span>
      </button>
      <button class="as-choice" type="button" @click="choose('diary')">
        <span class="as-choice-emoji">📖</span><span>日记</span>
      </button>
    </div>
    <div class="as-ai">
      <input v-model="aiText" class="as-input" placeholder="🐟 AI 快记：一句话记账 / 待办" @keyup.enter="runAi" />
      <button class="as-ai-btn" type="button" @click="runAi">记下</button>
    </div>
  </div>
</template>

<style scoped>
.as-choose { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 4px 0 12px; }
.as-choice {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  border: 1px solid #eef2f7; background: #f8fafc; border-radius: 14px;
  padding: 14px 0; font-size: 12px; color: #334155;
  -webkit-tap-highlight-color: transparent;
}
.as-choice-emoji { font-size: 20px; }
.as-ai { display: flex; gap: 6px; padding-bottom: 4px; }
.as-input {
  width: 100%; box-sizing: border-box; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 9px 10px; font-size: 13px; color: #1e293b; background: #fff;
}
.as-input:focus { outline: none; border-color: #c7d2fe; }
.as-ai-btn {
  border: 0; background: #6366f1; color: #fff; border-radius: 9px;
  font-size: 12px; padding: 0 12px; flex-shrink: 0;
}
</style>
