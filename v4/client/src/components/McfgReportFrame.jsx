export function McfgReportFrame({ reportUrl }) {
  if (!reportUrl) {
    return <p className="empty-copy">리포트가 없습니다.</p>
  }
  return (
    <iframe
      src={reportUrl}
      className="mcfg-report-frame"
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      title="MCFG font metric report"
    />
  )
}
