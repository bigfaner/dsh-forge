// CT-NPM-03 零缺席锚收窄自证（bug 47af0d8c · fix-8）——判据实现 forgeBundleAbsenceClues
// （e2e/support/bundle-absence.ts）正反双向验证：
// - 正向：第 5 周期实锚样本（含四件合法 pending 诊断行的 stderr）→ 零真缺席线索 → 判 PASS；
// - 反向：真缺席样本（bundle 未解析/导入失败）→ 真缺席线索非空 → 判 FAIL。
// 实锚样本来源：
// - pending：task_logs plugin-forge-combo/1.6/010-fcombo16e/probe-stderr.txt（第五周期复跑，
//   headless dsh-base CLI 背板——两轮手工探针 + spec 三轮确定性一致）；
// - 真缺席：task_logs plugin-forge-combo/1.6/001-cli-gate/findings.md（bug e4aa1a5f 形态：
//   task-loop import { Peer } 失败 → 1 entry did not activate 非缺席块内非 pending 行）。
// 契约条目 = proposals/plugin-forge-combo/testing/forge-npm-profile-minchain/contracts/contract.md CT-NPM-03（fix-8 修订版）。
import { describe, expect, it } from 'vitest'
import { forgeBundleAbsenceClues } from '../../../e2e/support/bundle-absence.js'

/** 第 5 周期实锚：headless CLI 背板四件合法 pending（等宿主服务）+ 宿主正常运行杂音 */
const LEGAL_PENDING_STDERR = [
  'some boot noise line',
  'dsh: warning: 4 entries did not activate',
  'project (@dsh-forge/project): pending (waiting for service: workspaceRegistry)',
  'task-loop (@dsh-forge/task-loop): pending (waiting for services: webServer, forge.projects, experts)',
  'expert-squad (@dsh-forge/expert-squad): pending (waiting for services: connection, agentPresets)',
  'knowledge (@dsh-forge/knowledge): pending (waiting for services: connection, workspaceRegistry)',
  'more runtime noise',
].join('\r\n')

describe('forgeBundleAbsenceClues（CT-NPM-03 fix-8 收窄判据）', () => {
  it('正向：合法 pending 诊断行判 PASS（零真缺席线索）——第 5 周期实锚样本', () => {
    expect(forgeBundleAbsenceClues(LEGAL_PENDING_STDERR)).toEqual([])
  })

  it('正向：纯 pending + 空块 + 无关文本（web 背板形态漂移不翻转）', () => {
    expect(
      forgeBundleAbsenceClues(
        [
          'dsh: warning: 1 entry did not activate',
          'project (@dsh-forge/project): pending (waiting for services: webServer)',
          '',
          'unrelated warning mentioning @dsh-forge/forge in passing',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('反向：真缺席（bundle 导入失败——did not activate 块内非 pending 行）判 FAIL', () => {
    const stderr = [
      'dsh: warning: 1 entry did not activate',
      'task-loop (@dsh-forge/task-loop): SyntaxError: The requested module "@deepseek-ai/dsh-client-connection" does not provide an export named \'Peer\'',
    ].join('\n')
    const clues = forgeBundleAbsenceClues(stderr)
    expect(clues.length).toBe(1)
    expect(clues[0]).toContain('@dsh-forge/task-loop')
  })

  it('反向：真缺席（bundle 未解析——块外模块解析失败线索）判 FAIL', () => {
    const clues = forgeBundleAbsenceClues("Error: Cannot find module '@dsh-forge/knowledge/client'\n")
    expect(clues.length).toBe(1)
  })

  it('反向：failed to import 独立线索（无 did not activate 块头）判 FAIL', () => {
    const clues = forgeBundleAbsenceClues('task-loop (@dsh-forge/task-loop): failed to import bundle entry\n')
    expect(clues.length).toBe(1)
  })

  it('零缺席干净 stderr → 零线索', () => {
    expect(forgeBundleAbsenceClues('host ready\n')).toEqual([])
  })
})
