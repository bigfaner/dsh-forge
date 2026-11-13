// forge remote descriptor 表单测（plugin-project 1.38——client $mount 贡献新增面）：
// ① 表 pin（六族 namespace/方法集与 host 半 marker 表成对——wire 名 = host JS 形参名单源）；
// ② gateway client 安装契约（requireStrictInputs——参数 codec mode:'strict' 全量强制；
//    exportName 别名 descriptor 携 implementation；stream 方法 mode:'stream'）；
// ③ codec 诚实性（strict codec create() 返回结构校验 schema——违规载荷抛错）。
import { describe, expect, it } from 'vitest'
import { FORGE_REMOTE_CONTRIBUTION, FORGE_REMOTE_DESCRIPTORS } from './remote.js'

describe('FORGE_REMOTE_DESCRIPTORS 表 pin（六族——与 host 半 typert-remotes.ts marker 表成对）', () => {
  const byNamespace = (ns: string): string[] =>
    FORGE_REMOTE_DESCRIPTORS.filter((d) => d.namespace === ns).map((d) => d.method)

  it('六族方法集与 host marker 表逐位一致', () => {
    expect(byNamespace('forgeProjects')).toEqual(['list', 'register', 'deriveTaskStoreDir', 'update'])
    expect(byNamespace('forgeFs')).toEqual(['listDir'])
    expect(byNamespace('forgeBugs')).toEqual(['list'])
    expect(byNamespace('forgeWorktree')).toEqual([
      'list', 'create', 'delete', 'aheadBehind', 'branches', 'checks', 'seal', 'followSeal', 'select', 'selected', 'ensureWorkspace', 'resolve',
    ])
    expect(byNamespace('forgeProposals')).toEqual(['list'])
    expect(byNamespace('forgeFeatures')).toEqual(['list'])
    expect(byNamespace('forgeDirs')).toEqual(['facts'])
  })

  it('service 键 pin（gateway readBinding 一致性校验面——binding.serviceKey 匹配）', () => {
    for (const d of FORGE_REMOTE_DESCRIPTORS) {
      expect(d.service.endsWith('Controller'), `${d.namespace}/${d.method} service 键`).toBe(true)
      expect(d.invocation).toEqual({ kind: 'direct' })
      expect(d.cancellation).toEqual({ parameter: 'signal' })
    }
  })

  it('exportName 别名：worktree.delete 携 implementation=remove（域实现名投影）', () => {
    const del = FORGE_REMOTE_DESCRIPTORS.find((d) => d.namespace === 'forgeWorktree' && d.method === 'delete')
    expect(del?.implementation).toBe('remove')
  })

  it('stream 方法：followSeal mode=stream（一元方法零 mode）', () => {
    for (const d of FORGE_REMOTE_DESCRIPTORS) {
      const isStream = d.namespace === 'forgeWorktree' && d.method === 'followSeal'
      expect(d.mode, `${d.namespace}/${d.method}`).toBe(isStream ? 'stream' : undefined)
    }
  })

  it('参数 wire 名 pin（= host 半 JS 形参名——gateway SRC 解码键）', () => {
    const wireOf = (ns: string, method: string): readonly string[] =>
      FORGE_REMOTE_DESCRIPTORS.find((d) => d.namespace === ns && d.method === method)?.parameters.map((p) => p.wire) ?? []
    expect(wireOf('forgeProjects', 'register')).toEqual(['input'])
    expect(wireOf('forgeProjects', 'deriveTaskStoreDir')).toEqual(['workspaceDir'])
    expect(wireOf('forgeFs', 'listDir')).toEqual(['dirPath'])
    expect(wireOf('forgeBugs', 'list')).toEqual(['query'])
    for (const method of ['list', 'create', 'delete', 'aheadBehind', 'branches', 'checks', 'seal', 'followSeal', 'select', 'selected', 'ensureWorkspace']) {
      expect(wireOf('forgeWorktree', method), `forgeWorktree.${method}`).toEqual(['query'])
    }
    expect(wireOf('forgeProposals', 'list')).toEqual(['query'])
    expect(wireOf('forgeFeatures', 'list')).toEqual(['query'])
    expect(wireOf('forgeDirs', 'facts')).toEqual(['query'])
  })
})

describe('gateway client 安装契约（requireStrictInputs 同径）', () => {
  it('全参数 codec mode=strict（client api 安装面强制——缺 strict 即 mount 抛错）', () => {
    for (const d of FORGE_REMOTE_DESCRIPTORS) {
      for (const p of d.parameters) {
        expect(p.codec.mode, `${d.namespace}/${d.method}.${p.wire}`).toBe('strict')
        expect(p.source).toBe('json')
      }
    }
  })

  it('strict codec create() = 结构校验 schema（违规载荷抛错——诚实 codec 非 zod 空转）', () => {
    const recordParam = FORGE_REMOTE_DESCRIPTORS.find((d) => d.namespace === 'forgeBugs' && d.method === 'list')
      ?.parameters[0]
    expect(recordParam).toBeTruthy()
    const schema = recordParam!.codec.mode === 'strict' ? recordParam!.codec.create() : undefined
    expect(schema?.parse({ projectId: 'p-1' })).toEqual({ projectId: 'p-1' })
    expect(() => schema?.parse('nope')).toThrow(/shape invalid/)
    expect(() => schema?.parse(null)).toThrow(/shape invalid/)

    const arrayResult = FORGE_REMOTE_DESCRIPTORS.find((d) => d.namespace === 'forgeProjects' && d.method === 'list')
      ?.result
    expect(arrayResult?.mode).toBe('strict')
    const listSchema = arrayResult?.mode === 'strict' ? arrayResult.create() : undefined
    expect(listSchema?.parse([])).toEqual([])
    expect(() => listSchema?.parse({})).toThrow(/shape invalid/)
  })

  it('contribution 本体 pin（package = 本包名 + descriptors 表同引用）', () => {
    expect(FORGE_REMOTE_CONTRIBUTION.package).toBe('@dsh-forge/project')
    expect(FORGE_REMOTE_CONTRIBUTION.descriptors).toBe(FORGE_REMOTE_DESCRIPTORS)
    // id 全局唯一（gateway registry get 端点键去重面）
    const ids = FORGE_REMOTE_DESCRIPTORS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
