<script setup lang="ts">
/** 通讯录新建 / 修改一体化表单 */
import { computed, reactive, ref, watch } from 'vue';
import type { ContactPerson, ISODate } from '../../types/schema';
import { useCrmStore } from '../../store/useCrmStore';
import { contactDateOf, uid } from '../../services/dbService';
import ContactPicker from './ContactPicker.vue';

const props = defineProps<{ date: ISODate; editId?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const store = useCrmStore();
const isEdit = computed(() => !!props.editId);

const contactForm = reactive({
  id: undefined as string | undefined,
  name: '', aliases: '', phone: '', birthday: '', tags: '', note: '',
  createdDate: '' as ISODate,
  favors: [] as ContactPerson['favors'],
});
const contactError = ref('');
const tagsFocused = ref(false);
const pickerOpen = ref(false);

const editingName = computed(() => contactForm.name.trim());

/** 彻底清空表单：新建态必须 id=undefined 且所有字段归零，绝不残留上一次数据 */
function resetForm(): void {
  contactForm.id = undefined;
  contactForm.name = '';
  contactForm.aliases = '';
  contactForm.phone = '';
  contactForm.birthday = '';
  contactForm.tags = '';
  contactForm.note = '';
  contactForm.favors = [];
  contactForm.createdDate = props.date;
  contactError.value = '';
  tagsFocused.value = false;
  pickerOpen.value = false;
}

/** 打开面板时初始化：无 editId → 全新空表单；有 editId → 回填该联系人 */
function initContact(): void {
  resetForm();
  if (!props.editId) return;
  const c = store.contacts.find((x) => x.id === props.editId);
  if (!c) return;
  Object.assign(contactForm, {
    id: c.id, name: c.name, aliases: c.aliases.join('、'),
    phone: c.phone, birthday: c.birthday, tags: c.tags.join('、'),
    note: c.note, favors: [...c.favors], createdDate: contactDateOf(c),
  });
}
function splitTags(raw: string): string[] {
  return raw.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean);
}
function addTag(tag: string): void {
  const list = splitTags(contactForm.tags);
  if (!list.includes(tag)) contactForm.tags = [...list, tag].join('、');
}
function fillContact(c: ContactPerson): void {
  Object.assign(contactForm, {
    id: c.id, name: c.name, aliases: c.aliases.join('、'),
    phone: c.phone, birthday: c.birthday, tags: c.tags.join('、'),
    note: c.note, favors: c.favors, createdDate: contactDateOf(c),
  });
  pickerOpen.value = false;
  contactError.value = '';
}
function switchToNew(): void {
  resetForm();
}
function saveContact(): void {
  const name = contactForm.name.trim();
  if (!name) {
    contactError.value = '请填写联系人姓名';
    return;
  }
  contactError.value = '';
  const existing = contactForm.id ? store.contacts.find((c) => c.id === contactForm.id) : undefined;
  store.upsertContact({
    id: contactForm.id ?? uid(), name,
    aliases: splitTags(contactForm.aliases), phone: contactForm.phone.trim(),
    birthday: contactForm.birthday, tags: splitTags(contactForm.tags),
    favors: contactForm.favors, note: contactForm.note.trim(),
    createdAt: existing?.createdAt ?? Date.now(),
    createdDate: contactForm.createdDate || props.date,
  });
  emit('close');
}
function deleteContact(): void {
  if (contactForm.id) store.removeContact(contactForm.id);
  emit('close');
}

initContact();
// 面板保持打开时切换编辑对象（或从编辑切回新建）需重新初始化
watch(() => props.editId, initContact);
</script>

<template>
  <div class="as-body">
    <!-- 编辑态提示横幅 -->
    <div v-if="contactForm.id" class="as-edit-banner">
      <span class="as-edit-text">正在编辑：{{ editingName }}</span>
      <button class="as-edit-switch" type="button" @click="switchToNew">× 切回新建</button>
    </div>

    <label class="as-label">姓名</label>
    <div class="as-name-wrap">
      <div class="as-field-row">
        <input v-model="contactForm.name" class="as-input" placeholder="必填" />
        <button class="as-arrow" type="button" @click.stop="pickerOpen = !pickerOpen">▾</button>
      </div>
      <ContactPicker
        :visible="pickerOpen"
        :selected-id="contactForm.id"
        @select="fillContact"
        @close="pickerOpen = false"
      />
    </div>
    <p v-if="contactError" class="as-error">{{ contactError }}</p>

    <label class="as-label">别名 / 昵称</label>
    <input v-model="contactForm.aliases" class="as-input" placeholder="用、分隔，如 老妈、妈妈" />
    <div class="as-grid2">
      <div>
        <label class="as-label">联系电话</label>
        <input v-model="contactForm.phone" class="as-input" type="tel" placeholder="手机号" />
      </div>
      <div>
        <label class="as-label">生日</label>
        <input v-model="contactForm.birthday" class="as-input" type="date" />
      </div>
    </div>
    <label class="as-label">标签</label>
    <input v-model="contactForm.tags" class="as-input" placeholder="用、分隔，如 家人、同事" @focus="tagsFocused = true" />
    <div v-if="tagsFocused && store.historyTags.length" class="as-chips">
      <button v-for="tag in store.historyTags" :key="tag" class="as-chip" type="button" @click="addTag(tag)">{{ tag }}</button>
    </div>
    <label class="as-label">备注</label>
    <textarea v-model="contactForm.note" class="as-input as-textarea" rows="2" placeholder="备注…" />
    <div class="as-foot">
      <button v-if="isEdit" class="as-danger" type="button" @click="deleteContact">🗑 删除</button>
      <span class="as-spacer" />
      <button class="as-ghost" type="button" @click="emit('close')">取消</button>
      <button class="as-primary" type="button" @click="saveContact">保存</button>
    </div>
  </div>
</template>

<style scoped>
.as-body { display: flex; flex-direction: column; gap: 4px; padding-bottom: 4px; position: relative; }
.as-edit-banner {
  display: flex; align-items: center; justify-content: space-between;
  background: #eef2ff; border-radius: 10px; padding: 7px 10px; margin-bottom: 4px;
}
.as-edit-text { font-size: 12px; color: #4f46e5; font-weight: 600; }
.as-edit-switch {
  border: 0; background: transparent; color: #6366f1; font-size: 11px;
  padding: 4px 6px; -webkit-tap-highlight-color: transparent;
}
.as-label { font-size: 11px; color: #94a3b8; margin-top: 8px; }
.as-input {
  width: 100%; box-sizing: border-box; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 9px 10px; font-size: 13px; color: #1e293b; background: #fff;
}
.as-input:focus { outline: none; border-color: #c7d2fe; }
.as-field-row { position: relative; display: flex; align-items: center; }
/* 下拉选择器锚点：让 .cp-panel 精确贴在姓名输入框正下方 */
.as-name-wrap { position: relative; }
.as-field-row .as-input { padding-right: 42px; }
.as-arrow {
  position: absolute; right: 2px; top: 50%; transform: translateY(-50%);
  width: 40px; height: 40px; border: 0; background: transparent;
  color: #94a3b8; font-size: 16px; -webkit-tap-highlight-color: transparent;
}
.as-textarea { resize: none; line-height: 1.6; }
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
