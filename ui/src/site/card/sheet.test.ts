/**
 * The printed sheet is cut along its marks and, printed on both sides, read
 * through the paper: every face has to be on the page, clear of every other
 * face and of every mark, and every back exactly behind its front.
 */
import { describe, expect, it } from 'vitest'
import { CARD_HEIGHT_MM, CARD_WIDTH_MM, SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from './cardStyles'
import { cropMarks, gridSlots, sheetPages, type PrintMode, type Rect } from './sheet'

const MODES: PrintMode[] = ['sheet', 'duplex-long', 'duplex-short']

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

describe('the print sheet', () => {
  it('centres the grid on the page', () => {
    const slots = gridSlots()
    const left = Math.min(...slots.map(s => s.x))
    const right = SHEET_WIDTH_MM - Math.max(...slots.map(s => s.x + CARD_WIDTH_MM))
    const top = Math.min(...slots.map(s => s.y))
    const bottom = SHEET_HEIGHT_MM - Math.max(...slots.map(s => s.y + CARD_HEIGHT_MM))
    expect(left).toBeCloseTo(right)
    expect(top).toBeCloseTo(bottom)
  })

  it.each([
    ['sheet', 1],
    ['duplex-long', 2],
    ['duplex-short', 2],
  ] as const)('%s prints %i page(s) of four faces', (mode, pages) => {
    const sheet = sheetPages(mode)
    expect(sheet).toHaveLength(pages)
    for (const page of sheet) expect(page).toHaveLength(4)
  })

  it('puts each card front beside its back on a one-sided sheet', () => {
    const [page] = sheetPages('sheet')
    expect(page.map(f => f.face)).toEqual(['front', 'back', 'front', 'back'])
  })

  it.each(MODES)('%s keeps every face on the page and clear of the others', mode => {
    for (const page of sheetPages(mode)) {
      for (const face of page) {
        expect(face.x).toBeGreaterThanOrEqual(0)
        expect(face.y).toBeGreaterThanOrEqual(0)
        expect(face.x + face.width).toBeLessThanOrEqual(SHEET_WIDTH_MM)
        expect(face.y + face.height).toBeLessThanOrEqual(SHEET_HEIGHT_MM)
      }
      for (const [i, a] of page.entries())
        for (const b of page.slice(i + 1)) expect(overlaps(a, b)).toBe(false)
    }
  })

  it.each(MODES)('%s draws marks at every corner and none on a face', mode => {
    for (const page of sheetPages(mode)) {
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
      // A mark is a line on a trim line, so 'on a face' includes a face's edge.
      const onFace = (x: number, y: number, f: Rect) =>
        x >= f.x - 0.1 && x <= f.x + f.width + 0.1 && y >= f.y - 0.1 && y <= f.y + f.height + 0.1
      for (const m of marks)
        for (const t of [0, 0.5, 1])
          for (const face of page)
            expect(onFace(m.x1 + (m.x2 - m.x1) * t, m.y1 + (m.y2 - m.y1) * t, face)).toBe(false)
    }
  })

  it.each([
    ['duplex-long', (f: Rect) => ({ x: SHEET_WIDTH_MM - f.x - f.width, y: f.y }), false],
    ['duplex-short', (f: Rect) => ({ x: f.x, y: SHEET_HEIGHT_MM - f.y - f.height }), true],
  ] as const)('%s puts every back behind its front', (mode, behind, rotated) => {
    const [fronts, backs] = sheetPages(mode)
    expect(fronts.every(f => f.face === 'front' && !f.rotated)).toBe(true)
    for (const [i, front] of fronts.entries()) {
      const back = backs[i]
      expect(back.face).toBe('back')
      expect(back.rotated).toBe(rotated)
      expect(back.x).toBeCloseTo(behind(front).x)
      expect(back.y).toBeCloseTo(behind(front).y)
    }
  })
})
