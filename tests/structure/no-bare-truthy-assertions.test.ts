// 裸真值断言机械锚（结构 pin）——提案 forge-test-pipeline-hardening 方案 5。
// 规则：测试树 *.test.ts / *.test.tsx 禁 expect 调用直接接 toBeTruthy / toBeDefined 弱断言
// （对可精确断言的值只验真值/在场）新增出现；存量违例以 allowlist 如实在案
// （只许缩减、不许新增——新增即红，缩减后应同步收缩 allowlist）。
// 存量违例全量清单归档：任务证据目录（盘点轮 001，108 文件 235 处）。
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')

/** 存量违例 allowlist：文件（/ 分隔，相对仓库根）→ 该文件既有裸弱断言次数（盘点轮 001）。 */
const ALLOWLIST: Record<string, number> = {
  'apps/host/src/boot/boot-spawn-smoke.test.ts': 3,
  'apps/host/src/boot/forge-stream.test.ts': 1,
  'apps/host/src/boot/remote-http-rpc.proxy.test.ts': 1,
  'apps/host/src/boot/worktree-rpc-boot.test.ts': 3,
  'apps/host/src/ipc/projects-rpc.test.ts': 1,
  'apps/host/src/ipc/rpc-envelope.test.ts': 3,
  'apps/host/src/ipc/test-bridge.test.ts': 2,
  'apps/host/src/profile/paths.test.ts': 3,
  'apps/host/src/profile/presets.test.ts': 3,
  'apps/host/src/profile/runtime-packages.test.ts': 1,
  'apps/host/src/tunnel/tunnel.test.ts': 1,
  'apps/web/src/client-plugin/chip-restore.test.ts': 1,
  'apps/web/src/client-plugin/forge-event-node.replay.test.ts': 4,
  'apps/web/src/client-plugin/plugin.test.ts': 12,
  'apps/web/src/views/knowledge/EntryDrawer.test.tsx': 3,
  'apps/web/src/views/knowledge/KnowledgeCardGrid.test.tsx': 1,
  'apps/web/src/views/knowledge/KnowledgeDialogMutateChain.test.tsx': 1,
  'apps/web/src/views/overview/bug-tab/bug-list.test.tsx': 1,
  'apps/web/src/views/overview/drawer/transition-dialog.test.tsx': 4,
  'apps/web/src/views/overview/overview-data.test.ts': 4,
  'apps/web/src/views/overview/proposal-tab/ProposalVerdictDialog.test.tsx': 3,
  'apps/web/src/views/remote/remote-approval-model.test.ts': 1,
  'apps/web/src/views/remote/remote-status.test.ts': 1,
  'apps/web/src/views/remote/remote-transport.test.ts': 2,
  'apps/web/src/workbench/dock-tabs.test.tsx': 1,
  'apps/web/src/workbench/workbench-bridge.test.ts': 1,
  'e2e/support/replay/dogfood-record.test.ts': 2,
  'packages/contracts/src/dto/forge.test.ts': 1,
  'packages/core/src/db/schema.test.ts': 3,
  'packages/core/src/forge/project-service.test.ts': 4,
  'packages/core/src/forge/service-assembly.test.ts': 8,
  'packages/core/src/forge/small-domains/bugs.test.ts': 1,
  'packages/core/src/forge/small-domains/proposals.test.ts': 3,
  'packages/core/src/forge/tasks/submit.test.ts': 1,
  'packages/core/src/forge/tasks/transition.test.ts': 1,
  'packages/core/src/forge/tasks/validate.test.ts': 1,
  'packages/core/src/forge/workspace/discovery.test.ts': 4,
  'packages/core/src/forge/workspace/migrations.test.ts': 1,
  'packages/core/src/forge/workspace/store.test.ts': 1,
  'packages/core/src/index.validity-domain.test.ts': 1,
  'packages/plugin-forge-spec/src/plugin.test.ts': 1,
  'packages/plugin-forge/e2e/dispatch-loop-settlement.test.ts': 4,
  'packages/plugin-forge/src/assembly-recurrence-wiring.test.ts': 1,
  'packages/plugin-forge/src/commands/run-dag-tasks.test.ts': 1,
  'packages/plugin-forge/src/dispatch-core/claim.test.ts': 8,
  'packages/plugin-forge/src/dispatch-core/core.test.ts': 1,
  'packages/plugin-forge/src/dispatch-core/exclusivity.test.ts': 2,
  'packages/plugin-forge/src/dispatch-core/recurrence-faces.test.ts': 1,
  'packages/plugin-forge/src/experts-test-archives.test.ts': 6,
  'packages/plugin-forge/src/faces.test.ts': 1,
  'packages/plugin-forge/src/forge-paths.cordis.test.ts': 1,
  'packages/plugin-forge/src/loop/driver.test.ts': 18,
  'packages/plugin-forge/src/loop/e2e-baseline.test.ts': 2,
  'packages/plugin-forge/src/plugin.test.ts': 6,
  'packages/plugin-forge/src/projection/dispatch-events.test.ts': 3,
  'packages/plugin-forge/src/projection/dispatch-loop.test.ts': 3,
  'packages/plugin-forge/src/spawn/in-process-driver.test.ts': 1,
  'packages/plugin-forge/src/spawn/job-tree.test.ts': 2,
  'packages/plugin-forge/src/spawn/seam.test.ts': 1,
  'packages/plugin-forge/src/tools/dispatch-task.test.ts': 2,
  'packages/plugin-forge/src/tools/query-task.test.ts': 1,
  'packages/plugin-forge/src/tools/record-bug.test.ts': 1,
  'packages/plugin-forge/src/tools/submit-task.test.ts': 1,
  'packages/plugin-forge/src/triage/triage.test.ts': 1,
  'packages/plugins/expert-squad/tests/assemble-tools.test.ts': 2,
  'packages/plugins/expert-squad/tests/assemble.test.ts': 3,
  'packages/plugins/expert-squad/tests/diag-milestone.test.ts': 1,
  'packages/plugins/expert-squad/tests/panel-detail.test.ts': 2,
  'packages/plugins/expert-squad/tests/tools.test.ts': 1,
  'packages/plugins/git-worktree/src/session-attach.test.ts': 2,
  'packages/plugins/git-worktree/src/worktree-ops.test.ts': 1,
  'packages/plugins/input-history/tests/event-source.test.ts': 1,
  'packages/plugins/knowledge/src/integration-selfhosted.test.ts': 1,
  'packages/plugins/knowledge/src/plugin.test.ts': 2,
  'packages/plugins/knowledge/src/service/bm25-search.test.ts': 1,
  'packages/plugins/knowledge/src/service/domain-description.test.ts': 1,
  'packages/plugins/knowledge/src/service/heat.test.ts': 1,
  'packages/plugins/knowledge/src/service/review.test.ts': 3,
  'packages/plugins/knowledge/src/service/service.test.ts': 2,
  'packages/plugins/knowledge/src/storage/migrate.test.ts': 1,
  'packages/plugins/knowledge/src/storage/start.test.ts': 3,
  'packages/plugins/knowledge/src/tools/session.test.ts': 1,
  'packages/plugins/knowledge/src/tools/write.test.ts': 2,
  'packages/plugins/md-mermaid/src/index.test.ts': 1,
  'packages/plugins/quote-reference/tests/client-face.test.ts': 1,
  'packages/plugins/quote-reference/tests/client-scope.test.ts': 2,
  'packages/plugins/quote-reference/tests/selection-menu.test.tsx': 2,
  'packages/plugins/super-composer/tests/data-face.test.tsx': 1,
  'packages/plugins/super-composer/tests/mini-composer-mount.test.ts': 3,
  'tests/contract/pin-04-workspace-registry.test.ts': 1,
  'tests/contract/pin-05-ui-props.test.ts': 1,
  'tests/contract/pin-07-cordis-services.test.ts': 5,
  'tests/contract/pin-11-preset-mirror.test.ts': 1,
  'tests/contract/pin-12-worker-tool-names.test.ts': 2,
  'tests/contract/pin-13-plugin-events.test.ts': 1,
  'tests/contract/pin-16-jobs-log-channel.test.ts': 2,
  'tests/contract/pin-17-cursor-visibility.test.ts': 2,
  'tests/contract/pin-18-mobile-tunnel.test.ts': 1,
  'tests/contract/pin-21-knowledge-entryaction-golden.test.ts': 3,
  'tests/knowledge/distill-integration/distill-integration.test.ts': 1,
  'tests/knowledge/domain-table-lifecycle/domain-table-lifecycle.test.ts': 1,
  'tests/knowledge/global-search-two-tier/global-search-two-tier.test.ts': 1,
  'tests/knowledge/knowledge-isolated-profile-assembly/knowledge-isolated-profile-assembly.test.ts': 1,
  'tests/knowledge/recall-card-turn-summary/recall-card-turn-summary.test.ts': 1,
  'tests/knowledge/write-gateway/write-gateway.test.ts': 3,
  'tests/mobile/chat-stream-recovery-history/chat-stream-recovery-history.test.ts': 2,
  'tests/mobile/pairing-entry-mobile-view/pairing-entry-mobile-view.test.ts': 1,
  'tests/structure/experts-face-alignment.test.ts': 1,
}

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.forge', '.git', 'coverage', 'fixtures', 'userdata.dev'])
// 带消息参数形态已覆盖（expect 第二参 / matcher 实参两种消息位置）；
// .resolves. 形态记录为 LOW 待定，不在本次扩展范围。
const BARE_WEAK = /\bexpect\s*\([^;]*?\)\s*\.\s*(?:toBeTruthy|toBeDefined)\s*\(\s*(?:'[^']*'\s*)?\)/g

/** 反例自验证辅助：对样本字符串跑同一条 scanner 正则，返回命中全文列表。 */
function hitsOf(sample: string): string[] {
  return [...sample.matchAll(BARE_WEAK)].map((m) => m[0]!)
}

function collectTestFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (EXCLUDED_DIRS.has(e.name)) continue
      out.push(...collectTestFiles(join(dir, e.name)))
    } else if (/\.test\.(m?ts|tsx)$/.test(e.name)) {
      out.push(join(dir, e.name))
    }
  }
  return out
}

/** 文件 → 裸弱断言计数与位置明细（超 allowlist 的新增出现即违例）。 */
function scanBareWeakAssertions(): Map<string, { count: number; hits: string[] }> {
  const result = new Map<string, { count: number; hits: string[] }>()
  for (const f of collectTestFiles(ROOT)) {
    const src = readFileSync(f, 'utf8')
    const hits: string[] = []
    for (const m of src.matchAll(BARE_WEAK)) {
      const lineNo = src.slice(0, m.index).split('\n').length
      hits.push(`  ${relative(ROOT, f).split('\\').join('/')}:${lineNo}: ${m[0]}`)
    }
    if (hits.length > 0) result.set(relative(ROOT, f).split('\\').join('/'), { count: hits.length, hits })
  }
  return result
}

describe('裸真值断言机械锚（提案方案 5 —— 弱断言可静态机检形态升机械门）', () => {
  it('测试树无新增裸真值断言（弱断言超出存量 allowlist 即红——allowlist 只许缩减）', () => {
    const scanned = scanBareWeakAssertions()
    const offenders: string[] = []
    for (const [file, { count, hits }] of scanned) {
      const budget = ALLOWLIST[file] ?? 0
      if (count > budget) offenders.push(`${file}: 现状 ${count} > allowlist ${budget}\n${hits.join('\n')}`)
    }
    const unknown = Object.keys(ALLOWLIST).filter((f) => !scanned.has(f))
    expect(
      offenders.length === 0 && unknown.length === 0,
      `新增裸真值断言（须精确断言或入 allowlist 评审）:\n${offenders.join('\n')}` +
        (unknown.length ? `\nallowlist 漂移（文件已无违例，须收缩 allowlist）: ${unknown.join(', ')}` : ''),
    ).toBe(true)
  })

  it('scanner 正则反例自验证：构造违例样本（含带消息参数形态）命中、合规形态不误伤', () => {
    // 样本经片段拼接构造，避免本文件源码自身被 scanner 计为新增违例
    const V = ['toBe', 'Truthy'].join('')
    const D = ['toBe', 'Defined'].join('')
    const msg = ['m', 's', 'g'].join('') // 'msg'
    // 违例样本：命中数 === 1
    const offenders: Array<[string, string]> = [
      ['裸真值（无参）', `expect(a).${V}()`],
      ['带消息参数（expect 第二参）', `expect(a.b, '${msg}').${V}()`],
      ['带消息参数（matcher 实参）', `expect(a).${V}('${msg}')`],
      ['toBeDefined 无参', `expect(x.y).${D}()`],
      ['空白变体', `expect( a , '${msg}' )  .  ${V} ( )`],
    ]
    for (const [label, sample] of offenders) {
      expect(hitsOf(sample), `违例样本未命中：${label}`).toHaveLength(1)
    }
    // 合规样本：命中数 === 0（不误伤精确断言与非 expect 标识）
    const compliant: Array<[string, string]> = [
      ['精确断言 toBe', `expect(a, '${msg}').toBe(true)`],
      ['链式调用间隔非弱断言', `expect(a).toEqual({ b: 1 })`],
      ['同为 toBe 前缀但非 Truthy/Defined', `expect(a).toBeInstanceOf(Error)`],
      ['注释性提及不含完整调用形态', `// 禁 ${V} 弱断言`],
    ]
    for (const [label, sample] of compliant) {
      expect(hitsOf(sample), `合规样本被误伤：${label}`).toHaveLength(0)
    }
  })
})
