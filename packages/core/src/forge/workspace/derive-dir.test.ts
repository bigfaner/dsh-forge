// 任务 1.4 测试 —— 派生目录单源（AC1：flatten/hash8/逐字 pin——G1-12「每工作区 DB 布局逐字」半边，
// schema.sql ↔ MIGRATIONS 半边归 1.2 migrations.test.ts）+ 注册碰撞三态分类器（AC2 纯机械面）
// + SuspectedMoveError typed 形状。/fixtures 的 hash8 字面量经 node:crypto 独立预计算钉死
// （pin 防漂移——实现若换摘要/规范化口径即红）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  classifyRegistrationCollision,
  deriveDirName,
  deriveTaskStoreDir,
  flattenWorkspacePath,
  hash8OfPath,
} from './derive-dir.js'
import { SuspectedMoveError } from './errors.js'

// ── 测试环境（临时库根；afterAll 统一清理） ──

const roots: string[] = []
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})
const tempHome = (): string => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-forge-derive-'))
  roots.push(home)
  return home
}

// ── AC1 单源派生：flatten / hash8 / 逐字 pin ──

describe('AC1 flatten 规则（原型 deriveTaskStore 同口径——与 apps/web form-model 自证用例逐字对齐；4.3 起前端自算废除）', () => {
  it('两类分隔符 → 同一扁平化结果（`/`、`\\` → `-`，盘符冒号去除）', () => {
    expect(flattenWorkspacePath('Z:\\project\\dsh')).toBe('Z-project-dsh')
    expect(flattenWorkspacePath('Z:/project/dsh')).toBe('Z-project-dsh')
  })

  it('盘符根：`C:` / `C:\\` → `C`（去尾分隔符后去冒号）', () => {
    expect(flattenWorkspacePath('C:')).toBe('C')
    expect(flattenWorkspacePath('C:\\')).toBe('C')
    expect(flattenWorkspacePath('c:\\x\\y')).toBe('c-x-y') // 小写盘符同口径（拼写保留——归一归 canonicalizeDir）
  })

  it('尾分隔符剪除 / UNC 双前导 / POSIX 前导', () => {
    expect(flattenWorkspacePath('Z:\\project\\')).toBe('Z-project')
    expect(flattenWorkspacePath('\\\\server\\share\\data')).toBe('--server-share-data')
    expect(flattenWorkspacePath('/home/user')).toBe('-home-user')
  })
})

describe('AC1 hash8（sha-256 前 8 hex 小写；输入 = 路径字符串本机原样，不二次规范化——§6-34）', () => {
  it('逐字 pin（独立预计算字面量）：Z:\\project\\dsh → 9d2471be', () => {
    expect(hash8OfPath('Z:\\project\\dsh')).toBe('9d2471be')
    expect(hash8OfPath('C:\\a\\b')).toBe('53577944')
    expect(hash8OfPath('C:\\a-b')).toBe('3d0f0b95')
    expect(hash8OfPath('/home/user')).toBe('b98d692c')
  })

  it('拼写敏感（有意设计）：分隔符/尾分隔符变体 → 异 hash8——调用方必须先 canonical 化（S10：realpath 收敛全形态）', () => {
    expect(hash8OfPath('Z:/project/dsh')).toBe('23ba5fc1')
    expect(hash8OfPath('Z:/project/dsh')).not.toBe(hash8OfPath('Z:\\project\\dsh'))
    expect(hash8OfPath('Z:\\project\\dsh\\')).toBe('c6d28ce3')
  })

  it('flatten 碰撞对（C:\\a\\b vs C:\\a-b → 同 C-a-b）hash8 结构性消歧（§6-34①）', () => {
    expect(flattenWorkspacePath('C:\\a\\b')).toBe('C-a-b')
    expect(flattenWorkspacePath('C:\\a-b')).toBe('C-a-b')
    expect(hash8OfPath('C:\\a\\b')).not.toBe(hash8OfPath('C:\\a-b'))
  })
})

describe('AC1 G1-12 pin：每工作区 DB 布局逐字（{tasksHome}/{flatten}@{hash8}——部署锚 schema.sql 头注同源）', () => {
  it('反斜杠 home → `\\` 连接：Z:\\project\\dsh → Z:\\forge-home\\Z-project-dsh@9d2471be', () => {
    expect(deriveTaskStoreDir('Z:\\forge-home', 'Z:\\project\\dsh')).toBe('Z:\\forge-home\\Z-project-dsh@9d2471be')
    expect(deriveDirName('Z:\\project\\dsh')).toBe('Z-project-dsh@9d2471be')
  })

  it('正斜杠 home → `/` 连接；home 尾分隔符剪除（原型 deriveTaskStoreDir 同口径）', () => {
    expect(deriveTaskStoreDir('/home/u/forge', 'Z:\\project\\dsh')).toBe('/home/u/forge/Z-project-dsh@9d2471be')
    expect(deriveTaskStoreDir('Z:\\forge-home\\', 'Z:\\project\\dsh')).toBe('Z:\\forge-home\\Z-project-dsh@9d2471be')
  })
})

// ── AC2 注册碰撞三态分类器（Interface 5「表单预检位 + 注册闭包复检」共用纯机械面） ──

describe('AC2 三态分类：正常新建（无同主体目录）', () => {
  it('tasksHome 缺席（全新机器首注册）→ normal', () => {
    const home = join(tempHome(), 'not-created-yet')
    expect(classifyRegistrationCollision(home, 'Z:\\project\\dsh')).toEqual({ state: 'normal' })
  })

  it('库根在场但空 → normal', () => {
    expect(classifyRegistrationCollision(tempHome(), 'Z:\\project\\dsh')).toEqual({ state: 'normal' })
  })

  it('面外条目不计同主体：异主体目录 / 非 hex8 后缀名 / 普通文件同名 → normal', () => {
    const home = tempHome()
    mkdirSync(join(home, 'other-subject@9d2471be'))
    mkdirSync(join(home, 'Z-project-dsh-not-hex8')) // 无 @ 分隔
    mkdirSync(join(home, 'Z-project-dsh@nothexxx')) // 后缀非 8 位 hex
    writeFileSync(join(home, 'Z-project-dsh@aaaaaaaa'), 'file') // 普通文件（非目录形态）
    expect(classifyRegistrationCollision(home, 'Z:\\project\\dsh')).toEqual({ state: 'normal' })
  })
})

describe('AC2 三态分类：幂等复用候选（目录在且 hash 一致——中央 ws_path 精确确认归注册闭包）', () => {
  it('目标目录在场 → present + dir = 单源派生值', () => {
    const home = tempHome()
    mkdirSync(join(home, 'Z-project-dsh@9d2471be'))
    const c = classifyRegistrationCollision(home, 'Z:\\project\\dsh')
    expect(c.state).toBe('present')
    if (c.state !== 'present') return
    expect(c.dir).toBe(deriveTaskStoreDir(home, 'Z:\\project\\dsh'))
    expect(c.data.derivedDir).toBe(c.dir)
    expect(c.data.existingDir).toBe(c.dir) // 兜底拒绝面（§6-33）：existing = derived
    expect(c.data.guidance).toContain(c.dir)
  })

  it('目标目录在场 + 另一同主体异 hash8 陈迹 → present 胜出（tech-design 交互三 mermaid E 分支序）', () => {
    const home = tempHome()
    mkdirSync(join(home, 'Z-project-dsh@9d2471be'))
    mkdirSync(join(home, 'Z-project-dsh@deadbeef'))
    expect(classifyRegistrationCollision(home, 'Z:\\project\\dsh').state).toBe('present')
  })
})

describe('AC2 三态分类：疑似移动（同扁平化主体异 hash8）', () => {
  it('唯一异 hash8 同主体目录 → suspected-move + data 三元（existingDir/derivedDir/手工指引）', () => {
    const home = tempHome()
    mkdirSync(join(home, 'Z-project-dsh@deadbeef'))
    const c = classifyRegistrationCollision(home, 'Z:\\project\\dsh')
    expect(c.state).toBe('suspected-move')
    if (c.state !== 'suspected-move') return
    const expected = deriveTaskStoreDir(home, 'Z:\\project\\dsh')
    expect(c.dir).toBe(expected)
    expect(c.data.derivedDir).toBe(expected)
    expect(c.data.existingDir).toBe(join(home, 'Z-project-dsh@deadbeef'))
    expect(c.data.guidance).toContain(c.data.existingDir) // 手工指引带定位（删孤儿目录或改回原名）
    expect(c.data.guidance).toContain(expected)
  })

  it('多个异 hash8 同主体目录 → 排序确定性取首个（字母序）', () => {
    const home = tempHome()
    mkdirSync(join(home, 'Z-project-dsh@ffffffff'))
    mkdirSync(join(home, 'Z-project-dsh@00000001'))
    const c = classifyRegistrationCollision(home, 'Z:\\project\\dsh')
    expect(c.state).toBe('suspected-move')
    if (c.state !== 'suspected-move') return
    expect(c.data.existingDir).toBe(join(home, 'Z-project-dsh@00000001'))
  })
})

// ── typed error 形状（code 字面量锚定 contracts ERROR_CODES；RPC 边界 { code, message, data } 序列化面） ──

describe('SuspectedMoveError typed 形状（ERR_SUSPECTED_MOVE——409/UI 错误条+指引留场）', () => {
  it('code/data/name 齐备；message 含指引文案', () => {
    const data = {
      existingDir: 'Z:/forge-workspaces/ws@a1b2c3d4',
      derivedDir: 'Z:/forge-workspaces/ws@e5f6a7b8',
      guidance: '疑似移动：删孤儿目录或改回原名（认领对话框 = M3）',
    }
    const err = new SuspectedMoveError(data)
    expect(err.code).toBe('ERR_SUSPECTED_MOVE')
    expect(err.name).toBe('SuspectedMoveError')
    expect(err.data).toEqual(data)
    expect(err.message).toContain(data.guidance)
  })
})
