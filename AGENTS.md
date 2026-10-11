# Workspace Conventions

## Commit conventions

- **不要提交过程文件**（用户裁决 2026-10-10）：走查截图、临时取证图、探针脚本输出等过程产物一律不进 git 提交。
  - `.forge/docs/**/*.png` 已被 `.gitignore` 默认忽略——**禁止 force-add**（d32/d35 的 force-add 归档是旧先例，已被本裁决取代）。
  - 过程文件归档到 `.forge/docs/proposals/<slug>/walkthrough/` 等工作区目录即可（留在盘上、留在 git 外），在提交说明里用相对路径引用。
  - 提交只含代码、测试与文档（`.md` 台账/走查记录属文档，可提交）。
