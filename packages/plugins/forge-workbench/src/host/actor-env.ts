/**
 * The FORGE_ACTOR passthrough convention, host half (task 4.2, tech-design
 * Interface 6 + spike-1 §4).
 *
 * FORGE_ACTOR marks task changes as made from a workbench-launched session
 * (Interface 3 判定序 path ①: an actor value starting `session:` resolves to
 * source [会话]; the slot is expected EMPTY in practice until the optional
 * forge-repo change lands, so attribution normally rides path ② 挂接推断 —
 * this injection is a best-effort additive enhancement, never a prerequisite).
 *
 * Carrier (spike-1 §4.2 verdict): dsh has NO per-session process-environment
 * injection face (shell env is process-level, so it cannot distinguish
 * sessions), and the launch chain spawns no forge CLI itself — the session's
 * agent runs the forge commands. The zero-upstream-cooperation carrier is
 * therefore ONE instruction line APPENDED to the injected first user message:
 * the agent prefixes its forge invocations with the assignment, and the shell
 * tool applies it by standard semantics. The prompt body itself is never
 * rewritten — 原文不改写,仅追加 (SC3 byte-faithful injection discipline).
 *
 * Value format: `session:<sessionId>`. tech-design words the value as
 * `session:<linkId>`, which presumes link-first ordering; the success chain
 * records the link only AFTER launch succeeds (task file: 发起成功即经 IPC
 * recordSessionLink), so the session id is the identity available at compose
 * time. The 2.5 judgment consumes either form through the same session_links
 * lookup (session_id column), so the attribution semantics are unchanged.
 */

/** The forge-side convention slot (documented for Interface 6; read by the forge record renderer, optional change). */
export const FORGE_ACTOR_ENV = 'FORGE_ACTOR'

/** Actor value for a workbench-launched session — the `session:` prefix is the form Interface 3 path ① recognizes. */
export function forgeActorValue(sessionId: string): string {
  return `session:${sessionId}`
}

/** The one-line instruction appended after the verbatim prompt (kept a single line: the append discipline stays inspectable). */
function actorInstruction(actorValue: string): string {
  return `[dsh-forge workbench] Attribution: prefix every forge CLI command you run in this session with the environment assignment ${FORGE_ACTOR_ENV}=${actorValue} (example: ${FORGE_ACTOR_ENV}=${actorValue} forge task claim 1.1) so the task changes made here are marked as session-sourced.`
}

/**
 * Compose the session's first user message: the COMPLETE forge prompt output,
 * character-for-character, plus the FORGE_ACTOR attribution line. An empty
 * actor value degrades to the verbatim prompt (defensive no-op — the launch
 * chain always has a session id by compose time).
 */
export function composeFirstUserMessage(promptText: string, actorValue: string): string {
  if (actorValue === '') return promptText
  return `${promptText}\n\n${actorInstruction(actorValue)}`
}
