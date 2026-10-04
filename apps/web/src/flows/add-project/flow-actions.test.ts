// flow-actions 单测 —— UF-3 组装动作面（2.10 AC1/AC2 + fix-14 段一原生选取 + fix-16 入口
// 直达的行为级自证）：取消点干净退出（Hard Rules：任何取消路径 register 调用数 = 0——
// 逐相位走查）、确认执行一次性（双发第二击拦截）、执行中关闭意图 no-op、失败归一落位、
// 原生选取（官方 __DSH_DIRECTORY_PICKER__ 桥主路径）：选中 canonical 对账落 form /
// 取消回落起源零副作用 / 双击第二击拦截 / 迟到结果丢弃 / pick·对账失败错误面；
// 打开直达（fix-16）：桥在场 open 直入 native-pick（模态不出场 reveal 零通知）+ 选中
// reveal 开表单相位模态 + 取消干净退出 + 在途重入守卫 + 桥缺席现行形态零变化。
// setState 同形内存替身直落转移语义（form-actions.test 同形制）；register = 计数桩。
import { describe, expect, it } from 'vitest'
import type { DirListing, RegisterProjectInput, RegisterResult } from '@dsh-forge/contracts'
import { RpcClientError } from '../../rpc/index.js'
import type { BrowserSelection } from './browser-model.js'
import { flowActions, type FlowActions, type FlowActionsDeps, type RegisterSource } from './flow-actions.js'
import type { DirSource } from './dir-source.js'
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
  native?: Partial<Pick<FlowActionsDeps, 'nativePick' | 'dirSource' | 'getRegisteredPaths' | 'reveal'>>,
): {
  readonly state: FlowState
  readonly actions: FlowActions
  readonly finished: number
  /** 模态开面通知计数（fix-16 直达收场观测：选中/失败开模态、取消不开） */
  readonly reveals: number
  readonly stub: RegisterStub
  /** 流程态直写（迟到守卫模拟：流程收场/重开复位） */
  readonly resetState: (next: FlowState) => void
} {
  let state = initial
  let finished = 0
  let reveals = 0
  const actions = flowActions({
    register: stub.source,
    setState: (updater) => {
      state = updater(state)
    },
    getState: () => state,
    finish: () => {
      finished += 1
    },
    reveal: () => {
      reveals += 1
    },
    ...native,
  })
  return {
    get state() {
      return state
    },
    actions,
    get finished() {
      return finished
    },
    get reveals() {
      return reveals
    },
    stub,
    resetState: (next) => {
      state = next
    },
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

/** 手动放行的原生选取桩（可控时序——对话框在途模拟） */
interface PickStub {
  readonly source: () => Promise<string | null>
  readonly settle: (outcome: string | null | Error) => void
}

function pickStub(): PickStub {
  let release: ((outcome: string | null | Error) => void) | null = null
  return {
    source: () =>
      new Promise<string | null>((resolve, reject) => {
        release = (outcome) => {
          if (outcome instanceof Error) reject(outcome)
          else resolve(outcome)
        }
      }),
    settle: (outcome) => {
      release?.(outcome)
    },
  }
}

/** canonical 对账桩：listDir(path) → listing.path（对账口径 = 不信输入原样） */
function dirSourceOf(canonical: string): DirSource & { calls: string[] } {
  const calls: string[] = []
  const source: DirSource = async (dirPath) => {
    calls.push(dirPath ?? '')
    const listing: DirListing = { path: canonical, parentPath: null, entries: [] }
    return listing
  }
  return Object.assign(source, { calls })
}

describe('段一原生选取（fix-14：官方桥主路径）', () => {
  it('选中 → canonical 对账落 form（listing.path 为准 + 已注册集合判挂接预演标记）', async () => {
    const pick = pickStub()
    const dirSource = dirSourceOf('D:\\work\\ALPHA') // host canonical 化（大小写对账）
    const registered = new Set(['D:\\work\\ALPHA'])
    const h = harness(registerStub(), initialFlowState(), {
      nativePick: pick.source,
      dirSource,
      getRegisteredPaths: () => registered,
    })
    h.actions.nativePick()
    expect(h.state.phase).toBe('native-pick') // 在途态（按钮禁用防双开）
    pick.settle('D:\\work\\alpha')
    await Promise.resolve()
    await Promise.resolve()
    expect(dirSource.calls).toEqual(['D:\\work\\alpha']) // 对账请求 = 桥原样路径
    expect(h.state.phase).toBe('form')
    expect(h.state.selection).toEqual({ path: 'D:\\work\\ALPHA', registered: true }) // canonical + 预演标记
  })

  it('取消（null）→ 回落起源相位零副作用：browser 起源回 browser，selection 保持 null', async () => {
    const pick = pickStub()
    const h = harness(registerStub(), initialFlowState(), { nativePick: pick.source, dirSource: dirSourceOf('X:') })
    h.actions.nativePick()
    pick.settle(null)
    await Promise.resolve()
    expect(h.state.phase).toBe('browser')
    expect(h.state.selection).toBeNull()
    expect(h.stub.calls.length).toBe(0)
  })

  it('repick 起源取消 → 回 repick（表单挂载判据 selection 保持）——未改选不扰动表单', async () => {
    const pick = pickStub()
    const h0 = atForm()
    const h = harness(h0.stub, initialFlowState(), { nativePick: pick.source, dirSource: dirSourceOf('X:') })
    h.actions.pick(SELECTION)
    h.actions.back() // → repick（selection = SELECTION）
    h.actions.nativePick()
    pick.settle(null)
    await Promise.resolve()
    expect(h.state.phase).toBe('repick')
    expect(h.state.selection).toEqual(SELECTION)
  })

  it('双击第二击拦截：在途第二击 → pick 源恰一次调用（防双开系统对话框）', () => {
    const pick = pickStub()
    let invoked = 0
    const source = () => {
      invoked += 1
      return pick.source()
    }
    const h = harness(registerStub(), initialFlowState(), { nativePick: source, dirSource: dirSourceOf('X:') })
    h.actions.nativePick()
    h.actions.nativePick() // 双击第二击
    expect(invoked).toBe(1)
    expect(h.state.phase).toBe('native-pick')
  })

  it('迟到结果丢弃：在途流程收场重开（相位复位）后 resolve → 不落 form（守卫半边）', async () => {
    const pick = pickStub()
    const h = harness(registerStub(), initialFlowState(), { nativePick: pick.source, dirSource: dirSourceOf('D:\\x') })
    h.actions.nativePick()
    h.resetState(initialFlowState()) // 模拟关闭后重开（openFlow 复位段一）
    pick.settle('D:\\x')
    await Promise.resolve()
    await Promise.resolve()
    expect(h.state.phase).toBe('browser') // 迟到结果不复活流程态
  })

  it('pick 失败（reject = 错误面）→ 回落起源 + 错误文案呈现；register 零调用', async () => {
    const pick = pickStub()
    const h = harness(registerStub(), initialFlowState(), { nativePick: pick.source, dirSource: dirSourceOf('X:') })
    h.actions.nativePick()
    pick.settle(new Error('E:\\gone 不可达'))
    await Promise.resolve()
    expect(h.state.phase).toBe('browser')
    expect(h.state.nativePickError).toBe('E:\\gone 不可达')
    expect(h.stub.calls.length).toBe(0)
  })

  it('对账失败（listDir 不可达）→ 同错误面回落（canonical 不造假）', async () => {
    const pick = pickStub()
    const dirSource: DirSource = async () => {
      throw new Error('目录列举失败')
    }
    const h = harness(registerStub(), initialFlowState(), { nativePick: pick.source, dirSource })
    h.actions.nativePick()
    pick.settle('E:\\gone')
    await Promise.resolve()
    await Promise.resolve()
    expect(h.state.phase).toBe('browser')
    expect(h.state.nativePickError).toBe('目录列举失败')
  })

  it('桥缺席（deps 未注入原生面）→ nativePick no-op（View 已回退浏览器，动作面防御）', () => {
    const h = harness()
    h.actions.nativePick()
    expect(h.state.phase).toBe('browser')
  })
})

describe('打开直达（fix-16：桥在场冷启直开系统 OS 目录对话框——模态不出场）', () => {
  it('open 桥在场 → 直入 native-pick 在途（不经 browser 相位模态起步）+ pick 即时恰一次 + reveal 零通知（模态不出场）', () => {
    const pick = pickStub()
    let invoked = 0
    const source = () => {
      invoked += 1
      return pick.source()
    }
    const h = harness(registerStub(), initialFlowState(), { nativePick: source, dirSource: dirSourceOf('X:') })
    h.actions.open()
    expect(invoked).toBe(1) // pick 即时触发（系统对话框直开）
    expect(h.state.phase).toBe('native-pick') // 在途态（冷启直入，不经过 browser 模态相位）
    expect(h.reveals).toBe(0) // 模态不出场
  })

  it('流程残态复位：success 终局残态 open → 复位后直入 native-pick（fresh browser 起源，上次流程不携带）', () => {
    const pick = pickStub()
    const stale: FlowState = {
      phase: 'success',
      selection: SELECTION,
      input: INPUT,
      result: RESULT,
      failure: null,
      nativePickError: null,
    }
    const h = harness(registerStub(), stale, { nativePick: pick.source, dirSource: dirSourceOf('X:') })
    h.actions.open()
    expect(h.state.phase).toBe('native-pick')
    expect(h.state.selection).toBeNull() // 残态清零——取消将回落 browser 而非 repick
    expect(h.state.result).toBeNull()
  })

  it('选中 → canonical 对账落 form + reveal 通知恰一次（模态开在表单相位）', async () => {
    const pick = pickStub()
    const dirSource = dirSourceOf('D:\\work\\ALPHA')
    const h = harness(registerStub(), initialFlowState(), { nativePick: pick.source, dirSource })
    h.actions.open()
    pick.settle('D:\\work\\alpha')
    await Promise.resolve()
    await Promise.resolve()
    expect(h.state.phase).toBe('form')
    expect(h.state.selection).toEqual({ path: 'D:\\work\\ALPHA', registered: false }) // canonical 对账
    expect(h.reveals).toBe(1) // 落点成功才开模态（表单相位）
  })

  it('取消（null）→ 回落 browser 零副作用 + reveal 零通知（干净退出零模态残留）+ register 零调用', async () => {
    const pick = pickStub()
    const h = harness(registerStub(), initialFlowState(), { nativePick: pick.source, dirSource: dirSourceOf('X:') })
    h.actions.open()
    pick.settle(null)
    await Promise.resolve()
    expect(h.state.phase).toBe('browser') // 取消点语义前移到 OS 对话框——回落零副作用
    expect(h.state.selection).toBeNull()
    expect(h.reveals).toBe(0) // 不开模态（零模态残留）
    expect(h.stub.calls.length).toBe(0)
  })

  it('pick 失败（reject）→ 回落 browser 带错误面 + reveal 通知（模态开在 browser 相位呈现现行错误面）', async () => {
    const pick = pickStub()
    const h = harness(registerStub(), initialFlowState(), { nativePick: pick.source, dirSource: dirSourceOf('X:') })
    h.actions.open()
    pick.settle(new Error('桥握手失败'))
    await Promise.resolve()
    expect(h.state.phase).toBe('browser')
    expect(h.state.nativePickError).toBe('桥握手失败')
    expect(h.reveals).toBe(1) // 失败面开模态（NativePickPanel 错误 + 重试按钮）
  })

  it('对账失败（listDir 不可达）→ 同径错误面回落 + reveal 通知', async () => {
    const pick = pickStub()
    const dirSource: DirSource = async () => {
      throw new Error('目录列举失败')
    }
    const h = harness(registerStub(), initialFlowState(), { nativePick: pick.source, dirSource })
    h.actions.open()
    pick.settle('E:\\gone')
    await Promise.resolve()
    await Promise.resolve()
    expect(h.state.phase).toBe('browser')
    expect(h.state.nativePickError).toBe('目录列举失败')
    expect(h.reveals).toBe(1)
  })

  it('在途重入守卫：native-pick 在途期入口再点 open → pick 源仍恰一次（防双开系统对话框）', () => {
    const pick = pickStub()
    let invoked = 0
    const source = () => {
      invoked += 1
      return pick.source()
    }
    const h = harness(registerStub(), initialFlowState(), { nativePick: source, dirSource: dirSourceOf('X:') })
    h.actions.open()
    h.actions.open() // 在途再点入口（防御面——OS 对话框应用级模态下自然被阻）
    expect(invoked).toBe(1)
    expect(h.state.phase).toBe('native-pick')
  })

  it('桥缺席 → open 即 reveal（现行形态零变化：模态 browser 相位内嵌浏览器起步）', () => {
    const h = harness()
    h.actions.open()
    expect(h.reveals).toBe(1)
    expect(h.state.phase).toBe('browser')
    expect(h.state.selection).toBeNull()
  })
})
