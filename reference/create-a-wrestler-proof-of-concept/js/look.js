/**
 * Reference implementation module. Teaching focus: how the Create-A-Wrestler proof of concept separates pure asset recipes from DOM and Babylon side effects.
 * File: reference/create-a-wrestler-poc/js/look.js
 *
 * Read the public types and exported functions first; callers show how this
 * module participates in the larger data → rules → presentation pipeline.
 */
/* The Look model: reads assets/manifest.json and turns one costume's field values into a
   figure recipe (which GLB meshes, which PNG layers, which colours). Nothing here knows
   about Babylon or the DOM. */

import { clamp } from './util.js'

export const BODY_SLOTS = ['pelvis', 'lower_abdomen', 'upper_body', 'neck',
  'left_upper_leg', 'left_lower_leg', 'left_foot', 'right_upper_leg', 'right_lower_leg', 'right_foot',
  'left_upper_arm', 'left_forearm', 'left_hand', 'left_fingers',
  'right_upper_arm', 'right_forearm', 'right_hand', 'right_fingers']

export class LookBook {
  constructor(manifest) {
    this.manifest = manifest
    this.fields = manifest.fields
    this.byName = new Map(manifest.fields.map((field) => [field.name, field]))
    this.palettes = manifest.palettes
    this.buildNames = new Map()
  }

  field(name) {
    return this.byName.get(name)
  }

  count(field) {
    return field.kind === 'colour' ? this.palettes.costume.length : field.options.length
  }

  value(costume, name) {
    const field = this.byName.get(name)
    const raw = Number(costume?.fields?.[name]?.value ?? 0)
    return clamp(Number.isFinite(raw) ? raw : 0, 0, this.count(field) - 1)
  }

  /** True when the stored value is outside what the asset set offers (it was clamped). */
  outOfRange(costume, name) {
    const raw = Number(costume?.fields?.[name]?.value ?? 0)
    return raw !== this.value(costume, name)
  }

  option(name, value) {
    const field = this.byName.get(name)
    return field.options[clamp(value, 0, field.options.length - 1)]
  }

  /** The text AKI Anvil shows for a value: Style N, None, Default or Colour N. */
  label(field, value) {
    if (field.kind === 'colour') return value === 0 ? 'Default' : `Colour ${value}`
    if (field.kind === 'build') return this.buildNames.get(value) ?? `Build ${value}`
    if (field.zero === 'none' && value === 0) return 'None'
    return `Style ${value}`
  }

  /** A short description of what a value is, from the asset set. */
  hint(costume, field) {
    const value = this.value(costume, field.name)
    if (field.kind === 'colour') {
      const owner = this.byName.get(field.of)
      const option = this.option(owner.name, this.value(costume, owner.name))
      if (value) return this.palettes.costume[value]
      const fallback = option?.defaults?.[field.channel - 1]
      return fallback ? `uses colour ${fallback}` : ''
    }
    const option = field.options[value]
    return option?.name ?? ''
  }

  /** The swatch shown beside a colour select, and whether it is a default. */
  swatch(costume, field) {
    const value = this.value(costume, field.name)
    if (field.kind === 'colour') {
      if (value) return { colour: this.palettes.costume[value], fallback: false }
      const owner = this.byName.get(field.of)
      const option = this.option(owner.name, this.value(costume, owner.name))
      const fallback = option?.defaults?.[field.channel - 1]
      return { colour: fallback ? this.palettes.costume[fallback] : null, fallback: true }
    }
    if (field.palette) return { colour: this.palettes[field.palette][value], fallback: false }
    return null
  }

  colourOf(costume, field, option, channel) {
    const name = field.colours?.[channel - 1]
    const value = name ? this.value(costume, name) : 0
    const index = value || option?.defaults?.[channel - 1] || 0
    return index ? this.palettes.costume[index] : '#8a8a8a'
  }

  /** Everything the stage needs to build one costume. */
  recipe(costume, { entrance = false } = {}) {
    const m = this.manifest
    const v = (name) => this.value(costume, name)
    const build = this.option('body_type', v('body_type'))
    const set = m.bodySets[build.set]
    const female = Boolean(set.female)
    const entranceValue = v('entrance_attire')
    const entranceOn = entrance && entranceValue > 0
    const entranceOption = entranceOn ? this.option('entrance_attire', entranceValue) : null
    const upperHidden = Boolean(entranceOption?.hidesUpper)
    let upperValue = v('upper_attire')
    const ringOption = this.option('ring_attire', v('ring_attire'))
    const ringCoversTorso = /^Singlet/.test(ringOption?.name ?? '')
    const notes = []
    if (female && upperValue === 0 && m.rules?.femaleDefaultUpper != null && !ringCoversTorso) {
      upperValue = m.rules.femaleDefaultUpper
      notes.push(`Upper attire None on a women's build wears style ${upperValue}`)
    }
    const hatValue = v('hats_caps')
    const hatOn = hatValue > 0 && !entranceOption?.blocksHat
    const hatOption = hatOn ? this.option('hats_caps', hatValue) : null
    if (hatValue > 0 && !hatOn) notes.push('the entrance attire covers the hat')
    if (upperHidden && upperValue) notes.push('the robe covers the upper attire')

    const effective = (name) => (name === 'upper_attire' ? upperValue : v(name))
    const skip = (name) => (name === 'entrance_attire' && !entranceOn) || (name === 'upper_attire' && upperHidden) || (name === 'hats_caps' && !hatOn)

    const swaps = []
    for (const name of m.swapOrder) {
      if (skip(name)) continue
      const option = this.option(name, effective(name))
      if (option?.swap && set.swaps[option.swap]) swaps.push({ field: name, swap: option.swap, url: set.swaps[option.swap] })
    }

    const headOption = this.option('head_shape', v('head_shape'))
    const attachments = []
    const hairOption = this.option('hair_type', v('hair_type'))
    if (hairOption?.attach && !(hatOption?.hidesHair)) attachments.push({ ...hairOption.attach, fit: headOption.fit })
    if (hatOption?.attach) attachments.push({ ...hatOption.attach, fit: headOption.fit })

    const layers = []
    const skinHex = this.palettes.skin[v('skin_color')]
    const hairHex = this.palettes.hair[v('hair_color')]
    for (const name of m.layerOrder) {
      if (name === 'base') {
        const base = m.base[female ? 'female' : 'male']
        layers.push({ field: 'base', label: 'Body', option: female ? "Women's skin" : "Men's skin", src: base.src, colours: { r: skinHex } })
        continue
      }
      if (skip(name)) continue
      const field = this.byName.get(name)
      const value = effective(name)
      const option = this.option(name, value)
      for (const entry of option?.layers ?? []) {
        const colours = {}
        for (const [channel, key] of Object.entries(entry.keys ?? {})) {
          if (key === 'skin') colours[channel] = skinHex
          else if (key === 'hair') colours[channel] = hairHex
          else if (key === 'c1') colours[channel] = this.colourOf(costume, field, option, 1)
          else if (key === 'c2') colours[channel] = this.colourOf(costume, field, option, 2)
        }
        layers.push({ field: name, label: field.label, option: option.name, value, src: entry.src, colours })
      }
    }
    return {
      build: v('body_type'),
      set: build.set,
      setName: build.name,
      scale: build.scale,
      female,
      body: set.mesh,
      swaps,
      head: { url: headOption.head, fit: headOption.fit, name: headOption.name },
      attachments,
      layers,
      notes,
      entrance: entranceOn,
    }
  }

  /** A costume with every field present and its range set to what the assets offer. */
  normalise(costume) {
    costume.fields ??= {}
    for (const field of this.fields) {
      const entry = costume.fields[field.name] ?? { label: field.label, group: field.group, value: 0 }
      entry.label = field.label
      entry.group = field.group
      entry.value = Number(entry.value ?? 0)
      entry.range = [0, this.count(field) - 1]
      entry.display = this.label(field, this.value(costume, field.name))
      if (field.kind === 'colour' && !('colour' in entry)) entry.colour = null
      costume.fields[field.name] = entry
    }
    costume.female = Boolean(this.manifest.bodySets[this.option('body_type', this.value(costume, 'body_type')).set]?.female)
    return costume
  }

  setValue(costume, name, value) {
    const field = this.byName.get(name)
    const entry = costume.fields[name]
    entry.value = clamp(Math.round(value), 0, this.count(field) - 1)
    entry.display = this.label(field, entry.value)
    if (field.kind === 'colour') entry.colour = entry.value ? this.palettes.costume[entry.value] : null
    if (name === 'body_type') costume.female = Boolean(this.manifest.bodySets[this.option('body_type', entry.value).set]?.female)
  }

  /** Builds are labelled by who wears them, like AKI Anvil does. */
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
    const builds = this.byName.get('body_type').options
    builds.forEach((option, value) => {
      const names = users.get(value) ?? []
      let text = `Build ${value} · ${option.name}`
      if (names.length === 1) text = names[0]
      else if (names.length === 2) text = `${names[0]}, ${names[1]}`
      else if (names.length > 2) text = `${names[0]}, ${names[1]} and ${names.length - 2} more`
      this.buildNames.set(value, text)
    })
  }
}
