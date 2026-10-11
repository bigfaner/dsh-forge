// notify · 长内容落盘（S4 纯模块；decisions #24 再补充/#26）。一个任务一个文件夹、
// 一次问题事件一个子文件夹：`logs/<slug>/<taskKey>/<序号>-<事件类型>/`（如 001-blocked/、
// 002-worker-aborted/——自增序号+事件类型后缀自明）。同一事件的 error.log（原因/错误全文）/
// settlement.json（结算载荷）/triage.md（处置记录）内聚，多轮问题互不混档；多模态可扩展。
// 路径与既有容器事件流同根同维度（#26——{容器目录}/logs/ 下与 logs/<slug>.jsonl 并存，
// 零新增中间层；FORGE_LOGS_DIR 单源复用）。叙述面只携带本面返回的事件子文件夹相对路径
// （正斜杠、尾带斜杠——notification-samples.md 详情行口径）；分级呈现三档 = 叙述摘要 /
// 事件子文件夹（人/agent 按需读）/ 裁决问询全文。
// fail-soft：容器目录缺席/文件面故障 = 返回 undefined 不抛（叙述照发、详情行省略）。
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FORGE_LOGS_DIR } from '../events/log-listener.js'

/** 事件子文件夹内聚文件名（同一事件三件套） */
export const INCIDENT_ERROR_FILE = 'error.log'
export const INCIDENT_SETTLEMENT_FILE = 'settlement.json'
export const INCIDENT_TRIAGE_FILE = 'triage.md'

/** 事件内容（缺席的件不写文件） */
export interface IncidentContent {
  /** error.log——原因/错误全文（叙述面仅摘要的全文落点，decisions #24） */
  readonly error?: string
  /** settlement.json——结算载荷原样 */
  readonly settlement?: unknown
  /** triage.md——处置记录（问询附文同源材料） */
  readonly triage?: string
}

/** 一次问题事件（record 入参） */
export interface IncidentInput extends IncidentContent {
  /** 任务源 slug（路径第二段——logs/<slug>/） */
  readonly sourceSlug: string
  /** 任务键（localId 口径——如「3.1」；slug 维度已由上级目录分解，样例口径） */
  readonly taskKey: string
  /** 事件类型后缀（blocked / worker-aborted / spawn-failed …） */
  readonly eventType: string
}

/** 事件子文件夹仓（narrator 经此落盘；循环驱动器亦可直用） */
export interface IncidentStore {
  /** 落盘并返回事件子文件夹相对路径（正斜杠、尾带斜杠）；fail-soft 失败 = undefined */
  record(input: IncidentInput): string | undefined
}

/** 事件仓依赖（容器库目录解析闭包——与事件日志监听器同源装配方注入） */
export interface IncidentStoreDeps {
  /** 任务源 slug → 容器库目录（{tasksHome}/{flatten}@{hash8}）；undefined = 不落盘 */
  resolveContainerDir(sourceSlug: string): string | undefined
}

/** 路径段净化（slug/taskKey/事件类型限定 [A-Za-z0-9._-]，其余折叠为连字符） */
export function sanitizeIncidentSegment(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
}

/** 子文件夹名（三位自增序号 + 事件类型后缀——001-blocked） */
export function incidentDirNameOf(seq: number, eventType: string): string {
  const suffix = sanitizeIncidentSegment(eventType)
  return `${String(seq).padStart(3, '0')}-${suffix === '' ? 'event' : suffix}`
}

/** 事件子文件夹相对路径（叙述详情行口径——logs/<slug>/<taskKey>/<dir>/，正斜杠） */
export function incidentRelPathOf(sourceSlug: string, taskKey: string, dirName: string): string {
  return `${FORGE_LOGS_DIR}/${sourceSlug}/${taskKey}/${dirName}/`
}

/** 既有序号扫描（目录缺席 = 从 1 起；取 max+1——外部残渣序号也让位） */
function nextIncidentSeq(taskDir: string): number {
  let entries: readonly string[]
  try {
    entries = readdirSync(taskDir)
  } catch {
    return 1
  }
  let max = 0
  for (const name of entries) {
    const match = /^(\d{3})-/.exec(name)
    if (match !== null) max = Math.max(max, Number.parseInt(match[1] ?? '0', 10))
  }
  return max + 1
}

/** 建事件子文件夹仓（唯写者；全链 fail-soft——落盘缺席不拖垮叙述/循环） */
export function createIncidentStore(deps: IncidentStoreDeps): IncidentStore {
  return {
    record(input: IncidentInput): string | undefined {
      try {
        const containerDir = deps.resolveContainerDir(input.sourceSlug)
        if (containerDir === undefined || containerDir === '') return undefined
        const slug = sanitizeIncidentSegment(input.sourceSlug)
        const taskKey = sanitizeIncidentSegment(input.taskKey)
        if (slug === '' || taskKey === '') return undefined
        const taskDir = join(containerDir, FORGE_LOGS_DIR, slug, taskKey)
        const dirName = incidentDirNameOf(nextIncidentSeq(taskDir), input.eventType)
        const dir = join(taskDir, dirName)
        mkdirSync(dir, { recursive: true })
        if (input.error !== undefined) writeFileSync(join(dir, INCIDENT_ERROR_FILE), input.error, 'utf8')
        if (input.settlement !== undefined) {
          writeFileSync(join(dir, INCIDENT_SETTLEMENT_FILE), `${JSON.stringify(input.settlement, null, 2)}\n`, 'utf8')
        }
        if (input.triage !== undefined) writeFileSync(join(dir, INCIDENT_TRIAGE_FILE), input.triage, 'utf8')
        return incidentRelPathOf(slug, taskKey, dirName)
      } catch {
        return undefined
      }
    },
  }
}
