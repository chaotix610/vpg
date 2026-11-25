/**
 * Reference implementation module. Teaching focus: how the Create-A-Wrestler proof of concept separates pure asset recipes from DOM and Babylon side effects.
 * File: reference/create-a-wrestler-poc/js/compose-core.js
 *
 * Read the public types and exported functions first; callers show how this
 * module participates in the larger data → rules → presentation pipeline.
 */
/* The texture maths, with no DOM: the app and tools/aki-export/parity.mjs both import it.
   - Starter assets: RGB key shades recoloured with computed ramps (Composer draws the result).
   - ROM assets: a port of AKI Anvil's composeAttire. It works in palette-index space like the
     game: each layer writes 4-bit indices into a slot tile at its band, copies its 32 palette
     words (16 drawn colours, 16 key codes) over the band, and recolouring reads the key code
     16 entries above each drawn colour. */
import { hexToRgb } from './util.js'

// ------------------------------------------------------------------ starter assets

const MID = 170

/** 256 shades of one colour: 170 is the colour itself, darker below, lighter above.
    Shades snap to 16 steps, like an N64 costume ramp. */
export function keyRamp(hex) {
  const [r, g, b] = hexToRgb(hex)
  const out = new Uint8ClampedArray(256 * 3)
  for (let v = 0; v < 256; v += 1) {
    const step = Math.round(v / 17) * 17
    const t = step / MID
    for (const [i, c] of [[0, r], [1, g], [2, b]]) {
      out[v * 3 + i] = t <= 1 ? c * (0.12 + 0.88 * t) : c + (255 - c) * Math.min(1, (t - 1) * 1.25)
    }
  }
  return out
}

/** Recolour RGBA pixels in place: pure red, green or blue shades take ramps.r, .g or .b. */
export function recolourKeys(data, ramps) {
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    let ramp = null
    let shade = 0
    if (r && !g && !b) { ramp = ramps.r; shade = r }
    else if (g && !r && !b) { ramp = ramps.g; shade = g }
    else if (b && !r && !g) { ramp = ramps.b; shade = b }
    if (!ramp) continue
    data[i] = ramp[shade * 3]
    data[i + 1] = ramp[shade * 3 + 1]
    data[i + 2] = ramp[shade * 3 + 2]
  }
  return data
}

// ------------------------------------------------------------------ indexed PNG

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Decode an indexed (colour type 3) PNG to its packed scanlines, palette indices untouched. */
export async function decodeIndexedPng(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) throw new Error('not a PNG')
  let width = 0
  let height = 0
  let depth = 0
  const parts = []
  for (let at = 8; at < bytes.length;) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    const data = bytes.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(at + 8)
      height = view.getUint32(at + 12)
      depth = data[8]
      if (data[9] !== 3) throw new Error('not an indexed-colour PNG')
      if (data[12]) throw new Error('interlaced PNGs are not supported')
    } else if (type === 'IDAT') parts.push(data)
    else if (type === 'IEND') break
    at += 12 + length
  }
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) { joined.set(part, offset); offset += part.length }
  const raw = await inflate(joined)
  const rowBytes = Math.ceil((width * depth) / 8)
  const rows = new Uint8Array(rowBytes * height)
  const step = Math.max(1, depth >> 3)
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (rowBytes + 1)]
    const line = raw.subarray(row * (rowBytes + 1) + 1, (row + 1) * (rowBytes + 1))
    const out = rows.subarray(row * rowBytes, (row + 1) * rowBytes)
    const above = row ? rows.subarray((row - 1) * rowBytes, row * rowBytes) : new Uint8Array(rowBytes)
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= step ? out[x - step] : 0
      const up = above[x]
      const corner = x >= step ? above[x - step] : 0
      let add = 0
      if (filter === 1) add = left
      else if (filter === 2) add = up
      else if (filter === 3) add = (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - corner
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - corner)
        add = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner
      }
      out[x] = (line[x] + add) & 255
    }
  }
  return { width, height, depth, rowBytes, rows }
}

/** A manifest picture plus its decoded PNG, as the bytes a tile file holds after its header. */
export function pictureOf(entry, png) {
  return { width: entry.width, height: entry.height, eightBit: entry.format === 'ci8', payload: png.rows.subarray(0, entry.bytes) }
}

/** Palette files as stored in palettes.json (hex) -> bytes. */
export function paletteBytes(hex) {
  const out = new Uint8Array(hex.length >> 1)
  for (let index = 0; index < out.length; index += 1) out[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  return out
}

// ------------------------------------------------------------------ ROM assets: colour words

const widen5 = (value) => ((value << 3) | (value >> 2)) & 255

/** An RGBA5551 word as 0xRRGGBBAA, the way AKI Anvil's n64/texel.js rgba5551 widens it. */
export function rgba5551(word) {
  return ((widen5((word >> 11) & 31) << 24) | (widen5((word >> 6) & 31) << 16) | (widen5((word >> 1) & 31) << 8) | (word & 1 ? 255 : 0)) >>> 0
}

/** A composed tile as RGBA bytes, row 0 first. */
export function tileRgba(tile) {
  const rgba = new Uint8ClampedArray(tile.width * tile.height * 4)
  for (let index = 0; index < tile.indices.length; index += 1) {
    const colour = rgba5551(tile.colours[tile.indices[index]])
    rgba[index * 4] = colour >>> 24
    rgba[index * 4 + 1] = (colour >>> 16) & 255
    rgba[index * 4 + 2] = (colour >>> 8) & 255
    rgba[index * 4 + 3] = colour & 255
  }
  return rgba
}

// ------------------------------------------------------------------ ROM assets: composition

const PALETTE_SIZE = 256
const SKIN_ROW = 16
const signed = (value) => (value << 24) >> 24

function loadTile(store, pixelsId, paletteId) {
  const { width, height, eightBit, payload } = store.picture(pixelsId)
  const palette = store.palette(paletteId)
  const indices = new Uint8Array(width * height)
  for (let index = 0; index < indices.length; index += 1) {
    if (eightBit) indices[index] = payload[index]
    else indices[index] = index & 1 ? payload[index >> 1] & 15 : payload[index >> 1] >> 4
  }
  const colours = new Uint16Array(PALETTE_SIZE)
  for (let index = 0; index < Math.min(PALETTE_SIZE, palette.length / 2); index += 1) colours[index] = (palette[index * 2] << 8) | palette[index * 2 + 1]
  return { width, height, indices, colours, source: pixelsId }
}

function drawLayer(store, target, pixelsId, paletteId, base, rowOffset, layerColours) {
  if (!pixelsId || !paletteId) return false
  const { width, height, payload } = store.picture(pixelsId)
  const palette = store.palette(paletteId)
  const colourAt = (index) => (palette[index * 2] << 8) | palette[index * 2 + 1]
  if (width !== target.width || target.height < rowOffset) return false
  const rows = Math.min(target.height - Math.abs(rowOffset), height)
  let destination = rowOffset >= 0 ? rowOffset * width : 0
  let source = rowOffset < 0 ? -rowOffset * (width >> 1) : 0
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < width >> 1; column += 1) {
      const byte = payload[source]
      source += 1
      for (const nibble of [byte >> 4, byte & 15]) {
        const index = Math.min(nibble, layerColours - 1)
        if (colourAt(index) !== 0) target.indices[destination] = index + base
        destination += 1
      }
    }
  }
  const count = Math.min(layerColours * 2, palette.length, (PALETTE_SIZE - base) * 2) >> 1
  for (let index = 0; index < count; index += 1) target.colours[base + index] = colourAt(index)
  return true
}

/** The shade a key code gives for colour `layer` (1 green, 2 blue), or -1 if it is not that ramp. */
export function shadeOf(rules, code, layer) {
  const mask = rules.rampMasks[layer]
  return (code & ~mask & 0xffff) !== 0 || code < 2 ? -1 : ((code & mask) >> rules.rampShifts[layer]) >> 1
}

function recolour(manifest, target, colours, base) {
  const { rules } = manifest
  const ramps = manifest.colours.costume
  const shades = rules.costumeShades
  for (let which = 0; which < 2; which += 1) {
    const colour = signed(colours[which])
    if (colour <= 0) continue
    for (let index = base; index < base + shades; index += 1) {
      const shade = shadeOf(rules, target.colours[(index + shades) & 255], which + 1)
      if (shade < 0) continue
      target.colours[index & 255] = colour < rules.costumeColours ? ramps[colour][shades - 1 - shade] : 1
    }
  }
}

/** Compose every slot tile for a plan from js/rom-look.js, like AKI Anvil's composeAttire.
    store.picture(id) -> { width, height, eightBit, payload }; store.palette(id) -> Uint8Array.
    Returns { [slot]: { width, height, indices, colours (256 RGBA5551 words), source } }. */
export function composeSlots(manifest, plan, store) {
  const t = manifest.tables
  const bands = t.bands
  const layerColours = manifest.rules.layerColours
  const first = manifest.slots.extrasFirst
  const out = {}
  for (let slot = 1; slot < first; slot += 1) {
    if (!t.loaded[slot]) continue
    const entry = plan.slots[slot]
    if (!entry.pixels || !entry.palette) continue
    const tile = loadTile(store, entry.pixels, entry.palette)
    if (plan.skin > 0) for (let index = 0; index < SKIN_ROW; index += 1) tile.colours[index] = tile.colours[plan.skin * SKIN_ROW + index]
    out[slot] = tile
  }
  for (let slot = first; slot < manifest.slots.count; slot += 1) {
    const entry = plan.slots[slot]
    if (!entry.pixels) continue
    const tile = loadTile(store, entry.pixels, entry.palette)
    recolour(manifest, tile, entry.colours, 0)
    out[slot] = tile
  }
  const hat = plan.layers.entranceHat?.[0] ?? (plan.hatsAllowed ? plan.layers.hats[0] : null)
  if (hat?.texture) {
    const tile = loadTile(store, hat.texture + 1, hat.texture)
    recolour(manifest, tile, hat.colours, 0)
    out[t.hats.slot] = tile
  }
  const layered = (slot) => t.layered[slot] && out[slot]
  const draw = (target, pixels, palette, base, offset) => drawLayer(store, target, pixels, palette, base, offset, layerColours)
  const face = out[20]
  if (plan.facial && face) draw(face, plan.facial.pixels, plan.facial.palette, bands.facialHair, plan.facial.offset)
  for (const entry of plan.layers.tattoo ?? []) {
    if (!entry.texture || !layered(entry.slot)) continue
    if (draw(out[entry.slot], entry.texture, entry.texture + plan.tone, bands.tattoo, 0)) recolour(manifest, out[entry.slot], entry.colours, bands.tattoo)
  }
  const apply = (entries, base, offset = 0) => {
    for (const entry of entries ?? []) {
      if (!entry.texture || !layered(entry.slot)) continue
      if (draw(out[entry.slot], entry.texture + 1, entry.texture, base, entry.slot === 20 ? offset : 0)) recolour(manifest, out[entry.slot], entry.colours, base)
    }
  }
  const steps = [
    () => apply(plan.layers.ring, bands.ring),
    () => apply(plan.layers.upper, bands.upper),
    () => (plan.layers.wristbands ?? []).forEach((list) => apply(list, bands.wristbands)),
    () => apply(plan.layers.boots, bands.boots),
    () => apply(plan.layers.masks, bands.mask, plan.maskOffset),
    () => {
      apply(plan.layers.elbowLeft, bands.elbows)
      apply(plan.layers.elbowRight, bands.elbows)
    },
    () => {
      apply(plan.layers.kneeLeft, bands.knees)
      apply(plan.layers.kneeRight, bands.knees)
    },
    () => apply(plan.layers.gloves, bands.gloves),
  ]
  for (const step of plan.steps) if (step < steps.length) steps[step]()
  if (plan.entranceBeforeHair) apply(plan.layers.entrance, bands.entrance)
  if (plan.frontHair && face && plan.frontHair.pixels > 0) draw(face, plan.frontHair.pixels, plan.frontHair.palette, bands.hair, 0)
  const hairPalette = t.hair.palettes[plan.hairColour]
  for (const entry of plan.layers.hair ?? []) {
    if (!entry.texture || !layered(entry.slot)) continue
    if (draw(out[entry.slot], entry.texture, hairPalette, bands.hair, 0)) recolour(manifest, out[entry.slot], entry.colours, bands.hair)
  }
  if (!plan.entranceBeforeHair) apply(plan.layers.entrance, bands.entrance)
  if (plan.hatsAllowed) apply(plan.layers.hats, bands.hat)
  return out
}

/** Every picture and palette ID composeSlots will read for a plan, so they can be loaded first.
    (The files a plan reads never depend on their contents.) */
export function filesForPlan(manifest, plan) {
  const pictures = new Set()
  const palettes = new Set()
  const empty = new Uint8Array(0)
  const store = {
    picture: (id) => { pictures.add(id); return { width: 0, height: 0, eightBit: true, payload: empty } },
    palette: (id) => { palettes.add(id); return empty },
  }
  composeSlots(manifest, plan, store)
  return { pictures: [...pictures], palettes: [...palettes] }
}
