// 证据效度域生产取数真机回归（装配面——R1-major① f913fc49 后落位）：currentValidityDomain
// 生产实现（git 子进程 + pnpm-lock sha-256）+ node:fs io 适配 EvidencePointerIo 注入缝的
// 端到端行为。1.16 判例通道回归：fix 落地后重领，陈旧 resume.md 证据不得复用。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { currentValidityDomain } from './index.js'
import { readEvidencePointerState, writeEvidenceValidityStamp, RESUME_POINTER_FILE, type EvidencePointerIo } from './forge/tasks/evidence-pointer.js'

/** 生产 io 适配（与 src/index.ts 装配闭包同形——node:fs 三法） */
const nodeIo: EvidencePointerIo = {
  exists: (p) => existsSync(p),
  readTextFile: (p) => readFileSync(p, 'utf8'),
  writeTextFile: (p, d) => {
    writeFileSync(p, d, 'utf8')
  },
}

/** 真 git 检出夹具（pnpm-lock.yaml 基线在盘，两次提交模拟 fix 落地推进 HEAD） */
function gitCheckout(): string {
  const dir = mkdtempSync(join(tmpdir(), 'forge-evidence-git-'))
  const run = (args: string): void => {
    execFileSync('git', args.split(' '), { cwd: dir, stdio: 'ignore' })
  }
  run('init')
  execFileSync('git', ['config', 'user.email', 't@example.invalid'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir, stdio: 'ignore' })
  writeFileSync(join(dir, 'pnpm-lock.yaml'), 'lockfile: v1\n', 'utf8')
  writeFileSync(join(dir, 'a.txt'), 'one\n', 'utf8')
  run('add .')
  run('commit -m base')
  return dir
}

describe('currentValidityDomain（装配面生产实现——真 git 检出）', () => {
  it('真检出 → HEAD + lock 指纹；fix 落地（新提交）→ HEAD 漂移；非 git 目录 → undefined', () => {
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

  it('1.16 判例回归（真盘 io 注入全链）：首轮结算落戳 → fix 落地 HEAD 推进 → 重领比对 = stale', () => {
    const container = mkdtempSync(join(tmpdir(), 'forge-evidence-116-'))
    mkdirSync(join(container, 'logs', 'proposal-x', '1.16'), { recursive: true })
    writeFileSync(join(container, 'logs', 'proposal-x', '1.16', RESUME_POINTER_FILE), '第一轮 25s 短路 blocked 的陈旧进度', 'utf8')
    const dir = gitCheckout()
    const firstDomain = currentValidityDomain(dir)!
    // 首轮结算写侧落戳（同 HEAD 同基线）
    expect(writeEvidenceValidityStamp(nodeIo, container, 'proposal-x', '1.16', firstDomain)).toBe(true)
    expect(readEvidencePointerState(nodeIo, container, 'proposal-x', '1.16', firstDomain).stale).toBe(false)
    // fix 落地（HEAD 推进）后重领：机械比对漂移 → stale（陈旧证据复用通道封死）
    writeFileSync(join(dir, 'a.txt'), 'two\n', 'utf8')
    execFileSync('git', ['commit', '-am', 'fix'], { cwd: dir, stdio: 'ignore' })
    const secondDomain = currentValidityDomain(dir)!
    expect(readEvidencePointerState(nodeIo, container, 'proposal-x', '1.16', secondDomain).stale).toBe(true)
  })
})
