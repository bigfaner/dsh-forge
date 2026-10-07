// G1 pin ⑳（M3 pin 池扩池 #20，任务 5.1）：收窄矩阵常量 + 工具名映射表（OQ#2 兑现——
// 按当期上游工具面枚举核对）。
// 权威：tech-design Appendix「契约面 pin 扩池」第 20 项 + §Interface 2 收窄矩阵表 +
// Open Questions #2（收窄矩阵工具名映射表——实施期按当期上游工具面枚举核对入 pin）。
//
// 工具名映射表核对记录（OQ#2 归档——上游 0.2.0-rc.2 standard 预设组合实面，2026-10-08 核对）：
//   入族（WORKER_TOOL_NAME_FAMILY）：
//     fs          read/write/edit（dsh-tool-fs）· glob/grep（dsh-tool-fs-search）
//     shell       bash（dsh-tool-bash）· pwsh（dsh-tool-pwsh）——平台 disabled 行恒入表
//     jobs        job_list/job_output/job_kill（dsh-tool-jobs）
//     read-image  read_image（dsh-tool-fs——独立族）
//     web         web_fetch/web_search（dsh-tool-web）
//     forge       submitTask/addTask（我方 WORKER_FORGE_TOOLS）
//   全局拒绝（WORKER_GLOBAL_DENY_TOOLS——fix-1/drift #10 实面实名）：
//     ask_user_question（tool-ask-user）· subagent_fork（delegation 行 provider:fork 的
//     patch config toolName）· list_agents（tool-subagent-control/list-agents 子出口）·
//     send_message/interrupt_agent（tool-subagent-control）· workflow（dsh-tool-workflow
//     lib 默认 toolName）· todo_write（tool-todo）· present（present 行）
//   刻意不入（豁免面）：
//     skill（恒在场不拒）· create_goal/get_goal/update_goal（goal 命令族非六族矩阵）·
//     subagent（provider:spawn 惰性注册——缺席环境不在场，入 deny 复现 unknown-name 拆
//     spawn）· subagent_codex/subagent_claude_code（disabled 行）· workflow-ptc（引擎服务
//     提供者非 tool 注册）· tool-plugin-manager/tool-ralph（disabled 行）
// Hard Rule：pin = 机械断言（枚举）——上游组合演进（增删行/改名）→ 行集覆盖或名证据红。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  WORKER_FORGE_TOOLS,
  WORKER_GLOBAL_DENY_TOOLS,
  WORKER_TASK_FAMILY_BY_TYPE,
  WORKER_TASK_FAMILIES,
  WORKER_TOOL_FAMILIES,
  WORKER_TOOL_MATRIX,
  WORKER_TOOL_NAME_FAMILY,
} from '../../packages/contracts/src/worker-matrix.js'
import { TASK_TYPES } from '../../packages/contracts/src/labels.js'
import { readUpstream, upstreamDir } from './pins.js'

const UPSTREAM_PKG = '@deepseek-ai/dsh-web-app'
const STANDARD = readUpstream('profile', UPSTREAM_PKG, 'presets/standard.patch.yml')

/** 顶层插件行块（10 空格 `- id:`——与 pin-11/3.7 同法） */
function pluginRowBlocks(text: string): Map<string, string> {
  const blocks = new Map<string, string[]>()
  let current: { id: string; buf: string[] } | undefined
  for (const line of text.split('\n')) {
    const match = /^ {10}- id: (\S+)\s*$/.exec(line)
    if (match !== null) {
      if (current !== undefined) blocks.set(current.id, current.buf)
      current = { id: match[1]!, buf: [line] }
      continue
    }
    if (current !== undefined) current.buf.push(line)
  }
  if (current !== undefined) blocks.set(current.id, current.buf)
  return new Map([...blocks].map(([id, buf]) => [id, buf.join('\n')]))
}

const topRows = pluginRowBlocks(STANDARD)

/** delegation 组子行块（14 空格 `- id:`） */
function childRowBlocks(block: string): Map<string, string> {
  const blocks = new Map<string, string[]>()
  let current: { id: string; buf: string[] } | undefined
  for (const line of block.split('\n')) {
    const match = /^ {14}- id: (\S+)\s*$/.exec(line)
    if (match !== null) {
      if (current !== undefined) blocks.set(current.id, current.buf)
      current = { id: match[1]!, buf: [line] }
      continue
    }
    if (current !== undefined) current.buf.push(line)
  }
  if (current !== undefined) blocks.set(current.id, current.buf)
  return new Map([...blocks].map(([id, buf]) => [id, buf.join('\n')]))
}

/** 包 lib 递归 JS 文本（工具名证据面——枚举核对 = 引号名记号在场；子出口行解析基包 lib） */
function packageLibText(pkg: string): string {
  // 子出口声明（如 dsh-tool-subagent-control/list-agents）→ lib 证据在基包树内
  const basePkg = /^(@deepseek-ai\/[^/]+)(?:\/.*)?$/.exec(pkg)![1]!
  const dir = join(upstreamDir('profile', basePkg), 'lib')
  expect(existsSync(dir), `${pkg} lib 目录在场`).toBe(true)
  const chunks: string[] = []
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.name.endsWith('.js')) chunks.push(readFileSync(p, 'utf8'))
    }
  }
  walk(dir)
  return chunks.join('\n')
}

/** 行块内包名（`name: '@deepseek-ai/...'` 行） */
function rowPackage(block: string): string {
  const match = /name: '(@deepseek-ai\/[\w/.-]+)'/.exec(block)
  expect(match, `行块缺包名声明`).toBeTruthy()
  return match![1]!
}

/**
 * 工具行核对清单（当期上游实面枚举——行 → 包 → 工具名 → 分类）。
 * 分类值：'fs'|'shell'|'jobs'|'read-image'|'web'（= WORKER_TOOL_NAME_FAMILY 族）·
 * 'deny'（= WORKER_GLOBAL_DENY_TOOLS）· 'exempt'（恒在场/goal 命令/惰性注册——刻意不入）。
 * disabled 行（工具名不生效）单列——上游启用即红（须重裁决分类）。
 */
interface ToolRowPin {
  row: string
  pkg: string
  names: Record<string, 'fs' | 'shell' | 'jobs' | 'read-image' | 'web' | 'deny' | 'exempt'>
  /** delegation 组子行（14 空格缩进——顶层行集断言排除） */
  delegationChild?: boolean
  /** 名出 patch 行 config.toolName（非包 lib——如 dsh-tool-subagent 的 provider 配置名） */
  fromPatchConfig?: readonly string[]
  disabled?: boolean
}

const TOOL_ROWS: readonly ToolRowPin[] = [
  { row: 'tool-bash', pkg: '@deepseek-ai/dsh-tool-bash', names: { bash: 'shell' } },
  { row: 'tool-pwsh', pkg: '@deepseek-ai/dsh-tool-pwsh', names: { pwsh: 'shell' } },
  {
    row: 'tool-fs',
    pkg: '@deepseek-ai/dsh-tool-fs',
    names: { read: 'fs', write: 'fs', edit: 'fs', read_image: 'read-image' },
  },
  { row: 'tool-fs-search', pkg: '@deepseek-ai/dsh-tool-fs-search', names: { glob: 'fs', grep: 'fs' } },
  {
    row: 'tool-jobs',
    pkg: '@deepseek-ai/dsh-tool-jobs',
    names: { job_list: 'jobs', job_output: 'jobs', job_kill: 'jobs' },
  },
  { row: 'tool-web', pkg: '@deepseek-ai/dsh-tool-web', names: { web_fetch: 'web', web_search: 'web' } },
  { row: 'tool-skill', pkg: '@deepseek-ai/dsh-tool-skill', names: { skill: 'exempt' } },
  {
    row: 'tool-goal',
    pkg: '@deepseek-ai/dsh-tool-goal',
    names: { create_goal: 'exempt', get_goal: 'exempt', update_goal: 'exempt' },
  },
  { row: 'tool-ask-user', pkg: '@deepseek-ai/dsh-tool-ask-user', names: { ask_user_question: 'deny' } },
  { row: 'tool-todo', pkg: '@deepseek-ai/dsh-tool-todo', names: { todo_write: 'deny' } },
  { row: 'present', pkg: '@deepseek-ai/dsh-tool-present', names: { present: 'deny' } },
  // delegation 组子行（delegationChild 标记）
  {
    row: 'tool-subagent-control',
    pkg: '@deepseek-ai/dsh-tool-subagent-control',
    names: { interrupt_agent: 'deny', send_message: 'deny' },
    delegationChild: true,
  },
  {
    row: 'tool-subagent-list-agents',
    pkg: '@deepseek-ai/dsh-tool-subagent-control/list-agents',
    names: { list_agents: 'deny' },
    delegationChild: true,
  },
  {
    row: 'tool-subagent',
    pkg: '@deepseek-ai/dsh-tool-subagent',
    names: { subagent: 'exempt' },
    delegationChild: true,
    fromPatchConfig: ['subagent'],
  },
  {
    row: 'tool-subagent-fork',
    pkg: '@deepseek-ai/dsh-tool-subagent',
    names: { subagent_fork: 'deny' },
    delegationChild: true,
    fromPatchConfig: ['subagent_fork'],
  },
  {
    row: 'tool-subagent-codex',
    pkg: '@deepseek-ai/dsh-tool-subagent',
    names: { subagent_codex: 'exempt' },
    delegationChild: true,
    fromPatchConfig: ['subagent_codex'],
    disabled: true,
  },
  {
    row: 'tool-subagent-claude-code',
    pkg: '@deepseek-ai/dsh-tool-subagent',
    names: { subagent_claude_code: 'exempt' },
    delegationChild: true,
    fromPatchConfig: ['subagent_claude_code'],
    disabled: true,
  },
  { row: 'workflow-ptc', pkg: '@deepseek-ai/dsh-workflow-ptc', names: {}, delegationChild: true },
  {
    row: 'tool-workflow',
    pkg: '@deepseek-ai/dsh-tool-workflow',
    names: { workflow: 'deny' }, // lib 默认 toolName（z.string().default("workflow")——行无覆盖）
    delegationChild: true,
  },
  { row: 'tool-ralph', pkg: '@deepseek-ai/dsh-tool-ralph', names: {}, delegationChild: true, disabled: true },
  { row: 'tool-plugin-manager', pkg: '@deepseek-ai/dsh-plugin-manager/tools', names: {}, disabled: true },
]

/** 非 tool 注册行（人格/指令/文件系统/命令/组容器——工具面枚举的行集豁免） */
const NON_TOOL_ROWS = new Set([
  'persona',
  'agent-instructions',
  'skill-filesystem',
  'command-goal',
  'planning',
  'compaction',
  'delegation', // 组容器——子行已逐行枚举
])

const TOP_TOOL_ROWS = TOOL_ROWS.filter((r) => r.delegationChild !== true)
const DELEGATION_CHILD_ROWS = TOOL_ROWS.filter((r) => r.delegationChild === true)

/** 行块定位：顶层行或 delegation 子行 */
function blockOf(row: string): { block: string; where: string } {
  if (topRows.has(row)) return { block: topRows.get(row)!, where: '顶层' }
  const delegation = childRowBlocks(topRows.get('delegation') ?? '')
  expect(delegation.get(row), `行 ${row} 既不在顶层也不在 delegation 组`).toBeTruthy()
  return { block: delegation.get(row)!, where: 'delegation 组' }
}

describe('pin ⑳-1 上游行集覆盖（枚举完备——增删行即红）', () => {
  it('standard.patch.yml 顶层行集 = 工具行清单 ∪ 非工具行豁免集（不缺不增）', () => {
    const classified = new Set<string>([...TOP_TOOL_ROWS.map((r) => r.row), ...NON_TOOL_ROWS])
    expect([...topRows.keys()].sort()).toEqual([...classified].sort())
  })

  it('delegation 组子行集 = 清单 delegation 部分（不缺不增）', () => {
    const children = childRowBlocks(topRows.get('delegation') ?? '')
    expect([...children.keys()].sort()).toEqual(DELEGATION_CHILD_ROWS.map((r) => r.row).sort())
  })
})

describe('pin ⑳-2 工具名证据（逐行逐名——包 lib 引号记号 / patch config.toolName）', () => {
  for (const pin of TOOL_ROWS) {
    it(`${pin.row}（${pin.pkg}${pin.disabled === true ? '·disabled' : ''}）：包名对账 + 名证据在场`, () => {
      const { block } = blockOf(pin.row)
      expect(rowPackage(block), `行 ${pin.row} 包名漂移`).toBe(pin.pkg)
      if (pin.disabled === true) {
        expect(block, `行 ${pin.row} 应为 disabled`).toMatch(/^ {12,16}disabled: true$/m)
        return // disabled 行工具名不生效——零证据面（启用即重裁决，行集覆盖断言守门）
      }
      const fromPatch = new Set(pin.fromPatchConfig ?? [])
      const libText = fromPatch.size === Object.keys(pin.names).length ? '' : packageLibText(pin.pkg)
      for (const name of Object.keys(pin.names)) {
        if (fromPatch.has(name)) {
          // 名出 patch 行 config（provider 派生名——dsh-tool-subagent 各 provider 行）
          expect(block, `行 ${pin.row} 缺 config.toolName: ${name}`).toMatch(
            new RegExp(`toolName: ${name}\\s*$`, 'm'),
          )
        } else {
          // 引号名记号（双/单引号两种构建产物——上游改名即红）
          expect(libText, `${pin.pkg} lib 缺工具名记号 "${name}"（上游改名漂移）`).toMatch(
            new RegExp(`["']${name}["']`),
          )
        }
      }
    })
  }
})

describe('pin ⑳-3 映射表 ↔ 上游枚举对账（WORKER_TOOL_NAME_FAMILY 逐名）', () => {
  it('入族名：清单 family 分类名 ↔ 映射表逐名全等（族值一致）', () => {
    const manifestFamily = new Map<string, string>()
    for (const pin of TOOL_ROWS) {
      if (pin.disabled === true) continue
      for (const [name, cls] of Object.entries(pin.names)) {
        if (cls === 'deny' || cls === 'exempt') continue
        manifestFamily.set(name, cls)
      }
    }
    const tableFamily = new Map(
      Object.entries(WORKER_TOOL_NAME_FAMILY).filter(([, f]) => f !== 'forge'),
    )
    expect([...tableFamily.keys()].sort()).toEqual([...manifestFamily.keys()].sort())
    for (const [name, family] of manifestFamily) {
      expect(tableFamily.get(name), `映射表 ${name} 族漂移`).toBe(family)
    }
  })

  it('forge 面 = 恰 WORKER_FORGE_TOOLS 两动词（我方工具非上游枚举面）', () => {
    const forgeNames = Object.entries(WORKER_TOOL_NAME_FAMILY)
      .filter(([, f]) => f === 'forge')
      .map(([n]) => n)
    expect(forgeNames.sort()).toEqual([...WORKER_FORGE_TOOLS].sort())
  })

  it('deny/exempt 名不入映射表（六族矩阵外——恒在场或全局拒绝承载）', () => {
    for (const pin of TOOL_ROWS) {
      if (pin.disabled === true) continue
      for (const [name, cls] of Object.entries(pin.names)) {
        if (cls === 'deny' || cls === 'exempt') {
          expect(WORKER_TOOL_NAME_FAMILY, `${name}（${cls}）不应入映射表`).not.toHaveProperty(name)
        }
      }
    }
  })
})

describe('pin ⑳-4 全局拒绝集 ↔ 上游实面（fix-1/drift #10——零未知名拆 spawn）', () => {
  it('deny 清单名集合 = WORKER_GLOBAL_DENY_TOOLS 全等（八员实名——上游改名即红）', () => {
    const manifestDeny = new Set<string>()
    for (const pin of TOOL_ROWS) {
      if (pin.disabled === true) continue
      for (const [name, cls] of Object.entries(pin.names)) {
        if (cls === 'deny') manifestDeny.add(name)
      }
    }
    expect([...WORKER_GLOBAL_DENY_TOOLS].sort()).toEqual([...manifestDeny].sort())
  })

  it('惰性注册 subagent 刻意不 deny（provider 缺席环境 unknown-name 防线）', () => {
    expect(WORKER_GLOBAL_DENY_TOOLS).not.toContain('subagent')
    expect(WORKER_GLOBAL_DENY_TOOLS).not.toContain('skill')
  })
})

describe('pin ⑳-5 收窄矩阵常量（Interface 2 逐格——G1 层常驻复 pin）', () => {
  it('矩阵 4×6 逐格枚举（fs/shell 全放；jobs doc 拒；read-image coding+验证；web 仅验证；forge 全放）', () => {
    expect(Object.keys(WORKER_TOOL_MATRIX).sort()).toEqual([...WORKER_TASK_FAMILIES].sort())
    expect(WORKER_TOOL_MATRIX).toEqual({
      coding: { fs: true, shell: true, jobs: true, 'read-image': true, web: false, forge: true },
      doc: { fs: true, shell: true, jobs: false, 'read-image': false, web: false, forge: true },
      gate: { fs: true, shell: true, jobs: true, 'read-image': false, web: false, forge: true },
      validation: { fs: true, shell: true, jobs: true, 'read-image': true, web: true, forge: true },
    })
    expect(WORKER_TOOL_FAMILIES).toEqual(['fs', 'shell', 'jobs', 'read-image', 'web', 'forge'])
  })

  it('类型 → 族映射 exhaustive 覆盖 TASK_TYPES 20 值（与 contracts 判别单测同锚）', () => {
    expect(Object.keys(WORKER_TASK_FAMILY_BY_TYPE).sort()).toEqual([...TASK_TYPES].sort())
  })

  it('worker forge 面 = 恰 submitTask + addTask（dispatchTask/queryTask 不入 worker 面）', () => {
    expect([...WORKER_FORGE_TOOLS]).toEqual(['submitTask', 'addTask'])
  })
})
