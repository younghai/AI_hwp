import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { createHttpError } from '../lib/errors.js'
import { runProcess, slugify, sanitizeName } from '../lib/utils.js'
import { decodeOriginalName, assertValidUpload } from '../lib/upload.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const v2Root = path.resolve(__dirname, '..', '..')
const repoRoot = path.resolve(v2Root, '..')
const generatedDir = path.join(v2Root, 'generated')

await fs.mkdir(generatedDir, { recursive: true })

export const generatedDirectory = generatedDir

export async function buildHwpx({ title, rawToc, sourceMode, sourceFile, rawSections, rawDiagrams }) {
  if (!title) throw createHttpError('제목이 비어 있습니다.', 422)

  if (sourceFile) {
    sourceFile.originalname = decodeOriginalName(sourceFile.originalname)
    assertValidUpload(sourceFile)
  }

  const toc = String(rawToc || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)

  const outputName = `${slugify(title) || 'generated'}-${Date.now()}.hwpx`
  const outputPath = path.join(generatedDir, outputName)

  let templatePath = null
  const sourceDocumentName = (sourceFile?.originalname || 'uploaded-document').normalize('NFC')

  if (sourceFile && sourceFile.originalname.toLowerCase().endsWith('.hwpx')) {
    const uploadPath = path.join(generatedDir, `${Date.now()}-${sanitizeName(sourceFile.originalname)}`)
    await fs.writeFile(uploadPath, sourceFile.buffer)
    templatePath = uploadPath
  }

  if (!sourceFile && sourceMode === 'hwpx-template') {
    throw createHttpError('HWPX 양식 기반으로 내보내려면 원본 파일이 필요합니다.', 422)
  }

  let sectionsJsonPath = null
  if (rawSections) {
    try {
      const sections = JSON.parse(rawSections)
      const diagrams = JSON.parse(rawDiagrams || '[]').map((d) => ({ ...d, _diagram: true }))
      const combined = [...sections, ...diagrams]
      sectionsJsonPath = path.join(generatedDir, `${Date.now()}-sections.json`)
      await fs.writeFile(sectionsJsonPath, JSON.stringify(combined), 'utf-8')
    } catch (err) {
      console.warn('sections JSON parse failed:', err.message)
    }
  }

  const buildScript = path.join(repoRoot, 'scripts', 'build_hwpx.py')
  const args = [
    buildScript,
    '--template', 'gonmun',
    '--output', outputPath,
    '--title', title,
    '--toc', toc.join('\n'),
    '--source-document', sourceDocumentName
  ]
  if (templatePath) args.push('--template-file', templatePath)
  if (sectionsJsonPath) args.push('--sections-json', sectionsJsonPath)

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

  return {
    fileName: outputName,
    downloadUrl: `/generated/${outputName}`,
    message: templatePath
      ? '업로드한 HWPX 양식을 기준으로 새 문서를 생성했습니다.'
      : '업로드한 문서 내용을 바탕으로 기본 HWPX 양식의 새 문서를 생성했습니다.'
  }
}
