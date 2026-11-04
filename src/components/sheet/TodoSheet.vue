<script setup lang="ts">
/** 待办管理面板：当日待办 + 跨日常驻重要待办，支持单条待办独立编辑 */
import { computed, reactive, ref, watch } from 'vue';
import type { ISODate } from '../../types/schema';
import { useCrmStore } from '../../store/useCrmStore';

const props = defineProps<{ date: ISODate; editId?: string }>();
const store = useCrmStore();

const todoList = computed(() => store.todosForDay(props.date));
const newTodoText = ref('');
const newTodoImportant = ref(false);

/** 单条待办编辑态：外部传入 editId 或在列表内点击待办进入 */
const editingId = ref<string | undefined>(undefined);
const form = reactive({ text: '', date: '' as ISODate, time: '', isImportant: false, done: false });
const editError = ref('');
const editingTodo = computed(() => store.todos.find((t) => t.id === editingId.value));

function startEdit(id: string): void {
  const t = store.todos.find((x) => x.id === id);
  if (!t) return;
  editingId.value = id;
  editError.value = '';
  Object.assign(form, { text: t.text, date: t.date, time: t.time ?? '', isImportant: !!t.isImportant, done: t.done });
}
watch(() => props.editId, (id) => { if (id) startEdit(id); else editingId.value = undefined; }, { immediate: true });

function addTodo(): void {
  store.createTodo(props.date, newTodoText.value, newTodoImportant.value);
  newTodoText.value = '';
  newTodoImportant.value = false;
}
function saveEdit(): void {
  const target = editingTodo.value;
  const text = form.text.trim();
  if (!target) return;
  if (!text) { editError.value = '请输入待办内容'; return; }
  store.upsertTodo({
    ...target, text, date: form.date || target.date, time: form.time || undefined,
    isImportant: form.isImportant, done: form.done,
  });
  editingId.value = undefined;
}
function cancelEdit(): void {
  editingId.value = undefined;
  editError.value = '';
}
function deleteEditing(): void {
  if (editingId.value) store.removeTodo(editingId.value);
  cancelEdit();
}
</script>

<template>
  <div class="as-body">
    <template v-if="editingId && editingTodo">
      <label class="as-label">待办内容</label>
      <input v-model="form.text" class="as-input" placeholder="输入待办内容" @keyup.enter="saveEdit" />
      <p v-if="editError" class="as-error">{{ editError }}</p>
      <div class="as-grid2">
        <div>
          <label class="as-label">日期</label>
          <input v-model="form.date" class="as-input" type="date" />
        </div>
        <div>
          <label class="as-label">时间</label>
          <input v-model="form.time" class="as-input" type="time" />
        </div>
      </div>
      <div class="as-toggles">
        <button class="as-flag" :class="{ on: form.isImportant }" type="button" @click="form.isImportant = !form.isImportant">
          {{ form.isImportant ? '★ 重要' : '☆ 重要' }}
        </button>
        <button class="as-flag as-flag-done" :class="{ on: form.done }" type="button" @click="form.done = !form.done">
          {{ form.done ? '✓ 已完成' : '未完成' }}
        </button>
      </div>
      <div class="as-foot">
        <button class="as-danger" type="button" @click="deleteEditing">🗑 删除</button>
        <span class="as-spacer" />
        <button class="as-ghost" type="button" @click="cancelEdit">取消</button>
        <button class="as-primary" type="button" @click="saveEdit">保存</button>
      </div>
    </template>

    <template v-else>
      <div
        v-for="t in todoList"
        :key="t.id"
        class="as-todo"
        :class="{ done: t.done }"
        @click="startEdit(t.id)"
      >
        <button class="as-check" :class="{ on: t.done }" type="button" @click.stop="store.toggleTodo(t.id)">
          <span v-if="t.done">✓</span>
        </button>
        <span class="as-todo-text">{{ t.text }}</span>
        <span v-if="t.isImportant && !t.done" class="as-badge">重要</span>
        <span v-if="t.date !== date" class="as-badge gray">{{ t.date.slice(5) }}</span>
        <button class="as-star" :class="{ on: t.isImportant }" type="button" @click.stop="store.toggleImportant(t.id)">
          {{ t.isImportant ? '★' : '☆' }}
        </button>
        <button class="as-del-mini" type="button" @click.stop="store.removeTodo(t.id)">🗑</button>
      </div>
      <p v-if="!todoList.length" class="as-empty">暂无待办</p>
      <div class="as-add">
        <input v-model="newTodoText" class="as-input" placeholder="添加待办" @keyup.enter="addTodo" />
        <button class="as-flag" :class="{ on: newTodoImportant }" type="button" @click="newTodoImportant = !newTodoImportant">重要</button>
        <button class="as-add-btn" type="button" @click="addTodo">+</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.as-body { display: flex; flex-direction: column; gap: 4px; padding-bottom: 4px; }
.as-label { font-size: 11px; color: #94a3b8; margin-top: 8px; }
.as-todo { display: flex; align-items: center; gap: 7px; padding: 5px 4px; border-radius: 8px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.as-todo:active { background: #f8fafc; }
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
.as-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.as-toggles { display: flex; gap: 8px; margin-top: 10px; }
.as-flag {
  border: 1px solid #fde68a; background: #fff; color: #b45309;
  font-size: 11px; border-radius: 8px; padding: 7px 8px; flex-shrink: 0;
}
.as-flag.on { background: #f59e0b; border-color: #f59e0b; color: #fff; }
.as-flag-done { border-color: #c7d2fe; color: #4f46e5; }
.as-flag-done.on { background: #6366f1; border-color: #6366f1; color: #fff; }
.as-add-btn {
  border: 0; background: #6366f1; color: #fff; border-radius: 9px;
  font-size: 15px; width: 42px; height: 38px; flex-shrink: 0;
}
.as-empty { font-size: 12px; color: #cbd5e1; text-align: center; padding: 12px 0; }
.as-foot { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.as-spacer { flex: 1; }
.as-danger { border: 0; background: #fff1f2; color: #e11d48; font-size: 12px; border-radius: 9px; padding: 8px 10px; }
.as-ghost {
  border: 1px solid #e2e8f0; background: #fff; color: #64748b;
  font-size: 12px; border-radius: 9px; padding: 8px 14px;
}
.as-primary { border: 0; background: #4f46e5; color: #fff; font-size: 12px; border-radius: 9px; padding: 8px 18px; }
.as-error { color: #e11d48; font-size: 11px; margin: 2px 0 0; }
</style>
