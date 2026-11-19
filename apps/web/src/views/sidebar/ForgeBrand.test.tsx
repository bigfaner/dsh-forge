// ForgeBrand 单测 —— 壳品牌行两件（sidebar.brand.mark/name 内容洞位本体；1.6 断言自
// ForgeWorkspacePanel.test 拆出——面板本体已迁 @dsh-forge/project，品牌件留壳）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FISH_LOGO_PATH } from '@deepseek-ai/dsh-client-ui-primitives'
import { ForgeBrandMark, ForgeBrandName } from './ForgeBrand.js'

describe('品牌行件（壳品牌行的内容洞位）', () => {
  it('mark：「鲸游书海」内联 SVG（fix-38）——官方鲸几何零拷贝 + 尺寸随壳请求 + currentColor 单色 + aria-hidden', () => {
    const markup = renderToStaticMarkup(<ForgeBrandMark size={24} />)
    // 母版三层（docs/brand/whale-sea-mark.svg）：双层书页浪 + 鲸 + 闪电喷泉，viewBox 缩放
    expect(markup).toContain('viewBox="0 0 24 24"')
    expect(markup).toContain('width="24"')
    expect(markup).toContain('height="24"')
    expect(markup).toContain('aria-hidden="true"')
    // 几何零拷贝（任务①红线）：鲸剪影 = 官方 FISH_LOGO_PATH 经导出面消费（非字面量拷贝）
    expect(markup).toContain(`d="${FISH_LOGO_PATH}"`)
    expect(markup).toContain('transform="translate(5.0 4.9) scale(0.62)"')
    // 产品自有元素照母版内联：书页浪双路径（.88/.6 档）+ 闪电喷泉
    expect(markup).toContain('opacity=".88"')
    expect(markup).toContain('opacity=".6"')
    expect(markup).toContain('M13.0 1.1 11.4 3.5 H12.4 L11.1 5.1 13.8 2.6 H12.8 Z')
    // 单色纪律（docs/brand 禁用约定沿 fix-15）：四路径全 currentColor，零固定色值
    expect(markup.match(/fill="currentColor"/g)).toHaveLength(4)
    // 旧「知」字方块/fix-15「书 + 闪电」几何均已退役（历史档归 docs/brand）
    expect(markup).not.toContain('知')
    expect(markup).not.toContain('M13.6 1.5 9.1 9.7')
    // 尺寸随壳请求缩放（品牌行/rail 24，其它请求同型缩放——16px 可辨锚 = 鲸尾卷 + 闪电）
    expect(renderToStaticMarkup(<ForgeBrandMark size={16} />)).toContain('width="16"')
  })
  it('name：dsh-forge 字标（自持内容）', () => {
    expect(renderToStaticMarkup(<ForgeBrandName />)).toContain('dsh-forge')
  })
})
