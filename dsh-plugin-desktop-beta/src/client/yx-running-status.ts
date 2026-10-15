/**
 * Running-status copy.
 * The chat dictionary owns these two strings. Desktop rewrites them when they
 * are translated, which also covers a `t` bound before this plugin applies.
 */

const UPSTREAM_STATUS = '深度求索中'
const PRODUCT_STATUS = '深度思考中'

type Translate = (this: unknown, ns: string, key: string, params?: Record<string, unknown>) => string

interface LocalePrototype {
  translate?: Translate
}

function isRunningStatusKey(ns: string, key: string): boolean {
  return ns === 'chat' && (key === 'chat.deepDiving' || key === 'chat.deepDivingFor')
}

/** Point the live running-status lines at 深度思考中. @param locale - active locale runtime. @returns disposer restoring the previous translator. */
export function installRunningStatusCopy(locale: object): () => void {
  const proto = Object.getPrototypeOf(locale) as LocalePrototype | null
  const original = proto?.translate
  if (proto === null || typeof original !== 'function') return () => {}
  const patched: Translate = function (ns, key, params) {
    const text = original.call(this, ns, key, params)
    if (!isRunningStatusKey(ns, key) || !text.includes(UPSTREAM_STATUS)) return text
    return text.replaceAll(UPSTREAM_STATUS, PRODUCT_STATUS)
  }
  proto.translate = patched
  return () => {
    if (proto.translate === patched) proto.translate = original
  }
}
