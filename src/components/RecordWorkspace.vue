<script setup lang="ts">
/**
 * 下半屏工作台：按持久化布局渲染三个独立小窗口
 * 长按任意小模块进入「布局编辑中」，可拖拽底边调高度、拖拽中部换顺序，保存后永久生效
 */
import { ref } from 'vue';
import type { ISODate } from '../types/schema';
import { useCrmStore } from '../store/useCrmStore';
import { MAX_WIDGET_H, MIN_WIDGET_H, type WidgetKey } from '../services/db/layout';
import ContactWidget from './workspace/ContactWidget.vue';
import LedgerWidget from './workspace/LedgerWidget.vue';
import DiaryWidget from './workspace/DiaryWidget.vue';

defineProps<{ selectedDate: ISODate }>();
const emit = defineEmits<{
  (e: 'create', kind: 'contact' | 'ledger' | 'diary'): void;
  (e: 'edit', kind: 'contact' | 'ledger' | 'diary', id: string): void;
}>();

const store = useCrmStore();
const widgetMap = { contact: ContactWidget, ledger: LedgerWidget, diary: DiaryWidget };
const GAP = 8;

const editing = ref(false);
const draftOrder = ref<WidgetKey[]>([...store.layoutOrder]);
const draftHeights = ref<Record<WidgetKey, number>>({ ...store.layoutHeights });

let moveKey: WidgetKey | null = null;
let moveAccum = 0;

function resetDraft(): void {
  draftOrder.value = [...store.layoutOrder];
  draftHeights.value = { ...store.layoutHeights };
}
function enterEdit(): void {
  if (editing.value) return;
  resetDraft();
  editing.value = true;
}
function cancelEdit(): void {
  editing.value = false;
  resetDraft();
}
function saveEdit(): void {
  store.applyLayout([...draftOrder.value], { ...draftHeights.value });
  editing.value = false;
}
function onResize(key: WidgetKey, dy: number): void {
  const next = (draftHeights.value[key] ?? MIN_WIDGET_H) + dy;
  draftHeights.value[key] = Math.round(Math.min(MAX_WIDGET_H, Math.max(MIN_WIDGET_H, next)));
}
function swap(i: number, j: number): void {
  const list = draftOrder.value.slice();
  const tmp = list[i];
  list[i] = list[j];
  list[j] = tmp;
  draftOrder.value = list;
}
function onMove(key: WidgetKey, dy: number): void {
  if (moveKey !== key) {
    moveKey = key;
    moveAccum = 0;
  }
  moveAccum += dy;
  for (let guard = 0; guard < 4; guard += 1) {
    const idx = draftOrder.value.indexOf(key);
    if (moveAccum > 0) {
      const next = draftOrder.value[idx + 1];
      if (!next) break;
      const span = (draftHeights.value[next] ?? MIN_WIDGET_H) + GAP;
      if (moveAccum < span / 2) break;
      swap(idx, idx + 1);
      moveAccum -= span;
    } else if (moveAccum < 0) {
      const prev = draftOrder.value[idx - 1];
      if (!prev) break;
      const span = (draftHeights.value[prev] ?? MIN_WIDGET_H) + GAP;
      if (-moveAccum < span / 2) break;
      swap(idx, idx - 1);
      moveAccum += span;
    } else {
      break;
    }
  }
}
function onMoveEnd(): void {
  moveKey = null;
  moveAccum = 0;
}
function onCreate(key: WidgetKey): void { emit('create', key); }
function onEdit(key: WidgetKey, id: string): void { emit('edit', key, id); }
</script>

<template>
  <div class="rw-root">
    <div v-if="editing" class="rw-editbar">
      <span class="rw-edit-label">布局编辑中</span>
      <div class="rw-edit-actions">
        <button class="rw-edit-btn" type="button" @click="cancelEdit">取消</button>
        <button class="rw-edit-btn rw-edit-save" type="button" @click="saveEdit">保存</button>
      </div>
    </div>
    <component
      :is="widgetMap[key]"
      v-for="key in draftOrder"
      :key="key"
      :selected-date="selectedDate"
      :height="draftHeights[key]"
      :editing="editing"
      @create="onCreate(key)"
      @edit="onEdit(key, $event)"
      @long-press="enterEdit"
      @resize="onResize(key, $event)"
      @move="onMove(key, $event)"
      @move-end="onMoveEnd"
    />
  </div>
</template>

<style scoped>
.rw-root {
  height: 100%; overflow-y: auto; overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch; padding: 8px 10px 12px;
  display: flex; flex-direction: column; gap: 8px; background: #f8fafc;
}
.rw-editbar {
  position: sticky; top: 0; z-index: 10; flex-shrink: 0;
  margin: -8px -10px 0; padding: 7px 12px;
  display: flex; align-items: center; justify-content: space-between;
  background: #eef2ff; border-bottom: 1px solid #e0e7ff;
}
.rw-edit-label { font-size: 12px; font-weight: 600; color: #4338ca; }
.rw-edit-actions { display: flex; gap: 6px; }
.rw-edit-btn {
  border: 1px solid #c7d2fe; background: #fff; color: #4f46e5;
  font-size: 11px; padding: 4px 10px; border-radius: 8px;
  -webkit-tap-highlight-color: transparent;
}
.rw-edit-save { background: #4f46e5; border-color: #4f46e5; color: #fff; }
</style>
