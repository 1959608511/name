<script setup lang="ts">
/** 人情往来新建 / 编辑表单（严格 4 字段：联系人 / 内容 / 日期 / 标签） */
import { computed, reactive, ref } from 'vue';
import type { ContactPerson, ISODate } from '../../types/schema';
import { useCrmStore } from '../../store/useCrmStore';
import { uid } from '../../services/dbService';
import ContactPicker from './ContactPicker.vue';

const props = defineProps<{ date: ISODate; contactId?: string; favorId?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const store = useCrmStore();
const isEdit = computed(() => !!props.contactId && !!props.favorId);

const favorForm = reactive({
  contactName: '',
  contactId: undefined as string | undefined,
  title: '',
  date: '' as ISODate,
  tag: '',
});
const favorError = ref('');
const tagFocused = ref(false);
const pickerOpen = ref(false);

function initFavor(): void {
  favorError.value = '';
  tagFocused.value = false;
  pickerOpen.value = false;
  if (props.contactId && props.favorId) {
    const c = store.contacts.find((x) => x.id === props.contactId);
    const f = c?.favors.find((x) => x.id === props.favorId);
    if (c && f) {
      Object.assign(favorForm, {
        contactName: c.name, contactId: c.id,
        title: f.title, date: f.date, tag: f.tag ?? '',
      });
      return;
    }
  }
  Object.assign(favorForm, {
    contactName: '', contactId: undefined,
    title: '', date: props.date, tag: '',
  });
}

function addTag(tag: string): void {
  favorForm.tag = tag;
  tagFocused.value = false;
}

function onPickContact(c: ContactPerson): void {
  favorForm.contactName = c.name;
  favorForm.contactId = c.id;
  pickerOpen.value = false;
}

function saveFavor(): void {
  const name = favorForm.contactName.trim();
  const title = favorForm.title.trim();
  if (!name) { favorError.value = '请填写联系人'; return; }
  if (!title) { favorError.value = '请填写人情往来内容'; return; }
  favorError.value = '';

  // 定位联系人：优先用已选 id，否则按姓名匹配，匹配不到则新建
  let contact = favorForm.contactId ? store.contacts.find((c) => c.id === favorForm.contactId) : undefined;
  if (!contact) contact = store.contacts.find((c) => c.name === name);
  if (!contact) {
    const newContact: ContactPerson = {
      id: uid(), name, aliases: [], phone: '', birthday: '', tags: [],
      favors: [], note: '', createdAt: Date.now(), createdDate: favorForm.date || props.date,
    };
    store.upsertContact(newContact);
    contact = newContact;
  }

  const existing = isEdit.value
    ? contact.favors.find((f) => f.id === props.favorId)
    : undefined;
  store.upsertFavor(contact.id, {
    id: existing?.id ?? uid(),
    date: favorForm.date || props.date,
    title,
    amount: existing?.amount ?? 0,
    direction: existing?.direction ?? 'out',
    note: existing?.note ?? '',
    tag: favorForm.tag.trim() || undefined,
  });
  emit('close');
}

function deleteFavor(): void {
  if (props.contactId && props.favorId) {
    store.removeFavor(props.contactId, props.favorId);
  }
  emit('close');
}

initFavor();
</script>

<template>
  <div class="as-body">
    <!-- 联系人 -->
    <label class="as-label">联系人</label>
    <div class="as-name-wrap">
      <div class="as-field-row">
        <input
          v-model="favorForm.contactName"
          class="as-input"
          :disabled="isEdit"
          placeholder="选择已有联系人或输入新姓名"
          @input="favorForm.contactId = undefined"
        />
        <button
          v-if="!isEdit"
          class="as-arrow"
          type="button"
          @click.stop="pickerOpen = !pickerOpen"
        >▾</button>
      </div>
      <ContactPicker
        :visible="pickerOpen && !isEdit"
        :selected-id="favorForm.contactId"
        @select="onPickContact"
        @close="pickerOpen = false"
      />
    </div>

    <!-- 内容 -->
    <label class="as-label">人情往来内容</label>
    <input v-model="favorForm.title" class="as-input" placeholder="如 结婚随礼 / 生日礼物" />
    <p v-if="favorError" class="as-error">{{ favorError }}</p>

    <div class="as-grid2">
      <!-- 日期 -->
      <div>
        <label class="as-label">日期</label>
        <input v-model="favorForm.date" class="as-input" type="date" />
      </div>
      <!-- 标签 -->
      <div>
        <label class="as-label">标签</label>
        <input
          v-model="favorForm.tag"
          class="as-input"
          placeholder="如 婚礼"
          @focus="tagFocused = true"
        />
      </div>
    </div>
    <div v-if="tagFocused && store.historyFavorTags.length" class="as-chips">
      <button
        v-for="t in store.historyFavorTags"
        :key="t"
        class="as-chip"
        type="button"
        @click="addTag(t)"
      >{{ t }}</button>
    </div>

    <div class="as-foot">
      <button v-if="isEdit" class="as-danger" type="button" @click="deleteFavor">🗑 删除</button>
      <span class="as-spacer" />
      <button class="as-ghost" type="button" @click="emit('close')">取消</button>
      <button class="as-primary" type="button" @click="saveFavor">保存</button>
    </div>
  </div>
</template>

<style scoped>
.as-body { display: flex; flex-direction: column; gap: 4px; padding-bottom: 4px; position: relative; }
.as-label { font-size: 11px; color: #94a3b8; margin-top: 8px; }
.as-input {
  width: 100%; box-sizing: border-box; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 9px 10px; font-size: 13px; color: #1e293b; background: #fff;
}
.as-input:focus { outline: none; border-color: #c7d2fe; }
.as-input:disabled { background: #f8fafc; color: #64748b; }
.as-field-row { position: relative; display: flex; align-items: center; }
/* 下拉选择器锚点：让 .cp-panel 精确贴在联系人输入框正下方 */
.as-name-wrap { position: relative; }
.as-field-row .as-input { padding-right: 42px; }
.as-arrow {
  position: absolute; right: 2px; top: 50%; transform: translateY(-50%);
  width: 40px; height: 40px; border: 0; background: transparent;
  color: #94a3b8; font-size: 16px; -webkit-tap-highlight-color: transparent;
}
.as-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.as-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.as-chip {
  border: 1px solid #e0e7ff; background: #eef2ff; color: #4f46e5;
  border-radius: 999px; font-size: 11px; padding: 3px 9px;
}
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
