// convertDocument 单测——引擎分派 / 图片双策略 / 穿越守卫 / typed error 全码闭环
//（契约 convert-document.md CD-1..CD-6 单元层承载面；真实样本 = 进程内 fixture 构造器）。
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { convertDocumentWorkspaceFile, assertRelUnderRoot, defaultOutRelOf } from '../../../host/convert/index.js'
import { ConvertDocumentError, isConvertDocumentError } from '../../../host/convert/errors.js'
import { createMemoryFs } from './memory-fs.js'
import { buildCorruptDocx, buildDocx, buildPdf } from './fixtures.js'

const WIN = process.platform === 'win32'
const CWD = WIN ? 'C:\\ws\\demo' : '/ws/demo'
const abs = (...parts: string[]) => resolve(CWD, ...parts)

describe('引擎分派（auto 按扩展名机械分派，不经 LLM）', () => {
  it('auto：.pdf → pdf 引擎文本提取成功（CD-3 单元面）', async () => {
    const pdf = buildPdf(['Alpha block content', 'Beta block content'])
    const mem = createMemoryFs({ [abs('samples', 'text-sample.pdf')]: pdf })
    const summary = await convertDocumentWorkspaceFile(
      { docRel: 'samples/text-sample.pdf' },
      { cwd: CWD, fs: mem.fs },
    )
    expect(summary).toEqual({ ok: true, outRel: 'samples/text-sample.md', engine: 'pdf', pages: 2 })
    const md = mem.files.get(abs('samples', 'text-sample.md'))!.toString('utf8')
    expect(md).toContain('Alpha block content')
    expect(md).toContain('Beta block content')
  })

  it('auto：.docx → docx 引擎成功；显式 format 覆盖同判', async () => {
    const docx = buildDocx()
    for (const format of [undefined, 'docx'] as const) {
      const mem = createMemoryFs({ [abs('samples', 'doc.docx')]: docx })
      const summary = await convertDocumentWorkspaceFile(
        { docRel: 'samples/doc.docx', ...(format !== undefined ? { format } : {}) },
        { cwd: CWD, fs: mem.fs },
      )
      expect(summary.ok).toBe(true)
      expect(summary.engine).toBe('docx')
      const md = mem.files.get(abs('samples', 'doc.md'))!.toString('utf8')
      expect(md).toContain('Quarterly Report')
    }
  })

  it('缺省输出路径 = 同目录同名 .md（无扩展名追加 .md）', () => {
    expect(defaultOutRelOf('samples/a.docx')).toBe('samples/a.md')
    expect(defaultOutRelOf('samples/README')).toBe('samples/README.md')
    expect(defaultOutRelOf('a/b.pdf')).toBe('a/b.md')
  })
})

describe('不支持变体显式拒绝（CD-4 单元面——typed code 精确相等 + 零落盘对账）', () => {
  it.each([
    ['.doc 老格式', 'samples/legacy-sample.doc', 'unsupported document variant'],
    ['未知扩展', 'notes/plain.txt', 'unsupported document variant'],
  ])('%s → ERR_UNSUPPORTED_VARIANT + 零 fs 写入', async (_label, docRel, message) => {
    const mem = createMemoryFs({ [abs(docRel)]: Buffer.from('x') })
    await expect(convertDocumentWorkspaceFile({ docRel }, { cwd: CWD, fs: mem.fs })).rejects.toSatisfy(
      (e: unknown) => isConvertDocumentError(e) && e.code === 'ERR_UNSUPPORTED_VARIANT' && message.length > 0,
    )
    expect(mem.writtenPaths).toEqual([])
    expect(mem.mkdirPaths).toEqual([])
  })

  it('扫描件 pdf（全文档零可提取文本）→ ERR_UNSUPPORTED_VARIANT + 零落盘', async () => {
    // 零文本页：内容流仅文本操作符外的空白页（无 Tj）——程序化构造空页 pdf
    const scanned = (() => {
      const objects: string[] = []
      objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
      objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
      objects[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>'
      objects[4] = '<< /Length 8 >>\nstream\n1 0 0 rg\nendstream'
      let body = '%PDF-1.4\n'
      const offsets: number[] = []
      for (let id = 1; id < objects.length; id += 1) {
        offsets[id] = Buffer.byteLength(body, 'latin1')
        body += `${id} 0 obj\n${objects[id]}\nendobj\n`
      }
      const xrefStart = Buffer.byteLength(body, 'latin1')
      let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`
      for (let id = 1; id < objects.length; id += 1) xref += `${String(offsets[id]!).padStart(10, '0')} 00000 n \n`
      const trailer = `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
      return Buffer.from(body + xref + trailer, 'latin1')
    })()
    const mem = createMemoryFs({ [abs('samples/scanned-sample.pdf')]: scanned })
    await expect(
      convertDocumentWorkspaceFile({ docRel: 'samples/scanned-sample.pdf' }, { cwd: CWD, fs: mem.fs }),
    ).rejects.toSatisfy((e: unknown) => isConvertDocumentError(e) && e.code === 'ERR_UNSUPPORTED_VARIANT')
    expect(mem.writtenPaths).toEqual([])
  })
})

describe('路径穿越守卫（CD-5——拒绝先于任何 IO，可红锚）', () => {
  const docx = buildDocx()

  it.each([
    ['.. 相对穿越', { docRel: 'samples/ok.docx', outRel: '../escape.md' }],
    ['绝对路径（win 盘符）', { docRel: 'samples/ok.docx', outRel: 'C:/abs/out.md' }],
    ['绝对路径（posix）', { docRel: 'samples/ok.docx', outRel: '/abs/out.md' }],
    ['UNC 路径', { docRel: 'samples/ok.docx', outRel: '\\\\server\\share\\out.md' }],
    ['docRel 穿越同守', { docRel: '../outside.docx', outRel: 'out.md' }],
    ['穿越中段取消形式', { docRel: 'samples/ok.docx', outRel: 'a/../../out.md' }],
  ])('%s → ERR_IO + 零 fs 写入（真实拒绝先于 IO）', async (_label, input) => {
    const mem = createMemoryFs({ [abs('samples', 'ok.docx')]: docx })
    await expect(convertDocumentWorkspaceFile(input, { cwd: CWD, fs: mem.fs })).rejects.toSatisfy(
      (e: unknown) => isConvertDocumentError(e) && e.code === 'ERR_IO',
    )
    expect(mem.writtenPaths).toEqual([])
    expect(mem.mkdirPaths).toEqual([])
  })

  it('守卫纯函数：合法相对路径返回根下解析绝对路径；越界/绝对/空串同码拒绝', () => {
    expect(assertRelUnderRoot(CWD, 'samples/a.md', 'outRel')).toBe(abs('samples', 'a.md'))
    expect(() => assertRelUnderRoot(CWD, '', 'outRel')).toThrow(ConvertDocumentError)
    expect(() => assertRelUnderRoot(CWD, '..', 'outRel')).toThrow(ConvertDocumentError)
    expect(() => assertRelUnderRoot(CWD, 'C:/x.md', 'outRel')).toThrow(ConvertDocumentError)
  })

  it('嵌套子目录合法（守卫只拦越界，不拦深度）', async () => {
    const mem = createMemoryFs({ [abs('samples', 'ok.docx')]: docx })
    const summary = await convertDocumentWorkspaceFile(
      { docRel: 'samples/ok.docx', outRel: 'docs/deep/nested/out.md', images: 'discard' },
      { cwd: CWD, fs: mem.fs },
    )
    expect(summary.outRel).toBe('docs/deep/nested/out.md')
    expect(mem.files.has(abs('docs', 'deep', 'nested', 'out.md'))).toBe(true)
  })
})

describe('引擎失败（CD-6——损坏 docx → ERR_CONVERT_ENGINE + 零落盘）', () => {
  it('zip 魔数缺席伪 docx → ERR_CONVERT_ENGINE', async () => {
    const mem = createMemoryFs({ [abs('samples/broken.docx')]: buildCorruptDocx() })
    await expect(
      convertDocumentWorkspaceFile({ docRel: 'samples/broken.docx', images: 'discard' }, { cwd: CWD, fs: mem.fs }),
    ).rejects.toSatisfy((e: unknown) => isConvertDocumentError(e) && e.code === 'ERR_CONVERT_ENGINE')
    expect(mem.writtenPaths).toEqual([])
  })
})

describe('源文件不可读 → ERR_IO', () => {
  it('缺失源文件 → ERR_IO（不断言在性，附 errno）', async () => {
    const mem = createMemoryFs({})
    await expect(
      convertDocumentWorkspaceFile({ docRel: 'samples/missing.docx' }, { cwd: CWD, fs: mem.fs }),
    ).rejects.toSatisfy(
      (e: unknown) => isConvertDocumentError(e) && e.code === 'ERR_IO' && /errno ENOENT/.test(e.message),
    )
    expect(mem.writtenPaths).toEqual([])
  })
})

describe('typed error 全码闭环（错误码闭集精确定谳）', () => {
  it('闭集 = 4 码；各类失败各归其码（INVALID_ARGS 在壳层测试面，其余三码本面收齐）', async () => {
    const capture = async (p: Parameters<typeof convertDocumentWorkspaceFile>[0]): Promise<string> => {
      const mem = createMemoryFs({
        [abs('samples/legacy.doc')]: Buffer.from('x'),
        [abs('samples/broken.docx')]: buildCorruptDocx(),
        [abs('samples/ok.docx')]: buildDocx(),
      })
      try {
        await convertDocumentWorkspaceFile(p, { cwd: CWD, fs: mem.fs })
        return `resolved:${p.docRel}`
      } catch (e) {
        expect(mem.writtenPaths, `${p.docRel} 失败零落盘`).toEqual([])
        return (e as ConvertDocumentError).code
      }
    }
    const codes = [
      await capture({ docRel: 'samples/legacy.doc' }),
      await capture({ docRel: 'samples/broken.docx' }),
      await capture({ docRel: 'samples/ok.docx', outRel: '../e.md' }),
    ]
    expect(codes.sort()).toEqual(['ERR_CONVERT_ENGINE', 'ERR_IO', 'ERR_UNSUPPORTED_VARIANT'])
  })
})

describe('图片双策略（CD-1/CD-2 单元面——真实 docx 内嵌 PNG）', () => {
  const docx = buildDocx()

  it('assets（缺省）：图片抽取到输出旁 assets/ 并改写引用（非 base64 / 非 docx 内部路径）', async () => {
    const mem = createMemoryFs({ [abs('samples', 'doc-with-image.docx')]: docx })
    const summary = await convertDocumentWorkspaceFile(
      { docRel: 'samples/doc-with-image.docx', images: 'assets' },
      { cwd: CWD, fs: mem.fs },
    )
    expect(summary.engine).toBe('docx')
    expect(summary.extractedImages).toBeGreaterThanOrEqual(1)
    expect(summary.discardedImages).toBeUndefined()
    const assetFiles = [...mem.files.keys()].filter((p) => p.startsWith(abs('samples', 'assets')))
    expect(assetFiles.length).toBeGreaterThanOrEqual(1)
    const md = mem.files.get(abs('samples', 'doc-with-image.md'))!.toString('utf8')
    expect(md).toContain('Quarterly Report')
    expect(md).toMatch(/!\[[^\]]*\]\(assets\/image-\d+\.png\)/)
    expect(md).not.toContain('data:image')
    expect(md).not.toContain('word/media')
    // 图片字节 = 真实 PNG 魔数（抽取的是原始字节，非 base64 引用）
    expect(mem.files.get(assetFiles[0]!)!.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  })

  it('images 缺省 = assets（同判）', async () => {
    const mem = createMemoryFs({ [abs('samples', 'doc.docx')]: docx })
    const summary = await convertDocumentWorkspaceFile({ docRel: 'samples/doc.docx' }, { cwd: CWD, fs: mem.fs })
    expect(summary.extractedImages).toBeGreaterThanOrEqual(1)
    expect([...mem.files.keys()].some((p) => p.startsWith(abs('samples', 'assets')))).toBe(true)
  })

  it('discard：零图片落盘（输出旁无 assets/）+ 零图片引用残留', async () => {
    const mem = createMemoryFs({ [abs('samples', 'doc-with-image.docx')]: docx })
    const summary = await convertDocumentWorkspaceFile(
      { docRel: 'samples/doc-with-image.docx', images: 'discard' },
      { cwd: CWD, fs: mem.fs },
    )
    expect(summary.ok).toBe(true)
    expect(summary.discardedImages).toBeGreaterThanOrEqual(1)
    expect(summary.extractedImages).toBeUndefined()
    const md = mem.files.get(abs('samples', 'doc-with-image.md'))!.toString('utf8')
    expect(md).toContain('Quarterly Report')
    expect(md).not.toMatch(/!\[/)
    expect(md).not.toContain('data:image')
    expect([...mem.files.keys()].some((p) => p.includes(join('samples', 'assets')))).toBe(false)
    expect(mem.mkdirPaths.every((p) => !p.startsWith(abs('samples', 'assets')))).toBe(true)
  })
})
