# ingest 收编口径对账（knowledge-stage2-write-gateway/1.6 / 1.10 补注）

存量收编 121 篇的 git 追踪口径（主会话裁定，2026-11 评审问询收口）：

- **65 篇 lessons/examples**：main 未跟踪存量的**首次入库**（收编非新产）——1.6 收编前即以文件形态存在于 `.knowledge/`（不在 git 跟踪面），收编动作 = 幂等回写 frontmatter（id/type/status）+ 入索引，不产生新知识。
- **56 篇**：已跟踪（git 在场）正本的回写——frontmatter 幂等回写后作为既有跟踪文件继续演进。

两径合计 121 篇，与 `slug-id-ledger.md` 台账逐行对账（总篇数 121 / 违规未收编 0）；收编产物明细见 `slug-id-ledger.jsonl` 与 `dual-track.jsonl`。
