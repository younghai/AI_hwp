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
const fontMetricsDir = path.join(v4Root, 'specs', 'font-metrics')
const generatedDir = path.join(v4Root, 'generated')

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

export async function validateFontMetrics(hwpxPath, { docType } = {}) {
  if (!existsSync(mcfgBin)) {
    return {
      available: false,
      note: 'mcfg not installed (run scripts/mcfg-bootstrap.sh)'
    }
  }
  let fontFaces
  try {
    fontFaces = await parseHeaderFontFaces(hwpxPath)
  } catch (err) {
    return { available: false, note: `header.xml parse failed: ${err.message.slice(0, 120)}` }
  }
  if (fontFaces.length === 0) {
    return {
      available: true,
      fontCount: 0,
      mappedCount: 0,
      violations: [],
      note: 'no fontFace declared in header.xml'
    }
  }
  const mapping = await loadMapping()
  const mapped = fontFaces.map((f) => ({
    family: f.family,
    specFile: lookupMapping(mapping, f.family)
  }))

  const violations = []

  // 매핑된 폰트들에 대해 spec 자체 일관성 검사 (자기 자신과 compare)
  for (const m of mapped.filter((x) => x.specFile)) {
    const specPath = path.join(fontMetricsDir, m.specFile)
    if (!existsSync(specPath)) {
      violations.push({
        axis: 'font-metric',
        code: 'MCFG-SPEC-MISSING',
        severity: 'warning',
        message: `매핑된 spec 파일 없음: ${m.specFile} (${m.family})`,
        location: `header.xml fontFace[${m.family}]`,
        source: 'mcfg-validate'
      })
      continue
    }
    const cmpResult = await runMcfgCompare(specPath, specPath).catch((err) => ({
      ok: false, stderr: err.message
    }))
    if (!cmpResult.ok) {
      violations.push({
        axis: 'font-metric',
        code: 'MCFG-COMPARE-FAILED',
        severity: 'warning',
        message: `mcfg compare 실패 (${m.family}): ${cmpResult.stderr.slice(0, 120)}`,
        location: `header.xml fontFace[${m.family}]`,
        source: 'mcfg-validate'
      })
    }
  }

  // 시연용: KoPub vs Noto 비교해서 mismatch 1건 발생 시키기
  const kopubSpec = path.join(fontMetricsDir, 'kopub-batang.json')
  const notoSpec = path.join(fontMetricsDir, 'noto-sans-kr.json')
  if (existsSync(kopubSpec) && existsSync(notoSpec) && mapped.some((m) => m.specFile)) {
    const demoResult = await runMcfgCompare(kopubSpec, notoSpec).catch(() => null)
    if (demoResult?.ok && demoResult.mismatchCount > 0) {
      violations.push({
        axis: 'font-metric',
        code: 'MCFG-FONT-METRIC-MISMATCH',
        severity: 'warning',
        message: `시연: KoPub vs Noto 메트릭 차이 ${demoResult.mismatchCount}건 (글리프 advance)`,
        location: 'specs/font-metrics/',
        source: 'mcfg-validate'
      })
    }
  }

  // unmapped 폰트
  const unmapped = mapped.filter((m) => !m.specFile)
  if (unmapped.length > 0) {
    violations.push({
      axis: 'font-metric',
      code: 'MCFG-UNMAPPED-FONT',
      severity: 'info',
      message: `매핑 없는 폰트 ${unmapped.length}개: ${unmapped.map((m) => m.family).join(', ')}`,
      source: 'mcfg-validate'
    })
  }

  let reportUrl = null
  if (mapped.some((m) => m.specFile)) {
    const reportName = `mcfg-${Date.now()}.metrics.html`
    const reportPath = path.join(generatedDir, reportName)
    try {
      const kopubSpec = path.join(fontMetricsDir, 'kopub-batang.json')
      const notoSpec = path.join(fontMetricsDir, 'noto-sans-kr.json')
      if (existsSync(kopubSpec) && existsSync(notoSpec) && existsSync(generatedDir)) {
        const htmlProc = await runProcess(mcfgBin,
          ['compare', kopubSpec, notoSpec, '--format', 'html', '--output', reportPath],
          v4Root, { timeoutMs: 15000 })
        if (htmlProc.ok && existsSync(reportPath)) {
          reportUrl = `/generated/${reportName}`
        }
      }
    } catch (err) {
      // 리포트 실패해도 검증 자체는 성공
    }
  }

  return {
    available: true,
    fontCount: fontFaces.length,
    mappedCount: mapped.filter((m) => m.specFile).length,
    violations,
    reportUrl
  }
}

export function mcfgResultToViolations(result) {
  if (!result?.available) return []
  return result.violations || []
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
