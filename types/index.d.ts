/** 0 tranquilo, 1 trabajando, 2 nervioso, 3 cabezazos contra el teclado, 4 festeja, 5 duerme. */
export type Level = 0 | 1 | 2 | 3 | 4 | 5

declare module 'claude-code' {
  interface PluginState {
    'clawd-estresado': {
      level: Level
      frame: number
      isHidden: boolean
      /** What Claude is doing right now, in words. */
      activity: string
      /** Cuántas veces se dio cabezazos hoy. */
      bangs: number
    }
  }
}
