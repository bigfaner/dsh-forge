// A2 路径解析单测：config 可配优先；缺省宿主数据域子目录（dsh-forge / dsh desktop /
// ~/.dsh 兜底三形态）；自启判定（锚缺席不自启——不向 ~/.dsh 静默落盘）。
import { describe, expect, it } from 'vitest'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  autoStartDbFile,
  resolveKnowledgeDataRoot,
  resolveKnowledgeDbFile,
} from './paths.js'

describe('A2 缺省宿主数据域子目录（两形态 + 兜底）', () => {
  it('dsh-forge 形态：DSH_FORGE_TASKS_HOME 非空 → dirname（数据域根）/knowledge/knowledge.db', () => {
    const tasksHome = join('D:', 'data', 'forge-workspaces')
    expect(resolveKnowledgeDataRoot({ DSH_FORGE_TASKS_HOME: tasksHome })).toBe(dirname(tasksHome))
    expect(resolveKnowledgeDbFile({}, { DSH_FORGE_TASKS_HOME: tasksHome })).toBe(
      join(dirname(tasksHome), 'knowledge', 'knowledge.db'),
    )
  })

  it('dsh desktop 形态：DSH_HOME → DSH_HOME/knowledge/knowledge.db', () => {
    expect(resolveKnowledgeDataRoot({ DSH_HOME: 'C:\\dsh-home' })).toBe('C:\\dsh-home')
    expect(resolveKnowledgeDbFile({}, { DSH_HOME: 'C:\\dsh-home' })).toBe(
      join('C:\\dsh-home', 'knowledge', 'knowledge.db'),
    )
  })

  it('双锚在场 dsh-forge 优先（forge 形态数据域为UserData、desktop 为 DSH_HOME）', () => {
    expect(
      resolveKnowledgeDataRoot({ DSH_FORGE_TASKS_HOME: 'D:\\ud\\forge-workspaces', DSH_HOME: 'C:\\dsh-home' }),
    ).toBe('D:\\ud')
  })

  it('全锚缺席兜底 ~/.dsh（expert-squad resolveUserExpertsRoot 同构）', () => {
    expect(resolveKnowledgeDataRoot({})).toBe(join(homedir(), '.dsh'))
  })

  it('空串锚视同缺席（宿主路径解析同语义——空串不压过次优先级）', () => {
    expect(resolveKnowledgeDataRoot({ DSH_FORGE_TASKS_HOME: '', DSH_HOME: 'C:\\dh' })).toBe('C:\\dh')
    expect(resolveKnowledgeDataRoot({ DSH_FORGE_TASKS_HOME: '', DSH_HOME: '' })).toBe(join(homedir(), '.dsh'))
  })
})

describe('A2 config 可配路径（裁决①）', () => {
  it('config.dbFile 显式优先于一切缺省（相对路径词法 resolve）', () => {
    expect(resolveKnowledgeDbFile({ dbFile: 'X:\\cfg\\my.db' }, { DSH_HOME: 'C:\\dh' })).toBe('X:\\cfg\\my.db')
    expect(resolveKnowledgeDbFile({ dbFile: 'rel/my.db' })).toBe(join(process.cwd(), 'rel', 'my.db'))
  })

  it('config.dbFile 空串视同缺席 → 缺省解析', () => {
    expect(resolveKnowledgeDbFile({ dbFile: '  ' }, { DSH_HOME: 'C:\\dh' })).toBe(
      join('C:\\dh', 'knowledge', 'knowledge.db'),
    )
  })
})

describe('A2 自启判定（双态缝——锚缺席不自启）', () => {
  it('无 config.dbFile 且双锚缺席 → undefined（裸环境不向 ~/.dsh 静默落盘）', () => {
    expect(autoStartDbFile({}, {})).toBeUndefined()
  })

  it('config.dbFile / 任一宿主锚在场 → 解析出库路径自启', () => {
    expect(autoStartDbFile({ dbFile: 'X:\\a.db' }, {})).toBe('X:\\a.db')
    expect(autoStartDbFile({}, { DSH_FORGE_TASKS_HOME: 'D:\\ud\\forge-workspaces' })).toBe(
      join('D:\\ud', 'knowledge', 'knowledge.db'),
    )
    expect(autoStartDbFile({}, { DSH_HOME: 'C:\\dh' })).toBe(join('C:\\dh', 'knowledge', 'knowledge.db'))
  })
})
