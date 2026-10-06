// 3.2 单测 —— AC5 forge:pipeline 段渲染（段常量 / 三部分在场 / 标签包裹单源 /
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
  it('① 状态层说明（状态层 = 唯一 SoT / 盘上文件与 UI 是投影 / 禁手改 / 自然键身份）', () => {
    expect(text).toContain('single source of truth')
    expect(text).toContain('projections')
    expect(text.toLowerCase()).toContain('never edit state by hand')
    expect(text).toContain('slug/local-id')
    expect(text).toContain('fix-N')
    expect(text).toContain('disc-N')
  })

  it('② 执行协议（领取-简报-提交循环 / blocked 承接 fix 链 / 查询前置 / 未注册上报）', () => {
    expect(text).toContain('Execution protocol')
    expect(text).toContain('claiming')
    expect(text).toContain('dispatch brief')
    expect(text).toContain('quality-gate')
    expect(text).toContain('never fabricate')
    expect(text).toContain('blocked requires')
    expect(text).toContain('fix task')
    expect(text).toContain('restored automatically')
    expect(text).toContain('not registered')
  })

  it('③ 受限面声明（转移人类专属 / 禁直写状态存储与索引 / 提案裁决须用户决定）', () => {
    expect(text).toContain('Restricted face')
    expect(text).toContain('human decisions')
    expect(text).toContain('not available to agents')
    expect(text).toContain('Never write to the state layer')
    expect(text).toContain('exclusively through the pipeline verbs')
    expect(text).toContain('only recorded when the user has decided')
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
