// 本地薄片（退役留切片）。PROVENANCE：主体退役自官方镜像 ui-conversation/src/client/contract/composer-submission.ts
// @ deepseek-harness f059f01ce367748392d8f665c0705fb4302a626b（0.2.0-rc.2，2026-10-22）。
//
// 退役核销（任务 1.5，type-mirror-retirement.md）：
// - 整个 composer-submission 契约不在官方 client 公开导出面 → 无公开承载位；
// - 本地消费面仅 BusyEnterBehavior / InputSubmitMode / ComposerSubmitGesture；
//   MessageSubmission / MessageSubmissionState 本地零消费 → 退役（其 SessionId→string
//   镜像切片随之消失——官方该面绑 @deepseek-ai/dsh-session types，替身无此依赖）；
// - BusyEnterBehavior 正本在 submission-settings.ts（自建支撑件），re-export 保持消费面不变。
/** Composer submission vocabulary shared by the input and settings domains. */

import type { BusyEnterBehavior } from '../submission-settings.js'

export type { BusyEnterBehavior } from '../submission-settings.js'

/** Delivery mode requested for one ordinary composer message. */
export type InputSubmitMode = BusyEnterBehavior

/** Keyboard gesture whose delivery mode the submission policy resolves. */
export type ComposerSubmitGesture = 'enter' | 'accelerated'
