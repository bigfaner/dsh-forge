// worktree-branch-management 1.7 装配层集成测试：真机 git CLI + core GitIdentityPort +
// 集成层扩展点实现（worktree-identity.ts）。真实仓库/worktree 落临时目录（外部依赖装配面
// ——真机取证口径：fake 全绿不算交付，此处 git 链全真）。
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createGitIdentityPort } from '@dsh-forge/core'
import { createWorktreeIdentity, type ForgeProjectsIdentityFace } from './worktree-identity.js'

const run = promisify(execFile)

let ROOT: string
let REPO: string // 主 worktree（注册根）
let WTA: string // 附属 worktree（feat/a）
let NONGIT: string

const git = async (cwd: string, args: string[]): Promise<string> => {
  const r = await run('git', args, { cwd, env: { ...process.env, GIT_CONFIG_GLOBAL: 'C:\\nonexistent' } })
  return r.stdout.trim()
}

beforeAll(async () => {
  ROOT = mkdtempSync(join(tmpdir(), 'dsh-forge-wt-identity-'))
  REPO = join(ROOT, 'repo')
  WTA = join(ROOT, 'wt-a')
  NONGIT = join(ROOT, 'nongit')
  mkdirSync(REPO, { recursive: true })
  mkdirSync(NONGIT, { recursive: true })
  await git(REPO, ['init', '-b', 'main'])
  writeFileSync(join(REPO, 'a.txt'), 'a\n')
  await git(REPO, ['add', '.'])
  await git(REPO, ['-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '-m', 'init'])
  await git(REPO, ['worktree', 'add', '-b', 'feat/a', WTA])
}, 60_000)

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

/** forgeProjects 行集桩（形状 = contracts 面；行集 = 本测试注册态） */
function stubProjects(rows: { id: string; wsPath: string; worktreeDir?: string }[]): ForgeProjectsIdentityFace {
  return {
    async listProjects() {
      return rows.map((r) => ({ id: r.id, workspaceId: 'w', name: 'n', wsPath: r.wsPath, archived: false }))
    },
    async getProject(id: string) {
      const r = rows.find((x) => x.id === id)
      return r === undefined
        ? null
        : {
            id: r.id,
            workspaceId: 'w',
            wsPath: r.wsPath,
            name: 'n',
            forgeDir: join(r.wsPath, '.forge'),
            forgeDirExternal: false,
            knowledgeDir: join(r.wsPath, '.knowledge'),
            ...(r.worktreeDir !== undefined ? { worktreeDir: r.worktreeDir } : {}),
            archived: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          }
    },
  }
}

describe('1.7 扩展点注入装配（集成层实现——真机 git 链）', () => {
  it('AC1：worktree 路径 resolveProject → 主项目归属非 null（同锚 projects 行：id/projectRoot/isGit）', async () => {
    const identity = createWorktreeIdentity(stubProjects([{ id: 'p-main', wsPath: REPO }]), createGitIdentityPort())
    const resolved = await identity.resolveProject(WTA)
    expect(resolved).not.toBeNull()
    expect(resolved).toMatchObject({ projectId: 'p-main', projectRoot: REPO, isGit: true })
    // 注册根本体同锚自归（精确 ws_path 命中短路）
    expect(await identity.resolveProject(REPO)).toMatchObject({ projectId: 'p-main', projectRoot: REPO, isGit: true })
  })

  it('非 git 目录 / 未注册仓库 → null（fail-soft：归并失效退独立语义）', async () => {
    const identity = createWorktreeIdentity(stubProjects([{ id: 'p-main', wsPath: REPO }]), createGitIdentityPort())
    expect(await identity.resolveProject(NONGIT)).toBeNull()
    const other = join(ROOT, 'elsewhere')
    mkdirSync(other, { recursive: true })
    await git(other, ['init', '-b', 'main'])
    expect(await identity.resolveProject(other)).toBeNull()
  })

  it('AC2：getWorktreeDir 提供 worktree_dir 列值（每项目可配）；未配置/未注册退默认 <root>/.forge/worktrees', async () => {
    const identity = createWorktreeIdentity(
      stubProjects([
        { id: 'p-a', wsPath: REPO, worktreeDir: join(ROOT, 'custom-wt') },
        { id: 'p-b', wsPath: NONGIT }, // 未配置列 → 默认
      ]),
    )
    await expect(identity.refresh()).resolves.toBe(true) // 装配期快照
    expect(identity.getWorktreeDir(REPO)).toBe(join(ROOT, 'custom-wt'))
    expect(identity.getWorktreeDir(NONGIT)).toBe(join(NONGIT, '.forge', 'worktrees'))
    expect(identity.getWorktreeDir(join(ROOT, 'unknown'))).toBe(join(ROOT, 'unknown', '.forge', 'worktrees'))
  })

  it('resolveProject 顺带刷新目录快照（同步提供者的取数缓存随归并自愈）', async () => {
    const rows = { id: 'p-main', wsPath: REPO, worktreeDir: join(ROOT, 'late-wt') }
    const identity = createWorktreeIdentity(stubProjects([rows]))
    // 刷新前：默认目录（快照空）
    expect(identity.getWorktreeDir(REPO)).toBe(join(REPO, '.forge', 'worktrees'))
    await identity.resolveProject(WTA)
    expect(identity.getWorktreeDir(REPO)).toBe(join(ROOT, 'late-wt'))
  })

  it('listProjects 抛异常 → resolveProject null、refresh false（永不抛断装配）', async () => {
    const broken: ForgeProjectsIdentityFace = {
      listProjects: () => Promise.reject(new Error('boom')),
      getProject: () => Promise.reject(new Error('boom')),
    }
    const identity = createWorktreeIdentity(broken, createGitIdentityPort(), () => {})
    expect(await identity.resolveProject(WTA)).toBeNull()
    await expect(identity.refresh()).resolves.toBe(false)
  })
})
