import { describe, expect, test } from 'bun:test'

import { findLocalModel } from './localModel'

const connection = (id: string, providerId: string) => ({ id, providerId })
const chatModel = (id: string) => ({ id, kind: 'chat' as const })
const ollama = (id: string) => ({ id, name: `${id} (Ollama)`, server: 'Ollama' })

describe('findLocalModel', () => {
  test('a downloaded chat model behind the Local connection is used, with its route', () => {
    expect(
      findLocalModel(
        [connection('c-cloud', 'anthropic'), connection('c-local', 'local')],
        [{ id: 'emb', kind: 'embedding' }, chatModel('gemma:Q4')],
      ),
    ).toEqual({ connectionId: 'c-local', modelId: 'gemma:Q4' })
  })

  test('a model running in Ollama is a local model, even before Local is connected', () => {
    expect(findLocalModel([], [], [ollama('gemma4:e4b-it-qat')])).toEqual({
      connectionId: null,
      modelId: 'gemma4:e4b-it-qat',
    })
    expect(
      findLocalModel([connection('c-local', 'local')], [], [ollama('gemma4:e4b-it-qat')]),
    ).toEqual({ connectionId: 'c-local', modelId: 'gemma4:e4b-it-qat' })
  })

  test('only an embedding model (search) is not a model to plan with', () => {
    expect(findLocalModel([connection('c-local', 'local')], [{ id: 'e', kind: 'embedding' }])).toBe(
      null,
    )
  })

  test('another model server connected as a provider (LM Studio) counts too', () => {
    expect(findLocalModel([connection('c-lm', 'lmstudio')], [])).toEqual({
      connectionId: 'c-lm',
      modelId: null,
    })
  })

  test('cloud providers alone are not a local model', () => {
    expect(findLocalModel([connection('c-cloud', 'openai')], [])).toBeNull()
  })
})
