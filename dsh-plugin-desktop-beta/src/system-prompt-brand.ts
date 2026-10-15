/**
 * Product name shown to the model in place of the upstream harness name.
 * Only the system-prompt sections change; tool schemas and runtime context stay upstream.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { AssembledSection } from '@deepseek-ai/dsh-system-prompt'

const UPSTREAM_HARNESS_NAME = 'DeepSeek Harness'

/** Name the model should see for this desktop product. */
export const DESKTOP_HARNESS_NAME = 'YX（银星智能） Harness'

function brandSection(section: AssembledSection): AssembledSection {
  if (!section.text.includes(UPSTREAM_HARNESS_NAME)) return section
  return { ...section, text: section.text.replaceAll(UPSTREAM_HARNESS_NAME, DESKTOP_HARNESS_NAME) }
}

/**
 * Rewrite assembled system-prompt sections after every other listener.
 * @param ctx - host context that assembles model prompts.
 * @returns disposer that restores the upstream wording.
 */
export function installSystemPromptBrand(ctx: Context): () => boolean {
  return ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    return { ...assembled, sections: assembled.sections.map(brandSection) }
  }, { prepend: true })
}
