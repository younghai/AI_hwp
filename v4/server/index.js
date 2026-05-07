import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import cookieParser from 'cookie-parser'

import healthRouter from './routes/health.js'
import providersRouter from './routes/providers.js'
import draftRouter from './routes/draft.js'
import exportRouter from './routes/export.js'
import samplesRouter from './routes/samples.js'
import { createAuthRouter } from './routes/auth.js'
import googleAuthRouter from './routes/googleAuth.js'
import { generatedDirectory } from './services/hwpxBuilder.js'

const PORT = Number(process.env.PORT || 8792)
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5192'
const OAUTH_BASE = process.env.OAUTH_REDIRECT_BASE || `http://127.0.0.1:${PORT}`

const app = express()
app.use(cors({ origin: CLIENT_ORIGIN, methods: ['GET', 'POST'], credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '3mb' }))
app.use('/generated', express.static(generatedDirectory))

// 임시 진단 로그 — 모든 요청과 응답 상태/시간 찍는다 (M1-M4 인터랙티브 검증 후 제거).
app.use((req, res, next) => {
  const t0 = Date.now()
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - t0}ms)`)
  })
  next()
})

app.use(healthRouter)
app.use(providersRouter)
app.use(draftRouter)
app.use(exportRouter)
app.use(samplesRouter)
app.use(googleAuthRouter)
app.use(createAuthRouter({ oauthBase: OAUTH_BASE, clientOrigin: CLIENT_ORIGIN }))

app.listen(PORT, '127.0.0.1', () => {
  console.log(`v4 server listening on http://127.0.0.1:${PORT}`)
})
