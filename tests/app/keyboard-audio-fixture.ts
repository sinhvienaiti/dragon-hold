import { vi } from "vitest";

export class Param {
  value = 1;
  cancelScheduledValues = vi.fn();
  setValueAtTime(value: number): void { this.value = value; }
  linearRampToValueAtTime(value: number): void { this.value = value; }
}
export class TestGain {
  gain = new Param();
  target: unknown;
  constructor(_ctx?: unknown, options?: { gain: number }) { if (options) this.gain.value = options.gain; }
  connect(target: unknown): void { this.target = target; }
  disconnect = vi.fn();
}
export class TestSource {
  buffer: AudioBuffer | null = null;
  target: unknown;
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  constructor(ctx: TestContext, options?: { buffer: AudioBuffer }) {
    if (options) this.buffer = options.buffer;
    ctx.sources.push(this);
  }
  connect(target: unknown): void { this.target = target; }
  disconnect = vi.fn();
}
export class TestContext {
  currentTime = 0;
  state = "running";
  destination = {};
  sources: TestSource[] = [];
  decodeAudioData = vi.fn(async (bytes: ArrayBuffer) => ({ duration: 1, url: new TextDecoder().decode(bytes) }) as unknown as AudioBuffer);
  resume = vi.fn(async () => { this.state = "running"; });
  createGain(): TestGain { return new TestGain(); }
  createBufferSource(): TestSource { return new TestSource(this); }
}

export const flush = async (): Promise<void> => { for (let i = 0; i < 80; i += 1) await Promise.resolve(); };
