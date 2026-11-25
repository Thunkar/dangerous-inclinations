// The explainer film: how to play, topic by topic. Each topic is a slide that
// teaches the rule with a diagram (ui/dev-explainer.html), then a
// demonstration: one seat's real turns from a four-bot game played on the
// printed table, one caption at a time, a ring on the piece it is about and
// the path that piece takes. Words in ui/src/text/explainer.ts.
//
//   timeout 1800 yarn dev &        # the UI on :5173, for the slides, the overlay and the cards
//   cd cad && timeout 3600 node --import ./scripts/ts-hooks.mjs scripts/table/film.mjs [--steps=voice,layout,cards,table,overlay,mux] [--stills=12,40.5]
//
// The vignettes are the game seed 117 played under the rules of 9 Nov 2026
// (cached in shots/table/film). A rule change since plays the seed
// differently, so `story` is not a default step: run it only to choose new
// vignettes, and then check every turn number below and every number the
// narration speaks.
//
// 1. story: plays the game with the engine (its source, through the hooks) and, for each vignette
//    (one turn of it), writes the table before and after that turn
//    (shots/table/film/<name>-before.json, as state.mjs writes state.json).
//    voice: speaks the narration (voice.py) when its words change.
// 2. layout: lays out every table (layout.ts), with the pieces as they print now.
//    cards: photographs the mission cards those tables hold (cards.mjs).
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
  MAX_HEAT,
  SUBSYSTEM_CONFIGS,
  WELL_TRANSFER_COSTS,
  getMissileStats,
  runGame,
} from '@dangerous-inclinations/engine'
import { tableState } from './tableState.mjs'
import { EXPLAINER } from '../../../ui/src/text/explainer.ts'

const CAD = resolve(import.meta.dirname, '../..')
const ROOT = resolve(CAD, '..')
const STATES = join(CAD, 'shots/table/film')
const OUT = join(CAD, 'shots/film')
const flag = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const FPS = Number(flag('fps', '30'))
const UI = flag('ui', 'http://localhost:5173')
const STEPS = flag('steps', 'layout,cards,table,overlay,mux').split(',')
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
  { name: 'jump', k: 33, roll: DIE.away, peak: true },
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
    }
    writeFileSync(join(STATES, `${v.name}-turn.json`), JSON.stringify(turn, null, 2))
    console.log(
      `${v.name}: turn ${turn.turnNumber}, ${turn.playerId}: ${turn.events.map(e => e.type).join(', ')}`
    )
  }
}

if (STEPS.includes('layout')) {
  for (const v of VIGNETTES) {
    for (const when of ['before', 'after']) {
      const file = join(STATES, `${v.name}-${when}.json`)
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
    // `peak`: the table at its heat check, every cube's heat on the track before any dissipates.
    if (v.peak) {
      const turn = JSON.parse(readFileSync(join(STATES, `${v.name}-turn.json`), 'utf8'))
      const check = turn.events.find(e => e.type === 'heat_check')
      const s = JSON.parse(readFileSync(join(STATES, `${v.name}-after.json`), 'utf8'))
      s.players.find(p => p.id === check.playerId).ship.heat = Math.min(check.heat, MAX_HEAT)
      const file = join(STATES, `${v.name}-peak.json`)
      writeFileSync(file, JSON.stringify(s, null, 2))
      execFileSync(
        'node',
        [
          '--experimental-strip-types',
          '--no-warnings',
          '--import',
          './scripts/ts-hooks.mjs',
          'scripts/table/layout.ts',
          `--state=${file}`,
          `--out=${join(STATES, `${v.name}-peak-scene.json`)}`,
          `--roll=${v.after ?? v.roll}`,
        ],
        { stdio: 'inherit', cwd: CAD }
      )
    }
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
const deg2rad = deg

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
  const sc = {
    before: scene('before'),
    after: scene('after'),
    ...(v.peak && { peak: scene('peak') }),
  }
  const byKey = {}
  for (const [when, s] of Object.entries(sc))
    byKey[when] = new Map(s.instances.filter(i => i.id).map(i => [keyOf(i), i]))
  const turn = JSON.parse(readFileSync(join(STATES, `${v.name}-turn.json`), 'utf8'))
  const state = JSON.parse(readFileSync(join(STATES, `${v.name}-before.json`), 'utf8'))
  return {
    ...v,
    sc,
    byKey,
    keys: [...new Set(Object.values(byKey).flatMap(m => [...m.keys()]))],
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
    if (m.kind === 'track') {
      // A heat cube at its place on the track at the check: dropped on at t0-t1, lifted off at t2-t3.
      const p = vg.byKey.peak.get(key)
      out[key] =
        t < m.t0 || (m.t3 !== undefined && t >= m.t3)
          ? null
          : m.t2 !== undefined && t >= m.t2
            ? rise(p, 320 * ease(clamp((t - m.t2) / (m.t3 - m.t2))) ** 2)
            : rise(p, 220 * (1 - u) * (1 - u))
    } else if (m.kind === 'swap') out[key] = (t < m.t0 ? a : b)?.matrix ?? null
    else if (m.kind === 'clear') out[key] = a && t < m.t1 ? rise(a, 320 * ease(u) * ease(u)) : null
    else if (m.kind === 'hinge') {
      // A bay's door swung about its hinge, from where it was to where it is.
      const inst = b ?? a
      const seat = id.split(':')[1]
      const base = M(vg.sc.after.instances.find(i => i.id === `base:${seat}`).matrix)
      const shut = deg => {
        const { door: at, bay } = inst.op
        const frame = new Matrix4()
          .makeTranslation(at.x, at.y, 0)
          .multiply(new Matrix4().makeRotationZ(deg2rad(at.turn)))
        return frame
          .clone()
          .multiply(new Matrix4().makeTranslation(0, bay.axis.y, bay.axis.z))
          .multiply(new Matrix4().makeRotationX(deg2rad(deg)))
          .multiply(new Matrix4().makeTranslation(0, -bay.axis.y, -bay.axis.z))
          .multiply(frame.clone().invert())
      }
      const open = x => x && M(x.matrix).equals(base)
      const from = a && !open(a) ? 90 : 0
      const to = b && !open(b) ? 90 : 0
      out[key] = base
        .clone()
        .multiply(shut(from + (to - from) * ease(u)))
        .toArray()
    } else if (m.kind === 'place') {
      if (t >= m.t0) out[key] = b ? rise(b, (m.height ?? 120) * (1 - u) * (1 - u)) : null
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
/** The hero's cubes landing on one subsystem, tagged with what it is and how many. */
const place = (name, sub, t0) => {
  const s = JSON.parse(readFileSync(join(STATES, `${name}-after.json`), 'utf8')).players[
    HERO
  ].ship.subsystems.find(x => x.id === sub)
  return {
    match: cubes(sub),
    t0,
    t1: t0 + 0.5,
    kind: 'place',
    tag: { text: 'cubes', vars: { type: s.type, n: s.energy } },
  }
}
/** The hero's cubes from last turn going back to the supply. */
const clearCubes = (name, t0, t1) => {
  vg[name].clear = { t0, t1 }
  return {
    match: heroCubes,
    t0,
    t1,
    kind: 'clear',
    tag: { text: 'supply', at: `base:${HERO}`, hold: 1.6 },
  }
}
/** A die's new face, tagged with the number it was and the one it shows. */
const dieTag = (name, seat, what, when = 'before') => {
  const ship = w =>
    JSON.parse(readFileSync(join(STATES, `${name}-${w}.json`), 'utf8')).players[seat].ship
  return { text: what, vars: { from: ship(when)[what], to: ship('after')[what] } }
}

vg.build.moves = [
  ...['forward-0', 'side-0', 'side-1', 'side-2', 'side-3'].map((s, i) => ({
    match: `module:${HERO}:${s}`,
    t0: 1.0 + i * 0.8,
    t1: 1.6 + i * 0.8,
    kind: 'place',
    hidden: true,
  })),
  { match: `door:${HERO}:`, t0: 5.6, t1: 7.0, kind: 'hinge' },
]
// Coast vignette: title 0-5, hand 5-10, clear 10-16.
vg.coast.moves = [clearCubes('coast', 11.6, 12.6)]
// Fire vignette: burn 0-10, fire 10-21, critical 21-28, racks 28-35.
const fired = vg.fire.turn.events.filter(e => e.type === 'attack_resolved')
const VICTIM = seatOf('fire', fired[0].targetId)
const OTHER = seatOf('fire', fired[1].targetId)
const burned = ev('fire', 'burned')
vg.fire.moves = [
  place('fire', 'rotation', 1.2),
  place('fire', 'engines', 4.0),
  place('fire', 'side-0', 11.0),
  place('fire', 'side-1', 21.6),
  place('fire', 'side-2', 0.5),
  clearCubes('fire', 0.1, 0.4),
  { match: `cube:${HERO}:heat:`, t0: 33.0, t1: 33.4, kind: 'place' },
  {
    match: `ship:${HERO}`,
    t0: 1.2,
    t1: 8.4,
    kind: 'burn',
    centre: BH,
    drift: speedOf('blackhole', burned.from.ring),
    rotate: true,
    count: { ring: burned.to.ring },
  },
  { match: 'die:roll:', t0: 12.4, t1: 13.6, t2: 22.4, t3: 23.6, kind: 'toss', via: DIE.first },
  {
    match: 'wreck:',
    t0: 16.4,
    t1: 17.8,
    kind: 'lift',
    height: 140,
    from: 'pool:wreck:',
    tag: { text: 'wreck' },
  },
  { match: `ship:${VICTIM}`, t0: 17.0, t1: 17.5, kind: 'lift', height: 4 },
  {
    match: `die:${VICTIM}:hull:`,
    t0: 15.0,
    t1: 15.6,
    kind: 'lift',
    height: 30,
    tag: dieTag('fire', VICTIM, 'hull'),
  },
  { match: `door:${HERO}:`, t0: 28.8, t1: 29.8, kind: 'hinge' },
  { match: `module:${HERO}:side-0`, t0: 30.0, t1: 31.5, kind: 'lift', height: 70 },
  { match: `module:${HERO}:side-1`, t0: 30.8, t1: 32.3, kind: 'lift', height: 70 },
]
const RESPAWNER = seatOf('respawn', vg.respawn.turn.playerId)
vg.respawn.moves = [
  {
    match: `ship:${RESPAWNER}`,
    t0: 2.0,
    t1: 4.0,
    kind: 'lift',
    height: 40,
    tag: { text: 'home', hold: 3 },
  },
]
// Launch: purple's salvo leaves its ship and flies 3 steps. Intercept: it rides, flies on and reaches orange, whose rack shoots it down.
const LAUNCHER = seatOf('launch', vg.launch.turn.playerId)
const LAUNCH_TARGET = seatOf('launch', ev('launch', 'missile_launched').targetId)
const SALVO = ev('launch', 'weapon_fired')
vg.launch.moves = [
  {
    match: 'salvo:',
    t0: 2.2,
    t1: 4.4,
    kind: 'lift',
    height: 24,
    fromId: `ship:${LAUNCHER}`,
    tag: { text: 'salvo', vars: { count: SALVO.count }, hold: 3 },
  },
]
const lasered = vg.intercept.turn.events.filter(
  e => e.type === 'attack_resolved' && seatOf('intercept', e.targetId) === LAUNCH_TARGET
)
const intercepted = vg.intercept.turn.events.filter(e => e.type === 'missile_intercepted')
vg.intercept.moves = [
  {
    match: `die:${LAUNCH_TARGET}:hull:`,
    t0: 2.4,
    t1: 3.0,
    kind: 'lift',
    height: 30,
    tag: dieTag('intercept', LAUNCH_TARGET, 'hull'),
  },
  {
    match: 'salvo:',
    t0: 4.2,
    t1: 6.8,
    t2: 9.4,
    kind: 'lift',
    height: 24,
    toId: `ship:${LAUNCH_TARGET}`,
  },
]
const MISSILE = getMissileStats()
// Dive: green turns retrograde and burns 3 rings in at Gamma.
const dived = ev('dive', 'burned')
vg.dive.moves = [
  place('dive', 'rotation', 1.0),
  place('dive', 'engines', 3.4),
  clearCubes('dive', 0.1, 0.4),
  {
    match: `ship:${HERO}`,
    t0: 1.0,
    t1: 7.4,
    kind: 'burn',
    centre: GAMMA,
    drift: speedOf(dived.from.wellId, dived.from.ring),
    rotate: true,
    count: { ring: dived.to.ring },
  },
]
// Scoop vignette: the coast on the board.
const scooped = ev('scoop', 'fuel_scooped')
vg.scoop.moves = [
  place('scoop', 'scoop', 0.6),
  clearCubes('scoop', 0.1, 0.4),
  { match: `ship:${HERO}`, t0: 1.2, t1: 4.4, kind: 'orbit', centre: GAMMA, count: {} },
]
// Jump vignette: the jump on the board 0-8, its cubes on the base 10-16, its
// heat check 16-26 (the one that carries heat into the next turn).
const jumpCheck = ev('jump', 'heat_check')
const jumpAfter = JSON.parse(readFileSync(join(STATES, 'jump-after.json'), 'utf8'))
const jumpLoadout = jumpAfter.players[HERO].ship.subsystems
const jumpCubes = type => jumpLoadout.filter(s => s.type === type).reduce((n, s) => n + s.energy, 0)
const jumpRadiators =
  jumpLoadout.filter(s => s.type === 'radiator' && !s.broken).length *
  (SUBSYSTEM_CONFIGS.radiator.passiveEffect?.dissipationBonus ?? 0)
const heatBefore = vg.jump.state.players[HERO].ship.heat
/**
 * The check on the table: for each cube on the ship (counted in the order they
 * landed) a heat cube goes onto the track, then the dissipated ones come off,
 * the top first: the base's five, then the radiator's.
 */
const CHECK_AT = 16
/** The demonstration's time before the check: the turn's cubes landing. */
const CUBES_FOR = CHECK_AT - 10
const counted = ['engines', 'side-0', 'side-1', 'side-2'].flatMap(sub =>
  Array.from(
    { length: jumpLoadout.find(x => x.id === sub).energy },
    (_, k) => `cube:${HERO}:${sub}:${k}`
  )
)
const peakHeat = Math.min(jumpCheck.heat, MAX_HEAT)
const CHECK = {
  /** A heat cube goes on as cube i on the ship is counted. */
  on: i => 1.2 + 0.5 * i,
  dissipate: 6.4,
  radiator: 9.4,
  /** The j-th cube to come off, the top first. */
  off: j =>
    j < DEFAULT_DISSIPATION_CAPACITY
      ? 6.8 + 0.4 * j
      : 9.8 + 0.4 * (j - DEFAULT_DISSIPATION_CAPACITY),
  next: 11.4,
  dur: 13.6,
}
const trackCube = k => `cube:${HERO}:heat:${k}`
const trackMid = placeOf(vg.jump, trackCube(Math.floor(peakHeat / 2)), 'peak').toArray()
vg.jump.moves = [
  { match: `ship:${HERO}`, t0: 1.6, t1: 4.8, kind: 'lift', height: 110 },
  place('jump', 'engines', 12.0),
  place('jump', 'side-0', 12.9),
  place('jump', 'side-1', 13.6),
  place('jump', 'side-2', 14.4),
  clearCubes('jump', 10.6, 11.4),
  ...Array.from({ length: peakHeat }, (_, k) => {
    const on = k < heatBefore ? -1 : CHECK_AT + CHECK.on(k - heatBefore)
    const j = peakHeat - 1 - k
    const off = k >= jumpCheck.carried ? CHECK_AT + CHECK.off(j) : undefined
    return {
      match: trackCube(k),
      t0: on,
      t1: on + 0.5,
      ...(off !== undefined && { t2: off, t3: off + 0.6 }),
      kind: 'track',
    }
  }),
  // What went on and what came off, beside the track.
  {
    match: trackCube(peakHeat - 1),
    t0: CHECK_AT + CHECK.on(counted.length - 1) + 0.5,
    t1: CHECK_AT + CHECK.dissipate - 0.4,
    tag: { text: 'heat', vars: { n: jumpCheck.cubes }, hold: 0, at: trackMid },
    kind: 'none',
  },
  {
    match: trackCube(peakHeat - 1),
    t0: CHECK_AT + CHECK.dissipate + 0.4,
    t1: CHECK_AT + CHECK.radiator - 0.4,
    tag: { text: 'dissipate', vars: { n: DEFAULT_DISSIPATION_CAPACITY }, hold: 0, at: trackMid },
    kind: 'none',
  },
  {
    match: trackCube(peakHeat - 1),
    t0: CHECK_AT + CHECK.radiator + 0.4,
    t1: CHECK_AT + CHECK.next - 0.2,
    tag: { text: 'radiator', vars: { n: jumpRadiators }, hold: 0, at: trackMid },
    kind: 'none',
  },
]
// Dock vignette: dock 0-10, sell 10-18, missions 18-24.
const dockBurn = ev('dock', 'burned')
const sold = ev('dock', 'cargo_delivered')
vg.dock.moves = [
  place('dock', 'rotation', 1.0),
  place('dock', 'engines', 3.0),
  clearCubes('dock', 0.1, 0.4),
  {
    match: `ship:${HERO}`,
    t0: 1.0,
    t1: 7.0,
    kind: 'burn',
    centre: GAMMA,
    drift: speedOf(dockBurn.from.wellId, dockBurn.from.ring),
    rotate: true,
    count: { ring: dockBurn.to.ring },
  },
  {
    match: `hold:${HERO}:${sold.cargoId}`,
    t0: 11.0,
    t1: 11.8,
    kind: 'clear',
    tag: { text: 'data', hold: 1.4 },
  },
  {
    match: `chip:${HERO}:`,
    t0: 12.0,
    t1: 13.2,
    kind: 'lift',
    height: 120,
    from: 'pool:chip:planet-gamma:',
    tag: { text: 'chip' },
  },
  {
    match: `die:${HERO}:hull:`,
    t0: 15.4,
    t1: 16.1,
    kind: 'lift',
    height: 30,
    tag: dieTag('dock', HERO, 'hull'),
  },
  {
    match: `card:${HERO}:1`,
    t0: 19.6,
    t1: 20.4,
    kind: 'lift',
    height: 40,
    tag: { text: 'point', hold: 3 },
  },
]
vg.stations.moves = [
  {
    match: 'station:planet-gamma',
    t0: 1.6,
    t1: 4.4,
    kind: 'orbit',
    centre: GAMMA,
    count: {},
  },
  { match: `ship:${HERO}`, t0: 1.6, t1: 4.4, kind: 'orbit', centre: GAMMA },
]

/** u with ease(u) = y. */
const unease = y => {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2
    if (ease(m) < y) lo = m
    else hi = m
  }
  return (lo + hi) / 2
}
/**
 * The sectors a move passes, numbered as the piece reaches each (a burn's
 * drift, a coast, the stations' step), the ring a burn crosses to, and each
 * sector of a burn's phasing at a fuel apiece: [vignette time, place, tag].
 */
function marksOf(v, m) {
  const key = v.keys.find(k => matches(m.match, idOf(k)))
  const A = decompose(M(v.byKey.before.get(key).matrix))
  const B = decompose(M(v.byKey.after.get(key).matrix))
  const c = m.centre
  const pa = polar(A.p, c)
  const pb = polar(B.p, c)
  const at = (r, a) => new Vector3(c.x + r * Math.cos(a), c.y + r * Math.sin(a), A.p.z + 6)
  const when = u => m.t0 + (m.t1 - m.t0) * u
  if (m.kind === 'orbit') {
    const d = clockwise(pa.a, pb.a)
    const n = Math.round(-d / STEP)
    return Array.from({ length: n }, (_, i) => ({
      t: when(unease((i + 1) / n)),
      p: at(pa.r, pa.a + (d * (i + 1)) / n),
      text: 'sector',
      vars: { n: i + 1 },
    }))
  }
  const turnEnd = m.rotate ? 0.15 : 0
  const driftEnd = turnEnd + (1 - turnEnd) * 0.5
  const crossEnd = driftEnd + (1 - driftEnd) * 0.55
  const aDrift = pa.a - m.drift * STEP
  let target = pb.a
  while (target - aDrift > Math.PI) target -= 2 * Math.PI
  while (aDrift - target > Math.PI) target += 2 * Math.PI
  const phased = Math.round((target - aDrift) / STEP)
  return [
    ...Array.from({ length: m.drift }, (_, i) => ({
      t: when(turnEnd + (driftEnd - turnEnd) * unease((i + 1) / m.drift)),
      p: at(pa.r, pa.a - (i + 1) * STEP),
      text: 'sector',
      vars: { n: i + 1 },
    })),
    { t: when(crossEnd), p: at(pb.r, aDrift), text: 'ring', vars: { ring: m.count.ring } },
    ...Array.from({ length: Math.abs(phased) }, (_, i) => ({
      t: when(crossEnd + (1 - crossEnd) * unease((i + 1) / Math.abs(phased))),
      p: at(pb.r, aDrift + Math.sign(phased) * (i + 1) * STEP),
      text: 'phase',
      vars: { fuel: 1 },
    })),
  ]
}

// ---- The film ---------------------------------------------------------------------

/**
 * A ship's numbers in the corner as a demonstration changes them: per row,
 * [time, value, change] steps in the demo's own time.
 */
const playerOf = (name, seat, when = 'before') =>
  JSON.parse(readFileSync(join(STATES, `${name}-${when}.json`), 'utf8')).players[seat].ship
const signed = n => (n > 0 ? `+${n}` : `−${-n}`)
const status = (seat, rows) => ({ seat, rows })
/** Energy put on the move and fuel spent or gained, step by step. */
const moveStatus = (name, energy, fuel) => {
  const tank = playerOf(name, HERO).fuel
  let used = 0
  let left = tank
  return status(HERO, [
    {
      label: 'energy',
      steps: [[0, '0'], ...energy.map(([t, n]) => [t, String((used += n)), signed(n)])],
    },
    {
      label: 'fuel',
      steps: [[0, String(tank)], ...fuel.map(([t, n]) => [t, String((left += n)), signed(n)])],
    },
  ])
}
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
    dur: 8.4,
    topic: 'build',
    cam: drift([base.x, base.y, 20], -60, -45, 60, 380, 350, 8.4, { focus: true }),
    captions: [{ text: 'bays', t0: 0.4 }],
  },
  { slide: 'turn', dur: 9 },
  {
    demo: 'coast',
    vt: 10,
    dur: 9,
    topic: 'turn',
    cam: drift([base.x, base.y, 20], -70, -58, 52, 400, 375, 9, { focus: true }),
    captions: [
      { text: 'clear', t0: 0.6, t1: 4.8 },
      { text: 'actions', t0: 4.8 },
    ],
    rings: [{ at: [base.x, base.y + 20, 30], t0: 1.0, t1: 3.2, r: 70 }],
  },
  { slide: 'orbits', dur: 8 },
  { slide: 'moves', dur: 9 },
  {
    demo: 'fire',
    vt: 0,
    facing: true,
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
        vars: {
          ring: burned.to.ring,
          energy: BURN_COSTS[burned.intensity].energy,
          fuel: BURN_COSTS[burned.intensity].mass,
        },
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
    status: moveStatus(
      'fire',
      [
        [1.2, SUBSYSTEM_CONFIGS.rotation.minEnergy],
        [4.0, BURN_COSTS[burned.intensity].energy],
      ],
      [
        [5.3, -BURN_COSTS[burned.intensity].mass],
        [7.0, -(burned.massSpent - BURN_COSTS[burned.intensity].mass)],
      ]
    ),
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
      {
        text: 'jump',
        vars: { energy: WELL_TRANSFER_COSTS.energy, fuel: WELL_TRANSFER_COSTS.mass },
        t0: 0.4,
        t1: 5.2,
      },
      {
        text: 'compressor',
        vars: { compressed: COMPRESSED_JUMP_MASS },
        t0: 5.2,
      },
    ],
    rings: [{ at: `ship:${HERO}`, t0: 0.4, r: 22 }],
    paths: [{ id: `ship:${HERO}`, t0: 1.6, t1: 4.8 }],
    status: moveStatus(
      'jump',
      [[1.6, WELL_TRANSFER_COSTS.energy]],
      [[4.8, -ev('jump', 'jumped').massSpent]]
    ),
  },
  {
    demo: 'dive',
    vt: 0,
    facing: true,
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
        vars: {
          rings: dived.from.ring - dived.to.ring,
          energy: BURN_COSTS[dived.intensity].energy,
          fuel: dived.massSpent,
        },
        t0: 5.2,
      },
    ],
    rings: [{ at: `ship:${HERO}`, t0: 0.4, r: 26 }],
    paths: [{ id: `ship:${HERO}`, t0: 1.0, t1: 7.4 }],
    status: moveStatus(
      'dive',
      [
        [1.0, SUBSYSTEM_CONFIGS.rotation.minEnergy],
        [3.4, BURN_COSTS[dived.intensity].energy],
      ],
      [[5.2, -dived.massSpent]]
    ),
  },
  {
    demo: 'scoop',
    vt: 0,
    dur: 8,
    topic: 'moves',
    cam: drift([GAMMA.x, GAMMA.y, 0], -112, -120, 70, 430, 410, 8),
    captions: [
      { text: 'coast', vars: { sectors: speedOf('planet-gamma', 1) }, t0: 0.4, t1: 4.8 },
      {
        text: 'scoop',
        vars: { energy: SUBSYSTEM_CONFIGS.scoop.minEnergy, fuel: scooped.amount },
        t0: 4.8,
      },
    ],
    rings: [{ at: `ship:${HERO}`, t0: 0.4, r: 26 }],
    paths: [{ id: `ship:${HERO}`, t0: 1.2, t1: 4.4 }],
    status: moveStatus('scoop', [[0.6, ev('scoop', 'coasted').heat]], [[4.8, scooped.amount]]),
  },
  { slide: 'heat', dur: 9 },
  {
    slide: 'heatCheck',
    dur: 13,
    // The slide works the same check the table shows next.
    vars: {
      carried: heatBefore,
      engines: jumpCubes('engines'),
      racks: jumpCubes('ballistic_rack'),
      shields: jumpCubes('shields'),
      cubes: jumpCheck.cubes,
      heat: jumpCheck.heat,
      radiator: jumpRadiators,
      next: jumpCheck.carried,
    },
  },
  {
    // The jump's cubes land on the base, then its heat check: the same turn as the slide.
    demo: 'jump',
    vt: 10,
    dur: CUBES_FOR + CHECK.dur,
    topic: 'heatCheck',
    cam: drift([base.x + 10, base.y, 25], -20, -8, 46, 380, 350, CUBES_FOR + CHECK.dur, {
      focus: true,
    }),
    captions: [
      {
        text: 'cubes',
        vars: {
          jump: jumpCubes('engines'),
          rack: jumpCubes('ballistic_rack'),
          shields: jumpCubes('shields'),
          cubes: jumpCheck.cubes,
        },
        t0: 1.6,
        t1: CUBES_FOR + 0.4,
      },
      {
        text: 'check',
        vars: { cubes: jumpCheck.cubes, carried: heatBefore, heat: jumpCheck.heat },
        t0: CUBES_FOR + 0.4,
        t1: CUBES_FOR + CHECK.dissipate,
      },
      {
        text: 'carry',
        vars: { dissipation: DEFAULT_DISSIPATION_CAPACITY },
        t0: CUBES_FOR + CHECK.dissipate,
        t1: CUBES_FOR + CHECK.radiator,
      },
      {
        text: 'radiator',
        vars: { radiator: jumpRadiators },
        t0: CUBES_FOR + CHECK.radiator,
        t1: CUBES_FOR + CHECK.next,
      },
      { text: 'track', vars: { next: jumpCheck.carried }, t0: CUBES_FOR + CHECK.next },
    ],
    // Each cube on the ship counted as its heat cube goes onto the track.
    counts: counted.map((at, i) => ({
      at,
      n: i + 1,
      t0: CUBES_FOR + CHECK.on(i),
      t1: CUBES_FOR + CHECK.dissipate,
    })),
    ledger: {
      rows: [
        { value: String(heatBefore), text: 'carried', at: 0.6 },
        { value: `+${jumpCheck.cubes}`, text: 'cubes', at: CHECK.on(counted.length - 1) + 0.5 },
        {
          value: String(jumpCheck.heat),
          text: 'atCheck',
          rule: true,
          at: CHECK.on(counted.length - 1) + 0.9,
        },
        { value: `−${DEFAULT_DISSIPATION_CAPACITY}`, text: 'dissipate', at: CHECK.dissipate + 0.4 },
        { value: `−${jumpRadiators}`, text: 'radiator', at: CHECK.radiator + 0.4 },
        { value: String(jumpCheck.carried), text: 'next', tone: 'ink', at: CHECK.next },
      ].map(r => ({ ...r, at: CUBES_FOR + r.at })),
    },
    rings: [
      { at: trackMid, t0: CUBES_FOR + 0.4, t1: CUBES_FOR + 1.2, r: 60 },
      {
        at: `module:${HERO}:side-3`,
        t0: CUBES_FOR + CHECK.radiator,
        t1: CUBES_FOR + CHECK.next,
        r: 36,
      },
    ],
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
    status: status(VICTIM, [
      {
        label: 'hull',
        steps: [
          [0, String(playerOf('fire', VICTIM).hull)],
          [4.0, String(fired[0].targetHullAfter), signed(-fired[0].toHull)],
        ],
      },
    ]),
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
    status: status(OTHER, [
      {
        label: 'hull',
        steps: [
          [0, String(playerOf('fire', OTHER).hull)],
          [3.4, String(fired[1].targetHullAfter), signed(-fired[1].toHull)],
        ],
      },
    ]),
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
    status: status(LAUNCH_TARGET, [
      { label: 'hull', steps: [[0, String(playerOf('launch', LAUNCH_TARGET).hull)]] },
    ]),
  },
  {
    demo: 'intercept',
    vt: 0,
    dur: 12,
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
      {
        text: 'lasers',
        vars: { damage: lasered.reduce((n, e) => n + e.toHull, 0) },
        t0: 0.4,
        t1: 3.8,
      },
      { text: 'rides', vars: { steps: MISSILE.stepsPerMove }, t0: 3.8, t1: 6.8 },
      { text: 'reaches', t0: 6.8, t1: 9.4 },
      {
        text: 'shotDown',
        vars: { count: intercepted.length, on: INTERCEPT_ROLL, heat: INTERCEPT_HEAT },
        t0: 9.4,
      },
    ],
    rings: [
      { at: 'salvo:', t0: 4.0, t1: 9.4, r: 22 },
      { at: `ship:${LAUNCH_TARGET}`, t0: 6.8, r: 26 },
    ],
    shots: [{ from: `ship:${LAUNCHER}`, to: `ship:${LAUNCH_TARGET}`, t0: 0.6, t1: 3.4 }],
    paths: [{ id: 'salvo:', t0: 4.2, t1: 6.8 }],
    rolls: { faces: intercepted.map(e => e.roll), t0: 7.4 },
    status: status(LAUNCH_TARGET, [
      {
        label: 'hull',
        steps: [
          [0, String(playerOf('intercept', LAUNCH_TARGET).hull)],
          [
            2.6,
            String(lasered[lasered.length - 1].targetHullAfter),
            signed(-lasered.reduce((n, e) => n + e.toHull, 0)),
          ],
        ],
      },
      {
        label: 'heat',
        steps: [
          [0, String(playerOf('intercept', LAUNCH_TARGET).heat)],
          [9.4, String(playerOf('intercept', LAUNCH_TARGET, 'after').heat), signed(INTERCEPT_HEAT)],
        ],
      },
    ]),
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
      { at: `module:${HERO}:side-0`, t0: 3.8, r: 34 },
      { at: `module:${HERO}:side-1`, t0: 4.6, r: 34 },
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
    status: status(
      RESPAWNER,
      ['hull', 'fuel'].map(label => {
        const [a, b] = ['before', 'after'].map(w => playerOf('respawn', RESPAWNER, w)[label])
        return {
          label,
          steps: [
            [0, String(a)],
            [4.0, String(b), signed(b - a)],
          ],
        }
      })
    ),
  },
  { slide: 'stations', dur: 10 },
  {
    demo: 'dock',
    vt: 0,
    facing: true,
    dur: 10,
    topic: 'stations',
    cam: drift([GAMMA.x, GAMMA.y, 0], -112, -118, 70, 460, 440, 10),
    captions: [{ text: 'dock', t0: 0.4 }],
    rings: [{ at: `ship:${HERO}`, t0: 0.4, r: 24 }],
    paths: [{ id: `ship:${HERO}`, t0: 1.0, t1: 7.0 }],
    status: moveStatus(
      'dock',
      [
        [1.0, SUBSYSTEM_CONFIGS.rotation.minEnergy],
        [3.0, BURN_COSTS[dockBurn.intensity].energy],
      ],
      [[4.6, -dockBurn.massSpent]]
    ),
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
    status: status(HERO, [
      {
        label: 'hull',
        steps: [
          [0, String(playerOf('dock', HERO).hull)],
          [
            5.4,
            String(playerOf('dock', HERO, 'after').hull),
            signed(ev('dock', 'docked').hullRestored),
          ],
        ],
      },
    ]),
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
  'heat',
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
// A demonstration plays its vignette at PACE times its authored length, so
// each step has time to be taken in; its times stay authored (vdur, local).
const PACE = 1.3
FILM.forEach((item, i) => {
  item.say = SAY[i]
  item.vdur = item.dur
  const picture = item.demo ? item.dur * PACE : item.dur
  item.dur = spoken[item.say]
    ? Math.max(picture, Math.ceil((LEAD + spoken[item.say] + TAIL) * 10) / 10)
    : picture
})
/** A moment's own time at film time t: a demonstration's in its authored seconds. */
const localOf = (item, t) => (item.demo ? (t - item.start) / PACE : t - item.start)

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
  const local = localOf(item, t)
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
  return [((v.x + 1) / 2) * 1920, ((1 - v.y) / 2) * 1080, v.z]
}
const onScreen = ([x, y, z]) => z < 1 && x > 40 && x < 1880 && y > 40 && y < 1040
const piecesOf = t => {
  const item = itemAt(t)
  return item.demo ? piecesAt(vg[item.demo], item.vt + Math.min(localOf(item, t), item.vdur)) : null
}

/** What the overlay draws at t. */
function overlayAt(t, pieces) {
  const item = itemAt(t)
  const local = localOf(item, t)
  const out = clamp((item.dur - (t - item.start)) / 0.35)
  if (item.slide) return { slide: { id: item.slide, t: local, out, vars: item.vars } }
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
  if (item.rolls)
    frame.rolls = { faces: item.rolls.faces, u: appear(item.rolls.t0, undefined, 1.6) }
  if (item.status)
    frame.status = {
      seat: item.status.seat,
      u: Math.min(clamp(local / 0.4), out),
      rows: item.status.rows.map(row => {
        const [at, value, delta] = row.steps.filter(s => local >= s[0]).pop() ?? row.steps[0]
        return { label: row.label, value, delta, flash: at > 0 ? clamp(1 - (local - at) / 0.9) : 0 }
      }),
    }
  if (item.ledger) {
    const rows = item.ledger.rows.filter(r => local >= r.at)
    if (rows.length) frame.ledger = { rows, u: out }
  }
  // The vignette's time now, and whether a vignette time falls in this moment.
  const now = item.vt + Math.min(local, item.vdur)
  const within = vt => vt >= item.vt - 0.05 && vt <= item.vt + item.vdur
  // Tags: what lands, leaves or changes, beside the piece, for a while after.
  frame.tags = v.moves
    .filter(m => m.tag && within(m.t0))
    .map(m => {
      const u = appear(m.t0 - item.vt, m.t1 - item.vt + (m.tag.hold ?? 2.2))
      if (u <= 0) return null
      const p = at(m.tag.at ?? m.match, 14)
      return onScreen(p) ? { x: p[0], y: p[1], text: m.tag.text, vars: m.tag.vars, u } : null
    })
    .filter(Boolean)
  // Tags side by side are stacked, the later one lifted above the earlier.
  const placed = []
  for (const g of frame.tags) {
    const words = String(EXPLAINER.tags[g.text] ?? g.text).replace(/\{(\w+)\}/g, (_, k) =>
      k === 'name' ? String(g.vars?.type ?? '').replace(/_/g, ' ') : String(g.vars?.[k] ?? '')
    )
    const w = 17 * words.length + 50
    g.lift = 0
    while (
      placed.some(
        o => Math.abs(o.x - g.x) < (o.w + w) / 2 && Math.abs(o.y - o.lift - (g.y - g.lift)) < 52
      )
    )
      g.lift += 52
    placed.push({ ...g, w })
  }
  // Counted moves: each sector numbered as the piece reaches it.
  frame.marks = v.moves
    .filter(m => m.count && within(m.t0))
    .flatMap(m => (m.marks ??= marksOf(v, m)))
    .filter(k => now >= k.t)
    .map(k => {
      const p = project(c, k.p)
      return onScreen(p)
        ? { x: p[0], y: p[1], text: k.text, vars: k.vars, u: appear(k.t - item.vt, undefined, 0.3) }
        : null
    })
    .filter(Boolean)
  // Counted cubes: a badge on each, numbered.
  frame.counts = (item.counts ?? [])
    .map(k => {
      const u = appear(k.t0, k.t1, 0.25)
      if (u <= 0) return null
      const p = at(k.at, 12)
      return { x: p[0], y: p[1], n: k.n, u }
    })
    .filter(Boolean)
  // Facing: an arrow the way the ship faces, turning as it rotates, beside the prograde way.
  if (item.facing) {
    const m = v.moves.find(x => x.kind === 'burn' && x.rotate)
    const turnEnd = m.t0 + 0.15 * (m.t1 - m.t0)
    const u = appear(0.4, turnEnd - item.vt + 1.8)
    if (u > 0) {
      const ship = liveAt(v, pieces, m.match)
      const a = Math.atan2(ship.y - m.centre.y, ship.x - m.centre.x)
      const pro = new Vector3(Math.sin(a), -Math.cos(a), 0)
      const out_ = new Vector3(Math.cos(a), Math.sin(a), 0)
      const was = v.state.players[HERO].ship.facing
      const is = v.turn.events.find(e => e.type === 'rotated')?.facing ?? was
      const f0 = pro.clone().multiplyScalar(was === 'prograde' ? 1 : -1)
      const phi = was === is ? 0 : Math.PI * ease(clamp((now - m.t0) / (turnEnd - m.t0)))
      const f = f0
        .clone()
        .multiplyScalar(Math.cos(phi))
        .add(out_.clone().multiplyScalar(Math.sin(phi)))
      const arrow = (from, dir, l0, l1, label, dashed) => {
        const p1 = project(
          c,
          from
            .clone()
            .addScaledVector(dir, l0)
            .setZ(ship.z + 10)
        )
        const p2 = project(
          c,
          from
            .clone()
            .addScaledVector(dir, l1)
            .setZ(ship.z + 10)
        )
        return { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], label, dashed, u }
      }
      frame.arrows = [
        arrow(ship.clone().addScaledVector(out_, 30), pro, -8, 40, 'prograde', true),
        arrow(ship, f, 12, 50, 'facing', false),
      ]
    }
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
          `${host}/cad/scripts/table/render.html?scene=${scene('before')}&film=${[
            'after',
            ...(vg[name].sc.peak ? ['peak'] : []),
          ]
            .map(scene)
            .join(',')}`
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
  status: f.status,
  roll: f.roll?.face,
  rolls: f.rolls?.faces,
  ledger: f.ledger?.rows,
}))
if (process.argv.includes('--timeline'))
  writeFileSync(join(OUT, 'timeline.json'), JSON.stringify(TIMELINE, null, 2))
