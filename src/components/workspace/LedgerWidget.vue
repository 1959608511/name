<script setup lang="ts">
/** 工作台 · 记账窗口（当日 / 全部支出收入 / 借还 / 礼物四态切换，借还支持左右滑动「已还 / 危险」） */
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
/** 横向滑动锁定阈值（与 WorkspaceCard 正交仲裁阈值对齐） */
const SWIPE_LOCK = 6;

const isAll = computed(() => store.ledgerScope === 'all');
const isLoan = computed(() => store.ledgerScope === 'loan');
const isGift = computed(() => store.ledgerScope === 'gift');
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
const giftItems = computed(() =>
  store.ledger.filter((i) => i.category === 'other' && i.gift).slice().sort(byTimeDesc),
);
const items = computed(() =>
  isGift.value ? giftItems.value : isLoan.value ? loanItems.value : isAll.value ? allItems.value : dayItems.value,
);

const incomeTotal = computed(() => items.value.filter((i) => i.category === 'income').reduce((s, i) => s + i.amount, 0));
const expenseTotal = computed(() => items.value.filter((i) => i.category === 'expense').reduce((s, i) => s + i.amount, 0));
const ledgerMeta = computed(() => {
  if (!items.value.length) return '';
  if (isGift.value) return `${giftItems.value.length} 笔礼物`;
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
function toggleGift(): void {
  store.setLedgerScope(isGift.value ? 'day' : 'gift');
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
function formatMoney(v: number): string {
  return v.toFixed(2);
}
/** 总共已还：仅累计还款记录（追加借出不算），已还清时至少等于总额 */
function totalRepaid(item: LedgerItem): number {
  const sum = (item.repayments ?? []).reduce((s, r) => (r.type !== 'borrow' ? s + r.amount : s), 0);
  return item.isSettled ? Math.max(sum, item.amount) : sum;
}

/* ---------- 左右滑手势（左半区原生 touch + 右半区 hswipe 统一入口） ---------- */
type HPoint = { x: number; y: number };
const offsets = reactive<Record<string, number>>({});
const draggingId = ref<string | undefined>(undefined);
const expandedId = ref<string | undefined>(undefined);
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
/** 仅关闭其他行，保留当前行偏移，展开态右滑可顺畅推回关闭 */
function closeOthers(id: string): void {
  for (const key of Object.keys(offsets)) if (key !== id) offsets[key] = 0;
}
function beginSwipe(item: LedgerItem, x: number, y: number): void {
  if (!canSwipe(item)) return;
  startX = x;
  startY = y;
  startOffset = offsets[item.id] ?? 0;
  locked = false;
  draggingId.value = item.id;
  closeOthers(item.id);
}
function applyMove(x: number, y: number, ev?: TouchEvent): void {
  const id = draggingId.value;
  if (!id) return;
  const dx = x - startX;
  const dy = y - startY;
  if (!locked) {
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) { draggingId.value = undefined; return; }
    if (Math.abs(dx) > SWIPE_LOCK && Math.abs(dx) > Math.abs(dy)) locked = true;
  }
  if (!locked) return;
  offsets[id] = Math.min(0, Math.max(-SWIPE_W, startOffset + dx));
  if (ev && ev.cancelable) ev.preventDefault();
}
function finishSwipe(): void {
  const id = draggingId.value;
  if (!id) return;
  offsets[id] = (offsets[id] ?? 0) < -SWIPE_W / 2 ? -SWIPE_W : 0;
  if (locked) movedAt = Date.now();
  draggingId.value = undefined;
  locked = false;
}
function onTouchStart(e: Event, item: LedgerItem): void {
  const touch = (e as TouchEvent).touches[0];
  if (touch) beginSwipe(item, touch.clientX, touch.clientY);
}
function onTouchMove(e: Event): void {
  const touch = (e as TouchEvent).touches[0];
  if (touch) applyMove(touch.clientX, touch.clientY, e as TouchEvent);
}
function onTouchEnd(): void {
  finishSwipe();
}
function onHStart(e: Event, item: LedgerItem): void {
  const detail = (e as CustomEvent<HPoint>).detail;
  if (detail) beginSwipe(item, detail.x, detail.y);
}
function onHMove(e: Event): void {
  const detail = (e as CustomEvent<HPoint>).detail;
  if (detail) applyMove(detail.x, detail.y);
}
function onHEnd(): void {
  finishSwipe();
}
function onRowClick(item: LedgerItem): void {
  if (Date.now() - movedAt < 300) return;
  if ((offsets[item.id] ?? 0) !== 0) { closeAll(); return; }
  if (item.category === 'other' && item.repayments && item.repayments.length) {
    expandedId.value = expandedId.value === item.id ? undefined : item.id;
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
      <button class="lw-act" :class="{ 'lw-act-on': isAll }" type="button" @click="toggleAll">全部支出/收入</button>
      <button class="lw-act lw-act-loan" :class="{ 'lw-act-loan-on': isLoan }" type="button" @click="toggleLoan">借还</button>
      <button class="lw-act lw-act-gift" :class="{ 'lw-act-gift-on': isGift }" type="button" @click="toggleGift">礼物</button>
      <button class="lw-act lw-act-create" type="button" @click="emit('create')">+ 记一笔</button>
    </template>

    <template v-if="items.length">
      <div v-for="item in items" :key="item.id" class="lw-item">
        <div
          v-if="canSwipe(item)"
          class="lw-swipe"
          data-hswipe
          @touchstart="onTouchStart($event, item)"
          @touchmove="onTouchMove"
          @touchend="onTouchEnd"
          @touchcancel="onTouchEnd"
          @hswipe-start="onHStart($event, item)"
          @hswipe-move="onHMove"
          @hswipe-end="onHEnd"
        >
          <div class="lw-swipe-actions" :class="{ 'lw-swipe-actions-open': (offsets[item.id] ?? 0) < 0 }">
            <button class="lw-sw lw-sw-settle" type="button" @click.stop="openRepay(item)">已还</button>
            <button class="lw-sw lw-sw-danger" type="button" @click.stop="toggleDanger(item)">危险</button>
          </div>
          <div
            class="lw-row"
            :class="{ 'lw-dragging': draggingId === item.id }"
            :style="{ transform: `translateX(${offsets[item.id] ?? 0}px)` }"
            @click="onRowClick(item)"
          >
            <span class="lw-emoji">{{ categoryEmoji(item.category) }}</span>
            <span class="lw-main">
              <span class="lw-title">
                <span class="lw-title-text" :class="{ 'lw-strike': item.isSettled, 'lw-danger-text': item.isDanger }">
                  {{ item.remark || categoryLabel(item.category) }}
                </span>
                <span v-if="item.tag" class="lw-tag">{{ item.tag }}</span>
                <span v-if="expandedId === item.id" class="lw-chevron">▾</span>
              </span>
              <span class="lw-sub" :class="{ 'lw-strike': item.isSettled }">
                {{ item.contactName || categoryLabel(item.category) }}<template v-if="item.tempNote"> · {{ item.tempNote }}</template><template v-if="item.gift"> · 🎁{{ item.gift }}</template><template v-if="!isDay"> · {{ item.date.slice(5) }}</template><template v-if="item.time"> · {{ item.time }}</template><span v-if="totalRepaid(item) > 0" class="lw-repaid"> · 已还 ¥{{ formatMoney(totalRepaid(item)) }}</span>
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
          @click="emit('edit', item.id)"
        >
          <span class="lw-emoji">{{ categoryEmoji(item.category) }}</span>
          <span class="lw-main">
            <span class="lw-title">
              <span class="lw-title-text" :class="{ 'lw-strike': item.isSettled }">
                {{ item.remark || categoryLabel(item.category) }}
              </span>
              <span v-if="item.tag" class="lw-tag">{{ item.tag }}</span>
            </span>
            <span class="lw-sub" :class="{ 'lw-strike': item.isSettled }">
              {{ item.contactName || categoryLabel(item.category) }}<template v-if="item.tempNote"> · {{ item.tempNote }}</template><template v-if="item.gift"> · 🎁{{ item.gift }}</template><template v-if="!isDay"> · {{ item.date.slice(5) }}</template><template v-if="item.time"> · {{ item.time }}</template><span v-if="totalRepaid(item) > 0" class="lw-repaid"> · 已还 ¥{{ formatMoney(totalRepaid(item)) }}</span>
            </span>
          </span>
          <span
            class="lw-amount"
            :class="[`lw-amount-${item.category}`, { 'lw-strike': item.isSettled }]"
          >{{ amountText(item.category, item.amount) }}</span>
        </div>

        <div v-if="expandedId === item.id && item.repayments && item.repayments.length" class="lw-repay">
          <div class="lw-repay-head">
            <span class="lw-repay-cap">往来明细</span>
            <button class="lw-repay-edit" type="button" @click.stop="emit('edit', item.id)">编辑账目</button>
          </div>
          <p v-for="r in item.repayments" :key="r.id" class="lw-repay-line">
            <span class="lw-repay-info">{{ r.date }}<template v-if="r.note"> · {{ r.note }}</template></span>
            <span class="lw-repay-amt" :class="{ 'lw-repay-borrow': r.type === 'borrow' }">{{ r.type === 'borrow' ? '借出' : '已还' }} ¥{{ formatMoney(r.amount) }}</span>
          </p>
        </div>
      </div>
    </template>
    <p v-else class="lw-empty">{{ isGift ? '还没有礼物往来记录' : isLoan ? '还没有借还往来记录' : isAll ? '还没有任何收支流水' : '这天还没有收支流水' }}</p>
  </WorkspaceCard>

  <LedgerRepayModal v-if="repayItem" :item="repayItem" @close="closeRepay" />
</template>

<style scoped>
/* 顶部切换按钮：低饱和素雅纯色 */
.lw-act {
  border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b;
  font-size: 10px; line-height: 1.4; padding: 3px 6px; border-radius: 999px;
  flex-shrink: 0; white-space: nowrap; -webkit-tap-highlight-color: transparent;
  transition: all 0.2s ease;
}
.lw-act:active { transform: scale(0.95); }
.lw-act-on { background: #334155; color: #fff; border-color: #334155; }
.lw-act-loan { background: #f0fdfa; color: #0d9488; border-color: #ccfbf1; }
.lw-act-loan-on { background: #0d9488; color: #fff; border-color: #0d9488; }
.lw-act-gift { background: #fffbeb; color: #d97706; border-color: #fde68a; }
.lw-act-gift-on { background: #d97706; color: #fff; border-color: #d97706; }
.lw-act-create { background: #f8fafc; color: #334155; border-color: #e2e8f0; }

.lw-item { padding: 1px 0; }
.lw-swipe { position: relative; border-radius: 10px; overflow: hidden; background: #fff; }
/* 未左滑展开时物理隐藏，杜绝底层按钮透出透色 */
.lw-swipe-actions {
  position: absolute; top: 0; right: 0; bottom: 0; display: flex;
  opacity: 0; visibility: hidden; pointer-events: none;
  transition: opacity 0.15s ease;
}
.lw-swipe-actions-open { opacity: 1; visibility: visible; pointer-events: auto; }
.lw-sw {
  width: 58px; border: 0; color: #fff; font-size: 11px; font-weight: 500;
  display: flex; align-items: center; justify-content: center;
}
.lw-sw:active { filter: brightness(0.94); }
.lw-sw-settle { background: #0d9488; }
.lw-sw-danger { background: #dc2626; }

.lw-row {
  position: relative; z-index: 1; width: 100%; box-sizing: border-box;
  display: flex; align-items: center; gap: 7px; padding: 5px 6px;
  background: #ffffff; border-radius: 10px; text-align: left; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}
.lw-dragging { transition: none; }
.lw-row:active { background: #f8fafc; }
.lw-emoji { font-size: 13px; flex-shrink: 0; }
.lw-main { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 1px; }
.lw-title { display: flex; align-items: center; gap: 4px; min-width: 0; }
.lw-title-text {
  font-size: 12px; color: #1e293b; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.lw-tag {
  font-size: 9px; color: #94a3b8; background: #f1f5f9;
  border-radius: 999px; padding: 1px 6px; flex-shrink: 0;
}
.lw-chevron { font-size: 9px; color: #94a3b8; flex-shrink: 0; }
.lw-sub { font-size: 10px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lw-repaid { color: #0d9488; }
.lw-strike { text-decoration: line-through; color: #94a3b8; }
/* 危险标记仅染红标题与金额，克制素雅 */
.lw-danger-text { color: #dc2626; }
.lw-amount { font-size: 12px; font-weight: 600; flex-shrink: 0; }
.lw-amount-income { color: #059669; }
.lw-amount-expense { color: #dc2626; }
.lw-amount-other { color: #64748b; }
.lw-amount-danger { color: #dc2626; }

.lw-repay { margin: 2px 0 4px 14px; padding: 4px 0 4px 8px; border-left: 2px solid #eef2f7; }
.lw-repay-head { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.lw-repay-cap { font-size: 10px; color: #64748b; }
.lw-repay-edit {
  border: 1px solid #e2e8f0; background: #f8fafc; color: #334155;
  font-size: 9px; line-height: 1.5; padding: 1px 7px; border-radius: 999px;
}
.lw-repay-line { display: flex; justify-content: space-between; gap: 10px; font-size: 10px; line-height: 1.7; color: #64748b; margin: 0; }
.lw-repay-info { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lw-repay-amt { color: #0d9488; flex-shrink: 0; }
.lw-repay-borrow { color: #d97706; }
.lw-empty { font-size: 11px; color: #b6c2d2; padding: 8px 4px; }
</style>
