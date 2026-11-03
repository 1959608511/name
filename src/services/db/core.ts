/**
 * FishCRM v2.0 本地存储唯一读写层
 * 统一使用 fishcrm_v2_ 前缀读写 localStorage，与旧版本彻底隔离。
 */
import type {
  ContactPerson,
  DiaryItem,
  FavorRecord,
  ISODate,
  LedgerItem,
  RelationEdge,
  TodoItem,
  V2Database,
} from '../../types/schema';
import { ensureSeed } from './seed';

const PREFIX = 'fishcrm_v2_';

export const KEYS = {
  contacts: `${PREFIX}contacts`,
  ledger: `${PREFIX}ledger`,
  diaries: `${PREFIX}diaries`,
  todos: `${PREFIX}todos`,
  relations: `${PREFIX}relations`,
  seeded: `${PREFIX}seeded`,
} as const;

/* ---------------- 基础工具 ---------------- */

export function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayStr(): ISODate {
  return toISODate(new Date());
}

/** 联系人建档归属日期：优先用显式 createdDate，否则由 createdAt 时间戳换算 */
export function contactDateOf(c: ContactPerson): ISODate {
  return c.createdDate ?? toISODate(new Date(c.createdAt));
}

/* ---------------- 基础读写 ---------------- */

export function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function writeList<T>(key: string, list: T[]): void {
  localStorage.setItem(key, JSON.stringify(list));
}

export function loadAll(): V2Database {
  ensureSeed();
  return {
    contacts: readList<ContactPerson>(KEYS.contacts),
    ledger: readList<LedgerItem>(KEYS.ledger),
    diaries: readList<DiaryItem>(KEYS.diaries),
    todos: readList<TodoItem>(KEYS.todos),
    relations: readList<RelationEdge>(KEYS.relations),
  };
}

export function saveLedger(list: LedgerItem[]): void { writeList(KEYS.ledger, list); }
export function saveDiaries(list: DiaryItem[]): void { writeList(KEYS.diaries, list); }
export function saveTodos(list: TodoItem[]): void { writeList(KEYS.todos, list); }
export function saveRelations(list: RelationEdge[]): void { writeList(KEYS.relations, list); }

/* ---------------- CRUD ---------------- */

function upsert<T extends { id: string }>(key: string, item: T): T[] {
  const list = readList<T>(key);
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) list[idx] = item;
  else list.push(item);
  writeList(key, list);
  return list;
}

function removeById<T extends { id: string }>(key: string, id: string): T[] {
  const list = readList<T>(key).filter((x) => x.id !== id);
  writeList(key, list);
  return list;
}

export const upsertContact = (c: ContactPerson): ContactPerson[] => upsert(KEYS.contacts, c);
export const removeContact = (id: string): ContactPerson[] => removeById(KEYS.contacts, id);
export const upsertLedger = (i: LedgerItem): LedgerItem[] => upsert(KEYS.ledger, i);
export const removeLedger = (id: string): LedgerItem[] => removeById(KEYS.ledger, id);
export const upsertDiary = (d: DiaryItem): DiaryItem[] => upsert(KEYS.diaries, d);
export const removeDiary = (id: string): DiaryItem[] => removeById(KEYS.diaries, id);
export const upsertTodo = (t: TodoItem): TodoItem[] => upsert(KEYS.todos, t);
export const removeTodo = (id: string): TodoItem[] => removeById(KEYS.todos, id);
export const upsertRelation = (r: RelationEdge): RelationEdge[] => upsert(KEYS.relations, r);
export const removeRelation = (id: string): RelationEdge[] => removeById(KEYS.relations, id);

/** 在指定联系人名下新增/更新一条人情往来 */
export function upsertFavor(contactId: string, favor: FavorRecord): ContactPerson[] {
  const list = readList<ContactPerson>(KEYS.contacts);
  const c = list.find((x) => x.id === contactId);
  if (c) {
    const idx = c.favors.findIndex((f) => f.id === favor.id);
    if (idx >= 0) c.favors[idx] = favor;
    else c.favors.push(favor);
    writeList(KEYS.contacts, list);
  }
  return list;
}

export function removeFavor(contactId: string, favorId: string): ContactPerson[] {
  const list = readList<ContactPerson>(KEYS.contacts);
  const c = list.find((x) => x.id === contactId);
  if (c) {
    c.favors = c.favors.filter((f) => f.id !== favorId);
    writeList(KEYS.contacts, list);
  }
  return list;
}

/** 人情往来历史标签去重聚合（供 FavorSheet 标签候选胶囊） */
export function collectFavorTags(contacts: ContactPerson[]): string[] {
  const set = new Set<string>();
  for (const c of contacts) {
    for (const f of c.favors) {
      if (f.tag) set.add(f.tag);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
}
