/**
 * Reference implementation module. Teaching focus: how the Create-A-Wrestler proof of concept separates pure asset recipes from DOM and Babylon side effects.
 * File: reference/create-a-wrestler-poc/js/rom-look.js
 *
 * Read the public types and exported functions first; callers show how this
 * module participates in the larger data → rules → presentation pipeline.
 */
/* The updated Look model for assets (assets/manifest.json, version 2). planCostume reads the tables,
   RomLookBook gives the editor the same interface LookBook does. Nothing here knows about Babylon or the DOM. */


import { clamp } from './util.js'

const signed = (value) => (value << 24) >> 24
const layerList = (list, slots, colours) => slots.map((slot, position) => ({ slot, texture: list?.[position] ?? 0, colours }))

/** Which slots, models, pictures and layers a costume record wears, as No Mercy assembles it. */
export function planCostume(manifest, record, options = {}) {
  const t = manifest.tables
  const rules = manifest.rules
  const slots = Array.from({ length: manifest.slots.count }, () => ({ model: 0, pixels: 0, palette: 0, colours: [0, 0] }))
  const layers = {}
  const skin = record.skin_color < 8 ? record.skin_color : 0
  const hairColour = record.hair_color < 8 ? record.hair_color : 0
  const bodyType = signed(record.body_type)
  const set = t.typeToSet[bodyType]
  const skinSet = t.typeToSkin[bodyType]
  const female = set >= t.femaleFromSet
  const sex = female ? 'female' : 'male'
  const ring = record.ring_attire < t.ring.limit ? record.ring_attire : 0
  let upper = record.upper_attire < t.upper.limit ? record.upper_attire : 0
  if (female && upper === 0 && (ring < rules.womenRingFrom || t.upper.womenRingTop[ring] === 0)) upper = rules.womenUpperDefault
  const entrance = options.entrance && record.entrance_attire < t.entrance.limit ? record.entrance_attire : 0
  if (entrance === rules.entranceDropsUpper) upper = 0
  const hatsAllowed = rules.hatsAllowed[entrance]
  const coversWaist = rules.coversWaist[entrance]
  if (record.hair_type < rules.hairLimit) layers.hair = layerList(t.hair.lists[record.hair_type], t.hair.slots, [record.hair_color, 0])
  const parts = t.bodySets[set]
  const skins = t.skinSets[skinSet]
  for (let position = 0; position < t.slotOfPosition.length; position += 1) {
    const slot = t.slotOfPosition[position]
    const part = parts[position]
    const palette = skins[position]
    if (part) slots[slot].model = part
    if (palette) Object.assign(slots[slot], { palette, pixels: palette + 1, colours: [record.skin_color, 0] })
  }
  Object.assign(slots[4], { model: t.head.neck.model, pixels: t.head.neck.pixels, palette: t.head[sex].palette })
  Object.assign(slots[5], { palette: t.head[sex].palette, pixels: t.head[sex].pixels })
  const placeHat = (index, colours) => {
    const shape = t.hats.shapes[female ? 1 : 0][signed(record.head_shape)]
    const hair = t.hats.hairs[female ? 1 : 0][signed(record.hair_type)]
    const kind = t.hats.kinds[index]
    const [hatModel, headModel, faceModel] = t.hats.models[`${kind}/${shape}/${hair}`] ?? [0, 0, 0]
    slots[t.hats.slot].model = hatModel
    slots[5].model = headModel
    slots[20].model = faceModel
    return layerList(t.hats.textures[index], t.hats.slots, colours)
  }
  const hat = record.hats_caps
  if (hat >= 1 && hat <= t.hats.last && hatsAllowed) {
    layers.hats = placeHat(hat - 1, [record.hats_caps_color, 0])
  } else {
    const [head, face] = t.head.lists[sex][signed(record.head_shape)]?.[signed(record.hair_type)] ?? [0, 0]
    slots[5].model = head
    slots[20].model = face
  }
  if (record.face_number < rules.faceLimit) {
    const palette = t.head.facePalettes[record.face_number]
    Object.assign(slots[20], { pixels: palette + 1, palette })
  }
  const extrasCodes = [0, 0, 0]
  const extras = (colours, kind) => {
    if (kind === 0 || kind >= t.extras.limit) return
    const group = t.extras.groups[kind]
    const codes = t.extras.codes[group]
    const models = t.extras.models[group][set]
    const count = t.extras.counts[group]
    const palettes = t.extras.palettes[kind]
    for (let index = 0; index < count; index += 1) {
      const code = codes[index]
      const position = (code << 16) >> 28
      extrasCodes[position] = code
      if (coversWaist && position === 0) continue
      Object.assign(slots[t.extras.first + position], { model: models[index], palette: palettes[index], pixels: palettes[index] + 1, colours })
    }
  }
  const swaps = []
  const replaceModels = (field, list, targets) => {
    if (!list) return
    let changed = false
    targets.forEach((slot, position) => {
      const model = list[position]
      if (model) {
        slots[slot].model = model
        changed = true
      }
    })
    if (changed) swaps.push(field)
  }
  const ringKind = t.ring.kinds[ring]
  replaceModels('ring_attire', t.ring.models[ringKind]?.[set], t.ring.modelSlots)
  const ringStyle = t.ring.styles[ring]
  layers.ring = layerList(ringStyle.textures, t.ring.textureSlots, [record.ring_attire_color_1, record.ring_attire_color_2])
  extras([record.ring_attire_color_1, record.ring_attire_color_2], ringStyle.extras)
  const upperKind = t.upper.kinds[upper]
  if (upper) {
    replaceModels('upper_attire', t.upper.models[upperKind]?.[set], t.upper.modelSlots)
    const style = t.upper.styles[upper]
    layers.upper = layerList(style.textures, t.upper.textureSlots, [record.upper_attire_color_1, record.upper_attire_color_2])
    extras([record.upper_attire_color_1, record.upper_attire_color_2], style.extras)
  }
  let entranceHat = false
  if (entrance) {
    const kind = t.entrance.kinds[entrance]
    replaceModels('entrance_attire', t.entrance.models[kind]?.[set], t.entrance.slots)
    const style = t.entrance.styles[entrance]
    const colours = [record.entrance_attire_color_1, record.entrance_attire_color_2]
    layers.entrance = layerList(style.textures, t.entrance.slots, colours)
    extras(colours, style.extras)
    if (style.special >= rules.entranceHatFrom) {
      layers.entranceHat = placeHat(style.special - rules.entranceHatBase, colours)
      entranceHat = true
    }
  }
  if (record.gloves >= 1 && record.gloves <= t.gloves.last) {
    replaceModels('gloves', t.gloves.models[record.gloves]?.[t.gloves.column[set]], t.gloves.modelSlots)
    layers.gloves = layerList(t.gloves.textures[record.gloves], t.gloves.textureSlots, [record.gloves_color, 0])
  }
  const pads = (value, part, slotsAt, colour) => (value >= 1 && value <= part.last ? layerList(part.textures[value], slotsAt, [colour, 0]) : null)
  layers.elbowLeft = pads(record.left_elbow_pad, t.elbows, t.elbows.left, record.left_elbow_pad_color)
  layers.elbowRight = pads(record.right_elbow_pad, t.elbows, t.elbows.right, record.right_elbow_pad_color)
  layers.kneeLeft = pads(record.left_knee_pad, t.knees, t.knees.left, record.left_knee_pad_color)
  layers.kneeRight = pads(record.right_knee_pad, t.knees, t.knees.right, record.right_knee_pad_color)
  if (record.tattoo >= 1 && record.tattoo <= t.tattoos.last && t.tattoos.textures[record.tattoo]) layers.tattoo = layerList(t.tattoos.textures[record.tattoo], t.tattoos.slots, [0, 0])
  if (record.wristband >= 1 && record.wristband <= t.wristbands.last) {
    const band = layerList(t.wristbands.textures[record.wristband], t.wristbands.slots[1], [record.wristband_color, 0])
    layers.wristbands = t.wristbands.slots.map((list) => list.map((slot, position) => ({ ...band[position], slot })))
  }
  if (record.boots < t.boots.limit) {
    const kind = t.boots.kinds[record.boots]
    if (kind) replaceModels('boots', t.boots.models[kind]?.[t.boots.column[set]], t.boots.modelSlots)
    layers.boots = layerList(t.boots.textures[signed(record.boots)], t.boots.textureSlots, [record.boots_color_1, record.boots_color_2])
  }
  const face = signed(record.face_number)
  const tone = rules.skinTone[skin]
  let facial = null
  if (record.facial_hair >= 1 && record.facial_hair <= t.facialHair.last) {
    const pixels = t.facialHair.pictures[record.facial_hair]
    const offset = face < rules.faceRowsBelow ? signed(t.facialHair.faceRows[face] - t.facialHair.hairRows[record.facial_hair]) : 0
    facial = { pixels, palette: pixels + tone, offset }
  }
  let maskOffset = 0
  if (record.masks_etc >= 1 && record.masks_etc <= t.masks.last) {
    layers.masks = layerList(t.masks.textures[record.masks_etc], t.masks.slots, [0, 0])
    if (face < rules.faceRowsBelow && t.masks.maskRows[record.masks_etc] >= 0) maskOffset = signed(t.masks.faceRows[face] - t.masks.maskRows[record.masks_etc])
  }
  const front = signed(record.front_hair)
  const frontLimit = t.hair.frontLimit[signed(record.hair_type)] ?? 0
  const frontHair = front >= 0 && front < frontLimit ? { pixels: t.hair.front[front], palette: t.hair.palettes[hairColour] } : null
  const orderRow = t.order.table[6 * t.order.upperClass[upperKind] + t.order.ringClass[ringKind]]
  const steps = [...t.order.rows[orderRow]]
  const entranceBeforeHair = rules.entranceBeforeHair[entrance]
  return {
    slots, layers, skin, tone, hairColour, hatsAllowed: hatsAllowed && Boolean(layers.hats), entrance, entranceBeforeHair, facial, frontHair, maskOffset, steps, extrasCodes,
    set, skinSet, female, ring, upper, swaps, entranceHat, hatBlocked: hat >= 1 && hat <= t.hats.last && !hatsAllowed,
  }
}

/** The parts a plan draws: { slot, bone, model, pixels, palette }, like AKI's dressedSlots. */
export function dressedSlots(manifest, plan) {
  const first = manifest.slots.extrasFirst
  const bones = manifest.slots.bones
  const entries = []
  for (let slot = 1; slot < manifest.slots.count; slot += 1) {
    const entry = plan.slots[slot]
    if (!entry.model) continue
    const bone = slot < first ? bones[slot] : bones[manifest.tables.extras.slots[plan.extrasCodes[slot - first] & 15]]
    if (bone === null || bone === undefined) continue
    entries.push({ slot, bone, model: entry.model, pixels: entry.pixels, palette: entry.palette })
  }
  return entries
}

/** The layers a plan draws, in the game's order, for the editor's list. */
function drawnLayers(manifest, plan) {
  const t = manifest.tables
  const names = manifest.slots.names
  const out = []
  const add = (label, field, entries, pictureOf = (texture) => texture + 1) => {
    const used = (entries ?? []).filter((entry) => entry?.texture && t.layered[entry.slot])
    if (!used.length) return
    out.push({ field, label, slots: used.map((entry) => names[entry.slot]), src: `textures/${pictureOf(used[0].texture)}.png` })
  }
  if (plan.facial?.pixels) out.push({ field: 'facial_hair', label: 'Facial hair', slots: ['face'], src: `textures/${plan.facial.pixels}.png` })
  add('Tattoo', 'tattoo', plan.layers.tattoo, (texture) => texture)
  const steps = [
    () => add('Ring attire', 'ring_attire', plan.layers.ring),
    () => add('Upper attire', 'upper_attire', plan.layers.upper),
    () => add('Wristbands', 'wristband', (plan.layers.wristbands ?? []).flat()),
    () => add('Boots', 'boots', plan.layers.boots),
    () => add('Mask', 'masks_etc', plan.layers.masks),
    () => add('Elbow pads', 'left_elbow_pad', [...(plan.layers.elbowLeft ?? []), ...(plan.layers.elbowRight ?? [])]),
    () => add('Knee pads', 'left_knee_pad', [...(plan.layers.kneeLeft ?? []), ...(plan.layers.kneeRight ?? [])]),
    () => add('Gloves', 'gloves', plan.layers.gloves),
  ]
  for (const step of plan.steps) steps[step]?.()
  if (plan.entranceBeforeHair) add('Entrance attire', 'entrance_attire', plan.layers.entrance)
  if (plan.frontHair?.pixels > 0) out.push({ field: 'front_hair', label: 'Front hair', slots: ['face'], src: `textures/${plan.frontHair.pixels}.png` })
  add('Hair', 'hair_type', plan.layers.hair, (texture) => texture)
  if (!plan.entranceBeforeHair) add('Entrance attire', 'entrance_attire', plan.layers.entrance)
  if (plan.hatsAllowed) add('Hat', 'hats_caps', plan.layers.hats)
  return out
}

export class RomLookBook {
  constructor(manifest) {
    this.manifest = manifest
    this.kind = 'rom'
    this.fields = manifest.fields
    this.byName = new Map(manifest.fields.map((field) => [field.name, field]))
    this.swatches = manifest.swatches
    this.buildNames = new Map()
  }

  field(name) {
    return this.byName.get(name)
  }

  female(costume) {
    const build = this.byName.get('body_type')
    const type = clamp(Number(costume?.fields?.body_type?.value ?? 0) || 0, build.first, build.last)
    return this.manifest.tables.typeToSet[type] >= this.manifest.tables.femaleFromSet
  }

  /** [first, last] for this costume: head shapes and hair styles differ between men and women. */
  range(costume, field) {
    const span = field.female && this.female(costume) ? field.female : field
    return [span.first, span.last]
  }

  count(field) {
    return field.last + 1
  }

  value(costume, name) {
    const field = this.byName.get(name)
    const raw = Number(costume?.fields?.[name]?.value ?? 0)
    const [first, last] = this.range(costume, field)
    return clamp(Number.isFinite(raw) ? raw : first, first, last)
  }

  outOfRange(costume, name) {
    const raw = Number(costume?.fields?.[name]?.value ?? 0)
    return raw !== this.value(costume, name)
  }

  label(field, value) {
    if (field.kind === 'colour') return value === 0 ? 'Drawn' : `Colour ${value}`
    if (field.kind === 'build') return this.buildNames.get(value) ?? `Build ${value}`
    if (field.noneAtZero && value === 0) return 'None'
    return `Style ${value}`
  }

  hint(costume, field) {
    const value = this.value(costume, field.name)
    const t = this.manifest.tables
    if (field.kind === 'colour') return value ? this.swatches.costume[value] : 'the drawn colours'
    if (field.kind === 'build') return `body set ${t.typeToSet[value]}${t.typeToSet[value] >= t.femaleFromSet ? ', women' : ''}`
    if (field.name === 'ring_attire') return `kind ${t.ring.kinds[value]}`
    if (field.name === 'upper_attire' && value) return `kind ${t.upper.kinds[value]}`
    if (field.name === 'boots' && t.boots.kinds[value]) return `kind ${t.boots.kinds[value]}`
    if (field.name === 'entrance_attire' && value) return `kind ${t.entrance.kinds[value]}${this.manifest.rules.hatsAllowed[value] ? '' : ', no hat'}`
    return ''
  }

  swatch(costume, field) {
    const value = this.value(costume, field.name)
    if (field.kind === 'colour') return value ? { colour: this.swatches.costume[value], fallback: false } : { colour: null, fallback: true }
    if (field.swatch) return { colour: this.swatches[field.swatch][value], fallback: false }
    return null
  }

  /** The record planCostume reads: every Look field, kept inside the game's ranges. */
  record(costume) {
    return Object.fromEntries(this.fields.map((field) => [field.name, this.value(costume, field.name)]))
  }

  recipe(costume, { entrance = false } = {}) {
    const m = this.manifest
    const record = this.record(costume)
    const plan = planCostume(m, record, { entrance })
    const dressed = dressedSlots(m, plan)
    const notes = []
    if (plan.female && record.upper_attire === 0 && plan.upper === m.rules.womenUpperDefault && plan.entrance !== m.rules.entranceDropsUpper) notes.push(`Upper attire None on a women's build wears style ${plan.upper}`)
    if (plan.entrance === m.rules.entranceDropsUpper && record.upper_attire) notes.push(`entrance attire ${plan.entrance} drops the upper attire`)
    if (plan.hatBlocked) notes.push('the entrance attire covers the hat')
    if (plan.entranceHat) notes.push('the entrance attire brings its own hat')
    if (m.rules.coversWaist[plan.entrance]) notes.push('the entrance attire covers the waist prop')
    const value = record.body_type
    return {
      kind: 'rom',
      record,
      plan,
      dressed,
      build: value,
      set: plan.set,
      setName: this.buildNames.get(value) ?? `Build ${value}`,
      scale: 1,
      female: plan.female,
      swaps: plan.swaps.map((field) => ({ field, swap: this.byName.get(field)?.label.toLowerCase() ?? field })),
      layers: drawnLayers(m, plan).map((layer) => ({ ...layer, option: layer.slots.join(', ') })),
      notes,
      entrance: plan.entrance > 0,
    }
  }

  normalise(costume) {
    costume.fields ??= {}
    for (const field of this.fields) {
      const entry = costume.fields[field.name] ?? { label: field.label, group: field.group, value: 0 }
      entry.label = field.label
      entry.group = field.group
      entry.value = Number(entry.value ?? 0)
      entry.range = this.range(costume, field)
      entry.display = this.label(field, this.value(costume, field.name))
      if (field.kind === 'colour' && !('colour' in entry)) entry.colour = null
      costume.fields[field.name] = entry
    }
    costume.female = this.female(costume)
    return costume
  }

  setValue(costume, name, value) {
    const field = this.byName.get(name)
    const entry = costume.fields[name]
    const [first, last] = this.range(costume, field)
    entry.value = clamp(Math.round(value), first, last)
    entry.display = this.label(field, entry.value)
    if (field.kind === 'colour') entry.colour = entry.value ? this.swatches.costume[entry.value] : null
    if (name === 'body_type') {
      costume.female = this.female(costume)
      // Head shapes and hair styles are separate lists for men and women: move them into range.
      for (const other of this.fields) {
        if (!other.female) continue
        const [low, high] = this.range(costume, other)
        const current = costume.fields[other.name]
        if (current.value < low || current.value > high) {
          current.value = clamp(current.value, low, high)
          current.display = this.label(other, current.value)
        }
        current.range = [low, high]
      }
    }
  }

  /** Builds are labelled by who wears them */
  nameBuilds(roster) {
    const users = new Map()
    for (const wrestler of roster) {
      for (const costume of wrestler.look?.costumes ?? []) {
        const value = this.value(costume, 'body_type')
        const name = wrestler.profile?.fullName
        if (!name || wrestler.id === 'default' || wrestler.created) continue
        if (!users.has(value)) users.set(value, [])
        if (!users.get(value).includes(name)) users.get(value).push(name)
      }
    }
    this.buildNames = new Map()
    const t = this.manifest.tables
    for (let value = 0; value < t.typeToSet.length; value += 1) {
      const names = users.get(value) ?? []
      let text = `Build ${value} · set ${t.typeToSet[value]}${t.typeToSet[value] >= t.femaleFromSet ? ' (women)' : ''}`
      if (names.length === 1) text = names[0]
      else if (names.length === 2) text = `${names[0]}, ${names[1]}`
      else if (names.length > 2) text = `${names[0]}, ${names[1]} and ${names.length - 2} more`
      this.buildNames.set(value, text)
    }
  }
}
