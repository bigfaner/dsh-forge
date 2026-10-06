// form-model 单测 —— UF-3 段二派生/联动/校验纯函数面（AC1 回填默认值 / AC3 仓内外推导 /
// AC4 换选联动两分支 / AC5 表单态校验）。4.3：任务清单派生自算路径废除（Hard Rule 单源
// = core deriveTaskStoreDir RPC 下发——AC2 断言面迁 derive-source.test，本件零派生断言）。
import { describe, expect, it } from 'vitest'
import type { BrowserSelection } from './browser-model.js'
import {
  deriveForgeDir,
  deriveKnowledgeDir,
  editFieldValue,
  folderNameOf,
  initialFormState,
  isAbsolutePath,
  isForgeDirExternal,
  relinkWorkspace,
  toRegisterInput,
  validateFormValues,
} from './form-model.js'

const SELECTION: BrowserSelection = { path: 'Z:\\project\\dsh', registered: false }
const NEW_WS = 'D:\\work\\alpha'

describe('AC1 回填与默认值（initialFormState / derive）', () => {
  it('初始态：工作区回填 + 项目名 = 文件夹名 + 两目录默认值 + 全字段未手改', () => {
    const state = initialFormState(SELECTION)
    expect(state.values).toEqual({
      workspaceDir: 'Z:\\project\\dsh',
      name: 'dsh',
      forgeDir: 'Z:\\project\\dsh\\.forge',
      knowledgeDir: 'Z:\\project\\dsh\\.knowledge',
    })
    expect(state.touched).toEqual({ name: false, forgeDir: false, knowledgeDir: false })
  })

  it('folderNameOf 边界：尾分隔符 / 盘符根 / UNC / POSIX', () => {
    expect(folderNameOf('Z:\\project\\dsh\\')).toBe('dsh')
    expect(folderNameOf('Z:\\')).toBe('Z:')
    expect(folderNameOf('\\\\server\\share')).toBe('share')
    expect(folderNameOf('/home/user')).toBe('user')
  })

  it('目录默认值边界：盘符根（Z:\\ → Z:\\.forge）与正斜杠输入归一', () => {
    expect(deriveForgeDir('Z:\\')).toBe('Z:\\.forge')
    expect(deriveKnowledgeDir('Z:\\')).toBe('Z:\\.knowledge')
    expect(deriveForgeDir('Z:/project/dsh')).toBe('Z:\\project\\dsh\\.forge')
    expect(deriveKnowledgeDir('Z:/project/dsh/')).toBe('Z:\\project\\dsh\\.knowledge')
  })
})

describe('AC3 仓内/仓外推导（isForgeDirExternal = forge 目录是否位于工作区内）', () => {
  it('位于工作区内 → 仓内（false）；位于工作区外 → 仓外（true）', () => {
    expect(isForgeDirExternal('Z:\\project\\dsh', 'Z:\\project\\dsh\\.forge')).toBe(false)
    expect(isForgeDirExternal('Z:\\project\\dsh', 'D:\\forge-store\\dsh')).toBe(true)
  })

  it('大小写与分隔符不敏感（Windows 口径）', () => {
    expect(isForgeDirExternal('Z:\\project\\dsh', 'z:\\PROJECT\\dsh\\.forge')).toBe(false)
    expect(isForgeDirExternal('Z:\\project\\dsh', 'Z:/project/dsh/.forge')).toBe(false)
  })

  it('段边界：前缀同形但跨界不算仓内（修正原型裸前缀 slice 口径）', () => {
    // ws = Z:\project\ds 与 forge = Z:\project\dsh\.forge —— 裸前缀切片会误判仓内
    expect(isForgeDirExternal('Z:\\project\\ds', 'Z:\\project\\dsh\\.forge')).toBe(true)
  })

  it('forge 目录 = 工作区根 → 仓内（文档落根）；尾分隔符不干扰', () => {
    expect(isForgeDirExternal('Z:\\project\\dsh', 'Z:\\project\\dsh')).toBe(false)
    expect(isForgeDirExternal('Z:\\project\\dsh', 'Z:\\project\\dsh\\.forge\\')).toBe(false)
  })

  it('工作区为盘符根：Z:\\ 下任意同盘目录均仓内', () => {
    expect(isForgeDirExternal('Z:\\', 'Z:\\.forge')).toBe(false)
    expect(isForgeDirExternal('Z:\\', 'D:\\x')).toBe(true)
  })
})

describe('AC4 换选工作区联动（relinkWorkspace 两分支）', () => {
  it('全未手改：三字段随新工作区重构（文件夹名 / forge 默认 / 知识库默认）', () => {
    const next = relinkWorkspace(initialFormState(SELECTION), NEW_WS)
    expect(next.values).toEqual({
      workspaceDir: NEW_WS,
      name: 'alpha',
      forgeDir: 'D:\\work\\alpha\\.forge',
      knowledgeDir: 'D:\\work\\alpha\\.knowledge',
    })
  })

  it('仅项目名手改：name 保留，两目录随新工作区重构', () => {
    const edited = editFieldValue(initialFormState(SELECTION), 'name', '我的项目')
    const next = relinkWorkspace(edited, NEW_WS)
    expect(next.values.name).toBe('我的项目')
    expect(next.values.forgeDir).toBe('D:\\work\\alpha\\.forge')
    expect(next.values.knowledgeDir).toBe('D:\\work\\alpha\\.knowledge')
  })

  it('forge 目录经「浏览…」选定：保留（不再随工作区重构），未动字段重构', () => {
    const browsed = editFieldValue(initialFormState(SELECTION), 'forgeDir', 'E:\\docs\\dsh')
    const next = relinkWorkspace(browsed, NEW_WS)
    expect(next.values.forgeDir).toBe('E:\\docs\\dsh')
    expect(next.values.name).toBe('alpha')
    expect(next.values.knowledgeDir).toBe('D:\\work\\alpha\\.knowledge')
  })

  it('全字段手改/浏览选定：全部保留，仅工作区目录换新', () => {
    let state = initialFormState(SELECTION)
    state = editFieldValue(state, 'name', '自定义名')
    state = editFieldValue(state, 'forgeDir', 'E:\\docs\\dsh')
    state = editFieldValue(state, 'knowledgeDir', 'E:\\kn\\dsh')
    const next = relinkWorkspace(state, NEW_WS)
    expect(next.values).toEqual({
      workspaceDir: NEW_WS,
      name: '自定义名',
      forgeDir: 'E:\\docs\\dsh',
      knowledgeDir: 'E:\\kn\\dsh',
    })
    // 手改标记在换选后保持（后续再换选仍保留）
    expect(next.touched).toEqual({ name: true, forgeDir: true, knowledgeDir: true })
  })
})

describe('AC5 表单态校验（validateFormValues：非法路径拦截于表单）', () => {
  it('初始默认值合法 → 零问题（默认不拦截）', () => {
    expect(validateFormValues(initialFormState(SELECTION).values)).toEqual([])
  })

  it('项目名清空 → 项目名问题；工作区空 → 防御性问题', () => {
    const base = initialFormState(SELECTION).values
    expect(validateFormValues({ ...base, name: '' })).toEqual([
      { field: 'name', message: '项目名不能为空' },
    ])
    expect(validateFormValues({ ...base, workspaceDir: '' })).toEqual([
      { field: 'workspaceDir', message: '工作区目录不能为空' },
    ])
  })

  it('forge 目录 / 知识库目录：空与相对路径分别拦截', () => {
    const base = initialFormState(SELECTION).values
    expect(validateFormValues({ ...base, forgeDir: '' })).toEqual([
      { field: 'forgeDir', message: '文档位置（forge 目录）不能为空' },
    ])
    expect(validateFormValues({ ...base, forgeDir: 'relative\\path' })).toEqual([
      { field: 'forgeDir', message: '文档位置（forge 目录）需为绝对路径' },
    ])
    expect(validateFormValues({ ...base, knowledgeDir: 'docs' })).toEqual([
      { field: 'knowledgeDir', message: '知识库目录需为绝对路径' },
    ])
    expect(validateFormValues({ ...base, knowledgeDir: '' })).toEqual([
      { field: 'knowledgeDir', message: '知识库目录不能为空' },
    ])
  })

  it('isAbsolutePath：盘符（双分隔符）/ UNC / POSIX 绝对为真；相对与裸盘符为假', () => {
    expect(isAbsolutePath('Z:\\x')).toBe(true)
    expect(isAbsolutePath('Z:/x')).toBe(true)
    expect(isAbsolutePath('\\\\server\\share')).toBe(true)
    expect(isAbsolutePath('/home/x')).toBe(true)
    expect(isAbsolutePath('x\\y')).toBe(false)
    expect(isAbsolutePath('Z:x')).toBe(false)
    expect(isAbsolutePath('')).toBe(false)
  })
})

describe('采集载荷（toRegisterInput → RegisterProjectInput 四字段）', () => {
  it('首尾空白剪除后按 contracts 形状输出（采集面 = 提交面，无额外字段）', () => {
    const input = toRegisterInput({
      workspaceDir: 'Z:\\project\\dsh ',
      name: ' dsh ',
      forgeDir: ' Z:\\project\\dsh\\.forge',
      knowledgeDir: 'Z:\\project\\dsh\\.knowledge ',
    })
    expect(input).toEqual({
      workspaceDir: 'Z:\\project\\dsh',
      name: 'dsh',
      forgeDir: 'Z:\\project\\dsh\\.forge',
      knowledgeDir: 'Z:\\project\\dsh\\.knowledge',
    })
  })
})
