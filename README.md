# Down

A football roguelike deckbuilder. You declare personnel, they match it, and only
then do you pick the play — the whole game hangs off that one commitment.

## Commands

```bash
npm run dev      # vite dev server
npm test         # vitest — game logic, rules, engine, balance
npm run sim      # print the balance matrix
npm run build    # tsc -b && vite build
```

## Architecture

The one rule that matters: **`src/game/` never imports from `src/ui/`.** The game
is pure TypeScript with no React, no DOM, and no `Math.random()` anywhere. That is
what lets `src/sim/` play tens of thousands of games headlessly in under a second,
and what will let the whole thing be retuned in year two without touching a
component.

```
src/
  game/          pure logic — no React, no globals, no ambient randomness
    rng.ts       seeded mulberry32 + shuffle/pick/weighted
    cards.ts     formations, plays, coverages, deck archetypes
    opponents.ts opponents as data: a matching policy plus rules with hooks
    resolve.ts   the physics layer — run and pass outcomes
    snap.ts      one snap end to end: pre-snap rules → physics → chips → post-snap rules
    engine.ts    the state machine: downs, drives, possessions, scoring
  sim/           headless balance harness, runs under vitest
    policy.ts    pluggable AI: random, coach, go-for-it
    play.ts      plays a game to completion, aggregates results
  ui/            React lives here and nowhere else
```

### Randomness

Every random draw goes through an injected `Rng`. Nothing calls `Math.random()`.
This buys reproducible bug reports, daily challenges, run sharing, and a sim
whose results are exact rather than approximate.

### Adding an opponent

An opponent is a matching policy, a coverage preference, and a handful of rules.
Rules are hooks, not `if` branches in the resolver:

- `preSnap` bends the pre-snap picture (box count, charge)
- `postSnap` overrides the outcome after the physics have rolled

Return `null` when the rule doesn't apply; anything else counts as fired, which is
what reveals a hidden rule to the player.

## Testing

Two kinds of test live here, and they are not the same thing:

- **Specs** (`rng`, `engine`) were written first, watched fail, then implemented.
- **Characterization tests** (`cards`, `snap`, `balance`) pin behaviour that was
  ported from the working prototype. They exist so an accidental change shows up
  as a diff. They are not a statement that the current numbers are correct.

`src/sim/balance.test.ts` pins the measured win rate of every deck×opponent
matchup. When a deliberate tuning change moves those numbers, update the table on
purpose.

## Known design problems

Measured, not guessed — run `npm run sim`.

1. **The matchup spread runs 5%–89%.** Against two of three opponents the game is
   effectively decided at deck select.
2. **Punting and kicking are traps.** Going for it on every 4th down beats the
   situational policy in all nine matchups.
3. **"Steel Curtain" is a Pittsburgh Steelers trademark.** Rename before this is
   public.
