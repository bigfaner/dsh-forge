# expert-squad-default-routing 测试树

旅程叙事（gen-journeys 产出，gen-contracts / gen-test-scripts 的输入）：

| journey | risk | 覆盖验收 | golden path |
|---|---|---|---|
| [default-agent-options-panel](default-agent-options-panel/journey.md) | High | AC2（Config 读写闭环：tab 写 → patch id 定向落盘 → volatile 无重启生效） | ✓ |

表面声明：`surface_types: ["web"]`、`surface_keys: ["expert-squad", "host"]`。

e2e spec（gen-test-scripts 产出，新约定树 `tests/<moduleName>/<journey>/`）：

- `tests/expert-squad/default-agent-options-panel/default-agent-options-panel.spec.ts`（Playwright desktop 池，随本旅程启用的新 testDir project）

取证纪律：AC2 为真机取证面——真实官方 settings 域 + 真实 patch 文件落盘 + 同实例 volatile 生效，journey.md 内已逐条声明不可 fake 的边界；dev 形态 patch 路径差异（profile.dev 直链）已如实注记。
