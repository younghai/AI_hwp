import { useEffect, useRef, useState } from 'react'

// M4 PoC — @rhwp/editor 0.7.7 iframe 임베드.
//
// ⚠ 개인정보 주의: 기본 studioUrl 은 https://edwardkim.github.io/rhwp/ (외부 호스트).
// HWPX 바이트가 iframe 으로 로드되어 외부 도메인 컨텍스트에서 처리된다.
// 사내/오프라인 운영이 필요하면 self-host studioUrl 로 교체해야 한다.

export function RhwpEditorPanel({ hwpxUrl, fileName, onClose, studioUrl }) {
  const containerRef = useRef(null)
  const editorRef = useRef(null)
  const [status, setStatus] = useState('에디터 준비 중...')
  const [error, setError] = useState(null)
  const [acknowledged, setAcknowledged] = useState(false)

  useEffect(() => {
    if (!acknowledged || !hwpxUrl || !containerRef.current) return
    let cancelled = false

    ;(async () => {
      try {
        setStatus('rhwp-editor 로딩 중...')
        const { createEditor } = await import('@rhwp/editor')
        if (cancelled) return
        const editor = await createEditor(containerRef.current, studioUrl ? { studioUrl } : {})
        if (cancelled) {
          // editor.destroy 가 노출되면 그것을 사용. 없으면 컨테이너 비우기로 정리.
          containerRef.current && (containerRef.current.innerHTML = '')
          return
        }
        editorRef.current = editor
        setStatus(`HWPX 다운로드 중: ${fileName || ''}`)
        const resp = await fetch(hwpxUrl)
        if (!resp.ok) throw new Error(`HWPX 다운로드 실패: HTTP ${resp.status}`)
        const buffer = await resp.arrayBuffer()
        if (cancelled) return
        await editor.loadFile(buffer, fileName || 'document.hwpx')
        if (cancelled) return
        const pageCount = typeof editor.pageCount === 'function' ? await editor.pageCount() : null
        setStatus(pageCount ? `편집 모드 (${pageCount} 페이지)` : '편집 모드')
      } catch (err) {
        if (!cancelled) {
          console.error('[RhwpEditorPanel]', err)
          setError(err?.message || String(err))
          setStatus('에디터 로딩 실패')
        }
      }
    })()

    return () => {
      cancelled = true
      if (containerRef.current) containerRef.current.innerHTML = ''
      editorRef.current = null
    }
  }, [acknowledged, hwpxUrl, fileName, studioUrl])

  if (!acknowledged) {
    return (
      <div className="rhwp-editor-consent">
        <h3>외부 에디터 활성화 (베타)</h3>
        <p>
          HWPX 파일이 <code>{studioUrl || 'https://edwardkim.github.io/rhwp/'}</code> 의
          iframe 컨텍스트로 로드됩니다. 민감 문서 처리 시 사내 호스트로 교체하세요.
        </p>
        <div className="rhwp-editor-consent-actions">
          <button type="button" onClick={() => setAcknowledged(true)}>
            확인하고 에디터 열기
          </button>
          {onClose && (
            <button type="button" className="ghost" onClick={onClose}>
              취소
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rhwp-editor-frame-wrap">
      <div className="rhwp-editor-toolbar">
        <span>{status}</span>
        {onClose && (
          <button type="button" className="ghost" onClick={onClose}>
            에디터 닫기
          </button>
        )}
      </div>
      {error && <p className="rhwp-editor-error">{error}</p>}
      <div ref={containerRef} className="rhwp-editor-frame" />
    </div>
  )
}
