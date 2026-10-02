// EntryDrawer 单测 —— UF-6 详情抽屉（AC1 三区 / AC2 正文区不含 frontmatter / AC3 关闭锚 /
// 按需读取 Hard Rule）。渲染面 = renderToStaticMarkup（仓库既有形态）；Esc 捕获序与
// 浏览上下文保持（过滤态不被关闭复位）= 3.8 装配 + 4.2 飞轮 e2e 面（结构 pin 源面接线）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { EntryDetail, EntryDetailQuery } from '@dsh-forge/contracts'
import { RpcClientError } from '../../rpc/errors.js'
import type { ForgeRpcClient } from '../../rpc/index.js'
import { EntryDrawer, EntryDrawerBody, entryMetaRows, fetchEntryDetail } from './EntryDrawer.js'

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
    },
    fs: { listDir: mark('fs.listDir', () => Promise.resolve({})) },
    knowledge: {
      browse: mark('knowledge.browse', () => Promise.resolve([])),
      listEntries: mark('knowledge.listEntries', () => Promise.resolve([])),
      entryDetail: mark('knowledge.entryDetail', (q) => entryDetailImpl(q as EntryDetailQuery)),
      heat: mark('knowledge.heat', () => Promise.resolve(new Map())),
      sessionRecall: mark('knowledge.sessionRecall', () => Promise.resolve([])),
    },
  } as ForgeRpcClient
  return { client, calls }
}

describe('entryMetaRows（两列元数据投影——纯函数）', () => {
  it('五行齐备（域/状态/关键词/作者/更新时间）；关键词独占整行，其余半行', () => {
    const rows = entryMetaRows(DETAIL, NOW)
    expect(rows.map((row) => row.label)).toEqual(['域', '状态', '关键词', '作者', '更新时间'])
    expect(rows.map((row) => [row.key, row.span])).toEqual([
      ['domain', false],
      ['status', false],
      ['keywords', true],
      ['authors', false],
      ['updated', false],
    ])
  })

  it('值口径：域原样 / 空域回退「根」 / authors 缺省「—」 / 更新时间 = 相对时间标签（卡片同口径）', () => {
    const rows = entryMetaRows(DETAIL, NOW)
    expect(rows[0]?.value).toEqual({ kind: 'text', text: '编程/java' })
    expect(rows[3]?.value).toEqual({ kind: 'text', text: 'alice' })
    expect(rows[4]?.value).toEqual({ kind: 'text', text: '3 小时前' })
    expect(rows[1]?.value).toEqual({ kind: 'status', status: 'draft' })
    expect(rows[2]?.value).toEqual({ kind: 'keywords', keywords: ['security', 'backend'] })

    const rootRows = entryMetaRows({ ...DETAIL, domainPath: '', authors: null }, NOW)
    expect(rootRows[0]?.value).toEqual({ kind: 'text', text: '根' })
    expect(rootRows[3]?.value).toEqual({ kind: 'text', text: '—' })
  })
})

describe('EntryDrawerBody（纯渲染——ready 相位）', () => {
  const markup = () => renderToStaticMarkup(<EntryDrawerBody state={READY} onClose={NOOP} retry={NOOP} now={NOW} />)

  it('AC1 三区齐备：摘要块（summary 先行）+ 两列元数据五行 + 正文（MarkdownDoc variant=body）', () => {
    const html = markup()
    // 抽屉壳 + 关闭位（AC3：顶栏行尾 ✕）
    expect(html).toContain('data-dswf-kn-drawer')
    expect(html).toContain('aria-label="知识详情抽屉"')
    expect(html).toContain('data-dswf-kn-drawer-close')
    expect(html).toContain('aria-label="关闭抽屉"')
    // 区一：摘要块（title + summary）
    expect(html).toContain('data-dswf-kn-summary')
    expect(html).toContain('安全编码规范')
    expect(html).toContain('输入校验与输出编码基线')
    // 区二：两列元数据（五行锚）
    expect(html).toContain('data-dswf-kn-meta')
    for (const key of ['domain', 'status', 'keywords', 'authors', 'updated']) {
      expect(html).toContain(`data-dswf-kn-meta-row="${key}"`)
    }
    expect(html).not.toContain('热度') // EntryDetail 无热度字段（抽屉不另调 heat 通道）
    expect(html).toContain('编程/java')
    expect(html).toContain('#security')
    expect(html).toContain('alice')
    expect(html).toContain('3 小时前')
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
})

describe('EntryDrawerBody（纯渲染——loading / error 相位）', () => {
  it('装载中 → 抽屉骨架（无分区内容闪现）', () => {
    const html = renderToStaticMarkup(<EntryDrawerBody state={LOADING} onClose={NOOP} retry={NOOP} />)
    expect(html).toContain('data-dswf-kn-drawer')
    expect(html).toContain('data-dswf-kn-drawer-skeleton')
    expect(html).not.toContain('data-dswf-kn-summary')
    expect(html).not.toContain('data-dswf-kn-body')
  })

  it('error 三态之一 empty-state（ERR_ENTRY_NOT_FOUND/INDEX_STALE/目录非法）→ 不可用空态 + 重试', () => {
    const html = renderToStaticMarkup(
      <EntryDrawerBody
        state={{ phase: 'error', detail: undefined, error: { message: '条目不存在（可能已被移动或删除）', uiState: 'empty-state' } }}
        onClose={NOOP}
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
        onClose={NOOP}
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
        onClose={NOOP}
        retry={NOOP}
      />,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('补偿失败已记账')
  })

  it('状态不变量防御：error 相位无附载 / ready 相位无 detail → 顶栏壳仍在、内容区让空（不炸抽屉）', () => {
    for (const state of [
      { phase: 'error' as const, detail: undefined, error: undefined },
      { phase: 'ready' as const, detail: undefined, error: undefined },
    ]) {
      const html = renderToStaticMarkup(<EntryDrawerBody state={state} onClose={NOOP} retry={NOOP} />)
      expect(html).toContain('data-dswf-kn-drawer')
      expect(html).toContain('data-dswf-kn-drawer-close')
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
  it('entryId = null（关闭）→ 不渲染任何抽屉节点', () => {
    const markup = renderToStaticMarkup(<EntryDrawer projectId="p-1" entryId={null} onClose={NOOP} />)
    expect(markup).toBe('')
  })

  it('打开首帧（effect 未跑）= 抽屉壳 + 骨架相位——详情拉取不阻塞滑入呈现', () => {
    const markup = renderToStaticMarkup(
      <EntryDrawer projectId="p-1" entryId={7} onClose={NOOP} makeClient={() => {
        throw new Error('静态渲染不应触达 RPC')
      }} />,
    )
    expect(markup).toContain('data-dswf-kn-drawer')
    expect(markup).toContain('data-dswf-kn-drawer-skeleton')
  })
})
