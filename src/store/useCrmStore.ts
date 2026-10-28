/**
 * FishCRM 全局状态库（组件唯一数据入口）
 *
 * 铁律：组件严禁直接读写存储，必须经由本 store 调用 dbService。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { dbService } from '@/services/dbService'
import type { PersonFilter, RecordFilter, AiApplyOutcome, GraphData } from '@/services/dbService'
import type {
  AiParsedResult,
  CalendarDaySummary,
  CrmRecord,
  Person,
  RecordSource,
  RelationEdge,
} from '@/types/schema'

export const useCrmStore = defineStore('crm', () => {
  // ---------- 响应式状态 ----------
  const initialized = ref(false)
  const persons = ref<Person[]>([])
  const records = ref<CrmRecord[]>([])
  const relations = ref<RelationEdge[]>([])

  // ---------- 派生状态 ----------
  const activePersons = computed(() => persons.value.filter((p) => p.status === 'active'))
  const cutoffPersons = computed(() => persons.value.filter((p) => p.status === 'cutoff'))
  const deceasedPersons = computed(() => persons.value.filter((p) => p.status === 'deceased'))
  const giftRecords = computed(() => records.value.filter((r) => r.type === 'gift'))
  const ledgerRecords = computed(() => records.value.filter((r) => r.type === 'ledger'))
  const ideaRecords = computed(() => records.value.filter((r) => r.type === 'idea'))

  // ---------- 内部方法 ----------
  function refreshAll(): void {
    persons.value = dbService.getPersonsByFilter({})
    records.value = dbService.getRecordsByFilter({})
    relations.value = dbService.getGraphData().edges
  }

  // ---------- 生命周期 ----------
  function init(): void {
    dbService.init()
    refreshAll()
    initialized.value = true
  }

  // ---------- 人物操作 ----------
  function getPersonsByFilter(filter: PersonFilter): Person[] {
    return dbService.getPersonsByFilter(filter)
  }

  function upsertPerson(person: Partial<Person> & { name: string }): Person {
    const saved = dbService.upsertPerson(person)
    refreshAll()
    return saved
  }

  function deletePerson(id: string): void {
    dbService.deletePerson(id)
    refreshAll()
  }

  // ---------- 流水操作 ----------
  function getRecordsByFilter(filter: RecordFilter): CrmRecord[] {
    return dbService.getRecordsByFilter(filter)
  }

  function addRecord(record: Omit<CrmRecord, 'id' | 'createdAt' | 'personName'> & { personName?: string }): CrmRecord {
    const saved = dbService.addRecord(record)
    refreshAll()
    return saved
  }

  function deleteRecord(id: string): void {
    dbService.deleteRecord(id)
    refreshAll()
  }

  // ---------- 聚合查询（只读透传） ----------
  function getSkillsMap(): Record<string, Person[]> {
    return dbService.getSkillsMap()
  }

  function getCalendarSummary(yearMonth: string): CalendarDaySummary[] {
    return dbService.getCalendarSummary(yearMonth)
  }

  function getGraphData(): GraphData {
    return dbService.getGraphData()
  }

  function upsertRelation(edge: Partial<RelationEdge> & { sourcePersonId: string; targetPersonId: string }): RelationEdge {
    const saved = dbService.upsertRelation(edge)
    refreshAll()
    return saved
  }

  function deleteRelation(id: string): void {
    dbService.deleteRelation(id)
    refreshAll()
  }

  // ---------- AI 识别落库 ----------
  function applyAiParsedResult(result: AiParsedResult, rawText: string, source: RecordSource): AiApplyOutcome {
    const outcome = dbService.applyAiParsedResult(result, rawText, source)
    refreshAll()
    return outcome
  }

  // ---------- 数据互通 ----------
  function exportAllToJson(): string {
    return dbService.exportAllToJson()
  }

  function importFromJson(json: string): void {
    dbService.importFromJson(json)
    refreshAll()
  }

  function exportRecordsToCsv(filter: RecordFilter = {}): string {
    return dbService.exportRecordsToCsv(filter)
  }

  return {
    // state
    initialized,
    persons,
    records,
    relations,
    // getters
    activePersons,
    cutoffPersons,
    deceasedPersons,
    giftRecords,
    ledgerRecords,
    ideaRecords,
    // actions
    init,
    getPersonsByFilter,
    upsertPerson,
    deletePerson,
    getRecordsByFilter,
    addRecord,
    deleteRecord,
    getSkillsMap,
    getCalendarSummary,
    getGraphData,
    upsertRelation,
    deleteRelation,
    applyAiParsedResult,
    exportAllToJson,
    importFromJson,
    exportRecordsToCsv,
  }
})
