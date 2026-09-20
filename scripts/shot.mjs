/**
 * Drive the running app and photograph it. Not a test: a way to see a change.
 *   node scripts/shot.mjs <url-path> <out.png> [waitMs]
 * The dev server must be up (`yarn dev`). There is no canned page any more —
 * the `?showcase=1` bot game was removed — so a board is photographed at a
 * real table.
 *
 * `PLAYER_ID=<id>` seats the browser at one: the app reads the viewer off
 * `localStorage.playerId`, so that with `/?game=<id>` is how the board, the
 * turn column, the plan and the transport are photographed.
 */
import { chromium } from 'playwright'

const [path = '/', out = 'shot.png', wait = '6000'] =
  process.argv.slice(2)
const base = process.env.UI_URL ?? 'http://localhost:5173'
const playerId = process.env.PLAYER_ID

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } })
if (playerId) await context.addInitScript(id => localStorage.setItem('playerId', id), playerId)
const page = await context.newPage()
const problems = []
page.on('pageerror', e => problems.push(`pageerror: ${e.message}`))
page.on('console', m => m.type() === 'error' && problems.push(`console: ${m.text()}`))
await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(Number(wait))
await page.screenshot({ path: out })
for (const id of ['status-block', 'turn-log', 'route-planner', 'ship-state', 'heat-redline'])
  console.log(`${id}: ${await page.locator(`[data-testid="${id}"]`).count()}`)
const log = page.locator('[data-testid="turn-log"]')
if (await log.count())
  console.log('\n--- log tail ---\n' + (await log.innerText()).split('\n').slice(-14).join('\n'))
const status = page.locator('[data-testid="status-block"]')
if (await status.count()) console.log('\n--- status ---\n' + (await status.innerText()))
const ticks = page.locator('button[aria-label^="Replay"]')
if (await ticks.count()) {
  console.log('\n--- transport ---')
  for (const tick of await ticks.all()) console.log('  ' + (await tick.getAttribute('aria-label')))
}
console.log(problems.length ? '\n!! ' + problems.slice(0, 5).join('\n!! ') : '\nno page errors')
await browser.close()
