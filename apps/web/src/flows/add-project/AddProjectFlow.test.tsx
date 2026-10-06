// AddProjectFlow 单测 —— UF-3 组装（2.10）：AddProjectFlowView 纯渲染面逐相位静态标记
// （两段浏览器 ⇄ 表单 / 执行态不可交互 / 成功·失败反馈）+ 默认注册源 fail-soft +
// 成功自动关闭时序注入面 + fix-14 段一原生选取（桥在场 → 按钮面/在途/错误回落；桥缺席 →
// 回退内嵌浏览器零变化——官方 -browse 双面同型）。renderToStaticMarkup 纯渲染面（同 2.8/2.9
// 测法）；态机转移语义在 flow-model/flow-actions 单测；模态壳（官方 Modal 门户）effect 面
// 静态渲染不可达——发布缝时序见 flow-open 单测，壳 JSX 行余量同 2.9 记录口径。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DirListing, RegisterProjectInput, RegisterResult } from '@dsh-forge/contracts'
import type { BrowserSelection } from './browser-model.js'
import {
  AddProjectFlow,
  DEFAULT_SUCCESS_AUTOCLOSE_MS,
  loadRegisteredPaths,
  rpcRegisteredPathsSource,
  AddProjectFlowView,
  type AddProjectFlowViewProps,
} from './AddProjectFlow.js'
import {
  backToBrowser,
  beginExecute,
  beginNativePick,
  endNativePick,
  failExecute,
  finishExecute,
  initialFlowState,
  selectDirectory,
  type FlowState,
} from './flow-model.js'

const SELECTION: BrowserSelection = { path: 'Z:\\project\\dsh', registered: false }
const INPUT: RegisterProjectInput = {
  workspaceDir: 'Z:\\project\\dsh',
  name: 'dsh',
  forgeDir: 'Z:\\project\\dsh\\.forge',
  knowledgeDir: 'Z:\\project\\dsh\\.knowledge',
}
const RESULT: RegisterResult = { projectId: 'p1', workspaceId: 'w1', attachedToExisting: false }
const REGISTERED: ReadonlySet<string> = new Set(['D:\\already'])
const EMPTY_LISTING: DirListing = { path: 'Z:\\project', parentPath: null, entries: [] }

/** 走真实转移链构造各相位态（捷径即被测转移本身——flow-model 已钉守卫） */
function stateAt(build: (base: FlowState) => FlowState): FlowState {
  return build(initialFlowState())
}
const AT_FORM = (): FlowState => stateAt((s) => selectDirectory(s, SELECTION))
const AT_REPICK = (): FlowState => stateAt((s) => backToBrowser(selectDirectory(s, SELECTION)))
const AT_EXECUTING = (): FlowState =>
  stateAt((s) => beginExecute(selectDirectory(s, SELECTION), INPUT) as FlowState)
const AT_SUCCESS = (): FlowState =>
  stateAt((s) => finishExecute(beginExecute(selectDirectory(s, SELECTION), INPUT) as FlowState, RESULT))
const AT_FAILURE = (code: FlowState['failure']): FlowState =>
  stateAt((s) =>
    failExecute(beginExecute(selectDirectory(s, SELECTION), INPUT) as FlowState, code as NonNullable<FlowState['failure']>),
  )

function view(state: FlowState, overrides: Partial<AddProjectFlowViewProps> = {}): string {
  const props: AddProjectFlowViewProps = {
    state,
    registeredPaths: REGISTERED,
    onPick: () => {},
    onBack: () => {},
    onSubmit: () => {},
    onDismissFailure: () => {},
    ...overrides,
  }
  return renderToStaticMarkup(<AddProjectFlowView {...props} />)
}

describe('段一（browser）：文件浏览器内嵌 + 已注册标记接线', () => {
  const markup = view(initialFlowState())

  it('流程锚 + 浏览器锚在场，段一脚径（下一步）；无表单/反馈锚', () => {
    expect(markup).toContain('data-dswf-ap="browser"')
    expect(markup).toContain('data-dswf-fb="browser"')
    expect(markup).toContain('下一步')
    expect(markup).not.toContain('data-dswf-rf="form"')
    expect(markup).not.toContain('data-dswf-ap="executing"')
  })

  it('已注册路径集合透传（预检可视化数据源——2.8 registeredPaths 接线点）', () => {
    expect(markup).toContain('已注册')
    expect(markup).toContain('标记「已注册」的目录将挂接既有工作区')
  })
})

describe('段二（form）：步骤条 + 表单内嵌', () => {
  const markup = view(AT_FORM())

  it('步骤条：第二步标题 + 「返回上一步」（AC5 浏览器⇄表单）；浏览器面板退场', () => {
    expect(markup).toContain('data-dswf-ap="form"')
    expect(markup).toContain('第二步')
    expect(markup).toContain('返回上一步')
    expect(markup).not.toContain('data-dswf-fb="browser"')
  })

  it('表单本体在场（确认提交点透传）且不隐藏', () => {
    expect(markup).toContain('data-dswf-rf="form"')
    expect(markup).toContain('确认')
    // keepalive 容器无 hidden 属性（aria-hidden 派生行骨架为装饰面——4.3 起在场）
    expect(markup).not.toMatch(/<div class="dswf-ap-form"[^>]*\shidden/)
  })
})

describe('返回上一步（repick）：表单保持挂载保已填状态（AC5）', () => {
  const markup = view(AT_REPICK())

  it('浏览器重开（重选口径 = 选择此文件夹）+ 起始目录 = 当前工作区', () => {
    expect(markup).toContain('data-dswf-ap="repick"')
    expect(markup).toContain('data-dswf-fb="browser"')
    expect(markup).toContain('选择此文件夹')
    expect(markup).toContain('title="Z:\\project\\dsh"') // startDir → nav.cwd 面包屑锚
  })

  it('表单锚仍在场（同位元素不重挂——状态保留机制）且隐藏包裹', () => {
    expect(markup).toContain('data-dswf-rf="form"')
    const wrapper = markup.match(/<div[^>]*data-dswf-ap-keepalive[^>]*>/)?.[0] ?? ''
    expect(wrapper).toContain('hidden')
  })
})

describe('段一原生选取（fix-14：桥在场 → 按钮面替换浏览器；桥缺席零变化）', () => {
  const AT_NATIVE_FROM_BROWSER = (): FlowState => stateAt((s) => beginNativePick(s) as FlowState)
  const AT_NATIVE_FROM_REPICK = (): FlowState =>
    stateAt((s) => beginNativePick(backToBrowser(selectDirectory(s, SELECTION))) as FlowState)
  const AT_LANDED_ERROR = (): FlowState =>
    stateAt((s) => endNativePick(beginNativePick(s) as FlowState, 'E:\\gone 不可达') as FlowState)

  it('桥在场 browser 相位：原生面板（按钮 = 选择工作区目录）替换内嵌浏览器', () => {
    const markup = view(initialFlowState(), { nativePickEnabled: true, onNativePick: () => {} })
    expect(markup).toContain('data-dswf-np="panel"')
    expect(markup).toContain('data-dswf-np-origin="browser"')
    expect(markup).toContain('选择工作区目录')
    expect(markup).toContain('系统') // 主路径说明（OS 原生交互提示）
    expect(markup).not.toContain('data-dswf-fb="browser"') // 内嵌浏览器退场（主路径）
    expect(markup).not.toContain('data-dswf-np-busy')
  })

  it('桥在场 repick 起源：origin=repick + 联动语义提示 + 表单保持隐藏挂载', () => {
    const markup = view(AT_REPICK(), { nativePickEnabled: true, onNativePick: () => {} })
    expect(markup).toContain('data-dswf-np-origin="repick"')
    expect(markup).toContain('未手改的表单字段将随新工作区重构')
    expect(markup).toContain('data-dswf-rf="form"') // 表单挂载保持（隐藏同位元素）
    const wrapper = markup.match(/<div[^>]*data-dswf-ap-keepalive[^>]*>/)?.[0] ?? ''
    expect(wrapper).toContain('hidden')
  })

  it('在途相位（native-pick）：busy 锚 + 按钮禁用（防双开对话框）+ 在途提示', () => {
    const markup = view(AT_NATIVE_FROM_BROWSER(), { nativePickEnabled: true })
    expect(markup).toContain('data-dswf-ap="native-pick"')
    expect(markup).toContain('data-dswf-np-busy')
    const pick = markup.match(/<button[^>]*dswf-np-pick[^>]*>/)?.[0] ?? ''
    expect(pick).toContain('disabled')
    expect(markup).toContain('对话框已打开')
  })

  it('repick 起源在途：表单隐藏挂载保持（对话框往返不丢已填状态）', () => {
    const markup = view(AT_NATIVE_FROM_REPICK(), { nativePickEnabled: true })
    expect(markup).toContain('data-dswf-ap="native-pick"')
    expect(markup).toContain('data-dswf-rf="form"')
    const wrapper = markup.match(/<div[^>]*data-dswf-ap-keepalive[^>]*>/)?.[0] ?? ''
    expect(wrapper).toContain('hidden')
  })

  it('失败回落（endNativePick 带文案）：起源相位 + 错误行 role=alert 呈现', () => {
    const markup = view(AT_LANDED_ERROR(), { nativePickEnabled: true })
    expect(markup).toContain('data-dswf-ap="browser"') // 回落起源相位
    expect(markup).toContain('data-dswf-np-error')
    expect(markup).toContain('目录选择失败：E:\\gone 不可达')
    expect(markup).not.toContain('data-dswf-np-busy') // 非在途（可再开对话框）
  })

  it('桥缺席：browser/repick/native-pick 相位均渲染内嵌浏览器（回退面零变化——官方 -browse 双面同型）', () => {
    const fallback = view(initialFlowState())
    expect(fallback).toContain('data-dswf-fb="browser"')
    expect(fallback).not.toContain('data-dswf-np=')
    expect(view(AT_REPICK())).toContain('data-dswf-fb="browser"')
  })
})

describe('执行态（executing）：不可交互中断 + 进度指示（AC2/AC3 States）', () => {
  const markup = view(AT_EXECUTING())

  it('执行锚 + aria-busy + 活性指示文案（官方 TextShimmer 承载）', () => {
    expect(markup).toContain('data-dswf-ap="executing"')
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('正在注册项目')
    expect(markup).toContain('不可中断')
  })

  it('零交互路径：无确认/下一步/返回按钮，无浏览器与表单锚', () => {
    expect(markup).not.toContain('data-dswf-rf="form"')
    expect(markup).not.toContain('data-dswf-fb="browser"')
    expect(markup).not.toContain('返回上一步')
    expect(markup).not.toMatch(/>(下一步|确认)</)
  })
})

describe('成功反馈（success：AC3）', () => {
  it('成功锚 + 徽章 + 项目名 + 自动关闭说明（role=status）', () => {
    const markup = view(AT_SUCCESS())
    expect(markup).toContain('data-dswf-ap="success"')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('注册成功')
    expect(markup).toContain('dsh') // 确认载荷项目名
    expect(markup).toContain('自动关闭')
  })

  it('挂接既有 vs 本次新建两口径随 attachedToExisting', () => {
    const attached = view(
      stateAt((s) =>
        finishExecute(
          beginExecute(selectDirectory(s, SELECTION), INPUT) as FlowState,
          { ...RESULT, attachedToExisting: true },
        ),
      ),
    )
    expect(attached).toContain('挂接既有工作区')
    expect(view(AT_SUCCESS())).toContain('已创建新工作区')
  })
})

describe('失败反馈（failure：AC4 typed 文案 + 关闭路径）', () => {
  it('失败锚 + role=alert + 归类标题 + 补偿说明 + 原始原因 + 关闭钮', () => {
    const markup = view(
      AT_FAILURE({ code: 'ERR_PROJECT_WRITE', message: 'disk full', compensated: true }),
    )
    expect(markup).toContain('data-dswf-ap="failure"')
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('补偿已执行')
    expect(markup).toContain('无残留')
    expect(markup).toContain('disk full')
    expect(markup).toContain('关闭')
  })

  it('补偿失败口径（ERR_COMPENSATION：记账 + 对账提示）', () => {
    const markup = view(AT_FAILURE({ code: 'ERR_COMPENSATION', message: 'x', compensated: false }))
    expect(markup).toContain('已记账')
    expect(markup).toContain('对账')
  })
})

describe('数据源 fail-soft 与时序注入面', () => {
  it('loadRegisteredPaths：源失败 → 空集（标记缺席不炸流程——浏览器仍可用）', async () => {
    const phase = await loadRegisteredPaths(() => {
      throw new Error('RPC 不可达')
    })
    expect(phase.size).toBe(0)
  })

  it('loadRegisteredPaths：就绪 → ws_path 全集（registeredPathsOf 接线）', async () => {
    const phase = await loadRegisteredPaths(async () => [
      { id: 'p1', workspaceId: 'w1', name: 'a', wsPath: 'D:\\already', archived: false },
      { id: 'p2', workspaceId: 'w2', name: 'b', wsPath: 'E:\\gone', archived: true },
    ])
    expect(phase.has('D:\\already')).toBe(true)
    expect(phase.has('E:\\gone')).toBe(true) // 含 archived——core ① 预检无 archived 维
    expect(phase.size).toBe(2)
  })

  it('缺省已注册源（RPC 真身）在 preload 缺席载体 → fail-soft 收敛空集', async () => {
    const phase = await loadRegisteredPaths(rpcRegisteredPathsSource())
    expect(phase.size).toBe(0)
  })

  it('成功自动关闭缺省时序常量在场（宿主注入覆盖面）', () => {
    expect(DEFAULT_SUCCESS_AUTOCLOSE_MS).toBeGreaterThan(0)
  })
})

describe('模态壳（AddProjectFlow：关闭态静态面）', () => {
  it('关闭态渲染 = 空串（官方 Modal open=false → null；打开经页内缝/effect 面——flow-open 单测）', () => {
    const markup = renderToStaticMarkup(
      <AddProjectFlow register={async () => RESULT} dirSource={async () => EMPTY_LISTING} />,
    )
    expect(markup).toBe('')
  })
})
