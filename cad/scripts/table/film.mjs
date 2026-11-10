// The explainer film: how to play, topic by topic. Each topic is a slide that
// teaches the rule with a diagram (ui/dev-explainer.html), then a
// demonstration: one seat's real turns from a four-bot game played on the
// printed table, one caption at a time, a ring on the piece it is about and
// the path that piece takes. Words in ui/src/text/explainer.ts.
//
//   timeout 1800 yarn dev &        # the UI on :5173, for the slides, the overlay and the cards
//   cd cad && timeout 3600 node --import ./scripts/ts-hooks.mjs scripts/table/film.mjs [--steps=story,cards,table,overlay,mux] [--stills=12,40.5]
//
// 1. story: plays the game with the engine (its source, through the hooks) and, for each vignette
//    (one turn of it), writes the table before and after that turn
//    (shots/table/film/<name>-before.json, as state.mjs writes state.json)
//    and lays both out (layout.ts).
// 2. cards: photographs the mission cards those tables hold (cards.mjs).
// 3. table: renders each demonstration with render.js, every piece the turn
//    moves taken from one layout to the other along the move its events
//    name: shots/film/table.mp4 (black under the slides).
// 4. overlay: photographs the slides and the demonstrations' captions:
//    shots/film/overlay.mov.
// 5. mux: lays one on the other: shots/film/explainer.mp4.
// `--stills=t,t` renders only those moments, composited, as shots/film/still-<t>.jpg.
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { chromium } from 'playwright'
import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import {
  BURN_COSTS,
  COMPRESSED_JUMP_MASS,
  DEFAULT_DISSIPATION_CAPACITY,
  GRAVITY_WELLS,
  INTERCEPT_HEAT,
  INTERCEPT_ROLL,
  SUBSYSTEM_CONFIGS,
  WELL_TRANSFER_COSTS,
  getMissileStats,
  runGame,
} from '@dangerous-inclinations/engine'
import { tableState } from './tableState.mjs'

const CAD = resolve(import.meta.dirname, '../..')
const ROOT = resolve(CAD, '..')
const STATES = join(CAD, 'shots/table/film')
const OUT = join(CAD, 'shots/film')
const flag = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const FPS = Number(flag('fps', '30'))
const UI = flag('ui', 'http://localhost:5173')
const STEPS = flag('steps', 'story,cards,table,overlay,mux').split(',')
const STILLS = flag('stills', '').split(',').filter(Boolean).map(Number)
mkdirSync(STATES, { recursive: true })
mkdirSync(OUT, { recursive: true })

// ---- The game ---------------------------------------------------------------------

/**
 * Seed 117, the south seat (seat 1, green), on four of its turns: a coast
 * with the scoop on black hole ring 1; a burn out to ring 2 and both racks
 * fired (a 6 destroys orange, a 10 breaks purple's missiles); a jump down
 * Gamma's lane; and a dock at Gamma's station, selling the Survey data.
 * Between them, orange's return to Home, and after the last the stations'
 * move at the round's end, carrying green with them. `build` is the table
 * before the coast with every bay open, the build going in.
 */
const SEED = 117
const HERO = 1
/** Where the d10 lies: out of shot, and where the shots land (table mm, off every board). */
const DIE = { away: '3@470,-470', first: '6@-235,25', second: '10@-232,-48' }
const VIGNETTES = [
  { name: 'build', k: 5, from: 'before', to: 'before', open: true, roll: DIE.away },
  { name: 'coast', k: 5, roll: DIE.away },
  { name: 'fire', k: 9, roll: '2@-150,-232', after: DIE.second, poses: DIE.first },
  { name: 'respawn', k: 10, roll: DIE.second },
  { name: 'jump', k: 33, roll: DIE.away },
  { name: 'dive', k: 37, roll: DIE.away },
  { name: 'scoop', k: 41, roll: DIE.away },
  { name: 'launch', k: 51, roll: DIE.away },
  { name: 'intercept', k: 55, roll: DIE.away },
  { name: 'dock', k: 45, roll: DIE.away },
  { name: 'stations', k: 47, roll: DIE.away },
]

if (STEPS.includes('story')) {
  const turns = runGame({ seed: SEED, botCount: 4, record: true }).recording.turns
  for (const v of VIGNETTES) {
    const turn = turns[v.k]
    const snap = {
      before: turns[v.k - 1].resultingStateSnapshot,
      after: turn.resultingStateSnapshot,
    }
    for (const when of ['before', 'after']) {
      const s = snap[v[when === 'before' ? 'from' : 'to'] ?? when]
      const file = join(STATES, `${v.name}-${when}.json`)
      writeFileSync(
        file,
        JSON.stringify(tableState(s, { seed: SEED, round: turn.turnNumber, score: null }), null, 2)
      )
      const roll = when === 'after' && v.after ? v.after : v.roll
      execFileSync(
        'node',
        [
          '--experimental-strip-types',
          '--no-warnings',
          '--import',
          './scripts/ts-hooks.mjs',
          'scripts/table/layout.ts',
          `--state=${file}`,
          `--out=${join(STATES, `${v.name}-${when}-scene.json`)}`,
          `--roll=${roll}`,
          ...(v.poses ? [`--poses=${v.poses}`] : []),
          ...(v.open && when === 'before' ? ['--open-bays'] : []),
        ],
        { stdio: 'inherit', cwd: CAD }
      )
    }
    writeFileSync(join(STATES, `${v.name}-turn.json`), JSON.stringify(turn, null, 2))
    console.log(
      `${v.name}: turn ${turn.turnNumber}, ${turn.playerId}: ${turn.events.map(e => e.type).join(', ')}`
    )
  }
}

if (STEPS.includes('cards')) {
  for (const v of VIGNETTES)
    execFileSync(
      'node',
      ['scripts/table/cards.mjs', `--url=${UI}`, `--state=${join(STATES, `${v.name}-after.json`)}`],
      { stdio: 'inherit', cwd: CAD }
    )
}

// ---- Pieces and paths -------------------------------------------------------------

const M = a => new Matrix4().fromArray(a)
const keyOf = inst => `${inst.id}|${inst.stl}|${JSON.stringify(inst.op ?? {})}`
const idOf = key => key.split('|')[0]
const ease = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u))
const clamp = u => Math.max(0, Math.min(1, u))
const decompose = m => {
  const p = new Vector3()
  const q = new Quaternion()
  const s = new Vector3()
  m.decompose(p, q, s)
  return { p, q, s }
}
const compose = (p, q, s) => new Matrix4().compose(p, q, s)
const Z = new Vector3(0, 0, 1)
const STEP = (2 * Math.PI) / 24
const deg = a => (a * Math.PI) / 180

/** A well's centre on the table (layout.ts: WELLS). */
function centreOf(wellId) {
  if (wellId === 'blackhole') return new Vector3(0, 0, 0)
  const a = deg({ 'planet-alpha': 0, 'planet-beta': 120, 'planet-gamma': 240 }[wellId])
  return new Vector3(380 * Math.sin(a), 380 * Math.cos(a), 0)
}
const speedOf = (wellId, ring) =>
  GRAVITY_WELLS.find(w => w.id === wellId).rings.find(r => r.ring === ring).velocity
const polar = (p, c) => ({
  r: Math.hypot(p.x - c.x, p.y - c.y),
  a: Math.atan2(p.y - c.y, p.x - c.x),
})
/** The angle from a to b going clockwise (prograde), in (-2π, 0]. */
const clockwise = (a, b) => {
  let d = b - a
  while (d > 0) d -= 2 * Math.PI
  while (d <= -2 * Math.PI) d += 2 * Math.PI
  return d
}
const about = (c, angle, m) =>
  new Matrix4()
    .makeTranslation(c.x, c.y, 0)
    .multiply(new Matrix4().makeRotationAxis(Z, angle))
    .multiply(new Matrix4().makeTranslation(-c.x, -c.y, 0))
    .multiply(m)

/** From a to b, lifted h at the middle. */
function lift(a, b, u, h) {
  const A = decompose(a)
  const B = decompose(b)
  const e = ease(u)
  const p = A.p.clone().lerp(B.p, e)
  p.z += h * Math.sin(Math.PI * e)
  return compose(p, A.q.clone().slerp(B.q, e), A.s)
}
/** Carried round the well with the ring, as a coast or the stations' step is. */
function orbit(a, b, u, c) {
  const d = clockwise(polar(decompose(a).p, c).a, polar(decompose(b).p, c).a)
  return u >= 1 ? b : about(c, d * ease(u), a)
}
/**
 * A burn as the rule has it: turn to face the way (if the turn rotated),
 * drift the start ring's speed along it, then cross to the new ring and
 * along it to where it landed.
 */
function burn(a, b, u, { centre: c, drift, rotate }) {
  const A = decompose(a)
  const B = decompose(b)
  const pa = polar(A.p, c)
  const pb = polar(B.p, c)
  const aDrift = pa.a - drift * STEP
  const heading = angle => new Quaternion().setFromAxisAngle(Z, angle - pb.a).multiply(B.q.clone())
  const at = (r, angle, z) => new Vector3(c.x + r * Math.cos(angle), c.y + r * Math.sin(angle), z)
  const turnEnd = rotate ? 0.15 : 0
  const driftEnd = turnEnd + (1 - turnEnd) * 0.5
  const crossEnd = driftEnd + (1 - driftEnd) * 0.55
  let target = pb.a
  while (target - aDrift > Math.PI) target -= 2 * Math.PI
  while (aDrift - target > Math.PI) target += 2 * Math.PI
  if (u < turnEnd) return compose(A.p, A.q.clone().slerp(heading(pa.a), ease(u / turnEnd)), A.s)
  const q0 = rotate ? null : A.q
  const q = angle =>
    q0 ? new Quaternion().setFromAxisAngle(Z, angle - pa.a).multiply(q0.clone()) : heading(angle)
  if (u < driftEnd) {
    const v = ease((u - turnEnd) / (driftEnd - turnEnd))
    const angle = pa.a + (aDrift - pa.a) * v
    return compose(at(pa.r, angle, A.p.z + 10 * Math.sin(Math.PI * v)), q(angle), A.s)
  }
  if (u < crossEnd) {
    // Straight out (or in) to the new ring.
    const v = ease((u - driftEnd) / (crossEnd - driftEnd))
    return compose(
      at(pa.r + (pb.r - pa.r) * v, aDrift, A.p.z + (B.p.z - A.p.z) * v + 8 * Math.sin(Math.PI * v)),
      q(aDrift),
      A.s
    )
  }
  // Along the new ring to where it landed (the phasing the cheatsheet draws).
  const v = ease((u - crossEnd) / (1 - crossEnd))
  const angle = aDrift + (target - aDrift) * v
  return compose(at(pb.r, angle, B.p.z), u >= 1 ? B.q : q(angle), A.s)
}
/** A d10 thrown: up out of the hand, tumbling, and down on its face. */
function toss(a, b, u) {
  const A = decompose(a)
  const B = decompose(b)
  const e = 1 - (1 - u) * (1 - u)
  const p = A.p.clone().lerp(B.p, e)
  p.z += 150 * Math.sin(Math.PI * u) * (1 - 0.35 * u)
  const spin = new Quaternion().setFromAxisAngle(
    new Vector3(1, 0.4, 0.2).normalize(),
    5 * Math.PI * (1 - e)
  )
  return compose(p, spin.multiply(A.q.clone().slerp(B.q, e)), A.s)
}

function loadVignette(v) {
  const scene = when =>
    JSON.parse(readFileSync(join(STATES, `${v.name}-${when}-scene.json`), 'utf8'))
  const sc = { before: scene('before'), after: scene('after') }
  const byKey = {}
  for (const [when, s] of Object.entries(sc))
    byKey[when] = new Map(s.instances.filter(i => i.id).map(i => [keyOf(i), i]))
  const turn = JSON.parse(readFileSync(join(STATES, `${v.name}-turn.json`), 'utf8'))
  const state = JSON.parse(readFileSync(join(STATES, `${v.name}-before.json`), 'utf8'))
  return {
    ...v,
    sc,
    byKey,
    keys: [...new Set([...byKey.before.keys(), ...byKey.after.keys()])],
    turn,
    state,
    moves: [],
  }
}
const matches = (match, id) =>
  typeof match === 'function'
    ? match(id)
    : id === match || (match.endsWith(':') && id.startsWith(match))
function placeOf(vg, id, when = 'before') {
  const inst = vg.sc[when].instances.find(i => i.id && matches(id, i.id))
  return inst ? new Vector3().setFromMatrixPosition(M(inst.matrix)) : null
}

/** Every filmed piece's matrix (or null) at vignette time t. */
function piecesAt(vg, t) {
  const out = {}
  const groupFrame = (when, g) => (vg.sc[when].groups?.[g] ? M(vg.sc[when].groups[g]) : null)
  const rise = (inst, by) => {
    const P = decompose(M(inst.matrix))
    P.p.z += by
    return compose(P.p, P.q, P.s).toArray()
  }
  for (const key of vg.keys) {
    const id = idOf(key)
    const a = vg.byKey.before.get(key)
    const b = vg.byKey.after.get(key)
    const m = vg.moves.find(x => matches(x.match, id))
    if (!m) {
      // A piece the film does not follow is in its after place from the first frame: it moved off camera.
      out[key] = b ? b.matrix : null
      continue
    }
    const u = m.t1 > m.t0 ? clamp((t - m.t0) / (m.t1 - m.t0)) : t >= m.t0 ? 1 : 0
    if (m.kind === 'swap') out[key] = (t < m.t0 ? a : b)?.matrix ?? null
    else if (m.kind === 'clear') out[key] = a && t < m.t1 ? rise(a, 320 * ease(u) * ease(u)) : null
    else if (m.kind === 'place') {
      if (t >= m.t0) out[key] = b ? rise(b, 120 * (1 - u) * (1 - u)) : null
      else if (m.hidden) out[key] = null
      else if (a && vg.clear && t < vg.clear.t1)
        out[key] = rise(a, 320 * ease(clamp((t - vg.clear.t0) / (vg.clear.t1 - vg.clear.t0))) ** 2)
      else out[key] = a && !vg.clear ? a.matrix : null
    } else {
      const gone = m.from
        ? [...vg.byKey.before.keys()]
            .filter(k => idOf(k).startsWith(m.from) && !vg.byKey.after.has(k))
            .pop()
        : null
      // `fromId`: a piece new in the turn starts where another piece stood (a salvo leaves its launcher).
      const launchedFrom =
        !a && m.fromId && b
          ? {
              matrix: compose(
                placeOf(vg, m.fromId, 'after') ?? placeOf(vg, m.fromId),
                decompose(M(b.matrix)).q,
                decompose(M(b.matrix)).s
              ).toArray(),
            }
          : null
      const start = a ?? launchedFrom ?? (gone ? vg.byKey.before.get(gone) : null)
      // `toId`: a piece the turn removes flies to another piece first (a salvo reaches its target).
      if (!b && start && m.toId) {
        const goal = compose(
          placeOf(vg, m.toId, 'after') ?? placeOf(vg, m.toId),
          decompose(M(start.matrix)).q,
          decompose(M(start.matrix)).s
        )
        out[key] =
          t < m.t0
            ? start.matrix
            : t < m.t1
              ? lift(M(start.matrix), goal, u, m.height ?? 30).toArray()
              : t < (m.t2 ?? m.t1)
                ? goal.toArray()
                : null
        continue
      }
      if (!b) out[key] = start && t < m.t0 ? start.matrix : null
      else if (!start) out[key] = t >= m.t1 ? b.matrix : null
      else if (a && a.matrix.every((x, j) => Math.abs(x - b.matrix[j]) < 1e-6)) out[key] = a.matrix
      else if (u <= 0 && !(m.kind === 'toss' && m.via && t >= m.t1)) out[key] = start.matrix
      else {
        const g = a?.group && a.group === b.group ? b.group : null
        const fa = g ? groupFrame('before', g) : M(start.matrix)
        const fb = g ? groupFrame('after', g) : M(b.matrix)
        let path
        if (m.kind === 'toss' && m.via) {
          const via = M(vg.sc.before.poses[m.via])
          path =
            t < m.t1
              ? toss(fa, via, u)
              : t < m.t2
                ? via
                : toss(via, fb, clamp((t - m.t2) / (m.t3 - m.t2)))
        } else if (m.kind === 'toss') path = toss(fa, fb, u)
        else if (m.kind === 'orbit') path = orbit(fa, fb, u, m.centre)
        else if (m.kind === 'burn') path = burn(fa, fb, u, m)
        else path = lift(fa, fb, u, m.height ?? 30)
        const local = g
          ? groupFrame('before', g).clone().invert().multiply(M(start.matrix))
          : new Matrix4()
        out[key] = path.multiply(local).toArray()
      }
    }
  }
  return out
}
function liveAt(vg, pieces, id) {
  for (const [key, m] of Object.entries(pieces))
    if (m && matches(id, idOf(key))) return new Vector3().setFromMatrixPosition(M(m))
  return placeOf(vg, id, 'after') ?? placeOf(vg, id)
}

// ---- The vignettes' moves -----------------------------------------------------------

const vg = Object.fromEntries(VIGNETTES.map(v => [v.name, loadVignette(v)]))
const ev = (name, type, pred = () => true) =>
  vg[name].turn.events.find(e => e.type === type && pred(e))
const seatOf = (name, id) => vg[name].state.players.findIndex(p => p.id === id)
const cubes = subsystem => id => id.startsWith(`cube:${HERO}:${subsystem}:`)
const heroCubes = id => id.startsWith(`cube:${HERO}:`) && !id.includes(':heat:')
const BH = centreOf('blackhole')
const GAMMA = centreOf('planet-gamma')

vg.build.moves = [
  ...['forward-0', 'side-0', 'side-1', 'side-2', 'side-3'].map((s, i) => ({
    match: `module:${HERO}:${s}`,
    t0: 1.0 + i * 0.7,
    t1: 1.5 + i * 0.7,
    kind: 'place',
    hidden: true,
  })),
  { match: `base:${HERO}`, t0: 5.2, t1: 5.2, kind: 'swap' },
]
// Coast vignette: title 0-5, hand 5-10, clear 10-16, coast 16-23, energy 23-33.
vg.coast.clear = { t0: 11.6, t1: 12.6 }
vg.coast.moves = [
  { match: cubes('side-2'), t0: 24.0, t1: 24.4, kind: 'place' },
  { match: cubes('side-0'), t0: 24.6, t1: 25.0, kind: 'place' },
  { match: cubes('scoop'), t0: 25.2, t1: 25.6, kind: 'place' },
  { match: heroCubes, ...vg.coast.clear, kind: 'clear' },
  { match: `die:${HERO}:fuel:`, t0: 21.0, t1: 21.8, kind: 'lift', height: 30 },
  { match: `base:${HERO}`, t0: 30.4, t1: 30.4, kind: 'swap' },
  { match: `module:${HERO}:side-3`, t0: 30.5, t1: 32.0, kind: 'lift', height: 70 },
]
// The coast's heat check, as its captions and ledger read it: the hero's
// cubes by subsystem once its actions are done, and the check's own numbers.
const coastCheck = ev('coast', 'heat_check')
const coastAfter = JSON.parse(readFileSync(join(STATES, 'coast-after.json'), 'utf8'))
const coastLoadout = coastAfter.players[HERO].ship.subsystems
const coastCubes = type =>
  coastLoadout.filter(s => s.type === type).reduce((n, s) => n + s.energy, 0)
const coastRadiators =
  coastLoadout.filter(s => s.type === 'radiator' && !s.broken).length *
  (SUBSYSTEM_CONFIGS.radiator.passiveEffect?.dissipationBonus ?? 0)
// Fire vignette: burn 0-10, fire 10-21, critical 21-28, racks 28-35.
const fired = vg.fire.turn.events.filter(e => e.type === 'attack_resolved')
const VICTIM = seatOf('fire', fired[0].targetId)
const OTHER = seatOf('fire', fired[1].targetId)
const burned = ev('fire', 'burned')
vg.fire.clear = { t0: 0.1, t1: 0.4 }
vg.fire.moves = [
  { match: cubes('rotation'), t0: 1.2, t1: 1.5, kind: 'place' },
  { match: cubes('engines'), t0: 4.0, t1: 4.3, kind: 'place' },
  { match: cubes('side-0'), t0: 11.0, t1: 11.3, kind: 'place' },
  { match: cubes('side-1'), t0: 21.6, t1: 21.9, kind: 'place' },
  { match: cubes('side-2'), t0: 0.5, t1: 0.8, kind: 'place' },
  { match: heroCubes, ...vg.fire.clear, kind: 'clear' },
  { match: `cube:${HERO}:heat:`, t0: 33.0, t1: 33.4, kind: 'place' },
  {
    match: `ship:${HERO}`,
    t0: 1.2,
    t1: 8.4,
    kind: 'burn',
    centre: BH,
    drift: speedOf('blackhole', burned.from.ring),
    rotate: true,
  },
  { match: 'die:roll:', t0: 12.4, t1: 13.6, t2: 22.4, t3: 23.6, kind: 'toss', via: DIE.first },
  { match: 'wreck:', t0: 16.4, t1: 17.8, kind: 'lift', height: 140, from: 'pool:wreck:' },
  { match: `ship:${VICTIM}`, t0: 17.0, t1: 17.5, kind: 'lift', height: 4 },
  { match: `die:${VICTIM}:hull:`, t0: 15.0, t1: 15.6, kind: 'lift', height: 30 },
  { match: `base:${HERO}`, t0: 29.4, t1: 29.4, kind: 'swap' },
  { match: `module:${HERO}:side-0`, t0: 29.5, t1: 31.0, kind: 'lift', height: 70 },
  { match: `module:${HERO}:side-1`, t0: 30.3, t1: 31.8, kind: 'lift', height: 70 },
]
const RESPAWNER = seatOf('respawn', vg.respawn.turn.playerId)
vg.respawn.moves = [{ match: `ship:${RESPAWNER}`, t0: 2.0, t1: 4.0, kind: 'lift', height: 40 }]
// Launch: purple's salvo leaves its ship and flies 3 steps. Intercept: it rides, flies on and reaches orange, whose rack shoots it down.
const LAUNCHER = seatOf('launch', vg.launch.turn.playerId)
const LAUNCH_TARGET = seatOf('launch', ev('launch', 'missile_launched').targetId)
const SALVO = ev('launch', 'weapon_fired')
vg.launch.moves = [
  { match: 'salvo:', t0: 2.2, t1: 4.4, kind: 'lift', height: 24, fromId: `ship:${LAUNCHER}` },
]
vg.intercept.moves = [
  {
    match: 'salvo:',
    t0: 1.4,
    t1: 4.0,
    t2: 6.6,
    kind: 'lift',
    height: 24,
    toId: `ship:${LAUNCH_TARGET}`,
  },
]
const MISSILE = getMissileStats()
// Dive: green turns retrograde and burns 3 rings in at Gamma.
const dived = ev('dive', 'burned')
vg.dive.clear = { t0: 0.1, t1: 0.4 }
vg.dive.moves = [
  { match: cubes('rotation'), t0: 1.0, t1: 1.3, kind: 'place' },
  { match: cubes('engines'), t0: 3.4, t1: 3.7, kind: 'place' },
  { match: heroCubes, ...vg.dive.clear, kind: 'clear' },
  {
    match: `ship:${HERO}`,
    t0: 1.0,
    t1: 7.4,
    kind: 'burn',
    centre: GAMMA,
    drift: speedOf(dived.from.wellId, dived.from.ring),
    rotate: true,
  },
]
// Scoop vignette: the coast on the board 0-8, the fuel die 8-13.
const scooped = ev('scoop', 'fuel_scooped')
vg.scoop.clear = { t0: 0.1, t1: 0.4 }
vg.scoop.moves = [
  { match: cubes('scoop'), t0: 0.6, t1: 0.9, kind: 'place' },
  { match: heroCubes, ...vg.scoop.clear, kind: 'clear' },
  { match: `ship:${HERO}`, t0: 1.2, t1: 4.4, kind: 'orbit', centre: GAMMA },
  { match: `die:${HERO}:fuel:`, t0: 9.6, t1: 10.6, kind: 'lift', height: 40 },
]
vg.jump.moves = [{ match: `ship:${HERO}`, t0: 1.6, t1: 4.8, kind: 'lift', height: 110 }]
// Dock vignette: dock 0-10, sell 10-18, missions 18-24.
const dockBurn = ev('dock', 'burned')
const sold = ev('dock', 'cargo_delivered')
vg.dock.clear = { t0: 0.1, t1: 0.4 }
vg.dock.moves = [
  { match: cubes('rotation'), t0: 1.0, t1: 1.3, kind: 'place' },
  { match: cubes('engines'), t0: 3.0, t1: 3.3, kind: 'place' },
  { match: heroCubes, ...vg.dock.clear, kind: 'clear' },
  {
    match: `ship:${HERO}`,
    t0: 1.0,
    t1: 7.0,
    kind: 'burn',
    centre: GAMMA,
    drift: speedOf(dockBurn.from.wellId, dockBurn.from.ring),
    rotate: true,
  },
  { match: `hold:${HERO}:${sold.cargoId}`, t0: 11.0, t1: 11.8, kind: 'clear' },
  {
    match: `chip:${HERO}:`,
    t0: 12.0,
    t1: 13.2,
    kind: 'lift',
    height: 120,
    from: 'pool:chip:planet-gamma:',
  },
  { match: `die:${HERO}:hull:`, t0: 15.4, t1: 16.1, kind: 'lift', height: 30 },
  { match: `card:${HERO}:1`, t0: 19.6, t1: 20.4, kind: 'lift', height: 40 },
]
vg.stations.moves = [
  { match: 'station:planet-gamma', t0: 1.6, t1: 4.4, kind: 'orbit', centre: GAMMA },
  { match: `ship:${HERO}`, t0: 1.6, t1: 4.4, kind: 'orbit', centre: GAMMA },
]

// ---- The film ---------------------------------------------------------------------

const P = (name, id, when) => placeOf(vg[name], id, when)
const xy = (p, z = 0) => [p.x, p.y, p.z + z]
const mid = (...ps) => [
  ps.reduce((s, p) => s + p.x, 0) / ps.length,
  ps.reduce((s, p) => s + p.y, 0) / ps.length,
  0,
]
const base = P('coast', `base:${HERO}`)
const cards = [0, 1, 2].map(k => P('coast', `card:${HERO}:${k}`))
const drift = (target, az0, az1, el, d0, d1, dur, extra = {}) => [
  [0, { target, az: az0, el, dist: d0, fov: 30, ...extra }],
  [dur, { target, az: az1, el, dist: d1, fov: 30, ...extra }],
]

/**
 * The film in order. A slide is the overlay alone. A demo plays vignette
 * `v` from its time `vt`; its camera keys, captions, rings, paths and
 * shots are in the demo's own time. Rings and paths name a piece by id.
 */
const FILM = [
  {
    demo: 'coast',
    vt: 0,
    dur: 5,
    hero: { end: false },
    cam: drift([0, 60, 0], -102, -96, 46, 2150, 1950, 5),
  },
  { slide: 'goal', dur: 10 },
  {
    demo: 'coast',
    vt: 5,
    dur: 5,
    topic: 'goal',
    cam: drift([cards[1].x, cards[1].y + 10, 0], -96, -88, 62, 430, 400, 5),
    captions: [{ text: 'hand', t0: 0.4 }],
    rings: [0, 1, 2].map(k => ({ at: `card:${HERO}:${k}`, t0: 0.8 + k * 0.4, r: 60 })),
  },
  { slide: 'build', dur: 12 },
  {
    demo: 'build',
    vt: 0,
    dur: 7,
    topic: 'build',
    cam: drift([base.x, base.y, 20], -60, -45, 60, 380, 350, 7, { focus: true }),
    captions: [{ text: 'bays', t0: 0.4 }],
  },
  { slide: 'turn', dur: 9 },
  {
    demo: 'coast',
    vt: 10,
    dur: 6,
    topic: 'turn',
    cam: drift([base.x, base.y, 20], -70, -60, 52, 400, 380, 6, { focus: true }),
    captions: [{ text: 'clear', t0: 0.6 }],
    rings: [{ at: [base.x, base.y + 20, 30], t0: 1.0, t1: 3.2, r: 70 }],
  },
  { slide: 'orbits', dur: 8 },
  { slide: 'moves', dur: 9 },
  {
    demo: 'fire',
    vt: 0,
    dur: 10,
    topic: 'moves',
    cam: drift([0, 0, 0], -88, -96, 72, 420, 400, 10),
    captions: [
      { text: 'rotate', t0: 0.4, t1: 2.4 },
      {
        text: 'drift',
        vars: { sectors: speedOf('blackhole', burned.from.ring) },
        t0: 2.4,
        t1: 5.3,
      },
      {
        text: 'burnOut',
        vars: { ring: burned.to.ring, fuel: BURN_COSTS[burned.intensity].mass },
        t0: 5.3,
        t1: 7.0,
      },
      {
        text: 'phase',
        vars: {
          sectors:
            (((burned.to.sector - burned.from.sector - speedOf('blackhole', burned.from.ring)) %
              24) +
              24) %
            24,
        },
        t0: 7.0,
      },
    ],
    rings: [{ at: `ship:${HERO}`, t0: 0.4, r: 26 }],
    paths: [{ id: `ship:${HERO}`, t0: 1.2, t1: 8.4 }],
  },
  {
    demo: 'jump',
    vt: 0,
    dur: 8,
    topic: 'moves',
    cam: [
      [
        0,
        {
          target: mid(P('jump', `ship:${HERO}`), P('jump', `ship:${HERO}`, 'after')),
          az: -118,
          el: 62,
          dist: 860,
          fov: 30,
        },
      ],
      [
        8,
        {
          target: mid(P('jump', `ship:${HERO}`), P('jump', `ship:${HERO}`, 'after')),
          az: -124,
          el: 62,
          dist: 820,
          fov: 30,
        },
      ],
    ],
    captions: [
      { text: 'jump', t0: 0.4, t1: 5.2 },
      {
        text: 'compressor',
        vars: { fuel: WELL_TRANSFER_COSTS.mass, compressed: COMPRESSED_JUMP_MASS },
        t0: 5.2,
      },
    ],
    rings: [{ at: `ship:${HERO}`, t0: 0.4, r: 22 }],
    paths: [{ id: `ship:${HERO}`, t0: 1.6, t1: 4.8 }],
  },
  {
    demo: 'dive',
    vt: 0,
    dur: 10,
    topic: 'moves',
    cam: drift([GAMMA.x, GAMMA.y, 0], -112, -120, 70, 430, 410, 10),
    captions: [
      { text: 'rotateIn', t0: 0.4, t1: 3.0 },
      {
        text: 'driftIn',
        vars: { sectors: speedOf(dived.from.wellId, dived.from.ring), ring: dived.from.ring },
        t0: 3.0,
        t1: 5.2,
      },
      {
        text: 'burnIn',
        vars: { rings: dived.from.ring - dived.to.ring, fuel: dived.massSpent },
        t0: 5.2,
      },
    ],
    rings: [{ at: `ship:${HERO}`, t0: 0.4, r: 26 }],
    paths: [{ id: `ship:${HERO}`, t0: 1.0, t1: 7.4 }],
  },
  {
    demo: 'scoop',
    vt: 0,
    dur: 8,
    topic: 'moves',
    cam: drift([GAMMA.x, GAMMA.y, 0], -112, -120, 70, 430, 410, 8),
    captions: [
      { text: 'coast', vars: { sectors: speedOf('planet-gamma', 1) }, t0: 0.4, t1: 4.8 },
      { text: 'scoop', vars: { fuel: scooped.amount }, t0: 4.8 },
    ],
    rings: [{ at: `ship:${HERO}`, t0: 0.4, r: 26 }],
    paths: [{ id: `ship:${HERO}`, t0: 1.2, t1: 4.4 }],
  },
  {
    demo: 'scoop',
    vt: 8,
    dur: 5,
    topic: 'moves',
    cam: drift(xy(P('scoop', `die:${HERO}:fuel:`, 'after'), 10), -60, -48, 40, 300, 280, 5, {
      focus: true,
    }),
    captions: [{ text: 'fuelDie', vars: { fuel: scooped.amount }, t0: 0.4 }],
    rings: [{ at: `die:${HERO}:fuel:`, t0: 2.8, r: 50 }],
  },
  { slide: 'heat', dur: 9 },
  {
    demo: 'coast',
    vt: 23,
    dur: 4.5,
    topic: 'heat',
    cam: drift([base.x + 10, base.y, 25], -20, -14, 46, 380, 365, 4.5, { focus: true }),
    captions: [
      {
        text: 'cubes',
        vars: {
          shields: coastCubes('shields'),
          rack: coastCubes('ballistic_rack'),
          scoop: coastCubes('scoop'),
          cubes: coastCheck.cubes,
        },
        t0: 0.4,
      },
    ],
  },
  { slide: 'heatCheck', dur: 11 },
  {
    demo: 'coast',
    vt: 27.5,
    dur: 5.5,
    topic: 'heatCheck',
    cam: drift([base.x + 10, base.y, 25], -14, -8, 46, 365, 350, 5.5, { focus: true }),
    captions: [
      { text: 'check', vars: { heat: coastCheck.heat }, t0: 0.3, t1: 2.9 },
      { text: 'radiator', t0: 2.9 },
    ],
    ledger: {
      t0: 0.3,
      t1: 2.4,
      rows: [
        { value: String(coastCheck.cubes), text: 'cubes' },
        { value: String(coastCheck.heat - coastCheck.cubes), text: 'carried' },
        { value: String(coastCheck.heat), text: 'atCheck', rule: true },
        { value: `−${DEFAULT_DISSIPATION_CAPACITY}`, text: 'dissipate' },
        { value: `−${coastRadiators}`, text: 'radiator' },
        { value: String(coastCheck.carried), text: 'next', tone: 'ink' },
      ],
    },
    rings: [{ at: `module:${HERO}:side-3`, t0: 3.1, r: 40 }],
  },
  { slide: 'fight', dur: 9 },
  {
    demo: 'fire',
    vt: 10,
    dur: 11,
    topic: 'fight',
    cam: drift(
      mid(P('fire', `ship:${HERO}`, 'after'), P('fire', `ship:${VICTIM}`), P('fire', 'die:roll:')),
      -150,
      -158,
      56,
      470,
      440,
      11
    ),
    captions: [
      { text: 'fire', t0: 0.4, t1: 4.0 },
      { text: 'hit', vars: { roll: fired[0].roll, damage: fired[0].damage }, t0: 4.0, t1: 7.6 },
      { text: 'wreck', t0: 7.6 },
    ],
    rings: [
      { at: `ship:${VICTIM}`, t0: 0.6, t1: 7.4, r: 24 },
      { at: 'wreck:', t0: 7.8, r: 24 },
    ],
    shots: [{ from: `ship:${HERO}`, to: `ship:${VICTIM}`, t0: 0.8, t1: 4.2 }],
    roll: { face: fired[0].roll, t0: 3.8, t1: 8.0 },
  },
  {
    demo: 'fire',
    vt: 21,
    dur: 7,
    topic: 'fight',
    cam: drift(
      mid(P('fire', `ship:${HERO}`, 'after'), P('fire', `ship:${OTHER}`)),
      -168,
      -174,
      58,
      560,
      530,
      7
    ),
    captions: [
      { text: 'critical', vars: { roll: fired[1].roll }, t0: 0.4, t1: 4.2 },
      { text: 'broken', t0: 4.2 },
    ],
    rings: [{ at: `ship:${OTHER}`, t0: 0.6, r: 24 }],
    shots: [{ from: `ship:${HERO}`, to: `ship:${OTHER}`, t0: 0.6, t1: 3.6 }],
    roll: { face: fired[1].roll, t0: 3.0, t1: 7 },
  },
  { slide: 'missiles', dur: 11 },
  {
    demo: 'launch',
    vt: 0,
    dur: 7,
    topic: 'missiles',
    cam: drift(
      mid(P('launch', `ship:${LAUNCHER}`), P('launch', `ship:${LAUNCH_TARGET}`)),
      -120,
      -130,
      62,
      520,
      490,
      7
    ),
    captions: [
      { text: 'launch', vars: { count: SALVO.count }, t0: 0.4, t1: 3.2 },
      { text: 'flies', vars: { steps: MISSILE.stepsPerMove }, t0: 3.2 },
    ],
    rings: [
      { at: `ship:${LAUNCHER}`, t0: 0.6, t1: 2.2, r: 24 },
      { at: 'salvo:', t0: 2.4, r: 22 },
      { at: `ship:${LAUNCH_TARGET}`, t0: 4.6, r: 24 },
    ],
    paths: [{ id: 'salvo:', t0: 2.2, t1: 4.4 }],
  },
  {
    demo: 'intercept',
    vt: 0,
    dur: 9,
    topic: 'missiles',
    cam: drift(
      mid(P('intercept', 'salvo:'), P('intercept', `ship:${LAUNCH_TARGET}`, 'after')),
      -130,
      -138,
      62,
      480,
      450,
      9
    ),
    captions: [
      { text: 'rides', vars: { steps: MISSILE.stepsPerMove }, t0: 0.4, t1: 4.0 },
      { text: 'reaches', t0: 4.0, t1: 6.6 },
      { text: 'shotDown', vars: { count: 4, on: INTERCEPT_ROLL, heat: INTERCEPT_HEAT }, t0: 6.6 },
    ],
    rings: [
      { at: 'salvo:', t0: 0.6, t1: 6.6, r: 22 },
      { at: `ship:${LAUNCH_TARGET}`, t0: 4.0, r: 26 },
    ],
    paths: [{ id: 'salvo:', t0: 1.4, t1: 4.0 }],
  },
  { slide: 'secrets', dur: 7 },
  {
    demo: 'fire',
    vt: 28,
    dur: 7,
    topic: 'secrets',
    // The racks hang on the port side: film it from the port side.
    cam: drift([base.x - 10, base.y, 45], 165, 178, 26, 400, 370, 7, { focus: true }),
    captions: [{ text: 'racks', t0: 0.6 }],
    rings: [
      { at: `module:${HERO}:side-0`, t0: 3.4, r: 34 },
      { at: `module:${HERO}:side-1`, t0: 4.0, r: 34 },
    ],
  },
  { slide: 'death', dur: 8 },
  {
    demo: 'respawn',
    vt: 0,
    dur: 7,
    topic: 'death',
    cam: drift(
      mid(P('respawn', `home:${RESPAWNER}`), P('respawn', `ship:${RESPAWNER}`)),
      -140,
      -148,
      62,
      480,
      450,
      7
    ),
    captions: [{ text: 'home', t0: 0.4 }],
    rings: [{ at: `ship:${RESPAWNER}`, t0: 0.6, r: 24 }],
    paths: [{ id: `ship:${RESPAWNER}`, t0: 2.0, t1: 4.0 }],
  },
  { slide: 'stations', dur: 10 },
  {
    demo: 'dock',
    vt: 0,
    dur: 10,
    topic: 'stations',
    cam: drift([GAMMA.x, GAMMA.y, 0], -112, -118, 70, 460, 440, 10),
    captions: [{ text: 'dock', t0: 0.4 }],
    rings: [{ at: `ship:${HERO}`, t0: 0.4, r: 24 }],
    paths: [{ id: `ship:${HERO}`, t0: 1.0, t1: 7.0 }],
  },
  {
    demo: 'dock',
    vt: 10,
    dur: 8,
    topic: 'stations',
    cam: drift([base.x + 50, base.y - 30, 15], -40, -28, 50, 440, 410, 8, { focus: true }),
    captions: [
      { text: 'sell', t0: 0.4, t1: 5.0 },
      { text: 'repair', t0: 5.0 },
    ],
    rings: [
      { at: `chip:${HERO}:`, t0: 3.4, t1: 5.0, r: 26 },
      { at: `die:${HERO}:hull:`, t0: 5.4, r: 34 },
    ],
  },
  {
    demo: 'dock',
    vt: 18,
    dur: 6,
    topic: 'stations',
    cam: drift([cards[1].x, cards[1].y + 10, 0], -96, -88, 62, 400, 380, 6),
    captions: [{ text: 'card', t0: 0.4 }],
    rings: [{ at: `card:${HERO}:1`, t0: 2.6, r: 60 }],
  },
  {
    demo: 'stations',
    vt: 0,
    dur: 7,
    topic: 'stations',
    cam: drift([GAMMA.x, GAMMA.y, 0], -112, -118, 64, 480, 460, 7),
    captions: [{ text: 'stations', t0: 0.4 }],
    rings: [{ at: 'station:planet-gamma', t0: 0.6, r: 30 }],
    paths: [{ id: 'station:planet-gamma', t0: 1.6, t1: 4.4 }],
  },
  {
    demo: 'stations',
    vt: 7,
    dur: 6,
    hero: { end: true },
    cam: drift([0, 60, 0], -94, -90, 44, 1900, 2100, 6),
  },
]
// ---- The narration ----------------------------------------------------------------

/** What the voice says over each moment, in film order: keys of EXPLAINER.narration. */
const SAY = [
  'title',
  'goal',
  'hand',
  'build',
  'bays',
  'turn',
  'clear',
  'orbits',
  'moves',
  'burnOut',
  'jump',
  'burnIn',
  'scoop',
  'fuelDie',
  'heat',
  'cubes',
  'heatCheck',
  'check',
  'fight',
  'fire',
  'critical',
  'missiles',
  'launch',
  'intercept',
  'secrets',
  'racks',
  'death',
  'respawn',
  'stations',
  'dock',
  'sell',
  'card',
  'stationsMove',
  'end',
]
if (SAY.length !== FILM.length)
  throw new Error(`narration: ${SAY.length} lines for ${FILM.length} moments`)
const VOICE = join(OUT, 'voice')
/** Seconds before the voice starts in a moment, and after it ends. */
const LEAD = 0.5
const TAIL = 0.7
if (STEPS.includes('voice')) {
  const { EXPLAINER } = await import('../../../ui/src/text/explainer.ts')
  const lines = SAY.map(key => ({ key, text: EXPLAINER.narration[key] }))
  mkdirSync(VOICE, { recursive: true })
  writeFileSync(join(VOICE, 'lines.json'), JSON.stringify(lines, null, 2))
  const python = flag('python', join(process.env.HOME, '.cache/di-tts/venv/bin/python'))
  execFileSync(
    python,
    [
      join(CAD, 'scripts/table/voice.py'),
      join(VOICE, 'lines.json'),
      VOICE,
      flag('voice', 'af_heart'),
      flag('speed', '1'),
    ],
    { stdio: 'inherit' }
  )
}
const spoken = existsSync(join(VOICE, 'durations.json'))
  ? JSON.parse(readFileSync(join(VOICE, 'durations.json'), 'utf8'))
  : {}
// A moment lasts as long as its picture needs or its line takes, whichever is longer;
// a demonstration that outlasts its picture holds its last frame (vdur).
FILM.forEach((item, i) => {
  item.say = SAY[i]
  item.vdur = item.dur
  if (spoken[item.say])
    item.dur = Math.max(item.dur, Math.ceil((LEAD + spoken[item.say] + TAIL) * 10) / 10)
})

let clock = 0
for (const item of FILM) {
  item.start = clock
  clock += item.dur
}
const LENGTH = clock
const FRAMES = Math.round(LENGTH * FPS)
const itemAt = t => FILM.find(s => t >= s.start && t < s.start + s.dur) ?? FILM[FILM.length - 1]
console.log(`film: ${FILM.length} moments, ${LENGTH.toFixed(1)} s`)

// ---- Camera and projection ------------------------------------------------------

const orbitCam = (target, az, el, dist) => [
  target[0] + dist * Math.cos(deg(el)) * Math.cos(deg(az)),
  target[1] + dist * Math.cos(deg(el)) * Math.sin(deg(az)),
  target[2] + dist * Math.sin(deg(el)),
]
function cameraOf(item, t) {
  const local = t - item.start
  const keys = item.cam
  let i = 0
  while (i < keys.length - 2 && local >= keys[i + 1][0]) i++
  const [t0, k0] = keys[i]
  const [t1, k1] = keys[Math.min(i + 1, keys.length - 1)]
  const u = t1 > t0 ? ease(clamp((local - t0) / (t1 - t0))) : 0
  const lerp = (x, y) => x + (y - x) * u
  const target = k0.target.map((x, j) => lerp(x, k1.target[j]))
  const c = {
    target,
    position: orbitCam(target, lerp(k0.az, k1.az), lerp(k0.el, k1.el), lerp(k0.dist, k1.dist)),
    fov: lerp(k0.fov, k1.fov),
    size: [1920, 1080],
  }
  if (k0.focus) Object.assign(c, { focus: target, aperture: 0.00003, maxblur: 0.008 })
  return c
}
function project(c, p) {
  const cam = new PerspectiveCamera(c.fov, 1920 / 1080, 5, 12000)
  cam.up.set(0, 0, 1)
  cam.position.set(...c.position)
  cam.lookAt(new Vector3(...c.target))
  cam.updateMatrixWorld()
  cam.updateProjectionMatrix()
  const v = p.clone().project(cam)
  return [((v.x + 1) / 2) * 1920, ((1 - v.y) / 2) * 1080]
}
const piecesOf = t => {
  const item = itemAt(t)
  return item.demo ? piecesAt(vg[item.demo], item.vt + Math.min(t - item.start, item.vdur)) : null
}

/** What the overlay draws at t. */
function overlayAt(t, pieces) {
  const item = itemAt(t)
  const local = t - item.start
  const out = clamp((item.dur - local) / 0.35)
  if (item.slide) return { slide: { id: item.slide, t: local, out } }
  const v = vg[item.demo]
  const c = cameraOf(item, t)
  const at = (target, z = 6) => {
    const p = Array.isArray(target) ? new Vector3(...target) : liveAt(v, pieces, target)
    p.z += z
    return project(c, p)
  }
  const appear = (t0, t1, d = 0.4) =>
    (local < t0 ? 0 : clamp((local - t0) / d)) *
    (t1 !== undefined ? clamp((t1 - local) / 0.25) : out)
  const frame = {}
  if (item.hero) frame.hero = { end: item.hero.end, u: Math.min(clamp(local / 0.6), out) }
  if (item.topic) frame.topic = { id: item.topic, u: Math.min(clamp(local / 0.4), out) }
  const caption = (item.captions ?? [])
    .filter(x => local >= x.t0 && (x.t1 === undefined || local < x.t1))
    .pop()
  if (caption)
    frame.caption = { text: caption.text, vars: caption.vars, u: appear(caption.t0, caption.t1) }
  frame.rings = (item.rings ?? [])
    .map(r => {
      const u = appear(r.t0, r.t1)
      if (u <= 0) return null
      const [x, y] = at(r.at)
      return { x, y, u, r: r.r }
    })
    .filter(Boolean)
  frame.paths = (item.paths ?? [])
    .map(p => {
      if (local < p.t0) return null
      const upto = Math.min(local, p.t1)
      const points = []
      for (let s = p.t0; s <= upto + 1e-6; s += 1 / 15) {
        const ps = piecesAt(v, item.vt + s)
        points.push(at(liveAt(v, ps, p.id).toArray(), 2))
      }
      return { points, u: Math.min(1, out) }
    })
    .filter(Boolean)
  frame.shots = (item.shots ?? [])
    .map(s => {
      const u = appear(s.t0, s.t1, 0.6)
      if (u <= 0) return null
      const [x1, y1] = at(s.from, 10)
      const [x2, y2] = at(s.to, 10)
      return { x1, y1, x2, y2, u }
    })
    .filter(Boolean)
  if (item.roll) frame.roll = { face: item.roll.face, u: appear(item.roll.t0, item.roll.t1, 0.8) }
  if (item.ledger)
    frame.ledger = {
      rows: item.ledger.rows,
      u: Math.min(clamp((local - item.ledger.t0) / (item.ledger.t1 - item.ledger.t0)), out),
    }
  return frame
}

// ---- Rendering -------------------------------------------------------------------

function serve() {
  const TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.stl': 'model/stl',
  }
  const server = createServer((req, res) => {
    const file = join(ROOT, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)))
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile())
      return res.writeHead(404).end()
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(res)
  })
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)))
}
function encoder(args, file) {
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', ...args, file], {
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  const done = new Promise((r, j) =>
    ff.on('close', code => (code === 0 ? r() : j(new Error(`ffmpeg ${code}`))))
  )
  return {
    write: buf => (ff.stdin.write(buf) ? null : new Promise(r => ff.stdin.once('drain', r))),
    end: () => (ff.stdin.end(), done),
  }
}
const GPU = [
  '--use-angle=vulkan',
  '--enable-features=Vulkan',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
]
const frameTimes = STILLS.length ? STILLS : Array.from({ length: FRAMES }, (_, f) => f / FPS)

if (STEPS.includes('table')) {
  const server = await serve()
  const browser = await chromium.launch({ args: ['--no-sandbox', ...GPU] })
  const enc = STILLS.length
    ? null
    : encoder(
        [
          '-f',
          'image2pipe',
          '-c:v',
          'mjpeg',
          '-framerate',
          String(FPS),
          '-i',
          '-',
          '-c:v',
          'libx264',
          '-preset',
          'medium',
          '-crf',
          '14',
          '-pix_fmt',
          'yuv420p',
        ],
        join(OUT, 'table.mp4')
      )
  const black = execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=1920x1080',
    '-frames:v',
    '1',
    '-f',
    'mjpeg',
    '-',
  ])
  try {
    const host = `http://127.0.0.1:${server.address().port}`
    const pages = new Map()
    const pageFor = async name => {
      if (!pages.has(name)) {
        // One renderer at a time: a vignette's page is closed when the film moves to another.
        for (const [other, p] of pages) {
          await p.close()
          pages.delete(other)
        }
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
        page.on('pageerror', e => console.error('page:', e.message))
        const scene = when => `/cad/shots/table/film/${name}-${when}-scene.json`
        await page.goto(
          `${host}/cad/scripts/table/render.html?scene=${scene('before')}&film=${scene('after')}`
        )
        await page.waitForFunction(() => document.title === 'ready', null, { timeout: 900_000 })
        pages.set(name, page)
      }
      return pages.get(name)
    }
    const t0 = Date.now()
    let last = ''
    for (const t of frameTimes) {
      const item = itemAt(t)
      let jpeg = black
      if (item.demo) {
        const page = await pageFor(item.demo)
        const data = await page.evaluate(frame => window.renderFrame(frame), {
          camera: cameraOf(item, t),
          shadow: null,
          pieces: piecesOf(t),
        })
        jpeg = Buffer.from(data.split(',')[1], 'base64')
      }
      if (enc) await enc.write(jpeg)
      else writeFileSync(join(OUT, `table-${t}.jpg`), jpeg)
      const label = item.demo ?? item.slide
      if (label !== last)
        console.log(
          `table: ${label} at ${t.toFixed(1)} s (${((Date.now() - t0) / 1000).toFixed(0)} s)`
        )
      last = label
    }
    if (enc) await enc.end()
  } finally {
    await browser.close()
    server.close()
  }
}

if (STEPS.includes('overlay')) {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const enc = STILLS.length
    ? null
    : encoder(
        ['-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-', '-c:v', 'qtrle'],
        join(OUT, 'overlay.mov')
      )
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
    page.on('pageerror', e => console.error('page:', e.message))
    await page.goto(`${UI}/dev-explainer.html`, { waitUntil: 'load', timeout: 120_000 })
    await page.waitForFunction(() => typeof window.__frame === 'function', null, {
      timeout: 120_000,
    })
    for (const t of frameTimes) {
      await page.evaluate(f => window.__frame(f), overlayAt(t, piecesOf(t)))
      const png = await page.screenshot({ omitBackground: true, type: 'png' })
      if (enc) await enc.write(png)
      else writeFileSync(join(OUT, `overlay-${t}.png`), png)
    }
    if (enc) await enc.end()
  } finally {
    await browser.close()
  }
  if (STILLS.length)
    for (const t of STILLS)
      execFileSync('ffmpeg', [
        '-loglevel',
        'error',
        '-y',
        '-i',
        join(OUT, `table-${t}.jpg`),
        '-i',
        join(OUT, `overlay-${t}.png`),
        '-filter_complex',
        'overlay',
        join(OUT, `still-${t}.jpg`),
      ])
}

if (STEPS.includes('mux') && !STILLS.length) {
  // Each line of narration at its moment's start plus the lead, mixed into one track.
  const voiced = FILM.filter(item => spoken[item.say])
  const audioIn = voiced.flatMap(item => ['-i', join(VOICE, `${item.say}.wav`)])
  const delays = voiced
    .map((item, i) => `[${i + 2}:a]adelay=${Math.round((item.start + LEAD) * 1000)}:all=1[a${i}]`)
    .join(';')
  const mix = voiced.length
    ? `;${delays};${voiced.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voiced.length}:normalize=0,apad=whole_dur=${LENGTH},loudnorm=I=-16:TP=-1.5:LRA=11[a]`
    : ''
  execFileSync(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      '-y',
      '-i',
      join(OUT, 'table.mp4'),
      '-i',
      join(OUT, 'overlay.mov'),
      ...audioIn,
      '-filter_complex',
      `[0:v][1:v]overlay=format=auto,fade=t=in:st=0:d=0.6,fade=t=out:st=${LENGTH - 0.8}:d=0.8,format=yuv420p[v]${mix}`,
      '-map',
      '[v]',
      ...(voiced.length ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '160k'] : []),
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '17',
      '-movflags',
      '+faststart',
      '-t',
      String(LENGTH),
      join(OUT, 'explainer.mp4'),
    ],
    { stdio: 'inherit' }
  )
  console.log(join(OUT, 'explainer.mp4'))
}

/** The film's moments, for the storyboard: start, length, and what each is. */
export const TIMELINE = FILM.map(f => ({
  start: f.start,
  dur: f.dur,
  vt: f.vt,
  slide: f.slide,
  demo: f.demo,
  topic: f.topic,
  say: f.say,
  voice: spoken[f.say] ?? null,
  captions: f.captions?.map(c => ({ text: c.text, vars: c.vars, at: c.t0 })),
}))
if (process.argv.includes('--timeline'))
  writeFileSync(join(OUT, 'timeline.json'), JSON.stringify(TIMELINE, null, 2))
