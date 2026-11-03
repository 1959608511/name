<script setup lang="ts">
/** 工作台 · 通讯录窗口（人情往来逐条展示 / 当日新建联系人兜底 / 全部切换） */
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

/** 当前展示的人情列表（全部模式倒序 / 当日模式） */
const favorRows = computed<FavorRow[]>(() =>
  store.contactScope === 'all' ? store.allFavors : dayFavors.value,
);

const isAll = computed(() => store.contactScope === 'all');

/** 当日建档的联系人：即使没有任何人情往来，也必须在通讯录小模块立即可见 */
const dayContacts = computed<ContactPerson[]>(() =>
  store.contacts.filter((c) => contactDateOf(c) === props.selectedDate),
);

/** 全部模式兜底：没有任何人情记录的联系人（保证新建联系人 100% 可见） */
const bareContacts = computed<ContactPerson[]>(() =>
  store.contacts.filter((c) => !c.favors.length),
);

const contactRows = computed<ContactPerson[]>(() => (isAll.value ? bareContacts.value : dayContacts.value));
const hasAny = computed(() => favorRows.value.length > 0 || contactRows.value.length > 0);

const meta = computed(() => {
  const count = favorRows.value.length;
  if (!count && !contactRows.value.length) return '';
  return count ? `${count} 条` : `${contactRows.value.length} 人`;
});

function openFavor(row: FavorRow): void {
  store.openFavorPanel(row.contactId, row.favor.id);
}
function addFavor(): void {
  store.openFavorPanel();
}
function addFavorFor(contactId: string): void {
  store.openFavorPanel(contactId);
}
function editContact(id: string): void {
  emit('edit', id);
}
function toggleScope(): void {
  store.setContactScope(isAll.value ? 'day' : 'all');
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
      <button class="cw-btn cw-btn-indigo" type="button" @click="emit('create')">新增/修改联系人</button>
      <button class="cw-btn cw-btn-amber" type="button" @click="addFavor">人情往来添加</button>
      <button
        class="cw-btn"
        :class="{ 'cw-btn-on': isAll }"
        type="button"
        @click="toggleScope"
      >全部</button>
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
          <span v-if="isAll" class="cw-sub">{{ row.favor.date }}</span>
        </span>
      </button>
    </template>

    <!-- 联系人条目：当日新建必显 / 全部模式为无往来记录者兜底 -->
    <div v-if="contactRows.length" class="cw-contacts">
      <p class="cw-sect">{{ isAll ? '无往来记录联系人' : '当日新建联系人' }}</p>
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
      {{ isAll ? '还没有任何联系人' : '这天还没有人情往来记录，点右上角「新增/修改联系人」建档' }}
    </p>
  </WorkspaceCard>
</template>

<style scoped>
/* 右上角胶囊按钮：紧凑尺寸，适配标题栏 36px 高度 */
.cw-btn {
  border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b;
  font-size: 10px; line-height: 1.4; padding: 3px 6px; border-radius: 999px;
  flex-shrink: 0; white-space: nowrap; -webkit-tap-highlight-color: transparent;
}
.cw-btn-indigo { background: #eef2ff; color: #4f46e5; border-color: #e0e7ff; }
.cw-btn-amber { background: #fffbeb; color: #d97706; border-color: #fde68a; }
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
