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
| 复制目标 | `packages/plugins/super-composer/src/client/official-input/` |

## 复制清单（逐文件头注同锚）

| 源位（ui-conversation/src 下） | 复制位 | 适配 |
|---|---|---|
| `client/skeleton/InputBar.tsx` | `skeleton/InputBar.tsx` | imports 重写（见下） |
| `client/skeleton/InputBar.module.css` | `skeleton/InputBar.module.css` | 原样（构建期作用域化注入） |
| `client/skeleton/ContextMeter.tsx` | `skeleton/ContextMeter.tsx` | imports 重写 |
| `client/skeleton/ContextMeter.module.css` | `skeleton/ContextMeter.module.css` | 原样 |
| `client/skeleton/control-row-layout.ts` | `skeleton/control-row-layout.ts` | 原样 |
| `client/input/submission-policy.ts` | `input/submission-policy.ts` | store/settings 镜像 |
| `client/input/decorations.ts` | `input/decorations.ts` | 原样 |
| `client/input/editor/*`（15 文件：DraftEditor、runtime、keymap、view-binding、projection、span-map、chip-node、ReferenceChip(.module.css)、claim-decor、text-ref、reference-activation、ComposerContentEditable、DecoratorPortals、composer-editor.module.css） | `input/editor/*` | 原样 |
| `client/contract/draft-editor.ts` | `contract/draft-editor.ts` | 原样 |
| `client/contract/input.ts` | `contract/input.ts` | InboxState/Branded/store 镜像 |
| `client/contract/composer-submission.ts` | `contract/composer-submission.ts` | dsh-session/types SessionId→string |
| `client/contract/composer-blocks.ts` | `contract/composer-blocks.ts` | 原样（类型备用） |
| `client/context-occupancy.ts` | `context-occupancy.ts` | token-meter 类型镜像 |
| `client/image-labels.ts` | `image-labels.ts` | 类型镜像 |
| `src/submission-settings.ts` | `submission-settings.ts` | schemastery 面剔除、ConfigForm 镜像 |

本包自建（非复制，服务镜像/对接 contract）：`store.ts`（dsh-client-store 结构镜像）、`contract/composer-bar.ts`（slots.ts ComposerBarProps 消费子集结构同型）、`contract/translate.ts`（dsh-client-ui-slots Translate 镜像）、`locale.ts`（conversation 命名空间替换身所需键，取自官方 `client/locales.ts` zh 词典）、`surrogate-composer.tsx`（替身装配层——本包胶水）。

## imports 适配政策

- **公开 npm 包直依赖**：`@deepseek-ai/dsh-client-ui-primitives`（0.2.0-rc.2 精确 pin）、`clsx`（2.1.1）。
- **lexical / @lexical/\* 外置**：`lexical`、`@lexical/{plain-text,history,utils,text}` 0.49.0 在 bundle external 表（与官方壳层同款版本——防第二份 Lexical 实例，Invalid hook call 判例红线）；react 家族维持既有 external。
- **不可达内部服务面以结构同型镜像承载**：dsh-client-store → `store.ts`、ConfigForm → `submission-settings.ts`、token-meter/slots/attachment 类型 → 本地镜像。跨边界官方面（InputState store、SessionInput、InputTriggerController）一律结构读取，不经镜像类型通道。
- **接口对齐**：`ComposerBarProps` 消费子集见 `contract/composer-bar.ts`；`renderSlot` 由替身装配层给空实现（不申请官方槽位授权）。

## 漂移看护

- 复制件与官方版本锚 commit 写死；官方升级 = **人工 re-copy**（重新对照本清单逐文件复制 + 重放 imports 适配），不做自动同步。
- 逐文件头注携带源位相对路径 + 锚 commit + 日期；复制件内部相对 imports 保持官方目录形状（`skeleton/`、`input/editor/`、`contract/`），re-copy 时可直接覆盖。
- 适配改动一律以 `PROVENANCE 适配` 注释就地标记，re-copy 时据此重放。
