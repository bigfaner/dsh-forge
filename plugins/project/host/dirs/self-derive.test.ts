// self-derive 单测（1.32②——单装态 deriveTaskStoreDir 兜底：两级根解析（config.tasksHome >
// forge 根派生 {forgeHome}/projects——env/home 分支已删）+ lib-path 单源算法 + 碰撞三态收口
//（suspected-move typed 拒绝 / 在册消歧放行——core verb 同语义镜像））。
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deriveTaskStoreDir } from '@dsh-forge/lib-path'
import { createSelfDeriveOf } from './self-derive.js'

describe('createSelfDeriveOf（单装态派生动词插件自链兜底）', () => {
  it('config.tasksHome 首优先；dir = lib-path 单源同值（{tasksHome}/{flatten}@{hash8}）', async () => {
    const derive = createSelfDeriveOf({ tasksHome: 'T:\\tasks', forgeHome: 'D:\\dsh\\forge' })
    const ws = join(mkdtempSync(join(tmpdir(), 'sd-')), 'proj')
    mkdirSync(ws)
    const result = await derive(ws)
    expect(result.dir).toBe(deriveTaskStoreDir('T:\\tasks', ws))
  })

  it('config 缺席 → forge 根派生 {forgeHome}/projects（env DSH_FORGE_TASKS_HOME 分支已删）', async () => {
    const ws = join(mkdtempSync(join(tmpdir(), 'sd-')), 'proj')
    mkdirSync(ws)
    const viaForge = await createSelfDeriveOf({ forgeHome: 'D:\\dsh\\forge' })(ws)
    expect(viaForge.dir.startsWith('D:\\dsh\\forge\\projects\\')).toBe(true)
    expect(viaForge.dir).toBe(deriveTaskStoreDir('D:\\dsh\\forge\\projects', ws))
  })

  it('tasksHome 与 forge 根双缺 = fail-loud 普通错误（配置缺口非用户态错误——core verb 同径不扩 typed 面）', async () => {
    const derive = createSelfDeriveOf({})
    await expect(derive('Z:\\ws\\demo')).rejects.toThrow(/tasksHome 未注入/)
  })

  it('suspected-move 消歧：existingDir 恰为在册项目任务库 = 放行返回 dir（core registeredStoreDirs 同语义）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sd-root-'))
    const real = join(mkdtempSync(join(tmpdir(), 'sd-')), 'proj')
    mkdirSync(real)
    // 在册项目 = 同目录的正斜杠拼写变体（同 flatten 主体异 hash8）——其任务库目录 = 孤儿形态
    const foreignWs = real.replaceAll('\\', '/')
    mkdirSync(join(root, deriveTaskStoreDir(root, foreignWs).split(/[\\/]/).pop()!))
    const result = await createSelfDeriveOf({ tasksHome: root, registeredWsPaths: () => [foreignWs] })(real)
    expect(result.dir).toBe(deriveTaskStoreDir(root, real))
  })

  it('suspected-move 消歧反面：孤儿不在册（registeredWsPaths 空集）→ ERR_SUSPECTED_MOVE 仍拒绝（data 三元透传）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sd-root-'))
    const real = join(mkdtempSync(join(tmpdir(), 'sd-')), 'proj')
    mkdirSync(real)
    const dirName = deriveTaskStoreDir(root, real).split(/[\\/]/).pop()!
    const orphan = dirName.slice(0, -8) + (dirName.endsWith('0') ? '11111111' : '00000000')
    mkdirSync(join(root, orphan))
    const err: unknown = await createSelfDeriveOf({ tasksHome: root })(real).catch((e) => e)
    expect((err as { code?: string }).code).toBe('ERR_SUSPECTED_MOVE')
    expect((err as { data?: { existingDir?: string } }).data?.existingDir).toContain(orphan)
    await expect(createSelfDeriveOf({ tasksHome: root, registeredWsPaths: () => [] })(real)).rejects.toMatchObject({
      code: 'ERR_SUSPECTED_MOVE',
    })
  })

  it('推导目录已存在且推导==既有（present 态）→ 幂等复用候选放行返回 dir（core fix 同径）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sd-root-'))
    const real = join(mkdtempSync(join(tmpdir(), 'sd-')), 'proj')
    mkdirSync(real)
    mkdirSync(deriveTaskStoreDir(root, real))
    const result = await createSelfDeriveOf({ tasksHome: root })(real)
    expect(result.dir).toBe(deriveTaskStoreDir(root, real))
  })
})
