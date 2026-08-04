import { OFF_PLAYS, STARTERS, type Card } from '../game/cards'
import { OPPONENTS } from '../game/opponents'
import { SEASON, seasonRecord, type Run, type ScheduleNode } from '../game/run'
import { useGame } from './store'

const TIER_LABEL = ['', 'warm-up', 'contender', 'title shot']

function Week({ node, run, index }: { node: ScheduleNode; run: Run; index: number }) {
  const played = run.history[index]
  const now = index === run.at && run.status === 'playing'
  const opponent = OPPONENTS[node.opponentName]
  const visible = Object.values(opponent.rules).filter((r) => r.visible)

  return (
    <div
      style={{ animationDelay: `${index * 45}ms` }}
      className={`reveal relative flex items-center gap-4 rounded-[2px] border px-4 py-2 transition-colors ${
        now
          ? 'border-charge bg-charge/[0.07]'
          : played
            ? 'border-hash/60 bg-board-deep/40'
            : 'border-hash/40'
      }`}
    >
      <div className="w-10 shrink-0">
        <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-chalk-faint">wk</div>
        <div className="font-display text-xl leading-none text-chalk-dim">{node.week}</div>
      </div>

      <div className="min-w-0 flex-1">
        <div
          className={`font-display text-lg leading-none tracking-wide ${
            played ? 'text-chalk-faint' : now ? 'text-chalk' : 'text-chalk-dim'
          }`}
        >
          {node.opponentName.toUpperCase()}
        </div>
        <div className="mt-1 truncate font-mono text-[9px] text-chalk-faint">
          {visible.map((r) => r.name).join(' · ') || 'no public tendencies'}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-hash">
          {TIER_LABEL[node.tier]}
        </div>
        <div className="font-mono text-[9px] text-chalk-faint">
          {'◆'.repeat(node.tier)}
          <span className="text-hash">{'◆'.repeat(3 - node.tier)}</span>
        </div>
      </div>

      <div className="w-12 shrink-0 text-right">
        {played ? (
          <span
            className="font-display text-2xl leading-none"
            style={{ color: played.won ? 'var(--color-chip)' : 'var(--color-danger)' }}
          >
            {played.won ? 'W' : 'L'}
          </span>
        ) : now ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-charge">
            up next
          </span>
        ) : null}
      </div>
    </div>
  )
}

function DeckSummary({ deck }: { deck: Card[] }) {
  const groups: Record<string, number> = { '21': 0, '12': 0, '11': 0 }
  let runs = 0
  let passes = 0
  let adj = 0
  for (const c of deck) {
    if (c.type !== 'play') {
      adj++
      continue
    }
    if (OFF_PLAYS[c.play].kind === 'run') runs++
    else passes++
  }

  return (
    <div className="tape rounded-sm p-4">
      <div className="mb-3 flex items-baseline justify-between border-b border-hash/50 pb-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-chalk-faint">
          your call sheet
        </span>
        <span className="font-display text-lg leading-none text-chalk">{deck.length}</span>
      </div>

      <div className="space-y-2 font-mono text-[10px]">
        <div className="flex justify-between">
          <span className="text-chip">{runs} run</span>
          <span className="text-skill">{passes} pass</span>
          <span className="text-charge">{adj} adj</span>
        </div>
        <div className="border-t border-hash/40 pt-2">
          <div className="mb-1 text-[8px] uppercase tracking-[0.2em] text-hash">personnel</div>
          {Object.entries(groups).map(([g, n]) => (
            <div key={g} className="flex items-center gap-2">
              <span className="w-6 text-chalk-dim">{g}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-board-edge">
                <div
                  className="h-full bg-chalk-faint"
                  style={{ width: `${(n / Math.max(1, ...Object.values(groups))) * 100}%` }}
                />
              </div>
              <span className="w-4 text-right text-chalk-faint">{n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function Season({ run }: { run: Run }) {
  const { kickoff, abandon } = useGame()
  const over = run.status !== 'playing'
  const lossesLeft = SEASON.lossesAllowed - run.losses + 1

  return (
    <div className="mx-auto grid max-w-[1100px] gap-4 px-5 py-5 lg:grid-cols-[1fr_290px]">
      <div className="space-y-4">
        <div className="tape flex items-end justify-between rounded-sm px-5 py-3">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.28em] text-chalk-faint">
              {run.style}
            </div>
            <div className="mt-1 font-display text-5xl leading-none tracking-tight text-chalk">
              {seasonRecord(run)}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-chalk-faint">
              {over ? 'season over' : lossesLeft === 1 ? 'win or go home' : 'margin left'}
            </div>
            <div className="mt-1 flex justify-end gap-1.5">
              {Array.from({ length: SEASON.lossesAllowed + 1 }, (_, i) => (
                <span
                  key={i}
                  className="text-lg leading-none"
                  style={{
                    color: i < lossesLeft ? 'var(--color-danger)' : 'var(--color-hash)',
                  }}
                >
                  ✕
                </span>
              ))}
            </div>
            <div className="mt-1 font-mono text-[9px] text-hash">
              {SEASON.lossesAllowed + 1} losses ends it
            </div>
          </div>
        </div>

        <div className="space-y-1">
          {run.schedule.map((node, i) => (
            <Week key={node.week} node={node} run={run} index={i} />
          ))}
        </div>

        {!over && (
          <button
            onClick={kickoff}
            style={{ animationDelay: '400ms' }}
            className="reveal w-full rounded-[2px] border border-chip/50 bg-chip/[0.06] py-3 font-display text-2xl tracking-wide text-chip transition-colors hover:border-chip hover:bg-chip/15"
          >
            KICK OFF — WEEK {run.schedule[run.at]?.week}
          </button>
        )}
      </div>

      <aside className="space-y-4">
        <DeckSummary deck={run.deck} />

        <div className="tape rounded-sm p-4">
          <div className="mb-2 border-b border-hash/50 pb-2 font-mono text-[9px] uppercase tracking-[0.24em] text-chalk-faint">
            your identity
          </div>
          <p className="font-mono text-[10px] leading-relaxed text-chalk-dim">
            {STARTERS[run.style].identity}
          </p>
        </div>

        <button
          onClick={abandon}
          className="w-full font-mono text-[9px] uppercase tracking-[0.16em] text-hash transition-colors hover:text-danger"
        >
          abandon season
        </button>
      </aside>
    </div>
  )
}
