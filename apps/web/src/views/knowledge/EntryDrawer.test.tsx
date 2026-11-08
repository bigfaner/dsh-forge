// EntryDrawer 单测 —— UF-6 详情弹窗（自持可拖移 dialog：可移动 + 缘侧可拉伸 + 元数据
// 首区四列同行 / AC2 正文区不含 frontmatter / 按需读取 Hard Rule）。渲染面 =
// renderToStaticMarkup（真 dialog 自持皮——静态可渲，拖移行为归 e2e）。
// knowledge-review-ui SC-G（1.8）：dialog 双模式（查看/编辑）+ 标题栏描边钮组 +
// escNext 链 + chip 交互纯函数 + editMeta/裁决执行面 + 驳回 Modal 叠层。
import { describe, expect, it } from 'vitest'
// @ts-expect-error —— web tsconfig types 仅 vite/client；node:fs 仅测试内读取样式表源文
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import type { EntryActionReceipt, EntryDetail, EntryDetailQuery } from '@dsh-forge/contracts'
import { RpcClientError } from '../../rpc/errors.js'
import type { ForgeRpcClient } from '../../rpc/index.js'
import {
  EntryDrawer,
  EntryDrawerBody,
  EntryDrawerEditBody,
  EntryDrawerHeadActions,
  commitKnChip,
  entryMetaRows,
  escNextKn,
  fetchEntryDetail,
  initialKnEditDraft,
  insertKnChip,
  KnKwEditInput,
  knKwEditWidth,
  removeKnChip,
  runEntryMetaEdit,
  runEntryVerdict,
  validateKnEditDraft,
} from './EntryDrawer.js'

/** 本地时刻期望值（测试侧独立现算——与实现同语义非同源引用） */
function expectedLocalStamp(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const NOW = Date.parse('2026-10-02T12:00:00.000Z')

const DETAIL: EntryDetail = {
  entryId: 7,
  title: '安全编码规范',
  summary: '输入校验与输出编码基线',
  keywords: ['security', 'backend'],
  status: 'draft',
  domainPath: '编程/java',
  authors: 'alice',
  updated: '2026-10-02T09:00:00.000Z',
  body: '# 安全基线\n\n正文第一段：输出编码先行。',
}

const READY = { phase: 'ready' as const, detail: DETAIL, error: undefined }
const LOADING = { phase: 'loading' as const, detail: undefined, error: undefined }
const NOOP = () => {}

/** 全通道记录桩 client（Hard Rule 断言面：entryDetail 唯一被调通道） */
function recordingClient(
  entryDetailImpl: (q: EntryDetailQuery) => Promise<EntryDetail>,
): { client: ForgeRpcClient; calls: string[] } {
  const calls: string[] = []
  const mark =
    (name: string, fn: (arg?: unknown) => Promise<unknown>) =>
    async (arg?: unknown): Promise<unknown> => {
      calls.push(name)
      return fn(arg)
    }
  const client = {
    projects: {
      register: mark('projects.register', () => Promise.resolve({})),
      list: mark('projects.list', () => Promise.resolve([])),
      get: mark('projects.get', () => Promise.resolve(null)),
      update: mark('projects.update', () => Promise.resolve({})),
      reconcile: mark('projects.reconcile', () => Promise.resolve({})),
      deriveTaskStoreDir: mark('projects.deriveTaskStoreDir', () => Promise.resolve({})),
    },
    fs: { listDir: mark('fs.listDir', () => Promise.resolve({})) },
    bugs: { list: mark('bugs.list', () => Promise.resolve([])), commitFiles: async () => [], fileDiff: async () => ({ diff: '' }) },
    knowledge: {
      browse: mark('knowledge.browse', () => Promise.resolve([])),
      listEntries: mark('knowledge.listEntries', () => Promise.resolve([])),
      entryDetail: mark('knowledge.entryDetail', (q) => entryDetailImpl(q as EntryDetailQuery)),
      heat: mark('knowledge.heat', () => Promise.resolve(new Map())),
      sessionRecall: mark('knowledge.sessionRecall', () => Promise.resolve([])),
      recallFeedback: mark('knowledge.recallFeedback', () => Promise.resolve({ results: [] })),
      entryAction: mark('knowledge.entryAction', () => Promise.resolve({ results: [] })),
    },
    tasks: {
      transition: mark('tasks.transition', () => Promise.resolve({})),
      query: mark('tasks.query', () => Promise.resolve({})),
      validateFeatureTasks: mark('tasks.validateFeatureTasks', () => Promise.resolve({})),
      list: mark('tasks.list', () => Promise.resolve([])),
      stats: mark('tasks.stats', () => Promise.resolve({})),
      graph: mark('tasks.graph', () => Promise.resolve({})),
      detail: mark('tasks.detail', () => Promise.resolve({})),
      sessionLinks: mark('tasks.sessionLinks', () => Promise.resolve([])),
    },
    features: {
      register: mark('features.register', () => Promise.resolve({})),
      transition: mark('features.transition', () => Promise.resolve({})),
      upsertDoc: mark('features.upsertDoc', () => Promise.resolve({})),
      list: mark('features.list', () => Promise.resolve([])),
      listDocs: mark('features.listDocs', () => Promise.resolve([])),
    },
    proposals: {
      list: mark('proposals.list', () => Promise.resolve([])),
      transition: mark('proposals.transition', () => Promise.resolve({})),
      setMode: mark('proposals.setMode', () => Promise.resolve({})),
      listDocs: mark('proposals.listDocs', () => Promise.resolve([])),
    },
    docs: {
      read: mark('docs.read', () => Promise.resolve({})),
      openExternal: mark('docs.openExternal', () => Promise.resolve(undefined)),
    },
    settings: {
      get: mark('settings.get', () => Promise.resolve({})),
      set: mark('settings.set', () => Promise.resolve(undefined)),
    },
    worktree: {} as unknown as ForgeRpcClient['worktree'],
  } as ForgeRpcClient
  return { client, calls }
}

describe('entryMetaRows（元数据投影——纯函数）', () => {
  it('五行齐备：四列同行（域/状态/作者/更新时间）+ 关键词整行（用户裁决——元数据表首区布局）', () => {
    const rows = entryMetaRows(DETAIL, NOW)
    expect(rows.map((row) => row.label)).toEqual(['域', '状态', '作者', '更新时间', '关键词'])
    expect(rows.map((row) => [row.key, row.span])).toEqual([
      ['domain', false],
      ['status', false],
      ['authors', false],
      ['updated', false],
      ['keywords', true],
    ])
  })

  it('值口径：域原样 / 空域回退「根」 / authors 缺省「—」 / 更新时间 = 相对时间标签（卡片同口径）', () => {
    const rows = entryMetaRows(DETAIL, NOW)
    expect(rows[0]?.value).toEqual({ kind: 'text', text: '编程/java' })
    expect(rows[2]?.value).toEqual({ kind: 'text', text: 'alice' })
    expect(rows[3]?.value).toEqual({ kind: 'text', text: expectedLocalStamp(DETAIL.updated) })
    expect(rows[1]?.value).toEqual({ kind: 'status', status: 'draft' })
    expect(rows[4]?.value).toEqual({ kind: 'keywords', keywords: ['security', 'backend'] })

    const rootRows = entryMetaRows({ ...DETAIL, domainPath: '', authors: null }, NOW)
    expect(rootRows[0]?.value).toEqual({ kind: 'text', text: '根' })
    expect(rootRows[2]?.value).toEqual({ kind: 'text', text: '—' })
  })
})

describe('EntryDrawerBody（纯渲染——ready 相位）', () => {
  const markup = () => renderToStaticMarkup(<EntryDrawerBody state={READY} retry={NOOP} now={NOW} />)

  it('AC1 三区齐备：元数据表首区（四列同行 + 关键词整行）+ 摘要块（title 先于 summary）+ 正文（MarkdownDoc variant=body）', () => {
    const html = markup()
    // 元数据表首区（用户裁决置顶）：四列同行（域/状态/作者/更新时间）+ 关键词整行；
    // 关键词 Tag = info 浅蓝 tint（用户裁决——outline 白底退役）+ 无 # 前缀
    expect(html.indexOf('data-dswf-kn-meta')).toBeGreaterThan(-1)
    expect(html.indexOf('data-dswf-kn-meta')).toBeLessThan(html.indexOf('data-dswf-kn-summary'))
    for (const key of ['domain', 'status', 'authors', 'updated', 'keywords']) {
      expect(html).toContain(`data-dswf-kn-meta-row="${key}"`)
    }
    expect(html).toContain('data-tone="info"')
    expect(html).not.toContain('#security')
    expect(html).toContain('security')
    // 摘要块（title + summary）
    expect(html).toContain('data-dswf-kn-summary')
    expect(html).toContain('安全编码规范')
    expect(html).toContain('输入校验与输出编码基线')
    expect(html).toContain('编程/java')
    expect(html).not.toContain('热度') // EntryDetail 无热度字段（抽屉不另调 heat 通道）
    expect(html).toContain('alice')
    expect(html).toContain(expectedLocalStamp(DETAIL.updated)) // 更新时间 = 本地时刻（用户裁决 localdatetime）
    // 内容体锚（弹窗壳/头行归装载壳）
    expect(html).toContain('data-dswf-kn-drawer')
    // 区三：正文（MarkdownDoc 统一包装，variant=body）
    expect(html).toContain('data-dswf-kn-body')
    expect(html).toContain('data-dswf-markdown="body"')
  })

  it('AC2 正文区不含 frontmatter 字段：正文区只有 Markdown 正文，摘要/关键词只出现在各自分区', () => {
    const html = markup()
    const bodyRegion = html.slice(html.indexOf('data-dswf-kn-body'))
    expect(bodyRegion).toContain('安全基线')
    expect(bodyRegion).toContain('正文第一段：输出编码先行。')
    expect(bodyRegion).not.toContain('输入校验与输出编码基线') // summary 不混入正文区
    expect(bodyRegion).not.toContain('security') // keywords 不混入正文区
    expect(bodyRegion).not.toContain('alice') // authors 不混入正文区
    // 全抽屉零 YAML 键字面量（frontmatter 块不进任何分区——元数据按字段拆行呈现）
    expect(html).not.toContain('summary:')
    expect(html).not.toContain('keywords:')
    expect(html).not.toContain('title:')
  })

  it('1.8 渲染链退役：```mermaid fence 保持官方代码块形态（md-code-block DOM——出图归 DOM 增强器）+ 相邻 md 段同体全量渲染', () => {
    const mermaidDetail: EntryDetail = {
      ...DETAIL,
      body: ['# 架构', '', '```mermaid', 'erDiagram', '    PROPOSALS ||--o{ FEATURES : "proposal_id"', '```', '', '收尾段落。'].join('\n'),
    }
    const html = renderToStaticMarkup(
      <EntryDrawerBody state={{ phase: 'ready', detail: mermaidDetail, error: undefined }} retry={NOOP} now={NOW} />,
    )
    expect(html).toContain('dswf-kn-md-body') // 官方同形容器（刻度组保留）
    expect(html).toContain('data-dswf-markdown="body"') // 正文经 MarkdownDoc 全量渲染
    expect(html, '渲染链退役——零分段渲染件挂载').not.toContain('dswf-doc-mermaid')
    expect(html).toContain('md-code-block') // mermaid fence = 官方代码块（增强器扫描判据）
    expect(html).toContain('erDiagram') // 源码保持可见（安全兜底形态）
    const headAt = html.indexOf('架构')
    const tailAt = html.indexOf('收尾段落。')
    expect(headAt).toBeGreaterThan(-1)
    expect(tailAt).toBeGreaterThan(headAt)
  })

  it('1.5 正文升级：代码块 CodeToolbar（labels 递达——块级 wrap/复制，与文档 tab 同面）', () => {
    const codeDetail: EntryDetail = { ...DETAIL, body: '# 正文\n\n```ts\nconst a = 1\n```' }
    const html = renderToStaticMarkup(
      <EntryDrawerBody state={{ phase: 'ready', detail: codeDetail, error: undefined }} retry={NOOP} now={NOW} />,
    )
    expect(html).toContain('data-code-block-banner') // CodeToolbar 横幅锚（toolbarLabels 递达）
    expect(html).toContain('aria-label="换行"') // 块级 wrap 钮
    expect(html).toContain('aria-label="复制"') // 复制钮
  })

  it('1.8 非法 mermaid 源：源码原样进官方代码块（安全兜底形态——异常归 DOM 增强器面，尾段照常）', () => {
    const badDetail: EntryDetail = { ...DETAIL, body: '# 图\n\n```mermaid\nnot a valid diagram @@@\n```\n\n尾段。' }
    const html = renderToStaticMarkup(
      <EntryDrawerBody state={{ phase: 'ready', detail: badDetail, error: undefined }} retry={NOOP} now={NOW} />,
    )
    expect(html).toContain('md-code-block')
    expect(html).toContain('not a valid diagram @@@')
    expect(html).toContain('尾段。')
  })
})

describe('EntryDrawerBody（纯渲染——loading / error 相位）', () => {
  it('装载中 → 抽屉骨架（无分区内容闪现）', () => {
    const html = renderToStaticMarkup(<EntryDrawerBody state={LOADING} retry={NOOP} />)
    expect(html).toContain('data-dswf-kn-drawer')
    expect(html).toContain('data-dswf-kn-drawer-skeleton')
    expect(html).not.toContain('data-dswf-kn-summary')
    expect(html).not.toContain('data-dswf-kn-body')
  })

  it('error 三态之一 empty-state（ERR_ENTRY_NOT_FOUND/INDEX_STALE/目录非法）→ 不可用空态 + 重试', () => {
    const html = renderToStaticMarkup(
      <EntryDrawerBody
        state={{ phase: 'error', detail: undefined, error: { message: '条目不存在（可能已被移动或删除）', uiState: 'empty-state' } }}
        retry={NOOP}
      />,
    )
    expect(html).toContain('知识详情不可用')
    expect(html).toContain('条目不存在（可能已被移动或删除）')
    expect(html).toContain('data-dswf-kn-drawer-retry')
  })

  it('error 其余码 → 错误条（role=alert）+ 重试', () => {
    const html = renderToStaticMarkup(
      <EntryDrawerBody
        state={{ phase: 'error', detail: undefined, error: { message: 'IPC 通道不可用', uiState: 'error-bar' } }}
        retry={NOOP}
      />,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('IPC 通道不可用')
    expect(html).toContain('data-dswf-kn-drawer-retry')
  })

  it('banner 三态同走错误条（rpcUiState banner = 应用级横幅语境，抽屉内收敛为行内错误条）', () => {
    const html = renderToStaticMarkup(
      <EntryDrawerBody
        state={{ phase: 'error', detail: undefined, error: { message: '补偿失败已记账', uiState: 'banner' } }}
        retry={NOOP}
      />,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('补偿失败已记账')
  })

  it('状态不变量防御：error 相位无附载 / ready 相位无 detail → 内容体壳仍在、内容区让空（不炸对话框）', () => {
    for (const state of [
      { phase: 'error' as const, detail: undefined, error: undefined },
      { phase: 'ready' as const, detail: undefined, error: undefined },
    ]) {
      const html = renderToStaticMarkup(<EntryDrawerBody state={state} retry={NOOP} />)
      expect(html).toContain('data-dswf-kn-drawer')
      expect(html).not.toContain('data-dswf-kn-summary')
      expect(html).not.toContain('role="alert"')
    }
  })
})

describe('fetchEntryDetail（按需读取——Hard Rule）', () => {
  it('唯一通道 = knowledge.entryDetail({projectId, entryId})；全库通道（browse/listEntries/heat）零调用', async () => {
    const { client, calls } = recordingClient(async () => DETAIL)
    const out = await fetchEntryDetail(client, 'p-1', 7)
    expect(out).toEqual({ ok: true, detail: DETAIL })
    expect(calls).toEqual(['knowledge.entryDetail'])
  })

  it('typed error 归一（code → rpcUiState 三态映射；message 原样）', async () => {
    const { client } = recordingClient(() =>
      Promise.reject(new RpcClientError({ code: 'ERR_ENTRY_NOT_FOUND', message: '条目不存在' })),
    )
    const out = await fetchEntryDetail(client, 'p-1', 999)
    expect(out).toEqual({
      ok: false,
      error: { message: '条目不存在', uiState: 'empty-state' },
    })
  })
})

describe('EntryDrawer（装载壳）', () => {
  it('entryId = null（关闭）→ 不渲染任何节点', () => {
    const markup = renderToStaticMarkup(<EntryDrawer projectId="p-1" entryId={null} onClose={NOOP} />)
    expect(markup).toBe('')
  })

  it('打开首帧（effect 未跑）= 可拖移弹窗壳（头行拖移手柄 + 关闭钮 + 骨架相位——真 dialog 自持皮静态可渲）', () => {
    const markup = renderToStaticMarkup(
      <EntryDrawer projectId="p-1" entryId={7} onClose={NOOP} makeClient={() => {
        throw new Error('静态渲染不应触达 RPC')
      }} />,
    )
    expect(markup).toContain('data-dswf-kn-dialog')
    expect(markup).toContain('data-dswf-kn-dialog-head')
    expect(markup).toContain('data-dswf-kn-dialog-close')
    expect(markup).toContain('data-dswf-kn-dialog-resize')
    expect(markup).toContain('data-dswf-kn-drawer')
    expect(markup).toContain('data-dswf-kn-drawer-skeleton')
    expect(markup).toContain('style')
  })
})

// ───────────────────────── SC-G：dialog 双模式（1.8 knowledge-review-ui） ─────────────────────────

describe('escNextKn（Esc 链式退场——controller 同型纯决策）', () => {
  it('编辑 → 回查看；查看 → 关闭（链式次序锚，不断实现路径）', () => {
    expect(escNextKn('edit')).toBe('back-to-view')
    expect(escNextKn('view')).toBe('close')
  })
})

describe('编辑草稿（controller 同型 draft/errors 纯函数面）', () => {
  it('initialKnEditDraft：四字段自现役 detail 初始化（keywords 拷贝——零共享引用漂移）', () => {
    const draft = initialKnEditDraft(DETAIL)
    expect(draft).toEqual({ title: '安全编码规范', keywords: ['security', 'backend'], summary: '输入校验与输出编码基线', body: DETAIL.body })
    expect(draft.keywords).not.toBe(DETAIL.keywords) // 拷贝非共享引用
  })

  it('validateKnEditDraft：空标题/全空白标题拒收留 dialog；其余放行', () => {
    expect(validateKnEditDraft({ title: '', keywords: [], summary: '', body: '' }).title).toBeDefined()
    expect(validateKnEditDraft({ title: '   ', keywords: [], summary: '', body: '' }).title).toBeDefined()
    expect(validateKnEditDraft({ title: '合规标题', keywords: [], summary: '', body: '' })).toEqual({})
  })
})

describe('关键词 chip 纯函数（G5：双击编辑收口 / ＋ 新增 / ✕ 移除）', () => {
  it('commitKnChip：回值收口 trim 写回；空值收口 = 删除该 chip（含 ＋ 新增空白 chip 取消径）', () => {
    expect(commitKnChip(['a', 'b'], 1, '  新词  ')).toEqual(['a', '新词'])
    expect(commitKnChip(['a', 'b'], 1, '   ')).toEqual(['a'])
    expect(commitKnChip(['a'], 0, '')).toEqual([])
  })

  it('removeKnChip / insertKnChip：移除落位准确；新增 = 追加空白位（供放大态编辑收口）', () => {
    expect(removeKnChip(['a', 'b', 'c'], 1)).toEqual(['a', 'c'])
    expect(insertKnChip(['a'])).toEqual(['a', ''])
    expect(insertKnChip([])).toEqual([''])
  })
})

describe('EntryDrawerHeadActions（G1 标题栏描边钮组——纯渲染）', () => {
  const base = { busy: false, stale: false, onStartEdit: NOOP, onSave: NOOP, onConfirm: NOOP, onReject: NOOP }

  it('查看态 unconfirmed：通过（accent）/ 驳回（error）/ 编辑 + 同组锚；confirmed：仅编辑（驳回入口随态消失）', () => {
    const unconfirmed = renderToStaticMarkup(<EntryDrawerHeadActions {...base} mode="view" status="unconfirmed" />)
    expect(unconfirmed).toContain('data-dswf-kn-dialog-confirm')
    expect(unconfirmed).toContain('data-dswf-kn-dialog-reject')
    expect(unconfirmed).toContain('data-dswf-kn-dialog-edit')
    expect(unconfirmed.indexOf('data-dswf-kn-dialog-confirm')).toBeLessThan(unconfirmed.indexOf('data-dswf-kn-dialog-reject'))
    expect(unconfirmed).toContain('is-accent')
    expect(unconfirmed).toContain('is-error')
    const confirmed = renderToStaticMarkup(<EntryDrawerHeadActions {...base} mode="view" status="confirmed" />)
    expect(confirmed).toContain('data-dswf-kn-dialog-edit')
    expect(confirmed).not.toContain('data-dswf-kn-dialog-confirm')
    expect(confirmed).not.toContain('data-dswf-kn-dialog-reject')
  })

  it('编辑态 = 保存 + 零查看态钮；stale/busy 禁用（防重复提交 + 失靶守卫）', () => {
    const edit = renderToStaticMarkup(<EntryDrawerHeadActions {...base} mode="edit" status="unconfirmed" />)
    expect(edit).toContain('data-dswf-kn-dialog-save')
    expect(edit).not.toContain('data-dswf-kn-dialog-confirm')
    expect(edit).not.toContain('data-dswf-kn-dialog-edit')
    const stale = renderToStaticMarkup(<EntryDrawerHeadActions {...base} mode="view" status="unconfirmed" stale={true} />)
    expect(stale).toContain('disabled')
    const busy = renderToStaticMarkup(<EntryDrawerHeadActions {...base} mode="edit" status="unconfirmed" busy={true} />)
    expect(busy).toContain('disabled')
  })
})

describe('EntryDrawerEditBody（G3 编辑字段面——纯渲染）', () => {
  const DRAFT = initialKnEditDraft(DETAIL)
  const base = { detail: DETAIL, draft: DRAFT, errors: {} as ReturnType<typeof validateKnEditDraft>, busy: false, onChange: NOOP }

  it('首行 = 域（只读）+ 标题（可编辑）同行；随后 关键词 chips（✕ 移除 + ＋ 新增）→ 摘要（3 行）→ 正文（随内容增长）', () => {
    const html = renderToStaticMarkup(<EntryDrawerEditBody {...base} />)
    // 首行：域只读 + 标题输入同行
    expect(html).toContain('data-dswf-kn-edit-domtitle')
    expect(html).toContain('data-dswf-kn-edit-dom')
    expect(html).toContain('readonly')
    expect(html).toContain('data-dswf-kn-edit-title')
    expect(html).toContain('安全编码规范')
    // 关键词 chips：既有 chip + ✕ 移除钮 + ＋ 新增钮
    expect(html).toContain('data-dswf-kn-kwchip="security"')
    expect(html).toContain('data-dswf-kn-kwchip="backend"')
    expect(html).toContain('data-dswf-kn-kwx')
    expect(html).toContain('data-dswf-kn-kwadd')
    // 摘要 = 3 行文本域；正文 = 随内容增长文本域（AutoTextarea 同型——非固定行数）
    expect(html).toContain('data-dswf-kn-edit-summary')
    expect(html).toContain('rows="3"')
    expect(html).toContain('data-dswf-kn-edit-body')
    // 字段序锚：域行 → 关键词 → 摘要 → 正文
    expect(html.indexOf('data-dswf-kn-edit-domtitle')).toBeLessThan(html.indexOf('data-dswf-kn-edit-chips'))
    expect(html.indexOf('data-dswf-kn-edit-chips')).toBeLessThan(html.indexOf('data-dswf-kn-edit-summary'))
    expect(html.indexOf('data-dswf-kn-edit-summary')).toBeLessThan(html.indexOf('data-dswf-kn-edit-body'))
  })

  it('校验错误留 dialog（dswf-dlg-err 同型错误行——dialog 不关、零跳转）', () => {
    const html = renderToStaticMarkup(<EntryDrawerEditBody {...base} errors={{ title: '标题不能为空' }} />)
    expect(html).toContain('data-dswf-kn-dlg-err')
    expect(html).toContain('标题不能为空')
    const clean = renderToStaticMarkup(<EntryDrawerEditBody {...base} />)
    expect(clean).not.toContain('data-dswf-kn-dlg-err')
  })

  it('SC-J J5 编辑态关键词 chip：min-width 140px + 宽随内容自适应（bug 436cc88d 修订口径——overflow visible 断言退役：Chromium UA 对 input 强制 overflow: clip）——CSS 契约', () => {
    const css = readFileSync(new URL('./knowledge.css', import.meta.url), 'utf8')
    const rule = css.match(/\.dswf-kn-kwedit\s*\{[^}]*\}/)
    expect(rule, '.dswf-kn-kwedit 规则应在场').toBeTruthy()
    expect(rule![0]).toContain('min-width: 140px')
    expect(rule![0]).not.toContain('overflow') // platform 限制 bug 436cc88d——overflow 声明退役
    expect(rule![0]).not.toContain('width: auto') // 自适应归组件层测量，CSS 不再持 width 口径
  })

  it('SC-J J5 自适应宽：knKwEditWidth 内容宽钳 min 140px（纯函数）', () => {
    expect(knKwEditWidth(0)).toBe(140)
    expect(knKwEditWidth(80.4)).toBe(140)
    expect(knKwEditWidth(321.6)).toBe(322)
  })

  it('SC-J J5 自适应宽：放大态编辑输入持 min 140px 内联宽（自适应机制在场）', () => {
    const html = renderToStaticMarkup(
      <KnKwEditInput value="" busy={false} onChange={() => {}} onCommit={() => {}} />,
    )
    expect(html).toContain('data-dswf-kn-kwedit')
    expect(html).toContain('width:140px')
  })
})

describe('runEntryMetaEdit / runEntryVerdict（entryAction 执行面——回执归一永不 reject）', () => {
  it('editMeta：载荷 = 恰 1 条 + trim 后四字段；全成功 = ok', async () => {
    const { client, calls } = recordingClient(async () => DETAIL)
    let payload: unknown
    client.knowledge.entryAction = async (req) => {
      payload = req
      return { results: [{ entryId: 7, outcome: 'success' }] } satisfies EntryActionReceipt
    }
    const out = await runEntryMetaEdit(client, 'p-1', 7, initialKnEditDraft(DETAIL))
    expect(out).toEqual({ ok: true })
    expect(calls).toEqual([])
    expect(payload).toEqual({
      projectId: 'p-1',
      action: 'editMeta',
      entryIds: [7],
      title: '安全编码规范',
      keywords: ['security', 'backend'],
      summary: '输入校验与输出编码基线',
      body: DETAIL.body,
    })
  })

  it('editMeta：逐条失败（yaml-invalid）= ok:false + code 分派文案（错误留 dialog）', async () => {
    const { client } = recordingClient(async () => DETAIL)
    client.knowledge.entryAction = async () =>
      ({ results: [{ entryId: 7, outcome: 'failure', code: 'yaml-invalid', message: 'YAML 拒收' }] }) satisfies EntryActionReceipt
    const out = await runEntryMetaEdit(client, 'p-1', 7, initialKnEditDraft(DETAIL))
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.message).toContain('YAML')
  })

  it('editMeta：请求级拒收（typed error）= ok:false + message 原样', async () => {
    const { client } = recordingClient(async () => DETAIL)
    client.knowledge.entryAction = async () =>
      Promise.reject(new RpcClientError({ code: 'ERR_ENTRY_NOT_FOUND', message: 'invalid-request' }))
    const out = await runEntryMetaEdit(client, 'p-1', 7, initialKnEditDraft(DETAIL))
    expect(out).toEqual({ ok: false, message: 'invalid-request' })
  })

  it('verdict：confirm/reject 走同通道单条数组；逐条失败 code 分派、成功 ok', async () => {
    const { client } = recordingClient(async () => DETAIL)
    const seen: unknown[] = []
    client.knowledge.entryAction = async (req) => {
      seen.push(req)
      return { results: [{ entryId: 7, outcome: 'success' }] } satisfies EntryActionReceipt
    }
    expect(await runEntryVerdict(client, 'p-1', 'confirm', 7)).toEqual({ ok: true })
    expect(await runEntryVerdict(client, 'p-1', 'reject', 7)).toEqual({ ok: true })
    expect(seen).toEqual([
      { projectId: 'p-1', action: 'confirm', entryIds: [7] },
      { projectId: 'p-1', action: 'reject', entryIds: [7] },
    ])
    client.knowledge.entryAction = async () =>
      ({ results: [{ entryId: 7, outcome: 'failure', code: 'cas-failed', message: '状态漂移' }] }) satisfies EntryActionReceipt
    const out = await runEntryVerdict(client, 'p-1', 'reject', 7)
    expect(out.ok).toBe(false)
  })
})
