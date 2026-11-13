/**
 * A seat's view as text an agent can read: the rules that matter this turn,
 * the ship, the cards, what is known about the others, what is legal now,
 * and what happened since the seat last acted. Everything comes from the
 * GameView (so an agent sees exactly what a human at that seat sees) and the
 * same pure helpers the UI uses.
 */
import { fill, orList } from '../utils/fill.ts'
import type { GameEvent } from '../models/events.ts'
import type { Cargo, Mission } from '../models/missions.ts'
import {
  DEFAULT_POINTS_TO_WIN,
  MISSION_POINTS,
  PRIMARIES_PER_PLAYER,
  SCAN_SECTOR_RANGE,
  SECONDARIES_PER_PLAYER,
  SURVEY_RING,
  TANKER_FUEL,
  dataAboard,
} from '../models/missions.ts'
import type { SubsystemType, WeaponStats, WeaponType } from '../models/subsystems.ts'
import {
  INTERCEPT_HEAT,
  INTERCEPT_ROLL,
  SHIELD_POINTS_PER_ENERGY,
  SUBSYSTEM_CONFIGS,
  getMissileStats,
  getSubsystemConfig,
  interceptsPerRack,
  shieldPointsPerEnergyOf,
} from '../models/subsystems.ts'
import {
  D10_FACES,
  DEFAULT_DISSIPATION_CAPACITY,
  MAX_HEAT,
  MAX_REACTION_MASS,
} from '../models/game.ts'
import type { RingConfig } from '../models/game.ts'
import {
  BLACKHOLE_RINGS,
  DEPLOYMENT_GAP,
  HOME_RINGS,
  PLANET_RINGS,
  STATION_DRIFT,
  STATION_RING,
  TRANSFER_ARC_LENGTH,
  getWellName,
} from '../models/gravityWells.ts'
import {
  BURN_COSTS,
  BURN_INTENSITIES,
  COMPRESSED_JUMP_MASS,
  MAX_SECTOR_ADJUSTMENT,
  MIN_FORWARD_MOVEMENT,
  SECTOR_ADJUSTMENT_COST_PER_SECTOR,
  WELL_TRANSFER_COSTS,
} from '../models/rings.ts'
import type { GameView, PlayerView } from '../game/view.ts'
import { describeEvent, describeMission } from '../game/describe.ts'
import { getDissipationCapacity, lowestCriticalFace } from '../game/ship.ts'
import { rollToResult } from '../game/damage.ts'
import { AGENT_RULES } from '../text/agentRules.ts'
import { AGENT_INTENT } from '../text/agentIntent.ts'
import { seatOptions } from './options.ts'
import { isMooredAt } from '../game/stations.ts'

/** Every face of the d10 the game rolls. */
const DIE_FACES = Array.from({ length: D10_FACES }, (_, i) => i + 1)

/** A weapon's stats and a subsystem's cubes, read from the configs when asked. */
const weapon = (t: WeaponType) => SUBSYSTEM_CONFIGS[t].weaponStats as Required<WeaponStats>
const cubes = (t: SubsystemType) => SUBSYSTEM_CONFIGS[t].minEnergy

const pos = (p: { wellId: string; ring: number; sector: number }) =>
  `${getWellName(p.wellId as never)} R${p.ring} S${p.sector}`

/**
 * The rules an agent needs at hand, in the words of RULES.md, kept short.
 *
 * Built when it is asked for, not at module load: the numbers in it are the
 * game's constants, and a copy frozen into a top-level string would go stale
 * the first time one of them moved.
 *
 * @param pointsToWin what this table plays to (`view.pointsToWin`).
 */
export function agentRulesDigest(pointsToWin: number = DEFAULT_POINTS_TO_WIN): string {
  // Read here, not at module load, so a `--tiles=` override reaches them.
  const missile = getMissileStats()
  const shields = SUBSYSTEM_CONFIGS.shields
  const speeds = (rings: readonly RingConfig[]) => rings.map(r => r.velocity).join('/')
  const faces = (from: number, to: number) => (from === to ? `${from}` : `${from}-${to}`)
  // The d10's faces as `rollToResult` reads them, bare and with a powered sensor.
  const crit = lowestCriticalFace([])
  const sensorCrit = lowestCriticalFace([
    { type: 'sensor_array', allocatedEnergy: cubes('sensor_array'), isBroken: false },
  ])
  const miss = DIE_FACES.filter(f => rollToResult(f) === 'miss')
  const firstHit = miss.length + 1
  const T = AGENT_RULES
  return [
    T.heading,
    fill(T.win, {
      pointsToWin,
      primaryPoints: MISSION_POINTS.destroy_ship,
      secondaryPoints: MISSION_POINTS.survey,
      primaries: PRIMARIES_PER_PLAYER,
      secondaries: SECONDARIES_PER_PLAYER,
      handPoints:
        PRIMARIES_PER_PLAYER * MISSION_POINTS.destroy_ship +
        SECONDARIES_PER_PLAYER * MISSION_POINTS.survey,
    }),
    T.turn,
    fill(T.drift, {
      blackHoleSpeeds: speeds(BLACKHOLE_RINGS),
      planetSpeeds: speeds(PLANET_RINGS),
      scoop: cubes('scoop'),
    }),
    fill(T.energy, {
      railgun: cubes('railgun'),
      plasma: cubes('plasma_cannon'),
      disruptor: cubes('disruptor'),
      laser: cubes('laser'),
      rack: cubes('ballistic_rack'),
      missiles: cubes('missiles'),
      sensor: cubes('sensor_array'),
      scoop: cubes('scoop'),
      thrusters: cubes('rotation'),
      jumpEnergy: WELL_TRANSFER_COSTS.energy,
      shieldMin: shields.minEnergy,
      shieldMax: shields.maxEnergy,
    }),
    T.hold,
    fill(T.burn, {
      burns: BURN_INTENSITIES.map(i =>
        fill(T.burnCost, {
          intensity: i,
          rings: BURN_COSTS[i].rings,
          fuel: BURN_COSTS[i].mass,
          energy: BURN_COSTS[i].energy,
        })
      ).join('; '),
      phaseCost: SECTOR_ADJUSTMENT_COST_PER_SECTOR,
      minForward: MIN_FORWARD_MOVEMENT,
      maxPhase: MAX_SECTOR_ADJUSTMENT,
    }),
    fill(T.jump, {
      jumpEnergy: WELL_TRANSFER_COSTS.energy,
      jumpFuel: WELL_TRANSFER_COSTS.mass,
      compressedFuel: COMPRESSED_JUMP_MASS,
      phaseCost: SECTOR_ADJUSTMENT_COST_PER_SECTOR,
      arcLength: TRANSFER_ARC_LENGTH,
      compressorPays: WELL_TRANSFER_COSTS.mass - COMPRESSED_JUMP_MASS,
    }),
    fill(T.heat, {
      maxHeat: MAX_HEAT,
      dissipation: DEFAULT_DISSIPATION_CAPACITY,
      radiatorBonus: SUBSYSTEM_CONFIGS.radiator.passiveEffect?.dissipationBonus ?? 0,
    }),
    fill(T.shields, {
      shieldMin: shields.minEnergy,
      shieldMax: shields.maxEnergy,
      perCube: SHIELD_POINTS_PER_ENERGY,
    }),
    fill(T.weapons, {
      railgunDamage: weapon('railgun').damage,
      railgunSectors: weapon('railgun').sectorRange,
      compensateFuel: BURN_COSTS.soft.mass,
      laserDamage: weapon('laser').damage,
      laserRings: weapon('laser').ringRange,
      laserSectors: weapon('laser').sectorRange,
      rackDamage: weapon('ballistic_rack').damage,
      rackRings: weapon('ballistic_rack').ringRange,
      rackSectors: weapon('ballistic_rack').sectorRange,
      rack: cubes('ballistic_rack'),
      intercepts: interceptsPerRack(),
      interceptRoll: INTERCEPT_ROLL,
      interceptHeat: INTERCEPT_HEAT,
      overflow: interceptsPerRack() + 1,
      missileDamage: missile.damage,
      magazine: missile.maxAmmo,
      missileSteps: missile.stepsPerMove,
      missileTurns: missile.maxMoves,
    }),
    fill(T.plasma, {
      plasma: cubes('plasma_cannon'),
      plasmaDamage: weapon('plasma_cannon').damage,
      plasmaRings: weapon('plasma_cannon').ringRange,
      plasmaSectors: weapon('plasma_cannon').sectorRange,
      plasmaPerCube: shieldPointsPerEnergyOf(weapon('plasma_cannon')),
      perCube: SHIELD_POINTS_PER_ENERGY,
    }),
    fill(T.disruptor, {
      disruptor: cubes('disruptor'),
      disruptorRings: weapon('disruptor').ringRange,
      disruptorSectors: weapon('disruptor').sectorRange,
      miss: faces(1, miss.length),
      disruptorHits: faces(firstHit, D10_FACES),
    }),
    T.pointBlank,
    fill(T.firstRound, { homeRings: orList(HOME_RINGS), deploymentGap: DEPLOYMENT_GAP }),
    fill(T.hitRoll, {
      miss: faces(1, miss.length),
      hits: faces(firstHit, crit - 1),
      crits: faces(crit, D10_FACES),
      sensorCrits: faces(sensorCrit, D10_FACES),
      railgun: cubes('railgun'),
      shieldMin: shields.minEnergy,
      shieldMax: shields.maxEnergy,
    }),
    T.repair,
    fill(T.docking, { stationRing: STATION_RING, stationDrift: STATION_DRIFT }),
    fill(T.secondaries, {
      secondaryPoints: MISSION_POINTS.survey,
      surveyRing: SURVEY_RING,
      tankerFuel: TANKER_FUEL,
    }),
    fill(T.intercept, { scanSectors: SCAN_SECTOR_RANGE }),
    T.destroyed,
  ].join('\n')
}

function missionLine(m: Mission, cargo: readonly Cargo[], name: (id: string) => string): string {
  const head = describeMission(m, name)
  if (m.isCompleted) return `${head} · DONE`
  switch (m.type) {
    case 'deliver_cargo':
      return `${head} · load the crate at ${getWellName(m.pickupPlanetId as never)}'s station, deliver at ${getWellName(m.deliveryPlanetId as never)}'s`
    case 'intercept_transmission':
      return `${head} · ${
        dataAboard({ cargo }, m)
          ? `data aboard: file it at ${getWellName(m.deliveryPlanetId as never)}'s station`
          : `scan them first (your ring, ahead of you within ${SCAN_SECTOR_RANGE} sectors, or your sector, with a sensor array aboard), then file at ${getWellName(m.deliveryPlanetId as never)}'s station`
      }`
    case 'survey':
      return `${head} · ${dataAboard({ cargo }, m) ? 'data aboard: dock at any station' : `while on BH R${SURVEY_RING}, name "survey" to take the data`}`
    case 'piracy':
      return `${head} · share the sector of an undocked ship carrying cargo at any point of your turn and name one item with "seize", then sell it at ANY station`
    case 'tanker':
      return `${head} · arrive at a station with ${TANKER_FUEL}+ fuel and pump ${TANKER_FUEL} in as its sale`
    case 'escort':
      return m.markedPlayerId
        ? `${head} · your marker is on ${name(m.markedPlayerId)}: done the next time they sell or pump fuel while you are in their well; back to you if either of you dies`
        : `${head} · marker in hand: you MAY put it on an undocked rival carrying cargo on your ring at any point of your turn (you not moored either); name it with "escort", or no marker goes on`
    case 'salvage':
      return `${head} · while on a wreck's sector, name it with "salvage" to take its black box (data), then file it at ANY station`
    case 'destroy_ship':
      return `${head} · worth ${MISSION_POINTS.destroy_ship} points`
  }
}

function subsystemLine(p: PlayerView): string {
  const slots = p.slots.map(s => {
    const what = s.type ? `${s.type}${s.knownVia === 'scanned' ? ' (scanned)' : ''}` : 'face-down'
    const broken = s.isBroken ? ' BROKEN' : ''
    const ammo = s.ammo === null ? '' : ` ammo ${s.ammo}`
    return `${s.id}=${what}${broken}${ammo}${s.allocatedEnergy ? ` [${s.allocatedEnergy}]` : ''}`
  })
  const fixed = p.fixed.map(
    f =>
      `${f.type}${f.isBroken ? ' BROKEN' : ''}${f.allocatedEnergy ? ` [${f.allocatedEnergy}]` : ''}`
  )
  return [...fixed, ...slots].join(', ')
}

/**
 * The whole picture for `view.me`. `events` is the filtered history the
 * server returns with the view; only the last `sinceTurn` turns are shown.
 */
export function describeViewForAgent(
  view: GameView,
  events: GameEvent[] = [],
  options: { recentTurns?: number; includeRules?: boolean } = {}
): string {
  const me = view.me
  if (!me) throw new Error('A spectator has no seat to describe')
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? id
  const out: string[] = []
  if (options.includeRules !== false) out.push(agentRulesDigest(view.pointsToWin), '')

  const active = view.players.find(p => p.id === view.activePlayerId)
  out.push(
    `GAME: turn ${view.turn}, phase ${view.phase}${view.finalRound ? ' (FINAL ROUND)' : ''}. ${
      active ? `${active.name}${active.isMe ? ' (YOU)' : ''} to act.` : ''
    } You are ${me.name} (${me.id}), seat ${view.players.findIndex(p => p.id === me.id) + 1} of ${view.players.length}.`
  )
  const ship = me.ship
  out.push('')
  out.push(
    `YOUR SHIP: ${pos(ship)}, facing ${ship.facing}. Hull ${ship.hitPoints}/${ship.maxHitPoints}. Heat ${ship.heat.currentHeat}/${MAX_HEAT} carried, dissipates ${getDissipationCapacity(ship.subsystems)}. Fuel ${ship.reactionMass}/${MAX_REACTION_MASS}.${
      me.recovering
        ? ' UNTOUCHABLE: you came back at Home last turn, and this turn is a first round of your own. Nobody touches you until it is over, and you fire at nobody and scan nobody on it.'
        : ''
    }`
  )
  out.push(
    `YOUR SUBSYSTEMS: ${ship.subsystems
      .map(s => {
        const c = getSubsystemConfig(s.type)
        const extra = s.type === 'missiles' ? ` ammo ${s.ammo ?? 0}` : ''
        return `${s.id}=${s.type}${s.isBroken ? ' BROKEN' : ''} [min ${c.minEnergy}, max ${c.maxEnergy}${s.allocatedEnergy ? `, holding ${s.allocatedEnergy} from last turn` : ''}]${extra}${s.isRevealed ? ' (face-up)' : ''}`
      })
      .join('; ')}. Cubes held from last turn come off when your turn starts.`
  )
  out.push(`YOUR POINTS: ${me.points}/${view.pointsToWin}. CARDS:`)
  for (const m of me.missions) out.push(`  - ${missionLine(m, me.cargo, name)}`)
  if (me.cargo.length)
    out.push(
      `CARGO: ${me.cargo
        .map(
          c =>
            `${c.id} ${c.kind}${c.isPickedUp ? '' : ' (not loaded yet)'} for ${c.deliveryPlanetId === 'any' ? 'any station' : getWellName(c.deliveryPlanetId as never)}`
        )
        .join('; ')}`
    )
  out.push(
    `SOLD AT (these stations buy nothing more from you): ${me.soldAt.map(id => getWellName(id as never)).join(', ') || 'none yet'}.`
  )
  out.push(`HOME: ${me.home ? pos(me.home) : 'not placed'}.`)

  out.push('', 'OPPONENTS:')
  for (const p of view.players.filter(x => !x.isMe)) {
    const s = p.ship
    if (!s) {
      out.push(`  - ${p.name} (${p.id}): not deployed`)
      continue
    }
    out.push(
      `  - ${p.name} (${p.id}): ${s.isDestroyed ? 'DESTROYED (respawning)' : `${pos(s)} facing ${s.facing}`}, hull ${s.hitPoints}/${s.maxHitPoints}, heat ${s.heat}, ${p.points} pts, fuel ${s.fuel}, hold [${p.hold.map(i => `${i.cargoId} ${i.kind}`).join(', ') || 'empty'}], sold at [${p.soldAt.map(id => getWellName(id as never)).join(', ') || '-'}]. Subsystems: ${subsystemLine(p)}. Completed: ${
        p.completedMissions.map(m => describeMission(m, name)).join('; ') || 'none'
      }.${p.escortedBy.length ? ` Escort markers on them: ${p.escortedBy.map(name).join(', ')}.` : ''}${p.recovering ? ' UNTOUCHABLE until their next turn is over: no shot, missile, scan, seizure or Escort marker reaches them, and they fire at, scan and seize from nobody on it.' : ''}${!s.isDestroyed && isMooredAt(view.stations, s) ? ' MOORED: no shot or missile reaches them, and they fire at nobody while they hold the berth.' : ''}`
    )
  }
  out.push(
    '',
    `STATIONS (planet ring ${STATION_RING}, drift ${STATION_DRIFT}/round): ${view.stations.map(s => `${getWellName(s.planetId as never)} S${s.sector}`).join(', ')}.`
  )
  const mine = view.players.find(p => p.isMe)
  if (mine?.escortedBy.length)
    out.push(`ESCORT MARKERS ON YOU: ${mine.escortedBy.map(name).join(', ')}.`)
  out.push(
    `WRECKS (drift with the stations once a round): ${view.wrecks.map(w => pos(w)).join(', ') || 'none'}.`
  )
  if (view.missiles.length)
    out.push(
      `MISSILES IN FLIGHT: ${view.missiles
        .map(
          m => `${name(m.ownerId)} -> ${name(m.targetId)} at ${pos(m)} (${m.movesMade} moves made)`
        )
        .join('; ')}`
    )

  if (view.phase === 'active' && active?.isMe) {
    const o = seatOptions(view)
    out.push('', 'LEGAL THIS TURN:')
    out.push(
      o.moored
        ? `  Moored at a station: a coast holds this berth (no drift) and the station carries you at the end of the round; burn to cast off. You docked on arrival: holding the berth repairs nothing more${o.scoopGain ? `, though the scoop, for ${cubes('scoop')} cubes now, would gain ${o.scoopGain} fuel when the station moves` : ''}.`
        : `  Drift: coast moves you ${o.velocity} sectors forward${o.scoopGain ? ` (scoop would gain ${o.scoopGain} fuel for ${cubes('scoop')} cubes)` : ''}.`
    )
    out.push(
      `  Burns: ${
        o.burns
          .map(
            b =>
              `${b.intensity} ${b.facing === 'prograde' ? 'out' : 'in'} to R${b.toRing} (${b.engineEnergy} cube(s) on engines, ${b.fuel} fuel${b.needsRotation ? ', rotate first' : ''}; phase ${b.adjustment.min}..+${b.adjustment.max})`
          )
          .join('; ') || 'none from here'
      }.`
    )
    out.push(
      `  Jump: ${
        o.jump
          ? `to ${pos(o.jump.destination)} (engines ${o.jump.energy}, ${o.jump.fuel} fuel; phase ${o.jump.adjustment.min}..${o.jump.adjustment.max > 0 ? '+' : ''}${o.jump.adjustment.max} sectors inside the arrival arc, ${o.jump.phasingFuel} fuel each)`
          : 'no lane departs from this sector'
      }.`
    )
    for (const w of o.weapons)
      out.push(
        `  ${w.weapon} (${w.type}, ${w.damage} dmg, ${w.energy} cubes)${w.ready ? '' : ` NOT READY: ${w.reason}`}: in range now [${w.targetsNow.map(name).join(', ') || '-'}], after a coast [${w.targetsAfterCoast.map(name).join(', ') || '-'}].`
      )
    out.push(
      `  Scan targets (sensor array aboard; your ring, ahead of you within ${SCAN_SECTOR_RANGE} sectors, or your sector): [${o.scanTargets.map(name).join(', ') || '-'}]; after a rotation [${o.scanTargetsIfRotated.map(name).join(', ') || '-'}]. A moored ship is never listed: a berth is safe from scans.`
    )
    out.push(
      `  Power (works until your next turn; a subsystem you power cannot also fire or scan): ${
        o.power.map(p => `${p.id} (${p.type}) ${p.amounts.join(' or ')}`).join('; ') ||
        'nothing aboard'
      }.`
    )
    if (o.repair.broken.length > 0)
      out.push(
        `  Broken: ${o.repair.broken.join(', ')}. ${
          o.repair.possibleThisTurn
            ? 'Repair one with {"repair":"<id>"} IF this turn makes no heat at all (plain coast, no scoop, no shot, no scan, nothing powered).'
            : 'No repair this turn: you are already carrying heat.'
        }`
      )
    if (o.escort)
      out.push(
        `  Escort: ${o.escort.markersInHand} marker(s) in hand. Add {"escort":["<playerId>"]} to put one on a carrier on your ring (same well, any sector, undocked, carrying cargo): before the move if it can take it now, otherwise right after the move, ahead of your seizures and shots; nothing is placed unless named. Now: [${o.escort.carriersNow.map(name).join(', ') || '-'}]. After a plain coast: [${o.escort.carriersAfterCoast.map(name).join(', ') || '-'}].`
      )
    if (o.survey)
      out.push(
        `  Survey: a card wants data. Add {"survey":true} to take it on BH ring ${SURVEY_RING}: before the move if you are on it now, otherwise right after the move. Now: ${o.survey.now ? 'yes' : 'no'}. After a plain coast: ${o.survey.afterCoast ? 'yes' : 'no'}.`
      )
    if (o.salvage)
      out.push(
        `  Salvage: a card wants a black box. Add {"salvage":"<wreckId>"} to take it from a wreck in your sector: before the move if it is there now, otherwise right after the move. Or {"salvage":true}: the first wreck in your sector, after your shots if none is there yet, so a ship they destroy in your sector gives you its black box this turn. Now: [${o.salvage.wrecksNow.join(', ') || '-'}]. After a plain coast: [${o.salvage.wrecksAfterCoast.join(', ') || '-'}].`
      )
    if (o.seize)
      out.push(
        `  Seize: ${o.seize.freeCards} Piracy card(s) free. Add {"seize":[{"victim":"<playerId>","cargoId":"<id>"}]} to take that item off a ship in your sector: before the move if it shares your sector now, otherwise right after the move, ahead of your shots; nothing is taken unless named. Now: [${o.seize.itemsNow.map(i => `${name(i.victimId)} ${i.kind} ${i.cargoId}`).join(', ') || '-'}]. After a plain coast: [${o.seize.itemsAfterCoast.map(i => `${name(i.victimId)} ${i.kind} ${i.cargoId}`).join(', ') || '-'}].`
      )
    out.push(`  Heat budget before damage: ${o.heatBudget}.`)
  }

  const recent = options.recentTurns ?? 1
  const since = view.turn - recent
  const shown = events.filter(e => e.turn >= since && e.type !== 'subsystem_powered')
  if (shown.length) {
    out.push('', `RECENT EVENTS (turn ${Math.max(1, since)}+):`)
    for (const e of shown.slice(-40)) out.push(`  T${e.turn} ${describeEvent(e, name)}`)
  }
  return out.join('\n')
}

/**
 * How an agent describes a turn: the intent JSON the builder accepts. Built
 * when it is asked for, like the rules digest, so its numbers are the game's
 * constants as they stand.
 */
export function agentIntentGuide(): string {
  const T = AGENT_INTENT
  const shields = SUBSYSTEM_CONFIGS.shields
  return [
    T.heading,
    T.open,
    T.power.code +
      fill(T.power.note, {
        shieldMin: shields.minEnergy,
        shieldMax: shields.maxEnergy,
        rack: cubes('ballistic_rack'),
        sensor: cubes('sensor_array'),
      }),
    T.rotate.code + fill(T.rotate.note, { thrusters: cubes('rotation') }),
    T.move,
    T.jump,
    T.fire,
    T.scan,
    T.repair,
    T.sell,
    T.escort,
    T.survey.code + fill(T.survey.note, { surveyRing: SURVEY_RING }),
    T.salvage,
    T.seize,
    T.close,
    T.how,
  ].join('\n')
}
