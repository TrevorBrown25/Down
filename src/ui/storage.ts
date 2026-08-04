import { decode, encode, SAVE_VERSION, type LoadResult, type SaveFile } from '../game/save'

const KEY = 'down.save.v1'

/**
 * One slot, written on every change. A roguelike run is one continuous thing —
 * there is nothing to choose between, and a save menu would only invite
 * scumming. Every call is guarded: storage can be full, disabled, or refused
 * outright in private browsing, and none of that should lose the game in
 * progress or crash the page.
 */
export function write(save: SaveFile): boolean {
  try {
    localStorage.setItem(KEY, encode(save))
    return true
  } catch {
    return false
  }
}

export function read(): LoadResult {
  try {
    return decode(localStorage.getItem(KEY))
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
}

export function clear(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to do — the slot is already unreachable.
  }
}

export const currentVersion = SAVE_VERSION
