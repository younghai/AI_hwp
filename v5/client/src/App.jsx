import { useRef, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { TopBar } from './components/TopBar.jsx'
import { LoginOverlay } from './components/LoginOverlay.jsx'
import { ProviderSettings } from './components/ProviderSettings.jsx'
import { ControlPanel } from './components/ControlPanel.jsx'
import { PreviewPanel } from './components/PreviewPanel.jsx'
import { ValidationPanel } from './components/ValidationPanel.jsx'
import { EmptyState } from './components/EmptyState.jsx'
import { ToastContainer } from './components/Toast.jsx'
import { useProviders } from './hooks/useProviders.js'
import { useRhwp } from './hooks/useRhwp.js'
import { useDraft } from './hooks/useDraft.js'
import { useAuth } from './hooks/useAuth.js'
import { useGeneratedFiles } from './hooks/useGeneratedFiles.js'
import { useToast } from './hooks/useToast.js'

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
  const {
    files: recentDocuments,
    loading: recentDocumentsLoading,
    refresh: refreshGeneratedFiles,
    recordPreview
  } = useGeneratedFiles(user)
  const autoLogin = import.meta.env.VITE_AUTO_LOGIN === 'true'
  const { toasts, dismiss, success, error: errorToast, info, warning } = useToast()

  const {
    providers, aiProvider, setAiProvider, refresh: refreshProviders, activeProvider, hasConfigured,
    aiModel, setAiModel, activeModels
  } = useProviders((err) => {
    console.warn('providers fetch failed', err)
    errorToast('AI provider 목록을 불러오지 못했습니다.')
  }, Boolean(user))

  const {
    sourceInsight,
    parseStatus,
    setParseStatus,
    parseFile,
    builtPreview,
    renderBuiltHwpx,
    clearBuiltPreview
  } = useRhwp()
  const {
    draft, setDraft, draftLoading, exportState, generateDraft, buildHwpx, downloadBuilt
  } = useDraft({ setParseStatus })

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

  async function handleTrySample({ file, sample }) {
    if (sample?.suggestedTitle) setTargetTitle(sample.suggestedTitle)
    if (sample?.docType) setDocType(sample.docType)
    info(`샘플 "${sample.label}" 을 불러왔습니다.`)
    await handleFileSelect(file)
  }

  function scrollToPreview() {
    requestAnimationFrame(() => {
      previewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function handleGenerate() {
    clearBuiltPreview()
    if (!hasConfigured) {
      errorToast('먼저 우측 상단 ⚙ 버튼에서 AI 키를 설정해주세요.', {
        action: { label: '설정 열기', onClick: () => setShowSettings(true) }
      })
      return
    }
    const next = await generateDraft({
      sourceFile, sourceInsight, docType, companyName, goal, notes, targetTitle,
      aiProvider, aiModel, aiApiKey, onOptimistic: scrollToPreview
    })
    if (!next) {
      scrollToPreview()
      errorToast('AI 초안 생성에 실패했습니다. 우측 패널의 메시지를 확인해주세요.')
      return
    }
    if (next.title) setTargetTitle(next.title)
    if (next.usage) {
      const cost = next.usage.estCostUsd > 0
        ? ` · 추정 비용 $${next.usage.estCostUsd.toFixed(4)}`
        : ''
      info(`AI 응답 ${(next.usage.elapsedMs / 1000).toFixed(1)}초${cost}`)
    }

    setParseStatus('AI 초안을 바탕으로 HWPX 파일을 생성하는 중입니다...')
    const built = await buildHwpx({ draftOverride: next, sourceFile, sourceInsight, docType })
    if (built?.url) {
      setParseStatus('HWPX를 렌더링해 미리보기에 반영합니다...')
      const rendered = await renderBuiltHwpx(built.url, built.fileName)
      if (rendered && built.fileId) {
        const savedPreview = await recordPreview({
          fileId: built.fileId,
          pageCount: rendered.pageCount,
          renderedPageCount: rendered.svgs.length,
          firstPageText: rendered.firstPageText
        })
        if (!savedPreview) await refreshGeneratedFiles()
      } else {
        await refreshGeneratedFiles()
      }
      const diagramReport = built.diagramReport
      const requestedDiagrams = Number(diagramReport?.requestedCount || 0)
      const embeddedDiagrams = Number(diagramReport?.embeddedCount || 0)
      if (rendered) {
        setParseStatus(
          requestedDiagrams > 0
            ? `미리보기와 다운로드 파일이 동일한 HWPX로 생성되었습니다. 다이어그램 ${embeddedDiagrams}/${requestedDiagrams}개 반영.`
            : '미리보기와 다운로드 파일이 동일한 HWPX로 생성되었습니다.'
        )
      } else {
        setParseStatus(
          requestedDiagrams > 0
            ? `HWPX 파일이 생성되었습니다. 다이어그램 ${embeddedDiagrams}/${requestedDiagrams}개 반영. 다운로드 버튼으로 받을 수 있습니다.`
            : 'HWPX 파일이 생성되었습니다. 다운로드 버튼으로 받을 수 있습니다.'
        )
      }

      if (requestedDiagrams > 0) {
        if (embeddedDiagrams === requestedDiagrams) {
          success(`다이어그램 ${embeddedDiagrams}개가 모두 HWPX 결과물에 반영되었습니다.`)
        } else if (embeddedDiagrams === 0) {
          errorToast(`다이어그램 ${requestedDiagrams}개가 초안에는 있었지만 HWPX 결과물에는 반영되지 않았습니다.`)
        } else {
          warning(`다이어그램 ${requestedDiagrams}개 중 ${embeddedDiagrams}개만 HWPX 결과물에 반영되었습니다.`)
        }
      }
      // 검증 결과 토스트
      const v = built.validation
      if (v) {
        if (!v.ok) {
          errorToast(`HWPX 검증: 에러 ${v.errorCount}건, 경고 ${v.warningCount}건. 우측 검증 패널을 확인하세요.`)
        } else if (v.warningCount > 0) {
          info(`HWPX 검증: 경고 ${v.warningCount}건. 큰 문제는 없습니다.`)
        } else {
          success('HWPX 검증 통과!')
        }
      }
    } else {
      errorToast('HWPX 빌드에 실패했습니다.')
    }
    scrollToPreview()
  }

  function handleDownload() {
    downloadBuilt()
  }

  async function handlePreviewRecentDocument(file) {
    if (!file?.downloadUrl) return
    setDraft(null)
    setParseStatus(`${file.fileName} 미리보기를 다시 렌더링합니다...`)
    const rendered = await renderBuiltHwpx(file.downloadUrl, file.fileName)
    if (rendered) {
      await recordPreview({
        fileId: file.fileId,
        pageCount: rendered.pageCount,
        renderedPageCount: rendered.svgs.length,
        firstPageText: rendered.firstPageText
      })
      setParseStatus(`${file.fileName} 미리보기를 최신 상태로 갱신했습니다.`)
      scrollToPreview()
      return
    }
    errorToast('최근 문서 미리보기를 렌더링하지 못했습니다.')
    scrollToPreview()
  }

  const showEmptyState = !sourceFile && !draft && !builtPreview.svgs.length

  return (
    <ErrorBoundary>
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
          activeModels={activeModels} aiModel={aiModel} setAiModel={setAiModel}
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
          recentDocuments={recentDocuments}
          recentDocumentsLoading={recentDocumentsLoading}
          onPreviewRecentDocument={handlePreviewRecentDocument}
        />

        <div className="preview-column">
          {showEmptyState && <EmptyState onTrySample={handleTrySample} enabled={Boolean(user)} />}

          <PreviewPanel
            ref={previewPanelRef}
            draft={draft}
            sourceInsight={sourceInsight}
            docType={docType}
            parseStatus={parseStatus}
            builtPreview={builtPreview}
          />

          {exportState.validation && (
            <ValidationPanel validation={exportState.validation} />
          )}
        </div>
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
    </ErrorBoundary>
  )
}
