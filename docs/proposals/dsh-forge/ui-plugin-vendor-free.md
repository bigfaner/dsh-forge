---
created: "2026-09-21"
updated: "2026-09-21"
author: "faner"
status: Draft
intent: "technical-direction"
---

# 技术方向:自定义 UI 插件化(去 vendor 路线)

> **定位**:本文回答两个连续问题——"官方能力与自定义界面能否全部以插件引入、Electron 只作运行宿主(跟浏览器一样)"与"自定义 UI 如何完整做成 dsh 插件、尽量避免 vendor"。结论直接约束 **M2 任务可视化插件的包形态与依赖策略**,是主提案「一切皆插件」约束的落地技术路线。
>
> **核查纪律**:上游源码引用以本地 `Z:\project\github\deepseek-harness`(pinned SHA `c36ba648`,2026-09-21 核查)为唯一权威;npm 发布面为 2026-09-21 registry.npmjs.org 实测;生态项目(DSH Studio)信息来自其 README,标注为外部证据。

## TL;DR

1. **官方能力本来就是插件**:profile 的 bundle 清单驱动,壳零实现、零改动即可增删。
2. **自定义 UI 可以做成纯 npm 包插件**:客户端插件契约全家桶(`@deepseek-ai/dsh-client-*`)与 cordis 本体**均已发布 npm**,插件对 dsh-forge 的 vendored 树可做到**零文件引用**。
3. **vendor 只剩壳的宿主子进程**(M1 既定,private 包无法避开)——那是壳的问题,不属于插件包。
4. **"Electron 跟浏览器一样"在特性层成立、进程层不成立**:壳可做到零功能(100% 用户可见能力来自 profile 插件树),但监管职责(spawn 宿主、`dsh-app://`、托盘、SC9)没有插件挂载点。
5. 唯一需要纪律维护的对齐线:**插件依赖版本 ≡ vendored 运行时版本**(npm `alpha` dist-tag 线 = vendored SHA 版本)。

## 1. 三层拆解:什么能插件化、什么不能

| 层 | 能否插件化 | 机制 | 边界 |
|----|-----------|------|------|
| 官方能力 | 已经是 | profile bundles 清单(`dsh.profile.bundles`)驱动,宿主自行物化 node_modules 并组装 | 增删能力 = 改清单,不碰壳、不碰 vendored |
| 自定义界面 | 可以 | 客户端插件 + ui-slots 槽位注册;组装顺序 = profile bundles → `cordis.patch.yml` → `--patch` overlays | 只能走标准客户端插件 API(rpc/fetch/stream,carrier 面以内);越界要新 IPC = 往"壳焊死功能"滑 |
| 壳本身 | 不能 | — | OS 级职责(安装器/更新/托盘/通知/协议注册/spawn 宿主/崩溃恢复)无插件挂载点;插件不能加载自己 |

**引入方式两种,同一机制共存**:

| 方式 | 机制 | 定位 |
|------|------|------|
| 内置 | 插件加进壳投影的 profile bundle 清单 | 产品能力,随壳分发 |
| 运行时 | `dsh plugin --profile <name> add <pkg>`(宿主插件命令,装入 profile node_modules) | 用户扩展,marketplace |

双形态天然成立:同一插件既能内置分发,也能被用户装进官方 dsh 的 profile。外部证据:DSH Studio(euanguo/dsh-studio)的项目树/Git Review/终端全部为插件,且可被 `dsh plugin --profile web add github:euanguo/dsh-studio` 装进他人 profile。

## 2. 关键事实:npm 发布面(2026-09-21 registry 实测)

- `@deepseek-ai/dsh-client-ui-goal`:versions `0.1.5-rc.2 / 0.1.6-alpha.1 / 0.1.6-alpha.2`;**dist-tags:latest=0.0.1-rc.1(旧!),next=0.1.5-rc.2,alpha=0.1.6-alpha.2**。
- `@deepseek-ai/cordis`:latest **4.0.2**。
- **vendored SHA `c36ba648` 的 desktopHost 版本 = 0.1.6-alpha.2 = npm `alpha` dist-tag 线**。即:客户端插件族按版本发布,插件开发可直接吃 npm,不需要 vendored 源码。
- 陷阱:dist-tag `latest` 停在 0.0.1-rc.1,装依赖时**禁止裸 `@deepseek-ai/xxx` 或 `^`**,必须 exact 版本或 `alpha` tag。

## 3. 插件解剖(上游 `ui-goal` 实测,SHA c36ba648)

一个客户端 UI 插件 = "两个半身"的小包:

- **宿主半身**可为空:`packages/client/ui-goal/src/index.ts` 全文即 `export function apply(): void {}`——作用只是让插件出现在宿主 cordis.yml/Loader;全部行为在浏览器半身。
- **浏览器半身**走 `exports["./client"]`,由 package.json 的 `dsh` 字段声明:

```jsonc
{
  "dsh": {
    "client": {
      "inject": [
        "@deepseek-ai/dsh-api-remotes",
        "@deepseek-ai/dsh-client-ui-chat",
        "@deepseek-ai/dsh-client-ui-renderer"
        // 依赖边:这些包的工厂必须先到达,本包才物化
      ],
      "platform": "web"
    }
  },
  "peerDependencies": { "@deepseek-ai/cordis": "workspace:^" }, // 消费侧 = npm 版本,唯一 peer
  "exports": { ".": "...", "./client": "./lib/client.js" },
  "files": ["lib/index.js", "lib/client.js", "lib/types/**/*.d.ts"]
}
```

- **UI 落点 = ui-slots 契约**(`packages/client/ui-slots`):`SlotMap` / `SlotFactoryMap` / `LocaleNamespaceMap` 声明合并,`register` 一次调用贡献组件 + 子槽位 + store 席位;**零运行时依赖(仅 React 类型)**,store/renderer 是纯核心,可单测。
- **装配机制**(`packages/client/modules/src/client/manifest.ts`):宿主推 boot graph(`__DSH_BOOT__` wire)→ 工厂经 `window.__ModuleLoader__.load` 注册 → 首次 import 物化(memoized)→ 槽位渲染。插件侧无感知。
- 构建:tsdown,产物仅 `lib/index.js + lib/client.js + types`,体积极小。
- **构建纯度门**:客户端 bundle 有 build-time purity gate,只能引用注册图内的模块,越界 loud-fail(运行时对应物是 import 分支的 loud throw)。

## 4. 依赖策略:开发期零 vendor

```
packages/ui-task-viz/          ← dsh-forge workspace 里的普通包,不进 vendored 树
  peerDependencies:  @deepseek-ai/cordis                       (npm 4.0.2)
  devDependencies:   @deepseek-ai/dsh-client-ui-slots          (npm,类型 + 测试运行时)
                     @deepseek-ai/dsh-client-ui-chat
                     @deepseek-ai/dsh-client-ui-renderer
                     react / react-dom
```

**版本纪律(核心)**:插件依赖锁 **exact `0.1.6-alpha.2`**,与 `vendor/upstream.lock.json` 的 `desktopHostVersion` 对齐;上游 SHA 升级任务里同步 bump 插件依赖(同一任务、同一 diff)。**"避免 vendor 文件" ≠ "版本解耦"**——对齐靠纪律,不是靠拷源码。

## 5. 运行期装配:两锚解析,插件只带自己的代码

- `inject` 目标(ui-chat 等)从 **dsh 安装锚**解析——壳场景 = vendored runtime dir(argv[2],`packages/desktop-host-vendor/src/index.ts` 的 `HOST_RUNTIME_DIR`);用户自装场景 = `$DSH_HOME`。**插件包内永远不装 cordis/ui-***,因此不会 vendor、不会与宿主版本冲突。
- 壳侧引入点:`apps/desktop/src/main/host-profile/index.ts:25` 的 `HOST_PROFILE_BUNDLES` 清单 → 写入 `<userData>/host-profile/package.json` 的 `dsh.profile.bundles`,宿主首次 boot 自行物化 profile node_modules(link-mode fallback junctions)。
- **设计修正(M2 必做)**:`HOST_PROFILE_BUNDLES` 目前是壳代码里的硬编码常量。加自有插件前必须改为产品级配置(manifest/配置文件)——bundle 清单是插件树的根,焊在壳里违背「一切皆插件」。

## 6. 测试链路(同样零 vendor)

| 层 | 手段 | vendor 依赖 |
|----|------|------------|
| 单测 | vitest 直接对 npm 包(ui-slots 的 store/renderer 纯函数面) | 无 |
| 集成 | `npx @deepseek-ai/dsh web`(launcher 在 npm)+ profile 装插件 + Playwright 打 loopback | 无(不经 dsh-forge 壳) |
| 壳内验收 | 现有 `scripts/acceptance/live-ui-{probe,sweep}.mjs` 模式加 journey | 经壳(最终载体) |

集成层同时产出可移植性证据:同一插件在官方 web 与 dsh-forge 壳里都能跑。

## 7. Vendor 残留清单(诚实边界)

| 残留 | 性质 | 处置 |
|------|------|------|
| 壳的 desktop-host 子进程 | M1 既定(private 包,npm 无),属于壳不属于插件 | 保持 vendored 投影;长期演进项 = 上游发布 npm 后退役 |
| inject 目标可用性 | 插件声明的名单必须在运行时安装里存在(boot 校验) | 选稳定基座(ui-slots/ui-chat/ui-renderer 核心槽)降低脆性 |
| 上游 0.1.x alpha 契约演进 | `dsh.client` 契约在动;SHA 升级时插件 diff 面比 carrier 大 | 插件路线固有成本;升级任务内对照 diff + 集成测试兜底 |
| dist-tag 陷阱 | `latest` 停在旧版 0.0.1-rc.1 | 依赖一律 exact / `alpha` tag,CI 加版本一致性断言(插件依赖版本 == UpstreamLock.desktopHostVersion) |

## 8. M2 落地顺序

1. **Spike(hello-world 插件)**:npm 依赖起包,注入一个槽,先跑通**官方 web**(`dsh web`,不经 dsh-forge)→ 再进壳——一步同时验证两锚解析与版本对齐。
2. **HOST_PROFILE_BUNDLES 配置化**(§5 设计修正)。
3. **任务可视化插件**按 ui-goal 模板起包:空宿主半身 + client 半身 + slots 注册。

Spike 需顺带确认(当前为推断/外部证据,未源码级验证):

- [ ] `dsh plugin add` 对壳自有 profile 目录(userData 下)的行为;
- [ ] profile node_modules 物化对 out-of-tree bundle 的解析细节(dev `link:` 与 prod tarball 两种形态);
- [ ] `inject` 依赖边对非官方包(自有插件)作为声明方的完整语义。

## Source Code References(供执行 agent 使用)

> 行号会漂移,优先按符号名检索;上游唯一权威 = 本地 checkout(SHA `c36ba648`)。

- **插件最小样例**:`Z:\project\github\deepseek-harness\packages\client\ui-goal\`(package.json 的 `dsh.client.inject`/`platform`、`src/index.ts` 空 apply、tsdown 产物面)。
- **槽位契约**:`packages/client/ui-slots/src/index.ts`(SlotMap/SlotFactoryMap/LocaleNamespaceMap 声明合并,零运行时依赖);`store.ts`/`renderer.ts` 纯核心。
- **客户端装配机制**:`packages/client/modules/src/client/manifest.ts`(`__DSH_BOOT__` wire、`window.__ModuleLoader__.load` 工厂注册、物化 memoization、purity gate 注释)。
- **壳侧引入缝**:`apps/desktop/src/main/host-profile/index.ts`(`HOST_PROFILE_BUNDLES` 常量、profile manifest 投影、link-mode 物化注释);`packages/desktop-host-vendor/src/index.ts`(`HOST_RUNTIME_DIR` 安装锚)。
- **版本对齐事实**:`vendor/upstream.lock.json`(`desktopHostVersion: 0.1.6-alpha.2`);npm registry dist-tags(§2)。
- **外部证据(非源码级)**:euanguo/dsh-studio README(双形态插件分发实证);awesome-dsh-plugins 的 `dsh plugin --profile web add` 用法。
