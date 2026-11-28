// 1.4 单测 —— 插件入口自注册（注册 pin，镜像 plugin-forge-spec/plugin.test.ts 模式：
// 结构化最小面替身 ToolRuntime 断言注册面）。覆盖：
// - AC1：插件 apply 内 ctx.tools.register(validate_mermaid) 恰一注册（注册名与列序）
// - AC2：ctx 经 faces.ts 结构化窄类型——包零 @deepseek-ai 运行时依赖（package.json 锚）
// - AC3：工具名 validate_mermaid 字面量单源导出
// - AC4：source/docRel 入参经形状校验路由到 ./validate 裁决（壳零业务逻辑 + typed error 归一）
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import mdMermaidPlugin, { MD_MERMAID_PLUGIN_NAME } from '../../host/index.js'
import { MERMAID_TOOL_NAME, ValidateMermaidError, isValidateMermaidError } from '../../host/tools/validate-mermaid.js'
import { CONVERT_TOOL_NAME } from '../../host/tools/convert-document.js'
import { GET_MD_OUTLINE } from '../../host/tools/get-outline.js'
import type { MermaidToolDefinition } from '../../host/faces.js'

/** 临时 runtime：注册捕获 + disposer 记账（plugin-forge-spec TempRuntime 同型裁剪——本插件只消费 tools 面） */
class TempRuntime {
  readonly registeredTools: MermaidToolDefinition[] = []
  private disposed = 0

  ctx() {
    return {
      tools: {
        register: (d: MermaidToolDefinition) => {
          this.registeredTools.push(d)
          return () => {
            this.disposed += 1
          }
        },
      },
    }
  }

  disposedCount() {
    return this.disposed
  }
}

describe('AC2 faces 结构化窄类型（零 dsh 运行时依赖）', () => {
  it('inject 声明 = [\'tools\']——唯一消费面为 dsh tool 注册面', () => {
    expect([...mdMermaidPlugin.inject]).toEqual(['tools'])
  })

  it('package.json 零 @deepseek-ai 行（faces.ts 结构化消费的依赖面锚）', () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    const all = Object.keys({
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    })
    expect(all.filter((n) => n.startsWith('@deepseek-ai/'))).toEqual([])
  })
})

describe('AC1/AC3 注册面 pin：恰三 tool（validate_mermaid + convert_document + get_outline 字面量单源）', () => {
  it('apply 内恰三注册且名 = 字面量单源（validate_mermaid + convert_document + get_outline 各一）', () => {
    const rt = new TempRuntime()
    const dispose = mdMermaidPlugin(rt.ctx())
    expect(rt.registeredTools.map((t) => t.name)).toEqual([MERMAID_TOOL_NAME, CONVERT_TOOL_NAME, GET_MD_OUTLINE])
    expect(MERMAID_TOOL_NAME).toBe('validate_mermaid')
    expect(CONVERT_TOOL_NAME).toBe('convert_document')
    expect(GET_MD_OUTLINE).toBe('get_outline')
    dispose()
    expect(rt.disposedCount()).toBe(3)
  })

  it('validate_mermaid 形状不变：description / object 根 parameters / output schema+render / execute', () => {
    const rt = new TempRuntime()
    const dispose = mdMermaidPlugin(rt.ctx())
    const tool = rt.registeredTools.find((t) => t.name === MERMAID_TOOL_NAME)
    expect(tool?.description.length).toBeGreaterThan(20)
    expect(tool?.parameters.type).toBe('object')
    expect(Object.keys(tool?.parameters.properties ?? {}).sort()).toEqual(['docRel', 'format', 'source'])
    expect(Object.keys(tool?.output.schema ?? {}), 'validate_mermaid output schema').toEqual(['oneOf'])
    expect(typeof tool?.output.render).toBe('function')
    expect(typeof tool?.execute).toBe('function')
    dispose()
  })

  it('convert_document 形状齐备：params required docRel + output schema+render', () => {
    const rt = new TempRuntime()
    const dispose = mdMermaidPlugin(rt.ctx())
    const tool = rt.registeredTools.find((t) => t.name === CONVERT_TOOL_NAME)
    expect(tool?.parameters.required).toEqual(['docRel'])
    expect(Object.keys(tool?.parameters.properties ?? {}).sort()).toEqual(['docRel', 'format', 'images', 'outRel'])
    expect(Object.keys(tool?.output.schema ?? {}), 'convert_document output schema').toEqual([
      'type',
      'additionalProperties',
      'properties',
      'required',
    ])
    dispose()
  })

  it('tool 名形 pin（OpenAI 兼容端点强校验名形）', () => {
    const rt = new TempRuntime()
    const dispose = mdMermaidPlugin(rt.ctx())
    for (const tool of rt.registeredTools) expect(tool.name).toMatch(/^[a-zA-Z0-9_-]+$/)
    dispose()
  })

  it('插件名导出与默认导出函数形状（cordis loader 只认 default + inject 元数据）', () => {
    expect(MD_MERMAID_PLUGIN_NAME).toBe('markdown-kit')
    expect(typeof mdMermaidPlugin).toBe('function')
  })
})

describe('AC4 入参形状校验（双模互斥）与 typed error 归一', () => {
  /** session cwd 锚替身（execute 第二参——docRel 模式守卫取数位） */
  const EXEC_WS = { agent: { session: { header: { cwd: 'Z:\\ws' } } } } as const

  it('source + docRel 同给 → typed error ERR_INVALID_ARGS（双模互斥）', async () => {
    const rt = new TempRuntime()
    const dispose = mdMermaidPlugin(rt.ctx())
    const tool = rt.registeredTools[0]
    await expect(tool?.execute({ source: 'flowchart TD\n A-->B', docRel: 'a.md' })).rejects.toSatisfy(
      (e: unknown) => isValidateMermaidError(e) && e.code === 'ERR_INVALID_ARGS',
    )
    dispose()
  })

  it('双模均缺省 → typed error ERR_INVALID_ARGS', async () => {
    const rt = new TempRuntime()
    const dispose = mdMermaidPlugin(rt.ctx())
    const tool = rt.registeredTools[0]
    await expect(tool?.execute({})).rejects.toSatisfy(
      (e: unknown) => isValidateMermaidError(e) && e.code === 'ERR_INVALID_ARGS',
    )
    await expect(tool?.execute('not-an-object')).rejects.toBeInstanceOf(ValidateMermaidError)
    dispose()
  })

  it('source 非法形状（非 string）→ typed error ERR_INVALID_ARGS；format 出词表同径', async () => {
    const rt = new TempRuntime()
    const dispose = mdMermaidPlugin(rt.ctx())
    const tool = rt.registeredTools[0]
    await expect(tool?.execute({ source: 42 })).rejects.toSatisfy(
      (e: unknown) => isValidateMermaidError(e) && e.code === 'ERR_INVALID_ARGS',
    )
    await expect(tool?.execute({ source: 'flowchart TD\n A-->B', format: 'plantuml' })).rejects.toSatisfy(
      (e: unknown) => isValidateMermaidError(e) && e.code === 'ERR_INVALID_ARGS',
    )
    dispose()
  })

  it('source 模式路由到 ./validate 裁决：合法源 → {ok, format}（壳零业务逻辑）', async () => {
    const rt = new TempRuntime()
    const dispose = mdMermaidPlugin(rt.ctx())
    const tool = rt.registeredTools[0]
    const verdict = (await tool?.execute({ source: 'flowchart TD\n  A --> B' })) as { ok: boolean; format: string }
    expect(verdict).toMatchObject({ ok: true, format: 'mermaid' })
    dispose()
  })

  it('docRel 模式路由：经注入读取器取文档全文 → ./validate 逐 fence 裁决', async () => {
    const DOC = '# t\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\ntext\n'
    const rt = new TempRuntime()
    let readPath: string | undefined
    const dispose = mdMermaidPlugin(rt.ctx(), {
      readDocFile: (docRel: string) => {
        readPath = docRel
        return DOC
      },
    })
    const tool = rt.registeredTools[0]
    const verdict = (await tool?.execute({ docRel: 'docs/a.md' }, EXEC_WS)) as { fences: { line: number; ok: boolean }[] }
    expect(readPath).toBe(resolve('Z:\\ws', 'docs/a.md'))
    expect(verdict.fences).toEqual([{ line: 3, format: 'mermaid', ok: true }])
    dispose()
  })

  it('bug: docRel 读取失败（不存在/权限拒绝）→ ERR_IO「cannot read document」附 errno，不断言在性（错误码统一口径：读盘失败 = IO 域，ERR_INVALID_ARGS 保留给参数形状）', async () => {
    const rt = new TempRuntime()
    const dispose = mdMermaidPlugin(rt.ctx())
    const tool = rt.registeredTools[0]
    // 真实 node:fs：文件确实不存在（ENOENT）——文案不得断言「不存在」（权限拒绝同冒 ENOENT，macOS 700 目录现场）
    await expect(
      tool?.execute({ docRel: '.forge/docs/probes/__nonexistent-dir__/probe.md' }, EXEC_WS),
    ).rejects.toSatisfy(
      (e: unknown) =>
        isValidateMermaidError(e) &&
        e.code === 'ERR_IO' &&
        /cannot read document: \.forge\/docs\/probes\/__nonexistent-dir__\/probe\.md/.test(e.message) &&
        /errno ENOENT/.test(e.message),
    )
    dispose()
  })

  it('bug: 权限拒绝（EACCES，macOS 700 目录现场）→ ERR_IO「cannot read document」而非 ERR_MERMAID_ENGINE', async () => {
    const rt = new TempRuntime()
    const dispose = mdMermaidPlugin(rt.ctx(), {
      readDocFile: () => {
        throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }) as NodeJS.ErrnoException
      },
    })
    const tool = rt.registeredTools[0]
    await expect(tool?.execute({ docRel: '.forge/docs/probes/param-edit-direct-command/probe.md' }, EXEC_WS)).rejects.toSatisfy(
      (e: unknown) =>
        isValidateMermaidError(e) &&
        e.code === 'ERR_IO' &&
        /cannot read document: \.forge\/docs\/probes\/param-edit-direct-command\/probe\.md/.test(e.message) &&
        /errno EACCES/.test(e.message),
    )
    dispose()
  })

  it('bug e6787e6e: docRel 路径穿越四面拒绝（../ 段 / 盘符绝对 / UNC / POSIX 绝对）→ ERR_IO，守卫与 convert_document/get_outline 同构单源', async () => {
    const rt = new TempRuntime()
    let readAttempts = 0
    const dispose = mdMermaidPlugin(rt.ctx(), {
      readDocFile: () => {
        readAttempts += 1
        return ''
      },
    })
    const tool = rt.registeredTools[0]
    for (const bad of ['../escape.md', 'C:\\abs.md', '\\\\server\\share\\x.md', '/etc/passwd']) {
      await expect(tool?.execute({ docRel: bad }, EXEC_WS)).rejects.toSatisfy(
        (e: unknown) => isValidateMermaidError(e) && e.code === 'ERR_IO',
      )
    }
    // 拒绝先于任何 IO：四面反例零读取消耗
    expect(readAttempts).toBe(0)
    dispose()
  })

  it('bug e6787e6e: session.cwd 缺席 → ERR_IO 拒绝（不猜测根、零读取；convert_document/get_outline 同构）', async () => {
    const rt = new TempRuntime()
    const dispose = mdMermaidPlugin(rt.ctx())
    const tool = rt.registeredTools[0]
    await expect(tool?.execute({ docRel: 'a.md' })).rejects.toSatisfy(
      (e: unknown) => isValidateMermaidError(e) && e.code === 'ERR_IO' && /no session workspace/.test(e.message),
    )
    dispose()
  })

  it('typed error 归一：引擎崩溃（非 typed 错误）→ ERR_MERMAID_ENGINE（不裸抛）', async () => {
    const rt = new TempRuntime()
    const dispose = mdMermaidPlugin(rt.ctx(), {
      readDocFile: () => {
        throw new Error('EIO: disk exploded')
      },
    })
    const tool = rt.registeredTools[0]
    await expect(tool?.execute({ docRel: 'x.md' }, EXEC_WS)).rejects.toSatisfy(
      (e: unknown) => isValidateMermaidError(e) && e.code === 'ERR_MERMAID_ENGINE' && /disk exploded/.test(e.message),
    )
    dispose()
  })
})
