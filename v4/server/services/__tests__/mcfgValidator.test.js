import { describe, it, expect } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseHeaderFontFaces } from '../mcfgValidator.js'

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
