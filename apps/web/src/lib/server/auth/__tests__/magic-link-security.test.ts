import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const testDir = dirname(fileURLToPath(import.meta.url))
const authIndexSource = readFileSync(resolve(testDir, '../index.ts'), 'utf8')

describe('magic-link security configuration', () => {
  it('keeps Better Auth magic-link verification single-use', () => {
    expect(authIndexSource).not.toContain('allowedAttempts')
  })

  it('does not log bearer magic-link tokens from request URLs', () => {
    expect(authIndexSource).toContain('redactMagicLinkSearch(url.search)')
    expect(authIndexSource).not.toContain('${url.pathname}${url.search}')
  })
})
