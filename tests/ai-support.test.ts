import { describe, expect, it } from 'vitest'
import { createAiSupport, ollamaDownloadPage } from '../src/main/ai-support'
import { findSupportArticles } from '../src/main/support-knowledge'
import { supportModel, supportTranscript } from '../src/shared/ai-support'
const json = (value: unknown) => new Response(JSON.stringify(value))
const installed = { models: [{ name: supportModel }] }

describe('local AI support', () => {
  it('detects missing Ollama; fixed installer links never accept arbitrary destinations', async () => {
    const ai = createAiSupport({
      version: 'synthetic',
      request: async () => {
        throw Error('offline')
      },
    })
    expect((await ai.check()).runtime).toBe('missing')
    expect(ollamaDownloadPage('darwin')).toBe('https://ollama.com/download/mac')
    expect(ollamaDownloadPage('win32')).toBe('https://ollama.com/download/windows')
    expect(() => ollamaDownloadPage('https://evil.invalid')).toThrow()
  })
  it('pulls only the fixed local model, handles split progress lines and reuses installed models', async () => {
    let pulled = false,
      pulls = 0
    const updates: number[] = []
    const ai = createAiSupport({
      version: 'synthetic',
      changed: (s) => {
        if (s.percent !== undefined) updates.push(s.percent)
      },
      request: async (url, options) => {
        expect(String(url)).toMatch(/^http:\/\/127\.0\.0\.1:11434\/api\/(tags|pull)$/)
        expect(options?.redirect).toBe('error')
        if (String(url).endsWith('/tags')) return json(pulled ? installed : { models: [] })
        expect(JSON.parse(options?.body as string)).toEqual({ model: supportModel, stream: true })
        pulls++
        pulled = true
        const encoder = new TextEncoder()
        return new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(
                encoder.encode('{"status":"pulling","digest":"synthetic","total":100,"completed":'),
              )
              c.enqueue(encoder.encode('50}\n{"status":"success"}\n'))
              c.close()
            },
          }),
        )
      },
    })
    expect((await ai.check()).modelReady).toBe(false)
    expect((await ai.download()).modelReady).toBe(true)
    expect(ai.state().busy).toBe(null)
    expect(updates).toContain(100)
    await ai.download()
    expect(pulls).toBe(1)
    expect(ai.state().busy).toBe(null)
  })
  it('never sends a cloud alias, credentials, files or diagnostics to the model; answers cite bundled help', async () => {
    const calls: { url: string; body: any }[] = []
    const ai = createAiSupport({
      version: 'synthetic-version',
      request: async (url, options) => {
        calls.push({
          url: String(url),
          body: options?.body ? JSON.parse(options.body as string) : undefined,
        })
        return String(url).endsWith('/tags')
          ? json(installed)
          : json({
              done: true,
              message: { content: 'Open the saved receipt. See Printing or emailing a receipt.' },
            })
      },
    })
    await ai.check()
    const result = await ai.ask('How do I print a receipt? Bearer synthetic-secret')
    const chat = calls.find((c) => c.url.endsWith('/chat'))!.body
    expect(chat.model).toBe(supportModel)
    expect(JSON.stringify(chat)).not.toContain('synthetic-secret')
    expect(chat.messages[0].content).toContain('synthetic-version')
    expect(chat.messages[0].content).toContain('Printing or emailing a receipt')
    expect(chat.tools).toBeUndefined()
    expect(chat.images).toBeUndefined()
    expect(result.turns[1]?.sources?.some((s) => s.id === 'receipt')).toBe(true)
    const remote = createAiSupport({
      version: 'synthetic',
      request: async () =>
        json({ models: [{ name: supportModel, remote_host: 'https://cloud.invalid' }] }),
    })
    expect((await remote.check()).modelReady).toBe(false)
    expect((await remote.download()).modelReady).toBe(false)
    await expect(remote.ask('print receipt')).rejects.toThrow('Set up')
  })
  it('returns an honest fallback for unknown subjects without sending a chat request', async () => {
    let calls = 0
    const ai = createAiSupport({
      version: 'synthetic',
      request: async () => {
        calls++
        return json(installed)
      },
    })
    await ai.check()
    const result = await ai.ask('quantum penguins astronomy')
    expect(calls).toBe(1)
    expect(result.turns[1]?.text).toContain('could not find documentation')
    expect(result.busy).toBe(null)
    expect(findSupportArticles('print receipt')[0]?.id).toBe('receipt')
  })
  it('cancel/reset aborts generation and discards late answers; failed responses can retry the original question', async () => {
    let answer: (r: Response) => void = () => {}
    let started: () => void = () => {}
    const called = new Promise<void>((r) => {
      started = r
    })
    let mode = 'pending'
    const ai = createAiSupport({
      version: 'synthetic',
      request: async (url) => {
        if (String(url).endsWith('/tags')) return json(installed)
        if (mode === 'pending') {
          started()
          return new Promise<Response>((r) => {
            answer = r
          })
        }
        return json({ done: true, message: { content: 'Open Registers.' } })
      },
    })
    await ai.check()
    const pending = ai.ask('open a register')
    await called
    ai.reset()
    mode = 'success'
    answer(json({ done: true, message: { content: 'Late answer' } }))
    await pending
    expect(ai.state().turns).toEqual([])
    await ai.ask('open a register')
    expect(ai.state().turns).toHaveLength(2)
    await expect(ai.ask('x'.repeat(2001))).rejects.toThrow('2,000')
    expect(supportTranscript(ai.state().turns, 'test')).toContain(
      'Assistant suggestions may be incorrect',
    )
  })
})

it('removes only the fixed local assistant model and confirms absence before reporting success', async () => {
  let ready = true
  const deletes: unknown[] = []
  const ai = createAiSupport({
    version: 'synthetic',
    request: async (url, options) => {
      expect(String(url)).toMatch(/^http:\/\/127\.0\.0\.1:11434\/api\/(tags|delete)$/)
      if (String(url).endsWith('/delete')) {
        expect(options?.method).toBe('DELETE')
        expect(options?.redirect).toBe('error')
        deletes.push(JSON.parse(options?.body as string))
        ready = false
        return new Response(null, { status: 200 })
      }
      return json(ready ? installed : { models: [] })
    },
  })
  await ai.check()
  expect((await ai.remove()).modelReady).toBe(false)
  expect(deletes).toEqual([{ model: supportModel }])
  expect(ai.state().busy).toBe(null)
  await expect(ai.ask('print receipt')).rejects.toThrow('Set up')
  const failed = createAiSupport({
    version: 'synthetic',
    request: async (url) =>
      String(url).endsWith('/tags') ? json(installed) : new Response(null, { status: 500 }),
  })
  await failed.check()
  const state = await failed.remove()
  expect(state.modelReady).toBe(true)
  expect(state.error).toBeTruthy()
})

it('incomplete downloads stay unavailable and resume only after a confirmed successful pull', async () => {
  let attempts = 0,
    ready = false
  const ai = createAiSupport({
    version: 'synthetic',
    request: async (url) => {
      if (String(url).endsWith('/tags')) return json(ready ? installed : { models: [] })
      attempts++
      if (attempts === 1)
        return new Response(
          '{"status":"pulling","digest":"synthetic","total":100,"completed":50}\n',
        )
      ready = true
      return new Response('{"status":"success"}\n')
    },
  })
  await ai.download()
  expect(ai.state().modelReady).toBe(false)
  expect(ai.state().error).toContain('did not finish')
  expect(ai.state().busy).toBe(null)
  await ai.download()
  expect(ai.state().modelReady).toBe(true)
  expect(ai.state().error).toBeUndefined()
  expect(attempts).toBe(2)
})
