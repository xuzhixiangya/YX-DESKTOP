// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { applyYxModelsChrome, yxModelsButtonAction } from '../src/client/yx-models-chrome.ts'

it('treats YX as the provider card that replaces DeepSeek', () => {
  expect(yxModelsButtonAction('编辑 DeepSeek (deepseek-official)')).toBe('hide-card')
  expect(yxModelsButtonAction('编辑 DeepSeek 账号 (deepseek-account)')).toBe('hide-card')
  expect(yxModelsButtonAction('Delete YX (yx-gateway)')).toBe('hide-button')
  expect(yxModelsButtonAction('编辑 YX (yx-gateway)')).toBe('trim-card')
  expect(yxModelsButtonAction('编辑 OpenAI (openai)')).toBe('keep')
})

it('hides DeepSeek and the YX delete control', () => {
  document.body.innerHTML = `
    <ul>
      <li>
        <span>YX</span><span>自定义</span>
        <button type="button" aria-label="编辑 YX (yx-gateway)">编辑</button>
        <button type="button" aria-label="删除 YX (yx-gateway)">删除</button>
      </li>
      <li>
        <span>DeepSeek</span>
        <button type="button" aria-label="编辑 DeepSeek (deepseek-official)">编辑</button>
      </li>
    </ul>`
  applyYxModelsChrome(document.body)
  const cards = [...document.querySelectorAll('li')]
  const hidden = (selector: string): boolean => {
    const node = cards[0]?.querySelector(selector)
    return node instanceof HTMLElement && node.hidden === true
  }
  expect(cards[0]?.hidden).toBe(false)
  expect(cards[0]?.style.order).toBe('-1')
  expect(hidden('span:nth-of-type(2)')).toBe(true)
  const removed = cards[0]?.querySelector('button[aria-label="删除 YX (yx-gateway)"]')
  expect(removed instanceof HTMLElement && removed.style.getPropertyPriority('display')).toBe('important')
  expect(hidden('button[aria-label="编辑 YX (yx-gateway)"]')).toBe(false)
  expect(cards[1]?.style.getPropertyValue('display')).toBe('none')
  expect(cards[1]?.style.getPropertyPriority('display')).toBe('important')
})

it('hides the built-in DeepSeek menu and puts YX first', () => {
  document.body.innerHTML = `
    <div role="menu">
      <section data-menu-group>
        <div data-menu-group-heading>DeepSeek</div>
        <button type="button" role="menuitemradio">DeepSeek-V41-Flash</button>
        <button type="button" role="menuitemradio">DeepSeek-V4-Pro</button>
      </section>
      <section data-menu-group>
        <div data-menu-group-heading>custom-response</div>
        <button type="button" role="menuitemradio">kept</button>
      </section>
      <section data-menu-group>
        <div data-menu-group-heading>YX</div>
        <button type="button" role="menuitemradio">deepseek/deepseek-v4.1-flash</button>
      </section>
    </div>`
  applyYxModelsChrome(document.body)
  const menu = document.querySelector('[role="menu"]')
  const groups = [...document.querySelectorAll('[data-menu-group]')]
  expect(groups[0]?.querySelector('[data-menu-group-heading]')?.textContent).toBe('YX')
  expect(groups[1]?.querySelector('[data-menu-group-heading]')?.textContent).toBe('DeepSeek')
  expect((groups[1] as HTMLElement | undefined)?.style.getPropertyValue('display')).toBe('none')
  const hiddenChoice = groups[1]?.querySelector('button')
  const yxChoice = groups[0]?.querySelector('button')
  if (!(hiddenChoice instanceof HTMLButtonElement) || !(yxChoice instanceof HTMLButtonElement)) throw new Error('missing menu rows')
  hiddenChoice.focus()
  expect(document.activeElement).toBe(yxChoice)
  expect(menu).not.toBeNull()
})
