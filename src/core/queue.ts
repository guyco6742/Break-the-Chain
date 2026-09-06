export interface QueueOptions {
  /** Max requests in flight overall. */
  concurrency: number
  /** Max requests in flight against any single host. */
  perHostConcurrency: number
  /** Minimum gap between two requests to the same host, ms. */
  hostDelayMs: number
}

interface Job<T> {
  host: string
  run: () => Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
}

/**
 * A politeness-aware task queue.
 *
 * Plain `Promise.all` with a slice size hammers one host with every slot when a
 * page links to the same domain 400 times. This caps global concurrency, caps
 * per-host concurrency, and can enforce a minimum gap between hits on a host.
 */
export class TaskQueue {
  private readonly opts: QueueOptions
  private queue: Job<unknown>[] = []
  private inFlight = 0
  private hostInFlight = new Map<string, number>()
  private hostNextAt = new Map<string, number>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private idleWaiters: (() => void)[] = []
  private stopped = false

  constructor(opts: Partial<QueueOptions> = {}) {
    this.opts = {
      concurrency: Math.max(1, opts.concurrency ?? 8),
      perHostConcurrency: Math.max(1, opts.perHostConcurrency ?? 4),
      hostDelayMs: Math.max(0, opts.hostDelayMs ?? 0),
    }
  }

  get size(): number {
    return this.queue.length + this.inFlight
  }

  add<T>(host: string, run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ host, run, resolve, reject } as unknown as Job<unknown>)
      this.pump()
    })
  }

  /**
   * Hold off on a host for a while — used when a server answers 429 or 503.
   * Everything already queued for that host waits; other hosts keep going.
   */
  penalize(host: string, ms: number): void {
    const until = Date.now() + Math.max(0, ms)
    this.hostNextAt.set(host, Math.max(this.hostNextAt.get(host) ?? 0, until))
    this.pump()
  }

  /** Drop everything not yet started. In-flight jobs still settle. */
  clear(): void {
    const dropped = this.queue.splice(0, this.queue.length)
    for (const job of dropped) job.reject(new Error('cancelled'))
    this.maybeIdle()
  }

  stop(): void {
    this.stopped = true
    this.clear()
  }

  /** Resolves when the queue has drained. */
  onIdle(): Promise<void> {
    if (this.size === 0) return Promise.resolve()
    return new Promise((resolve) => this.idleWaiters.push(resolve))
  }

  private pump(): void {
    if (this.stopped) return
    const now = Date.now()
    let earliest = Infinity

    for (let i = 0; i < this.queue.length && this.inFlight < this.opts.concurrency; ) {
      const job = this.queue[i]
      const active = this.hostInFlight.get(job.host) ?? 0
      const readyAt = this.hostNextAt.get(job.host) ?? 0

      if (active >= this.opts.perHostConcurrency) { i++; continue }
      if (readyAt > now) { earliest = Math.min(earliest, readyAt); i++; continue }

      this.queue.splice(i, 1)
      this.start(job, now)
    }

    if (this.timer === null && earliest !== Infinity && this.inFlight < this.opts.concurrency) {
      this.timer = setTimeout(() => {
        this.timer = null
        this.pump()
      }, Math.max(1, earliest - now))
    }
  }

  private start(job: Job<unknown>, now: number): void {
    this.inFlight++
    this.hostInFlight.set(job.host, (this.hostInFlight.get(job.host) ?? 0) + 1)
    if (this.opts.hostDelayMs > 0) this.hostNextAt.set(job.host, now + this.opts.hostDelayMs)

    void job
      .run()
      .then(job.resolve, job.reject)
      .finally(() => {
        this.inFlight--
        const left = (this.hostInFlight.get(job.host) ?? 1) - 1
        if (left <= 0) this.hostInFlight.delete(job.host)
        else this.hostInFlight.set(job.host, left)
        this.pump()
        this.maybeIdle()
      })
  }

  private maybeIdle(): void {
    if (this.size > 0) return
    const waiters = this.idleWaiters.splice(0, this.idleWaiters.length)
    for (const w of waiters) w()
  }
}
