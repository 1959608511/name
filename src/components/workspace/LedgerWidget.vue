<script setup lang="ts">
/** 工作台 · 记账窗口（当日 / 全部 / 借还三态切换，借还支持左滑「已还 / 危险」） */
import { computed, reactive, ref } from 'vue';
import type { ISODate, LedgerCategory, LedgerItem } from '../../types/schema';
import { useCrmStore } from '../../store/useCrmStore';
import { categoryLabel } from '../../services/dbService';
import WorkspaceCard from '../WorkspaceCard.vue';
import LedgerRepayModal from './LedgerRepayModal.vue';

const props = defineProps<{ selectedDate: ISODate }>();
const emit = defineEmits<{
  (e: 'create'): void;
  (e: 'edit', id: string): void;
}>();

const store = useCrmStore();
/** 左滑最大露出宽度 */
const SWIPE_W = 116;

const isAll = computed(() => store.ledgerScope === 'all');
const isLoan = computed(() => store.ledgerScope === 'loan');
const isDay = computed(() => store.ledgerScope === 'day');

function byTimeDesc(a: LedgerItem, b: LedgerItem): number {
  return a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1;
}
/** 借还优先级：危险 > 已还 > 普通未还，同级按日期与录入时间倒序 */
function loanWeight(a: LedgerItem, b: LedgerItem): number {
  const wa = a.isDanger ? 2 : a.isSettled ? 1 : 0;
  const wb = b.isDanger ? 2 : b.isSettled ? 1 : 0;
  if (wa !== wb) return wb - wa;
  return byTimeDesc(a, b);
}

const dayItems = computed(() =>
  store.ledger.filter((i) => i.date === props.selectedDate).slice().sort((a, b) => b.createdAt - a.createdAt),
);
const allItems = computed(() => store.ledger.slice().sort(byTimeDesc));
const loanItems = computed(() => store.ledger.filter((i) => i.category === 'other').slice().sort(loanWeight));
const items = computed(() => (isLoan.value ? loanItems.value : isAll.value ? allItems.value : dayItems.value));

const incomeTotal = computed(() => items.value.filter((i) => i.category === 'income').reduce((s, i) => s + i.amount, 0));
const expenseTotal = computed(() => items.value.filter((i) => i.category === 'expense').reduce((s, i) => s + i.amount, 0));
const ledgerMeta = computed(() => {
  if (!items.value.length) return '';
  if (isLoan.value) return `${loanItems.value.length} 笔往来`;
  return `+${incomeTotal.value} / -${expenseTotal.value}`;
});

function toggleAll(): void {
  store.setLedgerScope(isAll.value ? 'day' : 'all');
  closeAll();
}
function toggleLoan(): void {
  store.setLedgerScope(isLoan.value ? 'day' : 'loan');
  closeAll();
}
function categoryEmoji(c: LedgerCategory): string {
  if (c === 'income') return '💰';
  if (c === 'expense') return '💸';
  return '🤝';
}
function amountText(c: LedgerCategory, amount: number): string {
  if (c === 'income') return `+${amount}`;
  if (c === 'expense') return `-${amount}`;
  return `¥${amount}`;
}
function remainingAfter(item: LedgerItem, idx: number): number {
  const paid = (item.repayments ?? []).slice(0, idx + 1).reduce((s, r) => s + r.amount, 0);
  return Math.max(0, item.amount - paid);
}

/* ---------- 左滑手势 ---------- */
const offsets = reactive<Record<string, number>>({});
const draggingId = ref<string | undefined>(undefined);
let startX = 0;
let startY = 0;
let startOffset = 0;
let locked = false;
let movedAt = 0;

function canSwipe(item: LedgerItem): boolean {
  return item.category === 'other';
}
function closeAll(): void {
  for (const key of Object.keys(offsets)) offsets[key] = 0;
}
function onTouchStart(e: Event, item: LedgerItem): void {
  if (!canSwipe(item)) return;
  const touch = (e as TouchEvent).touches[0];
  if (!touch) return;
  startX = touch.clientX;
  startY = touch.clientY;
  startOffset = offsets[item.id] ?? 0;
  locked = false;
  draggingId.value = item.id;
  closeAll();
}
function onTouchMove(e: Event): void {
  const id = draggingId.value;
  if (!id) return;
  const touch = (e as TouchEvent).touches[0];
  if (!touch) return;
  const dx = touch.clientX - startX;
  const dy = touch.clientY - startY;
  if (!locked) {
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      draggingId.value = undefined;
      return;
    }
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) locked = true;
  }
  if (!locked) return;
  const next = Math.min(0, Math.max(-SWIPE_W, startOffset + dx));
  offsets[id] = next;
  const ev = e as TouchEvent;
  if (ev.cancelable) ev.preventDefault();
}
function onTouchEnd(): void {
  const id = draggingId.value;
  if (!id) return;
  const fixed = (offsets[id] ?? 0) < -SWIPE_W / 2 ? -SWIPE_W : 0;
  offsets[id] = fixed;
  if (locked) movedAt = Date.now();
  draggingId.value = undefined;
  locked = false;
}
function onRowClick(item: LedgerItem): void {
  if (Date.now() - movedAt < 300) return;
  if ((offsets[item.id] ?? 0) !== 0) {
    closeAll();
    return;
  }
  emit('edit', item.id);
}

/* ---------- 借还操作 ---------- */
const repayId = ref<string | undefined>(undefined);
const repayItem = computed(() => store.ledger.find((i) => i.id === repayId.value));
function toggleDanger(item: LedgerItem): void {
  store.toggleLedgerDanger(item.id);
  closeAll();
}
function openRepay(item: LedgerItem): void {
  repayId.value = item.id;
  closeAll();
}
function closeRepay(): void {
  repayId.value = undefined;
}
</script>

<template>
  <WorkspaceCard title="记账" emoji="💳" :meta="ledgerMeta">
    <template #actions>
      <button class="lw-act" :class="{ 'lw-act-on': isAll }" type="button" @click="toggleAll">全部</button>
      <button class="lw-act lw-act-loan" :class="{ 'lw-act-loan-on': isLoan }" type="button" @click="toggleLoan">借还</button>
      <button class="lw-act lw-act-amber" type="button" @click="emit('create')">+ 记一笔</button>
    </template>

    <template v-if="items.length">
      <div v-for="item in items" :key="item.id" class="lw-item">
        <div v-if="canSwipe(item)" class="lw-swipe">
          <div class="lw-swipe-actions">
            <button class="lw-sw lw-sw-settle" type="button" @click.stop="openRepay(item)">已还</button>
            <button class="lw-sw lw-sw-danger" type="button" @click.stop="toggleDanger(item)">危险</button>
          </div>
          <div
            class="lw-row"
            :class="{
              'lw-row-danger': item.isDanger,
              'lw-row-done': item.isSettled,
              'lw-dragging': draggingId === item.id,
            }"
            :style="{ transform: `translateX(${offsets[item.id] ?? 0}px)` }"
            @touchstart="onTouchStart($event, item)"
            @touchmove="onTouchMove"
            @touchend="onTouchEnd"
            @touchcancel="onTouchEnd"
            @click="onRowClick(item)"
          >
            <span class="lw-emoji">{{ categoryEmoji(item.category) }}</span>
            <span class="lw-main">
              <span class="lw-title" :class="{ 'lw-danger-text': item.isDanger }">
                <span class="lw-title-text" :class="{ 'lw-strike': item.isSettled }">
                  {{ item.remark || categoryLabel(item.category) }}
                </span>
                <span v-if="item.isDanger" class="lw-tag lw-tag-danger">⚠️ 危险</span>
                <span v-if="item.isSettled" class="lw-tag lw-tag-done">✓ 已还清</span>
              </span>
              <span class="lw-sub" :class="{ 'lw-strike': item.isSettled }">
                {{ item.contactName || categoryLabel(item.category) }}
                <template v-if="item.tempNote"> · {{ item.tempNote }}</template>
                <template v-if="!isDay"> · {{ item.date.slice(5) }}</template>
              </span>
            </span>
            <span
              class="lw-amount"
              :class="[`lw-amount-${item.category}`, { 'lw-strike': item.isSettled, 'lw-amount-danger': item.isDanger }]"
            >{{ amountText(item.category, item.amount) }}</span>
          </div>
        </div>

        <div
          v-else
          class="lw-row"
          :class="{ 'lw-row-done': item.isSettled }"
          @click="emit('edit', item.id)"
        >
          <span class="lw-emoji">{{ categoryEmoji(item.category) }}</span>
          <span class="lw-main">
            <span class="lw-title" :class="{ 'lw-strike': item.isSettled }">
              {{ item.remark || categoryLabel(item.category) }}
            </span>
            <span class="lw-sub" :class="{ 'lw-strike': item.isSettled }">
              {{ item.contactName || categoryLabel(item.category) }}
              <template v-if="item.tempNote"> · {{ item.tempNote }}</template>
              <template v-if="!isDay"> · {{ item.date.slice(5) }}</template>
            </span>
          </span>
          <span
            class="lw-amount"
            :class="[`lw-amount-${item.category}`, { 'lw-strike': item.isSettled }]"
          >{{ amountText(item.category, item.amount) }}</span>
        </div>

        <div v-if="item.category === 'other' && item.repayments && item.repayments.length" class="lw-repay">
          <p v-for="(r, idx) in item.repayments" :key="r.id" class="lw-repay-line">
            ↳ {{ r.date.slice(5) }} 已还 ¥{{ r.amount.toFixed(2) }}
            <em class="lw-repay-left">（剩余 ¥{{ remainingAfter(item, idx).toFixed(2) }}）</em>
          </p>
        </div>
      </div>
    </template>
    <p v-else class="lw-empty">{{ isLoan ? '还没有借还往来记录' : isAll ? '还没有任何收支流水' : '这天还没有收支流水' }}</p>
  </WorkspaceCard>

  <LedgerRepayModal v-if="repayItem" :item="repayItem" @close="closeRepay" />
</template>

<style scoped>
/* 右上角胶囊按钮 */
.lw-act {
  border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b;
  font-size: 10px; line-height: 1.4; padding: 3px 6px; border-radius: 999px;
  flex-shrink: 0; white-space: nowrap; -webkit-tap-highlight-color: transparent;
  transition: all 0.2s ease;
}
.lw-act:active { transform: scale(0.95); }
.lw-act-on { background: #475569; color: #fff; border-color: #475569; }
.lw-act-loan { background: #f0fdfa; color: #0d9488; border-color: #ccfbf1; }
.lw-act-loan-on { background: linear-gradient(135deg, #14b8a6, #0d9488); color: #fff; border-color: #0d9488; }
.lw-act-amber { background: #fffbeb; color: #d97706; border-color: #fde68a; }

.lw-item { padding: 1px 0; }
.lw-swipe { position: relative; border-radius: 10px; overflow: hidden; }
.lw-swipe-actions { position: absolute; top: 0; right: 0; bottom: 0; display: flex; }
.lw-sw {
  width: 58px; border: 0; color: #fff; font-size: 11px; font-weight: 500;
  display: flex; align-items: center; justify-content: center;
  transition: filter 0.2s ease;
}
.lw-sw:active { filter: brightness(0.92); }
.lw-sw-settle { background: linear-gradient(135deg, #34d399, #06b6d4); }
.lw-sw-danger { background: linear-gradient(135deg, #fb7185, #e11d48); }

.lw-row {
  position: relative; z-index: 1; width: 100%; box-sizing: border-box;
  display: flex; align-items: center; gap: 7px; padding: 5px 6px;
  background: #fff; border-radius: 10px; text-align: left; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), background 0.2s ease;
}
.lw-dragging { transition: background 0.2s ease; }
.lw-row:active { background: #f8fafc; }
.lw-row-danger {
  background: linear-gradient(90deg, rgba(255, 241, 242, 0.95), rgba(255, 255, 255, 0.9));
  border-left: 3px solid #fb7185; padding-left: 6px;
}
.lw-row-done { background: #f8fafc; }
.lw-emoji { font-size: 13px; flex-shrink: 0; }
.lw-main { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 1px; }
.lw-title { display: flex; align-items: center; gap: 4px; min-width: 0; }
.lw-title-text {
  font-size: 12px; color: #1e293b; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.lw-danger-text .lw-title-text { color: #be123c; font-weight: 600; }
.lw-sub { font-size: 10px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lw-tag {
  font-size: 9px; line-height: 14px; padding: 0 5px; border-radius: 999px;
  flex-shrink: 0; white-space: nowrap;
}
.lw-tag-danger { color: #be123c; background: #ffe4e6; border: 1px solid #fecdd3; }
.lw-tag-done { color: #047857; background: #ecfdf5; border: 1px solid #d1fae5; }
.lw-strike { text-decoration: line-through; color: #94a3b8; }
.lw-amount { font-size: 12px; font-weight: 600; flex-shrink: 0; }
.lw-amount-income { color: #059669; }
.lw-amount-expense { color: #e11d48; }
.lw-amount-other { color: #64748b; }
.lw-amount-danger { color: #e11d48; }
.lw-repay {
  padding: 1px 0 3px 20px; border-left: 2px solid #e2e8f0; margin: 2px 0 3px 14px;
}
.lw-repay-line { font-size: 9px; line-height: 1.7; color: #64748b; margin: 0; }
.lw-repay-left { font-style: normal; color: #94a3b8; }
.lw-empty { font-size: 11px; color: #b6c2d2; padding: 8px 4px; }
</style>
