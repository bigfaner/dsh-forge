// boundaries 机检（plugin-project 1.17——proposal 判据 3 实现面）：
//   ① 域间零横向 import：host/{projects,worktrees,bugs,dirs} 四域互禁——依赖单向规则
//     （assembly → 域服务 → db/repositories），域间协作一律经服务缝（lib/api ports）；
//     assembly → 域服务为唯一合法向下方向。
//   ② 裸 SQL 白名单唯一 repositories：prepare()/SQL 关键词只允许出现在 db/（repositories
//     行级门 + migrations DDL + connection 装配），域服务零直持 SQL。
//   ③ tool 零域逻辑复写：plugin-forge 消费面只认服务缝——对 plugins/project 域内部模块
//     零 import（唯一白名单 = host-dirs DirFactsPort 常驻 provider 注册行）。
//   ④ 零 projectId 概念词：worktrees 域归属键 = ws_path/projectRoot（行级归属键
//     project_key 归 bugs/projects 域）——worktrees 域 projectId 概念词白名单外零命中。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const HOST_ROOT = 'plugins/project/host'

/** 收集目录下全部非测试 .ts 文件（递归） */
function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...tsFiles(p))
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p)
  }
  return out
}

function read(rel: string): string {
  return readFileSync(rel, 'utf8')
}

/** 相对域 import 提取（`../<domain>/` 路径前缀 → 目标域名） */
function crossImports(rel: string, domain: string): string[] {
  const src = read(rel)
  const pattern = new RegExp('\\.\\./(projects|worktrees|bugs|dirs)/', 'g')
  return [...src.matchAll(pattern)].map((m) => m[1]).filter((d) => d !== domain)
}

describe('boundaries 机检 ①：域间零横向 import', () => {
  const domains = ['projects', 'worktrees', 'bugs', 'dirs'] as const
  it('四域文件零横向 import（协作面 = 服务缝，非模块 import）', () => {
    const violations: string[] = []
    for (const domain of domains) {
      for (const f of tsFiles(join(HOST_ROOT, domain))) {
        for (const target of crossImports(f, domain)) violations.push(`${f} -> ${target}`)
      }
    }
    expect(violations).toEqual([])
  })

  it('assembly → 域服务向下合法；域服务 → assembly 零命中（依赖单向）', () => {
    for (const f of tsFiles(join(HOST_ROOT, 'projects'))) {
      expect(read(f).match(/from '\.\.\/assembly\//)).toBeNull()
    }
    for (const f of tsFiles(join(HOST_ROOT, 'worktrees'))) {
      expect(read(f).match(/from '\.\.\/assembly\//)).toBeNull()
    }
    // assembly 至少消费一个域服务（向下方向活性——防白名单空转）
    expect(read(`${HOST_ROOT}/assembly/projects-port.ts`).match(/from '\.\.\/projects\//)).not.toBeNull()
  })
})

describe('boundaries 机检 ②：裸 SQL 白名单唯一 repositories', () => {
  it('SQL 关键词/prepare 只落 db/（repositories + migrations + connection），域服务零直持', () => {
    const violations: string[] = []
    const sqlish = /\b(prepare\(|SELECT |INSERT INTO|DELETE FROM|CREATE TABLE)/
    for (const domain of ['projects', 'worktrees', 'bugs', 'dirs', 'assembly']) {
      for (const f of tsFiles(join(HOST_ROOT, domain))) {
        const src = read(f)
        // 逐行扫描——注释行（含 CREATE TABLE 字样的说明）不豁免语义边界：一律以
        // 「行首非注释」为准，`//` 行豁免
        for (const [i, line] of src.split('\n').entries()) {
          const code = line.replace(/\/\/.*$/, '')
          if (sqlish.test(code)) violations.push(`${f}:${i + 1}`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})

describe('boundaries 机检 ③：tool 零域逻辑复写', () => {
  it('plugin-forge 对 plugins/project 仅允许 host-dirs 注册行 import（域内部零触达）', () => {
    const violations: string[] = []
    const allowed = /@dsh-forge\/project\/host-dirs/
    const scan = (dir: string): void => {
      for (const f of tsFiles(dir)) {
        const src = read(f)
        for (const m of src.matchAll(/from '(@dsh-forge\/project[^']*)'/g)) {
          if (!allowed.test(m[1])) violations.push(`${f} -> ${m[1]}`)
        }
      }
    }
    scan('packages/plugin-forge/src')
    expect(violations).toEqual([])
  })
})

describe('boundaries 机检 ④：零 projectId 概念词（worktrees 域）', () => {
  it('worktrees 域归属键 = ws_path/projectRoot；projectId 白名单外零命中', () => {
    const violations: string[] = []
    // 白名单：bind-events 域外投影载荷字段（resolution 投影随逐帧推送，AGENTS 1.6 快照
    // 边界——消息即事实，非归属判据）
    const allowlist = new Set(['worktrees/service.ts'])
    for (const f of tsFiles(join(HOST_ROOT, 'worktrees'))) {
      const short = f.replaceAll('\\', '/').replace(`${HOST_ROOT}/`, '')
      if (allowlist.has(short)) continue
      if (/\bprojectId\b/.test(read(f))) violations.push(short)
    }
    expect(violations).toEqual([])
  })
})
