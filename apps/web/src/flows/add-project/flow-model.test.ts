// flow-model 单测 —— UF-3 组装态机纯函数面（2.10 AC 全谱）：
// AC1 取消点窗口（browser/form/repick = 可取消；其余相位不可）与零副作用转移、
// AC2 一次性执行守卫（beginExecute 仅 form 相位放行——双发 no-op 的机制半边）、
// AC3 成功落位（result 携带）、AC4 失败落位 + typed error code → 文案映射
// （补偿已执行/挂接保护/补偿失败三口径 + 未知错误兜底）、AC5 关闭意图三分
// （cancel/dismiss/ignore——Esc/✕ 仅取消点窗口内有效的机制半边）、
// fix-3 模态宽度口径拆分（modalContentClassName：浏览器相位加宽 680——表单/终局相位基宽 560）。
import { describe, expect, it } from 'vitest'
import type { ErrorCode, RegisterResult } from '@dsh-forge/contracts'
import { RpcClientError } from '../../rpc/index.js'
import type { BrowserSelection } from './browser-model.js'
import type { RegisterProjectInput } from '@dsh-forge/contracts'
import {
  backToBrowser,
  beginExecute,
  closeIntentOf,
  failExecute,
  finishExecute,
  initialFlowState,
  isCancelPoint,
  modalContentClassName,
  registerFailureCopy,
  selectDirectory,
  toFlowFailure,
  type FlowState,
} from './flow-model.js'

const SELECTION: BrowserSelection = { path: 'Z:\\project\\dsh', registered: false }
const REPICK: BrowserSelection = { path: 'D:\\work\\alpha', registered: true }
const INPUT: RegisterProjectInput = {
  workspaceDir: 'Z:\\project\\dsh',
  name: 'dsh',
  forgeDir: 'Z:\\project\\dsh\\.forge',
  knowledgeDir: 'Z:\\project\\dsh\\.knowledge',
}
const RESULT: RegisterResult = { projectId: 'p1', workspaceId: 'w1', attachedToExisting: false }

/** 到达指定相位的捷径（走真实转移链——测守卫不测捷径本身） */
function atForm(): FlowState {
  return selectDirectory(initialFlowState(), SELECTION)
}
function atExecuting(): FlowState {
  return beginExecute(atForm(), INPUT) as FlowState
}

describe('初始态与段一 → 段二（selectDirectory）', () => {
  it('初始态 = browser 相位、零选择零载荷', () => {
    const state = initialFlowState()
    expect(state.phase).toBe('browser')
    expect(state.selection).toBeNull()
    expect(state.input).toBeNull()
    expect(state.result).toBeNull()
    expect(state.failure).toBeNull()
  })

  it('段一确认 → form 相位 + selection 落位', () => {
    const state = selectDirectory(initialFlowState(), SELECTION)
    expect(state.phase).toBe('form')
    expect(state.selection).toEqual(SELECTION)
  })

  it('返回上一步重选 → form 相位 + 新 selection 替换（联动判据 = selection.path 变化）', () => {
    const state = selectDirectory(backToBrowser(atForm()), REPICK)
    expect(state.phase).toBe('form')
    expect(state.selection).toEqual(REPICK)
  })
})

describe('返回上一步（backToBrowser：form → repick，AC5）', () => {
  it('form → repick：selection 保留（段一起始目录锚 + 表单保持挂载的判据）', () => {
    const state = backToBrowser(atForm())
    expect(state.phase).toBe('repick')
    expect(state.selection).toEqual(SELECTION)
  })

  it('非 form 相位 no-op（browser 重入/执行后误触不扰动状态）', () => {
    const browser = initialFlowState()
    expect(backToBrowser(browser)).toBe(browser)
    const executing = atExecuting()
    expect(backToBrowser(executing)).toBe(executing)
  })
})

describe('确认执行（beginExecute：AC2 一次性守卫的机制半边）', () => {
  it('form 相位 → executing + 确认载荷入态（成功反馈展示名依据）', () => {
    const state = beginExecute(atForm(), INPUT)
    expect(state).not.toBeNull()
    expect(state?.phase).toBe('executing')
    expect(state?.input).toEqual(INPUT)
  })

  it('非 form 相位一律 null（重复确认/取消点/终态不再放行第二次 register）', () => {
    expect(beginExecute(initialFlowState(), INPUT)).toBeNull() // browser（未到表单）
    expect(beginExecute(backToBrowser(atForm()), INPUT)).toBeNull() // repick（返回上一步后）
    expect(beginExecute(atExecuting(), INPUT)).toBeNull() // executing（双发第二击）
    expect(beginExecute(finishExecute(atExecuting(), RESULT), INPUT)).toBeNull() // success
  })
})

describe('执行落位（finish/fail：AC3/AC4 状态面）', () => {
  it('成功 → success 相位 + result 携带', () => {
    const state = finishExecute(atExecuting(), RESULT)
    expect(state.phase).toBe('success')
    expect(state.result).toEqual(RESULT)
  })

  it('失败 → failure 相位 + failure 携带', () => {
    const failure = { code: 'ERR_PROJECT_WRITE' as ErrorCode, message: 'x', compensated: true }
    const state = failExecute(atExecuting(), failure)
    expect(state.phase).toBe('failure')
    expect(state.failure).toEqual(failure)
  })
})

describe('取消点窗口（isCancelPoint / closeIntentOf：AC1 + AC5）', () => {
  it('取消点 = 两段对话框任一（browser / form / repick，均在 dsh create 之前）', () => {
    expect(isCancelPoint('browser')).toBe(true)
    expect(isCancelPoint('form')).toBe(true)
    expect(isCancelPoint('repick')).toBe(true)
    expect(isCancelPoint('executing')).toBe(false)
    expect(isCancelPoint('success')).toBe(false)
    expect(isCancelPoint('failure')).toBe(false)
  })

  it('关闭意图三分：取消点 → cancel；失败反馈 → dismiss（事后关闭≠取消）；执行中/成功 → ignore', () => {
    expect(closeIntentOf(initialFlowState())).toBe('cancel')
    expect(closeIntentOf(atForm())).toBe('cancel')
    expect(closeIntentOf(backToBrowser(atForm()))).toBe('cancel')
    expect(closeIntentOf(atExecuting())).toBe('ignore')
    expect(closeIntentOf(finishExecute(atExecuting(), RESULT))).toBe('ignore')
    expect(closeIntentOf(failExecute(atExecuting(), { code: null, message: 'x', compensated: false }))).toBe('dismiss')
  })
})

describe('模态宽度口径拆分（modalContentClassName：fix-3 浏览器相位加宽）', () => {
  it('浏览器相位（browser / repick）→ 基类 + 加宽修饰（680 刻度随 .dswf-ap-modal-wide）', () => {
    expect(modalContentClassName('browser')).toBe('dswf-ap-modal dswf-ap-modal-wide')
    expect(modalContentClassName('repick')).toBe('dswf-ap-modal dswf-ap-modal-wide')
  })

  it('表单与终局相位（form/executing/success/failure）→ 仅基类（560 基宽不动——Hard Rule）', () => {
    expect(modalContentClassName('form')).toBe('dswf-ap-modal')
    expect(modalContentClassName('executing')).toBe('dswf-ap-modal')
    expect(modalContentClassName('success')).toBe('dswf-ap-modal')
    expect(modalContentClassName('failure')).toBe('dswf-ap-modal')
  })
})

describe('typed error 归一（toFlowFailure：AC4 附载半边）', () => {
  it('RpcClientError → code + compensated 判定（data.compensated 存在 = 补偿已执行）', () => {
    const error = new RpcClientError({
      code: 'ERR_PROJECT_WRITE',
      message: '写入失败',
      data: { compensated: { workspaceId: 'w1', reason: '③ 写入失败' } },
    })
    expect(toFlowFailure(error)).toEqual({
      code: 'ERR_PROJECT_WRITE',
      message: '写入失败',
      compensated: true,
    })
  })

  it('RpcClientError 无补偿附载 → compensated=false；非 typed 错误 → code=null 原样文案', () => {
    expect(toFlowFailure(new RpcClientError({ code: 'ERR_WORKSPACE_CREATE', message: '中止' }))).toEqual({
      code: 'ERR_WORKSPACE_CREATE',
      message: '中止',
      compensated: false,
    })
    expect(toFlowFailure(new Error('通道缺席'))).toEqual({ code: null, message: '通道缺席', compensated: false })
  })
})

describe('失败文案映射（registerFailureCopy：AC4 typed error code → 文案）', () => {
  it('ERR_WORKSPACE_CREATE：创建中止、无补偿需要', () => {
    const copy = registerFailureCopy({ code: 'ERR_WORKSPACE_CREATE', message: 'm', compensated: false })
    expect(copy.title).toContain('工作区创建失败')
    expect(copy.detail).toContain('无需补偿')
  })

  it('ERR_PROJECT_WRITE + 补偿已执行：补偿说明在场（dsh 侧零孤儿口径）', () => {
    const copy = registerFailureCopy({ code: 'ERR_PROJECT_WRITE', message: 'm', compensated: true })
    expect(copy.title).toContain('补偿已执行')
    expect(copy.detail).toContain('补偿')
    expect(copy.detail).toContain('无残留')
  })

  it('ERR_PROJECT_WRITE 无补偿（挂接既有受保护）：既有工作区不受影响口径', () => {
    const copy = registerFailureCopy({ code: 'ERR_PROJECT_WRITE', message: 'm', compensated: false })
    expect(copy.title).not.toContain('补偿已执行')
    expect(copy.detail).toContain('挂接')
  })

  it('ERR_COMPENSATION：记账 + 启动对账提示（孤儿不自动删）口径', () => {
    const copy = registerFailureCopy({ code: 'ERR_COMPENSATION', message: 'm', compensated: false })
    expect(copy.title).toContain('补偿')
    expect(copy.detail).toContain('对账')
    expect(copy.detail).toContain('不自动删')
  })

  it('未知错误（code=null / 知识域码不属注册面）→ 兜底文案', () => {
    const copy = registerFailureCopy({ code: null, message: 'm', compensated: false })
    expect(copy.title).toContain('注册失败')
    expect(copy.detail).not.toBe('')
  })
})
