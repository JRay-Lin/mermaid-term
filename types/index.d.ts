export type ShowSource = boolean

declare module 'claude-code' {
  interface PluginState {
    'mermaid-term': { showSource: ShowSource }
  }
}
