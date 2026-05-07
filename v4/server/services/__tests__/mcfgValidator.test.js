import { describe, it, expect, vi } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseHeaderFontFaces } from '../mcfgValidator.js'
import { loadMapping, lookupMapping } from '../mcfgValidator.js'
import { runMcfgCompare } from '../mcfgValidator.js'

vi.mock('../../lib/utils.js', () => ({
  runProcess: vi.fn()
}))
import { runProcess } from '../../lib/utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = path.resolve(__dirname, '../../../tests/fixtures')

describe('parseHeaderFontFaces', () => {
  it('extracts font family names from header.xml', async () => {
    const result = await parseHeaderFontFaces(path.join(fixtureDir, 'sample-with-fonts.hwpx'))
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ family: '함초롱바탕' }),
      expect.objectContaining({ family: 'HY헤드라인M' }),
      expect.objectContaining({ family: 'UnknownFont' })
    ]))
    expect(result.length).toBe(3)
  })

  it('returns empty array when no fontFace declared', async () => {
    const result = await parseHeaderFontFaces(path.join(fixtureDir, 'sample-no-fonts.hwpx'))
    expect(result).toEqual([])
  })

  it('throws for corrupt zip', async () => {
    await expect(parseHeaderFontFaces(path.join(fixtureDir, 'sample-corrupt.hwpx')))
      .rejects.toThrow()
  })
})

describe('lookupMapping', () => {
  it('matches NFC-normalized family name', async () => {
    const mapping = await loadMapping()
    expect(lookupMapping(mapping, '함초롱바탕')).toBe('kopub-batang.json')
    expect(lookupMapping(mapping, 'HY헤드라인M')).toBe('noto-sans-kr.json')
  })

  it('matches NFD-input by normalizing to NFC', async () => {
    const mapping = await loadMapping()
    const nfd = '함초롱바탕'.normalize('NFD')
    expect(lookupMapping(mapping, nfd)).toBe('kopub-batang.json')
  })

  it('returns null for unknown family', async () => {
    const mapping = await loadMapping()
    expect(lookupMapping(mapping, 'Some-Random-Font')).toBe(null)
  })
})

describe('runMcfgCompare', () => {
  it('returns ok=true with parsed JSON when mcfg succeeds', async () => {
    runProcess.mockResolvedValue({
      ok: true,
      stdout: JSON.stringify({ advanceDiff: { commonCount: 10, mismatchCount: 2, samples: [] } }),
      stderr: ''
    })
    const result = await runMcfgCompare('/tmp/a.json', '/tmp/b.json')
    expect(result.ok).toBe(true)
    expect(result.mismatchCount).toBe(2)
  })

  it('returns ok=false when mcfg exits non-zero', async () => {
    runProcess.mockResolvedValue({
      ok: false, stdout: '', stderr: 'mcfg: file not found'
    })
    const result = await runMcfgCompare('/tmp/a.json', '/tmp/b.json')
    expect(result.ok).toBe(false)
    expect(result.stderr).toContain('file not found')
  })

  it('returns ok=false on JSON parse failure', async () => {
    runProcess.mockResolvedValue({
      ok: true, stdout: 'not valid json {{{', stderr: ''
    })
    const result = await runMcfgCompare('/tmp/a.json', '/tmp/b.json')
    expect(result.ok).toBe(false)
  })
})
