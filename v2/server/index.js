import 'dotenv/config'
import cors from 'cors'
import express from 'express'

import healthRouter from './routes/health.js'
import providersRouter from './routes/providers.js'
import draftRouter from './routes/draft.js'
import exportRouter from './routes/export.js'
import { createAuthRouter } from './routes/auth.js'
import { generatedDirectory } from './services/hwpxBuilder.js'

const PORT = Number(process.env.PORT || 8788)
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5188'
const OAUTH_BASE = process.env.OAUTH_REDIRECT_BASE || `http://127.0.0.1:${PORT}`

const app = express()
app.use(cors({ origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] }))
app.use(express.json({ limit: '3mb' }))
app.use('/generated', express.static(generatedDirectory))

app.use(healthRouter)
app.use(providersRouter)
app.use(draftRouter)
app.use(exportRouter)
app.use(createAuthRouter({ oauthBase: OAUTH_BASE, clientOrigin: CLIENT_ORIGIN }))

app.listen(PORT, '127.0.0.1', () => {
  console.log(`v2 server listening on http://127.0.0.1:${PORT}`)
})
