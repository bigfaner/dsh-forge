// worker-exec-evidence-replay 1.3 测试 —— 续跑指针读取（领取瞬间证据位探测）：
// 指针文件在盘 → logs/ 相对路径（正斜杠）；缺席/容器目录缺席 = undefined（首跑零行）。
// 路径形状与 notify/incident-log 同树同净化口径（logs/<slug>/<taskKey>/<file>）。
// disc 效度戳跟进 —— 三态判定：同 HEAD+基线 = 复用（fresh）；HEAD 漂移 = stale 强制重跑；
// 基线签名漂移 = stale 强制重跑；无戳存量证据（1.16 判例通道）= stale。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  currentValidityDomain,
  readEvidencePointer,
  readEvidencePointerState,
  RESUME_POINTER_FILE,
  RESUME_VALIDITY_FILE,
  stampMatches,
  writeEvidenceValidityStamp,
  type EvidenceValidityStamp,
} from './evidence-pointer.js'
import { RESUME_POINTER_FILE as POINTER_NAME } from './prompt/compose.js'

const FRESH: EvidenceValidityStamp = { head: 'aaaa', baseline: 'b1' }

function taskDir(container: string, slug = 'feat-x', localId = '1.3'): string {
  mkdirSync(join(container, 'logs', slug, localId), { recursive: true })
  return join(container, 'logs', slug, localId)
}

/** 证据位夹具：resume.md 在盘 + 可选效度戳 sidecar */
function evidenceWith(container: string, stamp?: EvidenceValidityStamp, slug = 'feat-x', localId = '1.3'): string {
  const dir = taskDir(container, slug, localId)
  writeFileSync(join(dir, RESUME_POINTER_FILE), '进度', 'utf8')
  if (stamp !== undefined) writeFileSync(join(dir, RESUME_VALIDITY_FILE), JSON.stringify(stamp), 'utf8')
  return container
}

describe('1.3 readEvidencePointer（领取瞬间证据位探测——fail-soft）', () => {
  it('常量同源：测试与约束块共享 RESUME_POINTER_FILE 单点定义', () => {
    expect(RESUME_POINTER_FILE).toBe('resume.md')
    expect(POINTER_NAME).toBe(RESUME_POINTER_FILE)
  })

  it('指针文件在盘 → `logs/<slug>/<localId>/resume.md` 相对路径（正斜杠）', () => {
    const container = mkdtempSync(join(tmpdir(), 'forge-evidence-ptr-'))
    evidenceWith(container)
    expect(readEvidencePointer(container, 'feat-x', '1.3')).toBe('logs/feat-x/1.3/resume.md')
  })

  it('指针文件缺席（目录在）→ undefined（首跑零行）', () => {
    const container = mkdtempSync(join(tmpdir(), 'forge-evidence-ptr-'))
    mkdirSync(join(container, 'logs', 'feat-y', '2.1'), { recursive: true })
    expect(readEvidencePointer(container, 'feat-y', '2.1')).toBeUndefined()
  })

  it('容器目录缺席 → undefined（fail-soft 不抛）', () => {
    expect(readEvidencePointer(undefined, 'feat-x', '1.3')).toBeUndefined()
    expect(readEvidencePointer('', 'feat-x', '1.3')).toBeUndefined()
    expect(readEvidencePointer('/nonexistent-container-zz', 'feat-x', '1.3')).toBeUndefined()
  })

  it('slug/localId 净化（同 incident-log 口径：非法字符折叠连字符）——净化后定位同一目录', () => {
    const container = mkdtempSync(join(tmpdir(), 'forge-evidence-ptr-'))
    evidenceWith(container)
    expect(readEvidencePointer(container, 'feat x', '1.3')).toBe('logs/feat-x/1.3/resume.md')
  })
})

describe('disc 效度戳——三态判定（同 HEAD 复用 / HEAD 漂移 / 基线签名漂移）', () => {
  it('效度戳一致（同 HEAD + 同基线签名）→ 复用（fresh，resume 语义不变）', () => {
    const container = evidenceWith(mkdtempSync(join(tmpdir(), 'forge-evidence-st-')), FRESH)
    expect(readEvidencePointerState(container, 'feat-x', '1.3', FRESH)).toEqual({
      pointer: 'logs/feat-x/1.3/resume.md',
      stale: false,
    })
  })

  it('HEAD 漂移（代码基线推进）→ stale 强制重跑（指针仍在——简报注入 stale 规则段）', () => {
    const container = evidenceWith(mkdtempSync(join(tmpdir(), 'forge-evidence-st-')), FRESH)
    const drifted: EvidenceValidityStamp = { head: 'bbbb', baseline: 'b1' }
    const state = readEvidencePointerState(container, 'feat-x', '1.3', drifted)
    expect(state.pointer).toBe('logs/feat-x/1.3/resume.md')
    expect(state.stale).toBe(true)
  })

  it('基线签名漂移（依赖环境变化）→ stale 强制重跑', () => {
    const container = evidenceWith(mkdtempSync(join(tmpdir(), 'forge-evidence-st-')), FRESH)
    const drifted: EvidenceValidityStamp = { head: 'aaaa', baseline: 'b2' }
    expect(readEvidencePointerState(container, 'feat-x', '1.3', drifted).stale).toBe(true)
  })

  it('无戳存量证据（disc 前形态——1.16 判例通道）→ stale（不可证效度）', () => {
    const container = evidenceWith(mkdtempSync(join(tmpdir(), 'forge-evidence-st-'))) // 仅 resume.md，无 sidecar
    expect(readEvidencePointerState(container, 'feat-x', '1.3', FRESH).stale).toBe(true)
  })

  it('戳形坏 / sidecar 读故障 → stale（fail-soft 不抛）', () => {
    const container = evidenceWith(mkdtempSync(join(tmpdir(), 'forge-evidence-st-')), FRESH)
    writeFileSync(join(container, 'logs', 'feat-x', '1.3', RESUME_VALIDITY_FILE), '{broken', 'utf8')
    expect(readEvidencePointerState(container, 'feat-x', '1.3', FRESH).stale).toBe(true)
  })

  it('当前效度域不可读（current 缺席）→ 机制惰性不判（fresh，形态兼容）', () => {
    const container = evidenceWith(mkdtempSync(join(tmpdir(), 'forge-evidence-st-'))) // 无戳也不判
    expect(readEvidencePointerState(container, 'feat-x', '1.3', undefined)).toEqual({
      pointer: 'logs/feat-x/1.3/resume.md',
      stale: false,
    })
  })

  it('stampMatches（纯函数）：双域全等 = true，任一漂移 = false', () => {
    expect(stampMatches(FRESH, FRESH)).toBe(true)
    expect(stampMatches(FRESH, { head: 'x', baseline: 'b1' })).toBe(false)
    expect(stampMatches(FRESH, { head: 'aaaa', baseline: 'x' })).toBe(false)
  })
})

describe('disc 效度戳——写侧与真实 git 检出（1.16 判例回归：fix 落地后重领）', () => {
  /** 真 git 检出夹具（pnpm-lock.yaml 基线在盘，两次提交模拟 fix 落地推进 HEAD） */
  function gitCheckout(): string {
    const dir = mkdtempSync(join(tmpdir(), 'forge-evidence-git-'))
    const run = (args: string): void => execFileSync('git', args.split(' '), { cwd: dir, stdio: 'ignore' })
    run('init')
    execFileSync('git', ['config', 'user.email', 't@example.invalid'], { cwd: dir, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: dir, stdio: 'ignore' })
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'lockfile: v1\n', 'utf8')
    writeFileSync(join(dir, 'a.txt'), 'one\n', 'utf8')
    run('add .')
    run('commit -m base')
    return dir
  }

  it('currentValidityDomain：真检出 → HEAD + lock 指纹；fix 落地（新提交）→ HEAD 漂移；非 git 目录 → undefined', () => {
    const dir = gitCheckout()
    const first = currentValidityDomain(dir)
    expect(first).toBeDefined()
    expect(first!.head).toBe(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim())
    expect(first!.baseline).toMatch(/^[0-9a-f]{16}$/)
    // fix 落地：HEAD 推进，基线签名不变
    writeFileSync(join(dir, 'a.txt'), 'two\n', 'utf8')
    execFileSync('git', ['commit', '-am', 'fix'], { cwd: dir, stdio: 'ignore' })
    const second = currentValidityDomain(dir)!
    expect(second.head).not.toBe(first!.head)
    expect(second.baseline).toBe(first!.baseline)
    // 非 git 目录 = 机制惰性
    expect(currentValidityDomain(mkdtempSync(join(tmpdir(), 'forge-evidence-nogit-')))).toBeUndefined()
    expect(currentValidityDomain(undefined)).toBeUndefined()
  })

  it('1.16 判例回归：首轮结算落戳 → fix 落地 HEAD 推进 → 重领比对 = stale 强制重跑', () => {
    const container = mkdtempSync(join(tmpdir(), 'forge-evidence-116-'))
    const dir = taskDir(container, 'proposal-x', '1.16')
    writeFileSync(join(dir, RESUME_POINTER_FILE), '第一轮 25s 短路 blocked 的陈旧进度', 'utf8')
    const dir1 = gitCheckout()
    const firstDomain = currentValidityDomain(dir1)!
    // 首轮结算写侧落戳（同 HEAD 同基线）
    expect(writeEvidenceValidityStamp(container, 'proposal-x', '1.16', firstDomain)).toBe(true)
    expect(readEvidencePointerState(container, 'proposal-x', '1.16', firstDomain).stale).toBe(false)
    // fix 落地（HEAD 推进）后重领：机械比对漂移 → stale（陈旧证据复用通道封死）
    writeFileSync(join(dir1, 'a.txt'), 'two\n', 'utf8')
    execFileSync('git', ['commit', '-am', 'fix'], { cwd: dir1, stdio: 'ignore' })
    const secondDomain = currentValidityDomain(dir1)!
    expect(readEvidencePointerState(container, 'proposal-x', '1.16', secondDomain).stale).toBe(true)
  })

  it('写侧 fail-soft：resume.md 缺席 = false 不落戳；写后 sidecar 在盘且可回读', () => {
    const container = mkdtempSync(join(tmpdir(), 'forge-evidence-w-'))
    expect(writeEvidenceValidityStamp(container, 'feat-x', '1.3', FRESH)).toBe(false)
    evidenceWith(container)
    expect(writeEvidenceValidityStamp(container, 'feat-x', '1.3', FRESH)).toBe(true)
    expect(existsSync(join(container, 'logs', 'feat-x', '1.3', RESUME_VALIDITY_FILE))).toBe(true)
  })
})
