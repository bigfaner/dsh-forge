// PROVENANCE: 复制自官方 dsh 源码 ui-conversation/src/client/contract/composer-submission.ts @ deepseek-harness f059f01ce367748392d8f665c0705fb4302a626b（0.2.0-rc.2，2026-10-22）；升级需人工 re-copy，漂移自担。
/** Composer submission vocabulary shared by the input and settings domains. */

import type { BusyEnterBehavior } from '../submission-settings.js'

export type { BusyEnterBehavior } from '../submission-settings.js'

/** Delivery mode requested for one ordinary composer message. */
export type InputSubmitMode = BusyEnterBehavior

/** Keyboard gesture whose delivery mode the submission policy resolves. */
export type ComposerSubmitGesture = 'enter' | 'accelerated'

/** Session facts captured when a message submission starts, before asynchronous command arbitration. */
export interface MessageSubmissionState {
  readonly sessionId?: string
  readonly model?: { readonly provider: string; readonly name: string; readonly effort?: string }
  readonly runMode: 'default' | 'plan' | 'goal'
  readonly running: boolean
}

/** Immutable occurrence and delivery intent carried by one composer attempt. */
export interface MessageSubmission {
  readonly timestamp: number
  readonly source?: 'click' | 'enter'
  readonly mode: InputSubmitMode
  readonly state?: MessageSubmissionState
}
