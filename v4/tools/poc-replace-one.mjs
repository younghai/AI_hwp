#!/usr/bin/env node
// PoC: rhwp 0.7.6+ replaceOne / exportHwpx 로 R5 (단락 hp:run / linesegarray 잔존)
// 문제를 우회한다.
//
// 동작:
//   1. templates/gonmun.hwpx 를 WASM 으로 로드
//   2. 첫 페이지 SVG 에서 후보 토큰 추출 (>=2글자 한글/영문 단어)
//   3. saveSnapshot → replaceOne(token → 'PoC_<token>') → renderPageSvg
//   4. SVG 안에 PoC 마커가 들어갔는지 확인
//   5. exportHwpx() 로 바이트 직렬화 → 새 HwpDocument 로 재로드 → 같은 마커 검출
//   6. 처음 doc 은 restoreSnapshot 으로 원복
//
// 실행:
//   node v4/tools/poc-replace-one.mjs
//   node v4/tools/poc-replace-one.mjs <hwpx 파일>

import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const v4Root = path.resolve(__dirname, '..')
const wasmPath = path.join(v4Root, 'node_modules', '@rhwp', 'core', 'rhwp_bg.wasm')

const inputPath = process.argv[2] || path.join(v4Root, 'templates', 'gonmun.hwpx')

function extractTextFromSvg(svg) {
  // rhwp SVG 는 글자 단위로 <text> 를 분리하므로 전체를 모아 공백 없이 이어붙인다.
  const matches = svg.match(/<text[^>]*>([\s\S]*?)<\/text>/g) || []
  return matches
    .map((m) => m.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
    .join('')
}

function pickToken(text) {
  // 한글/영문 2~12 글자, 숫자만/기호만 제외.
  const compact = text.replace(/\s+/g, '')
  const re = /[A-Za-z\u3131-\uD79D]{2,12}/g
  const seen = new Set()
  let m
  while ((m = re.exec(compact)) !== null) {
    const w = m[0]
    if (seen.has(w)) continue
    seen.add(w)
    if (w.length >= 3) return w
  }
  return [...seen][0] || null
}

async function main() {
  const m = await import('@rhwp/core')
  globalThis.measureTextWidth = (_font, text) => String(text || '').length * 8
  const wasmBytes = await readFile(wasmPath)
  await m.default({ module_or_path: wasmBytes })

  const bytes = await readFile(inputPath)
  const doc = new m.HwpDocument(new Uint8Array(bytes))
  console.log(`▷ 입력: ${inputPath} (${bytes.length} bytes, ${doc.pageCount()} 페이지)`)

  const originalSvg = doc.renderPageSvg(0)
  const text = extractTextFromSvg(originalSvg)

  // replaceOne 은 한 text run 안의 연속 문자열만 매칭. rhwp 가 한국어를 글자
  // 단위로 분리하는 경우가 많아 한글 다중 글자는 매칭 안 될 수 있다. 따라서
  // 후보 우선순위: (1) 공통 placeholder ASCII 토큰 → (2) SVG 추출 토큰 → (3) 'OOO' 폴백.
  const candidates = [
    'OOO', 'XXX', 'TBD', 'AAA',
    pickToken(text),
    'OOO'
  ].filter(Boolean)

  let token = null
  for (const cand of candidates) {
    doc.saveSnapshot && doc.saveSnapshot()
    try {
      const probe = doc.replaceOne(cand, cand + '_PoC_PROBE', true)
      const obj = (() => { try { return JSON.parse(probe) } catch { return { ok: true } } })()
      if (obj.ok) { token = cand; break }
    } catch {} finally {
      doc.restoreSnapshot && doc.restoreSnapshot()
    }
  }
  if (!token) {
    console.error('✗ 후보 토큰 모두 매칭 실패 — 템플릿에 잘 알려진 placeholder 가 없거나 한국어가 분리됨')
    doc.free()
    process.exit(2)
  }
  const replacement = `PoC_${token}`
  console.log(`▷ 치환 대상: "${token}"  →  "${replacement}"`)

  const hasSnap = typeof doc.saveSnapshot === 'function'
  if (hasSnap) doc.saveSnapshot()

  let exportedBytes = null
  try {
    doc.replaceOne(token, replacement, true)
    // rhwp 는 글자 단위로 <text> 를 분리하므로 raw SVG 에는 마커가 연속으로
    // 나타나지 않는다. 추출 텍스트로 비교한다.
    const replacedSvg = doc.renderPageSvg(0)
    const replacedText = extractTextFromSvg(replacedSvg)
    if (!replacedText.includes(replacement)) {
      console.error('✗ replaceOne 후 추출 텍스트에서 치환 마커를 찾지 못함')
      console.error('  추출 텍스트(앞부분):', replacedText.substring(0, 200))
      process.exit(3)
    }
    console.log('✓ SVG 미리보기 추출 텍스트에 치환 반영 확인')

    if (typeof doc.exportHwpx === 'function') {
      const out = doc.exportHwpx()
      exportedBytes = out instanceof Uint8Array ? out : new Uint8Array(out)
      console.log(`✓ exportHwpx() OK (${exportedBytes.length} bytes)`)
    }
  } finally {
    if (hasSnap && typeof doc.restoreSnapshot === 'function') {
      try { doc.restoreSnapshot() } catch (err) { console.warn('restoreSnapshot warn:', err?.message) }
    }
    doc.free()
  }

  if (exportedBytes) {
    const reloaded = new m.HwpDocument(exportedBytes)
    try {
      const reloadedText = extractTextFromSvg(reloaded.renderPageSvg(0))
      if (reloadedText.includes(replacement)) {
        console.log('✓ 재로드 추출 텍스트에 치환 마커 보존 (R1 self-reload integrity)')
      } else {
        console.warn('⚠ 재로드 텍스트에 마커 없음 — 직렬화/재로드 사이 누락 가능')
      }
      console.log(`✓ 재로드 페이지 수: ${reloaded.pageCount()}`)
    } finally {
      reloaded.free()
    }
  } else {
    console.log('· exportHwpx 미사용 (API 부재 또는 비활성화)')
  }

  console.log('PoC 완료.')
}

main().catch((err) => {
  console.error('✗ PoC 실패:', err)
  process.exit(1)
})
