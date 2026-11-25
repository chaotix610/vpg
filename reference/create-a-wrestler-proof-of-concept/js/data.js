/**
 * Reference implementation module. Teaching focus: how the Create-A-Wrestler proof of concept separates pure asset recipes from DOM and Babylon side effects.
 * File: reference/create-a-wrestler-poc/js/data.js
 *
 * Read the public types and exported functions first; callers show how this
 * module participates in the larger data → rules → presentation pipeline.
 */
/* The roster: the JSON files in data/wrestlers, plus edits and created wrestlers kept in
   this browser until they are exported or discarded. */
import { storage } from './util.js'

const KEY = 'vpg-caw:roster:v1'

export const HEIGHT_CLASSES = { 36: 'Short (class)', 37: 'Medium (class)', 38: 'Tall (class)', 39: 'Tall, shown fake' }
export const WEIGHT_CLASSES = { 500: 'Light heavy', 501: 'Heavy', 502: 'Super heavy', 503: '400 lb, shown fake' }

export function heightText(raw) {
  if (raw in HEIGHT_CLASSES) return HEIGHT_CLASSES[raw].replace(' (class)', '').toLowerCase()
  const inches = 60 + Number(raw)
  return `${Math.floor(inches / 12)}'${inches % 12}"`
}

export function heightInches(raw) {
  return { 36: 67, 37: 73, 38: 78, 39: 79 }[raw] ?? 60 + Number(raw)
}

export function weightText(raw) {
  if (raw in WEIGHT_CLASSES) return WEIGHT_CLASSES[raw].toLowerCase()
  return `${Number(raw) + 100} lb`
}

export function weightPounds(raw) {
  return { 500: 230, 501: 290, 502: 380, 503: 400 }[raw] ?? Number(raw) + 100
}

const clone = (value) => JSON.parse(JSON.stringify(value))

export class Roster {
  constructor(look) {
    this.look = look
    this.wrestlers = []
    this.changes = []
    this.store = storage()
  }

  async load(root = 'data/') {
    const response = await fetch(`${root}roster.json`)
    if (!response.ok) throw new Error(`data/roster.json could not be loaded (${response.status})`)
    const index = await response.json()
    const files = await Promise.all(index.wrestlers.map(async (id) => {
      const reply = await fetch(`${root}wrestlers/${id}.json`)
      if (!reply.ok) throw new Error(`data/wrestlers/${id}.json could not be loaded (${reply.status})`)
      return reply.json()
    }))
    this.template = clone(files.find((doc) => doc.id === 'default') ?? files[0])
    const saved = this.read()
    const removed = new Set(saved.removed ?? [])
    this.wrestlers = files.filter((doc) => !removed.has(doc.id)).map((doc) => {
      const edit = saved.edited?.[doc.id]
      if (edit) {
        doc.profile = edit.profile
        doc.look = edit.look
        doc.edited = true
      }
      return doc
    })
    for (const doc of saved.created ?? []) this.wrestlers.push({ ...doc, created: true })
    this.changes = saved.changes ?? []
    for (const doc of this.wrestlers) for (const costume of doc.look.costumes) this.look.normalise(costume)
    return this.wrestlers
  }

  read() {
    if (!this.store) return {}
    try {
      return JSON.parse(this.store.getItem(KEY) ?? '{}')
    } catch {
      return {}
    }
  }

  save() {
    if (!this.store) return false
    const edited = {}
    for (const doc of this.wrestlers) if (doc.edited && !doc.created) edited[doc.id] = { profile: doc.profile, look: doc.look }
    const created = this.wrestlers.filter((doc) => doc.created).map((doc) => {
      const { created: flag, edited: touched, ...rest } = doc
      return rest
    })
    const removed = [...new Set([...(this.read().removed ?? []), ...(this.removed ?? [])])]
    try {
      this.store.setItem(KEY, JSON.stringify({ edited, created, removed, changes: this.changes.slice(-300) }))
      return true
    } catch {
      return false
    }
  }

  get(id) {
    return this.wrestlers.find((doc) => doc.id === id) ?? null
  }

  slotOf(doc) {
    return this.wrestlers.indexOf(doc) + 1
  }

  touch(doc, note) {
    doc.edited = true
    this.changes.push({ at: Date.now(), id: doc.id, note })
    return this.save()
  }

  add() {
    const doc = clone(this.template)
    let number = this.wrestlers.length + 1
    while (this.get(`created-${number}`)) number += 1
    doc.id = `created-${number}`
    doc.rosterIndex = null
    doc.profile.fullName = `NEW WRESTLER ${number}`
    doc.profile.shortName = 'NEW'
    doc.source = { game: 'Create-A-Wrestler', extractedWith: null, created: new Date().toISOString() }
    doc.created = true
    for (const costume of doc.look.costumes) this.look.normalise(costume)
    this.wrestlers.push(doc)
    this.changes.push({ at: Date.now(), id: doc.id, note: `${doc.profile.fullName} added` })
    this.save()
    return doc
  }

  remove(doc) {
    if (!doc.created) return false
    this.wrestlers = this.wrestlers.filter((entry) => entry !== doc)
    this.changes.push({ at: Date.now(), id: doc.id, note: `${doc.profile.fullName} removed` })
    this.save()
    return true
  }

  discard() {
    this.store?.removeItem(KEY)
  }

  /** One wrestler, as the JSON file it would be in data/wrestlers. */
  document(doc) {
    const { created, edited, ...rest } = doc
    return rest
  }

  exportAll() {
    return { count: this.wrestlers.length, exportedWith: 'VPG Create-A-Wrestler', wrestlers: this.wrestlers.map((doc) => this.document(doc)) }
  }
}
