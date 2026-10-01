// tests/e2e/specs/project-registration-projection/harness — the journey's
// worlds, the path-probe fixture family, and the C7 确认卡 dialect
// (T-test-gen-scripts, contract-derived).
//
// Traceability: docs/features/dsh-forge-m4/testing/project-registration-
// projection/contracts/step-{1..5}-*.md. Worlds:
//   main — 已注册基线项目 `reg-base`(同名同序断言基线,fixture_spec 的
//          Project ×1)+ 隔离 DSH_HOME(投影通道可写);
//   probe fixture family(卡内路径侦测布景,全部落在 journey root):
//     forgeRepo   — .git + 仓内 forge 树(docs/features/<slug>/manifest.md)
//                   → repo-existing 档(沿用仓内);
//     gitOnlyRepo — 仅 .git(无 forge 树)→ repo-new 档(仓内新建 docs);
//     nogitDir    — 存在可读目录、零 .git → nogit 信息态(应用管理主路径);
//     parentDir   — 含 ≥2 个 .git 子仓 → parent 态(子仓 chips);
//     missingPath — 不存在路径 → missing 态;
//     outsideDir  — 仓外自定义路径目录(custom 授权腿)。
// The C7 card dialect (unit-proven selectors: confirm-card.spec.tsx) rides
// the REAL probeProjectPath chain through the REAL card.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { seedLineageCorpus } from '../../stubs/lineage-corpus.ts'
import {
  bootM4World, freshRoot, m4Env, type M4World, type M4WorldManager,
} from '../_lib/m4-world.ts'
import { buildKernelWorld, type KernelWorld } from '../_lib/journey-world.ts'
import { registerFixtureProject } from '../../../../apps/desktop/e2e/fixtures/forge-project.ts'

/** The baseline project's feature (the 同名同序 baseline corpus). */
export const BASE_FEATURE = 'reg-base'

/** The probe fixture family paths (one builder, stable anchors). */
export interface ProbeFixtures {
  readonly forgeRepo: string
  readonly gitOnlyRepo: string
  readonly nogitDir: string
  readonly parentDir: string
  readonly parentChildren: readonly string[]
  readonly missingPath: string
  readonly outsideDir: string
  readonly neutralDir: string
}

/** The REAL 会话语料 ids(step-5 归组腿:其一 = 新项目锚点,其二 = 未注册目录)。 */
export const SESS_NEW = 'reg-sess-new'
export const SESS_NEUTRAL = 'reg-sess-neutral'

/** Write the probe fixture family under one root (git/forge/nogit/parent forms). */
export function buildProbeFixtures(root: string): ProbeFixtures {
  const fixtures: ProbeFixtures = {
    forgeRepo: join(root, 'probe-forge-repo'),
    gitOnlyRepo: join(root, 'probe-git-only'),
    nogitDir: join(root, 'probe-nogit'),
    parentDir: join(root, 'probe-parent'),
    parentChildren: ['child-alpha', 'child-beta'],
    missingPath: join(root, 'probe-ghost-repo'),
    outsideDir: join(root, 'probe-outside-docs'),
    neutralDir: join(root, 'probe-neutral-home'),
  }
  // forgeRepo:.git + docs/features/<slug>/manifest.md(repo-existing 档)。
  const featureDir = join(fixtures.forgeRepo, 'docs', 'features', 'legacy-feature')
  mkdirSync(join(fixtures.forgeRepo, '.git'), { recursive: true })
  mkdirSync(featureDir, { recursive: true })
  writeFileSync(join(featureDir, 'manifest.md'), 'slug: legacy-feature\n', 'utf8')
  // gitOnlyRepo:仅 .git(repo-new 档;docs 懒物化)。
  mkdirSync(join(fixtures.gitOnlyRepo, '.git'), { recursive: true })
  // nogitDir:零 .git 一等公民目录。
  mkdirSync(fixtures.nogitDir, { recursive: true })
  // parentDir:≥2 个 .git 子仓(parent 态 chips)。
  for (const child of fixtures.parentChildren) {
    mkdirSync(join(fixtures.parentDir, child, '.git'), { recursive: true })
  }
  // outsideDir + neutralDir:仓外自定义/未注册目录布景。
  mkdirSync(fixtures.outsideDir, { recursive: true })
  mkdirSync(fixtures.neutralDir, { recursive: true })
  return fixtures
}

export interface RegJourneyRoot {
  readonly root: string
  readonly dshHome: string
  readonly kernel: KernelWorld
  readonly fixtures: ProbeFixtures
}

/**
 * Build the registration journey root:baseline kernel project + probe fixture
 * family + (optionally) the REAL 会话语料 pair(step-5 归组腿 —— cwd 分别落
 * 新项目锚点与未注册目录,boot 前 pre-seed 经 REAL persistence backend)。
 */
export async function buildRegJourneyRoot(options: { readonly seedGroupingSessions?: boolean } = {}): Promise<RegJourneyRoot> {
  const root = freshRoot('m4-reg')
  const kernel = await buildKernelWorld(root, {
    feature: { slug: BASE_FEATURE, status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-reg' },
    tasks: [{ stem: '1.1', localId: '1.1', title: 'reg baseline task', status: 'pending', type: 'coding.feature', dependencies: [] }],
    // 基线走 post-boot 真动词注册(pre-boot repo 写径不触投影链 —— registered
    // 侦测/同名同序投影断言的语料前提;sc3 纪律,与 lifecycle 旅程同构)。
    register: false,
  })
  const fixtures = buildProbeFixtures(root)
  const dshHome = join(root, 'dsh-home')
  mkdirSync(dshHome, { recursive: true })
  if (options.seedGroupingSessions === true) {
    const now = Date.now()
    await seedLineageCorpus({
      dshHome,
      seeds: [
        { sessionId: SESS_NEW, cwd: fixtures.forgeRepo, createdAt: now - 30_000, title: '注册归组会话(锚点)', turnStart: true },
        { sessionId: SESS_NEUTRAL, cwd: fixtures.neutralDir, createdAt: now - 20_000, title: '未注册目录会话', turnStart: true },
      ],
    })
  }
  return { root, dshHome, kernel, fixtures }
}

/** Boot the registration world over the journey root (isolated DSH_HOME). */
export async function bootRegWorld(manager: M4WorldManager, tag: string, built: RegJourneyRoot, extraEnv: Record<string, string> = {}): Promise<M4World> {
  const world = await manager.acquire(async () => await bootM4World({
    tag, root: built.root, dshHome: built.dshHome, kernel: built.kernel,
    env: m4Env(built.dshHome, extraEnv),
  }))
  // 基线项目经【真动词】注册落位(registerProject → activateProject;投影链
  // 全程在场 —— registered 快车道侦测与「基线居首」序断言的语料前提)。
  const kernel = built.kernel as { projectId: string }
  kernel.projectId = await registerFixtureProject(world.page, {
    codeRoot: built.kernel.codeRoot,
    docsRoot: built.kernel.docsRoot,
    indexPaths: [],
    manifestPaths: [],
    featuresDir: join(built.kernel.docsRoot, 'docs', 'features'),
  })
  return world
}

// ---------------------------------------------------------------------------
// The C7 确认卡 dialect (unit-proven selectors on the REAL probe chain)
// ---------------------------------------------------------------------------

/** The zh detect-state copy anchors (locale keys grounded in zh.ts). */
export const DETECT_COPY = {
  git: '✓ git 仓库',
  gitForge: '✓ git 仓库 · 检出 forge 文档树',
  registered: '已注册项目 — 同一代码根仅一个项目',
  missing: '路径不存在',
  unreadable: '目录不可读',
  parent: '该目录下含多个 git 仓库',
  nogit: '未检测到 git — 无需 git,文档将由应用管理(不写入本目录)',
  invalid: '路径无效',
} as const

/** Open the C7 添加项目确认卡 through the 左栏区头 ＋ (the sole registry entry). */
export async function openAddCard(page: Page): Promise<void> {
  await page.locator('[data-dsh-forge-tree-add-btn]').click()
  await expect(page.locator('[data-dsh-forge-dialog="confirm-card"]'),
    'C7 确认卡原位弹出(不跳页)').toBeVisible({ timeout: 10_000 })
}

/** Dismiss the card through its 取消(Esc) face. */
export async function cancelAddCard(page: Page): Promise<void> {
  await page.locator('[data-dsh-forge-confirm-cancel]').click()
  await expect(page.locator('[data-dsh-forge-dialog="confirm-card"]')).toHaveCount(0, { timeout: 10_000 })
}

/** Type one path into the card's 代码区 input (the paste entry face). */
export async function typeCodePath(page: Page, path: string): Promise<void> {
  await page.locator('[data-dsh-forge-confirm-code]').fill(path)
}

/** The detect statement's settled text (poll helper input). */
export async function detectText(page: Page): Promise<string> {
  return await page.locator('[data-dsh-forge-confirm-detect]').textContent().catch(() => '')
}

/** Wait until the detect statement settles on the expected copy. */
export async function waitDetect(page: Page, expected: string, label: string): Promise<void> {
  await expect.poll(() => detectText(page), { timeout: 20_000, message: `侦测陈述收敛:${label}` }).toContain(expected)
}

/** The submit button's disabled state. */
export async function submitDisabled(page: Page): Promise<boolean> {
  return await page.locator('[data-dsh-forge-confirm-submit]').isDisabled()
}

/** The registered-project fast lane's toast anchor (zh copy verbatim). */
export const LOCATED_TOAST = /已注册 · 已打开/
