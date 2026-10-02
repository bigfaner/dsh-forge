// 任务 3.1 测试 —— 知识目录扫描（projects.knowledge_dir → 候选文件清单）。
// 覆盖：嵌套收集 + rel_path 规范化（'/' 分隔）+ 域派生；.md 过滤（大小写不敏感）；
// dot 文件/目录忽略；符号链接不跟随（逃逸负样例自证——AC5/Security Mitigations）；
// 目录不可达 → InvalidKnowledgeDirError（ERR_INVALID_KNOWLEDGE_DIR）；
// isSafeRelPath 负样例（.. / 绝对路径 / 盘符 / 反斜杠 / 空段——AC5 自证）。
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { InvalidKnowledgeDirError } from './errors.js'
import { deriveDomainPath, isSafeRelPath, scanKnowledgeDir, type ScannedKnowledgeFile } from './scan.js'

const roots: string[] = []
const root = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'dsh-forge-knscan-'))
  roots.push(d)
  return d
}

afterAll(() => {
  for (const d of roots) rmSync(d, { recursive: true, force: true })
})

function write(rootDir: string, relPath: string, content = '---\nsummary: s\nkeywords: [a]\n---\nb'): void {
  const abs = join(rootDir, ...relPath.split('/'))
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, content, 'utf8')
}

/** 捕获异常（typed 断言辅助） */
function capture(fn: () => unknown): unknown {
  try {
    fn()
  } catch (e) {
    return e
  }
  return undefined
}

// —— 符号链接逃逸负样例的环境准备（Windows 无开发者模式时回退 junction；均不可建则跳过） ——
const escapeFixture = (() => {
  const dir = root()
  const outside = root()
  write(outside, '外部知识.md')
  write(dir, '真实.md')
  const linkPath = join(dir, 'linked')
  try {
    symlinkSync(outside, linkPath, 'dir')
    return { dir, linkCreated: true }
  } catch {
    try {
      symlinkSync(outside, linkPath, 'junction')
      return { dir, linkCreated: true }
    } catch {
      return { dir, linkCreated: false }
    }
  }
})()

describe('嵌套扫描与规范化', () => {
  it('根/1..3 层文件收齐；relPath 以 / 连接、域 = 目录段派生、mtimeMs 随行', () => {
    const dir = root()
    write(dir, '根条目.md')
    write(dir, '编程/入门.md')
    write(dir, '编程/java/泛型.md')
    write(dir, '编程/java/并发/锁.md')
    const files: ScannedKnowledgeFile[] = scanKnowledgeDir(dir)
    // 代码单元序（确定性插入序——非 locale 序）：根 U+6839 < 编 U+7F16，故根条目在前
    expect(files.map((f) => f.relPath)).toEqual(['根条目.md', '编程/java/并发/锁.md', '编程/java/泛型.md', '编程/入门.md'])
    const byRel = new Map(files.map((f) => [f.relPath, f]))
    expect(byRel.get('根条目.md')?.domainPath).toBe('')
    expect(byRel.get('根条目.md')?.domainDepth).toBe(0)
    expect(byRel.get('编程/java/泛型.md')?.domainPath).toBe('编程/java')
    expect(byRel.get('编程/java/泛型.md')?.domainDepth).toBe(2)
    expect(byRel.get('编程/java/并发/锁.md')?.absPath).toBe(join(dir, '编程', 'java', '并发', '锁.md'))
    expect(typeof byRel.get('根条目.md')?.mtimeMs).toBe('number')
  })

  it('仅收 .md（大小写不敏感）；其他扩展名不收也不计', () => {
    const dir = root()
    write(dir, 'a.md')
    write(dir, 'b.MD')
    write(dir, 'c.txt')
    write(dir, 'd.markdown')
    const files = scanKnowledgeDir(dir)
    expect(files.map((f) => f.relPath).sort()).toEqual(['a.md', 'b.MD'])
  })

  it('dot 文件与 dot 目录不入扫描（脏文件不污染 IndexReport）', () => {
    const dir = root()
    write(dir, '可见.md')
    write(dir, '.隐藏.md')
    write(dir, '.git/config.md')
    write(dir, '正常/.DS_Store.md')
    const files = scanKnowledgeDir(dir)
    expect(files.map((f) => f.relPath)).toEqual(['可见.md'])
  })
})

describe('目录不可达/非法（ERR_INVALID_KNOWLEDGE_DIR）', () => {
  it('不存在 → InvalidKnowledgeDirError', () => {
    const e = capture(() => scanKnowledgeDir(join(root(), 'absent')))
    expect(e).toBeInstanceOf(InvalidKnowledgeDirError)
    expect(e).toMatchObject({ code: 'ERR_INVALID_KNOWLEDGE_DIR', name: 'InvalidKnowledgeDirError' })
  })

  it('指向普通文件 → InvalidKnowledgeDirError', () => {
    const dir = root()
    write(dir, '是文件.md')
    const e = capture(() => scanKnowledgeDir(join(dir, '是文件.md')))
    expect(e).toBeInstanceOf(InvalidKnowledgeDirError)
    expect(e).toMatchObject({ code: 'ERR_INVALID_KNOWLEDGE_DIR' })
  })
})

describe('符号链接逃逸（负样例自证——AC5）', () => {
  it.skipIf(!escapeFixture.linkCreated)('知识目录内符号链接目录不跟随、外部条目不入扫描', () => {
    const files = scanKnowledgeDir(escapeFixture.dir)
    expect(files.map((f) => f.relPath)).toEqual(['真实.md'])
  })
})

describe('isSafeRelPath（前缀校验——AC5 负样例自证）', () => {
  it('正样例', () => {
    expect(isSafeRelPath('a.md')).toBe(true)
    expect(isSafeRelPath('a/b/c.md')).toBe(true)
    expect(isSafeRelPath('安全编码规范.md')).toBe(true)
  })

  it('禁 .. 逃逸（前缀/中段/单段）', () => {
    expect(isSafeRelPath('../x.md')).toBe(false)
    expect(isSafeRelPath('a/../../b.md')).toBe(false)
    expect(isSafeRelPath('a/..')).toBe(false)
    expect(isSafeRelPath('..')).toBe(false)
  })

  it('禁绝对路径（POSIX 根 / Windows 盘符 / UNC）', () => {
    expect(isSafeRelPath('/abs/x.md')).toBe(false)
    expect(isSafeRelPath('C:/x.md')).toBe(false)
    expect(isSafeRelPath('c:\\x.md')).toBe(false)
    expect(isSafeRelPath('\\\\srv\\share\\x.md')).toBe(false)
  })

  it('禁反斜杠 / 空段 / 当前段 / 空串', () => {
    expect(isSafeRelPath('a\\b.md')).toBe(false)
    expect(isSafeRelPath('a//b.md')).toBe(false)
    expect(isSafeRelPath('./a.md')).toBe(false)
    expect(isSafeRelPath('')).toBe(false)
  })
})

describe('deriveDomainPath（域 = 目录路径派生，单一事实源）', () => {
  it('根文件 → 空域零层；嵌套 → 段连接与层数', () => {
    expect(deriveDomainPath('a.md')).toEqual({ domainPath: '', depth: 0 })
    expect(deriveDomainPath('编程/java/泛型.md')).toEqual({ domainPath: '编程/java', depth: 2 })
  })
})
