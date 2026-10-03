# MEMORY.md

- [pnpm/electron install recipe](env-pnpm-electron-install.md) — pnpm 11 skips electron postinstall; allowBuilds template mutation; buffered-pipe false stall
- [forge submit JSON 掩码](env-forge-submit-json-masking.md) — "No input provided" 多为 record.json 解析失败；最小探针法排查；web tsconfig 测试 exclude 失效坑
- [P1 redesign 运行期坑](dsh-forge-p1-redesign-hmr-steer.md) — client-hmr prune 掌舵行(已置停)；快照源闭包绑定；槽位影子 -100；forge:projects/knowledge 通道已实装(4.2)；knowledge 插件绑定缝已落地(bindingsFile)
- [4.2 dogfood 工具挂起(已修复)](dsh-forge-p1-dogfood-tool-hang.md) — fix-1 child 形态落地(bridge/child/run 三件)；顺带修 session v4 文件名/查询掌舵/浏览激活重拉；dogfood 环境坑仍有效
- [vitest 覆盖率表隐藏满覆盖文件](env-vitest-coverage-hidden-files.md) — 文件缺席≠未测量；单文件收窄重跑验证；交互逻辑抽纯函数模块拉覆盖率
- [Node24 rmSync CJK 崩溃 + C盘满](env-node24-rmsync-cjk-crash.md) — 单文件删含汉字名必崩→unlinkSync；TMP 重定向 Z: + VITEST_MAX_WORKERS=4；worktree 无 justfile（tsc -b / pnpm lint 等价）
- [4.1 安装包管线形态与坑](dsh-forge-4-1-installer-pipeline.md) — electron-builder 根级 node_modules 剔除→runtime/ 嵌套;overrides 在 pnpm-workspace.yaml;合成 anchor;junction 断链;host-dist 邻接+装载器;GUI exe 探测法
- [4.3 安装包冒烟形态与坑](dsh-forge-4-3-installer-smoke.md) — NSIS TEMP 盘余量不足=静默 exit 2 零输出(重定向 TEMP);盘根短路径 MAX_PATH;rail 新建会话钮不回跳——composer 芯片流=首装真实入口;慢盘 5s 收敛窗
- [fix-2 标题栏 WCO 形态](dsh-forge-p1-titlebar-wco.md) — hidden+overlay 静态令牌值;ui-theme client.js 令牌提取法(浅/暗 scope);env(titlebar-area) 探针;overlay 右上 ~136×32 盖 dock strip(fix-4 注意)
- [fix-4 dock strip 形态与坑](dsh-forge-p1-dock-strip-fix4.md) — strip 分区/调宽手柄/宽度=CSS var 内态;WCO env 避让配方;探针前必 build:vite;图片分析 CDN 陈旧缓存→像素扫描;SegmentedTabs fr 满宽拉伸 fit-content 收敛
- [p1-mvp 合约事实张力](dsh-forge-p1-mvp-contract-fact-tensions.md) — 召回链口径1vs2(故意缺陷信号)/setFault缺/对账未接线/索引无过期重建/项目页签fixture——eval-contract 前必读
- [p1-mvp e2e 生成纪律](dsh-forge-p1mvp-e2e-disciplines.md) — dismiss 毒化→单 boot 形态；kb 零结果窗 UI 卡死(缺陷信号)；dirRow CJK 拼接边界；转录等值陷阱→账本解码；菜单快照轮询
- [Bash heredoc 吞反斜杠](env-bash-heredoc-backslash.md) — 正则脚本走 Write 落盘,勿走 heredoc(曾致265假阳性)
