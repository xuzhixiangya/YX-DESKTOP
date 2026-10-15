// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { describe, expect, it, vi } from 'vitest'
import { DESKTOP_DISPLAY_NAME } from '../src/product-identity.ts'
import {
  installYxPageIdentity,
  rewriteHeroTitle,
  YxBrandMark,
  YxBrandName,
  YxHeroMark,
  YX_BRAND_PRIORITY,
  YX_HERO_SLOGAN_EN,
  YX_HERO_SLOGAN_ZH,
} from '../src/client/yx-brand.tsx'

describe('Silverstar sidebar brand', () => {
  it('draws the company tile and the Silverstar wordmark', () => {
    const mark = renderToStaticMarkup(createElement(YxBrandMark, { size: 24 }))
    const name = renderToStaticMarkup(createElement(YxBrandName, {}))

    expect(YX_BRAND_PRIORITY).toBeLessThan(0)
    expect(mark).toContain('<svg')
    expect(mark).toContain('fill="#111111"')
    expect(mark).not.toContain('deepseek')
    expect(name).toContain('Silverstar')
    expect(name).not.toContain('HARNESS')
  })

  it('replaces the browser tab title and favicon', () => {
    document.title = 'DeepSeek Harness'
    const upstream = document.createElement('link')
    upstream.rel = 'icon'
    upstream.href = './favicon.svg'
    document.head.appendChild(upstream)

    installYxPageIdentity()

    expect(document.title).toBe(DESKTOP_DISPLAY_NAME)
    const icons = [...document.querySelectorAll('link[rel="icon"]')]
    expect(icons).toHaveLength(1)
    expect(icons[0]?.getAttribute('href')).toContain('data:image/svg+xml,')
    expect(icons[0]?.getAttribute('href')).toContain('%23111111')
  })

})

describe('blank-session headline', () => {
  it('replaces the upstream slogan and hides the preview pill', () => {
    const dom = new JSDOM(`<div class="headline">
      <span class="hitbox"><svg id="mark"></svg></span>
      <span class="title"><span>探索未至之境</span><span>预览版</span></span>
    </div>`)
    const mark = dom.window.document.getElementById('mark')
    if (mark === null) throw new Error('missing mark')
    rewriteHeroTitle(mark)
    const title = dom.window.document.querySelector('.title')
    expect(title?.children[0]?.textContent).toBe(YX_HERO_SLOGAN_ZH)
    expect((title?.children[1] as HTMLElement | undefined)?.hidden).toBe(true)

    const english = new JSDOM(`<div>
      <svg id="mark"></svg>
      <span><span>Into the Unknown</span><span>Preview</span></span>
    </div>`)
    const englishMark = english.window.document.getElementById('mark')
    if (englishMark === null) throw new Error('missing english mark')
    rewriteHeroTitle(englishMark)
    expect(english.window.document.querySelector('span > span')?.textContent).toBe(YX_HERO_SLOGAN_EN)
    rewriteHeroTitle(englishMark)
    expect(english.window.document.querySelector('span > span')?.textContent).toBe(YX_HERO_SLOGAN_EN)
  })

  it('mounts the tile beside the headline and keeps the slogan if the old text comes back', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const host = document.createElement('div')
    host.innerHTML = '<span class="hitbox"></span><span class="title"><span>探索未至之境</span><span>预览版</span></span>'
    document.body.append(host)
    const hitbox = host.querySelector('.hitbox')
    if (hitbox === null) throw new Error('missing hitbox')
    const root: Root = createRoot(hitbox)
    await act(async () => {
      root.render(createElement(YxHeroMark, { size: 34 }))
    })
    expect(hitbox.querySelector('svg')?.getAttribute('width')).toBe('34')
    expect(hitbox.querySelector('svg')?.innerHTML).toContain('#111111')
    const title = host.querySelector('.title')
    expect(title?.children[0]?.textContent).toBe(YX_HERO_SLOGAN_ZH)
    expect((title?.children[1] as HTMLElement | undefined)?.hidden).toBe(true)

    const headline = title?.children[0]
    if (headline === undefined) throw new Error('missing headline')
    headline.textContent = '探索未至之境'
    await act(async () => { await new Promise(resolve => { setTimeout(resolve, 0) }) })
    expect(headline.textContent).toBe(YX_HERO_SLOGAN_ZH)
    await act(async () => { root.unmount() })
    host.remove()
  })
})
