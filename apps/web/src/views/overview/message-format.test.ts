// 消息体纯函数快照（定位：业务测试——M3 4.1 AC2/AC3/AC5）。
// 快照对齐源 = PRD prd-ui-functions.md「消息体示例」×5：①预填（提案渠道）/②任务失败（远征
// 容器）/③任务失败（突击提案容器）/④feature 子图诊断/⑤派发指令单行——正文逐字转录，
// 漂移即红（PRD = 权威快照源——eval 面与 4.4/4.6 组件消费同一输出）。
// ①–④ 锚 = 标准布局显式 docsRoot '.forge/docs'（PRD 示例区注记同源——2026-10-09 锚点修正）；
// docsRoot 缺席回退 `docs` 缺省锚的变体见 feature 渠道/bare 用例。
import { describe, expect, it } from 'vitest'
import {
  DISPATCH_COMMAND_PREFIX,
  docsRootOf,
  formatDiagMessage,
  formatPrefill,
  type MessageContainer,
} from './message-format.js'

/** PRD 示例①容器（提案渠道——ui-polish-round） */
const proposalContainer: MessageContainer = {
  kind: 'proposal',
  slug: 'ui-polish-round',
  title: 'UI 打磨轮',
  summary: '空态/加载态/错误态统一打磨',
  proposalStatus: 'under-review',
}

describe('formatPrefill（AC2——打开新会话现状预填）', () => {
  it('PRD 示例①逐字对齐（提案渠道：@path → 名称 → 摘要 → 状态 → 已生成文档清单 → 空行 → 我的意图空位）', () => {
    const text = formatPrefill({ ...proposalContainer, docsRoot: '.forge/docs' }, [
      { path: 'proposal.md', status: '评审中' },
      { path: 'review-notes.md', status: '草稿' },
    ])
    expect(text).toBe(
      [
        '@.forge/docs/proposals/ui-polish-round/',
        '名称：UI 打磨轮',
        '摘要：空态/加载态/错误态统一打磨',
        '状态：评审中',
        '已生成文档：',
        '· proposal.md（评审中）',
        '· review-notes.md（草稿）',
        '',
        '我的意图：',
      ].join('\n'),
    )
  })

  it('不含模式（数据约束 5——由会话预设承载，消息体零模式字样）', () => {
    const text = formatPrefill(proposalContainer, [{ path: 'proposal.md', status: '评审中' }])
    expect(text).not.toContain('模式')
    expect(text).not.toContain('远征')
    expect(text).not.toContain('突击')
  })

  it('feature 渠道（UF-4.5 同格式：docsRoot 缺席回退 @docs/ 缺省锚 + 阶段行替代状态行；文档无状态 = 无括注）', () => {
    const text = formatPrefill(
      {
        kind: 'feature',
        slug: 'dsh-forge-m2-pipeline',
        title: 'M2 管线接管',
        summary: '状态层转正 + 插件执行链 + 任务/文档视图',
        phase: 'tasks',
      },
      [{ path: 'prd/prd-spec.md' }, { path: 'design/tech-design.md' }],
    )
    expect(text).toBe(
      [
        '@docs/features/dsh-forge-m2-pipeline/',
        '名称：M2 管线接管',
        '摘要：状态层转正 + 插件执行链 + 任务/文档视图',
        '阶段：任务',
        '已生成文档：',
        '· prd/prd-spec.md',
        '· design/tech-design.md',
        '',
        '我的意图：',
      ].join('\n'),
    )
  })

  it('可选面省略：摘要缺席 = 行省略；空文档清单 = 仅节标题（模板骨架恒定）', () => {
    const text = formatPrefill(
      { kind: 'feature', slug: 'bare-feature', title: '裸 feature', phase: 'completed' },
      [],
    )
    expect(text).toBe(
      ['@docs/features/bare-feature/', '名称：裸 feature', '阶段：已完成', '已生成文档：', '', '我的意图：'].join('\n'),
    )
  })

  it('阶段短语全集 = PRD/UF-4.1 chips 词汇（需求/设计/任务/进行中/已完成/已归档）', () => {
    const phases = ['prd', 'design', 'tasks', 'in-progress', 'completed', 'archived'] as const
    const phaseLines = phases.map((phase) =>
      formatPrefill({ kind: 'feature', slug: 'x', title: 't', summary: 's', phase }, []).split('\n')[3],
    )
    expect(phaseLines).toEqual(['阶段：需求', '阶段：设计', '阶段：任务', '阶段：进行中', '阶段：已完成', '阶段：已归档'])
  })
})

describe('formatDiagMessage（AC3——诊断两路三态）', () => {
  it('PRD 示例②逐字对齐（任务失败 · 远征 feature 容器：阶段行在场）', () => {
    const text = formatDiagMessage({
      kind: 'task-failure',
      container: {
        kind: 'feature',
        slug: 'dsh-forge-m2-pipeline',
        title: 'M2 管线接管',
        summary: '状态层转正 + 插件执行链 + 任务/文档视图',
        phase: 'tasks',
        docsRoot: '.forge/docs',
      },
      taskKey: 'dsh-forge-m2-pipeline/2.5',
      taskTitle: '概览 tab 三视图接线',
      taskStatus: 'blocked',
      reason: 'fix-1 创建（block-source 单事务）',
      records: [{ verb: 'auto-block', at: '2026-10-02T12:00:00.000Z', note: 'fix-1 创建（block-source 单事务）' }],
    })
    expect(text).toBe(
      [
        '@.forge/docs/features/dsh-forge-m2-pipeline/',
        '所属：M2 管线接管（feature）',
        '摘要：状态层转正 + 插件执行链 + 任务/文档视图',
        '阶段：任务',
        '任务：dsh-forge-m2-pipeline/2.5 概览 tab 三视图接线',
        '状态：阻塞 — fix-1 创建（block-source 单事务）',
        '失败记录：',
        '· auto-block 10-02 12:00 fix-1 创建（block-source 单事务）',
        '请求：请排查修复（任务时间线见概览 → 任务子 tab → 该任务详情）',
      ].join('\n'),
    )
  })

  it('PRD 示例③逐字对齐（任务失败 · 突击提案容器：@path 指提案目录、无阶段行）', () => {
    const text = formatDiagMessage({
      kind: 'task-failure',
      container: {
        kind: 'proposal',
        slug: 'legacy-eval-retire',
        title: '旧线 eval 退役',
        summary: '完整 eval 体系不迁移',
        docsRoot: '.forge/docs',
      },
      taskKey: 'legacy-eval-retire/1.2',
      taskTitle: '旧线 eval 退役走查（用例集冲突）',
      taskStatus: 'blocked',
      reason: 'result=blocked：eval 用例集与幸存者裁剪清单冲突——待排查',
      records: [
        { verb: 'submit', at: '2026-09-23T10:05:00.000Z', note: 'result=blocked：eval 用例集与幸存者裁剪清单冲突——待排查' },
      ],
    })
    expect(text).toBe(
      [
        '@.forge/docs/proposals/legacy-eval-retire/',
        '所属：旧线 eval 退役（突击提案）',
        '摘要：完整 eval 体系不迁移',
        '任务：legacy-eval-retire/1.2 旧线 eval 退役走查（用例集冲突）',
        '状态：阻塞 — result=blocked：eval 用例集与幸存者裁剪清单冲突——待排查',
        '失败记录：',
        '· submit 09-23 10:05 result=blocked：eval 用例集与幸存者裁剪清单冲突——待排查',
        '请求：请排查修复（任务时间线见概览 → 任务子 tab → 该任务详情）',
      ].join('\n'),
    )
  })

  it('PRD 示例④逐字对齐（feature 子图诊断：五类检查 ✓/✗ 固定读序 + 请求行五名括注）', () => {
    const text = formatDiagMessage({
      kind: 'subgraph',
      container: {
        kind: 'feature',
        slug: 'dsh-forge-p1-mvp',
        title: 'P1 MVP',
        summary: '壳与桥接面 + 工作区注册 + dogfood 走查门',
        phase: 'completed',
        docsRoot: '.forge/docs',
      },
      violations: [
        { kind: 'liveness', message: 'dsh-forge-p1-mvp/1.3 卡死子图（1.3 → 1.4 → 1.3），涉及 2 任务' },
      ],
    })
    expect(text).toBe(
      [
        '@.forge/docs/features/dsh-forge-p1-mvp/',
        '所属：P1 MVP（feature）',
        '摘要：壳与桥接面 + 工作区注册 + dogfood 走查门',
        '阶段：已完成',
        '诊断：validateFeatureTasks 失败',
        '✓ 派生不变量',
        '✓ 依赖无环',
        '✗ Liveness — dsh-forge-p1-mvp/1.3 卡死子图（1.3 → 1.4 → 1.3），涉及 2 任务',
        '✓ 记录链完整性',
        '✓ 拓扑可分层',
        '请求：请排查修复（五类检查 = 派生不变量 / 依赖无环 / Liveness / 记录链完整性 / 拓扑可分层）',
      ].join('\n'),
    )
  })

  it('同 kind 多违规逐条 ✗ 行；记录无注记 = 时间戳止行（变体防御）', () => {
    const text = formatDiagMessage({
      kind: 'subgraph',
      container: { kind: 'feature', slug: 'f', title: 'T', phase: 'prd' },
      violations: [
        { kind: 'cycle', message: '环 A' },
        { kind: 'cycle', message: '环 B' },
      ],
    })
    expect(text).toContain('✗ 依赖无环 — 环 A')
    expect(text).toContain('✗ 依赖无环 — 环 B')
    const failure = formatDiagMessage({
      kind: 'task-failure',
      container: { kind: 'proposal', slug: 'p', title: 'P' },
      taskKey: 'p/1.1',
      taskTitle: '任务甲',
      taskStatus: 'rejected',
      reason: '证据不足',
      records: [{ verb: 'submit', at: '2026-10-01T09:30:00.000Z' }],
    })
    expect(failure).toContain('状态：已拒绝 — 证据不足')
    expect(failure).toContain('· submit 10-01 09:30')
  })
})

describe('docsRootOf（@ 锚文档根推导——三分支 + 容差）', () => {
  it('仓内（forge = <ws>\\.forge）→ 工作区相对段 + `/docs`（如 `.forge/docs`）', () => {
    expect(docsRootOf('Z:\\project\\dsh', 'Z:\\project\\dsh\\.forge')).toBe('.forge/docs')
  })

  it('forge = 工作区根 → `docs`（无段前缀）', () => {
    expect(docsRootOf('Z:\\project\\dsh', 'Z:\\project\\dsh')).toBe('docs')
  })

  it('仓外 → 全正斜杠绝对路径 + `/docs`（注册可仓外——@ 按工作区根解析需绝对锚）', () => {
    expect(docsRootOf('Z:\\project\\dsh', 'D:\\forge-external')).toBe('D:/forge-external/docs')
  })

  it('容差：大小写不敏感（forge 段原样保留）+ 尾分隔符 + 正斜杠输入 + 深层仓内段', () => {
    expect(docsRootOf('z:\\PROJECT\\dsh/', 'Z:\\project\\DSH\\.Forge\\')).toBe('.Forge/docs')
    expect(docsRootOf('Z:/project/dsh', 'Z:/project/dsh/.forge')).toBe('.forge/docs')
    expect(docsRootOf('Z:\\ws', 'Z:\\ws\\sub\\forge')).toBe('sub/forge/docs')
  })

  it('段边界敏感：`Z:\\project\\ds` 非 `Z:\\project\\dsh\\.forge` 容器（裸前缀不误判仓内）', () => {
    expect(docsRootOf('Z:\\project\\ds', 'Z:\\project\\dsh\\.forge')).toBe('Z:/project/dsh/.forge/docs')
  })
})

describe('@ 锚数据驱动（docsRoot 注入——缺席回退 docs 缺省锚）', () => {
  it('formatPrefill 带 docsRoot（提案渠道）：首行 = `@<docsRoot>/proposals/<slug>/`，其余行不变', () => {
    const text = formatPrefill(
      { ...proposalContainer, docsRoot: '.forge/docs' },
      [{ path: 'proposal.md', status: '评审中' }],
    )
    expect(text.split('\n')[0]).toBe('@.forge/docs/proposals/ui-polish-round/')
    expect(text.split('\n')[1]).toBe('名称：UI 打磨轮')
  })

  it('formatPrefill 带 docsRoot（feature 渠道 + 仓外绝对锚变体）', () => {
    const text = formatPrefill(
      { kind: 'feature', slug: 'f1', title: '特性', phase: 'tasks', docsRoot: 'D:/forge-external/docs' },
      [],
    )
    expect(text.split('\n')[0]).toBe('@D:/forge-external/docs/features/f1/')
  })

  it('formatDiagMessage 带 docsRoot：任务失败/子图两路首行同口径', () => {
    const failure = formatDiagMessage({
      kind: 'task-failure',
      container: { kind: 'proposal', slug: 'p1', title: 'P', docsRoot: '.forge/docs' },
      taskKey: 'p1/1.1',
      taskTitle: '任务',
      taskStatus: 'blocked',
      reason: 'r',
      records: [],
    })
    expect(failure.split('\n')[0]).toBe('@.forge/docs/proposals/p1/')
    const subgraph = formatDiagMessage({
      kind: 'subgraph',
      container: { kind: 'feature', slug: 'f1', title: 'F', phase: 'prd', docsRoot: '.forge/docs' },
      violations: [],
    })
    expect(subgraph.split('\n')[0]).toBe('@.forge/docs/features/f1/')
  })
})

describe('派发指令模板（AC5——v23 单行最小消息，零纯函数）', () => {
  it('PRD 示例⑤逐字对齐：前缀 + 容器标识 = 单行（无换行、无其它成分）', () => {
    const line = `${DISPATCH_COMMAND_PREFIX}dsh-forge-m3-bootstrap-presets`
    expect(line).toBe('/run-tasks dsh-forge-m3-bootstrap-presets')
    expect(line).not.toContain('\n')
    expect(DISPATCH_COMMAND_PREFIX).toBe('/run-tasks ')
  })
})
