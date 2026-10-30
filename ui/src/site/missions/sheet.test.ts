/**
 * The mission decks are printed on both sides and drawn face-down: every
 * pile has to come out whole, each page of fronts followed by its backs,
 * every back exactly behind its front for the printer's flip, and every card
 * that counts seats named the way the game names it.
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_PLAYERS,
  buildPrimaryDeck,
  buildSecondaryDeck,
  describeMissionRule,
} from '@dangerous-inclinations/engine'
import { SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from '../card/cardStyles'
import { cropMarks, type Rect } from '../card/sheet'
import { MISSION_DECK } from '../../text/missionDeck'
import { PILES, PILE_POINTS, nameOf } from './decks'
import { MISSION_HEIGHT_MM, MISSION_WIDTH_MM, deckPages, type Flip } from './sheet'

const FLIPS: Flip[] = ['long', 'short']
const cards = (n: number) => Array.from({ length: n }, (_, i) => i)

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

describe('the mission piles', () => {
  it.each([
    ['primary', buildPrimaryDeck(MAX_PLAYERS).length],
    ['secondary', buildSecondaryDeck().length],
  ] as const)('the %s pile prints every card of the engine’s deck (%i)', (pile, size) => {
    expect(PILES[pile]).toHaveLength(size)
    expect(new Set(PILES[pile].map(m => m.id)).size).toBe(size)
  })

  it.each([
    ['primary', 2],
    ['secondary', 1],
  ] as const)('every %s card is worth %i', (pile, points) => {
    expect(PILE_POINTS[pile]).toBe(points)
  })

  it.each(Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 1))(
    'a card counting %i seats names that seat in words',
    offset => {
      const deck = buildPrimaryDeck(MAX_PLAYERS)
      const printed = PILES.primary.filter((_, i) => {
        const card = deck[i]
        return 'targetOffset' in card && card.targetOffset === offset
      })
      expect(printed.length).toBeGreaterThan(0)
      for (const mission of printed)
        expect(describeMissionRule(mission, nameOf)).toContain(MISSION_DECK.rivals[offset])
    }
  )
})

describe('the mission deck sheet', () => {
  it.each([
    [1, [1, 1]],
    [9, [9, 9]],
    [10, [9, 9, 1, 1]],
    [20, [9, 9, 9, 9, 2, 2]],
  ])('%i cards print as pages of %j, fronts then backs', (n, sizes) => {
    for (const flip of FLIPS) {
      const pages = deckPages(cards(n), flip)
      expect(pages.map(p => p.length)).toEqual(sizes)
      expect(pages.map(p => p[0].face)).toEqual(sizes.map((_, i) => (i % 2 ? 'back' : 'front')))
      expect(pages.filter((_, i) => i % 2 === 0).flatMap(p => p.map(c => c.card))).toEqual(cards(n))
    }
  })

  it.each([
    ['long', (f: Rect) => ({ x: SHEET_WIDTH_MM - f.x - f.width, y: f.y }), false],
    ['short', (f: Rect) => ({ x: f.x, y: SHEET_HEIGHT_MM - f.y - f.height }), true],
  ] as const)('a %s-edge flip puts every back behind its front', (flip, behind, rotated) => {
    const pages = deckPages(cards(20), flip)
    for (let p = 0; p < pages.length; p += 2) {
      const [fronts, backs] = [pages[p], pages[p + 1]]
      expect(backs).toHaveLength(fronts.length)
      for (const [i, front] of fronts.entries()) {
        const back = backs[i]
        expect(front.face).toBe('front')
        expect(front.rotated).toBe(false)
        expect(back.face).toBe('back')
        expect(back.card).toBe(front.card)
        expect(back.rotated).toBe(rotated)
        expect(back.width).toBe(MISSION_WIDTH_MM)
        expect(back.height).toBe(MISSION_HEIGHT_MM)
        expect(back.x).toBeCloseTo(behind(front).x)
        expect(back.y).toBeCloseTo(behind(front).y)
      }
    }
  })

  it.each(FLIPS)(
    'a %s-edge flip keeps every card on the page, clear of the others and the marks',
    flip => {
      for (const page of deckPages(cards(9), flip)) {
        for (const face of page) {
          expect(face.x).toBeGreaterThanOrEqual(0)
          expect(face.y).toBeGreaterThanOrEqual(0)
          expect(face.x + face.width).toBeLessThanOrEqual(SHEET_WIDTH_MM)
          expect(face.y + face.height).toBeLessThanOrEqual(SHEET_HEIGHT_MM)
        }
        for (const [i, a] of page.entries())
          for (const b of page.slice(i + 1)) expect(overlaps(a, b)).toBe(false)
        const onFace = (x: number, y: number, f: Rect) =>
          x >= f.x - 0.1 && x <= f.x + f.width + 0.1 && y >= f.y - 0.1 && y <= f.y + f.height + 0.1
        for (const m of cropMarks(page))
          for (const t of [0, 0.5, 1])
            for (const face of page)
              expect(onFace(m.x1 + (m.x2 - m.x1) * t, m.y1 + (m.y2 - m.y1) * t, face)).toBe(false)
      }
    }
  )
})
