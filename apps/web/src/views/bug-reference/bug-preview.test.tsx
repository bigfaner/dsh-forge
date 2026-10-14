// Bug 台账右栏预览件单测（composer-bug-reference 1.3）：地址编解码 + 发布面形状 +
// 全量投影三分支（fixed 证据区 / unresolved 原因 / open 零证据区）+ 现查在途/缺省态 +
// 地址同源 pin（plugin.ts BUG_* 字面量镜像——bundle 自含不经 import，测试面跨树 pin）。
// renderToStaticMarkup 零 effect 同全仓口径——现查链的异步落点归 e2e（组件体 loading
// 初态静态可见；ready/缺省态经导出投影子件静态直测）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BugCard } from '@dsh-forge/contracts'
import type { RpcClientFactory } from '../../rpc/index.js'
import {
  BugPreviewReady,
  BugPreviewUnavailable,
  DSWF_BUG_ADDRESS_PREFIX,
  DSWF_BUG_TAB_KIND,
  ForgeBugPreview,
  forgeBugAddress,
  parseForgeBugAddress,
} from './BugPreview.js'
import { BUG_ADDRESS_PREFIX as PLUGIN_BUG_ADDRESS_PREFIX, BUG_TAB_KIND as PLUGIN_BUG_TAB_KIND } from '../../client-plugin/plugin.js'

const NOW = '2026-10-14T00:00:00.000Z'

function bugCard(overrides: Partial<BugCard> = {}): BugCard {
  return {
    bugId: 'b-42',
    summary: '修复后段一目录选取双开对话框',
    bugDesc: 'NativePick 在途态守卫缺失。',
    triggerDesc: '对话框在途时再次快速单击同钮。',
    expected: '恒至多一个对话框。',
    actual: '连开两个对话框。',
    bugStatus: 'open',
    reporter: 'faner',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

/** fake useTabInfo 钩子（seat inject 递达物替身——contentId 定向注入） */
function fakeTabInfo(contentId: string): () => { tab: { kind: string; contentId: string } } {
  return () => ({ tab: { kind: DSWF_BUG_TAB_KIND, contentId } })
}

describe('Bug 台账地址编解码（dswf-doc 同构）', () => {
  it('forgeBugAddress/parseForgeBugAddress 往返：前缀 + <projectId>/<bugId>；去重键 = 地址本身', () => {
    expect(DSWF_BUG_TAB_KIND).toBe('dswf-bug')
    expect(DSWF_BUG_ADDRESS_PREFIX).toBe('dsh-resource://dswf-bug/')
    const address = forgeBugAddress('p1', 'b-42')
    expect(address).toBe('dsh-resource://dswf-bug/p1/b-42')
    expect(parseForgeBugAddress(address)).toEqual({ projectId: 'p1', bugId: 'b-42' })
  })

  it('形状非法 → null：前缀外 / 缺 bugId 段 / 缺 projectId 段', () => {
    expect(parseForgeBugAddress('dsh-resource://dswf-doc/p1/a.md')).toBeNull()
    expect(parseForgeBugAddress('dsh-resource://dswf-bug/p1/')).toBeNull()
    expect(parseForgeBugAddress('dsh-resource://dswf-bug//b-42')).toBeNull()
    expect(parseForgeBugAddress('dsh-resource://dswf-bug/p1')).toBeNull()
  })

  it('字面量同源 pin（bundle 自含不经 import）：kind 与地址前缀 = plugin.ts 常量镜像', () => {
    expect(PLUGIN_BUG_TAB_KIND).toBe(DSWF_BUG_TAB_KIND)
    expect(PLUGIN_BUG_ADDRESS_PREFIX).toBe(DSWF_BUG_ADDRESS_PREFIX)
  })
})

describe('ForgeBugPreview tab body（keyed 占用者形状）', () => {
  const pendingClient: RpcClientFactory = () =>
    new Promise<never>(() => {}) as unknown as ReturnType<RpcClientFactory>

  it('useTabInfo 缺席（非壳载体/SSR）= null；在场 = 现查初态（loading 锚——openReference 时点现查链启动）', () => {
    expect(renderToStaticMarkup(<ForgeBugPreview />)).toBe('')
    const markup = renderToStaticMarkup(<ForgeBugPreview useTabInfo={fakeTabInfo(forgeBugAddress('p1', 'b-42'))} makeClient={pendingClient} />)
    expect(markup).toContain('data-dswf-br-loading')
    expect(markup).toContain('加载中')
  })

  it('地址形状非法（持久化布局携带陈旧地址等）= 占位空态不炸 tab', () => {
    const markup = renderToStaticMarkup(<ForgeBugPreview useTabInfo={fakeTabInfo('dsh-resource://dswf-bug/garbage')} makeClient={pendingClient} />)
    expect(markup).toContain('data-dswf-br-invalid')
  })
})

describe('BugPreviewReady 全量投影三分支', () => {
  it('open 态：五字段 kv 区 + 状态徽标 + suspected；零证据区锚（open 无证据分支）', () => {
    const markup = renderToStaticMarkup(<BugPreviewReady bug={bugCard({ suspected: 'apps/web/src/flows/add-project/browser-actions.ts:120', errorType: 'concurrency' })} />)
    expect(markup).toContain('data-dswf-br-id="b-42"')
    expect(markup).toContain('data-dswf-br-summary')
    expect(markup).toContain('修复后段一目录选取双开对话框')
    expect(markup).toContain('data-dswf-br-status="open"')
    expect(markup).toContain('data-dswf-br-type="concurrency"')
    for (const key of ['bug', 'trigger', 'expected', 'actual', 'suspected']) {
      expect(markup).toContain(`data-dswf-br-kv="${key}"`)
    }
    expect(markup).toContain('browser-actions.ts:120')
    expect(markup).not.toContain('data-dswf-br-evidence')
    expect(markup).not.toContain('data-dswf-br-unresolved')
  })

  it('fixed 态：修复证据区 = commit/worktree/branch（缺席段不添键）', () => {
    const markup = renderToStaticMarkup(
      <BugPreviewReady bug={bugCard({ bugStatus: 'fixed', commitHash: 'c2793855', branch: 'fix/one', worktree: 'Z:/wt' })} />,
    )
    expect(markup).toContain('data-dswf-br-evidence')
    expect(markup).toContain('commit c2793855')
    expect(markup).toContain('branch fix/one')
    expect(markup).toContain('worktree Z:/wt')
  })

  it('unresolved 态：未修原因分支（原因缺席 = 行不呈现）；证据区零锚', () => {
    const withReason = renderToStaticMarkup(<BugPreviewReady bug={bugCard({ bugStatus: 'unresolved', unresolvedReason: '3 次修不好，跨文件重构阻塞' })} />)
    expect(withReason).toContain('data-dswf-br-unresolved')
    expect(withReason).toContain('3 次修不好')
    expect(withReason).not.toContain('data-dswf-br-evidence')
    const noReason = renderToStaticMarkup(<BugPreviewReady bug={bugCard({ bugStatus: 'unresolved' })} />)
    expect(noReason).not.toContain('data-dswf-br-unresolved')
  })
})

describe('BugPreviewUnavailable 缺省态（查询失败/未命中不崩溃）', () => {
  it('查询失败 = 台账暂不可用 + 查询失败文案；未命中 = 清理文案；两者零崩溃渲染', () => {
    const failed = renderToStaticMarkup(<BugPreviewUnavailable missing={false} />)
    expect(failed).toContain('data-dswf-br-error')
    expect(failed).toContain('台账暂不可用')
    const missing = renderToStaticMarkup(<BugPreviewUnavailable missing={true} />)
    expect(missing).toContain('data-dswf-br-error')
    expect(missing).toContain('已被清理')
  })
})
