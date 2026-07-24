import path from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { runProcess } from '../lib/utils.js'
import { validateWithPolarisDvc } from './polarisValidator.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const v4Root = path.resolve(__dirname, '..', '..')
const validatorScript = path.join(v4Root, 'scripts', 'validators', 'validate.py')

async function runNativeValidator(hwpxPath) {
  if (!existsSync(validatorScript)) {
    return { violations: [], note: `native 검증기 스크립트를 찾지 못했습니다: ${validatorScript}` }
  }
  try {
    const result = await runProcess('python3', [validatorScript, hwpxPath, '--format=json'], v4Root, { timeoutMs: 15000 })
    const raw = result.stdout.trim()
    if (!raw) return { violations: [], note: '검증기가 출력을 내지 않았습니다.' }
    try {
      const parsed = JSON.parse(raw)
      return {
        violations: (parsed.violations || []).map((v) => ({ ...v, source: 'v3-native' }))
      }
    } catch {
      return { violations: [], note: `native 검증기 응답 파싱 실패: ${raw.slice(0, 120)}` }
    }
  } catch (err) {
    return { violations: [], note: `native 검증기 실행 실패: ${err.message}` }
  }
}

function buildDiagramViolations({ expectedDiagramCount = 0, diagramReport }) {
  if (!expectedDiagramCount) return []
  if (!diagramReport) {
    return [{
      axis: 'other',
      code: 'APP-DIAGRAM-REPORT-MISSING',
      severity: 'warning',
      message: `다이어그램 ${expectedDiagramCount}개가 요청되었지만 임베딩 결과 보고서를 읽지 못했습니다.`,
      location: 'diagram-embed',
      source: 'app-postcheck'
    }]
  }

  const embeddedCount = Number(diagramReport.embeddedCount || 0)
  const requestedCount = Number(diagramReport.requestedCount || expectedDiagramCount)
  const skipped = Array.isArray(diagramReport.skipped) ? diagramReport.skipped : []
  const violations = []

  if (embeddedCount < requestedCount) {
    violations.push({
      axis: 'other',
      code: embeddedCount === 0 ? 'APP-DIAGRAM-EMBED-NONE' : 'APP-DIAGRAM-EMBED-PARTIAL',
      severity: embeddedCount === 0 ? 'error' : 'warning',
      message: `다이어그램 ${requestedCount}개 중 ${embeddedCount}개만 HWPX 결과물에 반영되었습니다.`,
      location: 'diagram-embed',
      source: 'app-postcheck'
    })
  }

  skipped.forEach((item, index) => {
    violations.push({
      axis: 'other',
      code: 'APP-DIAGRAM-SKIPPED',
      severity: 'warning',
      message: `${item.title || item.type || `diagram-${index + 1}`} 임베딩 스킵: ${item.reason || 'unknown'}`,
      location: item.afterSection || item.afterSectionIndex != null ? `section:${item.afterSection || item.afterSectionIndex}` : 'diagram-embed',
      source: 'app-postcheck'
    })
  })

  return violations
}

/**
 * HWPX 검증 — native + (옵션) polaris_dvc 를 병행 실행해 결과를 합친다.
 *
 * 반환:
 *   {
 *     ok: boolean,
 *     errorCount, warningCount,
 *     violations: [{ axis, code, severity, message, location, source }],
 *     engines: [{ name, available, violationCount, note? }]
 *   }
 */
export async function validateHwpx(hwpxPath, { docType, diagramReport, expectedDiagramCount = 0 } = {}) {
  const [native, polaris] = await Promise.all([
    runNativeValidator(hwpxPath),
    validateWithPolarisDvc(hwpxPath, { docType }).catch((err) => ({
      engine: 'polaris-dvc',
      available: false,
      violations: [],
      note: `polaris-dvc 실행 예외: ${err.message}`
    }))
  ])

  const polarisViolations = (polaris.violations || []).map((v) => ({ ...v, source: 'polaris-dvc' }))
  const diagramViolations = buildDiagramViolations({ expectedDiagramCount, diagramReport })
  const violations = [...native.violations, ...polarisViolations, ...diagramViolations]
  const errorCount = violations.filter((v) => v.severity === 'error').length
  const warningCount = violations.filter((v) => v.severity === 'warning').length

  return {
    ok: errorCount === 0,
    errorCount,
    warningCount,
    violations,
    engines: [
      { name: 'v3-native', available: true, violationCount: native.violations.length, note: native.note },
      {
        name: 'polaris-dvc',
        available: !!polaris.available,
        violationCount: polarisViolations.length,
        note: polaris.reason || polaris.note,
        dvcStrict: polaris.dvcStrict,
        enableSchema: polaris.enableSchema,
        specPath: polaris.specPath
      },
      {
        name: 'diagram-embed',
        available: true,
        violationCount: diagramViolations.length,
        note: expectedDiagramCount
          ? `requested=${expectedDiagramCount}, embedded=${Number(diagramReport?.embeddedCount || 0)}`
          : 'no diagrams requested'
      }
    ]
  }
}
