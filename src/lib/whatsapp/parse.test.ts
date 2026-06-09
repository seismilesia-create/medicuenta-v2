import { describe, it, expect } from 'vitest'
import { parseIncomingMessage } from './parse'

function textPayload(text: string) {
  return {
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: '111' },
      contacts: [{ profile: { name: 'Juan' } }],
      messages: [{ from: '5493834000000', id: 'wamid.ABC', type: 'text', text: { body: text } }],
    } }] }],
  }
}

describe('parseIncomingMessage', () => {
  it('parsea un mensaje de texto', () => {
    const m = parseIncomingMessage(textPayload('hola'))
    expect(m).toEqual({
      phoneNumberId: '111',
      from: '5493834000000',
      messageId: 'wamid.ABC',
      contactName: 'Juan',
      type: 'text',
      text: 'hola',
    })
  })

  it('parsea un documento (PDF) con su mediaId', () => {
    const payload = {
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: '111' },
        messages: [{ from: '549383', id: 'wamid.DOC', type: 'document',
          document: { id: 'media123', filename: 'receta.pdf', mime_type: 'application/pdf' } }],
      } }] }],
    }
    const m = parseIncomingMessage(payload)
    expect(m?.type).toBe('document')
    expect(m?.mediaId).toBe('media123')
    expect(m?.filename).toBe('receta.pdf')
  })

  it('devuelve null para un status update (sin messages)', () => {
    const payload = { entry: [{ changes: [{ value: { metadata: { phone_number_id: '111' }, statuses: [{}] } }] }] }
    expect(parseIncomingMessage(payload)).toBeNull()
  })
})
