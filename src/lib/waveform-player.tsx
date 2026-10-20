import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { getAudioUrl } from "./cloud-sync";

/**
 * Plays a call's recording with its waveform. The waveform's container is always
 * in the page (it used to appear only after loading finished, and loading only
 * started once the container existed, so nothing ever played).
 */
export default function WaveformPlayer({ audioPath }: { audioPath: string | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const waveRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(Boolean(audioPath));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!audioPath || !containerRef.current) return;
    let alive = true;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    (async () => {
      objectUrl = await getAudioUrl(audioPath);
      if (!alive) return;
      if (!objectUrl || !containerRef.current) {
        setError("Recording load nahi hui.");
        setLoading(false);
        return;
      }
      const wave = WaveSurfer.create({
        container: containerRef.current,
        waveColor: "#4f46e5",
        progressColor: "#22c55e",
        height: 40,
        barWidth: 2,
        barGap: 2,
        cursorWidth: 0,
      });
      waveRef.current = wave;
      wave.on("ready", () => alive && setLoading(false));
      wave.on("play", () => alive && setPlaying(true));
      wave.on("pause", () => alive && setPlaying(false));
      wave.on("finish", () => alive && setPlaying(false));
      wave.on("error", () => {
        if (!alive) return;
        setError("Recording chal nahi payi.");
        setLoading(false);
      });
      wave.load(objectUrl).catch(() => { /* reported by the error event */ });
    })();
    return () => {
      alive = false;
      waveRef.current?.destroy();
      waveRef.current = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audioPath]);

  if (!audioPath) return <div className="text-slate-400 text-sm text-center py-4">No recording available</div>;
  if (error) return <div className="text-red-300 text-sm text-center py-4">{error}</div>;

  return (
    <div className="flex min-w-[220px] flex-1 items-center gap-3 bg-[#0f172a] p-3 rounded-xl border border-[rgba(255,255,255,0.1)]">
      <button
        type="button"
        onClick={() => waveRef.current?.playPause()}
        disabled={loading}
        aria-label={playing ? "Pause recording" : "Play recording"}
        className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-50 ${playing ? "bg-gray-500 text-white hover:bg-gray-600" : "bg-blue-500 text-white hover:bg-blue-600"}`}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="relative flex-1">
        <div ref={containerRef} />
        {loading && <span className="absolute inset-0 flex items-center text-sm text-slate-400">Loading recording...</span>}
      </div>
    </div>
  );
}
