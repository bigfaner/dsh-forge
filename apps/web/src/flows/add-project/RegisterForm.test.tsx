// RegisterForm 单测 —— UF-3 段二（AC1 回填/默认值 / AC3 仓内外 chip 无 radio /
// AC5 非法路径表单态拦截 + 确认禁用 / AC6 无默认召回域 +「确认」文案 / BrowsePanel
// 复用面 / 装配壳初始渲染 + fix-14 工作区已注册挂接提示与原生改选在途/错误面 +
// 4.3 派生行 RPC 化：DerivedTaskStoreRow 嵌入 + 相位驱动确认门（疑似移动拒绝零副作用，
// 复检通过恢复——AC1/AC2/AC3/AC4；相位映射单测在 derive-source.test，行内三态呈现
// 单测在 derived-store-row.test，本件 = 接线面）。
// renderToStaticMarkup 纯渲染面（同 2.8 测法——effect 不跑：装配壳初始恒 loading 骨架）；
// 派生/联动/校验语义面在 form-model.test。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SuspectedMoveData } from '@dsh-forge/contracts'
import type { BrowserSelection } from './browser-model.js'
import { initialFormState, type FormIssue, type FormValues } from './form-model.js'
import { BrowsePanel, RegisterForm, RegisterFormView } from './RegisterForm.js'

const SELECTION: BrowserSelection = { path: 'Z:\\project\\dsh', registered: false }
const VALUES: FormValues = initialFormState(SELECTION).values
// RPC 下发形态（{tasksHome}/{flatten}@{hash8} 单源——AC4 SC2 断言锚口径）
const DERIVED_DIR = 'Z:\\forge-workspaces\\Z-project-dsh@a1b2c3d4'
const MOVE_DATA: SuspectedMoveData = {
  existingDir: 'Z:\\forge-workspaces\\Z-project-dsh@e5f6a7b8',
  derivedDir: DERIVED_DIR,
  guidance:
    '疑似移动：本次推导目录 Z:\\forge-workspaces\\Z-project-dsh@a1b2c3d4，但同扁平化主体异 hash8 目录 ' +
    'Z:\\forge-workspaces\\Z-project-dsh@e5f6a7b8 已在场。请手工处置：删除孤儿目录，或将工作区改回原路径后重试。',
}

function view(overrides: Partial<Parameters<typeof RegisterFormView>[0]> = {}): string {
  const props: Parameters<typeof RegisterFormView>[0] = {
    values: VALUES,
    issues: [],
    taskStorePhase: { state: 'ready', dir: DERIVED_DIR },
    forgeDirExternal: false,
    onEdit: () => {},
    onRepick: () => {},
    onBrowse: () => {},
    onSubmit: () => {},
    ...overrides,
  }
  return renderToStaticMarkup(<RegisterFormView {...props} />)
}

function confirmBtn(markup: string): string {
  return markup.match(/<button[^>]*dswf-rf-confirm[^>]*>/)?.[0] ?? ''
}

describe('AC1 回填与默认值（View 静态结构）', () => {
  const markup = view()

  it('工作区目录只读回填 + 「重新选择」钮；项目名 = 文件夹名可改', () => {
    expect(markup).toContain('data-dswf-rf="form"')
    expect(markup).toContain('data-dswf-rf-ws')
    expect(markup).toContain('readonly=""')
    expect(markup).toContain('value="Z:\\project\\dsh"')
    expect(markup).toContain('重新选择')
    expect(markup).toContain('data-dswf-rf-name')
    expect(markup).toContain('value="dsh"')
  })

  it('forge 目录 / 知识库目录默认值 + 各带「浏览…」改选钮', () => {
    expect(markup).toContain('data-dswf-rf-forge')
    expect(markup).toContain('value="Z:\\project\\dsh\\.forge"')
    expect(markup).toContain('data-dswf-rf-kn')
    expect(markup).toContain('value="Z:\\project\\dsh\\.knowledge"')
    expect(markup.match(/浏览…/g)?.length).toBe(2)
  })

  it('任务清单与记录：DerivedTaskStoreRow 嵌入（4.3 整行替换——RPC 下发值逐字呈现，非 input value）', () => {
    expect(markup).toContain('data-dswf-dsr="ready"')
    expect(markup).toContain('任务清单与记录（自动派生 · 无需填写）')
    expect(markup).toContain(`>${DERIVED_DIR}</`)
    // 旧派生行（input value 自算呈现）废除
    expect(markup).not.toContain('data-dswf-rf-tasks')
  })
})

describe('AC2/AC4 派生行 RPC 化（相位驱动——单源下发逐字呈现）', () => {
  it('ready：RPC dir 逐字呈现（与实际建库位置逐字一致——SC2 断言锚：@ 连接符 + hash8 尾段）', () => {
    const markup = view({ taskStorePhase: { state: 'ready', dir: DERIVED_DIR } })
    expect(markup).toContain('data-dswf-dsr="ready"')
    expect(markup).toContain(`>${DERIVED_DIR}</`)
    expect(markup).toContain('Z-project-dsh@a1b2c3d4')
  })

  it('疑似移动：错误条 + 手工指引留场 + 「确认」禁用（拒绝零副作用——非可用确认面）', () => {
    const markup = view({ taskStorePhase: { state: 'suspected-move', data: MOVE_DATA } })
    expect(markup).toContain('data-dswf-dsr="suspected-move"')
    expect(markup).toContain('data-dswf-dsr-error')
    expect(markup).toContain(MOVE_DATA.guidance) // 指引留场（重选目录前不消退）
    expect(confirmBtn(markup)).toContain('disabled')
    expect(markup).not.toContain('data-dswf-dsr-dir') // 拒绝态不呈现路径值
  })

  it('AC3 复检通过恢复：疑似移动 → ready 相位切换即恢复「确认」可点（零 issues 面）', () => {
    const rejected = view({ taskStorePhase: { state: 'suspected-move', data: MOVE_DATA } })
    expect(confirmBtn(rejected)).toContain('disabled')
    const recovered = view({ taskStorePhase: { state: 'ready', dir: DERIVED_DIR } })
    expect(confirmBtn(recovered)).not.toContain('disabled')
    expect(recovered).toContain('data-dswf-dsr="ready"')
  })

  it('loading（RPC 在途/换选复检中）：骨架占位——预检在途不阻断确认（注册闭包复检恒权威）', () => {
    const markup = view({ taskStorePhase: { state: 'loading' } })
    expect(markup).toContain('data-dswf-dsr="loading"')
    expect(markup).toContain('data-dswf-dsr-skeleton')
    expect(confirmBtn(markup)).not.toContain('disabled')
  })

  it('error 兜底（未映射失败）：通用错误条——非阻断位，确认不受阻', () => {
    const markup = view({ taskStorePhase: { state: 'error', message: 'bridge 服务缺席' } })
    expect(markup).toContain('data-dswf-dsr="error"')
    expect(markup).toContain('任务清单路径获取失败：bridge 服务缺席')
    expect(confirmBtn(markup)).not.toContain('disabled')
  })
})

describe('AC3 仓内/仓外推导呈现（无 radio）', () => {
  it('仓内 chip（forgeDirExternal=false）；仓外 chip（true）——随推导即时呈现', () => {
    expect(view({ forgeDirExternal: false })).toMatch(/dswf-rf-relation[^>]*>仓内</)
    expect(view({ forgeDirExternal: true })).toMatch(/dswf-rf-relation[^>]*>仓外</)
  })

  it('forge 目录为空（非法输入相位）不呈现仓内外 chip；表单无 radio 控件', () => {
    const empty = view({ values: { ...VALUES, forgeDir: '' } })
    expect(empty).not.toContain('dswf-rf-relation')
    expect(view()).not.toContain('type="radio"')
    expect(view()).not.toContain('role="radio"')
  })
})

describe('AC5 非法路径拦截于表单态（错误行 + 确认禁用）', () => {
  const ISSUES: FormIssue[] = [
    { field: 'forgeDir', message: '文档位置（forge 目录）需为绝对路径' },
    { field: 'knowledgeDir', message: '知识库目录不能为空' },
  ]

  it('字段级错误行 role=alert + 归属锚；「确认」禁用', () => {
    const markup = view({ values: { ...VALUES, forgeDir: 'rel\\path', knowledgeDir: '' }, issues: ISSUES })
    expect(markup.match(/role="alert"/g)?.length).toBe(2)
    expect(markup).toContain('data-dswf-rf-issue="forgeDir"')
    expect(markup).toContain('文档位置（forge 目录）需为绝对路径')
    expect(markup).toContain('data-dswf-rf-issue="knowledgeDir"')
    expect(markup).toContain('知识库目录不能为空')
    expect(confirmBtn(markup)).toContain('disabled')
  })

  it('合法值：零错误行，「确认」可点（不出表单即可达提交点）', () => {
    const markup = view()
    expect(markup).not.toContain('data-dswf-rf-issue')
    expect(confirmBtn(markup)).not.toContain('disabled')
  })
})

describe('AC6 无「默认召回域」+ 提交文案', () => {
  it('全表单不出现「召回域」字段；提交按钮文案 =「确认」', () => {
    const markup = view()
    expect(markup).not.toContain('召回域')
    expect(markup).toContain('确认')
  })
})

describe('工作区已注册挂接提示（fix-14：pick 时标记的表单相位口径迁移）', () => {
  it('已注册 → 工作区行「已注册」chip + 挂接语义提示（走查裁决注记承载）', () => {
    const markup = view({ workspaceRegistered: true })
    expect(markup).toMatch(/dswf-rf-wsreg[^>]*>已注册</)
    expect(markup).toContain('data-dswf-rf-registered')
    expect(markup).toContain('挂接既有工作区')
    // fix-27：标记 = 幂等成功语义（非错误面）——确认不炸 UNIQUE，仅提示
    expect(markup).toContain('幂等返回既有项目')
  })

  it('未注册 → 无 chip 无提示（默认形态零变化）', () => {
    const markup = view({ workspaceRegistered: false })
    expect(markup).not.toContain('dswf-rf-wsreg')
    expect(markup).not.toContain('data-dswf-rf-registered')
  })

  it('装配壳口径：registeredPaths 命中 workspaceDir → 提示呈现（canonical 对账路径直配）', () => {
    const registered = new Set(['Z:\\project\\dsh'])
    const hit = renderToStaticMarkup(<RegisterForm selection={SELECTION} registeredPaths={registered} />)
    expect(hit).toContain('data-dswf-rf-registered')
    const miss = renderToStaticMarkup(<RegisterForm selection={SELECTION} />)
    expect(miss).not.toContain('data-dswf-rf-registered')
  })
})

describe('原生改选在途/错误面（fix-14：三改选钮防双开 + 失败呈现）', () => {
  it('browseBusy → 「重新选择」/两「浏览…」钮全禁用（系统对话框打开中）；「确认」不受在途影响', () => {
    const markup = view({ browseBusy: true })
    expect(markup.match(/disabled=""/g)?.length).toBe(3)
    expect(confirmBtn(markup)).not.toContain('disabled') // 提交不受对话框在途影响
  })

  it('nativePickError → 错误行呈现（role=alert + 前缀文案）；null → 无错误行', () => {
    const markup = view({ nativePickError: 'E:\\gone 不可达' })
    expect(markup).toContain('data-dswf-rf-np-error')
    expect(markup).toContain('目录选择失败：E:\\gone 不可达')
    expect(view()).not.toContain('data-dswf-rf-np-error')
  })
})

describe('BrowsePanel（「浏览…」/「重新选择」改选复用面）', () => {
  it('标题随目标参数化 + 「返回表单」+ 浏览器槽位（children 注入）', () => {
    const markup = renderToStaticMarkup(
      <BrowsePanel target="forgeDir" onBack={() => {}}>
        <div data-stub-browser="1">browser-seat</div>
      </BrowsePanel>,
    )
    expect(markup).toContain('data-dswf-rf="browsing"')
    expect(markup).toContain('data-dswf-rf-target="forgeDir"')
    expect(markup).toContain('选择 forge 目录')
    expect(markup).toContain('返回表单')
    expect(markup).toContain('data-stub-browser="1"')
  })

  it('工作区目标（重新选择）标题口径', () => {
    const markup = renderToStaticMarkup(
      <BrowsePanel target="workspace">
        <div />
      </BrowsePanel>,
    )
    expect(markup).toContain('选择工作区目录')
    expect(markup).toContain('data-dswf-rf-target="workspace"')
  })
})

describe('装配壳（RegisterForm：初始态 = 表单相位，RPC 预检起步）', () => {
  it('初始渲染：表单锚 + 回填/默认值 + 派生行 loading 骨架（renderToStaticMarkup 不跑 effect——RPC 在途起步）；不出浏览面板', () => {
    const markup = renderToStaticMarkup(<RegisterForm selection={SELECTION} />)
    expect(markup).toContain('data-dswf-rf="form"')
    expect(markup).toContain('value="dsh"')
    expect(markup).toContain('data-dswf-dsr="loading"')
    expect(markup).toContain('data-dswf-dsr-skeleton')
    expect(markup).toContain('确认')
    // 前端自算废除（Hard Rule）：初始静态渲染零派生值零展示口径前缀
    expect(markup).not.toContain('dsh-forge')
    expect(markup).not.toContain('Z-project-dsh')
    expect(markup).not.toContain('data-dswf-fb="browser"')
  })
})
