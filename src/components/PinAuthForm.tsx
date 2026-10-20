/**
 * PinAuthForm.tsx - the sign up / sign in form: mobile number and a 4-digit PIN.
 *
 * Big type and big targets: many people who talk to Yaara are older. Digits
 * only, as they are typed or pasted. Errors appear under the field they are
 * about, in words, and focus moves there.
 */

import { type FormEvent, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type Mode = "signin" | "signup";
type Field = "name" | "mobile" | "pin" | "confirmPin";

const inputClass =
  "w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-lg font-bold text-amber-50 placeholder:text-slate-600 outline-none transition focus:border-amber-500/40 focus:ring-2 focus:ring-amber-500/20 focus:bg-white/8 aria-[invalid=true]:border-red-400/70";
const labelClass = "mb-2 block text-sm font-bold text-slate-300 uppercase tracking-widest";
const digits = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);
// A pasted "+91 98765 43210" or "098765 43210" keeps just the 10 digits.
const mobileDigits = (v: string) => {
  let d = v.replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
  else if (d.length > 10 && d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
};

export default function PinAuthForm({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const { signin, signup } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ field: Field | null; text: string } | null>(null);
  const [hint, setHint] = useState<"signin" | "signup" | null>(null);
  const refs = {
    name: useRef<HTMLInputElement>(null),
    mobile: useRef<HTMLInputElement>(null),
    pin: useRef<HTMLInputElement>(null),
    confirmPin: useRef<HTMLInputElement>(null),
  };

  const fail = (field: Field | null, text: string) => {
    setError({ field, text });
    if (field) refs[field].current?.focus();
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setHint(null);
    if (mode === "signup" && name.trim().length < 2) return fail("name", "Apna naam likhiye.");
    if (mobile.length !== 10) return fail("mobile", "10-digit mobile number likhiye.");
    if (pin.length !== 4) return fail("pin", "PIN exactly 4 numbers ka hota hai.");
    if (mode === "signup" && confirmPin !== pin) return fail("confirmPin", "Dono PIN alag hain. Wahi 4 numbers dobara likhiye.");

    setLoading(true);
    try {
      const user = mode === "signup" ? await signup(name, mobile, pin, confirmPin) : await signin(mobile, pin);
      toast({
        title: mode === "signup" ? "Account ban gaya" : "Sign in ho gaya",
        description: `Namaste ${user.name.split(" ")[0]}! Yaara aapka intezaar kar rahi hai.`,
      });
      navigate(mode === "signup" ? "/profile" : "/", { replace: true });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      const field = (apiErr?.field as Field | undefined) || null;
      if (field === "pin" || field === "confirmPin") { setPin(""); setConfirmPin(""); }
      if (apiErr?.body.exists) setHint("signin");
      if (apiErr?.body.notFound) setHint("signup");
      fail(field && field in refs ? field : null, apiErr?.message || "Kuch gadbad ho gayi. Dobara try kijiye.");
    } finally {
      setLoading(false);
    }
  };

  const errFor = (f: Field) => (error?.field === f ? error.text : null);
  const fieldError = (f: Field) => errFor(f) && (
    <p id={`${f}-error`} role="alert" className="mt-2 text-base font-semibold text-red-300">{errFor(f)}</p>
  );

  return (
    <div className="rounded-[32px] glass-card-premium p-8 md:p-12">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
          <Heart className="h-6 w-6 text-white" />
        </div>
        <span className="text-xl font-black text-amber-50">Hey Yaara</span>
      </div>

      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        {mode === "signup" && (
          <div>
            <label htmlFor="name" className={labelClass}>Aapka naam</label>
            <input
              id="name" ref={refs.name} value={name} autoComplete="name" maxLength={60}
              onChange={(e) => setName(e.target.value)} placeholder="Jaise: Kamla Devi"
              aria-invalid={Boolean(errFor("name"))} aria-describedby={errFor("name") ? "name-error" : undefined}
              className={inputClass}
            />
            {fieldError("name")}
          </div>
        )}

        <div>
          <label htmlFor="mobile" className={labelClass}>Mobile number</label>
          <div className="flex items-center gap-3">
            <span className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-lg font-bold text-slate-300">+91</span>
            <input
              id="mobile" ref={refs.mobile} value={mobile} type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={17}
              onChange={(e) => setMobile(mobileDigits(e.target.value))} placeholder="98765 43210"
              aria-invalid={Boolean(errFor("mobile"))} aria-describedby={errFor("mobile") ? "mobile-error" : undefined}
              className={inputClass}
            />
          </div>
          {fieldError("mobile")}
        </div>

        <div>
          <label htmlFor="pin" className={labelClass}>{mode === "signup" ? "4-digit PIN chuniye" : "4-digit PIN"}</label>
          <input
            id="pin" ref={refs.pin} value={pin} type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            onChange={(e) => setPin(digits(e.target.value, 4))} placeholder="••••"
            aria-invalid={Boolean(errFor("pin"))} aria-describedby={errFor("pin") ? "pin-error" : "pin-help"}
            className={`${inputClass} tracking-[0.6em] tabular-nums`}
          />
          {fieldError("pin") || (
            <p id="pin-help" className="mt-2 text-sm text-slate-400">
              {mode === "signup" ? "Aisa PIN jo aapko yaad rahe, par 1234 ya 1111 jaisa aasaan nahi." : "Wahi 4 numbers jo account banate waqt chune the."}
            </p>
          )}
        </div>

        {mode === "signup" && (
          <div>
            <label htmlFor="confirmPin" className={labelClass}>PIN dobara likhiye</label>
            <input
              id="confirmPin" ref={refs.confirmPin} value={confirmPin} type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4}
              autoComplete="new-password" onChange={(e) => setConfirmPin(digits(e.target.value, 4))} placeholder="••••"
              aria-invalid={Boolean(errFor("confirmPin"))} aria-describedby={errFor("confirmPin") ? "confirmPin-error" : undefined}
              className={`${inputClass} tracking-[0.6em] tabular-nums`}
            />
            {fieldError("confirmPin")}
          </div>
        )}

        {error && !error.field && <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 text-base font-semibold text-red-200">{error.text}</p>}
        {hint === "signin" && (
          <p className="text-base text-amber-200">Is number ka account hai. <Link to="/signin" className="font-bold underline">Sign in kijiye</Link></p>
        )}
        {hint === "signup" && (
          <p className="text-base text-amber-200">Naye hain? <Link to="/signup" className="font-bold underline">Account banaiye</Link></p>
        )}

        <button
          type="submit" disabled={loading}
          className="w-full rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-5 text-lg font-black text-white shadow-xl shadow-blue-500/20 transition hover:shadow-blue-500/30 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
        >
          {loading ? (mode === "signup" ? "Account ban raha hai..." : "Sign in ho raha hai...") : mode === "signup" ? "Account banaiye" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-base text-slate-400">
        {mode === "signup" ? (
          <>Pehle se account hai? <Link to="/signin" className="font-bold text-amber-400 hover:text-amber-300 transition-colors">Sign in</Link></>
        ) : (
          <>Naya user? <Link to="/signup" className="font-bold text-amber-400 hover:text-amber-300 transition-colors">Account banaiye</Link></>
        )}
      </p>
      {mode === "signin" && (
        <p className="mt-3 text-center text-sm text-slate-500">PIN bhool gaye? Abhi PIN SMS se reset nahi hota. Jis phone par aap pehle se signed in hain, wahan Profile mein naya PIN rakh sakte hain.</p>
      )}
    </div>
  );
}
