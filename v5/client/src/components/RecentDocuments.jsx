function formatDateTime(timestamp) {
  if (!timestamp) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(timestamp))
}

function validationLabel(validation) {
  if (!validation) return '검증 정보 없음'
  if (!validation.ok) return `검증 에러 ${validation.errorCount}건`
  if (validation.warningCount > 0) return `검증 경고 ${validation.warningCount}건`
  return '검증 통과'
}

export function RecentDocuments({ files, loading }) {
  return (
    <>
      <p className="section-label">3. 최근 생성 문서</p>
      {loading ? (
        <p className="helper">최근 생성 문서를 불러오는 중입니다.</p>
      ) : files.length === 0 ? (
        <p className="helper">현재 세션에서 생성한 문서가 없습니다.</p>
      ) : (
        <div className="recent-doc-list">
          {files.map((file) => (
            <div key={file.fileId} className="recent-doc-item">
              <div className="recent-doc-copy">
                <strong className="recent-doc-name">{file.fileName}</strong>
                <p className="recent-doc-meta">
                  생성 {formatDateTime(file.createdAt)} · 만료 {formatDateTime(file.expiresAt)}
                </p>
                <p className="recent-doc-meta">{validationLabel(file.validation)}</p>
              </div>
              <a className="recent-doc-link" href={file.downloadUrl} download={file.fileName}>
                다운로드
              </a>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
