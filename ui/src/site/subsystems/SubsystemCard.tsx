/**
 * The subsystems card: fourteen tiles on the two faces of one card, each in
 * its family's ink, the weapons and the sensor on the front and the systems
 * on the back, and on each face the title and the key to the marks in the
 * cell the tiles leave. The drawing carries the rule: a fan of the rings a
 * weapon or the sensor reaches, or a picture of what the subsystem does. A
 * tile's name band carries its numbers as marks in its corner, a line under
 * it the slot and the one thing that turns it face up, and one short
 * sentence says what the drawing cannot show. Sizes are in `sheet.ts`, words
 * in `text/subsystemCard.ts`.
 */
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { TRACED_PATHS } from '../../art/paths'
import { BAND_ANGLE, PRESS } from '../../design/press'
import { MiniFan, fanFor } from './fan'
import { FacingFans, isFacingType, labelColumn } from './facing'
import { SUBSYSTEM_CARD } from '../../text/subsystemCard'
import {
  NUM,
  TARGETING,
  UTILITY,
  damageOf,
  energyOf,
  inkOf,
  nameOf,
  slotOf,
  type TargetingType,
  type UtilityType,
} from './facts'
import { Compressed, Die, Energy, Fuel, Heat, compressedWidth, markWidth } from '../marks'
import { DamageIcon, Face, FaceUpIcon, MISSILE_PATH, Mark, MissileIcon, say } from './parts'
import { Pictogram } from './pictograms'
import { PrintScale } from '../print/hairline'
import { SX_COLS, SX_GAP_MM, SX_ROWS, SX_SCALE, SX_TILE_H_MM, SX_TILE_W_MM, TILE } from './sheet'

const T = SUBSYSTEM_CARD.title

/** Every drawing is the same box: a fan on its side, twice as wide as it is tall. */
const FAN = fanFor(TILE.draw)
/** A tile's body inside its border and padding. */
const INNER_W = SX_TILE_W_MM - 2 * TILE.border - 2 * TILE.pad.x
/** The stacked fans' box at most: each fan 13mm high. */
const FACING_MAX = 26.6
/** The stacked fans take the height under the line, up to the size that leaves their labels room. */
const FACING_H = Math.min(
  FACING_MAX,
  SX_TILE_H_MM - TILE.border - TILE.band - TILE.pad.top - TILE.pad.bottom - TILE.line - TILE.gap
)

const isTargeting = (type: SubsystemType): type is TargetingType =>
  (TARGETING as readonly SubsystemType[]).includes(type)

/** The number marks' type size, points: the shared marks (`../marks`) scale with it. */
const PT = 8

/** One of the shared marks (`../marks`) set inline, in an svg sized to it. */
function Shared({
  kind,
  value,
  type,
  red,
  pt = PT,
}: {
  kind: 'energy' | 'fuel' | 'heat' | 'die'
  value?: string | number
  type?: SubsystemType
  red?: boolean
  pt?: number
}) {
  const cap = pt * 0.3528
  const side = cap * 1.5 * (kind === 'die' ? 1.08 : 1)
  const w = markWidth(kind, value, pt) + 0.3
  const h = side + 0.2
  // The marks centre their picture 0.36 of a capital above the baseline.
  const y = h / 2 + cap * 0.36
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: `${w}mm`, height: `${h}mm`, display: 'block', overflow: 'visible' }}
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'energy' && <Energy x={0.1} y={y} value={value} size={pt} type={type} />}
      {kind === 'fuel' && <Fuel x={0.1} y={y} value={value} size={pt} />}
      {kind === 'heat' && <Heat x={0.1} y={y} value={value} size={pt} />}
      {kind === 'die' && <Die x={0.1} y={y} value={value} size={pt} red={red} />}
    </svg>
  )
}

/** What the engines add to a fold, at the foot of the jump drive's tile: their energy and a jump's fuel, which a compressor cuts. */
function FoldEngines() {
  const cap = PT * 0.3528
  const h = cap * 1.5 + 0.4
  const y = h / 2 + cap * 0.36
  const engines = markWidth('energy', NUM.foldEngines, PT)
  const fuel = markWidth('fuel', NUM.jump, PT)
  const at = engines + 0.9 + fuel + 3.2
  const w = at + compressedWidth(NUM.compressed, PT) + 0.4
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: `${w}mm`, height: `${h}mm`, display: 'block', overflow: 'visible' }}
      aria-hidden="true"
      focusable="false"
    >
      <Energy x={0.1} y={y} type="engines" value={NUM.foldEngines} size={PT} />
      <Fuel x={engines + 0.9} y={y} value={NUM.jump} size={PT} />
      <Compressed x={at} y={y} from={NUM.jump} to={NUM.compressed} size={PT} />
    </svg>
  )
}

/** The band's numbers: their type size, points, and capital height, mm. */
const BAND_PT = 7
const BAND_CAP = BAND_PT * 0.3528
/** The gap between two marks in the band, mm. */
const MARK_GAP = 2.2
/** Damage and a missile are drawn this many mm square. */
const SMALL = 2.6

type BandMark =
  | { kind: 'energy'; value: string | number; type: SubsystemType }
  | { kind: 'fuel'; value: string | number }
  | { kind: 'damage' | 'missile'; value: string | number }

/** What a tile's band carries, in order: energy, damage, fuel and what is particular to it. */
function bandMarks(type: SubsystemType): BandMark[] {
  if (type === 'jump_drive')
    return [
      { kind: 'energy', type, value: NUM.foldDrive },
      { kind: 'fuel', value: NUM.foldDriveFuel },
    ]
  const marks: BandMark[] = [{ kind: 'energy', type, value: energyOf(type) }]
  const damage = damageOf(type)
  if (damage !== undefined) marks.push({ kind: 'damage', value: damage })
  if (type === 'engines') marks.push({ kind: 'fuel', value: NUM.burnFuel })
  if (type === 'missiles') marks.push({ kind: 'missile', value: NUM.ammo })
  return marks
}

/** A number in the marks' face, on the shared baseline. */
function Figure({ x, y, value }: { x: number; y: number; value: string | number }) {
  return (
    <text
      x={x}
      y={y}
      fontFamily="var(--di-display)"
      fontWeight={700}
      fontSize={BAND_CAP}
      fill={PRESS.ink}
    >
      {value}
    </text>
  )
}

/**
 * The band's marks in one svg, every number on one baseline and every
 * picture centred on the numbers' capitals, as `../marks` sets them.
 */
function BandStrip({ type }: { type: SubsystemType }) {
  const items = bandMarks(type)
  // As tall as a die, the tallest of the shared marks.
  const h = BAND_CAP * 1.5 * 1.08 + 0.2
  const y = h / 2 + BAND_CAP * 0.36
  const mid = y - BAND_CAP * 0.36
  const placed: Array<{ x: number; mark: BandMark }> = []
  let x = 0.1
  for (const mark of items) {
    placed.push({ x, mark })
    const chars = String(mark.value).length
    x +=
      (mark.kind === 'damage' || mark.kind === 'missile'
        ? SMALL + 0.7 + chars * BAND_CAP * 0.52
        : markWidth(mark.kind, mark.value, BAND_PT)) + MARK_GAP
  }
  const w = x - MARK_GAP + 0.3
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: `${w}mm`, height: `${h}mm`, display: 'block', overflow: 'visible' }}
      aria-hidden="true"
      focusable="false"
    >
      {placed.map(({ x, mark }, i) => {
        switch (mark.kind) {
          case 'energy':
            return <Energy key={i} x={x} y={y} value={mark.value} size={BAND_PT} type={mark.type} />
          case 'fuel':
            return <Fuel key={i} x={x} y={y} value={mark.value} size={BAND_PT} />
          case 'damage':
            return (
              <g key={i}>
                <path
                  d={TRACED_PATHS.damage}
                  transform={`translate(${x} ${mid - SMALL / 2}) scale(${SMALL / 64})`}
                  fill={PRESS.ink}
                  fillRule="evenodd"
                />
                <Figure x={x + SMALL + 0.7} y={y} value={mark.value} />
              </g>
            )
          case 'missile':
            return (
              <g key={i}>
                <path
                  d={MISSILE_PATH}
                  transform={`translate(${x} ${mid - SMALL / 2}) scale(${SMALL / 10})`}
                  fill={PRESS.ink}
                />
                <Figure x={x + SMALL + 0.7} y={y} value={mark.value} />
              </g>
            )
        }
      })}
    </svg>
  )
}

/** The rack's answer to missiles, set in the fan's empty corner: how many it rolls at, and the roll. */
function Intercepts() {
  return (
    <span className="sx-chip sx-corner">
      {Array.from({ length: NUM.intercepts }, (_, i) => (
        <MissileIcon key={i} size={2.1} />
      ))}
      <Shared kind="die" value={`${NUM.roll}+`} />
    </span>
  )
}

/** What answering missiles costs the rack, set in the fan's other empty corner. */
function InterceptHeat() {
  return (
    <span className="sx-chip sx-corner sx-corner-right">
      <Shared kind="heat" value={NUM.interceptHeat} />
    </span>
  )
}

function Tile({ type }: { type: TargetingType | UtilityType }) {
  const ink = inkOf(type)
  const faceUp = SUBSYSTEM_CARD.faceUp[type]
  const sentence = SUBSYSTEM_CARD.sentences[type]
  // The jump drive gives the foot of its tile to the engines' share of a fold.
  const drawH = type === 'jump_drive' ? TILE.draw - 4.6 : TILE.draw
  return (
    <div className="sx-tile">
      {/* The band is the tile's top edge; the numbers sit in its corner. */}
      <div className="sx-band" style={{ background: ink }}>
        <Mark type={type} size={3.6} />
        <div className="sx-name">{nameOf(type)}</div>
        {/* The tile's border carried up round the numbers: top, right and bottom. */}
        <div
          className="sx-numbers"
          style={{ border: `${TILE.border}mm solid ${ink}`, borderLeft: 0 }}
        >
          <BandStrip type={type} />
        </div>
      </div>
      <div className="sx-tilebody" style={{ borderColor: ink }}>
        <div className="sx-line">
          <span className="sx-slot">{slotOf(type)}</span>
          {faceUp && (
            <span className="sx-faceup">
              <FaceUpIcon size={2.2} />
              {faceUp}
            </span>
          )}
        </div>
        {isFacingType(type) ? (
          <div className="sx-facing">
            <FacingFans type={type} ink={ink} w={INNER_W} h={FACING_H} />
            <div
              className="sx-sentence sx-aside"
              style={{ width: `${labelColumn(INNER_W, FACING_H)}mm` }}
            >
              {say(sentence)}
            </div>
          </div>
        ) : (
          <>
            <div className="sx-draw" style={{ height: `${drawH}mm` }}>
              {type === 'ballistic_rack' && <Intercepts />}
              {type === 'ballistic_rack' && <InterceptHeat />}
              {/* The sensor's critical faces, in the fan's empty corner, as the rack's marks are. */}
              {type === 'sensor_array' && (
                <span className="sx-chip sx-corner">
                  <Shared kind="die" value={NUM.critRange} red />
                </span>
              )}
              {isTargeting(type) ? (
                <MiniFan type={type} size={FAN} ink={ink} />
              ) : (
                <Pictogram type={type} ink={ink} w={2 * drawH} h={drawH} />
              )}
            </div>
            {type === 'jump_drive' && <FoldEngines />}
            <div className="sx-sentence">{say(sentence)}</div>
          </>
        )}
      </div>
    </div>
  )
}

function TitleTile() {
  return (
    <div className="sx-titletile">
      <div className="sx-wedge" style={{ transform: `skewX(${-BAND_ANGLE}deg)` }} />
      <div className="sx-title">{T.title}</div>
      <div className="sx-sub">{T.sub}</div>
      <div className="sx-key">
        <span>
          <Shared kind="energy" />
          {T.energy}
        </span>
        <span>
          <DamageIcon size={2.6} />
          {T.damage}
        </span>
        <span>
          <Shared kind="fuel" />
          {T.fuel}
        </span>
        <span>
          <Shared kind="heat" />
          {T.heat}
        </span>
        <span>
          <Shared kind="die" />
          {T.roll}
        </span>
        <span>
          <Shared kind="die" red />
          {T.crit}
        </span>
        <span>
          <FaceUpIcon size={2.6} />
          {T.faceUp}
        </span>
      </div>
    </div>
  )
}

/** A face: the title cell, then its seven tiles, row by row, zoomed into the frame's ink. */
function SubsystemFace({ tiles }: { tiles: ReadonlyArray<TargetingType | UtilityType> }) {
  return (
    <Face>
      {/* Zoom, not a transform: a transformed box keeps its unscaled size in print layout. */}
      <div
        className="sx-grid"
        style={{
          zoom: SX_SCALE,
          gap: `${SX_GAP_MM / SX_SCALE}mm`,
          gridTemplateColumns: `repeat(${SX_COLS}, ${SX_TILE_W_MM}mm)`,
          gridTemplateRows: `repeat(${SX_ROWS}, ${SX_TILE_H_MM}mm)`,
          color: PRESS.ink,
        }}
      >
        <PrintScale.Provider value={SX_SCALE}>
          <TitleTile />
          {tiles.map(t => (
            <Tile key={t} type={t} />
          ))}
        </PrintScale.Provider>
      </div>
    </Face>
  )
}

/** The front: the weapons and the sensor. */
export const SubsystemFront = () => <SubsystemFace tiles={TARGETING} />

/** The back: the systems. */
export const SubsystemBack = () => <SubsystemFace tiles={UTILITY} />
