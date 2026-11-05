// 1.6 存量收编服务面单测：scan 只读体检（违规/重复逐文件指名 + 零写入）+
// register 幂等注册（realpath canonical / 系统目录拒收 / reparse 拒收 / 入库默认
// unconfirmed）+ canonical 降指向出索引（双轨归并）。
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openKnowledgeDatabase } from '../storage/index.js'
import { createKnowledgeService } from './service.js'
import { isSystemDir } from './scan-register.js'
import type { BrowseKnowledgeService } from './types.js'

let home: string
let service: BrowseKnowledgeService
let db: import('better-sqlite3').Database
let wsDir: string
let knowledgeDir: string

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-scanreg-'))
  wsDir = join(home, 'ws')
  knowledgeDir = join(wsDir, '.knowledge')
  mkdirSync(knowledgeDir, { recursive: true })
  // 体检夹具：合格 1 / 缺 summary 1 / 无 id 1 / id 非法 1 / title 重复 2 / 正文重复（同 content 不同 title）2
  const ok = (name: string, fm: string, body = '正文内容 A') =>
    writeFileSync(join(knowledgeDir, name), `---\n${fm}\n---\n${body}`, 'utf8')
  ok('good.md', 'title: 合格条目\nid: kb-good\nsummary: 摘要\nkeywords: [a]', '正文内容 A')
  ok('no-summary.md', 'title: 缺摘要\nid: kb-nos\nkeywords: [a]', '正文内容 B0')
  ok('no-id.md', 'title: 无 id\nsummary: 摘要\nkeywords: [a]', '正文内容 B1')
  ok('bad-id.md', 'title: 非法 id\nid: Not Valid!!\nsummary: 摘要\nkeywords: [a]', '正文内容 B2')
  ok('dup-t1.md', 'title: 重复标题\nid: kb-dt1\nsummary: 摘要\nkeywords: [a]', '正文 B1')
  ok('dup-t2.md', 'title: 重复标题\nid: kb-dt2\nsummary: 摘要\nkeywords: [a]', '正文 B2')
  ok('dup-c1.md', 'title: 正文重复一\nid: kb-dc1\nsummary: 摘要\nkeywords: [a]', '正文 C')
  ok('dup-c2.md', 'title: 正文重复二\nid: kb-dc2\nsummary: 摘要\nkeywords: [a]', '正文 C')
  ok('stub1.md', 'title: 摘要存根一\nid: kb-st1\nsummary: 摘要型条目无正文一\nkeywords: [a]', '')
  ok('stub2.md', 'title: 摘要存根二\nid: kb-st2\nsummary: 摘要型条目无正文二\nkeywords: [a]', '')
  db = openKnowledgeDatabase(join(home, 'knowledge.db'))
  service = createKnowledgeService({ db, resolveWsPath: () => undefined })
})

afterAll(() => {
  db.close()
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

describe('scan 只读体检', () => {
  it('体检报告：violations + duplicates 逐文件指名（注册后；scan 前后 DB 行数不变——零写入）', async () => {
    await service.registerKnowledge({ wsPath: wsDir, projectId: 'p-scan' })
    const before = (db.prepare(`SELECT COUNT(*) AS c FROM knowledge_entries`).get() as { c: number }).c
    const report = await service.scanKnowledge({ projectId: 'p-scan' })
    expect(report.knowledgeDir).toBe(knowledgeDir)
    expect(report.fileCount).toBe(10)
    const byPath = new Map(report.violations.map((v) => [v.relPath, v.reasons]))
    expect(byPath.get('no-summary.md')).toContain('summary')
    expect(byPath.get('no-id.md')).toContain('id-missing')
    expect(byPath.get('bad-id.md')).toContain('id-invalid')
    expect(byPath.has('good.md')).toBe(false)
    const titleDup = report.duplicates.find((d) => d.basis === 'title')!
    expect(titleDup.relPaths).toEqual(['dup-t1.md', 'dup-t2.md'])
    const contentDup = report.duplicates.find((d) => d.basis === 'content')!
    expect(contentDup.relPaths).toEqual(['dup-c1.md', 'dup-c2.md'])
    // 空正文摘要存根不构成 content 重复信号
    expect(report.duplicates.filter((d) => d.relPaths.includes('stub1.md'))).toEqual([])
    // 零写入：体检前后实体表行数不变
    const after = (db.prepare(`SELECT COUNT(*) AS c FROM knowledge_entries`).get() as { c: number }).c
    expect(after).toBe(before)
  })
})

describe('register 幂等注册', () => {
  it('注册成功 + 幂等重入同值；入库条目默认 unconfirmed', async () => {
    const r1 = await service.registerKnowledge({ wsPath: wsDir, projectId: 'p-scan' })
    expect(r1.outcome).toBe('registered')
    if (r1.outcome === 'registered') {
      expect(r1.knowledgeDir).toBe(knowledgeDir)
      expect(r1.indexed).toBe(7) // good + dup-t*2 + dup-c*2 + 摘要存根*2（其余 3 篇违规不入）
      expect(r1.skipped).toBe(3)
    }
    const r2 = await service.registerKnowledge({ wsPath: wsDir, projectId: 'p-scan' })
    expect(r2).toEqual(r1)
    const statuses = (db.prepare(`SELECT DISTINCT status FROM knowledge_entries`).all() as { status: string }[]).map((s) => s.status)
    expect(statuses).toEqual(['unconfirmed'])
  })

  it('系统目录拒收（Windows/Program Files/盘符根）', async () => {
    const r = await service.registerKnowledge({ wsPath: 'C:\\Work', knowledgeDir: 'C:\\Windows\\System32\\k' })
    expect(r).toMatchObject({ outcome: 'rejected', reason: 'system-dir' })
    const root = await service.registerKnowledge({ wsPath: 'C:\\Work', knowledgeDir: 'C:' })
    expect(root).toMatchObject({ outcome: 'rejected', reason: 'system-dir' })
    expect(isSystemDir('C:\\Program Files\\x')).toBe(true)
    expect(isSystemDir('C:\\$Recycle.Bin')).toBe(true)
    expect(isSystemDir(join(home, 'normal'))).toBe(false)
  })

  it('reparse 点拒收（知识目录为符号链接）', async () => {
    const real = join(home, 'real-kn')
    mkdirSync(real, { recursive: true })
    const link = join(home, 'link-kn')
    try {
      symlinkSync(real, link, 'junction')
    } catch {
      return // 无符号链接权限环境：留空通过（Windows 需特权场景跳过）
    }
    const r = await service.registerKnowledge({ wsPath: wsDir, knowledgeDir: link, projectId: 'p-link' })
    expect(r).toMatchObject({ outcome: 'rejected', reason: 'reparse-point' })
  })

  it('canonical 降指向条目出索引（双轨归并——docs 为正本）', async () => {
    writeFileSync(
      join(knowledgeDir, 'canonical.md'),
      '---\ntitle: 降指向条目\nid: kb-canon\ncanonical: docs/conventions/x.md\nsummary: 摘要\nkeywords: [a]\n---\n正文',
      'utf8',
    )
    const r = await service.registerKnowledge({ wsPath: wsDir, projectId: 'p-scan' })
    if (r.outcome !== 'registered') throw new Error('unexpected')
    expect(r.indexed).toBe(7) // canonical 出索引不增量
    expect(r.skipped).toBe(4)
    const ids = (db.prepare(`SELECT id FROM knowledge_entries`).all() as { id: string }[]).map((x) => x.id)
    expect(ids).not.toContain('kb-canon')
  })
})
