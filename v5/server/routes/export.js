import { Router } from 'express'
import multer from 'multer'
import { requireSession } from '../lib/session.js'
import { buildHwpx, getGeneratedFile, listGeneratedFiles } from '../services/hwpxBuilder.js'
import { sendError } from '../lib/errors.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })
const router = Router()
router.use('/api', requireSession)

router.post('/api/export-hwpx', upload.single('sourceFile'), async (req, res) => {
  try {
    const result = await buildHwpx({
      sessionId: req.sessionId,
      title: String(req.body?.title || '').trim(),
      rawToc: String(req.body?.toc || '').trim(),
      sourceMode: String(req.body?.sourceMode || '').trim(),
      sourceFile: req.file || null,
      rawSections: req.body?.sections || '',
      rawDiagrams: req.body?.diagrams || '[]',
      docType: String(req.body?.docType || '').trim() || undefined
    })
    res.json({ ok: true, ...result })
  } catch (error) {
    sendError(res, error)
  }
})

router.get('/api/generated', async (req, res) => {
  try {
    const files = await listGeneratedFiles(req.sessionId)
    res.json({ ok: true, files })
  } catch (error) {
    sendError(res, error)
  }
})

router.get('/api/generated/:fileId', async (req, res) => {
  try {
    const generated = await getGeneratedFile(req.sessionId, req.params.fileId)
    res.setHeader('Content-Type', 'application/hwp+zip')
    res.setHeader('Content-Disposition', `attachment; filename="${generated.fileName}"`)
    res.sendFile(generated.filePath)
  } catch (error) {
    sendError(res, error)
  }
})

export default router
