// plugin-forge 侧专家档案解析断言（forge-test-discipline-layering 1.2——
// test-script-author.md 吸收集成测试层行 + 断言质量门后的装载链护栏）。
// 单源锚：校验语义与 expert-squad parseExpertFile 同构
// （packages/plugins/expert-squad/src/store/frontmatter.ts）。本包不依赖
// expert-squad，故在此内联最小校验逻辑；语义漂移以单源锚为准。
// 漂移探测计划：expert-squad store/frontmatter.ts 解析语义或键集任一侧改动时，
// 同提交核对本文件内联校验与单源锚一致，键集/校验规则漂移即在本文件对齐。
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const EXPERT_FILE = resolve(here, "../experts/test-script-author.md");

/** 与 expert-squad parseExpertFile 同构的最小校验（单源锚见文件头）。 */
function parseExpertFileLike(filePath: string, content: string): { ok: true } | { ok: false; reason: string } {
  if (content.includes("{{")) {
    return { ok: false, reason: `${filePath}: 含裸 {{ ——与 persona {{…}} 插值语义冲突，不被允许` };
  }
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!m) return { ok: false, reason: `${filePath}: frontmatter 块缺失` };
  const fm = m[1];
  if (fm === undefined) return { ok: false, reason: `${filePath}: frontmatter 块缺失` };

  const data: Record<string, string | string[]> = {};
  let currentKey: string | undefined;
  for (const rawLine of fm.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.startsWith("- ")) {
      const item = line.slice(2).trim();
      if (!currentKey || !Array.isArray(data[currentKey])) {
        return { ok: false, reason: `${filePath}: 列表项 ${item} 无所属键` };
      }
      data[currentKey] = [...(data[currentKey] as string[]), item];
      continue;
    }
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) return { ok: false, reason: `${filePath}: frontmatter 行非法——${line}` };
    const [, key, value] = kv;
    if (key === undefined || value === undefined) {
      return { ok: false, reason: `${filePath}: frontmatter 行非法——${line}` };
    }
    currentKey = key;
    if (value.startsWith("[") && value.endsWith("]")) {
      const items = value.slice(1, -1).split(",").map((s) => s.trim()).filter((s) => s !== "");
      if (items.some((s) => !/^[^\s"'[\]]+$/.test(s))) {
        return { ok: false, reason: `${filePath}: 字段 ${key} 内联数组项非法` };
      }
      data[key] = items;
    } else if (value === "") {
      data[key] = []; // 块列表占位，由后续 "- " 行填充；空到结尾按空数组参与类型判定
    } else {
      data[key] = value.trim();
    }
  }

  const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
  for (const key of ["name", "title", "description"] as const) {
    const v = data[key];
    if (typeof v !== "string" || v.trim() === "") {
      return { ok: false, reason: `${filePath}: 必填字段 ${key} 缺失或为空` };
    }
  }
  if (!isStringArray(data.tools) || data.tools.length === 0) {
    return { ok: false, reason: `${filePath}: 必填字段 tools 缺失、为空或非字符串数组` };
  }
  if (data.skills !== undefined && !isStringArray(data.skills)) {
    return { ok: false, reason: `${filePath}: 字段 skills 非字符串数组` };
  }
  for (const key of ["model", "provider"] as const) {
    if (data[key] !== undefined && typeof data[key] !== "string") {
      return { ok: false, reason: `${filePath}: 字段 ${key} 非字符串` };
    }
  }
  if (data.reasoning !== undefined && !["low", "medium", "high"].includes(String(data.reasoning))) {
    return { ok: false, reason: `${filePath}: 字段 reasoning 非法（须为 low|medium|high）` };
  }
  const personaRaw = m[2];
  if (personaRaw === undefined || personaRaw.trim() === "") {
    return { ok: false, reason: `${filePath}: 正文人设 Markdown 缺失` };
  }
  return { ok: true };
}

describe("experts/test-script-author.md 档案解析断言（forge-test-discipline-layering 1.2）", () => {
  const content = readFileSync(EXPERT_FILE, "utf-8");

  it("经 parseExpertFile 同构校验通过（必填 name/title/description/tools、字段类型、正文在场）", () => {
    expect(parseExpertFileLike(EXPERT_FILE, content)).toEqual({ ok: true });
  });

  it("无裸 {{ 字面量（全文任意位置）", () => {
    expect(content.includes("{{")).toBe(false);
  });

  it("frontmatter 键与既有档案键集一致（不引入新键）", () => {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)![1]!;
    const keys = fm.split(/\r?\n/).filter((l) => /^[A-Za-z]/.test(l)).map((l) => l.split(":")[0]!);
    // 键集 pin 与内联 parser 可选键（model/provider/reasoning）对齐：必填 5 键在场，额外键只允许 parser 认可的可选键
    const REQUIRED = ["description", "name", "skills", "title", "tools"];
    const OPTIONAL = ["model", "provider", "reasoning"];
    for (const key of REQUIRED) {
      expect(keys, `必填键缺失：${key}`).toContain(key);
    }
    expect(keys.filter((k) => !REQUIRED.includes(k) && !OPTIONAL.includes(k)), "引入了 parser 不认可的未知键").toEqual([]);
  });

  it("执行树布局表含集成测试层行：单句目录约束 + 判据版职责边界", () => {
    const rowLine = content.split(/\r?\n/).find((l) => l.startsWith("| 集成测试 |"));
    expect(rowLine).toBeDefined();
    const row = rowLine!;
    // 目录约束单句：生态规范/项目现状 + 探测次序
    expect(row).toContain("遵循各语言生态规范或项目测试结构现状");
    expect(row).toContain("先跟随同类既有测试的落位与命名，全无先例才按生态缺省");
    // 判据版职责/边界
    expect(row).toContain("测试进程内组装真实模块");
    expect(row).toContain("接口级 fake");
    expect(row).toContain("真实实例");
    expect(row).toContain("正式装配组合根不触碰");
    expect(row).toContain("不为测试强行改造正式代码");
  });

  it("断言质量门节在案：反例注入三段式留痕 + e2e 抽样规则 + 弱断言禁令四形态", () => {
    expect(content).toContain("## 断言质量门");
    expect(content).toContain("故意弄坏守卫语义 → 红 → 复原 → 绿");
    expect(content).toContain("落 submitTask 结算 AC 证据");
    expect(content).toContain("弄坏点 + 红输出尾部 + 复原绿输出尾部");
    expect(content).toContain("runner 不重跑");
    // e2e 抽样规则
    expect(content).toContain("按断言簇抽样");
    expect(content).toContain("每套件至少一条代表性守卫断言留痕");
    // 弱断言禁令四形态
    expect(content).toContain("裸真值断言");
    expect(content).toContain("OR 断言稀释");
    expect(content).toContain("监听晚注册近恒真");
    expect(content).toContain("断言倒置");
  });

  it("边界节增补：不为测试强行改造正式代码 + 孤儿用例同提交清理 + 支撑形态澄清 + 三分法", () => {
    const boundary = content.slice(content.indexOf("## 边界"));
    expect(boundary).toContain("不为测试强行改造正式代码");
    expect(boundary).toContain("上抛主会话裁决");
    expect(boundary).toContain("孤儿用例同提交清理");
    expect(boundary).toContain("不参与层间升降判据");
    // 集成 vs e2e 判别三分法一句话版（语言无关）
    expect(boundary).toContain("装配位置");
    expect(boundary).toContain("触达面");
    expect(boundary).toContain("替身规则");
    expect(boundary).toContain("判别锚恒为装配位置");
  });

  it("既有内容保留（单元层/结构 pin/落位纪律/渲染面边界/断言锚）", () => {
    for (const fragment of [
      "## 执行树布局（分层模型）",
      "| 单元测试 |",
      "| 结构 pin |",
      "落位纪律",
      "渲染面单测边界",
      "不断视觉坐标",
    ]) {
      expect(content).toContain(fragment);
    }
  });

  it("执行约束节瘦身：执行面条目移除（归 test-run），只留撰写面（快照重录）+ 归属句", () => {
    const exec = content.slice(content.indexOf("## 执行约束"), content.indexOf("## 断言质量门"));
    // 锚守卫
    for (const anchor of ["## 执行约束", "## 断言质量门"]) {
      expect(content.indexOf(anchor), `锚缺失：${anchor}`).toBeGreaterThan(-1);
    }
    // 执行纪律归属句（编写与执行分离：怎么跑归 test-run）
    expect(exec).toContain("执行纪律");
    expect(exec).toContain("归测试执行者");
    expect(exec).toContain("test-run 职责面");
    expect(exec).toContain("只管写什么、怎么写");
    // 撰写面保留：快照重录须伴随行为断言更新
    expect(exec).toContain("快照");
    expect(exec).toContain("重录必须伴随对应行为断言更新");
    // 执行类条目负断言（移除项不回流）
    for (const removed of ["run-once", "针对性执行", "环境约束", "CI 门禁分层", "迭代止损", "覆盖率"]) {
      expect(exec, `执行类条目应已移除：${removed}`).not.toContain(removed);
    }
  });

  it("档案改动区块零目录/命名硬编码（词表机检，命令形态豁免）", () => {
    // 机检域 = 本次新增文本块：集成测试层行 + 执行约束节 + 断言质量门节 + 边界节新增条目
    const integrationRow = content.split(/\r?\n/).find((l) => l.startsWith("| 集成测试 |")) ?? "";
    const execution = content.slice(content.indexOf("## 执行约束"), content.indexOf("## 断言质量门"));
    const assertionGate = content.slice(content.indexOf("## 断言质量门"), content.indexOf("## 渲染面单测边界"));
    const boundary = content.slice(content.indexOf("## 边界"));
    const NEW_BLOCKS = [integrationRow, execution, assertionGate, boundary];
    // 锚守卫：被检节标题/行缺失时此测试必须红（防 indexOf -1 切到残段恒绿）
    expect(content.split(/\r?\n/).some((l) => l.startsWith("| 集成测试 |")), "锚缺失：| 集成测试 | 行").toBe(true);
    for (const anchor of ["## 执行约束", "## 断言质量门", "## 渲染面单测边界", "## 边界"]) {
      expect(content.indexOf(anchor), `锚缺失：${anchor}`).toBeGreaterThan(-1);
    }
    // 词表：具体路径与命名模式（存量布局表目录豁免不在机检域内）
    const BANNED = ["*.integration.test.ts", "tests/", "src/test", "e2e/specs"];
    for (const block of NEW_BLOCKS) {
      for (const token of BANNED) {
        expect(block, `新增文本块含禁用硬编码词：${token}`).not.toContain(token);
      }
    }
  });
});

describe("experts/test-runner.md 档案解析断言（forge-test-discipline-layering 1.6）", () => {
  const RUNNER_FILE = resolve(here, "../experts/test-runner.md");
  const content = readFileSync(RUNNER_FILE, "utf-8");

  it("经 parseExpertFile 同构校验通过（必填 name/title/description/tools、字段类型、正文在场）", () => {
    expect(parseExpertFileLike(RUNNER_FILE, content)).toEqual({ ok: true });
  });

  it("无裸 {{ 字面量（全文任意位置）", () => {
    expect(content.includes("{{")).toBe(false);
  });

  it("frontmatter 键与既有档案键集一致（不引入新键）", () => {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)![1]!;
    const keys = fm.split(/\r?\n/).filter((l) => /^[A-Za-z]/.test(l)).map((l) => l.split(":")[0]!);
    // 键集 pin 与内联 parser 可选键（model/provider/reasoning）对齐：必填 5 键在场，额外键只允许 parser 认可的可选键
    const REQUIRED = ["description", "name", "skills", "title", "tools"];
    const OPTIONAL = ["model", "provider", "reasoning"];
    for (const key of REQUIRED) {
      expect(keys, `必填键缺失：${key}`).toContain(key);
    }
    expect(keys.filter((k) => !REQUIRED.includes(k) && !OPTIONAL.includes(k)), "引入了 parser 不认可的未知键").toEqual([]);
  });

  it("执行序列：环境自备为第一步（探测获取宿主形态 + blocked 上抛 + 认证凭据注入），probe 降级健康检查", () => {
    const seq = content.slice(content.indexOf("## 执行序列"));
    expect(seq).toContain("环境自备");
    // 第一步 = 环境自备，序号 1
    const firstStep = seq.split(/\r?\n/).find((l) => /^1[.、]/.test(l.trim()));
    expect(firstStep, "执行序列第一步锚缺失").toBeDefined();
    expect(firstStep!).toContain("环境自备");
    // 宿主形态经探测工作区测试策略或项目文档获取；无从探测 blocked 上抛
    expect(seq).toContain("探测");
    expect(seq).toContain("blocked 上抛");
    // 含认证凭据注入
    expect(seq).toContain("认证凭据");
    // probe 降级为健康检查：正向句在案，不承担缺席分支、不承担工作区自带 dev 生命周期前提
    expect(seq).toContain("健康检查");
    expect(seq).toContain("不承担");
  });

  it("崩溃残留回收句 + 分层最小取证集句 + 可红性门承接句在案", () => {
    expect(content).toContain("进程/端口回收确认");
    // 分层最小取证集
    expect(content).toContain("失败输出尾部");
    expect(content).toContain("trace");
    expect(content).toContain("截图");
    expect(content).toContain("宿主日志锚");
    // 可红性门承接句
    expect(content).toContain("runner 不重跑反例");
  });

  it("HARD-GATE 五条与上报节零改动（基线逐句 pin）", () => {
    const gate = content.slice(content.indexOf("## HARD-GATE"), content.indexOf("## 上报"));
    for (const line of [
      "- 不修改测试脚本内容。",
      "- 不跳过失败的测试，也不把失败报成通过——跑了什么就报什么。",
      "- 不在执行过程中\"修好\"测试让它通过；测试脚本 bug 可以上报，为强行通过而改断言或逻辑即属伪造。",
      "- 同一编排周期内，probe 失败后不重试 probe、不重启 dev（任务层做出修复决定后的新一次调用属于新周期）。",
      "- 以任务身份运行（`type: test-run`）：任何失败都以 `submitTask result=blocked` 结算，reason 写明失败的旅程与用例——绝不带着已知失败提交 `success`。",
    ]) {
      expect(gate).toContain(line);
    }
    expect(gate.split(/\r?\n/).filter((l) => l.startsWith("- ")).length).toBe(5);
    const report = content.slice(content.indexOf("## 上报"));
    for (const line of [
      "- 每个旅程的合计（passed/failed/skipped）、每条失败附错误摘录作为证据、以及实际执行的序列。",
      "- 结果输出缺失或为空 → 如实说明并附运行器控制台输出，不得编造报告。",
      "- 证据（trace、失败摘录、截图）先落盘再继续。",
    ]) {
      expect(report).toContain(line);
    }
  });

  it("执行约束节为执行纪律唯一正本：精确执行/全量仅回归三处/CI 门禁分层/迭代止损/并行资源唯一化/覆盖率口径（1.14）", () => {
    const exec = content.slice(content.indexOf("## 执行约束"), content.indexOf("## HARD-GATE"));
    expect(content.indexOf("## 执行约束"), "锚缺失：## 执行约束").toBeGreaterThan(-1);
    // run-once（既有）保留
    expect(exec).toContain("run-once");
    // 精确执行：改动面 = 执行面 / 定向到用例级 / 已绿不复跑
    expect(exec).toContain("改动面 = 执行面");
    expect(exec).toContain("用例级");
    expect(exec).toContain("已绿");
    expect(exec).toContain("不复跑");
    // 全量仅属回归三处
    expect(exec).toContain("全量");
    expect(exec).toContain("收口");
    expect(exec).toContain("发布验收");
    // CI 门禁分层：单元/集成进 PR 门禁、e2e 进收口/发布轮
    expect(exec).toContain("CI 门禁分层");
    expect(exec).toContain("PR 门禁");
    expect(exec).toContain("e2e 进收口");
    // 迭代止损 3 轮
    expect(exec).toContain("迭代止损");
    expect(exec).toContain("3 轮");
    // 并行资源唯一化（端口/目录/环境变量）
    expect(exec).toContain("并行");
    expect(exec).toContain("端口");
    expect(exec).toContain("目录");
    expect(exec).toContain("环境变量");
    // 覆盖率采集口径：按任务 AC，不虚报
    expect(exec).toContain("覆盖率");
    expect(exec).toContain("AC");
    expect(exec).toContain("不虚报");
    // 语言无关零硬编码（命令形态词禁入）
    for (const token of ["vitest", "playwright", "npx", "pnpm"]) {
      expect(exec, `执行约束节含命令硬编码：${token}`).not.toContain(token);
    }
  });

  it("撰写/执行边界句在案：写进测试代码的归撰写者，怎么跑的归本档案（1.14）", () => {
    const exec = content.slice(content.indexOf("## 执行约束"), content.indexOf("## HARD-GATE"));
    expect(exec).toContain("撰写");
    expect(exec).toContain("超时");
    expect(exec).toContain("断言");
    expect(exec).toContain("锚");
    expect(exec).toContain("归撰写者");
    expect(exec).toContain("怎么跑");
    expect(exec).toContain("归本档案");
  });

  it("档案正文零仓内路径引用（grep 机检；命令形态豁免）", () => {
    expect(content.indexOf("\n---", 4), "frontmatter 结束锚缺失").toBeGreaterThan(-1);
    const body = content.slice(content.indexOf("\n---", 4) + 4);
    const BANNED = ["AGENTS", "docs/conventions", "docs/", "packages/", "判例 20", ".forge", "src/"];
    for (const token of BANNED) {
      expect(body, `档案正文含禁用引用词：${token}`).not.toContain(token);
    }
  });
});

describe("experts/test-contract-author.md 档案解析断言（forge-test-discipline-layering 1.4）", () => {
  const CONTRACT_FILE = resolve(here, "../experts/test-contract-author.md");
  const content = readFileSync(CONTRACT_FILE, "utf-8");

  it("经 parseExpertFile 同构校验通过（必填 name/title/description/tools、字段类型、正文在场）", () => {
    expect(parseExpertFileLike(CONTRACT_FILE, content)).toEqual({ ok: true });
  });

  it("契约层定位含分层锚两行：接口契约执行层归集成、旅程契约执行层归 e2e", () => {
    const section = content.slice(content.indexOf("### 契约层定位"), content.indexOf("### 落位纪律")).replaceAll("*", "");
    expect(section).toContain("接口契约的执行层归集成测试");
    expect(section).toContain("旅程契约的执行层归 e2e");
  });

  it("契约形态选型：跨语言端际优先 CDC、同语言可共享类型包+镜像；不引替身不做进程内组装", () => {
    const section = content.slice(content.indexOf("### 契约层定位"), content.indexOf("### 落位纪律")).replaceAll("*", "");
    expect(section).toContain("跨语言端际优先消费者驱动契约（CDC）");
    expect(section).toContain("语言中立契约文件");
    expect(section).toContain("真实服务验证");
    expect(section).toContain("共享类型包 + 镜像");
    expect(section).toContain("不引替身");
    expect(section).toContain("不做被测真实模块的进程内组装");
    expect(section).toContain("组装协作面归集成/脚本层");
  });

  it("契约文档锚同步句在案；与 script-author 同口径且零仓内路径引用", () => {
    expect(content).toContain("改锚同提交改文档");
    // 不互相引用路径：本档案不出现对 script-author 档案的路径引用
    expect(content).not.toContain("test-script-author.md");
    expect(content.indexOf("\n---", 4), "frontmatter 结束锚缺失").toBeGreaterThan(-1);
    const body = content.slice(content.indexOf("\n---", 4) + 4);
    const BANNED = ["AGENTS", "docs/conventions", "docs/", "packages/", "判例 20", ".forge", "src/"];
    for (const token of BANNED) {
      expect(body, `档案正文含禁用引用词：${token}`).not.toContain(token);
    }
  });
});

describe("experts/test-journey-author.md 档案解析断言（forge-test-discipline-layering 1.3）", () => {
  const JOURNEY_FILE = resolve(here, "../experts/test-journey-author.md");
  const content = readFileSync(JOURNEY_FILE, "utf-8");

  it("经 parseExpertFile 同构校验通过（必填 name/title/description/tools、字段类型、正文在场）", () => {
    expect(parseExpertFileLike(JOURNEY_FILE, content)).toEqual({ ok: true });
  });

  it("无裸 {{ 字面量（全文任意位置）", () => {
    expect(content.includes("{{")).toBe(false);
  });

  it("frontmatter 键与既有档案键集一致（不引入新键）", () => {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)![1]!;
    const keys = fm.split(/\r?\n/).filter((l) => /^[A-Za-z]/.test(l)).map((l) => l.split(":")[0]!);
    // 键集 pin 与内联 parser 可选键（model/provider/reasoning）对齐：必填 5 键在场，额外键只允许 parser 认可的可选键
    const REQUIRED = ["description", "name", "skills", "title", "tools"];
    const OPTIONAL = ["model", "provider", "reasoning"];
    for (const key of REQUIRED) {
      expect(keys, `必填键缺失：${key}`).toContain(key);
    }
    expect(keys.filter((k) => !REQUIRED.includes(k) && !OPTIONAL.includes(k)), "引入了 parser 不认可的未知键").toEqual([]);
  });

  it("e2e 黑盒纪律节在案：三要素齐（公开接口驱动 / 不 import 内部不为可测性改正式 / 替身只走进程外协议级拦截）", () => {
    const section = content.slice(content.indexOf("## e2e 黑盒纪律"));
    expect(section).toContain("## e2e 黑盒纪律");
    // 要素一：只经公开接口/调用方可观察面驱动断言；跨端形态同为公开接口面
    expect(section).toContain("公开接口");
    expect(section).toContain("调用方可观察面");
    expect(section).toContain("移动端经宿主 RPC/代理通道");
    // 要素二：不 import 内部、不为可测性改正式
    expect(section).toContain("不 import 正式模块内部");
    expect(section).toContain("不为可测性修改正式代码");
    // 要素三：替身/故障注入只走进程外协议级拦截，进程内夹具禁用，无通道映射并注记
    expect(section).toContain("协议级拦截");
    expect(section).toContain("应用进程内夹具通道禁用");
    expect(section).toContain("映射集成/单元层");
    // TDD 白盒不进 e2e
    expect(section).toContain("TDD 白盒属单元/集成层，不进 e2e");
  });

  it("故障注入句已修正：既有夹具通道口径移除，进程外限定在黑盒纪律节", () => {
    expect(content).not.toContain("优先走既有夹具通道");
    const section = content.slice(content.indexOf("## e2e 黑盒纪律"), content.indexOf("## e2e 旅程写作纪律"));
    expect(section).toContain("进程外协议级拦截");
    expect(section).toContain("应用进程内夹具通道禁用");
    expect(section).toContain("映射集成/单元层");
    expect(section).toContain("不自行撰写");
  });

  it("七条撰写纪律齐（定向跑批行已移除——执行面归 runner；超时行保留并标注撰写面语义）", () => {
    for (const row of [
      "| spec 校准轮 |",
      "| 环境自备 |",
      "| 环境形态感知 |",
      "| 语义择行 |",
      "| 弱断言禁令 |",
      "| 超时与止损上界 |",
      "| 断言锚 |",
    ]) {
      expect(content.split(/\r?\n/).find((l) => l.startsWith(row)), `缺纪律行：${row}`).toBeDefined();
    }
    const table = content.slice(content.indexOf("| 纪律 |"));
    // 校准轮：建模冲突停笔下抛；环境自备：探测与 blocked 降级；形态感知
    expect(table).toContain("交互建模假设");
    expect(table).toContain("停笔下抛");
    expect(table).toContain("探测");
    expect(table).toContain("无从探测则 blocked 上抛");
    expect(table).toContain("探活仅作自备后的健康检查");
    expect(table).toContain("环境形态分支断言");
    // 语义择行 + 锚不唯一即停
    expect(table).toContain("锚不唯一即停");
    expect(table).toContain("不静默选第一个");
    // 弱断言
    expect(table).toContain("弱断言禁令");
    // 超时止损上界含套件级 + 撰写面语义（上界写进 spec，执行面归 runner）
    expect(table).toContain("止损上界");
    expect(table).toContain("套件级");
    expect(table).toContain("上界写进 spec");
    expect(table).toContain("归 test-runner");
    // 断言锚
    expect(table).toContain("不断视觉坐标");
    // 定向跑批行已移除（执行面归 runner），负断言
    expect(content.split(/\r?\n/).find((l) => l.startsWith("| 定向跑批 |"))).toBeUndefined();
    expect(table).not.toContain("全量套件只属收口轮");
  });

  it("迭代止损行已移除（执行面唯一正本归 test-runner）——归因分离 + 文档锚同步句在案", () => {
    // 迭代止损为执行面纪律，不在作者档案（负断言）
    expect(content.split(/\r?\n/).find((l) => l.startsWith("- **迭代止损**"))).toBeUndefined();
    // 每例自持保留（撰写面语义，执行面归 runner）
    expect(content).toContain("每例自持");
    expect(content).toContain("执行面归 test-runner");
    expect(content).toContain("归因分离");
    expect(content).toContain("改锚同提交改文档");
  });

  it("档案正文零 AGENTS/判例编号/仓内路径引用（grep 机检；命令形态豁免）", () => {
    expect(content.indexOf("\n---", 4), "frontmatter 结束锚缺失").toBeGreaterThan(-1);
    const body = content.slice(content.indexOf("\n---", 4) + 4);
    const BANNED = ["AGENTS", "docs/conventions", "docs/", "packages/", "判例 20", ".forge", "src/"];
    for (const token of BANNED) {
      expect(body, `档案正文含禁用引用词：${token}`).not.toContain(token);
    }
  });
});

describe("experts/test-master.md 档案解析断言（forge-test-discipline-layering 1.16）", () => {
  const MASTER_FILE = resolve(here, "../experts/test-master.md");
  const content = readFileSync(MASTER_FILE, "utf-8");

  it("经 parseExpertFile 同构校验通过（必填 name/title/description/tools、字段类型、正文在场）", () => {
    expect(parseExpertFileLike(MASTER_FILE, content)).toEqual({ ok: true });
  });

  it("无裸 {{ 字面量（全文任意位置）", () => {
    expect(content.includes("{{")).toBe(false);
  });

  it("frontmatter 键与既有档案键集一致（不引入新键）", () => {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)![1]!;
    const keys = fm.split(/\r?\n/).filter((l) => /^[A-Za-z]/.test(l)).map((l) => l.split(":")[0]!);
    // 键集 pin 与内联 parser 可选键（model/provider/reasoning）对齐：必填 5 键在场，额外键只允许 parser 认可的可选键
    const REQUIRED = ["description", "name", "skills", "title", "tools"];
    const OPTIONAL = ["model", "provider", "reasoning"];
    for (const key of REQUIRED) {
      expect(keys, `必填键缺失：${key}`).toContain(key);
    }
    expect(keys.filter((k) => !REQUIRED.includes(k) && !OPTIONAL.includes(k)), "引入了 parser 不认可的未知键").toEqual([]);
  });

  it("简介结构：做什么（设计审核测试方案/评审提案可测试性）为主体，不做什么一句划界（不撰写产物/不执行）", () => {
    const desc = content.match(/^description:\s*(.+)$/m)![1]!;
    for (const anchor of ["设计与审核测试方案", "评审提案可测试性"]) {
      expect(desc, `简介缺做什么锚：${anchor}`).toContain(anchor);
    }
    for (const anchor of ["不撰写", "不执行"]) {
      expect(desc, `简介缺不做什么锚：${anchor}`).toContain(anchor);
    }
  });

  it("三职责节齐：测试理论根基 / 测试方案设计职责 / 提案可测试性评审四项", () => {
    expect(content).toContain("### 测试理论根基");
    expect(content).toContain("### 测试方案设计职责");
    expect(content).toContain("### 提案可测试性评审职责");
    const design = content.slice(content.indexOf("### 测试方案设计职责"), content.indexOf("### 提案可测试性评审职责"));
    for (const anchor of ["分层选型", "覆盖策略", "预算配比", "替身位置规划"]) {
      expect(design, `方案设计职责缺锚：${anchor}`).toContain(anchor);
    }
    const review = content.slice(content.indexOf("### 提案可测试性评审职责"), content.indexOf("## 信条"));
    for (const anchor of ["注入缝", "替身声明", "层间分配", "验收可测性"]) {
      expect(review, `提案评审职责缺锚：${anchor}`).toContain(anchor);
    }
  });

  it("与 code-master 互为对照位声明在案", () => {
    expect(content).toContain("## 对照位声明");
    expect(content).toContain("code-master");
    expect(content).toContain("互为对照位");
  });

  it("档案正文零仓内路径引用、零目录/命名硬编码（grep 机检；层名词豁免）", () => {
    expect(content.indexOf("\n---", 4), "frontmatter 结束锚缺失").toBeGreaterThan(-1);
    const body = content.slice(content.indexOf("\n---", 4) + 4);
    const BANNED = ["AGENTS", "docs/conventions", "docs/", "packages/", "判例 20", ".forge", "src/", "tests/", "*.test.ts", "e2e/specs", "vitest", "playwright", "npx", "pnpm"];
    for (const token of BANNED) {
      expect(body, `档案正文含禁用引用词：${token}`).not.toContain(token);
    }
  });
});
// forge-test-discipline-layering 1.16 简介消歧断言结束

describe("test-* 四专家简介消歧断言（forge-test-discipline-layering 1.15）", () => {
  function fmDescription(file: string): string {
    const c = readFileSync(resolve(here, "../experts", file), "utf-8");
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(c);
    expect(m, `frontmatter 缺失：${file}`).not.toBeNull();
    const line = m![1]!.split(/\r?\n/).find((l) => l.startsWith("description:"));
    expect(line, `description 缺失：${file}`).toBeDefined();
    return line!.slice("description:".length).trim();
  }

  it("四简介结构：做什么（动词 + 唯一产物）为主体，不做什么一句收尾", () => {
    const expectations: Array<[string, string[], string[]]> = [
      // [文件, 做什么锚（动词+产物）, 不做什么锚（划界词）]
      ["test-contract-author.md", ["撰写 e2e 契约文档", "跨包契约", "test-gen-contracts"], ["不执行测试", "不写旅程叙事", "不改产品代码"]],
      ["test-journey-author.md", ["撰写 e2e 旅程测试", "spec", "test-gen-journeys"], ["不执行测试", "不写契约文档", "不改产品代码"]],
      ["test-script-author.md", ["撰写", "支撑测试脚本", "test-gen-scripts"], ["不执行测试编排", "不写 e2e 旅程与契约文档", "不改产品代码"]],
      ["test-runner.md", ["编排执行测试", "报告", "test-run"], ["不撰写测试", "不修改测试脚本", "产品代码"]],
    ];
    for (const [file, does, doesNot] of expectations) {
      const desc = fmDescription(file);
      for (const anchor of does) {
        expect(desc, `${file} 简介缺做什么锚：${anchor}`).toContain(anchor);
      }
      for (const anchor of doesNot) {
        expect(desc, `${file} 简介缺不做什么锚：${anchor}`).toContain(anchor);
      }
    }
  });

  it("四简介两两无重叠词义：各占唯一领地（契约文档/旅程 spec/支撑脚本/执行报告）", () => {
    // 领地唯一词：契约 = 契约文档产物；旅程 = 旅程 spec；脚本 = 支撑脚本；runner = 编排+报告
    const contract = fmDescription("test-contract-author.md");
    const journey = fmDescription("test-journey-author.md");
    const script = fmDescription("test-script-author.md");
    const runner = fmDescription("test-runner.md");
    // 撰写动词的唯一产物各不相同
    expect(contract).toContain("契约文档");
    expect(contract).not.toContain("旅程测试");
    expect(journey).toContain("旅程测试");
    expect(journey).not.toContain("撰写契约文档");
    expect(journey).toContain("不写契约文档");
    expect(script).toContain("支撑测试脚本");
    expect(script).not.toContain("e2e 契约文档");
    expect(script).not.toContain("旅程测试");
    // runner 是唯一执行编排者：其余三简介均含不执行划界
    expect(runner).toContain("编排执行测试");
    expect(contract).toContain("不执行测试");
    expect(journey).toContain("不执行测试");
    expect(script).toContain("不执行测试编排");
    // runner 不撰写
    expect(runner).toContain("不撰写测试");
  });

  it("四简介经 parseExpertFile 同构校验通过（frontmatter 合法）", () => {
    for (const file of ["test-contract-author.md", "test-journey-author.md", "test-script-author.md", "test-runner.md"]) {
      const c = readFileSync(resolve(here, "../experts", file), "utf-8");
      expect(parseExpertFileLike(resolve(here, "../experts", file), c)).toEqual({ ok: true });
      expect(c.includes("{{"), `${file} 含裸 {{`).toBe(false);
    }
  });
});
// forge-test-discipline-layering 1.15 简介消歧断言结束
