// Renders mermaid flowcharts and sequence diagrams as Unicode box drawings
// for the terminal. No imports: the hooks module and a plain `node` run
// (for local checks) both load this file as is.

// ───────────────────────── display width ─────────────────────────

const WIDE: [number, number][] = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf],
  [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff],
  [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff], [0x20000, 0x3fffd],
]

export function charWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0
  for (const [a, b] of WIDE) if (cp >= a && cp <= b) return 2
  return 1
}

export function strWidth(s: string): number {
  let w = 0
  for (const ch of s) w += charWidth(ch)
  return w
}

const CLOSING = new Set([...'，。、：；！？）」』】》〉,.;:!?)]}'])

function tokenize(s: string): string[] {
  const out: string[] = []
  let word = ''
  const flush = () => { if (word) out.push(word); word = '' }
  for (const ch of s) {
    if (ch === ' ' || ch === '\t') { flush(); if (out[out.length - 1] !== ' ') out.push(' ') }
    else if (charWidth(ch) === 2 || CLOSING.has(ch)) { flush(); out.push(ch) }
    else if (ch === '(') { flush(); word = ch }
    else if ('-/_.'.includes(ch)) { word += ch; flush() }
    else word += ch
  }
  flush()
  return out
}

/** Wraps text to `max` display columns, lines balanced; CJK breaks anywhere, latin at spaces. */
export function wrap(text: string, max: number): string[] {
  return text.split('\n').flatMap(para => {
    let lines = greedy(para, max)
    if (lines.length > 1) {
      for (let t = Math.ceil(strWidth(para) / lines.length); t < max; t++) {
        const tried = greedy(para, t)
        if (tried.length <= lines.length) { lines = tried; break }
      }
    }
    return lines
  })
}

function greedy(para: string, max: number): string[] {
  const out: string[] = []
  {
    let line = ''
    for (const tok of tokenize(para)) {
      if (tok === ' ') { if (line && strWidth(line) + 1 <= max) line += ' '; continue }
      const tw = strWidth(tok)
      if (strWidth(line) + tw <= max) { line += tok; continue }
      if (line.trim()) {
        const chars = [...line.trimEnd()]
        if (CLOSING.has(tok) && chars.length > 1) {
          const last = chars.pop()!
          out.push(chars.join(''))
          line = last + tok
          continue
        }
        out.push(line.trimEnd())
        line = ''
      }
      if (tw > max) {
        for (const ch of tok) {
          if (strWidth(line) + charWidth(ch) > max) { out.push(line); line = '' }
          line += ch
        }
      } else line = tok
    }
    out.push(line.trimEnd())
  }
  return out
}

function truncate(s: string, max: number): string {
  if (strWidth(s) <= max) return s
  let out = ''
  for (const ch of s) {
    if (strWidth(out) + charWidth(ch) > max - 1) break
    out += ch
  }
  return out + '…'
}

// ───────────────────────── canvas ─────────────────────────

const U = 1, D = 2, L = 4, R = 8
type Style = 'sq' | 'rd' | 'dot' | 'bold' | 'dbl'

const LIGHT: Record<string, string> = { ur: '└', ul: '┘', dr: '┌', dl: '┐', udr: '├', udl: '┤', ulr: '┴', dlr: '┬', udlr: '┼' }
const ROUND: Record<string, string> = { ur: '╰', ul: '╯', dr: '╭', dl: '╮' }
const DOUBLE: Record<string, string> = { ur: '╚', ul: '╝', dr: '╔', dl: '╗', udr: '╠', udl: '╣', ulr: '╩', dlr: '╦', udlr: '╬' }
const H_DOUBLE: Record<string, string> = { ur: '╘', ul: '╛', dr: '╒', dl: '╕', udr: '╞', udl: '╡', ulr: '╧', dlr: '╤', udlr: '╪' }
const V_DOUBLE: Record<string, string> = { ur: '╙', ul: '╜', dr: '╓', dl: '╖', udr: '╟', udl: '╢', ulr: '╨', dlr: '╥', udlr: '╫' }
const BOLD: Record<string, string> = { ur: '┗', ul: '┛', dr: '┏', dl: '┓', udr: '┣', udl: '┫', ulr: '┻', dlr: '┳', udlr: '╋' }

function mergeStyle(a: Style | undefined, b: Style): Style {
  if (!a || a === b) return b
  if (a === 'dbl' || b === 'dbl') return 'dbl'
  if (a === 'dot') return b
  if (b === 'dot') return a
  return 'sq'
}

function glyph(m: number, h: Style | undefined, v: Style | undefined): string {
  const hasH = (m & (L | R)) !== 0
  const hasV = (m & (U | D)) !== 0
  if (!hasV) return h === 'dbl' ? '═' : h === 'bold' ? '━' : h === 'dot' ? '┄' : '─'
  if (!hasH) return v === 'dbl' ? '║' : v === 'bold' ? '┃' : v === 'dot' ? '┆' : '│'
  const key = (m & U ? 'u' : '') + (m & D ? 'd' : '') + (m & L ? 'l' : '') + (m & R ? 'r' : '')
  if (h === 'dbl' && v === 'dbl') return DOUBLE[key]
  if (h === 'dbl') return H_DOUBLE[key]
  if (v === 'dbl') return V_DOUBLE[key]
  if (h === 'bold' && v === 'bold') return BOLD[key]
  if (h === 'rd' && v === 'rd' && ROUND[key]) return ROUND[key]
  return LIGHT[key]
}

class Canvas {
  private chars: (string | undefined)[][] = []
  private mask: number[][] = []
  private hs: (Style | undefined)[][] = []
  private vs: (Style | undefined)[][] = []

  private row<T>(grid: T[][], y: number): T[] {
    while (grid.length <= y) grid.push([])
    return grid[y]
  }

  set(x: number, y: number, ch: string): void {
    if (x < 0 || y < 0) return
    const r = this.row(this.chars, y)
    if (r[x] === '' && x > 0) r[x - 1] = ' '
    const old = r[x]
    if (old && charWidth(old) === 2) r[x + 1] = ' '
    r[x] = ch
    if (charWidth(ch) === 2) {
      const next = r[x + 1]
      if (next && charWidth(next) === 2) r[x + 2] = ' '
      r[x + 1] = ''
    }
  }

  at(x: number, y: number): string | undefined {
    return this.chars[y]?.[x]
  }

  /** Clears a cell's text so the lines drawn there show. */
  unset(x: number, y: number): void {
    const r = this.chars[y]
    if (r && r[x] !== undefined && r[x] !== '' && charWidth(r[x]!) < 2) r[x] = undefined
  }

  text(x: number, y: number, s: string): void {
    for (const ch of s) { this.set(x, y, ch); x += charWidth(ch) }
  }

  fill(x0: number, y0: number, w: number, h: number): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, ' ')
  }

  private bits(x: number, y: number, b: number, st: Style): void {
    if (x < 0 || y < 0) return
    const m = this.row(this.mask, y)
    m[x] = (m[x] ?? 0) | b
    if (b & (L | R)) { const r = this.row(this.hs, y); r[x] = mergeStyle(r[x], st) }
    if (b & (U | D)) { const r = this.row(this.vs, y); r[x] = mergeStyle(r[x], st) }
  }

  hline(x1: number, x2: number, y: number, st: Style): void {
    if (x1 > x2) [x1, x2] = [x2, x1]
    for (let x = x1; x <= x2 && x1 !== x2; x++) this.bits(x, y, (x > x1 ? L : 0) | (x < x2 ? R : 0), st)
  }

  vline(x: number, y1: number, y2: number, st: Style): void {
    if (y1 > y2) [y1, y2] = [y2, y1]
    for (let y = y1; y <= y2 && y1 !== y2; y++) this.bits(x, y, (y > y1 ? U : 0) | (y < y2 ? D : 0), st)
  }

  line(x1: number, y1: number, x2: number, y2: number, st: Style): void {
    if (x1 === x2) this.vline(x1, y1, y2, st)
    else this.hline(x1, x2, y1, st)
  }

  box(x: number, y: number, w: number, h: number, st: Style): void {
    this.hline(x, x + w - 1, y, st)
    this.hline(x, x + w - 1, y + h - 1, st)
    this.vline(x, y, y + h - 1, st)
    this.vline(x + w - 1, y, y + h - 1, st)
    this.fill(x + 1, y + 1, w - 2, h - 2)
  }

  toString(): string {
    const height = Math.max(this.chars.length, this.mask.length)
    const lines: string[] = []
    for (let y = 0; y < height; y++) {
      const c = this.chars[y] ?? [], m = this.mask[y] ?? []
      const width = Math.max(c.length, m.length)
      let s = ''
      for (let x = 0; x < width; x++) {
        const ch = c[x]
        if (ch !== undefined) s += ch
        else if (m[x]) s += glyph(m[x], this.hs[y]?.[x], this.vs[y]?.[x])
        else s += ' '
      }
      lines.push(s.trimEnd())
    }
    while (lines.length && !lines[lines.length - 1]) lines.pop()
    return lines.join('\n')
  }
}

function widthOf(block: string): number {
  return Math.max(0, ...block.split('\n').map(strWidth))
}

function cleanLabel(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;|#quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[&#]lt;/g, '<')
    .replace(/[&#]gt;/g, '>')
    .replace(/[&#]nbsp;/g, ' ')
    .replace(/#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\*\*|__|`/g, '')
    .split('\n').map(l => l.trim()).join('\n')
    .trim()
}

// ───────────────────────── flowchart: parse ─────────────────────────

type Dir = 'TD' | 'BT' | 'LR' | 'RL'
type Shape = 'rect' | 'round' | 'stadium' | 'sub' | 'db' | 'circle' | 'diamond' | 'hex' | 'para' | 'flag'
type Head = 'arrow' | 'cross' | 'circle' | 'none'
type LineKind = 'solid' | 'dot' | 'bold' | 'invis'

interface FNode { id: string; label: string; shape: Shape; parent: string | null }
interface FSub { id: string; label: string; dir: Dir | null; parent: string | null }
interface FEdge { from: string; to: string; label: string; line: LineKind; head: Head; tail: Head }
interface FGraph { dir: Dir; nodes: Map<string, FNode>; subs: Map<string, FSub>; order: string[]; edges: FEdge[] }

const SHAPES: [string, string[], Shape][] = [
  ['([', ['])'], 'stadium'], ['[[', [']]'], 'sub'], ['[(', [')]'], 'db'],
  ['(((', [')))'], 'circle'], ['((', ['))'], 'circle'], ['{{', ['}}'], 'hex'],
  ['[/', ['/]', '\\]'], 'para'], ['[\\', ['\\]', '/]'], 'para'],
  ['(', [')'], 'round'], ['[', [']'], 'rect'], ['{', ['}'], 'diamond'], ['>', [']'], 'flag'],
]

const SKIP = /^(classDef|class|style|linkStyle|click|accTitle|accDescr)\b/

function toDir(s: string | undefined): Dir | null {
  const d = (s ?? '').toUpperCase()
  if (d === 'TB') return 'TD'
  return d === 'TD' || d === 'BT' || d === 'LR' || d === 'RL' ? d : null
}

/** Splits a line at `;` outside quotes, brackets and `|labels|`, keeping entities like `&lt;` whole. */
export function splitStatements(line: string): string[] {
  const out: string[] = []
  let cur = '', quote = false, pipe = false, depth = 0
  for (const ch of line) {
    if (ch === '"') quote = !quote
    else if (!quote) {
      if (ch === '|') pipe = !pipe
      else if ('[({'.includes(ch)) depth++
      else if ('])}'.includes(ch)) depth = Math.max(0, depth - 1)
      else if (ch === ';' && !pipe && depth === 0 && !/(&#?\w+|#\w+)$/.test(cur)) {
        out.push(cur)
        cur = ''
        continue
      }
    }
    cur += ch
  }
  out.push(cur)
  return out.map(s => s.trim()).filter(Boolean)
}

class FlowParser {
  scope: string | null = null
  private s = ''
  private p = 0
  private g: FGraph
  constructor(g: FGraph) { this.g = g }

  statement(s: string): void {
    this.s = s
    this.p = 0
    let left = this.group()
    for (;;) {
      this.ws()
      if (this.p >= this.s.length) return
      const link = this.link()
      if (!link) throw new Error(`cannot read: ${s}`)
      const right = this.group()
      for (const a of left) for (const b of right) this.g.edges.push({ from: a, to: b, ...link })
      left = right
    }
  }

  private ws(): void { while (this.s[this.p] === ' ' || this.s[this.p] === '\t') this.p++ }

  private group(): string[] {
    const ids = [this.node()]
    for (;;) {
      this.ws()
      if (this.s[this.p] !== '&') return ids
      this.p++
      ids.push(this.node())
    }
  }

  private node(): string {
    this.ws()
    const m = /^[^\s[\](){}<>|&;:"'=~-]+/.exec(this.s.slice(this.p))
    if (!m) throw new Error(`expected a node: ${this.s}`)
    const id = m[0]
    this.p += id.length
    let label: string | undefined
    let shape: Shape = 'rect'
    for (const [open, closes, sh] of SHAPES) {
      if (!this.s.startsWith(open, this.p)) continue
      const start = this.p + open.length
      let text: string, end: number, closeLen: number
      if (this.s[start] === '"') {
        const q = this.s.indexOf('"', start + 1)
        if (q < 0) throw new Error('unclosed quote')
        text = this.s.slice(start + 1, q)
        const after = q + 1
        const close = closes.find(c => this.s.startsWith(c, after))
        if (!close) throw new Error('unclosed shape')
        end = after
        closeLen = close.length
      } else {
        const hits = closes.map(c => [this.s.indexOf(c, start), c.length]).filter(([i]) => i >= 0).sort((a, b) => a[0] - b[0])
        if (!hits.length) throw new Error('unclosed shape')
        ;[end, closeLen] = hits[0]
        text = this.s.slice(start, end)
      }
      label = text
      shape = sh
      this.p = end + closeLen
      break
    }
    const cls = /^:::[\w-]+/.exec(this.s.slice(this.p))
    if (cls) this.p += cls[0].length
    const known = this.g.nodes.get(id)
    if (!known) {
      this.g.nodes.set(id, { id, label: cleanLabel(label ?? id), shape, parent: this.scope })
      if (!this.g.order.includes(id)) this.g.order.push(id)
    } else {
      if (label !== undefined) { known.label = cleanLabel(label); known.shape = shape }
      if (known.parent === null && this.scope !== null) known.parent = this.scope
    }
    return id
  }

  private link(): Omit<FEdge, 'from' | 'to'> | null {
    const rest = this.s.slice(this.p)
    let token: string, label = '', both = false
    const mid = /^(<)?(--|==|-\.)\s+/.exec(rest)
    if (mid) {
      const tail = rest.slice(mid[0].length)
      const end = /\s(-{2,}>|-{3,}|\.-+>|\.-+|={2,}>|={3,}|-{2,}[xo]|={2,}[xo])/.exec(tail)
      if (!end) return null
      label = tail.slice(0, end.index)
      token = mid[2] + end[1]
      both = !!mid[1]
      this.p += mid[0].length + end.index + end[0].length
    } else {
      const m = /^(<)?(-{2,}|={2,}|-\.+-|~{3,})(>|x|o)?/.exec(rest)
      if (!m) return null
      token = m[2] + (m[3] ?? '')
      both = !!m[1]
      this.p += m[0].length
      const pipe = /^\s*\|([^|]*)\|/.exec(this.s.slice(this.p))
      if (pipe) { label = pipe[1]; this.p += pipe[0].length }
    }
    const line: LineKind = token.includes('~') ? 'invis' : token.includes('.') ? 'dot' : token.includes('=') ? 'bold' : 'solid'
    const last = token[token.length - 1]
    const head: Head = last === '>' ? 'arrow' : last === 'x' ? 'cross' : last === 'o' ? 'circle' : 'none'
    return { label: cleanLabel(label), line, head, tail: both ? head : 'none' }
  }
}

function parseSubHeader(rest: string, fresh: () => string): { id: string; label: string } {
  rest = rest.trim()
  let m: RegExpExecArray | null
  if (!rest) return { id: fresh(), label: '' }
  if ((m = /^([^\s[\]"]+)\s*\[\s*(?:"(.*)"|(.*?))\s*\]$/.exec(rest))) return { id: m[1], label: cleanLabel(m[2] ?? m[3]) }
  if ((m = /^"(.*)"$/.exec(rest))) return { id: m[1], label: cleanLabel(m[1]) }
  return { id: rest, label: cleanLabel(rest) }
}

export function parseFlowchart(src: string): FGraph {
  const lines = src.split('\n').map(l => l.replace(/%%.*$/, '').trim()).filter(Boolean)
  const head = /^(flowchart|graph)\b\s*(\w+)?/i.exec(lines[0] ?? '')
  if (!head) throw new Error('not a flowchart')
  const g: FGraph = { dir: toDir(head[2]) ?? 'TD', nodes: new Map(), subs: new Map(), order: [], edges: [] }
  const parser = new FlowParser(g)
  const stack: string[] = []
  let anon = 0
  for (const raw of lines.slice(1)) {
    for (const stmt of splitStatements(raw)) {
      const scope = stack[stack.length - 1] ?? null
      let m: RegExpExecArray | null
      if ((m = /^subgraph\b(.*)$/.exec(stmt))) {
        const sub = parseSubHeader(m[1], () => `subgraph ${++anon}`)
        if (!g.subs.has(sub.id)) g.subs.set(sub.id, { ...sub, dir: null, parent: scope })
        if (!g.order.includes(sub.id)) g.order.push(sub.id)
        stack.push(sub.id)
      } else if (stmt === 'end') stack.pop()
      else if ((m = /^direction\s+(\w+)/.exec(stmt))) {
        if (scope !== null) g.subs.get(scope)!.dir = toDir(m[1])
      } else if (SKIP.test(stmt)) continue
      else {
        parser.scope = scope
        parser.statement(stmt)
      }
    }
  }
  // An edge may name a subgraph: it stands for the group, not a node of its own.
  for (const id of g.subs.keys()) g.nodes.delete(id)
  if (!g.nodes.size && !g.subs.size) throw new Error('empty flowchart')
  return g
}

function parentOf(g: FGraph, id: string): string | null | undefined {
  return g.nodes.has(id) ? g.nodes.get(id)!.parent : g.subs.has(id) ? g.subs.get(id)!.parent : undefined
}

/** The chain of groups down to `id`, outermost first, `id` last. */
function pathOf(g: FGraph, id: string): string[] {
  const out = [id]
  let cur = parentOf(g, id)
  while (cur != null && out.length < 64) { out.unshift(cur); cur = parentOf(g, cur) }
  return out
}

// ───────────────────────── layered layout ─────────────────────────

interface Rect { x: number; y: number; w: number; h: number }

/** Something the layout places: a node's box, a subgraph's frame, an entity. */
interface Item {
  w: number
  h: number
  draw(cv: Canvas, x: number, y: number, w: number, h: number): void
  /** Where the ids an edge may name sit inside the item, at the given size. */
  ports(w: number, h: number): Map<string, Rect>
  /** A path from the item's `side` to the box of `id` inside it (a node in a frame). */
  route?(id: string, side: Side, w: number, h: number): Route | undefined
}

type Side = 'top' | 'bottom' | 'left' | 'right'
type Into = 'U' | 'D' | 'L' | 'R'
/** Cells from a border cell of the item to the one beside the target box, `into` the way into it. */
interface Route { cross: number; cells: [number, number][]; into: Into; crossings: number[] }

const DIRS: Into[] = ['U', 'D', 'L', 'R']
const STEP: Record<Into, [number, number]> = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] }
const ARROW: Record<Into, string> = { U: '▲', D: '▼', L: '◀', R: '▶' }
const JOIN: Record<Into, Record<string, string>> = {
  R: { '│': '┤', '║': '╢' }, L: { '│': '├', '║': '╟' },
  D: { '─': '┴', '═': '╧' }, U: { '─': '┬', '═': '╤' },
}

function cellsOf(s: string): string[] {
  const out: string[] = []
  for (const ch of s) { out.push(ch); if (charWidth(ch) === 2) out.push('') }
  return out
}

/**
 * The cheapest path through the blank cells of `grid` from any border cell on
 * `side` to a cell beside rectangle `r`: turns cost, hugging text costs a
 * little, and a dashed frame inside may be crossed straight through.
 */
function findRoute(grid: string[][], side: Side, r: Rect): Route | undefined {
  const H = grid.length, W = grid[0]?.length ?? 0
  const TURN = 4, CROSS = 8
  const key = (x: number, y: number, d: number) => (y * W + x) * 4 + d
  const dist = new Map<number, number>(), prev = new Map<number, number>()
  const buckets: number[][] = []
  const push = (k: number, c: number, from: number) => {
    if ((dist.get(k) ?? Infinity) <= c) return
    dist.set(k, c)
    prev.set(k, from)
    ;(buckets[c] ??= []).push(k)
  }
  const inward = DIRS.indexOf(side === 'top' ? 'D' : side === 'bottom' ? 'U' : side === 'left' ? 'R' : 'L')
  if (side === 'top' || side === 'bottom') {
    const y = side === 'top' ? 0 : H - 1
    for (let x = 1; x < W - 1; x++) push(key(x, y, inward), 0, -1)
  } else {
    const x = side === 'left' ? 0 : W - 1
    for (let y = 1; y < H - 1; y++) push(key(x, y, inward), 0, -1)
  }
  const crosses = (ch: string, d: Into) => (ch === '┄' && (d === 'U' || d === 'D')) || (ch === '┆' && (d === 'L' || d === 'R'))
  const near = (x: number, y: number) =>
    ([[0, 1], [0, -1], [1, 0], [-1, 0]] as const).some(([dx, dy]) => (grid[y + dy]?.[x + dx] ?? ' ') !== ' ')
  const goal = (x: number, y: number): Into | undefined => {
    const inY = y > r.y && y < r.y + r.h - 1, inX = x > r.x && x < r.x + r.w - 1
    if (inY && x === r.x - 1) return 'R'
    if (inY && x === r.x + r.w) return 'L'
    if (inX && y === r.y - 1) return 'D'
    if (inX && y === r.y + r.h) return 'U'
    return undefined
  }
  let best: { k: number; c: number; into: Into } | undefined
  for (let c = 0; c < buckets.length; c++) {
    if (best && c >= best.c) break
    for (const k of buckets[c] ?? []) {
      if (dist.get(k) !== c) continue
      const d = k % 4, cell = (k - d) / 4, x = cell % W, y = (cell - x) / W
      const ch = grid[y][x]
      const isStart = prev.get(k) === -1
      if (ch === ' ') {
        const into = goal(x, y)
        if (into) {
          // an end squeezed beside other lines is hard to read
          const [sx, sy] = into === 'U' || into === 'D' ? [1, 0] : [0, 1]
          const crowded = (grid[y + sy]?.[x + sx] ?? ' ') !== ' ' || (grid[y - sy]?.[x - sx] ?? ' ') !== ' '
          const total = c + (DIRS[d] === into ? 0 : TURN) + (crowded ? 6 : 0)
          if (!best || total < best.c) best = { k, c: total, into }
        }
      }
      const straightOnly = isStart || ch !== ' '
      for (let nd = 0; nd < 4; nd++) {
        if ((straightOnly && nd !== d) || nd === (d ^ 1)) continue
        const [dx, dy] = STEP[DIRS[nd]]
        const nx = x + dx, ny = y + dy
        if (nx <= 0 || ny <= 0 || nx >= W - 1 || ny >= H - 1) continue
        const nch = grid[ny][nx]
        let cost = 1 + (nd === d ? 0 : TURN)
        if (nch === ' ') cost += near(nx, ny) ? 1 : 0
        else if (crosses(nch, DIRS[nd])) cost += CROSS
        else continue
        push(key(nx, ny, nd), c + cost, k)
      }
    }
  }
  if (!best) return undefined
  const cells: [number, number][] = []
  for (let k = best.k; k !== -1; k = prev.get(k)!) {
    const cell = (k - (k % 4)) / 4
    cells.unshift([cell % W, Math.floor(cell / W)])
  }
  const crossings = cells.map((_, i) => i).filter(i => i > 0 && grid[cells[i][1]][cells[i][0]] !== ' ')
  const [sx, sy] = cells[0]
  return { cross: side === 'top' || side === 'bottom' ? sx : sy, cells, into: best.into, crossings }
}

interface LEdge {
  a: number; b: number; aId: string; bId: string
  label: string; line: LineKind; head: Head; tail: Head
  aMark?: string; bMark?: string
}

interface Laid { lines: string[]; w: number; h: number; ports: Map<string, Rect> }

interface LNode { real: number; rank: number; cross: number; main: number; need: number; extra: number; left: number }
interface Seg { a: number; b: number; edge: number; first: boolean; last: boolean; rev: boolean }

function pav(desired: number[], sizes: number[], gap: number): number[] {
  const off: number[] = []
  let acc = 0
  for (const s of sizes) { off.push(acc); acc += s + gap }
  const vals: number[] = [], cnt: number[] = []
  desired.forEach((d, i) => {
    vals.push(d - off[i]); cnt.push(1)
    while (vals.length > 1 && vals[vals.length - 2] > vals[vals.length - 1]) {
      const v2 = vals.pop()!, c2 = cnt.pop()!, v1 = vals.pop()!, c1 = cnt.pop()!
      vals.push((v1 * c1 + v2 * c2) / (c1 + c2)); cnt.push(c1 + c2)
    }
  })
  const out: number[] = []
  vals.forEach((v, k) => { for (let q = 0; q < cnt[k]; q++) out.push(Math.round(v + off[out.length])) })
  return out
}

const BOX_STYLE: Record<Shape, Style> = {
  rect: 'sq', sub: 'sq', flag: 'sq', para: 'sq',
  round: 'rd', stadium: 'rd', circle: 'rd', db: 'rd',
  diamond: 'dbl', hex: 'bold',
}
const LINE_STYLE: Record<LineKind, Style> = { solid: 'rd', dot: 'dot', bold: 'bold', invis: 'rd' }

function boxItem(id: string, lines: string[], st: Style): Item {
  return {
    w: Math.max(1, ...lines.map(strWidth)) + 4,
    h: lines.length + 2,
    draw(cv, x, y, w, h) {
      cv.box(x, y, w, h, st)
      const top = y + 1 + Math.floor((h - 2 - lines.length) / 2)
      lines.forEach((l, j) => cv.text(x + 2 + Math.floor((w - 4 - strWidth(l)) / 2), top + j, l))
    },
    ports: (w, h) => new Map([[id, { x: 0, y: 0, w, h }]]),
  }
}

/** A subgraph: its own drawing inside a dashed frame, its title on the first row. */
function frameItem(id: string, title: string, inner: Laid, maxTitle: number, roomy: boolean): Item {
  const head = title ? truncate(title.replace(/\n/g, ' '), Math.max(inner.w, maxTitle)) : ''
  const titleRows = head ? 1 : 0
  // a frame an edge runs into keeps a lane around its contents
  const px = roomy ? 2 : 0, py = roomy ? 1 : 0
  const w = Math.max(inner.w + 2 * px, strWidth(head), 1) + 4
  const h = inner.h + titleRows + 2 + 2 * py
  const origin = (W: number, H: number): [number, number] => [
    2 + px + Math.floor((W - 4 - 2 * px - inner.w) / 2),
    1 + titleRows + py + Math.floor((H - 2 - titleRows - 2 * py - inner.h) / 2),
  ]
  const portsAt = (W: number, H: number) => {
    const [ox, oy] = origin(W, H)
    const map = new Map<string, Rect>([[id, { x: 0, y: 0, w: W, h: H }]])
    for (const [k, r] of inner.ports) map.set(k, { ...r, x: r.x + ox, y: r.y + oy })
    return map
  }
  return {
    w,
    h,
    draw(cv, x, y, W, H) {
      cv.box(x, y, W, H, 'dot')
      if (head) cv.text(x + 2, y + 1, head)
      const [ox, oy] = origin(W, H)
      inner.lines.forEach((l, j) => cv.text(x + ox, y + oy + j, l))
    },
    ports: portsAt,
    route(target, side, W, H) {
      const r = target === id ? undefined : portsAt(W, H).get(target)
      if (!r) return undefined
      const grid = Array.from({ length: H }, (_, y) =>
        Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : ' ')),
      )
      const paint = (x0: number, y0: number, text: string) =>
        cellsOf(text).forEach((ch, j) => { if (grid[y0]?.[x0 + j] !== undefined) grid[y0][x0 + j] = ch })
      if (head) paint(2, 1, head)
      const [ox, oy] = origin(W, H)
      inner.lines.forEach((l, j) => paint(ox, oy + j, l))
      return findRoute(grid, side, r)
    },
  }
}

/**
 * Lays items out in ranks along `dir` and routes the edges between them.
 * `spread` gives each edge its own point on a box's side (ER diagrams),
 * where flowcharts share one trunk per side.
 */
function layered(items: Item[], allEdges: LEdge[], dir: Dir, labelMax: number, spread: boolean): Laid {
  const horiz = dir === 'LR' || dir === 'RL'
  const N = items.length
  if (!N) return { lines: [], w: 0, h: 0, ports: new Map() }
  const bw = items.map(it => it.w)
  const bh = items.map(it => it.h)
  const edges = allEdges.filter(e => e.a !== e.b)
  const labels = edges.map(e => (e.label ? (horiz ? [truncate(e.label.replace(/\n/g, ' '), labelMax)] : wrap(e.label, labelMax)) : []))

  // self loops: drawn on the box's far side (right, or below when sideways), which keeps room for them
  const loops = items.map(() => [] as LEdge[])
  for (const e of allEdges) if (e.a === e.b && e.line !== 'invis') loops[e.a].push(e)
  const loopInfo = loops.map((list, i) => {
    if (!list.length) return null
    const e = list[0]
    const label = list.map(x => x.label.replace(/\n/g, ' ')).filter(Boolean).join(', ')
    const aMark = e.aMark ?? '', bMark = e.bMark ?? ''
    const L = Math.max(2, strWidth(aMark) + 2, strWidth(bMark) + 2)
    if (horiz) {
      const dash = e.line === 'dot' ? '┄' : e.line === 'bold' ? '━' : '─'
      const row = aMark + (label ? `${dash} ${truncate(label, labelMax)} ${dash}` : dash.repeat(2)) + bMark
      bw[i] = Math.max(bw[i], strWidth(row) + 6)
      return { e, row, L, lines: [] as string[], aMark, bMark, extra: 1 }
    }
    const lines = label ? wrap(label, labelMax) : []
    bh[i] = Math.max(bh[i], 5)
    const extra = L + 1 + (lines.length ? 1 + Math.max(...lines.map(strWidth)) : 0)
    return { e, row: '', L, lines, aMark, bMark, extra }
  })

  // break cycles
  const outs: number[][] = items.map(() => [])
  edges.forEach((e, k) => outs[e.a].push(k))
  const state = new Array(N).fill(0)
  const rev = new Array(edges.length).fill(false)
  const dfs = (u: number): void => {
    state[u] = 1
    for (const k of outs[u]) {
      const v = edges[k].b
      if (state[v] === 1) rev[k] = true
      else if (state[v] === 0) dfs(v)
    }
    state[u] = 2
  }
  for (let i = 0; i < N; i++) if (!state[i]) dfs(i)
  const dag = edges.map((e, k) => (rev[k] ? [e.b, e.a] : [e.a, e.b]))
  const touchesRev = new Set<number>()
  dag.forEach(([a, b], k) => { if (rev[k] && edges[k].line !== 'invis') { touchesRev.add(a); touchesRev.add(b) } })
  if (horiz && !spread) for (const i of touchesRev) bh[i] += 2
  if (spread) {
    const deg = new Array(N).fill(0)
    for (const e of edges) { deg[e.a]++; deg[e.b]++ }
    const markW = Math.max(1, ...edges.flatMap(e => [strWidth(e.aMark ?? ''), strWidth(e.bMark ?? '')]))
    for (let i = 0; i < N; i++) {
      if (horiz) bh[i] = Math.max(bh[i], deg[i] + 2)
      else bw[i] = Math.max(bw[i], deg[i] * (markW + 2) + 2)
    }
  }

  // ranks: longest path, then sources pulled down to their children
  const rank = new Array(N).fill(0)
  const indeg = new Array(N).fill(0)
  const succ: number[][] = items.map(() => [])
  for (const [a, b] of dag) { succ[a].push(b); indeg[b]++ }
  const deg = [...indeg]
  const queue = items.map((_, i) => i).filter(i => deg[i] === 0)
  const topo: number[] = []
  while (queue.length) {
    const u = queue.shift()!
    topo.push(u)
    for (const v of succ[u]) { rank[v] = Math.max(rank[v], rank[u] + 1); if (--deg[v] === 0) queue.push(v) }
  }
  for (const u of [...topo].reverse()) {
    if (indeg[u] === 0 && succ[u].length) rank[u] = Math.min(...succ[u].map(v => rank[v])) - 1
  }
  const minRank = Math.min(...rank)
  for (let i = 0; i < N; i++) rank[i] -= minRank

  // layout nodes, with dummies for long edges
  const crossOf = (i: number) => (horiz ? bh[i] : bw[i])
  const mainOf = (i: number) => (horiz ? bw[i] : bh[i])
  const ln: LNode[] = items.map((_, i) => {
    const extra = loopInfo[i]?.extra ?? 0
    return { real: i, rank: rank[i], cross: crossOf(i), main: mainOf(i), need: crossOf(i) + extra, extra, left: 0 }
  })
  const segs: Seg[] = []
  dag.forEach(([a, b], k) => {
    let prev = a
    for (let r = rank[a] + 1; r < rank[b]; r++) {
      ln.push({ real: -1, rank: r, cross: 1, main: 0, need: 1, extra: 0, left: 0 })
      segs.push({ a: prev, b: ln.length - 1, edge: k, first: prev === a, last: false, rev: rev[k] })
      prev = ln.length - 1
    }
    segs.push({ a: prev, b, edge: k, first: prev === a, last: true, rev: rev[k] })
  })
  if (!horiz) {
    for (const s of segs) {
      const lab = labels[s.edge]
      if (s.first && lab.length && edges[s.edge].line !== 'invis') {
        ln[s.b].need = Math.max(ln[s.b].need, Math.max(...lab.map(strWidth)) + 2)
      }
    }
  }
  const R = Math.max(...ln.map(n => n.rank)) + 1
  const layers: number[][] = Array.from({ length: R }, () => [])
  ln.forEach((n, i) => layers[n.rank].push(i))
  const up: number[][] = ln.map(() => [])
  const down: number[][] = ln.map(() => [])
  for (const s of segs) { down[s.a].push(s.b); up[s.b].push(s.a) }

  // ordering: barycenter sweeps
  const pos = new Array(ln.length).fill(0)
  layers.forEach(layer => layer.forEach((n, i) => { pos[n] = i }))
  for (let it = 0; it < 8; it++) {
    const goingDown = it % 2 === 0
    const order = goingDown ? [...layers.keys()].slice(1) : [...layers.keys()].reverse().slice(1)
    for (const r of order) {
      const bary = new Map(layers[r].map(n => {
        const nb = goingDown ? up[n] : down[n]
        return [n, nb.length ? nb.reduce((s, m) => s + pos[m], 0) / nb.length : pos[n]]
      }))
      layers[r].sort((a, b) => bary.get(a)! - bary.get(b)!)
      layers[r].forEach((n, i) => { pos[n] = i })
    }
  }

  // cross coordinates
  const gap = horiz ? 1 : 3
  for (const layer of layers) {
    let x = 0
    for (const n of layer) { ln[n].left = x; x += ln[n].need + gap }
  }
  const pad = (n: number) => Math.floor((ln[n].need - ln[n].extra - ln[n].cross) / 2)
  const offset = (n: number) => pad(n) + Math.floor(ln[n].cross / 2)
  const center = (n: number) => ln[n].left + offset(n)
  for (let pass = 0; pass < 6; pass++) {
    const goingDown = pass % 2 === 0
    const order = goingDown ? [...layers.keys()].slice(1) : [...layers.keys()].reverse().slice(1)
    for (const r of order) {
      const layer = layers[r]
      const desired = layer.map(n => {
        const nb = goingDown ? up[n] : down[n]
        const c = nb.length ? nb.reduce((s, m) => s + center(m), 0) / nb.length : center(n)
        return Math.round(c) - offset(n)
      })
      const lefts = pav(desired, layer.map(n => ln[n].need), gap)
      layer.forEach((n, i) => { ln[n].left = lefts[i] })
    }
  }
  const shift = Math.min(...ln.map(n => n.left))
  for (const n of ln) n.left -= shift
  const boxLeft = (n: number) => ln[n].left + pad(n)
  const attach = (n: number) => boxLeft(n) + Math.floor(ln[n].cross / 2)
  const revOff = (n: number) =>
    ln[n].real < 0 ? 0 : horiz ? (touchesRev.has(ln[n].real) ? 1 : 0) : Math.max(0, Math.min(3, Math.floor(ln[n].cross / 2) - 2))

  // where each edge meets its items: the port it names (a node inside a frame), or a spread point
  const visible = segs.filter(s => edges[s.edge].line !== 'invis')
  const portsOf = items.map((it, i) => it.ports(bw[i], bh[i]))
  const portCross = (n: number, id: string) => {
    const r = portsOf[ln[n].real].get(id)
    return r ? (horiz ? r.y + Math.floor(r.h / 2) : r.x + Math.floor(r.w / 2)) : Math.floor(ln[n].cross / 2)
  }
  const upperId = (s: Seg) => (s.rev ? edges[s.edge].bId : edges[s.edge].aId)
  const lowerId = (s: Seg) => (s.rev ? edges[s.edge].aId : edges[s.edge].bId)
  // an edge naming a node inside a frame runs on through the frame to it
  const inSide: Side = dir === 'TD' ? 'top' : dir === 'BT' ? 'bottom' : dir === 'LR' ? 'left' : 'right'
  const outSide: Side = dir === 'TD' ? 'bottom' : dir === 'BT' ? 'top' : dir === 'LR' ? 'right' : 'left'
  const deepIn = new Map<Seg, Route>(), deepOut = new Map<Seg, Route>()
  for (const s of visible) {
    const b = ln[s.b].real, a = ln[s.a].real
    const rin = s.last && b >= 0 ? items[b].route?.(lowerId(s), inSide, bw[b], bh[b]) : undefined
    if (rin) deepIn.set(s, rin)
    const rout = s.first && a >= 0 ? items[a].route?.(upperId(s), outSide, bw[a], bh[a]) : undefined
    if (rout) deepOut.set(s, rout)
  }
  const upAt = new Map<Seg, number>(), downAt = new Map<Seg, number>()
  if (spread) {
    ln.forEach((n, i) => {
      if (n.real < 0) return
      const sides: [Seg[], Map<Seg, number>, (s: Seg) => number][] = [
        [visible.filter(s => s.a === i && s.first), upAt, s => center(s.b)],
        [visible.filter(s => s.b === i && s.last), downAt, s => center(s.a)],
      ]
      for (const [list, at, other] of sides) {
        list.sort((p, q) => other(p) - other(q))
        const room = Math.max(1, n.cross - 2)
        list.forEach((s, k) => at.set(s, boxLeft(i) + 1 + Math.floor(((k + 0.5) * room) / list.length)))
      }
    })
  }
  const srcX = (s: Seg) =>
    (deepOut.has(s) ? boxLeft(s.a) + deepOut.get(s)!.cross : undefined) ??
    upAt.get(s) ?? (s.first ? boxLeft(s.a) + portCross(s.a, upperId(s)) + (s.rev ? revOff(s.a) : 0) : attach(s.a))
  const tgtX = (s: Seg) =>
    (deepIn.has(s) ? boxLeft(s.b) + deepIn.get(s)!.cross : undefined) ??
    downAt.get(s) ?? (s.last ? boxLeft(s.b) + portCross(s.b, lowerId(s)) + (s.rev ? revOff(s.b) : 0) : attach(s.b))
  const markOf = (s: Seg, upper: boolean) => {
    const e = edges[s.edge]
    return (upper ? (s.rev ? e.bMark : e.aMark) : s.rev ? e.aMark : e.bMark) ?? ''
  }

  // channels between layers
  const layerMain = layers.map(layer => Math.max(1, ...layer.map(n => ln[n].main)))
  const channels = layers.slice(0, -1).map((_, r) => {
    const here = visible.filter(s => ln[s.a].rank === r)
    const track = assignTracks(here.map(s => ({ a: s.a, b: s.b, sx: srcX(s), tx: tgtX(s) })), !spread)
    const T = Math.max(0, ...track) + (track.some(t => t >= 0) ? 1 : 0)
    const labs = here.filter(s => s.first).map(s => labels[s.edge])
    let size: number, pre = 0
    if (horiz) {
      const um = Math.max(0, ...here.filter(s => s.first).map(s => strWidth(markOf(s, true))))
      const dm = Math.max(0, ...here.filter(s => s.last).map(s => strWidth(markOf(s, false))))
      pre = um ? um + 1 : 0
      const lw = Math.max(0, ...labs.flat().map(strWidth))
      size = pre + T + 2 + (lw ? lw + 3 : 1) + (dm ? dm + 1 : 0)
    } else {
      size = T + 2 + Math.max(0, ...labs.map(l => l.length))
    }
    return { here, track, T, pre, size }
  })
  const layerStart: number[] = []
  let m = 0
  layers.forEach((_, r) => { layerStart.push(m); m += layerMain[r] + (channels[r]?.size ?? 0) })
  const total = m

  const cv = new Canvas()
  const flip = dir === 'BT' || dir === 'RL'
  const xy = (mm: number, c: number): [number, number] => {
    const mv = flip ? total - 1 - mm : mm
    return horiz ? [mv, c] : [c, mv]
  }
  const line = (m1: number, c1: number, m2: number, c2: number, st: Style) => {
    const [x1, y1] = xy(m1, c1), [x2, y2] = xy(m2, c2)
    cv.line(x1, y1, x2, y2, st)
  }
  const fwd = { TD: '▼', BT: '▲', LR: '▶', RL: '◀' }[dir]
  const back = { TD: '▲', BT: '▼', LR: '◀', RL: '▶' }[dir]
  const headChar = (h: Head, forward: boolean) => (h === 'cross' ? 'x' : h === 'circle' ? 'o' : forward ? fwd : back)
  const put = (mm: number, c: number, ch: string) => { const [x, y] = xy(mm, c); cv.set(x, y, ch) }
  const inM = (n: number) => layerStart[ln[n].rank] - 1
  const outM = (n: number) => layerStart[ln[n].rank] + (ln[n].real >= 0 ? ln[n].main : layerMain[ln[n].rank]) - 1

  // dummies: straight lines through their layer
  ln.forEach((n, i) => {
    if (n.real >= 0) return
    const e = segs.find(s => s.b === i)!
    if (edges[e.edge].line === 'invis') return
    line(inM(i), attach(i), outM(i), attach(i), LINE_STYLE[edges[e.edge].line])
  })

  // edges
  const heads: [number, number, string][] = []
  const labelDraws: (() => void)[] = []
  channels.forEach((ch, r) => {
    const cs = layerStart[r] + layerMain[r]
    ch.here.forEach((s, i) => {
      const e = edges[s.edge]
      const st = LINE_STYLE[e.line]
      const sx = srcX(s), tx = tgtX(s)
      // heads: `head` sits at e.b, which is the lower end unless reversed
      const lowerHead = s.rev ? e.tail : e.head
      const upperHead = s.rev ? e.head : e.tail
      // a line with no head runs into the box's border and joins it
      const end = s.last && (lowerHead === 'none' || deepIn.has(s)) ? inM(s.b) + 1 : inM(s.b)
      const t = ch.track[i]
      if (t < 0) line(outM(s.a), sx, end, tx, st)
      else {
        const tm = cs + ch.pre + 1 + t
        line(outM(s.a), sx, tm, sx, st)
        line(tm, sx, tm, tx, st)
        line(tm, tx, end, tx, st)
      }
      if (s.last && lowerHead !== 'none' && !deepIn.has(s)) heads.push([inM(s.b), tx, headChar(lowerHead, true)])
      if (s.first && upperHead !== 'none' && !deepOut.has(s)) heads.push([outM(s.a) + 1, sx, headChar(upperHead, false)])
      const um = s.first ? markOf(s, true) : ''
      const dm = s.last ? markOf(s, false) : ''
      if (um || dm) {
        labelDraws.push(() => {
          if (um) {
            let [x, y] = xy(outM(s.a) + 1, sx)
            if (!horiz) x += 1
            else if (flip) x -= strWidth(um) - 1
            cv.text(x, y, um)
          }
          if (dm) {
            let [x, y] = xy(inM(s.b), tx)
            if (!horiz) x += 1
            else if (!flip) x -= strWidth(dm) - 1
            cv.text(x, y, dm)
          }
        })
      }
      const lab = labels[s.edge]
      if (s.first && lab.length) {
        labelDraws.push(() => {
          if (horiz) {
            const text = ` ${lab[0]} `
            const start = cs + ch.pre + ch.T + 1
            const [x, y] = xy(flip ? start + strWidth(text) - 1 : start, tx)
            cv.text(x, y, text)
          } else {
            const top = cs + ch.T + 1
            lab.forEach((l, j) => {
              const [x, y] = xy(flip ? top + lab.length - 1 - j : top + j, tx)
              cv.text(x - Math.floor(strWidth(l) / 2), y, l)
            })
          }
        })
      }
    })
  })

  // boxes
  const ports = new Map<string, Rect>()
  const origin = new Map<number, [number, number]>()
  const late: [number, number, string][] = []
  const headFor = (h: Head, arrow: string) => (h === 'cross' ? 'x' : h === 'circle' ? 'o' : arrow)
  ln.forEach((n, i) => {
    if (n.real < 0) return
    const ms = layerStart[n.rank]
    const cl = boxLeft(i)
    const [xa, ya] = xy(ms, cl), [xb, yb] = xy(ms + n.main - 1, cl + n.cross - 1)
    const x0 = Math.min(xa, xb), y0 = Math.min(ya, yb)
    const w = bw[n.real], h = bh[n.real]
    items[n.real].draw(cv, x0, y0, w, h)
    origin.set(n.real, [x0, y0])
    for (const [k, r] of portsOf[n.real]) ports.set(k, { ...r, x: r.x + x0, y: r.y + y0 })
    const loop = loopInfo[n.real]
    if (!loop) return
    const st = LINE_STYLE[loop.e.line]
    if (!horiz) {
      const ya = y0 + 1, yb = y0 + h - 2, xr = x0 + w - 1, xc = xr + loop.L
      cv.hline(xr, xc, ya, st)
      cv.vline(xc, ya, yb, st)
      cv.hline(xr, xc, yb, st)
      if (loop.aMark) cv.text(xr + 1, ya, loop.aMark)
      if (loop.bMark) cv.text(xr + 1, yb, loop.bMark)
      if (loop.e.head !== 'none') late.push([xr + 1, yb, headFor(loop.e.head, '◀')])
      if (loop.e.tail !== 'none') late.push([xr + 1, ya, headFor(loop.e.tail, '◀')])
      loop.lines.forEach((l, j) => cv.text(xc + 2, ya + j, l))
    } else {
      const yb = y0 + h - 1, yl = y0 + h, xa = x0 + 2, xb = xa + strWidth(loop.row) + 1
      cv.vline(xa, yb, yl, st)
      cv.hline(xa, xb, yl, st)
      cv.vline(xb, yl, yb, st)
      cv.text(xa + 1, yl, loop.row)
      if (loop.e.head !== 'none') late.push([xb, yl, headFor(loop.e.head, '▲')])
      if (loop.e.tail !== 'none') late.push([xa, yl, headFor(loop.e.tail, '▲')])
    }
  })
  // the legs of edges inside the frames they run into
  const drawRoute = (real: number, r: Route, st: Style, head: Head) => {
    const [ox, oy] = origin.get(real)!
    const abs = r.cells.map(([x, y]) => [x + ox, y + oy] as [number, number])
    abs.forEach(([x, y], i) => { if (i > 0) cv.unset(x, y) })
    for (let i = 1; i < abs.length; i++) cv.line(abs[i - 1][0], abs[i - 1][1], abs[i][0], abs[i][1], st)
    for (const i of r.crossings) cv.set(abs[i][0], abs[i][1], '┼')
    const [lx, ly] = abs[abs.length - 1]
    const [dx, dy] = STEP[r.into]
    // the last cell turns toward the box: give it the bit that points in
    cv.line(lx, ly, lx + dx, ly + dy, st)
    if (head !== 'none') { late.push([lx, ly, headFor(head, ARROW[r.into])]); return }
    const joined = JOIN[r.into][cv.at(lx + dx, ly + dy) ?? '']
    if (joined) cv.set(lx + dx, ly + dy, joined)
  }
  for (const [s, r] of deepIn) {
    const e = edges[s.edge]
    drawRoute(ln[s.b].real, r, LINE_STYLE[e.line], s.rev ? e.tail : e.head)
  }
  for (const [s, r] of deepOut) {
    const e = edges[s.edge]
    drawRoute(ln[s.a].real, r, LINE_STYLE[e.line], s.rev ? e.head : e.tail)
  }
  for (const draw of labelDraws) draw()
  for (const [mm, c, ch] of heads) put(mm, c, ch)
  for (const [x, y, ch] of late) cv.set(x, y, ch)
  const lines = cv.toString().split('\n')
  return { lines, w: Math.max(0, ...lines.map(strWidth)), h: lines.length, ports }
}

interface TrackSeg { a: number; b: number; sx: number; tx: number }

function assignTracks(segs: TrackSeg[], share: boolean): number[] {
  const track = segs.map(() => -1)
  const bent = segs.map((_, i) => i).filter(i => segs[i].sx !== segs[i].tx)
  // edges from one box (or into one) share a trunk, unless each has its own point
  const shares = (i: number, j: number) => share && (segs[i].a === segs[j].a || segs[i].b === segs[j].b)
  // i must sit above j when i's upper vertical runs down the column j's lower vertical uses
  const above = (i: number, j: number) => segs[i].sx === segs[j].tx && !shares(i, j)
  const lo = (i: number) => Math.min(segs[i].sx, segs[i].tx)
  const hi = (i: number) => Math.max(segs[i].sx, segs[i].tx)
  const fits = (i: number, j: number) => shares(i, j) || hi(i) < lo(j) - 1 || hi(j) < lo(i) - 1
  const left = new Set(bent)
  const order: number[] = []
  while (left.size) {
    const rest = [...left]
    const pick = rest.find(j => !rest.some(i => i !== j && above(i, j))) ?? rest[0]
    order.push(pick)
    left.delete(pick)
  }
  const rows: number[][] = []
  for (const j of order) {
    let t = 0
    for (const i of bent) if (i !== j && track[i] >= 0 && above(i, j)) t = Math.max(t, track[i] + 1)
    while ((rows[t] ?? []).some(i => !fits(i, j))) t++
    ;(rows[t] ??= []).push(j)
    track[j] = t
  }
  return track
}

// ───────────────────────── flowchart: render ─────────────────────────

function layoutScope(g: FGraph, scope: string | null, dir: Dir, force: Dir | null, nodeMax: number, labelMax: number): Laid {
  const kids = g.order.filter(id => parentOf(g, id) === scope)
  const index = new Map(kids.map((id, i) => [id, i]))
  const items = kids.map(id => {
    const node = g.nodes.get(id)
    if (node) return boxItem(id, wrap(node.label, nodeMax), BOX_STYLE[node.shape])
    const sub = g.subs.get(id)!
    const inner = layoutScope(g, id, force ?? sub.dir ?? dir, force, nodeMax, labelMax)
    const within = (x: string) => x !== id && pathOf(g, x).includes(id)
    const outside = (x: string) => !pathOf(g, x).includes(id)
    const roomy = g.edges.some(e => (within(e.from) && outside(e.to)) || (within(e.to) && outside(e.from)))
    return frameItem(id, sub.label, inner, nodeMax, roomy)
  })
  // each edge is routed in the innermost group holding both ends
  const edges: LEdge[] = []
  for (const e of g.edges) {
    if (e.from === e.to) {
      const i = index.get(e.from)
      if (i !== undefined && g.nodes.has(e.from)) {
        edges.push({ a: i, b: i, aId: e.from, bId: e.to, label: e.label, line: e.line, head: e.head, tail: e.tail })
      }
      continue
    }
    const pa = pathOf(g, e.from), pb = pathOf(g, e.to)
    let k = 0
    while (k < pa.length && k < pb.length && pa[k] === pb[k]) k++
    if (k >= pa.length || k >= pb.length) continue
    if ((k === 0 ? null : pa[k - 1]) !== scope) continue
    const a = index.get(pa[k]), b = index.get(pb[k])
    if (a === undefined || b === undefined) continue
    edges.push({ a, b, aId: e.from, bId: e.to, label: e.label, line: e.line, head: e.head, tail: e.tail })
  }
  return layered(items, edges, dir, labelMax, false)
}

function renderFlow(g: FGraph, force: Dir | null, nodeMax: number, labelMax: number): string {
  return layoutScope(g, null, force ?? g.dir, force, nodeMax, labelMax).lines.join('\n')
}

function labelOf(g: FGraph, id: string): string {
  return g.nodes.get(id)?.label ?? g.subs.get(id)?.label ?? id
}

/** A narrow fallback: boxes stacked top to bottom, branches listed under them. */
function renderFlowList(g: FGraph, width: number): string {
  const order = topoOrder(g)
  const out: string[] = []
  const inner = Math.max(4, width - 4)
  let group = ''
  order.forEach((id, k) => {
    const node = g.nodes.get(id)!
    const here = pathOf(g, id).slice(0, -1).map(s => labelOf(g, s) || s).join(' › ')
    if (here !== group) {
      if (here) out.push(truncate(`┄┄ ${here} ┄┄`, width))
      group = here
    }
    const lines = wrap(node.label, inner)
    const w = Math.max(...lines.map(strWidth)) + 4
    const cv = new Canvas()
    cv.box(0, 0, w, lines.length + 2, BOX_STYLE[node.shape])
    lines.forEach((l, j) => cv.text(2, 1 + j, l))
    out.push(cv.toString())
    const outs = g.edges.filter(e => e.from === id && e.line !== 'invis')
    const next = order[k + 1]
    if (outs.length === 1 && outs[0].to === next && !outs[0].label) {
      out.push('  │', '  ▼')
      return
    }
    outs.forEach((e, j) => {
      const branch = j === outs.length - 1 ? '└─' : '├─'
      const target = labelOf(g, e.to).split('\n')[0]
      const lead = `  ${branch} ${e.label ? e.label.replace(/\n/g, ' ') + ' ' : ''}→ `
      out.push(lead + truncate(target, Math.max(4, width - strWidth(lead))))
    })
    if (k < order.length - 1) out.push('')
  })
  return out.join('\n')
}

function topoOrder(g: FGraph): string[] {
  const ids = g.order.filter(id => g.nodes.has(id))
  const inner = (e: FEdge) => g.nodes.has(e.from) && g.nodes.has(e.to) && e.from !== e.to
  const indeg = new Map(ids.map(id => [id, 0]))
  for (const e of g.edges) if (inner(e)) indeg.set(e.to, indeg.get(e.to)! + 1)
  const done = new Set<string>()
  const order: string[] = []
  while (order.length < ids.length) {
    let queue = ids.filter(id => !done.has(id) && indeg.get(id) === 0)
    if (!queue.length) queue = [ids.find(id => !done.has(id))!]
    while (queue.length) {
      const id = queue.shift()!
      if (done.has(id)) continue
      done.add(id)
      order.push(id)
      for (const e of g.edges) {
        if (e.from !== id || !inner(e) || done.has(e.to)) continue
        indeg.set(e.to, indeg.get(e.to)! - 1)
        if (indeg.get(e.to) === 0) queue.push(e.to)
      }
    }
  }
  return order
}

// ───────────────────────── entity relationship ─────────────────────────

interface EAttr { type: string; name: string; keys: string; comment: string }
interface EEntity { id: string; label: string; attrs: EAttr[] }
interface ERel { a: string; b: string; aCard: string; bCard: string; dashed: boolean; label: string }
interface EDiagram { dir: Dir; entities: Map<string, EEntity>; rels: ERel[] }

const CARD_SYM: Record<string, string> = {
  '|o': '0..1', 'o|': '0..1', '||': '1', '}o': '0..*', 'o{': '0..*', '}|': '1..*', '|{': '1..*',
}

function cardWord(s: string): string | undefined {
  const w = s.trim().toLowerCase()
  if (w === 'one or zero' || w === 'zero or one') return '0..1'
  if (w === 'one or more' || w === 'one or many' || w === 'many(1)' || w === '1+') return '1..*'
  if (w === 'zero or more' || w === 'zero or many' || w === 'many(0)' || w === '0+') return '0..*'
  if (w === 'only one' || w === '1') return '1'
  return undefined
}

const ER_NAME = '("[^"]*"|[^\\s"]+?)'
const ER_SYM = new RegExp(`^${ER_NAME}\\s*(\\|o|\\|\\||\\}o|\\}\\|)(--|\\.\\.)(o\\||\\|\\||o\\{|\\|\\{)\\s*${ER_NAME}\\s*:\\s*(.*)$`)
const ER_WORD = new RegExp(`^${ER_NAME}\\s+(.+?)\\s+(optionally to|to)\\s+(.+?)\\s+${ER_NAME}\\s*:\\s*(.*)$`, 'i')

export function parseEr(src: string): EDiagram {
  const lines = src.split('\n').map(l => l.replace(/%%.*$/, '').trim()).filter(Boolean)
  if (!/^erDiagram\b/.test(lines[0] ?? '')) throw new Error('not an ER diagram')
  const d: EDiagram = { dir: 'TD', entities: new Map(), rels: [] }
  const unq = (s: string) => s.trim().replace(/^"(.*)"$/, '$1')
  const entity = (raw: string) => {
    const id = unq(raw)
    let e = d.entities.get(id)
    if (!e) { e = { id, label: id, attrs: [] }; d.entities.set(id, e) }
    return e
  }
  const relate = (a: string, b: string, aCard: string, bCard: string, dashed: boolean, label: string) => {
    entity(a)
    entity(b)
    d.rels.push({ a: unq(a), b: unq(b), aCard, bCard, dashed, label: cleanLabel(unq(label)) })
  }
  let open: EEntity | null = null
  for (const line of lines.slice(1)) {
    let m: RegExpExecArray | null
    if (open) {
      if (line === '}') { open = null; continue }
      const a = /^(\S+)\s+(\S+)(.*)$/.exec(line.replace(/\s*\}$/, ''))
      if (!a) throw new Error(`cannot read: ${line}`)
      const keys = (a[3].replace(/"[^"]*"/g, '').match(/\b(PK|FK|UK)\b/g) ?? []).join(',')
      const comment = /"([^"]*)"/.exec(a[3])?.[1] ?? ''
      open.attrs.push({ type: a[1], name: a[2], keys, comment })
      if (line.endsWith('}')) open = null
      continue
    }
    if ((m = /^direction\s+(\w+)/i.exec(line))) d.dir = toDir(m[1]) ?? d.dir
    else if (/^(title|accTitle|accDescr|classDef|class|style)\b/.test(line)) continue
    else if ((m = ER_SYM.exec(line))) relate(m[1], m[5], CARD_SYM[m[2]], CARD_SYM[m[4]], m[3] === '..', m[6])
    else if ((m = ER_WORD.exec(line)) && cardWord(m[2]) && cardWord(m[4])) {
      relate(m[1], m[5], cardWord(m[2])!, cardWord(m[4])!, m[3].toLowerCase() !== 'to', m[6])
    } else if ((m = /^("[^"]*"|[^\s[{"]+)\s*(?:\[\s*(?:"(.*)"|(.*?))\s*\])?\s*(\{\s*\}?)?$/.exec(line))) {
      const e = entity(m[1])
      if (m[2] ?? m[3]) e.label = cleanLabel(m[2] ?? m[3])
      if (m[4] && !m[4].includes('}')) open = e
    } else throw new Error(`cannot read: ${line}`)
  }
  if (!d.entities.size) throw new Error('empty ER diagram')
  return d
}

function entityItem(e: EEntity, comments: boolean): Item {
  const rows = e.attrs.map(a => [a.type, a.name, a.keys, comments ? a.comment : ''])
  const cols = [0, 1, 2, 3].map(c => Math.max(0, ...rows.map(r => strWidth(r[c]))))
  const lines = rows.map(r =>
    r.flatMap((s, c) => (cols[c] ? [s + ' '.repeat(cols[c] - strWidth(s))] : [])).join('  ').trimEnd(),
  )
  const title = e.label
  return {
    w: Math.max(strWidth(title), ...lines.map(strWidth)) + 4,
    h: lines.length ? lines.length + 4 : 3,
    draw(cv, x, y, W, H) {
      cv.box(x, y, W, H, 'sq')
      cv.text(x + 2 + Math.floor((W - 4 - strWidth(title)) / 2), y + 1, title)
      if (!lines.length) return
      cv.hline(x, x + 1, y + 2, 'sq')
      cv.hline(x + W - 2, x + W - 1, y + 2, 'sq')
      cv.text(x + 1, y + 2, '─'.repeat(W - 2))
      lines.forEach((l, j) => cv.text(x + 2, y + 3 + j, l))
    },
    ports: (W, H) => new Map([[e.id, { x: 0, y: 0, w: W, h: H }]]),
  }
}

function renderEr(d: EDiagram, dir: Dir, comments: boolean, labelMax: number): string {
  const ids = [...d.entities.keys()]
  const index = new Map(ids.map((id, i) => [id, i]))
  const items = ids.map(id => entityItem(d.entities.get(id)!, comments))
  const edges: LEdge[] = d.rels.map(r => ({
    a: index.get(r.a)!, b: index.get(r.b)!, aId: r.a, bId: r.b,
    label: r.label, line: r.dashed ? 'dot' : 'solid', head: 'none', tail: 'none', aMark: r.aCard, bMark: r.bCard,
  }))
  return layered(items, edges, dir, labelMax, true).lines.join('\n')
}

/** A narrow fallback: entities stacked, then one line per relationship. */
function renderErList(d: EDiagram, width: number): string {
  const out: string[] = []
  for (const e of d.entities.values()) {
    const it = entityItem(e, false)
    if (it.w <= width) {
      const cv = new Canvas()
      it.draw(cv, 0, 0, it.w, it.h)
      out.push(cv.toString())
    } else {
      out.push(truncate(`■ ${e.label}`, width))
      for (const a of e.attrs) out.push(truncate(`  ${[a.type, a.name, a.keys].filter(Boolean).join(' ')}`, width))
    }
  }
  if (d.rels.length) out.push('')
  for (const r of d.rels) {
    const dash = r.dashed ? '┄┄' : '──'
    const a = d.entities.get(r.a)!.label, b = d.entities.get(r.b)!.label
    const one = `${a} (${r.aCard}) ${dash}${r.label ? ` ${r.label} ` : ''}${dash} (${r.bCard}) ${b}`
    if (strWidth(one) <= width) { out.push(one); continue }
    out.push(truncate(`${a} (${r.aCard})`, width))
    out.push(...wrap(`${dash}${r.label ? ` ${r.label} ` : ''}${dash} (${r.bCard}) ${b}`, width - 2).map(l => `  ${l}`))
  }
  return out.join('\n')
}

// ───────────────────────── sequence diagram ─────────────────────────

interface SPart { id: string; label: string; actor: boolean }
type SEvent =
  | { k: 'msg'; from: number; to: number; text: string; dashed: boolean; head: 'arrow' | 'open' | 'cross' | 'async'; both: boolean }
  | { k: 'note'; pos: 'left' | 'right' | 'over'; a: number; b: number; text: string }
  | { k: 'rule'; text: string; end: boolean }
interface SDiagram { parts: SPart[]; events: SEvent[]; number: boolean }

export function parseSequence(src: string): SDiagram {
  const lines = src.split('\n').map(l => l.replace(/%%.*$/, '').trim()).filter(Boolean)
  if (!/^sequenceDiagram\b/.test(lines[0] ?? '')) throw new Error('not a sequence diagram')
  const d: SDiagram = { parts: [], events: [], number: false }
  const part = (raw: string) => {
    const id = raw.trim()
    let i = d.parts.findIndex(p => p.id === id)
    if (i < 0) { d.parts.push({ id, label: id, actor: false }); i = d.parts.length - 1 }
    return i
  }
  const stack: string[] = []
  for (const line of lines.slice(1)) {
    let m: RegExpExecArray | null
    if ((m = /^(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/i.exec(line))) {
      const i = part(m[2])
      d.parts[i].label = cleanLabel(m[3] ?? m[2])
      d.parts[i].actor = m[1].toLowerCase() === 'actor'
    } else if ((m = /^(.+?)\s*(<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->)\s*([+-]?)\s*(.+?)\s*:(.*)$/.exec(line))) {
      const arrow = m[2]
      d.events.push({
        k: 'msg', from: part(m[1]), to: part(m[4]), text: cleanLabel(m[5]),
        dashed: arrow.startsWith('--') || arrow.startsWith('<<--'),
        head: arrow.endsWith('>>') ? 'arrow' : arrow.endsWith('x') ? 'cross' : arrow.endsWith(')') ? 'async' : 'open',
        both: arrow.startsWith('<<'),
      })
    } else if ((m = /^note\s+(left of|right of|over)\s+([^:]+?)\s*:(.*)$/i.exec(line))) {
      const [a, b = a] = m[2].split(',').map(part)
      const pos = m[1].toLowerCase().startsWith('left') ? 'left' : m[1].toLowerCase().startsWith('right') ? 'right' : 'over'
      d.events.push({ k: 'note', pos, a: Math.min(a, b), b: Math.max(a, b), text: cleanLabel(m[3]) })
    } else if ((m = /^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i.exec(line))) {
      stack.push(m[1])
      if (m[1].toLowerCase() !== 'rect') d.events.push({ k: 'rule', text: `${m[1]} ${cleanLabel(m[2])}`.trim(), end: false })
    } else if ((m = /^(else|and|option)\b\s*(.*)$/i.exec(line))) {
      d.events.push({ k: 'rule', text: `${m[1]} ${cleanLabel(m[2])}`.trim(), end: false })
    } else if (/^box\b/i.test(line)) {
      stack.push('box')
    } else if (/^end$/i.test(line)) {
      const open = stack.pop()
      if (open && open !== 'box' && open.toLowerCase() !== 'rect') d.events.push({ k: 'rule', text: '', end: true })
    } else if (/^autonumber\b/i.test(line)) {
      d.number = true
    } else if (/^(activate|deactivate|title|accTitle|accDescr|create|destroy|links?|properties|details)\b/i.test(line)) {
      continue
    } else throw new Error(`cannot read: ${line}`)
  }
  if (!d.parts.length) throw new Error('empty sequence diagram')
  return d
}

function renderSequence(d: SDiagram, msgMax: number, partMax: number): string {
  const n = d.parts.length
  const pText = d.parts.map(p => wrap(p.label, partMax))
  const pw = pText.map(ls => Math.max(...ls.map(strWidth)) + 4)
  const ph = Math.max(...pText.map(ls => ls.length)) + 2
  const lh = (w: number) => Math.floor(w / 2)
  const rh = (w: number) => w - 1 - lh(w)
  const need: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  const req = (i: number, j: number, v: number) => { need[i][j] = Math.max(need[i][j], v) }
  for (let i = 0; i + 1 < n; i++) req(i, i + 1, rh(pw[i]) + lh(pw[i + 1]) + 3)
  let leftPad = 0, rightExtra = 0
  let num = 0
  const msgText = d.events.map(e => {
    if (e.k !== 'msg') return [] as string[]
    num++
    const t = d.number ? `${num}. ${e.text}` : e.text
    return t ? wrap(t, msgMax) : []
  })
  const noteText = d.events.map(e => (e.k === 'note' ? wrap(e.text, e.pos === 'over' && e.a !== e.b ? Math.max(msgMax, 16) : msgMax) : []))
  d.events.forEach((e, k) => {
    if (e.k === 'msg') {
      const w = Math.max(0, ...msgText[k].map(strWidth))
      if (e.from === e.to) {
        if (e.from + 1 < n) req(e.from, e.from + 1, w + 8)
        else rightExtra = Math.max(rightExtra, w + 7)
      } else req(Math.min(e.from, e.to), Math.max(e.from, e.to), Math.max(w + 4, 6))
    } else if (e.k === 'note') {
      const w = Math.max(...noteText[k].map(strWidth)) + 4
      if (e.pos === 'right') { if (e.a + 1 < n) req(e.a, e.a + 1, w + 3); else rightExtra = Math.max(rightExtra, w + 2) }
      else if (e.pos === 'left') { if (e.a > 0) req(e.a - 1, e.a, w + 3); else leftPad = Math.max(leftPad, w + 2) }
      else if (e.a === e.b) { if (e.a === 0) leftPad = Math.max(leftPad, lh(w)); if (e.a === n - 1) rightExtra = Math.max(rightExtra, rh(w)) }
    }
  })
  const c: number[] = []
  for (let j = 0; j < n; j++) {
    c.push(j === 0 ? Math.max(lh(pw[0]), leftPad) : Math.max(...c.map((ci, i) => ci + need[i][j])))
  }
  const W = c[n - 1] + Math.max(rh(pw[n - 1]), rightExtra) + 1

  const cv = new Canvas()
  const heads: [number, number, string][] = []
  const drawParts = (y: number) => d.parts.forEach((p, i) => {
    const x0 = c[i] - lh(pw[i])
    cv.box(x0, y, pw[i], ph, p.actor ? 'rd' : 'sq')
    pText[i].forEach((l, j) => cv.text(x0 + 2 + Math.floor((pw[i] - 4 - strWidth(l)) / 2), y + 1 + j, l))
  })
  let y = ph
  const later: (() => void)[] = []
  d.events.forEach((e, k) => {
    if (e.k === 'msg') {
      const lines = msgText[k]
      const st: Style = e.dashed ? 'dot' : 'sq'
      const glyphFor = (right: boolean) =>
        e.head === 'cross' ? 'x' : e.head === 'async' ? (right ? '›' : '‹') : right ? '▶' : '◀'
      if (e.from === e.to) {
        const x = c[e.from]
        const top = y + 1
        lines.forEach((l, j) => later.push(() => cv.text(x + 5, top + j, l)))
        cv.hline(x, x + 3, top, st)
        cv.vline(x + 3, top, top + 1, st)
        cv.hline(x + 1, x + 3, top + 1, st)
        if (e.head !== 'open') heads.push([x + 1, top + 1, glyphFor(false)])
        y = top + Math.max(2, lines.length)
        return
      }
      const right = e.to > e.from
      const x1 = c[e.from], x2 = c[e.to]
      const mid = Math.floor((x1 + x2) / 2)
      const top = y + 1
      lines.forEach((l, j) => later.push(() => cv.text(mid - Math.floor(strWidth(l) / 2), top + j, l)))
      const ay = top + lines.length
      const dirn = right ? 1 : -1
      const startX = e.both ? x1 + dirn : x1
      const endX = e.head === 'open' ? x2 : x2 - dirn
      cv.hline(startX, endX, ay, st)
      if (e.head !== 'open') heads.push([x2 - dirn, ay, glyphFor(right)])
      if (e.both) heads.push([x1 + dirn, ay, glyphFor(!right)])
      y = ay
    } else if (e.k === 'note') {
      const lines = noteText[k]
      const w0 = Math.max(...lines.map(strWidth)) + 4
      let x0: number, w = w0
      if (e.pos === 'right') x0 = c[e.a] + 2
      else if (e.pos === 'left') x0 = c[e.a] - 1 - w0
      else if (e.a === e.b) x0 = c[e.a] - lh(w0)
      else { w = Math.max(w0, c[e.b] - c[e.a] + 5); x0 = Math.floor((c[e.a] + c[e.b]) / 2) - lh(w) }
      const top = y + 1
      const h = lines.length + 2
      later.push(() => {
        cv.fill(x0, top, w, h)
        cv.text(x0, top, '╭' + '─'.repeat(w - 2) + '╮')
        cv.text(x0, top + h - 1, '╰' + '─'.repeat(w - 2) + '╯')
        lines.forEach((l, j) => {
          cv.set(x0, top + 1 + j, '│')
          cv.text(x0 + 2, top + 1 + j, l)
          cv.set(x0 + w - 1, top + 1 + j, '│')
        })
      })
      y = top + h - 1
    } else {
      const ry = y + 1
      cv.hline(0, W - 1, ry, 'dot')
      if (e.text) later.push(() => cv.text(2, ry, ` ${e.text} `))
      y = ry
    }
  })
  const bottom = y + 2
  c.forEach(x => cv.vline(x, ph - 1, bottom, 'dot'))
  drawParts(0)
  drawParts(bottom)
  for (const draw of later) draw()
  for (const [x, yy, ch] of heads) cv.set(x, yy, ch)
  return cv.toString()
}

function renderSequenceList(d: SDiagram, width: number): string {
  const out: string[] = []
  let num = 0
  let depth = 0
  for (const e of d.events) {
    const pad = '  '.repeat(depth)
    if (e.k === 'msg') {
      num++
      const arrow = e.dashed ? '⇢' : '→'
      const lead = `${pad}${d.number ? `${num}. ` : ''}${d.parts[e.from].label} ${arrow} ${d.parts[e.to].label}`
      out.push(...wrap(e.text ? `${lead}：${e.text}` : lead, width))
    } else if (e.k === 'note') {
      out.push(...wrap(`${pad}〔${d.parts[e.a].label}〕${e.text}`, width))
    } else if (e.end) depth = Math.max(0, depth - 1)
    else {
      if (/^(else|and|option)\b/i.test(e.text)) out.push(`${'  '.repeat(Math.max(0, depth - 1))}[${e.text}]`)
      else { out.push(`${pad}[${e.text}]`); depth++ }
    }
  }
  return out.join('\n')
}

// ───────────────────────── entry points ─────────────────────────

export type RenderResult =
  | { kind: 'ok'; text: string }
  | { kind: 'narrow' }
  | { kind: 'error'; message: string }
  | { kind: 'unsupported' }

export function renderMermaid(src: string, width: number): RenderResult {
  const first = src.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('%%')) ?? ''
  try {
    if (/^(flowchart|graph)\b/i.test(first)) {
      const g = parseFlowchart(src)
      const sizes: [number, number][] = [[36, 20], [28, 16], [20, 12], [14, 10], [10, 8]]
      const sideways = [g.dir, ...[...g.subs.values()].map(s => s.dir)].some(d => d === 'LR' || d === 'RL')
      const tries: [Dir | null, number, number][] = [
        ...(sideways ? sizes.slice(0, 3) : sizes).map(([a, b]) => [null, a, b] as [Dir | null, number, number]),
        ...(sideways ? sizes.map(([a, b]) => ['TD', a, b] as [Dir | null, number, number]) : []),
      ]
      for (const [force, nm, lm] of tries) {
        const out = renderFlow(g, force, nm, lm)
        if (widthOf(out) <= width) return { kind: 'ok', text: out }
      }
      const list = renderFlowList(g, width)
      return width >= 24 && widthOf(list) <= width ? { kind: 'ok', text: list } : { kind: 'narrow' }
    }
    if (/^erDiagram\b/.test(first)) {
      const d = parseEr(src)
      const dirs: Dir[] = d.dir === 'LR' || d.dir === 'RL' ? [d.dir, 'TD'] : [d.dir]
      for (const dir of dirs) {
        for (const [comments, lm] of [[true, 16], [false, 16], [false, 10]] as [boolean, number][]) {
          const out = renderEr(d, dir, comments, lm)
          if (widthOf(out) <= width) return { kind: 'ok', text: out }
        }
      }
      return width >= 24 ? { kind: 'ok', text: renderErList(d, width) } : { kind: 'narrow' }
    }
    if (/^sequenceDiagram\b/.test(first)) {
      const d = parseSequence(src)
      for (const [mm, pm] of [[30, 20], [20, 14], [12, 10], [8, 6]]) {
        const out = renderSequence(d, mm, pm)
        if (widthOf(out) <= width) return { kind: 'ok', text: out }
      }
      const list = renderSequenceList(d, width)
      return width >= 24 ? { kind: 'ok', text: list } : { kind: 'narrow' }
    }
    return { kind: 'unsupported' }
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Replaces each complete ```mermaid block of a markdown text with its drawing,
 * fitted to `width` columns. Blocks still being written (no closing fence),
 * diagram types it does not draw, and diagrams that fail to parse are kept.
 */
export function renderMarkdown(text: string, width: number): string {
  const lines = text.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)(`{3,}|~{3,})\s*mermaid\s*$/i.exec(lines[i])
    if (!open) { out.push(lines[i]); continue }
    const [, indent, fence] = open
    let j = i + 1
    while (j < lines.length && !(lines[j].trim().startsWith(fence) && /^[`~]+$/.test(lines[j].trim()))) j++
    if (j >= lines.length) { out.push(...lines.slice(i)); break }
    const body = lines.slice(i + 1, j).map(l => l.slice(indent.length)).join('\n')
    const res = renderMermaid(body, width - indent.length)
    if (res.kind === 'ok') {
      out.push(`${indent}\`\`\`text`, ...res.text.split('\n').map(l => indent + l), `${indent}\`\`\``)
    } else {
      out.push(...lines.slice(i, j + 1))
      if (res.kind === 'narrow') out.push(`${indent}*（視窗太窄，放寬後會顯示 mermaid 圖）*`)
      if (res.kind === 'error') out.push(`${indent}*（mermaid 無法解析，顯示原始碼：${res.message.slice(0, 80)}）*`)
    }
    i = j
  }
  return out.join('\n')
}
