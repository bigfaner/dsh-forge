// DerivedTaskStoreRow 单测（3.11）——UF-4 注册表单任务清单派生行（升级：全路径 + 三态）。
// 断言面 = 任务 AC：AC-1（全路径逐字呈现——{tasksHome}/{flatten}@{hash8} 禁截断/省略）/
// AC-2（三态：加载中骨架 / 正常路径值 / 疑似移动错误条 + 手工指引文案）/
// AC-3（props 驱动——dir 值与错误载荷由外部注入，组件零自算[Hard Rules]）/
// AC-4（mock 载荷三态渲染 + 路径逐字呈现）。
// renderToStaticMarkup 纯渲染面（沿 RegisterForm.test / SessionTaskPills.test 模式）；
// RPC 真接线（forge:projects/deriveTaskStoreDir = derive-source + RegisterForm）归 4.3
// （本件含 4.3 增态：error 兜底通用错误条）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DerivedTaskStoreRow, type DerivedTaskStorePhase } from './derived-store-row.js'

/** mock 载荷（4.3 装配形——RPC DeriveTaskStoreDirResult.dir / SuspectedMoveError.data 直喂 props） */
const DERIVED_DIR = 'Z:\\forge-workspaces\\Z-project-dsh@a1b2c3d4'
const MOVE_GUIDANCE =
  '疑似移动：本次推导目录 Z:\\forge-workspaces\\Z-project-dsh@a1b2c3d4，但同扁平化主体异 hash8 目录 ' +
  'Z:\\forge-workspaces\\Z-project-dsh@e5f6a7b8 已在场（工作区可能被移动或重命名）。' +
  '请手工处置：删除孤儿目录 Z:\\forge-workspaces\\Z-project-dsh@e5f6a7b8，或将工作区改回原路径后重试（认领对话框 = M3）。'
const MOVE_DATA = {
  existingDir: 'Z:\\forge-workspaces\\Z-project-dsh@e5f6a7b8',
  derivedDir: DERIVED_DIR,
  guidance: MOVE_GUIDANCE,
}

const render = (phase: DerivedTaskStorePhase): string => renderToStaticMarkup(<DerivedTaskStoreRow phase={phase} />)

describe('AC-2 加载中态（骨架占位——RPC 在途）', () => {
  const markup = render({ state: 'loading' })

  it('行容器 + 骨架占位（SkeletonRows 形制：aria-hidden 装饰面 + 域锚）', () => {
    expect(markup).toContain('data-dswf-dsr="loading"')
    expect(markup).toContain('data-dswf-dsr-skeleton')
    expect(markup).toContain('aria-hidden="true"')
  })

  it('在途不呈现路径值与错误条（三态互斥）', () => {
    expect(markup).not.toContain('data-dswf-dsr-dir')
    expect(markup).not.toContain('role="alert"')
  })
})

describe('AC-1 正常态（全路径逐字呈现）', () => {
  const markup = render({ state: 'ready', dir: DERIVED_DIR })

  it('路径逐字呈现：{tasksHome}/{flatten}@{hash8} 完整字符串在场（@ 连接符 + hash8 尾段）', () => {
    expect(markup).toContain('data-dswf-dsr="ready"')
    expect(markup).toContain(`>${DERIVED_DIR}</`)
    expect(markup).toContain('Z-project-dsh@a1b2c3d4')
  })

  it('文本节点承载（非 input value）——换行完整呈现面，禁截断/省略（ui-design v12 文件路径纪律）', () => {
    expect(markup).toContain('data-dswf-dsr-dir')
    expect(markup).not.toContain('<input')
    expect(markup).not.toContain('…')
  })

  it('AC-3 props 驱动（零自算）：dir 由外部注入——异 dir 即异呈现', () => {
    const other = render({ state: 'ready', dir: 'C:\\home\\C-work-x@00000000' })
    expect(other).toContain('C:\\home\\C-work-x@00000000')
    expect(other).not.toContain('a1b2c3d4')
  })
})

describe('AC-2 疑似移动错误态（ERR_SUSPECTED_MOVE → 错误条 + 手工指引）', () => {
  const markup = render({ state: 'suspected-move', data: MOVE_DATA })

  it('错误条形制（ErrorBar：role=alert 可达性面 + 域锚）', () => {
    expect(markup).toContain('data-dswf-dsr="suspected-move"')
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('data-dswf-dsr-error')
  })

  it('手工指引文案逐字留场（SuspectedMoveData.guidance 单源——含 existingDir/derivedDir 双路径）', () => {
    expect(markup).toContain(MOVE_GUIDANCE)
    expect(markup).toContain('Z-project-dsh@e5f6a7b8')
  })

  it('纯呈现面：无重试钮（恢复径 = 表单「重新选择」重选目录复检——PRD UF-4 第 4 步，4.3 接线）', () => {
    expect(markup).not.toContain('<button')
  })

  it('错误态不呈现路径值（拒绝注册零副作用——非可用确认面）', () => {
    expect(markup).not.toContain('data-dswf-dsr-dir')
    expect(markup).not.toContain('data-dswf-dsr-skeleton')
  })
})

describe('未映射失败兜底（4.3 接线增态：error → 通用错误条——永无裸 code 泄漏）', () => {
  const markup = render({ state: 'error', message: 'bridge 服务缺席（forge:projects 通道未注册）' })

  it('通用错误条形制（ErrorBar：role=alert + 域锚 + 前缀语）', () => {
    expect(markup).toContain('data-dswf-dsr="error"')
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('data-dswf-dsr-error')
    expect(markup).toContain('任务清单路径获取失败：bridge 服务缺席（forge:projects 通道未注册）')
  })

  it('兜底态不呈现路径值/骨架/指引（相位互斥）；非阻断位——无重试钮', () => {
    expect(markup).not.toContain('data-dswf-dsr-dir')
    expect(markup).not.toContain('data-dswf-dsr-skeleton')
    expect(markup).not.toContain(MOVE_GUIDANCE)
    expect(markup).not.toContain('<button')
  })
})

describe('AC-3 props 驱动（三态全由 phase 注入——组件无本地推导）', () => {
  it('行标签三态恒在场（任务清单行上下文沿 RegisterForm 既有文案）', () => {
    expect(render({ state: 'loading' })).toContain('任务清单与记录（自动派生 · 无需填写）')
    expect(render({ state: 'ready', dir: DERIVED_DIR })).toContain('任务清单与记录（自动派生 · 无需填写）')
    expect(render({ state: 'suspected-move', data: MOVE_DATA })).toContain('任务清单与记录（自动派生 · 无需填写）')
  })

  it('三态互斥呈现（容器相位锚各态独占）', () => {
    expect(render({ state: 'loading' })).not.toContain('data-dswf-dsr-dir')
    expect(render({ state: 'ready', dir: DERIVED_DIR })).not.toContain('data-dswf-dsr-skeleton')
    expect(render({ state: 'ready', dir: DERIVED_DIR })).not.toContain('role="alert"')
  })
})
