// self-anchors 单测（forge-dirs-unification §2.4/§2.6——三运行时事实自装配）：
// forgeHome = resolveForgeHome 单点（patch 下发 > tasksHome dirname > dshHomePath 服务现查 >
// 降级 ~/.dsh/forge + 「dshHomePath 缺席」warn）；workspaceRoot 经注入缝；projectRoot 取
// resolveProjectKey 归拢的项目主检出（registryQuery 注入免 git）。
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canonicalizePath, projectKeyOf, resolveProjectKey } from '@dsh-forge/lib-path'
import { createSelfAnchorsOf, resolveForgeHome } from './self-anchors.js'

describe('resolveForgeHome（forge 根四级解析单点）', () => {
  const warn = (messages: string[]) => (message: string): void => {
    messages.push(message)
  }

  it('patch 下发 forgeHome 直取；tasksHome 在场 = dirname 派生（{DSH_HOME}/forge/projects → {DSH_HOME}/forge）', () => {
    expect(resolveForgeHome({ forgeHome: 'X:\\dsh\\forge' })).toBe('X:\\dsh\\forge')
    expect(resolveForgeHome({ tasksHome: 'X:\\dsh\\forge\\projects' })).toBe('X:\\dsh\\forge')
    expect(resolveForgeHome({ forgeHome: 'X:\\a', tasksHome: 'X:\\b\\projects' })).toBe('X:\\a') // 下发优先
  })

  it('下发力双缺 = 官方 dshHomePath 服务现查承接（dshHomePath("forge") 结果）', () => {
    expect(resolveForgeHome({ dshHomePathOf: () => 'Y:\\svc-home\\forge' })).toBe('Y:\\svc-home\\forge')
  })

  it('全缺 = 降级 ~/.dsh/forge + 含「dshHomePath 缺席」字样的 warn（经注入诊断面）', () => {
    const messages: string[] = []
    const root = resolveForgeHome({}, warn(messages))
    expect(root.endsWith('.dsh\\forge') || root.endsWith('.dsh/forge')).toBe(true)
    expect(messages.some((m) => m.includes('dshHomePath 缺席'))).toBe(true)
  })

  it('空串/空白注入 = 未注入（trim 判空）', () => {
    expect(resolveForgeHome({ forgeHome: '  ', dshHomePathOf: () => 'Y:\\f' })).toBe('Y:\\f')
  })
})

describe('createSelfAnchorsOf（ForgeDirSources 自装配派生链）', () => {
  const depsOf = (wsPath: string | null, forgeHome: string, registryQuery?: (cwd: string) => string | undefined) => ({
    wsPathOf: async () => wsPath,
    forgeHome,
    ...(registryQuery !== undefined ? { registryQuery } : {}),
  })

  it('dshHome = forgeHome dirname（forge.home = join(dshHome,"forge") 恒等 forgeHome）；workspaceRoot = wsPath', async () => {
    const anchors = await createSelfAnchorsOf(depsOf('Z:\\ws\\demo', 'X:\\dsh\\forge'))('p-1')
    expect(anchors.dshHome).toBe('X:\\dsh')
    expect(anchors.workspaceRoot).toBe('Z:\\ws\\demo')
  })

  it('projectRoot = resolveProjectKey 归拢主检出（registryQuery 命中即采信——规范化后路径）', async () => {
    const anchors = await createSelfAnchorsOf(depsOf('Z:\\ws\\wt-branch', 'X:\\dsh\\forge', () => 'Z:\\ws\\proj-main'))('p-1')
    expect(anchors.projectRoot).toBe('Z:\\ws\\proj-main')
  })

  it('未归拢分支 projectRoot 也经规范化（bug 55ab9a8f——与磁盘大小写不同的 wsPath，projectKeyOf(projectRoot) = resolveProjectKey 的 key）', async () => {
    const real = canonicalizePath(await mkdtemp(join(tmpdir(), 'self-anchors-')))
    // 构造与磁盘拼写不同的工作区路径（首段字母翻转大小写——不落 .forge/worktrees 标记 = 未归拢分支）
    const cased = real.replace(/([a-z])/, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
    expect(canonicalizePath(cased)).toBe(real)
    const anchors = await createSelfAnchorsOf(depsOf(cased, 'X:\\dsh\\forge'))('p-1')
    expect(anchors.projectRoot).toBe(real)
    expect(projectKeyOf(anchors.projectRoot)).toBe(resolveProjectKey(cased, { registryQuery: () => undefined }).key)
  })

  it('workspaceRoot 缺席 / 空串 = fail-loud（错误说明缺少项目主检出——与 task-loop 措辞一致）', async () => {
    await expect(createSelfAnchorsOf(depsOf(null, 'X:\\f'))('p-x')).rejects.toThrow(/workspace root unavailable/)
    await expect(createSelfAnchorsOf(depsOf('', 'X:\\f'))('p-x')).rejects.toThrow(/workspace root unavailable/)
    await expect(createSelfAnchorsOf(depsOf(null, 'X:\\f'))('p-x')).rejects.toThrow(/缺少项目主检出/)
    await expect(createSelfAnchorsOf(depsOf('', 'X:\\f'))('p-x')).rejects.toThrow(/缺少项目主检出/)
  })
})
