<script setup lang="ts">
/**
 * 底部 7 大功能模块宫格
 *
 * 仅负责 ModuleKey 的切换（配置驱动），角标数量全部来自 useCrmStore 实时派生状态。
 */
import { computed } from 'vue'
import type { Component } from 'vue'
import { Flower2, Gift, Lightbulb, Sparkles, UserX, Users, Wallet } from '@lucide/vue'
import { useCrmStore } from '@/store/useCrmStore'
import type { ModuleKey } from '@/types/schema'

const props = defineProps<{ activeModule?: ModuleKey | null }>()

const emit = defineEmits<{ select: [key: ModuleKey] }>()

const crm = useCrmStore()

interface ModuleConfig {
  key: ModuleKey
  label: string
  hint: string
  icon: Component
  iconClass: string
  badgeClass: string
}

const MODULE_CONFIG: ModuleConfig[] = [
  {
    key: 'contacts',
    label: '通讯录',
    hint: '保持来往',
    icon: Users,
    iconClass: 'bg-cyan-50 text-cyan-600',
    badgeClass: 'bg-cyan-100 text-cyan-700',
  },
  {
    key: 'ideas',
    label: '想法',
    hint: '灵感观察',
    icon: Lightbulb,
    iconClass: 'bg-amber-50 text-amber-600',
    badgeClass: 'bg-amber-100 text-amber-700',
  },
  {
    key: 'gifts',
    label: '礼物',
    hint: '人情往来',
    icon: Gift,
    iconClass: 'bg-rose-50 text-rose-600',
    badgeClass: 'bg-rose-100 text-rose-700',
  },
  {
    key: 'ledger',
    label: '记账',
    hint: '人情收支',
    icon: Wallet,
    iconClass: 'bg-emerald-50 text-emerald-600',
    badgeClass: 'bg-emerald-100 text-emerald-700',
  },
  {
    key: 'skills',
    label: '技能',
    hint: '能力标签',
    icon: Sparkles,
    iconClass: 'bg-violet-50 text-violet-600',
    badgeClass: 'bg-violet-100 text-violet-700',
  },
  {
    key: 'cutoff',
    label: '不来往人物',
    hint: '暂不联系',
    icon: UserX,
    iconClass: 'bg-slate-100 text-slate-500',
    badgeClass: 'bg-slate-200 text-slate-600',
  },
  {
    key: 'deceased',
    label: '不在世人物',
    hint: '缅怀纪念',
    icon: Flower2,
    iconClass: 'bg-stone-100 text-stone-500',
    badgeClass: 'bg-stone-200 text-stone-600',
  },
]

const skillCount = computed(() => {
  const set = new Set<string>()
  for (const person of crm.persons) {
    for (const skill of person.skills) set.add(skill)
  }
  return set.size
})

const counts = computed<Record<ModuleKey, number>>(() => ({
  contacts: crm.activePersons.length,
  ideas: crm.ideaRecords.length,
  gifts: crm.giftRecords.length,
  ledger: crm.ledgerRecords.length,
  skills: skillCount.value,
  cutoff: crm.cutoffPersons.length,
  deceased: crm.deceasedPersons.length,
}))

const moduleItems = computed(() =>
  MODULE_CONFIG.map((config) => ({ ...config, count: counts.value[config.key] })),
)
</script>

<template>
  <section class="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm sm:p-5">
    <div class="flex items-end justify-between">
      <div>
        <h2 class="text-sm font-semibold text-slate-800">功能模块</h2>
        <p class="mt-0.5 text-xs text-slate-400">同一份人际关系数据，七种视角</p>
      </div>
    </div>

    <div class="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
      <button
        v-for="item in moduleItems"
        :key="item.key"
        type="button"
        class="relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3.5 transition hover:-translate-y-0.5 hover:shadow-md"
        :class="
          props.activeModule === item.key
            ? 'border-cyan-300 bg-cyan-50/70 shadow-sm'
            : 'border-slate-200 bg-white'
        "
        @click="emit('select', item.key)"
      >
        <span
          class="flex h-10 w-10 items-center justify-center rounded-xl"
          :class="item.iconClass"
        >
          <component :is="item.icon" class="h-5 w-5" />
        </span>
        <span class="text-xs font-semibold text-slate-700">{{ item.label }}</span>
        <span class="text-[10px] text-slate-400">{{ item.hint }}</span>
        <span
          class="absolute right-2 top-2 min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold leading-4"
          :class="item.badgeClass"
        >
          {{ item.count }}
        </span>
      </button>
    </div>
  </section>
</template>
