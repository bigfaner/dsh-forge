// G3 spec 子 tab 单测 —— AC 覆盖：六态 chips（中文词汇 + 计数 + 0 计数禁用）+ 列表行
// （标题/状态 tag/打开新会话降级安全）+ 展开元数据（slug/档位/Goal·AC/更新/文档区）+
// 失败两支分开（typed 拒绝 = 错误条 + emitDiag 面 error 留痕；ok([]) = 静默空态 + info 留痕）。
// 数据路 = makeSpecsClient 注入替身（forgeSpecs 消费切片同型）。
// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { act } from 'react'
import { installForgeRemoteFace } from '../../rpc.js'
import type { ForgeRpcClient, SpecCardDto, SpecDetailDto } from '../../rpc.js'
import type { DirListing } from '@dsh-forge/contracts'
import {
  SPEC_STATUSES,
  SPEC_STATUS_LABELS,
  SpecStatusChips,
  SpecTab,
  filterSpecsByStatuses,
  specMetaRows,
  specSessionRequest,
  specStatusCounts,
} from './spec-tab.js'
import { overviewSpecsRpcFactory } from './overview-client.js'

/** 目录列举/根锚定消费切片替身（forgeFs.listDir + forgeDirs.facts——ui rpc 消费切片同型） */
function rpcStubOf(opts: { root?: string | null; entries?: DirListing['entries']; failListDir?: boolean }): () => Pick<ForgeRpcClient, 'fs' | 'dirs'> {
  return () => ({
    fs: {
      listDir: () =>
        opts.failListDir === true
          ? Promise.reject(new Error('目录不可达：Z:/ws/.forge/specs/spec-a（ENOENT）'))
          : Promise.resolve<DirListing>({ path: 'Z:/ws/.forge/specs/spec-a', parentPath: 'Z:/ws/.forge/specs', entries: opts.entries ?? [] }),
    },
    dirs: {
      facts: () => Promise.resolve([{ dirKey: 'workspaceRoot', dir: opts.root === undefined ? 'Z:/ws' : opts.root, description: '项目工作区根' }]),
    },
  })
}

function card(partial: Partial<SpecCardDto> & { slug: string }): SpecCardDto {
  return {
    title: `标题 ${partial.slug}`,
    specStatus: 'draft',
    tiers: ['ui'],
    goalCount: 2,
    acCount: 5,
    updatedAt: '2026-11-20T10:00:00.000Z',
    ...partial,
  }
}

const CARDS: readonly SpecCardDto[] = [
  card({ slug: 'spec-a', specStatus: 'draft' }),
  card({ slug: 'spec-b', specStatus: 'in_progress', tiers: [] }),
]

/** forgeSpecs 消费切片替身（list/detail——RpcClientError 同型拒绝用 throw Error 简化，语义同径） */
function specsClientOf(
  list: () => Promise<readonly SpecCardDto[]>,
  detail: (slug: string) => Promise<SpecDetailDto>,
): typeof overviewSpecsRpcFactory {
  return () => ({ list: () => list(), detail: (q) => detail(q.slug) })
}

async function renderSpecTab(props: Partial<Parameters<typeof SpecTab>[0]> = {}): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<SpecTab projectId="p1" {...props} />)
  })
  await act(async () => {
    await Promise.resolve()
  })
  return host
}

describe('specStatusCounts / filterSpecsByStatuses（纯投影）', () => {
  it('六态计数（无参全量行投影）+ 多选并集过滤 + 空激活集 = 全部', () => {
    const counts = specStatusCounts(CARDS)
    expect(counts.draft).toBe(1)
    expect(counts.in_progress).toBe(1)
    expect(counts.completed).toBe(0)
    expect(filterSpecsByStatuses(CARDS, new Set()).length).toBe(2)
    expect(filterSpecsByStatuses(CARDS, new Set(['draft'])).map((c) => c.slug)).toEqual(['spec-a'])
    expect(filterSpecsByStatuses(CARDS, new Set(['draft', 'in_progress'])).length).toBe(2)
  })

  it('specSessionRequest：预填携带标题/slug/状态中文、零 mode、不 autosend', () => {
    const request = specSessionRequest(CARDS[0]!)
    expect(request.mode).toBeUndefined()
    expect(request.autosend).toBeUndefined()
    expect(request.prefill).toContain('spec-a')
    expect(request.prefill).toContain('草稿')
    expect(request.prefill).toContain('我的意图：')
  })

  it('specMetaRows：标识/档位/Goal·AC/更新四行（空档位 = —）', () => {
    const rows = specMetaRows(CARDS[0]!, 1_800_000_000_000)
    expect(rows.map((r) => r.label)).toEqual(['标识', '档位', 'Goal·AC', '更新'])
    expect(specMetaRows(CARDS[1]!, 1_800_000_000_000)[1]!.value).toBe('—')
    expect(specMetaRows(CARDS[0]!, 1_800_000_000_000)[2]!.value).toBe('2 · 5')
  })
})

describe('SpecStatusChips（六态 chips 行）', () => {
  it('六态全呈现（生命周期行序）+ 中文词汇 + 计数', () => {
    const markup = renderToStatic(SpecStatusChips({ counts: specStatusCounts(CARDS), active: new Set(), onToggle: () => {} }))
    const order = SPEC_STATUSES.map((s) => markup.indexOf(`data-dswf-ov-spchip="${s}"`))
    expect(order.every((p) => p >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(markup).toContain('草稿')
    expect(markup).toContain('送审中')
    expect(markup).toContain('已批准')
    expect(markup).toContain('进行中')
    expect(markup).toContain('待验收')
    expect(markup).toContain('已完成')
  })

  it('0 计数 chip disabled + 激活态 aria-pressed + 清过滤/刷新入口', () => {
    const markup = renderToStatic(
      SpecStatusChips({ counts: specStatusCounts(CARDS), active: new Set(['draft']), onToggle: () => {}, onClear: () => {}, onRefresh: () => {}, busy: true }),
    )
    const at = markup.indexOf('data-dswf-ov-spchip="completed"')
    const chip = markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at))
    expect(chip).toContain('disabled')
    const draftAt = markup.indexOf('data-dswf-ov-spchip="draft"')
    const draftChip = markup.slice(markup.lastIndexOf('<button', draftAt), markup.indexOf('</button>', draftAt))
    expect(draftChip).toContain('aria-pressed="true"')
    expect(markup).toContain('data-dswf-ov-spchip-clear')
    expect(markup).toContain('data-dswf-ov-sprefresh')
    expect(markup).toContain('aria-busy="true"')
  })
})

function renderToStatic(node: ReactNode): string {
  return renderToStaticMarkup(node)
}

describe('SpecTab（数据路 + 失败两支分开 + 行形态）', () => {
  afterEach(() => {
    document.body.replaceChildren()
    installForgeRemoteFace(() => undefined, () => {})
  })

  it('ready：chips 行 + 列表行（标题/状态 tag）呈现；打开新会话缺席 = 按钮不呈现（降级安全）', async () => {
    const host = await renderSpecTab({ makeSpecsClient: specsClientOf(async () => CARDS, async () => ({ ...CARDS[0]!, goals: [] })) })
    expect(host.querySelector('[data-dswf-ov-specpage]')).not.toBeNull()
    expect(host.querySelector('[data-dswf-ov-specs]')).not.toBeNull()
    expect(host.querySelector('[data-dswf-ov-spec-parent="spec-a"]')).not.toBeNull()
    expect(host.textContent).toContain('标题 spec-a')
    expect(host.querySelector('[data-dswf-ov-spec-open]')).toBeNull()
    expect(host.querySelector('[data-dswf-ov-spec-error]')).toBeNull()
  })

  it('打开新会话通道在场 → 行头按钮呈现；点击 = spec 预填请求上抛', async () => {
    const onStartSession = vi.fn()
    const host = await renderSpecTab({ makeSpecsClient: specsClientOf(async () => CARDS, async () => ({ ...CARDS[0]!, goals: [] })), onStartSession })
    const button = host.querySelector<HTMLButtonElement>('[data-dswf-ov-spec-open="spec-a"]')
    expect(button).not.toBeNull()
    await act(async () => {
      button!.click()
    })
    expect(onStartSession).toHaveBeenCalledTimes(1)
    expect(onStartSession.mock.calls[0]![0].prefill).toContain('spec-a')
  })

  it('typed 拒绝（spec 插件缺席）→ 错误条 + emitDiag 面 error 留痕（非空态）', async () => {
    const diags: string[] = []
    installForgeRemoteFace(() => undefined, (line) => diags.push(line))
    const host = await renderSpecTab({ makeSpecsClient: specsClientOf(async () => { throw new Error('forgeSpecs 通道不可达') }, async () => ({ ...CARDS[0]!, goals: [] })) })
    expect(host.querySelector('[data-dswf-ov-spec-error]')).not.toBeNull()
    expect(host.textContent).toContain('spec 列表装载失败')
    expect(host.querySelector('[data-dswf-ov-specs]')).toBeNull()
    expect(diags.some((line) => line.includes('typed 拒绝'))).toBe(true)
  })

  it('ok([])（host 半身份未解析 ws null 同径）→ 静默空态（零错误条）+ info 留痕', async () => {
    const diags: string[] = []
    installForgeRemoteFace(() => undefined, (line) => diags.push(line))
    const host = await renderSpecTab({ makeSpecsClient: specsClientOf(async () => [], async () => ({ ...CARDS[0]!, goals: [] })) })
    expect(host.querySelector('[data-dswf-ov-spec-error]')).toBeNull()
    expect(host.textContent).toContain('暂无 spec')
    expect(diags.some((line) => line.includes('空态呈现'))).toBe(true)
  })

  it('展开行：detail 按需装载 → 元数据（标识/档位/Goal·AC/更新）+ 文档区行点击上抛 onOpenDoc', async () => {
    const detail: SpecDetailDto = { ...CARDS[0]!, goals: [{ title: 'g1', acs: [{ criterion: 'c1' }] }], doc: { relPath: '.forge/specs/spec-a/spec.md', dangling: false } }
    const host = await renderSpecTab({
      now: 1_800_000_000_000,
      onOpenDoc: () => {},
      makeSpecsClient: specsClientOf(async () => CARDS, async () => detail),
    })
    const toggle = host.querySelector<HTMLButtonElement>('[data-dswf-ov-spec-toggle="spec-a"]')
    expect(toggle!.getAttribute('aria-expanded')).toBe('false')
    await act(async () => {
      toggle!.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    const meta = host.querySelector('[data-dswf-ov-spec-meta="spec-a"]')
    expect(meta).not.toBeNull()
    expect(meta!.textContent).toContain('spec-a')
    expect(meta!.textContent).toContain('ui')
    expect(meta!.textContent).toContain('2 · 5')
    const docOpen = host.querySelector<HTMLButtonElement>('[data-dswf-ov-spec-doc-open]')
    expect(docOpen?.textContent).toContain('.forge/specs/spec-a/spec.md')
  })

  it('手动刷新：nonce 重取（list 调用次数递增——无 spec-changed 事件缝的兜底入口）', async () => {
    let calls = 0
    const host = await renderSpecTab({ makeSpecsClient: specsClientOf(async () => { calls += 1; return CARDS }, async () => ({ ...CARDS[0]!, goals: [] })) })
    expect(calls).toBe(1)
    const refresh = host.querySelector<HTMLButtonElement>('[data-dswf-ov-sprefresh]')
    expect(refresh).not.toBeNull()
    await act(async () => {
      refresh!.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(calls).toBe(2)
  })

  it('搜索词透传（服务端承载——list 收到 search 参）', async () => {
    const seen: (unknown)[] = []
    const host = await renderSpecTab({
      search: 'demo',
      makeSpecsClient: () => ({
        list: (q) => {
          seen.push({ ...q })
          return Promise.resolve(CARDS)
        },
        detail: () => Promise.resolve({ ...CARDS[0]!, goals: [] }),
      }),
    })
    expect(host.querySelector('[data-dswf-ov-specs]')).not.toBeNull()
    expect(seen[0]).toMatchObject({ projectId: 'p1', search: 'demo' })
  })

  describe('文档区目录列举（1.2——forgeFs.listDir + 格式分流查看通道）', () => {
    const DOC_DETAIL: SpecDetailDto = {
      ...CARDS[0]!,
      goals: [],
      doc: { relPath: '.forge/specs/spec-a/spec.md', dangling: false },
    }

    async function renderWithFiles(opts: { entries?: DirListing['entries']; root?: string | null; failListDir?: boolean } = {}): Promise<HTMLElement> {
      const host = await renderSpecTab({
        makeSpecsClient: specsClientOf(async () => CARDS, async () => DOC_DETAIL),
        makeRpc: rpcStubOf(opts),
        onOpenDoc: () => {},
      })
      const toggle = host.querySelector<HTMLButtonElement>('[data-dswf-ov-spec-toggle="spec-a"]')
      await act(async () => {
        toggle!.click()
      })
      await act(async () => {
        await Promise.resolve()
      })
      await act(async () => {
        await Promise.resolve()
      })
      return host
    }

    it('展开行列举目录其余文件（spec.md 本体过滤）+ 格式 tag 逐行呈现', async () => {
      const host = await renderWithFiles({
        entries: [
          { name: 'spec.md', path: 'Z:/ws/.forge/specs/spec-a/spec.md' },
          { name: 'prototype.html', path: 'Z:/ws/.forge/specs/spec-a/prototype.html' },
          { name: 'notes.txt', path: 'Z:/ws/.forge/specs/spec-a/notes.txt' },
          { name: 'logo.bin', path: 'Z:/ws/.forge/specs/spec-a/logo.bin' },
        ],
      })
      const files = host.querySelector('[data-dswf-ov-spec-files="spec-a"]')
      expect(files).not.toBeNull()
      expect(files!.textContent).not.toContain('spec.md') // 本体行保留既有文档入口，不重复列举
      expect(host.querySelector('[data-dswf-ov-spec-file=".forge/specs/spec-a/prototype.html"]')?.textContent).toContain('HTML')
      expect(host.querySelector('[data-dswf-ov-spec-file=".forge/specs/spec-a/notes.txt"]')?.textContent).toContain('文本')
      expect(host.querySelector('[data-dswf-ov-spec-file=".forge/specs/spec-a/logo.bin"]')?.textContent).toContain('文件')
    })
    it('目录空支（entries: [] → files 区 「—」占位——rpcStubOf 缺省 entries 零成本补，评审 E③）', async () => {
      const host = await renderWithFiles({})
      const files = host.querySelector('[data-dswf-ov-spec-files="spec-a"]')
      expect(files).not.toBeNull()
      expect(files!.querySelector('[data-dswf-ov-spec-files-list]')?.textContent).toBe('—')
      expect(host.querySelector('[data-dswf-ov-spec-file]')).toBeNull()
    })

    it('混合目录形态：文件行 + 子目录行各自呈现、类型 tag 正确（子目录无查看入口）', async () => {
      const host = await renderWithFiles({
        entries: [
          { name: 'design', path: 'Z:/ws/.forge/specs/spec-a/design', kind: 'dir' },
          { name: 'notes.md', path: 'Z:/ws/.forge/specs/spec-a/notes.md', kind: 'file' },
        ],
      })
      const dirRow = host.querySelector('[data-dswf-ov-spec-file=".forge/specs/spec-a/design"]')
      expect(dirRow).not.toBeNull()
      expect(dirRow!.textContent).toContain('目录')
      expect(dirRow!.querySelector('[data-dswf-ov-spec-file-open]')).toBeNull()
      expect(dirRow!.querySelector('[data-dswf-ov-spec-file-external]')).toBeNull()
      const fileRow = host.querySelector('[data-dswf-ov-spec-file=".forge/specs/spec-a/notes.md"]')
      expect(fileRow).not.toBeNull()
      expect(fileRow!.textContent).toContain('Markdown')
      expect(fileRow!.querySelector('[data-dswf-ov-spec-file-open]')).not.toBeNull()
    })

    // 读取路径闭环锚（评审 D 观察②）：文件 rel 由 listDir 所列同一 dirRel 派生
    //（joinSpecFileRel），onOpenDoc 收到的 rel 与 spec-tab 文档行 doc.relPath 同一
    // relPath 空间——docs.read 按该 rel 解析（canonical(forge_dir) 派生同源，见 spec-tab.tsx 判定留痕）。
    it('查看通道不分流：html/图片/无扩展名文件全部 → onOpenDoc（官方渠道按后缀选渲染器）；零 openExternal 入口', async () => {
      const onOpenDoc = vi.fn()
      const host = await renderSpecTab({
        makeSpecsClient: specsClientOf(async () => CARDS, async () => DOC_DETAIL),
        makeRpc: rpcStubOf({
          entries: [
            { name: 'prototype.html', path: 'Z:/ws/.forge/specs/spec-a/prototype.html' },
            { name: 'logo.png', path: 'Z:/ws/.forge/specs/spec-a/logo.png' },
            { name: 'data.bin', path: 'Z:/ws/.forge/specs/spec-a/data.bin' },
          ],
        }),
        onOpenDoc,
      })
      const toggle = host.querySelector<HTMLButtonElement>('[data-dswf-ov-spec-toggle="spec-a"]')
      await act(async () => {
        toggle!.click()
      })
      await act(async () => {
        await Promise.resolve()
      })
      await act(async () => {
        await Promise.resolve()
      })
      expect(host.querySelector('[data-dswf-ov-spec-file=".forge/specs/spec-a/logo.png"]')?.textContent).toContain('图片')
      expect(host.querySelector('[data-dswf-ov-spec-file=".forge/specs/spec-a/data.bin"]')?.textContent).toContain('文件')
      // 每个文件行都是「查看」→ onOpenDoc；不存在另一路入口
      expect(host.querySelector('[data-dswf-ov-spec-file-external]')).toBeNull()
      expect(host.querySelector('[data-dswf-ov-spec-file=".forge/specs/spec-a/logo.png"]')?.textContent).not.toContain('在编辑器中打开')
      for (const rel of ['prototype.html', 'logo.png', 'data.bin']) {
        await act(async () => {
          host.querySelector<HTMLButtonElement>(`[data-dswf-ov-spec-file-open=".forge/specs/spec-a/${rel}"]`)!.click()
        })
      }
      expect(onOpenDoc.mock.calls.map((call) => call[0])).toEqual([
        '.forge/specs/spec-a/prototype.html',
        '.forge/specs/spec-a/logo.png',
        '.forge/specs/spec-a/data.bin',
      ])
    })

    it('源码零 forge:docs/openExternal 依赖（官方宿主无此通道——原回退触发即忘 = 点击无反应）', () => {
      const src = readFileSync(join(import.meta.dirname, 'spec-tab.tsx'), 'utf8')
      expect(src).not.toMatch(/openExternal/)
    })

    it('目录列举失败 = fail-soft 单行降级 + diag 留痕（元数据区不阻断）', async () => {
      const diags: string[] = []
      installForgeRemoteFace(() => undefined, (line) => diags.push(line))
      const host = await renderWithFiles({ failListDir: true })
      expect(host.querySelector('[data-dswf-ov-spec-files="spec-a"]')?.textContent).toContain('目录列举失败')
      expect(host.querySelector('[data-dswf-ov-spec-meta="spec-a"]')).not.toBeNull() // 元数据区照常
      expect(diags.some((line) => line.includes('spec 目录列举失败'))).toBe(true)
    })

    it('workspaceRoot 解析缺席（facts null）= 同 fail-soft 单行降级', async () => {
      const host = await renderWithFiles({ root: null })
      expect(host.querySelector('[data-dswf-ov-spec-files="spec-a"]')?.textContent).toContain('目录列举失败')
    })

    it('悬空 doc = 零目录列举（本体行悬空态现状不动）', async () => {
      const DANGLING: SpecDetailDto = { ...CARDS[0]!, goals: [], doc: { relPath: '.forge/specs/spec-a/spec.md', dangling: true } }
      let listDirCalls = 0
      const host = await renderSpecTab({
        makeSpecsClient: specsClientOf(async () => CARDS, async () => DANGLING),
        makeRpc: () => ({
          fs: { listDir: () => { listDirCalls += 1; return Promise.resolve({ path: '', parentPath: null, entries: [] }) } },
          dirs: { facts: () => Promise.resolve([{ dirKey: 'workspaceRoot', dir: 'Z:/ws', description: '' }]) },
        }),
        onOpenDoc: () => {},
      })
      const toggle = host.querySelector<HTMLButtonElement>('[data-dswf-ov-spec-toggle="spec-a"]')
      await act(async () => {
        toggle!.click()
      })
      await act(async () => {
        await Promise.resolve()
      })
      expect(host.querySelector('[data-dswf-ov-spec-files="spec-a"]')).toBeNull()
      expect(listDirCalls).toBe(0)
    })
  })

  it('子 tab 显示名（1.2）：OVERVIEW_SUBTABS spec 位 label = “Spec”（键与锚不变）', async () => {
    const { OVERVIEW_SUBTABS } = await import('./overview-model.js')
    expect(OVERVIEW_SUBTABS.find((t) => t.value === 'spec')?.label).toBe('Spec')
  })
})

describe('SPEC_STATUS_LABELS（六态封闭）', () => {
  it('六键封闭 + 中文词汇逐键', () => {
    expect(Object.keys(SPEC_STATUS_LABELS).sort()).toEqual([...SPEC_STATUSES].sort())
    expect(SPEC_STATUS_LABELS.awaiting_approval).toBe('送审中')
    expect(SPEC_STATUS_LABELS.awaiting_acceptance).toBe('待验收')
  })
})
