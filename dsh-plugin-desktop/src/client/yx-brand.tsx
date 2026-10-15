/** Sidebar brand and the blank-session hero. Both use the Silverstar mark. */

import { useLayoutEffect, useRef, type ReactNode, type Ref } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { DESKTOP_DISPLAY_NAME } from '../product-identity.ts'

/** Blank-session headline. Replaces the upstream "探索未至之境". */
export const YX_HERO_SLOGAN_ZH = 'Silverstar，今天想完成什么'
/** English twin of {@link YX_HERO_SLOGAN_ZH}. */
export const YX_HERO_SLOGAN_EN = 'Silverstar, what do you want to finish today?'

const HERO_TITLES: Readonly<Record<string, string>> = {
  '探索未至之境': YX_HERO_SLOGAN_ZH,
  [YX_HERO_SLOGAN_ZH]: YX_HERO_SLOGAN_ZH,
  'Into the Unknown': YX_HERO_SLOGAN_EN,
  [YX_HERO_SLOGAN_EN]: YX_HERO_SLOGAN_EN,
}

const PREVIEW_LABELS = new Set(['预览版', 'Preview'])

/** The headline group that sits beside the hero mark, if this node is inside that hero. */
export function findHeroTitleGroup(start: Element): Element | undefined {
  let current: Element | null = start
  for (let depth = 0; depth < 8 && current !== null; depth += 1) {
    const sibling = current.nextElementSibling
    if (sibling !== null && heroTitle(sibling) !== undefined) return sibling
    current = current.parentElement
  }
  return undefined
}

/** Point the blank-session headline at Silverstar and hide the preview pill. */
export function rewriteHeroTitle(start: Element): void {
  const group = findHeroTitleGroup(start)
  if (group === undefined) return
  const spans = [...group.children]
  const title = spans[0]
  if (title !== undefined) {
    const next = HERO_TITLES[title.textContent?.trim() ?? '']
    if (next !== undefined && title.textContent !== next) title.textContent = next
  }
  for (const badge of spans.slice(1)) {
    if (PREVIEW_LABELS.has(badge.textContent?.trim() ?? '')) (badge as HTMLElement).hidden = true
  }
}

function heroTitle(group: Element): string | undefined {
  const title = group.firstElementChild
  const text = title?.textContent?.trim() ?? ''
  return text in HERO_TITLES ? text : undefined
}

/** Below the official brand occupants (priority 0), so the sidebar renders these. */
export const YX_BRAND_PRIORITY = -1

const PAGE_ICON_ID = 'dsh-yx-page-icon'
const PAGE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#111111"/><g transform="translate(3.4502 3)" fill="#ffffff"><path d="M3.17890888,3.6 L3.17890888,0 L16,0 L16,3.6 L3.17890888,3.6 Z M9.642,7.2 L9.64218223,10.8 L0,10.8 L0,3.6 L16,3.6 L16,7.2 L9.642,7.2 Z M3.17890888,18 L3.178,14.4 L0,14.4 L0,10.8 L16,10.8 L16,18 L3.17890888,18 Z"/></g></svg>`

/**
 * Tab title and favicon for a normal browser.
 * The desktop window title is owned by Electron and ignores this document title.
 */
export function installYxPageIdentity(): () => void {
  if (typeof document === 'undefined') return () => {}
  document.title = DESKTOP_DISPLAY_NAME
  if (document.getElementById(PAGE_ICON_ID) !== null) return () => {}
  for (const node of document.querySelectorAll('link[rel="icon"]')) node.remove()
  const link = document.createElement('link')
  link.id = PAGE_ICON_ID
  link.rel = 'icon'
  link.type = 'image/svg+xml'
  link.href = `data:image/svg+xml,${encodeURIComponent(PAGE_ICON)}`
  document.head.appendChild(link)
  return () => { link.remove() }
}

/**
 * Company mark, taken from the CloudPaw console icon.
 * The black tile keeps the shape readable on both light and dark sidebars.
 */
function CompanyMark({
  size,
  className,
  markRef,
}: {
  readonly size: number
  readonly className?: string | undefined
  readonly markRef?: Ref<SVGSVGElement> | undefined
}): ReactNode {
  return (
    <svg ref={markRef} className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#111111" />
      <g transform="translate(3.4502, 3)" fill="#ffffff">
        <path
          fillRule="nonzero"
          d="M3.17890888,3.6 L3.17890888,0 L16,0 L16,3.6 L3.17890888,3.6 Z M9.642,7.2 L9.64218223,10.8 L0,10.8 L0,3.6 L16,3.6 L16,7.2 L9.642,7.2 Z M3.17890888,18 L3.178,14.4 L0,14.4 L0,10.8 L16,10.8 L16,18 L3.17890888,18 Z"
        />
      </g>
    </svg>
  )
}

export function YxBrandMark({ size }: PropsRuntime<'sidebar.brand.mark'>): ReactNode {
  return <CompanyMark size={size} />
}

/**
 * One word, same size as the sidebar's own brand row. Tracking is tightened
 * so "Silverstar" reads as a wordmark instead of spaced-out text.
 */
export function YxBrandName(_props: PropsRuntime<'sidebar.brand.name'>): ReactNode {
  return (
    <span style={{ letterSpacing: '-0.03em' }}>
      Silverstar
    </span>
  )
}

/** Blank-session mark. The headline beside it is upstream copy, rewritten here. */
export function YxHeroMark({ size, className }: PropsRuntime<'conversation.hero.brand.mark'>): ReactNode {
  const mark = useRef<SVGSVGElement>(null)
  useLayoutEffect(() => {
    const node = mark.current
    if (node === null) return
    const apply = (): void => { rewriteHeroTitle(node) }
    apply()
    const group = findHeroTitleGroup(node)
    if (group === undefined) return
    const observer = new MutationObserver(apply)
    observer.observe(group, { subtree: true, childList: true, characterData: true })
    return () => { observer.disconnect() }
  }, [])
  return <CompanyMark className={className} markRef={mark} size={size} />
}
