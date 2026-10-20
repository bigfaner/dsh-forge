// @dsh-forge/input-history —— client face（浏览器半；打包脚本 scripts/bundle-client.mjs
// 按官方 clientBundle 配方产出 dist/client.js，经 exports["./client"] 以 classic
// <script> 装载）。
//
// 半完整 cordis 插件：组合 apply（{ apply } 对象）——对策 annotator
// gotcha-web-boot:43 判例（client face 为 DI 库件、无 apply → 真机 cordis
// `invalid plugin, expect function or object with an "apply" method`）。
//
// 接线全在本 apply 内（tech-design ②：desktop 组合在 client root ctx 以服务键
// `sessions` 提供 ISessions，本包经 dsh.client.inject 声明装配期注入边，运行期
// ctx.sessions.binding(id)?.eventSource 解包——非宿主 wiring 注入）：
//   ① readline 翻阅状态机（input-history.ts 判例移植）；
//   ② DOM 键位源 + mention 菜单态守卫（composer-keys.ts 判例移植——菜单开不抢键）；
//   ③ 会话事件历史源（event-source.ts binding.eventSource 解包 + 活跃会话跟随切源）。
// 全缝 fail-soft：sessions/binding/eventSource/document 任一缺席只降本面，不炸组合。
import { createElement, type ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import {
  composerCaretOf,
  composerMenuGuardOf,
  createComposerDomKeySource,
  serviceGet,
  type ForgeComposerEventTarget,
  type ForgeComposerMenuDocument,
} from './composer-keys.js'
import { activeSessionIdOf, historyFeedOf } from './event-source.js'
import { createInputHistory, type HistoryDraftSeam, type HistoryKeySource, type InputHistoryHandle } from './input-history.js'

/** client face 激活产物（组合 apply 接线面）。 */
export interface InputHistoryClientFace {
  /** sessions 注入缝在场性（desktop 组合常态供给；缺席 = 空态降级，不炸组合） */
  readonly sessionsAvailable: boolean
  /** 已接线的输入历史 handle（sessions 缺席 = undefined） */
  readonly history: InputHistoryHandle | undefined
  /** 全量撤销（键源/会话源/list 订阅退订；幂等） */
  dispose(): void
}

/** 官方 conversation.input 草稿缝消费切片（setDraft/读稿——缺席/漂移 = undefined） */
interface ComposerInputFace {
  setDraft(text: string): void
  state?: { getSnapshot?: () => { draft?: unknown } }
}

/** conversation 服务窄读取（reflect 正门 + 具名属性回退，均 fail-soft） */
function conversationOf(ctx: unknown): unknown {
  const viaReflect = serviceGet(ctx, 'conversation')
  if (viaReflect !== undefined) return viaReflect
  try {
    return (ctx as { conversation?: unknown }).conversation
  } catch {
    return undefined
  }
}

/** 活跃会话的 conversation.input 缝解析（绑定上下文寻址——缺席 = undefined） */
function inputFaceOf(ctx: unknown, sessions: ISessions, sessionId: string): ComposerInputFace | undefined {
  try {
    // binding(id) 官方签名收品牌化 SessionId（ISessions 类型面）——本包会话 id 来源
    // 为 sessions.list 快照行（同源 string），经结构窄面借用，语义同参考分支判例。
    const binding = (sessions as unknown as { binding?: (id: string) => unknown }).binding?.(sessionId)
    const actx = (binding as { ctx?: unknown } | undefined)?.ctx
    if (actx === undefined || actx === null) return undefined
    const input = (conversationOf(ctx) as { input?: { for?: (a: unknown) => unknown } } | undefined)?.input
    const face = typeof input?.for === 'function' ? (input.for(actx) as ComposerInputFace | undefined) : undefined
    return typeof face?.setDraft === 'function' ? face : undefined
  } catch {
    return undefined
  }
}

/**
 * 组合 apply 插件对象（非裸 DI 库件——装载器物化后由 cordis 组合调用 apply）。
 * 类型化具名服务取法：type-only import 官方包保留 ctx.sessions 全量类型安全
 * （AGENTS.md §1.5），运行期存在性检查承担 fail-soft。
 */
export const inputHistoryClient = {
  apply(ctx: Context): InputHistoryClientFace {
    const sessions = (ctx as { sessions?: ISessions }).sessions
    if (sessions == null) {
      return { sessionsAvailable: false, history: undefined, dispose: () => undefined }
    }
    const disposes: (() => void)[] = []
    const history = createInputHistory()
    const doc = (globalThis as { document?: ForgeComposerMenuDocument & ForgeComposerEventTarget }).document
    const activeIdOf = (): string => activeSessionIdOf(sessions.list) ?? ''
    // 历史源（binding.eventSource 解包——binding 对未保留代返回 undefined = 不 attach）
    const attachHistory = (sessionId: string): boolean => {
      let feed
      try {
        feed = historyFeedOf((sessions as unknown as { binding?: (id: string) => unknown }).binding?.(sessionId))
      } catch {
        return false
      }
      if (feed === undefined) return false
      try {
        history.attach(sessionId, feed)
        return true
      } catch {
        return false
      }
    }
    // 真实按键接线 + 草稿缝（有 document 才接——Node/无 DOM 环境 = 跳过，单测可注入）
    if (doc !== undefined) {
      try {
        const menuOpen = composerMenuGuardOf(ctx, doc)
        const draftTextOfActive = (): string => {
          try {
            const state = inputFaceOf(ctx, sessions, activeIdOf())?.state
            const draft = typeof state?.getSnapshot === 'function' ? state.getSnapshot() : undefined
            return typeof draft?.draft === 'string' ? draft.draft : ''
          } catch {
            return ''
          }
        }
        const realKeys: HistoryKeySource = {
          subscribe: (handler) =>
            createComposerDomKeySource(doc, () => menuOpen(activeIdOf()), handler) ?? (() => undefined),
        }
        const realDraftSeam: HistoryDraftSeam = {
          getDraft: draftTextOfActive,
          getCaret: () => composerCaretOf(doc),
          setDraft: (text) => {
            try {
              inputFaceOf(ctx, sessions, activeIdOf())?.setDraft(text)
            } catch {
              // 官方面瞬态缺席——置稿失败不外溢（翻阅态自然冻结，menu 关后自洽重启）
            }
          },
        }
        disposes.push(history.bind(realKeys, realDraftSeam))
      } catch {
        // 键位接线失败不外溢（其余面保持）
      }
    }
    // 活跃会话跟随（会话切换即切历史源——list.subscribe 在场时订阅，缺席 = 仅初挂）
    let disposeList: (() => void) | undefined
    const followActive = (): void => {
      const active = activeSessionIdOf(sessions.list)
      if (active !== undefined && history.attachedSession() !== active) attachHistory(active)
    }
    try {
      const list = sessions.list as { subscribe?: (cb: () => void) => () => void }
      if (typeof list?.subscribe === 'function') disposeList = list.subscribe(followActive)
    } catch {
      disposeList = undefined
    }
    followActive()
    disposes.push(() => {
      disposeList?.()
      history.dispose()
    })
    return {
      sessionsAvailable: true,
      history,
      dispose(): void {
        for (const dispose of disposes.splice(0)) dispose()
      },
    }
  },
}

/**
 * react 消费点占位（装载契约：react 等平台基线经 factory 的 require 走壳层
 * 冻结种子表、永不内联——守卫测试钉死 require("react") 在场）。
 */
export const inputHistoryPlaceholder: ReactElement = createElement('div', {
  'data-input-history': 'skeleton',
})
