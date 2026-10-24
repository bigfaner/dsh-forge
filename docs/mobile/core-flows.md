# mobile 核心流程

各流程的当前事实语义（裁决出处以日期标注者 = 用户当场裁决）。

## 1. 建会话与发送（hero）

hero 选分支/模式（突击=steer 抢占、远征=queue 排队；内置预设走 `selectAgentPreset`）→ 发送经 `forge:worktree/session-create` 预铸采纳单门（host 建会话守卫，拒绝时弹守卫确认框）→ 跳转 chat。模式经 `heroModeRef` 外推，chat composer 芯片跟随。chat 内发送：运行中 steer、空闲 queue。

## 2. chat 流式与渲染

1. 发送后：durable 事件逐条落账；镜像帧触发 600ms 节流重拉，**重拉完成即 notify**（否则渲染恒滞后一拍——bug 55d50769 判例）。
2. 流式：`agent/assistant-stream` 密帧（host `assistant-stream-mirror` 镜像）→ settler 增量（text/reasoning）；`end` 帧 → settle/abandoned；durable 结算卡原子取代瞬态行。
3. 打字机粒度受上游 provider 出字节奏限制（渲染侧每帧 ≤1 次，rAF 合帧）。

## 3. turn 折叠

- 边界 = durable `turn/end`（官方信号，v2——旧「回复后置」启发式对尾随活动/打断失效）。
- 折叠组摘要 = 桌面端 turn 头同形：`已完成 · N 步 · 用时 X`（step/end 计数 + turn/start→end 时差）+ 分隔线。
- 过程内容双来源互斥：durable 活动在账 → 用官方事件折；不在账（flash 类模型）→ settle 保留瞬态 reasoning 折叠（`思考与执行 · N 项`），插入位 = 气泡→折叠→回复语序。

## 4. ask_user_question（waterfall 桥）

agent 调 ask 工具 → host `user-questions/request` waterfall → mobile-bridge 插件 answerer 镜像到手机 → ask 面板直挂 pending（推送直开，不被空投影清除）→ 用户作答（单选互斥/多选并存/多题分页/自由文本，官方校验 selected/custom 至少其一）→ `forge:proxy/user-questions-answer` 回灌 → waterfall 返回，agent 续跑。无超时（桌面同语义：挂起至回答或中止）。

## 5. 消息元信息行

用户气泡下（右对齐）：时间+复制；agent 回复下（左对齐）：复制+用量+时间。数据 = `WireEvent.time` 与 durable `data.usage.totalTokens`（K 缩写）。复制 clipboard API 优先、execCommand 兜底（LAN http 非 secure context）。点赞/点踩/分享未挂——官方唯一缝是会话级 remark，无逐消息语义。

## 6. TODO 面板

composer 上方（与 composer 同宽，间隔 8px）；数据 = 最后一条 `todo/write` 快照（官方 TodoItem 三态）；默认收起（header：清单图标+「任务」+进度摘要+chevron），收起态保留进行中事项行；展开列表 StateDot 三态（绿环对勾/旋转 spinner/中性核点，1.5s 动画同径）。

## 7. 文档卡片与阅读页

`deliverables/presented` → `.fcard`（图标/文件名/大小/描述）→ 点击 → reader 全屏（`forge:proxy/file` 分块读；md 渲染/plain 文本/html iframe/csv 表格）。入口 = present 工具落账（与桌面端语义一致）。

## 8. 已读/未读

触底写 host 游标（乐观归零 + host 持久）；离线/后台帧到达计未读，抽屉行徽标显示；打开会话即已读（open=read）。
