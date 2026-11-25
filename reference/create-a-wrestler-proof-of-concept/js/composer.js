/**
 * Reference implementation module. Teaching focus: how the Create-A-Wrestler proof of concept separates pure asset recipes from DOM and Babylon side effects.
 * File: reference/create-a-wrestler-poc/js/composer.js
 *
 * Read the public types and exported functions first; callers show how this
 * module participates in the larger data → rules → presentation pipeline.
 */
/* Texture composers for the browser. The maths lives in compose-core.js (no DOM), shared with
   the Node parity check; this file only loads images and draws canvases.
   - Composer (starter assets): each PNG layer is recoloured (its red, green and blue key shades
     take the skin tone, hair colour or costume colours) and drawn in order onto one 512 x 512
     canvas that every body part samples.
   - RomComposer (ROM assets): one tile per slot, composed in palette-index space like the game. */
import { keyRamp, recolourKeys, composeSlots, filesForPlan, decodeIndexedPng, pictureOf, paletteBytes, tileRgba } from './compose-core.js'

export class Composer {
  constructor(root, size = 512) {
    this.root = root
    this.size = size
    this.images = new Map()
    this.painted = new Map()
  }

  async pixels(src) {
    if (!this.images.has(src)) {
      this.images.set(src, (async () => {
        const response = await fetch(this.root + src)
        if (!response.ok) throw new Error(`${src} could not be loaded (${response.status})`)
        const bitmap = await createImageBitmap(await response.blob())
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(bitmap, 0, 0)
        return context.getImageData(0, 0, bitmap.width, bitmap.height)
      })())
    }
    return this.images.get(src)
  }

  static ramp(hex) {
    return keyRamp(hex)
  }

  async layer(entry) {
    const key = `${entry.src}|${entry.colours.r ?? ''}|${entry.colours.g ?? ''}|${entry.colours.b ?? ''}`
    if (this.painted.has(key)) return this.painted.get(key)
    const source = await this.pixels(entry.src)
    const ramps = { r: entry.colours.r ? keyRamp(entry.colours.r) : null, g: entry.colours.g ? keyRamp(entry.colours.g) : null, b: entry.colours.b ? keyRamp(entry.colours.b) : null }
    const data = recolourKeys(new Uint8ClampedArray(source.data), ramps)
    const canvas = new OffscreenCanvas(source.width, source.height)
    canvas.getContext('2d').putImageData(new ImageData(data, source.width, source.height), 0, 0)
    if (this.painted.size > 160) this.painted.delete(this.painted.keys().next().value)
    this.painted.set(key, canvas)
    return canvas
  }

  /** Draw every layer of a recipe onto `target` (a 2D canvas context). */
  async compose(layers, target) {
    const pictures = await Promise.all(layers.map((entry) => this.layer(entry).catch((error) => ({ error }))))
    const problems = []
    target.clearRect(0, 0, this.size, this.size)
    target.fillStyle = '#7a7a7a'
    target.fillRect(0, 0, this.size, this.size)
    pictures.forEach((picture, index) => {
      if (picture.error) problems.push(`${layers[index].src}: ${picture.error.message}`)
      else target.drawImage(picture, 0, 0, this.size, this.size)
    })
    return problems
  }
}

export class RomComposer {
  constructor(root, manifest) {
    this.root = root
    this.manifest = manifest
    this.pictures = new Map()
    this.palettes = null
  }

  async loadPalettes() {
    this.palettes ??= (async () => {
      const response = await fetch(this.root + this.manifest.palettes)
      if (!response.ok) throw new Error(`${this.manifest.palettes} could not be loaded (${response.status})`)
      const { palettes } = await response.json()
      return new Map(Object.entries(palettes).map(([id, hex]) => [Number(id), paletteBytes(hex)]))
    })()
    return this.palettes
  }

  picture(id) {
    if (!this.pictures.has(id)) {
      const entry = this.manifest.pictures[id]
      this.pictures.set(id, (async () => {
        if (!entry) throw new Error(`picture ${id} is not in the manifest`)
        const response = await fetch(this.root + entry.src)
        if (!response.ok) throw new Error(`${entry.src} could not be loaded (${response.status})`)
        return pictureOf(entry, await decodeIndexedPng(new Uint8Array(await response.arrayBuffer())))
      })())
    }
    return this.pictures.get(id)
  }

  /** Compose every slot tile of a plan. Returns { tiles, problems }. */
  async compose(plan) {
    const needed = filesForPlan(this.manifest, plan)
    const problems = []
    const palettes = await this.loadPalettes()
    const loaded = new Map()
    await Promise.all(needed.pictures.map(async (id) => {
      try {
        loaded.set(id, await this.picture(id))
      } catch (error) {
        problems.push(error.message)
      }
    }))
    const empty = { width: 0, height: 0, eightBit: true, payload: new Uint8Array(0) }
    const store = {
      picture: (id) => loaded.get(id) ?? empty,
      palette: (id) => palettes.get(id) ?? (problems.push(`palette ${id} is not in ${this.manifest.palettes}`), new Uint8Array(0)),
    }
    const tiles = composeSlots(this.manifest, plan, store)
    for (const tile of Object.values(tiles)) tile.rgba = tileRgba(tile)
    return { tiles, problems: [...new Set(problems)] }
  }
}
