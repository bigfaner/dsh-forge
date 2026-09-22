---
created: "2026-09-22"
author: "task 7 (ui-plugin-foundation)"
status: archived-evidence
---

# 插件包工程模板与第三方走查演示记录(任务 7 / SC5 证据归档)

> 定位:SC5「模板可用」的走查证据归档——按模板文档**从零**新建插件包到官方
> `dsh web` 注入成功的完整链路(第三方视角)。与任务 6 的 live-ui-probe 证据
> 分属不同链路(第三方走查 vs 壳内装配)。全部结论为 **2026-09-22 本机实测**。
> 隐私口径沿任务 3:证据只采集插件自身标记与面板文本,不归档会话标题/正文。

## 1. 交付物与产出方式定夺(AC-1,留档理由)

**交付物**:`packages/templates/plugin`(`@dsh-forge/template-plugin`)——hello-world
的结构沉淀:同文件布局(node 空半身 + client 半身 + contract/store/locales/panel +
tsdown 双面构建 + cordis.patch.yml 根级 insert 行),标识符全部换为模板占位
(`template.panel` / 命名空间 `template` / entry id `template-demo`),注释改写为
「标准姿势教学」(消费姿势 = contract.ts;贡献姿势 = client/index.ts 的
children+store+locale 同注册调用;dsh UI 复用约定 = tsdown.config.ts 的模块表
基线注释 + `--dsh-*` tokens + ui-primitives 优先)。

**产出方式裁定:文档化参照 + 可复制模板目录为主;degit 记为仓公共化后的即插通道。**

理由(候选对照):

| 候选 | 裁定 | 理由 |
|---|---|---|
| 文档化参照 + 可复制目录 | **选中(主形态)** | 零基建、零维护;模板目录随仓/随产品分发皆可用;README 随模板同行,复制即得全部文档;本任务走查即以「复制目录 + README 改名表」跑通全链路(§3),证明该形态自足 |
| degit(`npx degit <repo>/packages/templates/plugin`) | 记为后续通道 | 依赖仓公共可达:本仓 GitHub 远端今日不可匿名拉取(实测 `git ls-remote` 连接重置;仓未公开),无法验证;公共化后 degit 子目录即开即用,README 已记该形态 |
| 脚手架脚本(create-xxx) | 否决 | 脚本本身需要分发通道(npm 发布)与独立维护;提案明确 marketplace/registry 式分发基建记 M2+(Out of Scope);单人产品线建不动第二发布面 |

模板落位 `packages/templates/plugin`:在 pnpm workspace globs 之外
(`packages/*` 仅匹配一层,`packages/plugins/*` 才是插件 glob)——模板保持
纯净复制源(无 node_modules、无构建产物),也不进入 `build:plugins` 过滤器。

## 2. 模板的两处「第一步」与版本纪律(AC-2/AC-3/AC-4 的机器面)

- **依赖安装(peer 声明 npm 形态)**:peer/dev 全部 npm registry exact 形态,
  对齐线 `@deepseek-ai/dsh-client-*` 族 exact `0.1.6-alpha.2` ≡
  `vendor/upstream.lock.json` 的 `desktopHostVersion`;cordis `4.0.2` 独立线单列。
  零 `workspace:`、零仓内 `file:`(任务 4 门禁的 manifest-sources 检查已扩展到
  模板 manifest,机器强制)。
- **装进宿主(engines 式版本兼容声明)**:`engines: { "@deepseek-ai/dsh":
  "0.1.6-alpha.2" }`——VS Code `engines.vscode` 的对应物,声明插件面向的宿主
  版本线,与 peer 线同源同值、同 diff bump。
- **版本戳(任务 4 同源机制)**:`node scripts/verify-plugins.mjs --stamp
  packages/templates/plugin` 生成 `version-stamp.json`(与 hello-world 戳同形)。
  门禁新增模板腿:**模板戳必填**(插件戳可选、模板戳不可缺——流出侧同步必须
  可断言)、engines 声明 exact ≡ `desktopHostVersion`、模板 manifest 同受
  版本对齐 + 来源扫描约束;模板为源码脚手架,**不要求**构建产物(与插件腿的
  artifacts-missing 红灯区分)。上游升级时:模板 peers + engines + 戳 + 断言
  同 diff bump(任务 4 纪律,模板腿已并入 CI 既有 `pnpm verify:plugins` 步骤)。
- **文档(AC-4)**:模板自带 README,面向第三方:两处「第一步」、改名表、
  dist-tag 陷阱明示(禁裸包名/`^`,`latest` 停旧版)、撞键三型语义、升级纪律、
  常见问题(空会话看不到面板、peer WARN 属设计)。全文不要求读者接触本仓
  vendored 树(回归测试断言 README 无 vendored 路径)。

## 3. SC5 走查实录(2026-09-22,第三方视角,从零到注入)

环境:launcher `npx -y @deepseek-ai/dsh@0.1.6-alpha.2`(exact,规避 dist-tag
陷阱);DSH_HOME = 真实 `~/.dsh`;演示目录 = 仓外临时目录
`%TEMP%/sc5-walkthrough/my-plugin`(零仓内引用)。

**命令序列(全按模板 README 执行)**:

```bash
# ① 从零新建:复制模板目录(产出方式主形态)→ 按 README 改名表替换标识符
cp -r <template>/packages/templates/plugin my-plugin && cd my-plugin
#   @dsh-forge/template-plugin → dsh-walkthrough-demo;template.panel → walkthrough.panel;
#   命名空间 template → walkthrough;entry id template-demo → sc5-demo;TemplatePanel → WalkthroughPanel
# ② 第一步(依赖安装,peer 声明 npm 形态)
pnpm install                                   # 全部 exact spec 自 npm registry 解析,2.8s,exit 0
pnpm typecheck && pnpm build && pnpm pack      # tsc 零错;双面产物 lib/index.js + lib/client.js(5.15 kB);tarball 打包
# ③ 全新 profile 自官方 web 模板初始化(零接触既有 profile)
npx -y @deepseek-ai/dsh@0.1.6-alpha.2 sc5-demo --from-default-profile web --no-open
#   → ~/.dsh/profiles/sc5-demo 创建,bundles = [dsh-base, dsh-web-app],loopback 起服
# ④ 第二步(装进宿主,engines 式版本兼容声明随包同行)
npx -y @deepseek-ai/dsh@0.1.6-alpha.2 plugin --profile sc5-demo add ./dsh-walkthrough-demo-0.1.0.tgz
#   → exit 0;peers "missing" WARN(设计内:autoInstallPeers:false,运行时从宿主 boot graph 解析);
#     manifest 被 reconcile 追加第三层 bundles = [dsh-base, dsh-web-app, dsh-walkthrough-demo]
# ⑤ 启动 + 探针
npx -y @deepseek-ai/dsh@0.1.6-alpha.2 sc5-demo --no-open
node scripts/acceptance/dsh-web-probe.mjs --url "<loopback>" --label SC5 --open-session
```

**观察到的结果**:

1. **boot graph**:`__DSH_BOOT__`(rev `61ea64a54ead`,59 entries,官方基线 58 +
   演示插件 1)含 `dsh-walkthrough-demo`——从零新建的插件进入宿主推送的注册图。
2. **面板渲染**:打开历史会话(3 行会话列表,点开首个真实会话)后,完成
   assistant 轮尾渲染面板:标记 `[data-dsh-forge-plugin="sc5-demo"]`,文本
   「你好 — 来自模板新建的 dsh 插件面板 / 打个招呼 / 招呼数:0 / 默认内容:其他
   插件可注册注入此子槽位」——消费向(ui-chat 核心槽)与贡献向(自有子槽位
   默认内容)同时可见,locale 走用户中文环境;空会话首屏无面板(设计内:该槽
   位只在完成 assistant 轮次渲染)。
3. **0 pageerror / 0 console-error**。
4. **零 vendored 引用**(同源机制复核):任务 4 门禁的
   `extractModuleSpecifiers` + `scanArtifactModuleSources` 跑演示包构建产物:
   client.js 模块说明符 = `["@deepseek-ai/dsh-client-store", "react/jsx-runtime"]`
   (均为模块表基线词),对本仓 vendor 树解析违例 **0**;manifest 全部依赖为
   registry exact spec。
5. **零壳代码修改**:走查全程 `git status apps/` = 0 改动(装配走官方 profile
   机制,不触本仓壳配置/壳代码)。

**结论:SC5 PASS**——演示链路覆盖两处「第一步」(② 依赖安装:peer npm 形态
exact 安装;④ 装进宿主:engines 式声明随 tarball 装入 profile 并被 reconcile
自动激活),从零新建到官方 `dsh web` 注入成功,零 vendored 引用、零壳代码修改。

**现场还原(2026-09-22 02:2x)**:`plugin --profile sc5-demo remove
dsh-walkthrough-demo` → manifest 恢复 `[dsh-base, dsh-web-app]`;删除
`~/.dsh/profiles/sc5-demo`(全新 profile,零残留);`~/.dsh/profiles` 恢复
初始集 {headless, node_modules, web};既有 `web` profile 全程未触碰。演示
目录与探针日志(`sc5-probe.log` / `boot*.log`)留档于执行会话临时目录,载荷
行已内联本文。

## 4. 门禁扩展与回归固化

- `scripts/verify-plugins.mjs` 新增模板腿:`discoverTemplates`
  (`packages/templates/*`)、`checkTemplateEngines`(engines 键
  `@deepseek-ai/dsh`,exact ≡ desktopHostVersion)、模板戳必填(缺失红灯 +
  `--stamp` 修复指引)、模板 manifest 并入版本对齐 + manifest-sources 两项检查;
  人读报告新增 `templates:` 行与 template-engines 检查行。单一事实源不变
  (同一模块的 vitest + CLI 双形态,无第二实现)。
- `tests/verify-plugins.spec.ts`:54 用例(原 36 + 新 18)覆盖模板腿全部分支
  (发现/必填戳/过期戳/engines 缺失·非 exact·错配/workspace:^ 与 file: 红灯/
  模板不要求产物/--stamp 盖模板/真实工作区绿灯/模板-hello-world 契约面镜像/
  README 第三方面向契约)。
- CI 接线零新增:模板腿并入既有 `pnpm verify:plugins` 步骤(lint-unit 腿,
  vitest 之前)。

## 5. 上游升级时的同 diff 义务(移交纪律)

上游 pinned SHA 升级(`desktopHostVersion` 变更)时,同一 diff 内:① 各插件
对齐线依赖 bump;② 模板 peers + `engines["@deepseek-ai/dsh"]` bump;③
hello-world 与模板 `--stamp` 重盖;④ README 示例版本号同步——门禁红灯会
逐项点名未同步处(断言即升级提醒,不静默)。
