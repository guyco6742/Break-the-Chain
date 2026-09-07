/**
 * Generates the demo video's backing track from scratch — no samples, no
 * library, nothing licensed. A store or YouTube upload with borrowed music
 * invites a copyright claim; synthesised audio cannot be claimed by anyone.
 *
 *   node scripts/soundtrack.mjs [seconds] [outfile]
 *
 * Driving instrumental rock: distorted power chords, a live-ish kit and a
 * pentatonic lead that arrives in the second half.
 */
import { writeFileSync } from 'node:fs'

const RATE = 44100
const BPM = 140
const BEAT = 60 / BPM
const BAR = BEAT * 4
const SIXTEENTH = BEAT / 4

/** Em – C – G – D. One bar each; the root of each power chord, as MIDI. */
const PROGRESSION = [40, 36, 43, 38]
/** E minor pentatonic, two octaves up, for the lead. */
const PENTATONIC = [64, 67, 69, 71, 74, 76]

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)
const clamp = (i, n) => i >= 0 && i < n

function env(t, attack, decay) {
  if (t < 0) return 0
  if (t < attack) return t / attack
  return Math.exp(-(t - attack) / decay)
}

/** Band-limited-ish sawtooth: bright enough to distort, without full aliasing. */
function saw(freq, t, partials = 12) {
  let v = 0
  for (let k = 1; k <= partials; k++) {
    if (freq * k > RATE / 2.2) break
    v += Math.sin(2 * Math.PI * freq * k * t) / k
  }
  return v * 0.55
}

function lowPass(buffer, cutoffHz) {
  const dt = 1 / RATE
  const rc = 1 / (2 * Math.PI * cutoffHz)
  const a = dt / (rc + dt)
  let last = 0
  for (let i = 0; i < buffer.length; i++) {
    last += a * (buffer[i] - last)
    buffer[i] = last
  }
}

/** x minus its own low end — the cheap way to get a high-pass. */
function highPass(buffer, cutoffHz) {
  const copy = Float32Array.from(buffer)
  lowPass(copy, cutoffHz)
  for (let i = 0; i < buffer.length; i++) buffer[i] -= copy[i]
}

/**
 * Karplus-Strong plucked string.
 *
 * A sawtooth through a waveshaper is a buzzer, not a guitar: every harmonic
 * starts and stops together and nothing decays the way a string does. This
 * excites a delay line with a burst of noise and filters it as it circulates,
 * which is what gives a real string its bright attack and its darkening tail.
 */
function karplusStrong(freq, samples, damping = 0.996, brightness = 0.5) {
  const size = Math.max(2, Math.round(RATE / freq))
  const line = new Float32Array(size)
  let last = 0
  for (let i = 0; i < size; i++) {
    // A lowpassed noise burst is the pick hitting the string.
    last = last * (1 - brightness) + (Math.random() * 2 - 1) * brightness
    line[i] = last
  }
  const out = new Float32Array(samples)
  let idx = 0
  let previous = 0
  for (let i = 0; i < samples; i++) {
    const current = line[idx]
    out[i] = current
    const averaged = (current + previous) * 0.5
    previous = current
    line[idx] = averaged * damping
    idx = (idx + 1) % size
  }
  return out
}

/**
 * A synthetic guitar-cabinet impulse response.
 *
 * This is the part everyone forgets. Distortion on its own is fizz; what makes
 * it sound like an amplifier is the speaker — a narrow band from roughly 80 Hz
 * to 4.5 kHz with a low-mid resonance and a hard top-end rolloff. Convolving
 * with a short IR does more for realism than any amount of waveshaping.
 */
function cabinetImpulse() {
  const length = 512
  const ir = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const t = i / RATE
    const decay = Math.exp(-t / 0.0016)
    ir[i] =
      (Math.random() * 2 - 1) * decay * 0.6 +
      Math.sin(2 * Math.PI * 105 * t) * Math.exp(-t / 0.010) * 0.9 +
      Math.sin(2 * Math.PI * 380 * t) * Math.exp(-t / 0.005) * 0.45 +
      Math.sin(2 * Math.PI * 2100 * t) * Math.exp(-t / 0.0018) * 0.3
  }
  lowPass(ir, 4600)
  highPass(ir, 85)
  let sum = 0
  for (const v of ir) sum += Math.abs(v)
  for (let i = 0; i < length; i++) ir[i] /= sum
  return ir
}

function convolve(signal, ir) {
  const out = new Float32Array(signal.length)
  for (let i = 0; i < signal.length; i++) {
    const v = signal[i]
    if (v === 0) continue
    const end = Math.min(ir.length, signal.length - i)
    for (let k = 0; k < end; k++) out[i + k] += v * ir[k]
  }
  return out
}

function reverb(input, { combs, allpasses, feedback, mix }) {
  const wet = new Float32Array(input.length)
  for (const delay of combs) {
    const line = new Float32Array(delay)
    let idx = 0
    for (let i = 0; i < input.length; i++) {
      const out = line[idx]
      wet[i] += out / combs.length
      line[idx] = input[i] + out * feedback
      idx = (idx + 1) % delay
    }
  }
  for (const delay of allpasses) {
    const line = new Float32Array(delay)
    let idx = 0
    for (let i = 0; i < wet.length; i++) {
      const buffered = line[idx]
      const out = -wet[i] + buffered
      line[idx] = wet[i] + buffered * 0.5
      idx = (idx + 1) % delay
      wet[i] = out
    }
  }
  const out = new Float32Array(input.length)
  for (let i = 0; i < input.length; i++) out[i] = input[i] * (1 - mix) + wet[i] * mix
  return out
}

export function renderSoundtrack(seconds) {
  const n = Math.floor(seconds * RATE)
  // Two separate takes, panned hard left and right. Double-tracking is how
  // every rock record gets its width; one centred take always sounds thin.
  const guitarTakes = [new Float32Array(n), new Float32Array(n)]
  const lead = new Float32Array(n)
  const bass = new Float32Array(n)
  const kick = new Float32Array(n)
  const snare = new Float32Array(n)
  const hats = new Float32Array(n)
  const crash = new Float32Array(n)

  const bars = Math.ceil(seconds / BAR)
  const lastBar = bars - 1
  let riffStep = 0

  for (let bar = 0; bar < bars; bar++) {
    const root = PROGRESSION[bar % PROGRESSION.length]
    const start = bar * BAR
    // Bar 0 is drums only, so the picture gets a beat before the wall of guitar.
    const guitarIn = bar >= 1
    const leadIn = bar >= 8 && bar < lastBar
    const outro = bar === lastBar

    const add = (buf, at, dur, fn) => {
      const from = Math.floor(at * RATE)
      const to = Math.min(n, Math.floor((at + dur) * RATE))
      for (let i = Math.max(0, from); i < to; i++) if (clamp(i, n)) buf[i] += fn(i / RATE - at)
    }

    for (let step = 0; step < 16; step++) {
      const at = start + step * SIXTEENTH
      if (at >= seconds) break

      // ---- kit ----------------------------------------------------------
      if ([0, 8, 11].includes(step) || (step === 14 && bar % 4 === 3)) {
        add(kick, at, 0.34, (t) => {
          const f = 45 + 105 * Math.exp(-t / 0.022) // pitch drop = the "thump"
          return Math.sin(2 * Math.PI * f * t) * env(t, 0.001, 0.09) * 0.95
        })
      }
      if ([4, 12].includes(step)) {
        add(snare, at, 0.26, (t) => {
          const body = Math.sin(2 * Math.PI * 185 * t) * 0.5 + Math.sin(2 * Math.PI * 278 * t) * 0.3
          const noise = (Math.random() * 2 - 1) * 1.1
          return (body + noise * 0.7) * env(t, 0.001, 0.062) * 0.34
        })
      }
      if (step % 2 === 0) {
        const accent = step % 4 === 0 ? 1 : 0.6
        add(hats, at, 0.05, (t) => (Math.random() * 2 - 1) * env(t, 0.0005, 0.009) * 0.17 * accent)
      }
      if (step === 0 && (bar === 1 || bar === 8 || outro)) {
        add(crash, at, 0.9, (t) => (Math.random() * 2 - 1) * env(t, 0.002, 0.2) * 0.2)
      }

      // ---- guitar: palm-muted eighths, ringing out at the end of the bar --
      if (guitarIn && step % 2 === 0) {
        const held = step === 12 || outro
        const dur = held ? BEAT * 2.2 : 0.19
        for (let take = 0; take < 2; take++) {
          // A few milliseconds and a few cents apart — the imperfection is the
          // point; two identical takes just sound louder, not wider.
          const nudge = take === 0 ? 0 : 0.0045
          const detune = take === 0 ? -3 : 4
          for (const interval of [0, 7, 12]) {
            const f = hz(root + interval) * 2 ** (detune / 1200)
            const startSample = Math.floor((at + nudge) * RATE)
            const len = Math.min(Math.floor(dur * RATE), n - startSample)
            if (len <= 0) continue
            const string = karplusStrong(f, len, held ? 0.9975 : 0.994, 0.42)
            for (let i = 0; i < len; i++) {
              // Palm mute: choke the note before the next eighth lands.
              const t = i / RATE
              const mute = held ? 1 : Math.exp(-t / 0.085)
              guitarTakes[take][startSample + i] += string[i] * mute * 0.4
            }
          }
        }
      }

      // ---- bass: straight eighths on the root ----------------------------
      if (guitarIn && step % 2 === 0) {
        const f = hz(root - 12)
        add(bass, at, 0.24, (t) => (saw(f, t, 6) + Math.sin(2 * Math.PI * f * t)) * env(t, 0.004, 0.14) * 0.42)
      }

      // ---- lead: pentatonic riff, second half only ------------------------
      if (leadIn && [0, 3, 6, 8, 11, 14].includes(step)) {
        const note = PENTATONIC[riffStep % PENTATONIC.length] + (riffStep % 7 === 6 ? 5 : 0)
        riffStep++
        const f = hz(note)
        add(lead, at, 0.5, (t) => saw(f, t, 6) * env(t, 0.006, 0.16) * 0.22)
      }
    }
  }

  // Amp: pre-emphasis into the distortion, then the speaker. Order matters —
  // clipping first and filtering after is what a real rig does.
  const cabinet = cabinetImpulse()
  for (let take = 0; take < 2; take++) {
    const g = guitarTakes[take]
    highPass(g, 90) // tighten the low end going into the gain stage
    for (let i = 0; i < n; i++) g[i] = Math.tanh(g[i] * 9)
    guitarTakes[take] = convolve(g, cabinet)
  }

  for (let i = 0; i < n; i++) {
    lead[i] = Math.tanh(lead[i] * 3.4)
    bass[i] = Math.tanh(bass[i] * 1.8) * 0.6
  }
  const leadCab = convolve(lead, cabinet)
  lead.set(leadCab)
  highPass(lead, 320)
  lowPass(bass, 700)
  highPass(hats, 7500)
  highPass(crash, 4200)
  lowPass(snare, 7000)

  // Guitars go wide, everything else stays centred.
  const dryL = new Float32Array(n)
  const dryR = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const centre = lead[i] * 3.2 + bass[i] * 0.9 + kick[i] + snare[i] + hats[i] + crash[i]
    dryL[i] = centre + guitarTakes[0][i] * 4.6 + guitarTakes[1][i] * 1.3
    dryR[i] = centre + guitarTakes[1][i] * 4.6 + guitarTakes[0][i] * 1.3
  }

  const left = reverb(dryL, { combs: [1116, 1188, 1277, 1356], allpasses: [225, 556], feedback: 0.6, mix: 0.12 })
  const right = reverb(dryR, { combs: [1139, 1211, 1300, 1379], allpasses: [231, 569], feedback: 0.6, mix: 0.12 })

  const fadeIn = RATE * 0.05
  const fadeOut = RATE * 1.6
  let peak = 0
  for (let i = 0; i < n; i++) {
    const g = Math.min(1, i / fadeIn, (n - i) / fadeOut)
    left[i] = Math.tanh(left[i] * g * 0.62)
    right[i] = Math.tanh(right[i] * g * 0.62)
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
  }
  const scale = peak > 0 ? 0.8 / peak : 1
  for (let i = 0; i < n; i++) {
    left[i] *= scale
    right[i] *= scale
  }
  return { left, right, rate: RATE }
}

/** 16-bit stereo PCM WAV. */
export function writeWav(path, { left, right, rate }) {
  const frames = left.length
  const buffer = Buffer.alloc(44 + frames * 4)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + frames * 4, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(2, 22)
  buffer.writeUInt32LE(rate, 24)
  buffer.writeUInt32LE(rate * 4, 28)
  buffer.writeUInt16LE(4, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(frames * 4, 40)
  for (let i = 0; i < frames; i++) {
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(left[i] * 32767))), 44 + i * 4)
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(right[i] * 32767))), 46 + i * 4)
  }
  writeFileSync(path, buffer)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seconds = Number(process.argv[2] ?? 34)
  const outfile = process.argv[3] ?? 'store-assets/soundtrack.wav'
  writeWav(outfile, renderSoundtrack(seconds))
  console.log(`${outfile} — ${seconds}s`)
}
