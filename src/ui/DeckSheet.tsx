import { useState } from 'react'
import { OFF_PLAYS } from '../game/cards'
import { describeBonus, type GroupTrim } from '../game/events'
import { useGame } from './store'

const GROUPS = ['21', '12', '11'] as const

/** What the group is carrying, so a practice week bought weeks ago is legible. */
export function Conditioning({ trim, compact }: { trim: GroupTrim; compact?: boolean }) {
  const rows = GROUPS.map((g) => [g, describeBonus(trim[g] ?? {})] as const).filter(
    ([, lines]) => lines.length > 0,
  )
  if (rows.length === 0) return null

  return (
    <div className={compact ? '' : 'tape rounded-sm px-4 py-3'}>
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-chalk-faint">
        what they can do
      </div>
      <div className="mt-1.5 space-y-1">
        {rows.map(([group, lines]) => (
          <div key={group} className="flex items-baseline gap-2 font-mono text-[10px]">
            <span className="w-6 shrink-0 tracking-widest text-skill">{group}</span>
            <span className={lines.some((l) => l.startsWith('-')) ? 'text-danger' : 'text-chip'}>
              {lines.join(' · ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Every card you own, grouped, openable from anywhere in the run. */
export function SheetButton({ label = 'call sheet' }: { label?: string }) {
  const run = useGame((s) => s.run)
  const [open, setOpen] = useState(false)
  if (!run) return null

  const counts = new Map<string, number>()
  for (const c of run.deck) {
    const key = c.type === 'play' ? c.play : c.name
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const kindOf = (name: string) =>
    name in OFF_PLAYS ? OFF_PLAYS[name as keyof typeof OFF_PLAYS].kind : 'adj'
  const order = { run: 0, pass: 1, adj: 2 } as const
  const sorted = [...counts].sort(
    (a, b) =>
      order[kindOf(a[0]) as keyof typeof order] - order[kindOf(b[0]) as keyof typeof order] ||
      a[0].localeCompare(b[0]),
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="font-mono text-[9px] uppercase tracking-[0.16em] text-hash transition-colors hover:text-chalk-dim"
      >
        {label} · {run.deck.length}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-6 sm:p-12"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="chalkboard w-full max-w-2xl rounded-sm border border-hash p-6"
          >
            <div className="flex items-baseline justify-between">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.28em] text-chalk-faint">
                  {run.style} · {run.wins}-{run.losses}
                </div>
                <h3 className="mt-1 font-display text-3xl leading-none tracking-wide text-chalk">
                  THE CALL SHEET
                </h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="font-mono text-[10px] uppercase tracking-[0.16em] text-hash hover:text-chalk"
              >
                close
              </button>
            </div>

            <div className="mt-5 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {sorted.map(([name, n]) => {
                const kind = kindOf(name)
                return (
                  <div key={name} className="flex items-baseline justify-between font-mono text-[11px]">
                    <span
                      style={{
                        color:
                          kind === 'run'
                            ? 'var(--color-chip)'
                            : kind === 'pass'
                              ? 'var(--color-skill)'
                              : 'var(--color-charge)',
                      }}
                    >
                      {name}
                    </span>
                    <span className="text-hash">{n > 1 ? `×${n}` : ''}</span>
                  </div>
                )
              })}
            </div>

            <div className="mt-5 border-t border-hash/50 pt-4">
              <Conditioning trim={run.conditioning} compact />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
