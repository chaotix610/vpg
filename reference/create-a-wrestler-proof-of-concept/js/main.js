/**
 * Reference implementation module. Teaching focus: how the Create-A-Wrestler proof of concept separates pure asset recipes from DOM and Babylon side effects.
 * File: reference/create-a-wrestler-poc/js/main.js
 *
 * Read the public types and exported functions first; callers show how this
 * module participates in the larger data → rules → presentation pipeline.
 */
/* Create-A-Wrestler: wires the roster, the editor tabs and the 3D stage together. */
import { paintIcons, toast, download, on, escape, plural } from './util.js'
import { icon } from './icons.js'

import { RomLookBook } from './rom-look.js'
import { Composer, RomComposer } from './composer.js'
import { Stage } from './stage.js'
import { Roster, heightText, heightInches, weightText } from './data.js'
import { rosterRows, costumeButtons, lookPanel, profilePanel } from './views.js'

// ?assets=rom switches to the assets tools/aki-export wrote; the starter assets stay the default.
const ASSET_SETS = { starter: 'assets/', rom: 'assets/rom/' }
const ASSET_SET = new URLSearchParams(location.search).get('assets') === 'rom' ? 'rom' : 'starter'
const ASSETS = ASSET_SETS[ASSET_SET]
const PARAM_OF = { speed: 'speed', 'attack.head': 'ability_1', 'attack.body': 'ability_2', 'attack.arms': 'ability_3', 'attack.legs': 'ability_4', 'attack.flying': 'ability_5', 'defence.head': 'ability_6', 'defence.body': 'ability_7', 'defence.arms': 'ability_8', 'defence.legs': 'ability_9', 'defence.flying': 'ability_10' }

const $ = (selector) => document.querySelector(selector)

function remembered(key, fallback) {
  try { return window.localStorage.getItem(`vpg-caw:${key}`) ?? fallback } catch { return fallback }
}
function remember(key, value) {
  try { window.localStorage.setItem(`vpg-caw:${key}`, value) } catch { /* private window */ }
}

async function boot() {
  paintIcons()
  if (!window.BABYLON) throw new Error('Babylon.js did not load. The page needs internet access for the jsDelivr CDN.')
  if (location.protocol === 'file:') throw new Error('Open this page through a local web server, not as a file.')
  const manifestReply = await fetch(`${ASSETS}manifest.json`)
  if (!manifestReply.ok) {
    if (ASSET_SET === 'rom') throw new Error(`${ASSETS}manifest.json could not be loaded (${manifestReply.status}). Export the ROM assets first: node tools/aki-export/export.mjs --aki ../aki-anvil --rom "<your cartridge>" --out assets/rom — or open the page without ?assets=rom for the starter assets.`)
    throw new Error(`assets/manifest.json could not be loaded (${manifestReply.status})`)
  }
  const manifest = await manifestReply.json()
  manifest.root = ASSETS
  const rom = manifest.kind === 'rom'
  const look = rom ? new RomLookBook(manifest) : new LookBook(manifest)
  const roster = new Roster(look)
  await roster.load()
  look.nameBuilds(roster.wrestlers)
  const composer = rom ? new RomComposer(ASSETS, manifest) : new Composer(ASSETS)
  const stage = new Stage($('[data-stage]'), manifest, composer)
  setupAssetSwitch(rom)

  const state = { id: null, costume: 0, tab: remembered('tab', 'look'), entrance: false, search: '', sort: remembered('sort', 'slot'), recipe: null, facts: null }
  if (!['profile', 'look'].includes(state.tab)) state.tab = 'look'
  $('[data-sort]').value = state.sort

  const current = () => roster.get(state.id)
  const costumeOf = () => current().look.costumes[state.costume]

  // ---------------------------------------------------------------- roster pane
  function sortedRows() {
    const query = state.search.trim().toLowerCase()
    let rows = roster.wrestlers.map((doc, index) => ({ doc, slot: index + 1 }))
    if (query) rows = rows.filter(({ doc }) => [doc.profile.fullName, doc.profile.shortName, doc.profile.ringName, doc.id].some((text) => String(text ?? '').toLowerCase().includes(query)))
    const by = {
      slot: (a, b) => a.slot - b.slot,
      name: (a, b) => String(a.doc.profile.fullName).localeCompare(String(b.doc.profile.fullName)),
      height: (a, b) => heightInches(b.doc.profile.heightRaw ?? 13) - heightInches(a.doc.profile.heightRaw ?? 13) || a.slot - b.slot,
      weight: (a, b) => (b.doc.profile.weightRaw ?? 0) % 500 - (a.doc.profile.weightRaw ?? 0) % 500 || a.slot - b.slot,
    }[state.sort] ?? ((a, b) => a.slot - b.slot)
    return rows.sort(by)
  }

  function renderRoster() {
    const rows = sortedRows()
    $('[data-roster-rows]').innerHTML = rosterRows(rows, state.id)
    const empty = $('[data-roster-empty]')
    empty.hidden = rows.length > 0
    empty.textContent = `Nothing matches “${state.search}”.`
    $('[data-count]').textContent = roster.wrestlers.length
    const created = roster.wrestlers.filter((doc) => doc.created).length
    $('[data-roster-note]').textContent = created ? `${plural(created, 'created wrestler')}` : `${roster.wrestlers.length} on the roster`
    for (const button of document.querySelectorAll('[data-sort-key]')) {
      if (button.dataset.sortKey === state.sort) button.setAttribute('aria-sort', 'ascending')
      else button.removeAttribute('aria-sort')
    }
  }

  function scrollRowIntoView() {
    // Scroll only the roster list, never the page.
    const body = $('[data-roster-rows]')
    const row = body.querySelector(`.data-grid-row[data-key="${CSS.escape(state.id)}"]`)
    if (!row) return
    const rowBox = row.getBoundingClientRect()
    const bodyBox = body.getBoundingClientRect()
    if (rowBox.top < bodyBox.top) body.scrollTop -= bodyBox.top - rowBox.top
    else if (rowBox.bottom > bodyBox.bottom) body.scrollTop += rowBox.bottom - bodyBox.bottom
  }

  // ---------------------------------------------------------------- header and changes
  function renderHeader() {
    const doc = current()
    const slot = roster.slotOf(doc)
    $('[data-work-title]').textContent = doc.profile.fullName || `Wrestler ${slot}`
    const short = doc.profile.shortName ? `${doc.profile.shortName} · ` : ''
    $('[data-work-subtitle]').textContent = `${short}costume ${state.costume + 1} · slot ${slot}`
    $('[data-remove]').hidden = !doc.created
    document.title = `${doc.profile.fullName || 'Wrestler'} · Create-A-Wrestler`
  }

  function renderChanges() {
    const count = roster.changes.length
    const badge = $('[data-changes-count]')
    badge.hidden = count === 0
    badge.textContent = count > 99 ? '99+' : count
    $('[data-action="changes"]').classList.toggle('has-changes', count > 0)
  }

  function commit(doc, note) {
    const saved = roster.touch(doc, note)
    renderChanges()
    if (!saved && roster.store) toast('Not saved in this browser', 'Storage is full or blocked. Export the roster to keep your edits.', { icon: 'circle-alert' })
  }

  // ---------------------------------------------------------------- panels
  function keepFocus(container, render) {
    const scroller = $('.work-panels')
    const top = scroller.scrollTop
    const active = document.activeElement
    const name = active && container.contains(active) ? active.getAttribute('name') : null
    render()
    paintIcons(container)
    scroller.scrollTop = top
    if (name) container.querySelector(`[name="${CSS.escape(name)}"]`)?.focus({ preventScroll: true })
  }

  function renderLook() {
    const panel = $('[data-panel="look"]')
    keepFocus(panel, () => { panel.innerHTML = lookPanel(look, current(), state.costume, state.recipe, state.facts, rom ? stage.tilePictures() : null) })
    paintAtlas()
  }

  function renderProfile() {
    const panel = $('[data-panel="profile"]')
    keepFocus(panel, () => { panel.innerHTML = profilePanel(current()) })
  }

  function paintAtlas() {
    if (rom) {
      for (const tile of stage.tilePictures()) {
        const target = document.querySelector(`[data-tile="${tile.slot}"]`)
        if (!target) continue
        target.width = tile.width
        target.height = tile.height
        target.getContext('2d').putImageData(new ImageData(tile.rgba, tile.width, tile.height), 0, 0)
      }
      return
    }
    const target = document.querySelector('[data-atlas]')
    if (!target) return
    const context = target.getContext('2d')
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, target.width, target.height)
    context.drawImage(stage.atlasCanvas(), 0, 0, target.width, target.height)
  }

  function showTab(tab) {
    if (state.tab !== tab) $('.work-panels').scrollTop = 0
    state.tab = tab
    remember('tab', tab)
    for (const button of document.querySelectorAll('[data-tab]')) button.setAttribute('aria-selected', String(button.dataset.tab === tab))
    for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== tab
  }

  function renderCostumes() {
    const doc = current()
    $('[data-costumes]').innerHTML = costumeButtons(doc, state.costume)
    $('[data-costume-count]').textContent = `${doc.look.costumes.length} for this wrestler`
  }

  // ---------------------------------------------------------------- stage
  let figureRequest = 0
  async function refreshFigure() {
    const request = (figureRequest += 1)
    const doc = current()
    const recipe = look.recipe(costumeOf(), { entrance: state.entrance })
    state.recipe = recipe
    stage.setHeight(heightInches(doc.profile.heightRaw ?? 13) / 73)
    const status = $('[data-stage-status]')
    try {
      const summary = await stage.build(recipe)
      if (!summary || request !== figureRequest) return
      state.facts = stage.facts()
      if (summary.problems.length) toast('Some layers are missing', summary.problems.slice(0, 3).join('; '), { icon: 'circle-alert', duration: 6000 })
      paintBadge()
      $('[data-model-facts]').textContent = `${recipe.setName} build · ${heightText(doc.profile.heightRaw ?? 13)} · ${state.facts.meshes} meshes${recipe.entrance ? ' · entrance look' : ''}`
      if (state.tab === 'look') renderLook()
    } catch (error) {
      console.error(error)
      status.innerHTML = `<span class="badge bg-secondary">${escape(error.message)}</span>`
    }
  }

  function paintBadge() {
    const status = $('[data-stage-status]')
    const text = stage.state.model ? (stage.state.textured ? 'Textured model' : 'Clay model') : stage.state.figure ? 'Stick figure' : 'Nothing shown'
    status.innerHTML = `<span class="badge ${stage.state.model || stage.state.figure ? 'bg-primary' : 'bg-secondary'}">${text}</span>`
  }

  function pressed(selector, value) {
    $(selector).setAttribute('aria-pressed', String(value))
  }

  // ---------------------------------------------------------------- selection
  function select(id, costume = 0, { replace = false } = {}) {
    const doc = roster.get(id) ?? roster.wrestlers[0]
    state.id = doc.id
    state.costume = Math.min(Math.max(0, costume), doc.look.costumes.length - 1)
    const hash = `#/${encodeURIComponent(doc.id)}/${state.costume + 1}`
    if (location.hash !== hash) history[replace ? 'replaceState' : 'pushState'](null, '', hash)
    $('.work-panels').scrollTop = 0
    renderHeader()
    renderCostumes()
    renderProfile()
    renderLook()
    renderRoster()
    scrollRowIntoView()
    refreshFigure()
  }

  function fromHash() {
    const [, id, costume] = location.hash.split('/')
    return { id: id ? decodeURIComponent(id) : roster.wrestlers[0].id, costume: Math.max(0, (Number(costume) || 1) - 1) }
  }

  window.addEventListener('popstate', () => {
    const { id, costume } = fromHash()
    select(id, costume, { replace: true })
  })

  // ---------------------------------------------------------------- events: roster
  const desk = $('.desk')
  on(desk, 'click', '.data-grid-row', (event, row) => select(row.dataset.key, 0))
  $('[data-search]').addEventListener('input', (event) => {
    state.search = event.target.value
    renderRoster()
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      event.preventDefault()
      $('[data-search]').focus()
    }
  })
  $('[data-sort]').addEventListener('change', (event) => {
    state.sort = event.target.value
    remember('sort', state.sort)
    renderRoster()
  })
  on(desk, 'click', '[data-sort-key]', (event, button) => {
    state.sort = button.dataset.sortKey
    $('[data-sort]').value = state.sort
    remember('sort', state.sort)
    renderRoster()
  })
  $('[data-add-wrestler]').addEventListener('click', () => {
    const doc = roster.add()
    renderChanges()
    look.nameBuilds(roster.wrestlers)
    select(doc.id, 0)
    toast(`${doc.profile.fullName} added`, `Slot ${roster.slotOf(doc)}, every Look field on its default.`, { icon: 'plus' })
  })

  // ---------------------------------------------------------------- events: stage
  on(desk, 'click', '[data-costume]', (event, button) => {
    state.costume = Number(button.dataset.costume)
    history.replaceState(null, '', `#/${encodeURIComponent(state.id)}/${state.costume + 1}`)
    renderCostumes()
    renderHeader()
    renderLook()
    refreshFigure()
  })
  $('[data-stage-figure]').addEventListener('click', () => {
    stage.set('figure', !stage.state.figure)
    pressed('[data-stage-figure]', stage.state.figure)
    $('[data-stage-bones]').classList.toggle('is-off', !stage.state.figure)
    paintBadge()
  })
  $('[data-stage-model]').addEventListener('click', () => {
    stage.set('model', !stage.state.model)
    pressed('[data-stage-model]', stage.state.model)
    paintBadge()
  })
  on(desk, 'click', '[data-stage-skin]', (event, button) => {
    stage.set('textured', button.dataset.stageSkin === 'textured')
    for (const option of document.querySelectorAll('[data-stage-skin]')) option.setAttribute('aria-selected', String(option === button))
    paintBadge()
  })
  on(desk, 'click', '[data-stage-view]', (event, button) => {
    stage.view(button.dataset.stageView)
    pressed('[data-stage-rotate]', false)
  })
  $('[data-stage-bones] input').addEventListener('input', (event) => {
    stage.set('boneScale', Number(event.target.value))
    if (!stage.state.figure) {
      stage.set('figure', true)
      pressed('[data-stage-figure]', true)
      $('[data-stage-bones]').classList.remove('is-off')
      paintBadge()
    }
  })
  $('[data-stage-bones]').classList.add('is-off')
  $('[data-stage-rotate]').addEventListener('click', () => {
    stage.set('rotate', !stage.state.rotate)
    pressed('[data-stage-rotate]', stage.state.rotate)
  })
  $('[data-stage-play]').addEventListener('click', () => {
    stage.set('playing', !stage.state.playing)
    const button = $('[data-stage-play]')
    pressed('[data-stage-play]', stage.state.playing)
    button.setAttribute('aria-label', stage.state.playing ? 'Pause the idle motion' : 'Play the idle motion')
    button.innerHTML = icon(stage.state.playing ? 'pause' : 'play', { size: 16 })
  })
  function showEntrance(entrance) {
    state.entrance = entrance
    for (const option of document.querySelectorAll('[data-look-mode]')) option.setAttribute('aria-selected', String((option.dataset.lookMode === 'entrance') === entrance))
    refreshFigure()
  }
  on(desk, 'click', '[data-look-mode]', (event, button) => showEntrance(button.dataset.lookMode === 'entrance'))

  // ---------------------------------------------------------------- events: tabs
  on(desk, 'click', '[data-tab]', (event, button) => {
    if (button.disabled || button.getAttribute('aria-disabled') === 'true') return
    showTab(button.dataset.tab)
    if (button.dataset.tab === 'look') renderLook()
  })

  // ---------------------------------------------------------------- events: look
  const panels = $('.work-panels')
  panels.addEventListener('change', (event) => {
    const input = event.target
    const [kind, key] = String(input.name ?? '').split(':')
    const doc = current()
    if (kind === 'look') {
      const field = look.field(key)
      look.setValue(costumeOf(), key, Number(input.value))
      if (key === 'body_type') look.nameBuilds(roster.wrestlers)
      commit(doc, `${doc.profile.fullName}: costume ${state.costume + 1} ${field.label.toLowerCase()} set to ${input.selectedOptions[0].textContent.toLowerCase()}`)
      renderRoster()
      if ((field.group === 'Entrance') && !state.entrance) showEntrance(true)
      else refreshFigure()
      renderLook()
      return
    }
    if (kind === 'name') {
      const value = input.value.trim()
      doc.profile[key] = value || (key === 'ringName' ? null : value)
      commit(doc, `${doc.profile.fullName || 'Wrestler'}: ${key === 'fullName' ? 'full name' : key === 'shortName' ? 'short name' : 'ring name'} set to “${value}”`)
      renderHeader()
      renderRoster()
      return
    }
    if (kind === 'body') {
      if (key === 'height') {
        doc.profile.heightRaw = Number(input.value)
        doc.profile.height = heightText(doc.profile.heightRaw)
        commit(doc, `${doc.profile.fullName}: height set to ${doc.profile.height}`)
        refreshFigure()
      } else if (key === 'weight-kind') {
        doc.profile.weightRaw = input.value === 'pounds' ? 120 : Number(input.value)
        doc.profile.weight = weightText(doc.profile.weightRaw)
        commit(doc, `${doc.profile.fullName}: weight set to ${doc.profile.weight}`)
      } else if (key === 'weight') {
        const pounds = Math.min(599, Math.max(100, Math.round(Number(input.value) || 100)))
        doc.profile.weightRaw = pounds - 100
        doc.profile.weight = weightText(doc.profile.weightRaw)
        commit(doc, `${doc.profile.fullName}: weight set to ${doc.profile.weight}`)
      }
      renderProfile()
      renderRoster()
      return
    }
    if (kind === 'attr' || kind === 'param') {
      const value = Number(input.value)
      const params = doc.profile.allParams ?? []
      if (kind === 'attr') {
        const [group, part] = key.split('.')
        if (part) doc.profile.attributes[group][part] = value
        else doc.profile.attributes[group] = value
        const param = params.find((entry) => entry.name === PARAM_OF[key])
        if (param) param.value = value
      } else {
        const param = params.find((entry) => entry.index === Number(key))
        if (param) {
          param.value = Math.min(param.max, Math.max(param.min, Math.round(value)))
          const attr = Object.entries(PARAM_OF).find(([, name]) => name === param.name)?.[0]
          if (attr) {
            const [group, part] = attr.split('.')
            if (part) doc.profile.attributes[group][part] = param.value
            else doc.profile.attributes[group] = param.value
          }
        }
      }
      commit(doc, `${doc.profile.fullName}: ${input.getAttribute('aria-label').toLowerCase()} set to ${value}`)
      renderProfile()
    }
  })
  panels.addEventListener('input', (event) => {
    const input = event.target
    if (input.type === 'range') {
      const output = input.parentElement.querySelector('output')
      if (output) output.textContent = input.value
    }
    if (String(input.name).startsWith('name:')) {
      const counter = input.parentElement.querySelector('[data-counter]')
      if (counter) counter.textContent = input.value.length
    }
  })
  on(panels, 'click', '[data-look-all]', () => {
    const doc = current()
    const source = costumeOf()
    doc.look.costumes.forEach((costume, index) => {
      if (index === state.costume) return
      for (const field of look.fields) look.setValue(costume, field.name, look.value(source, field.name))
    })
    commit(doc, `${doc.profile.fullName}: costume ${state.costume + 1} look copied to all ${doc.look.costumes.length} costumes`)
    renderRoster()
    toast('Look copied', `All ${doc.look.costumes.length} costumes now match costume ${state.costume + 1}.`, { icon: 'copy' })
  })
  on(panels, 'click', '[data-look-reset]', () => {
    const doc = current()
    for (const field of look.fields) look.setValue(costumeOf(), field.name, 0)
    look.nameBuilds(roster.wrestlers)
    commit(doc, `${doc.profile.fullName}: costume ${state.costume + 1} reset to defaults`)
    renderRoster()
    renderLook()
    refreshFigure()
  })

  // ---------------------------------------------------------------- events: header
  $('[data-transfer-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(roster.document(current()), null, 2))
      toast('Copied', `${current().profile.fullName} is on the clipboard as JSON.`, { icon: 'copy' })
    } catch (error) {
      toast('Could not copy', error.message, { icon: 'circle-alert' })
    }
  })
  $('[data-transfer-paste]').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText()
      const pasted = JSON.parse(text)
      if (!pasted?.look?.costumes?.length || !pasted.profile) throw new Error('The clipboard does not hold a wrestler’s JSON.')
      const doc = current()
      doc.profile = pasted.profile
      doc.look = pasted.look
      for (const costume of doc.look.costumes) look.normalise(costume)
      while (doc.look.costumes.length < 4) doc.look.costumes.push(JSON.parse(JSON.stringify(doc.look.costumes[0])))
      commit(doc, `${doc.profile.fullName}: profile and look pasted`)
      look.nameBuilds(roster.wrestlers)
      select(doc.id, 0, { replace: true })
      toast('Pasted', `${doc.profile.fullName}'s profile and look are on slot ${roster.slotOf(doc)}.`, { icon: 'clipboard-paste' })
    } catch (error) {
      toast('Could not paste', error.message, { icon: 'circle-alert' })
    }
  })
  $('[data-transfer-download]').addEventListener('click', () => {
    const doc = current()
    download(`${doc.id}.json`, JSON.stringify(roster.document(doc), null, 2))
  })
  $('[data-remove]').addEventListener('click', () => {
    const doc = current()
    if (!doc.created) return
    if (!window.confirm(`Remove ${doc.profile.fullName}? This cannot be undone.`)) return
    roster.remove(doc)
    renderChanges()
    select(roster.wrestlers[0].id, 0, { replace: true })
  })

  // ---------------------------------------------------------------- events: changes and export
  const dialog = $('[data-changes-dialog]')
  $('[data-action="changes"]').addEventListener('click', () => {
    const list = $('[data-changes-list]')
    list.innerHTML = [...roster.changes].reverse().slice(0, 200).map((change) => `<li>${escape(change.note)}</li>`).join('')
    dialog.showModal()
  })
  $('[data-discard]').addEventListener('click', () => {
    if (!window.confirm('Discard every edit and created wrestler kept in this browser?')) return
    roster.discard()
    location.hash = ''
    location.reload()
  })
  for (const button of document.querySelectorAll('[data-action="export"]')) {
    button.addEventListener('click', () => {
      download('roster-export.json', JSON.stringify(roster.exportAll(), null, 1))
      toast('Roster exported', `${roster.wrestlers.length} wrestlers in roster-export.json, in the same shape as _all-wrestlers.json.`, { icon: 'download' })
      if (dialog.open) dialog.close()
    })
  }

  // ---------------------------------------------------------------- start
  paintIcons()
  showTab(state.tab)
  renderChanges()
  const { id, costume } = fromHash()
  select(id, costume, { replace: true })
  window.caw = { roster, look, stage, state, refreshFigure }
}

/** The Starter / ROM switch in the view header. It reloads the page with or without
    ?assets=rom; ROM is offered only once tools/aki-export has written assets/rom/. */
function setupAssetSwitch(rom) {
  const buttons = document.querySelectorAll('[data-asset-set]')
  for (const button of buttons) {
    button.setAttribute('aria-selected', String((button.dataset.assetSet === 'rom') === rom))
    button.addEventListener('click', () => {
      if ((button.dataset.assetSet === 'rom') === rom || button.disabled) return
      const url = new URL(location.href)
      if (button.dataset.assetSet === 'rom') url.searchParams.set('assets', 'rom')
      else url.searchParams.delete('assets')
      location.assign(url)
    })
  }
  if (rom) return
  const romButton = document.querySelector('[data-asset-set="rom"]')
  fetch(`${ASSET_SETS.rom}manifest.json`, { method: 'HEAD' }).then((reply) => {
    if (reply.ok) return
    romButton.disabled = true
    romButton.title = 'No ROM assets yet: run tools/aki-export/export.mjs to write assets/rom/'
  }).catch(() => { romButton.disabled = true })
}

boot().catch((error) => {
  console.error(error)
  const holder = $('[data-boot-error]')
  holder.hidden = false
  holder.innerHTML = `<div><h2>Create-A-Wrestler could not start</h2><p>${escape(error.message)}</p><p>Serve the project folder over HTTP, for example <code>python3 -m http.server</code> in the folder, then open <code>http://localhost:8000</code>.</p></div>`
})
