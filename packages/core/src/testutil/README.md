# testutil

定位：测试专用支撑件（非生产面）——跨包/跨域测试共用的结构化桩与读取助手单点导出。
fix-34 收编 workspaceRegistry 桩（原五处拷贝行为已分叉）为 `registry-stub.ts` 的
`StubRegistry`（失败注入作 superset 选项：failCreate/failDelete/failList/beforeDelete）。
fix-35 续收编：`project-rows.ts`（forge 两测试 readRows/keyLogs/ProjectRow 行读取同源）
+ `knowledge-corpus.ts`（知识域三测试 fixture/语料（RECALL_CORPUS/BROWSE_CORPUS）/
writeMd/entryIdByTitle/recallLogsOf/keyLogsOf/countingIndexService——生命周期经
disposeKnowledgeCorpus 由各测试文件 afterAll 调用）+ `date-assertions.ts`
（isParseableDateStyle——原 db/forge 两份 ISO 助手同名失真单点化）。

消费口径：core 内测试相对引入；host/knowledge 测试经相对路径引本目录源码
（`*.test.*` 结构豁免同现有 core 源引入惯例——生产面 host/knowledge 禁 import core
的边界不受影响，本目录不进任何生产 import 图）。
