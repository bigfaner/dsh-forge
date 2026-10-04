// e2e 向导浏览器导航族（fix-37 ① 收编——dirRow/enterDir ×7 同源拷贝单源）。
// 边界口径（探针 7 实测）：「已注册」标记与目录名零空白拼接（行文本 = "comp-a已注册"），
// 尾界放宽为 空白|行尾|非名字字符（防 'Local' 误中 'LocalLow' 的前缀碰撞保持不变）。
import { expect, type Page } from '@playwright/test'

/** 浏览器行定位（名称精确匹配——防前缀碰撞） */
export function dirRow(page: Page, name: string): ReturnType<Page['locator']> {
  return page
    .locator('.dswf-fb-item', { hasText: new RegExp(`(?:^|\\s)${name}(?=\\s|$|[^\\w.-])`) })
    .first()
}

/** 双击进入目录并等待列举就绪（面包屑出现目标段） */
export async function enterDir(page: Page, name: string): Promise<void> {
  await dirRow(page, name).dblclick()
  await expect(page.locator('.dswf-fb-crumb-current')).toHaveText(name, { timeout: 15_000 })
}
