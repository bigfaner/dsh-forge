# db/ 兼容面（plugin-project 1.7 归并锚）

openDatabase / transaction / db errors / schema 迁移整套装件已 git mv 迁入
`lib/db/src/`（`@dsh-forge/lib-db`），本目录仅保留 `index.ts` re-export 兼容面
（core 内部 `./db/index.js` import 面零改动）。本体与测试在新包内维护；
退役收口（core 兼容面删除 + 消费方直改 lib-db）另有任务。

迁移纪律正本不变：`docs/conventions/db-migrations.md`。
