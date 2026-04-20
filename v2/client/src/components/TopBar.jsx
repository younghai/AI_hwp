export function TopBar({ hasConfigured, activeProviderLabel, onOpenSettings }) {
  const connected = Boolean(hasConfigured)
  const dotLabel = connected
    ? `AI 연결됨${activeProviderLabel ? ` · ${activeProviderLabel}` : ''}`
    : 'AI 미연결 - API 키 설정 필요'

  return (
    <header className="topbar">
      <div className="topbar-copy">
        <p className="eyebrow">AI Document Studio</p>
        <h1>HWP / HWPX 문서 자동화</h1>
        <p className="topbar-summary">
          업로드한 문서를 바로 읽고, 추출 내용과 초안을 같은 화면에서 확인할 수 있는 localhost 데모입니다.
        </p>
      </div>
      <div className="topbar-actions">
        <span
          className={`status-dot ${connected ? 'is-connected' : 'is-disconnected'}`}
          role="status"
          aria-label={dotLabel}
          title={dotLabel}
        />
        <button
          type="button"
          className="icon-button"
          aria-label="AI 설정 열기"
          onClick={onOpenSettings}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  )
}
