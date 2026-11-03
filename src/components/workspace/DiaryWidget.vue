<script setup lang="ts">
/** 工作台 · 日记 / 待办窗口（当日视图 / 全部视图切换，正文 + 关联待办双向同步） */
import { computed, ref } from 'vue';
import type { ISODate, TodoItem } from '../../types/schema';
import { useCrmStore } from '../../store/useCrmStore';
import WorkspaceCard from '../WorkspaceCard.vue';

const props = defineProps<{ selectedDate: ISODate }>();
const emit = defineEmits<{
  (e: 'create'): void;
  (e: 'edit', id: string): void;
}>();

const store = useCrmStore();
const newTodoText = ref('');
const newTodoImportant = ref(false);
const pickedDate = ref('');
const pickedTime = ref('');

const isAll = computed(() => store.diaryScope === 'all');

/** 日期倒序（同日按录入时间倒序） */
function byDateDesc(a: TodoItem, b: TodoItem): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return b.createdAt - a.createdAt;
}

const dayDiary = computed(() => store.diaries.find((d) => d.date === props.selectedDate));
const dayTodos = computed(() => store.todosForDay(props.selectedDate));

/** 全部模式：所有日记按日期倒序 */
const allDiaries = computed(() => store.diaries.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)));
/** 全部模式：未完成重要待办置顶，其余按日期倒序 */
const allTodos = computed(() => {
  const pinned = store.todos.filter((t) => t.isImportant && !t.done).sort(byDateDesc);
  const rest = store.todos.filter((t) => !(t.isImportant && !t.done)).sort(byDateDesc);
  return [...pinned, ...rest];
});

const diaryList = computed(() => (isAll.value ? allDiaries.value : dayDiary.value ? [dayDiary.value] : []));
const todoList = computed(() => (isAll.value ? allTodos.value : dayTodos.value));
const undoneCount = computed(() => todoList.value.filter((t) => !t.done).length);

function toggleScope(): void {
  store.setDiaryScope(isAll.value ? 'day' : 'all');
}
function addInlineTodo(): void {
  const text = newTodoText.value.trim();
  if (!text) return;
  store.createTodo(text, newTodoImportant.value, pickedDate.value || props.selectedDate, pickedTime.value || undefined);
  newTodoText.value = '';
  newTodoImportant.value = false;
  pickedDate.value = '';
  pickedTime.value = '';
}
</script>

<template>
  <WorkspaceCard
    title="日记 · 待办"
    emoji="📖"
    :meta="undoneCount ? `${undoneCount} 项未完成` : ''"
  >
    <template #actions>
      <button class="dw-act dw-act-violet" type="button" @click="emit('create')">+ 写日记</button>
      <button class="dw-act" :class="{ 'dw-act-on': isAll }" type="button" @click="toggleScope">全部</button>
    </template>

    <div
      v-for="d in diaryList"
      :key="d.id"
      class="dw-diary"
      @click="emit('edit', d.id)"
    >
      <span v-if="isAll" class="dw-date">{{ d.date }}</span>
      <span class="dw-diary-text">{{ d.content }}</span>
    </div>
    <p v-if="!diaryList.length" class="dw-empty">点右上角写下今天的日记</p>
    <div class="dw-todos">
      <div v-for="t in todoList" :key="t.id" class="dw-todo" :class="{ 'dw-todo-done': t.done }">
        <button class="dw-check" :class="{ on: t.done }" type="button" @click="store.toggleTodo(t.id)">
          <span v-if="t.done">✓</span>
        </button>
        <span class="dw-todo-text">{{ t.text }}</span>
        <span v-if="t.time" class="dw-chip dw-chip-time">⏰ {{ t.time }}</span>
        <span v-if="t.isImportant && !t.done" class="dw-badge">重要</span>
        <span v-if="isAll || t.date !== selectedDate" class="dw-badge dw-badge-date">{{ t.date.slice(5) }}</span>
        <button class="dw-star" :class="{ on: t.isImportant }" type="button" @click="store.toggleImportant(t.id)">
          {{ t.isImportant ? '★' : '☆' }}
        </button>
      </div>
    </div>
    <template #footer>
      <div class="dw-add-wrap">
        <div v-if="pickedDate || pickedTime" class="dw-picked">
          <span v-if="pickedDate" class="dw-pick">
            📅 {{ pickedDate.slice(5) }}
            <button class="dw-pick-x" type="button" @click="pickedDate = ''">×</button>
          </span>
          <span v-if="pickedTime" class="dw-pick">
            ⏰ {{ pickedTime }}
            <button class="dw-pick-x" type="button" @click="pickedTime = ''">×</button>
          </span>
        </div>
        <div class="dw-add">
          <input
            v-model="newTodoText"
            class="dw-input"
            type="text"
            placeholder="随手添加关联待办"
            @keyup.enter="addInlineTodo"
          />
          <div class="dw-picker" :class="{ on: pickedDate }" title="选择日期">
            <span class="dw-picker-face">📅</span>
            <input v-model="pickedDate" class="dw-picker-native" type="date" aria-label="选择日期" />
          </div>
          <div class="dw-picker" :class="{ on: pickedTime }" title="选择时间">
            <span class="dw-picker-face">⏰</span>
            <input v-model="pickedTime" class="dw-picker-native" type="time" aria-label="选择时间" />
          </div>
          <button
            class="dw-important"
            :class="{ on: newTodoImportant }"
            type="button"
            @click="newTodoImportant = !newTodoImportant"
          >重要</button>
          <button class="dw-add-btn" type="button" @click="addInlineTodo">+</button>
        </div>
      </div>
    </template>
  </WorkspaceCard>
</template>

<style scoped>
/* 右上角胶囊按钮 */
.dw-act {
  border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b;
  font-size: 10px; line-height: 1.4; padding: 3px 6px; border-radius: 999px;
  flex-shrink: 0; white-space: nowrap; -webkit-tap-highlight-color: transparent;
}
.dw-act-violet { background: #f5f3ff; color: #7c3aed; border-color: #ede9fe; }
.dw-act-on { background: #7c3aed; color: #fff; border-color: #7c3aed; }

.dw-diary {
  display: flex; align-items: flex-start; gap: 5px; font-size: 12px; color: #475569;
  line-height: 1.6; padding: 4px; border-radius: 8px;
}
.dw-diary:active { background: #f8fafc; }
.dw-diary-text {
  flex: 1; min-width: 0; white-space: pre-wrap; max-height: 48px;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.dw-date {
  font-size: 9px; line-height: 13px; padding: 0 4px; border-radius: 4px;
  background: #f1f5f9; color: #94a3b8; flex-shrink: 0; margin-top: 2px;
}
.dw-empty { font-size: 11px; color: #b6c2d2; padding: 8px 4px; }
.dw-todos { display: flex; flex-direction: column; }
.dw-todo { display: flex; align-items: center; gap: 6px; padding: 3px 4px; }
.dw-check {
  width: 15px; height: 15px; border-radius: 50%; border: 1.5px solid #cbd5e1;
  background: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: #fff; flex-shrink: 0; padding: 0;
}
.dw-check.on { background: #6366f1; border-color: #6366f1; }
.dw-todo-text { font-size: 12px; color: #334155; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dw-todo-done .dw-todo-text { color: #94a3b8; text-decoration: line-through; }
.dw-badge {
  font-size: 9px; line-height: 13px; padding: 0 4px; border-radius: 4px;
  background: #fffbeb; color: #d97706; flex-shrink: 0;
}
.dw-badge-date { background: #f1f5f9; color: #94a3b8; }
.dw-chip {
  font-size: 9px; line-height: 15px; padding: 0 5px; border-radius: 999px;
  flex-shrink: 0; white-space: nowrap;
}
.dw-chip-time { color: #4f46e5; background: #eef2ff; border: 1px solid #e0e7ff; }
.dw-star {
  border: 0; background: transparent; font-size: 12px; color: #cbd5e1;
  padding: 0 2px; flex-shrink: 0;
}
.dw-star.on { color: #f59e0b; }
.dw-add-wrap { display: flex; flex-direction: column; gap: 4px; }
.dw-picked { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.dw-pick {
  display: inline-flex; align-items: center; gap: 2px; font-size: 9px; line-height: 16px;
  padding: 0 5px; border-radius: 999px; color: #4f46e5; background: #eef2ff;
  border: 1px solid #e0e7ff; white-space: nowrap;
}
.dw-pick-x {
  border: 0; background: transparent; color: #818cf8; font-size: 10px;
  line-height: 1; padding: 0 0 0 2px;
}
.dw-add { display: flex; align-items: center; gap: 5px; }
.dw-input {
  flex: 1; min-width: 0; border: 1px solid #e2e8f0; border-radius: 8px;
  padding: 5px 8px; font-size: 11px; color: #334155; background: #fff;
}
.dw-input:focus { outline: none; border-color: #c7d2fe; }
.dw-picker {
  position: relative; width: 24px; height: 24px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #e2e8f0; border-radius: 7px; background: #f8fafc;
  overflow: hidden; transition: all 0.2s ease;
}
.dw-picker.on { background: #eef2ff; border-color: #c7d2fe; }
.dw-picker:active { transform: scale(0.95); }
.dw-picker-face { font-size: 10px; pointer-events: none; }
.dw-picker-native {
  position: absolute; inset: 0; width: 100%; height: 100%;
  opacity: 0; border: 0; cursor: pointer;
}
.dw-important {
  border: 1px solid #fde68a; background: #fff; color: #b45309; font-size: 10px;
  border-radius: 7px; padding: 4px 6px; flex-shrink: 0;
}
.dw-important.on { background: #f59e0b; border-color: #f59e0b; color: #fff; }
.dw-add-btn {
  border: 0; background: #6366f1; color: #fff; font-size: 14px;
  width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0; line-height: 1;
}
</style>
