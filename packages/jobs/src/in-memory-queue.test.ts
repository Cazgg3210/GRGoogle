import { describe, expect, it } from 'vitest'
import { InMemoryJobQueue } from './in-memory-queue.js'

describe('InMemoryJobQueue', () => {
  it('ejecuta handlers y respeta singletonKey en modo manual', async () => {
    const q = new InMemoryJobQueue({ manual: true })
    const seen: string[] = []
    await q.work<{ id: string }>('analyze', async (p) => {
      seen.push(p.id)
    })
    expect(await q.enqueue('analyze', { id: 'a' }, { singletonKey: 'a' })).not.toBeNull()
    expect(await q.enqueue('analyze', { id: 'a' }, { singletonKey: 'a' })).toBeNull()
    expect(await q.enqueue('analyze', { id: 'b' })).not.toBeNull()
    expect(await q.drain()).toBe(2)
    expect(seen).toEqual(['a', 'b'])
    // tras drenar, el singleton se libera
    expect(await q.enqueue('analyze', { id: 'a' }, { singletonKey: 'a' })).not.toBeNull()
  })
})
