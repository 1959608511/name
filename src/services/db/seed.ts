/**
 * FishCRM v2.0 演示数据种子（仅开发环境执行）
 */
import type {
  ContactPerson, DiaryItem, LedgerItem, RelationEdge, TodoItem, V2Database,
} from '../../types/schema';
import { KEYS, pad2, toISODate, uid, writeList } from './core';

/** 开发环境标记（生产构建不注入演示数据） */
const IS_DEV = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;

/** 相对今天偏移 days 天（演示数据用，保证「今日」永远有数据） */
function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** 本月第 day 天（自动钳制到当月天数） */
function thisMonthDay(day: number): string {
  const now = new Date();
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(Math.min(day, dim))}`;
}

/* ---------------- 精美中文演示数据 ---------------- */

function buildDemoData(): V2Database {
  const t0 = dayOffset(0);
  const now = Date.now();
  const H = 3600000;
  const D = 24 * H;
  const contacts: ContactPerson[] = [
    {
      id: 'c_wangfang', name: '王芳', aliases: ['老妈', '妈妈'], phone: '138****2601',
      birthday: '1968-03-12', tags: ['家人', '直系亲属'],
      favors: [
        { id: uid(), date: thisMonthDay(1), title: '国庆红包', amount: 666, direction: 'out', note: '过节心意' },
        { id: uid(), date: dayOffset(-4), title: '收到土特产', amount: 0, direction: 'in', note: '老家寄来的腊肉' },
      ],
      note: '每周日固定通电话', createdAt: now - 40 * D,
    },
    {
      id: 'c_liqiang', name: '李强', aliases: ['强子'], phone: '139****7788',
      birthday: '1996-07-08', tags: ['发小', '球友'],
      favors: [{ id: uid(), date: dayOffset(-9), title: '结婚随礼', amount: 1000, direction: 'out', note: '婚礼现场给的' }],
      note: '借了钱给他周转，记得跟进', createdAt: now - 90 * D,
    },
    {
      id: 'c_chensi', name: '陈思', aliases: ['思思'], phone: '137****4520',
      birthday: '1994-11-26', tags: ['同事', '饭搭子'],
      favors: [{ id: uid(), date: dayOffset(-6), title: '下午茶回请', amount: 58, direction: 'in', note: '她抢的单' }],
      note: '工位在我斜对面，前端组', createdAt: now - 200 * D,
    },
    {
      id: 'c_zhoujie', name: '周杰', aliases: ['表哥'], phone: '150****9012',
      birthday: '1990-01-30', tags: ['家人', '亲戚'], favors: [],
      note: '做建材生意，人脉广', createdAt: now - 300 * D,
    },
    {
      id: 'c_linyue', name: '林悦', aliases: ['悦悦'], phone: '186****3345',
      birthday: '1997-09-14', tags: ['闺蜜', '同事'],
      favors: [{ id: uid(), date: t0, title: '生日提前送礼物', amount: 299, direction: 'out', note: '香薰礼盒' }],
      note: '生日快到了，准备惊喜', createdAt: now - 150 * D,
    },
  ];
  const ledger: LedgerItem[] = [
    { id: uid(), date: t0, category: 'expense', amount: 38.5, remark: '午餐轻食沙拉', createdAt: now - 1 * H },
    { id: uid(), date: t0, category: 'other', amount: 500, contactId: 'c_liqiang', contactName: '李强', remark: '李强还第一笔借款', tempNote: '还剩 1500 未还', createdAt: now - 2 * H },
    { id: uid(), date: dayOffset(-2), category: 'expense', amount: 126, contactId: 'c_chensi', contactName: '陈思', remark: '和陈思聚餐 AA', createdAt: now - 2 * D },
    { id: uid(), date: dayOffset(-5), category: 'expense', amount: 299, contactId: 'c_linyue', contactName: '林悦', remark: '给林悦买生日礼物', createdAt: now - 5 * D },
    { id: uid(), date: thisMonthDay(10), category: 'income', amount: 15600, remark: '本月工资到账', createdAt: now - 20 * D },
    { id: uid(), date: dayOffset(-12), category: 'other', amount: 2000, contactId: 'c_liqiang', contactName: '李强', remark: '借给李强周转', tempNote: '说好月底还', createdAt: now - 12 * D },
    { id: uid(), date: dayOffset(-15), category: 'expense', amount: 68, remark: '地铁月卡充值', createdAt: now - 15 * D },
    { id: uid(), date: dayOffset(-18), category: 'income', amount: 800, remark: '闲置相机卖出', createdAt: now - 18 * D },
  ];
  const diaries: DiaryItem[] = [
    {
      id: 'd_today', date: t0,
      content: '今天把 FishCRM v2.0 的骨架立起来了。晚上和林悦通了电话，她生日快到了。李强还了 500，剩下的月底前应该能结清。',
      createdAt: now - 3 * H,
    },
    {
      id: 'd_review', date: dayOffset(-7),
      content: '霜降过后天一下子冷了。这周工作节奏很稳，周末约了李强打球，顺便问问还款的事。',
      createdAt: now - 7 * D,
    },
  ];
  const todos: TodoItem[] = [
    { id: uid(), date: t0, text: '给妈妈打周日问候电话', done: false, isImportant: true, createdAt: now - 5 * H },
    { id: uid(), date: t0, text: '整理本月账单并归档', done: false, diaryId: 'd_today', createdAt: now - 4 * H },
    { id: uid(), date: t0, text: '回复林悦生日聚会时间', done: true, diaryId: 'd_today', createdAt: now - 3 * H },
    { id: uid(), date: dayOffset(1), text: '提醒李强剩余 1500 还款', done: false, createdAt: now - 2 * H },
    { id: uid(), date: dayOffset(-7), text: '买保暖内衣', done: true, diaryId: 'd_review', createdAt: now - 7 * D },
  ];
  const relations: RelationEdge[] = [
    { id: uid(), sourceId: 'c_liqiang', targetId: 'c_wangfang', label: '见过家长', weight: 2 },
    { id: uid(), sourceId: 'c_chensi', targetId: 'c_linyue', label: '同事', weight: 3 },
    { id: uid(), sourceId: 'c_zhoujie', targetId: 'c_wangfang', label: '亲戚', weight: 2 },
    { id: uid(), sourceId: 'c_liqiang', targetId: 'c_linyue', label: '球友介绍认识', weight: 1 },
  ];
  return { contacts, ledger, diaries, todos, relations };
}

/* ---------------- 初始化 ---------------- */

export function ensureSeed(): void {
  if (!IS_DEV) return;
  if (localStorage.getItem(KEYS.seeded)) return;
  const demo = buildDemoData();
  writeList(KEYS.contacts, demo.contacts);
  writeList(KEYS.ledger, demo.ledger);
  writeList(KEYS.diaries, demo.diaries);
  writeList(KEYS.todos, demo.todos);
  writeList(KEYS.relations, demo.relations);
  localStorage.setItem(KEYS.seeded, '1');
}
