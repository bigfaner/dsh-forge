// flow-actions 单测 —— UF-3 组装动作面（2.10 AC1/AC2 的行为级自证）：
// 取消点干净退出（Hard Rules：任何取消路径 register 调用数 = 0——逐相位走查）、
// 确认执行一次性（双发第二击拦截）、执行中关闭意图 no-op、失败归一落位。
// setState 同形内存替身直落转移语义（form-actions.test 同形制）；register = 计数桩。
import { describe, expect, it } from 'vitest'
import type { RegisterProjectInput, RegisterResult } from '@dsh-forge/contracts'
import { RpcClientError } from '../../rpc/index.js'
import type { BrowserSelection } from './browser-model.js'
import { flowActions, type FlowActions, type RegisterSource } from './flow-actions.js'
import { initialFlowState, type FlowState } from './flow-model.js'

const SELECTION: BrowserSelection = { path: 'Z:\\project\\dsh', registered: false }
const INPUT: RegisterProjectInput = {
  workspaceDir: 'Z:\\project\\dsh',
  name: 'dsh',
  forgeDir: 'Z:\\project\\dsh\\.forge',
  knowledgeDir: 'Z:\\project\\dsh\\.knowledge',
}
const RESULT: RegisterResult = { projectId: 'p1', workspaceId: 'w1', attachedToExisting: false }

interface RegisterStub {
  readonly source: RegisterSource
  /** 手动放行挂起的 register promise（可控时序） */
  readonly resolve: (result: RegisterResult) => void
  readonly reject: (error: unknown) => void
  readonly calls: readonly RegisterProjectInput[]
}

function registerStub(): RegisterStub {
  const calls: RegisterProjectInput[] = []
  let release: { resolve(r: RegisterResult): void; reject(e: unknown): void } | null = null
  const source: RegisterSource = (input) => {
    calls.push(input)
    return new Promise<RegisterResult>((resolve, reject) => {
      release = { resolve, reject }
    })
  }
  return {
    source,
    resolve: (result) => {
      release?.resolve(result)
    },
    reject: (error) => {
      release?.reject(error)
    },
    get calls() {
      return calls
    },
  }
}

function harness(
  stub: RegisterStub = registerStub(),
  initial: FlowState = initialFlowState(),
): {
  readonly state: FlowState
  readonly actions: FlowActions
  readonly finished: number
  readonly stub: RegisterStub
} {
  let state = initial
  let finished = 0
  const actions = flowActions({
    register: stub.source,
    setState: (updater) => {
      state = updater(state)
    },
    getState: () => state,
    finish: () => {
      finished += 1
    },
  })
  return {
    get state() {
      return state
    },
    actions,
    get finished() {
      return finished
    },
    stub,
  }
}

/** 到 form 相位的真实路径 */
function atForm(stub?: RegisterStub) {
  const h = harness(stub)
  h.actions.pick(SELECTION)
  return h
}

describe('段转移（pick / back）', () => {
  it('段一确认 → form；返回上一步 → repick；重选 → form（selection 替换）', () => {
    const h = harness()
    h.actions.pick(SELECTION)
    expect(h.state.phase).toBe('form')
    h.actions.back()
    expect(h.state.phase).toBe('repick')
    h.actions.pick({ path: 'D:\\work\\alpha', registered: true })
    expect(h.state.phase).toBe('form')
    expect(h.state.selection?.path).toBe('D:\\work\\alpha')
  })
})

describe('取消点干净退出（AC1 + Hard Rules：register 零调用）', () => {
  it('段一（browser）直接关闭 → finish 通知，register 零调用', () => {
    const h = harness()
    h.actions.requestClose()
    expect(h.finished).toBe(1)
    expect(h.stub.calls.length).toBe(0)
  })

  it('段二（form）关闭 → 干净退出：register 零调用零状态副作用', () => {
    const h = atForm()
    h.actions.requestClose()
    expect(h.finished).toBe(1)
    expect(h.stub.calls.length).toBe(0)
    expect(h.state.phase).toBe('form') // 取消不改流程态（关闭由宿主收场）
  })

  it('返回上一步（repick）后关闭 → 同径干净退出', () => {
    const h = atForm()
    h.actions.back()
    h.actions.requestClose()
    expect(h.finished).toBe(1)
    expect(h.stub.calls.length).toBe(0)
  })

  it('cancel 显式入口同守卫：仅取消点窗口内有效', () => {
    const h = atForm()
    h.actions.cancel()
    expect(h.finished).toBe(1)
    expect(h.stub.calls.length).toBe(0)
  })
})

describe('确认执行（AC2：一次性 + 不可中断）', () => {
  it('确认 → executing + register 恰一次调用；resolve → success 落位', async () => {
    const h = atForm()
    h.actions.confirm(INPUT)
    expect(h.state.phase).toBe('executing')
    h.stub.resolve(RESULT)
    await Promise.resolve()
    await Promise.resolve()
    expect(h.state.phase).toBe('success')
    expect(h.state.result).toEqual(RESULT)
    expect(h.stub.calls.length).toBe(1)
    expect(h.finished).toBe(0) // 自动关闭归宿主定时器，非动作面
  })

  it('双发第二击拦截：连击两次 confirm → register 恰一次（一次性执行）', () => {
    const h = atForm()
    h.actions.confirm(INPUT)
    h.actions.confirm(INPUT)
    h.actions.confirm(INPUT)
    expect(h.stub.calls.length).toBe(1)
  })

  it('执行中（executing）关闭意图 no-op：Esc/✕/遮罩不可中断', () => {
    const h = atForm()
    h.actions.confirm(INPUT)
    h.actions.requestClose()
    expect(h.finished).toBe(0)
    expect(h.state.phase).toBe('executing')
  })

  it('成功相位关闭意图 no-op（收场 = 宿主自动关闭）', async () => {
    const h = atForm()
    h.actions.confirm(INPUT)
    h.stub.resolve(RESULT)
    await Promise.resolve()
    await Promise.resolve()
    h.actions.requestClose()
    expect(h.finished).toBe(0)
  })

  it('失败（typed RpcClientError·补偿已执行）→ failure 落位 + dismiss 收场', async () => {
    const h = atForm()
    h.actions.confirm(INPUT)
    h.stub.reject(
      new RpcClientError({
        code: 'ERR_PROJECT_WRITE',
        message: '写入失败',
        data: { compensated: { workspaceId: 'w1', reason: '③ 写入失败' } },
      }),
    )
    await Promise.resolve()
    await Promise.resolve()
    expect(h.state.phase).toBe('failure')
    expect(h.state.failure?.code).toBe('ERR_PROJECT_WRITE')
    expect(h.state.failure?.compensated).toBe(true)
    h.actions.requestClose() // 失败反馈关闭 = dismiss（事后关闭，非取消）
    expect(h.finished).toBe(1)
    expect(h.stub.calls.length).toBe(1)
  })

  it('失败（非 typed 错误）→ code null 兜底落位', async () => {
    const h = atForm()
    h.actions.confirm(INPUT)
    h.stub.reject(new Error('transport 缺席'))
    await Promise.resolve()
    await Promise.resolve()
    expect(h.state.phase).toBe('failure')
    expect(h.state.failure?.code).toBeNull()
    expect(h.state.failure?.message).toBe('transport 缺席')
  })

  it('register 同步抛（transport 工厂缺席等）同径落失败相位，不炸流程', () => {
    const boom: RegisterSource = () => {
      throw new Error('preload 缺席')
    }
    let state = initialFlowState()
    const actions = flowActions({
      register: boom,
      setState: (updater) => {
        state = updater(state)
      },
      getState: () => state,
      finish: () => {},
    })
    actions.pick(SELECTION)
    actions.confirm(INPUT)
    // async 体首段同步：同步抛即被捕获，同径落 failure 相位（code null 兜底）——不炸流程壳
    expect(state.phase).toBe('failure')
    expect(state.failure?.code).toBeNull()
    expect(state.failure?.message).toBe('preload 缺席')
  })

  it('取消点相位误触 confirm（browser/repick）→ register 零调用', () => {
    const h = harness()
    h.actions.confirm(INPUT) // browser 相位
    expect(h.stub.calls.length).toBe(0)
    const h2 = atForm()
    h2.actions.back()
    h2.actions.confirm(INPUT) // repick 相位
    expect(h2.stub.calls.length).toBe(0)
  })
})
