// 通道键结构 pin（CT-KN-CH 双侧同钉——knowledge-plugin-migration 1.4）：三面发起的全部
// RPC 通道键集合逐字等于 @dsh-forge/lib-api/channels KNOWLEDGE_CHANNELS 本尊导出面（迁移零改键，
// 宿主侧 provider 不动）。独立可红：任一键缺失/多出/字面漂移即红。
// search/readAbstract 不在面——agent 面唯一门 = knowledge 插件 tool（双门分工）。
import { describe, expect, it } from 'vitest'
import { KNOWLEDGE_CHANNELS } from '@dsh-forge/lib-api/channels'
import { createForgeRpcClient } from './rpc-channels.js'

const noopTransport = async (): Promise<unknown> => ({ ok: true, data: null })

describe('CT-KN-CH 通道键结构 pin（knowledge 切片 = contracts 本尊导出面）', () => {
  const client = createForgeRpcClient(noopTransport)

  it('键集合逐字相等：client.knowledge 方法键 = KNOWLEDGE_CHANNELS 键（七键）', () => {
    expect(Object.keys(client.knowledge).sort()).toEqual(Object.keys(KNOWLEDGE_CHANNELS).sort())
  })

  it('键字面无漂移：七键逐字 = contracts 本尊字面', () => {
    expect(Object.keys(KNOWLEDGE_CHANNELS)).toEqual([
      'browse',
      'listEntries',
      'entryDetail',
      'heat',
      'sessionRecall',
      'entryAction',
      'recallFeedback',
    ])
    expect(Object.values(KNOWLEDGE_CHANNELS)).toEqual([
      'forge:knowledge/browse',
      'forge:knowledge/listEntries',
      'forge:knowledge/entryDetail',
      'forge:knowledge/heat',
      'forge:knowledge/sessionRecall',
      'forge:knowledge/entryAction',
      'forge:knowledge/recallFeedback',
    ])
  })

  it('双门分工：client.knowledge 恰七方法（search/readAbstract 不在面——agent 面 tool 专属）', () => {
    expect(Object.keys(client.knowledge)).toHaveLength(7)
    expect('search' in client.knowledge).toBe(false)
    expect('readAbstract' in client.knowledge).toBe(false)
  })

  it('发键 = contracts 常量值本尊（invokeRpc 通道实参钉——非字面量副本）', async () => {
    const seen: string[] = []
    const probe = createForgeRpcClient(async (channel) => {
      seen.push(channel)
      return { ok: true, data: null }
    })
    await probe.knowledge.browse('p-1')
    await probe.knowledge.heat('p-1')
    expect(seen).toEqual([KNOWLEDGE_CHANNELS.browse, KNOWLEDGE_CHANNELS.heat])
  })
})
