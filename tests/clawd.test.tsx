import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'clawd-estresado',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('the clawd is calm, then bangs its head after two failed tools', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'clawd' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  let during: string | undefined
  on('tool.call', async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    during = (await ui.find({ type: 'Text', text: /Ejecutando|Leyendo/ }))?.text
    await ui.unmount()

    return { deny: 'boom' }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /Esperando/ }))?.text).toMatch(
      /Esperando tu mensaje/,
    )
    await ui.unmount()
  }

  await $.turn.start({ text: 'hola', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: 'C:\\proyecto\\src\\app.ts' })
  expect(during).toBe('Leyendo app.ts')
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /Falló/ }))?.text).toMatch(
      /Falló: Ejecutando: ls/,
    )
    await ui.unmount()
  }

  // While the tool ran, the caption said what it was doing.
  expect(during).toBe('Ejecutando: ls')

  // Two failures: on the terminal Clawd's face is the head-banging one.
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /[x>]█[x<]/ }))?.text).toMatch(/💻/)
  await ui.unmount()

  // A minute and a half with no new failure: Clawd is back to plain typing.
  await clock.advance(90_000)
  const later = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await later.find({ type: 'Text', text: /▐▛███▜▌/ }))?.text).toMatch(/💻/)
  await later.unmount()
})

test('the bands of the mods beneath stay drawn under Clawd', async ($, on) => {
  mock.clock(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>otro mod</Text>
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /otro mod/ }))?.text).toBe(
      'otro mod',
    )
    expect((await ui.find({ type: 'Text', text: /Esperando/ }))?.text).toMatch(
      /Esperando tu mensaje/,
    )
    await ui.unmount()
  }
})

test('/clawd test walks every mood and ends calm', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'clawd' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // The engine stamps the origin and presentation of a real run.
  await $.command.run({ command: 'clawd', args: 'test' } as never)

  const seen: string[] = []

  for (const wait of [0, 3000, 3000, 4000, 3000, 2500]) {
    await clock.advance(wait)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    seen.push(
      (await ui.find({ type: 'Text', text: /Demostración|Esperando/ }))?.text ??
        '',
    )
    await ui.unmount()
  }

  expect(seen).toEqual([
    'Demostración: trabajando…',
    'Demostración: se pone nervioso…',
    'Demostración: ¡cabezazos!',
    'Demostración: se va calmando…',
    'Demostración: ya casi…',
    'Esperando tu mensaje.',
  ])
})
