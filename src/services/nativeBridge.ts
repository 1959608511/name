/**
 * 原生桥接层（安卓无障碍抓屏 → AI 解析入库）
 *
 * 原生端（MainActivity.kt）向 WebView 注入 window.FishNativeBridge：
 * - pullPendingCaptures(): 返回（并清空）无障碍服务写入的抓屏队列 JSON
 * - openAccessibilitySettings(): 跳转系统无障碍设置页
 * - isAccessibilityEnabled(): 查询悬浮球服务是否已开启
 *
 * 触发时机：App 启动、回到前台（visibilitychange / focus）、以及安卓广播转发的
 * `fishcrm:capture-ready` 事件。抓屏文本统一交给 aiService 静默解析，
 * 落库由 store 完成，日历随之响应式刷新。
 */
import { parseAndApply } from '@/services/aiService'

/** 原生端单条抓屏记录（SharedPreferences 队列元素） */
export interface NativeCapture {
  id: string
  packageName: string
  capturedAt: number
  texts: string[]
}

interface FishNativeBridgeApi {
  pullPendingCaptures(): string
  openAccessibilitySettings(): void
  isAccessibilityEnabled(): boolean
}

declare global {
  interface Window {
    FishNativeBridge?: FishNativeBridgeApi
  }
}

/** 安卓广播转发到 WebView 的自定义事件名 */
export const CAPTURE_READY_EVENT = 'fishcrm:capture-ready'

/** 当前是否运行在注入了原生桥的安卓 App 中 */
export function isAndroidNative(): boolean {
  return typeof window !== 'undefined' && Boolean(window.FishNativeBridge)
}

/** 无障碍悬浮球服务是否已开启（非安卓环境恒为 false） */
export function isAccessibilityEnabled(): boolean {
  const bridge = window.FishNativeBridge
  if (!bridge) return false
  try {
    return bridge.isAccessibilityEnabled()
  } catch {
    return false
  }
}

/** 跳转系统无障碍设置页；返回 false 表示当前环境不支持 */
export function openAccessibilitySettings(): boolean {
  const bridge = window.FishNativeBridge
  if (!bridge) return false
  try {
    bridge.openAccessibilitySettings()
    return true
  } catch {
    return false
  }
}

export interface CaptureDrainResult {
  /** 拉取到的抓屏条数 */
  total: number
  /** 成功解析并入库的条数 */
  applied: number
  /** 解析失败或被跳过的条数 */
  skipped: number
}

/** 拉取待处理抓屏并逐条静默解析入库 */
export async function pullAndApplyCaptures(): Promise<CaptureDrainResult> {
  const result: CaptureDrainResult = { total: 0, applied: 0, skipped: 0 }
  const bridge = window.FishNativeBridge
  if (!bridge) return result

  let captures: NativeCapture[] = []
  try {
    const raw = bridge.pullPendingCaptures()
    captures = raw ? (JSON.parse(raw) as NativeCapture[]) : []
  } catch {
    captures = []
  }
  result.total = captures.length

  for (const capture of captures) {
    const text = (capture.texts ?? []).join('\n').trim()
    if (!text) {
      result.skipped += 1
      continue
    }
    try {
      await parseAndApply(text)
      result.applied += 1
    } catch {
      result.skipped += 1
    }
  }
  return result
}

/**
 * 初始化原生桥监听：启动时立即拉取一次，之后在回前台 / 收到广播时再次拉取。
 * @returns 卸载函数（组件销毁时调用）
 */
export function initNativeBridge(onDrained?: (result: CaptureDrainResult) => void): () => void {
  if (!isAndroidNative()) return () => {}

  let disposed = false
  let running = false

  const drain = async (): Promise<void> => {
    if (disposed || running) return
    running = true
    try {
      const result = await pullAndApplyCaptures()
      if (!disposed && result.total > 0) onDrained?.(result)
    } finally {
      running = false
    }
  }

  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') void drain()
  }
  const onFocus = (): void => void drain()
  const onCaptureReady = (): void => void drain()

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', onFocus)
  window.addEventListener(CAPTURE_READY_EVENT, onCaptureReady)
  void drain()

  return () => {
    disposed = true
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('focus', onFocus)
    window.removeEventListener(CAPTURE_READY_EVENT, onCaptureReady)
  }
}
