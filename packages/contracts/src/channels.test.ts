// 1.3 AC3 —— 通道名常量 pin（Interface 4：Web RPC 面，两域全通道）。
// 2.8 增补：`forge:fs/*` 宿主文件系统浏览面（任务 2.8 Hard Rules——目录读取经 RPC，
// renderer 不开 Node fs 通道；只读列举）。
// 1.1（M2）增补：Interface 7 五族——forge:tasks|features|proposals|docs/* +
// forge:projects/deriveTaskStoreDir 扩族 + forge:events/tasks-changed 推送面；
// 写动词 add/claim/submit/createProposal/transitionProposal 恒不上 RPC（SC7 断言面）。
import { describe, expect, it } from 'vitest'
import {
  DOCS_CHANNELS,
  FEATURES_CHANNELS,
  FORGE_CHANNEL_ALLOWLIST,
  FORGE_CHANNELS,
  FORGE_EVENT_CHANNELS,
  FS_CHANNELS,
  KNOWLEDGE_CHANNELS,
  PROJECTS_CHANNELS,
  PROJECTS_M2_CHANNELS,
  PROPOSALS_CHANNELS,
  TASKS_CHANNELS,
} from './channels.js'

describe('AC3 通道名常量覆盖 Interface 4 两域全部通道（P1 面不动）', () => {
  it('forge:projects/* 五通道（register/list/get/update/reconcile）', () => {
    expect(PROJECTS_CHANNELS).toEqual({
      register: 'forge:projects/register',
      list: 'forge:projects/list',
      get: 'forge:projects/get',
      update: 'forge:projects/update',
      reconcile: 'forge:projects/reconcile',
    })
  })

  it('forge:knowledge/* 五通道（browse/listEntries/entryDetail/heat/sessionRecall）', () => {
    expect(KNOWLEDGE_CHANNELS).toEqual({
      browse: 'forge:knowledge/browse',
      listEntries: 'forge:knowledge/listEntries',
      entryDetail: 'forge:knowledge/entryDetail',
      heat: 'forge:knowledge/heat',
      sessionRecall: 'forge:knowledge/sessionRecall',
    })
  })

  it('forge:fs/* 浏览面（listDir——UF-3 文件浏览器数据源，只读目录列举）', () => {
    expect(FS_CHANNELS).toEqual({
      listDir: 'forge:fs/listDir',
    })
  })
})

describe('AC2 通道常量五族（Interface 7 通道族清单）', () => {
  it('forge:tasks/* 八通道（transition/query/validateFeatureTasks/list/stats/graph/detail/sessionLinks）', () => {
    expect(TASKS_CHANNELS).toEqual({
      transition: 'forge:tasks/transition',
      query: 'forge:tasks/query',
      validateFeatureTasks: 'forge:tasks/validateFeatureTasks',
      list: 'forge:tasks/list',
      stats: 'forge:tasks/stats',
      graph: 'forge:tasks/graph',
      detail: 'forge:tasks/detail',
      sessionLinks: 'forge:tasks/sessionLinks',
    })
  })

  it('forge:features/* 四通道（register/transition/upsertDoc/list——UI 直调）', () => {
    expect(FEATURES_CHANNELS).toEqual({
      register: 'forge:features/register',
      transition: 'forge:features/transition',
      upsertDoc: 'forge:features/upsertDoc',
      list: 'forge:features/list',
    })
  })

  it('forge:proposals/* 仅 list（写动词 createProposal/transitionProposal = tool 专属）', () => {
    expect(PROPOSALS_CHANNELS).toEqual({
      list: 'forge:proposals/list',
    })
  })

  it('forge:docs/* 两通道（read / openExternal——后者 main 侧执行）', () => {
    expect(DOCS_CHANNELS).toEqual({
      read: 'forge:docs/read',
      openExternal: 'forge:docs/openExternal',
    })
  })

  it('forge:projects/deriveTaskStoreDir 扩族（Interface 5；独立常量——P1 五法注册面零波及）', () => {
    expect(PROJECTS_M2_CHANNELS).toEqual({
      deriveTaskStoreDir: 'forge:projects/deriveTaskStoreDir',
    })
  })

  it('forge:events/tasks-changed 推送面（主→渲染单向，preload 订阅面）', () => {
    expect(FORGE_EVENT_CHANNELS).toEqual({
      tasksChanged: 'forge:events/tasks-changed',
    })
  })
})

describe('AC2 allowlist 数据单源（invoke 面全集）', () => {
  it('allowlist = 七 invoke 族 27 通道全列、无重复（main 侧 allowlist 校验唯一源）', () => {
    expect(FORGE_CHANNEL_ALLOWLIST).toHaveLength(27)
    expect(new Set(FORGE_CHANNEL_ALLOWLIST).size).toBe(27)
    expect([...FORGE_CHANNEL_ALLOWLIST].sort()).toEqual(
      [
        ...Object.values(PROJECTS_CHANNELS),
        ...Object.values(PROJECTS_M2_CHANNELS),
        ...Object.values(KNOWLEDGE_CHANNELS),
        ...Object.values(FS_CHANNELS),
        ...Object.values(TASKS_CHANNELS),
        ...Object.values(FEATURES_CHANNELS),
        ...Object.values(PROPOSALS_CHANNELS),
        ...Object.values(DOCS_CHANNELS),
      ].sort(),
    )
  })

  it('平铺视图值域 = allowlist 本尊（host 消费锚 .list/.heat 保持 P1 值）', () => {
    expect(Object.values(FORGE_CHANNELS).sort()).toEqual([...FORGE_CHANNEL_ALLOWLIST].sort())
    expect(FORGE_CHANNELS.list).toBe(PROJECTS_CHANNELS.list)
    expect(FORGE_CHANNELS.heat).toBe(KNOWLEDGE_CHANNELS.heat)
  })

  it('通道名一律 forge: 命名空间前缀（与 dsh 自有面隔离）', () => {
    for (const channel of FORGE_CHANNEL_ALLOWLIST) {
      expect(channel.startsWith('forge:')).toBe(true)
    }
    for (const channel of Object.values(FORGE_EVENT_CHANNELS)) {
      expect(channel.startsWith('forge:')).toBe(true)
    }
  })
})

describe('AC2 面分治 pin（写动词不上 RPC + 推送面不入 invoke）', () => {
  it('写动词 add/claim/submit/createProposal/transitionProposal 不入任何 RPC 族（SC7 断言面）', () => {
    const families = [
      PROJECTS_CHANNELS,
      PROJECTS_M2_CHANNELS,
      KNOWLEDGE_CHANNELS,
      FS_CHANNELS,
      TASKS_CHANNELS,
      FEATURES_CHANNELS,
      PROPOSALS_CHANNELS,
      DOCS_CHANNELS,
    ]
    const writeVerbs = [
      'addTask',
      'claimTask',
      'submitTask',
      'createProposal',
      'transitionProposal',
    ]
    for (const family of families) {
      for (const key of Object.keys(family)) {
        expect(writeVerbs).not.toContain(key)
      }
    }
    const all = FORGE_CHANNEL_ALLOWLIST.join(' ')
    for (const verb of writeVerbs) {
      expect(all).not.toContain(`/${verb}`)
    }
  })

  it('events 推送通道不进 invoke allowlist（主→渲染单向 ≠ renderer→main invoke）', () => {
    expect(FORGE_CHANNEL_ALLOWLIST).not.toContain(FORGE_EVENT_CHANNELS.tasksChanged)
  })

  it('search/readAbstract 不在 web RPC 通道面（agent 面唯一门 = 插件 tool，双门分工）', () => {
    const names = FORGE_CHANNEL_ALLOWLIST.join(' ')
    expect(names).not.toContain('search')
    expect(names).not.toContain('readAbstract')
  })
})
