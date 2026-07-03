import { describe, it, expect } from 'vitest'
import { validateDraftPayload } from '../../../shared/validate.js'

describe('validateDraftPayload', () => {
  it('accepts a valid draft', () => {
    const draft = {
      summary: '테스트 요약',
      sections: [{ heading: '제목', body: '본문' }],
      diagrams: []
    }
    expect(() => validateDraftPayload(draft)).not.toThrow()
  })

  it('defaults a missing summary to an empty string instead of rejecting', () => {
    // The caller (server/services/draft.js) already falls back to a generated
    // summary when this is empty, so treating a missing summary as optional
    // here — rather than throwing — is the intended, consistent behavior.
    const draft = {
      sections: [{ heading: '제목', body: '본문' }],
      diagrams: []
    }
    expect(validateDraftPayload(draft).summary).toBe('')
  })

  it('rejects empty sections', () => {
    const draft = {
      summary: '요약',
      sections: [],
      diagrams: []
    }
    expect(() => validateDraftPayload(draft)).toThrow()
  })
})
