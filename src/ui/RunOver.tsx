import { seasonRecord, type Run } from '../game/run'
import { useGame } from './store'

export function RunOver({ run }: { run: Run }) {
  const abandon = useGame((s) => s.abandon)
  const made = run.status === 'complete'
  const points = run.history.reduce((a, h) => a + h.points, 0)

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-7 px-6 text-center">
      <div className="reveal">
        <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-chalk-faint">
          {made ? 'season complete' : `eliminated in week ${run.history.length}`}
        </div>
        <div
          className="mt-3 font-display text-[clamp(3.5rem,11vw,7rem)] leading-none tracking-tight"
          style={{ color: made ? 'var(--color-chip)' : 'var(--color-danger)' }}
        >
          {seasonRecord(run)}
        </div>
      </div>

      <p className="max-w-md font-mono text-[11px] leading-relaxed text-chalk-dim">
        {made
          ? `You ran ${run.style} through the whole schedule and came out the other side.`
          : `The ${run.style} season ends here. Three losses is three losses.`}
      </p>

      <div className="flex w-full max-w-md flex-col gap-1">
        {run.history.map((h) => (
          <div
            key={h.week}
            style={{ animationDelay: `${150 + h.week * 45}ms` }}
            className="reveal flex items-center gap-3 border-b border-hash/30 py-1.5 text-left font-mono text-[10px]"
          >
            <span className="w-8 text-chalk-faint">wk{h.week}</span>
            <span className="flex-1 truncate text-chalk-dim">{h.opponentName}</span>
            <span className="w-8 text-right text-chalk-faint">{h.points}</span>
            <span
              className="w-4 text-right font-display text-sm"
              style={{ color: h.won ? 'var(--color-chip)' : 'var(--color-danger)' }}
            >
              {h.won ? 'W' : 'L'}
            </span>
          </div>
        ))}
      </div>

      <div className="font-mono text-[10px] text-hash">
        {points} points across {run.history.length} games · {run.deck.length}-card call sheet
      </div>

      <button
        onClick={abandon}
        className="rounded-[2px] border border-chip/50 bg-chip/[0.06] px-6 py-3 font-display text-xl tracking-wide text-chip transition-colors hover:border-chip hover:bg-chip/15"
      >
        NEW SEASON
      </button>
    </div>
  )
}
