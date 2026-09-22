# M1 手检录屏归档流程与干净机器准备

> 配套清单:[m1-manual-checklist.md](./m1-manual-checklist.md)(SC1/SC2/SC4/SC5/SC8/SC9)。
> 用途:PRD 验收材料 —— 手检结果以「录屏 + 结果汇总」双重归档,作为 M1 验收证据(替代遥测/服务端监控,见 PRD Monitoring Requirements)。

## 1. 录屏要求

- **每一条 SC × 每一平台 = 一段独立录屏**(不剪接;覆盖该 SC 表格全部步骤,含 PASS/FAIL 口述结论)。
- 录屏必须同时可见:
  - 屏幕操作全过程(安装、托盘、通知、会话交互);
  - 关键 UI 状态(UF4 覆盖层、通知、toast、托盘 tooltip 计数);
  - **系统时钟或任务栏时间**(佐证 SC2 的 60 秒观察窗与 SC9 退避时序)。
- SC1 录屏中**不得出现任何终端窗口**(零终端验收的直观证据);唯一例外:SC9 第 3 步强杀宿主(清单已注明)。
- SC2 断网动作本身(关 Wi-Fi/拔网线)须入镜,证明断网状态真实成立。

## 2. 干净机器准备

**标准**(PRD SC1):三平台各 1 台**无 Node / git / pnpm** 的机器。

| 项 | 要求 | 验证方式(入镜) |
|----|------|----------------|
| 操作系统 | Windows 10/11 x64 · macOS(Apple Silicon 或 Intel,对位 dmg 资产)· 主流 Linux x64 桌面发行版(Ubuntu 22.04/24.04 推荐) | 「关于本机/系统设置」页面 |
| Node / git / pnpm | **均未安装** | 文件管理器浏览 `C:\Program Files\nodejs`(win)等默认安装位置;不得用 `--version` 终端命令(违背零终端口径,且干净机器本应无 shell 工具) |
| 既有 dsh | 未装上游 CLI / 官方桌面(SC1/SC2);SC8 机器另行准备共存环境 | 用户目录下无 `~/.dsh`(文件管理器查看,开启显示隐藏文件) |
| 下载通道 | Releases 页(或 U 盘拷贝,SC2) | 浏览器历史入镜 |

准备顺序:重装/重置系统或使用全新虚拟机 → 按上表逐项入镜验证 → 开始录制 SC1。虚拟机可用,但 macOS 建议真机(Gatekeeper/通知行为在 VM 中可能失真;若用 VM 须在结果备注)。

## 3. 归档位置与命名

**位置**:仓库外部的验收材料目录(录屏体积大,**不入 git 仓库**):

```
<验收材料根>/m1-manual/
├── recordings/
│   ├── sc1-clean-machine/
│   ├── sc2-offline/
│   ├── sc4-notifications/
│   ├── sc5-tray/
│   ├── sc8-coexist/
│   └── sc9-crash-recovery/
└── results/
    └── m1-manual-results.md      # 从清单 §7 复制汇总表,填 PASS/FAIL + 备注 + 录屏文件引用
```

默认 `<验收材料根>` = 项目同级目录 `Z:\project\dsh\dsh-forge-acceptance\`(与代码仓隔离;可按维护者实际调整,以 results 文档内声明为准)。

**录屏命名**(与清单 SC/平台一一对应,便于反查):

```
m1-<sc编号>-<platform>-<arch>-<日期>.<ext>

示例:
m1-sc1-win-x64-20261015.mp4
m1-sc1-mac-arm64-20261015.mp4
m1-sc1-linux-x64-20261015.mp4
m1-sc9-win-x64-20261015.mp4
```

- `<sc编号>` ∈ {sc1, sc2, sc4, sc5, sc8, sc9}
- `<platform>` ∈ {win, mac, linux};`<arch>` ∈ {x64, arm64}
- 同日复测追加序号后缀 `-2`、`-3`(不覆盖历史证据)。

**结果文档命名**:`results/m1-manual-results.md`,每次执行轮次追加一节(`## 轮次 YYYY-MM-DD`),含:执行人、被测产物版本与来源(tag 或本地构建 commit)、六 SC × 三平台结果表、FAIL 项的问题描述与去向(fix task 链接)。

## 4. 流程(每轮验收)

1. 准备三台干净机器(§2),全程录屏验证干净状态。
2. 逐平台逐 SC 执行 [清单](./m1-manual-checklist.md) 各步骤,每条 SC 一段录屏(§1)。
3. 按 §3 命名归档录屏,填写 `results/m1-manual-results.md`。
4. FAIL 项:登记 fix task 并在结果文档备注;修复后仅复测受影响 SC(复测录屏同样归档,带序号后缀)。
5. 全 PASS 后,在 [tasks/6.4 记录](../features/dsh-forge-m1/tasks/records/6.4-manual-checklist.md)与 6.gate 中引用 results 文档路径,完成 M1 验收材料闭环。
