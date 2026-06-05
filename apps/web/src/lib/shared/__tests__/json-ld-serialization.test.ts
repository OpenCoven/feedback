import { describe, expect, it } from 'vitest'
import { serializeJsonLd } from '../json-ld-serialization'

describe('serializeJsonLd', () => {
  it('escapes script-breaking characters while preserving JSON values', () => {
    const payload = '</script><script>alert(1)</script>&'

    const result = serializeJsonLd({ headline: payload })

    expect(result).not.toContain('</script>')
    expect(result).not.toContain('<script>')
    expect(result).toContain('\\u003c/script\\u003e\\u003cscript\\u003e')
    expect(result).toContain('\\u0026')
    expect(JSON.parse(result).headline).toBe(payload)
  })
})
