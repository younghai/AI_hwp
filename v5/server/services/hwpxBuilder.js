import fs from 'fs/promises'
import { existsSync } from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { createHttpError } from '../lib/errors.js'
import { generatedDir, getDb, listGeneratedFilesBySid } from '../lib/db.js'
import { runProcess, slugify, sanitizeName } from '../lib/utils.js'
import { decodeOriginalName, assertValidUpload } from '../lib/upload.js'
import { validateHwpx } from './validator.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const v4Root = path.resolve(__dirname, '..', '..')
const scriptsDir = path.join(v4Root, 'scripts')
const buildScript = path.join(scriptsDir, 'build_hwpx.py')
const tempRootDir = path.join(os.tmpdir(), 'calendar-app-v4-hwpx')
const GENERATED_FILE_TTL_MS = 6 * 60 * 60 * 1000

const venvPython = path.join(v4Root, '.venv', 'bin', 'python3')
const pythonCmd = existsSync(venvPython) ? venvPython : 'python3'
const db = getDb()

await fs.mkdir(tempRootDir, { recursive: true })

const insertGeneratedFileStmt = db.prepare(`
  INSERT INTO generated_files (
    file_id, sid, file_name, file_path, created_at, expires_at, validation_json, diagram_report_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const getGeneratedFileStmt = db.prepare(`
  SELECT file_id, sid, file_name, file_path, created_at, expires_at, validation_json, diagram_report_json
  FROM generated_files
  WHERE file_id = ?
`)

const deleteGeneratedFileStmt = db.prepare(`
  DELETE FROM generated_files
  WHERE file_id = ?
`)

function createWorkDir() {
  return fs.mkdtemp(path.join(tempRootDir, 'build-'))
}

async function moveFileSafe(sourcePath, targetPath) {
  try {
    await fs.rename(sourcePath, targetPath)
  } catch (error) {
    if (error.code !== 'EXDEV') throw error
    await fs.copyFile(sourcePath, targetPath)
    await fs.unlink(sourcePath)
  }
}

function registerGeneratedFile({ sessionId, fileName, filePath, validation, diagramReport }) {
  const fileId = crypto.randomUUID()
  const now = Date.now()
  insertGeneratedFileStmt.run(
    fileId,
    sessionId,
    fileName,
    filePath,
    now,
    now + GENERATED_FILE_TTL_MS,
    validation ? JSON.stringify(validation) : null,
    diagramReport ? JSON.stringify(diagramReport) : null
  )
  return fileId
}

export async function getGeneratedFile(sessionId, fileId) {
  const entry = getGeneratedFileStmt.get(fileId)
  if (!entry) {
    throw createHttpError('생성된 파일을 찾을 수 없습니다.', 404)
  }
  if (Date.now() > Number(entry.expires_at)) {
    deleteGeneratedFileStmt.run(fileId)
    await fs.rm(entry.file_path, { force: true }).catch(() => {})
    throw createHttpError('생성된 파일의 다운로드 가능 시간이 만료되었습니다.', 410)
  }
  if (entry.sid !== sessionId) {
    throw createHttpError('다른 사용자 세션의 생성 파일에는 접근할 수 없습니다.', 403)
  }
  if (!existsSync(entry.file_path)) {
    deleteGeneratedFileStmt.run(fileId)
    throw createHttpError('생성된 파일이 더 이상 존재하지 않습니다.', 404)
  }
  return {
    fileId: entry.file_id,
    sessionId: entry.sid,
    fileName: entry.file_name,
    filePath: entry.file_path,
    createdAt: Number(entry.created_at),
    expiresAt: Number(entry.expires_at),
    validation: entry.validation_json ? JSON.parse(entry.validation_json) : null,
    diagramReport: entry.diagram_report_json ? JSON.parse(entry.diagram_report_json) : null
  }
}

export async function listGeneratedFiles(sessionId) {
  if (!sessionId) return []
  const now = Date.now()
  const rows = listGeneratedFilesBySid(sessionId)
  const items = []
  for (const row of rows) {
    if (now > Number(row.expires_at)) {
      continue
    }
    if (!existsSync(row.file_path)) {
      deleteGeneratedFileStmt.run(row.file_id)
      continue
    }
    items.push({
      fileId: row.file_id,
      fileName: row.file_name,
      downloadUrl: `/api/generated/${row.file_id}`,
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at),
      validation: row.validation_json ? JSON.parse(row.validation_json) : null,
      diagramReport: row.diagram_report_json ? JSON.parse(row.diagram_report_json) : null
    })
  }
  return items
}

function normalizeDiagrams(rawDiagrams, sections) {
  const sectionHeadings = Array.isArray(sections)
    ? sections.map((section) => String(section?.heading || '').trim())
    : []

  return (Array.isArray(rawDiagrams) ? rawDiagrams : []).map((diagram) => {
    const afterSection = String(diagram?.afterSection || '').trim()
    const indexFromHeading = afterSection ? sectionHeadings.findIndex((heading) => heading === afterSection) : -1
    const afterSectionIndex = Number.isInteger(diagram?.afterSectionIndex)
      ? Number(diagram.afterSectionIndex)
      : indexFromHeading >= 0
        ? indexFromHeading
        : null

    return {
      ...diagram,
      _diagram: true,
      afterSection,
      afterSectionIndex
    }
  })
}

export async function buildHwpx({ sessionId, title, rawToc, sourceMode, sourceFile, rawSections, rawDiagrams, docType }) {
  if (!sessionId) throw createHttpError('로그인 세션이 필요합니다.', 401)
  if (!title) throw createHttpError('제목이 비어 있습니다.', 422)

  if (sourceFile) {
    sourceFile.originalname = decodeOriginalName(sourceFile.originalname)
    assertValidUpload(sourceFile)
  }

  const toc = String(rawToc || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)

  const workDir = await createWorkDir()
  const outputName = `${slugify(title) || 'generated'}-${crypto.randomUUID()}.hwpx`
  const outputPath = path.join(workDir, outputName)

  let templatePath = null
  const sourceDocumentName = (sourceFile?.originalname || 'uploaded-document').normalize('NFC')
  const usedTemplateFile = Boolean(sourceFile && sourceFile.originalname.toLowerCase().endsWith('.hwpx'))

  if (usedTemplateFile) {
    const uploadPath = path.join(workDir, `${crypto.randomUUID()}-${sanitizeName(sourceFile.originalname)}`)
    await fs.writeFile(uploadPath, sourceFile.buffer)
    templatePath = uploadPath
  }

  if (!sourceFile && sourceMode === 'hwpx-template') {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
    throw createHttpError('HWPX 양식 기반으로 내보내려면 원본 파일이 필요합니다.', 422)
  }

  let sectionsJsonPath = null
  let reportJsonPath = null
  let diagramRequestCount = 0
  if (rawSections) {
    try {
      const sections = JSON.parse(rawSections)
      const diagrams = normalizeDiagrams(JSON.parse(rawDiagrams || '[]'), sections)
      diagramRequestCount = diagrams.length
      const combined = [...sections, ...diagrams]
      sectionsJsonPath = path.join(workDir, `${crypto.randomUUID()}-sections.json`)
      await fs.writeFile(sectionsJsonPath, JSON.stringify(combined), 'utf-8')
    } catch (err) {
      console.warn('sections JSON parse failed:', err.message)
    }
  }
  reportJsonPath = path.join(workDir, `${crypto.randomUUID()}-diagram-report.json`)

  const args = [
    buildScript,
    '--template', 'gonmun',
    '--output', outputPath,
    '--title', title,
    '--toc', toc.join('\n'),
    '--source-document', sourceDocumentName,
    '--report-json', reportJsonPath
  ]
  if (templatePath) args.push('--template-file', templatePath)
  if (sectionsJsonPath) args.push('--sections-json', sectionsJsonPath)

  let result
  let diagramReport = null
  try {
    result = await runProcess(pythonCmd, args, v4Root)
    try {
      const reportRaw = await fs.readFile(reportJsonPath, 'utf-8')
      diagramReport = JSON.parse(reportRaw)
    } catch {
      diagramReport = null
    }
  } catch (error) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
    throw createHttpError(`HWPX 생성 프로세스를 시작하지 못했습니다: ${error.message}`, 500)
  } finally {
    if (templatePath) fs.unlink(templatePath).catch(() => {})
    if (sectionsJsonPath) fs.unlink(sectionsJsonPath).catch(() => {})
    if (reportJsonPath) fs.unlink(reportJsonPath).catch(() => {})
  }

  if (!result.ok) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
    throw createHttpError(result.stderr || 'HWPX 생성에 실패했습니다.', 500)
  }

  // v4: 생성된 HWPX 에 대해 native + polaris 검증 실행.
  // docType 이 지정되면 v4/specs/<docType>.json 으로 polaris 규칙 적용.
  let validation
  const finalPath = path.join(generatedDir, outputName)
  try {
    validation = await validateHwpx(outputPath, {
      docType,
      diagramReport,
      expectedDiagramCount: diagramRequestCount
    })
    await moveFileSafe(outputPath, finalPath)
  } catch (error) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
    if (error?.status) throw error
    throw createHttpError(`생성 파일을 저장하지 못했습니다: ${error.message}`, 500)
  }
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})

  const embeddedCount = Number(diagramReport?.embeddedCount || 0)
  const diagramSummary = diagramRequestCount > 0
    ? ` 다이어그램 ${embeddedCount}/${diagramRequestCount}개 반영.`
    : ''
  const fileId = registerGeneratedFile({
    sessionId,
    fileName: outputName,
    filePath: finalPath,
    validation,
    diagramReport
  })

  return {
    fileName: outputName,
    downloadUrl: `/api/generated/${fileId}`,
    message: usedTemplateFile
      ? `업로드한 HWPX 양식을 기준으로 새 문서를 생성했습니다.${diagramSummary}`
      : `업로드한 문서 내용을 바탕으로 기본 HWPX 양식의 새 문서를 생성했습니다.${diagramSummary}`,
    validation,
    diagramReport
  }
}
