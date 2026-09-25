// Task 2.2 kernel legs — the knowledge + feature-read data plane (D4):
// fact/lesson/research (read + append-only write), forensic (read-only),
// feature list/status (read). Data-plane semantics are ported from the forge
// CLI sources (pkg/facttable, pkg/infocmd, internal/cmd/{forensic,feature}) —
// the AC groups:
//
//   AC-1 注册 + 数据面一致性 — the six verbs serve the registered project's
//                forge-shaped tree: fact list/get/summary (vocab filter +
//                fact_id sort + corrupt-table rejection), lesson/research
//                discovery (frontmatter dialect, category prefixes, created
//                desc + mtime fallback), forensic search/extract/subagents
//                over fixture history/transcript files, feature list/status
//                (manifest + index.json progress + artifact scores + sort).
//   AC-2 授权面 — writes land only inside the authorized roots (fact =
//                codeRoot/.forge, lesson/research = doc root); traversal /
//                absolute-path / control-char names are rejected
//                (ERR_KNOWLEDGE_PATH_INVALID / _OUT_OF_BOUNDS); reads on an
//                unregistered project answer ERR_PROJECT_NOT_FOUND.
//   AC-4 vitest + stub — everything below is fs fixtures + the real service
//                assembly (no spawn, no CLI).

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/workbench/store/db.ts'
import { createWorkbenchIpcServices, type WorkbenchPerceptionSeam } from '../src/main/workbench/ipc/services.ts'
import type { WorkbenchVerbServices } from '../src/main/workbench/ipc/types.ts'
import { KnowledgeDomainError } from '../src/main/workbench/knowledge/knowledge-error.ts'
import { searchForensicSessions, extractForensicEvidence, listForensicSubagents } from '../src/main/workbench/knowledge/forensic.ts'

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-knowledge-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

/** Forge-shaped project fixture (docs tree + .forge fact table). */
function buildForgeRoot(root: string, options: { factTable?: unknown[] } = {}): string {
  mkdirSync(join(root, '.forge'), { recursive: true })
  if (options.factTable !== undefined) {
    writeFileSync(join(root, '.forge', 'fact-table.json'), JSON.stringify(options.factTable, null, 2))
  }

  const alpha = join(root, 'docs', 'features', 'alpha')
  mkdirSync(join(alpha, 'tasks'), { recursive: true })
  writeFileSync(join(alpha, 'manifest.md'), '---\nfeature: "alpha"\nstatus: tasks\ncreated: "2026-09-20"\n---\n\n# alpha\n')
  mkdirSync(join(alpha, 'prd'), { recursive: true })
  writeFileSync(join(alpha, 'prd', 'prd-spec.md'), '---\nscore: "92/100"\n---\n\n# prd\n')
  mkdirSync(join(alpha, 'design'), { recursive: true })
  writeFileSync(join(alpha, 'design', 'tech-design.md'), '---\nscore: "88/100"\n---\n\n# design\n')
  mkdirSync(join(alpha, 'ui'), { recursive: true })
  writeFileSync(join(alpha, 'ui', 'ui-design.md'), '---\nscore: "90/100"\n---\n\n# ui\n')
  mkdirSync(join(alpha, 'testing', 'results'), { recursive: true })
  writeFileSync(join(alpha, 'testing', 'results', 'results.json'), '---\nscore: "85/100"\n---\n\n{"passed": 12}\n')
  writeFileSync(join(alpha, 'tasks', 'index.json'), JSON.stringify({
    tasks: {
      '1.1': { id: '1.1', title: 'A', status: 'completed', dependencies: [] },
      '1.2': { id: '1.2', title: 'B', status: 'in_progress', dependencies: ['1.1'] },
      '1.3': { id: '1.3', title: 'C', status: 'pending', dependencies: ['1.2'] },
    },
  }))

  const beta = join(root, 'docs', 'features', 'beta')
  mkdirSync(join(beta, 'tasks'), { recursive: true })
  writeFileSync(join(beta, 'manifest.md'), '---\nfeature: "beta"\nstatus: design\ncreated: "2026-08-01"\n---\n\n# beta\n')
  writeFileSync(join(beta, 'tasks', 'index.json'), JSON.stringify({
    tasks: { '1.1': { id: '1.1', title: 'B1', status: 'pending', dependencies: [] } },
  }))

  const lessons = join(root, 'docs', 'lessons')
  mkdirSync(lessons, { recursive: true })
  writeFileSync(join(lessons, 'gotcha-older.md'), '---\ncreated: "2026-05-19"\ntags: [testing, gotcha]\ntitle: "Older"\n---\n\n# older\n')
  writeFileSync(join(lessons, 'arch-newer.md'), '---\ncreated: "2026-05-26"\ntags: [architecture]\n---\n\n# newer\n')
  writeFileSync(join(lessons, 'note-no-date.md'), '---\ntitle: "No date"\n---\n\n# undated\n')

  const research = join(root, 'docs', 'research')
  mkdirSync(research, { recursive: true })
  writeFileSync(join(research, 'browser-harness.md'), '---\ncreated: "2026-05-29"\ntopic: "Browser Harness"\nmode: "single-tech-deep-dive"\ncandidates: []\ndimensions: [overview-and-positioning, security]\n---\n\n# report\n')
  writeFileSync(join(research, 'blank-slate.md'), '---\ncreated: "2026-06-01"\n---\n\n# no topic no mode (skipped)\n')
  return root
}

/** Services harness: real assembly over the migrated db + fake perception + isolated forensic home. */
async function withServices(
  run: (verbs: WorkbenchVerbServices, seed: (codeRoot: string) => { id: string }, homeDir: string) => void | Promise<void>,
): Promise<void> {
  const root = makeScratch()
  const userData = join(root, 'user')
  mkdirSync(userData, { recursive: true })
  const homeDir = join(root, 'home')
  mkdirSync(join(homeDir, '.claude'), { recursive: true })
  writeFileSync(join(homeDir, '.claude', 'history.jsonl'), '')
  const manifest = join(root, 'resources', 'plugin-bundles.json')
  mkdirSync(join(root, 'resources'), { recursive: true })
  writeFileSync(manifest, JSON.stringify({ bundles: [{ name: '@deepseek-ai/dsh-base', mandatory: true }] }))
  const { db } = await openDatabase(userData)
  const seam: WorkbenchPerceptionSeam = { retarget: () => {}, rescan: () => {} }
  const assembly = createWorkbenchIpcServices({
    db,
    pluginBundlesPath: manifest,
    userDataPath: userData,
    onEvents: () => {},
    perception: seam,
    forensicHomeDir: homeDir,
  })
  try {
    await run(assembly.verbs, codeRoot => assembly.verbs.registerProject({ codeRoot, docLocationType: 'in_repo' }), homeDir)
  } finally {
    db.close()
  }
}

function errorCode(error: unknown): string {
  return (error as { code?: string })?.code ?? String(error)
}

// ---------------------------------------------------------------------------
// AC-1: fact data plane (Go pkg/facttable parity)
// ---------------------------------------------------------------------------

describe('knowledge verbs: fact table', () => {
  it('list applies source/confidence filters and sorts by fact_id (Go SortedEntries)', async () => {
    await withServices((verbs, seed) => {
      const root = buildForgeRoot(makeScratch(), { factTable: [
        { fact_id: 'z.subject-signature-1', source: 'runtime', subject: 'cli.forge', kind: 'signature', value: { sig: 'run()' }, confidence: 'confirmed', updated_at: '2026-05-01T00:00:00Z' },
        { fact_id: 'a.subject-error-2', source: 'static', subject: 'cli.forge', kind: 'error_code', value: 'ERR_X', confidence: 'inferred', updated_at: '2026-05-02T00:00:00Z' },
        { fact_id: 'm.subject-error-3', source: 'runtime', subject: 'cli.forge', kind: 'error_code', value: 'ERR_Y', confidence: 'assumed', updated_at: '2026-05-03T00:00:00Z' },
      ] })
      const project = seed(root)

      const all = verbs.knowledgeFact({ projectId: project.id, action: 'list' }) as { total: number; facts: { factId: string }[] }
      expect(all.total).toBe(3)
      expect(all.facts.map(f => f.factId)).toEqual(['a.subject-error-2', 'm.subject-error-3', 'z.subject-signature-1'])

      const runtime = verbs.knowledgeFact({ projectId: project.id, action: 'list', source: 'runtime' }) as { facts: { factId: string }[] }
      expect(runtime.facts.map(f => f.factId)).toEqual(['m.subject-error-3', 'z.subject-signature-1'])

      const confirmed = verbs.knowledgeFact({ projectId: project.id, action: 'list', confidence: 'confirmed' }) as { facts: { factId: string }[] }
      expect(confirmed.facts.map(f => f.factId)).toEqual(['z.subject-signature-1'])
    })
  })

  it('get returns the full entry; unknown ids reject ERR_KNOWLEDGE_ENTRY_NOT_FOUND', async () => {
    await withServices((verbs, seed) => {
      const root = buildForgeRoot(makeScratch(), { factTable: [
        { fact_id: 'cli.forge-signature-1', source: 'static', subject: 'cli.forge', kind: 'signature', value: { params: ['--json'] }, confidence: 'confirmed', updated_at: '2026-05-01T00:00:00Z' },
      ] })
      const project = seed(root)

      const entry = verbs.knowledgeFact({ projectId: project.id, action: 'get', factId: 'cli.forge-signature-1' }) as { factId: string; value: unknown }
      expect(entry.factId).toBe('cli.forge-signature-1')
      expect(entry.value).toEqual({ params: ['--json'] })

      expect(() => verbs.knowledgeFact({ projectId: project.id, action: 'get', factId: 'missing' }))
        .toThrowError(KnowledgeDomainError)
      try {
        verbs.knowledgeFact({ projectId: project.id, action: 'get', factId: 'missing' })
      } catch (error) {
        expect(errorCode(error)).toBe('ERR_KNOWLEDGE_ENTRY_NOT_FOUND')
      }
    })
  })

  it('summary groups by source/confidence/kind and reports runtime-confirmed coverage', async () => {
    await withServices((verbs, seed) => {
      const root = buildForgeRoot(makeScratch(), { factTable: [
        { fact_id: 'a-1', source: 'runtime', subject: 's', kind: 'signature', value: 1, confidence: 'confirmed', updated_at: 't' },
        { fact_id: 'a-2', source: 'runtime', subject: 's', kind: 'error_code', value: 2, confidence: 'assumed', updated_at: 't' },
        { fact_id: 'a-3', source: 'manual', subject: 's', kind: 'signature', value: 3, confidence: 'inferred', updated_at: 't' },
      ] })
      const project = seed(root)

      const summary = verbs.knowledgeFact({ projectId: project.id, action: 'summary' }) as { total: number; bySource: Record<string, number>; runtimeConfirmed: number; coveragePercent: number }
      expect(summary.total).toBe(3)
      expect(summary.bySource).toEqual({ runtime: 2, manual: 1 })
      expect(summary.runtimeConfirmed).toBe(1)
      expect(summary.coveragePercent).toBeCloseTo(33.3, 1)
    })
  })

  it('add appends a validated entry to codeRoot/.forge/fact-table.json (auto id mint; collision rejected)', async () => {
    await withServices((verbs, seed) => {
      const root = buildForgeRoot(makeScratch())
      const project = seed(root)

      const added = verbs.knowledgeFact({ projectId: project.id, action: 'add', entry: { subject: 'cli.bridge', kind: 'output_format', value: 'json-lines' } }) as { factId: string; source: string }
      expect(added.source).toBe('manual') // 缺省 source
      expect(added.factId).toMatch(/^cli\.bridge\.output_format-\d+$/)

      const explicit = verbs.knowledgeFact({ projectId: project.id, action: 'add', entry: { factId: 'manual.custom-1', subject: 'cli.bridge', kind: 'precondition', value: { needs: 'bridge' }, confidence: 'confirmed' } }) as { factId: string; confidence: string }
      expect(explicit.factId).toBe('manual.custom-1')
      expect(explicit.confidence).toBe('confirmed')

      // 落盘形态:codeRoot/.forge/fact-table.json,Go 写形态(snake_case 条目)。
      const table = verbs.knowledgeFact({ projectId: project.id, action: 'list' }) as { total: number }
      expect(table.total).toBe(2)

      expect(() => verbs.knowledgeFact({ projectId: project.id, action: 'add', entry: { factId: 'manual.custom-1', subject: 'x', kind: 'signature', value: 1 } }))
        .toThrow()
      try {
        verbs.knowledgeFact({ projectId: project.id, action: 'add', entry: { factId: 'manual.custom-1', subject: 'x', kind: 'signature', value: 1 } })
      } catch (error) {
        expect(errorCode(error)).toBe('ERR_KNOWLEDGE_ENTRY_EXISTS')
      }

      // 词表校验(Go Validate 同序)。
      try {
        verbs.knowledgeFact({ projectId: project.id, action: 'add', entry: { subject: 'x', kind: 'nonsense', value: 1 } })
        expect.unreachable('invalid kind must reject')
      } catch (error) {
        expect(errorCode(error)).toBe('ERR_KNOWLEDGE_INPUT_INVALID')
      }
    })
  })

  it('a corrupted fact table rejects ERR_KNOWLEDGE_TABLE_CORRUPT with the recovery hint', async () => {
    await withServices((verbs, seed) => {
      const root = buildForgeRoot(makeScratch())
      writeFileSync(join(root, '.forge', 'fact-table.json'), '{not json')
      const project = seed(root)
      try {
        verbs.knowledgeFact({ projectId: project.id, action: 'list' })
        expect.unreachable('corrupt table must reject')
      } catch (error) {
        expect(errorCode(error)).toBe('ERR_KNOWLEDGE_TABLE_CORRUPT')
        expect((error as KnowledgeDomainError).detail).toContain('delete it to start fresh')
      }
    })
  })
})

// ---------------------------------------------------------------------------
// AC-1 + AC-2: lesson / research data plane + doc-root writes
// ---------------------------------------------------------------------------

describe('knowledge verbs: lessons + research', () => {
  it('lesson list parses the forge dialect (category prefixes, created desc, mtime fallback) and get reads one', async () => {
    await withServices((verbs, seed) => {
      const project = seed(buildForgeRoot(makeScratch()))
      const list = verbs.knowledgeLesson({ projectId: project.id, action: 'list' }) as { total: number; lessons: { name: string; category: string; created: string; tags: string[]; filePath: string }[] }
      // 空白壳(research 无 topic/mode 同律)不适用 lesson;三条全收。
      expect(list.total).toBe(3)
      expect(list.lessons.map(l => l.name)).toEqual(['arch-newer', 'gotcha-older', 'note-no-date'])
      expect(list.lessons[0]?.category).toBe('architecture')
      expect(list.lessons[1]?.category).toBe('gotcha')
      expect(list.lessons[1]?.tags).toEqual(['testing', 'gotcha'])
      expect(list.lessons[2]?.created).toBe('') // 无 created 字段(非 date 回退源)
      expect(list.lessons[1]?.filePath).toBe(join('docs', 'lessons', 'gotcha-older.md'))

      const one = verbs.knowledgeLesson({ projectId: project.id, action: 'get', name: 'arch-newer' }) as { name: string; title: string }
      expect(one.name).toBe('arch-newer')
      expect(one.title).toBe('')

      expect(() => verbs.knowledgeLesson({ projectId: project.id, action: 'get', name: 'missing' })).toThrow()
    })
  })

  it('lesson add writes into the doc root lessons/ dir (frontmatter dialect) and refuses overwrite', async () => {
    await withServices((verbs, seed) => {
      const root = buildForgeRoot(makeScratch())
      const project = seed(root)

      const added = verbs.knowledgeLesson({ projectId: project.id, action: 'add', name: 'gotcha-fresh', title: 'Fresh', tags: ['testing'], body: '# Problem\n\nDesc.' }) as { name: string; created: string; category: string }
      expect(added.name).toBe('gotcha-fresh')
      expect(added.created).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(added.category).toBe('gotcha')

      // 回读(写后可发现)。
      const list = verbs.knowledgeLesson({ projectId: project.id, action: 'list' }) as { total: number }
      expect(list.total).toBe(4)

      try {
        verbs.knowledgeLesson({ projectId: project.id, action: 'add', name: 'gotcha-fresh', body: 'x' })
        expect.unreachable('existing name must reject')
      } catch (error) {
        expect(errorCode(error)).toBe('ERR_KNOWLEDGE_ENTRY_EXISTS')
      }
    })
  })

  it('research list skips frontmatter-less shells and reads the dialect; add + get round-trip', async () => {
    await withServices((verbs, seed) => {
      const root = buildForgeRoot(makeScratch())
      const project = seed(root)

      const list = verbs.knowledgeResearch({ projectId: project.id, action: 'list' }) as { total: number; reports: { slug: string; topic: string; mode: string; dimensions: string[]; candidates: string[] }[] }
      expect(list.total).toBe(1) // blank-slate skipped (no topic/mode, Go parity)
      expect(list.reports[0]?.slug).toBe('browser-harness')
      expect(list.reports[0]?.dimensions).toEqual(['overview-and-positioning', 'security'])
      expect(list.reports[0]?.candidates).toEqual([])

      const added = verbs.knowledgeResearch({ projectId: project.id, action: 'add', slug: 'codegraph', topic: 'Codegraph', mode: 'single-tech-deep-dive', dimensions: ['security'], body: '# report' }) as { slug: string; filePath: string }
      expect(added.slug).toBe('codegraph')
      expect(added.filePath).toBe(join('docs', 'research', 'codegraph.md'))

      const one = verbs.knowledgeResearch({ projectId: project.id, action: 'get', slug: 'codegraph' }) as { topic: string; mode: string }
      expect(one.topic).toBe('Codegraph')
      expect(one.mode).toBe('single-tech-deep-dive')
    })
  })
})

// ---------------------------------------------------------------------------
// AC-2: authorization boundary (segments, traversal, unregistered)
// ---------------------------------------------------------------------------

describe('knowledge verbs: authorization boundary', () => {
  it('rejects path-shaped names before any fs write (segments + absolute + control chars)', async () => {
    await withServices((verbs, seed) => {
      const project = seed(buildForgeRoot(makeScratch()))
      const badNames = ['../escape', 'a/b', '..\\escape', 'sub dir/x', 'name\x01ctrl', '']
      for (const name of badNames) {
        try {
          verbs.knowledgeLesson({ projectId: project.id, action: 'add', name, body: 'x' })
          expect.unreachable(`name ${JSON.stringify(name)} must reject`)
        } catch (error) {
          expect(['ERR_KNOWLEDGE_PATH_INVALID', 'ERR_KNOWLEDGE_INPUT_INVALID', 'ERR_KNOWLEDGE_PATH_OUT_OF_BOUNDS']).toContain(errorCode(error))
        }
      }
      try {
        // 绝对路径段:join 前置拒绝(防基目录被顶掉)。
        verbs.knowledgeResearch({ projectId: project.id, action: 'add', slug: join(makeScratch(), 'evil'), body: 'x' })
        expect.unreachable('absolute slug must reject')
      } catch (error) {
        expect(['ERR_KNOWLEDGE_PATH_INVALID', 'ERR_KNOWLEDGE_PATH_OUT_OF_BOUNDS']).toContain(errorCode(error))
      }
    })
  })

  it('unregistered projects answer ERR_PROJECT_NOT_FOUND on every project-scoped read/write', async () => {
    await withServices((verbs) => {
      const probes: Array<() => unknown> = [
        () => verbs.knowledgeFact({ projectId: 'nope', action: 'list' }),
        () => verbs.knowledgeLesson({ projectId: 'nope', action: 'list' }),
        () => verbs.knowledgeResearch({ projectId: 'nope', action: 'list' }),
        () => verbs.featureList('nope'),
        () => verbs.featureStatus({ projectId: 'nope', featureSlug: 'alpha' }),
      ]
      for (const probe of probes) {
        try {
          probe()
          expect.unreachable('unregistered project must reject')
        } catch (error) {
          expect(errorCode(error)).toBe('ERR_PROJECT_NOT_FOUND')
        }
      }
    })
  })
})

// ---------------------------------------------------------------------------
// AC-1: forensic read-only plane (Go internal/cmd/forensic parity)
// ---------------------------------------------------------------------------

describe('knowledge verbs: forensic (read-only)', () => {
  it('search aggregates history.jsonl by session with filters and newest-first order', async () => {
    const root = makeScratch()
    const home = join(root, 'home', '.claude')
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, 'history.jsonl'), [
      JSON.stringify({ display: 'forge task list', timestamp: 1750000000000, project: 'Z:/proj/a', sessionId: 'sess-2' }),
      JSON.stringify({ display: 'run /forge:learn', timestamp: 1750000100000, project: 'Z:/proj/a', sessionId: 'sess-2' }),
      JSON.stringify({ display: 'fix bug in bridge', timestamp: 1749000000000, project: 'Z:/proj/b', sessionId: 'sess-1' }),
      JSON.stringify({ display: 'other project', timestamp: 1748000000000, project: 'Z:/other', sessionId: 'sess-3' }),
      JSON.stringify({ display: 'skipped line', project: '', sessionId: '' }),
    ].join('\n') + '\n')

    const sessions = searchForensicSessions({ projectPath: 'proj' }, join(home, 'history.jsonl'))
    expect(sessions.map(s => s.sessionId)).toEqual(['sess-2', 'sess-1'])
    expect(sessions[0]?.msgCount).toBe(2)
    expect(sessions[0]?.firstMsg).toBe('forge task list')

    const byKeyword = searchForensicSessions({ keyword: 'BRIDGE' }, join(home, 'history.jsonl'))
    expect(byKeyword.map(s => s.sessionId)).toEqual(['sess-1'])

    const bySkill = searchForensicSessions({ skill: 'learn' }, join(home, 'history.jsonl'))
    expect(bySkill.map(s => s.sessionId)).toEqual(['sess-2'])

    const capped = searchForensicSessions({ last: 1 }, join(home, 'history.jsonl'))
    expect(capped).toHaveLength(1)

    try {
      searchForensicSessions({}, join(home, 'missing.jsonl'))
      expect.unreachable('missing history must reject')
    } catch (error) {
      expect(errorCode(error)).toBe('ERR_FORENSIC_SOURCE_UNREADABLE')
    }
  })

  it('extract parses a session transcript into the Go evidence shape (chains + timing + summary)', async () => {
    const root = makeScratch()
    const transcript = join(root, 'session.jsonl')
    writeFileSync(transcript, [
      JSON.stringify({ type: 'assistant', timestamp: '2026-05-01T10:00:00Z', gitBranch: 'main', message: { id: 'm1', role: 'assistant', model: 'test-model', stop_reason: 'tool_use', content: [
        { type: 'thinking', thinking: 'plan the work' },
        { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: 'Z:/a.ts' } },
      ] } }),
      JSON.stringify({ type: 'user', timestamp: '2026-05-01T10:00:02Z', message: { id: 'm2', role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'tu-1' },
      ] }, toolUseResult: { type: 'text', filePath: 'Z:/a.ts' } }),
      JSON.stringify({ type: 'user', timestamp: '2026-05-01T10:00:03Z', message: { id: 'm3', role: 'user', content: 'run /forge:submit-task' } }),
      JSON.stringify({ type: 'attachment', timestamp: '2026-05-01T10:00:04Z', attachment: { type: 'invoked_skills', skills: [{ name: 'forge:submit-task' }] } }),
      JSON.stringify({ type: 'attachment', timestamp: '2026-05-01T10:00:05Z', attachment: { type: 'hook_success', hookName: 'verify', hookEvent: 'Stop', durationMs: 12, exitCode: 1, command: 'node check.js' } }),
      JSON.stringify({ type: 'attachment', timestamp: '2026-05-01T10:00:06Z', attachment: { type: 'edited_text_file', filename: 'src/x.ts' } }),
      'not-json-line',
    ].join('\n') + '\n')

    const evidence = extractForensicEvidence(transcript)
    expect(evidence.lines).toBe(7)
    expect(evidence.model).toBe('test-model')
    expect(evidence.gitBranch).toBe('main')
    expect(evidence.thinking[0]?.thinking).toBe('plan the work')
    expect(evidence.toolCalls[0]?.tool).toBe('Read')
    expect(evidence.summary.toolBreakdown).toEqual({ Read: 1 })
    expect(evidence.summary.filesRead).toEqual(['Z:/a.ts'])
    expect(evidence.summary.totalToolResults).toBe(1)
    expect(evidence.toolResults[0]?.filePath).toBe('Z:/a.ts')
    expect(evidence.userMsgs.map(u => u.content)).toEqual(['run /forge:submit-task'])
    expect(evidence.skillsUsed).toEqual(['submit-task']) // forge: 前缀剥除 + 小写
    expect(evidence.summary.skillInvocations).toEqual([{ name: 'forge:submit-task', count: 1 }])
    expect(evidence.hooks[0]?.hookName).toBe('verify')
    expect(evidence.summary.hookFailures).toBe(1)
    expect(evidence.filesEdited).toEqual(['src/x.ts'])
    expect(evidence.summary.topSlowest[0]?.seconds).toBe(2) // 10:00:00 → 10:00:02
    expect(evidence.summary.stopReasons).toEqual({ tool_use: 1 })
    expect(evidence.summary.startTime).not.toBe('')
    expect(evidence.summary.duration).toBe('6s')

    try {
      extractForensicEvidence(join(root, 'missing.jsonl'))
      expect.unreachable('missing transcript must reject')
    } catch (error) {
      expect(errorCode(error)).toBe('ERR_FORENSIC_SOURCE_UNREADABLE')
    }
  })

  it('subagents lists *.meta.json entries with the agent- prefix stripped (broken meta → empty type, Go parity)', async () => {
    const root = makeScratch()
    const subagents = join(root, 'session-1', 'subagents')
    mkdirSync(subagents, { recursive: true })
    writeFileSync(join(subagents, 'agent-research.md.meta.json'), JSON.stringify({ agentType: 'Explore' }))
    writeFileSync(join(subagents, 'plain.md'), 'not meta')
    writeFileSync(join(subagents, 'broken.meta.json'), '{oops')

    const agents = listForensicSubagents(join(root, 'session-1'))
    expect(agents).toContainEqual({ agentId: 'research.md', agentType: 'Explore', transcript: join(subagents, 'agent-research.md.jsonl') })
    expect(agents).toContainEqual({ agentId: 'broken', agentType: '', transcript: join(subagents, 'broken.jsonl') })
    expect(agents).toHaveLength(2) // plain.md 不列(非 .meta.json)

    try {
      listForensicSubagents(join(root, 'no-such-session'))
      expect.unreachable('missing dir must reject')
    } catch (error) {
      expect(errorCode(error)).toBe('ERR_FORENSIC_SOURCE_UNREADABLE')
    }
  })

  it('the forensic verb dispatches through the service face (machine-global, no registration gate)', async () => {
    await withServices((verbs, _seed, homeDir) => {
      writeFileSync(join(homeDir, '.claude', 'history.jsonl'), `${JSON.stringify({ display: 'forge task list', timestamp: 1750000000000, project: 'Z:/proj/a', sessionId: 'sess-9' })}\n`)
      const result = verbs.knowledgeForensic({ action: 'search', projectPath: 'proj' })
      expect(result.action).toBe('search')
      if (result.action === 'search') {
        expect(result.sessions.map(s => s.sessionId)).toEqual(['sess-9'])
      }
      try {
        verbs.knowledgeForensic({ action: 'extract' })
        expect.unreachable('missing transcriptPath must reject')
      } catch (error) {
        expect(errorCode(error)).toBe('ERR_KNOWLEDGE_INPUT_INVALID')
      }
    })
  })
})

// ---------------------------------------------------------------------------
// AC-1: feature read plane (Go internal/cmd/feature parity)
// ---------------------------------------------------------------------------

describe('knowledge verbs: feature list / status', () => {
  it('featureList walks manifest frontmatter, index.json progress and artifact scores, newest-created first', async () => {
    await withServices((verbs, seed) => {
      const project = seed(buildForgeRoot(makeScratch()))
      const features = verbs.featureList(project.id)
      expect(features.map(f => f.slug)).toEqual(['alpha', 'beta']) // created 降序
      expect(features[0]).toMatchObject({
        slug: 'alpha', status: 'tasks', created: '2026-09-20', completed: 1, total: 3,
        scores: { prd: '92/100', design: '88/100', ui: '90/100', tests: '85/100' },
      })
      expect(features[1]).toMatchObject({ slug: 'beta', status: 'design', completed: 0, total: 1 })
    })
  })

  it('featureStatus reports manifest status, per-status counts in the Go display order and scores', async () => {
    await withServices((verbs, seed) => {
      const project = seed(buildForgeRoot(makeScratch()))
      const report = verbs.featureStatus({ projectId: project.id, featureSlug: 'alpha' })
      expect(report.status).toBe('tasks')
      expect(report.tasks.total).toBe(3)
      expect(report.tasks.indexPresent).toBe(true)
      // Go 呈现序(键序断言):pending → in_progress → completed。
      expect(Object.keys(report.tasks.byStatus)).toEqual(['pending', 'in_progress', 'completed'])
      expect(report.tasks.byStatus).toEqual({ pending: 1, in_progress: 1, completed: 1 })
      expect(report.scores).toEqual({ prd: '92/100', design: '88/100', ui: '90/100' })

      try {
        verbs.featureStatus({ projectId: project.id, featureSlug: 'missing' })
        expect.unreachable('unknown slug must reject')
      } catch (error) {
        expect(errorCode(error)).toBe('ERR_FEATURE_NOT_FOUND')
      }
    })
  })
})
