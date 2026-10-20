/**
 * ReviewPage.tsx - rate and review Hey Yaara, then share it.
 *
 * One review per person (it can be changed). After saving, the share buttons
 * open WhatsApp, X, Facebook, LinkedIn or Telegram with a post that matches the
 * stars given, quoting the review as typed.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Copy, Share2, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api, ApiError } from "@/lib/api";
import { buildShareMessage, shareLinks, shareUrl } from "@/lib/share";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Summary = { count: number; average: number | null };
type Mine = { rating: number; text: string } | null;

const WORDS = ["", "Pasand nahi aaya", "Theek-thaak", "Accha hai", "Bahut accha", "Kamaal hai!"];
const MAX_TEXT = 500;

const ReviewPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<Mine>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ summary: Summary; mine: Mine }>("/api/reviews")
      .then((r) => {
        if (!alive) return;
        setSummary(r.summary);
        if (r.mine) { setRating(r.mine.rating); setText(r.mine.text); setSaved(r.mine); }
      })
      .catch(() => { /* the form still works; the summary just stays hidden */ });
    return () => { alive = false; };
  }, [user?.id]);

  const url = shareUrl();
  const message = useMemo(() => (saved ? buildShareMessage(saved.rating, saved.text, url) : ""), [saved, url]);
  const links = useMemo(() => (saved ? shareLinks(saved.rating, saved.text, url) : []), [saved, url]);
  const changed = !saved || saved.rating !== rating || saved.text !== text.trim();

  const save = async () => {
    setError(null);
    if (!rating) { setError("Pehle 1 se 5 stars chuniye."); return; }
    setSaving(true);
    try {
      const r = await api<{ mine: { rating: number; text: string }; summary: Summary }>("/api/reviews", { body: { rating, text } });
      setSaved(r.mine);
      setText(r.mine.text);
      setSummary(r.summary);
      toast({ title: "Shukriya!", description: "Aapka review save ho gaya." });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Review save nahi hua. Dobara try kijiye.");
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: "Copy nahi hua", description: "Post ko lamba dabakar khud copy kar lijiye." });
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: "Hey Yaara", text: message });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") void copy();
    }
  };

  const shown = hover || rating;

  return (
    <div className="min-h-screen pb-32">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[10%] w-[45%] h-[45%] bg-amber-500/8 rounded-full blur-[140px]" />
        <div className="absolute bottom-[10%] right-[5%] w-[35%] h-[35%] bg-orange-500/6 rounded-full blur-[140px]" />
      </div>

      <div className="relative mx-auto w-full max-w-2xl px-4 pt-8 md:px-8">
        <header className="mb-8 flex items-center gap-4">
          <button type="button" aria-label="Go back" onClick={() => navigate(-1)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-slate-400 hover:text-amber-50 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-black text-amber-50">Rate Yaara</h1>
            <p className="text-base text-slate-400 font-medium">Yaara aapko kaisi lagi? Sach sach bataiye.</p>
          </div>
        </header>

        {summary && summary.count > 0 && summary.average !== null && (
          <p className="mb-6 flex items-center gap-2 text-base text-slate-300">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden="true" />
            <span><b className="text-amber-50">{summary.average.toFixed(1)}</b> / 5, {summary.count} {summary.count === 1 ? "review" : "reviews"}</span>
          </p>
        )}

        {!user ? (
          <div className="rounded-[32px] glass-card-premium p-8 text-center">
            <p className="mb-5 text-lg text-amber-50">Review dene ke liye pehle sign in kijiye.</p>
            <Link to="/signin" className="inline-block rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 text-lg font-black text-white">Sign in</Link>
          </div>
        ) : (
          <div className="rounded-[32px] glass-card-premium p-6 md:p-10">
            <fieldset>
              <legend className="mb-3 text-sm font-bold uppercase tracking-widest text-slate-300">Aapke stars</legend>
              <div className="flex gap-1 sm:gap-2" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} ${n === 1 ? "star" : "stars"}: ${WORDS[n]}`}
                    onClick={() => { setRating(n); setError(null); }}
                    onMouseEnter={() => setHover(n)}
                    onFocus={() => setHover(n)}
                    onBlur={() => setHover(0)}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl transition hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 sm:h-16 sm:w-16"
                  >
                    <Star className={cn("h-9 w-9 transition sm:h-12 sm:w-12", n <= shown ? "fill-amber-400 text-amber-400" : "text-slate-600")} />
                  </button>
                ))}
              </div>
              <p className="mt-2 h-7 text-lg font-bold text-amber-200" aria-live="polite">{shown ? WORDS[shown] : ""}</p>
            </fieldset>

            <label htmlFor="review" className="mt-6 mb-2 block text-sm font-bold uppercase tracking-widest text-slate-300">Kuch kehna chahenge? (optional)</label>
            <textarea
              id="review" value={text} maxLength={MAX_TEXT} rows={4}
              onChange={(e) => setText(e.target.value)}
              placeholder="Jaise: Roz shaam ko Yaara se baat karke accha lagta hai."
              className="w-full resize-y rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-lg text-amber-50 placeholder:text-slate-600 outline-none focus:border-amber-500/40 focus:ring-2 focus:ring-amber-500/20"
            />
            <p className="mt-1 text-right text-sm text-slate-500 tabular-nums">{text.length}/{MAX_TEXT}</p>

            {error && <p role="alert" className="mt-3 rounded-2xl bg-red-500/10 px-4 py-3 text-base font-semibold text-red-200">{error}</p>}

            <button
              type="button" onClick={save} disabled={saving || !changed}
              className="mt-5 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-5 text-lg font-black text-white shadow-xl shadow-amber-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Save ho raha hai..." : saved ? (changed ? "Review update kijiye" : "Review saved") : "Review save kijiye"}
            </button>
          </div>
        )}

        {saved && (
          <section className="mt-8 rounded-[32px] glass-card p-6 md:p-8" aria-labelledby="share-title">
            <h2 id="share-title" className="text-xl font-black text-amber-50">Doston ke saath share kijiye</h2>
            <p className="mt-1 text-base text-slate-400">Yeh post aapke stars aur review se bana hai. Share karne se pehle badal bhi sakte hain.</p>
            <pre className="mt-4 whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-black/20 p-4 font-sans text-base leading-relaxed text-slate-200">{message}</pre>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {links.map((l) => (
                <a
                  key={l.id} href={l.href} target="_blank" rel="noopener noreferrer"
                  className="flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base font-bold text-amber-50 transition hover:bg-white/10"
                >
                  {l.label}
                </a>
              ))}
              <button type="button" onClick={copy} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base font-bold text-amber-50 transition hover:bg-white/10">
                {copied ? <Check className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5" />} {copied ? "Copied" : "Copy"}
              </button>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button type="button" onClick={nativeShare} className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-3 text-base font-black text-white sm:col-span-3">
                  <Share2 className="h-5 w-5" /> Aur apps mein share kijiye
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default ReviewPage;
