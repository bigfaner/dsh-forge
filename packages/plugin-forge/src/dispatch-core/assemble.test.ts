// dispatch-core · 组装面单测（expert-squad-default-routing 1.2）：workerAgentOptionsOf
// 四级链全组合穷举（①experts 条目 × ②档案成对/单边 × ③defaultAgentOptions × ④父继承）
// + reasoning 三级合成。链规格正本 =
// proposal「优先级链」+ verification.md §0.3 first-def fold / V1-EX1 收口
// （reconcileWorkerReasoning 保留面回归在 dispatch-task.test.ts 同目录）。
import { describe, expect, it } from 'vitest'
import { workerAgentOptionsOf } from './assemble.js'
import type { WorkerRouteLevel } from './assemble.js'

/** ② 档案级四种形态（verification §1.2：成对 / 仅 model / 仅 provider / 无） */
const PROFILE_FORMS: Record<string, WorkerRouteLevel | undefined> = {
  paired: { provider: 'pp', model: 'pm' },
  'model-only': { model: 'pm' },
  'provider-only': { provider: 'pp' },
  none: undefined,
}

/** ① experts 条目（整组 agentOptions）有/无 */
const ENTRY_FORMS: Record<string, WorkerRouteLevel | undefined> = {
  entry: { provider: 'ep', model: 'em' },
  none: undefined,
}

/** ③ defaultAgentOptions 有/无 */
const DEFAULTS_FORMS: Record<string, WorkerRouteLevel | undefined> = {
  defaults: { provider: 'dp', model: 'dm' },
  none: undefined,
}

describe('workerAgentOptionsOf：四级链（含折叠应答消费烟测）', () => {
  it('折叠应答在场 = reasoning→effort 直映射；全级缺席（expert-squad 缺席）= undefined', () => {
    expect(
      workerAgentOptionsOf({ entry: { provider: 'deepseek', model: 'reasoner', reasoning: 'high' } }),
    ).toEqual({ provider: 'deepseek', model: 'reasoner', reasoningEffort: 'high' })
    expect(workerAgentOptionsOf({})).toBeUndefined()
  })
  for (const [entryName, entry] of Object.entries(ENTRY_FORMS)) {
    for (const [profileName, profile] of Object.entries(PROFILE_FORMS)) {
      for (const [defaultsName, defaults] of Object.entries(DEFAULTS_FORMS)) {
        it(`①${entryName} × ②${profileName} × ③${defaultsName}`, () => {
          expect(workerAgentOptionsOf({ entry, profile, defaults })).toEqual(
            // 期望矩阵按 first-def fold 手工推演（verification §1.2 同表）：
            // ① 在场 = 条目整组命中（ep/em）；① 缺席时 ② 成对命中（pp/pm）、
            // ② 单边/缺席回落 ③ 基座（dp/dm）；③ 也缺席 = ④ 父继承（undefined）。
            entry !== undefined
              ? { provider: 'ep', model: 'em' }
              : profileName === 'paired'
                ? { provider: 'pp', model: 'pm' }
                : defaults !== undefined
                  ? { provider: 'dp', model: 'dm' }
                  : undefined,
          )
        })
      }
    }
  }

  it('V1-EX1 收口：① 仅 model 单边（不整组命中）→ model 位并入基座（② 或 ③ 的 provider）', () => {
    expect(workerAgentOptionsOf({ entry: { model: 'em' }, defaults: { provider: 'dp', model: 'dm' } })).toEqual({
      provider: 'dp',
      model: 'em',
    })
    // 无任何基座 → 不成对回落父继承
    expect(workerAgentOptionsOf({ entry: { model: 'em' } })).toBeUndefined()
  })

  it('全级缺席（expert-squad 缺席降级形态）= undefined（④ 父会话继承）', () => {
    expect(workerAgentOptionsOf({})).toBeUndefined()
  })
})

describe('workerAgentOptionsOf：reasoning 三级合成（① 条目 > ② 档案 frontmatter > ③ defaultAgentOptions > 不下发）', () => {
  it('三级同时在场 = ① 压倒', () => {
    expect(
      workerAgentOptionsOf({
        entry: { provider: 'ep', model: 'em', reasoning: 'low' },
        profile: { provider: 'pp', model: 'pm', reasoning: 'medium' },
        defaults: { provider: 'dp', model: 'dm', reasoning: 'high' },
      }),
    ).toEqual({ provider: 'ep', model: 'em', reasoningEffort: 'low' })
  })

  it('① 缺席 = ② frontmatter 生效；② 缺席 = ③ 生效', () => {
    expect(
      workerAgentOptionsOf({
        profile: { provider: 'pp', model: 'pm', reasoning: 'medium' },
        defaults: { provider: 'dp', model: 'dm', reasoning: 'high' },
      }),
    ).toEqual({ provider: 'pp', model: 'pm', reasoningEffort: 'medium' })
    expect(
      workerAgentOptionsOf({
        defaults: { provider: 'dp', model: 'dm', reasoning: 'high' },
      }),
    ).toEqual({ provider: 'dp', model: 'dm', reasoningEffort: 'high' })
  })

  it('三级全缺 = 路由照常、不下发 effort（落模型默认档）', () => {
    expect(workerAgentOptionsOf({ profile: { provider: 'pp', model: 'pm' } })).toEqual({ provider: 'pp', model: 'pm' })
  })

  it('路由不成对（④ 父继承）时 reasoning 无生效位——整组省略', () => {
    expect(workerAgentOptionsOf({ defaults: { model: 'dm', reasoning: 'high' } })).toBeUndefined()
  })
})
