// DirFactsPort provider 单测（plugin-project 1.12——seam 表 forge.dirFacts 契约实现）：
// 常驻 provider（合并注册表全量键）与最小兜底 provider（仅内置 dirKeys、零第三方 merge）
// 行为逐项同构，键源差异单面；查询/目的地解析/审计/提示段四动词契约形状即证。
import { describe, expect, it } from 'vitest'
import { DIR_KEY_REGISTRY, DIR_DESTINATIONS, type DirKeyEntry } from './anchors.js'
import { createDirFactsPort, minimalDirFactsPort } from './dir-facts.js'

const ANCHORS = {
  projectHome: 'D:\\ws\\tasks-home',
  taskHome: 'D:\\ws\\tasks-home\\Z-proj-demo@deadbeef',
  forgeDir: 'Z:\\proj\\demo\\.forge',
}

const thirdParty: DirKeyEntry = {
  dirKey: 'knowledge.root',
  description: '工作区知识库根（.knowledge/）',
  resolve: (ctx) => `${ctx.forgeDir ?? ''}\\.knowledge`,
  declaredBy: 'knowledge',
}

function depsOf(keys: readonly DirKeyEntry[]) {
  return {
    anchorsOf: async () => ANCHORS,
    dirKeys: () => keys,
  }
}

describe('DirFactsPort provider（forge.dirFacts seam——常驻 + 最小兜底）', () => {
  it('常驻 provider：合并键源全量锚清单（内置五键在前 + 第三方键追加）', async () => {
    const port = createDirFactsPort(depsOf([...DIR_KEY_REGISTRY, thirdParty]))
    const anchors = await port.listAnchors('p-1')
    expect(anchors.map((a) => a.dirKey)).toEqual([...DIR_KEY_REGISTRY.map((e) => e.dirKey), 'knowledge.root'])
    expect(anchors.every((a) => a.dir.length > 0 && a.description.length > 0)).toBe(true)
  })

  it('最小兜底 provider：仅内置 dirKeys（第三方键零出现），行为与常驻同构', async () => {
    const port = minimalDirFactsPort({ anchorsOf: async () => ANCHORS })
    const anchors = await port.listAnchors('p-1')
    expect(anchors.map((a) => a.dirKey)).toEqual(DIR_KEY_REGISTRY.map((e) => e.dirKey))
    // 单键查询 + 未知键 typed 拒绝列法集
    expect((await port.listAnchors('p-1', 'forge.tmp'))[0]?.dir).toBe('Z:\\proj\\demo\\.forge\\tmp')
    await expect(port.listAnchors('p-1', 'knowledge.root')).rejects.toThrow(/legal keys/)
  })

  it('resolveDestination 受控枚举 + 未知 dest 拒绝；audit / docStyleSection 契约动词在场', async () => {
    const port = createDirFactsPort(depsOf(DIR_KEY_REGISTRY))
    expect(await port.resolveDestination('p-1', 'taskLogs', { slug: 's', localId: '1.1' })).toBe(
      'D:\\ws\\tasks-home\\Z-proj-demo@deadbeef\\logs\\s\\1.1',
    )
    await expect(port.resolveDestination('p-1', 'unknown', {})).rejects.toThrow(/legal destinations/)
    expect(DIR_DESTINATIONS.length).toBeGreaterThan(0)
    const diff = port.audit('Z:\\proj\\demo')
    expect(diff).toHaveProperty('missingPartitions')
    expect(port.docStyleSection()).toContain('文档风格公约')
    expect(port.docStyleSection()).toContain('.forge/adr/')
  })
})
