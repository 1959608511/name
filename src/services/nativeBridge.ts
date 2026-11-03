/**
 * FishCRM v2.0 安卓原生桥接层
 * 对接 window.FishNativeBridge 与 fishcrm:capture-ready / fishcrm:back-pressed 事件。
 */

export interface FishNativeBridgeApi {
  /** 读取并清空 SharedPreferences("fish_crm_queue") 抓屏队列（上限 50 条） */
  pullPendingCaptures(): string;
  openAccessibilitySettings(): void;
  isAccessibilityEnabled(): boolean;
  /** 退出 App（安卓原生 finish） */
  exitApp(): void;
  /** 唤起系统 SAF「另存为」，把 Base64 内容写入用户指定位置 */
  exportToUserFile(fileName: string, contentBase64: string): void;
  /** 唤起系统 SAF 文件选择器，读取结果以 Base64 通过 fishcrm:file-imported 回传 */
  importFromUserFile(): void;
}

declare global {
  interface Window {
    FishNativeBridge?: FishNativeBridgeApi;
  }
}

export const CAPTURE_READY_EVENT = 'fishcrm:capture-ready';
export const BACK_PRESSED_EVENT = 'fishcrm:back-pressed';
export const FILE_EXPORTED_EVENT = 'fishcrm:file-exported';
export const FILE_IMPORTED_EVENT = 'fishcrm:file-imported';

export function getNativeBridge(): FishNativeBridgeApi | null {
  if (typeof window === 'undefined') return null;
  return window.FishNativeBridge ?? null;
}

export function isAccessibilityEnabled(): boolean {
  try {
    return getNativeBridge()?.isAccessibilityEnabled() ?? false;
  } catch {
    return false;
  }
}

export function openAccessibilitySettings(): void {
  getNativeBridge()?.openAccessibilitySettings();
}

/** 退出 App（调用原生 finish；无桥接时静默） */
export function exitApp(): void {
  getNativeBridge()?.exitApp();
}

/** 拉取原生抓屏队列，鲁棒解析 JSON 数组 / 换行纯文本两种格式 */
export function pullPendingCaptures(): string[] {
  const bridge = getNativeBridge();
  if (!bridge) return [];
  let rawStr = '';
  try {
    rawStr = bridge.pullPendingCaptures();
  } catch {
    return [];
  }
  if (!rawStr) return [];
  try {
    const raw: unknown = JSON.parse(rawStr);
    if (Array.isArray(raw)) {
      const out: string[] = [];
      for (const item of raw) {
        if (typeof item === 'string') {
          out.push(item);
        } else if (item && typeof item === 'object') {
          const texts = (item as { texts?: unknown }).texts;
          if (Array.isArray(texts)) {
            for (const t of texts) if (typeof t === 'string') out.push(t);
          }
        }
      }
      return out;
    }
  } catch {
    // 非 JSON：按换行文本兜底
  }
  return rawStr.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
}

/* ---------------- 返回键消费栈 ---------------- */

/** 返回 true 表示该层已消费返回事件，不再向下传递 */
export type BackHandler = () => boolean;

const backStack: BackHandler[] = [];

/** 注册返回键处理器（栈顶优先），返回注销函数 */
export function registerBackHandler(handler: BackHandler): () => void {
  backStack.push(handler);
  return () => {
    const idx = backStack.indexOf(handler);
    if (idx >= 0) backStack.splice(idx, 1);
  };
}

function dispatchBackPress(): void {
  for (let i = backStack.length - 1; i >= 0; i -= 1) {
    if (backStack[i]()) return;
  }
}

/* ---------------- 文件导出 / 导入（支持用户指定位置） ---------------- */

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function base64ToUtf8(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * 导出文件：安卓走系统 SAF「另存为」让用户指定目录与文件名；
 * 无桥接（Web 调试）时退化为浏览器下载。resolve 结果表示用户是否完成保存。
 */
export function exportFile(fileName: string, mime: string, content: string): Promise<boolean> {
  const bridge = getNativeBridge();
  if (typeof bridge?.exportToUserFile !== 'function') {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const onDone = (e: Event): void => {
      window.removeEventListener(FILE_EXPORTED_EVENT, onDone);
      resolve((e as CustomEvent<{ ok?: boolean }>).detail?.ok === true);
    };
    window.addEventListener(FILE_EXPORTED_EVENT, onDone);
    bridge.exportToUserFile(fileName, utf8ToBase64(content));
  });
}

/**
 * 导入文件：安卓走系统 SAF 文件选择器（可浏览任意目录）；
 * 无桥接时退化为 input[type=file]。取消选择时 resolve(null)。
 */
export function pickFile(accept: string): Promise<{ name: string; content: string } | null> {
  const bridge = getNativeBridge();
  if (typeof bridge?.importFromUserFile !== 'function') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.addEventListener('change', () => {
        const f = input.files?.[0];
        if (!f) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ name: f.name, content: String(reader.result ?? '') });
        reader.onerror = () => resolve(null);
        reader.readAsText(f);
      });
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  }
  return new Promise((resolve) => {
    const onPicked = (e: Event): void => {
      window.removeEventListener(FILE_IMPORTED_EVENT, onPicked);
      const d = (e as CustomEvent<{ name?: string; contentBase64?: string }>).detail;
      if (!d?.contentBase64) { resolve(null); return; }
      resolve({ name: d.name ?? 'import', content: base64ToUtf8(d.contentBase64) });
    };
    window.addEventListener(FILE_IMPORTED_EVENT, onPicked);
    bridge.importFromUserFile();
  });
}

/* ---------------- 事件挂接 ---------------- */

/**
 * 初始化原生事件监听：抓屏完成静默入库、返回键派发消费栈。
 * 返回清理函数（组件卸载时调用）。
 */
export function initNativeBridge(onCapture: (lines: string[]) => void): () => void {
  const onReady = (): void => {
    const lines = pullPendingCaptures();
    if (lines.length > 0) onCapture(lines);
  };
  const onBack = (): void => dispatchBackPress();
  window.addEventListener(CAPTURE_READY_EVENT, onReady);
  window.addEventListener(BACK_PRESSED_EVENT, onBack);
  return () => {
    window.removeEventListener(CAPTURE_READY_EVENT, onReady);
    window.removeEventListener(BACK_PRESSED_EVENT, onBack);
  };
}
