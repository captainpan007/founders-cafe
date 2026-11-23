let ctx,
  stream,
  capture,
  stageId,
  play,
  playAt = 0;
export let listening = false;
export async function listen(on, socket) {
  if (on) {
    play ??= new AudioContext({ sampleRate: 16000 });
    await play.resume();
  } else if (play) {
    await play.close();
    play = null;
    playAt = 0;
  }
  listening = on;
  if (socket?.readyState === 1) socket.send(on ? "listen" : "quiet");
}
export function receive(data, stage) {
  if (!listening || !play || !stage || data.byteLength <= 32) return;
  if (new TextDecoder().decode(data.slice(0, 32)) !== stage.id) return;
  const samples = new Int16Array(data, 32),
    b = play.createBuffer(1, samples.length, 16000),
    f = b.getChannelData(0);
  for (let i = 0; i < f.length; i++) f[i] = samples[i] / 32768;
  if (playAt > play.currentTime + 0.55) return;
  const n = play.createBufferSource();
  n.buffer = b;
  n.connect(play.destination);
  playAt = Math.max(play.currentTime + 0.028, playAt);
  n.start(playAt);
  playAt += b.duration;
}
export async function mic(id, socket, confirm) {
  try {
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error("Microphone requires localhost or HTTPS");
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true },
      video: false,
    });
    ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.resume();
    await ctx.audioWorklet.addModule("/capture.js");
    const source = ctx.createMediaStreamSource(stream);
    capture = new AudioWorkletNode(ctx, "cafe-mic");
    const silent = ctx.createGain();
    silent.gain.value = 0;
    source.connect(capture).connect(silent).connect(ctx.destination);
    await confirm();
    stageId = id;
    const label = new TextEncoder().encode(id);
    capture.port.onmessage = (e) => {
      if (!stageId || socket?.readyState !== 1 || socket.bufferedAmount > 64000)
        return;
      const pkt = new Uint8Array(32 + e.data.byteLength);
      pkt.set(label);
      pkt.set(new Uint8Array(e.data), 32);
      socket.send(pkt);
    };
  } catch (error) {
    stopMic();
    throw error;
  }
}
export function stopMic() {
  stageId = null;
  if (capture) {
    capture.port.onmessage = null;
    capture.disconnect();
    capture = null;
  }
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (ctx) {
    ctx.close().catch(() => {});
    ctx = null;
  }
}
export function micStage() {
  return stageId;
}
