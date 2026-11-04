<script setup lang="ts">
/** 日记新建 / 编辑表单（待办与日记解耦：直接展示并独立落库当日待办） */
import { computed, reactive, ref } from 'vue';
import { Maximize2, Minimize2 } from '@lucide/vue';
import type { DiaryItem, ISODate } from '../../types/schema';
import { useCrmStore } from '../../store/useCrmStore';
import { uid } from '../../services/dbService';

const props = defineProps<{ date: ISODate; editId?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const store = useCrmStore();
const diaryForm = reactive({ id: undefined as string | undefined, date: '', content: '' });
const inlineText = ref('');
const inlineImportant = ref(false);
const pickedDate = ref('');
const pickedTime = ref('');
const fullscreen = ref(false);

const baseDate = computed(() => diaryForm.date || props.date);
/** 当日待办（含跨日常驻重要待办），与待办面板同一数据源，实时同步 */
const existingTodos = computed(() => store.todosForDay(baseDate.value));

function initDiary(): void {
  const d = props.editId
    ? store.diaries.find((x) => x.id === props.editId)
    : store.diaries.find((x) => x.date === props.date);
  Object.assign(diaryForm, { id: d?.id, date: d?.date ?? props.date, content: d?.content ?? '' });
  inlineText.value = '';
  inlineImportant.value = false;
  pickedDate.value = '';
  pickedTime.value = '';
}
/** 点「+」或回车：待办独立落库，不依赖日记是否保存 */
function addInline(): void {
  const text = inlineText.value.trim();
  if (!text) return;
  store.createTodo(text, inlineImportant.value, pickedDate.value || baseDate.value, pickedTime.value || undefined);
  inlineText.value = '';
  inlineImportant.value = false;
  pickedDate.value = '';
  pickedTime.value = '';
}
function removeExistingTodo(id: string): void {
  store.removeTodo(id);
}
function saveDiary(): void {
  const content = diaryForm.content.trim();
  // 没有正文且不是编辑既有日记：直接关闭，不创建空日记
  if (!content && !diaryForm.id) { emit('close'); return; }
  const existing = store.diaries.find((d) => d.id === diaryForm.id);
  const d: DiaryItem = {
    id: diaryForm.id ?? uid(), date: baseDate.value, content,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  store.upsertDiary(d);
  emit('close');
}
function deleteDiary(): void {
  if (diaryForm.id) store.removeDiary(diaryForm.id);
  emit('close');
}

initDiary();
</script>

<template>
  <div class="as-body" :class="{ 'as-full': fullscreen }">
    <div class="as-editor">
      <textarea
        v-model="diaryForm.content"
        class="as-input as-textarea"
        :rows="fullscreen ? 0 : 4"
        placeholder="自由记录今天…"
      />
      <button
        class="as-full-btn"
        type="button"
        :title="fullscreen ? '收起全屏' : '全屏输入'"
        @click="fullscreen = !fullscreen"
      >
        <Minimize2 v-if="fullscreen" :size="13" />
        <Maximize2 v-else :size="13" />
      </button>
    </div>

    <label class="as-label">当日待办（添加即保存，与待办面板实时同步）</label>
    <div
      v-for="t in existingTodos"
      :key="t.id"
      class="as-todo"
      @click="store.openPanel('todo', t.id)"
    >
      <button class="as-check" :class="{ on: t.done }" type="button" @click.stop="store.toggleTodo(t.id)">
        <span v-if="t.done">✓</span>
      </button>
      <span class="as-todo-text">{{ t.text }}</span>
      <span v-if="t.time" class="as-chip as-chip-time">⏰ {{ t.time }}</span>
      <span v-if="t.date !== baseDate" class="as-chip as-chip-date">📅 {{ t.date.slice(5) }}</span>
      <span v-if="t.isImportant && !t.done" class="as-badge">重要</span>
      <button class="as-star" :class="{ on: t.isImportant }" type="button" @click.stop="store.toggleImportant(t.id)">
        {{ t.isImportant ? '★' : '☆' }}
      </button>
      <button class="as-del-mini" type="button" @click.stop="removeExistingTodo(t.id)">🗑</button>
    </div>

    <div class="as-add">
      <input v-model="inlineText" class="as-input" placeholder="添加待办" @keyup.enter="addInline" />
      <button class="as-flag" :class="{ on: inlineImportant }" type="button" @click="inlineImportant = !inlineImportant">
        重要
      </button>
      <button class="as-add-btn" type="button" @click="addInline">+</button>
    </div>
    <div class="as-picks">
      <div class="as-pill" :class="{ 'as-pill-on': pickedDate }">
        <span class="as-pill-face"><span>📅</span>{{ pickedDate ? pickedDate.slice(5) : '选日期' }}</span>
        <input v-model="pickedDate" class="as-pill-native" type="date" />
        <button v-if="pickedDate" class="as-pill-x" type="button" @click.prevent="pickedDate = ''">×</button>
      </div>
      <div class="as-pill" :class="{ 'as-pill-on': pickedTime }">
        <span class="as-pill-face"><span>⏰</span>{{ pickedTime || '选时间' }}</span>
        <input v-model="pickedTime" class="as-pill-native" type="time" />
        <button v-if="pickedTime" class="as-pill-x" type="button" @click.prevent="pickedTime = ''">×</button>
      </div>
      <span class="as-picks-hint">不选默认 {{ baseDate.slice(5) }}</span>
    </div>
    <p class="as-hint">「重要」且未完成时，会跨日常驻置顶在所有日期的工作台</p>

    <div class="as-foot">
      <button v-if="diaryForm.id" class="as-danger" type="button" @click="deleteDiary">🗑 删除</button>
      <span class="as-spacer" />
      <button class="as-ghost" type="button" @click="emit('close')">取消</button>
      <button class="as-primary" type="button" @click="saveDiary">保存</button>
    </div>
  </div>
</template>

<style scoped>
.as-body {
  display: flex; flex-direction: column; gap: 4px; padding-bottom: 4px;
  transition: height 0.25s ease, max-height 0.25s ease;
}
.as-full { height: 92vh; max-height: 92vh; }
.as-editor { position: relative; display: flex; flex-direction: column; transition: all 0.25s ease; }
.as-full .as-editor { flex: 1 1 auto; min-height: 0; }
.as-label { font-size: 11px; color: #94a3b8; margin-top: 8px; }
.as-input {
  width: 100%; box-sizing: border-box; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 9px 10px; font-size: 13px; color: #1e293b; background: #fff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.as-input:focus { outline: none; border-color: #c7d2fe; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08); }
.as-textarea { resize: none; line-height: 1.6; }
.as-full .as-textarea { flex: 1 1 auto; min-height: 0; height: 100%; padding-right: 34px; }
.as-full-btn {
  position: absolute; top: 6px; right: 6px; width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #e2e8f0; border-radius: 8px; background: rgba(255, 255, 255, 0.85);
  color: #64748b; backdrop-filter: blur(2px); cursor: pointer;
  transition: all 0.2s ease;
}
.as-full-btn:active { transform: scale(0.95); }
.as-full-btn:hover { color: #4f46e5; border-color: #c7d2fe; }
.as-todo { display: flex; align-items: center; gap: 6px; padding: 5px 4px; border-radius: 8px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.as-todo:active { background: #f8fafc; }
.as-check {
  width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid #cbd5e1;
  background: #fff; color: #fff; font-size: 10px; flex-shrink: 0; padding: 0;
  display: flex; align-items: center; justify-content: center;
}
.as-check.on { background: #6366f1; border-color: #6366f1; }
.as-todo-text {
  font-size: 13px; color: #334155; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.as-badge { font-size: 10px; color: #d97706; background: #fffbeb; border-radius: 4px; padding: 0 5px; flex-shrink: 0; }
.as-chip {
  font-size: 9px; line-height: 15px; padding: 0 5px; border-radius: 999px;
  flex-shrink: 0; white-space: nowrap;
}
.as-chip-time { color: #4f46e5; background: #eef2ff; border: 1px solid #e0e7ff; }
.as-chip-date { color: #0f766e; background: #ecfdf5; border: 1px solid #d1fae5; }
.as-star { border: 0; background: transparent; color: #cbd5e1; font-size: 13px; padding: 0 2px; flex-shrink: 0; }
.as-star.on { color: #f59e0b; }
.as-del-mini { border: 0; background: transparent; font-size: 12px; padding: 0 2px; flex-shrink: 0; }
.as-add { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
.as-flag {
  border: 1px solid #fde68a; background: #fff; color: #b45309;
  font-size: 11px; border-radius: 8px; padding: 7px 8px; flex-shrink: 0;
  transition: all 0.2s ease;
}
.as-flag:active { transform: scale(0.95); }
.as-flag.on { background: #f59e0b; border-color: #f59e0b; color: #fff; }
.as-add-btn {
  border: 0; background: #6366f1; color: #fff; border-radius: 9px;
  font-size: 15px; width: 42px; height: 38px; flex-shrink: 0;
  transition: all 0.2s ease;
}
.as-add-btn:active { transform: scale(0.95); }
.as-picks { display: flex; align-items: center; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.as-pill {
  position: relative; display: inline-flex; align-items: center; height: 23px;
  padding: 0 9px; border-radius: 999px; border: 1px solid #e2e8f0;
  background: #f8fafc; color: #94a3b8; font-size: 10px; overflow: hidden;
  transition: all 0.2s ease;
}
.as-pill-on { background: #eef2ff; border-color: #c7d2fe; color: #4f46e5; }
.as-pill-face { display: inline-flex; align-items: center; gap: 3px; pointer-events: none; white-space: nowrap; }
.as-pill-native { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; border: 0; cursor: pointer; }
.as-pill-x {
  position: relative; z-index: 2; border: 0; background: transparent;
  color: #818cf8; font-size: 12px; line-height: 1; padding: 0 0 0 5px;
}
.as-picks-hint { font-size: 9px; color: #b6c2d2; margin-left: auto; white-space: nowrap; }
.as-hint { font-size: 10px; color: #94a3b8; margin: 6px 0 0; }
.as-foot { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.as-full .as-foot { margin-top: auto; padding-top: 10px; }
.as-spacer { flex: 1; }
.as-danger { border: 0; background: #fff1f2; color: #e11d48; font-size: 12px; border-radius: 9px; padding: 8px 10px; }
.as-ghost {
  border: 1px solid #e2e8f0; background: #fff; color: #64748b;
  font-size: 12px; border-radius: 9px; padding: 8px 14px;
}
.as-primary { border: 0; background: #4f46e5; color: #fff; font-size: 12px; border-radius: 9px; padding: 8px 18px; }
</style>
