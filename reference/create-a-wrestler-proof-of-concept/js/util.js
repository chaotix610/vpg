/**
 * Reference implementation module. Teaching focus: how the Create-A-Wrestler proof of concept separates pure asset recipes from DOM and Babylon side effects.
 * File: reference/create-a-wrestler-poc/js/util.js
 *
 * Read the public types and exported functions first; callers show how this
 * module participates in the larger data → rules → presentation pipeline.
 */
import { icon } from './icons.js'

export function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

export function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value))
}

export function plural(count, word, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`
}

/** Replace every <span data-icon="name"> placeholder inside root with its SVG. */
export function paintIcons(root = document) {
  for (const holder of root.querySelectorAll('[data-icon]')) {
    if (holder.dataset.painted) continue
    holder.innerHTML = icon(holder.dataset.icon, { size: Number(holder.dataset.size) || 16 })
    holder.dataset.painted = '1'
  }
}

export function toast(title, description = '', options = {}) {
  const region = document.querySelector('[data-toasts]')
  if (!region) return
  const node = document.createElement('div')
  node.className = 'toast'
  node.innerHTML = `${icon(options.icon ?? 'info', { size: 16 })}<div><strong>${escape(title)}</strong>${description ? `<span>${escape(description)}</span>` : ''}</div>`
  region.append(node)
  setTimeout(() => node.remove(), options.duration ?? 3600)
}

export function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function storage() {
  try {
    const probe = '__caw_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

export function on(root, type, selector, handler) {
  root.addEventListener(type, (event) => {
    const target = event.target.closest(selector)
    if (target && root.contains(target)) handler(event, target)
  })
}

export function hexToRgb(hex) {
  const value = parseInt(String(hex).replace('#', ''), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}
