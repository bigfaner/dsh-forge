// self-anchors 单测（forge-dirs-unification §2.4/§2.6——三运行时事实自装配）：
// forgeHome = resolveForgeHome 单点（patch 下发 > tasksHome dirname > dshHomePath 服务现查 >
// 降级 ~/.dsh/forge + 「dshHomePath 缺席」warn）；workspaceRoot 经注入缝；projectRoot 取
// resolveProjectKey 归拢的项目主检出（registryQuery 注入免 git）。
import { describe, expect, it } from 'vitest'
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

  it('workspaceRoot 缺席 / 空串 = fail-loud（调用方按行 fail-soft 收口——锚缺口不静默）', async () => {
    await expect(createSelfAnchorsOf(depsOf(null, 'X:\\f'))('p-x')).rejects.toThrow(/workspace root unavailable/)
    await expect(createSelfAnchorsOf(depsOf('', 'X:\\f'))('p-x')).rejects.toThrow(/workspace root unavailable/)
  })
})
