export interface Rng {
  (): number
  /**
   * Where the stream has got to. mulberry32's seed and its state are the same
   * number, so `makeRng(rng.state())` resumes exactly where this one left off —
   * which is what lets a run be saved mid-game without replaying the same rolls.
   */
  state(): number
}

/** mulberry32 — small, fast, and good enough for a card game. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  next.state = () => a
  return next
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)]
}

export function weighted<T>(items: readonly T[], weightOf: (item: T) => number, rng: Rng): T {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0)
  let r = rng() * total
  for (const item of items) {
    // Strictly `< 0` so a zero-weight item can never be selected, even when r starts at 0.
    r -= weightOf(item)
    if (r < 0) return item
  }
  return items[items.length - 1]
}
