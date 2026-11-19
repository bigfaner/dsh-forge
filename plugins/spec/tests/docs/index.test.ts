// plugin-spec 1.10 docs 读域收编测试 —— plugins/spec/host/docs（原 core small-domains/docs
// 等价基准迁移 + 双锚分支扩展）：路径守卫（双锚 startsWith——新树 specs 主锚 / 旧树 docs
// 只读兼容锚 / 越界 ERR_DOC_PATH_INVALID，威胁 ①）+ 悬空态（dangling 只读降级，不崩溃
// 不删行）+ title 水化语义保持 + summary 摘要耦合解除（恒缺省）。纯 fs 夹具（零 db——
// feature_documents 依赖已退役）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDocsService } from '../../host/docs/index.js'
import { DocPathInvalidError } from '../../host/docs/errors.js'

let root: string | undefined
afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
  root = undefined
})

/** 起夹具：<root>/ws/.forge 为 forge_dir——specs 主锚 / docs 兼容锚按需建目录 */
function fixture(): ReturnType<typeof svc> & { forgeDir: string; wsDir: string } {
  root ??= mkdtempSync(join(tmpdir(), 'dsh-spec-docs-'))
  const wsDir = join(root, 'ws')
  const forgeDir = join(wsDir, '.forge')
  mkdirSync(forgeDir, { recursive: true })
  return { ...svc(forgeDir), forgeDir, wsDir }
}

function svc(forgeDir: string) {
  return createDocsService({ resolveForgeDir: () => forgeDir })
}

/** 在 forge_dir 下写文件（正斜杠 docRel → 绝对路径落盘） */
function writeDoc(forgeDir: string, rel: string, content: string): void {
  const abs = resolve(forgeDir, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, content, 'utf-8')
}

describe('双锚路径守卫', () => {
  it('新树主锚命中：.forge/specs/ 下文档可读（content + canonicalPath + title 水化）', async () => {
    const f = fixture()
    writeDoc(f.forgeDir, 'specs/demo/spec.md', '# Spec 标题\n\n正文段落。\n')
    const doc = await f.read({ projectId: 'p-1', docRel: 'specs/demo/spec.md' })
    expect(doc.dangling).toBe(false)
    expect(doc.title).toBe('Spec 标题')
    expect(doc.content).toBe('# Spec 标题\n\n正文段落。\n')
    expect(doc.canonicalPath).toBe(resolve(f.forgeDir, 'specs/demo/spec.md'))
  })

  it('旧树兼容锚命中：.forge/docs/ 下在产文档只读可读（roundtables 等归档面）', async () => {
    const f = fixture()
    writeDoc(f.forgeDir, 'docs/proposals/legacy/proposal.md', '# 旧树提案\n\n正文。\n')
    writeDoc(f.forgeDir, 'docs/roundtables/x/minutes.md', '纪要正文\n')
    const proposal = await f.read({ projectId: 'p-1', docRel: 'docs/proposals/legacy/proposal.md' })
    expect(proposal).toMatchObject({ dangling: false, title: '旧树提案' })
    const minutes = await f.read({ projectId: 'p-1', docRel: 'docs/roundtables/x/minutes.md' })
    expect(minutes).toMatchObject({ dangling: false, content: '纪要正文\n' })
    expect(minutes.canonicalPath).toBe(resolve(f.forgeDir, 'docs/roundtables/x/minutes.md'))
  })

  it('越界拒绝：锚外路径（forge_dir 顶层文件不落任一锚）→ ERR_DOC_PATH_INVALID', async () => {
    const f = fixture()
    writeFileSync(join(f.forgeDir, 'loose.md'), 'x', 'utf-8')
    const err = await f.read({ projectId: 'p-1', docRel: 'loose.md' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DocPathInvalidError)
    expect((err as DocPathInvalidError).code).toBe('ERR_DOC_PATH_INVALID')
    expect((err as DocPathInvalidError).data.docRel).toBe('loose.md')
  })

  it('越界拒绝：`..` 逃逸 forge_dir（data 带 docRel/forgeDir）', async () => {
    const f = fixture()
    writeFileSync(join(f.wsDir, 'outside.md'), '仓外文件', 'utf-8')
    const err = await f.read({ projectId: 'p-1', docRel: '../outside.md' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DocPathInvalidError)
    expect((err as DocPathInvalidError).data.docRel).toBe('../outside.md')
    expect((err as DocPathInvalidError).data.forgeDir).toBe(f.forgeDir)
  })

  it('越界拒绝：绝对路径 docRel（无视锚基准）', async () => {
    const f = fixture()
    const abs = join(f.wsDir, 'outside.md')
    writeFileSync(abs, 'x', 'utf-8')
    const err = await f.read({ projectId: 'p-1', docRel: abs }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DocPathInvalidError)
  })

  it('越界拒绝：同前缀兄弟目录（<forge>-x——sep 纪律防误放行）+ docRel 指向 forge_dir 自身', async () => {
    const f = fixture()
    const sibling = `${f.forgeDir}-x`
    mkdirSync(sibling, { recursive: true })
    writeFileSync(join(sibling, 'evil.md'), 'x', 'utf-8')
    const rel = `../${join('.forge-x', 'evil.md').replaceAll('\\', '/')}`
    const err = await f.read({ projectId: 'p-1', docRel: rel }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DocPathInvalidError)
    const self = await f.read({ projectId: 'p-1', docRel: '.' }).catch((e: unknown) => e)
    expect(self).toBeInstanceOf(DocPathInvalidError)
  })

  it('词法归一：docRel 含中间 `..` 但落点仍在锚内 → 放行（resolve 收敛）', async () => {
    const f = fixture()
    writeDoc(f.forgeDir, join('specs', 'a.md'), '内容 A\n')
    const doc = await f.read({ projectId: 'p-1', docRel: 'specs/sub/../a.md' })
    expect(doc.dangling).toBe(false)
    expect(doc.content).toBe('内容 A\n')
  })

  it('守卫先行：越界 docRel 即便文件在场也不读（先拒后读——零信息泄漏）', async () => {
    const f = fixture()
    writeFileSync(join(f.wsDir, 'secret.md'), '机密', 'utf-8')
    await expect(f.read({ projectId: 'p-1', docRel: '../secret.md' })).rejects.toBeInstanceOf(DocPathInvalidError)
  })
})

describe('title 水化 + 摘要耦合解除（等价基准）', () => {
  it('无 H1 → title 缺省；summary 恒缺省（feature_documents 摘要耦合解除）', async () => {
    const f = fixture()
    writeDoc(f.forgeDir, 'specs/plain/spec.md', '只有正文。\n')
    const doc = await f.read({ projectId: 'p-1', docRel: 'specs/plain/spec.md' })
    expect(doc.title).toBeUndefined()
    expect(doc.summary).toBeUndefined()
  })

  it('旧树命中同样零 summary 水化（注册面依赖退役——等价基准改写点）', async () => {
    const f = fixture()
    writeDoc(f.forgeDir, 'docs/proposals/p/proposal.md', '# 旧提案\n')
    const doc = await f.read({ projectId: 'p-1', docRel: 'docs/proposals/p/proposal.md' })
    expect(doc.summary).toBeUndefined()
  })
})

describe('悬空态（spec_docs「db 行在、文件缺失」只读降级）', () => {
  it('守卫通过而文件不在场 → dangling 只读返回（canonicalPath=docRel 原值），零写入零报错', async () => {
    const f = fixture()
    const rel = 'specs/gone/spec.md'
    const doc = await f.read({ projectId: 'p-1', docRel: rel })
    expect(doc).toMatchObject({ dangling: true, content: '', canonicalPath: rel })
    expect(doc.title).toBeUndefined()
    expect(doc.summary).toBeUndefined()
  })

  it('旧树悬空同语义：docs 锚内缺席路径同样只读降级', async () => {
    const f = fixture()
    const doc = await f.read({ projectId: 'p-1', docRel: 'docs/roundtables/gone/minutes.md' })
    expect(doc.dangling).toBe(true)
    expect(doc.canonicalPath).toBe('docs/roundtables/gone/minutes.md')
  })
})
