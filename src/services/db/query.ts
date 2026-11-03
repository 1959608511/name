/**
 * FishCRM v2.0 聚合查询层（纯函数，数据由调用方注入）
 */
import type { ContactPerson, DayCapsule, DaySummary, ISODate, V2Database } from '../../types/schema';

/** 历史标签去重聚合（供输入框下拉候选） */
export function collectHistoryTags(contacts: ContactPerson[]): string[] {
  const set = new Set<string>();
  for (const c of contacts) {
    for (const t of c.tags) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
}

/**
 * 按日聚合字典：构建一次 O(n)，之后按 date 取值 O(1)。
 * 传入 month ('YYYY-MM') 时只统计该月。
 */
export function getDaySummaryMap(data: V2Database, month?: string): Record<ISODate, DaySummary> {
  const map: Record<ISODate, DaySummary> = {};
  const capsuleSet: Record<string, DayCapsule[]> = {};
  const inScope = (d: ISODate): boolean => !month || d.startsWith(month);
  const ensure = (d: ISODate): DaySummary => {
    let s = map[d];
    if (!s) {
      s = { date: d, undoneTodosCount: 0, netAmount: 0, hasDiary: false, capsules: [] };
      map[d] = s;
    }
    return s;
  };
  const pushCapsule = (d: ISODate, capsule: DayCapsule): void => {
    const list = capsuleSet[d] ?? (capsuleSet[d] = []);
    list.push(capsule);
  };

  for (const item of data.ledger) {
    if (!inScope(item.date)) continue;
    const s = ensure(item.date);
    if (item.category === 'income') s.netAmount += item.amount;
    else if (item.category === 'expense') s.netAmount -= item.amount;
  }
  for (const todo of data.todos) {
    if (!inScope(todo.date)) continue;
    const s = ensure(todo.date);
    if (!todo.done) {
      s.undoneTodosCount += 1;
      pushCapsule(todo.date, { text: `⚡ ${todo.text}`, tone: 'todo' });
    }
  }
  for (const diary of data.diaries) {
    if (!inScope(diary.date)) continue;
    ensure(diary.date).hasDiary = true;
    pushCapsule(diary.date, { text: '📝 日记', tone: 'diary' });
  }
  for (const c of data.contacts) {
    for (const f of c.favors) {
      if (!inScope(f.date)) continue;
      ensure(f.date);
      pushCapsule(f.date, { text: `🎁 ${f.title}`, tone: 'favor' });
    }
  }

  for (const s of Object.values(map)) {
    const ledgerCapsule: DayCapsule[] = s.netAmount === 0
      ? []
      : [{ text: `${s.netAmount > 0 ? '+' : ''}${s.netAmount}`, tone: s.netAmount > 0 ? 'income' : 'expense' }];
    s.capsules = [...ledgerCapsule, ...(capsuleSet[s.date] ?? [])];
  }
  return map;
}
