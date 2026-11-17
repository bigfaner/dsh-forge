// self-derive 单测（1.32②——单装态 deriveTaskStoreDir 兜底：三级根解析 + lib-path 单源算法
// + 碰撞三态收口（suspected-move typed 拒绝 / 在册消歧放行——core verb 同语义镜像））。
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deriveTaskStoreDir } from '@dsh-forge/lib-path'
import { createSelfDeriveOf } from './self-derive.js'

describe('createSelfDeriveOf（单装态派生动词插件自链兜底）', () => {
  it('config.tasksHome 首优先；dir = lib-path 单源同值（{tasksHome}/{flatten}@{hash8}）', async () => {
    const derive = createSelfDeriveOf({ tasksHome: 'T:\\tasks', home: 'D:\\home', env: { DSH_FORGE_TASKS_HOME: 'X:\\env' } })
    const ws = join(mkdtempSync(join(tmpdir(), 'sd-')), 'proj')
    mkdirSync(ws)
    const result = await derive(ws)
    expect(result.dir).toBe(deriveTaskStoreDir('T:\\tasks', ws))
  })

  it('config 缺席 → env DSH_FORGE_TASKS_HOME；env 缺席 → 宿主 home 约定 {home}/forge-workspaces', async () => {
    const ws = join(mkdtempSync(join(tmpdir(), 'sd-')), 'proj')
    mkdirSync(ws)
    const viaEnv = await createSelfDeriveOf({ env: { DSH_FORGE_TASKS_HOME: 'X:\\env' } })(ws)
    expect(viaEnv.dir.startsWith('X:\\env\\')).toBe(true)
    const viaHome = await createSelfDeriveOf({ home: 'D:\\dsh-home' })(ws)
    expect(viaHome.dir.startsWith('D:\\dsh-home\\forge-workspaces\\')).toBe(true)
    expect(viaHome.dir).toBe(deriveTaskStoreDir('D:\\dsh-home\\forge-workspaces', ws))
  })

  it('三级双缺 = fail-loud 普通错误（配置缺口非用户态错误——core verb 同径不扩 typed 面）', async () => {
    const derive = createSelfDeriveOf({})
    await expect(derive('Z:\\ws\\demo')).rejects.toThrow(/tasksHome 未注入/)
  })

  it('同扁平化主体异 hash8 孤儿目录在场 → ERR_SUSPECTED_MOVE typed 拒绝（data 三元透传）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sd-root-'))
    const real = join(mkdtempSync(join(tmpdir(), 'sd-')), 'proj')
    mkdirSync(real)
    // 构造同主体异 hash8 孤儿：真实目录派生名 + 尾 hash 改一位（仍 8 hex 合法形态）
    const dirName = deriveTaskStoreDir(root, real).split(/[\\/]/).pop()!
    const orphan = dirName.slice(0, -8) + (dirName.endsWith('0') ? '11111111' : '00000000')
    mkdirSync(join(root, orphan))
    const err: unknown = await createSelfDeriveOf({ tasksHome: root })(real).catch((e) => e)
    expect((err as { code?: string }).code).toBe('ERR_SUSPECTED_MOVE')
    expect((err as { data?: { existingDir?: string } }).data?.existingDir).toContain(orphan)
  })

  /** 同路径正斜杠拼写变体（flatten 同主体、hash8 异——canonicalize 后仍拼写敏感，§6-34 有意设计） */
  const fwdSlashOf = (p: string): string => p.replaceAll('\\', '/')

  it('suspected-move 消歧：existingDir 恰为在册项目任务库 = 放行返回 dir（core registeredStoreDirs 同语义）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sd-root-'))
    const real = join(mkdtempSync(join(tmpdir(), 'sd-')), 'proj')
    mkdirSync(real)
    // 在册项目 = 同目录的正斜杠拼写变体（同 flatten 主体异 hash8）——其任务库目录 = 孤儿形态
    const foreignWs = fwdSlashOf(real)
    mkdirSync(join(root, deriveTaskStoreDir(root, foreignWs).split(/[\\/]/).pop()!))
    const result = await createSelfDeriveOf({ tasksHome: root, registeredWsPaths: () => [foreignWs] })(real)
    expect(result.dir).toBe(deriveTaskStoreDir(root, real))
  })

  it('suspected-move 消歧反面：孤儿不在册（registeredWsPaths 空集）→ ERR_SUSPECTED_MOVE 仍拒绝', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sd-root-'))
    const real = join(mkdtempSync(join(tmpdir(), 'sd-')), 'proj')
    mkdirSync(real)
    mkdirSync(join(root, deriveTaskStoreDir(root, fwdSlashOf(real)).split(/[\\/]/).pop()!))
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
