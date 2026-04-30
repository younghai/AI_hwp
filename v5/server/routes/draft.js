import { Router } from 'express'
import { requireSession } from '../lib/session.js'
import { buildDraftWithAI } from '../services/draft.js'
import { sendError } from '../lib/errors.js'

const router = Router()
router.use('/api', requireSession)

router.post('/api/generate-draft', async (req, res) => {
  try {
    const draft = await buildDraftWithAI({
      ...(req.body || {}),
      sourceMode: String(req.body?.sourceMode || '').trim(),
      aiApiKey: String(req.body?.aiApiKey || '').trim()
    }, {
      sessionId: req.sessionId
    })
    res.json({ ok: true, draft })
  } catch (error) {
    sendError(res, error)
  }
})

export default router
