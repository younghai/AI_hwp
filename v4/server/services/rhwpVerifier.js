import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const v4Root = path.resolve(__dirname, '..', '..')
const wasmPath = path.join(v4Root, 'node_modules', '@rhwp', 'core', 'rhwp_bg.wasm')

let initPromise = null

async function ensureRhwp() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const m = await import('@rhwp/core')
    if (typeof globalThis.measureTextWidth !== 'function') {
      // Node 환경에는 Canvas API 가 없다. validation 경로에서는 텍스트 폭 정확도가
      // 필요 없으므로 (page count + 비표준 경고만 사용) 추정값으로 충분하다.
      globalThis.measureTextWidth = (_font, text) => String(text || '').length * 8
    }
    const wasmBytes = await readFile(wasmPath)
    await m.default({ module_or_path: wasmBytes })
    return m
  })().catch((err) => {
    initPromise = null
    throw err
  })
  return initPromise
}

function safeParseWarnings(raw) {
  if (typeof raw !== 'string' || !raw) return { count: 0, summary: {}, warnings: [] }
  try {
    const parsed = JSON.parse(raw)
    return {
      count: Number(parsed?.count || 0),
      summary: parsed?.summary && typeof parsed.summary === 'object' ? parsed.summary : {},
      warnings: Array.isArray(parsed?.warnings) ? parsed.warnings : []
    }
  } catch {
    return { count: 0, summary: {}, warnings: [] }
  }
}

/**
 * 생성된 HWPX 를 rhwp WASM 으로 다시 로드해 self-reload 검증 + 비표준 경고 수집.
 *
 * 반환:
 *   - available=true:  { pageCount, sourceFormat, warnings[], warningSummary{}, warningCount }
 *   - available=false: { note }   (init 실패 또는 파싱 실패)
 *
 * R1 의 "preview ≠ download" 보장을 보강하기 위한 1차 게이트:
 *   pageCount === 0 또는 파싱 자체 실패면 결과물이 한컴 호환이 아니라는 강한 신호.
 */
export async function verifyHwpxWithRhwp(hwpxPath) {
  try {
    const m = await ensureRhwp()
    const bytes = await readFile(hwpxPath)
    const doc = new m.HwpDocument(new Uint8Array(bytes))
    try {
      const pageCount = doc.pageCount()
      const warnings = safeParseWarnings(doc.getValidationWarnings())
      const sourceFormat = typeof doc.getSourceFormat === 'function' ? doc.getSourceFormat() : 'hwpx'
      return {
        available: true,
        pageCount,
        sourceFormat,
        warningCount: warnings.count,
        warningSummary: warnings.summary,
        warnings: warnings.warnings
      }
    } finally {
      doc.free()
    }
  } catch (err) {
    return { available: false, note: `rhwp WASM 검증 실패: ${err.message}` }
  }
}

/**
 * rhwp WASM 결과를 validator.js 의 violation 포맷으로 변환.
 *   - pageCount === 0 : structural error (preview ≠ download 가능성)
 *   - validation warnings : 한컴 호환 위험 warning
 */
export function rhwpResultToViolations(result) {
  if (!result || !result.available) return []
  const violations = []

  if (result.pageCount === 0) {
    violations.push({
      axis: 'structure',
      code: 'RHWP-SELF-RELOAD-EMPTY',
      severity: 'error',
      message: 'rhwp WASM 으로 재로드 시 페이지 수가 0이었습니다. HWPX 구조 손상 가능 (preview ≠ download 위험).',
      location: 'document',
      source: 'rhwp-wasm'
    })
  }

  for (const w of result.warnings) {
    const cellSuffix = w.cell ? ` cell=${JSON.stringify(w.cell)}` : ''
    violations.push({
      axis: 'structure',
      code: `RHWP-${w.kind || 'WARNING'}`,
      severity: 'warning',
      message: `[rhwp ${result.sourceFormat}] ${w.kind || 'warning'} @ section ${w.section}, paragraph ${w.paragraph}${cellSuffix}`,
      location: w.cell ? `s${w.section}/p${w.paragraph}/cell` : `s${w.section}/p${w.paragraph}`,
      source: 'rhwp-wasm'
    })
  }

  return violations
}
