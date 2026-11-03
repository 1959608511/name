/**
 * FishCRM v2.0 日历数据与几何底座
 * - 连续周滑动窗口：任意方向无限滚动，DOM 恒定（由组件按窗口渲染）
 * - 三形态动态视口：全屏 / 正常月历 / 顶部单周窄条，全部由连续像素高度驱动
 * - 农历 / 二十四节气 / 节日（优先级：节日 > 节气 > 农历日）
 */
import type { ISODate } from '../types/schema';

/* ---------------- 基础日期工具 ---------------- */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
export function toISODate(y: number, m: number, d: number): ISODate {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
export function parseISO(s: ISODate): { y: number; m: number; d: number } {
  return { y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)), d: Number(s.slice(8, 10)) };
}
export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}
export function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const nm = m - 1 + delta;
  const ny = y + Math.floor(nm / 12);
  return { y: ny, m: (nm % 12 + 12) % 12 + 1 };
}
export function clampDay(y: number, m: number, day: number): number {
  return Math.min(day, daysInMonth(y, m));
}
export function monthKey(y: number, m: number): string {
  return `${y}-${pad2(m)}`;
}
export function monthKeyOf(iso: ISODate): string {
  return iso.slice(0, 7);
}
export function addDaysISO(iso: ISODate, days: number): ISODate {
  const p = parseISO(iso);
  const dt = new Date(p.y, p.m - 1, p.d + days);
  return toISODate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}
/** 两个 ISO 日期之间的整日差 */
export function diffDays(from: ISODate, to: ISODate): number {
  const a = parseISO(from);
  const b = parseISO(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}
/** 所在周的周日（每周从周日开始） */
export function weekStartOf(iso: ISODate): ISODate {
  const p = parseISO(iso);
  const wd = new Date(p.y, p.m - 1, p.d).getDay();
  return addDaysISO(iso, -wd);
}
/** 当月 1 日所在周的周日 */
export function firstWeekStartOfMonth(y: number, m: number): ISODate {
  return weekStartOf(toISODate(y, m, 1));
}

/* ---------------- 农历（Intl 中文农历，浏览器/WebView 原生 ICU） ---------------- */

const LUNAR_MONTH_NUM: Record<string, number> = {
  正: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
  七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 冬: 11, 腊: 12, 十二: 12,
};
const LUNAR_DAY = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

export interface LunarDate {
  year: number;
  month: number;
  day: number;
  isLeap: boolean;
  monthName: string;
}

let lunarFormatter: Intl.DateTimeFormat | null = null;
function getLunarFormatter(): Intl.DateTimeFormat | null {
  if (lunarFormatter) return lunarFormatter;
  try {
    lunarFormatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' });
  } catch {
    lunarFormatter = null;
  }
  return lunarFormatter;
}

export function solarToLunar(y: number, m: number, d: number): LunarDate {
  const fmt = getLunarFormatter();
  if (fmt) {
    try {
      const parts = fmt.formatToParts(new Date(y, m - 1, d));
      const rawMonth = parts.find((p) => p.type === 'month')?.value ?? '';
      const rawDay = Number(parts.find((p) => p.type === 'day')?.value ?? 0);
      const isLeap = rawMonth.startsWith('闰');
      const name = rawMonth.replace('闰', '').replace('月', '');
      return {
        year: y, month: LUNAR_MONTH_NUM[name] ?? 1, day: rawDay || 1,
        isLeap, monthName: `${isLeap ? '闰' : ''}${name}月`,
      };
    } catch {
      // 降级到公历显示
    }
  }
  return { year: y, month: m, day: d, isLeap: false, monthName: `${m}月` };
}

export function lunarDayName(ld: LunarDate): string {
  if (ld.day === 1) return ld.monthName;
  return LUNAR_DAY[ld.day - 1] ?? '';
}

/* ---------------- 二十四节气（21世纪公式） ---------------- */

const SOLAR_TERM_C = [
  6.11, 20.84, 4.6295, 19.4599, 6.3826, 21.4155, 5.59, 20.888,
  6.318, 21.86, 6.5, 21.19, 7.928, 23.65, 8.35, 23.95,
  8.44, 23.822, 9.098, 24.218, 8.218, 23.08, 7.9, 22.60,
];
const SOLAR_TERM_NAMES = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨',
  '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑',
  '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];
function solarTermDay(year: number, idx: number): number {
  const Y = year % 100;
  const L = Math.floor((Y - 1) / 4);
  return Math.floor(Y * 0.2422 + SOLAR_TERM_C[idx]) - L;
}
export function getSolarTerm(y: number, m: number, d: number): string | undefined {
  const i1 = (m - 1) * 2;
  const i2 = i1 + 1;
  if (d === solarTermDay(y, i1)) return SOLAR_TERM_NAMES[i1];
  if (d === solarTermDay(y, i2)) return SOLAR_TERM_NAMES[i2];
  return undefined;
}

/* ---------------- 节日（节日 > 节气 > 农历） ---------------- */

const SOLAR_FESTIVALS: Record<string, string> = {
  '01-01': '元旦', '02-14': '情人节', '03-08': '妇女节', '05-01': '劳动节',
  '06-01': '儿童节', '07-01': '建党节', '08-01': '建军节', '10-01': '国庆节', '12-25': '圣诞节',
};

function lunarFestival(ld: LunarDate): string | undefined {
  if (ld.isLeap) return undefined;
  const map: Record<string, string> = {
    '1-1': '春节', '1-15': '元宵节', '2-2': '龙抬头', '5-5': '端午节',
    '7-7': '七夕节', '7-15': '中元节', '8-15': '中秋节', '9-9': '重阳节',
    '12-8': '腊八节', '12-23': '小年',
  };
  return map[`${ld.month}-${ld.day}`];
}

export interface DayMeta {
  lunar: LunarDate;
  lunarDay: string;
  solarTerm?: string;
  festival?: string;
  /** 显示文本：节日 > 节气 > 农历日 */
  label: string;
  isFestival: boolean;
}

const META_CACHE = new Map<string, DayMeta>();

export function getDayMeta(y: number, m: number, d: number): DayMeta {
  const key = toISODate(y, m, d);
  const cached = META_CACHE.get(key);
  if (cached) return cached;
  const ld = solarToLunar(y, m, d);
  const lunarDay = lunarDayName(ld);
  const solarTerm = getSolarTerm(y, m, d);
  const festival = SOLAR_FESTIVALS[`${pad2(m)}-${pad2(d)}`] ?? lunarFestival(ld);
  const meta: DayMeta = {
    lunar: ld, lunarDay, solarTerm, festival,
    label: festival ?? solarTerm ?? lunarDay, isFestival: !!festival,
  };
  META_CACHE.set(key, meta);
  return meta;
}

/* ---------------- 滑动窗口数据 ---------------- */

export interface DayCell {
  date: ISODate;
  day: number;
  weekday: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  meta: DayMeta;
}

function makeCell(dt: Date, selected: ISODate, today: ISODate, refMonth?: string): DayCell {
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const d = dt.getDate();
  const date = toISODate(y, m, d);
  return {
    date, day: d, weekday: dt.getDay(),
    isCurrentMonth: refMonth ? date.slice(0, 7) === refMonth : true,
    isToday: date === today,
    isSelected: date === selected,
    meta: getDayMeta(y, m, d),
  };
}

/** 生成从周日 startISO 开始的一整周（7 格） */
export function buildWeekRow(
  startISO: ISODate, selected: ISODate, today: ISODate, refMonth?: string,
): DayCell[] {
  const p = parseISO(startISO);
  const cells: DayCell[] = [];
  for (let c = 0; c < 7; c += 1) {
    cells.push(makeCell(new Date(p.y, p.m - 1, p.d + c), selected, today, refMonth));
  }
  return cells;
}

/** 窄条横向窗口：从 startISO 起连续 count 天 */
export function buildStripDays(
  startISO: ISODate, count: number, selected: ISODate, today: ISODate,
): DayCell[] {
  const p = parseISO(startISO);
  const cells: DayCell[] = [];
  for (let c = 0; c < count; c += 1) {
    cells.push(makeCell(new Date(p.y, p.m - 1, p.d + c), selected, today, undefined));
  }
  return cells;
}

/* ---------------- 三形态动态视口几何 ---------------- */

export const BAR_H = 40;
export const WEEKDAY_H = 24;
export const HANDLE_H = 22;
export const CAL_OFFSET = BAR_H + WEEKDAY_H + HANDLE_H;
export const H_STRIP = 50;
export const SNAP_MS = 260;

export interface CalendarGeometry {
  /** 全屏扩展态日历视口高度 */
  H_FULL: number;
  /** 正常月历态日历视口高度（约 35% 屏高） */
  H_NORMAL: number;
  H_STRIP: number;
  BAR_H: number;
  WEEKDAY_H: number;
  HANDLE_H: number;
  CAL_OFFSET: number;
}

export function getGeometry(availH: number, vh: number): CalendarGeometry {
  const H_FULL = Math.max(240, Math.round(availH - CAL_OFFSET));
  const wanted = Math.round(vh * 0.35);
  const H_NORMAL = Math.min(H_FULL - 60, Math.max(H_STRIP + 110, wanted));
  return { H_FULL, H_NORMAL, H_STRIP, BAR_H, WEEKDAY_H, HANDLE_H, CAL_OFFSET };
}

export function clampHeight(h: number, g: CalendarGeometry): number {
  return Math.max(g.H_STRIP, Math.min(g.H_FULL, h));
}
/** 行高：≤H_NORMAL 恒为 6 等分；向上线性拉伸至全屏 6 等分 */
export function rowHeightFor(h: number, g: CalendarGeometry): number {
  const normalRow = g.H_NORMAL / 6;
  if (h <= g.H_NORMAL) return normalRow;
  const fullRow = g.H_FULL / 6;
  const t = (h - g.H_NORMAL) / Math.max(1, g.H_FULL - g.H_NORMAL);
  return normalRow + (fullRow - normalRow) * t;
}
/** 正常态到窄条态的吸顶折叠进度 0→1 */
export function collapseRatio(h: number, g: CalendarGeometry): number {
  if (h >= g.H_NORMAL) return 0;
  return Math.min(1, Math.max(0, (g.H_NORMAL - h) / (g.H_NORMAL - g.H_STRIP)));
}
/** 全屏态缩略胶囊透明度 0→1 */
export function capsuleOpacity(h: number, g: CalendarGeometry): number {
  if (h <= g.H_NORMAL) return 0;
  return Math.min(1, (h - g.H_NORMAL) / Math.max(1, g.H_FULL - g.H_NORMAL));
}
export function isStripHeight(h: number, g: CalendarGeometry): boolean {
  return h <= g.H_STRIP + 1;
}
/** 松手后按速度与距离吸附到最近锚点（仅用于高度形态切换，滚动禁用吸附） */
export function snapHeight(h: number, vel: number, g: CalendarGeometry): number {
  const anchors = [g.H_STRIP, g.H_NORMAL, g.H_FULL];
  if (vel < -0.25) {
    const lower = anchors.filter((a) => a < h);
    if (lower.length) return Math.max(...lower);
  } else if (vel > 0.25) {
    const upper = anchors.filter((a) => a > h);
    if (upper.length) return Math.min(...upper);
  }
  return anchors.reduce((best, a) => (Math.abs(a - h) < Math.abs(best - h) ? a : best), g.H_NORMAL);
}
