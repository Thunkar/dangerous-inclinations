/**
 * A loadout card: one of the bots' twelve presets, printed so a first-time
 * player can pick it up and build a known ship.
 *
 * The poster cut, 63x88mm: the preset's name up a stripe of its role's family
 * ink, the insignia top right, the bow (F1) large with its name beside it,
 * the four side slots in two columns (port P1 over P2, starboard S1 over S2,
 * as `MOUNTS` names them), and in the black bar the missions it is kept with
 * and its one line. Everything but the line and the role's name is read from
 * the engine: the preset's slots, which secondaries ask for it, the
 * subsystems' and the missions' names. The words are in `text/loadoutCards.ts`.
 */
import { Fragment } from 'react'
import {
  BOT_PRESET_LOADOUTS,
  MISSION_CARDS,
  MISSION_FAMILY,
  PRESET_NAMES,
  getSubsystemConfig,
  presetRole,
  presetSecondaries,
} from '@dangerous-inclinations/engine'
import type { BotPresetId, MissionType, SubsystemType } from '@dangerous-inclinations/engine'
import { FAMILY_INK } from '../../design/press'
import { SUBSYSTEM_PATHS } from '../../art/subsystemArt'
import { MissionGlyph } from '../../components/common/MissionGlyph'
import { MOUNTS } from '../../ships/mounts'
import { LOADOUT_CARDS as T } from '../../text/loadoutCards'
import { Insignia } from './Insignia'
import { PRIMARY, SIGNATURE, roleInk } from './presets'

const BOW = MOUNTS.find(m => m.group === 'forward')!
const SIDE = MOUNTS.filter(m => m.group === 'side')
/** Port is side 0 and 1, starboard 2 and 3: the grid reads across, P1 S1 then P2 S2. */
const FLANK_ORDER = [0, 2, 1, 3]

/** A slot's subsystem mark; a slot left empty is a bare tile. */
function Mark({ type, size }: { type: SubsystemType | null; size: number }) {
  if (!type) return null
  return (
    <svg
      className="di-lo-mark"
      viewBox="0 0 64 64"
      fill="currentColor"
      style={{ width: `${size}mm`, height: `${size}mm` }}
      aria-hidden="true"
      focusable="false"
    >
      <path fillRule="evenodd" d={SUBSYSTEM_PATHS[type]} />
    </svg>
  )
}

const nameOf = (type: SubsystemType | null) => (type ? getSubsystemConfig(type).name : '')

function Mission({ type }: { type: MissionType }) {
  return (
    <span className="di-lo-mission">
      <i style={{ background: FAMILY_INK[MISSION_FAMILY[type]] }}>
        <MissionGlyph type={type} size={16} />
      </i>
      {MISSION_CARDS[type].name}
    </span>
  )
}

export function LoadoutCard({ id }: { id: BotPresetId }) {
  const role = presetRole(id)
  const ink = roleInk(role)
  const loadout = BOT_PRESET_LOADOUTS[id]
  const bow = loadout.forwardSlots[0]
  const secondaries = presetSecondaries(id)
  return (
    <div className="di-lo-card" role="group" aria-label={PRESET_NAMES[id]}>
      <div className="di-lo-stripe" style={{ background: ink }}>
        <div className="di-lo-name">{PRESET_NAMES[id]}</div>
      </div>
      <Insignia className="di-lo-insignia" role={role} mark={SIGNATURE[id]} ink={ink} />

      <div className="di-lo-col">
        <div className="di-lo-eyebrow" style={{ color: ink }}>
          {T.roles[role]}
        </div>
        <div className="di-lo-bow">
          <div className="di-lo-bowtile">
            <span className="di-lo-chip">{BOW.short}</span>
            <Mark type={bow} size={12} />
          </div>
          <div className="di-lo-bowname">
            {nameOf(bow)}
            <div className="di-lo-eyebrow">{T.bow}</div>
          </div>
        </div>
        <div className="di-lo-flanks">
          <div className="di-lo-eyebrow">{T.port}</div>
          <div className="di-lo-eyebrow">{T.starboard}</div>
          {FLANK_ORDER.map(i => {
            const type = loadout.sideSlots[SIDE[i].index]
            return (
              <div key={SIDE[i].id} className="di-lo-cell">
                <div className="di-lo-tile">
                  <span className="di-lo-chip">{SIDE[i].short}</span>
                  <Mark type={type} size={7.6} />
                </div>
                <div className="di-lo-label">{nameOf(type)}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="di-lo-bar">
        <div className="di-lo-keep">
          <Mission type={PRIMARY[role]} />
          <span className="di-lo-mission">+</span>
          {secondaries.length === 0 ? (
            <span className="di-lo-mission">{T.any}</span>
          ) : (
            secondaries.map((kind, i) => (
              <Fragment key={kind}>
                {i > 0 && <span className="di-lo-mission di-lo-or">{T.or}</span>}
                <Mission type={kind} />
              </Fragment>
            ))
          )}
        </div>
        <div className="di-lo-line">{T.lines[id]}</div>
      </div>
    </div>
  )
}
