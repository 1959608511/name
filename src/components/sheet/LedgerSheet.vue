<script setup lang="ts">
/** 记账新建 / 编辑表单（支出 / 收入 / 借还三合一，支持标签快选与记录时间） */
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
  date: '', time: '', category: 'expense' as LedgerCategory,
  amount: '', contactId: '', remark: '', tag: '',
  direction: 'out' as 'out' | 'in', gift: '',
});
const ledgerError = ref('');
/** 标签输入聚焦时弹出历史标签胶囊 */
const tagFocus = ref(false);

/** 编辑中的既有借还明细（只读展示：还款与追加借出） */
const existingRepayments = computed(() =>
  props.editId ? store.ledger.find((x) => x.id === props.editId)?.repayments ?? [] : [],
);

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function initLedger(): void {
  const item = props.editId ? store.ledger.find((x) => x.id === props.editId) : undefined;
  ledgerError.value = '';
  Object.assign(ledgerForm, {
    id: item?.id, date: item?.date ?? props.date, time: item ? item.time ?? '' : nowTime(),
    category: item?.category ?? 'expense',
    amount: item ? String(item.amount) : '', contactId: item?.contactId ?? '',
    remark: item?.remark ?? '', tag: item?.tag ?? '',
    direction: item?.direction ?? 'out', gift: item?.gift ?? '',
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
  const isOther = ledgerForm.category === 'other';
  store.upsertLedger({
    id: ledgerForm.id ?? uid(), date: ledgerForm.date || props.date,
    category: ledgerForm.category, amount, contactId: contact?.id,
    contactName: contact?.name, remark: ledgerForm.remark.trim(),
    time: ledgerForm.time || undefined,
    tag: ledgerForm.tag.trim() || undefined,
    direction: isOther ? ledgerForm.direction : undefined,
    gift: isOther ? ledgerForm.gift.trim() || undefined : undefined,
    tempNote: existing?.tempNote,
    createdAt: existing?.createdAt ?? Date.now(),
    isSettled: existing?.isSettled,
    isDanger: existing?.isDanger,
    repayments: existing?.repayments,
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
    <div class="as-amount-row">
      <input v-model="ledgerForm.amount" class="as-input as-amount" type="number" inputmode="decimal" placeholder="0.00" />
      <button
        v-if="ledgerForm.category === 'other'"
        class="as-dir"
        :class="ledgerForm.direction === 'out' ? 'as-dir-out' : 'as-dir-in'"
        type="button"
        @click="ledgerForm.direction = ledgerForm.direction === 'out' ? 'in' : 'out'"
      >{{ ledgerForm.direction === 'out' ? '付出 ↓' : '收到 ↑' }}</button>
    </div>
    <p v-if="ledgerError" class="as-error">{{ ledgerError }}</p>
    <template v-if="ledgerForm.category === 'other'">
      <label class="as-label">礼物 / 物品</label>
      <input v-model="ledgerForm.gift" class="as-input" placeholder="如 手机 / 现金" />
    </template>
    <label class="as-label">关联联系人</label>
    <select v-model="ledgerForm.contactId" class="as-input">
      <option value="">不关联</option>
      <option v-for="c in store.contacts" :key="c.id" :value="c.id">{{ c.name }}</option>
    </select>
    <label class="as-label">备注</label>
    <input v-model="ledgerForm.remark" class="as-input" placeholder="如 午餐 / 借给李强" />
    <label class="as-label">标签</label>
    <input
      v-model="ledgerForm.tag"
      class="as-input"
      placeholder="如 餐饮 / 交通"
      @focus="tagFocus = true"
      @blur="tagFocus = false"
    />
    <div v-if="tagFocus && store.historyLedgerTags.length" class="as-tags">
      <button
        v-for="t in store.historyLedgerTags"
        :key="t"
        class="as-tag-pill"
        type="button"
        @mousedown.prevent
        @click="ledgerForm.tag = t"
      >{{ t }}</button>
    </div>
    <label class="as-label">日期与记录时间</label>
    <div class="as-datetime">
      <input v-model="ledgerForm.date" class="as-input" type="date" />
      <input v-model="ledgerForm.time" class="as-input" type="time" />
    </div>

    <template v-if="existingRepayments.length">
      <label class="as-label">借还明细</label>
      <p v-for="r in existingRepayments" :key="r.id" class="as-repay-line">
        <span class="as-repay-info">{{ r.date }}<template v-if="r.note"> · {{ r.note }}</template></span>
        <span class="as-repay-amt" :class="{ 'as-repay-borrow': r.type === 'borrow' }">{{ r.type === 'borrow' ? '借出' : '已还' }} ¥{{ r.amount }}</span>
      </p>
    </template>

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
.as-amount-row { display: flex; align-items: stretch; gap: 8px; }
.as-amount-row .as-amount { flex: 1; min-width: 0; width: auto; }
.as-dir { border: 1px solid; border-radius: 10px; font-size: 12px; font-weight: 600; padding: 0 12px; flex-shrink: 0; }
.as-dir-out { background: #fff1f2; color: #e11d48; border-color: #fecdd3; }
.as-dir-in { background: #ecfdf5; color: #059669; border-color: #a7f3d0; }
.as-datetime { display: flex; gap: 8px; }
.as-datetime .as-input { flex: 1; min-width: 0; width: auto; }
.as-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.as-tag-pill {
  border: 1px solid #e2e8f0; background: #f8fafc; color: #475569;
  font-size: 11px; padding: 3px 10px; border-radius: 999px;
}
.as-tag-pill:active { background: #eef2ff; color: #4f46e5; }
.as-repay-line { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; line-height: 1.8; color: #64748b; margin: 0; }
.as-repay-info { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.as-repay-amt { color: #0d9488; flex-shrink: 0; }
.as-repay-borrow { color: #d97706; }
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
