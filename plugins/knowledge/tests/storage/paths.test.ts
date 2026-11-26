// A2 路径解析单测（forge-dirs-unification 3.4 改基座取值）：config.dbFile 显式照用；
// 缺省库文件 = {forgeRoot}/db/knowledge/knowledge.db（forge 根 = dshHomePath('forge')
// 现查 > 降级 ~/.dsh/forge + warn 含「dshHomePath 缺席」）；不再读环境变量
// DSH_FORGE_TASKS_HOME / DSH_HOME（旧口径退役）；自启判定（双缺不自启——不向 ~/.dsh
// 静默落盘）。
import { describe, expect, it } from 'vitest'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  autoStartDbFile,
  resolveForgeRootOf,
  resolveKnowledgeDbFile,
} from '../../host/storage/paths.js'

describe('forge 根解析（§2.4：dshHomePath 现查 > 降级 ~/.dsh/forge + warn）', () => {
  it('服务在场：dshHomePath("forge") 结果即 forge 根', () => {
    expect(resolveForgeRootOf(() => 'Y:\\svc-home\\forge')).toBe('Y:\\svc-home\\forge')
  })

  it('服务缺席：降级 ~/.dsh/forge + 含「dshHomePath 缺席」字样的 warn（经注入诊断面）', () => {
    const messages: string[] = []
    expect(resolveForgeRootOf(undefined, (m) => messages.push(m))).toBe(
      join(homedir(), '.dsh', 'forge'),
    )
    expect(messages.some((m) => m.includes('dshHomePath 缺席'))).toBe(true)
  })

  it('服务返回空串/非字符串形态（probe 返 undefined）视同缺席', () => {
    expect(resolveForgeRootOf(() => undefined)).toBe(join(homedir(), '.dsh', 'forge'))
  })

  it('消费点现查：probe 每次调用即时求值（本单测内换桩换结果——不缓存）', () => {
    let served: string | undefined = 'X:\\a\\forge'
    const probe = (): string | undefined => served
    expect(resolveForgeRootOf(probe)).toBe('X:\\a\\forge')
    served = 'Y:\\b\\forge'
    expect(resolveForgeRootOf(probe)).toBe('Y:\\b\\forge')
  })
})

describe('A2 库文件解析（config 显式照用 / 缺省随 forge 根）', () => {
  it('单装缺省：{forgeRoot}/db/knowledge/knowledge.db（= {DSH_HOME}/forge/db/knowledge/knowledge.db）', () => {
    expect(resolveKnowledgeDbFile({}, 'C:\\dsh-home\\forge')).toBe(
      join('C:\\dsh-home\\forge', 'db', 'knowledge', 'knowledge.db'),
    )
  })

  it('config.dbFile 显式优先于一切缺省（组合安装 patch 下发 / 测试替代宿主照用；相对路径词法 resolve）', () => {
    expect(resolveKnowledgeDbFile({ dbFile: 'X:\\cfg\\my.db' }, 'C:\\dsh-home\\forge')).toBe('X:\\cfg\\my.db')
    expect(resolveKnowledgeDbFile({ dbFile: 'rel/my.db' }, 'C:\\dsh-home\\forge')).toBe(join(process.cwd(), 'rel', 'my.db'))
  })

  it('config.dbFile 空串视同缺席 → 缺省解析', () => {
    expect(resolveKnowledgeDbFile({ dbFile: '  ' }, 'C:\\dsh-home\\forge')).toBe(
      join('C:\\dsh-home\\forge', 'db', 'knowledge', 'knowledge.db'),
    )
  })
})

describe('A2 自启判定（双态缝——双缺不自启）', () => {
  it('无 config.dbFile 且 dshHomePath 服务缺席 → undefined（裸环境不向 ~/.dsh 静默落盘）', () => {
    expect(autoStartDbFile({}, undefined)).toBeUndefined()
    expect(autoStartDbFile({}, () => undefined)).toBeUndefined()
  })

  it('config.dbFile 显式 / dshHomePath 服务在场 → 解析出库路径自启', () => {
    expect(autoStartDbFile({ dbFile: 'X:\\a.db' }, undefined)).toBe('X:\\a.db')
    expect(autoStartDbFile({}, () => 'C:\\dh\\forge')).toBe(
      join('C:\\dh\\forge', 'db', 'knowledge', 'knowledge.db'),
    )
  })

  it('不再读环境变量 DSH_FORGE_TASKS_HOME / DSH_HOME（env 残留不影响自启与解析）', () => {
    const prev = { TASKS: process.env.DSH_FORGE_TASKS_HOME, HOME: process.env.DSH_HOME }
    process.env.DSH_FORGE_TASKS_HOME = 'D:\\ud\\forge-workspaces'
    process.env.DSH_HOME = 'C:\\legacy-home'
    try {
      expect(autoStartDbFile({}, undefined)).toBeUndefined()
      expect(autoStartDbFile({}, () => 'C:\\dh\\forge')).toBe(
        join('C:\\dh\\forge', 'db', 'knowledge', 'knowledge.db'),
      )
    } finally {
      for (const [k, v] of Object.entries({ DSH_FORGE_TASKS_HOME: prev.TASKS, DSH_HOME: prev.HOME })) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  })
})
