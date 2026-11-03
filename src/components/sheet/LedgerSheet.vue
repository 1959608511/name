<script setup lang="ts">
/** 记账新建 / 编辑表单 */
import { computed, reactive, ref } from 'vue';
import type { ISODate, LedgerCategory } from '../../types/schema';
import { useCrmStore } from '../../store/useCrmStore';
import { uid } from '../../services/dbService';

const props = defineProps<{ date: ISODate; editId?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const store = useCrmStore();
const isEdit = computed(() => !!props.editId);

const CATEGORY_OPTIONS: Array<{ key: LedgerCategory; label: string }> = [
  { key: 'expense', label: '支出' }, { key: 'income', label: '收入' }, { key: 'other', label: '其他(借还)' },
];
const ledgerForm = reactive({
  id: undefined as string | undefined,
  date: '', category: 'expense' as LedgerCategory,
  amount: '', contactId: '', remark: '', tempNote: '',
});
const ledgerError = ref('');

function initLedger(): void {
  const item = props.editId ? store.ledger.find((x) => x.id === props.editId) : undefined;
  ledgerError.value = '';
  Object.assign(ledgerForm, {
    id: item?.id, date: item?.date ?? props.date, category: item?.category ?? 'expense',
    amount: item ? String(item.amount) : '', contactId: item?.contactId ?? '',
    remark: item?.remark ?? '', tempNote: item?.tempNote ?? '',
  });
}
function saveLedger(): void {
  const amount = Math.abs(Number(ledgerForm.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    ledgerError.value = '请输入大于 0 的金额';
    return;
  }
  ledgerError.value = '';
  const existing = ledgerForm.id ? store.ledger.find((x) => x.id === ledgerForm.id) : undefined;
  const contact = store.contacts.find((c) => c.id === ledgerForm.contactId);
  store.upsertLedger({
    id: ledgerForm.id ?? uid(), date: ledgerForm.date || props.date,
    category: ledgerForm.category, amount, contactId: contact?.id,
    contactName: contact?.name, remark: ledgerForm.remark.trim(),
    tempNote: ledgerForm.tempNote.trim() || undefined,
    createdAt: existing?.createdAt ?? Date.now(),
  });
  emit('close');
}
function deleteLedger(): void {
  if (ledgerForm.id) store.removeLedger(ledgerForm.id);
  emit('close');
}

initLedger();
</script>

<template>
  <div class="as-body">
    <div class="as-seg">
      <button
        v-for="opt in CATEGORY_OPTIONS"
        :key="opt.key"
        class="as-seg-btn"
        :class="{ on: ledgerForm.category === opt.key }"
        type="button"
        @click="ledgerForm.category = opt.key"
      >{{ opt.label }}</button>
    </div>
    <label class="as-label">金额（绝对值）</label>
    <input v-model="ledgerForm.amount" class="as-input as-amount" type="number" inputmode="decimal" placeholder="0.00" />
    <p v-if="ledgerError" class="as-error">{{ ledgerError }}</p>
    <label class="as-label">关联联系人</label>
    <select v-model="ledgerForm.contactId" class="as-input">
      <option value="">不关联</option>
      <option v-for="c in store.contacts" :key="c.id" :value="c.id">{{ c.name }}</option>
    </select>
    <label class="as-label">备注</label>
    <input v-model="ledgerForm.remark" class="as-input" placeholder="如 午餐 / 借给李强" />
    <label class="as-label">临时便签</label>
    <input v-model="ledgerForm.tempNote" class="as-input" placeholder="如 还剩 1500 未还" />
    <label class="as-label">日期</label>
    <input v-model="ledgerForm.date" class="as-input" type="date" />
    <div class="as-foot">
      <button v-if="isEdit" class="as-danger" type="button" @click="deleteLedger">🗑 删除</button>
      <span class="as-spacer" />
      <button class="as-ghost" type="button" @click="emit('close')">取消</button>
      <button class="as-primary" type="button" @click="saveLedger">保存</button>
    </div>
  </div>
</template>

<style scoped>
.as-body { display: flex; flex-direction: column; gap: 4px; padding-bottom: 4px; }
.as-label { font-size: 11px; color: #94a3b8; margin-top: 8px; }
.as-input {
  width: 100%; box-sizing: border-box; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 9px 10px; font-size: 13px; color: #1e293b; background: #fff;
}
.as-input:focus { outline: none; border-color: #c7d2fe; }
.as-amount { font-size: 20px; font-weight: 600; color: #e11d48; }
.as-seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 4px; }
.as-seg-btn {
  border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b;
  font-size: 12px; padding: 7px 0; border-radius: 10px;
}
.as-seg-btn.on { background: #eef2ff; border-color: #c7d2fe; color: #4f46e5; font-weight: 600; }
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
