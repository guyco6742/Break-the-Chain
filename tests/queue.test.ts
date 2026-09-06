import { describe, it, expect } from 'vitest'
import { TaskQueue } from '../src/core/queue.js'

const defer = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('TaskQueue', () => {
  it('never exceeds global concurrency', async () => {
    const q = new TaskQueue({ concurrency: 3, perHostConcurrency: 99 })
    let active = 0
    let peak = 0
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        q.add(`h${i}`, async () => {
          active++
          peak = Math.max(peak, active)
          await defer(5)
          active--
        }),
      ),
    )
    expect(peak).toBeLessThanOrEqual(3)
    expect(peak).toBeGreaterThan(1)
  })

  it('never exceeds per-host concurrency', async () => {
    const q = new TaskQueue({ concurrency: 10, perHostConcurrency: 2 })
    let active = 0
    let peak = 0
    await Promise.all(
      Array.from({ length: 10 }, () =>
        q.add('same-host', async () => {
          active++
          peak = Math.max(peak, active)
          await defer(5)
          active--
        }),
      ),
    )
    expect(peak).toBe(2)
  })

  it('lets a free host through while another host is saturated', async () => {
    const q = new TaskQueue({ concurrency: 4, perHostConcurrency: 1 })
    const order: string[] = []
    const slow = q.add('a', async () => { await defer(30); order.push('a') })
    const fast = q.add('b', async () => { order.push('b') })
    await Promise.all([slow, fast])
    expect(order).toEqual(['b', 'a'])
  })

  it('honours a per-host delay', async () => {
    const q = new TaskQueue({ concurrency: 4, perHostConcurrency: 1, hostDelayMs: 40 })
    const stamps: number[] = []
    const t0 = Date.now()
    await Promise.all([
      q.add('h', async () => { stamps.push(Date.now() - t0) }),
      q.add('h', async () => { stamps.push(Date.now() - t0) }),
    ])
    expect(stamps[1]).toBeGreaterThanOrEqual(35)
  })

  it('propagates rejections without stalling the queue', async () => {
    const q = new TaskQueue({ concurrency: 2, perHostConcurrency: 2 })
    const bad = q.add('h', async () => { throw new Error('boom') })
    const good = q.add('h', async () => 'fine')
    await expect(bad).rejects.toThrow('boom')
    await expect(good).resolves.toBe('fine')
  })

  it('clear() rejects everything not yet started', async () => {
    const q = new TaskQueue({ concurrency: 1, perHostConcurrency: 1 })
    const first = q.add('h', async () => { await defer(20); return 1 })
    const second = q.add('h', async () => 2)
    q.clear()
    await expect(second).rejects.toThrow('cancelled')
    await expect(first).resolves.toBe(1)
  })

  it('penalize() holds one host back without stalling the others', async () => {
    const q = new TaskQueue({ concurrency: 4, perHostConcurrency: 2 })
    const order: string[] = []
    q.penalize('slow.com', 60)
    const slow = q.add('slow.com', async () => { order.push('slow') })
    const fast = q.add('fast.com', async () => { order.push('fast') })
    await Promise.all([slow, fast])
    expect(order).toEqual(['fast', 'slow'])
  })

  it('penalize() takes the longest of stacked penalties', async () => {
    const q = new TaskQueue({ concurrency: 2, perHostConcurrency: 2 })
    const t0 = Date.now()
    q.penalize('h', 80)
    q.penalize('h', 20) // must not shorten the existing hold
    await q.add('h', async () => {})
    expect(Date.now() - t0).toBeGreaterThanOrEqual(70)
  })

  it('onIdle resolves once everything drains', async () => {
    const q = new TaskQueue({ concurrency: 2, perHostConcurrency: 2 })
    for (let i = 0; i < 6; i++) void q.add('h', async () => { await defer(5) }).catch(() => {})
    await q.onIdle()
    expect(q.size).toBe(0)
  })
})
