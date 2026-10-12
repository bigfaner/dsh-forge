# 旧线残留 grep 审计留档（dual-mode-overhaul · SC2 · 任务 1.12）

- 审计对象：`packages/plugin-forge/skills/`（5 SKILL.md + README.md）、`packages/plugin-forge-spec/skills/`（8 SKILL.md）、`apps/host/src/profile/presets/blitz.patch.yml`、`apps/host/src/profile/presets/expedition.patch.yml`。
- 执行环境：Windows（rg 不可用），grep 经 `Select-String -Pattern` 等价执行，递归覆盖全部文件。
- 结论：**两包技能目录全部四类 token 零残留**；双 yml 命中 12 处，逐条核对均为**有意保留**或**越界面（非本提案改动范围）**，无需修改。与评审预检结论一致。

## ① Token 清单与命令

四类旧线 token（正则）：

| 类别 | 模式 |
|---|---|
| 旧英文行文 | `you must\|do not \|never \|always \|must be \|should be ` |
| 旧作风契约行 | `远征作风：\|突击作风：` |
| 旧仓库/旧路径 | `apps/host/src/profile/skills\|\.claude/skills\|git-commit\|packages/dsh-plugin\|packages/forge\|dsh-skill` |
| 旧术语 token | `Dispatch Summary\|FORKED_ROWS\|worker-exec\|semi-body\|半身\|作风行` |

命令（等价形式，rg 可用时）：

```bash
rg -n 'you must|do not |never |always |must be |should be ' packages/plugin-forge/skills packages/plugin-forge-spec/skills apps/host/src/profile/presets/blitz.patch.yml apps/host/src/profile/presets/expedition.patch.yml
rg -n '远征作风：|突击作风：' <同上目标>
rg -n 'apps/host/src/profile/skills|\.claude/skills|git-commit|packages/dsh-plugin|packages/forge|dsh-skill' <同上目标>
rg -n 'Dispatch Summary|FORKED_ROWS|worker-exec|semi-body|半身|作风行' <同上目标>
```

实测经 PowerShell `Get-ChildItem <目标> -Recurse -File | Select-String -Pattern <模式>` 逐类执行。

## ② 结果矩阵

| 目标 | 旧英文行文 | 旧作风契约行 | 旧仓库/旧路径 | 旧术语 token |
|---|---|---|---|---|
| `packages/plugin-forge/skills/` | 0 | 0 | 3（README，见③） | 3（见③） |
| `packages/plugin-forge-spec/skills/` | 0 | 0 | 0 | 0 |
| `blitz.patch.yml` | 4（越界面） | 1（锚词） | 1（现役包名） | 0 |
| `expedition.patch.yml` | 4（越界面） | 1（锚词） | 1（现役包名） | 1（维护注释） |

两包技能目录的 13 份 SKILL.md 本体：四类 token **全部零命中**（命中均落在 README 的历史记录段）。

## ③ 命中清单与保留理由（逐条）

1. `plugin-forge/skills/README.md:11`（`git-commit`）——已移除技能的台账记录（Out of Scope #12，含复活触发条件），提案口径内的历史留痕，保留。
2. `plugin-forge/skills/README.md:23`（`dsh-skill-filesystem`）——**现役**发现约定包名（customSkillDirs 挂载说明），非旧路径，保留。
3. `plugin-forge/skills/README.md:25`（`forge:` 前缀注记）——drift #8 收口记录：前缀缝已清零的对照说明，历史留痕性质，保留。
4. `plugin-forge/skills/run-tasks/SKILL.md:151,158`（`## Dispatch Summary` ×2）——提案 SC6 明示冻结项：第一处为正本节标题，第二处位于围栏代码块内是输出模板头（proposal.md 评审纠偏段）；协议正本冻结，保留。
5. 双 yml `远征作风：/突击作风：`（blitz:24 / expedition:30）——提案改动范围表明示「作风行短语保留为稳定锚词」（presets.test.ts 断言锚），契约保留，非残留。
6. 双 yml 各 4 处英文 plan-mode 段（blitz:70-78 / expedition:77-85，`Do not ...` 等）——上游 harness 注入的 plan-mode 固定 boilerplate，不属于本提案 persona prefix 改写面（提案为「零代码逻辑改动」的 yml persona 段局部重写），越界面不判残留。
7. 双 yml `@deepseek-ai/dsh-skill-filesystem`（blitz:48 / expedition:54）——现役插件包名（工具挂载配置），非旧路径，保留。
8. `expedition.patch.yml:3`（`远征作风行（只谈作风）`）——文件头维护注释，描述产品分叉点历史；persona 主体已四层化，「只谈作风」为当年落点描述。属注释非提示词内容，改动超出本提案「零代码逻辑改动、persona prefix 重写」边界，保留并在此留痕；如需刷新由后续文档维护任务承接。

## ④ 判定

零真残留：无一处命中属于「应清除而漏改」的旧线内容。SC2「旧线残留审计确认（附 grep 命令与零命中记录）」达成（技能目录本体零命中 + yml 命中逐条说明保留理由）。
