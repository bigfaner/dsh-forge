// S8 spike 插件：s8_echo_ctx 工具——把 ToolRunContext 的身份面（会话 id / cwd）
// 原样 dump 到 S8_DUMP_FILE（JSONL 追加），供主会话 vs 子会话对比。
// 形态仿 packages/knowledge（Plugin.Function + inject 元数据；结构化最小面消费 ctx），
// 零依赖（node:fs 仅 child 侧执行点使用——tool 在 boot child 内执行）。
// 注意：spike 工件，不得演化为产品结构（沿 spikes/s1-thin-host 纪律）。
import { appendFileSync } from 'node:fs'

const dumpOf = (why, exec) => {
  const session = exec?.agent?.session ?? undefined
  return {
    why,
    at: new Date().toISOString(),
    agentSessionId: session?.id ?? null,
    headerCwd: session?.header?.cwd ?? null,
    topCwd: session?.cwd ?? null,
    sessionKeys: session ? Object.keys(session).sort() : [],
    execKeys: exec ? Object.keys(exec).sort() : [],
  }
}

const plugin = Object.assign(
  (ctx) => {
    const disposers = [
      ctx.tools.register({
        name: 's8_echo_ctx',
        description:
          'Diagnostic tool (S8 spike). Call it exactly once with {"why": "<tag>"}; it returns the tool execution context identity (agent session id, session cwd) verbatim. No side effects besides an append-only diagnostics log.',
        parameters: {
          type: 'object',
          properties: {
            why: { type: 'string', description: 'short reason tag, e.g. "main" or "subagent"' },
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
            },
            required: ['why', 'at', 'agentSessionId', 'headerCwd', 'topCwd'],
          },
          render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        async execute(args, exec) {
          const why = typeof args?.why === 'string' ? args.why : 'unknown'
          const dump = dumpOf(why, exec)
          try {
            appendFileSync(process.env.S8_DUMP_FILE ?? 's8-dumps.jsonl', `${JSON.stringify(dump)}\n`, 'utf8')
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
