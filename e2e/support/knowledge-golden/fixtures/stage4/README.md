# stage4 golden fixtures（knowledge-stage4-recall-scope · 任务 1.2 契约先行固化）

五通道契约动工前的**零漂移对照基准**：响应形状含 recall 记录扩字段
（`turnSeq` / `triggerSnap` / `contentSnap` / `score` / `scope` / `hint` + `rowId`）与
feedback 动作通道 / 列表查询面 `scopeFilter`。fixture 为**意向锚基线**（非真机录制）——
实现落地后由脚本任务真机录制复核对齐，并回填契约正本的 `last_anchor_sync`。

## 文件清单

| 文件 | 通道 | 锚定形状 |
|---|---|---|
| `sessionRecall.json` | forge:knowledge/sessionRecall | RecallGroup 扩 turnSeq/triggerSnap/contentSnap；RecallGroupHit 扩 rowId/score/scope；query 扩 hint + keywords(legacy) + browse 四键；verb 四值（含 read 的 contentSnap 快照与 legacy 未锚组） |
| `listEntries.json` | forge:knowledge/listEntries | ListEntriesQuery 扩 scopeFilter；KnowledgeCard 扩 scope |
| `listEntries-no-global.json` | forge:knowledge/listEntries | scope 无 global 注册行 → 空数组回执（边界 Outcome） |
| `recallFeedback.json` | forge:knowledge/recallFeedback | 行级 👍 成功回执（第七通道） |
| `recallFeedback/batch-dislike-success.json` | forge:knowledge/recallFeedback | 事件级（同 call_id 批）👎 成功回执 |
| `recallFeedback/note-required.json` | forge:knowledge/recallFeedback | 负反馈缺说明 → 逐行 failure code=note-required |
| `recallFeedback/invalid-feedback.json` | forge:knowledge/recallFeedback | feedback 越界值（2）→ 请求级 rejected-request |

## 契约正本（条目 id 溯源）

- J1：`proposals/knowledge-stage4-recall-scope/testing/global-search-two-tier/contracts/scope-source.md`
- J2：`proposals/knowledge-stage4-recall-scope/testing/recall-card-turn-summary/contracts/recall-record-channel.md`
- J3：`proposals/knowledge-stage4-recall-scope/testing/recall-feedback-loop/contracts/feedback-channel.md`
- J4：`proposals/knowledge-stage4-recall-scope/testing/recall-attribution-degradation/contracts/degradation.md`

形制与比对器沿 `../compare.ts`（结构等价：键集一致、标量值不参与）。
