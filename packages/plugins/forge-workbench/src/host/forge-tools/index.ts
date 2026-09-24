// host/forge-tools — dsh tool 注册面(任务 2.1;agent 原生工具面基座)。
//
// 装配 = ①ForgeToolBridgeService(rpc 面,calls 流 + answer 单向)②工具族
// 注册(ctx.tools.register;ToolRuntime 由 base bundle 全局装配 —— spike-1
// §1.1 注册位:插件 host 半身从 root context 注册 = 全局工具,标准形态)。
// 任务 2.2 追加:知识系族(forge_fact/lesson/research/forensic,D4)与
// feature 读族(forge_feature_list/status)经本基座追加注册,不另设通道。
// 后续 tool 族(proposal/pref/stage,3.x/4.x)同一追加律。
//
// `tools` 服务经 ctx.inject 动态等待(base 行装配序与本插件无关;web-app
// bundle 同款运行时 inject 先例)。守卫式读取:最小/测试上下文无 inject 面 →
// 注册降级为 no-op(不抛错);桥服务照常注册(client 侧无消费者 = 宽限/预算
// 降级链兜底,禁静默语义不破)。

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { createToolBridgeCore, type ToolBridgeCore } from './bridge-core'
import { createForgeTaskTools } from './task-tools'
import { createForgeKnowledgeTools } from './knowledge'
import { createForgeFeatureReadTools } from './feature-read'
import { createForgePrefTools } from './pref'
import { createForgeStageTools } from './stage'
import { ForgeToolBridgeService } from './rpc'

/** tools 服务的最小注册面(duck-typing;类型见 @deepseek-ai/dsh-tools)。 */
interface ToolsRegistryFace {
  register(definition: ToolDefinition): () => void
}

/** 从 inject 子上下文解析 tools 注册面(属性面 → get() 面,双形兼容)。 */
function toolsRegistryOf(ctx: unknown): ToolsRegistryFace | undefined {
  if (ctx === null || typeof ctx !== 'object') return undefined
  const candidate = (ctx as { tools?: unknown }).tools
  if (candidate !== null && typeof candidate === 'object'
    && typeof (candidate as { register?: unknown }).register === 'function') {
    return candidate as ToolsRegistryFace
  }
  try {
    const viaGet = (ctx as { get?: (key: string, strict?: boolean) => unknown }).get?.('tools', false)
    if (viaGet !== null && typeof viaGet === 'object'
      && typeof (viaGet as { register?: unknown }).register === 'function') {
      return viaGet as ToolsRegistryFace
    }
  } catch {
    // get() 不可用 = 无 tools 面 → 降级 no-op
  }
  return undefined
}

export interface ForgeToolsAssembly {
  /** 桥核(测试/后续工具族追加注册的注入面)。 */
  readonly core: ToolBridgeCore
  /** 整体拆卸(工具注销 + inject fiber 释放)。 */
  dispose(): void
}

/**
 * 注册 dsh tool 面:桥 rpc 服务 + 任务工具族。
 * @param ctx - host 半身 root context。
 */
export function registerForgeTools(ctx: Context): ForgeToolsAssembly {
  const core = createToolBridgeCore()
  new ForgeToolBridgeService(ctx, core)

  const toolDisposers: Array<() => void> = []
  let fiberDispose: (() => void) | undefined
  if (typeof (ctx as { inject?: unknown }).inject === 'function') {
    const fiber = (ctx as unknown as {
      inject(names: string[], body: (ctx: Context) => void): { dispose(): Promise<void> | void }
    }).inject(['tools'], (toolsCtx) => {
      const registry = toolsRegistryOf(toolsCtx)
      if (registry === undefined) return
      const call = (verb: Parameters<ToolBridgeCore['callWithRetry']>[0], args: Record<string, unknown>, actor: string) =>
        core.callWithRetry(verb, args, actor)
      const families: ToolDefinition[] = [
        ...createForgeTaskTools({ call }),
        // 任务 2.2(D4):知识系 + feature 读族 —— 同一基座追加注册,不另设通道。
        ...createForgeKnowledgeTools({ call }),
        ...createForgeFeatureReadTools({ call }),
        // 任务 3.1:pref 读族(forge_pref_get,读生效值)—— 同一基座追加注册。
        ...createForgePrefTools({ call }),
        // 任务 4.1:stage 写族(forge_stage_summarize,阶段资产写/覆盖)——
        // 同一基座追加注册。
        ...createForgeStageTools({ call }),
      ]
      for (const tool of families) {
        toolDisposers.push(registry.register(tool))
      }
    })
    fiberDispose = () => {
      void fiber.dispose()
    }
  }

  return {
    core,
    dispose(): void {
      for (const dispose of toolDisposers.splice(0)) dispose()
      fiberDispose?.()
    },
  }
}
