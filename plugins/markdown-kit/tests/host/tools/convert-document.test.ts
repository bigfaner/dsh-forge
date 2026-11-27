// convert_document tool 壳单测（装配面：schema 收窄 / 路由零业务逻辑 / typed error 归一 /
// session.cwd 锚 / emitDiag 成功失败双路径 / lossless JSON 整值边界）。
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createConvertDocumentTool, parseConvertDocumentArgs, sessionCwdOf, renderConvertSummary, CONVERT_TOOL_NAME } from '../../../host/tools/convert-document.js'
import { ConvertDocumentError, isConvertDocumentError } from '../../../host/convert/errors.js'
import type { MermaidToolDefinition, ToolExecFace } from '../../../host/faces.js'
import { createMemoryFs } from '../convert/memory-fs.js'
import { buildDocx, buildPdf } from '../convert/fixtures.js'

const WIN = process.platform === 'win32'
const CWD = WIN ? 'C:\\ws\\demo' : '/ws/demo'
const abs = (...parts: string[]) => resolve(CWD, ...parts)
const execAt = (cwd: string): ToolExecFace => ({ agent: { session: { id: 's-1', header: { cwd } } } })

describe('参数收窄（schema 面拒绝——ERR_INVALID_ARGS）', () => {
  it.each([
    ['非对象入参', 'nope', 'arguments must be an object'],
    ['docRel 缺席', {}, 'docRel must be a non-empty string'],
    ['docRel 空串', { docRel: '  ' }, 'docRel must be a non-empty string'],
    ['docRel 非字符串', { docRel: 42 }, 'docRel must be a non-empty string'],
    ['images 出词表', { docRel: 'a.docx', images: 'inline' }, 'images must be one of'],
    ['format 出词表', { docRel: 'a.docx', format: 'pptx' }, 'format must be one of'],
    ['outRel 非字符串', { docRel: 'a.docx', outRel: 7 }, 'outRel must be a string'],
  ])('%s → ERR_INVALID_ARGS', (_label, args, message) => {
    const caught = (() => {
      try {
        parseConvertDocumentArgs(args)
        return undefined
      } catch (e) {
        return e
      }
    })()
    expect(caught).toSatisfy(
      (e: unknown) => isConvertDocumentError(e) && e.code === 'ERR_INVALID_ARGS' && e.message.includes(message),
    )
  })

  it('合法入参收窄（缺省键不落 undefined 显式键）', () => {
    expect(parseConvertDocumentArgs({ docRel: 'a.docx' })).toEqual({ docRel: 'a.docx' })
    expect(parseConvertDocumentArgs({ docRel: 'a.docx', outRel: '', images: undefined })).toEqual({ docRel: 'a.docx' })
    expect(parseConvertDocumentArgs({ docRel: 'a.pdf', images: 'discard', format: 'pdf' })).toEqual({
      docRel: 'a.pdf',
      images: 'discard',
      format: 'pdf',
    })
  })
})

describe('session.cwd 锚 + 路由（壳零业务逻辑——fs 缝注入透传）', () => {
  it('cwd 取自 exec.agent.session.header.cwd；docRel/outRel 相对 cwd 解析落盘', async () => {
    const mem = createMemoryFs({ [abs('samples', 'text.pdf')]: buildPdf(['Token one']) })
    const tool = createConvertDocumentTool({ fs: mem.fs })
    const summary = (await tool.execute({ docRel: 'samples/text.pdf' }, execAt(CWD))) as { ok: boolean; outRel: string }
    expect(summary).toEqual({ ok: true, outRel: 'samples/text.md', engine: 'pdf', pages: 1 })
    expect(mem.files.has(abs('samples', 'text.md'))).toBe(true)
  })

  it('顶层 cwd 兼容位双读（header.cwd 缺席时回退 session.cwd）', async () => {
    expect(sessionCwdOf({ agent: { session: { cwd: CWD } } })).toBe(CWD)
    expect(sessionCwdOf({ agent: { session: { header: { cwd: CWD } } } })).toBe(CWD)
    expect(sessionCwdOf({})).toBeUndefined()
    expect(sessionCwdOf(undefined)).toBeUndefined()
  })

  it('无会话工作区（无 exec/无 cwd）→ ERR_IO + 失败埋点，零落盘', async () => {
    const mem = createMemoryFs({ [abs('a.docx')]: buildDocx() })
    const tool = createConvertDocumentTool({ fs: mem.fs })
    for (const exec of [undefined, {} as ToolExecFace, { agent: {} } as ToolExecFace]) {
      await expect(tool.execute({ docRel: 'a.docx' }, exec)).rejects.toSatisfy(
        (e: unknown) => isConvertDocumentError(e) && e.code === 'ERR_IO',
      )
    }
    expect(mem.writtenPaths).toEqual([])
  })

  it('业务失败 typed 透传（不二次归一）：穿越拒绝 = ERR_IO', async () => {
    const mem = createMemoryFs({ [abs('a.docx')]: buildDocx() })
    const tool = createConvertDocumentTool({ fs: mem.fs })
    await expect(tool.execute({ docRel: 'a.docx', outRel: '../x.md' }, execAt(CWD))).rejects.toSatisfy(
      (e: unknown) => isConvertDocumentError(e) && e.code === 'ERR_IO',
    )
    expect(mem.writtenPaths).toEqual([])
  })
})

describe('emitDiag doc-convert 前缀（成功/失败双路径零静默）', () => {
  it('成功 → info doc-convert（cwd/docRel/outRel 就地携带）', async () => {
    const mem = createMemoryFs({ [abs('samples', 'text.pdf')]: buildPdf(['Body']) })
    const emitted: { event: string; level: string }[] = []
    const tool = createConvertDocumentTool({ fs: mem.fs, emit: (payload) => void emitted.push({ event: payload.event, level: payload.level }) })
    await tool.execute({ docRel: 'samples/text.pdf' }, execAt(CWD))
    expect(emitted).toEqual([{ event: 'doc-convert', level: 'info' }])
  })

  it('失败 → error doc-convert-fail（typed code 就地携带）；emit 缺席零抛（console 兜底）', async () => {
    const mem = createMemoryFs({ [abs('samples', 'legacy.doc')]: Buffer.from('x') })
    const emitted: { event: string; level: string; message: string }[] = []
    const tool = createConvertDocumentTool({ fs: mem.fs, emit: (payload) => void emitted.push({ event: payload.event, level: payload.level, message: payload.message }) })
    await expect(tool.execute({ docRel: 'samples/legacy.doc' }, execAt(CWD))).rejects.toBeInstanceOf(ConvertDocumentError)
    expect(emitted.length).toBe(1)
    expect(emitted[0]!.event).toBe('doc-convert-fail')
    expect(emitted[0]!.level).toBe('error')
    expect(emitted[0]!.message).toContain('ERR_UNSUPPORTED_VARIANT')
    const silent = createConvertDocumentTool({ fs: mem.fs })
    await expect(silent.execute({ docRel: 'samples/legacy.doc' }, execAt(CWD))).rejects.toBeInstanceOf(ConvertDocumentError)
  })
})

describe('lossless JSON 整值边界（可选键 undefined 剔除——判例 223ba5b3 径）', () => {
  it('pdf 摘要零图片键 / docx assets 摘要零 pages 键（整值无 undefined 成员）', async () => {
    const pdfMem = createMemoryFs({ [abs('t.pdf')]: buildPdf(['x']) })
    const pdfTool = createConvertDocumentTool({ fs: pdfMem.fs })
    const pdfSummary = (await pdfTool.execute({ docRel: 't.pdf' }, execAt(CWD))) as Record<string, unknown>
    expect(Object.keys(pdfSummary).sort()).toEqual(['engine', 'ok', 'outRel', 'pages'])
    expect(Object.values(pdfSummary).every((v) => v !== undefined)).toBe(true)

    const docxMem = createMemoryFs({ [abs('t.docx')]: buildDocx() })
    const docxTool = createConvertDocumentTool({ fs: docxMem.fs })
    const docxSummary = (await docxTool.execute({ docRel: 't.docx' }, execAt(CWD))) as Record<string, unknown>
    expect(Object.keys(docxSummary).sort()).toEqual(['engine', 'extractedImages', 'ok', 'outRel'])
    expect(Object.values(docxSummary).every((v) => v !== undefined)).toBe(true)
  })
})

describe('注册面形状（双 tool 并存 + schema/render 面）', () => {
  it('tool 定义形状齐备（name/params required docRel/output schema+render）', () => {
    const tool: MermaidToolDefinition = createConvertDocumentTool()
    expect(CONVERT_TOOL_NAME).toBe('convert_document')
    expect(tool.name).toBe('convert_document')
    expect(tool.description.length).toBeGreaterThan(20)
    expect(tool.parameters.type).toBe('object')
    expect(Object.keys(tool.parameters.properties).sort()).toEqual(['docRel', 'format', 'images', 'outRel'])
    expect(tool.parameters.required).toEqual(['docRel'])
    expect(tool.output.schema).toBeDefined()
    expect(typeof tool.output.render).toBe('function')
    expect(typeof tool.execute).toBe('function')
  })

  it('render 纯投影：可选键按在场呈现', () => {
    const full = renderConvertSummary({ ok: true, outRel: 'a.md', engine: 'pdf', pages: 3 })
    expect(full[0]!.text).toContain('a.md')
    expect(full[0]!.text).toContain('pages: 3')
    const minimal = renderConvertSummary({ ok: true, outRel: 'b.md', engine: 'docx' })
    expect(minimal[0]!.text).toContain('b.md')
    expect(minimal[0]!.text).not.toContain('pages')
  })
})
