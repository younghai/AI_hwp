import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import fs from 'fs/promises'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

import crypto from 'crypto'

const AI_PROVIDERS = {
  anthropic: {
    label: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-opus-4-6',
    envKey: 'ANTHROPIC_API_KEY',
    oauth: null
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
    envKey: 'OPENAI_API_KEY',
    oauth: {
      authorizeUrl: 'https://auth.openai.com/authorize',
      tokenUrl: 'https://auth.openai.com/oauth/token',
      scope: 'openai.organization.read openai.chat.completions.create',
      clientIdEnv: 'OPENAI_CLIENT_ID',
      clientSecretEnv: 'OPENAI_CLIENT_SECRET'
    }
  },
  kimi: {
    label: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
    defaultModel: 'moonshot-v1-8k',
    envKey: 'KIMI_API_KEY',
    oauth: {
      authorizeUrl: 'https://account.moonshot.cn/oauth/authorize',
      tokenUrl: 'https://account.moonshot.cn/oauth/token',
      scope: 'api',
      clientIdEnv: 'KIMI_CLIENT_ID',
      clientSecretEnv: 'KIMI_CLIENT_SECRET'
    }
  },
  xai: {
    label: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    defaultModel: 'grok-3-mini',
    envKey: 'XAI_API_KEY',
    oauth: null
  }
}

const oauthStates = new Map()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const v2Root = path.resolve(__dirname, '..')
const repoRoot = path.resolve(v2Root, '..')
const generatedDir = path.join(v2Root, 'generated')
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

const PORT = Number(process.env.PORT || 8788)
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5188'
const OAUTH_BASE = process.env.OAUTH_REDIRECT_BASE || `http://127.0.0.1:${PORT}`

await fs.mkdir(generatedDir, { recursive: true })

const app = express()
app.use(cors({ origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] }))
app.use(express.json({ limit: '3mb' }))
app.use('/generated', express.static(generatedDir))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mode: 'local-rhwp-demo',
    ready: true,
    reason: 'v2 localhost 데모가 준비되어 있습니다. rhwp 기반 업로드 파싱과 로컬 초안 생성이 가능합니다.'
  })
})

app.get('/api/providers', (_req, res) => {
  const list = Object.entries(AI_PROVIDERS).map(([key, val]) => ({
    key,
    label: val.label,
    defaultModel: val.defaultModel,
    configured: Boolean(process.env[val.envKey]),
    oauthSupported: Boolean(val.oauth && process.env[val.oauth?.clientIdEnv])
  }))
  res.json({ ok: true, providers: list })
})

// --- OAuth 2.0 Authorization Code Flow ---

app.get('/auth/:provider', (req, res) => {
  const providerKey = req.params.provider
  const provider = AI_PROVIDERS[providerKey]
  if (!provider?.oauth) {
    return res.status(400).send('이 프로바이더는 OAuth를 지원하지 않습니다.')
  }

  const clientId = process.env[provider.oauth.clientIdEnv]
  if (!clientId) {
    return res.status(400).send(`OAuth 설정이 필요합니다. .env에 ${provider.oauth.clientIdEnv}를 설정하세요.`)
  }

  const state = crypto.randomBytes(16).toString('hex')
  oauthStates.set(state, { provider: providerKey, createdAt: Date.now() })

  const redirectUri = `${OAUTH_BASE}/auth/${providerKey}/callback`
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: provider.oauth.scope,
    state
  })

  res.redirect(`${provider.oauth.authorizeUrl}?${params}`)
})

app.get('/auth/:provider/callback', async (req, res) => {
  const providerKey = req.params.provider
  const provider = AI_PROVIDERS[providerKey]
  const { code, state, error } = req.query

  if (error) {
    return res.send(oauthResultPage(false, `인증 거부: ${error}`))
  }

  if (!state || !oauthStates.has(state)) {
    return res.send(oauthResultPage(false, '잘못된 인증 요청입니다 (state 불일치).'))
  }

  const saved = oauthStates.get(state)
  oauthStates.delete(state)

  if (saved.provider !== providerKey || Date.now() - saved.createdAt > 600000) {
    return res.send(oauthResultPage(false, '인증 세션이 만료되었습니다.'))
  }

  if (!provider?.oauth) {
    return res.send(oauthResultPage(false, 'OAuth 미지원 프로바이더입니다.'))
  }

  const clientId = process.env[provider.oauth.clientIdEnv]
  const clientSecret = process.env[provider.oauth.clientSecretEnv]
  const redirectUri = `${OAUTH_BASE}/auth/${providerKey}/callback`

  try {
    const tokenRes = await fetch(provider.oauth.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret
      })
    })

    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || !tokenData.access_token) {
      return res.send(oauthResultPage(false, tokenData.error_description || tokenData.error || '토큰 교환에 실패했습니다.'))
    }

    process.env[provider.envKey] = tokenData.access_token
    await writeEnvFile({ [provider.envKey]: tokenData.access_token })

    res.send(oauthResultPage(true, `${provider.label} OAuth 연결 완료!`))
  } catch (err) {
    res.send(oauthResultPage(false, `토큰 교환 오류: ${err.message}`))
  }
})

async function writeEnvFile(overrides = {}) {
  const envPath = path.join(__dirname, '.env')
  const val = (key) => key in overrides ? overrides[key] : (process.env[key] || '')
  const lines = [
    '# AI Provider API Keys',
    ...Object.values(AI_PROVIDERS).map((p) => `${p.envKey}=${val(p.envKey)}`),
    '',
    '# OAuth Client Credentials',
    ...Object.values(AI_PROVIDERS).flatMap((p) =>
      p.oauth ? [
        `${p.oauth.clientIdEnv}=${val(p.oauth.clientIdEnv)}`,
        `${p.oauth.clientSecretEnv}=${val(p.oauth.clientSecretEnv)}`
      ] : []
    ),
    `OAUTH_REDIRECT_BASE=${process.env.OAUTH_REDIRECT_BASE || ''}`,
    ''
  ]
  await fs.writeFile(envPath, lines.join('\n'), 'utf-8')
}

function oauthResultPage(success, message) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>OAuth 인증</title>
<style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f6f1e7}
.card{background:#fff;border-radius:24px;padding:40px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.1);max-width:400px}
.icon{font-size:48px;margin-bottom:16px}
h2{margin:0 0 12px;color:#161616}
p{color:#74716a;margin:0 0 20px}
button{padding:12px 24px;border:none;border-radius:999px;background:#161616;color:#fff;font-weight:700;cursor:pointer;font-size:1rem}
</style></head><body>
<div class="card">
<div class="icon">${success ? '&#10003;' : '&#10007;'}</div>
<h2>${success ? '연결 완료' : '연결 실패'}</h2>
<p>${message}</p>
<button onclick="window.opener?.postMessage({type:'oauth-result',success:${success}},'${CLIENT_ORIGIN}');window.close()">닫기</button>
</div>
<script>window.opener?.postMessage({type:'oauth-result',success:${success}},'${CLIENT_ORIGIN}')</script>
</body></html>`
}

app.post('/api/settings', async (req, res) => {
  try {
    const keys = req.body || {}
    const allowedKeys = new Set([
      ...Object.values(AI_PROVIDERS).map((p) => p.envKey),
      ...Object.values(AI_PROVIDERS).flatMap((p) => p.oauth ? [p.oauth.clientIdEnv, p.oauth.clientSecretEnv] : []),
      'OAUTH_REDIRECT_BASE'
    ])
    const safeKeys = Object.fromEntries(Object.entries(keys).filter(([k]) => allowedKeys.has(k)))

    await writeEnvFile(safeKeys)

    for (const [envName, value] of Object.entries(safeKeys)) {
      process.env[envName] = value
    }

    res.json({ ok: true, message: 'API 키가 저장되었습니다.' })
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message })
  }
})

app.post('/api/test-provider', async (req, res) => {
  const { provider: providerKey, apiKey } = req.body || {}
  const provider = AI_PROVIDERS[providerKey]
  if (!provider) {
    return res.status(400).json({ ok: false, error: '알 수 없는 프로바이더입니다.' })
  }

  const key = apiKey || process.env[provider.envKey] || ''
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

app.post('/api/generate-draft', async (req, res) => {
  try {
    const draft = await buildDraftWithAI(req.body || {})
    res.json({ ok: true, draft })
  } catch (error) {
    res.status(error.statusCode || 400).json({ ok: false, error: error.message || '초안 생성에 실패했습니다.' })
  }
})

app.post('/api/export-hwpx', upload.single('sourceFile'), async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim()
    const rawToc = String(req.body?.toc || '').trim()
    const sourceMode = String(req.body?.sourceMode || '').trim()
    const sourceFile = req.file || null

    if (!title) {
      throw createHttpError('제목이 비어 있습니다.', 422)
    }

    const toc = rawToc
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)

    const outputName = `${slugify(title) || 'generated'}-${Date.now()}.hwpx`
    const outputPath = path.join(generatedDir, outputName)

    let templatePath = null
    let sourceDocumentName = (sourceFile?.originalname || 'uploaded-document').normalize('NFC')

    if (sourceFile && sourceFile.originalname.toLowerCase().endsWith('.hwpx')) {
      const uploadPath = path.join(generatedDir, `${Date.now()}-${sanitizeName(sourceFile.originalname)}`)
      await fs.writeFile(uploadPath, sourceFile.buffer)
      templatePath = uploadPath
    }

    if (!sourceFile && sourceMode === 'hwpx-template') {
      throw createHttpError('HWPX 양식 기반으로 내보내려면 원본 파일이 필요합니다.', 422)
    }

    const rawSections = req.body?.sections || ''
    let sectionsJsonPath = null
    if (rawSections) {
      try {
        const sections = JSON.parse(rawSections)
        const rawDiagrams = req.body?.diagrams || '[]'
        const diagrams = JSON.parse(rawDiagrams).map(d => ({ ...d, _diagram: true }))
        const combined = [...sections, ...diagrams]
        sectionsJsonPath = path.join(generatedDir, `${Date.now()}-sections.json`)
        await fs.writeFile(sectionsJsonPath, JSON.stringify(combined), 'utf-8')
      } catch (err) { console.warn('sections JSON parse failed:', err.message) }
    }

    const buildScript = path.join(repoRoot, 'scripts', 'build_hwpx.py')
    const args = [
      buildScript,
      '--template',
      'gonmun',
      '--output',
      outputPath,
      '--title',
      title,
      '--toc',
      toc.join('\n'),
      '--source-document',
      sourceDocumentName
    ]

    if (templatePath) {
      args.push('--template-file', templatePath)
    }
    if (sectionsJsonPath) {
      args.push('--sections-json', sectionsJsonPath)
    }

    let result
    try {
      result = await runProcess('python3', args, repoRoot)
    } finally {
      if (templatePath) fs.unlink(templatePath).catch(() => {})
      if (sectionsJsonPath) fs.unlink(sectionsJsonPath).catch(() => {})
    }

    if (!result.ok) {
      throw createHttpError(result.stderr || 'HWPX 생성에 실패했습니다.', 500)
    }

    res.json({
      ok: true,
      fileName: outputName,
      downloadUrl: `/generated/${outputName}`,
      message: templatePath
        ? '업로드한 HWPX 양식을 기준으로 새 문서를 생성했습니다.'
        : '업로드한 문서 내용을 바탕으로 기본 HWPX 양식의 새 문서를 생성했습니다.'
    })
  } catch (error) {
    res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message || 'HWPX 생성에 실패했습니다.'
    })
  }
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`v2 server listening on http://127.0.0.1:${PORT}`)
})

async function buildDraftWithAI(input) {
  const sourceText = String(input.sourceText || '').trim()
  const docType = String(input.docType || 'report').trim()
  const companyName = String(input.companyName || '회사명').trim()
  const goal = String(input.goal || '').trim()
  const notes = String(input.notes || '').trim()
  const fileName = String(input.fileName || 'uploaded-document').trim()
  const targetTitle = String(input.targetTitle || '').trim()
  const providerKey = String(input.aiProvider || 'anthropic').trim()
  const clientKey = String(input.aiApiKey || '').trim()

  const effectiveText = sourceText
    || `제목: ${targetTitle || '문서 초안'}\n목표: ${goal || '일반 문서 작성'}\n메모: ${notes || '없음'}\n회사: ${companyName}`

  const provider = AI_PROVIDERS[providerKey]
  if (!provider) {
    throw new Error(`지원하지 않는 AI 프로바이더입니다: ${providerKey}`)
  }

  const apiKey = process.env[provider.envKey] || clientKey
  if (!apiKey) {
    throw new Error(`API 키가 설정되지 않았습니다. 환경변수 ${provider.envKey}를 설정하거나 UI에서 직접 입력해 주세요.`)
  }

  const hasUploadedTemplate = Boolean(sourceText)
  const fallbackToc = buildToc(docType)
  const title = targetTitle || deriveTitle(fileName, docType)
  const docLabel = labelForDocType(docType)

  const prompt = hasUploadedTemplate
    ? `당신은 한국어 공식 문서 작성 전문가입니다.

아래는 사용자가 업로드한 원본 템플릿 문서에서 추출한 텍스트입니다:
---
${effectiveText}
---

위 원본 템플릿의 구조(제목, 목차, 섹션 순서, 문체)를 최대한 유지하면서, "${title}" 제목의 새로운 ${docLabel}를 작성해 주세요.
원본 템플릿에 있는 섹션 제목과 구조를 그대로 따르되, 본문 내용만 새로 작성하세요.

회사명: ${companyName}
${goal ? `작성 목표: ${goal}` : ''}
${notes ? `추가 참고: ${notes}` : ''}

다이어그램 data 형식:
- flowchart: data = ["단계1", "단계2", "단계3"] (최대 5개)
- timeline: data = [{"label": "이벤트명", "date": "2024.01"}, ...] (최대 6개)
- comparison: data = [{"label": "항목", "a": "현재값", "b": "개선값", "header_a": "현재", "header_b": "개선"}, ...] (최대 5개)
문서 내용에 가장 적합한 타입의 다이어그램을 1~2개 생성하세요. 불필요하면 빈 배열 []로 두세요.

응답은 반드시 아래 JSON 형식으로만 출력하세요. 다른 텍스트는 포함하지 마세요:
{
  "summary": "문서 전체 요약 (1~2문장)",
  "sections": [
    {"heading": "원본 템플릿의 섹션 제목을 그대로 사용", "body": "해당 섹션 본문 내용 (3~5문장)"},
    ...
  ],
  "diagrams": [
    {
      "_diagram": true,
      "afterSection": "해당 섹션 제목 (이 섹션 아래에 다이어그램 삽입)",
      "type": "flowchart 또는 timeline 또는 comparison",
      "title": "다이어그램 제목",
      "data": []
    }
  ]
}`
    : `당신은 한국어 공식 문서 작성 전문가입니다.

아래 조건에 맞는 "${title}" 제목의 ${docLabel}를 작성해 주세요.

회사명: ${companyName}
${goal ? `작성 목표: ${goal}` : ''}
${notes ? `추가 참고: ${notes}` : ''}

아래 목차 구조에 맞춰 각 섹션의 본문을 작성하세요:
${fallbackToc.map((item, i) => `${i + 1}. ${item}`).join('\n')}

다이어그램 data 형식:
- flowchart: data = ["단계1", "단계2", "단계3"] (최대 5개)
- timeline: data = [{"label": "이벤트명", "date": "2024.01"}, ...] (최대 6개)
- comparison: data = [{"label": "항목", "a": "현재값", "b": "개선값", "header_a": "현재", "header_b": "개선"}, ...] (최대 5개)
문서 내용에 가장 적합한 타입의 다이어그램을 1~2개 생성하세요. 불필요하면 빈 배열 []로 두세요.

응답은 반드시 아래 JSON 형식으로만 출력하세요. 다른 텍스트는 포함하지 마세요:
{
  "summary": "문서 전체 요약 (1~2문장)",
  "sections": [
    {"heading": "섹션 제목", "body": "해당 섹션 본문 내용 (3~5문장)"},
    ...
  ],
  "diagrams": [
    {
      "_diagram": true,
      "afterSection": "해당 섹션 제목 (이 섹션 아래에 다이어그램 삽입)",
      "type": "flowchart 또는 timeline 또는 comparison",
      "title": "다이어그램 제목",
      "data": []
    }
  ]
}`

  const text = providerKey === 'anthropic'
    ? await callAnthropic(provider, apiKey, prompt)
    : await callOpenAICompatible(provider, apiKey, prompt)

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('AI 응답에서 JSON을 파싱할 수 없습니다.')
  }

  const parsed = JSON.parse(jsonMatch[0])
  const lines = effectiveText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)

  return {
    title,
    summary: parsed.summary || `${companyName} 기준으로 ${docLabel} 초안을 생성했습니다.`,
    toc: parsed.sections.map((s) => s.heading),
    sections: parsed.sections,
    diagrams: parsed.diagrams || [],
    sourceExcerpt: lines.slice(0, 8),
    engine: provider.label
  }
}

async function callAnthropic(provider, apiKey, prompt) {
  const response = await fetch(provider.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: provider.defaultModel,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error?.message || `Anthropic API 오류 (${response.status})`)
  }

  const block = data.content?.find((b) => b.type === 'text')
  return block?.text || ''
}

async function callOpenAICompatible(provider, apiKey, prompt) {
  const response = await fetch(provider.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: provider.defaultModel,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: '당신은 한국어 공식 문서 작성 전문가입니다. 요청받은 JSON 형식으로만 응답하세요.' },
        { role: 'user', content: prompt }
      ]
    })
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error?.message || `${provider.label} API 오류 (${response.status})`)
  }

  return data.choices?.[0]?.message?.content || ''
}

function buildToc(docType) {
  const templates = {
    report: ['배경 및 목적', '현황 분석', '핵심 제안', '실행 계획', '기대 효과'],
    proposal: ['제안 개요', '문제 정의', '해결 방안', '구현 일정', '운영 지원'],
    minutes: ['회의 개요', '주요 논의', '결정 사항', '후속 액션', '일정 공유'],
    gonmun: ['문서 개요', '추진 배경', '요청 사항', '처리 기준', '협조 요청'],
    base: ['문서 개요', '핵심 내용', '세부 항목', '실행 계획', '참고 사항']
  }
  return templates[docType] || templates.report
}


function deriveTitle(fileName, docType) {
  const baseName = fileName.replace(/\.(hwp|hwpx)$/i, '').trim()
  const suffix = {
    report: '분석 보고서',
    proposal: '제안서',
    minutes: '회의록',
    gonmun: '공문 초안',
    base: '문서 초안'
  }[docType] || '문서 초안'
  return `${baseName} ${suffix}`.trim()
}

function labelForDocType(docType) {
  return {
    report: '보고서',
    proposal: '제안서',
    minutes: '회의록',
    gonmun: '공문서',
    base: '문서'
  }[docType] || '문서'
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/\.hwpx$/i, '')
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function sanitizeName(value) {
  return String(value).normalize('NFC').replace(/[^a-zA-Z0-9._-가-힣]/g, '-')
}

function createHttpError(message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function runProcess(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd })
    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => child.kill('SIGTERM'), 60000)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        ok: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim() || stdout.trim()
      })
    })
  })
}
