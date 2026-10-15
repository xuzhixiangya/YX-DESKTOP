import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { expect, it } from 'vitest'
import { DESKTOP_HARNESS_NAME, installSystemPromptBrand } from '../src/system-prompt-brand.ts'

it('renames DeepSeek Harness in the assembled system prompt and leaves other deepseek wording alone', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt)
    installSystemPromptBrand(ctx)
    ctx.systemPrompt.section({
      name: 'app:web-surface',
      order: ctx.systemPrompt.getSectionOrder('WEB_SURFACE'),
      text: 'You are interacting with the user through the DeepSeek Harness Web GUI. The model is deepseek-v4-flash.',
    })
    ctx.systemPrompt.section({
      name: 'harness:source',
      order: ctx.systemPrompt.getSectionOrder('HARNESS_SOURCE'),
      text: 'The DeepSeek Harness implementation checkout is at /tmp/deepseek-harness.',
    })
    const rendered = renderPrompt(await ctx.systemPrompt.assemble())
    expect(rendered).toContain(`You are an AI agent powered by ${DESKTOP_HARNESS_NAME}.`)
    expect(rendered).toContain(`through the ${DESKTOP_HARNESS_NAME} Web GUI`)
    expect(rendered).toContain(`The ${DESKTOP_HARNESS_NAME} implementation checkout is at /tmp/deepseek-harness.`)
    expect(rendered).toContain('deepseek-v4-flash')
    expect(rendered).not.toContain('DeepSeek Harness')
  } finally {
    await ctx.fiber.dispose()
  }
})

it('restores the upstream system prompt after the brand listener is removed', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt)
    const stop = installSystemPromptBrand(ctx)
    stop()
    const rendered = renderPrompt(await ctx.systemPrompt.assemble())
    expect(rendered.startsWith('You are an AI agent powered by DeepSeek Harness.')).toBe(true)
  } finally {
    await ctx.fiber.dispose()
  }
})
