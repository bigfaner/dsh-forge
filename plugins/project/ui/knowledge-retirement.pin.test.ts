// knowledge 残留核销 pin（knowledge-plugin-migration 1.4——验收 2 白名单口径）：本批
// 28 件迁出 + 注册行退役后，plugins/project 内 knowledge 域源码命中必须零未列——白名单
// = 具名常量/字面 + 逐条理由注释；失败回显命中文件 + 行号 + 片段（红-first，静默链式
// 过滤不可接受）。扫描口径：源码行（剥纯注释行后）含词边界 knowledge 命中即列；测试
// 文件同扫（fixture 断言字面同口径白名单）。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** 白名单（命中行须匹配至少一条模式——逐条理由见内注；模式演进 = 本文件内注释记账） */
const WHITELIST: readonly { readonly pattern: RegExp; readonly reason: string }[] = [
  // dock-tabs RPC client knowledge 切片（forge:knowledge/* 七通道契约面）：通道键 = contracts
  // KNOWLEDGE_CHANNELS 本尊（宿主侧 provider 不动），键面双侧同钉由 dock-tabs/rpc-channels-mirror-pin.test.ts 守卫
  { pattern: /\bknowledge: ForgeKnowledgeRpc\b/, reason: 'dock-tabs RPC client knowledge 切片——契约面，通道键 pin 守卫' },
  { pattern: /^knowledge: \{$/, reason: 'dock-tabs RPC client knowledge 切片对象字面——同上' },
  { pattern: /forge:knowledge\//, reason: 'forge:knowledge/* 通道字面 = contracts 正典键本尊' },
  { pattern: /KNOWLEDGE_/, reason: 'contracts 具名常量族（KNOWLEDGE_CHANNELS / ERR_*KNOWLEDGE_DIR 码表键）' },
  { pattern: /KEYED_SECTION_M2_KNOWLEDGE_DIR_SLOT|project\.section\.knowledge-dir/, reason: 'keyed-section 宿主单点声明常量（knowledge 消费方 apply 期现查锚——settings-unification 契约）' },
  { pattern: /dswf-knowledge|data-dswf-nav="knowledge"/, reason: '面板/行 id 契约字面（官方槽键——桥 nav 与 hero 自驱动排除面，非域残留）' },
  { pattern: /\bshowKnowledge\b/, reason: '官方 layout 桥 API 面（壳 C 类域 createWorkbenchBridge 动作——project 合法消费）' },
  { pattern: /knowledge: true/, reason: '测试 seam fake 字面（__DSH_FORGE_HOST_PLUGINS__ 装载位缝——hero 自驱动门测试注入）' },
  { pattern: /knowledge 消费方/, reason: 'keyed-section 测试标题字符串（宿主单点声明常量叙述——非域引用）' },
  { pattern: /knowledgePlugin/, reason: 'boot manifest 装载位键（壳↔host 装载契约——面呈现门控源，非域残留）' },
  { pattern: /KnowledgeBindings|knowledge-bindings/, reason: 'host 绑定表刷新缝（ipc/bindings 域本体留宿主——依赖缝注入方向合法）' },
  { pattern: /declaredBy: 'knowledge'|already declared by knowledge/, reason: 'forgeDirs 第三方声明测试 fixture（knowledge.root 样张——declaredBy 归属键，host 注册机制测试）' },
  { pattern: /knowledge\.root/, reason: 'forgeDirs 第三方 dirKey（knowledge 插件声明键——host 侧注册/错误文案举例）' },
  { pattern: /deriveKnowledgeDir/, reason: '白名单条目·已处置——本体下沉 @dsh-forge/lib-path/path-key（1.4），本位 re-export 消费面' },
  { pattern: /knowledgeDir/, reason: '项目行 knowledge_dir 列退役后只读投影（host ipc/host 面字段——非域逻辑）' },
  { pattern: /packages\/knowledge/, reason: 'timeline 测试 fixture 字面（任意示例路径——非域引用）' },
  { pattern: /'knowledge\.[A-Za-z]+'/, reason: 'overview drawer/task-tab 测试假 client 标记字面（通道方法名 fixture——非域引用）' },
  { pattern: /knowledge: \{ (browse|fail)/, reason: 'overview 测试假 client 对象字面（通道切片 fixture——非域引用）' },
  { pattern: /\.knowledge/, reason: '知识库目录缺省值字面（ov-head 测试 fixture——`<工作区>/.knowledge` 产品口径）' },
]

const ROOTS = ['plugins/project/ui', 'plugins/project/host']
const EXCLUDE = ['knowledge-retirement.pin.test.ts', 'rpc-channels-mirror-pin.test.ts']
// ——rpc-channels-mirror-pin.test.ts = 白名单守卫器具自身（对账 knowledge 正本路径），自指豁免

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) yield* walk(p)
    else if (/\.(ts|tsx)$/.test(name) && !EXCLUDE.includes(name)) yield p
  }
}

describe('project knowledge 域残留核销（白名单口径——验收 2）', () => {
  it('plugins/project 内 knowledge 命中全部在白名单（零未列命中——失败回显命中面）', () => {
    const unlisted: string[] = []
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const lines = readFileSync(file, 'utf8').split(/\r?\n/)
        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i]!.trim()
          // 剥纯注释行（头注/叙述面非源码命中；白名单只对账代码与字面）
          if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
          if (!/\bknowledge\b/i.test(trimmed)) continue
          const hit = WHITELIST.some((entry) => entry.pattern.test(trimmed))
          if (!hit) unlisted.push(`${file}:${i + 1}: ${trimmed}`)
        }
      }
    }
    expect(unlisted, `未列入白名单的 knowledge 命中（逐条补白名单 + 理由注释后放行）：\n${unlisted.join('\n')}`).toEqual([])
  })

  it('白名单模式自检：每条 pattern 均附理由（防静默链式过滤——白名单条目变更须在提交说明逐条给理由）', () => {
    for (const entry of WHITELIST) {
      expect(entry.reason.length, `白名单条目缺理由：${String(entry.pattern)}`).toBeGreaterThan(10)
    }
    expect(WHITELIST.length).toBeGreaterThanOrEqual(10)
  })
})
