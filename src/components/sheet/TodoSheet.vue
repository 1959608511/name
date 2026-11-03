<script setup lang="ts">
/** 待办管理面板：当日待办 + 跨日常驻重要待办 */
import { computed, ref } from 'vue';
import type { ISODate } from '../../types/schema';
import { useCrmStore } from '../../store/useCrmStore';

const props = defineProps<{ date: ISODate }>();
const store = useCrmStore();

const todoList = computed(() => store.todosForDay(props.date));
const newTodoText = ref('');
const newTodoImportant = ref(false);

function addTodo(): void {
  store.createTodo(props.date, newTodoText.value, newTodoImportant.value);
  newTodoText.value = '';
  newTodoImportant.value = false;
}
</script>

<template>
  <div class="as-body">
    <div v-for="t in todoList" :key="t.id" class="as-todo" :class="{ done: t.done }">
      <button class="as-check" :class="{ on: t.done }" type="button" @click="store.toggleTodo(t.id)">
        <span v-if="t.done">✓</span>
      </button>
      <span class="as-todo-text">{{ t.text }}</span>
      <span v-if="t.isImportant && !t.done" class="as-badge">重要</span>
      <span v-if="t.date !== date" class="as-badge gray">{{ t.date.slice(5) }}</span>
      <button class="as-star" :class="{ on: t.isImportant }" type="button" @click="store.toggleImportant(t.id)">
        {{ t.isImportant ? '★' : '☆' }}
      </button>
      <button class="as-del-mini" type="button" @click="store.removeTodo(t.id)">🗑</button>
    </div>
    <p v-if="!todoList.length" class="as-empty">暂无待办</p>
    <div class="as-add">
      <input v-model="newTodoText" class="as-input" placeholder="添加待办…" @keyup.enter="addTodo" />
      <button class="as-flag" :class="{ on: newTodoImportant }" type="button" @click="newTodoImportant = !newTodoImportant">重要</button>
      <button class="as-add-btn" type="button" @click="addTodo">+</button>
    </div>
  </div>
</template>

<style scoped>
.as-body { display: flex; flex-direction: column; gap: 4px; padding-bottom: 4px; }
.as-todo { display: flex; align-items: center; gap: 7px; padding: 5px 0; }
.as-check {
  width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid #cbd5e1;
  background: #fff; color: #fff; font-size: 10px; flex-shrink: 0; padding: 0;
}
.as-check.on { background: #6366f1; border-color: #6366f1; }
.as-todo-text {
  font-size: 13px; color: #334155; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.as-todo.done .as-todo-text { color: #94a3b8; text-decoration: line-through; }
.as-badge { font-size: 10px; color: #d97706; background: #fffbeb; border-radius: 4px; padding: 0 5px; flex-shrink: 0; }
.as-badge.gray { color: #94a3b8; background: #f1f5f9; }
.as-star { border: 0; background: transparent; color: #cbd5e1; font-size: 13px; padding: 0 2px; flex-shrink: 0; }
.as-star.on { color: #f59e0b; }
.as-del-mini { border: 0; background: transparent; font-size: 12px; padding: 0 2px; flex-shrink: 0; }
.as-add { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
.as-input {
  width: 100%; box-sizing: border-box; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 9px 10px; font-size: 13px; color: #1e293b; background: #fff;
}
.as-input:focus { outline: none; border-color: #c7d2fe; }
.as-flag {
  border: 1px solid #fde68a; background: #fff; color: #b45309;
  font-size: 11px; border-radius: 8px; padding: 7px 8px; flex-shrink: 0;
}
.as-flag.on { background: #f59e0b; border-color: #f59e0b; color: #fff; }
.as-add-btn {
  border: 0; background: #6366f1; color: #fff; border-radius: 9px;
  font-size: 15px; width: 42px; height: 38px; flex-shrink: 0;
}
.as-empty { font-size: 12px; color: #cbd5e1; text-align: center; padding: 12px 0; }
</style>
