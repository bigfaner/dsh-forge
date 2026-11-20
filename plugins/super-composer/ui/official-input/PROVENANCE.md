# PROVENANCE —— official-input 复制件清单与漂移政策

## 用户裁决（2026-10-22）

官方 dsh 源码仓库在本地 `Z:\project\github\deepseek-harness`，直接复制官方 composer 源码实现替身**不算 vendor**——1.23「不可复用」结论中的复用禁令被推翻（该结论仅对「npm 公开包 import」成立）。源码复制径经用户裁决放行：**漂移责任自担，升级须人工 re-copy**。

## 版本锚

| 项 | 值 |
|---|---|
| 官方源位 | `packages/client/ui-conversation/src/client/**` @ deepseek-harness |
| 官方版本 | 0.2.0-rc.2 |
| 版本锚 commit | `f059f01ce367748392d8f665c0705fb4302a626b` |
| 复制日期 | 2026-10-22 |
| 复制目标 | `plugins/super-composer/ui/official-input/` |

## rc.5 re-copy 锚（2026-11，任务 1.3/1.4）

| 项 | 值 |
|---|---|
| 源 | `dsh-client-ui-conversation@0.2.2-rc.5` npm pack（对照 deepseek-harness `2c990f0b14fbe870cd6a083c1708b35fd22a7172`） |
| 1.3 re-copy 范围 | `skeleton/ContextMeter.tsx` + `skeleton/ContextMeter.module.css`（官方 rc.5 改 CSS anchor positioning，primitives 0.2.2-rc.5 已删 `useAnchoredPosition`） |
| 1.3 适配 | tsx：imports 重写（UseProjection → `contract/composer-bar.js` 本地镜像、相对 import 去 `.ts` 后缀）；css：原样 |
| 1.4 re-copy 范围 | `skeleton/InputBar.tsx` + `skeleton/InputBar.module.css`（官方 rc.5 大改：claim-decor 退役换 QuoteNode/CommandChip 家族、sending 相、useAccess/paste 路由/retry 主钮；语义漂移清单见 `.forge/docs/proposals/super-composer-migration/inputbar-semantic-drift.md`）+ 编译闭包连带 `input/editor/view-binding.ts`（installDraftKeyboardDismissal 新增、gate `t`→`uploadsHeldText`） |
| 1.4 适配 | InputBar tsx：imports 重写（plan/goal 投影副作用导入维持丢弃、Translate/composer-bar 本地镜像、`../service.ts` → 本地 `service.ts` 镜像、noImplicitAny 标注重放）；css：原样 + 头注。view-binding：imports 重写 + `DRAFT_SUBMITTED_TAG` 同值常量镜像（本地 runtime 为自建 DraftEditorRuntime，提交径不打 tag——该函数替身内恒惰性） |
| 1.4 零漂移核销 | `skeleton/control-row-layout.ts`：rc.2→rc.5 官方零改动（本地仅既有 fail-soft 适配差异），不重拷 |
| 1.4 glue 核对 | `contract/composer-bar.ts` 镜像按 rc.5 InputBar 消费子集更新（新增 `registerFileIntake`/`retry`/`occurrence`/`useAccess`/SessionFacts `openState`+`pendingSubmissions`/uploads `reason`）；`surrogate-composer.tsx` 对应供桩（空 paste 路由、retry undefined、useAccess 恒 undefined、occurrence 'main'）——tsc 编译零断 |
| 1.4 phase 字面量 | `contract/input.ts` 与 `ui/data-face.ts`（InputStateMirror）phase 并集增 `'sending'`；`trackGuardOf('sending')` → `'frozen'`（官方 sending 全冻结口径） |

## 复制清单（逐文件头注同锚）

| 源位（ui-conversation/src 下） | 复制位 | 适配 |
|---|---|---|
| `client/skeleton/InputBar.tsx` | `skeleton/InputBar.tsx` | imports 重写（见下） |
| `client/skeleton/InputBar.module.css` | `skeleton/InputBar.module.css` | 原样（构建期作用域化注入） |
| `client/skeleton/ContextMeter.tsx` | `skeleton/ContextMeter.tsx` | imports 重写（rc.5 re-copy 锚见上节） |
| `client/skeleton/ContextMeter.module.css` | `skeleton/ContextMeter.module.css` | 原样（rc.5 re-copy 锚见上节） |
| `client/skeleton/control-row-layout.ts` | `skeleton/control-row-layout.ts` | 原样 |
| `client/input/submission-policy.ts` | `input/submission-policy.ts` | store/settings 镜像 |
| `client/input/decorations.ts` | `input/decorations.ts` | 原样 |
| `client/service.ts`（仅 `isImageMediaType`，rc.5 InputBar 闭环新增） | `service.ts` | 结构同型镜像（官方整模块不入复制件——ConversationController 域面替身不可达） |
| `client/input/editor/*`（15 文件：DraftEditor、runtime、keymap、view-binding（1.4 re-copy rc.5）、projection、span-map、chip-node、ReferenceChip(.module.css)、claim-decor、text-ref、reference-activation、ComposerContentEditable、DecoratorPortals、composer-editor.module.css） | `input/editor/*` | view-binding：imports 重写 + DRAFT_SUBMITTED_TAG 镜像（rc.5 锚见上节）；其余原样 |
| `client/contract/draft-editor.ts` | `contract/draft-editor.ts` | 1.5 退役留薄片：TokenSpan/ReferenceInsert/ArbitrateKey/ArbitrateOutcome 有官方 client 导出承载位 → 消费点直连官方；薄片仅留未导出的 ComposerKeyboard/EditSelection/Occurrence |
| `client/contract/input.ts` | `contract/input.ts` | 1.5 退役留薄片：机器/事件/触发器/cordis 模块扩增面全量退役（消费点零引用或官方直连）；薄片仅留替身降级域切片（DraftAttachmentId 去 brand、InputState.queue 放宽 unknown、InputActions 无 insertQuote/persistDraft 子集） |
| `client/contract/composer-submission.ts` | `contract/composer-submission.ts` | 1.5 退役留薄片：整契约不在官方导出面；MessageSubmission/MessageSubmissionState 退役（SessionId→string 切片随之消失），薄片仅留 BusyEnterBehavior re-export + InputSubmitMode + ComposerSubmitGesture |
| `client/contract/composer-blocks.ts` | `contract/composer-blocks.ts` | 原样（类型备用） |
| `client/context-occupancy.ts` | `context-occupancy.ts` | token-meter 类型镜像 |
| `client/image-labels.ts` | `image-labels.ts` | 类型镜像 |
| `src/submission-settings.ts` | `submission-settings.ts` | schemastery 面剔除、ConfigForm 镜像 |

本包自建（非复制，服务镜像/对接 contract）：`store.ts`（ObservableSnapshot 改指 @deepseek-ai/dsh-client-store 公开包本体——1.5 镜像退役；SnapshotStore set 薄片 + createSnapshotStore 本地运行实现保留）、`contract/composer-bar.ts`（slots.ts ComposerBarProps 消费子集结构同型）、`contract/translate.ts`（dsh-client-ui-slots Translate 镜像）、`locale.ts`（conversation 命名空间替换身所需键，取自官方 `client/locales.ts` zh 词典）、`surrogate-composer.tsx`（替身装配层——本包胶水）。

## imports 适配政策

- **公开 npm 包直依赖**：`@deepseek-ai/dsh-client-ui-primitives`（0.2.0-rc.2 精确 pin）、`clsx`（2.1.1）、`@deepseek-ai/dsh-client-store`（0.2.2-rc.5——1.5 起类型面直连，运行实现仍本地自持）。
- **lexical / @lexical/\* 外置**：`lexical`、`@lexical/{plain-text,history,utils,text}` 0.49.0 在 bundle external 表（与官方壳层同款版本——防第二份 Lexical 实例，Invalid hook call 判例红线）；react 家族维持既有 external。
- **不可达内部服务面以结构同型镜像承载**：dsh-client-store → `store.ts`、ConfigForm → `submission-settings.ts`、token-meter/slots/attachment 类型 → 本地镜像。跨边界官方面（InputState store、SessionInput、InputTriggerController）一律结构读取，不经镜像类型通道。
- **接口对齐**：`ComposerBarProps` 消费子集见 `contract/composer-bar.ts`；`renderSlot` 由替身装配层给空实现（不申请官方槽位授权）。

## 漂移看护

- 复制件与官方版本锚 commit 写死；官方升级 = **人工 re-copy**（重新对照本清单逐文件复制 + 重放 imports 适配），不做自动同步。
- 逐文件头注携带源位相对路径 + 锚 commit + 日期；复制件内部相对 imports 保持官方目录形状（`skeleton/`、`input/editor/`、`contract/`），re-copy 时可直接覆盖。
- 适配改动一律以 `PROVENANCE 适配` 注释就地标记，re-copy 时据此重放。
