// settings —— 配置页「默认 Agent 选项」（官方 keyed slot `plugins.bundle.config` 注册面，
// 插件详情页单入口）。核销：dsh-client-ui-plugin-manager lib/client.js——声明
// client.js:3733（main keyed 'plugins' children `plugins.bundle.config` keyed/root），
// 消费 client.js:2519-2524（PackageDetail「包含的组件」区 `data-plugin-config` section，
// renderSlot(..., { view: "page" }, { entryKey: pkg.name })；configured 门 =
// configLedgerSource bundles = keysOf("plugins.bundle.config")，client.js:44-76——
// slot 登记账本本身即 ledger，client 半注册即入账）；注册形态 = settings-* 族同族先例
// （slots.inject(slot, () => slots.register({name, key, inject}, Component))，key =
// 包名 @dsh-forge/expert-squad）。读写正门 = 官方 configForms 服务（dsh-client-ui-settings
// ConfigForms 镜像面，super-composer submission-settings 同判例：结构同型承载、不做跨包值
// import）——describe/revision/stale 拒写/schema 校验归官方，写落活动 profile 的
// cordis.patch.yml（id 定向条目），volatile 通知 → 快照换代 → 面板热刷新（无重启生效）。
// 降级：configForms 缺席（宿主未组 settings 域）= 不注册本面板（console.warn 留痕）；
// namespace 未被服务 = whileServed 在场门不注册；快照 unavailable = 面板降级提示。
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { FilterSelect } from "../panel/filter-select.js";
import {
  modelCatalogLoaderOf,
  modelOptionsOf,
  providerOptionsOf,
  type ModelCatalogEntry,
  type ModelCatalogLoader,
} from "../panel/model-catalog.js";
import { ensurePanelStyles } from "../panel/styles.js";
import {
  EMPTY_DRAFT,
  REASONING_OPTIONS,
  defaultOptionsDraftOf,
  defaultOptionsPatchOf,
  draftFoldOnRevision,
  type DefaultOptionsDraft,
} from "./default-options-logic.js";
import type { ExpertsEntryPatch } from "../panel/detail-logic.js";
import type { DetailMutations } from "../panel/detail-source.js";

export {
  EMPTY_DRAFT,
  REASONING_OPTIONS,
  defaultOptionsDraftOf,
  defaultOptionsPatchOf,
  defaultOptionsDraftEquals,
  draftFoldOnRevision,
  type DefaultOptionsDraft,
} from "./default-options-logic.js";

/** 官方插件详情页 keyed 配置槽键（dsh-client-ui-plugin-manager main 'plugins' children 声明）。 */
export const BUNDLE_CONFIG_SLOT = "plugins.bundle.config";
/** 本插件 keyed 登记键（= 包名——renderSlot entryKey 过滤与 configured ledger 同源判等）。 */
export const BUNDLE_CONFIG_KEY = "@dsh-forge/expert-squad";
/** 本插件 settings namespace 短名（候选一——行 id 恰为短名的部署直配）。 */
export const SETTINGS_NAMESPACE = "expert-squad";
/**
 * namespace 候选集（bug 9577a867）：官方 Host settings describe 的 ns = profile 行 id
 * （dsh-settings describe `ns: entry.options.id`），产品模板生成行 id = `dsh-forge-expert-squad`
 *（apps/host/src/profile/template.ts）而 dev profile 手写行 id = `expert-squad`——候选双
 * 覆盖，实际 namespace 在注册时点从 served 集解析（读写同源）。
 */
const NAMESPACE_CANDIDATES: readonly string[] = [SETTINGS_NAMESPACE, `dsh-forge-${SETTINGS_NAMESPACE}`];
/** 配置字段（cordis Config volatile 字段一）。 */
const FIELD = "defaultAgentOptions";

/** 官方 ConfigForm 消费切片（dsh-client-ui-settings config-form-types 结构同型镜像——
 *  只承载本面板用到的面：快照/订阅/定向字段写。revisioned 写径官方承担）。 */
export interface ConfigFormMirror {
  getSnapshot(): {
    status: "loading" | "ready" | "unavailable";
    value: unknown;
    revision: number | undefined;
    writable: boolean;
  };
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<boolean>;
  unset(field: string): Promise<boolean>;
}

/** 官方 configForms 服务消费切片（get(name) → ConfigForm 镜像；whileServed 在场门可选）。 */
interface ConfigFormsFace {
  get(entryId: string): ConfigFormMirror | undefined;
  whileServed?(
    namespaces: readonly string[],
    register: (served: ReadonlySet<string>) => () => void,
  ): () => void;
}

/** unknown → 对象窄化（缺席/非对象 = undefined）。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

/** configForms 官方面取法（inject 正门——ctx.configForms；apply 前由 cordis 注入边保证
 * 实例化。bug 9577a867：reflect.get 在 apply 期取到的是未实例化的缺席——官方 settings-*
 * 族全数声明 inject: ["configForms"] 后用类型化 ctx.configForms 消费，同缝收口）。 */
function configFormsFaceOf(ctx: { configForms?: unknown }): ConfigFormsFace | undefined {
  const face = asRecord(ctx.configForms);
  if (face === undefined || typeof face.get !== "function") return undefined;
  return face as unknown as ConfigFormsFace;
}

/**
 * 单行登记（注册面异常只降本行——console 留痕不外溢；index.ts safeRegister 同款微复制
 * ——两处均为「槽登记守卫」，抽共享模块反增耦合，保持就地可读）。
 */
function safeRegister(
  slots: {
    register?(options: Record<string, unknown>, component: unknown): (() => void) | undefined;
  },
  options: Record<string, unknown>,
  component: unknown,
): (() => void) | undefined {
  try {
    return slots.register?.(options, component);
  } catch (error) {
    console.error("[dsh-forge/expert-squad] bundle config panel registration failed——降级不注册", error);
    return undefined;
  }
}

/**
 * 注册「默认 Agent 选项」面板（plugins.bundle.config keyed slot；返回联合释放器）。
 * key = 包名（renderSlot entryKey 过滤 + configured ledger 判等同源）；configForms
 * 缺席 = 降级不注册（宿主未组 settings 域——配置写径不存在，UI 不悬空）；
 * whileServed 在场 = 经官方在场门（namespace 未被服务即拆卸），否则直注册。
 */
export function registerBundleConfigPanel(
  ctx: {
    configForms?: unknown;
    reflect?: { get(name: string): unknown };
    effect?(factory: () => (() => void) | undefined, name?: string): (() => void) | undefined;
  },
  slots: {
    inject?(key: string, callback: () => (() => void) | undefined): (() => void) | undefined;
    register?(options: Record<string, unknown>, component: unknown): (() => void) | undefined;
  },
): (() => void) | undefined {
  const forms = configFormsFaceOf(ctx);
  const inject = slots.inject;
  if (forms === undefined || typeof inject !== "function") {
    console.warn("[dsh-forge/expert-squad] ctx.configForms/slots absent; bundle config panel not mounted");
    return undefined;
  }
  // 实际 namespace（注册时点从 served 集解析——候选命中序即优先序；读写同源单点）
  let namespace: string = SETTINGS_NAMESPACE;
  // bug 9577a867 伴生面：slots 面是 cordis 代理原型方法（this.ctx 绑调用接收者）——
  // 禁解构裸调，必须 slots.inject(...) 方法调用（解构 = this.ctx undefined 实测崩溃）。
  const mount = (): (() => void) | undefined =>
    slots.inject!(BUNDLE_CONFIG_SLOT, () =>
      safeRegister(
        slots,
        {
          name: BUNDLE_CONFIG_SLOT,
          key: BUNDLE_CONFIG_KEY,
          inject: () => ({
            form: forms.get(namespace),
            // 「设置>模型」目录装载器（provider/model 下拉候选源——detail-dialog 同径；
            // 惰性现查 remote.session，目录缺席 = 仅继承空选项，fail-soft 不炸面板）
            modelCatalogLoader: modelCatalogLoaderOf(ctx),
          }),
        },
        DefaultAgentOptionsTab,
      ),
    );
  if (typeof forms.whileServed === "function") {
    // 官方 settings-* 族同型：whileServed 经 ctx.effect 挂调用者 fiber（卸载级联）。
    const watch = (): (() => void) | undefined => {
      const disposer = forms.whileServed!(NAMESPACE_CANDIDATES, (served) => {
        namespace = NAMESPACE_CANDIDATES.find((candidate) => served.has(candidate)) ?? SETTINGS_NAMESPACE;
        const registered = mount();
        return () => registered?.();
      });
      return () => disposer();
    };
    return typeof ctx.effect === "function" ? ctx.effect(watch, "expert-squad: settings tab watch") : watch();
  }
  return mount();
}

/**
 * experts.<实例ID> 条目写缝装配（bug 5cf9768e——detail-source DetailMutations.writeExpertsConfig
 * 的生产注入面，settings 服务 revisioned 正门）：现读快照 experts 映射 → 浅合并本条目
 * （disabled 位按补丁三态落位/摘除/保留；agentOptions/tools 整组替换——条目补丁缺键 = 位摘除，
 * 「逐项清空 = 键归缺 = 回退档案值」）→ 整字段 set（写落活动 profile cordis.patch.yml
 * id 定向条目）。namespace 候选序与 tab 注册同源（bug 9577a867）；写未被接受/快照
 * 不可达 = fail-loud 抛错（保存面 Toast 透出，不静默丢路由覆写）。
 * 返回 undefined = configForms 缺席（宿主未组 settings 域——旧装配降级，保存走档案径）。
 */
export function expertsConfigWriteOf(
  ctx: { configForms?: unknown },
): DetailMutations["writeExpertsConfig"] | undefined {
  const forms = configFormsFaceOf(ctx);
  if (forms === undefined) return undefined;
  return async (instanceId: string, entry: ExpertsEntryPatch): Promise<void> => {
    // bug 3711d0e3：候选 ns 耗尽重试 = fall-through 下一候选（不即抛）——候选序
    // 指向的 ns 可能「describe 在场但写恒不可落盘」（真机 preset 组合残留：ns 行仅存
    // 于 preset 组合块、不落 top-level 组成行，官方组合机械对无 target 的 patch 行
    // 直接丢弃 → configEditor.edit 核销恒拒，dsh-config-editor index.js:122）。只有
    // 全部候选耗尽才 fail-loud（保存面 Toast 透出，不静默丢路由覆写）。
    let lastError: Error | undefined;
    for (const ns of NAMESPACE_CANDIDATES) {
      const form = forms.get(ns);
      const snapshot = form?.getSnapshot();
      if (form === undefined || snapshot === undefined || snapshot.status !== "ready" || !snapshot.writable) {
        continue;
      }
      // 官方拒写背压重试（bug 908dc82e 同族——DefaultAgentOptionsTab writeDraft 先例）：
      // 连续写经 Host configEditor reconcile/entry fiber 热重载窗口会被拒（"no longer
      // active" 族——启停连点/保存连写即命中），固定 2s 间隔 × 5 次重试，每次携 fresh
      // revision 快照重合成条目再写（重试只是收写完成的体验面，正确性仍归 Host 单点）。
      for (let left = 5; ; left -= 1) {
        const experts = asRecord(asRecord(form.getSnapshot().value)?.experts) ?? {};
        const prior = asRecord(experts[instanceId]) ?? {};
        // 条目合成：补丁位整组替换（缺键 = 摘除）；disabled 位——补丁 true = 禁用落位，
        // 补丁 false = 启用且位摘除（键归缺）；补丁未触碰（undefined）= 保留 prior
        const merged: Record<string, unknown> = {};
        if (entry.disabled === true) merged.disabled = true;
        else if (entry.disabled === false) { /* 启用 = 位摘除 */ }
        else if (typeof prior.disabled === "boolean") merged.disabled = prior.disabled;
        if (Array.isArray(prior.skills)) merged.skills = prior.skills;
        if (entry.agentOptions !== undefined) merged.agentOptions = entry.agentOptions;
        if (entry.tools !== undefined) merged.tools = [...entry.tools];
        const accepted = await form.set("experts", { ...experts, [instanceId]: merged });
        if (accepted) return;
        if (left <= 1) {
          lastError = new Error(`experts 配置写未被接受（namespace=${ns}）`);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
    throw lastError ?? new Error("experts 配置写缝不可用（configForms 快照不可写）——无法保存 Agent 选项/工具覆写");
  };
}

/**
 * 「默认 Agent 选项」面板（原型 A 区 · DESIGN.md 令牌）：单面板无 tab 导航、无警示块；
 * 默认路由三分区行 4:4:1（Provider/Model/Reasoning）；未配置 = 占位即空态；reasoning
 * 四选下拉（FilterSelect 复用——面板 msel 视觉词汇单点）。快照换代即热刷新。
 */
export function DefaultAgentOptionsTab(props: {
  readonly form?: ConfigFormMirror;
  readonly modelCatalogLoader?: ModelCatalogLoader;
}): ReactNode {
  ensurePanelStyles();
  const form = props.form;
  const getSnapshot = useRef(form?.getSnapshot.bind(form)).current;
  const subscribe = useRef(
    form === undefined
      ? undefined
      : (listener: () => void) => form.subscribe(listener),
  ).current;
  const snapshot = useSyncExternalStore(
    subscribe ?? (() => () => undefined),
    getSnapshot ?? (() => undefined),
    getSnapshot,
  );
  // 「设置>模型」目录（provider/model 下拉候选源——detail-dialog 编辑模式同径：挂载期
  // 一次性装载，目录缺席/调用拒绝 = undefined 容缺，仅回落继承空选项）
  const [modelCatalog, setModelCatalog] = useState<readonly ModelCatalogEntry[] | undefined>(undefined);
  useEffect(() => {
    const loader = props.modelCatalogLoader;
    if (loader === undefined) return;
    let alive = true;
    loader()
      .then((entries) => {
        if (alive) setModelCatalog(entries);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [props.modelCatalogLoader]);

  const [draft, setDraft] = useState<DefaultOptionsDraft>(() =>
    snapshot === undefined ? EMPTY_DRAFT : defaultOptionsDraftOf(snapshot.value),
  );
  // 在输脏标（ref 镜像——事件闭包与 render 期收敛裁决共读单源）
  const dirtyRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // 快照换代（volatile 通知 / 写后折返）→ 草稿收敛（draftFoldOnRevision 裁决——
  // 自身旧写折叠回读不清在输值，React render 期调整态认可式样）
  const [syncedRevision, setSyncedRevision] = useState(snapshot?.revision);
  if (snapshot !== undefined && syncedRevision !== snapshot.revision) {
    setSyncedRevision(snapshot.revision);
    const folded = draftFoldOnRevision(draft, defaultOptionsDraftOf(snapshot.value), dirtyRef.current);
    setDraft(folded.draft);
    dirtyRef.current = folded.dirty;
  }

  const edit = (next: DefaultOptionsDraft): void => {
    dirtyRef.current = true;
    setDraft(next);
  };

  if (form === undefined || snapshot === undefined) return null;
  if (snapshot.status !== "ready") {
    // loading / unavailable（namespace 未被服务 / memory 模式）——降级一行提示，不悬空警示块
    return (
      <div className="dswf-cfg-card" data-cfg-state={snapshot.status}>
        <p className="dswf-cfg-hint">
          {snapshot.status === "loading" ? "正在读取配置…" : "配置服务不可用——当前部署不支持在页面编辑插件配置。"}
        </p>
      </div>
    );
  }

  // 写径（bug 9577a867 伴生面）：blur 即时提交整组草稿（写 commit 传入的 next 本体——
  // draftRef 经 setState 异步更新，读它会滞后一次提交）+ 拒绝重试（官方 set 返回 false
  // = Host 拒绝且已做一次 recover 读）。重试窗口放宽（bug 908dc82e 链伴生）：连续三连写
  // 时 Host configEditor.edit 逐写 reconcile + entry fiber 热重载，重载窗口内的写被拒
  //（"Configuration plugin is no longer active" 族）——固定 2s 间隔 × 8 次（~16s）背压
  // 重试携 fresh revision 再写最新草稿；官方语义 = 客户端 re-read + re-apply（正确性
  // 仍归 Host 单点，重试只是收写完成的体验面）。
  const writeDraft = (patch: Record<string, string> | undefined, left: number): void => {
    const write = patch === undefined ? form.unset(FIELD) : form.set(FIELD, patch);
    write
      .then((accepted) => {
        if (accepted) return;
        if (left <= 0) {
          console.warn("[dsh-forge/expert-squad] defaultAgentOptions write not accepted——放弃本轮（等待下一次编辑重写）");
          return;
        }
        setTimeout(() => writeDraft(defaultOptionsPatchOf(draftRef.current), left - 1), 2_000);
      })
      .catch((error: unknown) => {
        console.error("[dsh-forge/expert-squad] defaultAgentOptions write rejected——等待下一次修订", error);
      });
  };
  const commit = (next: DefaultOptionsDraft): void => {
    edit(next);
    writeDraft(defaultOptionsPatchOf(next), 8);
  };

  const reasoningOptions: readonly { value: string; label: string }[] = REASONING_OPTIONS;

  return (
    <div className="dswf-cfg-card" data-cfg-state="ready">
      <h2 className="dswf-cfg-panel-title">默认 Agent 选项</h2>
      <div className="dswf-cfg-seg">默认路由</div>
      {/* 默认路由三字段行 4:4:1（D5，detail-dialog 编辑模式同构）：Provider/Model =
          Dialog 同款 FilterSelect（候选 = model-catalog 目录，Provider→Model 联动候选
          modelOptionsOf 同径；空态 = 继承父Agent 空选项，box 显当前值容缺不在目录的
          既有配置值），选值即提交——无自由文本输入；样式作用域（bug 7ea71703②）：
          cfg 行 select-box 通宽 + border-box，bundle 详情页容器下不溢出重叠。 */}
      <div className="dswf-cfg-row">
        <div className="dswf-cfg-field dswf-cfg-f4" data-cfg-field="provider">
          <label htmlFor="dswf-cfg-provider">Provider</label>
          <FilterSelect
            id="dswf-cfg-provider"
            ariaLabel="Provider"
            value={draft.provider}
            options={providerOptionsOf(modelCatalog)}
            onChange={(value) => commit({ ...draft, provider: value })}
          />
        </div>
        <div className="dswf-cfg-field dswf-cfg-f4" data-cfg-field="model">
          <label htmlFor="dswf-cfg-model">Model</label>
          <FilterSelect
            id="dswf-cfg-model"
            ariaLabel="Model"
            value={draft.model}
            options={modelOptionsOf(modelCatalog, draft.provider)}
            onChange={(value) => commit({ ...draft, model: value })}
          />
        </div>
        <div className="dswf-cfg-field dswf-cfg-f1" data-cfg-field="reasoning">
          <label htmlFor="dswf-cfg-reasoning">Reasoning</label>
          <FilterSelect
            id="dswf-cfg-reasoning"
            ariaLabel="Reasoning 档位"
            value={draft.reasoning}
            options={reasoningOptions}
            onChange={(value) => commit({ ...draft, reasoning: value })}
          />
        </div>
      </div>
      <div className="dswf-cfg-hint">
        默认路由对所有未覆写路由的专家生效；Reasoning「默认」= 不下发 effort，落模型缺省档
      </div>
    </div>
  );
}
