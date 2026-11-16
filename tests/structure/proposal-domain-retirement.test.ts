// proposal 域整域下线机检（plugin-spec/1.11——提案 §三闭包 + 下线门：名单先行钉死再扫，防假绿）。
// 三族枚举名单（退役动词·服务/UI 标识符族 + 退役 skill 族 + 禁词族）钉死于 BANNED_TOKENS；
// 扫描范围钉死于 SCAN_TARGETS——现役生产面源码树（非测试源文件），机械守卫「新代码不得
// 重新注册/引用 proposal 域任何标识符」。
//
// 显式豁免（边界声明，防误报与假绿）：
// - lib/api（contracts）proposal DTO/通道词汇面随 core 解散批退役（plugin-spec 提案 §三
//   「plugin-forge-spec 包与 core features 域不在本批」同族边界）——本批不动，不入扫描范围；
// - apps/host/src/{boot,ipc} 桥接白名单与通道注册面同上（依存 contracts 类型，core 解散批收口）；
// - e2e/specs 归档走查脚本（历史旅程证据，M5 归档收尾批处理）；
// - *.test.* 与 tests/：机检断言本体（not.toContain 禁词）合法出现禁词 token；
// - core tasks/features 域的 proposals 表 SQL 与容器 kind 'proposal' 词汇（容器语义在役，
//   不属退役动词族——本名单只钉服务/RPC/UI 标识符，不扫裸词 'proposal'）；
// - presetModeOf/expedition/blitz/ForgePipelineMode 在 plugins/spec 包内已有禁词机检
//   （plugins/spec/tests/prompt/index.test.ts AC6）——本文件按域收窄不重复扫 spec 包源码。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')

/** 族① 退役动词/服务名/UI 标识符（forgeProposals 服务键 + 五写读动词 + RPC 通道常量 +
 *  project UI 提案组件件名——整域退役后现役生产面零出现） */
const VERB_TOKENS = [
  'forgeProposals',
  'createProposal',
  'transitionProposal',
  'setProposalMode',
  'listProposals',
  'listProposalDocs',
  'listDerivedProposals',
  'PROPOSALS_CHANNELS',
  'forge:proposals/',
  'ProposalsTab',
  'ProposalVerdictDialog',
  'ProposalModeDialog',
  'ProposalStatusChips',
] as const

/** 族② 退役 skill（plugin-spec 1.9 迁移批退役——brainstorm 不迁、skills-blitz 随迁清理） */
const SKILL_TOKENS = ['skills/brainstorm', 'skills-blitz', 'skills/blitz'] as const

/** 族③ 禁词（模式概念退役——双模板分流键；spec 包已自检，此处扫其余现役生产面） */
const BANNED_MODE_TOKENS = ['presetModeOf', 'config.mode', 'ForgePipelineMode'] as const

const ALL_TOKENS = [...VERB_TOKENS, ...SKILL_TOKENS, ...BANNED_MODE_TOKENS] as readonly string[]/** 扫描目标 = 现役生产面源码树/文件（钉死枚举——名单先行，范围同钉） */
const SCAN_TARGETS = [
  'packages/core/src',
  'plugins/project/host',
  'plugins/project/ui',
  'plugins/task-loop/host',
  'plugins/task-loop/ui',
  'plugins/task-loop/skills',
  'plugins/knowledge/host',
  'plugins/knowledge/ui',
  'apps/web/src',
  'apps/host/src/profile',
  'scripts/assemble-installer-resources.mjs',
] as const

const SOURCE_EXT = new Set(['.ts', '.tsx', '.mjs', '.yml', '.css', '.md'])

/** 递归收集源文件（跳 node_modules/dist/skills 内容文件零命中无害；跳测试文件——豁免面） */
function collectFiles(target: string): string[] {
  const abs = join(ROOT, target)
  const out: string[] = []
  const walk = (p: string): void => {
    const st = statSync(p)
    if (st.isDirectory()) {
      for (const name of readdirSync(p)) {
        if (name === 'node_modules' || name === 'dist' || name === '.git') continue
        walk(join(p, name))
      }
      return
    }
    if (!SOURCE_EXT.has(p.slice(Math.max(0, p.lastIndexOf('.'))))) return
    if (/\.test\.(ts|tsx|mjs)$/.test(p)) return
    out.push(p)
  }
  walk(abs)
  return out
}

describe('proposal 域下线机检（plugin-spec/1.11 三族名单钉死——零注册/零残留）', () => {
  const files = SCAN_TARGETS.flatMap((t) => {
    try {
      return collectFiles(t)
    } catch {
      return [] // 目标目录缺席（技能面降级等）→ 跳过不误报
    }
  })

  it('扫描面在盘（机检自身健全性——目标树缺席即假绿，先行防呆）', () => {
    expect(ALL_TOKENS.length).toBe(VERB_TOKENS.length + SKILL_TOKENS.length + BANNED_MODE_TOKENS.length)
    expect(files.length).toBeGreaterThan(200)
    for (const target of SCAN_TARGETS) {
      if (target.endsWith('.mjs')) {
        expect(files.some((f) => f.replaceAll('\\', '/').endsWith(target)), `扫描目标缺席：${target}`).toBe(true)
      }
    }
  })

  it('族① 退役动词/服务名/UI 标识符：现役生产面零出现', () => {
    const hits: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const token of VERB_TOKENS) {
        if (src.includes(token)) hits.push(`${file} → ${token}`)
      }
    }
    expect(hits, `proposal 域退役标识符残留：\n${hits.join('\n')}`).toEqual([])
  })

  it('族② 退役 skill（brainstorm/skills-blitz）：现役生产面零注册', () => {
    const hits: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const token of SKILL_TOKENS) {
        if (src.includes(token)) hits.push(`${file} → ${token}`)
      }
    }
    expect(hits, `退役 skill 残留：\n${hits.join('\n')}`).toEqual([])
  })

  it('族③ 禁词（presetModeOf/config.mode/ForgePipelineMode）：现役生产面零出现', () => {
    const hits: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const token of BANNED_MODE_TOKENS) {
        if (src.includes(token)) hits.push(`${file} → ${token}`)
      }
    }
    expect(hits, `模式概念禁词残留：\n${hits.join('\n')}`).toEqual([])
  })
})
