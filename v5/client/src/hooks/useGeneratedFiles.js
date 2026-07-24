import { useCallback, useEffect, useState } from 'react'

export function useGeneratedFiles(user) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) {
      setFiles([])
      return []
    }
    setLoading(true)
    try {
      const res = await fetch('/api/generated', { credentials: 'include' })
      if (res.status === 401) {
        setFiles([])
        return []
      }
      const data = await res.json()
      const next = data.ok ? (data.files || []) : []
      setFiles(next)
      return next
    } catch {
      setFiles([])
      return []
    } finally {
      setLoading(false)
    }
  }, [user])

  const recordPreview = useCallback(async ({ fileId, pageCount, renderedPageCount, firstPageText }) => {
    if (!user || !fileId) return null
    try {
      const res = await fetch(`/api/generated/${fileId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pageCount,
          renderedPageCount,
          firstPageText,
          renderer: '@rhwp/core',
          source: 'client-preview'
        })
      })
      const data = await res.json()
      if (!res.ok || !data.ok) return null
      await refresh()
      return data.preview
    } catch {
      return null
    }
  }, [refresh, user])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { files, loading, refresh, recordPreview }
}
