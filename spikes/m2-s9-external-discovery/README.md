# S9① spike：发现面目录约定对仓外项目的发现率

结论与落点见 `docs/proposals/dsh-forge-m2-pipeline/spikes/s9-external-discovery.md`（本目录 = 可执行扫描器）。

## 运行

```powershell
node spikes\m2-s9-external-discovery\scan.mjs
```

只读扫描 8 个真实仓外目录 + 本仓对照（docs/features / docs/proposals 约定命中 + 文档资产形态对照）。候选目录清单硬编码在脚本头部，换目标仓时改 `roots` 即可。

**总判（2026-10-05）**：约定与旧线 forge 完全同构——经旧 forge 管理的仓 100% 命中（含 manifest 初值源），非 forge 仓 0%（无结构化文档可发现，空态一等）。SC4 仓外 e2e 可依赖真实发现。spike 工件，不得演化为产品结构。
