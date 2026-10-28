<script setup lang="ts">
/**
 * 7 大模块共用的唯一抽屉弹窗（严禁拆分）
 *
 * 渲染差异完全由 ModuleKey 配置驱动：
 * - contacts / cutoff / deceased → 人物卡片 + 搜索 + 新增/编辑表单
 * - ideas / gifts / ledger     → 流水列表 + 快捷新增表单
 * - skills                     → 技能标签云 → 点击筛选掌握者
 */
import { computed, reactive, ref, watch } from 'vue'
import type { Component } from 'vue'
import {
  Check,
  Flower2,
  Gift,
  Lightbulb,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash,
  UserX,
  Users,
  Wallet,
  X,
} from '@lucide/vue'
import { useCrmStore } from '@/store/useCrmStore'
import type {
  CrmRecord,
  ModuleKey,
  Person,
  PersonStatus,
  RecordType,
} from '@/types/schema'

const props = defineProps<{ activeModule: ModuleKey | null }>()

const emit = defineEmits<{ close: [] }>()

const crm = useCrmStore()

type PersonModuleKey = 'contacts' | 'cutoff' | 'deceased'
type RecordModuleKey = 'ideas' | 'gifts' | 'ledger'

const PERSON_MODULES: Record<
  PersonModuleKey,
  { title: string; status: PersonStatus; desc: string; empty: string }
> = {
  contacts: {
    title: '通讯录',
    status: 'active',
    desc: '保持来往的人，都值得被认真记住',
    empty: '还没有联系人，点右上角「新增」添加第一位',
  },
  cutoff: {
    title: '不来往人物',
    status: 'cutoff',
    desc: '暂不联系，但记录仍然保留',
    empty: '暂无「不来往」状态的人物',
  },
  deceased: {
    title: '不在世人物',
    status: 'deceased',
    desc: '珍藏回忆，继续前行',
    empty: '暂无「不在世」状态的人物',
  },
}

const RECORD_MODULES: Record<
  RecordModuleKey,
  { title: string; type: RecordType; desc: string; empty: string }
> = {
  ideas: { title: '想法', type: 'idea', desc: '灵感与观察，随手记下', empty: '还没有想法记录' },
  gifts: { title: '礼物', type: 'gift', desc: '人情往来，礼轻情意重', empty: '还没有礼物记录' },
  ledger: { title: '记账', type: 'ledger', desc: '人情账本，收支分明', empty: '还没有记账记录' },
}

const MODULE_ICONS: Record<ModuleKey, Component> = {
  contacts: Users,
  ideas: Lightbulb,
  gifts: Gift,
  ledger: Wallet,
  skills: Sparkles,
  cutoff: UserX,
  deceased: Flower2,
}

const STATUS_OPTIONS: Array<{ value: PersonStatus; label: string }> = [
  { value: 'active', label: '通讯录' },
  { value: 'cutoff', label: '不来往' },
  { value: 'deceased', label: '不在世' },
]

const STATUS_LABEL: Record<PersonStatus, string> = {
  active: '通讯录',
  cutoff: '不来往',
  deceased: '不在世',
}

const STATUS_BADGE: Record<PersonStatus, string> = {
  active: 'bg-cyan-50 text-cyan-600',
  cutoff: 'bg-slate-100 text-slate-500',
  deceased: 'bg-stone-100 text-stone-500',
}

function isPersonModuleKey(key: ModuleKey | null): key is PersonModuleKey {
  return key === 'contacts' || key === 'cutoff' || key === 'deceased'
}

function isRecordModuleKey(key: ModuleKey | null): key is RecordModuleKey {
  return key === 'ideas' || key === 'gifts' || key === 'ledger'
}

const personModule = computed(() =>
  isPersonModuleKey(props.activeModule) ? PERSON_MODULES[props.activeModule] : null,
)

const recordModule = computed(() =>
  isRecordModuleKey(props.activeModule) ? RECORD_MODULES[props.activeModule] : null,
)

const title = computed(() => {
  if (personModule.value) return personModule.value.title
  if (recordModule.value) return recordModule.value.title
  if (props.activeModule === 'skills') return '技能'
  return ''
})

const subtitle = computed(() => {
  if (personModule.value) return personModule.value.desc
  if (recordModule.value) return recordModule.value.desc
  if (props.activeModule === 'skills') return '按技能标签聚合 · 点击标签查看掌握者'
  return ''
})

const currentIcon = computed<Component>(() =>
  props.activeModule ? MODULE_ICONS[props.activeModule] : Users,
)

// ---------- 人物模块 ----------
const search = ref('')
const formVisible = ref(false)
const formError = ref('')
const skillInput = ref('')

interface PersonFormState {
  id?: string
  name: string
  aliases: string
  phone: string
  birthday: string
  tags: string
  note: string
  status: PersonStatus
  skills: string[]
}

function emptyPersonForm(status: PersonStatus): PersonFormState {
  return {
    id: undefined,
    name: '',
    aliases: '',
    phone: '',
    birthday: '',
    tags: '',
    note: '',
    status,
    skills: [],
  }
}

const form = reactive<PersonFormState>(emptyPersonForm('active'))

const personList = computed<Person[]>(() => {
  const config = personModule.value
  if (!config) return []
  const keyword = search.value.trim().toLowerCase()
  return crm.persons
    .filter((person) => person.status === config.status)
    .filter((person) => {
      if (!keyword) return true
      const haystack = [
        person.name,
        ...person.aliases,
        ...person.tags,
        ...person.skills,
        person.phone ?? '',
        person.note ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(keyword)
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
})

function splitList(raw: string): string[] {
  return raw
    .split(/[,，、;；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function statusLabel(status: PersonStatus): string {
  return STATUS_LABEL[status]
}

function statusBadgeClass(status: PersonStatus): string {
  return STATUS_BADGE[status]
}

function startCreate(): void {
  Object.assign(form, emptyPersonForm(personModule.value?.status ?? 'active'))
  formVisible.value = true
  formError.value = ''
  skillInput.value = ''
}

function startEdit(person: Person): void {
  Object.assign(form, {
    id: person.id,
    name: person.name,
    aliases: person.aliases.join('、'),
    phone: person.phone ?? '',
    birthday: person.birthday ?? '',
    tags: person.tags.join('、'),
    note: person.note ?? '',
    status: person.status,
    skills: [...person.skills],
  })
  formVisible.value = true
  formError.value = ''
  skillInput.value = ''
}

function addSkill(): void {
  const skill = skillInput.value.trim()
  if (!skill) return
  if (!form.skills.includes(skill)) form.skills.push(skill)
  skillInput.value = ''
}

function removeSkill(skill: string): void {
  form.skills = form.skills.filter((item) => item !== skill)
}

function submitPerson(): void {
  const name = form.name.trim()
  if (!name) {
    formError.value = '请填写姓名'
    return
  }
  addSkill()
  crm.upsertPerson({
    id: form.id,
    name,
    aliases: splitList(form.aliases),
    status: form.status,
    skills: [...form.skills],
    tags: splitList(form.tags),
    phone: form.phone.trim() || undefined,
    birthday: form.birthday || undefined,
    note: form.note.trim() || undefined,
  })
  formVisible.value = false
  formError.value = ''
}

function removePerson(person: Person): void {
  if (!window.confirm(`删除「${person.name}」及其全部流水与关系？`)) return
  crm.deletePerson(person.id)
  if (form.id === person.id) formVisible.value = false
}

// ---------- 流水模块 ----------
interface RecordFormState {
  personId: string
  itemTitle: string
  amount: string
  eventDate: string
  rawContent: string
}

function todayKey(): string {
  const date = new Date()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${date.getFullYear()}-${month < 10 ? `0${month}` : month}-${day < 10 ? `0${day}` : day}`
}

const recordForm = reactive<RecordFormState>({
  personId: '',
  itemTitle: '',
  amount: '',
  eventDate: todayKey(),
  rawContent: '',
})

const recordError = ref('')

const recordList = computed<CrmRecord[]>(() => {
  const config = recordModule.value
  if (!config) return []
  return crm.records
    .filter((record) => record.type === config.type)
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate) || b.createdAt - a.createdAt)
})

const recordNet = computed(() =>
  recordList.value.reduce((sum, record) => sum + record.amount, 0),
)

function resetRecordForm(keepPerson = false): void {
  if (!keepPerson) recordForm.personId = ''
  recordForm.itemTitle = ''
  recordForm.amount = ''
  recordForm.rawContent = ''
  recordForm.eventDate = todayKey()
  recordError.value = ''
}

function submitRecord(): void {
  const config = recordModule.value
  if (!config) return
  if (!recordForm.personId) {
    recordError.value = '请选择人物'
    return
  }
  const itemTitle = recordForm.itemTitle.trim()
  if (!itemTitle) {
    recordError.value = '请填写条目'
    return
  }
  let amount = 0
  if (config.type !== 'idea') {
    const rawAmount = recordForm.amount.trim()
    if (!rawAmount) {
      recordError.value = '请填写金额（正数为收到，负数为送出）'
      return
    }
    amount = Number(rawAmount)
    if (!Number.isFinite(amount)) {
      recordError.value = '金额格式不正确'
      return
    }
  }
  if (!recordForm.eventDate) {
    recordError.value = '请选择日期'
    return
  }
  crm.addRecord({
    personId: recordForm.personId,
    type: config.type,
    amount,
    itemTitle,
    rawContent: recordForm.rawContent.trim() || itemTitle,
    eventDate: recordForm.eventDate,
    source: 'manual',
  })
  resetRecordForm(true)
}

// ---------- 技能模块 ----------
const selectedSkill = ref<string | null>(null)

const skillsMap = computed<Record<string, Person[]>>(() => {
  const map: Record<string, Person[]> = {}
  for (const person of crm.persons) {
    for (const skill of person.skills) {
      if (!map[skill]) map[skill] = []
      map[skill].push(person)
    }
  }
  return map
})

const skillTags = computed(() =>
  Object.entries(skillsMap.value)
    .map(([name, persons]) => ({ name, count: persons.length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN')),
)

const skillPersons = computed<Person[]>(() =>
  selectedSkill.value ? (skillsMap.value[selectedSkill.value] ?? []) : [],
)

// ---------- 通用 ----------
function signedMoney(value: number): string {
  if (value === 0) return '¥0'
  return `${value > 0 ? '+' : '-'}¥${Math.abs(value).toLocaleString('zh-CN')}`
}

function amountClass(amount: number): string {
  if (amount > 0) return 'text-emerald-600'
  if (amount < 0) return 'text-rose-600'
  return 'text-slate-400'
}

watch(
  () => props.activeModule,
  () => {
    search.value = ''
    selectedSkill.value = null
    formVisible.value = false
    formError.value = ''
    skillInput.value = ''
    resetRecordForm()
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="props.activeModule"
        class="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
        @click="emit('close')"
      ></div>
    </Transition>

    <Transition name="slide">
      <aside
        v-if="props.activeModule"
        class="fixed right-0 top-0 z-50 flex h-full w-full max-w-[520px] flex-col border-l border-slate-200 bg-white shadow-2xl"
      >
        <header class="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600"
          >
            <component :is="currentIcon" class="h-5 w-5" />
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="text-base font-semibold text-slate-800">{{ title }}</h2>
            <p class="mt-0.5 truncate text-xs text-slate-400">{{ subtitle }}</p>
          </div>
          <button
            type="button"
            class="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title="关闭"
            @click="emit('close')"
          >
            <X class="h-5 w-5" />
          </button>
        </header>

        <div class="flex-1 overflow-y-auto px-5 py-4">
          <!-- 人物类模块：contacts / cutoff / deceased -->
          <div v-if="personModule" class="space-y-3">
            <div class="flex gap-2">
              <label class="relative flex-1">
                <Search
                  class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                />
                <input
                  v-model="search"
                  type="text"
                  :placeholder="`搜索${personModule.title}（姓名 / 别名 / 标签 / 技能）`"
                  class="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm outline-none transition focus:border-cyan-300 focus:bg-white"
                />
              </label>
              <button
                type="button"
                class="flex shrink-0 items-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-cyan-700"
                @click="startCreate"
              >
                <Plus class="h-4 w-4" />
                新增
              </button>
            </div>

            <form
              v-if="formVisible"
              class="space-y-2.5 rounded-xl border border-cyan-200 bg-cyan-50/40 p-3"
              @submit.prevent="submitPerson"
            >
              <p class="text-xs font-semibold text-cyan-700">
                {{ form.id ? '编辑人物' : '新增人物' }}
              </p>

              <div class="grid grid-cols-2 gap-2.5">
                <label class="col-span-2">
                  <span class="text-[11px] text-slate-500">姓名</span>
                  <input
                    v-model="form.name"
                    type="text"
                    placeholder="必填"
                    class="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-cyan-300"
                  />
                </label>

                <div class="col-span-2">
                  <span class="text-[11px] text-slate-500">状态</span>
                  <div class="mt-1 grid grid-cols-3 gap-1.5">
                    <button
                      v-for="option in STATUS_OPTIONS"
                      :key="option.value"
                      type="button"
                      class="rounded-lg border px-2 py-1.5 text-xs font-medium transition"
                      :class="
                        form.status === option.value
                          ? 'border-cyan-400 bg-cyan-100 text-cyan-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                      "
                      @click="form.status = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <label>
                  <span class="text-[11px] text-slate-500">别名</span>
                  <input
                    v-model="form.aliases"
                    type="text"
                    placeholder="老妈、妈"
                    class="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-cyan-300"
                  />
                </label>
                <label>
                  <span class="text-[11px] text-slate-500">电话</span>
                  <input
                    v-model="form.phone"
                    type="text"
                    placeholder="可选"
                    class="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-cyan-300"
                  />
                </label>
                <label>
                  <span class="text-[11px] text-slate-500">生日</span>
                  <input
                    v-model="form.birthday"
                    type="date"
                    class="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-cyan-300"
                  />
                </label>
                <label>
                  <span class="text-[11px] text-slate-500">标签</span>
                  <input
                    v-model="form.tags"
                    type="text"
                    placeholder="家人、同事"
                    class="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-cyan-300"
                  />
                </label>

                <div class="col-span-2">
                  <span class="text-[11px] text-slate-500">技能标签</span>
                  <div
                    class="mt-0.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2"
                  >
                    <span
                      v-for="skill in form.skills"
                      :key="skill"
                      class="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-600"
                    >
                      {{ skill }}
                      <button
                        type="button"
                        class="text-violet-400 transition hover:text-violet-700"
                        title="移除"
                        @click="removeSkill(skill)"
                      >
                        <X class="h-3 w-3" />
                      </button>
                    </span>
                    <input
                      v-model="skillInput"
                      type="text"
                      placeholder="输入技能后回车"
                      class="min-w-[120px] flex-1 border-0 bg-transparent px-1 py-1 text-xs outline-none"
                      @keydown.enter.prevent="addSkill"
                    />
                  </div>
                </div>

                <label class="col-span-2">
                  <span class="text-[11px] text-slate-500">备注</span>
                  <textarea
                    v-model="form.note"
                    rows="2"
                    placeholder="可选"
                    class="mt-0.5 w-full resize-none rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-cyan-300"
                  ></textarea>
                </label>
              </div>

              <p v-if="formError" class="text-xs text-rose-500">{{ formError }}</p>

              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 transition hover:border-slate-300"
                  @click="formVisible = false"
                >
                  取消
                </button>
                <button
                  type="submit"
                  class="flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-cyan-700"
                >
                  <Check class="h-3.5 w-3.5" />
                  保存
                </button>
              </div>
            </form>

            <p v-if="personList.length === 0" class="py-10 text-center text-sm text-slate-400">
              {{ personModule.empty }}
            </p>

            <article
              v-for="person in personList"
              :key="person.id"
              class="rounded-xl border border-slate-200 bg-white p-3.5 transition hover:border-cyan-200 hover:shadow-sm"
            >
              <div class="flex items-start gap-3">
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500"
                >
                  {{ person.name.slice(0, 1) }}
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <h3 class="text-sm font-semibold text-slate-800">{{ person.name }}</h3>
                    <span
                      class="rounded-full px-1.5 py-0.5 text-[10px]"
                      :class="statusBadgeClass(person.status)"
                    >
                      {{ statusLabel(person.status) }}
                    </span>
                    <span
                      v-for="tag in person.tags"
                      :key="tag"
                      class="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500"
                    >
                      {{ tag }}
                    </span>
                  </div>
                  <p v-if="person.aliases.length" class="mt-1 text-[11px] text-slate-400">
                    别名：{{ person.aliases.join('、') }}
                  </p>
                  <p v-if="person.phone" class="text-[11px] text-slate-400">
                    电话：{{ person.phone }}
                  </p>
                  <div v-if="person.skills.length" class="mt-1.5 flex flex-wrap gap-1">
                    <span
                      v-for="skill in person.skills"
                      :key="skill"
                      class="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-600"
                    >
                      {{ skill }}
                    </span>
                  </div>
                  <p v-if="person.note" class="mt-1.5 line-clamp-2 text-[11px] text-slate-500">
                    {{ person.note }}
                  </p>
                </div>
                <div class="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    class="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-cyan-600"
                    title="编辑"
                    @click="startEdit(person)"
                  >
                    <Pencil class="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    class="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                    title="删除"
                    @click="removePerson(person)"
                  >
                    <Trash class="h-4 w-4" />
                  </button>
                </div>
              </div>
            </article>
          </div>

          <!-- 流水类模块：ideas / gifts / ledger -->
          <div v-else-if="recordModule" class="space-y-4">
            <form
              class="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
              @submit.prevent="submitRecord"
            >
              <p class="text-xs font-semibold text-slate-600">快捷新增{{ recordModule.title }}</p>

              <div class="grid grid-cols-2 gap-2.5">
                <label class="col-span-2">
                  <span class="text-[11px] text-slate-500">人物</span>
                  <select
                    v-model="recordForm.personId"
                    class="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-cyan-300"
                  >
                    <option value="" disabled>请选择人物</option>
                    <option v-for="person in crm.persons" :key="person.id" :value="person.id">
                      {{ person.name
                      }}{{ person.status !== 'active' ? `（${statusLabel(person.status)}）` : '' }}
                    </option>
                  </select>
                </label>

                <label class="col-span-2">
                  <span class="text-[11px] text-slate-500">条目</span>
                  <input
                    v-model="recordForm.itemTitle"
                    type="text"
                    :placeholder="
                      recordModule.type === 'idea' ? '想法标题' : '礼物名 / 收支项'
                    "
                    class="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-cyan-300"
                  />
                </label>

                <label v-if="recordModule.type !== 'idea'">
                  <span class="text-[11px] text-slate-500">金额（正收负支）</span>
                  <input
                    v-model="recordForm.amount"
                    type="number"
                    step="0.01"
                    placeholder="-200 或 300"
                    class="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-cyan-300"
                  />
                </label>

                <label :class="recordModule.type === 'idea' ? 'col-span-2' : ''">
                  <span class="text-[11px] text-slate-500">日期</span>
                  <input
                    v-model="recordForm.eventDate"
                    type="date"
                    class="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-cyan-300"
                  />
                </label>

                <label class="col-span-2">
                  <span class="text-[11px] text-slate-500">备注</span>
                  <input
                    v-model="recordForm.rawContent"
                    type="text"
                    placeholder="可选，留空则使用条目名"
                    class="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-cyan-300"
                  />
                </label>
              </div>

              <p v-if="recordError" class="text-xs text-rose-500">{{ recordError }}</p>

              <button
                type="submit"
                class="flex w-full items-center justify-center gap-1 rounded-lg bg-cyan-600 py-2 text-sm font-medium text-white transition hover:bg-cyan-700"
              >
                <Plus class="h-4 w-4" />
                添加{{ recordModule.title }}
              </button>
            </form>

            <div class="flex items-center justify-between text-xs text-slate-400">
              <span>共 {{ recordList.length }} 条</span>
              <span v-if="recordModule.type !== 'idea'">
                净收支
                <span class="font-semibold" :class="amountClass(recordNet)">
                  {{ signedMoney(recordNet) }}
                </span>
              </span>
            </div>

            <p v-if="recordList.length === 0" class="py-8 text-center text-sm text-slate-400">
              {{ recordModule.empty }}
            </p>

            <article
              v-for="record in recordList"
              :key="record.id"
              class="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3"
            >
              <span
                class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500"
              >
                {{ record.personName.slice(0, 1) }}
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-sm font-medium text-slate-700">{{ record.itemTitle }}</p>
                  <span
                    v-if="record.type !== 'idea'"
                    class="shrink-0 text-sm font-semibold"
                    :class="amountClass(record.amount)"
                  >
                    {{ signedMoney(record.amount) }}
                  </span>
                  <span
                    v-else
                    class="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600"
                  >
                    想法
                  </span>
                </div>
                <p class="mt-0.5 truncate text-[11px] text-slate-400">
                  {{ record.personName }} · {{ record.eventDate }}
                  <span v-if="record.rawContent && record.rawContent !== record.itemTitle">
                    · {{ record.rawContent }}
                  </span>
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-lg p-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500"
                title="删除"
                @click="crm.deleteRecord(record.id)"
              >
                <Trash class="h-4 w-4" />
              </button>
            </article>
          </div>

          <!-- 技能模块 -->
          <div v-else-if="props.activeModule === 'skills'" class="space-y-4">
            <div>
              <p class="text-xs text-slate-400">点击技能标签，筛选掌握该技能的人</p>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <button
                  v-for="tag in skillTags"
                  :key="tag.name"
                  type="button"
                  class="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition"
                  :class="
                    selectedSkill === tag.name
                      ? 'border-violet-400 bg-violet-100 text-violet-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-600'
                  "
                  @click="selectedSkill = selectedSkill === tag.name ? null : tag.name"
                >
                  {{ tag.name }}
                  <span class="text-[10px] opacity-70">{{ tag.count }}</span>
                </button>
              </div>
              <p v-if="skillTags.length === 0" class="py-6 text-center text-xs text-slate-400">
                还没有任何技能标签，去通讯录给人物添加技能吧
              </p>
            </div>

            <div v-if="selectedSkill" class="space-y-2">
              <p class="text-xs text-slate-500">
                掌握「{{ selectedSkill }}」的人 · {{ skillPersons.length }} 位
              </p>

              <article
                v-for="person in skillPersons"
                :key="person.id"
                class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
              >
                <span
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500"
                >
                  {{ person.name.slice(0, 1) }}
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <span class="text-sm font-medium text-slate-700">{{ person.name }}</span>
                    <span
                      class="rounded-full px-1.5 py-0.5 text-[10px]"
                      :class="statusBadgeClass(person.status)"
                    >
                      {{ statusLabel(person.status) }}
                    </span>
                  </div>
                  <p class="truncate text-[11px] text-slate-400">
                    {{ person.note || person.phone || person.tags.join('、') || '暂无备注' }}
                  </p>
                </div>
              </article>
            </div>
          </div>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
