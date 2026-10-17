import { describe, expect, it } from 'vitest'
import { createOfficialApi, DisconnectedError, type ApiDeps } from './api.ts'
import { arbitrate, createRemoteRpc, parseSlashLine, sendComposerInput, type RemoteRpcDeps } from './rpc.ts'
import { createStore } from './store.ts'
import { createRouter } from './router.ts'

// ---------------------------------------------------------------------------
// __rpc 信封客户端
// ---------------------------------------------------------------------------

function rpcDeps(responder: (path: string, body: unknown) => { status: number; json: unknown } | Promise<never>) {
  const calls: { path: string; body: unknown }[] = []
  const deps: RemoteRpcDeps = {
    post: async (path, body) => {
      calls.push({ path, body })
      return responder(path, body)
    },
  }
  return { calls, deps }
}

describe('__rpc 信封客户端', () => {
  it('POST /remote/__rpc {channel, payload} → {ok:true, data} 原样透传', async () => {
    const { calls, deps } = rpcDeps(() => ({ status: 200, json: { ok: true, data: { unread: 3 } } }))
    const rpc = createRemoteRpc(deps)
    const result = await rpc.call<{ unread: number }>('forge:remote/read-state', { sessionId: 's-1' })
    expect(result).toEqual({ ok: true, data: { unread: 3 } })
    expect(calls[0]).toEqual({ path: '/remote/__rpc', body: { channel: 'forge:remote/read-state', payload: { sessionId: 's-1' } } })
  })

  it('host 守卫拒绝 → {ok:false, error:{code, reason}}', async () => {
    const { deps } = rpcDeps(() => ({ status: 200, json: { ok: false, error: { code: 'conflict', reason: 'stale' } } }))
    const result = await createRemoteRpc(deps).call('forge:remote/approval', {})
    expect(result).toEqual({ ok: false, error: { code: 'conflict', reason: 'stale' } })
  })

  it('401 / 网络异常 → disconnected 错误信封（fail-soft，不 throw）', async () => {
    const denied = rpcDeps(() => ({ status: 401, json: null }))
    expect(await createRemoteRpc(denied.deps).call('x', {})).toEqual({ ok: false, error: { code: 'disconnected', reason: 'unauthorized' } })
    const offline: RemoteRpcDeps = { post: async () => { throw new Error('net down') } }
    expect(await createRemoteRpc(offline).call('x', {})).toEqual({ ok: false, error: { code: 'disconnected', reason: 'network' } })
  })
})

// ---------------------------------------------------------------------------
// `/` 前缀指令仲裁：命中 / 未命中 / 无斜杠三径
// ---------------------------------------------------------------------------

describe('parseSlashLine', () => {
  it('前导斜杠解析 name/args；裸斜杠/无斜杠 → null', () => {
    expect(parseSlashLine('/run-dag-tasks mobile-ui')).toEqual({ name: 'run-dag-tasks', args: 'mobile-ui', line: '/run-dag-tasks mobile-ui' })
    expect(parseSlashLine('/stop-dag-tasks')).toEqual({ name: 'stop-dag-tasks', args: '', line: '/stop-dag-tasks' })
    expect(parseSlashLine('/')).toBeNull()
    expect(parseSlashLine('普通消息')).toBeNull()
    expect(parseSlashLine('路径 /not-a-command')).toBeNull()
  })
})

describe('arbitrate 三径', () => {
  const catalog = ['run-dag-tasks', 'stop-dag-tasks']
  it('命中目录 → command', () => {
    expect(arbitrate('/run-dag-tasks mobile-ui', catalog)).toEqual({
      kind: 'command',
      parsed: { name: 'run-dag-tasks', args: 'mobile-ui', line: '/run-dag-tasks mobile-ui' },
    })
  })
  it('未命中目录 → 字面消息', () => {
    expect(arbitrate('/no-such-cmd arg', catalog)).toEqual({ kind: 'message', text: '/no-such-cmd arg' })
  })
  it('无斜杠 → 字面消息', () => {
    expect(arbitrate('帮我看看任务', catalog)).toEqual({ kind: 'message', text: '帮我看看任务' })
  })
})

describe('sendComposerInput 派发', () => {
  function apiDeps() {
    const methodCalls: { method: string; payload: unknown }[] = []
    const deps: ApiDeps = {
      post: async (_path, body) => {
        const envelope = body as { method: string; payload: unknown }
        methodCalls.push({ method: envelope.method, payload: envelope.payload })
        return { status: 200, json: { ok: true, value: {} } }
      },
      get: async () => ({ status: 200, json: {} }),
      timeZone: () => 'Asia/Shanghai',
    }
    return { methodCalls, deps }
  }
  const base = { sessionId: 's-9', catalog: ['run-dag-tasks'] }

  it('命中：官方指令执行远程面 commands.execute（整行，同源会话）', async () => {
    const { methodCalls, deps } = apiDeps()
    const outcome = await sendComposerInput('/run-dag-tasks mobile-ui', { api: createOfficialApi(deps), ...base })
    expect(outcome).toBe('command-executed')
    expect(methodCalls).toEqual([
      { method: 'commands.execute', payload: { agentId: 's-9', line: '/run-dag-tasks mobile-ui', attachments: [] } },
    ])
  })

  it('未命中：session.prompt 字面消息', async () => {
    const { methodCalls, deps } = apiDeps()
    const outcome = await sendComposerInput('/unknown-cmd', { api: createOfficialApi(deps), ...base })
    expect(outcome).toBe('message-sent')
    expect(methodCalls[0]).toMatchObject({
      method: 'session.prompt',
      payload: { sessionId: 's-9', mode: 'steer', content: [{ type: 'text', text: '/unknown-cmd' }] },
    })
  })

  it('无斜杠：session.prompt 字面消息', async () => {
    const { methodCalls, deps } = apiDeps()
    const outcome = await sendComposerInput('继续任务', { api: createOfficialApi(deps), ...base })
    expect(outcome).toBe('message-sent')
    expect(methodCalls[0]?.method).toBe('session.prompt')
  })
})

// ---------------------------------------------------------------------------
// 官方面窄面 13 方法形状 pin（信封/端点名与官方手机页逐位一致）
// ---------------------------------------------------------------------------

describe('official api 窄面', () => {
  function record() {
    const methodCalls: { method: string; payload: unknown }[] = []
    const deps: ApiDeps = {
      post: async (_path, body) => {
        const envelope = body as { method: string; payload: unknown }
        methodCalls.push({ method: envelope.method, payload: envelope.payload })
        return { status: 200, json: { ok: true, value: { items: [], presets: [], sessionId: 'new' } } }
      },
      get: async () => ({ status: 200, json: { ok: true } }),
      timeZone: () => 'UTC',
    }
    return { methodCalls, api: createOfficialApi(deps), deps }
  }

  it('13 方法清单端点名与载荷形状', async () => {
    const { methodCalls, api } = record()
    await api.listSessions()
    await api.createSession('ws-1')
    await api.history('s-1', 10)
    await api.prompt('s-1', 'hi', 'steer')
    await api.cancel('s-1')
    await api.models('s-1')
    await api.selectModel('s-1', 'p', 'm', 'max')
    await api.pendingInteractions('s-1')
    await api.answerInteraction('rpc-1', 's-1', [{ id: 'q', selected: ['a'] }])
    await api.cancelInteraction('rpc-1', 's-1')
    await api.listWorkspaces()
    await api.listAgentPresets()
    await api.selectAgentPreset('s-1', 'blitz')
    expect(methodCalls.map((call) => call.method)).toEqual([
      'session.list',
      'session.create',
      'session.history',
      'session.prompt',
      'session.cancel',
      'session.models',
      'session.selectModel',
      'interaction.pending',
      'interaction.answer',
      'interaction.cancel',
      'workspace.list',
      'agentPreset.list',
      'agentPreset.select',
    ])
    expect(methodCalls[2]?.payload).toEqual({ sessionId: 's-1', maxMessages: 10 })
    expect(methodCalls[3]?.payload).toMatchObject({ sessionId: 's-1', mode: 'steer', clientTimeZone: 'UTC' })
    expect(methodCalls[8]?.payload).toEqual({ rpcId: 'rpc-1', sessionId: 's-1', answers: [{ id: 'q', selected: ['a'] }] })
  })

  it('401 → DisconnectedError；业务 error → throw message', async () => {
    const failing: ApiDeps = {
      post: async () => ({ status: 401, json: null }),
      get: async () => ({ status: 401, json: null }),
      timeZone: () => 'UTC',
    }
    await expect(createOfficialApi(failing).listSessions()).rejects.toBeInstanceOf(DisconnectedError)
    const business: ApiDeps = {
      post: async () => ({ status: 200, json: { ok: false, error: 'failed' } }),
      get: async () => ({ status: 200, json: {} }),
      timeZone: () => 'UTC',
    }
    await expect(createOfficialApi(business).listSessions()).rejects.toThrow('failed')
  })

  it('status 心跳：ok / 401 断连 / 网络异常 false', async () => {
    const ok = record()
    expect(await ok.api.status()).toBe(true)
    const disconnected: ApiDeps = {
      post: async () => ({ status: 200, json: {} }),
      get: async () => ({ status: 401, json: null }),
      timeZone: () => 'UTC',
    }
    await expect(createOfficialApi(disconnected).status()).rejects.toBeInstanceOf(DisconnectedError)
    const unreachable: ApiDeps = {
      post: async () => ({ status: 200, json: {} }),
      get: async () => {
        throw new Error('refused')
      },
      timeZone: () => 'UTC',
    }
    expect(await createOfficialApi(unreachable).status()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// store：发布订阅 + revision CAS 守卫
// ---------------------------------------------------------------------------

describe('store', () => {
  it('get/set/subscribe：set 递增 revision 并通知', () => {
    const store = createStore({ count: 0 })
    const seen: number[] = []
    store.subscribe((snap) => seen.push(snap.revision))
    store.set({ count: 1 })
    expect(store.get()).toEqual({ count: 1 })
    expect(store.revision()).toBe(1)
    expect(seen).toEqual([1])
  })

  it('函数式 set 基于 prev', () => {
    const store = createStore(0)
    store.set((prev) => prev + 1)
    expect(store.get()).toBe(1)
  })

  it('revision CAS 守卫：期望不符拒绝写入（双端写冲突防线）', () => {
    const store = createStore('v0')
    store.set('v1') // revision 1
    expect(store.set('v2-from-stale', 0)).toBe(false)
    expect(store.get()).toBe('v1')
    expect(store.set('v2', 1)).toBe(true)
    expect(store.get()).toBe('v2')
  })

  it('subscribe 返回退订函数', () => {
    const store = createStore(0)
    const seen: number[] = []
    const unsubscribe = store.subscribe((snap) => seen.push(snap.value))
    store.set(1)
    unsubscribe()
    store.set(2)
    expect(seen).toEqual([1])
  })
})

// ---------------------------------------------------------------------------
// router：5 路由 + 浮层管理（hash 源注入，不依赖 window）
// ---------------------------------------------------------------------------

function fakeHashSource() {
  let hash = ''
  const listeners = new Set<() => void>()
  return {
    get: () => hash,
    set: (next: string) => {
      hash = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

describe('router', () => {
  it('5 路由匹配与参数提取', () => {
    const source = fakeHashSource()
    const router = createRouter(source)
    expect(router.current()).toBeNull()
    router.navigate('chat', { id: 's-1' })
    expect(router.current()).toEqual({ name: 'chat', params: { id: 's-1' } })
    for (const name of ['drawer', 'hero', 'settings', 'models'] as const) {
      router.navigate(name)
      expect(router.current()).toEqual({ name, params: {} })
    }
  })

  it('hash 变化驱动订阅（含未知 hash → null）', () => {
    const source = fakeHashSource()
    const router = createRouter(source)
    const seen: (string | null)[] = []
    router.subscribe((match) => seen.push(match?.name ?? null))
    source.set('#/chat/s-2')
    source.set('#/bogus')
    expect(seen).toEqual(['chat', null])
  })

  it('浮层不走路由：open/close 栈通知，同 id 顶替', () => {
    const router = createRouter(fakeHashSource())
    const snapshots: number[] = []
    router.subscribeOverlays((overlays) => snapshots.push(overlays.length))
    router.openOverlay('tasks', {})
    router.openOverlay('worker', {})
    router.openOverlay('tasks', {}) // 顶替重开
    expect(router.overlays().map((overlay) => overlay.id)).toEqual(['worker', 'tasks'])
    router.closeOverlay('worker')
    expect(router.overlays().map((overlay) => overlay.id)).toEqual(['tasks'])
    expect(snapshots).toEqual([1, 2, 2, 1])
  })

  it('dispose 退订 hash 源', () => {
    const source = fakeHashSource()
    const router = createRouter(source)
    const seen: (string | null)[] = []
    router.subscribe((match) => seen.push(match?.name ?? null))
    router.dispose()
    source.set('#/hero')
    expect(seen).toEqual([])
  })
})
