// Render the printed table kit in play: three PNGs in cad/shots/table/.
//
//   cd cad && timeout 1800 node scripts/table/run.mjs [--seed=19 --round=21] [--views=seated,top,...] [--scan] [--web]
//
// Every camera in layout.ts by default; --web also writes a WebP of each to shots/table/web/.
//
// 1. state.mjs plays a headless 4-bot game with the engine (its source,
//    through scripts/ts-hooks.mjs) and keeps one round (--scan looks for the busiest).
// 2. layout.ts places every printed piece (cad/out STLs) for that round.
// 3. render.js draws it with three.js in headless Chromium, on the GPU when
//    WebGL starts there, else on SwiftShader.
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { chromium } from 'playwright'

const CAD = resolve(import.meta.dirname, '../..')
const ROOT = resolve(CAD, '..')
const OUT = join(CAD, 'shots/table')
const flag = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const web = process.argv.includes('--web')
const views = flag('views', '').split(',').filter(Boolean)

// 1. The game.
const stateArgs = process.argv.includes('--scan')
  ? ['--scan=40']
  : [`--seed=${flag('seed', '19')}`, `--round=${flag('round', '21')}`]
execFileSync(
  'node',
  ['--import', './scripts/ts-hooks.mjs', 'scripts/table/state.mjs', ...stateArgs],
  {
    stdio: 'inherit',
    cwd: CAD,
  }
)

// 2. The layout.
execFileSync(
  'node',
  [
    '--experimental-strip-types',
    '--no-warnings',
    '--import',
    './scripts/ts-hooks.mjs',
    'scripts/table/layout.ts',
  ],
  { stdio: 'inherit', cwd: CAD }
)

// 3. Serve the repo read-only and render.
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.stl': 'model/stl',
}
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
  const file = join(ROOT, path)
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${server.address().port}/cad/scripts/table/render.html`

const GPU = [
  '--use-angle=vulkan',
  '--enable-features=Vulkan',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--enable-unsafe-webgpu',
]
const SOFT = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

async function open(args, channel) {
  const browser = await chromium.launch({ channel, args: ['--no-sandbox', ...args] })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  page.on('pageerror', e => console.error('page:', e.message))
  page.on(
    'console',
    m => m.type() === 'error' && console.error('console:', m.text(), m.location()?.url ?? '')
  )
  await page.goto(url)
  await page.waitForFunction(() => document.title === 'ready' || window.failed, null, {
    timeout: 900_000,
  })
  const gpu = await page.evaluate(() => window.gpu)
  return { browser, page, gpu }
}

let session
try {
  try {
    session = await open(GPU, 'chromium')
    if (/swiftshader|llvmpipe/i.test(session.gpu ?? ''))
      throw new Error(`software renderer: ${session.gpu}`)
  } catch (e) {
    console.error(
      `GPU WebGL did not start (${e.message.split('\n')[0]}); falling back to SwiftShader`
    )
    await session?.browser.close()
    session = await open(SOFT)
  }
  console.log(`renderer: ${session.gpu}`)
  // --cams=file.json: extra shots, {name: {view, position, target, fov, ...}}, for checking pieces up close.
  const extra = flag('cams') ? JSON.parse(readFileSync(flag('cams'), 'utf8')) : {}
  const all = views.length
    ? views
    : Object.keys(JSON.parse(readFileSync(join(OUT, 'scene.json'), 'utf8')).cameras)
  const shots = [
    ...all.map(v => [v, v, null]),
    ...Object.entries(extra).map(([name, c]) => [name, c.view ?? 'seated', c]),
  ]
  if (web) mkdirSync(join(OUT, 'web'), { recursive: true })
  for (const [name, view, override] of shots) {
    const t = Date.now()
    const data = await session.page.evaluate(([v, o]) => window.renderView(v, o), [view, override])
    const file = join(OUT, `${name}.png`)
    writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'))
    if (web) execFileSync('magick', [file, '-quality', '86', join(OUT, 'web', `${name}.webp`)])
    console.log(`${file} (${((Date.now() - t) / 1000).toFixed(1)} s)`)
  }
} finally {
  await session?.browser.close()
  server.close()
}
