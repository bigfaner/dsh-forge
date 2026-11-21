// @dsh-forge/forge —— client 入口 = 五件 client 自注册单元合并（A 形态 CJS 拼接，
// forge-deep-pack 1.5 / 提案 §二.2「client 合并」）：单行自插裁定后五插行消失，
// 「client 不得 import 五件」的结构性约束随之失效——五件 client 模块（dist/client.js
// 自注册 bundle，消费产物非源码）直接并入 forge 自己的 client 入口，全通道同一 bundle
// （构建变体脚手架退役，client 产物与源码包常规构建同源）。
//
// 形态定谳 = P0 #6：五件注册全发生、序 = import 拼接序、单外层求值内收敛（悬空注册
// 无逃逸）。守卫断言三件套落 tests/forge/client-merge.test.ts（id 全集 ∧ 序确定 ∧
// 外层仅一次）。
//
// import 序即注册序——与 host/index.ts COMPOSED 清单同序（组合激活序 = client 注册序
// 同源对齐）；本文件零视图（阶段一最小化，Workbench 三面视图归 forge-workbench 期）。
import "@dsh-forge/project/client";
import "@dsh-forge/spec/client";
import "@dsh-forge/task-loop/client";
import "@dsh-forge/expert-squad/client";
import "@dsh-forge/knowledge/client";
