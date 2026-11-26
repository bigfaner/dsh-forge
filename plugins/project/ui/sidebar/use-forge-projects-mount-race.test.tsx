// use-forge-projects 装配时序竞速单测（real DOM 链路——createRoot + act；SSR 不跑 effect）：
// remote contribution 未落座期的首拉失败不算错误——保持 loading，落座后重取一次；落座后的
// 失败照常 error 相位（错误条 + 重试承接）。
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import {
  FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY,
  markForgeRemoteMountSettled,
  type RpcClientFactory,
} from '../rpc.js'
import { useForgeProjects, type ProjectsPhase } from './use-forge-projects.js'

/** 稳定刷新锚（内联字面量 = 每渲染新身份 → effect 重拉死循环） */
const REFRESH_KEY = {}

function Probe({ makeClient, onPhase }: { makeClient: RpcClientFactory; onPhase: (p: ProjectsPhase) => void }) {
  const [state] = useForgeProjects(REFRESH_KEY, makeClient)
  onPhase(state)
  return null
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Promise.resolve()
  })
}

describe('useForgeProjects 装配时序竞速（mount 未落座首拉失败）', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)[FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY]
  })
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY]
  })

  it('未落座首拉失败 → 保持 loading；落座后自动重取 → ready（零 error 相位）', async () => {
    let available = false
    let calls = 0
    const makeClient: RpcClientFactory = () => {
      calls += 1
      const client = { projects: { list: async () => {
        if (!available) throw new Error('官方 forge remote 面缺席（forgeProjects.list）')
        return []
      } } }
      return client as unknown as ReturnType<RpcClientFactory>
    }
    const seen: string[] = []
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => {
      root.render(<Probe makeClient={makeClient} onPhase={(p) => seen.push(p.phase)} />)
    })
    await flush()
    expect(seen).not.toContain('error')
    expect(calls).toBe(1)

    available = true
    await act(async () => {
      markForgeRemoteMountSettled()
    })
    await flush()
    expect(seen.at(-1)).toBe('ready')
    expect(calls).toBe(2)
    act(() => root.unmount())
  })

  it('已落座后的失败 → error 相位（真不可用，不自动重试）', async () => {
    markForgeRemoteMountSettled()
    let calls = 0
    const makeClient: RpcClientFactory = () => {
      calls += 1
      const client = { projects: { list: async () => {
        throw new Error('boom')
      } } }
      return client as unknown as ReturnType<RpcClientFactory>
    }
    const seen: ProjectsPhase[] = []
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => {
      root.render(<Probe makeClient={makeClient} onPhase={(p) => seen.push(p)} />)
    })
    await flush()
    expect(seen.at(-1)).toMatchObject({ phase: 'error', message: 'boom' })
    expect(calls).toBe(1)
    act(() => root.unmount())
  })
})
