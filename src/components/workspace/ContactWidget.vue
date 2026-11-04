<script setup lang="ts">
/** 工作台 · 通讯录窗口（联系人 / 人情往来 / 当日三态切换，+ 添加智能分流） */
import { computed } from 'vue';
import type { ContactPerson, FavorRecord, ISODate } from '../../types/schema';
import { useCrmStore } from '../../store/useCrmStore';
import { contactDateOf } from '../../services/dbService';
import WorkspaceCard from '../WorkspaceCard.vue';

const props = defineProps<{ selectedDate: ISODate }>();
const emit = defineEmits<{
  (e: 'create'): void;
  (e: 'edit', id: string): void;
}>();

const store = useCrmStore();

interface FavorRow {
  favor: FavorRecord;
  contactId: string;
  contactName: string;
}

const isContacts = computed(() => store.contactScope === 'contacts');
const isFavors = computed(() => store.contactScope === 'favors');

/** 当日人情往来 */
const dayFavors = computed<FavorRow[]>(() => {
  const rows: FavorRow[] = [];
  for (const c of store.contacts) {
    for (const f of c.favors) {
      if (f.date === props.selectedDate) {
        rows.push({ favor: f, contactId: c.id, contactName: c.name });
      }
    }
  }
  return rows;
});

/** 当前展示的人情列表（人情往来模式全量倒序 / 当日模式） */
const favorRows = computed<FavorRow[]>(() => (isFavors.value ? store.allFavors : dayFavors.value));

/** 当日建档的联系人：即使没有任何人情往来，也必须在通讯录小模块立即可见 */
const dayContacts = computed<ContactPerson[]>(() =>
  store.contacts.filter((c) => contactDateOf(c) === props.selectedDate),
);

/** 当前展示的联系人（联系人模式全量 / 当日模式） */
const contactRows = computed<ContactPerson[]>(() => (isContacts.value ? store.contacts : dayContacts.value));
const hasAny = computed(() => favorRows.value.length > 0 || contactRows.value.length > 0);

const meta = computed(() => {
  if (isContacts.value) return contactRows.value.length ? `${contactRows.value.length} 人` : '';
  if (isFavors.value) return favorRows.value.length ? `${favorRows.value.length} 条` : '';
  const count = favorRows.value.length;
  if (!count && !contactRows.value.length) return '';
  return count ? `${count} 条` : `${contactRows.value.length} 人`;
});

function openFavor(row: FavorRow): void {
  store.openFavorPanel(row.contactId, row.favor.id);
}
function addFavorFor(contactId: string): void {
  store.openFavorPanel(contactId);
}
function editContact(id: string): void {
  emit('edit', id);
}
/** 切换「联系人」全量视图：仅显示全部联系人列表，再次点击恢复当日 */
function toggleContacts(): void {
  store.setContactScope(isContacts.value ? 'day' : 'contacts');
}
/** 切换「人情往来」全量视图：仅显示全部人情往来记录，再次点击恢复当日 */
function toggleFavors(): void {
  store.setContactScope(isFavors.value ? 'day' : 'favors');
}
/** + 添加：人情往来视图默认新建人情，否则新建联系人 */
function onAdd(): void {
  if (isFavors.value) store.openFavorPanel();
  else emit('create');
}
</script>

<template>
  <WorkspaceCard
    title="通讯录"
    emoji="👥"
    :meta="meta"
  >
    <!-- 三个紧凑胶囊按钮直接位于标题栏右上角，与「通讯录」同一行靠右对齐 -->
    <template #actions>
      <button
        class="cw-btn cw-btn-indigo"
        :class="{ 'cw-btn-on': isContacts }"
        type="button"
        @click="toggleContacts"
      >联系人</button>
      <button
        class="cw-btn cw-btn-amber"
        :class="{ 'cw-btn-on': isFavors }"
        type="button"
        @click="toggleFavors"
      >人情往来</button>
      <button class="cw-btn cw-btn-create" type="button" @click="onAdd">+ 添加</button>
    </template>

    <template v-if="favorRows.length">
      <button
        v-for="row in favorRows"
        :key="`${row.contactId}_${row.favor.id}`"
        class="cw-row"
        type="button"
        @click="openFavor(row)"
      >
        <span class="cw-emoji">🎁</span>
        <span class="cw-main">
          <span class="cw-title">
            {{ row.contactName }} · {{ row.favor.title }}
            <span v-if="row.favor.tag" class="cw-tag">{{ row.favor.tag }}</span>
          </span>
          <span v-if="isFavors" class="cw-sub">{{ row.favor.date }}</span>
        </span>
      </button>
    </template>

    <!-- 联系人条目：当日新建必显 / 联系人模式为全量列表 -->
    <div v-if="contactRows.length" class="cw-contacts">
      <p class="cw-sect">{{ isContacts ? '全部联系人' : '当日新建联系人' }}</p>
      <div v-for="c in contactRows" :key="c.id" class="cw-contact">
        <button class="cw-contact-main" type="button" @click="editContact(c.id)">
          <span class="cw-emoji">👤</span>
          <span class="cw-main">
            <span class="cw-title">
              {{ c.name }}
              <span v-for="t in c.tags" :key="t" class="cw-tag">{{ t }}</span>
            </span>
            <span class="cw-sub">{{ contactDateOf(c) }}<template v-if="c.phone"> · {{ c.phone }}</template></span>
          </span>
        </button>
        <div class="cw-ops">
          <button class="cw-mini" type="button" @click="addFavorFor(c.id)">+记人情</button>
          <button class="cw-mini" type="button" @click="editContact(c.id)">编辑</button>
        </div>
      </div>
    </div>

    <p v-if="!hasAny" class="cw-empty">
      {{ isFavors ? '还没有任何人情往来记录，点右上角「+ 添加」记一笔' : isContacts ? '还没有任何联系人，点右上角「+ 添加」建档' : '这天还没有人情往来记录，点右上角「+ 添加」建档' }}
    </p>
  </WorkspaceCard>
</template>

<style scoped>
/* 右上角胶囊按钮：紧凑尺寸，适配标题栏 36px 高度 */
.cw-btn {
  border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b;
  font-size: 10px; line-height: 1.4; padding: 3px 6px; border-radius: 999px;
  flex-shrink: 0; white-space: nowrap; -webkit-tap-highlight-color: transparent;
  transition: all 0.2s ease;
}
.cw-btn:active { transform: scale(0.95); }
.cw-btn-indigo { background: #eef2ff; color: #4f46e5; border-color: #e0e7ff; }
.cw-btn-amber { background: #fffbeb; color: #d97706; border-color: #fde68a; }
.cw-btn-create { background: #f8fafc; color: #334155; border-color: #e2e8f0; }
.cw-btn-on { background: #4f46e5; color: #fff; border-color: #4f46e5; }

.cw-row {
  width: 100%; display: flex; align-items: center; gap: 7px; padding: 5px 4px;
  border: 0; background: transparent; text-align: left; border-radius: 8px;
  -webkit-tap-highlight-color: transparent;
}
.cw-row:active { background: #f1f5f9; }
.cw-emoji { font-size: 13px; flex-shrink: 0; }
.cw-main { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.cw-title {
  font-size: 12px; color: #1e293b;
  display: flex; align-items: center; gap: 6px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cw-tag {
  font-size: 10px; color: #7c3aed; background: #f5f3ff;
  border-radius: 999px; padding: 1px 7px; flex-shrink: 0;
}
.cw-sub { font-size: 10px; color: #94a3b8; }
.cw-empty { font-size: 11px; color: #b6c2d2; padding: 8px 4px; }

.cw-contacts { border-top: 1px dashed #f1f5f9; margin-top: 4px; padding-top: 4px; }
.cw-sect { font-size: 10px; color: #a8b6c8; padding: 2px 4px 4px; }
.cw-contact { display: flex; align-items: center; gap: 4px; }
.cw-contact-main {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px;
  padding: 5px 4px; border: 0; background: transparent; text-align: left;
  border-radius: 8px; -webkit-tap-highlight-color: transparent;
}
.cw-contact-main:active { background: #f1f5f9; }
.cw-ops { display: flex; gap: 3px; flex-shrink: 0; padding-right: 2px; }
.cw-mini {
  border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b;
  font-size: 10px; padding: 2px 6px; border-radius: 999px; flex-shrink: 0;
  white-space: nowrap; -webkit-tap-highlight-color: transparent;
}
.cw-mini:active { background: #eef2ff; color: #4f46e5; }
</style>
