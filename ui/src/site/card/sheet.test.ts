/**
 * The player card and the subsystems card print two faces a page, on their
 * sides and touching, and are cut along the marks on the page of fronts.
 * Every face has to be on the page with its bleed inside a laser printer's
 * reach, every mark clear of the bleed, the content at the same inset on both
 * faces, and every back behind its front and turned so that the card, turned
 * over on its long side, reads upright.
 */
import { describe, expect, it } from 'vitest'
import {
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  CLEAR_MM,
  FRAME_BLEED_MM,
  FRAME_MM,
  INSIDE_MM,
  MARK_FROM_MM,
  frameStyle,
} from '../print/frame'
import { CARD_SCALE, PLAYER_PAD, playerBox } from './cardStyles'
import { SX_BAND_MM } from '../subsystems/sheet'
import { SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from './cardStyles'
import {
  behindLongEdge,
  behindShortEdge,
  cardPages,
  cropMarks,
  gridSlots,
  type Face,
  type PrintMode,
  type Rect,
  type Turn,
} from './sheet'

const MODES: PrintMode[] = ['sheet', 'duplex-long', 'duplex-short']
/** How far in from the paper's edge a laser printer reaches. */
const PRINTER_REACH_MM = 4

const mm = (v: unknown) => parseFloat(String(v))

describe('the frame', () => {
  it.each(['front', 'back'] as Face[])('fills the %s face inside its band', face => {
    const style = frameStyle(face)
    expect(mm(String(style.border).split(' ')[0])).toBe(FRAME_MM[face])
    expect(style.padding).toBeUndefined()
    expect(INSIDE_MM[face].width).toBeCloseTo(CARD_WIDTH_MM - 2 * FRAME_MM[face])
    expect(INSIDE_MM[face].height).toBeCloseTo(CARD_HEIGHT_MM - 2 * FRAME_MM[face])
  })

  it('gives the back a wider band than the front, for the duplex shift', () => {
    expect(FRAME_MM.back).toBeGreaterThan(FRAME_MM.front)
  })

  it.each(['front', 'back'] as Face[])(
    "fits the player card's %s to its band, its words clear of it",
    face => {
      expect(playerBox(face).width * CARD_SCALE).toBeCloseTo(INSIDE_MM[face].width)
      expect(playerBox(face).height * CARD_SCALE).toBeCloseTo(INSIDE_MM[face].height)
      expect(PLAYER_PAD.x).toBeGreaterThanOrEqual(CLEAR_MM)
      expect(PLAYER_PAD.bottom).toBeGreaterThanOrEqual(CLEAR_MM)
    }
  )

  it("sets the subsystems card's grid at least the back's band in, on both faces", () => {
    expect(SX_BAND_MM).toBeGreaterThanOrEqual(FRAME_MM.back)
  })
})

describe('the print sheet', () => {
  it.each([
    ['sheet', [['front', 'back']]],
    [
      'duplex-long',
      [
        ['front', 'front'],
        ['back', 'back'],
      ],
    ],
    [
      'duplex-short',
      [
        ['front', 'front'],
        ['back', 'back'],
      ],
    ],
  ] as const)('%s: the faces on each page', (mode, faces) => {
    expect(cardPages(mode).map(page => page.map(f => f.face))).toEqual(faces)
  })

  it.each(MODES)('%s: two faces on their sides, one above the other, touching', mode => {
    for (const [a, b] of cardPages(mode)) {
      for (const face of [a, b]) {
        expect([90, 270]).toContain(face.turn)
        expect(face.width).toBe(CARD_HEIGHT_MM)
        expect(face.height).toBe(CARD_WIDTH_MM)
      }
      const [top, bottom] = a.y < b.y ? [a, b] : [b, a]
      expect(bottom.x).toBeCloseTo(top.x)
      expect(bottom.y).toBeCloseTo(top.y + top.height)
    }
  })

  it.each(MODES)('%s: the block centred, its bleed inside the printer’s reach', mode => {
    for (const page of cardPages(mode)) {
      const left = Math.min(...page.map(f => f.x)) - FRAME_BLEED_MM
      const top = Math.min(...page.map(f => f.y)) - FRAME_BLEED_MM
      const right = Math.max(...page.map(f => f.x + f.width)) + FRAME_BLEED_MM
      const bottom = Math.max(...page.map(f => f.y + f.height)) + FRAME_BLEED_MM
      expect(left).toBeCloseTo(SHEET_WIDTH_MM - right)
      expect(top).toBeCloseTo(SHEET_HEIGHT_MM - bottom)
      expect(left).toBeGreaterThanOrEqual(PRINTER_REACH_MM)
      expect(top).toBeGreaterThanOrEqual(PRINTER_REACH_MM)
    }
  })

  // A card's up and right on the page for each turn. Turned over on its own long
  // side a card keeps its up and swaps its right for its left; seen through the
  // paper, as the page's flip mirrors it, a back must show exactly that.
  const UP: Record<Turn, [number, number]> = { 0: [0, -1], 90: [1, 0], 180: [0, 1], 270: [-1, 0] }
  const RIGHT: Record<Turn, [number, number]> = {
    0: [1, 0],
    90: [0, 1],
    180: [-1, 0],
    270: [0, -1],
  }
  /** The page turned over about its vertical axis, or its horizontal one; `+ 0` makes a -0 a 0. */
  const FLIPS = {
    'duplex-long': {
      point: (x: number, y: number) => [SHEET_WIDTH_MM - x, y],
      dir: ([x, y]: [number, number]) => [-x + 0, y + 0],
    },
    'duplex-short': {
      point: (x: number, y: number) => [x, SHEET_HEIGHT_MM - y],
      dir: ([x, y]: [number, number]) => [x + 0, -y + 0],
    },
  }

  it.each(['duplex-long', 'duplex-short'] as const)(
    '%s: every back behind its own front, upright when the card turns over',
    mode => {
      const flip = FLIPS[mode]
      const [fronts, backs] = cardPages(mode)
      for (const [i, front] of fronts.entries()) {
        const back = backs[i]
        const [cx, cy] = flip.point(back.x + back.width / 2, back.y + back.height / 2)
        expect(cx).toBeCloseTo(front.x + front.width / 2)
        expect(cy).toBeCloseTo(front.y + front.height / 2)
        expect(flip.dir(UP[back.turn])).toEqual(UP[front.turn])
        expect(flip.dir(RIGHT[back.turn])).toEqual(RIGHT[front.turn].map(v => -v + 0))
      }
    }
  )

  it.each(MODES)('%s: cut lines on every trim line, outside the bleed, in reach', mode => {
    const page = cardPages(mode)[0]
    expect(page.every(f => f.face === 'front') || mode === 'sheet').toBe(true)
    const marks = cropMarks(page, MARK_FROM_MM)
    const [top, bottom] = page[0].y < page[1].y ? page : [page[1], page[0]]
    const x0 = top.x
    const x1 = top.x + top.width
    // Every trim line across the block, the shared one too, and both sides of it.
    for (const y of [top.y, bottom.y, bottom.y + bottom.height])
      for (const x of [x0, x1]) {
        const on = marks.filter(
          m =>
            Math.abs(m.y1 - y) < 1e-6 &&
            Math.abs(m.y2 - y) < 1e-6 &&
            Math.abs(Math.hypot(m.x1 - x, m.y1 - y) - MARK_FROM_MM) < 1e-6
        )
        expect(on).toHaveLength(1)
      }
    for (const x of [x0, x1])
      for (const y of [top.y, bottom.y + bottom.height]) {
        const on = marks.filter(
          m =>
            Math.abs(m.x1 - x) < 1e-6 &&
            Math.abs(m.x2 - x) < 1e-6 &&
            Math.abs(Math.hypot(m.x1 - x, m.y1 - y) - MARK_FROM_MM) < 1e-6
        )
        expect(on).toHaveLength(1)
      }
    const bled = (x: number, y: number) =>
      page.some(
        f =>
          x > f.x - FRAME_BLEED_MM &&
          x < f.x + f.width + FRAME_BLEED_MM &&
          y > f.y - FRAME_BLEED_MM &&
          y < f.y + f.height + FRAME_BLEED_MM
      )
    for (const m of marks)
      for (const t of [0, 0.5, 1]) {
        const x = m.x1 + (m.x2 - m.x1) * t
        const y = m.y1 + (m.y2 - m.y1) * t
        expect(bled(x, y)).toBe(false)
        expect(x).toBeGreaterThanOrEqual(PRINTER_REACH_MM)
        expect(x).toBeLessThanOrEqual(SHEET_WIDTH_MM - PRINTER_REACH_MM)
        expect(y).toBeGreaterThanOrEqual(PRINTER_REACH_MM)
        expect(y).toBeLessThanOrEqual(SHEET_HEIGHT_MM - PRINTER_REACH_MM)
      }
  })

  it('centres a grid of the decks on the page', () => {
    const slots = gridSlots({ columns: 3, rows: 3, width: 63, height: 88, gutter: 0 })
    const left = Math.min(...slots.map(s => s.x))
    const right = SHEET_WIDTH_MM - Math.max(...slots.map(s => s.x + s.width))
    const top = Math.min(...slots.map(s => s.y))
    const bottom = SHEET_HEIGHT_MM - Math.max(...slots.map(s => s.y + s.height))
    expect(left).toBeCloseTo(right)
    expect(top).toBeCloseTo(bottom)
  })

  it.each([
    ['long', behindLongEdge, (f: Rect) => ({ x: SHEET_WIDTH_MM - f.x - f.width, y: f.y })],
    ['short', behindShortEdge, (f: Rect) => ({ x: f.x, y: SHEET_HEIGHT_MM - f.y - f.height })],
  ] as const)('a %s-edge flip puts the back at its front’s mirror', (_, behind, mirror) => {
    const front = { x: 10, y: 20, width: 30, height: 40, turn: 0 as const }
    const back = behind(front)
    expect(back.x).toBeCloseTo(mirror(front).x)
    expect(back.y).toBeCloseTo(mirror(front).y)
  })

  /** Through the paper, as the flip mirrors it; `+ 0` makes a -0 a 0. */
  const longMirror = ([x, y]: [number, number]) => [-x + 0, y + 0]
  const shortMirror = ([x, y]: [number, number]) => [x + 0, -y + 0]
  it.each([
    ['long', behindLongEdge, longMirror],
    ['short', behindShortEdge, shortMirror],
  ] as const)('a %s-edge flip turns every back upright behind its front', (_, behind, mirror) => {
    for (const turn of [0, 90, 180, 270] as const) {
      const back = behind({ x: 10, y: 20, width: 30, height: 40, turn })
      expect(mirror(UP[back.turn])).toEqual(UP[turn])
      expect(mirror(RIGHT[back.turn])).toEqual(RIGHT[turn].map(v => -v + 0))
    }
  })
})
