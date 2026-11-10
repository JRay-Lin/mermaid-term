import { expect, test } from 'claude-code/testing'

const REPLY = [
  '流程如下：',
  '',
  '```mermaid',
  'flowchart TD',
  '  A[開始] --> B{好嗎}',
  '  B -- 是 --> C[結束]',
  '```',
].join('\n')

const MESSAGE = {
  plugin: 'mermaid-term',
  component: 'AssistantMessage',
  requestId: 'm1',
  viewport: { columns: 100, rows: 40 },
  props: { text: REPLY, isFirstOfReply: true },
} as const

test('a mermaid block is drawn as boxes on the terminal, and /mermaid shows the source', async ($, on) => {
  // Stands for the engine: draws whatever text reached it.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{(e.props as { text: string }).text}</Text>
  })
  on('command.register', () => ({ value: { command: 'mermaid' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  let ui = await $.ui.mount({ ...MESSAGE, surface: 'terminal' })
  let drawn = (await ui.find({ type: 'Text' }))?.text ?? ''
  expect(drawn).toContain('║ 好嗎 ║')
  expect(drawn).toContain('│ 開始 │')
  expect(drawn).not.toContain('flowchart TD')
  await ui.unmount()

  await $.command.run({ command: 'mermaid' })
  ui = await $.ui.mount({ ...MESSAGE, surface: 'terminal' })
  drawn = (await ui.find({ type: 'Text' }))?.text ?? ''
  expect(drawn).toContain('flowchart TD')
  await ui.unmount()
})

test('other surfaces keep the source', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{(e.props as { text: string }).text}</Text>
  })
  const ui = await $.ui.mount({ ...MESSAGE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toContain('flowchart TD')
  await ui.unmount()
})

const drawn = async (
  $: Parameters<Parameters<typeof test>[1]>[0],
  on: Parameters<Parameters<typeof test>[1]>[1],
  text: string,
) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{(e.props as { text: string }).text}</Text>
  })
  const ui = await $.ui.mount({ ...MESSAGE, surface: 'terminal', props: { text, isFirstOfReply: true } })
  const out = (await ui.find({ type: 'Text' }))?.text ?? ''
  await ui.unmount()
  return out
}

test('subgraphs are framed with their titles, and &lt; entities do not split a statement', async ($, on) => {
  const out = await drawn($, on, [
    '```mermaid',
    'flowchart LR',
    '  subgraph 現在["LM Studio + json_schema"]',
    '    A1["&lt;think&gt;"] --> A2["寫 {…}"]',
    '  end',
    '```',
  ].join('\n'))
  expect(out).toContain('LM Studio + json_schema')
  expect(out).toContain('<think>')
  expect(out).toContain('┌┄')
  expect(out).not.toContain('無法解析')
})

test('an ER diagram draws entities with attributes and cardinalities', async ($, on) => {
  const out = await drawn($, on, [
    '```mermaid',
    'erDiagram',
    '  CUSTOMER ||--o{ ORDER : places',
    '  CUSTOMER {',
    '    string id PK',
    '  }',
    '```',
  ].join('\n'))
  expect(out).toContain('CUSTOMER')
  expect(out).toContain('string  id  PK')
  expect(out).toContain('places')
  expect(out).toContain('0..*')
  expect(out).not.toContain('erDiagram')
})

test('a flowchart self loop is drawn beside its box', async ($, on) => {
  const flow = await drawn($, on, ['```mermaid', 'flowchart TD', '  A[工作] -->|重試| A', '```'].join('\n'))
  expect(flow).toContain('├◀╯')
  expect(flow).toContain('重試')
})

test('an ER self relationship is drawn beside its entity', async ($, on) => {
  const er = await drawn($, on, ['```mermaid', 'erDiagram', '  EMPLOYEE ||--o{ EMPLOYEE : manages', '```'].join('\n'))
  expect(er).toContain('manages')
  expect(er).toContain('0..*')
})

test('an edge to a node inside a subgraph runs into the frame up to that node', async ($, on) => {
  const out = await drawn($, on, [
    '```mermaid',
    'flowchart TD',
    '  A[外部] --> P2',
    '  subgraph G[群組]',
    '    P1[上層] --> P2[下層]',
    '  end',
    '```',
  ].join('\n'))
  // the arrow reaches 下層 from the side, not 上層 from above
  expect(out).toMatch(/│ 下層 │◀/)
  expect(out).toContain('┼')
})
