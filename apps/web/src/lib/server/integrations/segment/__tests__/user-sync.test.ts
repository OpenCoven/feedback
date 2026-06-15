import { createHmac } from 'crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { segmentUserSync } from '../user-sync'

describe('segmentUserSync.handleIdentify', () => {
  const body = JSON.stringify({
    type: 'identify',
    userId: 'external-user-1',
    traits: { email: 'user@example.com', plan: 'pro' },
  })

  it('rejects unsigned identify requests when no incoming secret is configured', async () => {
    const request = new Request('https://example.com/api/integrations/segment/identify', {
      method: 'POST',
    })

    const result = await segmentUserSync.handleIdentify?.(request, body, {}, {})

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
    await expect((result as Response).text()).resolves.toBe(
      'Segment incoming secret is not configured'
    )
  })

  it('rejects identify requests when an incoming secret is configured but the signature is missing', async () => {
    const request = new Request('https://example.com/api/integrations/segment/identify', {
      method: 'POST',
    })

    const result = await segmentUserSync.handleIdentify?.(
      request,
      body,
      { incomingSecret: 'segment-secret' },
      {}
    )

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
    await expect((result as Response).text()).resolves.toBe('Missing x-signature header')
  })

  it('accepts identify requests with a valid signature', async () => {
    const incomingSecret = 'segment-secret'
    const signature = createHmac('sha1', incomingSecret).update(body).digest('base64')
    const request = new Request('https://example.com/api/integrations/segment/identify', {
      method: 'POST',
      headers: { 'x-signature': signature },
    })

    const result = await segmentUserSync.handleIdentify?.(request, body, { incomingSecret }, {})

    expect(result).toEqual({
      email: 'user@example.com',
      externalUserId: 'external-user-1',
      attributes: { email: 'user@example.com', plan: 'pro' },
    })
  })
})

describe('segmentUserSync.syncSegmentMembership', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('throws when Segment returns non-2xx responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('invalid write key', { status: 401, statusText: 'Unauthorized' })
        )
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      segmentUserSync.syncSegmentMembership?.(
        [{ email: 'user@example.com' }],
        'Enterprise Users',
        true,
        { outgoingEnabled: true },
        { writeKey: 'bad-key' }
      )
    ).rejects.toThrow('Failed to sync 1/1 users')

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0]?.[0]).toContain('Failed to sync user user@example.com:')
  })

  it('completes when Segment returns 2xx responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      segmentUserSync.syncSegmentMembership?.(
        [{ email: 'user@example.com' }],
        'Enterprise Users',
        false,
        { outgoingEnabled: true },
        { writeKey: 'valid-key' }
      )
    ).resolves.toBeUndefined()

    expect(errorSpy).not.toHaveBeenCalled()
  })
})
