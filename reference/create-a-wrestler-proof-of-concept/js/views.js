/**
 * Reference implementation module. Teaching focus: how the Create-A-Wrestler proof of concept separates pure asset recipes from DOM and Babylon side effects.
 * File: reference/create-a-wrestler-poc/js/views.js
 *
 * Read the public types and exported functions first; callers show how this
 * module participates in the larger data → rules → presentation pipeline.
 */
/* HTML for the three panes. Markup and class names follow AKI Anvil's Wrestlers view. */
import { escape, plural } from './util.js'
import { HEIGHT_CLASSES, WEIGHT_CLASSES, heightText, weightText } from './data.js'

let uid = 0
const id = (prefix) => `${prefix}-${(uid += 1)}`

// ------------------------------------------------------------------ roster

export function rosterRows(rows, selected) {
  return rows.map(({ doc, slot }) => {
    const name = doc.profile?.fullName || `Wrestler ${slot}`
    const tag = doc.created ? '<span class="cell-new badge text-bg-info">NEW</span>' : doc.edited ? '<span class="cell-new badge text-bg-warning">EDITED</span>' : ''
    return `<div class="data-grid-row" role="row" data-key="${escape(doc.id)}" aria-selected="${doc.id === selected}">
      <div class="data-grid-cell" role="gridcell"><span class="cell-strong${doc.id === 'default' ? ' is-muted' : ''}">${escape(name)}</span>${tag}</div>
      <div class="data-grid-cell numeric mono" role="gridcell">${slot}</div>
    </div>`
  }).join('')
}

// ------------------------------------------------------------------ costume bar

export function costumeButtons(doc, costume) {
  return doc.look.costumes.map((entry, index) => `<button type="button" role="tab" data-costume="${index}" aria-selected="${index === costume}">${index + 1}</button>`).join('')
}

// ------------------------------------------------------------------ look tab

function selectField(look, costume, field) {
  const fieldId = id('field')
  const value = look.value(costume, field.name)
  // ROM assets keep separate head shape and hair style ranges for men and women.
  const [first, last] = look.range ? look.range(costume, field) : [0, look.count(field) - 1]
  const options = []
  for (let option = first; option <= last; option += 1) {
    options.push(`<option value="${option}"${option === value ? ' selected' : ''}>${escape(look.label(field, option))}</option>`)
  }
  const select = `<select class="input select form-select" id="${fieldId}" name="look:${field.name}">${options.join('')}</select>`
  const swatch = look.swatch(costume, field)
  const control = swatch
    ? `<div class="colour-select"><span class="colour-swatch${swatch.fallback ? ' is-default' : ''}" style="background-color:${swatch.colour ?? 'transparent'}" aria-hidden="true"></span>${select}</div>`
    : select
  const clamped = look.outOfRange(costume, field.name)
  const hint = clamped ? `stored ${costume.fields[field.name].value}, shown as ${value}` : look.hint(costume, field)
  return `<div class="field${field.wide ? ' wide' : ''}">
    <div class="field-label"><label for="${fieldId}">${escape(field.label)}</label><span class="field-hint${clamped ? ' is-warning' : ''}" title="${escape(hint)}">${escape(hint)}</span></div>
    ${control}
  </div>`
}

function textureSection(recipe, meshes, tiles) {
  const layers = (recipe?.layers ?? []).map((layer, index) => `<li><span>${index + 1}</span><span><strong>${escape(layer.label)}</strong> · ${escape(layer.option ?? '')}<small>${escape(layer.src)}</small></span></li>`).join('')
  const swaps = recipe?.swaps?.length ? ` · mesh swaps: ${escape(recipe.swaps.map((swap) => swap.swap).join(', '))}` : ''
  if (tiles) {
    const grid = tiles.map((tile) => `<figure class="tile-cell"><canvas class="tile-canvas" data-tile="${tile.slot}" width="${tile.width}" height="${tile.height}" role="img" aria-label="Composed tile for slot ${tile.slot}, ${escape(tile.name)}"></canvas><figcaption><strong>${escape(tile.name.replaceAll('_', ' '))}</strong><small>slot ${tile.slot} · ${tile.width}×${tile.height} · part ${tile.model}</small></figcaption></figure>`).join('')
    return `<section class="inspector-section" aria-labelledby="texture-heading">
    <h3 id="texture-heading">Texture <small>${plural(tiles.length, 'slot tile')}, ${plural(recipe?.layers?.length ?? 0, 'layer')} in the game's draw order</small></h3>
    <div class="tile-grid">${grid}</div>
    <ol class="layer-list layer-list-rom">${layers}</ol>
    <p class="section-note">${escape(meshes)}${swaps}</p>
  </section>`
  }
  return `<section class="inspector-section" aria-labelledby="texture-heading">
    <h3 id="texture-heading">Texture <small>${plural(recipe?.layers?.length ?? 0, 'layer')} on one 512 × 512 atlas</small></h3>
    <div class="atlas-row">
      <canvas class="atlas-canvas" width="512" height="512" data-atlas role="img" aria-label="The composed texture atlas"></canvas>
      <ol class="layer-list">${layers}</ol>
    </div>
    <p class="section-note">${escape(meshes)}${swaps}</p>
  </section>`
}

export function lookPanel(look, doc, costume, recipe, facts, tiles = null) {
  const entry = doc.look.costumes[costume]
  const groups = []
  for (const field of look.fields) {
    if (!groups.includes(field.group)) groups.push(field.group)
  }
  const fieldsOf = (group) => look.fields.filter((field) => field.group === group).map((field) => selectField(look, entry, field)).join('')
  const notes = recipe?.notes?.length ? `<p class="section-note">On the stage: ${escape(recipe.notes.join('; '))}.</p>` : ''
  const meshes = facts ? [`${facts.meshes} meshes`, `${facts.vertices.toLocaleString()} vertices`, `${Math.round(facts.faces).toLocaleString()} triangles`].join(' · ') : ''
  const source = look.kind === 'rom'
    ? 'Every choice follows the exported No Mercy tables in <code>assets/rom/manifest.json</code>. Entrance attire shows when the stage is set to Entrance.'
    : 'Every choice is a GLB mesh or a PNG layer listed in <code>assets/manifest.json</code>. Entrance attire shows when the stage is set to Entrance.'
  return `<section class="inspector-section" aria-labelledby="appearance-heading">
    <h3 id="appearance-heading">Appearance <small>costume ${costume + 1}</small></h3>
    ${groups.map((group) => `<h4 class="slider-group">${escape(group)}</h4><div class="fields">${fieldsOf(group)}</div>`).join('')}
    <div class="section-actions">
      <button type="button" class="button btn btn-secondary button-secondary button-sm" data-look-all><span data-icon="copy"></span><span>Use this look for all ${doc.look.costumes.length} costumes</span></button>
      <button type="button" class="button btn btn-outline-secondary button-ghost button-sm" data-look-reset><span data-icon="undo-2"></span><span>Reset costume ${costume + 1}</span></button>
    </div>
    ${notes}
    <p class="section-note">${source}</p>
  </section>
  ${textureSection(recipe, meshes, tiles)}`
}

// ------------------------------------------------------------------ profile tab

const SITUATIONS = [['ground', 'Ground'], ['aerial', 'Aerial'], ['running', 'Running'], ['counter', 'Counters'], ['strike', 'Strikes'], ['grapple', 'Grapples']]
const PARTS = ['head', 'body', 'arms', 'legs', 'flying']

function slider(name, label, value, min, max) {
  return `<label class="slider-row"><span class="slider-label" title="${escape(label)}">${escape(label)}</span><input class="form-range" type="range" name="${name}" min="${min}" max="${max}" step="1" value="${value}" aria-label="${escape(label)}"><output>${value}</output></label>`
}

function paramRow(param) {
  const label = param.label ?? param.name.replaceAll('_', ' ')
  if (param.max <= 511) return slider(`param:${param.index}`, label, param.value, param.min, param.max)
  return `<label class="slider-row"><span class="slider-label" title="${escape(label)}">${escape(label)}</span><input class="input form-control" type="number" name="param:${param.index}" min="${param.min}" max="${param.max}" step="1" value="${param.value}" aria-label="${escape(label)}" style="height:28px"><output></output></label>`
}

function textField(name, label, value, wide = false) {
  const fieldId = id('field')
  const text = value ?? ''
  return `<div class="${wide ? 'wide' : ''}"><div class="field">
    <div class="field-label"><label for="${fieldId}">${escape(label)}</label><span class="field-hint">no length limit</span></div>
    <div class="input-group"><input class="input form-control" id="${fieldId}" name="name:${name}" value="${escape(text)}" autocomplete="off" spellcheck="false"><span class="input-suffix" data-counter>${String(text).length}</span></div>
  </div></div>`
}

export function profilePanel(doc) {
  const profile = doc.profile
  const heightRaw = Number(profile.heightRaw ?? 13)
  const heights = []
  for (let raw = 0; raw <= 35; raw += 1) heights.push(`<option value="${raw}"${raw === heightRaw ? ' selected' : ''}>${heightText(raw)}</option>`)
  for (const [raw, label] of Object.entries(HEIGHT_CLASSES)) heights.push(`<option value="${raw}"${Number(raw) === heightRaw ? ' selected' : ''}>${label}</option>`)
  const weightRaw = Number(profile.weightRaw ?? 140)
  const isClass = weightRaw >= 500
  const weightKinds = [`<option value="pounds"${!isClass ? ' selected' : ''}>Pounds</option>`, ...Object.entries(WEIGHT_CLASSES).map(([raw, label]) => `<option value="${raw}"${Number(raw) === weightRaw ? ' selected' : ''}>${label}</option>`)]
  const heightId = id('field')
  const weightId = id('field')
  const attributes = profile.attributes ?? { speed: 0, attack: {}, defence: {} }
  const allParams = profile.allParams ?? []
  const people = [
    profile.partner ? `<span class="chip">Partner: ${escape(profile.partner)}</span>` : '',
    ...(profile.rivals ?? []).map((name) => `<span class="chip">Rival: ${escape(name)}</span>`),
  ].filter(Boolean).join('')
  return `<section class="inspector-section">
    <h3>Names</h3>
    <div class="fields">
      ${textField('fullName', 'Full name', profile.fullName, true)}
      ${textField('shortName', 'Short name', profile.shortName)}
      ${textField('ringName', 'Ring name', profile.ringName)}
    </div>
  </section>
  <section class="inspector-section">
    <h3>Body <small>height also scales the model</small></h3>
    <div class="fields">
      <div class="field"><div class="field-label"><label for="${heightId}">Height</label><span class="field-hint">${escape(heightText(heightRaw))}</span></div><select class="input select form-select" id="${heightId}" name="body:height">${heights.join('')}</select></div>
      <div class="field"><div class="field-label"><label for="${weightId}">Weight</label><span class="field-hint">100–599 lb</span></div>
        <div class="weight-control${isClass ? ' is-class' : ''}"><select class="input select form-select" id="${weightId}" name="body:weight-kind">${weightKinds.join('')}</select>${isClass ? '' : `<input class="input form-control" type="number" min="100" max="599" name="body:weight" value="${weightRaw + 100}" aria-label="Weight in pounds">`}</div>
      </div>
      <div class="field"><div class="field-label"><span>Style</span></div><div class="input static">${escape(profile.style?.name ?? 'Wrestling')}</div></div>
      <div class="field"><div class="field-label"><span>Shown as</span></div><div class="input static">${escape(heightText(heightRaw))} · ${escape(weightText(weightRaw))}</div></div>
    </div>
    ${people ? `<h4 class="slider-group">Partner and rivals</h4><div class="people">${people}</div>` : ''}
  </section>
  <section class="inspector-section">
    <h3>Attributes</h3>
    <div class="sliders">${slider('attr:speed', 'Speed', attributes.speed ?? 0, 0, 7)}</div>
    <h4 class="slider-group">Attack <small>how hard a move with this part hits</small></h4>
    <div class="sliders">${PARTS.map((part) => slider(`attr:attack.${part}`, part[0].toUpperCase() + part.slice(1), attributes.attack?.[part] ?? 0, 0, 15)).join('')}</div>
    <h4 class="slider-group">Defence <small>how much a hit on this part is softened</small></h4>
    <div class="sliders">${PARTS.map((part) => slider(`attr:defence.${part}`, part[0].toUpperCase() + part.slice(1), attributes.defence?.[part] ?? 0, 0, 15)).join('')}</div>
    ${allParams.length ? `<details class="more"><summary>All ${allParams.length} parameter fields</summary><div class="sliders">${allParams.map((param) => paramRow(param)).join('')}</div></details>` : ''}
  </section>`
}
