// 3.2 单测 —— AC5 forge:pipeline 段渲染（段常量 / 四部分在场 / 标签包裹单源 /
// 不含 tool 说明 / 禁裸 {{）。口径：老 forge hook 注入文本平移（状态层说明/执行协议/
// 受限面声明）；Interface 9 标签表行 1——最外层唯一 <forge-pipeline>（XML_TAGS 单源），
// 单层不细分、内文纯文本；tool 说明不重复注入（dsh tool 注册面自带）。
import { describe, expect, it } from 'vitest'
import { XML_TAGS } from '@dsh-forge/contracts'
import { FORGE_SECTION_NAME, FORGE_SECTION_ORDER, renderForgePipelineSection } from './index.js'
import { FORGE_TOOL_NAMES } from '../tools/index.js'

const text = renderForgePipelineSection()

describe('AC5 段常量（Interface 8 定死）', () => {
  it('段名 forge:pipeline / order 510（knowledge 500 之后）', () => {
    expect(FORGE_SECTION_NAME).toBe('forge:pipeline')
    expect(FORGE_SECTION_ORDER).toBe(510)
  })
})

describe('renderForgePipelineSection（老 forge hook 文本平移三部分）', () => {
  it('① 状态层说明（状态层 = 唯一事实来源 / 盘上文件与 UI 是投影 / 禁手改 / 自然键身份；术语保留原文）', () => {
    expect(text).toContain('唯一事实来源')
    expect(text).toContain('投影')
    expect(text).toContain('禁止手改状态')
    expect(text).toContain('管线动词')
    expect(text).toContain('slug/local-id')
    expect(text).toContain('fix-N')
    expect(text).toContain('disc-N')
  })

  it('② 执行协议（领取-简报-提交循环 / blocked 承接 fix 链 / 查询前置 / 未注册上报；操作细节一行指针引至 run-tasks / submit-task 技能正本）', () => {
    expect(text).toContain('执行协议')
    expect(text).toContain('领取')
    expect(text).toContain('派发简报')
    expect(text).toContain('质量门')
    expect(text).toContain('绝不伪造')
    expect(text).toContain('blocked 须给出具体阻塞原因')
    expect(text).toContain('fix 任务')
    expect(text).toContain('自动恢复')
    expect(text).toContain('未注册')
    expect(text).toContain('run-tasks')
    expect(text).toContain('submit-task')
    // 去重契约：操作级细节不复制，正本指针在场
    expect(text).toContain('不在此复制')
  })

  it('③ 受限面声明（转移人类专属 / 禁直写状态存储与索引 / 提案裁决须用户决定）', () => {
    expect(text).toContain('受限面')
    expect(text).toContain('是人类决定')
    expect(text).toContain('代理不可用')
    expect(text).toContain('禁止直写状态层')
    expect(text).toContain('只经管线动词维护')
    expect(text).toContain('仅在用户已决定时记录')
  })

  it('④ 文档风格公约（mermaid 优先 / 文字精简 / 不留调整修复叙事；中文三要点，约束全部产出文档）', () => {
    expect(text).toContain('文档风格公约')
    expect(text).toContain('全部产出文档')
    expect(text).toContain('mermaid')
    expect(text).toContain('文字精简')
    expect(text).toContain('不留调整修复叙事')
    // 置于受限面声明之后
    expect(text.indexOf('受限面')).toBeLessThan(text.indexOf('文档风格公约'))
  })

  it('最外层唯一标签包裹：<forge-pipeline>（contracts XML_TAGS 单源）+ 单层不细分', () => {
    expect(text.startsWith(`<${XML_TAGS.forgePipeline}>\n`)).toBe(true)
    expect(text.endsWith(`</${XML_TAGS.forgePipeline}>`)).toBe(true)
    expect(XML_TAGS.forgePipeline).toBe('forge-pipeline')
    // 内层无第二级标签（单层不细分——内文纯文本）
    const body = text.slice(`<${XML_TAGS.forgePipeline}>`.length, -`</${XML_TAGS.forgePipeline}>`.length)
    expect(body).not.toMatch(/<[a-z-]+>/)
  })

  it('不含 tool 说明（六工具名零出现——注册面自描述，无副本；transitionTask/transitionFeature 亦无）', () => {
    for (const name of [...FORGE_TOOL_NAMES, 'transitionTask', 'transitionFeature']) {
      expect(text, `段文本不得含工具名 ${name}`).not.toContain(name)
    }
    // 参数说明形制（tool 定义机械渲染产物）不在场
    expect(text).not.toMatch(/\(string, (required|optional)\)/)
  })

  it('段文本禁用裸 {{（SystemPrompt 默认插值，未知引用会炸渲染）', () => {
    expect(text).not.toContain('{{')
  })
})

describe('1.16 文档位置动态注入（forgeDir 注入 + 目录树段 + 回退）', () => {
  const FORGE_DIR = 'Z:/ws/demo/.forge'

  it('注入 forgeDir：绝对路径先行 + 目录树段介绍 docs/{proposals,features,probes} 与 {slug} 级布局', () => {
    const injected = renderForgePipelineSection({ forgeDir: FORGE_DIR })
    expect(injected).toContain('文档位置')
    expect(injected).toContain(FORGE_DIR)
    expect(injected).toContain('docs/proposals/{slug}/')
    expect(injected).toContain('docs/features/{slug}/')
    expect(injected).toContain('docs/probes/')
    // 绝对路径先于目录树
    expect(injected.indexOf(FORGE_DIR)).toBeLessThan(injected.indexOf('目录树'))
    // 注入值出现于状态层说明之后、执行协议之前
    expect(injected.indexOf('唯一事实来源')).toBeLessThan(injected.indexOf('文档位置'))
    expect(injected.indexOf('目录树')).toBeLessThan(injected.indexOf('执行协议'))
  })

  it('既有断言对注入版同样全绿（标签包裹 / 禁裸 {{ / 无工具名——注入不破段契约）', () => {
    const injected = renderForgePipelineSection({ forgeDir: FORGE_DIR })
    expect(injected.startsWith(`<${XML_TAGS.forgePipeline}>\n`)).toBe(true)
    expect(injected.endsWith(`</${XML_TAGS.forgePipeline}>`)).toBe(true)
    expect(injected).not.toContain('{{')
    expect(injected).not.toContain('queryTask')
  })

  it('回退：缺省/空白/未知 forgeDir = 省略文档位置与目录树段（渲染不炸、其余部分原样）', () => {
    for (const vars of [undefined, { forgeDir: undefined }, { forgeDir: '' }, { forgeDir: '   ' }]) {
      const fallback = renderForgePipelineSection(vars)
      expect(fallback).not.toContain('文档位置')
      expect(fallback).not.toContain('目录树')
      expect(fallback).not.toContain('docs/proposals')
      // 其余四部分不受回退影响
      expect(fallback).toContain('唯一事实来源')
      expect(fallback).toContain('执行协议')
      expect(fallback).toContain('受限面')
      expect(fallback).toContain('文档风格公约')
    }
  })

  it('尾部路径分隔符归一（不落双斜杠结尾的裸路径）', () => {
    const injected = renderForgePipelineSection({ forgeDir: 'Z:/ws/demo/.forge/' })
    expect(injected).toContain('Z:/ws/demo/.forge\n')
  })
})
