/**
 * The loadout cards are cut along their marks: every card has to be on the
 * page, clear of every other card and of every mark, the marks clear of the
 * margin no printer reaches, and the twelve presets on two pages of nine and
 * three.
 */
import { describe, expect, it } from 'vitest'
import { SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from '../card/cardStyles'
import { cropMarks, type Rect } from '../card/sheet'
import { LOADOUT_HEIGHT_MM, LOADOUT_WIDTH_MM, loadoutPages, loadoutSlots } from './sheet'

const UNPRINTABLE_MM = 5

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

const cards = (n: number) => Array.from({ length: n }, (_, i) => i)

describe('the loadout sheet', () => {
  it('centres the grid on the page', () => {
    const slots = loadoutSlots()
    const left = Math.min(...slots.map(s => s.x))
    const right = SHEET_WIDTH_MM - Math.max(...slots.map(s => s.x + s.width))
    const top = Math.min(...slots.map(s => s.y))
    const bottom = SHEET_HEIGHT_MM - Math.max(...slots.map(s => s.y + s.height))
    expect(left).toBeCloseTo(right)
    expect(top).toBeCloseTo(bottom)
  })

  it('cuts every card at the size of a mission card', () => {
    for (const slot of loadoutSlots()) {
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

  it.each([1, 3, 9])(
    'a page of %i draws marks at every corner, none on a card or in the margin',
    n => {
      const [page] = loadoutPages(cards(n))
      const marks = cropMarks(page)
      for (const face of page)
        for (const [x, y] of [
          [face.x, face.y],
          [face.x + face.width, face.y],
          [face.x, face.y + face.height],
          [face.x + face.width, face.y + face.height],
        ]) {
          const touching = marks.filter(
            m => Math.min(Math.hypot(m.x1 - x, m.y1 - y), Math.hypot(m.x2 - x, m.y2 - y)) < 1
          )
          expect(touching.length).toBeGreaterThanOrEqual(2)
        }
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
