// 任务 3.7 — 投影通道注错缝 host 半身(env-seam family;SC3 降级腿的
// 注错开关)。
//
// Authorities: tasks/3.7-sc3-deviation-degrade-e2e.md(Hard Rule「故障注入
// 只经测试通道」+ Implementation Notes「e2e 环境变量/mock channel 错误码
// 开关,就近既有 e2e 注入先例」)、migration/faults-stub.ts(env 缝族先例:
// TEST-ONLY、控制文件随调用重读、未设置 → 生产行为不变)。
//
// 契约:env `DSH_FORGE_PROJECTION_FAULTS` 携控制文件路径;`channel:
// 'unavailable'` = 内核 relayPresence 探测恒假(投影通道故障 → plan 不投递
// → 重试一次后 degraded ERR_PROJECTION_CHANNEL_UNAVAILABLE,plan 保留)。
// 控制文件每次探测重读 —— e2e 降级腿中途写故障、恢复腿 clear() 后重试,
// launch 期快照会让重试既不可注错也不可恢复。畸形/异型字段永不注错。

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PROJECTION_FAULTS_ENV,
  createProjectionFaultsResolver,
  readProjectionFaultsFile,
} from '../src/main/workbench/projection/faults-stub.ts'

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-projfaults-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, retryDelay: 250, maxRetries: 10 })
})

describe('projection channel faults env seam (faults-stub)', () => {
  it('env unset / blank → the resolver answers undefined (seam off; production bytes untouched)', () => {
    expect(createProjectionFaultsResolver({})()).toBeUndefined()
    expect(createProjectionFaultsResolver({ [PROJECTION_FAULTS_ENV]: '' })()).toBeUndefined()
    expect(createProjectionFaultsResolver({ [PROJECTION_FAULTS_ENV]: '   ' })()).toBeUndefined()
  })

  it('resolves the control file and re-reads it on EVERY probe (degrade/recover journey contract)', () => {
    const control = join(makeScratch(), 'control.json')
    const resolve = createProjectionFaultsResolver({ [PROJECTION_FAULTS_ENV]: control })

    writeFileSync(control, JSON.stringify({ channel: 'unavailable' }))
    expect(resolve()).toEqual({ channel: 'unavailable' })

    // The recovery leg's clear step: rewrite mid-journey takes effect on the
    // next probe — no relaunch needed.
    writeFileSync(control, JSON.stringify({}))
    expect(resolve()).toBeUndefined()

    rmSync(control, { force: true })
    expect(resolve()).toBeUndefined()
  })

  it('malformed / non-object / wrong-typed control content never faults', () => {
    const dir = makeScratch()
    const control = join(dir, 'control.json')
    const env = { [PROJECTION_FAULTS_ENV]: control }
    writeFileSync(control, '{not json')
    expect(readProjectionFaultsFile(control)).toBeUndefined()
    writeFileSync(control, JSON.stringify(['channel']))
    expect(readProjectionFaultsFile(control)).toBeUndefined()
    // channel 只收字面 'unavailable';其余(含未列举动词错误码形态)静默丢弃。
    writeFileSync(control, JSON.stringify({ channel: 'kaboom' }))
    expect(readProjectionFaultsFile(control)).toBeUndefined()
    writeFileSync(control, JSON.stringify({ channel: 42, opError: { code: 'x' } }))
    expect(readProjectionFaultsFile(control)).toBeUndefined()
    // absent / unreadable beyond malformed → inert, never fatal.
    expect(readProjectionFaultsFile(join(dir, 'missing.json'))).toBeUndefined()
    expect(createProjectionFaultsResolver(env)()).toBeUndefined()
  })
})
