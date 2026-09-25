// tests/e2e/stubs/oracle — prompt_hash 逐字符 oracle(任务 6.2 base;SC3 断言机).
//
// The four-check assertion set of spike-3 §4, assembled from the AUTHORITATIVE
// implementations instead of re-derived here:
//   ① sha256(journal.text) === dispatch.prompt_hash        — kernel
//     `checkInjectionOracle` (apps/desktop/.../dispatch/presynth/hash.ts);
//   ② journal.text 以预合成内容逐字节开头(原文不改写)          —同上;
//   ③ 追加行恰好一行(ATTRIBUTION_MARKER 计数 = 1)           —同上;
//   ④ requestId 确定性 = deriveLaunchRequestId(sessionId,
//     journal.text)(重放幂等)— host `dispatch-launch/channel.ts`.
// The e2e side contributes check ④ plus the byte-exact retrieval corpus
// (CRLF / unicode / 行尾空格 / 收尾换行 — the M2 SC2-2 oracle 语料形态).
//
// Consumers: 6.5 (SC3 注入内容断言) and any leg needing journal↔hash parity.

import { ATTRIBUTION_MARKER, checkInjectionOracle, promptHashOf, type InjectionOracleFailure } from '../../../apps/desktop/src/main/workbench/dispatch/presynth/hash.ts'
import { deriveLaunchRequestId } from '../../../packages/plugins/forge-workbench/src/host/dispatch-launch/channel.ts'

/** Oracle failure codes (kernel three + the host-side requestId check). */
export type PromptOracleFailure = InjectionOracleFailure | 'request-id-mismatch'

export interface PromptOracleInput {
  /** The journal's prompt-row `text` — the composed first user message, verbatim. */
  readonly journalText: string
  /** The presynthesized content (the prefix the kernel produced). */
  readonly presynthContent: string
  /** The dispatch row's prompt_hash (SC3's assertion anchor). */
  readonly promptHash: string
  /** The dispatch's pre-minted session id. */
  readonly sessionId: string
  /** The journal row's requestId (omit to skip check ④). */
  readonly requestId?: string
}

export type PromptOracleResult = { readonly ok: true } | { readonly ok: false; readonly failures: readonly PromptOracleFailure[] }

/**
 * The four-check oracle over one journal prompt row. All checks run
 * (failures aggregate — no short-circuit), so a leg reports every drift at
 * once.
 */
export function verifyPromptInjection(input: PromptOracleInput): PromptOracleResult {
  const kernel = checkInjectionOracle({
    journalText: input.journalText,
    presynthContent: input.presynthContent,
    promptHash: input.promptHash,
  })
  const failures: PromptOracleFailure[] = kernel.ok ? [] : [...kernel.failures]
  if (input.requestId !== undefined
    && input.requestId !== deriveLaunchRequestId(input.sessionId, input.journalText)) {
    failures.push('request-id-mismatch')
  }
  return failures.length === 0 ? { ok: true } : { ok: false, failures }
}

/** sha256 of a composed message (re-export of the kernel 口径 for leg convenience). */
export { promptHashOf, ATTRIBUTION_MARKER }

/** Compose a journal-shaped first user message: presynth content + exactly one attribution line. */
export function composeFirstUserMessage(presynthContent: string, sessionId: string): string {
  return `${presynthContent}\n\n${ATTRIBUTION_MARKER} session:${sessionId}\n`
}

/**
 * The adversarial retrieval corpus (M2 SC2-2 oracle 语料形态延续): CRLF,
 * unicode, 行尾空格, 收尾换行 — shapes that would expose any transport-side
 * rewrite. Each entry is a full presynth-content sample; compose + journal +
 * read back must be byte-identical.
 */
export const ORACLE_TEXT_CORPUS: readonly string[] = [
  'plain ascii prompt body',
  'crlf line one\r\nand line two\r\nfinal\r\n',
  'unicode 任务协议 — 注入内容 §三要素 ✓ 中文与 émoji 🎯 混排',
  'trailing spaces stay   \nand tabs\ttoo\n',
  'trailing newline at the very end\n',
  'mixed\r\nunix\nand \r\n crlf\r\nwith 中文标题\n',
]
