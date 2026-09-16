import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BOT_LOADOUT_TEMPLATES,
  INSTALLABLE_SUBSYSTEMS,
  SUBSYSTEM_CONFIGS,
  calculateShipStatsFromLoadout,
  canInstallInSlot,
  validateLoadout,
  type BotArchetype,
} from '@dangerous-inclinations/engine'
import {
  MODULE_NOTES,
  MOUNTS,
  STORAGE_KEY,
  initialConfig,
  moduleAt,
  parseConfig,
  setModule,
  type MountId,
  type WorkshopConfig,
} from './config'
import { MiniaturePreview, Viewer, type CameraView, type ViewerHandle } from './Viewer'
import { SubsystemGlyph as Glyph } from '../../ships/SubsystemGlyph'
import './workshop.css'

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Slider({
  label,
  value,
  min,
  max,
  step = 0.05,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format?: (n: number) => string
  onChange: (n: number) => void
}) {
  return (
    <label className="slider-field">
      <span>
        {label}
        <output>{format ? format(value) : `${Math.round(value * 100)}%`}</output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function SectionTitle({ number, children }: { number: string; children: ReactNode }) {
  return (
    <div className="section-title">
      <span>{number}</span>
      {children}
    </div>
  )
}

function Workshop() {
  const [config, setConfig] = useState(initialConfig)
  const [selected, setSelected] = useState<MountId>('forward-0')
  const [tab, setTab] = useState<'Loadout' | 'Hull' | 'Finish'>('Loadout')
  const [exploded, setExploded] = useState(0)
  const [labels, setLabels] = useState(true)
  const [concealed, setConcealed] = useState(false)
  const [turntable, setTurntable] = useState(false)
  const [view, setView] = useState<CameraView>('Perspective')
  const [reset, setReset] = useState(0)
  const [message, setMessage] = useState('Design saved in this browser.')
  const [exporting, setExporting] = useState(false)
  const viewer = useRef<ViewerHandle | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const mount = MOUNTS.find(m => m.id === selected)!
  const type = moduleAt(config, selected)
  const stats = calculateShipStatsFromLoadout(config.loadout)
  const validation = validateLoadout(config.loadout)
  const filled = [...config.loadout.forwardSlots, ...config.loadout.sideSlots].filter(
    Boolean
  ).length
  const patch = (changes: Partial<WorkshopConfig>) =>
    setConfig(previous => ({ ...previous, ...changes }))

  useEffect(() => {
    const save = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
      } catch {
        setMessage('Browser storage is unavailable. Save a design file to keep your changes.')
      }
    }, 150)
    // Consume shared links once; a refresh should restore subsequent edits.
    if (window.location.hash.startsWith('#design='))
      history.replaceState(null, '', window.location.pathname + window.location.search)
    return () => clearTimeout(save)
  }, [config])

  function preset(id: BotArchetype) {
    patch({ loadout: structuredClone(BOT_LOADOUT_TEMPLATES[id]) })
    setMessage(`${id[0].toUpperCase() + id.slice(1)} loadout fitted.`)
  }
  async function exportGlb() {
    if (!viewer.current) return
    setExporting(true)
    try {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
      const data = await new GLTFExporter().parseAsync(viewer.current.model, { binary: true })
      download(
        new Blob([data as ArrayBuffer], { type: 'model/gltf-binary' }),
        'corvette-concept.glb'
      )
      setMessage('GLB exported with the current assembly and finish.')
    } catch (error) {
      setMessage(`Export failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    } finally {
      setExporting(false)
    }
  }
  async function importDesign(f: File | undefined) {
    if (!f) return
    try {
      if (f.size > 100_000) throw new Error('Design files must be smaller than 100 KB.')
      const next = parseConfig(JSON.parse(await f.text()))
      setConfig(next)
      setMessage('Design loaded.')
      setReset(n => n + 1)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read this design.')
    }
  }
  async function copyLink() {
    const url = new URL(window.location.href)
    url.hash = new URLSearchParams({ design: JSON.stringify(config) }).toString()
    try {
      await navigator.clipboard.writeText(url.href)
      setMessage('Design link copied. Open it on this same running workshop.')
    } catch {
      setMessage('Clipboard unavailable. Use Save design to share this iteration.')
    }
  }

  return (
    <div className="shipyard">
      <header className="masthead">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor">
            <path d="m16 3 10 22-10-5-10 5zM16 3v17M9 28h14" strokeWidth="1.5" />
          </svg>
        </div>
        <div className="brand">
          <span>DANGEROUS INCLINATIONS</span>
          <strong>
            MODULAR CORVETTE <i>/</i> SHIPYARD
          </strong>
        </div>
        <span className="prototype-badge">
          <span /> DESIGN STUDY 01
        </span>
        <div className="header-actions">
          <button onClick={() => file.current?.click()}>Open design</button>
          <button
            className="primary"
            onClick={() => {
              download(
                new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }),
                'corvette-design.json'
              )
              setMessage('Design saved as JSON. Use Open design to continue later.')
            }}
          >
            Save design <span aria-hidden="true">↗</span>
          </button>
        </div>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={e => {
            void importDesign(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </header>

      <main className="workspace">
        <section className="viewport" aria-label="Interactive 3D ship preview">
          <div className="scene">
            <Viewer
              config={config}
              selected={selected}
              onSelect={id => {
                setSelected(id)
                setTab('Loadout')
              }}
              exploded={exploded}
              labels={labels}
              concealed={concealed}
              turntable={turntable}
              view={view}
              reset={reset}
              handleRef={viewer}
            />
          </div>
          <div className="viewport-heading">
            <p className="eyebrow">MODULAR CORVETTE / K–07</p>
            <h1>Built for the burn.</h1>
            <p>Heavy armor. Hard points. No wasted space.</p>
          </div>
          <div className="view-tools" aria-label="Camera views">
            {(['Perspective', 'Top', 'Broadside', 'Engines'] as CameraView[]).map(v => (
              <button
                key={v}
                className={view === v ? 'active' : ''}
                aria-pressed={view === v}
                onClick={() => {
                  setView(v)
                  setReset(n => n + 1)
                  setTurntable(false)
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="orientation-note">
            <span>+X / BOW</span>
            <span>−X / DRIVE</span>
          </div>
          <div className="miniature-card">
            <div className="miniature">
              <MiniaturePreview config={config} concealed={concealed} />
            </div>
            <div>
              <span className="eyebrow">TABLETOP CHECK</span>
              <strong>96 px silhouette</strong>
              <small>Fixed scale · top view</small>
            </div>
          </div>
          <div className="scene-footer">
            <div className="assembly-control">
              <button
                className={exploded === 0 ? 'active' : ''}
                aria-pressed={exploded === 0}
                onClick={() => setExploded(0)}
              >
                Assembled
              </button>
              <button
                className={exploded > 0 ? 'active' : ''}
                aria-pressed={exploded > 0}
                onClick={() => setExploded(exploded > 0 ? 0 : 1)}
              >
                Exploded
              </button>
              <input
                type="range"
                aria-label="Module separation"
                min="0"
                max="1"
                step="0.01"
                value={exploded}
                onChange={e => setExploded(Number(e.target.value))}
              />
            </div>
            <div className="scene-toggles">
              <button
                className={labels ? 'active' : ''}
                aria-pressed={labels}
                onClick={() => setLabels(v => !v)}
              >
                Mounts
              </button>
              <button
                className={turntable ? 'active' : ''}
                aria-pressed={turntable}
                onClick={() => setTurntable(v => !v)}
              >
                Auto orbit
              </button>
              <button
                onClick={() => {
                  setReset(n => n + 1)
                  setTurntable(false)
                }}
                title="Reset camera"
              >
                Recenter
              </button>
            </div>
          </div>
          <div className="interaction-hint">
            Drag to orbit <b>·</b> Scroll to zoom <b>·</b> Right-drag to pan <b>·</b> Click a module
            to refit
          </div>
        </section>

        <aside className="inspector">
          <div className="inspector-intro">
            <div>
              <p className="eyebrow">VESSEL CONFIGURATION</p>
              <h2>Make it your own.</h2>
            </div>
            <span className="revision">MK. I</span>
          </div>
          <div className="tabs" role="tablist" aria-label="Design controls">
            {(['Loadout', 'Hull', 'Finish'] as const).map(t => (
              <button
                key={t}
                role="tab"
                id={`tab-${t}`}
                aria-controls={`panel-${t}`}
                aria-selected={tab === t}
                className={tab === t ? 'active' : ''}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div
            className="inspector-content"
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
          >
            {tab === 'Loadout' && (
              <>
                <SectionTitle number="01">Mission profile</SectionTitle>
                <div className="presets">
                  {(Object.keys(BOT_LOADOUT_TEMPLATES) as BotArchetype[]).map(id => (
                    <button
                      key={id}
                      className={
                        JSON.stringify(config.loadout) === JSON.stringify(BOT_LOADOUT_TEMPLATES[id])
                          ? 'active'
                          : ''
                      }
                      onClick={() => preset(id)}
                    >
                      {id}
                    </button>
                  ))}
                </div>
                <SectionTitle number="02">
                  Attachment points <small>{filled}/5 FITTED</small>
                </SectionTitle>
                <div className="mount-list">
                  {MOUNTS.map(m => {
                    const component = moduleAt(config, m.id)
                    return (
                      <button
                        key={m.id}
                        aria-pressed={selected === m.id}
                        className={`mount-row ${selected === m.id ? 'active' : ''}`}
                        onClick={() => setSelected(m.id)}
                      >
                        <span className="mount-code">{m.short}</span>
                        <Glyph decorative type={component} />
                        <span>
                          <small>{m.label}</small>
                          <strong>
                            {component ? SUBSYSTEM_CONFIGS[component].name : 'Empty mount'}
                          </strong>
                        </span>
                        <span className="row-arrow">↗</span>
                      </button>
                    )
                  })}
                </div>
                <div className="module-heading">
                  <span className="eyebrow">REFIT {mount.short}</span>
                  <button
                    className="text-button"
                    disabled={!type}
                    onClick={() => setConfig(c => setModule(c, selected, null))}
                  >
                    Remove module
                  </button>
                </div>
                <div className="module-library">
                  {INSTALLABLE_SUBSYSTEMS.filter(t => canInstallInSlot(t, mount.group)).map(t => (
                    <button
                      key={t}
                      aria-pressed={type === t}
                      className={type === t ? 'active' : ''}
                      onClick={() => setConfig(c => setModule(c, selected, t))}
                    >
                      <Glyph decorative type={t} />
                      <span>{SUBSYSTEM_CONFIGS[t].name}</span>
                    </button>
                  ))}
                </div>
                <p className="module-description">
                  {type
                    ? MODULE_NOTES[type]
                    : 'Paired magnet seats and an alignment key. Pick a module to fit this mount.'}
                </p>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={concealed}
                    onChange={e => setConcealed(e.target.checked)}
                  />
                  <span>
                    Concealed loadout<small>Preview identical covers for unrevealed systems.</small>
                  </span>
                </label>
                <div className="fixed-systems">
                  <span className="eyebrow">BUILT INTO EVERY HULL</span>
                  <p>Main drive · Maneuvering thrusters · Fuel scoop</p>
                </div>
              </>
            )}
            {tab === 'Hull' && (
              <>
                <SectionTitle number="01">Hull proportions</SectionTitle>
                <div className="hull-presets">
                  <button
                    onClick={() =>
                      patch({ length: 1, beam: 1, armor: 1, engineSize: 1, engines: 3 })
                    }
                  >
                    Corvette
                  </button>
                  <button
                    onClick={() =>
                      patch({ length: 1.2, beam: 1.25, armor: 1.3, engineSize: 1.2, engines: 5 })
                    }
                  >
                    Heavy frigate
                  </button>
                </div>
                <Slider
                  label="Hull length"
                  value={config.length}
                  min={0.9}
                  max={1.3}
                  onChange={length => patch({ length })}
                />
                <Slider
                  label="Hull beam"
                  value={config.beam}
                  min={0.8}
                  max={1.3}
                  onChange={beam => patch({ beam })}
                />
                <Slider
                  label="Armor depth"
                  value={config.armor}
                  min={0.65}
                  max={1.4}
                  onChange={armor => patch({ armor })}
                />
                <SectionTitle number="02">Propulsion</SectionTitle>
                <label className="field-label">Drive cluster</label>
                <div className="segmented">
                  {([1, 3, 5] as const).map(n => (
                    <button
                      key={n}
                      aria-pressed={config.engines === n}
                      className={config.engines === n ? 'active' : ''}
                      onClick={() => patch({ engines: n })}
                    >
                      {n} {n === 1 ? 'bell' : 'bells'}
                    </button>
                  ))}
                </div>
                <Slider
                  label="Engine size"
                  value={config.engineSize}
                  min={0.75}
                  max={1.3}
                  onChange={engineSize => patch({ engineSize })}
                />
                <SectionTitle number="03">Magnetic interface</SectionTitle>
                <Slider
                  label="Nominal hull length"
                  value={config.hullMillimeters}
                  min={60}
                  max={100}
                  step={5}
                  format={n => `${n} mm`}
                  onChange={hullMillimeters => patch({ hullMillimeters })}
                />
                <Slider
                  label="Magnet diameter"
                  value={config.magnetMillimeters}
                  min={2}
                  max={4}
                  step={0.5}
                  format={n => `${n} mm`}
                  onChange={magnetMillimeters => patch({ magnetMillimeters })}
                />
                <button className="full-width" onClick={() => setExploded(1)}>
                  Inspect mounting interfaces ↗
                </button>
                <p className="note">
                  Two magnet seats and one alignment key per module. Dimensions are concept
                  references; pockets, tolerances, and wall thickness still need a manufacturing
                  pass.
                </p>
              </>
            )}
            {tab === 'Finish' && (
              <>
                <SectionTitle number="01">Surface treatment</SectionTitle>
                <div className="segmented">
                  {(['paint', 'resin'] as const).map(f => (
                    <button
                      key={f}
                      className={config.finish === f ? 'active' : ''}
                      aria-pressed={config.finish === f}
                      onClick={() => patch({ finish: f })}
                    >
                      {f === 'paint' ? 'Painted metal' : 'Unpainted resin'}
                    </button>
                  ))}
                </div>
                <p className="note">
                  Resin removes color and engine light so the geometry has to carry the silhouette.
                </p>
                <SectionTitle number="02">Armor finish</SectionTitle>
                <div className="swatches">
                  {[
                    ['#aab4b2', 'Naval gray'],
                    ['#d6c9a9', 'Warm ivory'],
                    ['#435968', 'Deep blue'],
                    ['#657362', 'Field green'],
                    ['#4c5051', 'Graphite'],
                  ].map(([color, name]) => (
                    <button
                      key={color}
                      title={name}
                      aria-label={name}
                      aria-pressed={config.paint === color}
                      className={config.paint === color ? 'active' : ''}
                      style={{ background: color }}
                      onClick={() => patch({ paint: color })}
                    />
                  ))}
                </div>
                <label className="color-picker">
                  Custom armor color
                  <input
                    type="color"
                    value={config.paint}
                    onChange={e => patch({ paint: e.target.value })}
                  />
                </label>
                <SectionTitle number="03">Identification stripes</SectionTitle>
                <div className="swatches">
                  {[
                    ['#d3683d', 'Oxide orange'],
                    ['#d4b456', 'Signal yellow'],
                    ['#639da3', 'Glacier blue'],
                    ['#b84b50', 'Vermilion'],
                    ['#d4d7ce', 'Chalk'],
                  ].map(([color, name]) => (
                    <button
                      key={color}
                      title={name}
                      aria-label={name}
                      aria-pressed={config.accent === color}
                      className={config.accent === color ? 'active' : ''}
                      style={{ background: color }}
                      onClick={() => patch({ accent: color })}
                    />
                  ))}
                </div>
                <label className="color-picker">
                  Custom stripe color
                  <input
                    type="color"
                    value={config.accent}
                    onChange={e => patch({ accent: e.target.value })}
                  />
                </label>
                <div className="design-note">
                  <span className="eyebrow">DESIGN LANGUAGE</span>
                  <p>
                    A thrust-first silhouette: layered armor over an exposed service spine,
                    protected module shoes, and a drive that looks like it could move all that mass.
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="inspector-bottom">
            <div className="ship-stats">
              <div>
                <strong>{stats.dissipationCapacity}</strong>
                <span>DISSIPATION</span>
              </div>
              <div>
                <strong>{stats.reactionMass}</strong>
                <span>REACTION MASS</span>
              </div>
              <div>
                <strong className={validation.valid ? 'valid' : ''}>{filled}/5</strong>
                <span>{validation.valid ? 'LOADOUT READY' : 'INCOMPLETE'}</span>
              </div>
            </div>
            <div className="export-actions">
              <button disabled={exporting} onClick={() => void exportGlb()}>
                {exporting ? 'Exporting…' : 'Export GLB'}
              </button>
              <button
                onClick={() => {
                  if (!viewer.current) return
                  const a = document.createElement('a')
                  a.href = viewer.current.capture()
                  a.download = 'corvette-study.png'
                  a.click()
                  setMessage('3D viewport saved as PNG.')
                }}
              >
                Snapshot
              </button>
              <button onClick={() => void copyLink()}>Copy link</button>
            </div>
          </div>
        </aside>
      </main>
      <footer className="statusbar">
        <span className="status-light" />
        <span role="status">{message}</span>
        <span className="status-right">
          STANDALONE CONCEPT <b>/</b> NOT A PRINT FILE
        </span>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Workshop />)
