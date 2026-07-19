import { describe, expect, it, vi } from 'vitest'

const {
  listDoubaoVoices,
  signedRequest,
} = require('../doubaoVoiceService')

function response(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  }
}

describe('doubaoVoiceService', () => {
  it('creates a deterministic Volcengine HMAC request without exposing the secret', () => {
    const request = signedRequest({
      accessKey: 'AKLT-test',
      secretKey: 'secret-value',
      action: 'ListSpeakers',
      version: '2025-05-20',
      region: 'cn-beijing',
      body: { ResourceIDs: ['seed-tts-1.0'], Page: 1, Limit: 100 },
      now: new Date('2026-07-16T04:00:00.000Z'),
    })

    expect(request.url).toBe('https://open.volcengineapi.com/?Action=ListSpeakers&Version=2025-05-20')
    expect(request.headers['X-Date']).toBe('20260716T040000Z')
    expect(request.headers.Authorization).toContain('Credential=AKLT-test/20260716/cn-beijing/speech_saas_prod/request')
    expect(request.headers.Authorization).not.toContain('secret-value')
  })

  it('returns selectable preset voices from ListSpeakers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({
      ResponseMetadata: {},
      Result: {
        Total: 1,
        Speakers: [{
          VoiceType: 'zh_female_test_bigtts',
          Name: '测试女声',
          Description: '清晰自然',
          ResourceID: 'seed-tts-1.0',
        }],
      },
    }))

    await expect(listDoubaoVoices({
      kind: 'preset',
      accessKey: 'AKLT-test',
      secretKey: 'secret',
    }, fetchImpl)).resolves.toEqual([expect.objectContaining({
      id: 'zh_female_test_bigtts',
      name: '测试女声',
      status: 'available',
    })])
  })

  it('returns the current app clone speakers and their training states', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({
      ResponseMetadata: {},
      Result: {
        AppID: '1000000000',
        TotalCount: 1,
        Statuses: [{ SpeakerID: 'S_clone_01', State: 'Success', DemoAudio: 'https://example.com/demo.mp3' }],
      },
    }))

    await expect(listDoubaoVoices({
      kind: 'clone',
      appId: '1000000000',
      accessKey: 'AKLT-test',
      secretKey: 'secret',
    }, fetchImpl)).resolves.toEqual([expect.objectContaining({
      id: 'S_clone_01',
      status: 'Success',
    })])
  })

  it('requires account-level management credentials', async () => {
    await expect(listDoubaoVoices({ kind: 'preset' })).rejects.toThrow('Access Key')
  })

  it('redacts credentials echoed by OpenAPI errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        ResponseMetadata: {
          Error: { Message: 'The security token AKLT-sensitive-credential-value is invalid' },
        },
      })),
    })

    const call = listDoubaoVoices({
      kind: 'preset',
      accessKey: 'AKLT-sensitive-credential-value',
      secretKey: 'secret-sensitive-credential-value',
    }, fetchImpl)
    await expect(call).rejects.not.toThrow('AKLT-sensitive-credential-value')
    await expect(call).rejects.toThrow('[masked]')
  })

  it('explains that signature failures require an IAM Access Key pair', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        ResponseMetadata: {
          Error: {
            Code: 'SignatureDoesNotMatch',
            Message: 'The request signature we calculated does not match the signature you provided.',
          },
        },
      })),
    })

    await expect(listDoubaoVoices({
      kind: 'preset',
      accessKey: 'AKLT-test',
      secretKey: 'wrong-secret',
    }, fetchImpl)).rejects.toThrow('Access Key ID 和 Secret Access Key')
  })
})
