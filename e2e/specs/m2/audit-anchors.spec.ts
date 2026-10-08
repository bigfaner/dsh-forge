// @feature:dsh-forge-m2-pipeline @web-e2e
// 5.3 审计四锚（AC2–AC5；Hard Rule：审计锚必须自动化——禁仅人工 checklist）：
//   ① 源码面（本 spec 首件 + vitest e2e-support 池双落点）：SC2 无 watch/回流/快照同步、
//      SC8 无迁移工具、SC3 发现面只读文件面 + 单向吸收白名单在场、web 无编排逻辑、
//      旧技能悬空引用零残留——全部经 e2e/support/audit 扫描断言（findings 必空）；
//   ② 运行面（本 spec 次件）：SC3 文件系统级零写入监控 + SC8 旧仓文件未动——旧线目录
//      结构夹具（manifest/约定文档/旧仓任务文件/proposal）全流程（注册→发现面→四域读）
//      前后树快照逐字节对照：既有文件 size/mtime/内容哈希零变化、新文件仅限产品状态
//      自有目录（.forge/.knowledge——P1 注册链递归建面）；旧仓任务文件零吸收为任务行
//      （零迁移——发现面只按白名单建 features/feature_documents/proposals 行）。
// M3 drift 台账（5.2 落定）：featureSlug → source:ContainerRef 容器化（1.1/2.4）+ INSERT 列
// source_kind/source_id（schema v1 直改）+ 4.6 v22 容器 pill/视图下拉锚随迁；claimTask 桥直调
// = core 服务 API 保留面（3.5 tool 退役——drift #1 处置：回放主径零波及）。

import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { FEATURES_CHANNELS, PROPOSALS_CHANNELS, TASKS_CHANNELS, DOCS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { runAllSourceAuditAnchors } from '../../support/audit/anchors.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { forgeInvoke, registerProject } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'

// ───────────────────────── ① 源码面审计锚（无 app——扫描即断言） ─────────────────────────

test('@web-e2e @m2 5.3 审计锚（源码面）：无 watch/回流 + 零迁移 + 发现面只读白名单 + web 无编排 + 旧技能零悬空', () => {
  const findings = runAllSourceAuditAnchors()
  expect(
    findings,
    `审计四锚源码面零残留（任一 finding = 对应产码任务缺陷经 fix 任务回流，不放宽断言）：\n${findings
      .map((f) => `${f.anchor}: ${f.detail}`)
      .join('\n')}`,
  ).toEqual([])
})

// ───────────────────────── ② 运行面：SC3 零写入 + SC8 旧仓未动 ─────────────────────────

/** 产品注册链自建的工作区内状态目录（P1 口径——零写入断言的显式豁免根） */
const APP_STATE_ROOTS = new Set(['.forge', '.knowledge'])

interface FileSnapshot {
  readonly size: number
  readonly mtimeMs: number
  readonly sha256: string
}

/** 工作区文件树快照（文件面：rel → size/mtime/内容哈希；目录 mtime 随子项创建自然漂移，不属写入面） */
function snapshotTree(root: string): Map<string, FileSnapshot> {
  const out = new Map<string, FileSnapshot>()
  const walk = (dir: string, rel: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel === '' ? e.name : `${rel}/${e.name}`
      const abs = join(dir, e.name)
      if (e.isDirectory()) walk(abs, relPath)
      else if (e.isFile()) {
        const st = statSync(abs)
        out.set(relPath, { size: st.size, mtimeMs: st.mtimeMs, sha256: createHash('sha256').update(readFileSync(abs)).digest('hex') })
      }
    }
  }
  walk(root, '')
  return out
}

test('@web-e2e @m2 5.3 审计锚（运行面）：SC3 全流程零写入 + SC8 旧仓文件未动 + 白名单吸收在场', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-audit-'))
  const wsDir = join(fixtureRoot, 'ws-legacy')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-audit-ud-'))

  // ── 旧线目录结构夹具（发现面约定 + 旧仓任务文件 + 约定外文件——未动断言的完整面）。
  //    forge_dir = <ws>/.forge（projects 行口径）——发现面扫描 docs/features|proposals
  //    于 forge_dir 之下（service-assembly 同构）；旧仓任务文件与约定外文件置同域。──
  const put = (rel: string, content: string): void => {
    mkdirSync(join(wsDir, rel, '..'), { recursive: true })
    writeFileSync(join(wsDir, rel), content, 'utf8')
  }
  put('.forge/docs/features/legacy-demo/manifest.md', '---\ntitle: 遗留演示特性\nstatus: prd\n---\n\n旧线 manifest 正文（原地保留断言面）。\n')
  put('.forge/docs/features/legacy-demo/prd/prd-spec.md', '# PRD\n\n旧线 PRD 正文——发现面文档索引与只读渲染的吸收断言面。\n')
  put('.forge/docs/features/legacy-demo/design/tech-design.md', '# 技术设计\n\n旧线设计文档正文。\n')
  put('.forge/docs/features/legacy-demo/tasks/1.1-impl.md', '---\nid: "1.1"\ntitle: 旧仓任务文件\n---\n\n旧仓任务文件——零迁移纪律：不吸收为任务行、原地未动。\n')
  put('.forge/docs/features/legacy-demo/tasks/index.json', '{\n  "tasks": ["1.1-impl.md"]\n}\n')
  put('.forge/docs/proposals/legacy-prop/proposal.md', '---\ntitle: 遗留提案\nstatus: draft\nauthor: e2e\n---\n\n旧线提案正文。\n')
  put('README.md', '# 旧仓演示工作区\n\n代码仓文件——SC3 零写入断言面。\n')
  put('src/app.ts', 'export const app = "legacy-workspace-file"\n')

  const before = snapshotTree(wsDir)

  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    // ── 全流程：注册（发现面扫描内聚）→ 四域读（features/proposals/docs/tasks）──
    const project = await registerProject(page, wsDir, '旧仓零迁移演示')
    const projectId = project.id

    const features = await forgeInvoke<readonly { slug: string; title: string; docCount: number; proposalSlug?: string }[]>(
      page,
      FEATURES_CHANNELS.list,
      { projectId },
    )
    const feature = features.find((f) => f.slug === 'legacy-demo')
    expect(feature, '发现面吸收 feature 行（manifest title 初值）').toBeDefined()
    expect(feature!.title).toBe('遗留演示特性')
    expect(feature!.docCount, '目录约定文档索引（prd-spec + tech-design 两行）').toBe(2)

    const proposals = await forgeInvoke<readonly { slug: string }[]>(page, PROPOSALS_CHANNELS.list, { projectId })
    expect(proposals.map((p) => p.slug)).toContain('legacy-prop')

    const doc = await forgeInvoke<{ content: string; dangling: boolean }>(page, DOCS_CHANNELS.read, {
      projectId,
      docRel: 'docs/features/legacy-demo/prd/prd-spec.md', // 相对 forge_dir（<ws>/.forge）
    })
    expect(doc.content).toContain('旧线 PRD 正文')
    expect(doc.dangling).toBe(false)

    const tasks = await forgeInvoke<readonly { localId: string }[]>(page, TASKS_CHANNELS.list, {
      projectId,
      source: { kind: 'feature', slug: 'legacy-demo' },
    })
    expect(tasks, 'SC8 零迁移：旧仓任务文件零吸收为任务行（发现面白名单无 tasks 面）').toEqual([])

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
  }

  // ── 树快照对照（SC3 + SC8 运行面）：既有文件逐字节未动 + 新文件仅限产品状态自有根 ──
  const after = snapshotTree(wsDir)
  const mutated: string[] = []
  for (const [rel, snap] of before) {
    const got = after.get(rel)
    if (got === undefined) {
      mutated.push(`${rel}：文件消失（零写入失守）`)
    } else if (got.size !== snap.size || got.sha256 !== snap.sha256) {
      mutated.push(`${rel}：内容被改写（size ${snap.size}→${got.size}，sha256 ${snap.sha256}→${got.sha256}）`)
    } else if (got.mtimeMs !== snap.mtimeMs) {
      mutated.push(`${rel}：mtime 漂移 ${snap.mtimeMs}→${got.mtimeMs}（触碰即违规——旧仓文件未动）`)
    }
  }
  const unexpectedNew: string[] = []
  for (const rel of after.keys()) {
    if (before.has(rel)) continue
    const top = rel.split('/')[0] ?? ''
    if (!APP_STATE_ROOTS.has(top)) unexpectedNew.push(rel)
  }
  expect(
    mutated,
    `SC3/SC8 运行面：全流程（注册→发现面→四域读）后旧仓/代码仓文件零改动（${before.size} 文件逐字节对照）`,
  ).toEqual([])
  expect(unexpectedNew, `新文件仅限产品状态自有目录（${[...APP_STATE_ROOTS].join('/')}）：${unexpectedNew.join(' | ')}`).toEqual([])

  rmDirBestEffort(fixtureRoot)
  rmDirBestEffort(userData)
})
