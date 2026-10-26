# gotcha- 套件全绿 ≠ 缺陷不在场——替身注入层错位与桩不敏感的虚假通过

- Tags: testing, anti-pattern
- Date: 2026-10-26
- Source: bug 4b89d984 fix 会话（commit 748f2f2e）

## Problem

草稿迁移真机必炸（官方 shell 方法裸调丢 receiver），但单测套件全程绿灯：installer 测试 5/5 通过、后续 this 敏感桩改造首轮也「5 passed」。缺陷在盘上、真机可复现，测试却给出「已覆盖」的假象。

## Root Cause

虚假通过两源叠加：

1. **替身注入层与缺陷层错位**：installer 测试自注 `resolveShell` 替身——它测的是安装器契约面；而缺陷藏在 plugin.ts apply 闭包里的内联适配函数（unbound 调用）中，该代码**没有任何测试可达**。替身注入点替掉了被测路径，绿的是替身不是产品码；
2. **桩形态不敏感**：`vi.fn()` 桩对 receiver/协议类缺陷免疫——方法不读 `this`、不校验调用形状，产品码怎么错桩都配合。

## Solution

- 内联在 apply 闭包里的适配逻辑**抽为导出纯函数**（`resolveDraftShellFace`）——可测性先于实现；不可测 = 不可绿 = 虚假通过的温床；
- 替身注入点必须落在**缺陷所在层**：测形状适配就传真 ctx/会话链路进真实函数，让产品码自己跑、桩只替最外缘（fs/网络）；
- 桩形态与官方对象同构：this 敏感方法（`this._seed` 读写 + 断言）——先对带缺陷实现跑出红，再落修复转绿（本次 `.call` 修复前该测试真实红过一次，红点即证据）。

## Reusable Pattern

- **绿的唯一含义 = 「被测路径上断言成立」**；评审问句不是「有没有测试」而是「缺陷若在场，哪条断言会红」——答不出 = 该缺陷无测试覆盖，已有绿是虚假通过；
- **替身替到外缘，产品码跑全程**：注入点越靠近被测函数，替身越不可能替掉缺陷路径；
- **验收规则**：修 receiver/协议类缺陷，回归测试必须先在旧实现上红一次——直接写完就绿 = 桩不敏感，改桩形态重跑。

## Related Files

- apps/web/src/client-plugin/open-workspace-face-install.ts（resolveDraftShellFace——抽出的可测单源）
- apps/web/src/client-plugin/open-workspace-face-install.test.ts（this 敏感桩形态）
- docs/lessons/gotcha-unbound-official-method-receiver.md（缺陷本体）
