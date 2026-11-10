import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { renderMarkdown } from './mermaid.ts'

// When true, replies show their mermaid source as written.
const showSource = atom({ plugin: 'mermaid-term', key: 'showSource' } as const, false)

const MERMAID = /(`{3,}|~{3,})[ \t]*mermaid/i
// Room the transcript takes before a reply's text: the bullet and a margin.
const GUTTER = 4

const cache = new Map<string, string>()

function draw(text: string, width: number): string {
  const key = `${width}\u0000${text}`
  let out = cache.get(key)
  if (out === undefined) {
    out = renderMarkdown(text, width)
    if (cache.size > 200) cache.delete(cache.keys().next().value!)
    cache.set(key, out)
  }
  return out
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mermaid',
      description: 'Toggle mermaid blocks between drawn diagrams and their source',
    })

    return next(e)
  })

  on('command.run', { command: 'mermaid' }, async $ => {
    const isSource = await update($, showSource, v => !v)

    return { text: isSource ? 'mermaid：顯示原始碼' : 'mermaid：顯示圖' }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !MERMAID.test(e.props.text)) return next(e)
    if (await read($, showSource)) return next(e)

    const width = Math.max(20, (e.viewport?.columns ?? 80) - GUTTER)
    const text = draw(e.props.text, width)
    if (text === e.props.text) return next(e)

    return next({ ...e, props: { ...e.props, text } })
  })
}
