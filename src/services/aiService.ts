/**
 * FishCRM v2.0 AI 解析引擎（本地正则兜底版）
 * 将自然语言 / 无障碍抓屏文本解析为 v2.0 模型并落库。
 */
import type { AiParsedEntry, ISODate, LedgerCategory } from '../types/schema';
import { loadAll, saveDiaries, saveLedger, saveTodos, todayStr, uid } from './dbService';

const AMOUNT_RE = /(\d+(?:\.\d+)?)\s*(?:元|块|￥|¥)?/;
const CAPTURE_PREFIX_RE = /^\[\s*Y\s*:\s*\d+\s*,\s*X\s*:\s*\d+\s*\]\s*/;
const TODO_RE = /(待办|记得|别忘了|提醒我|要做)/;
const LEDGER_RE = /(花|买|吃|喝|付|缴|充|收入|工资|借|还|收|赚|报销|退款|账)/;

function detectCategory(text: string): LedgerCategory {
  if (/(借给|借出|借入|还给|还款|还钱|借款)/.test(text)) return 'other';
  if (/(收入|工资|到账|赚了|收到|报销|退款)/.test(text)) return 'income';
  return 'expense';
}

/** 解析一句自然语言，产出结构化条目 */
export function parseNaturalLanguage(raw: string, baseDate?: ISODate): AiParsedEntry {
  const text = raw.trim();
  const date = baseDate ?? todayStr();
  const amountMatch = text.match(AMOUNT_RE);
  const amount = amountMatch ? Math.abs(Number(amountMatch[1])) : undefined;
  if (TODO_RE.test(text)) {
    return { kind: 'todo', date, text };
  }
  if (amount !== undefined && LEDGER_RE.test(text)) {
    return { kind: 'ledger', date, category: detectCategory(text), amount, text };
  }
  return { kind: 'diary', date, text };
}

/** 把解析结果落库，返回是否成功写入 */
export function persistEntry(entry: AiParsedEntry): boolean {
  if (!entry.text) return false;
  const db = loadAll();
  if (entry.kind === 'ledger' && entry.amount !== undefined && entry.category) {
    db.ledger.push({
      id: uid(), date: entry.date, category: entry.category, amount: entry.amount,
      remark: entry.text, createdAt: Date.now(),
    });
    saveLedger(db.ledger);
    return true;
  }
  if (entry.kind === 'todo') {
    db.todos.push({ id: uid(), date: entry.date, text: entry.text, done: false, createdAt: Date.now() });
    saveTodos(db.todos);
    return true;
  }
  if (entry.kind === 'diary') {
    const existing = db.diaries.find((d) => d.date === entry.date);
    if (existing) {
      existing.content = existing.content ? `${existing.content}\n${entry.text}` : entry.text;
    } else {
      db.diaries.push({ id: uid(), date: entry.date, content: entry.text, createdAt: Date.now() });
    }
    saveDiaries(db.diaries);
    return true;
  }
  return false;
}

/** 一句话入口：解析并落库，返回结构化结果（unknown 不落库） */
export function quickAdd(raw: string, baseDate?: ISODate): AiParsedEntry {
  const entry = parseNaturalLanguage(raw, baseDate);
  persistEntry(entry);
  return entry;
}

/**
 * 处理抓屏文本队列：清洗 [Y:top, X:left] 坐标前缀 → 去重 → 解析 → 落库。
 * 抓屏场景只落账目/待办，避免屏幕噪声灌进日记。返回入库条数。
 */
export function ingestCaptureLines(lines: string[]): number {
  let saved = 0;
  const seen = new Set<string>();
  for (const rawLine of lines) {
    const line = rawLine.replace(CAPTURE_PREFIX_RE, '').trim();
    if (line.length < 4 || seen.has(line)) continue;
    seen.add(line);
    const entry = parseNaturalLanguage(line);
    if (entry.kind !== 'diary' && persistEntry(entry)) saved += 1;
  }
  return saved;
}
