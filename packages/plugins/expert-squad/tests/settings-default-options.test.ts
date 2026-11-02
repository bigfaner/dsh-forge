// settings/default-options —— 配置 tab「默认 Agent 选项」纯逻辑单测（TDD RED 面板）：
// 草稿提取（Config 快照 section → 表单草稿）、提交补丁计算（草稿 → set/unset 语义）、
// reasoning 四选枚举、注册装配（slots/configForms 缝）与 SSR 渲染断言。
// createElement 直构（vitest expert-squad 项目仅匹配 *.test.ts——无 JSX 管道，panel-detail 同径）。

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DefaultAgentOptionsSection,
  DefaultAgentOptionsTab,
  DETAIL_SECTION_ID,
  DETAIL_SECTION_SLOT,
  ExpertSquadItemEntry,
  ITEM_ID,
  ITEM_SLOT,
  EMPTY_DRAFT,
  SETTINGS_NAMESPACE,
  defaultOptionsDraftOf,
  defaultOptionsPatchOf,
  registerDefaultAgentOptionsSection,
  registerPluginsItemEntry,
  REASONING_OPTIONS,
  draftFoldOnRevision,
  expertsConfigWriteOf,
  type ConfigFormMirror,
} from "../src-client/settings/index.js";

// ── 纯逻辑 ──────────────────────────────────────────────

describe("REASONING_OPTIONS（四选）", () => {
  it("恰好四项：默认(空=不下发)/低/中/高", () => {
    expect(REASONING_OPTIONS.map((o) => o.value)).toEqual(["", "low", "medium", "high"]);
    expect(REASONING_OPTIONS.map((o) => o.label)).toEqual(["默认", "低", "中", "高"]);
  });
});

describe("defaultOptionsDraftOf（Config 快照 → 表单草稿）", () => {
  it("section 缺席/非对象 = 全空草稿", () => {
    expect(defaultOptionsDraftOf(undefined)).toEqual({ provider: "", model: "", reasoning: "" });
    expect(defaultOptionsDraftOf("nope")).toEqual({ provider: "", model: "", reasoning: "" });
  });

  it("逐字段提取；非法 reasoning 归位空（= 默认不下发）", () => {
    expect(
      defaultOptionsDraftOf({
        defaultAgentOptions: { provider: "deepseek-official", model: "deepseek-flash", reasoning: "high" },
      }),
    ).toEqual({ provider: "deepseek-official", model: "deepseek-flash", reasoning: "high" });
    expect(defaultOptionsDraftOf({ defaultAgentOptions: { model: "deepseek-flash", reasoning: "bogus" } })).toEqual({
      provider: "",
      model: "deepseek-flash",
      reasoning: "",
    });
  });
});

describe("defaultOptionsPatchOf（草稿 → 写径补丁）", () => {
  it("全空 = undefined（走 unset——字段回退组合层）", () => {
    expect(defaultOptionsPatchOf({ provider: "", model: "", reasoning: "" })).toBeUndefined();
  });

  it("空串位剔除，非空位保留", () => {
    expect(defaultOptionsPatchOf({ provider: "p1", model: "", reasoning: "low" })).toEqual({
      provider: "p1",
      reasoning: "low",
    });
  });

  it("全满 = 三字段整组", () => {
    expect(defaultOptionsPatchOf({ provider: "p1", model: "m1", reasoning: "high" })).toEqual({
      provider: "p1",
      model: "m1",
      reasoning: "high",
    });
  });
});

// ── 测试替身 ──────────────────────────────────────────────

function formMirrorOf(value: unknown, status: "loading" | "ready" | "unavailable" = "ready"): ConfigFormMirror {
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => ({ status, value, revision: 1, writable: true }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: vi.fn(async () => true),
    unset: vi.fn(async () => true),
  };
}

type RegisteredEntry = { options: Record<string, unknown>; component: unknown };

function slotsFake() {
  const registered: RegisteredEntry[] = [];
  const injects: string[] = [];
  return {
    registered,
    injects,
    inject: (key: string, callback: () => (() => void) | undefined) => {
      injects.push(key);
      return callback();
    },
    register: (options: Record<string, unknown>, component: unknown) => {
      registered.push({ options, component });
      return () => undefined;
    },
  };
}

function configFormsFake(form: ConfigFormMirror | undefined, whileServed?: unknown) {
  return {
    ...(whileServed === undefined ? {} : { whileServed }),
    get: (entryId: string) => (entryId === SETTINGS_NAMESPACE ? form : undefined),
  };
}

function ctxFake(services: Record<string, unknown>) {
  return { ...services };
}

// ── 注册装配（plugins.detail.section 缝） ──────────────────

describe("registerDefaultAgentOptionsSection（注册装配）", () => {
  it("configForms 在场：挂 plugins.detail.section 槽并以 id 注册面板（id/inject 面）", () => {
    const slots = slotsFake();
    const form = formMirrorOf(undefined);
    const disposer = registerDefaultAgentOptionsSection(
      ctxFake({ configForms: configFormsFake(form) }) as never,
      slots as never,
    );
    expect(slots.injects).toEqual([DETAIL_SECTION_SLOT]);
    expect(slots.registered).toHaveLength(1);
    const { options, component } = slots.registered[0]!;
    expect(options.name).toBe(DETAIL_SECTION_SLOT);
    expect(options.id).toBe(DETAIL_SECTION_ID);
    expect(options.key).toBeUndefined();
    expect(component).toBe(DefaultAgentOptionsSection);
    // inject 面递达本插件 namespace 的 ConfigForm
    expect((options.inject as () => { form: ConfigFormMirror })().form).toBe(form);
    // modelCatalogLoader 在场锚（目录候选源——settings>模型目录 detail-dialog 同径）
    const injected = (options.inject as () => { modelCatalogLoader?: unknown })();
    expect(typeof injected.modelCatalogLoader).toBe("function");
    expect(typeof disposer).toBe("function");
  });

  it("configForms.whileServed 在场：经其在场门注册（namespace 服务缺席 = 不注册）", () => {
    const slots = slotsFake();
    const form = formMirrorOf(undefined);
    const whileServed = vi.fn((_namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void) =>
      register(new Set([SETTINGS_NAMESPACE])),
    );
    registerDefaultAgentOptionsSection(
      ctxFake({ configForms: configFormsFake(form, whileServed) }) as never,
      slots as never,
    );
    expect(whileServed).toHaveBeenCalledWith(expect.arrayContaining([SETTINGS_NAMESPACE]), expect.any(Function));
    expect(slots.registered).toHaveLength(1);
  });

  // bug 9577a867 回归：Host settings describe 的 ns = profile 行 id（dsh-forge-expert-squad），
  // 短名 "expert-squad" 永不被服务 → 在场门永不放行 → tab 永不挂载。候选集须覆盖行 id
  // 且 forms.get 用服务中解析出的实际 namespace（读写同源）。
  it("whileServed 候选集覆盖 Host 行 id namespace；服务中解析实际 namespace 供 forms.get", () => {
    const slots = slotsFake();
    const form = formMirrorOf(undefined);
    const getByNamespace = vi.fn((ns: string) => (ns === "dsh-forge-expert-squad" ? form : undefined));
    const whileServed = vi.fn((_namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void) => {
      register(new Set(["dsh-forge-expert-squad"]));
    });
    const disposer = registerDefaultAgentOptionsSection(
      ctxFake({ configForms: { whileServed, get: getByNamespace } }) as never,
      slots as never,
    );
    expect(whileServed).toHaveBeenCalledWith(
      expect.arrayContaining(["expert-squad", "dsh-forge-expert-squad"]),
      expect.any(Function),
    );
    expect(slots.registered).toHaveLength(1);
    const options = slots.registered[0]!.options;
    expect((options.inject as () => { form: ConfigFormMirror })().form).toBe(form);
    expect(getByNamespace).toHaveBeenCalledWith("dsh-forge-expert-squad");
    expect(typeof disposer).toBe("function");
  });

  it("namespace 解析随服务换代：短名在服务时改用短名（解析跟随 served 集现取）", () => {
    const slots = slotsFake();
    const form = formMirrorOf(undefined);
    let registerRef: ((served: ReadonlySet<string>) => () => void) | undefined;
    const whileServed = vi.fn((_namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void) => {
      registerRef = register;
      return () => undefined;
    });
    registerDefaultAgentOptionsSection(
      ctxFake({ configForms: { whileServed, get: (ns: string) => (ns === "expert-squad" ? form : undefined) } }) as never,
      slots as never,
    );
    registerRef?.(new Set(["expert-squad"]));
    expect(slots.registered).toHaveLength(1);
    const options = slots.registered[0]!.options;
    expect((options.inject as () => { form: ConfigFormMirror })().form).toBe(form);
  });

  it("configForms 缺席 = 降级不注册（console.warn 留痕，不炸组合）", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const slots = slotsFake();
    const disposer = registerDefaultAgentOptionsSection(ctxFake({}) as never, slots as never);
    expect(slots.injects).toEqual([]);
    expect(slots.registered).toHaveLength(0);
    expect(disposer).toBeUndefined();
    warn.mockRestore();
  });

  // bug 9577a867 伴生面：configForms 官方正门 = inject 声明（惰性 Service 未实例化时
  // reflect.get 缺席——官方 settings-* 族逐包同型）。client 装配必须声明该注入边。
  it("client inject 声明含 configForms（cordis apply 前实例化保证）", async () => {
    const { expertSquadClient } = await import("../src-client/index.js");
    expect(expertSquadClient.inject).toContain("configForms");
    expect(expertSquadClient.inject).toContain("slots");
  });

  it("slots.inject 以方法调用（接收者保真——cordis 代理 this.ctx 绑定）", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const receivers: unknown[] = [];
    const registered: RegisteredEntry[] = [];
    const slots = {
      inject(this: unknown, _key: string, callback: () => (() => void) | undefined) {
        receivers.push(this);
        return callback();
      },
      register(options: Record<string, unknown>, component: unknown) {
        registered.push({ options, component });
        return () => undefined;
      },
    };
    registerDefaultAgentOptionsSection(ctxFake({ configForms: configFormsFake(formMirrorOf(undefined)) }) as never, slots as never);
    expect(receivers).toEqual([slots]);
    warn.mockRestore();
  });
});

// ── plugins.item 缝（官方组卡片 + item 详情页——官方四件同构） ──

describe("registerPluginsItemEntry（plugins.item 注册装配）", () => {
  it("slot 键 pin：plugins.item 槽 + id expert-squad；与 detail.section 缝 id 异键", () => {
    expect(ITEM_SLOT).toBe("plugins.item");
    expect(ITEM_ID).toBe("expert-squad");
    expect(ITEM_ID).not.toBe(DETAIL_SECTION_ID);
    expect(DETAIL_SECTION_SLOT).toBe("plugins.detail.section");
  });

  it("configForms 在场：以官方四件同款形态注册（name/id/order/label/inject configForm 面）", () => {
    const slots = slotsFake();
    const form = formMirrorOf(undefined);
    const disposer = registerPluginsItemEntry(
      ctxFake({ configForms: configFormsFake(form) }) as never,
      slots as never,
    );
    expect(slots.injects).toEqual([ITEM_SLOT]);
    expect(slots.registered).toHaveLength(1);
    const { options, component } = slots.registered[0]!;
    expect(options.name).toBe(ITEM_SLOT);
    expect(options.id).toBe(ITEM_ID);
    expect(options.order).toBe(40);
    // dsh-forge 品牌标识（官方组内与官方四件可区分——条目名含 dsh-forge）
    expect(options.label).toBe("专家团（dsh-forge）");
    expect(component).toBe(ExpertSquadItemEntry);
    expect((options.inject as () => { configForm: ConfigFormMirror })().configForm).toBe(form);
    expect(typeof disposer).toBe("function");
  });

  it("inject face 禁用 `form` 键（bug cd4816a3）：plugins.item 页面 ownerProp form 为 {state,mutate} 契约形状会覆盖 inject face——本缝携 mirror 改走 configForm 键", () => {
    const slots = slotsFake();
    const form = formMirrorOf(undefined);
    registerPluginsItemEntry(ctxFake({ configForms: configFormsFake(form) }) as never, slots as never);
    expect(slots.registered).toHaveLength(1);
    const face = (slots.registered[0]!.options.inject as () => Record<string, unknown>)();
    expect(face.configForm).toBe(form);
    expect(Object.hasOwn(face, "form")).toBe(false);
  });

  it("官方组条目与 item 详情页同源携 dsh-forge 品牌标识（summary 一行简介含 dsh-forge——itemArtwork 映射无本包 id，名称标识兜底）", () => {
    const summary = ExpertSquadItemEntry({ view: "summary" });
    expect(typeof summary).toBe("string");
    expect(summary).toContain("dsh-forge");
    // 官方 client.js ITEM_ARTWORK 仅覆盖 shell/agent-loop/subagent/web-search——
    // 本包 id 不在映射内，官方无可达 dsh-forge 品牌资产，icon 兜底归名称标识。
    expect(["shell", "agent-loop", "subagent", "web-search"]).not.toContain(ITEM_ID);
  });

  it("whileServed namespace 解析与 detail.section 缝同源（读写同源）", () => {
    const slots = slotsFake();
    const form = formMirrorOf(undefined);
    const getByNamespace = vi.fn((ns: string) => (ns === "dsh-forge-expert-squad" ? form : undefined));
    const whileServed = vi.fn((_namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void) => {
      register(new Set(["dsh-forge-expert-squad"]));
    });
    const disposer = registerPluginsItemEntry(
      ctxFake({ configForms: { whileServed, get: getByNamespace } }) as never,
      slots as never,
    );
    expect(whileServed).toHaveBeenCalledWith(
      expect.arrayContaining(["expert-squad", "dsh-forge-expert-squad"]),
      expect.any(Function),
    );
    expect(slots.registered).toHaveLength(1);
    const options = slots.registered[0]!.options;
    expect((options.inject as () => { configForm: ConfigFormMirror })().configForm).toBe(form);
    expect(getByNamespace).toHaveBeenCalledWith("dsh-forge-expert-squad");
    expect(typeof disposer).toBe("function");
  });

  it("configForms/slots 缺席 = 降级不注册（console.warn 留痕，不外溢）", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const slots = slotsFake();
    const disposer = registerPluginsItemEntry(ctxFake({}) as never, slots as never);
    expect(slots.injects).toEqual([]);
    expect(slots.registered).toHaveLength(0);
    expect(disposer).toBeUndefined();
    warn.mockRestore();
  });

  it("双缝并存零冲突：detail.section 与 plugins.item 各自注册，id 异键、互不挤占", () => {
    const slots = slotsFake();
    const form = formMirrorOf(undefined);
    const ctx = ctxFake({ configForms: configFormsFake(form) }) as never;
    registerDefaultAgentOptionsSection(ctx, slots as never);
    registerPluginsItemEntry(ctx, slots as never);
    expect(slots.injects).toEqual([DETAIL_SECTION_SLOT, ITEM_SLOT]);
    expect(slots.registered).toHaveLength(2);
    const ids = slots.registered.map((entry) => entry.options.id);
    expect(ids).toEqual([DETAIL_SECTION_ID, ITEM_ID]);
    expect(new Set(ids).size).toBe(2);
    for (const entry of slots.registered) {
      // item 缝 mirror 走 configForm 键（bug cd4816a3 避撞页面 ownerProp）；detail.section 无撞键面保持 form。
      expect((entry.options.inject as () => Record<string, unknown>)()).toEqual(
        expect.objectContaining(
          entry.options.id === ITEM_ID ? { configForm: form } : { form },
        ),
      );
    }
  });
});

describe("ExpertSquadItemEntry（view 契约）", () => {
  it('view:"summary" = 卡片一行简介（ItemDetail one-liner）', () => {
    const result = ExpertSquadItemEntry({ view: "summary" });
    expect(typeof result).toBe("string");
    expect(result).toContain("专家团");
  });

  it('view:"page" = 挂默认 Agent 选项表单（DefaultAgentOptionsTab 复用）', () => {
    const html = renderToStaticMarkup(
      createElement(ExpertSquadItemEntry, { view: "page", configForm: formMirrorOf(undefined) }),
    );
    expect(html).toContain("默认 Agent 选项");
    expect(html).toContain('data-cfg-field="provider"');
  });

  it("view 缺省（组卡片）= 表单形态（同 page）", () => {
    const html = renderToStaticMarkup(
      createElement(ExpertSquadItemEntry, { configForm: formMirrorOf(undefined) }),
    );
    expect(html).toContain("默认 Agent 选项");
  });

  it("页面 ownerProp form 撞键免疫（bug cd4816a3）：ItemDetail 注入 {state,mutate} 形状不读、mirror 走 configForm——渲染不崩", () => {
    // 官方 plugins.item 页面契约：renderSlot("plugins.item", { view:"page", form: {state, mutate} })
    const pageOwnerForm = {
      state: { status: "ready" as const, value: {}, revision: 1, writable: true },
      mutate: () => Promise.resolve(true),
    };
    const html = renderToStaticMarkup(
      createElement(ExpertSquadItemEntry, {
        view: "page",
        form: pageOwnerForm,
        configForm: formMirrorOf(undefined),
      }),
    );
    expect(html).toContain("默认 Agent 选项");
    expect(html).toContain('data-cfg-field="provider"');
  });
});

// ── subject 门控（detail.section list slot 消费契约） ──────

describe("DefaultAgentOptionsSection（subject 门控）", () => {
  const renderSection = (subject: unknown, form: ConfigFormMirror | undefined = formMirrorOf(undefined)): string =>
    renderToStaticMarkup(
      createElement(DefaultAgentOptionsSection, {
        subject: subject as { kind: string; pkg: { name: string } },
        form,
      }),
    );

  it("本包 bundle subject：渲染面板（ready 形态）", () => {
    const html = renderSection({ kind: "bundle", pkg: { name: "@dsh-forge/expert-squad" } });
    expect(html).toContain("默认 Agent 选项");
    expect(html).toContain('data-cfg-field="provider"');
  });

  it("本包 item subject（id 同键）：渲染面板（item 详情页追加 section）", () => {
    const html = renderSection({ kind: "item", id: ITEM_ID });
    expect(html).toContain("默认 Agent 选项");
    expect(html).toContain('data-cfg-field="provider"');
  });

  it("他包 bundle / row / item 他者 / subject 缺席：render null（非本包详情页零输出）", () => {
    expect(renderSection({ kind: "bundle", pkg: { name: "@dsh-forge/other" } })).toBe("");
    expect(renderSection({ kind: "row", pkg: { name: "@dsh-forge/expert-squad" }, row: {} })).toBe("");
    expect(renderSection({ kind: "item", id: "x" })).toBe("");
    expect(renderSection(undefined)).toBe("");
  });
});

// ── 面板渲染（SSR 断言——panel-detail 同径） ───────────────

describe("DefaultAgentOptionsTab（SSR 渲染）", () => {
  it("ready：单面板 = 标题 + 默认路由分区 + 三字段行；未配置占位「继承父Agent」/「默认」", () => {
    const html = renderToStaticMarkup(createElement(DefaultAgentOptionsTab, { form: formMirrorOf(undefined) }));
    expect(html).toContain("默认 Agent 选项");
    expect(html).toContain("默认路由");
    expect(html).toContain("Provider");
    expect(html).toContain("Model");
    expect(html).toContain("Reasoning");
    expect(html).toContain("继承父Agent");
    expect(html).toContain("默认");
    expect(html).toContain('data-cfg-field="provider"');
    expect(html).toContain('data-cfg-field="model"');
    expect(html).toContain('data-cfg-field="reasoning"');
  });

  it("ready：Provider/Model = Dialog 同款 FilterSelect（无自由文本 input——select 形态锚）", () => {
    const html = renderToStaticMarkup(createElement(DefaultAgentOptionsTab, { form: formMirrorOf(undefined) }));
    expect(html).toContain('data-select="dswf-cfg-provider"');
    expect(html).toContain('data-select="dswf-cfg-model"');
    expect(html).toContain('data-select="dswf-cfg-reasoning"');
    expect(html).not.toContain("<input");
  });

  it("ready：已配置值回显（select box 显当前值 + reasoning 档位）", () => {
    const html = renderToStaticMarkup(
      createElement(DefaultAgentOptionsTab, {
        form: formMirrorOf({ defaultAgentOptions: { provider: "p1", model: "m1", reasoning: "high" } }),
      }),
    );
    expect(html).toContain('data-select-value="p1"');
    expect(html).toContain('data-select-value="m1"');
    expect(html).toContain("高");
  });

  it("loading：占位加载态；unavailable：降级提示（settings 缺席 fail-soft）", () => {
    const loading = renderToStaticMarkup(createElement(DefaultAgentOptionsTab, { form: formMirrorOf(undefined, "loading") }));
    expect(loading).not.toContain("默认路由");
    const unavailable = renderToStaticMarkup(
      createElement(DefaultAgentOptionsTab, { form: formMirrorOf(undefined, "unavailable") }),
    );
    expect(unavailable).not.toContain("默认路由");
  });
});

// ── 快照换代草稿收敛（bug 9577a867 伴生面：连击编辑竞态） ──

describe("draftFoldOnRevision（快照换代 × 在输编辑）", () => {
  const dirtyDraft = { provider: "p1", model: "m-typed", reasoning: "" };

  it("未脏：采纳快照投影（外部/自身写入正常回填）", () => {
    const incoming = { provider: "p1", model: "m1", reasoning: "high" };
    expect(draftFoldOnRevision(EMPTY_DRAFT, incoming, false)).toEqual({ draft: incoming, dirty: false });
  });

  it("脏且快照投影 ≠ 草稿（自身旧写折叠回读）：保留在输草稿——在输值不被抹除", () => {
    const stale = { provider: "p1", model: "", reasoning: "" };
    expect(draftFoldOnRevision(dirtyDraft, stale, true)).toEqual({ draft: dirtyDraft, dirty: true });
  });

  it("脏但快照投影已与草稿一致：采纳并归零脏标", () => {
    expect(draftFoldOnRevision(dirtyDraft, dirtyDraft, true)).toEqual({ draft: dirtyDraft, dirty: false });
  });
});

// ── experts.<实例ID> 条目写缝装配（bug 5cf9768e：Dialog 保存写径生产注入） ──

describe("expertsConfigWriteOf（experts 条目写缝生产装配）", () => {
  const mirrorOf = (
    experts: unknown,
    setImpl: (field: string, value: unknown) => Promise<boolean> = async () => true,
  ): ConfigFormMirror => ({
    getSnapshot: () => ({ status: "ready", value: { experts }, revision: 1, writable: true }),
    subscribe: () => () => undefined,
    set: setImpl,
    unset: async () => true,
  });

  it("configForms 缺席/形状漂移 = undefined（旧装配降级——保存走档案径）", () => {
    expect(expertsConfigWriteOf({})).toBeUndefined();
    expect(expertsConfigWriteOf({ configForms: {} })).toBeUndefined();
  });

  it("现读 experts 映射浅合并本条目：disabled/skills 位保留，agentOptions/tools 整组替换（补丁缺键 = 位摘除）", async () => {
    const sets: [string, unknown][] = [];
    const forms = {
      get: (ns: string) =>
        ns === "expert-squad"
          ? mirrorOf(
              { "k#1": { disabled: true, skills: ["s"], agentOptions: { provider: "old", model: "old" } } },
              async (field, value) => {
                sets.push([field, value]);
                return true;
              },
            )
          : undefined,
    };
    const write = expertsConfigWriteOf({ configForms: forms });
    expect(write).toBeTypeOf("function");
    await write!("k#1", { tools: ["read"] });
    expect(sets).toEqual([["experts", { "k#1": { disabled: true, skills: ["s"], tools: ["read"] } }]]);
  });

  it("disabled 三态·false = 位摘除（启用 = 键归缺，prior 禁用位不残留）", async () => {
    const sets: [string, unknown][] = [];
    const forms = {
      get: (ns: string) =>
        ns === "expert-squad"
          ? mirrorOf({ "k#1": { disabled: true, skills: ["s"] } }, async (field, value) => {
              sets.push([field, value]);
              return true;
            })
          : undefined,
    };
    await expertsConfigWriteOf({ configForms: forms })!("k#1", { disabled: false });
    expect(sets).toEqual([["experts", { "k#1": { skills: ["s"] } }]]);
  });

  it("disabled 三态·undefined = 补丁未触碰，保留 prior 位", async () => {
    const sets: [string, unknown][] = [];
    const forms = {
      get: (ns: string) =>
        ns === "expert-squad"
          ? mirrorOf({ "k#1": { disabled: true } }, async (field, value) => {
              sets.push([field, value]);
              return true;
            })
          : undefined,
    };
    await expertsConfigWriteOf({ configForms: forms })!("k#1", { tools: ["read"] });
    expect(sets).toEqual([["experts", { "k#1": { disabled: true, tools: ["read"] } }]]);
  });

  it("namespace 候选序回退（dsh-forge-expert-squad）；整字段 set 写 experts 映射", async () => {
    const sets: [string, unknown][] = [];
    const forms = {
      get: (ns: string) =>
        ns === "dsh-forge-expert-squad"
          ? mirrorOf({}, async (field, value) => {
              sets.push([field, value]);
              return true;
            })
          : undefined,
    };
    await expertsConfigWriteOf({ configForms: forms })!("k", {
      agentOptions: { provider: "p", model: "m" },
    });
    expect(sets).toEqual([["experts", { k: { agentOptions: { provider: "p", model: "m" } } }]]);
  });

  it("写未被接受（set false）或快照不可达 = 背压重试后 fail-loud 抛错（不静默丢路由覆写）", async () => {
    // 拒写重试窗口（2s × 5）走 fake timers 压缩——恒拒夹具重试耗尽后抛同一错
    vi.useFakeTimers();
    try {
      const rejected = expertsConfigWriteOf({
        configForms: { get: () => mirrorOf({}, async () => false) },
      })!;
      const pending = rejected("k", {});
      const settle = vi.advanceTimersByTimeAsync(20_000);
      await expect(pending).rejects.toThrow("未被接受");
      await settle;
    } finally {
      vi.useRealTimers();
    }
    const unreachable = expertsConfigWriteOf({ configForms: { get: () => undefined } })!;
    await expect(unreachable("k", {})).rejects.toThrow();
  });

  it("bug 3711d0e3：候选 ns 恒拒 = fall-through 下一候选写成功（真机 preset 组合残留影子 ns——重试耗尽不即抛）", async () => {
    vi.useFakeTimers();
    try {
      const sets: [string, unknown][] = [];
      const forms = {
        get: (ns: string) =>
          ns === "expert-squad"
            ? mirrorOf({}, async () => false) // 候选序首位：describe 在场但写恒不可落盘
            : ns === "dsh-forge-expert-squad"
              ? mirrorOf({ "k#1": { skills: ["s"] } }, async (field, value) => {
                  sets.push([field, value]);
                  return true;
                })
              : undefined,
      };
      const pending = expertsConfigWriteOf({ configForms: forms })!("k#1", { tools: ["read"] });
      // 首候选 2s×5 重试窗耗尽 → fall-through 次候选当轮写成功
      await vi.advanceTimersByTimeAsync(20_000);
      await pending;
      expect(sets).toEqual([["experts", { "k#1": { skills: ["s"], tools: ["read"] } }]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bug 3711d0e3：全部候选耗尽 = fail-loud 抛末候选错误（不静默丢路由覆写）", async () => {
    vi.useFakeTimers();
    try {
      const rejected = expertsConfigWriteOf({
        configForms: { get: () => mirrorOf({}, async () => false) },
      })!;
      const pending = rejected("k", {});
      const settle = vi.advanceTimersByTimeAsync(40_000);
      await expect(pending).rejects.toThrow("namespace=dsh-forge-expert-squad");
      await settle;
    } finally {
      vi.useRealTimers();
    }
  });

  it("拒写背压重试：fresh revision 快照重合成条目再写（重试窗口内写被接受即收写）", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const sets: [string, unknown][] = [];
      let experts: Record<string, unknown> = { "k#1": { disabled: true } };
      const forms = {
        get: () => ({
          getSnapshot: () => ({ status: "ready" as const, value: { experts }, revision: 1, writable: true }),
          subscribe: () => () => undefined,
          set: async (field: string, value: unknown) => {
            calls += 1;
            if (calls === 1) return false; // 首写命中热重载窗口被拒
            sets.push([field, value]);
            experts = value as Record<string, unknown>;
            return true;
          },
          unset: async () => true,
        }),
      };
      const pending = expertsConfigWriteOf({ configForms: forms })!("k#1", { disabled: false });
      await vi.advanceTimersByTimeAsync(5_000);
      await pending;
      expect(calls).toBe(2);
      // 重试携 fresh 快照重合成：prior（disable 后落位）重读，false = 位摘除
      expect(sets).toEqual([["experts", { "k#1": {} }]]);
    } finally {
      vi.useRealTimers();
    }
  });
});
