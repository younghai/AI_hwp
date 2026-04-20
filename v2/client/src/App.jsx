import { useEffect, useRef, useState } from 'react'
import initRhwp, { HwpDocument } from '@rhwp/core'

const DOC_TYPES = [
  { value: 'report', label: '보고서' },
  { value: 'proposal', label: '제안서' },
  { value: 'minutes', label: '회의록' },
  { value: 'gonmun', label: '공문서' },
  { value: 'base', label: '기본 문서' }
]

function extractTextFromSvg(svg) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svg, 'image/svg+xml')
  const nodes = Array.from(doc.querySelectorAll('text, tspan'))
  const lines = nodes
    .map((node) => node.textContent?.trim() || '')
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
  return lines.join('\n')
}

function buildPreviewToc(docType) {
  const templates = {
    report: ['배경 및 목적', '현황 분석', '핵심 제안', '실행 계획', '기대 효과'],
    proposal: ['제안 개요', '문제 정의', '해결 방안', '구현 일정', '운영 지원'],
    minutes: ['회의 개요', '주요 논의', '결정 사항', '후속 액션', '일정 공유'],
    gonmun: ['문서 개요', '추진 배경', '요청 사항', '처리 기준', '협조 요청'],
    base: ['문서 개요', '핵심 내용', '세부 항목', '실행 계획', '참고 사항']
  }
  return templates[docType] || templates.report
}

function buildOptimisticDraft({ sourceInsight, docType, companyName, goal, notes, targetTitle }) {
  const lines = String(sourceInsight.extractedText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const excerpt = lines.slice(0, 8)
  const toc = buildPreviewToc(docType)
  const inferredTitle = targetTitle || (sourceInsight.fileName ? sourceInsight.fileName.replace(/\.(hwp|hwpx)$/i, '') : '문서 초안')

  return {
    title: inferredTitle,
    summary: `${companyName} 기준으로 업로드 문서 내용을 정리해 ${DOC_TYPES.find((item) => item.value === docType)?.label || docType} 초안을 생성하는 중입니다.`,
    toc,
    sections: toc.map((heading, index) => ({
      heading,
      body: [
        excerpt[index] ? `원문 핵심 문장 "${excerpt[index]}"을 바탕으로 ${heading} 내용을 정리합니다.` : `${heading} 내용을 원문 흐름에 맞게 재구성합니다.`,
        goal ? `생성 요청은 "${goal}" 입니다.` : '',
        notes ? `추가 메모 "${notes}"를 반영합니다.` : '',
        `${inferredTitle} 문서의 ${heading} 섹션 초안을 준비하고 있습니다.`
      ].filter(Boolean).join(' ')
    })),
    sourceExcerpt: excerpt,
    engine: 'optimistic-preview'
  }
}

function getDraftStageItems() {
  return [
    '원본 문서 분석 완료',
    '목차 재구성',
    '초안 생성 완료'
  ]
}

function getDraftItemStatus(draft) {
  return draft?.engine === 'optimistic-preview' ? '준비 중' : '생성됨'
}

function getDraftSectionLabel(draft) {
  return draft?.engine === 'optimistic-preview' ? 'AI 초안 구성 중' : '원문 기반 · AI 재구성'
}

// ── Diagram renderer (port of scripts/diagram_templates.py) ──────────────────
const D = {
  PAPER: '#faf7f2', INK: '#1c1917', MUTED: '#78716c',
  ACCENT: '#b5523a', RULE: 'rgba(28,25,23,0.12)',
  FONT: 'Arial, sans-serif', MONO: 'Courier New, monospace',
  W: 605, H: 302
}

function _dotGrid() {
  return (
    `<defs><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">` +
    `<circle cx="11" cy="11" r="0.9" fill="${D.INK}" opacity="0.10"/></pattern></defs>` +
    `<rect width="${D.W}" height="${D.H}" fill="${D.PAPER}"/>` +
    `<rect width="${D.W}" height="${D.H}" fill="url(#dots)"/>`
  )
}

function _arrowDefs() {
  return (
    `<defs>` +
    `<marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">` +
    `<path d="M0,0 L0,6 L8,3 z" fill="${D.MUTED}"/></marker>` +
    `</defs>`
  )
}

function _legendLine(label) {
  const legY = D.H - 8
  const pad = 20
  return (
    `<line x1="${pad}" y1="${legY - 4}" x2="${D.W - pad}" y2="${legY - 4}" stroke="${D.RULE}" stroke-width="0.8"/>` +
    `<text x="${pad}" y="${legY + 2}" font-family="${D.MONO}" font-size="7" fill="${D.MUTED}">${label}</text>`
  )
}

function _svgWrap(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${D.W}" height="${D.H}" viewBox="0 0 ${D.W} ${D.H}">${body}</svg>`
}

function diagramFlowchart(steps, title = '') {
  const s = steps.slice(0, 5)
  if (!s.length) return null
  const pad = 20, arrowW = 24
  const nodeW = Math.floor((D.W - 2 * pad - (s.length - 1) * arrowW) / s.length)
  const nodeH = 44
  let nodeY = Math.floor((D.H - nodeH) / 2)
  if (title) nodeY += 12

  let body = _dotGrid() + _arrowDefs()

  if (title) {
    body += `<text x="${D.W / 2}" y="20" text-anchor="middle" font-family="${D.FONT}" font-size="11" font-weight="700" fill="${D.INK}">${title}</text>`
  }

  s.forEach((step, i) => {
    const x = pad + i * (nodeW + arrowW)
    const focal = i === 0
    const fill = focal ? `${D.ACCENT}22` : D.PAPER
    const stroke = focal ? D.ACCENT : D.MUTED
    const sw = focal ? 1.4 : 0.8
    const tc = focal ? D.ACCENT : D.INK

    body += `<rect x="${x}" y="${nodeY}" width="${nodeW}" height="${nodeH}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
    body += `<text x="${x + 10}" y="${nodeY + 14}" font-family="${D.MONO}" font-size="8" fill="${D.MUTED}">${i + 1}</text>`

    const words = String(step).split(' ')
    let line1 = '', line2 = ''
    for (const w of words) {
      if ((line1 + ' ' + w).trim().length <= 14) line1 = (line1 + ' ' + w).trim()
      else line2 = (line2 + ' ' + w).trim()
    }
    const cy = nodeY + Math.floor(nodeH / 2)
    if (line2) {
      body += `<text x="${x + nodeW / 2}" y="${cy - 5}" text-anchor="middle" font-family="${D.FONT}" font-size="10" font-weight="700" fill="${tc}">${line1}</text>`
      body += `<text x="${x + nodeW / 2}" y="${cy + 9}" text-anchor="middle" font-family="${D.FONT}" font-size="10" fill="${tc}">${line2}</text>`
    } else {
      body += `<text x="${x + nodeW / 2}" y="${cy + 4}" text-anchor="middle" font-family="${D.FONT}" font-size="10" font-weight="700" fill="${tc}">${line1}</text>`
    }

    if (i < s.length - 1) {
      const ax = x + nodeW + 2, midY = nodeY + Math.floor(nodeH / 2)
      body += `<line x1="${ax}" y1="${midY}" x2="${ax + arrowW - 6}" y2="${midY}" stroke="${D.MUTED}" stroke-width="0.8" marker-end="url(#arr)"/>`
    }
  })

  body += _legendLine('FLOWCHART')
  return _svgWrap(body)
}

function diagramTimeline(items, title = '') {
  const its = items.slice(0, 6)
  if (!its.length) return null
  const pad = 30
  const stepW = (D.W - 2 * pad) / Math.max(its.length - 1, 1)
  let midY = Math.floor(D.H / 2)
  if (title) midY += 10

  let body = _dotGrid()
  if (title) {
    body += `<text x="${D.W / 2}" y="18" text-anchor="middle" font-family="${D.FONT}" font-size="11" font-weight="700" fill="${D.INK}">${title}</text>`
  }
  body += `<line x1="${pad}" y1="${midY}" x2="${D.W - pad}" y2="${midY}" stroke="${D.MUTED}" stroke-width="1"/>`

  its.forEach((item, i) => {
    const x = Math.round(pad + i * stepW)
    const focal = i === 0
    const r = focal ? 6 : 4
    const fill = focal ? D.ACCENT : D.PAPER
    const stroke = focal ? D.ACCENT : D.MUTED
    const sw = focal ? 1.4 : 0.8
    const tc = focal ? D.ACCENT : D.INK
    const label = item.label || ''
    const date = item.date || ''

    body += `<circle cx="${x}" cy="${midY}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`

    if (i % 2 === 0) {
      body += `<text x="${x}" y="${midY - 18}" text-anchor="middle" font-family="${D.FONT}" font-size="9" font-weight="700" fill="${tc}">${label}</text>`
      if (date) body += `<text x="${x}" y="${midY + 22}" text-anchor="middle" font-family="${D.MONO}" font-size="7.5" fill="${D.MUTED}">${date}</text>`
    } else {
      body += `<text x="${x}" y="${midY + 22}" text-anchor="middle" font-family="${D.FONT}" font-size="9" font-weight="700" fill="${tc}">${label}</text>`
      if (date) body += `<text x="${x}" y="${midY - 14}" text-anchor="middle" font-family="${D.MONO}" font-size="7.5" fill="${D.MUTED}">${date}</text>`
    }
  })

  body += _legendLine('TIMELINE')
  return _svgWrap(body)
}

function diagramComparison(rows, title = '') {
  const rs = rows.slice(0, 5)
  if (!rs.length) return null
  const pad = 20, colLabelW = 120, rowH = 36, headerH = 28
  const colW = Math.floor((D.W - 2 * pad - colLabelW) / 2)
  const startY = title ? 32 : 20
  const headerA = rs[0]?.header_a || '현재'
  const headerB = rs[0]?.header_b || '개선'
  const ax = pad + colLabelW, bx = ax + colW

  let body = _dotGrid()
  if (title) {
    body += `<text x="${D.W / 2}" y="16" text-anchor="middle" font-family="${D.FONT}" font-size="11" font-weight="700" fill="${D.INK}">${title}</text>`
  }

  body += (
    `<rect x="${pad}" y="${startY}" width="${colLabelW}" height="${headerH}" fill="${D.PAPER}" stroke="${D.RULE}" stroke-width="0.8"/>` +
    `<rect x="${ax}" y="${startY}" width="${colW}" height="${headerH}" fill="${D.PAPER}" stroke="${D.RULE}" stroke-width="0.8"/>` +
    `<rect x="${bx}" y="${startY}" width="${colW}" height="${headerH}" fill="${D.ACCENT}18" stroke="${D.ACCENT}" stroke-width="1"/>` +
    `<text x="${ax + colW / 2}" y="${startY + 17}" text-anchor="middle" font-family="${D.FONT}" font-size="9" fill="${D.MUTED}">${headerA}</text>` +
    `<text x="${bx + colW / 2}" y="${startY + 17}" text-anchor="middle" font-family="${D.FONT}" font-size="9" font-weight="700" fill="${D.ACCENT}">${headerB}</text>`
  )

  rs.forEach((row, i) => {
    const y = startY + headerH + i * rowH
    const bg = i % 2 === 0 ? 'rgba(28,25,23,0.02)' : D.PAPER
    body += (
      `<rect x="${pad}" y="${y}" width="${colLabelW}" height="${rowH}" fill="${bg}" stroke="${D.RULE}" stroke-width="0.6"/>` +
      `<rect x="${ax}" y="${y}" width="${colW}" height="${rowH}" fill="${bg}" stroke="${D.RULE}" stroke-width="0.6"/>` +
      `<rect x="${bx}" y="${y}" width="${colW}" height="${rowH}" fill="${D.ACCENT}08" stroke="${D.ACCENT}40" stroke-width="0.6"/>` +
      `<text x="${pad + 8}" y="${y + rowH / 2 + 4}" font-family="${D.FONT}" font-size="9" font-weight="700" fill="${D.INK}">${row.label || ''}</text>` +
      `<text x="${ax + colW / 2}" y="${y + rowH / 2 + 4}" text-anchor="middle" font-family="${D.FONT}" font-size="9" fill="${D.MUTED}">${row.a || ''}</text>` +
      `<text x="${bx + colW / 2}" y="${y + rowH / 2 + 4}" text-anchor="middle" font-family="${D.FONT}" font-size="9" fill="${D.ACCENT}">${row.b || ''}</text>`
    )
  })

  body += _legendLine('COMPARISON')
  return _svgWrap(body)
}

function renderDiagramSvg(spec) {
  if (!spec) return null
  const { type, title = '', data = [] } = spec
  if (type === 'flowchart') return diagramFlowchart(data, title)
  if (type === 'timeline') return diagramTimeline(data, title)
  if (type === 'comparison') return diagramComparison(data, title)
  return null
}

export default function App() {
  const docRef = useRef(null)
  const initPromiseRef = useRef(null)
  const parseJobRef = useRef(0)
  const previewPanelRef = useRef(null)

  const [providers, setProviders] = useState([])
  const [aiProvider, setAiProvider] = useState('anthropic')
  const [aiApiKey, setAiApiKey] = useState('')
  const [sourceFile, setSourceFile] = useState(null)
  const [parseStatus, setParseStatus] = useState('업로드한 문서를 분석하면 여기 상태가 표시됩니다.')
  const [docType, setDocType] = useState('report')

  useEffect(() => {
    fetch('/api/providers')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setProviders(data.providers)
          const configured = data.providers.find((p) => p.configured)
          if (configured) setAiProvider(configured.key)
        }
      })
      .catch(() => setParseStatus('서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.'))
  }, [])
  const [companyName, setCompanyName] = useState('Bizmatrixx')
  const [goal, setGoal] = useState('업로드한 문서의 핵심 내용을 바탕으로 임원 검토용 초안을 만들어 주세요.')
  const [notes, setNotes] = useState('핵심 메시지는 유지하고, 목차는 더 명확하게 재구성해 주세요.')
  const [targetTitle, setTargetTitle] = useState('')
  const [sourceInsight, setSourceInsight] = useState({
    fileName: '',
    pageCount: 0,
    previewSvg: '',
    extractedText: '',
    mode: ''
  })
  const [draft, setDraft] = useState(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [exportState, setExportState] = useState({ loading: false, url: '', fileName: '', message: '' })
  const [showSettings, setShowSettings] = useState(false)
  const [testResult, setTestResult] = useState('')
  const [authMode, setAuthMode] = useState('apikey')
  const [oauthStep, setOauthStep] = useState(0)

  async function ensureRhwp() {
    if (initPromiseRef.current) {
      return initPromiseRef.current
    }

    let canvasContext = null
    let lastFont = ''
    globalThis.measureTextWidth = (font, text) => {
      if (!canvasContext) {
        canvasContext = document.createElement('canvas').getContext('2d')
      }
      if (!canvasContext) {
        return Math.max(0, String(text || '').length * 8)
      }
      if (font !== lastFont) {
        canvasContext.font = font
        lastFont = font
      }
      return canvasContext.measureText(text).width
    }

    initPromiseRef.current = initRhwp()
    return initPromiseRef.current
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setSourceFile(file)
    setDraft(null)
    setExportState({ loading: false, url: '', fileName: '', message: '' })
    setParseStatus('문서를 로컬 브라우저에서 파싱하는 중입니다...')
    parseJobRef.current += 1
    const jobId = parseJobRef.current

    try {
      await ensureRhwp()
      const buffer = await file.arrayBuffer()
      if (docRef.current) {
        docRef.current.free()
      }
      const bytes = new Uint8Array(buffer)
      const document = new HwpDocument(bytes)
      docRef.current = document
      const totalPages = document.pageCount() || 1
      const previewSvg = document.renderPageSvg(0)
      const firstPageText = extractTextFromSvg(previewSvg).trim()

      setSourceInsight({
        fileName: file.name,
        pageCount: totalPages,
        previewSvg,
        extractedText: firstPageText,
        mode: file.name.toLowerCase().endsWith('.hwpx') ? 'hwpx-template' : 'hwp-source'
      })

      if (!targetTitle) {
        setTargetTitle(file.name.replace(/\.(hwp|hwpx)$/i, ''))
      }

      setParseStatus(
        file.name.toLowerCase().endsWith('.hwpx')
          ? 'HWPX 양식이 분석되었습니다. 업로드한 양식을 결과 문서 템플릿으로 재사용할 수 있습니다.'
          : 'HWP 문서가 분석되었습니다. 원문 내용을 바탕으로 새 HWPX 초안을 생성합니다.'
      )

      void enrichAdditionalPages({
        document,
        totalPages,
        initialText: firstPageText,
        jobId
      })
    } catch (error) {
      setParseStatus(`문서 분석에 실패했습니다: ${error.message}`)
    }
  }

  async function enrichAdditionalPages({ document, totalPages, initialText, jobId }) {
    if (totalPages <= 1) {
      return
    }

    const extractedPages = [initialText]

    for (let pageIndex = 1; pageIndex < Math.min(totalPages, 3); pageIndex += 1) {
      const pageSvg = document.renderPageSvg(pageIndex)
      extractedPages.push(extractTextFromSvg(pageSvg))
    }

    if (parseJobRef.current !== jobId) {
      return
    }

    setSourceInsight((current) => ({
      ...current,
      extractedText: extractedPages.join('\n').trim()
    }))
  }

  async function handleGenerateDraft() {
    if (!sourceFile) {
      setParseStatus('먼저 HWP 또는 HWPX 문서를 업로드해 주세요.')
      return
    }

    setDraftLoading(true)
    setExportState({ loading: false, url: '', fileName: '', message: '' })
    const optimisticDraft = buildOptimisticDraft({
      sourceInsight,
      docType,
      companyName,
      goal,
      notes,
      targetTitle
    })
    setDraft(optimisticDraft)
    setParseStatus('오른쪽에 초안 미리보기를 먼저 표시했습니다. 서버 응답이 오면 최신 내용으로 갱신됩니다.')
    requestAnimationFrame(() => {
      previewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })

    try {
      const response = await fetch('/api/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: sourceInsight.fileName,
          sourceText: sourceInsight.extractedText,
          docType,
          companyName,
          goal,
          notes,
          targetTitle,
          aiProvider,
          aiApiKey
        })
      })

      const payload = await response.json()
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || '초안 생성에 실패했습니다.')
      }

      setDraft(payload.draft)
      setTargetTitle(payload.draft.title)
      setParseStatus('업로드 문서를 바탕으로 새 문서 초안이 생성되었고, 오른쪽 미리보기에 바로 반영되었습니다.')
      requestAnimationFrame(() => {
        previewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } catch (error) {
      setDraft(null)
      setParseStatus(`AI 초안 생성 실패: ${error.message}`)
    } finally {
      setDraftLoading(false)
    }
  }

  async function handleExport() {
    if (!draft || !sourceFile) {
      setParseStatus('먼저 문서를 업로드하고 초안을 생성해 주세요.')
      return
    }

    setExportState({ loading: true, url: '', fileName: '', message: '' })

    try {
      const formData = new FormData()
      formData.append('title', draft.title)
      formData.append('toc', draft.toc.join('\n'))
      formData.append('sections', JSON.stringify(draft.sections))
      formData.append('diagrams', JSON.stringify(draft.diagrams || []))
      formData.append('sourceFile', sourceFile)
      formData.append('sourceMode', sourceInsight.mode)
      formData.append('sourceText', sourceInsight.extractedText)

      const response = await fetch('/api/export-hwpx', {
        method: 'POST',
        body: formData
      })

      const payload = await response.json()
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'HWPX 생성에 실패했습니다.')
      }

      setExportState({
        loading: false,
        url: payload.downloadUrl,
        fileName: payload.fileName,
        message: payload.message
      })
      setParseStatus(payload.message)
      triggerDownload(payload.downloadUrl, payload.fileName)
    } catch (error) {
      setExportState({ loading: false, url: '', fileName: '', message: '' })
      setParseStatus(error.message)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-copy">
          <p className="eyebrow">AI Document Studio</p>
          <h1>HWP / HWPX 문서 자동화</h1>
          <p className="topbar-summary">
            업로드한 문서를 바로 읽고, 추출 내용과 초안을 같은 화면에서 확인할 수 있는 localhost 데모입니다.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div className="status-chip">{sourceInsight.mode || '문서 대기'}</div>
          <button className="settings-button" type="button" onClick={() => setShowSettings(true)}>
            AI 설정
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>AI 연결 관리</h2>
              <button className="modal-close" type="button" onClick={() => setShowSettings(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="modal-desc">사용할 AI 프로바이더를 연결하세요. API 키 직접 입력 또는 OAuth 인증을 선택할 수 있습니다.</p>
              <div className="oauth-provider-list">
                {providers.map((p) => {
                  const envKey = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', kimi: 'KIMI_API_KEY', xai: 'XAI_API_KEY' }[p.key]
                  const isActive = aiProvider === p.key
                  return (
                    <div key={p.key} className={`oauth-card ${p.configured ? 'is-connected' : ''} ${isActive ? 'is-active' : ''}`}>
                      <div className="oauth-card-top">
                        <div>
                          <strong className="oauth-card-name">{p.label}</strong>
                          <span className="oauth-card-model">{p.defaultModel}</span>
                        </div>
                        {p.configured ? (
                          <div className="oauth-card-actions">
                            <span className="oauth-badge connected">연결됨</span>
                            <button className="oauth-use-btn" type="button" onClick={() => setAiProvider(p.key)}>
                              {aiProvider === p.key ? '사용 중' : '사용'}
                            </button>
                            <button className="oauth-reset-btn" type="button" onClick={async () => {
                              const res = await fetch('/api/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ [envKey]: '' })
                              })
                              if (res.ok) {
                                setTestResult('')
                                const refresh = await fetch('/api/providers').then((r) => r.json())
                                if (refresh.ok) setProviders(refresh.providers)
                              }
                            }}>연결 해제</button>
                          </div>
                        ) : (
                          <button className="oauth-connect-btn" type="button" onClick={() => {
                            setAiProvider(p.key)
                            setAiApiKey('')
                            setTestResult('')
                            setAuthMode('apikey')
                            setOauthStep(0)
                          }}>연결하기</button>
                        )}
                      </div>
                      {isActive && !p.configured && (
                        <div className="oauth-card-form">
                          <div className="auth-mode-tabs">
                            <button className={`auth-tab ${authMode === 'apikey' ? 'is-active' : ''}`} type="button" onClick={() => { setAuthMode('apikey'); setOauthStep(0); setTestResult('') }}>API 키 입력</button>
                            <button className={`auth-tab ${authMode === 'oauth' ? 'is-active' : ''}`} type="button" onClick={() => { setAuthMode('oauth'); setOauthStep(1); setTestResult('') }}>OAuth 인증</button>
                          </div>

                          {authMode === 'apikey' && (
                            <>
                              <input
                                type="password"
                                value={aiApiKey}
                                onChange={(event) => setAiApiKey(event.target.value)}
                                placeholder={`${p.label} API 키를 입력하세요`}
                              />
                              <div className="button-row">
                                <button className="primary-button" type="button" onClick={async () => {
                                  if (!aiApiKey) { setTestResult('API 키를 입력해 주세요.'); return }
                                  setTestResult('연결 확인 중...')
                                  const testRes = await fetch('/api/test-provider', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ provider: p.key, apiKey: aiApiKey })
                                  })
                                  const testData = await testRes.json()
                                  if (!testData.ok) { setTestResult(`연결 실패: ${testData.error}`); return }
                                  const saveRes = await fetch('/api/settings', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ [envKey]: aiApiKey })
                                  })
                                  const saveData = await saveRes.json()
                                  if (saveData.ok) {
                                    setTestResult(`${p.label} 연결 완료!`)
                                    setAiApiKey('')
                                    const refresh = await fetch('/api/providers').then((r) => r.json())
                                    if (refresh.ok) setProviders(refresh.providers)
                                  } else {
                                    setTestResult(saveData.error)
                                  }
                                }}>인증 및 연결</button>
                              </div>
                            </>
                          )}

                          {authMode === 'oauth' && (
                            <div className="oauth-login-section">
                              {p.oauthSupported ? (
                                <>
                                  <p className="oauth-login-desc">{p.label} 계정으로 로그인하여 자동으로 연결합니다. 별도의 API 키 입력이 필요하지 않습니다.</p>
                                  <button className="oauth-login-btn" type="button" onClick={() => {
                                    setTestResult('로그인 페이지로 이동 중...')
                                    setOauthStep(1)
                                    const popup = window.open(
                                      `/auth/${p.key}`,
                                      `oauth-${p.key}`,
                                      'width=600,height=700,left=200,top=100'
                                    )
                                    let popupHandled = false
                                    const handler = (event) => {
                                      if (event.origin !== window.location.origin) return
                                      if (event.data?.type === 'oauth-result') {
                                        window.removeEventListener('message', handler)
                                        clearInterval(checkClosed)
                                        popupHandled = true
                                        setOauthStep(0)
                                        if (event.data.success) {
                                          setTestResult(`${p.label} OAuth 연결 완료!`)
                                          fetch('/api/providers').then((r) => r.json()).then((data) => {
                                            if (data.ok) setProviders(data.providers)
                                          })
                                        } else {
                                          setTestResult('OAuth 인증에 실패했습니다.')
                                        }
                                      }
                                    }
                                    window.addEventListener('message', handler)
                                    const checkClosed = setInterval(() => {
                                      if (popup?.closed) {
                                        clearInterval(checkClosed)
                                        window.removeEventListener('message', handler)
                                        if (!popupHandled) {
                                          setTestResult('로그인 창이 닫혔습니다.')
                                          setOauthStep(0)
                                        }
                                      }
                                    }, 500)
                                  }}>
                                    {oauthStep === 1 ? '로그인 진행 중...' : `${p.label} 계정으로 로그인`}
                                  </button>
                                </>
                              ) : (
                                <div className="oauth-not-available">
                                  <p>OAuth 연결을 사용하려면 서버에 OAuth 자격증명을 설정해야 합니다.</p>
                                  <div className="oauth-setup-guide">
                                    <p><strong>설정 방법:</strong></p>
                                    <code>.env</code> 파일에 아래 값을 추가하세요:
                                    <pre className="oauth-env-example">
{p.key === 'openai' ? `OPENAI_CLIENT_ID=your-client-id\nOPENAI_CLIENT_SECRET=your-secret` :
 p.key === 'kimi' ? `KIMI_CLIENT_ID=your-client-id\nKIMI_CLIENT_SECRET=your-secret` :
 `# ${p.label}은 현재 OAuth를 지원하지 않습니다.\n# API 키 입력 방식을 사용해 주세요.`}
                                    </pre>
                                  </div>
                                  <p className="oauth-fallback-hint">또는 "API 키 입력" 탭에서 직접 키를 입력할 수 있습니다.</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {isActive && testResult && <p className="oauth-card-status">{testResult}</p>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="workspace">
        <section className="control-column">
          <div className="panel">
            <p className="section-label">1. 원본 문서 업로드</p>
            <input type="file" accept=".hwp,.hwpx" onChange={handleFileChange} />
            <p className="helper">
              HWP는 내용을 분석해 새 HWPX 초안을 만들고, HWPX는 업로드한 양식을 결과 문서 템플릿으로 재사용합니다.
            </p>
          </div>

          <div className="panel">
            <p className="section-label">2. 생성 조건</p>
            <label>
              <span>문서 유형</span>
              <select value={docType} onChange={(event) => setDocType(event.target.value)}>
                {DOC_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>회사명</span>
              <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
            </label>
            <label>
              <span>목표 제목</span>
              <input value={targetTitle} onChange={(event) => setTargetTitle(event.target.value)} />
            </label>
            <label>
              <span>생성 요청</span>
              <textarea rows="4" value={goal} onChange={(event) => setGoal(event.target.value)} />
            </label>
            <label>
              <span>추가 메모</span>
              <textarea rows="4" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <div className="button-row">
              <button className="primary-button" type="button" onClick={handleGenerateDraft} disabled={draftLoading}>
                {draftLoading ? '초안 생성 중...' : '초안 생성'}
              </button>
              <button className="secondary-button" type="button" onClick={handleExport} disabled={!draft || exportState.loading}>
                {exportState.loading ? 'HWPX 생성 중...' : 'HWPX 내보내기'}
              </button>
            </div>
            {exportState.url && (
              <a className="download-link" href={exportState.url} download={exportState.fileName}>
                {exportState.fileName} 다운로드
              </a>
            )}
            <p className="status-message">{parseStatus}</p>
          </div>
        </section>

        <section className="preview-column">
          <div className="panel" ref={previewPanelRef}>
            <p className="section-label">{draft ? '생성 초안 미리보기' : '문서 미리보기'}</p>
            <div className="meta-grid">
              <div>
                <span>{draft ? '초안 제목' : '원본 파일'}</span>
                <strong>{draft ? draft.title : (sourceInsight.fileName || '업로드 대기')}</strong>
              </div>
              <div>
                <span>{draft ? '목차 수' : '페이지 수'}</span>
                <strong>{draft ? draft.toc.length : (sourceInsight.pageCount || 0)}</strong>
              </div>
              <div>
                <span>{draft ? '문서 유형' : '문서 형식'}</span>
                <strong>
                  {draft
                    ? DOC_TYPES.find((option) => option.value === docType)?.label || docType
                    : sourceInsight.mode === 'hwpx-template'
                      ? 'HWPX 양식'
                      : sourceInsight.mode === 'hwp-source'
                        ? 'HWP 문서'
                        : '대기'}
                </strong>
              </div>
              <div>
                <span>{draft ? '현재 상태' : '처리 방식'}</span>
                <strong>
                  {draft
                    ? '초안 생성 완료'
                    : sourceInsight.mode === 'hwpx-template'
                      ? '양식 재사용'
                      : sourceInsight.mode === 'hwp-source'
                        ? '내용 기반 초안 생성'
                        : '대기'}
                </strong>
              </div>
            </div>
            <div className="svg-frame">
              {draft ? (
                <div className="draft-preview">
                  <div className="preview-process-line">
                    {getDraftStageItems().map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                  <h2>{draft.title}</h2>
                  <p className="draft-summary">{draft.summary}</p>
                  <ol className="draft-toc">
                    {draft.toc.map((item) => (
                      <li key={item}>
                        <span>{item}</span>
                        <em>{getDraftItemStatus(draft)}</em>
                      </li>
                    ))}
                  </ol>
                  <div className="draft-sections">
                    {draft.sections.map((section) => {
                      const diagramSpec = (draft.diagrams || []).find((d) => d.afterSection === section.heading)
                      const diagramSvg = diagramSpec ? renderDiagramSvg(diagramSpec) : null
                      return (
                        <article key={section.heading}>
                          <div className="draft-section-meta">{getDraftSectionLabel(draft)}</div>
                          <h3>{section.heading}</h3>
                          <p>{section.body}</p>
                          {diagramSvg && (
                            <div className="diagram-preview" dangerouslySetInnerHTML={{ __html: diagramSvg }} />
                          )}
                        </article>
                      )
                    })}
                  </div>
                </div>
              ) : sourceInsight.previewSvg ? (
                <div className="parsed-content-board">
                  <div className="parsed-document-stage">
                    <div dangerouslySetInnerHTML={{ __html: sourceInsight.previewSvg }} />
                  </div>
                  <div className="parsed-text-panel">
                    <p className="parsed-text-label">문서 내용</p>
                    <div className="parsed-text-content">
                      {sourceInsight.extractedText
                        ? <p>{sourceInsight.extractedText.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')}</p>
                        : <p>첫 페이지 텍스트를 읽는 중입니다.</p>
                      }
                    </div>
                  </div>
                </div>
              ) : (
                <p className="empty-copy">생성된 내용을 미리보기로 보여드립니다.</p>
              )}
            </div>
            <p className="status-message">
              {draft
                ? '왼쪽에서 조건을 바꾼 뒤 다시 초안 생성 버튼을 누르면 이 미리보기가 즉시 갱신됩니다.'
                : sourceInsight.mode === 'hwpx-template'
                  ? '업로드한 HWPX 양식을 그대로 재사용해 새 문서를 생성할 수 있습니다.'
                  : sourceInsight.mode === 'hwp-source'
                    ? '업로드한 HWP 문서 내용을 바탕으로 새 HWPX 초안을 생성할 수 있습니다.'
                    : '문서를 업로드하면 미리보기와 추출 내용을 한 화면에서 바로 확인할 수 있습니다.'}
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}

function triggerDownload(url, fileName) {
  if (!url) {
    return
  }

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName || 'generated.hwpx'
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
