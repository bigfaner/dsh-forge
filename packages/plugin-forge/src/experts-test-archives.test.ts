// plugin-forge 侧专家档案解析断言（forge-test-discipline-layering 1.2——
// test-script-author.md 吸收集成测试层行 + 断言质量门后的装载链护栏）。
// 单源锚：校验语义与 expert-squad parseExpertFile 同构
// （packages/plugins/expert-squad/src/store/frontmatter.ts）。本包不依赖
// expert-squad，故在此内联最小校验逻辑；语义漂移以单源锚为准。
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
    expect(keys.sort()).toEqual(["description", "name", "skills", "title", "tools"].sort());
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

  it("档案改动区块零目录/命名硬编码（词表机检，命令形态豁免）", () => {
    // 机检域 = 本次新增文本块：集成测试层行 + 断言质量门节 + 边界节新增条目
    const integrationRow = content.split(/\r?\n/).find((l) => l.startsWith("| 集成测试 |")) ?? "";
    const assertionGate = content.slice(content.indexOf("## 断言质量门"), content.indexOf("## 渲染面单测边界"));
    const boundary = content.slice(content.indexOf("## 边界"));
    const NEW_BLOCKS = [integrationRow, assertionGate, boundary];
    // 词表：具体路径与命名模式（存量布局表目录豁免不在机检域内）
    const BANNED = ["*.integration.test.ts", "tests/", "src/test", "e2e/specs"];
    for (const block of NEW_BLOCKS) {
      for (const token of BANNED) {
        expect(block, `新增文本块含禁用硬编码词：${token}`).not.toContain(token);
      }
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
    expect(keys.sort()).toEqual(["description", "name", "skills", "title", "tools"].sort());
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

  it("八条撰写与执行纪律齐（表格行在案，语义措辞逐条核）", () => {
    for (const row of [
      "| spec 校准轮 |",
      "| 环境自备 |",
      "| 环境形态感知 |",
      "| 语义择行 |",
      "| 弱断言禁令 |",
      "| 超时与止损上界 |",
      "| 定向跑批 |",
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
    // 超时止损上界含套件级
    expect(table).toContain("止损上界");
    expect(table).toContain("套件级");
    // 定向跑批 / 断言锚
    expect(table).toContain("定向");
    expect(table).toContain("不断视觉坐标");
  });

  it("迭代止损 3 轮 + spec/产品归因分离 + 文档锚同步句在案", () => {
    expect(content).toContain("迭代止损");
    expect(content).toContain("3 轮");
    expect(content).toContain("归因分离");
    expect(content).toContain("改锚同提交改文档");
  });

  it("档案正文零 AGENTS/判例编号/仓内路径引用（grep 机检；命令形态豁免）", () => {
    const body = content.slice(content.indexOf("\n---", 4) + 4);
    const BANNED = ["AGENTS", "docs/conventions", "docs/", "packages/", "判例 20", ".forge", "src/"];
    for (const token of BANNED) {
      expect(body, `档案正文含禁用引用词：${token}`).not.toContain(token);
    }
  });
});
