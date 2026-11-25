// The explainer film's storyboard, for the designer to edit: every moment in
// order with stills from the film, the words on screen, what the table or the
// diagram shows and what the voice says, and a Notes bullet to write in.
// Reads the film's timeline (film.mjs --timeline) and explainer.mp4.
//
//   cd cad && node --import ./scripts/ts-hooks.mjs scripts/table/storyboard.mjs [--voices=af_heart,bm_george]
//
// Writes shots/film/storyboard/storyboard.md and its stills. An existing
// storyboard.md is kept beside it as storyboard-<date>T<time>.md, notes and all.
import { execFileSync } from 'node:child_process'
import {
  constants as fsConstants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import {
  BURN_COSTS,
  COMPRESSED_JUMP_MASS,
  DEFAULT_DISSIPATION_CAPACITY,
  DEFAULT_POINTS_TO_WIN,
  FORWARD_SLOT_COUNT,
  INTERCEPT_HEAT,
  MAX_HEAT,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MISSION_POINTS,
  PRIMARIES_PER_PLAYER,
  PRIMARY_OFFERS_PER_PLAYER,
  SECONDARIES_PER_PLAYER,
  SECONDARY_OFFERS_PER_PLAYER,
  SECTOR_ADJUSTMENT_COST_PER_SECTOR,
  SIDE_SLOT_COUNT,
  STATION_DRIFT,
  SUBSYSTEM_CONFIGS,
  WELL_TRANSFER_COSTS,
  BLACKHOLE_RINGS,
  fill,
  getMissileStats,
  interceptsPerRack,
} from '@dangerous-inclinations/engine'
import { EXPLAINER as X } from '../../../ui/src/text/explainer.ts'
import {
  BASE_CRIT,
  INTERCEPT_ON,
  MISS_TOP,
  RADIATOR_DISSIPATION,
} from '../../../ui/src/site/numbers.ts'

const CAD = resolve(import.meta.dirname, '../..')
const FILM = join(CAD, 'shots/film')
const OUT = join(FILM, 'storyboard')
const MP4 = join(FILM, 'explainer.mp4')
const T = JSON.parse(readFileSync(join(FILM, 'timeline.json'), 'utf8'))
const S = X.slides
const missile = getMissileStats()
const POINTS = DEFAULT_POINTS_TO_WIN

/** A slide's words, in the order it builds them, filled as the slide fills them. */
const slideWords = {
  goal: [
    fill(S.goal.title, { points: POINTS }),
    `${fill(S.goal.primaries, { points: MISSION_POINTS.destroy_ship })}: ${fill(S.goal.primariesDeal, { dealt: PRIMARY_OFFERS_PER_PLAYER, kept: PRIMARIES_PER_PLAYER })}`,
    `${fill(S.goal.secondaries, { points: MISSION_POINTS.survey })}: ${fill(S.goal.secondariesDeal, { dealt: SECONDARY_OFFERS_PER_PLAYER, kept: SECONDARIES_PER_PLAYER })}`,
    fill(S.goal.sum, {
      held:
        PRIMARIES_PER_PLAYER * MISSION_POINTS.destroy_ship +
        SECONDARIES_PER_PLAYER * MISSION_POINTS.survey,
      points: POINTS,
    }),
    `${fill(S.goal.end, { points: POINTS })} ${S.goal.ties}`,
  ],
  build: [
    S.build.title,
    fill(S.build.forward, { count: FORWARD_SLOT_COUNT }),
    fill(S.build.side, { count: SIDE_SLOT_COUNT }),
    S.build.fixed,
    S.build.missions,
    ...S.build.needs,
    S.build.hidden,
  ],
  turn: [
    S.turn.title,
    S.turn.lede,
    ...S.turn.steps.map((s, i) => `${i + 1} ${s.title}: ${s.text}`),
    S.turn.round,
  ],
  orbits: [
    S.orbits.title,
    S.orbits.lede,
    BLACKHOLE_RINGS.map(
      r =>
        `${fill(S.orbits.ring, { ring: r.ring })} · ${fill(S.orbits.speed, { speed: r.velocity })}`
    ).join(', '),
    `${S.orbits.primer.title}: ${S.orbits.primer.rows.join(' ')}`,
  ],
  moves: [
    S.moves.title,
    `${S.moves.coast.title} (${S.moves.coast.cost}): ${fill(S.moves.coast.text, { energy: SUBSYSTEM_CONFIGS.scoop.minEnergy })}`,
    `${S.moves.burn.title} (${fill(S.moves.burn.cost, { fuel: BURN_COSTS.soft.mass, energy: BURN_COSTS.soft.energy })}): ${fill(
      S.moves.burn.text,
      {
        fewest: BURN_COSTS.soft.rings,
        most: Math.max(...Object.values(BURN_COSTS).map(b => b.rings)),
      }
    )}`,
    `${S.moves.jump.title} (${fill(S.moves.jump.cost, { energy: WELL_TRANSFER_COSTS.energy, fuel: WELL_TRANSFER_COSTS.mass, compressed: COMPRESSED_JUMP_MASS })}): ${S.moves.jump.text}`,
    `${S.moves.phasing.title}: ${fill(S.moves.phasing.text, { fuel: SECTOR_ADJUSTMENT_COST_PER_SECTOR })}`,
  ],
  heat: [S.heat.title, S.heat.lede, S.heat.stays, S.heat.check],
  heatCheck: [
    S.heatCheck.title,
    S.heatCheck.lede,
    fill(S.heatCheck.dissipate, {
      dissipation: DEFAULT_DISSIPATION_CAPACITY,
      radiator: RADIATOR_DISSIPATION,
    }),
    fill(S.heatCheck.over, { maxHeat: MAX_HEAT }),
  ],
  fight: [
    S.fight.title,
    S.fight.lede,
    fill(S.fight.faces[0], { top: MISS_TOP }),
    fill(S.fight.faces[1], { from: MISS_TOP + 1, to: BASE_CRIT - 1 }),
    fill(S.fight.faces[2], { face: BASE_CRIT }),
    S.fight.critical,
    S.fight.broken,
    S.fight.shields,
    S.fight.zero,
  ],
  missiles: [
    S.missiles.title,
    ...S.missiles.rows.map(r =>
      fill(r, {
        steps: missile.stepsPerMove,
        damage: missile.damage,
        turns: missile.maxMoves,
        on: INTERCEPT_ON,
        heat: INTERCEPT_HEAT,
        count: interceptsPerRack(),
      })
    ),
  ],
  secrets: [
    S.secrets.title,
    S.secrets.lede,
    ...S.secrets.rows.map(r => fill(r, { heat: DEFAULT_DISSIPATION_CAPACITY })),
    S.secrets.public,
  ],
  death: [S.death.title, ...S.death.steps.map(s => `${s.when}: ${s.title}. ${s.text}`)],
  stations: [S.stations.title, ...S.stations.rows, fill(S.stations.move, { drift: STATION_DRIFT })],
}
const slideDiagram = {
  goal: 'The game’s own mission cards: the three primaries, then the five secondaries.',
  build:
    'The loadout: one forward slot, four side slots, the three fixed subsystems, each with its options. The example ship’s five subsystems fill the slots.',
  turn: 'The six steps as a strip, Actions in red.',
  orbits:
    'The black hole’s five rings; a dot on each drifts its ring’s speed for one turn. Then the real-orbit box.',
  moves:
    'The cheatsheet’s coast, burn and jump diagrams, each with its cost; then phasing as a strip of landings (free where the drift lands, 1 fuel a sector short or long).',
  heat: 'The energy each action costs, eight cells.',
  heatCheck:
    'The check the table shows next, row by row: 2 carried in, +8 on the ship (engines 3, racks 4, shields 1), 10 at the check, −5 dissipated, −2 radiator, 3 into the next turn. Beside it, the two rules: dissipate 5 (+2 a radiator), and over 10 is hull damage.',
  fight: 'The d10 strip: 1 miss, 2–9 hit, 10 critical.',
  missiles:
    'The cheatsheet’s missile diagram: a launch, the ship moving on, and the missile riding its orbit and reaching the target on its second turn.',
  secrets: 'What turns each subsystem face-up, with its marks.',
  death: 'Three steps: off the board, back at Home, a quiet turn.',
  stations: 'A station on its ring moving 4 sectors.',
}
/** What happens on the table in each demonstration, by vignette and its time. */
const table = {
  'coast@0': 'Wide shot of the whole printed table. Title card.',
  'coast@5': 'Over green’s three face-down mission cards; a ring on each.',
  'build@0':
    'Green’s five modules drop face-down into their open bays, one by one; then the bay doors swing shut on their hinges.',
  'coast@10':
    'Last turn’s energy cubes lift off green’s base, tagged “Back to the supply”; then the caption moves on to step 2, the actions, and the move first.',
  'fire@0':
    'Arrows on green: the way it faces (retrograde), turning to prograde, beside a dashed prograde arrow. It drifts 8 sectors on ring 1, each numbered as it passes; crosses straight out to ring 2 (tagged “Ring 2”); then lands 2 sectors further, each tagged “+1 fuel”. Path drawn; readout of energy used and fuel.',
  'jump@0':
    'Green jumps the lane from black hole ring 5 to Gamma ring 4; path drawn; readout of energy used and fuel.',
  'dive@0':
    'At Gamma, facing arrows turn green from prograde to retrograde; it drifts 1 sector on the slow ring 4 (numbered), then crosses in 3 rings to ring 1 (tagged “Ring 1”). Path drawn; readout.',
  'scoop@0':
    'Green coasts 6 sectors on Gamma’s ring 1 with the scoop on, each sector numbered; “Scoop +3” tag on the base is off camera, the readout shows it. Path drawn.',
  'jump@10':
    'Green’s base: last turn’s cubes lift off (“Back to the supply”), then the engines’ 3, each rack’s 2 and the shields’ 1 land, each tagged with its subsystem and count. Then the check: the heat track (2 cubes) is ringed; each cube on the ship gets a numbered badge, 1 to 8, as a red heat cube drops onto the track: the track climbs 2 → 10, tagged “Heat +8”. Five come off the top one by one (“Dissipate −5”), then two more with the radiator ringed (“Radiator −2”). Three stay. The ledger fills in alongside.',
  'fire@10':
    'Dashed shot line from green to orange; the d10 is thrown and lands on 6; strip inset; orange’s hull die drops, tagged “Hull 2 → 0”; a wreck token flies from the pool to orange’s sector, tagged “Wreck”.',
  'fire@21': 'Second shot at purple; the d10 lands on 10; strip inset.',
  'launch@0':
    'Purple’s salvo token leaves purple’s sector, tagged “Salvo of 4”, and flies 3 steps; path drawn.',
  'intercept@0':
    'A shot line from purple to orange for the lasers; orange’s hull die drops, tagged “Hull 6 → 2”. The salvo rides and flies 3 more to orange; orange’s rack shoots all four down, the four rolls shown as dice.',
  'fire@28':
    'From the port side: the two racks’ bay doors swing open and both racks lift out onto the hull.',
  'respawn@0': 'Orange lifts from its wreck to its Home marker, tagged “Home”; path drawn.',
  'dock@0':
    'Facing arrows turn green to prograde; it drifts 6 sectors on Gamma ring 1 (numbered), crosses to ring 2 and phases 3 sectors (“+1 fuel” each) onto the station’s berth. Path drawn; readout.',
  'dock@10':
    'The Survey data token leaves green’s hold (“Survey data sold”); Gamma’s sale chip comes from the pool (“Gamma’s sale chip”); the hull die goes 8 → 10, tagged.',
  'dock@18': 'Green’s Survey card flips face-up, tagged “+1 point”.',
  'stations@0':
    'Gamma’s station moves 4 sectors round ring 2, carrying green, each sector numbered.',
  'stations@7': 'Wide shot. End card.',
}

const captionRules = {
  rotate: { energy: SUBSYSTEM_CONFIGS.rotation.minEnergy },
  rotateIn: { energy: SUBSYSTEM_CONFIGS.rotation.minEnergy },
  phase: { fuel: SECTOR_ADJUSTMENT_COST_PER_SECTOR },
}
const caption = c =>
  fill(X.captions[c.text], {
    points: POINTS,
    dissipation: DEFAULT_DISSIPATION_CAPACITY,
    radiator: RADIATOR_DISSIPATION,
    drift: STATION_DRIFT,
    ...captionRules[c.text],
    ...c.vars,
  })
/** The readout in the corner: each row from its first value to its last. */
const readout = st =>
  `Readout · ${X.status.ships[st.seat]}: ${st.rows
    .map(r => {
      const values = r.steps.map(s => s[1])
      return `${X.status[r.label].toLowerCase()} ${[...new Set(values)].join(' → ')}`
    })
    .join(', ')}`

const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
// A copy of the last one, never over an earlier copy: it may carry the designer's notes.
if (existsSync(join(OUT, 'storyboard.md')))
  copyFileSync(
    join(OUT, 'storyboard.md'),
    join(OUT, `storyboard-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.md`),
    fsConstants.COPYFILE_EXCL
  )
rmSync(join(OUT, 'stills'), { recursive: true, force: true })
mkdirSync(join(OUT, 'stills'), { recursive: true })
const grab = (t, name) =>
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-ss',
    t.toFixed(2),
    '-i',
    MP4,
    '-frames:v',
    '1',
    '-vf',
    'scale=960:-2',
    '-q:v',
    '4',
    join(OUT, 'stills', name),
  ])

const parts = T.map((m, i) => {
  const n = String(i + 1).padStart(2, '0')
  const end = m.start + m.dur
  const last = i === 0 || i === T.length - 1
  // Slides: once built. Demonstrations: a second after each caption appears.
  const times =
    m.slide || !m.captions?.length
      ? [end - 0.4]
      : m.captions.map(c => Math.min(m.start + c.at + 1.2, end - 0.2))
  const stills = times.map((t, j) => {
    const f = `${n}${times.length > 1 ? String.fromCharCode(97 + j) : ''}.jpg`
    grab(t, f)
    return `![${clock(t)}](stills/${f})`
  })
  const kind = m.slide ? 'Slide' : last ? 'Title' : 'Table'
  const topic = m.slide ?? m.topic ?? ''
  let words
  if (m.slide) words = slideWords[m.slide] ?? []
  else if (i === 0)
    words = [
      fill(X.hero.kicker, { min: MIN_PLAYERS, max: MAX_PLAYERS }),
      X.hero.title.join(' '),
      X.hero.motto,
      X.hero.line,
    ]
  else if (last) words = [X.hero.title.join(' '), X.hero.motto]
  else
    words = [
      ...(m.captions ?? []).map(caption),
      ...(m.status ? [readout(m.status)] : []),
      ...(m.roll ? [`Roll inset: ${m.roll}`] : []),
      ...(m.rolls ? [`Rolls: ${m.rolls.join(', ')}, ${X.roll.down}`] : []),
      ...(m.ledger
        ? [`Ledger: ${m.ledger.map(r => `${r.value} ${X.ledger[r.text] ?? r.text}`).join(' · ')}`]
        : []),
    ]
  const what = m.slide ? slideDiagram[m.slide] : (table[`${m.demo}@${m.vt}`] ?? '')
  return [
    `## ${n} · ${kind}${topic ? ` · ${topic}` : ''}`,
    '',
    `${clock(m.start)}–${clock(end)} · ${m.dur.toFixed(1)} s · voice key \`${m.say}\`${m.slide ? '' : ` · table \`${m.demo}@${m.vt}\``}`,
    '',
    stills.join('\n'),
    '',
    `**${m.slide ? 'On the slide' : 'On screen'}**`,
    '',
    ...words.map(w => `- ${w}`),
    '',
    `**${m.slide ? 'Diagram' : 'On the table'}**`,
    '',
    what,
    '',
    `**Voice** (${m.voice?.toFixed(1)} s)`,
    '',
    `> ${X.narration[m.say] ?? ''}`,
    '',
    '**Notes**',
    '',
    '- ',
    '',
  ].join('\n')
})

// `--voices=a,b`: one narration sentence, picked at random, in each of those Kokoro voices.
const VOICES = (process.argv.find(a => a.startsWith('--voices='))?.split('=')[1] ?? '')
  .split(',')
  .filter(Boolean)
let voices = ''
if (VOICES.length) {
  const sentences = Object.values(X.narration).flatMap(line =>
    line.split(/(?<=\.)\s+/).filter(s => s.split(' ').length >= 8)
  )
  const text = sentences[Math.floor(Math.random() * sentences.length)]
  const dir = join(OUT, 'voices')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const python = join(process.env.HOME, '.cache/di-tts/venv/bin/python')
  for (const voice of VOICES) {
    const lines = join(dir, `${voice}.json`)
    writeFileSync(lines, JSON.stringify([{ key: voice, text }]))
    execFileSync(python, [join(CAD, 'scripts/table/voice.py'), lines, dir, voice], {
      stdio: 'ignore',
    })
    rmSync(lines)
  }
  rmSync(join(dir, 'durations.json'), { force: true })
  voices = `## Pick a voice

> ${text}

${VOICES.map(v => `- **${v}**${v === 'af_heart' ? ' (the film’s)' : ''}: [${v}.wav](voices/${v}.wav)\n\n  <audio controls src="voices/${v}.wav"></audio>`).join('\n')}

`
}

const total = T[T.length - 1].start + T[T.length - 1].dur
writeFileSync(
  join(OUT, 'storyboard.md'),
  `# Explainer storyboard

The film in order: ${T.length} moments, ${clock(total)}. Each topic opens with a slide, then the printed table shows it with one caption at a time.

Edit anything in place: the words on screen, the voice lines, what the table or diagram should show. Add, delete or reorder moments. Put anything else under **Notes**.

Stills are frames from \`explainer.mp4\`.

${voices}${parts.join('\n')}`
)
console.log(join(OUT, 'storyboard.md'))
