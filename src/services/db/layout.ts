/**
 * 工作台小模块布局持久化（排序 + 各模块固定像素高度）
 * storage key: fishcrm_v2_layout
 */
export const WIDGET_KEYS = ['contact', 'ledger', 'diary'] as const;
export type WidgetKey = (typeof WIDGET_KEYS)[number];

export const MIN_WIDGET_H = 110;
export const MAX_WIDGET_H = 420;
export const DEFAULT_WIDGET_H = 142;

const LAYOUT_KEY = 'fishcrm_v2_layout';

export interface WorkspaceLayout {
  order: WidgetKey[];
  heights: Record<WidgetKey, number>;
}

function isWidgetKey(v: unknown): v is WidgetKey {
  return typeof v === 'string' && (WIDGET_KEYS as readonly string[]).includes(v);
}

function clampHeight(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_WIDGET_H;
  return Math.round(Math.min(MAX_WIDGET_H, Math.max(MIN_WIDGET_H, n)));
}

export function defaultLayout(): WorkspaceLayout {
  return {
    order: [...WIDGET_KEYS],
    heights: {
      contact: DEFAULT_WIDGET_H,
      ledger: DEFAULT_WIDGET_H,
      diary: DEFAULT_WIDGET_H,
    },
  };
}

/** 归一化：顺序去重补齐，高度夹紧到 110~420 */
export function normalizeLayout(raw: unknown): WorkspaceLayout {
  const base = defaultLayout();
  if (typeof raw !== 'object' || raw === null) return base;
  const obj = raw as { order?: unknown; heights?: unknown };
  const order: WidgetKey[] = [];
  if (Array.isArray(obj.order)) {
    for (const k of obj.order) {
      if (isWidgetKey(k) && !order.includes(k)) order.push(k);
    }
  }
  for (const k of WIDGET_KEYS) {
    if (!order.includes(k)) order.push(k);
  }
  const heightsRaw = (
    typeof obj.heights === 'object' && obj.heights !== null ? obj.heights : {}
  ) as Record<string, unknown>;
  const heights: Record<WidgetKey, number> = { ...base.heights };
  for (const k of WIDGET_KEYS) heights[k] = clampHeight(heightsRaw[k]);
  return { order, heights };
}

export function loadLayout(): WorkspaceLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return defaultLayout();
    return normalizeLayout(JSON.parse(raw));
  } catch {
    return defaultLayout();
  }
}

export function saveLayout(layout: WorkspaceLayout): WorkspaceLayout {
  const normalized = normalizeLayout(layout);
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(normalized));
  } catch {
    // 写入异常（隐私模式等）时保持内存状态可用
  }
  return normalized;
}
