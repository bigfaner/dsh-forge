// 任务 2.7 测试 —— forgeDocs 域 read（tech-design §Interface 4）：路径守卫
// （resolve + startsWith(canonical(forge_dir))——越界 ERR_DOC_PATH_INVALID，威胁 ①）+
// 悬空态（dangling 只读返回，不崩溃不删行）+ title/summary 水化。临时 SQLite 夹具。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createHarness, type SmallDomainHarness } from './harness.js'
import { createDocsService } from './docs.js'
import { DocPathInvalidError } from './errors.js'

let h: SmallDomainHarness | undefined
afterEach(() => {
  h?.dispose()
  h = undefined
})

function svc() {
  h ??= createHarness()
  return createDocsService({ store: h.store, resolveForgeDir: h.routing.forgeDir })
}

/** 在 forge_dir 下写文件（正斜杠 docRel → 绝对路径落盘） */
function writeDoc(rel: string, content: string): void {
  const abs = resolve(h!.forgeDir, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, content, 'utf-8')
}

describe('AC4 forgeDocs.read：路径守卫 + 悬空态', () => {
  it('在册命中：content + canonicalPath（resolve 后绝对路径）+ title（首个 H1）+ summary（注册面水化）', async () => {
    const s = svc()
    writeDoc('docs/features/demo/design/tech-design.md', '# 技术设计\n\n正文段落。\n')
    // 注册面登记同 rel_path 的摘要（feature_documents 行——summary 与文件在场性无关）
    h!.wsDb
      .prepare(
        `INSERT INTO features (id, slug, title, feature_status, created_at, updated_at) VALUES ('f1', 'demo', '特性', 'design', ?, ?)`,
      )
      .run('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    h!.wsDb
      .prepare(
        `INSERT INTO feature_documents (feature_id, doc_kind, rel_path, summary, created_at, updated_at) VALUES ('f1', 'tech-design', ?, '设计摘要一句', ?, ?)`,
      )
      .run('docs/features/demo/design/tech-design.md', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')

    const doc = await s.read({ projectId: h!.projectId, docRel: 'docs/features/demo/design/tech-design.md' })
    expect(doc.dangling).toBe(false)
    expect(doc.title).toBe('技术设计')
    expect(doc.summary).toBe('设计摘要一句')
    expect(doc.content).toBe('# 技术设计\n\n正文段落。\n')
    expect(doc.canonicalPath).toBe(resolve(h!.forgeDir, 'docs/features/demo/design/tech-design.md'))
  })

  it('无 H1 → title 缺省；注册面无摘要 → summary 缺省', async () => {
    const s = svc()
    writeDoc('plain.md', '只有正文。\n')
    const doc = await s.read({ projectId: h!.projectId, docRel: 'plain.md' })
    expect(doc.title).toBeUndefined()
    expect(doc.summary).toBeUndefined()
  })

  it('词法归一：docRel 含中间 `..` 但落点仍在 forge_dir 内 → 放行（resolve 收敛）', async () => {
    const s = svc()
    writeDoc(join('docs', 'a.md'), '内容 A\n')
    const doc = await s.read({ projectId: h!.projectId, docRel: 'docs/sub/../a.md' })
    expect(doc.dangling).toBe(false)
    expect(doc.content).toBe('内容 A\n')
  })

  it('越界拒绝：`..` 逃逸 forge_dir → ERR_DOC_PATH_INVALID（data 带 docRel/forgeDir）', async () => {
    const s = svc()
    writeFileSync(join(h!.wsDir, 'outside.md'), '仓外文件', 'utf-8')
    const err = await s.read({ projectId: h!.projectId, docRel: '../outside.md' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DocPathInvalidError)
    expect((err as DocPathInvalidError).code).toBe('ERR_DOC_PATH_INVALID')
    expect((err as DocPathInvalidError).data.docRel).toBe('../outside.md')
  })

  it('越界拒绝：绝对路径 docRel（无视 forge_dir 基准）', async () => {
    const s = svc()
    const abs = join(h!.wsDir, 'outside.md')
    writeFileSync(abs, 'x', 'utf-8')
    const err = await s.read({ projectId: h!.projectId, docRel: abs }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DocPathInvalidError)
  })

  it('越界拒绝：同前缀兄弟目录（<forge> vs <forge>-x——sep 纪律防误放行）+ docRel 指向 forge_dir 自身', async () => {
    const s = svc()
    // forgeDir = <ws>/.forge → 造兄弟 <ws>/.forge-x（前缀含 forge 但非子路径）
    const sibling = `${h!.forgeDir}-x`
    mkdirSync(sibling, { recursive: true })
    writeFileSync(join(sibling, 'evil.md'), 'x', 'utf-8')
    const rel = `../${join('.forge-x', 'evil.md').replaceAll('\\', '/')}`
    const err = await s.read({ projectId: h!.projectId, docRel: rel }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DocPathInvalidError)
    const self = await s.read({ projectId: h!.projectId, docRel: '.' }).catch((e: unknown) => e)
    expect(self).toBeInstanceOf(DocPathInvalidError)
  })

  it('悬空态：文件不在场 → dangling 只读返回（canonicalPath=docRel 原值），注册行不删不写', async () => {
    const s = svc()
    const rel = 'docs/features/gone/prd/prd-spec.md'
    h!.wsDb
      .prepare(
        `INSERT INTO features (id, slug, title, feature_status, created_at, updated_at) VALUES ('f2', 'gone', '特性', 'prd', ?, ?)`,
      )
      .run('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    h!.wsDb
      .prepare(
        `INSERT INTO feature_documents (feature_id, doc_kind, rel_path, summary, created_at, updated_at) VALUES ('f2', 'prd-spec', ?, '悬空摘要', ?, ?)`,
      )
      .run(rel, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')

    const doc = await s.read({ projectId: h!.projectId, docRel: rel })
    expect(doc).toMatchObject({ dangling: true, content: '', canonicalPath: rel, summary: '悬空摘要' })
    // 不删行（行此后稳定——悬空 ≠ 缺行）：注册行原样在场
    const row = h!.wsDb
      .prepare<unknown[], { rel_path: string; summary: string }>(
        `SELECT rel_path, summary FROM feature_documents WHERE feature_id = 'f2'`,
      )
      .get()
    expect(row).toEqual({ rel_path: rel, summary: '悬空摘要' })
  })

  it('守卫先行：越界 docRel 即便文件也不读（先拒后读——零信息泄漏）', async () => {
    const s = svc()
    writeFileSync(join(h!.wsDir, 'secret.md'), '机密', 'utf-8')
    await expect(s.read({ projectId: h!.projectId, docRel: '../secret.md' })).rejects.toBeInstanceOf(DocPathInvalidError)
  })
})
