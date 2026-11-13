// settings-section —— project 配置节双缝（1.16；settings-unification 归属表 project 行：
// worktree.crossBranchRiskDismissed → 本插件自有 config 节）。两缝同节同源（WorktreePrefsSection
// 单渲染本体）：
//   - 单装缝：plugins.bundle.config（keyed/root——官方插件页本包详情「配置」区，消费点
//     dsh-client-ui-plugin-manager client.js:2522 renderSlot("plugins.bundle.config",
//     { view: "page" }, { entryKey: pkg.name })），占用键 = 本包名（PROJECT_PKG）；
//   - 详情页缝：plugins.detail.section（list/root——「包含的组件」RowsSection 之后，
//     client.js:2534），id = project-worktree-preferences，组件按 subject 门控
//     （subject.kind === "bundle" && subject.pkg.name === 本包名，expert-squad 同型先例）。
// 读写正门 = 官方 configForms 服务（revisioned 写径——describe/revision/stale 拒写归官方，
// 写落活动 profile cordis.patch.yml id 定向条目，volatile 通知 → 快照换代 → 面板热刷新）。
// 缺席降级：configForms 缺席 = 不注册节 fail-soft（零消费零 inject 边——dsh.client.inject
// 不声明 settings 域激活边，settings-unification 圆桌处方：configForms.get/whileServed
// 命名空间绑定不构成跨包消费；插件缺席降级由消费点现查 + whileServed 撤注承担，AGENTS 1.6）。
// bundle 自含纪律：零上游 import（configForms 面结构同型镜像，见 ./worktree-prefs.js）。
import { useSyncExternalStore, type ReactNode } from "react";
import { registerKeyedSection, type SectionSlotsFace } from "../keyed-section.js";
import {
  DISMISSED_KEY,
  dismissedOf,
  dismissedWriteOf,
  localFormMirror,
  type ConfigFormMirror,
  type ConfigFormsFace,
} from "./worktree-prefs.js";

export {
  DISMISSED_KEY,
  WORKTREE_FIELD,
  dismissedOf,
  dismissedWriteOf,
  localFormMirror,
  worktreePatchOf,
  type ConfigFormMirror,
  type ConfigFormsFace,
} from "./worktree-prefs.js";

// ── 偏好面解析缝（1.38 AC③——worktree-picker「不再提示」改 configForms 消费的取法门）：
// apply 期安装 ctx.configForms 解析缝（逐调用现查不缓存——AGENTS 1.6），picker 经
// worktreePrefsFaceOf 现查本插件 ConfigForm（namespace 候选序同双缝读写源）。
let prefsResolver: (() => ConfigFormsFace | undefined) | undefined;

/** 安装 configForms 解析缝（apply 期一次——resolver 逐调用现查） */
export function installWorktreePrefsFace(resolver: () => ConfigFormsFace | undefined): void {
  prefsResolver = resolver;
}

/**
 * 插件自有降级 ConfigForm（configForms 缺席形态——每取新建、状态单源 = localStorage 落盘值，
 * 多实例读写经持久化层天然同源；storage 在调用时点现取——renderer 与测试环境各自成立）。
 */
function localPrefsForm(): ConfigFormMirror {
  return localFormMirror();
}

/** 本插件 ConfigForm 现查（namespace 候选序 resolveForm 同源；缺席 = 插件自有承载面兜底）。 */
export function worktreePrefsFaceOf(): ConfigFormMirror | undefined {
  const forms = prefsResolver?.();
  const served = forms === undefined ? undefined : resolveForm(forms);
  return served ?? localPrefsForm();
}

/** 本插件包名（bundle.config keyed 占用键 = detail.section subject 判等键——双缝同源）。 */
export const PROJECT_PKG = "@dsh-forge/project";
/** 官方插件页 bundle 配置区 keyed 槽（client.js:3733 声明 kind: keyed/scope: root）。 */
export const BUNDLE_CONFIG_SLOT = "plugins.bundle.config";
/** bundle.config 占用键（= 本包名——官方消费点 entryKey: pkg.name 同源）。 */
export const BUNDLE_CONFIG_KEY = PROJECT_PKG;
/** 官方插件详情页 section list 槽（client.js:3749 声明 kind: list/scope: root）。 */
export const DETAIL_SECTION_SLOT = "plugins.detail.section";
/** 本插件配置节 list 登记 id（list slot 判同键；e2e/排障锚）。 */
export const DETAIL_SECTION_ID = "project-worktree-preferences";
/** settings namespace 短名（dev bundle 组合行 id——cordis.patch.yml insert id）。 */
export const SETTINGS_NAMESPACE = "project";
/**
 * namespace 候选集（expert-squad bug 9577a867 同族先判）：官方 Host settings describe 的
 * ns = profile 行 id（产品模板生成行 id = `dsh-forge-project`）而 dev bundle 组合行 id =
 * 短名 `project`——候选双覆盖，实际 namespace 在取 form 时点从候选序现查（读写同源）。
 */
const NAMESPACE_CANDIDATES: readonly string[] = [SETTINGS_NAMESPACE, `dsh-forge-${SETTINGS_NAMESPACE}`];

/** unknown → 对象窄化（缺席/非对象 = undefined）。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

/**
 * configForms 官方面取法（消费点现查 fail-soft——零 inject 边：cordis 注入边不声明
 * configForms，直取 ctx.configForms 未声明时抛错 → 兜底 reflect.get（局部成因 = 本包
 * 零 inject 边设计，AGENTS 1.6 先例同族）+ 面形状校验（get 函数在场）归一为 undefined；
 * 惰性 Service 未实例化（bug 9577a867 同族形态）= 形状校验不过 → 降级不注册；
 * 检测结果不 memoize——AGENTS 1.6 消费点现查）。
 */
function configFormsFaceOf(ctx: unknown): ConfigFormsFace | undefined {
  const rec = asRecord(ctx);
  let probe: unknown;
  try {
    probe = rec?.["configForms"];
  } catch {
    probe = undefined;
  }
  if (asRecord(probe)?.["get"] === undefined) {
    const reflect = asRecord(rec?.["reflect"]);
    const get = reflect?.["get"];
    if (typeof get === "function") {
      try {
        probe = get.call(reflect, "configForms");
      } catch {
        probe = undefined;
      }
    }
  }
  const face = asRecord(probe);
  if (face === undefined || typeof face.get !== "function") return undefined;
  return face as unknown as ConfigFormsFace;
}

/** 候选序现查本插件 ConfigForm（namespace 未被服务 = undefined——节降级不悬空）。 */
function resolveForm(forms: ConfigFormsFace): ConfigFormMirror | undefined {
  for (const ns of NAMESPACE_CANDIDATES) {
    const form = forms.get(ns);
    if (form !== undefined) return form;
  }
  return undefined;
}

/**
 * 注册 project 配置节（双缝——bundle.config keyed + detail.section list，单渲染本体）。
 * 三态门（bug 55c24319）：configForms 在场且 namespace 被 serve = 官方正门（whileServed
 * 在场门挂调用者 fiber——namespace 撤 serve 即拆卸，经 ctx.effect 级联）；configForms
 * 缺席/劣形，或 configForms 在场但 namespace 未被服务（中间态），= 插件自有配置承载面
 * localFormMirror 降级挂载（fix-1 用户裁定 2026-11-13④——持久化读写在插件域完成，行为
 * 与在场形态对齐；warn 留痕不静默，AGENTS §7 可观测性）。
 */
export function registerSettingsSection(
  ctx: {
    configForms?: unknown;
    effect?(factory: () => (() => void) | undefined, name?: string): (() => void) | undefined;
  },
  slots: SectionSlotsFace,
): (() => void) | undefined {
  const forms = configFormsFaceOf(ctx);
  if (forms === undefined) {
    // fix-1 降级形态：configForms serve 缺席 = 插件自有配置承载面挂载（行为与在场形态对齐）。
    console.warn("[dsh-forge/project] ctx.configForms absent; settings section mounted on plugin-owned config face");
    return mountSections(() => ({ form: localPrefsForm() }), slots);
  }
  const sectionFace = () => ({ form: resolveForm(forms) });
  const fallbackFace = () => ({ form: localPrefsForm() });
  /** serve 未命中降级（warn 留痕不静默——AGENTS §7）：configForms 在场但 namespace unserved。 */
  const mountFallback = (): (() => void) | undefined => {
    console.warn("[dsh-forge/project] configForms namespace unserved; settings section mounted on plugin-owned config face");
    return mountSections(fallbackFace, slots);
  };
  if (typeof forms.whileServed === "function") {
    // 官方 settings-* 族同型：whileServed 经 ctx.effect 挂调用者 fiber（卸载级联）。
    // 三态门（bug 55c24319）：serve 命中 = 官方正门；namespace unserved（含中间态）= 降级。
    const watch = (): (() => void) | undefined => {
      let mounted: (() => void) | undefined;
      let gated = false; // whileServed 回调已触发旗标（触发后挂载机会由回调独占）
      const disposer = forms.whileServed!(NAMESPACE_CANDIDATES, (served) => {
        gated = true;
        mounted?.();
        mounted = undefined;
        mounted = NAMESPACE_CANDIDATES.some((candidate) => served.has(candidate))
          ? mountSections(sectionFace, slots)
          : mountFallback();
        return () => {
          mounted?.();
          mounted = undefined;
        };
      });
      // unserved 挂起态现查兜底（bug 55c24319 官方宿主实测形态）：whileServed 回调不即时
      // 触发 = 挂载机会零——消费点现查（AGENTS 1.6）择门：get 命中 = 官方正门直挂；
      // namespace 未被服务 = localFormMirror 降级挂载。serve 态变化时回调先撤现挂再换门
      // （零双挂）。
      if (!gated) mounted = resolveForm(forms) !== undefined ? mountSections(sectionFace, slots) : mountFallback();
      return () => {
        disposer();
        mounted?.();
        mounted = undefined;
      };
    };
    return typeof ctx.effect === "function" ? ctx.effect(watch, "project: settings section watch") : watch();
  }
  return resolveForm(forms) !== undefined ? mountSections(sectionFace, slots) : mountFallback();
}

/** 双缝挂载单源（form 注入缝——在场/降级两形态共消费）。 */
function mountSections(
  sectionFace: () => { form?: ConfigFormMirror },
  slots: SectionSlotsFace,
): (() => void) | undefined {
  const keyed = registerKeyedSection(slots, {
    slot: BUNDLE_CONFIG_SLOT,
    key: BUNDLE_CONFIG_KEY,
    inject: sectionFace,
    component: ProjectBundleConfigSection,
  });
  const listed = registerKeyedSection(slots, {
    slot: DETAIL_SECTION_SLOT,
    id: DETAIL_SECTION_ID,
    inject: sectionFace,
    component: ProjectDetailSection,
  });
  if (keyed === undefined && listed === undefined) return undefined;
  return () => {
    keyed?.();
    listed?.();
  };
}

/**
 * worktree 偏好配置节（双缝单渲染本体）：跨分支风险确认「不再提示」位——勾选即
 * configForms revisioned 写（写 accepted 后快照换代热刷新；拒写 console.warn 留痕不静默）。
 * form 缺席 = render null（namespace 未被服务的降级形态——节注册了但写读面不可用不悬空）；
 * 快照 loading/unavailable = 降级一行提示。
 */
export function WorktreePrefsSection(props: {
  readonly form?: ConfigFormMirror;
}): ReactNode {
  const form = props.form;
  const getSnapshot = form?.getSnapshot.bind(form);
  const subscribe = form === undefined ? undefined : (listener: () => void) => form.subscribe(listener);
  const snapshot = useSyncExternalStore(
    subscribe ?? (() => () => undefined),
    getSnapshot ?? (() => undefined),
    getSnapshot ?? (() => undefined),
  );
  if (form === undefined || snapshot === undefined) return null;
  if (snapshot.status !== "ready") {
    return (
      <div className="dswf-wt-prefs" data-dswf-settings="project-worktree" data-cfg-state={snapshot.status}>
        <p data-cfg-hint>
          {snapshot.status === "loading" ? "正在读取配置…" : "配置服务不可用——当前部署不支持在页面编辑插件配置。"}
        </p>
      </div>
    );
  }
  const dismissed = dismissedOf(snapshot.value);
  const write = dismissedWriteOf(form);
  const onChange = (next: boolean): void => {
    write?.(next).then((accepted) => {
      if (!accepted) console.warn(`[dsh-forge/project] ${DISMISSED_KEY} write not accepted——等待下一次修订重写`);
    }).catch((error: unknown) => {
      console.error(`[dsh-forge/project] ${DISMISSED_KEY} write rejected——等待下一次修订`, error);
    });
  };
  return (
    <div className="dswf-wt-prefs" data-dswf-settings="project-worktree" data-cfg-state="ready">
      <h2 data-cfg-title>Worktree</h2>
      <label data-cfg-field="cross-branch-risk-dismissed">
        <input
          type="checkbox"
          checked={dismissed}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        跨分支切换不再提示
      </label>
      <p data-cfg-hint>勾选后同会话跨分支切换确认不再弹出（worktree.{DISMISSED_KEY}）</p>
    </div>
  );
}

/** bundle.config keyed 缝消费组件（keyed 键已限定本包——owner share 直透传渲染）。 */
export function ProjectBundleConfigSection(props: {
  readonly view?: unknown;
  readonly form?: ConfigFormMirror;
}): ReactNode {
  return <WorktreePrefsSection form={props.form} />;
}

/**
 * detail.section list 缝消费组件：subject 门控——仅本包 bundle 详情页渲染（他包/item/
 * 缺席 render null；expert-squad bug 83fe1393 同型——item 详情页表单归 plugins.item page
 * 缝单源，双缝同页不重复）。
 */
export function ProjectDetailSection(props: {
  readonly subject?: { kind?: unknown; pkg?: { name?: unknown } };
  readonly form?: ConfigFormMirror;
}): ReactNode {
  const subject = props.subject;
  if (subject === undefined || subject.kind !== "bundle" || subject.pkg?.name !== PROJECT_PKG) {
    return null;
  }
  return <WorktreePrefsSection form={props.form} />;
}
