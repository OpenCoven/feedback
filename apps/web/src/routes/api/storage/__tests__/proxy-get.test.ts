import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockIsS3Configured = vi.fn(() => true)
const mockGeneratePresignedGetUrl = vi.fn(
  async (key: string) => `https://s3.example/${key}?signed=1`
)
const mockGetS3Object = vi.fn()

vi.mock('@/lib/server/storage/s3', () => ({
  isS3Configured: mockIsS3Configured,
  generatePresignedGetUrl: mockGeneratePresignedGetUrl,
  getS3Object: mockGetS3Object,
}))

const mockConfig = { s3Proxy: true }
vi.mock('@/lib/server/config', () => ({ config: mockConfig }))

const { handleProxyGet } = await import('../$.js')

function streamFromText(text: string): ReadableStream<Uint8Array> {
  return new Response(text).body!
}

function makeRequest(key: string, search = ''): Request {
  return new Request(`http://localhost/api/storage/${key}${search}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockConfig.s3Proxy = true
  mockIsS3Configured.mockReturnValue(true)
  mockGeneratePresignedGetUrl.mockImplementation(
    async (key: string) => `https://s3.example/${key}?signed=1`
  )
  mockGetS3Object.mockResolvedValue({
    body: streamFromText('file-body'),
    contentType: 'image/png',
  })
})

describe('GET /api/storage/* (proxy)', () => {
  it('preserves safe image content types and sets nosniff', async () => {
    mockGetS3Object.mockResolvedValueOnce({
      body: streamFromText('png-bytes'),
      contentType: 'image/png',
    })

    const res = await handleProxyGet({ request: makeRequest('uploads/safe-image.png') })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Content-Disposition')).toBeNull()
    expect(await res.text()).toBe('png-bytes')
  })

  it('serves non-image objects as attachments without reflecting active content types', async () => {
    mockGetS3Object.mockResolvedValueOnce({
      body: streamFromText('<!doctype html><script>alert(1)</script>'),
      contentType: 'text/html',
    })

    const res = await handleProxyGet({ request: makeRequest('uploads/evil.html') })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="evil.html"')
    expect(await res.text()).toBe('<!doctype html><script>alert(1)</script>')
  })

  it('applies safe headers to cached non-image objects', async () => {
    mockGetS3Object.mockResolvedValueOnce({
      body: streamFromText('<svg onload="alert(1)"></svg>'),
      contentType: 'image/svg+xml',
    })

    const key = 'uploads/evil.svg'
    const first = await handleProxyGet({ request: makeRequest(key) })
    const second = await handleProxyGet({ request: makeRequest(key) })

    expect(first.headers.get('Content-Type')).toBe('application/octet-stream')
    expect(second.headers.get('Content-Type')).toBe('application/octet-stream')
    expect(second.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(second.headers.get('Content-Disposition')).toBe('attachment; filename="evil.svg"')
    expect(mockGetS3Object).toHaveBeenCalledTimes(1)
  })

  it('redirects to S3 when proxy mode is disabled and email proxy is not requested', async () => {
    mockConfig.s3Proxy = false

    const res = await handleProxyGet({ request: makeRequest('uploads/file.html') })

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://s3.example/uploads/file.html?signed=1')
    expect(mockGetS3Object).not.toHaveBeenCalled()
  })
})
