import { COVERAGES } from '../game/cards'
import { OPPONENTS } from '../game/opponents'
import { RULES, spot, type Game } from '../game/engine'

const ORDINAL = ['1ST', '2ND', '3RD', '4TH']

export function Scoreboard({ game }: { game: Game }) {
  return (
    <div className="tape flex items-stretch justify-between gap-6 rounded-sm px-5 py-2">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-5xl leading-none text-chalk">{game.points}</span>
        <span className="font-mono text-xs text-chalk-faint">/ {game.target}</span>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="font-display text-2xl leading-none tracking-wide text-chalk">
            {ORDINAL[game.down - 1]} &amp; {game.toGo}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-chalk-faint">
            at the {spot(game.ballOn)}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end justify-center gap-1.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-chalk-faint">
            charge
          </span>
          <span className="flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="text-[13px] leading-none"
                style={{
                  color: i <= game.charge ? 'var(--color-charge)' : 'var(--color-hash)',
                  animation:
                    i <= game.charge && game.charge >= 2
                      ? 'pulse-charge 1.9s ease-in-out infinite'
                      : undefined,
                }}
              >
                ◆
              </span>
            ))}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-chalk-faint">
            chips
          </span>
          <span className="flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                className="text-[13px] leading-none"
                style={{ color: i <= game.chips ? 'var(--color-chip)' : 'var(--color-hash)' }}
              >
                ●
              </span>
            ))}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-end justify-center border-l border-hash/50 pl-5">
        <span className="font-display text-2xl leading-none text-chalk-dim">
          {Math.min(game.possessionsUsed + 1, RULES.possessions)}
          <span className="text-chalk-faint">/{RULES.possessions}</span>
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-chalk-faint">
          drive
        </span>
      </div>
    </div>
  )
}

export function Scouting({ game }: { game: Game }) {
  const opponent = OPPONENTS[game.opponentName]
  return (
    <div className="tape rounded-sm p-4">
      <div className="mb-3 flex items-baseline justify-between border-b border-hash/50 pb-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-chalk-faint">
          scouting report
        </span>
        <span className="font-display text-lg leading-none tracking-wide text-chalk">
          {game.opponentName.toUpperCase()}
        </span>
      </div>

      <div className="space-y-2.5">
        {Object.entries(opponent.rules).map(([key, rule]) => {
          const known = rule.visible || game.revealed[key]
          return (
            <div key={key} className="font-mono text-[10px] leading-snug">
              <div
                className="uppercase tracking-[0.14em]"
                style={{ color: known ? 'var(--color-charge)' : 'var(--color-hash)' }}
              >
                {known ? rule.name : '████████'}
              </div>
              <div className="mt-0.5 text-chalk-dim">
                {known ? rule.text : 'not yet seen'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Matchup({ game }: { game: Game }) {
  if (!game.defPack || !game.defForm) return null
  const blitzing = game.defCov ? COVERAGES[game.defCov].rush >= 6 : false
  const man = game.defCov ? COVERAGES[game.defCov].man : false

  return (
    <div className="tape flex flex-wrap items-center gap-x-5 gap-y-2 rounded-sm px-4 py-2.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-chalk-faint">
        you sent
      </span>
      <span className="font-display text-xl leading-none text-skill">{game.declared}</span>
      <span className="text-chalk-faint">→</span>
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-chalk-faint">
        they matched
      </span>
      <span className="font-display text-xl leading-none text-defense">
        {game.defPack.toUpperCase()}
      </span>
      <span className="font-mono text-[10px] text-chalk-dim">{game.defForm}</span>

      {/*
        The coverage, in the open. Hiding it was the whole problem: the man/zone
        card grid is unusable if you cannot see which one you are facing, so a
        careful call and a random one played the same.
      */}
      {game.defCov && (
        <span className="flex items-baseline gap-2">
          <span
            className="font-display text-xl leading-none"
            style={{ color: man ? 'var(--color-danger)' : 'var(--color-skill)' }}
          >
            {man ? 'MAN' : 'ZONE'}
          </span>
          <span className="font-mono text-[10px] text-chalk-dim">{game.defCov}</span>
          {blitzing && (
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-danger">
              blitz
            </span>
          )}
        </span>
      )}

      {game.known && (
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-charge">
          {game.known}
        </span>
      )}
      {game.audibled && (
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-charge">
          audibled
        </span>
      )}
    </div>
  )
}

const TONE: Record<string, string> = {
  stuffed: 'text-danger',
  sack: 'text-danger',
  interception: 'text-danger',
  fumble: 'text-danger',
  incomplete: 'text-chalk-faint',
  run: 'text-chip',
  complete: 'text-chip',
  breakaway: 'text-charge',
  'big play': 'text-charge',
}

export function DriveLog({ game }: { game: Game }) {
  return (
    <div className="tape rounded-sm p-4">
      <div className="mb-2 border-b border-hash/50 pb-2 font-mono text-[9px] uppercase tracking-[0.24em] text-chalk-faint">
        drive chart
      </div>
      <div className="scrollbar-chalk max-h-[280px] space-y-1 overflow-y-auto pr-1 font-mono text-[10px]">
        {game.log.length === 0 && <div className="text-chalk-faint">no snaps yet.</div>}
        {game.log.map((entry, i) =>
          entry.kind === 'divider' ? (
            <div
              key={i}
              className="border-y border-hash/40 py-1 text-[9px] uppercase tracking-[0.16em] text-charge"
            >
              {entry.text}
            </div>
          ) : (
            <div key={i} className="leading-relaxed text-chalk-faint">
              <span className="text-chalk-dim">
                {entry.down}&amp;{entry.toGo}
              </span>{' '}
              {entry.call}
              {entry.charge > 0 && <span className="text-charge"> ◆{entry.charge}</span>}
              <span className={`ml-1 ${TONE[entry.event] ?? 'text-chalk-dim'}`}>
                {entry.event} {entry.yards >= 0 ? '+' : ''}
                {entry.yards}
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
