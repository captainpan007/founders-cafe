class CafeMic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new Int16Array(1600);
    this.at = 0;
  }
  process(inputs) {
    const samples = inputs[0]?.[0];
    if (!samples) return true;
    for (const sample of samples) {
      this.chunk[this.at++] = Math.round(
        Math.max(-1, Math.min(1, sample)) * 32767,
      );
      if (this.at === this.chunk.length) {
        this.port.postMessage(this.chunk.buffer, [this.chunk.buffer]);
        this.chunk = new Int16Array(1600);
        this.at = 0;
      }
    }
    return true;
  }
}
registerProcessor("cafe-mic", CafeMic);
