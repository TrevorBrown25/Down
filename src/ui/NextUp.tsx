import { coverageLean, LEAN_TEXT, manShare, OPPONENTS } from '../game/opponents'
import { currentNode, type Run } from '../game/run'

const LEAN_COLOR = {
  man: 'var(--color-danger)',
  zone: 'var(--color-skill)',
  balanced: 'var(--color-chalk-dim)',
} as const

/**
 * Who is next and how they cover. The coverage lean is what turns a practice
 * week from a coin flip into a read — without it, "man beaters or zone
 * beaters" is a question the player has no way to answer.
 */
export function NextUp({ run }: { run: Run }) {
  const node = currentNode(run)
  if (!node) return null
  const opponent = OPPONENTS[node.opponentName]
  const visible = Object.values(opponent.rules).filter((r) => r.visible)
  const lean = coverageLean(node.opponentName)
  const share = Math.round(manShare(node.opponentName) * 100)

  return (
    <div className="tape rounded-sm px-5 py-4">
      <div className="font-mono text-[9px] uppercase tracking-[0.28em] text-chalk-faint">
        week {node.week} · you face
      </div>
      <div className="mt-1 font-display text-3xl leading-none tracking-wide text-defense">
        {node.opponentName.toUpperCase()}
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 font-mono text-[10px]">
        <span style={{ color: LEAN_COLOR[lean] }} className="uppercase tracking-[0.16em]">
          {lean === 'balanced' ? 'mixes coverage' : `${lean} heavy`}
        </span>
        <span className="text-hash">
          man on {share}% of snaps — {LEAN_TEXT[lean]}
        </span>
      </div>

      <div className="mt-2 space-y-0.5">
        {visible.map((r) => (
          <div key={r.name} className="font-mono text-[10px] text-chalk-dim">
            <span className="text-charge">{r.name}</span> — {r.text}
          </div>
        ))}
      </div>
    </div>
  )
}
