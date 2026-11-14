import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Level } from '../types'

const level = atom({ plugin: 'clawd-estresado', key: 'level' } as const, 0)
const frame = atom({ plugin: 'clawd-estresado', key: 'frame' } as const, 0)
const isHidden = atom(
  { plugin: 'clawd-estresado', key: 'isHidden' } as const,
  false,
)

const activity = atom(
  { plugin: 'clawd-estresado', key: 'activity' } as const,
  'Esperando tu mensaje.',
)

const bangs = atom({ plugin: 'clawd-estresado', key: 'bangs' } as const, 0)

const TICK_MS = 500
/** Cuánto festeja cuando pasan las pruebas, y cuánto tarda en dormirse sin hacer nada. */
const PARTY_MS = 4000
const SLEEP_MS = 5 * 60_000
const ASLEEP = 'Zzz…'
const PASSED = '¡Pasaron las pruebas!'
/** Los comandos que corren pruebas o comprobaciones: si terminan bien, Clawd festeja. */
const TESTS = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\b(jest|vitest|pytest|mocha|playwright)\b|\b(flutter|cargo|go|dotnet|deno)\s+test\b|\bplugin\s+test\b/i
const SCARE_MS = 30_000
/** What `/clawd test` plays, in order: how long, the mood, the caption. */
const DEMO: ReadonlyArray<readonly [number, Level, string]> = [
  [3000, 1, 'Demostración: trabajando…'],
  [3000, 2, 'Demostración: se pone nervioso…'],
  [4000, 3, 'Demostración: ¡cabezazos!'],
  [3000, 2, 'Demostración: se va calmando…'],
  [2500, 4, 'Demostración: ¡festeja!'],
  [3000, 5, 'Demostración: se duerme…'],
]
const IDLE = 'Esperando tu mensaje.'
const THINKING = 'Pensando…'

function clip(text: unknown, max: number): string {
  const line = String(text ?? '').replace(/\s+/g, ' ').trim()

  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

function fileName(path: unknown): string {
  return String(path ?? '').split(/[\\/]/).pop() || 'un archivo'
}

/** What a tool call is doing, in words, from its name and arguments. */
function describe(tool: string, input: Readonly<Record<string, unknown>>): string {
  switch (tool) {
    case 'Bash':
    case 'PowerShell':
      return `Ejecutando: ${clip(input.command, 70)}`
    case 'Read':
      return `Leyendo ${fileName(input.file_path)}`
    case 'Edit':
    case 'NotebookEdit':
      return `Editando ${fileName(input.file_path ?? input.notebook_path)}`
    case 'Write':
      return `Escribiendo ${fileName(input.file_path)}`
    case 'Grep':
      return `Buscando "${clip(input.pattern, 50)}" en el código`
    case 'Glob':
      return `Buscando archivos ${clip(input.pattern, 50)}`
    case 'WebSearch':
      return `Buscando en la web: ${clip(input.query, 60)}`
    case 'WebFetch':
      return `Abriendo ${clip(input.url, 60)}`
    case 'Agent':
    case 'Task':
      return `Delegando a un subagente: ${clip(input.description, 50)}`
    case 'AskUserQuestion':
      return 'Haciéndote una pregunta'
    case 'Skill':
      return `Cargando la skill ${clip(input.skill, 40)}`
    case 'ToolSearch':
      return 'Buscando una herramienta'
    default: {
      const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)

      return mcp ? `Usando ${mcp[2]} (${mcp[1]})` : `Usando ${tool}`
    }
  }
}

const BODY = '#D97757'
const DARK = '#1f1f1f'
const EASE = '0.45 0 0.55 1'
const BANG = '1.2s'
const HIT = `keyTimes="0;0.42;0.5;1" dur="${BANG}" repeatCount="indefinite"`

/** One pixel-art block. */
function px(x: number, y: number, w: number, h: number, fill: string, inner = ''): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}">${inner}</rect>`
}

function eyes(lv: Level): string {
  if (lv === 4) {
    // Ojos contentos: dos arcos hacia arriba.
    return `<path d="M24 24l4 -6l4 6M40 24l4 -6l4 6" fill="none" stroke="${DARK}" stroke-width="2.5" stroke-linecap="square"/>`
  }

  if (lv === 5) {
    // Dormido: los ojos son dos rayas.
    return px(25, 22, 6, 2, DARK) + px(41, 22, 6, 2, DARK)
  }

  if (lv === 3) {
    const cross = (x: number) =>
      `<path d="M${x - 3} 17l6 8M${x + 3} 17l-6 8" stroke="${DARK}" stroke-width="2.5" stroke-linecap="square"/>`

    return cross(28) + cross(44)
  }

  if (lv === 2) {
    return (
      px(25, 14, 6, 12, DARK) +
      px(41, 14, 6, 12, DARK) +
      px(60, 6, 4, 6, '#5aa9e6',
        '<animateTransform attributeName="transform" type="translate" values="0 0;0 14" calcMode="spline" keySplines="0.5 0 1 1" dur="1.1s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;1;0" keyTimes="0;0.6;1" dur="1.1s" repeatCount="indefinite"/>')
    )
  }

  const blink =
    '<animate attributeName="height" values="8;8;1;8" keyTimes="0;0.9;0.95;1" dur="4s" repeatCount="indefinite"/><animate attributeName="y" values="17;17;24;17" keyTimes="0;0.9;0.95;1" dur="4s" repeatCount="indefinite"/>'

  return px(26, 17, 4, 8, DARK, blink) + px(42, 17, 4, 8, DARK, blink)
}

function bodyMotion(lv: Level): string {
  if (lv === 4) {
    // Saltitos: sube rápido y cae.
    return '<animateTransform attributeName="transform" type="translate" values="0 0;0 -9;0 0" calcMode="spline" keySplines="0 0 0.4 1;0.6 0 1 1" dur="0.55s" repeatCount="indefinite"/>'
  }

  if (lv === 5) {
    // Respira despacio, un poco hundido.
    return `<animateTransform attributeName="transform" type="translate" values="0 2;0 3.5;0 2" calcMode="spline" keySplines="${EASE};${EASE}" dur="3.6s" repeatCount="indefinite"/>`
  }

  if (lv === 3) {
    // Wind up, slam, a small bounce on the deck, then back up slowly.
    return `<animateTransform attributeName="transform" type="rotate" values="0 40 46;-12 40 46;72 40 46;63 40 46;72 40 46;0 40 46" keyTimes="0;0.25;0.42;0.5;0.58;1" calcMode="spline" keySplines="0.3 0 0.4 1;0.7 0 1 0.6;0 0.4 0.4 1;0.6 0 1 0.6;${EASE}" dur="${BANG}" repeatCount="indefinite"/>`
  }

  if (lv === 2) {
    return `<animateTransform attributeName="transform" type="rotate" values="-3 36 38;3 36 38;-3 36 38" calcMode="spline" keySplines="${EASE};${EASE}" dur="0.55s" repeatCount="indefinite"/>`
  }

  return `<animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" calcMode="spline" keySplines="${EASE};${EASE}" dur="${lv === 1 ? '1.4s' : '3s'}" repeatCount="indefinite"/>`
}

function arm(x: number, lv: Level, begin: string): string {
  const tap =
    lv === 1 || lv === 2
      ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 7;0 0" calcMode="spline" keySplines="${EASE};${EASE}" dur="${lv === 2 ? '0.3s' : '0.5s'}" begin="${begin}" repeatCount="indefinite"/>`
      : ''

  if (lv === 4) {
    // Brazos arriba, agitándose.
    return px(x, 9, 8, 8, BODY, `<animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="0.28s" begin="${begin}" repeatCount="indefinite"/>`)
  }

  return px(x, 22, 8, 8, BODY, tap)
}

function impact(): string {
  const key = (x: number, dx: number) =>
    `<rect x="${x}" y="40" width="5" height="4" fill="#9ca3af" opacity="0"><animate attributeName="opacity" values="0;0;1;0" ${HIT}/><animateTransform attributeName="transform" type="translate" values="0 0;0 0;${dx} -8;${dx * 2} -26" ${HIT}/></rect>`

  return (
    `<text x="66" y="36" font-size="16" fill="#f5b700" opacity="0">✶<animate attributeName="opacity" values="0;0;1;0" ${HIT}/></text>` +
    `<text x="86" y="30" font-size="11" fill="#f5b700" opacity="0">✶<animate attributeName="opacity" values="0;0;1;0" ${HIT}/></text>` +
    key(78, 3) +
    key(96, 6)
  )
}

function confetti(): string {
  const bits: ReadonlyArray<readonly [number, string, number, number]> = [
    [6, '#f5b700', 1.1, 0],
    [18, '#5aa9e6', 1.4, 0.3],
    [34, '#7bd389', 1.0, 0.6],
    [50, '#f472b6', 1.3, 0.15],
    [62, '#f5b700', 1.2, 0.45],
    [72, '#5aa9e6', 1.5, 0.75],
  ]

  return bits
    .map(
      ([x, color, seconds, begin]) =>
        `<rect x="${x}" y="-4" width="3" height="3" fill="${color}"><animateTransform attributeName="transform" type="translate" values="0 0;4 62" dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"/></rect>`,
    )
    .join('')
}

function snore(): string {
  const z = (x: number, y: number, size: number, begin: number) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-family="sans-serif" font-weight="bold" fill="#9ca3af" opacity="0">z<animate attributeName="opacity" values="0;1;0" dur="2.4s" begin="${begin}s" repeatCount="indefinite"/></text>`

  return z(60, 24, 8, 0) + z(66, 16, 10, 0.8) + z(73, 8, 12, 1.6)
}

/** Clawd in blocks: a boxy body, slit eyes, two stub arms, four legs. */
function clawd(lv: Level): string {
  const jolt =
    lv === 3
      ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 3;0 0" calcMode="spline" keySplines="0 0 1 1;0 0 0.3 1;0.3 0 0.4 1" ${HIT}/>`
      : ''
  const keys = [64, 70, 76, 82, 88, 94]
    .map(x => px(x, 46, 4, 2, '#d1d5db'))
    .join('')
  // A laptop seen from the side: the deck Clawd hits, the lid open behind it.
  const laptop =
    px(60, 46, 46, 6, '#6b7280') +
    keys +
    `<path d="M100 47L110 13L115 14.5L105 48.5Z" fill="#4b5563"/>` +
    `<path d="M102.5 43L110.8 16.5" stroke="${lv === 5 ? '#55657a' : '#93c5fd'}" stroke-width="1.6"/>`
  const legs = [20, 28, 40, 48].map(x => px(x, 38, 4, 8, BODY)).join('')

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60" width="120" height="60">' +
    `<g>${jolt}${laptop}</g>` +
    legs +
    `<g>${bodyMotion(lv)}${arm(8, lv, '0s')}${arm(56, lv, lv === 2 ? '0.15s' : '0.25s')}${px(16, 10, 40, 28, BODY)}${eyes(lv)}</g>` +
    (lv === 3 ? impact() : '') +
    (lv === 4 ? confetti() : '') +
    (lv === 5 ? snore() : '') +
    '</svg>'
  )
}

/** The terminal has no Svg: one line of text, two frames per level. */
function ascii(lv: Level, f: number): string {
  const isOdd = f % 2 === 1

  if (lv === 5) {
    return isOdd ? '▐▛-█-▜▌ zZ 💻' : '▐▛-█-▜▌ Zz 💻'
  }

  if (lv === 4) {
    return isOdd ? '▐▛^█^▜▌ ✨ 💻' : ' ▐▛^█^▜▌✨ 💻'
  }

  if (lv === 3) {
    return isOdd ? '  ▐▛x█x▜▌💥💻' : '▐▛>█<▜▌   💻'
  }

  if (lv === 2) {
    return isOdd ? '▐▛O█O▜▌;  💻' : ' ▐▛O█O▜▌; 💻'
  }

  if (lv === 1) {
    return isOdd ? '▐▛███▜▌▖  💻' : '▐▛███▜▌▘  💻'
  }

  return '▐▛███▜▌   💻'
}

// The running turn's own numbers: a reload starts them over, which is fine.
const turn = {
  startedAt: 0,
  tools: 0,
  // When each scare happened (a failed tool, a question): they fade with time.
  scares: [] as number[],
  isWorking: false,
  forcedUntil: 0,
  partyUntil: 0,
  // Cuándo se duerme si nadie hace nada; Infinity mientras Claude trabaja.
  sleepAt: Infinity,
  sleeper: undefined as Timer | undefined,
  bangs: 0,
  demoStart: -1,
  current: 0 as Level,
  running: 0,
  activity: IDLE,
  hasTextSurface: false,
  ticker: undefined as Timer | undefined,
}

function dayOf(now: number): string {
  const d = new Date(now)

  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** Los cabezazos de hoy, como los guardó esta u otra sesión; otro día empieza de cero. */
async function loadBangs($: EngineInterface): Promise<void> {
  const kept = (await $.store.get('bangs').catch(() => undefined)) as { day?: unknown; count?: unknown } | undefined
  const today = dayOf(await $.clock.now())

  turn.bangs = kept && kept.day === today && typeof kept.count === 'number' ? kept.count : 0
  await update($, bangs, () => turn.bangs)
}

async function countBang($: EngineInterface): Promise<void> {
  await loadBangs($)
  turn.bangs += 1
  await update($, bangs, () => turn.bangs)
  await $.store.set('bangs', { day: dayOf(await $.clock.now()), count: turn.bangs }).catch(() => {})
}

async function setLevel($: EngineInterface, lv: Level): Promise<void> {
  if (lv === turn.current) {
    return
  }

  // Un episodio de cabezazos de verdad cuenta; el de la demostración, no.
  if (lv === 3 && turn.demoStart < 0) {
    await countBang($).catch(() => {})
  }

  turn.current = lv
  await update($, level, () => lv)
}

async function say($: EngineInterface, text: string): Promise<void> {
  if (text === turn.activity) {
    return
  }

  turn.activity = text
  await update($, activity, () => text)
}

async function judge($: EngineInterface): Promise<void> {
  const now = await $.clock.now()

  if (turn.demoStart >= 0) {
    let until = turn.demoStart

    for (const [ms, lv, caption] of DEMO) {
      until += ms

      if (now < until) {
        await say($, caption)

        return setLevel($, lv)
      }
    }

    turn.demoStart = -1
    await say($, turn.isWorking ? THINKING : IDLE)
  }

  if (now < turn.forcedUntil) {
    return setLevel($, 3)
  }

  if (now < turn.partyUntil) {
    return setLevel($, 4)
  }

  if (!turn.isWorking) {
    if (now >= turn.sleepAt) {
      await say($, ASLEEP)

      return setLevel($, 5)
    }

    return setLevel($, 0)
  }

  // A scare weighs 2 for half a minute, 1 for another half, then nothing.
  turn.scares = turn.scares.filter(at => now - at < 2 * SCARE_MS)
  const scared = turn.scares.reduce(
    (sum, at) => sum + (now - at < SCARE_MS ? 2 : 1),
    0,
  )
  // Effort alone makes Clawd nervous at most: a long turn, many tools.
  const effort =
    (now - turn.startedAt >= 120_000 ? 1 : 0) + (turn.tools >= 20 ? 1 : 0)
  const score = scared + effort

  return setLevel($, score >= 4 ? 3 : score >= 2 ? 2 : 1)
}

function stopTicker(): void {
  turn.ticker?.cancel()
  turn.ticker = undefined
}

async function tick($: EngineInterface): Promise<void> {
  await judge($)

  // Tranquilo o dormido no hay nada que animar, salvo en plena demostración.
  if (turn.demoStart < 0 && (turn.current === 0 || turn.current === 5)) {
    stopTicker()
  } else if (turn.hasTextSurface) {
    await update($, frame, n => (n + 1) % 1000)
  }
}

function stayAwake(): void {
  turn.sleeper?.cancel()
  turn.sleeper = undefined
  turn.sleepAt = Infinity
}

/** Tras un rato sin que nadie haga nada, Clawd se duerme. */
async function dozeLater($: EngineInterface): Promise<void> {
  stayAwake()
  turn.sleepAt = (await $.clock.now()) + SLEEP_MS
  turn.sleeper = $.clock.after(SLEEP_MS + 50, () => {
    void judge($)
  })
}

function startTicker($: EngineInterface): void {
  stopTicker()
  turn.ticker = $.clock.every(TICK_MS, () => {
    void tick($)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'clawd',
      description:
        'Muestra u oculta a Clawd; "/clawd test" recorre todos sus estados.',
      argumentHint: '[test]',
    })
    turn.current = 0
    turn.activity = IDLE
    await update($, level, () => 0)
    await update($, activity, () => IDLE)
    await loadBangs($).catch(() => {})
    await dozeLater($).catch(() => {})

    return next(e)
  })

  on('command.run', { command: 'clawd' }, async ($, e) => {
    if (e.args.trim() === 'test') {
      turn.demoStart = await $.clock.now()
      await update($, isHidden, () => false)
      await judge($)
      startTicker($)

      return {
        text: 'Clawd recorre todos sus estados durante 18 segundos y se calma.',
      }
    }

    const hidden = !(await read($, isHidden))
    await update($, isHidden, () => hidden)

    return { text: hidden ? 'Clawd oculto.' : 'Clawd a la vista.' }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      turn.startedAt = await $.clock.now()
      turn.tools = 0
      turn.scares = []
      turn.isWorking = true
      turn.running = 0
      stayAwake()
      await say($, THINKING)
      await judge($)
      startTicker($)
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    turn.tools += 1

    if (String(e.tool) === 'AskUserQuestion') {
      turn.scares.push(await $.clock.now())
    }

    const { tool, tool_use_id: _id, agentId, ...input } = e as unknown as {
      tool: string
      tool_use_id?: string
      agentId?: string
    } & Record<string, unknown>
    const doing = describe(String(tool), input)

    turn.running += 1
    await say($, agentId === undefined ? doing : `Subagente: ${doing}`)

    const ran = await next(e)
    const hasFailed = ran.deny !== undefined || ran.isError === true

    if (hasFailed) {
      turn.scares.push(await $.clock.now())
    }

    turn.running = Math.max(0, turn.running - 1)

    if (turn.running === 0 && turn.isWorking) {
      await say($, hasFailed ? `Falló: ${doing}` : THINKING)
    }

    // Pasaron las pruebas: festeja un momento.
    const command = typeof input.command === 'string' ? input.command : ''

    if (!hasFailed && agentId === undefined && (tool === 'Bash' || tool === 'PowerShell') && TESTS.test(command)) {
      turn.partyUntil = (await $.clock.now()) + PARTY_MS
      await say($, PASSED)
    }

    await judge($)

    return ran
  })

  on('turn.step', async function* ($, e, next) {
    const isMain = (e as { agentId?: string }).agentId === undefined

    for await (const chunk of next(e)) {
      if (isMain && turn.running === 0) {
        if (chunk.kind === 'thinking') {
          await say($, THINKING)
        } else if (chunk.kind === 'text') {
          await say($, 'Escribiendo la respuesta…')
        } else if (chunk.kind === 'tool') {
          await say($, `Preparando ${chunk.name}…`)
        }
      }

      yield chunk
    }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      turn.isWorking = false
      turn.running = 0
      await say(
        $,
        e.reason === 'error'
          ? 'El turno terminó con un error.'
          : e.reason === 'aborted'
            ? 'Interrumpido.'
            : IDLE,
      )

      if (e.reason === 'error' || e.reason === 'refusal') {
        turn.forcedUntil = (await $.clock.now()) + 5000
      }

      await dozeLater($).catch(() => {})
      await judge($)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const lv = (await read($, level)) as Level
    const doing = await read($, activity)
    const hits = await read($, bangs)
    const tally = hits === 0 ? '' : ` · ${hits === 1 ? '1 cabezazo' : `${hits} cabezazos`} hoy`

    if (e.surface === 'terminal') {
      turn.hasTextSurface = true
      const f = await read($, frame)
      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          <Box>
            <Text color={BODY}>{ascii(lv, f)}</Text>
            <Text dimColor> {doing}{tally}</Text>
          </Box>
          {await next(e)}
        </Box>
      )
    }

    const { Box, Text, Svg } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="center" gap={1}>
        <Svg
          source={clawd(lv)}
          alt={`Clawd: ${doing}`}
          width={120}
          height={60}
          isInteractive
        />
        <Text dimColor size="caption">
          {doing}{tally}
        </Text>
        </Box>
        {await next(e)}
      </Box>
    )
  })
}
