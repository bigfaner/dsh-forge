// 5.3 审计锚四件（AC2–AC5）——可重复自动化断言（Hard Rule：禁仅人工 checklist）。
// 消费面双轨：vitest（e2e-support 池——`pnpm test` 单测门常驻）+ Playwright
// （e2e/specs/m2/audit-anchors.spec.ts——G2 门 SC 判据面 + 运行面零写入监控）。
// 锚清单（tech-design §Per-Layer Test Plan e2e 行「代码审计四锚」）：
//   ① SC2 无 watch/回流/快照同步（core forge 域禁 chokidar/fs.watch/轮询守护——
//      G0 import 扫描器（web+core）之外的 e2e 侧冗余 + plugin-forge/host 补位）；
//   ② SC8 零迁移（无旧仓迁移工具标识——WORKSPACE_MIGRATIONS 为 schema 版本线豁免，
//      非「旧仓任务文件 → 新库」迁移面）；
//   ③ SC3 发现面只读文件面（discovery.ts fs 读三件套封闭 + 零写调用 + 单向阀门标记在场
//      + 吸收白名单常量封闭集——运行面树快照归 audit-anchors.spec.ts）；
//   ④ web 无编排逻辑（写动词调用形/数据层 import/fs 写禁令——web 只经 RPC 薄 Controller）
//      + 旧技能悬空引用零残留（forge:* 技能引用 ⊆ 挂载集 ∪ M3 显式豁免清单）。
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOC_KIND_FILES, FRONTMATTER_KEYS } from '../../../packages/core/src/forge/workspace/discovery.js'
import { listSourceFiles, pathExists, readSourceOrNull, scanFilesForRules, type SourceScanHit } from './source-scan.js'

/** 仓库根（audit/anchors.ts → audit → support → e2e → 根：四级上溯） */
export const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..', '..')

/** 审计 finding（anchor = 锚名；detail = 人类可读定位） */
export interface AuditFinding {
  readonly anchor: string
  readonly detail: string
}

function hitsToFindings(anchor: string, hits: readonly SourceScanHit[]): AuditFinding[] {
  return hits.map((h) => ({ anchor, detail: `${h.file}:${h.line} [${h.rule}] ${h.text}` }))
}

// ───────────────────────── 锚①：SC2 无 watch/回流/快照同步 ─────────────────────────

/** watch 类 import/调用禁令扫描域（G0 覆盖 web+core——此处四工件产品运行时源全集冗余） */
const WATCH_SCAN_DIRS = [
  'packages/core/src/forge',
  'packages/plugin-forge/src',
  'apps/web/src',
  'apps/host/src',
] as const

const WATCH_RULES = [
  {
    id: 'watch-dep-import',
    pattern: /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](?:@parcel\/watcher|chokidar)['"]/,
    message: 'SC2 无投影：禁文件监听依赖（chokidar/@parcel/watcher）',
  },
  {
    id: 'fs-watch-named-import',
    pattern: /\bimport\s+(?:type\s+)?\{[^}]*\b(?:watch|watchFile|FSWatcher)\b[^}]*\}\s*from\s*['"](?:node:)?fs(?:\/promises)?['"]/,
    message: 'SC2 无投影：禁 fs.watch/watchFile 命名导入',
  },
  {
    id: 'fs-watch-call',
    pattern: /\b(?:fs|fsPromises|fsp|nodeFs)\.(?:watch|watchFile)\s*\(/,
    message: 'SC2 无投影：禁 fs.watch/fs.watchFile 调用',
  },
  {
    id: 'polling-daemon',
    pattern: /\bsetInterval\s*\(/,
    message: 'SC2 无 watch：禁轮询守护（setInterval 常驻重扫）',
  },
] as const

/** 回流/快照同步模块名禁令（core forge 域文件面——「无 watch/回流/快照同步模块」的字面锚） */
const FORBIDDEN_MODULE_NAME_RE = /(watch|backflow|reflux|resync|snapshot[-_]?sync|sync[-_]?back)/i

/**
 * 锚①：core forge 域（+产品运行时源）禁 watch/回流/快照同步/轮询守护。
 * SC2 直读纪律：状态全部从库直读，重建只经用户显式触发——常驻监听/定时回流 = 违规。
 */
export function auditForgeNoWatchBackflow(root: string = REPO_ROOT): AuditFinding[] {
  const findings: AuditFinding[] = []
  for (const dir of WATCH_SCAN_DIRS) {
    const absDir = join(root, dir)
    if (!pathExists(absDir)) continue
    findings.push(...hitsToFindings('sc2-no-watch', scanFilesForRules(root, listSourceFiles(absDir), WATCH_RULES)))
  }
  const forgeDir = join(root, 'packages/core/src/forge')
  for (const abs of listSourceFiles(forgeDir)) {
    const base = abs.split(/[\\/]/).pop() ?? ''
    if (FORBIDDEN_MODULE_NAME_RE.test(base)) {
      findings.push({
        anchor: 'sc2-no-watch',
        detail: `${join('packages/core/src/forge', base)} [forbidden-module-name] 模块名命中 watch/回流/快照同步禁令`,
      })
    }
  }
  return findings
}

// ───────────────────────── 锚②：SC8 零迁移（无迁移工具） ─────────────────────────

/** 迁移工具标识扫描域（产品运行时源四工件——旧仓任务文件批量/命令式迁移面） */
const MIGRATION_SCAN_DIRS = [
  'packages/core/src',
  'packages/plugin-forge/src',
  'apps/web/src',
  'apps/host/src',
] as const

const MIGRATION_RULES = [
  {
    id: 'legacy-migration-tool',
    pattern:
      /\b(?:migrateLegacy\w*|legacy\w*Migrat\w*|migrateTasks?\b|migrateOldRepo\w*|migrateMarkdown\w*|importLegacy\w*|convertLegacy\w*|syncLegacy\w*|backfill(?:Tasks?|Features?|Legacy\w*))\b/,
    message: 'SC8 零迁移：禁旧仓任务文件迁移/旧→新同步工具标识',
  },
] as const

/**
 * 锚②：无批量/命令式旧仓任务迁移工具与旧→新同步路径（代码审计面）。
 * 豁免（非 finding）：WORKSPACE_MIGRATIONS / openDatabase(migrations) = 每工作区库
 * schema 前向版本线（PRD In-Scope ①——与「旧仓文件迁移」正交，模式不命中）。
 * 「旧仓文件未动」运行面断言归 audit-anchors.spec.ts（树快照零变化）。
 */
export function auditNoLegacyMigrationTool(root: string = REPO_ROOT): AuditFinding[] {
  const findings: AuditFinding[] = []
  for (const dir of MIGRATION_SCAN_DIRS) {
    const absDir = join(root, dir)
    if (!pathExists(absDir)) continue
    findings.push(...hitsToFindings('sc8-zero-migration', scanFilesForRules(root, listSourceFiles(absDir), MIGRATION_RULES)))
  }
  return findings
}

// ───────────────────────── 锚③：SC3 发现面只读文件面 + 吸收白名单在场 ─────────────────────────

/** 发现面全部 fs 写调用禁令（discovery.ts 专属——1.3 Hard Rule「扫描对 forge_dir 只读零写入」） */
const DISCOVERY_WRITE_RULES = [
  {
    id: 'discovery-fs-write',
    pattern: /\b(?:writeFileSync|appendFileSync|rmSync|unlinkSync|rmdirSync|mkdirSync|cpSync|renameSync|utimesSync|truncateSync|openSync)\s*\(/,
    message: 'SC3 只读纪律：发现面禁任何 fs 写/删/改名调用',
  },
] as const

/** discovery.ts 的 node:fs 导入封闭集（读三件套——readdir/readFile/stat） */
const DISCOVERY_FS_IMPORT_ALLOWLIST = ['readdirSync', 'readFileSync', 'statSync'] as const

/**
 * 锚③：发现面（discovery.ts）文件系统级只读面 + 单向吸收白名单在场（SC3 + SC8）。
 * 正锚三件：fs 导入 = 读三件套封闭集；吸收白名单常量封闭（FRONTMATTER_KEYS 四键——
 * PRD「旧线 manifest 的 title/status + 文档索引，显式清单豁免」）；单向阀门标记
 * （INSERT OR IGNORE——DB 为 SoT，重扫不覆写）在场。
 */
export function auditDiscoveryReadOnlyFace(root: string = REPO_ROOT): AuditFinding[] {
  const findings: AuditFinding[] = []
  const anchor = 'sc3-discovery-readonly'
  const discoveryPath = join(root, 'packages/core/src/forge/workspace/discovery.ts')
  const src = readSourceOrNull(discoveryPath)
  if (src === null) {
    return [{ anchor, detail: 'packages/core/src/forge/workspace/discovery.ts 缺席——发现面载体丢失' }]
  }
  findings.push(...hitsToFindings(anchor, scanFilesForRules(root, [discoveryPath], DISCOVERY_WRITE_RULES)))
  const fsImport = src.match(/import\s*\{([^}]+)\}\s*from\s*['"]node:fs['"]/)
  if (fsImport === null) {
    findings.push({ anchor, detail: 'discovery.ts 无 node:fs 导入——读面载体异常' })
  } else {
    const names = fsImport[1]!.split(',').map((s) => s.trim()).filter((s) => s !== '')
    const got = [...names].sort().join(',')
    const want = [...DISCOVERY_FS_IMPORT_ALLOWLIST].sort().join(',')
    if (got !== want) {
      findings.push({
        anchor,
        detail: `discovery.ts node:fs 导入集 ${got} ≠ 读三件套封闭集 ${want}（SC3：发现面仅 readdir/readFile/stat 只读调用）`,
      })
    }
  }
  if (!/INSERT OR IGNORE/.test(src)) {
    findings.push({ anchor, detail: 'discovery.ts 单向阀门标记（INSERT OR IGNORE）缺席——SC8 单向吸收纪律失守' })
  }
  return findings
}

/**
 * 锚③附：吸收白名单常量封闭集断言（运行期 import——非字符串扫描）。
 * DOC_KIND_FILES 七类文档索引 + FRONTMATTER_KEYS 四键（title/status/summary/author）。
 */
export function auditAbsorptionWhitelist(): AuditFinding[] {
  const anchor = 'sc8-absorption-whitelist'
  const findings: AuditFinding[] = []
  const kinds = Object.keys(DOC_KIND_FILES).sort()
  const wantKinds = ['er-diagram', 'page-map', 'prd-spec', 'sql-schema', 'tech-design', 'ui-functions', 'user-stories']
  if (kinds.join(',') !== wantKinds.join(',')) {
    findings.push({ anchor, detail: `DOC_KIND_FILES 文档索引白名单 ${kinds.join(',')} ≠ 七类约定 ${wantKinds.join(',')}` })
  }
  const keys = [...FRONTMATTER_KEYS]
  const wantKeys = ['title', 'status', 'summary', 'author']
  if (keys.join(',') !== wantKeys.join(',')) {
    findings.push({ anchor, detail: `FRONTMATTER_KEYS 吸收字段白名单 ${keys.join(',')} ≠ 封闭集 ${wantKeys.join(',')}（SC8 显式清单豁免面）` })
  }
  return findings
}

// ───────────────────────── 锚④：web 无编排逻辑 + 旧技能引用零悬空 ─────────────────────────

/** web 编排禁令（写动词调用形——SC7 面分治：add/claim/submit/createProposal/transitionProposal = tool 专属） */
const WEB_RULES = [
  {
    id: 'web-write-verb-call',
    pattern: /\b(?:addTask|claimTask|submitTask|createProposal|transitionProposal)\s*\(/,
    message: 'web 无编排：写动词调用形在场（tool 专属动词——web 只经 RPC 人类面 transition/读面）',
  },
  {
    id: 'web-dispatch-prompt',
    pattern: /\bdispatchPrompt\b/,
    message: 'web 无编排：dispatchPrompt 合成/引用在场（简报合成 = core claimTask 内聚）',
  },
  {
    id: 'web-data-layer-import',
    pattern: /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](?:@dsh-forge\/(?:core|knowledge)|better-sqlite3)['"]/,
    message: 'web 无编排：禁数据层直连 import（renderer 只经 IPC RPC）',
  },
  {
    id: 'web-fs-write',
    pattern: /\b(?:writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync|cpSync|renameSync)\s*\(/,
    message: 'web 无编排：禁 fs 写调用（单一写入路径 = core 服务独占）',
  },
] as const

/**
 * 锚④a：web 无编排逻辑（apps/web 只读渲染 + RPC 薄 Controller——MVC 落位裁决：
 * Controller = RPC 通道族（人类面）+ tool 面（agent 面）；apps/web = View）。
 * 转移对话框 submitTaskTransition（RPC transition 人类通道）与 UI 文案字符串不命中
 * （调用形要求动词后紧跟 `(`）。
 */
export function auditWebNoOrchestration(root: string = REPO_ROOT): AuditFinding[] {
  const webDir = join(root, 'apps/web/src')
  if (!pathExists(webDir)) return [{ anchor: 'web-no-orchestration', detail: 'apps/web/src 缺席' }]
  return hitsToFindings('web-no-orchestration', scanFilesForRules(root, listSourceFiles(webDir), WEB_RULES))
}

/**
 * M3 显式豁免清单（旧技能引用中「执行技能面 = M3」的已裁决先置引用——2.2 记录：
 * 「eval/gen 系技能引用先置（词汇+模板 M2 保留，执行技能 = M3）」+ doc.ts/coding.ts
 * 头注「技能类模板 M3 技能面承接，文本先置」）。新增豁免须附裁决出处——禁静默扩池。
 */
export const M3_DEFERRED_SKILL_REFS: readonly string[] = [
  'eval', // eval 系执行技能（eval.ts 头注——tech-design §Interface 9 / Open Questions：M3 随 eval-* 技能）
  'gen-contracts', // gen 系执行技能（test.ts 头注：gen/eval 技能面 = M3，词汇+模板保留先置）
  'gen-journeys',
  'gen-test-scripts',
  'consolidate-specs', // doc.ts 头注：技能类模板 M3 技能面承接（doc-consolidate）
  'clean-code', // coding.ts code-quality-simplify：老模板技能引用平移（同 M3 承接口径）
]

/** 技能引用扫描域（产品文本三处：core prompt 模板 + plugin src + plugin skills） */
const SKILL_REF_SCAN_DIRS = [
  'packages/core/src/forge/tasks/prompt',
  'packages/plugin-forge/src',
  'packages/plugin-forge/skills',
] as const

/** Skill(skill="forge:<name>") 引用提取形（3.3 记录装配缝：引用为 forge: 前缀形制，挂载名 = 裸名） */
const SKILL_REF_RE = /Skill\(\s*skill\s*=\s*"forge:([a-z0-9-]+)"/g

/**
 * 锚④b：旧技能悬空引用零残留——产品文本内一切 `Skill(skill="forge:X")` 引用必须
 * 解析到 plugin-forge 挂载技能目录（customSkillDirs 物理挂载面，裸名对齐）或
 * M3 显式豁免清单；两者皆不命中 = 悬空残留（executor 将调用不存在的技能）。
 */
export function auditSkillReferencesResolved(root: string = REPO_ROOT): AuditFinding[] {
  const anchor = 'skill-refs-resolved'
  const findings: AuditFinding[] = []
  const skillsDir = join(root, 'packages/plugin-forge/skills')
  const mounted = new Set(
    readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name),
  )
  const deferred = new Set(M3_DEFERRED_SKILL_REFS)
  const refs: Array<{ name: string; file: string; line: number }> = []
  for (const dir of SKILL_REF_SCAN_DIRS) {
    const absDir = join(root, dir)
    if (!pathExists(absDir)) continue
    for (const abs of listSourceFiles(absDir, { extensions: ['.ts', '.tsx', '.mts', '.md'] })) {
      const src = readSourceOrNull(abs)
      if (src === null) continue
      const scanned = abs.endsWith('.md') ? src : src // 引用形态在模板字符串/SKILL.md 正文——原文扫描（.md 无注释；.ts 剥注释会误伤模板字符串内的引号闭合面）
      for (const [idx, line] of scanned.split('\n').entries()) {
        for (const m of line.matchAll(SKILL_REF_RE)) {
          refs.push({ name: m[1]!, file: `${dir}/${relative(join(root, dir), abs).split('\\').join('/')}`, line: idx + 1 })
        }
      }
    }
  }
  if (refs.length === 0) {
    findings.push({ anchor, detail: '产品文本零技能引用——扫描面异常（run-tests 等既有引用缺席即断言面失效）' })
  }
  for (const r of refs) {
    if (!mounted.has(r.name) && !deferred.has(r.name)) {
      findings.push({
        anchor,
        detail: `${r.file}:${r.line} 引用 forge:${r.name} 既不在挂载技能目录（${[...mounted].sort().join('/') || '空'}）也不在 M3 豁免清单——旧技能悬空引用残留`,
      })
    }
  }
  return findings
}

/** 审计锚全集（源码面）——spec/单测单入口消费；任一 finding = 对应产码任务缺陷回流 */
export function runAllSourceAuditAnchors(root: string = REPO_ROOT): AuditFinding[] {
  return [
    ...auditForgeNoWatchBackflow(root),
    ...auditNoLegacyMigrationTool(root),
    ...auditDiscoveryReadOnlyFace(root),
    ...auditAbsorptionWhitelist(),
    ...auditWebNoOrchestration(root),
    ...auditSkillReferencesResolved(root),
  ]
}
