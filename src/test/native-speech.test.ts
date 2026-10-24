import { beforeEach, describe, expect, it, vi } from "vitest";

// The phone's recognizer, faked: tests fire its events by hand.
const plugin = vi.hoisted(() => {
  const handlers: Record<string, (e: unknown) => void> = {};
  return {
    handlers,
    permission: "granted" as "granted" | "denied" | "prompt",
    available: true,
    platform: "android" as "android" | "ios",
    listenerCount: 0,
    fire: (name: string, e: unknown) => handlers[name]?.(e),
    api: {
      addListener: async (name: string, fn: (e: unknown) => void) => { plugin.listenerCount++; handlers[name] = fn; return { remove: async () => {} }; },
      checkPermissions: vi.fn(async () => ({ speechRecognition: plugin.permission })),
      requestPermissions: vi.fn(async () => ({ speechRecognition: plugin.permission })),
      available: vi.fn(async () => ({ available: plugin.available })),
      start: vi.fn(async () => ({})),
      stop: vi.fn(async () => {}),
    },
  };
});

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => plugin.platform } }));
vi.mock("@capgo/capacitor-speech-recognition", () => ({ SpeechRecognition: plugin.api }));
vi.mock("@capacitor-community/text-to-speech", () => ({ TextToSpeech: { speak: vi.fn(async () => {}), stop: vi.fn(async () => {}) } }));

// The adapter keeps app-wide state (listeners, permission): each test loads a fresh copy.
let NativeRecognition: typeof import("@/lib/native-speech").NativeRecognition;
let hasNativeSpeech: typeof import("@/lib/native-speech").hasNativeSpeech;

type Result = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
const flush = () => new Promise((r) => setTimeout(r, 0));

function listen() {
  const rec = new NativeRecognition();
  const got: { text: string; final: boolean }[] = [];
  const events: string[] = [];
  rec.onresult = (e: Result) => { const r = e.results[0]; got.push({ text: r[0].transcript, final: r.isFinal }); };
  rec.onerror = (e) => events.push(`error:${e.error}`);
  rec.onend = () => events.push("end");
  rec.onspeechend = () => events.push("speechend");
  return { rec, got, events };
}

describe("speech in the native apps", () => {
  beforeEach(async () => {
    plugin.permission = "granted";
    plugin.available = true;
    plugin.platform = "android";
    plugin.listenerCount = 0;
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.resetModules();
    ({ NativeRecognition, hasNativeSpeech } = await import("@/lib/native-speech"));
  });

  it("is used in the apps", () => {
    expect(hasNativeSpeech()).toBe(true);
  });

  it("streams words as they come, makes the last ones final when the phone stops, then ends", async () => {
    const { rec, got, events } = listen();
    rec.lang = "en-IN";
    rec.start();
    await flush();
    expect(plugin.api.start).toHaveBeenCalledWith(expect.objectContaining({ language: "en-IN", partialResults: true, popup: false, muteRecognizerBeep: true }));

    plugin.fire("partialResults", { matches: ["namaste"] });
    plugin.fire("partialResults", { matches: ["namaste yaara"] });
    plugin.fire("partialResults", { matches: ["namaste yaara"] }); // repeats are dropped
    plugin.fire("listeningState", { state: "stopped", status: "stopped", reason: "silence" });

    expect(got).toEqual([
      { text: "namaste", final: false },
      { text: "namaste yaara", final: false },
      { text: "namaste yaara", final: true },
    ]);
    expect(events).toEqual(["speechend", "end"]);
  });

  it("an abort (Yaara is about to speak) drops the half-heard words", async () => {
    const { rec, got, events } = listen();
    rec.start();
    await flush();
    plugin.fire("partialResults", { matches: ["haan"] });
    rec.abort();
    expect(plugin.api.stop).toHaveBeenCalled();
    plugin.fire("listeningState", { status: "stopped" });
    expect(got).toEqual([{ text: "haan", final: false }]);
    expect(events).toEqual(["end"]);
  });

  it("a start while the last session is still stopping waits for it, then listens again", async () => {
    const { rec } = listen();
    rec.start();
    await flush();
    rec.abort();
    rec.start(); // the conversation restarts listening right after Yaara speaks
    expect(plugin.api.start).toHaveBeenCalledTimes(1);
    plugin.fire("listeningState", { status: "stopped" });
    await flush();
    expect(plugin.api.start).toHaveBeenCalledTimes(2);
  });

  it("a second start while listening says so, as the browser does", async () => {
    const { rec } = listen();
    rec.start();
    expect(() => rec.start()).toThrow(/already started/);
  });

  it("no microphone permission is reported as not-allowed, and nothing starts", async () => {
    plugin.permission = "denied";
    const { rec, events } = listen();
    rec.start();
    await flush();
    await flush();
    expect(plugin.api.requestPermissions).toHaveBeenCalled();
    expect(plugin.api.start).not.toHaveBeenCalled();
    expect(events).toEqual(["error:not-allowed"]);
  });

  it("silence and network errors get the browser's names", async () => {
    const { rec, events } = listen();
    rec.start();
    await flush();
    plugin.fire("error", { code: "ERROR_NO_MATCH", message: "No match", sessionId: 1 });
    plugin.fire("error", { code: "ERROR_NETWORK", message: "Network", sessionId: 1 });
    plugin.fire("error", { code: "ERROR_INSUFFICIENT_PERMISSIONS", message: "Perm", sessionId: 1 });
    plugin.fire("error", { code: "ERROR_NETWORK_TIMEOUT", message: "Timeout", sessionId: 1 });
    plugin.fire("error", { code: "ERROR_SPEECH_TIMEOUT", message: "Silence", sessionId: 1 });
    expect(events).toEqual(["error:no-speech", "error:network", "error:not-allowed", "error:network", "error:no-speech"]);
  });
  it("a stop while the microphone prompt is still open ends the session without starting, and listening can resume", async () => {
    let grant: (v: { speechRecognition: "granted" }) => void = () => {};
    plugin.api.checkPermissions.mockImplementationOnce(async () => ({ speechRecognition: "prompt" }));
    plugin.api.requestPermissions.mockImplementationOnce(() => new Promise((r) => { grant = r; }));
    const { rec, events } = listen();
    rec.start();
    await flush();
    rec.abort(); // Yaara starts her greeting while the prompt is up
    rec.start(); // and listens again after it
    grant({ speechRecognition: "granted" });
    await flush(); await flush(); await flush();
    expect(events).toEqual(["end"]);
    expect(plugin.api.stop).not.toHaveBeenCalled();
    expect(plugin.api.start).toHaveBeenCalledTimes(1); // the queued start, not the aborted one
  });

  it("a mute or hang-up cancels a queued restart, so the microphone stays off", async () => {
    const { rec } = listen();
    rec.start();
    await flush();
    rec.abort();
    rec.start(); // queued while stopping
    rec.abort(); // muted
    plugin.fire("listeningState", { status: "stopped" });
    await flush();
    expect(plugin.api.start).toHaveBeenCalledTimes(1);
  });

  it("ends a stopped session even when the phone never reports it", async () => {
    vi.useFakeTimers();
    const { rec, events } = listen();
    rec.start();
    await vi.advanceTimersByTimeAsync(0);
    rec.abort();
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(2600);
    expect(events).toEqual(["end"]);
    vi.useRealTimers();
  });

  it("listens to the plugin once, however many calls are made, and only the current call hears", async () => {
    const first = listen();
    first.rec.start();
    await flush();
    plugin.fire("listeningState", { status: "stopped" });
    const second = listen();
    second.rec.start();
    await flush();
    plugin.fire("partialResults", { matches: ["dusri call"] });
    expect(plugin.listenerCount).toBe(3);
    expect(first.got).toEqual([]);
    expect(second.got).toEqual([{ text: "dusri call", final: false }]);
  });

  it("a phone without a speech recognizer says so instead of retrying forever", async () => {
    plugin.available = false;
    const { rec, events } = listen();
    rec.start();
    await flush(); await flush();
    expect(plugin.api.start).not.toHaveBeenCalled();
    expect(events).toEqual(["error:service-not-allowed"]);
  });
  it("a late 'stopped' from an earlier phone session does not end the next one", async () => {
    vi.useFakeTimers();
    const { rec, events } = listen();
    rec.start();
    await vi.advanceTimersByTimeAsync(0);
    plugin.fire("listeningState", { state: "started", status: "started", sessionId: 1 });
    rec.abort();
    rec.start(); // queued
    await vi.advanceTimersByTimeAsync(2600); // the phone never said session 1 stopped: ended here, queued start runs
    expect(events).toEqual(["end"]);
    expect(plugin.api.start).toHaveBeenCalledTimes(2);
    plugin.fire("listeningState", { state: "startingListening", sessionId: 2 });
    plugin.fire("listeningState", { state: "stopped", status: "stopped", sessionId: 1 }); // late, from session 1
    plugin.fire("error", { code: "ERROR_CLIENT", message: "late", sessionId: 1 });
    expect(events).toEqual(["end"]);
    plugin.fire("listeningState", { state: "stopped", status: "stopped", sessionId: 2 });
    expect(events).toEqual(["end", "end"]);
    vi.useRealTimers();
  });

  it("on iPhone it does not ask whether the phone's own language is supported, and still listens", async () => {
    plugin.platform = "ios";
    plugin.available = false; // iOS answers for the phone's language, not en-IN
    vi.resetModules(); // the platform is read when the module loads
    ({ NativeRecognition } = await import("@/lib/native-speech"));
    const { rec, events } = listen();
    rec.start();
    await flush(); await flush();
    expect(plugin.api.available).not.toHaveBeenCalled();
    expect(plugin.api.start).toHaveBeenCalledTimes(1);
    expect(events).toEqual([]);
  });
  it("a recognizer the phone cannot start (iOS: unsupported or unavailable) is shown, not retried", async () => {
    plugin.platform = "ios";
    vi.resetModules();
    ({ NativeRecognition } = await import("@/lib/native-speech"));
    plugin.api.start.mockRejectedValueOnce(new Error("Speech recognizer is currently unavailable."));
    const { rec, events } = listen();
    rec.start();
    await flush(); await flush(); await flush();
    expect(events).toEqual(["error:service-not-allowed"]);
  });

  it("a start that keeps failing for another reason is retried, then given up after three tries", async () => {
    plugin.api.start.mockRejectedValue(new Error("Speech recognition is already running."));
    const { rec, events } = listen();
    for (let i = 0; i < 3; i++) {
      rec.start();
      await flush(); await flush(); await flush();
    }
    expect(events).toEqual(["error:network", "end", "error:network", "end", "error:service-not-allowed"]);
    plugin.api.start.mockReset();
    plugin.api.start.mockImplementation(async () => ({}));
  });
});
