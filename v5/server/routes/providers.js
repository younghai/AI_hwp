import { Router } from 'express'
import { AI_PROVIDERS, providerFromEnvKey } from '../lib/providers-config.js'
import { sendError } from '../lib/errors.js'
import { getSessionProviderSecret, requireSession, setSessionProviderSecret } from '../lib/session.js'
import { callAnthropic, callOpenAICompatible } from '../services/ai.js'

const router = Router()
router.use('/api', requireSession)

router.get('/api/providers', (req, res) => {
  const list = Object.entries(AI_PROVIDERS).map(([key, val]) => ({
    key,
    label: val.label,
    defaultModel: val.defaultModel,
    configured: Boolean(getSessionProviderSecret(req.sessionId, val.envKey)),
    oauthSupported: Boolean(val.oauth && process.env[val.oauth?.clientIdEnv])
  }))
  res.json({ ok: true, providers: list })
})

router.post('/api/settings', async (req, res) => {
  try {
    const sessionScopedKeys = Object.entries(req.body || {})
      .filter(([envName]) => providerFromEnvKey(envName))

    if (sessionScopedKeys.length === 0) {
      return res.status(400).json({ ok: false, error: '저장할 API 키가 없습니다.' })
    }

    for (const [envName, value] of sessionScopedKeys) {
      setSessionProviderSecret(req.sessionId, envName, String(value || '').trim())
    }
    res.json({ ok: true, message: 'API 키가 현재 로그인 세션에 저장되었습니다.' })
  } catch (error) {
    sendError(res, error)
  }
})

router.post('/api/test-provider', async (req, res) => {
  const { provider: providerKey, apiKey } = req.body || {}
  const provider = AI_PROVIDERS[providerKey]
  if (!provider) {
    return res.status(400).json({ ok: false, error: '알 수 없는 프로바이더입니다.' })
  }
  const key = String(apiKey || '').trim() || getSessionProviderSecret(req.sessionId, provider.envKey)
  if (!key) {
    return res.status(400).json({ ok: false, error: 'API 키가 없습니다.' })
  }
  try {
    const text = providerKey === 'anthropic'
      ? await callAnthropic(provider, key, '한 문장으로 자기소개를 해 주세요.')
      : await callOpenAICompatible(provider, key, '한 문장으로 자기소개를 해 주세요.')
    res.json({ ok: true, message: text.slice(0, 200) })
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message })
  }
})

export default router
