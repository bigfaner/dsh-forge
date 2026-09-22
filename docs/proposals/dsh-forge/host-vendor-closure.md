# 壳侧 vendored 闭包:解剖、理由与替代路线讨论

> 日期:2026-09-22 · 性质:**讨论记录,未构成裁决**(现状维持 vendored 投影路线)
> 缘起:hello-world 默认下线(`9ed862c`)后,围绕 `packages/desktop-host-vendor` 的存在必要性、npm 拉取替代方案、自建宿主 entry 的连续讨论。
> 姊妹篇:[ui-plugin-vendor-free.md](./ui-plugin-vendor-free.md)(插件侧零 vendored 引用);M1 原始裁决见 [decisions/dependencies.md](../../decisions/dependencies.md) 首两行。

## 1. vendored 树是什么(实测)

`packages/desktop-host-vendor/vendored/` = 上游 deepseek-harness @ pinned SHA `c36ba648` 的定点**源码投影**(非整树拷贝,见 M1 裁决):

| 维度 | 实测值 |
|------|--------|
| 磁盘体积 | 397M(含 gitignored 本地产物:`lib/`、闭包安装输出) |
| package.json 数 | 624(workspace 包 + apps + `.closure-supplements/`) |
| git 追踪文件 | 2228(≈ lock 2222 条 sha256 + 适配层文件) |
| 锁定 | `vendor/upstream.lock.json`:pinnedSha + 2222 条逐文件 sha256;CI 从 SHA 重投影校验 |

目录构成:`apps/`(desktop-host 入口、web 前端)、`packages/`(上游 workspace 包本体)、`native/`(4 平台 addon)、`.closure-supplements/`(投影补漏兜底)、`patches/`、生成的 `pnpm-{lock,workspace}.yaml`(gitignored)。

**运行时链路**(真实 profile 实测):

```
repo vendored 树(唯一字节来源)
  → 启动对账/闭包安装 播种 → <profile>/.dsh-module-fallback/node_modules/**(实体)
                              ↑ 符号链接
               <profile>/node_modules/@deepseek-ai/*  →  宿主加载
```

**打包链路**:`electron-builder` `extraResources` 把 staging 的 `runtime/**`(85MB 内置 Node)+ `vendor/**`(vendored 投影)打进安装包 —— **闭包字节无论如何都在包内**,换拉取来源不改变安装包体积。

## 2. 为什么 vendor 而不是 npm

### 2.1 通道区分(讨论中澄清的关键混淆)

npm 只出现在三个环节,**都不是壳侧运行期**:

| 环节 | 谁在用 | 环境 |
|------|--------|------|
| 官方 `dsh` 装插件(`plugin add`)/官方 web 自装 | 上游 CLI | 官方环境,有网络 |
| 插件依赖**声明形态**(peer 声明 npm 形态、exact 对齐线) | 声明语义 | 保证插件在官方环境可装 |
| 构建/开发期依赖 | pnpm install | 构建期 |

被 spike(ui-plugin-foundation §4.2)否决的是「**用户机器首启时** npm 物化」——首启碰 registry,违反离线自足 NFR(dead-proxy boot 是验收腿)。**打包期 npm 拉取并不违反离线首启**(字节已在包内);它真正的问题是 §2.2。

### 2.2 三个硬理由

1. **宿主本体不在 npm**:`@deepseek-ai/dsh-desktop-host` 是闭包 228 个 workspace 包/app 中唯一 `private: true` 的,从未发布 —— 而它恰是壳拉起的宿主入口(§3)。
2. **SHA 精确复现 vs registry 漂移**:对齐线 `0.1.6-alpha.2`(alpha),投影锚定 git SHA + 2222 条 sha256;registry 的 dist-tag/`^` 解析使构建不可复现 —— 版本门禁对插件禁裸包名/`^` 的同款理由,宿主本体更严。
3. **闭包完整性**:`workspace:^` 声明(见 §3)dsh-base 的 88 个依赖全部指向上游 monorepo 源;pinned SHA 树可含未发布修复,registry 只有已发布集合。

## 3. dsh-desktop-host 的作用:薄适配层,不是引擎

整个包 **5 文件 ~350 行**,自述「Launch the Desktop profile through the Web application and report its URL to Electron」:

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/index.ts` | ~135 | 入口:调用**已发布包** `@deepseek-ai/dsh` 的 `runProfile` 以 desktop profile 起 web 应用(端口 19387);installAnchor 解析锚;`resolutionMode: link|runtime`(即「两锚解析」);父子 IPC —— 报 URL、收 `shutdown`/`update-tasks`、回 `shutdown-complete` |
| `primary-runtime.ts` | 134 | Desktop 捆绑脚本依赖的离线安装与绝对路径 |
| `office.ts` | 26 | Office skills 组合挂载(见 §4) |
| `update-tasks.ts` | 51 | 安装准入/任务检查(cordis) |
| `workspace-dependencies.ts` | 54 | 捆绑解释器暴露,不改命令解析 |

**引擎本体全在 `packages/**`**:`runProfile`、dsh-base 闭包(88 个 `workspace:^` 依赖,实测 `packages/bundle/base/package.json`)、webserver、cordis。壳侧接线:`apps/desktop/src/main/host-supervisor` spawn 该 entry;打包门禁 `assemble-app-resources.mjs:104` 硬性要求其 `src/index.ts` 在位。

## 4. Office skills:是什么、必须吗

上游为 Desktop profile 捆绑的**离线 Office 文档创作技能**:`office-docx/pptx/xlsx` 三个 SKILL(资产 ~20KB)+ 捆绑解释器(`workspace-dependencies` + `primary-runtime` 离线装进 `$DSH_HOME/dsh-runtimes/`)。挂载点 `desktop-host/src/index.ts:69`:boot 后、`ready` 前无条件 `ctx.plugin(desktopOffice)`。

两层必须性:

- **对当前 vendored entry:硬启动件**——此处失败 = 宿主启动失败;壳侧 `projectHostProfile({officeSkillsSource})` 同样列为 hard requirement(打包态固定指向 `vendored/packages/skill/skill-office/assets`)。
- **对宿主引擎:非必需**——是 Desktop profile 的组合选择,不调它 `runProfile` 照常起。

**判断**:属「通用办公助手」能力,与 SDD 工作台核心场景关系不大;自建 entry 路线下是最自然的第一刀裁剪项,vendored 路线下随闭包而来、不必处理。

## 5. 替代路线:自建 entry + npm 依赖(原始构想评估)

**构想**:依赖除 dsh-desktop-host 之外的全部包(npm 拉取),自建 desktop 宿主 entry。

**可行性比直觉高**的证据:

- desktop-host 本就是 ~350 行适配层,核心 = 调已发布的 `@deepseek-ai/dsh` `runProfile` + 说 IPC 协议(壳侧 host-supervisor 本来就拥有协议另一端);
- 闭包发布性有实证:官方 CLI 创建 profile 即走 npm 物化(profile 内 `.dsh-module-fallback` 正是 upstream 的 npm 物化机制);
- 自建后 §2.2-1(private 包)阻塞消失。

**代价**:

1. 隐性语义接盘:primary-runtime、office skills、update-tasks 协议 —— 重实现或明确放弃;
2. 验收重跑:UF4/崩溃恢复、boot graph(59 条目)、打包闭包验收均按现 entry 行为校准;
3. 升级耦合反转:vendored 跟随 = 零成本获得上游修复;自建后协议演进自己跟;
4. npm 治理照旧:lockfile 钉 alpha 对齐线 + native addon 平台件 + dist-tag 漂移防护。

**本质**:产品方向选择 —— 「零侵入跟随上游」(零维护、零漂移)vs「自有 entry」(可 npm 化、行为可控、要养)。

## 6. 结论与再触发条件

**现状维持不变**:vendored 投影是宿主字节唯一来源,`vendored/packages/**` 不可删(闭包教训:无证据砍 subtree = 静默失败风险,见 `.closure-supplements/` 存在缘由)。

**再裁决触发条件**(满足其一可开独立 spike 重评 §5):

- 上游将 `dsh-desktop-host` 发布至 npm,或提供官方宿主 entry 包;
- 产品需要在 entry 层做深度自有行为(超出 carriage 定位),跟随成本超过自建维护成本;
- 仓库/构建体积成为实际痛点且闭包可达性审计无法进一步收缩。
