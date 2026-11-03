<script setup lang="ts">
/** 借还结算弹层：部分归还 / 全部已还 / 撤销已还 */
import { computed, ref } from 'vue';
import type { LedgerItem } from '../../types/schema';
import { useCrmStore } from '../../store/useCrmStore';

const props = defineProps<{ item: LedgerItem }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const store = useCrmStore();
const mode = ref<'partial' | 'settled'>('partial');
const amountText = ref('');

const total = computed(() => props.item.amount);
const repaid = computed(() => (props.item.repayments ?? []).reduce((sum, r) => sum + r.amount, 0));
const remaining = computed(() => Math.max(0, total.value - repaid.value));
const parsed = computed(() => Number(amountText.value));
const valid = computed(() => Number.isFinite(parsed.value) && parsed.value > 0);

function confirmPartial(): void {
  if (!valid.value) return;
  store.addLedgerRepayment(props.item.id, parsed.value);
  emit('close');
}
function settleAll(): void {
  store.markLedgerSettled(props.item.id, true);
  emit('close');
}
function revoke(): void {
  store.markLedgerSettled(props.item.id, false);
  emit('close');
}
</script>

<template>
  <div class="rp-mask" @click.self="emit('close')">
    <div class="rp-card">
      <div class="rp-head">
        <div class="rp-head-main">
          <p class="rp-title">借还结算</p>
          <p class="rp-sub">{{ item.remark || '借还往来' }} · {{ item.contactName || '未关联联系人' }}</p>
        </div>
        <button class="rp-close" type="button" @click="emit('close')">×</button>
      </div>

      <div class="rp-stats">
        <div class="rp-stat"><span class="rp-stat-k">总额</span><b class="rp-stat-v">¥{{ total.toFixed(2) }}</b></div>
        <div class="rp-stat"><span class="rp-stat-k">已还</span><b class="rp-stat-v rp-green">¥{{ repaid.toFixed(2) }}</b></div>
        <div class="rp-stat"><span class="rp-stat-k">剩余</span><b class="rp-stat-v rp-rose">¥{{ remaining.toFixed(2) }}</b></div>
      </div>

      <div class="rp-tabs">
        <button class="rp-tab" :class="{ on: mode === 'partial' }" type="button" @click="mode = 'partial'">
          归还部分金额
        </button>
        <button class="rp-tab" :class="{ on: mode === 'settled' }" type="button" @click="mode = 'settled'">
          全部已还
        </button>
      </div>

      <div v-if="mode === 'partial'" class="rp-body">
        <label class="rp-label">本次归还金额</label>
        <div class="rp-input-wrap">
          <span class="rp-unit">¥</span>
          <input
            v-model="amountText"
            class="rp-input"
            type="number"
            min="0.01"
            step="0.01"
            inputmode="decimal"
            placeholder="输入大于 0 的金额"
            @keyup.enter="confirmPartial"
          />
        </div>
        <p v-if="amountText && !valid" class="rp-error">请输入大于 0 的有效金额</p>
        <p v-else class="rp-tip">当前剩余待还 ¥{{ remaining.toFixed(2) }}</p>
        <div class="rp-foot">
          <button class="rp-ghost" type="button" @click="emit('close')">取消</button>
          <button class="rp-primary" type="button" :disabled="!valid" @click="confirmPartial">确认还款</button>
        </div>
      </div>

      <div v-else class="rp-body">
        <p class="rp-note">确认后将整笔账目标记为「已还清」，记录会附上 ✓ 已还清标签，可随时撤销。</p>
        <div class="rp-foot">
          <button class="rp-ghost" type="button" @click="emit('close')">取消</button>
          <button class="rp-primary rp-primary-green" type="button" @click="settleAll">确认全部已还</button>
        </div>
      </div>

      <div v-if="item.isSettled" class="rp-revoke">
        <button class="rp-ghost rp-ghost-wide" type="button" @click="revoke">撤销已还状态</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rp-mask {
  position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center;
  padding: 20px; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(2px);
  box-sizing: border-box;
}
.rp-card {
  width: 100%; max-width: 340px; max-height: 82vh; overflow-y: auto;
  background: #fff; border-radius: 18px; padding: 16px;
  box-shadow: 0 20px 45px -12px rgba(15, 23, 42, 0.35);
  animation: rp-in 0.24s ease-out;
}
@keyframes rp-in {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.rp-head { display: flex; align-items: flex-start; gap: 8px; }
.rp-head-main { flex: 1; min-width: 0; }
.rp-title { font-size: 15px; font-weight: 600; color: #1e293b; margin: 0; }
.rp-sub {
  font-size: 11px; color: #94a3b8; margin: 4px 0 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rp-close {
  border: 0; background: #f1f5f9; color: #64748b; width: 24px; height: 24px;
  border-radius: 8px; font-size: 14px; line-height: 1; flex-shrink: 0;
  transition: all 0.2s ease;
}
.rp-close:active { transform: scale(0.95); }
.rp-stats { display: flex; gap: 6px; margin-top: 12px; }
.rp-stat {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px;
  padding: 8px 9px; border-radius: 12px; background: #f8fafc; border: 1px solid #eef2f7;
}
.rp-stat-k { font-size: 10px; color: #94a3b8; }
.rp-stat-v { font-size: 12px; color: #1e293b; white-space: nowrap; }
.rp-green { color: #059669; }
.rp-rose { color: #e11d48; }
.rp-tabs { display: flex; gap: 4px; padding: 3px; margin-top: 12px; border-radius: 12px; background: #f1f5f9; }
.rp-tab {
  flex: 1; border: 0; background: transparent; color: #64748b; font-size: 11px;
  padding: 7px 4px; border-radius: 9px; transition: all 0.2s ease;
}
.rp-tab.on { background: #fff; color: #4f46e5; box-shadow: 0 2px 6px -2px rgba(79, 70, 229, 0.35); }
.rp-body { margin-top: 12px; }
.rp-label { font-size: 11px; color: #94a3b8; }
.rp-input-wrap {
  display: flex; align-items: center; gap: 6px; margin-top: 6px;
  border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px 10px; background: #fff;
  transition: all 0.2s ease;
}
.rp-input-wrap:focus-within { border-color: #c7d2fe; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08); }
.rp-unit { font-size: 13px; color: #94a3b8; }
.rp-input {
  flex: 1; min-width: 0; border: 0; outline: none; background: transparent;
  font-size: 15px; font-weight: 600; color: #1e293b;
}
.rp-input::-webkit-outer-spin-button, .rp-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.rp-error { font-size: 10px; color: #e11d48; margin: 6px 0 0; }
.rp-tip { font-size: 10px; color: #94a3b8; margin: 6px 0 0; }
.rp-note {
  font-size: 11px; line-height: 1.7; color: #64748b; margin: 2px 0 0;
  padding: 9px 11px; border-radius: 12px; background: #ecfdf5; border: 1px solid #d1fae5;
}
.rp-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.rp-ghost {
  border: 1px solid #e2e8f0; background: #fff; color: #64748b; font-size: 12px;
  border-radius: 10px; padding: 8px 14px; transition: all 0.2s ease;
}
.rp-ghost:active { transform: scale(0.95); }
.rp-ghost-wide { width: 100%; }
.rp-primary {
  border: 0; background: #4f46e5; color: #fff; font-size: 12px; border-radius: 10px;
  padding: 8px 16px; transition: all 0.2s ease;
}
.rp-primary:active { transform: scale(0.95); }
.rp-primary:disabled { background: #c7d2fe; color: #fff; opacity: 0.7; }
.rp-primary-green { background: linear-gradient(135deg, #10b981, #06b6d4); }
.rp-revoke { margin-top: 12px; padding-top: 12px; border-top: 1px dashed #e2e8f0; }
</style>
