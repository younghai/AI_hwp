import { useRef, useState } from 'react'
import { TopBar } from './components/TopBar.jsx'
import { LoginOverlay } from './components/LoginOverlay.jsx'
import { ProviderSettings } from './components/ProviderSettings.jsx'
import { ControlPanel } from './components/ControlPanel.jsx'
import { PreviewPanel } from './components/PreviewPanel.jsx'
import { useProviders } from './hooks/useProviders.js'
import { useRhwp } from './hooks/useRhwp.js'
import { useDraft } from './hooks/useDraft.js'
import { useAuth } from './hooks/useAuth.js'

export default function App() {
  const previewPanelRef = useRef(null)

  const [sourceFile, setSourceFile] = useState(null)
  const [aiApiKey] = useState('')
  const [docType, setDocType] = useState('report')
  const [companyName, setCompanyName] = useState('Bizmatrixx')
  const [goal, setGoal] = useState('업로드한 문서의 핵심 내용을 바탕으로 임원 검토용 초안을 만들어 주세요.')
  const [notes, setNotes] = useState('핵심 메시지는 유지하고, 목차는 더 명확하게 재구성해 주세요.')
  const [targetTitle, setTargetTitle] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  const { user, logout, loginWithPopup } = useAuth()
  const autoLogin = import.meta.env.VITE_AUTO_LOGIN === 'true'

  const {
    providers, aiProvider, setAiProvider, refresh: refreshProviders, activeProvider, hasConfigured
  } = useProviders((err) => {
    console.warn('providers fetch failed', err)
  })

  const {
    sourceInsight,
    parseStatus,
    setParseStatus,
    parseFile,
    builtPreview,
    renderBuiltHwpx,
    clearBuiltPreview
  } = useRhwp()
  const { draft, setDraft, draftLoading, exportState, generateDraft, buildHwpx, downloadBuilt } = useDraft({ setParseStatus })

  async function handleFileSelect(file) {
    if (!file) {
      setSourceFile(null)
      setDraft(null)
      clearBuiltPreview()
      setParseStatus('업로드한 문서를 분석하면 여기 상태가 표시됩니다.')
      return
    }
    setSourceFile(file)
    setDraft(null)
    clearBuiltPreview()
    await parseFile(file)
    if (!targetTitle) {
      setTargetTitle(file.name.replace(/\.(hwp|hwpx)$/i, ''))
    }
  }

  function scrollToPreview() {
    requestAnimationFrame(() => {
      previewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function handleGenerate() {
    clearBuiltPreview()
    const next = await generateDraft({
      sourceFile, sourceInsight, docType, companyName, goal, notes, targetTitle,
      aiProvider, aiApiKey, onOptimistic: scrollToPreview
    })
    if (!next) {
      scrollToPreview()
      return
    }
    if (next.title) setTargetTitle(next.title)

    setParseStatus('AI 초안을 바탕으로 HWPX 파일을 생성하는 중입니다...')
    const built = await buildHwpx({ draftOverride: next, sourceFile, sourceInsight, docType })
    if (built?.url) {
      setParseStatus('HWPX를 렌더링해 미리보기에 반영합니다...')
      const rendered = await renderBuiltHwpx(built.url, built.fileName)
      if (rendered) {
        setParseStatus('미리보기와 다운로드 파일이 동일한 HWPX로 생성되었습니다.')
      } else {
        setParseStatus('HWPX 파일이 생성되었습니다. 다운로드 버튼으로 받을 수 있습니다.')
      }
    }
    scrollToPreview()
  }

  function handleDownload() {
    downloadBuilt()
  }

  return (
    <div className="app-shell">
      {autoLogin && <LoginOverlay onLogin={loginWithPopup} user={user} />}
      <TopBar
        hasConfigured={hasConfigured}
        activeProviderLabel={activeProvider?.label}
        onOpenSettings={() => setShowSettings(true)}
        user={user}
        onLogin={loginWithPopup}
        onLogout={logout}
      />

      <ProviderSettings
        open={showSettings}
        providers={providers}
        aiProvider={aiProvider}
        setAiProvider={setAiProvider}
        refreshProviders={refreshProviders}
        onClose={() => setShowSettings(false)}
      />

      <main className="workspace">
        <ControlPanel
          onFileSelect={handleFileSelect}
          sourceFile={sourceFile}
          sourceInsight={sourceInsight}
          docType={docType} setDocType={setDocType}
          companyName={companyName} setCompanyName={setCompanyName}
          targetTitle={targetTitle} setTargetTitle={setTargetTitle}
          goal={goal} setGoal={setGoal}
          notes={notes} setNotes={setNotes}
          onGenerate={handleGenerate}
          onDownload={handleDownload}
          draftLoading={draftLoading}
          exportState={exportState}
          hasDraft={Boolean(draft)}
          parseStatus={parseStatus}
        />

        <PreviewPanel
          ref={previewPanelRef}
          draft={draft}
          sourceInsight={sourceInsight}
          docType={docType}
          parseStatus={parseStatus}
          builtPreview={builtPreview}
        />
      </main>
    </div>
  )
}
