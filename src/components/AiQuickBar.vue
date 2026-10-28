<script setup lang="ts">
/**
 * 首页底部悬浮的一句话 AI 快速记账/记事栏
 *
 * - 输入自然语言（如「给张三随礼500」）回车即解析落库
 * - 未配置 API Key 时自动使用本地正则兜底解析
 * - 附带 API 设置弹窗 与【模拟微信抓屏文本测试】
 */
import { reactive, ref } from 'vue'
import { FlaskConical, Loader2, Send, Settings2, Sparkles, X } from '@lucide/vue'
import { loadAiConfig, parseAndApply, saveAiConfig } from '@/services/aiService'

const input = ref('')
const busy = ref(false)
const feedback = ref<{ ok: boolean; text: string } | null>(null)
const showSettings = ref(false)

const form = reactive(loadAiConfig())

const MOCK_SCREEN_TEXT =
  '[512, 96] 张伟\n[588, 140] 兄弟，上次借你的500今天转你了，注意查收\n[640, 200] 好的收到！改天请你吃饭'

let feedbackTimer: ReturnType<typeof setTimeout> | undefined

function showFeedback(ok: boolean, text: string): void {
  feedback.value = { ok, text }
  if (feedbackTimer) clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => {
    feedback.value = null
  }, 5000)
}

async function submit(): Promise<void> {
  const text = input.value.trim()
  if (!text || busy.value) return
  busy.value = true
  try {
    const { outcome, usedFallback } = await parseAndApply(text)
    const parts: string[] = [`已识别「${outcome.person.name}」`]
    if (outcome.createdPerson) parts.push('（新建人物）')
    if (outcome.record) {
      const typeLabel = { idea: '想法', gift: '礼物', ledger: '记账' }[outcome.record.type]
      const amount =
        outcome.record.amount === 0
          ? ''
          : ` ${outcome.record.amount > 0 ? '+' : '-'}¥${Math.abs(outcome.record.amount)}`
      parts.push(`· ${typeLabel}${amount}`)
    }
    if (outcome.relation) parts.push(`· 关系「${outcome.relation.relationLabel}」`)
    parts.push(usedFallback ? '（本地解析）' : '（AI 解析）')
    showFeedback(true, parts.join(''))
    input.value = ''
  } catch (err) {
    showFeedback(false, err instanceof Error ? err.message : '识别失败，请重试')
  } finally {
    busy.value = false
  }
}

function fillMockScreenText(): void {
  input.value = MOCK_SCREEN_TEXT
}

function openSettings(): void {
  Object.assign(form, loadAiConfig())
  showSettings.value = true
}

function saveSettings(): void {
  saveAiConfig({
    baseUrl: form.baseUrl.trim() || 'https://api.openai.com/v1',
    apiKey: form.apiKey.trim(),
    model: form.model.trim() || 'gpt-4o-mini',
  })
  showSettings.value = false
  showFeedback(true, form.apiKey ? 'API 配置已保存，将优先使用远端 AI 解析' : 'API 配置已保存（未填 Key，使用本地解析）')
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-16 z-30 flex flex-col items-center gap-2 px-4">
    <p
      v-if="feedback"
      class="pointer-events-auto max-w-md rounded-full px-4 py-1.5 text-xs shadow-lg"
      :class="feedback.ok ? 'bg-emerald-600/95 text-white' : 'bg-rose-600/95 text-white'"
    >
      {{ feedback.text }}
    </p>

    <div
      class="pointer-events-auto flex w-full max-w-xl items-center gap-2 rounded-full border border-slate-200 bg-white/95 py-1.5 pl-4 pr-1.5 shadow-xl shadow-slate-900/10 backdrop-blur"
    >
      <Sparkles class="h-4 w-4 shrink-0 text-cyan-500" />
      <input
        v-model="input"
        type="text"
        placeholder="一句话记账/记事：给张三随礼500…"
        class="min-w-0 flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
        @keyup.enter="submit"
      />
      <button
        type="button"
        title="模拟微信抓屏文本测试"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-cyan-600"
        @click="fillMockScreenText"
      >
        <FlaskConical class="h-4 w-4" />
      </button>
      <button
        type="button"
        title="AI 接口设置"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-cyan-600"
        @click="openSettings"
      >
        <Settings2 class="h-4 w-4" />
      </button>
      <button
        type="button"
        :disabled="busy || !input.trim()"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 text-white shadow-md shadow-cyan-500/30 transition hover:opacity-90 disabled:opacity-40"
        @click="submit"
      >
        <Loader2 v-if="busy" class="h-4 w-4 animate-spin" />
        <Send v-else class="h-4 w-4" />
      </button>
    </div>
  </div>

  <!-- API 设置弹窗 -->
  <Teleport to="body">
    <div
      v-if="showSettings"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      @click.self="showSettings = false"
    >
      <div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-sm font-bold text-slate-800">AI 接口设置（OpenAI 兼容）</h3>
          <button
            type="button"
            class="rounded-full p-1 text-slate-400 hover:bg-slate-100"
            @click="showSettings = false"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="space-y-3">
          <label class="block">
            <span class="mb-1 block text-xs text-slate-500">Base URL</span>
            <input
              v-model="form.baseUrl"
              type="text"
              placeholder="https://api.openai.com/v1"
              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            />
          </label>
          <label class="block">
            <span class="mb-1 block text-xs text-slate-500">API Key（留空则使用本地规则解析）</span>
            <input
              v-model="form.apiKey"
              type="password"
              placeholder="sk-..."
              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            />
          </label>
          <label class="block">
            <span class="mb-1 block text-xs text-slate-500">模型</span>
            <input
              v-model="form.model"
              type="text"
              placeholder="gpt-4o-mini"
              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            />
          </label>
        </div>
        <button
          type="button"
          class="mt-4 w-full rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 py-2 text-sm font-semibold text-white shadow-md shadow-cyan-500/30 transition hover:opacity-90"
          @click="saveSettings"
        >
          保存配置
        </button>
      </div>
    </div>
  </Teleport>
</template>
