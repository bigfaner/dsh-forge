# testutil

定位：测试专用支撑件（非生产面）——跨包测试共用的结构化桩单点导出。fix-34 收编
workspaceRegistry 桩（原五处拷贝行为已分叉）为 `registry-stub.ts` 的 `StubRegistry`
（失败注入作 superset 选项：failCreate/failDelete/failList/beforeDelete）。

消费口径：core 内测试相对引入；host/knowledge 测试经相对路径引本目录源码
（`*.test.*` 结构豁免同现有 core 源引入惯例——生产面 host/knowledge 禁 import core
的边界不受影响，本目录不进任何生产 import 图）。
