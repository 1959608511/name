﻿﻿﻿﻿﻿﻿﻿/**
 * FishCRM v2.0 数据导入导出与重置
 */
import type { ContactPerson, LedgerCategory, LedgerItem, V2Database } from '../../types/schema';
import { KEYS, loadAll, readList, todayStr, uid, writeList } from './core';
import { ensureSeed } from './seed';

export function exportJSON(): string {
  return JSON.stringify(loadAll(), null, 2);
}

export function importJSON(json: string): boolean {
  try {
    const raw: unknown = JSON.parse(json);
    if (typeof raw !== 'object' || raw === null) return false;
    const obj = raw as Record<string, unknown>;
    const keys: Array<keyof V2Database> = ['contacts', 'ledger', 'diaries', 'todos', 'relations'];
    if (!keys.every((k) => Array.isArray(obj[k]))) return false;
    const db = obj as unknown as V2Database;
    writeList(KEYS.contacts, db.contacts);
    writeList(KEYS.ledger, db.ledger);
    writeList(KEYS.diaries, db.diaries);
    writeList(KEYS.todos, db.todos);
    writeList(KEYS.relations, db.relations);
    localStorage.setItem(KEYS.seeded, '1');
    return true;
  } catch {
    return false;
  }
}

function csvEscape(v: string | number | undefined): string {
  const s = v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function categoryLabel(c: LedgerCategory): string {
  if (c === 'expense') return '支出';
  if (c === 'income') return '收入';
  return '其他(借还)';
}

/** 导出账目 CSV（带 BOM，Excel 直接可读） */
export function exportLedgerCSV(): string {
  const rows = loadAll().ledger.map((i) =>
    [i.date, categoryLabel(i.category), i.amount, i.contactName ?? '', i.remark, i.tempNote ?? '']
      .map(csvEscape).join(','));
  return `\uFEFF日期,类别,金额,联系人,备注,临时备注\n${rows.join('\n')}`;
}

/** 导出通讯录 CSV（含人情往来条数） */
export function exportContactsCSV(): string {
  const rows = loadAll().contacts.map((c) =>
    [c.name, c.aliases.join('/'), c.phone, c.birthday, c.tags.join('/'), c.favors.length, c.note]
      .map(csvEscape).join(','));
  return `\uFEFF姓名,别名,电话,生日,标签,人情条数,备注\n${rows.join('\n')}`;
}

/* ---------------- CSV 导入 ---------------- */

export interface CsvImportResult {
  added: number;
  skipped: number; // 重复或格式不符
}

/** 通用 CSV 解析：支持引号包裹、双引号转义、CRLF，自动去 BOM */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i += 1; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 导入账本 CSV（与 exportLedgerCSV 同构）：追加式，按 日期+类别+金额+备注 去重 */
export function importLedgerCSV(text: string): CsvImportResult {
  const rows = parseCSV(text);
  const startIdx = DATE_RE.test(rows[0]?.[0]?.trim() ?? '') ? 0 : 1; // 自动识别表头
  const list = readList<LedgerItem>(KEYS.ledger);
  const seen = new Set(list.map((i) => `${i.date}|${i.category}|${i.amount}|${i.remark}`));
  let added = 0;
  let skipped = 0;
  for (const r of rows.slice(startIdx)) {
    const [dateRaw, labelRaw, amountRaw, contactNameRaw, remarkRaw, tempNoteRaw] = r.map((c) => c.trim());
    const date = dateRaw ?? '';
    const category: LedgerCategory | null =
      labelRaw === '支出' ? 'expense' : labelRaw === '收入' ? 'income' : labelRaw === '其他(借还)' ? 'other' : null;
    const amount = Number(amountRaw);
    if (!DATE_RE.test(date) || category === null || !(amount > 0)) { skipped += 1; continue; }
    const remark = remarkRaw ?? '';
    const key = `${date}|${category}|${amount}|${remark}`;
    if (seen.has(key)) { skipped += 1; continue; }
    seen.add(key);
    list.push({
      id: uid(), date, category, amount,
      contactName: contactNameRaw || undefined,
      remark,
      tempNote: tempNoteRaw || undefined,
      createdAt: Date.now(),
    });
    added += 1;
  }
  writeList(KEYS.ledger, list);
  return { added, skipped };
}

/** 导入通讯录 CSV（与 exportContactsCSV 同构）：追加式，按姓名去重，人情条数列仅展示不参与导入 */
export function importContactsCSV(text: string): CsvImportResult {
  const rows = parseCSV(text);
  const startIdx = rows[0]?.[0]?.trim() === '姓名' ? 1 : 0;
  const list = readList<ContactPerson>(KEYS.contacts);
  const seen = new Set(list.map((c) => c.name));
  let added = 0;
  let skipped = 0;
  const now = Date.now();
  const today = todayStr();
  for (const r of rows.slice(startIdx)) {
    const [nameRaw, aliasesRaw, phoneRaw, birthdayRaw, tagsRaw, , noteRaw] = r.map((c) => c.trim());
    const name = nameRaw ?? '';
    if (!name || seen.has(name)) { skipped += 1; continue; }
    seen.add(name);
    list.push({
      id: uid(),
      name,
      aliases: (aliasesRaw ?? '').split('/').filter(Boolean),
      phone: phoneRaw ?? '',
      birthday: birthdayRaw ?? '',
      tags: (tagsRaw ?? '').split('/').filter(Boolean),
      favors: [],
      note: noteRaw ?? '',
      createdAt: now,
      createdDate: today,
    });
    added += 1;
  }
  writeList(KEYS.contacts, list);
  return { added, skipped };
}

export function clearAllData(): void {
  for (const k of Object.values(KEYS)) localStorage.removeItem(k);
}

/** 清空缓存并重建演示数据 */
export function resetDemoData(): void {
  clearAllData();
  ensureSeed();
}
