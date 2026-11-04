<script setup lang="ts">
/**
 * 底部上滑面板容器：遮罩、滑出容器、标题栏，按 panel 分发给对应子表单。
 * contact / favor 面板内置「二合一」分段切换，可在同一抽屉内无缝切换两种表单。
 */
import { computed, ref, watch } from 'vue';
import type { ISODate, PanelType } from '../types/schema';
import ChooseSheet from './sheet/ChooseSheet.vue';
import TodoSheet from './sheet/TodoSheet.vue';
import ContactSheet from './sheet/ContactSheet.vue';
import LedgerSheet from './sheet/LedgerSheet.vue';
import DiarySheet from './sheet/DiarySheet.vue';
import FavorSheet from './sheet/FavorSheet.vue';
import { useCrmStore } from '../store/useCrmStore';

const props = defineProps<{ panel: PanelType; date: ISODate; editId?: string }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'choose', kind: 'contact' | 'ledger' | 'diary'): void;
}>();

const store = useCrmStore();
const visible = computed(() => props.panel !== 'none');
const isEdit = computed(() => !!props.editId);

/** contact / favor 双表单抽屉内的当前表单（面板切换时自动同步） */
const duoMode = ref<'contact' | 'favor'>(props.panel === 'favor' ? 'favor' : 'contact');
const isDuo = computed(() => props.panel === 'contact' || props.panel === 'favor');
watch(() => props.panel, (p) => {
  if (p === 'contact' || p === 'favor') duoMode.value = p;
});

const PANEL_TITLE: Record<Exclude<PanelType, 'none'>, string> = {
  choose: '新建', todo: '待办事项', contact: '联系人', ledger: '记一笔', diary: '日记', favor: '人情往来',
};
const title = computed(() => {
  const base = PANEL_TITLE[props.panel as Exclude<PanelType, 'none'>] ?? '';
  return isEdit.value ? `编辑${base}` : base;
});

function onChoose(kind: 'contact' | 'ledger' | 'diary'): void {
  emit('choose', kind);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="visible" class="as-overlay" @click.self="emit('close')">
        <div class="as-sheet">
          <div class="as-grip" />
          <div class="as-head">
            <span class="as-title">{{ title }}</span>
            <span v-if="panel !== 'choose'" class="as-date">{{ date }}</span>
            <button class="as-close" type="button" @click="emit('close')">✕</button>
          </div>

          <ChooseSheet v-if="panel === 'choose'" :date="date" @choose="onChoose" @close="emit('close')" />
          <TodoSheet v-else-if="panel === 'todo'" :date="date" />
          <template v-else-if="isDuo">
            <div class="as-seg">
              <button
                class="as-seg-btn"
                :class="{ on: duoMode === 'contact' }"
                type="button"
                @click="duoMode = 'contact'"
              >新增/修改联系人</button>
              <button
                class="as-seg-btn"
                :class="{ on: duoMode === 'favor' }"
                type="button"
                @click="duoMode = 'favor'"
              >人情往来添加</button>
            </div>
            <ContactSheet
              v-if="duoMode === 'contact'"
              :date="date"
              :edit-id="editId"
              @close="emit('close')"
            />
            <FavorSheet
              v-else
              :date="date"
              :contact-id="store.favorEdit?.contactId"
              :favor-id="store.favorEdit?.favorId"
              @close="emit('close')"
            />
          </template>
          <LedgerSheet v-if="panel === 'ledger'" :date="date" :edit-id="editId" @close="emit('close')" />
          <DiarySheet v-if="panel === 'diary'" :date="date" :edit-id="editId" @close="emit('close')" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.as-overlay {
  position: fixed; inset: 0; z-index: 50; background: rgba(15, 23, 42, 0.32);
  display: flex; align-items: flex-end; justify-content: center;
}
.as-sheet {
  width: 100%; max-width: 520px; max-height: 86vh; overflow-y: auto;
  background: #fff; border-radius: 18px 18px 0 0; padding: 6px 16px 18px;
  box-shadow: 0 -8px 30px rgba(15, 23, 42, 0.12); box-sizing: border-box;
}
.as-grip { width: 36px; height: 4px; border-radius: 2px; background: #e2e8f0; margin: 6px auto 2px; }
.as-head { display: flex; align-items: center; gap: 8px; padding: 6px 0 10px; }
.as-title { font-size: 15px; font-weight: 600; color: #1e293b; }
.as-date { font-size: 11px; color: #94a3b8; }
.as-close { margin-left: auto; border: 0; background: transparent; color: #94a3b8; font-size: 16px; padding: 2px 4px; }
/* 与「记一笔」同款的二合一分段切换按钮 */
.as-seg { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin: 0 0 8px; }
.as-seg-btn {
  border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b;
  font-size: 12px; padding: 7px 0; border-radius: 10px;
  transition: all 0.2s ease;
}
.as-seg-btn.on { background: #eef2ff; border-color: #c7d2fe; color: #4f46e5; font-weight: 600; }
.sheet-enter-active, .sheet-leave-active { transition: opacity 200ms ease; }
.sheet-enter-from, .sheet-leave-to { opacity: 0; }
.sheet-enter-active .as-sheet, .sheet-leave-active .as-sheet { transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1); }
.sheet-enter-from .as-sheet, .sheet-leave-to .as-sheet { transform: translateY(100%); }
</style>
