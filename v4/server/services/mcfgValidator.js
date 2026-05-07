import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import yauzl from 'yauzl'
import { XMLParser } from 'fast-xml-parser'
import { runProcess } from '../lib/utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const v4Root = path.resolve(__dirname, '..', '..')
const mappingPath = path.join(v4Root, 'specs', 'font-metrics-mapping.json')
const mcfgBin = path.join(v4Root, '.venv', 'bin', 'mcfg')

export async function loadMapping() {
  try {
    const raw = await readFile(mappingPath, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed.mappings || {}
  } catch {
    return {}
  }
}

export function lookupMapping(mapping, familyRaw) {
  if (!familyRaw || !mapping) return null
  const family = String(familyRaw).normalize('NFC')
  return mapping[family] || null
}

export async function parseHeaderFontFaces(hwpxPath) {
  const headerXml = await readEntryFromZip(hwpxPath, 'Contents/header.xml')
  if (!headerXml) return []
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'hh:font' || name === 'hh:fontface' || name === 'fontface' || name === 'font'
  })
  const tree = parser.parse(headerXml)
  return extractFontFaces(tree)
}

function extractFontFaces(node) {
  const result = []
  function walk(n) {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(walk); return }
    for (const [key, value] of Object.entries(n)) {
      const localName = key.includes(':') ? key.split(':').pop() : key
      if (localName === 'font' && value) {
        const items = Array.isArray(value) ? value : [value]
        for (const item of items) {
          const family = item['@_name'] || item.name || item['@_face']
          if (family) {
            result.push({
              family: String(family).normalize('NFC'),
              type: item['@_type'] || 'ttf',
              id: item['@_id'] || ''
            })
          }
        }
      } else if (typeof value === 'object') {
        walk(value)
      }
    }
  }
  walk(node)
  return result
}

export async function runMcfgCompare(specA, specB, { format = 'json' } = {}) {
  const args = ['compare', specA, specB, '--format', format]
  const proc = await runProcess(mcfgBin, args, v4Root, { timeoutMs: 15000 })
  if (!proc.ok) {
    return { ok: false, stderr: (proc.stderr || '').slice(0, 200) }
  }
  try {
    const parsed = JSON.parse(proc.stdout)
    const mismatchCount = parsed?.advanceDiff?.mismatchCount ?? 0
    return { ok: true, raw: parsed, mismatchCount }
  } catch (err) {
    return { ok: false, stderr: `JSON parse failed: ${err.message}` }
  }
}

function readEntryFromZip(zipPath, entryName) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err)
      let found = false
      zipfile.on('entry', (entry) => {
        if (entry.fileName === entryName) {
          zipfile.openReadStream(entry, (err2, stream) => {
            if (err2) return reject(err2)
            const chunks = []
            stream.on('data', (c) => chunks.push(c))
            stream.on('end', () => {
              found = true
              zipfile.close()
              resolve(Buffer.concat(chunks).toString('utf-8'))
            })
            stream.on('error', reject)
          })
        } else {
          zipfile.readEntry()
        }
      })
      zipfile.on('end', () => { if (!found) resolve(null) })
      zipfile.on('error', reject)
      zipfile.readEntry()
    })
  })
}
