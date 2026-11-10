// A real 4-bot game for the table renders: play headless games with the
// engine, look at the end of every round, and keep the round where the most
// is on the table (missiles in flight, a wreck, cargo aboard, sales made,
// an Escort marker placed, a ship moored). Writes the state as the renders
// need it to cad/shots/table/state.json.
//
//   node --import ./scripts/ts-hooks.mjs scripts/table/state.mjs [--seed=N] [--round=R] [--scan=40]
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { runGame, isMooredAt, aboard } from '@dangerous-inclinations/engine'
import { tableState } from './tableState.mjs'

const arg = (k, d) => {
  const a = process.argv.find(x => x.startsWith(`--${k}=`))
  return a ? Number(a.split('=')[1]) : d
}
const OUT = join(import.meta.dirname, '../../shots/table')

/** What a state offers the camera. */
function score(s) {
  const wells = new Set(s.players.map(p => p.ship.wellId))
  const missiles = s.missiles.length
  const cargo = s.players.reduce((n, p) => n + aboard(p.cargo).length, 0)
  const sales = s.players.reduce((n, p) => n + p.soldAt.length, 0)
  const escorts = s.players.reduce(
    (n, p) => n + p.missions.filter(m => m.type === 'escort' && m.markedPlayerId).length,
    0
  )
  const moored = s.players.filter(p => isMooredAt(s.stations, p.ship)).length
  const revealed = s.players.reduce(
    (n, p) => n + p.ship.subsystems.filter(x => x.slotGroup && x.isRevealed).length,
    0
  )
  const has = x => (x > 0 ? 1 : 0)
  return {
    total:
      4 * has(missiles) +
      3 * has(s.wrecks.length) +
      3 * has(cargo) +
      3 * has(sales) +
      2 * has(escorts) +
      2 * has(moored) +
      wells.size +
      Math.min(missiles, 6) * 0.3 +
      Math.min(cargo, 4) * 0.3 +
      Math.min(revealed, 10) * 0.1 +
      Math.min(sales, 4) * 0.2,
    missiles,
    wrecks: s.wrecks.length,
    cargo,
    sales,
    escorts,
    moored,
    wells: wells.size,
    revealed,
  }
}

function play(seed) {
  const r = runGame({ seed, botCount: 4, record: true })
  // The end of each round: the snapshot after the last seat's turn.
  return r.recording.turns
    .filter(
      t =>
        t.resultingStateSnapshot.activePlayerIndex === 0 &&
        t.resultingStateSnapshot.phase === 'active'
    )
    .map(t => ({ seed, round: t.turnNumber, state: t.resultingStateSnapshot }))
}

let pick
const seed = arg('seed', null)
if (seed !== null) {
  const rounds = play(seed)
  const want = arg('round', null)
  pick =
    want === null
      ? rounds.reduce((a, b) => (score(b.state).total > score(a.state).total ? b : a))
      : rounds.find(r => r.round === want)
  if (!pick) throw new Error(`seed ${seed} has no round ${want}`)
} else {
  const all = []
  for (let s = 1; s <= arg('scan', 40); s++)
    for (const r of play(s)) all.push({ ...r, score: score(r.state) })
  all.sort((a, b) => b.score.total - a.score.total)
  for (const r of all.slice(0, 12))
    console.log(`seed ${r.seed} round ${r.round}`, JSON.stringify(r.score))
  pick = all[0]
}

const out = tableState(pick.state, { seed: pick.seed, round: pick.round, score: score(pick.state) })
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'state.json'), JSON.stringify(out, null, 2))
console.log(`picked seed ${out.seed} round ${out.round}`, JSON.stringify(out.score))
