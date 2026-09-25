// tests/e2e/specs/dual-form-transition/harness — the journey's worlds
// (T-test-gen-scripts, contract-derived).
//
// Traceability: docs/features/dsh-forge-m3/testing/dual-form-transition/
// contracts/step-{1..3}-*.md. Worlds:
//   registered — feature `dual-form`(已迁移;两轮交替的骑手任务 ×2);
//   files      — 同型已注册未迁移项目(authority-guard 腿);
//   cli        — 未注册 forge 检出(git 根标记 + CLI 方言 frontmatter 任务
//                md;全程只属于 forge CLI)。
// // VERIFY: pre-M3 golden 基线对照集(冻结 CLI 预录制)非仓内工件 —— 本旅程
// 的 CLI 腿以行为级断言(输出标记 + 落数据对拍)承载(SC7 先例口径);golden
// 逐字对拍面留待基线工件落地。

import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildKernelWorld, type KernelWorld, type TaskSpec } from '../_lib/journey-world.ts'

export const DUAL_FEATURE = 'dual-form'

const REGISTERED_TASKS: readonly TaskSpec[] = [
  { stem: '1-x', localId: '1', title: '双形态交替任务一(dual-form)', status: 'pending', type: 'coding.feature', dependencies: [] },
  { stem: '2-x', localId: '2', title: '双形态交替任务二(dual-form)', status: 'pending', type: 'coding.feature', dependencies: [] },
]

const SHAPE = { slug: DUAL_FEATURE, status: 'tasks', docKinds: ['prd', 'design'] }

/** The registered (migrated) app-channel world. */
export async function buildRegisteredWorld(root: string): Promise<KernelWorld> {
  return await buildKernelWorld(root, {
    feature: SHAPE,
    tasks: REGISTERED_TASKS,
    stageAssets: [{ stage: 'design', goal: 'dual-form 目标锚点', summaryMark: 'dual-form 摘要锚点。' }],
  })
}

/** The registered-but-unmigrated (files authority) world. */
export async function buildFilesWorld(root: string): Promise<KernelWorld> {
  return await buildKernelWorld(root, { feature: SHAPE, tasks: REGISTERED_TASKS, migrate: false })
}

/** The unregistered CLI corpus anchors. */
export const CLI_FEATURE = 'dual-cli-unregistered'
export const CLI_BASE_TITLE = '双形态未注册基础任务(CLI 通道)'
export const CLI_BASE_ID = '1'

/**
 * Write the unregistered forge checkout: `.forge/state.json` + the CLI-era
 * dialect (manifest / index.json / a frontmatter-carrying base task md), then
 * `git init` — the CLI's root marker (SC7 形).
 */
export function buildUnregisteredCliCorpus(codeRoot: string): { codeRoot: string; indexPath: string } {
  mkdirSync(join(codeRoot, '.forge'), { recursive: true })
  writeFileSync(join(codeRoot, '.forge', 'state.json'), `${JSON.stringify({ feature: CLI_FEATURE }, undefined, 2)}\n`)
  const tasksDir = join(codeRoot, 'docs', 'features', CLI_FEATURE, 'tasks')
  mkdirSync(tasksDir, { recursive: true })
  writeFileSync(join(codeRoot, 'docs', 'features', CLI_FEATURE, 'manifest.md'), `---\nstatus: tasks\n---\n# ${CLI_FEATURE}\n`)
  const indexPath = join(tasksDir, 'index.json')
  writeFileSync(indexPath, `${JSON.stringify({
    feature: CLI_FEATURE,
    tasks: {
      '1-base': {
        id: CLI_BASE_ID,
        title: CLI_BASE_TITLE,
        priority: 'P1',
        status: 'pending',
        dependencies: [],
        type: 'doc',
        file: '1-base.md',
        record: 'records/1-base.md',
      },
    },
    // 真 CLI 的 index 方言:submit 会按 statusEnum 校验记录状态
    // (缺位 → "Invalid status"),priorityEnum 同为枚举面。
    statusEnum: ['pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected'],
    priorityEnum: ['P0', 'P1', 'P2'],
  }, undefined, 2)}\n`)
  writeFileSync(join(tasksDir, '1-base.md'), [
    '---',
    'id: "1"',
    `title: "${CLI_BASE_TITLE}"`,
    'priority: "P1"',
    'status: pending',
    'dependencies: []',
    'type: doc',
    '---',
    '',
    `# 1 — ${CLI_BASE_TITLE}`,
    '',
    '未注册项目语料 —— 全程只属于 forge CLI(双形态:两通道并存互不破坏)。',
    '',
  ].join('\n'))
  execSync('git init -q .', { cwd: codeRoot, timeout: 30_000 })
  return { codeRoot, indexPath }
}

/** The CLI index.json task rows (the CLI 权威文件 face). */
export function cliIndexTasks(indexPath: string): Map<string, { id: string; title: string; status: string }> {
  const parsed = JSON.parse(readFileSync(indexPath, 'utf8')) as { tasks: Record<string, { id: string; title: string; status: string }> }
  return new Map(Object.entries(parsed.tasks).map(([, row]) => [row.id, row]))
}

/**
 * Write the CLI submit record JSON into the corpus (the real CLI's `--data`
 * face: submit REQUIRES record data — summary is hard-required, stdin is
 * unreliable on Windows). Returns the path to pass as `--data`.
 */
export function writeCliRecordData(codeRoot: string, taskId: string, summary = 'dual-form CLI leg record'): string {
  const dataPath = join(codeRoot, '.forge', `submit-${taskId}.json`)
  writeFileSync(dataPath, `${JSON.stringify({ taskId, status: 'completed', summary }, undefined, 2)}\n`)
  return dataPath
}
