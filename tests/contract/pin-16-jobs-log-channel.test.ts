// G1 pin ㉒（async-dispatch §6 负向 pin——blitz 任务 1.4）：上游 jobs 模型消费面两事实的行为级钉死。
// 权威：proposals/dsh-forge-async-dispatch/proposal.md §6（守护对象 F4′/F5′——上游若演进 jobs 契约
// 「log 并入模型消费读 / progress 并入 JobRead 公共投影」，本 pin 红 → 本提案随迁裁决）+ §4.3
// （plugin 侧 appendLog 单点硬编码 channel:'log' 的安全前件 = 本 pin 所钉事实）。
// 三事实（行号锚 = 2026-10-10 HEAD 的 dsh-tool-jobs lib/index.js）：
//   ① renderModelDelta 滤 log 块（:61-70——visibility 门 = 全文件唯一 `channel !== "log"` 谓词）；
//   ② 未知名 channel 视同缺席喂模型（滤除仅 log 一名；拼错通道名即静默入模型面——F4 泄露向，
//     plugin 侧以 DispatchJobRunHandle 收窄句柄 + adaptDispatchJobs 单点硬编码结构性封死）；
//   ③ publicJob 经 jobDetail 以 `progress ?? detail` 折叠（:20-39——公共投影无 progress 字段名，
//     progress 在场时值折叠进 detail 仍可达模型 → dispatchTask 恒不调 updateProgress 的根据）。
// Hard Rule 相容声明：pin 池纪律「只 pin 上游公开面，不 pin 内部实现细节（防脆断）」——本 pin 对象
// renderModelDelta/publicJob 恰非包导出面（exports 恒 Config/apply/inject/name），故以公开入口
// apply() 装配真 job_output/job_list 控件，对注入的 ring/job 数据做行为断言——钉的是实装字节
// （0.2.0-rc.2）的真实消费行为，非实现文本；另附机械文本审计（唯一滤除谓词 + progress 标识符
// 仅在折叠点）双保险。
// 锚定链：dsh-tool-jobs 非宿主直依赖——经 host 实依赖的 @deepseek-ai/dsh 元包依赖解析（pnpm 布局
// 下该包 sibling node_modules 即真相；自宿主锚直解析将被严格布局拒绝）。
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { PIN_VERSION, ROOT } from './pins.js'

// 锚定链：host 实依赖 @deepseek-ai/dsh（元包）→ 其依赖 @deepseek-ai/dsh-tool-jobs
const requireFromHost = createRequire(join(ROOT, 'apps/host/package.json'))
const DSH_DIR = dirname(requireFromHost.resolve('@deepseek-ai/dsh/package.json'))
const requireFromDsh = createRequire(join(DSH_DIR, 'package.json'))
const TOOL_JOBS_DIR = dirname(requireFromDsh.resolve('@deepseek-ai/dsh-tool-jobs/package.json'))

/** apply() 装配产出的单枚 job 控件（上游 defineTool 产物子面——本 pin 消费 name + execute + output.render） */
interface CapturedTool {
  readonly name: string
  execute(args: Record<string, unknown>, exec: unknown): Promise<unknown>
  output: { render(args: unknown, value: unknown): ReadonlyArray<{ type: string; text: string }> }
}

/** apply() 装配产物：三枚真 job 控件 + 可逐用例换装的注册表假体读面 + 模块命名空间 */
interface Applied {
  mod: Record<string, unknown>
  tools: Map<string, CapturedTool>
  jobs: { read: (id: string, owner?: string) => unknown; list: (owner?: string) => unknown[] }
}

let applied: Applied
let indexJs = ''

beforeAll(async () => {
  // 上游注册表假体（apply 装配所需最小面——attachController/events.subscribe 零行为，读面逐用例
  // 换装：registry 经委托闭包读 jobs 对象——apply 闭包持有 registry，直接 spread 会复制旧引用）
  const jobs: Applied['jobs'] = { read: () => null, list: () => [] }
  const registry = {
    attachController: () => {},
    events: { subscribe: () => {} },
    read: (id: string, owner?: string) => jobs.read(id, owner),
    list: (owner?: string) => jobs.list(owner),
  }
  const registered: CapturedTool[] = []
  const ctx = {
    on: () => {},
    get: () => undefined,
    tools: { register: (def: CapturedTool) => void registered.push(def) },
    systemPrompt: { section: () => {}, getSectionOrder: () => 100 },
    jobs: registry,
  }
  const entry = requireFromDsh.resolve('@deepseek-ai/dsh-tool-jobs')
  const mod = (await import(pathToFileURL(entry).href)) as Record<string, unknown>
  ;(mod['apply'] as (c: unknown, config: unknown) => void)(ctx, {})
  applied = { mod, tools: new Map(registered.map((d) => [d.name, d])), jobs }
  indexJs = readFileSync(join(TOOL_JOBS_DIR, 'lib/index.js'), 'utf8')
})

/** job_output 消费读（注入 JobRead → 真 execute + render → 模型面文本） */
async function renderJobOutput(read: unknown): Promise<string> {
  applied.jobs.read = () => read
  const tool = applied.tools.get('job_output')
  expect(tool, 'apply() 装配产出 job_output').toBeTruthy()
  const value = await tool!.execute({ job_id: 'forge-dispatch-1' }, { agent: { id: 'session-1' } })
  return tool!.output.render({}, value)[0]?.text ?? ''
}

/** running forge-dispatch job 的 JobRead job 面（无 progress/无 detail = 本插件发射纪律下的运行态） */
function dispatchJob(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'forge-dispatch-1',
    kind: 'forge-dispatch',
    label: 'feat-x/1.4 · T',
    status: 'running',
    startedAt: 1,
    output: { spillPaths: [] },
    ...over,
  }
}

describe('pin ㉒-1 装配面审计（版本 + 公开导出面 + 机械文本双保险）', () => {
  it('dsh-tool-jobs 实装版本 = 精确 pin 版本（升级窗口外漂移即红）', () => {
    const pkg = JSON.parse(readFileSync(join(TOOL_JOBS_DIR, 'package.json'), 'utf8')) as { version: string }
    expect(pkg.version).toBe(PIN_VERSION)
  })

  it('公开导出面恰四员——renderModelDelta/publicJob 非导出面，行为 pin 经 apply() 装配公开入口', () => {
    expect(Object.keys(applied.mod).sort()).toEqual(['Config', 'apply', 'inject', 'name'])
    expect([...applied.tools.keys()].sort()).toEqual(['job_kill', 'job_list', 'job_output'])
  })

  it('文本审计①：visibility 滤除谓词全文件唯一 = `channel !== "log"`（滤除仅 log 一名——未知名无从被滤）', () => {
    expect(indexJs.match(/channel !== "log"/g)).toHaveLength(1)
  })

  it('文本审计②：progress 标识符全文件恰两处（JSDoc 注释 + jobDetail 折叠点）——公共投影/schema 无第二引用点', () => {
    expect(indexJs.match(/progress/g)).toHaveLength(2)
    expect(indexJs).toContain('return job.progress ?? job.detail;')
  })
})

describe('pin ㉒-2 F4′-A：renderModelDelta 持续滤 log 块（§6 守护对象一——index.js:61-70）', () => {
  it('forge-dispatch running job 的 log 环：job_output 模型消费面 = (no new output) + 状态行——零进度字节', async () => {
    const text = await renderJobOutput({
      chunks: [
        { channel: 'log', text: 'claimed feat-x/1.4 (coding-feature)' },
        { channel: 'log', text: 'spawned worker bg-1' },
        { channel: 'log', text: 'worker executing — settlement deferred to job_output' },
      ],
      lossy: false,
      result: undefined,
      job: dispatchJob(),
    })
    expect(text).toBe('(no new output)\n[status: running]')
    // 负向断言：任何里程碑字节不在模型面（中途读只得空增量 + 生命周期状态行）
    expect(text).not.toMatch(/claimed|spawned|executing/)
  })
})

describe('pin ㉒-3 F4′-B：未知名 channel 视同缺席喂模型（泄露向对照面——滤除仅 log 一名）', () => {
  it('拼错通道名/缺席通道/stdout/stderr 块全数直入模型消费面（appendLog 单点硬编码所封死的 F4 泄露向）', async () => {
    const text = await renderJobOutput({
      chunks: [
        { channel: 'typo-channel', text: 'LEAKED-PROGRESS' },
        { text: 'absent-channel-bytes' },
        { channel: 'stderr', text: 'err-bytes' },
      ],
      lossy: false,
      result: undefined,
      job: dispatchJob(),
    })
    expect(text).toContain('LEAKED-PROGRESS') // 未知名 = 视同缺席喂模型
    expect(text).toContain('absent-channel-bytes') // 无 channel = 喂模型
    expect(text).toContain('[stderr]\nerr-bytes') // stderr 装配原样（通道矩阵非 log 三态均喂）
  })
})

describe('pin ㉒-4 F5′：publicJob progress??detail 折叠（§6 守护对象二——index.js:20-39）', () => {
  it('job_list 公共投影：progress 值折叠进 detail 键、progress 字段名永不浮现；双缺席 = 裸投影（无 detail 键）', async () => {
    applied.jobs.list = () => [
      dispatchJob({ id: 'j3', progress: 'LIVE-PROGRESS', detail: 'TERMINAL-REASON' }),
      dispatchJob({ id: 'j4' }),
    ]
    const tool = applied.tools.get('job_list')
    expect(tool, 'apply() 装配产出 job_list').toBeTruthy()
    const projections = (await tool!.execute({}, { agent: { id: 'session-1' } })) as Array<Record<string, unknown>>
    // progress 在场：值覆盖 detail 折叠为单 detail 键——progress 字段名不在公共面（toEqual 全形断言）
    expect(projections[0]).toEqual({
      id: 'j3',
      kind: 'forge-dispatch',
      label: 'feat-x/1.4 · T',
      status: 'running',
      detail: 'LIVE-PROGRESS',
      startedAt: 1,
    })
    // 双缺席（本插件纪律下的 forge-dispatch 运行态）：无 detail 键——公共投影零进度内容
    expect(projections[1]).toEqual({
      id: 'j4',
      kind: 'forge-dispatch',
      label: 'feat-x/1.4 · T',
      status: 'running',
      startedAt: 1,
    })
  })

  it('job_output 状态行同折叠面：progress 在场 = 状态行 qualifier 可达模型（恒不调 updateProgress 的根据——F5）', async () => {
    const text = await renderJobOutput({ chunks: [], lossy: false, result: undefined, job: dispatchJob({ progress: 'LIVE-PROGRESS' }) })
    expect(text).toBe('(no new output)\n[status: running, LIVE-PROGRESS]')
  })
})
