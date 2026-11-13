/** 0 tranquilo, 1 trabajando, 2 nervioso, 3 cabezazos contra el teclado. */
export type Level = 0 | 1 | 2 | 3

declare module 'claude-code' {
  interface PluginState {
    'clawd-estresado': {
      level: Level
      frame: number
      isHidden: boolean
      /** What Claude is doing right now, in words. */
      activity: string
    }
  }
}
