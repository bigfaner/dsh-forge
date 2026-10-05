# dsh-forge M2 · UI 原型（v6 · 两轮评审打磨 + 老 forge 类型调研）

**基线 = 产品现有代码现态**（fix-25/29/38/40/42 后）+ 两轮 UI/UX 评审（P1-P5 + R1-R7 全落地）+ 老 forge 20 种任务类型源码调研（模块化详情抽屉）。

## 形态总览

| 面 | 来源 |
|---|---|
| dock 开始页 | dsh 官方 GuideBody 逐形态（罗盘 hero + 380px 入口卡 + `openTab(replaceTab)` ） |
| 开始页排序 | **项目概览[M2] 最前** → 工作区文件[Ctrl+P] → 新建终端 → 浏览器[Ctrl+T] |
| dock chrome | ＋ 新标签页 + ⛶ 全屏 + ▯ 收展（dsh 原生图标） |
| 概览 tab | 总纲原型 renderOverview 逐形态 + M2 delta（七态过滤/排序切换/搜索/DAG/泳道） |
| 概览子 tab | **提案 \| feature \| 任务**（用户定向顺序） |
| 排序 | `⇅ 活跃优先`（默认）↔ `⇅ 最新创建`（三子 tab 共用） |
| 搜索 | 中英双语、三子 tab 共用、IME 安全（仅更新内容区不重建搜索行） |
| 任务视图 | 列表（两行布局）+ **DAG**（SVG 贝塞尔+箭头）+ **泳道**（七态横向、0 计数列折叠） |
| 文档 | 概览子 tab 点行 → **dock 新 tab**（非抽屉；按 docRel 去重）；mermaid → Diagram 占位卡 |
| 任务详情 | **右侧滑入抽屉**（模块化：通用+按类型条件区+状态条件区+共用底部） |
| 挂接 | 会话头 pill（双数据源分型：派发⟞/执行⟞）→ 点击 → dock 概览 + 任务抽屉 |
| 注册 | OS 选择器一步 → 表单 → hash8 派生行 + 疑似移动拒绝 |

## 任务详情抽屉——模块化（老 forge 20 种类型对齐）

```
├── 通用区:类别彩色 chip(编码蓝/文档紫/测试青/评估红/验证琥珀/质量门绿) + 优先级 + 预估 + 复杂度 + breaking
├── blocked → 阻塞原因(⚠ 红色)
├── coding.fix/doc.fix → Fix 链(来源任务+根因+源文件+测试脚本)
├── coding.*/code-quality.* → 覆盖率进度条(三色阈值)
├── test.* → 测试面(Surface key/type + 测试类型名)
├── gate → 质量门检查(通过/总数进度条)
├── eval.*/validation.* → 评估结果(🔑主会话 + 得分 + 严重度)
├── 前置依赖(各前置含当前状态)
├── 执行时间线(auto-restore/auto-block 专用色)
├── 挂接会话(派发/执行分型,可点击跳转)
└── 「转移状态…」按钮(from≠to + reason 必填)
```

## 运行

双击 `index.html`。**冒烟 `node smoke.cjs` = 44 断言全绿**（九段）。harness 会话须绕 node shim。
