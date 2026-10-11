// S4 · 长内容落盘单测（run-tasks-host-command 1.3——AC4）：logs/<slug>/<taskKey>/<序号>-
// <事件类型>/ 目录形状（decisions #24/#26）、error.log/settlement.json/triage.md 内聚、
// 自增序号、fail-soft 降级（容器目录缺席/写失败 = undefined 不抛）。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { createIncidentStore, incidentRelPathOf } from './incident-log.js'
import type { IncidentInput } from './incident-log.js'

let home: string | undefined

afterEach(() => {
  if (home !== undefined) {
    rmSync(home, { recursive: true, force: true })
    home = undefined
  }
})

function storeWith(containerDir?: string) {
  return createIncidentStore({ resolveContainerDir: () => containerDir })
}

function blocked(input: Partial<IncidentInput> = {}): IncidentInput {
  return {
    projectId: 'p-1',
    sourceSlug: 'm2-pipeline',
    taskKey: '3.1',
    eventType: 'blocked',
    error: '测试挂起——完整原因全文\n第二行细节',
    settlement: { outcome: 'blocked', reason: '测试挂起' },
    triage: '# 处置记录\n\n- 已自动创建修复任务 fix-2',
    ...input,
  }
}

describe('S4 · 事件子文件夹落盘（AC4）', () => {
  it('生成 logs/<slug>/<taskKey>/001-blocked/ 且三件内聚', () => {
    home = mkdtempSync(join(tmpdir(), 'forge-notify-incident-'))
    const path = storeWith(home).record(blocked())
    expect(path).toBe('logs/m2-pipeline/3.1/001-blocked/')

    const dir = join(home, 'logs', 'm2-pipeline', '3.1', '001-blocked')
    expect(existsSync(dir)).toBe(true)
    expect(readFileSync(join(dir, 'error.log'), 'utf8')).toContain('完整原因全文')
    expect(JSON.parse(readFileSync(join(dir, 'settlement.json'), 'utf8'))).toEqual({
      outcome: 'blocked',
      reason: '测试挂起',
    })
    expect(readFileSync(join(dir, 'triage.md'), 'utf8')).toContain('fix-2')
  })

  it('同任务多次问题自增序号且事件类型后缀自明', () => {
    home = mkdtempSync(join(tmpdir(), 'forge-notify-incident-'))
    const store = storeWith(home)
    expect(store.record(blocked())).toBe('logs/m2-pipeline/3.1/001-blocked/')
    expect(store.record(blocked({ eventType: 'worker-aborted', error: '第二次问题' }))).toBe(
      'logs/m2-pipeline/3.1/002-worker-aborted/',
    )
    expect(readdirSync(join(home, 'logs', 'm2-pipeline', '3.1'))).toEqual(['001-blocked', '002-worker-aborted'])
  })

  it('既有序号被外部占用时取 max+1', () => {
    home = mkdtempSync(join(tmpdir(), 'forge-notify-incident-'))
    const taskDir = join(home, 'logs', 'm2-pipeline', '3.1')
    mkdirSync(taskDir, { recursive: true })
    writeFileSync(join(taskDir, '007-spawn-failed'), '', 'utf8')
    expect(storeWith(home).record(blocked())).toBe('logs/m2-pipeline/3.1/008-blocked/')
  })

  it('内容缺席的件不写文件', () => {
    home = mkdtempSync(join(tmpdir(), 'forge-notify-incident-'))
    const path = storeWith(home).record(blocked({ settlement: undefined, triage: undefined }))
    expect(path).toBe('logs/m2-pipeline/3.1/001-blocked/')
    const dir = join(home, 'logs', 'm2-pipeline', '3.1', '001-blocked')
    expect(readdirSync(dir)).toEqual(['error.log'])
  })
})

describe('S4 · 解析缝（1.11 装配接线收口——projectId→容器目录反向解析载体）', () => {
  it('projectId+sourceSlug 透传解析器；解析器回值决定落位目录', () => {
    home = mkdtempSync(join(tmpdir(), 'forge-notify-incident-'))
    const seen: { projectId: string | undefined; sourceSlug: string }[] = []
    const store = createIncidentStore({
      resolveContainerDir: (projectId, sourceSlug) => {
        seen.push({ projectId, sourceSlug })
        return projectId === 'p-1' ? home : undefined
      },
    })
    expect(store.record(blocked())).toBe('logs/m2-pipeline/3.1/001-blocked/')
    expect(existsSync(join(home, 'logs', 'm2-pipeline', '3.1', '001-blocked'))).toBe(true)
    // 未注册项目（解析 undefined）= 不落盘 fail-soft
    expect(store.record(blocked({ projectId: 'p-unknown' }))).toBeUndefined()
    expect(seen).toEqual([
      { projectId: 'p-1', sourceSlug: 'm2-pipeline' },
      { projectId: 'p-unknown', sourceSlug: 'm2-pipeline' },
    ])
  })
})

describe('S4 · 落盘 fail-soft 降级（AC4）', () => {
  it('容器目录缺席 = undefined 不抛', () => {
    expect(storeWith(undefined).record(blocked())).toBeUndefined()
    expect(storeWith('').record(blocked())).toBeUndefined()
  })

  it('文件面故障 = undefined 不抛（只读目录冒充文件路径）', () => {
    home = mkdtempSync(join(tmpdir(), 'forge-notify-incident-'))
    // 容器目录下预置同名文件占位——logs/m2-pipeline/3.1 建目录必败
    writeFileSync(join(home, 'logs'), 'not a dir', 'utf8')
    expect(storeWith(home).record(blocked())).toBeUndefined()
  })

  it('畸形 slug/taskKey 防御性拒绝', () => {
    home = mkdtempSync(join(tmpdir(), 'forge-notify-incident-'))
    expect(storeWith(home).record(blocked({ sourceSlug: '///' }))).toBeUndefined()
    expect(storeWith(home).record(blocked({ taskKey: '。' }))).toBeUndefined()
  })
})

describe('S4 · 路径形状', () => {
  it('相对路径正斜杠、logs 同根（decisions #26）、尾带斜杠', () => {
    expect(incidentRelPathOf('m2-pipeline', '3.1', '001-blocked')).toBe('logs/m2-pipeline/3.1/001-blocked/')
  })
})
