# gotcha- 包装官方类实例方法拆出裸调丢 receiver——单测普通对象桩测不出

- Tags: testing, official-mechanics, typescript
- Date: 2026-10-26
- Source: bug 4b89d984 fix 会话（commit 748f2f2e）

## Problem

草稿迁移（beforeOpen 窗调官方 shell 的 `setDraft`）真机必炸：`TypeError: Cannot read properties of undefined (reading 'draftEditor')`，迁移零效果。单测全绿——桩是普通对象字面量，`setDraft: vi.fn()` 不依赖 `this`。

## Root Cause

形状适配面把官方 `SessionInputShell.setDraft` 拆出为独立函数裸调：`const setDraft = record['setDraft']; setDraft(text)`——ESM 严格模式下 `this = undefined`，官方实现 `setDraft(text){ this.draftEditor.setDraft(text) }` 即炸。**普通对象桩方法不读 this，缺陷在单测中不可见**；真机官方 shell 是真类实例才暴露。

## Solution

- 调用保 receiver：`(setDraft as (this: unknown, text: string) => void).call(record, text)`；
- 形状适配抽为可测单源（`resolveDraftShellFace`），回归桩升级 **this 敏感形态**（方法内读写 `this` 态并断言）——桩形态与被测官方对象同构才测得住。

## Reusable Pattern

- **包装官方类实例方法 = 必须 .call/.bind 保 receiver**；解构/提取方法再调用一律视为缺陷；
- **桩必须 this 敏感**：为官方类实例写测试替身时，方法体至少读写一个 `this` 态并在断言中验证（普通 `vi.fn()` 桩对 receiver 类缺陷免疫 = 护栏真空）；
- **真机 fail-soft warn 不是噪音**：fail-soft 捕获的 TypeError 都值得追——它意味着主链成功但伴生链路已断。

## Related Files

- apps/web/src/client-plugin/open-workspace-face-install.ts（resolveDraftShellFace 单源）
- apps/web/src/client-plugin/open-workspace-face-install.test.ts（this 敏感桩形态）
- apps/web/src/client-plugin/plugin.ts（resolveShell 委托）
