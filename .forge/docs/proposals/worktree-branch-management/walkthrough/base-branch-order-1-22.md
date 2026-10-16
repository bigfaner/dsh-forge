# 走查取证：1.22 基准分支选项排序 main > master > default > current > 其余

- 日期：2026-10-17 · 任务：worktree-branch-management/1.22
- 证据：`{forge.task_logs_dir}/1.22/001-base-branch-order/`（base-branch-order.json 行序 + defaults-rpc.json RPC 原值；playwright `_electron` 真宿主 + 真 web dist 实测）

## 改动摘要

| AC | 改动 | 证据 |
|---|---|---|
| 排序 main > master > {default} > {current} > 其余 | 纯函数 `sortBaseBranchOptions` 进 client/model.ts（身份位序表 [main, master, defaultBranch, currentBranch]，命中越靠前位次越高；defaultBranch = branches RPC defaultBranch，currentBranch = 主行 isMain 检出 branch；同级字母序兜底）；消费点 create-worktree-dialog `baseItems`（Fields 新增 defaultBranch/currentBranch props，Dialog 以 mainBranch 透传） | 真机 e2e：夹具仓（develop/main/master/trunk/zeta，default=trunk，current=main）实测行序 `["main","master","trunk","develop","zeta"]` |
| 去重：多身份命中只出现一次 | 排序作用于清单本身（每分支恰一次），多身份取最优先位序 | 单测：default=main、current=main/master 归并不重复；真机 current=main 与固定位归并 |
| 单测直测 | model.test.ts 多身份/去重/空清单/缺省身份/越集 default 六例 | vitest git-worktree 包 131 绿 |
| 门禁 | tsc -b 0 错 / oxlint 改动文件 0 错 | 门禁实测 |

## 备注

- 同级兜底任务内定为**字母序**（大小写不敏感，refs 保守口径同 isCrossBranchRisk/createConflicts）——清单序不保证确定，已落 model 注释。
- slug 分支输入候选排序（1.10 未完成排前）不经本函数，不受影响。
- e2e spec 常驻：`e2e/specs/worktree-base-branch-order.spec.ts`；截图三式（页级/元素级）均未落盘（electron 收尾动画期超时兜底静默），行序以 JSON 取证为准。
