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

  useEffect(() => {
    refresh()
  }, [refresh])

  return { files, loading, refresh }
}
