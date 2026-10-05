# S10 spike：canonical path 字符串稳定性（hash8 产物比对）

结论与落点见 `docs/proposals/dsh-forge-m2-pipeline/spikes/s10-path-stability.md`（本目录 = 可执行探针）。

## 运行

```powershell
node spikes\m2-s10-path-stability\probe.mjs
```

自建夹具（`Z:\project\dsh\tmp-redesign\s10\`）+ junction/subst 映射，结束自清理；subst 盘符自动挑空闲字母（X:/Z:/C:/D: 等实盘已占时选 Y:/W:/…）。零依赖（node:crypto + node:fs）。

**总判（2026-10-05）**：js realpath（core canonicalizeDir 现行为）与 native 双口径下，大小写变体 / junction / subst 盘符 / 8.3 短名全部收敛——hash8 稳定，同工作区不裂库。spike 工件，不得演化为产品结构。
