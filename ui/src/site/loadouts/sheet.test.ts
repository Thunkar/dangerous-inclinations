/**
 * The loadout cards are cut along their marks: every card has to be on the
 * page, touching its neighbours and clear of every mark, every trim line
 * marked from the grid out to the margin no printer reaches, and the twelve presets on two pages of nine and
 * three.
 */
import { describe, expect, it } from 'vitest'
import { SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from '../card/cardStyles'
import { cropMarks, gridSlots, type Line, type Rect } from '../card/sheet'
import { LOADOUT_GRID, LOADOUT_HEIGHT_MM, LOADOUT_WIDTH_MM, loadoutPages } from './sheet'

const UNPRINTABLE_MM = 5

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

const cards = (n: number) => Array.from({ length: n }, (_, i) => i)

describe('the loadout sheet', () => {
  it('centres the grid on the page', () => {
    const slots = gridSlots(LOADOUT_GRID)
    const left = Math.min(...slots.map(s => s.x))
    const right = SHEET_WIDTH_MM - Math.max(...slots.map(s => s.x + s.width))
    const top = Math.min(...slots.map(s => s.y))
    const bottom = SHEET_HEIGHT_MM - Math.max(...slots.map(s => s.y + s.height))
    expect(left).toBeCloseTo(right)
    expect(top).toBeCloseTo(bottom)
  })

  it('cuts every card at the size of a mission card', () => {
    for (const slot of gridSlots(LOADOUT_GRID)) {
      expect(slot.width).toBe(LOADOUT_WIDTH_MM)
      expect(slot.height).toBe(LOADOUT_HEIGHT_MM)
    }
  })

  it.each([
    [1, [1]],
    [9, [9]],
    [10, [9, 1]],
    [12, [9, 3]],
    [18, [9, 9]],
  ])('%i cards print as pages of %j', (n, sizes) => {
    const pages = loadoutPages(cards(n))
    expect(pages.map(p => p.length)).toEqual(sizes)
    expect(pages.flat().map(p => p.card)).toEqual(cards(n))
  })

  it.each([1, 3, 9])('a page of %i keeps every card on the page and clear of the others', n => {
    const [page] = loadoutPages(cards(n))
    for (const face of page) {
      expect(face.x).toBeGreaterThanOrEqual(UNPRINTABLE_MM)
      expect(face.y).toBeGreaterThanOrEqual(UNPRINTABLE_MM)
      expect(face.x + face.width).toBeLessThanOrEqual(SHEET_WIDTH_MM - UNPRINTABLE_MM)
      expect(face.y + face.height).toBeLessThanOrEqual(SHEET_HEIGHT_MM - UNPRINTABLE_MM)
    }
    for (const [i, a] of page.entries())
      for (const b of page.slice(i + 1)) expect(overlaps(a, b)).toBe(false)
  })

  it('touches its cards, so one cut separates two', () => {
    const slots = gridSlots(LOADOUT_GRID)
    for (const [i, a] of slots.entries()) {
      const right = slots[i + 1]
      const below = slots[i + LOADOUT_GRID.columns]
      if (right && i % LOADOUT_GRID.columns !== LOADOUT_GRID.columns - 1)
        expect(right.x).toBeCloseTo(a.x + a.width)
      if (below) expect(below.y).toBeCloseTo(a.y + a.height)
    }
  })

  it.each([1, 3, 9])(
    'a page of %i marks every trim line from the cards to the margin, none on a card',
    n => {
      const [page] = loadoutPages(cards(n))
      const marks = cropMarks(page)
      const near = (a: number, b: number) => Math.abs(a - b) < 1
      const reaches = (m: Line, x: number, y: number) =>
        near(m.x1, x) && near(m.y1, y) ? 'inner' : near(m.x2, x) && near(m.y2, y) ? 'outer' : null
      const top = Math.min(...page.map(f => f.y))
      const bottom = Math.max(...page.map(f => f.y + f.height))
      const left = Math.min(...page.map(f => f.x))
      const right = Math.max(...page.map(f => f.x + f.width))
      // Every trim line is marked at both ends, each mark from the grid to the margin.
      for (const x of new Set(page.flatMap(f => [f.x, f.x + f.width]))) {
        expect(marks.some(m => reaches(m, x, top) && near(m.y2, UNPRINTABLE_MM))).toBe(true)
        expect(
          marks.some(m => reaches(m, x, bottom) && near(m.y2, SHEET_HEIGHT_MM - UNPRINTABLE_MM))
        ).toBe(true)
      }
      for (const y of new Set(page.flatMap(f => [f.y, f.y + f.height]))) {
        const rowLeft = Math.min(...page.filter(f => f.y <= y && y <= f.y + f.height).map(f => f.x))
        expect(marks.some(m => reaches(m, rowLeft, y) && near(m.x2, UNPRINTABLE_MM))).toBe(true)
      }
      expect(left).toBeGreaterThan(UNPRINTABLE_MM)
      expect(right).toBeLessThan(SHEET_WIDTH_MM - UNPRINTABLE_MM)
      const onFace = (x: number, y: number, f: Rect) =>
        x >= f.x - 0.1 && x <= f.x + f.width + 0.1 && y >= f.y - 0.1 && y <= f.y + f.height + 0.1
      for (const m of marks)
        for (const t of [0, 0.5, 1]) {
          const x = m.x1 + (m.x2 - m.x1) * t
          const y = m.y1 + (m.y2 - m.y1) * t
          for (const face of page) expect(onFace(x, y, face)).toBe(false)
          expect(x).toBeGreaterThanOrEqual(UNPRINTABLE_MM)
          expect(x).toBeLessThanOrEqual(SHEET_WIDTH_MM - UNPRINTABLE_MM)
          expect(y).toBeGreaterThanOrEqual(UNPRINTABLE_MM)
          expect(y).toBeLessThanOrEqual(SHEET_HEIGHT_MM - UNPRINTABLE_MM)
        }
    }
  )
})
