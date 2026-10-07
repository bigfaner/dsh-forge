// M3 S5/S6 spike 插件：m3_probe 工具——dump 会话身份面 + 本组合可见工具名全集
// 到 M3_DUMP_FILE（JSONL 追加）。比 S8 echo-ctx 多一面：ToolRuntime.schemas() 的
// name 投影（worker toolFilter 收窄 / 组合继承的机械证据）。
// 形态仿 packages/knowledge（Plugin.Function + inject 元数据）。零依赖。
// 注意：spike 工件，不得演化为产品结构（沿 spikes/s1-thin-host、m2-s8 纪律）。
import { appendFileSync } from 'node:fs'

const dumpOf = (why, exec, toolsRuntime) => {
  const session = exec?.agent?.session ?? undefined
  const dump = {
    why,
    at: new Date().toISOString(),
    agentSessionId: session?.id ?? null,
    headerCwd: session?.header?.cwd ?? null,
    topCwd: session?.cwd ?? null,
  }
  // 工具名投影：scoped 面 = ToolRuntime.schemas(exec.agent)——执行 agent 的受限视图
  //（0.2.0-rc.2 的 ToolRunContext 无 exec.tools 字段——裸 ctx.tools.schemas() 无 scope
  // 参数 = 全局注册表面，worker 收窄（tools.restrict deny）不可见；fix-1 复跑实证修正）
  const agent = exec?.agent
  const readSchemas = () => (agent !== undefined ? toolsRuntime.schemas(agent) : toolsRuntime.schemas?.())
  try {
    const schemas = readSchemas()
    if (schemas && typeof schemas.then === 'function') {
      // async 形态在 dumpOf 内 await 不了——记 pending，由 execute 侧二次尝试
      dump.toolNamesPending = true
    } else if (Array.isArray(schemas)) {
      dump.toolNames = schemas.map((s) => s?.name).filter((n) => typeof n === 'string').sort()
      dump.toolNamesScope = agent !== undefined ? 'exec-agent' : 'global'
    } else {
      dump.toolNames = null
      dump.toolNamesShape = schemas === undefined ? 'no-schemas-api' : typeof schemas
    }
  } catch (cause) {
    dump.toolNamesError = String(cause)
  }
  return dump
}

const plugin = Object.assign(
  (ctx) => {
    const toolsRuntime = ctx.tools
    const disposers = [
      ctx.tools.register({
        name: 'm3_probe',
        description:
          'Diagnostic tool (M3 spike). Call with {"why": "<tag>"}; returns session identity and the sorted list of tool names visible in this composition. No side effects besides an append-only diagnostics log.',
        parameters: {
          type: 'object',
          properties: {
            why: { type: 'string', description: 'short tag, e.g. "main-expedition", "child-blitz"' },
          },
          required: ['why'],
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              why: { type: 'string' },
              at: { type: 'string' },
              agentSessionId: { oneOf: [{ type: 'string' }, { type: 'null' }] },
              headerCwd: { oneOf: [{ type: 'string' }, { type: 'null' }] },
              topCwd: { oneOf: [{ type: 'string' }, { type: 'null' }] },
              toolNames: { oneOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] },
              toolNamesScope: { type: 'string' },
            },
            required: ['why', 'at', 'agentSessionId', 'headerCwd', 'topCwd', 'toolNames'],
          },
          render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        async execute(args, exec) {
          const why = typeof args?.why === 'string' ? args?.why : 'unknown'
          const dump = dumpOf(why, exec, toolsRuntime)
          if (dump.toolNamesPending === true) {
            try {
              const schemas = await (exec?.agent !== undefined ? toolsRuntime.schemas(exec.agent) : toolsRuntime.schemas?.())
              dump.toolNames = Array.isArray(schemas)
                ? schemas.map((s) => s?.name).filter((n) => typeof n === 'string').sort()
                : null
            } catch (cause) {
              dump.toolNamesError = String(cause)
            }
            delete dump.toolNamesPending
          }
          try {
            appendFileSync(process.env.M3_DUMP_FILE ?? 'm3-dumps.jsonl', `${JSON.stringify(dump)}\n`, 'utf8')
          } catch (cause) {
            dump.dumpError = String(cause)
          }
          return dump
        },
      }),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  },
  { inject: ['tools'] },
)

export default plugin
