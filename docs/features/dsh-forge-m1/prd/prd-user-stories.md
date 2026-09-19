---
feature: "dsh-forge M1 桌面纯壳"
---

# User Stories: dsh-forge M1 桌面纯壳

> 角色来源:PRD Background(社区开发者/新用户、现有 dsh 重度用户、现有 web GUI 用户;维护者为干系人,非应用故事对象)。SC3(进程足迹)为系统质量约束,锚定于 Goals/NFR,不设故事。

## Story 1: 干净机器零终端首用

**As a** 干净机器上的社区开发者(未预装任何开发环境)
**I want to** 从 GitHub Releases 下载安装包后直接安装、启动,不触碰终端完成 API key 配置并发起首个会话
**So that** 零门槛体验 dsh 完整会话能力(shell 工具 + 审批)

**Acceptance Criteria:**
- Given 无 Node/git/pnpm 的 Windows、macOS、Linux 机器各一台,When 从 GitHub Releases 下载安装包并安装、启动,Then 除平台安全机制一次性引导外全程零终端命令
- Given 应用首次启动完成,When 在应用内完成 API key 配置,Then 无需离开应用即可发起真实会话
- Given 已配置凭据的运行中会话,When 触发 shell 工具与审批,Then 至少一次 shell 工具调用成功且一次审批交互完成
- Given 完全断网环境,When 安装并首次启动,Then 安装与启动成功,且更新检测失败不弹错、不阻断

---

## Story 2: 桌面载体功能对等

**As a** 现有 dsh web GUI 用户
**I want to** 桌面载体提供与 web GUI 完全一致的功能面(会话/聊天/审批/计划/设置/文件树/workspace 切换)
**So that** 切换到桌面形态不损失任何既有能力

**Acceptance Criteria:**
- Given 桌面应用已启动,When 逐一使用现有 web GUI 的全部功能面,Then 100% 可用 —— 现有 web e2e/快照测试在桌面载体通过,或 tech-design 定义并落地的等价载体级测试通过

---

## Story 3: 挂机驻留与通知召回

**As a** 长会话挂机的重度用户
**I want to** 关闭窗口后应用驻留托盘,并在会话等待我输入或回合完成时收到系统通知、点击直达会话
**So that** 挂机处理其他事务也不错过任何审批与结果

**Acceptance Criteria:**
- Given 应用运行中,When 关闭主窗口,Then 应用驻留系统托盘不退出;托盘菜单可恢复窗口与完全退出
- Given 主窗口已关闭且会话运行中,When 会话进入「等待用户输入」状态,Then 系统通知触发,点击聚焦对应会话
- Given 会话回合完成,When 通知触发,Then 点击通知聚焦对应会话窗口
- 上述通知行为在三平台各验证至少一次

---

## Story 4: 多装共存

**As a** 同时使用 CLI 与官方桌面的用户
**I want to** 本壳与既有安装共享会话/凭据且互不损坏
**So that** 我可以在三种形态间自由切换,不担心数据损坏

**Acceptance Criteria:**
- Given 机器上已安装 CLI 与官方桌面(若装),When 安装并使用本壳,Then 三方交替使用 `$DSH_HOME` 会话与凭据后均能正常读取
- Given 本壳运行中,When 检查其 profile 目录,Then 为独立目录(≠ 上游 `desktop`)且与上游官方桌面并存不冲突

---

## Story 5: 持续使用韧性(更新感知与会话恢复)

**As a** 持续使用的用户
**I want to** 有新版本时得到应用内提示并可跳转发布页;宿主崩溃时会话不丢失且可恢复
**So that** 长期使用中版本不落后、故障不丢工作

**Acceptance Criteria:**
- Given 配置了含新版本号的假 GitHub Releases feed,When 启动应用,Then 60 秒内显示更新提示并可跳转发布页
- Given 更新检测源不可达(离线),When 启动应用,Then 静默降级,不弹错误且正常进入应用
- Given 会话进行中,When 宿主子进程被强制终止,Then 壳保持存活并提示,重启子进程后最近会话状态从 session 持久化恢复
