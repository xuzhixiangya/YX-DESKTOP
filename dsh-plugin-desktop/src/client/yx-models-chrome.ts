/**
 * The company gateway occupies the official provider seat.
 * DeepSeek's own row is hidden, and the YX row cannot be removed.
 */

const HIDDEN_PROVIDER_LABELS = [
  'DeepSeek (deepseek-official)',
  'DeepSeek 账号 (deepseek-account)',
  'DeepSeek Account (deepseek-account)',
] as const

const YX_PROVIDER_LABEL = 'YX (yx-gateway)'
const CUSTOM_LABELS = new Set(['自定义', 'Custom'])
/** Official catalog and account groups in the composer menu. The heading is the only name the menu renders. */
const HIDDEN_MENU_HEADINGS = new Set(['DeepSeek', 'DeepSeek 账号', 'DeepSeek Account'])
const YX_MENU_HEADING = 'YX'

/** What to do with one provider-row button, based on its accessible name. */
export function yxModelsButtonAction(label: string): 'hide-card' | 'hide-button' | 'trim-card' | 'keep' {
  if (HIDDEN_PROVIDER_LABELS.some(provider => label.endsWith(provider))) return 'hide-card'
  if (!label.endsWith(YX_PROVIDER_LABEL)) return 'keep'
  return label.startsWith('删除') || label.startsWith('Delete') ? 'hide-button' : 'trim-card'
}

/**
 * Author styles on these cards set `display`, which wins over the `hidden`
 * attribute. An important inline value is what actually removes them.
 */
function conceal(node: HTMLElement): void {
  node.hidden = true
  node.style.setProperty('display', 'none', 'important')
}

/** Hide DeepSeek's provider card, put YX first, and remove its delete control and custom tag. */
export function applyYxModelsChrome(root: ParentNode): void {
  const buttons = root.querySelectorAll('button[aria-label]')
  for (const node of buttons) {
    if (!(node instanceof Element)) continue
    const label = node.getAttribute('aria-label') ?? ''
    const action = yxModelsButtonAction(label)
    if (action === 'keep') continue
    const card = node.closest('li')
    if (action === 'hide-card') {
      if (card instanceof HTMLElement) conceal(card)
      continue
    }
    if (action === 'hide-button' && node instanceof HTMLElement) conceal(node)
    if (!(card instanceof HTMLElement)) continue
    card.style.order = '-1'
    for (const span of card.querySelectorAll('span')) {
      if (CUSTOM_LABELS.has(span.textContent?.trim() ?? '') && span instanceof HTMLElement) conceal(span)
    }
  }
  applyModelMenuChrome(root)
}

/** Drop the built-in DeepSeek groups and put the company gateway group first. */
function applyModelMenuChrome(root: ParentNode): void {
  const headings = root.querySelectorAll('[data-menu-group-heading]')
  for (const heading of headings) {
    if (!(heading instanceof HTMLElement)) continue
    const section = heading.closest('[data-menu-group]')
    if (!(section instanceof HTMLElement)) continue
    const name = heading.textContent?.trim() ?? ''
    if (HIDDEN_MENU_HEADINGS.has(name)) {
      conceal(section)
      section.dataset.yxHiddenProvider = ''
      for (const button of section.querySelectorAll('button')) {
        if (button instanceof HTMLButtonElement) skipHiddenModelFocus(button)
      }
      continue
    }
    if (name !== YX_MENU_HEADING) continue
    const parent = section.parentElement
    if (parent !== null && parent.firstElementChild !== section) parent.insertBefore(section, parent.firstElementChild)
  }
}

/**
 * Arrow keys still walk the menu in its original order, so a hidden DeepSeek
 * row has to hand focus to a row the user can see.
 */
function skipHiddenModelFocus(button: HTMLButtonElement): void {
  if (button.dataset.yxFocusSkip === 'true') return
  button.dataset.yxFocusSkip = 'true'
  const native = HTMLElement.prototype.focus
  button.focus = function focus(options?: FocusOptions) {
    const menu = button.closest('[role="menu"]')
    if (!(menu instanceof HTMLElement)) return
    const radios = [...menu.querySelectorAll<HTMLButtonElement>('button[role="menuitemradio"]')]
    const visible = radios.filter(item => item.closest('[data-yx-hidden-provider]') === null)
    const active = document.activeElement
    const from = active instanceof HTMLButtonElement ? radios.indexOf(active) : -1
    const here = radios.indexOf(button)
    const target = from === -1 || here === -1
      ? visible[0]
      : here > from
        ? visible.find(item => radios.indexOf(item) > here)
        : [...visible].reverse().find(item => radios.indexOf(item) < here)
    if (target !== undefined) native.call(target, options)
  }
}

/** Keep the Models page aligned while its cards mount and refresh. */
export function installYxModelsChrome(target: ParentNode & { ownerDocument?: Document } = globalThis.document?.documentElement): () => void {
  if (target === undefined || typeof MutationObserver === 'undefined') return () => {}
  let frame = 0
  const apply = (): void => {
    frame = 0
    applyYxModelsChrome(target)
  }
  const schedule = (): void => {
    if (frame !== 0) return
    const view = target.ownerDocument?.defaultView
    frame = view?.requestAnimationFrame(apply) ?? 0
    if (frame === 0) apply()
  }
  const observer = new MutationObserver(schedule)
  observer.observe(target, { childList: true, subtree: true })
  apply()
  return () => {
    observer.disconnect()
    if (frame !== 0) target.ownerDocument?.defaultView?.cancelAnimationFrame(frame)
  }
}
