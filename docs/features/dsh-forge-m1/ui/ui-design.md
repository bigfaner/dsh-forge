---
created: "2026-09-19"
source: prd/prd-ui-functions.md
status: Draft
---

# UI Design: dsh-forge M1 桌面纯壳

> 设计对象仅为 4 个壳级最小面;主窗口功能面 100% 继承上游 GUI,不在本文设计范围(TECH-ui-reuse-001)。

## Design System

**上游 dsh 设计语言**,完整提取见项目根 [DESIGN.md](../../../DESIGN.md)(源:上游 `packages/client/ui-theme/src/styles/`)。要点:

- **色彩**:一律使用语义别名(`--dsw-alias-*`),亮暗双主题经 `body[data-ds-dark-theme]` 自动切换;品牌动作色 `--dsw-alias-link`(亮 rgb(65,118,230));主按钮为单色黑/白(非品牌蓝)
- **字体**:系统栈;字号阶 12/18(辅助)、14/22(正文)、16/24(标题,字重 500)
- **动效**:`cubic-bezier(0.4,0,0.2,1)`,0.1/0.2/0.3s;toast 入场 160ms、fade 1000ms
- **几何**:r14(小卡)/ r20(菜单)/ r24(对话框);按钮胶囊 md h36 r18 / sm h28 r14;对话框配 mask-1 + blur(2px)
- **OS 原生面**(UF1 托盘 / UF2 通知)不适用上述 tokens,遵循平台规范,仅图标与文案内容归本设计

---

## Component: 系统托盘(UF1)

### Placement

- **Mode**: new-page(壳级 OS 面,非路由页面)
- **Target**: 系统托盘(应用图标 + 托盘菜单)
- **Position**: 操作系统托盘区,应用运行期常驻

### Layout Structure

OS 原生菜单(不使用自绘 UI),结构:

```
[托盘图标 dsh-forge]          ← 悬停 tooltip:「dsh-forge」
└─ 右键菜单
   ├─ 显示主窗口 / Show Main Window
   └─ 退出 / Quit
```

- 图标:dsh-forge 应用图标,提供单色模板变体以适配浅色/深色托盘(Windows/macOS);Linux 走 StatusNotifier 兼容路径
- 菜单为平台原生菜单控件;两项动作,无子菜单、无勾选态

### States

| State | Visual | Behavior |
|-------|--------|----------|
| 常驻(窗口可见) | 托盘图标 | 左键单击聚焦既有窗口(不最小化、不还原);菜单「显示主窗口」同 |
| 常驻(窗口已关/驻留) | 托盘图标 | 左键单击或菜单项恢复并聚焦主窗口 |
| 退出中 | 图标移除 | 菜单「退出」终结壳与宿主子进程,不留孤儿进程 |
| 托盘创建失败(Linux) | 无托盘图标 | 静默降级:不影响主窗口运行;日志记录,不弹错(SC2) |

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| 用户关闭主窗口 | 驻留(不退出) | 图标保持;窗口消失 |
| 左键单击托盘图标(窗口可见) | 聚焦既有窗口 | 窗口前置,不改变尺寸/状态 |
| 左键单击托盘图标(窗口已关) | 恢复主窗口 | 窗口显示并聚焦 |
| 右键托盘图标 | 弹出菜单 | 原生菜单 |
| 菜单「显示主窗口」 | 恢复/聚焦主窗口 | 窗口前置 |
| 菜单「退出」 | 完全退出 | 壳 + 宿主子进程终结 |

### Data Binding

| UI Element | Data Field | Source |
|------------|-----------|--------|
| 托盘图标 | 应用图标资源(平台变体) | 应用包内 |
| tooltip | 应用名「dsh-forge」 | 常量 |
| 菜单文案 | `tray.show` / `tray.quit` | 上游 locale 机制(zh/en) |

---

## Component: 系统通知(UF2)

### Placement

- **Mode**: new-page(壳级 OS 面,非路由页面)
- **Target**: 系统通知(平台通知中心/横幅)
- **Position**: 平台默认通知位置

### Layout Structure

OS 原生通知(标题 + 正文 + 应用图标),两套文案模板:

| 触发 | 标题(zh/en) | 正文(zh/en) |
|------|-------------|-------------|
| 等待用户输入 | 会话等待你的输入 / Session needs your input | {会话名} / {session name} |
| 回合完成 | 回合已完成 / Turn completed | {会话名} / {session name} |

**正文文本规则**:会话名超长时按平台通知默认行为单行截断(尾缀 `…`),不换行;壳侧传入前不做截断(OS 负责呈现)。

**频率/去重规则**:同一会话同一事件的后续触发在 10 秒窗口内合并为一条(更新既有通知内容,不重复弹横幅);不同会话各自独立计数。「回合完成」与「等待用户输入」属于不同事件类型,不去重。

### States

| State | Visual | Behavior |
|-------|--------|----------|
| 等待输入通知 | 标题 + 会话名 | 点击 → 前置主窗口并定位该会话 |
| 回合完成通知 | 标题 + 会话名 | 点击 → 前置主窗口并定位该会话 |
| 已点击 | 通知消失 | 窗口前置、对应会话聚焦 |
| 已消除(未点击) | 通知留存于通知中心 | 再次点击行为与首次一致(定位该会话);通知内容不随会话后续状态更新 |
| 权限被拒/DND | 无通知 | 静默降级:不弹错、不重试;托盘 tooltip 追加事件计数(如「dsh-forge(2)」)作为兜底提示;首次检测到权限被拒时,在主窗口 toast 提示一次「系统通知已禁用,可在系统设置中开启」(点击不跳转系统设置) |

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| 会话进入「等待用户输入」 | 发起通知 | 平台横幅/通知中心呈现 |
| 会话「回合完成」 | 发起通知 | 同上 |
| 点击通知 | 前置主窗口 + 聚焦触发会话 | 窗口前置;多会话不错位 |

### Data Binding

| UI Element | Data Field | Source |
|------------|-----------|--------|
| 标题/正文 | `notify.waitInput.*` / `notify.turnEnd.*` | 上游 locale 机制(zh/en) |
| 会话名 | 会话标题(title);无标题时回退会话 id 前 8 字符 | 壳内会话状态表(壳经宿主事件流维护) |
| 通知点击目标 | 会话 id(随通知 payload 携带) | 壳内会话状态表 |

**会话定位契约(技术设计依赖)**:「定位该会话」不经由修改上游 GUI 实现,通道为**壳 → 上游 GUI 的会话聚焦事件**:壳在启动/加载上游 GUI 时追加 `session-focus` 语义(具体载体——URL hash、postMessage、或上游既有的 deep-link 机制——由技术设计在上游源码侦察后确定,记为 M1 技术设计的前置依赖项)。若上游确无可复用通道,降级行为为:前置主窗口 + toast「请手动切换到会话 {会话名}」;本设计不为此修改主窗口功能面。

---

## Component: 更新提示横幅(UF3)

### Placement

- **Mode**: existing-page(全局覆盖层)
- **Target**: 主窗口(继承上游 GUI 容器)
- **Position**: 主窗口顶部居中悬浮(`top 40px`,toast 同位);不遮内容、不随滚动

### Layout Structure

```
┌────────────────────────────────────────────────┐
│ [↑]  新版本 v0.2.0 可用   [查看发布页]  [×]    │   r14 · pad 12 16 · bg-layer-2
└────────────────────────────────────────────────┘   elevation-prominent · z1100
```

- 单行横幅卡:更新图标(品牌蓝 `--dsw-alias-link`) + 文案 14/22 `--dsw-alias-label-primary` + ghost 按钮「查看发布页」(sm,h28 r14)+ 关闭钮 28×28 r8
- 宽度 `max-content`,`max-width min(640px, 100vw-48px)`(toast 几何);`pointer-events: auto`(可交互,区别于 toast)
- **不自动消失**(SC6 要求持续可见可操作),直至用户关闭或跳转

### States

| State | Visual | Behavior |
|-------|--------|----------|
| 有更新 | 横幅可见 + 跳转动作 | 启动检测到新版本;启动后 60 秒内呈现 |
| 无更新 | 无 UI | 版本一致,静默 |
| 检测失败/离线 | 无 UI | feed 不可达,静默降级,不弹错(SC2) |
| 已关闭 | 无 UI | 点 × 或跳转后,本次运行不再出现 |

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| 启动检测发现新版本 | 显示横幅 | 入场动效 160ms / `cubic-bezier(0.4,0,0.2,1)`(与 toast 一致) |
| 点击「查看发布页」 | 系统浏览器打开发布页;横幅关闭 | 本次运行不再出现 |
| 点击「×」或按 Esc(横幅内焦点时) | 关闭横幅 | 本次运行不再出现 |

**键盘与可访问性**:横幅获得焦点后方可 Esc 关闭(PRD「提示可关闭」);按钮/关闭钮均参与 Tab 序;横幅容器 `role="status"`(`aria-live="polite"`),屏幕阅读器可感知版本提示;入场动效遵循 `prefers-reduced-motion: reduce` 时禁用位移、保留淡入 100ms。

### Data Binding

| UI Element | Data Field | Source |
|------------|-----------|--------|
| 版本文案 | `update.available`(含版本号插值) | GH Releases feed(DF001) |
| 跳转目标 | 发布页 URL | GH Releases feed |
| 按钮/关闭文案 | `update.viewRelease` / 关闭钮 aria-label | 上游 locale 机制(zh/en) |

---

## Component: 宿主崩溃恢复覆盖层(UF4)

### Placement

- **Mode**: existing-page(全屏覆盖层 + 对话框)
- **Target**: 主窗口(继承上游 GUI 容器)
- **Position**: 全屏 mask(`--dsw-alias-bg-mask-1` + `blur(2px)`)+ 居中对话框(上游 Modal 几何)

### Layout Structure

```
╔═══════ mask(全屏) ═════════╗
║                              ║
║   ┌── 对话框 r24 · w380 ──┐  ║
║   │ 连接已中断      (16/24·500) │
║   │ ● 正在重启运行时…(14/22)  │  ║   bg-layer-2 · elevation-prominent
║   └────────────────────────┘  ║
╚══════════════════════════════╝
```

- 对话框:上游 Modal 几何(r24、`min(380px,100%)`、pb24、标题行 pad `22 14 12 24`),`z1200`(高于 UF3 横幅 z1100 与 toast)
- 内容区(标题下,左对齐,px24):状态行 `margin-top 12`,spinner 16×16 + 文案 14/22,spinner 与文案水平排布 `gap 8`
- spinner 规则:崩溃提示态为静态状态点(8×8,error 色);恢复中态切换为旋转 spinner(16×16,品牌蓝,`prefers-reduced-motion: reduce` 时降频至 1rpm 以下或替换为静态图标)
- 失败态布局:状态行下 `margin-top 8` 增加原因块 —— 文案 14/22 `label-secondary`,`max-height 96px`(约 3 行),超出内滚动(仅该块滚动);原因块下 `margin-top 16` 主按钮「重启应用」(md h36 r18 单色主按钮,右对齐)

### States

**状态机(显式迁移条件)**:

```
崩溃提示(检测到子进程异常退出即进入,文案「正在重启运行时…」指壳正在拉起子进程)
  → 恢复中(条件:子进程重启成功、进程可响应;文案切换「正在恢复会话…」指 session 持久化回放中)
  → 恢复完成(条件:回放完成事件到达;覆盖层 160ms fade-out)
崩溃提示 / 恢复中
  → 恢复失败(条件:重启重试耗尽或回放抛错,携带错误摘要;不回退到其他态)
```

| State | Visual | Behavior |
|-------|--------|----------|
| 崩溃提示 | 标题「连接已中断」+ 状态点(error 色)「正在重启运行时…」 | 壳存活;mask 阻断主窗口交互;焦点移入对话框并锁定 |
| 恢复中 | spinner + 「正在恢复会话…」 | 子进程重启,session 持久化回放 |
| 恢复完成 | 覆盖层消失;toast「已恢复最近会话」(toast 规范,3s 自动消失) | 最近会话状态呈现;焦点归还主窗口原位置 |
| 恢复失败 | 原因块 + 主按钮「重启应用」(见布局规则) | 点击重启壳进程;下次启动自动走 session 恢复路径,无需用户手动选择 |

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| 宿主子进程异常退出 | 显示覆盖层(崩溃提示态) | 入场动效 160ms / `cubic-bezier(0.4,0,0.2,1)`;主窗口内容冻结于 mask 后 |
| 子进程重启成功、会话恢复 | 覆盖层消失 + toast | 「已恢复最近会话」3s 自动消失 |
| 恢复失败且用户点击「重启应用」 | 重启应用 | 壳退出并以全新启动路径恢复 |
| Esc / 点击 mask | 不关闭 | 恢复流程不可跳过(会话连续性优先) |

**焦点与读屏**:覆盖层出现时焦点移入对话框(失败态聚焦「重启应用」按钮),mask 存续期间 Tab 循环锁定于对话框内(focus trap,含 Shift+Tab);覆盖层消失后焦点归还此前位置。对话框容器 `role="alertdialog"` + `aria-modal="true"`,`aria-live="assertive"`,状态文案迁移(「正在重启运行时…」→「正在恢复会话…」→ 完成/失败)均由读屏播报。

### Data Binding

| UI Element | Data Field | Source |
|------------|-----------|--------|
| 标题/状态文案 | `crash.title` / `crash.restarting` / `crash.restoring` / `crash.recovered` / `crash.failed` | 上游 locale 机制(zh/en) |
| 失败原因 | 错误摘要 | 壳监护(宿主重启结果) |
| 恢复状态 | 状态机(崩溃→恢复中→完成/失败) | 壳监护 |
| 失败原因 | 错误摘要,单行 ≤120 字符,超出截断(尾缀 `…`),完整信息写日志 | 壳监护(宿主重启结果) |

---

## 层叠与共存规则(全局)

**z-index 层序**:`UF4 覆盖层 z1200` > `UF3 横幅 z1100` = `toast z1100`(同层,见下)。

**逐对规则**:

| 共存对 | 规则 |
|--------|------|
| UF3 横幅 × toast | 同用 top 40px 槽位、同为 z1100,同一时刻只呈现一个:横幅常驻期间,toast 下移避让(toast top 改 88px);toast 先在则横幅入场推迟至 toast 消失 |
| UF3 横幅 × UF4 覆盖层 | UF4 mask 在上(z1200),横幅被含入冻结背景、不可交互;覆盖层消失后横幅恢复可交互,关闭语义不变 |
| UF4 完成态 toast × 覆盖层退场 | 覆盖层先行 160ms fade-out 完成,toast 随后入场(z1100 < z1200,不叠加于残余 mask 之上) |
| UF2 点击前置 × UF4 覆盖层 | UF4 存续期间窗口前置照常执行,但仅呈现覆盖层(冻结背景);会话定位事件延迟至恢复完成后派发 |
