/**
 * One page, four prints: the player card, the loadout cards, the range cards
 * and the mission decks, each a section whose id is its name. Ctrl+P prints
 * the player card. A section's button marks the body `data-printing="<name>"`
 * for the length of its print, and `PRINT_CSS` shows only that section's
 * pages while the mark is set.
 */

export type PrintName = 'card' | 'loadouts' | 'ranges' | 'missions'

/** The prints that only their own button reaches. */
const ON_REQUEST: PrintName[] = ['loadouts', 'ranges', 'missions']

/** The fonts must be in before the sheets are laid out for the printer. */
export function printAs(name: PrintName) {
  void document.fonts.ready.then(() => {
    document.body.dataset.printing = name
    const done = () => {
      delete document.body.dataset.printing
    }
    window.addEventListener('afterprint', done, { once: true })
    window.print()
  })
}

export const PRINT_CSS = `
@media print {
  /* One print at a time: the player card's, unless another section's button asked. */
${ON_REQUEST.map(
  name => `  #${name} { display: none !important; }
  body[data-printing="${name}"] #${name} { display: block !important; }
  body[data-printing="${name}"] #card { display: none !important; }`
).join('\n')}
}
`
