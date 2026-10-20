/**
 * Profile.tsx  –  Yaara User Profile (Premium Dark Theme)
 * 
 * Premium glass morphism design with enhanced visuals.
 */

import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { 
  User, Phone, Mail, Calendar, Users, 
  Save, ArrowLeft, LogOut, ShieldCheck, Sparkles, Star, KeyRound, Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FEMALE_VOICE_ID,
  DEFAULT_MALE_VOICE_ID,
  FEMALE_VOICE_OPTIONS,
  MALE_VOICE_OPTIONS,
} from "@/lib/voice-options";

type ProfileFormData = {
  name: string;
  age: string;
  gender: string;
  mobile: string;
  email: string;
  yaaraFemaleVoiceId: string;
  yaarMaleVoiceId: string;
};

const initialFormData: ProfileFormData = {
  name: "",
  age: "",
  gender: "",
  mobile: "",
  email: "",
  yaaraFemaleVoiceId: DEFAULT_FEMALE_VOICE_ID,
  yaarMaleVoiceId: DEFAULT_MALE_VOICE_ID,
};

const normalizeAge = (value: string) => value.replace(/[^\d]/g, "").slice(0, 3);

const inputClass = "w-full rounded-2xl border border-white/10 bg-white/5 py-4 pl-14 pr-6 text-lg font-bold text-amber-50 placeholder:text-slate-600 focus:bg-white/8 focus:border-amber-500/40 focus:ring-2 focus:ring-amber-500/20 transition-all outline-none";
const labelClass = "ml-1 text-sm font-black uppercase tracking-widest text-slate-500";
const iconClass = "absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500";

const Profile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, updateUser, signout, changePin, deleteAccount } = useAuth();

  const [formData, setFormData] = useState<ProfileFormData>(initialFormData);
  const [isSaving, setIsSaving] = useState(false);

  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Save karne mein dikkat aayi.";

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || "",
        age: user.age || "",
        gender: (user.gender || "").toLowerCase(),
        mobile: user.mobile || "",
        email: user.email || "",
        yaaraFemaleVoiceId: user.yaaraFemaleVoiceId || DEFAULT_FEMALE_VOICE_ID,
        yaarMaleVoiceId: user.yaarMaleVoiceId || DEFAULT_MALE_VOICE_ID,
      });
    }
  }, [user]);

  if (!user) return null;

  const updateField = <K extends keyof ProfileFormData>(field: K, value: ProfileFormData[K]) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const trimmedName = formData.name.trim();
      if (!trimmedName) throw new Error("Naam bharna zaroori hai.");

      await updateUser({
        name: trimmedName,
        age: formData.age.trim(),
        gender: formData.gender,
        email: formData.email.trim(),
        yaaraFemaleVoiceId: formData.yaaraFemaleVoiceId,
        yaarMaleVoiceId: formData.yaarMaleVoiceId,
      });
      toast({
        title: "Profile Updated",
        description: "Aapki jaankari safe save ho gayi hai.",
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err),
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen pb-32">
      
      {/* Background Glow - Enhanced */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-blue-500/8 rounded-full blur-[140px]" />
        <div className="absolute bottom-[20%] right-[-10%] w-[35%] h-[40%] bg-amber-500/6 rounded-full blur-[140px]" />
        <div className="absolute top-[30%] left-[30%] w-[20%] h-[20%] bg-orange-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-2xl px-4 pt-8 md:px-8">
        
        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-xs font-bold text-amber-400 uppercase tracking-widest mb-3">
               <Sparkles className="h-3 w-3" /> Premium
            </div>
            <h1 className="text-4xl font-black text-amber-50 tracking-tight">Profile Setup</h1>
            <p className="text-lg font-medium text-slate-400">Apni jaankari yahan bharein</p>
          </div>
          <button
             type="button"
             aria-label="Go back"
             onClick={() => navigate("/")}
             className="h-12 w-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-slate-400 hover:text-amber-50 transition-colors"
          >
             <ArrowLeft className="h-6 w-6" />
          </button>
        </header>

        {/* Profile Form - Premium Card */}
        <form onSubmit={handleSave} className="space-y-6">
          <div className="rounded-[32px] glass-card-premium p-8 md:p-10">
            
            <div className="mb-10 flex items-center gap-4">
               <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center text-amber-400 border border-amber-500/20">
                  <User className="h-8 w-8" />
               </div>
               <div>
                  <h2 className="text-2xl font-black text-amber-50">{formData.name || "Your Name"}</h2>
                  <p className="font-bold text-amber-400 flex items-center gap-2">
                     <ShieldCheck className="h-4 w-4" /> Personal Account
                  </p>
               </div>
            </div>

            <div className="grid gap-6">
              
              {/* Name */}
              <div className="space-y-2">
                <label htmlFor="profile-name" className={labelClass}>Full Name</label>
                <div className="relative">
                  <User className={iconClass} />
                  <input id="profile-name" type="text" value={formData.name} onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("name", e.target.value)} placeholder="Apna pura naam likhein" autoComplete="name" required className={inputClass} />
                </div>
              </div>

              {/* Age & Gender Row (stacked on narrow phones, so "Female" fits) */}
              <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="profile-age" className={labelClass}>Age</label>
                  <div className="relative">
                    <Calendar className={iconClass} />
                    <input id="profile-age" type="number" value={formData.age} onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("age", normalizeAge(e.target.value))} placeholder="Age" inputMode="numeric" min="0" max="120" className={inputClass} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="profile-gender" className={labelClass}>Gender</label>
                  <div className="relative">
                    <Users className={iconClass} />
                    <select id="profile-gender" value={formData.gender} onChange={(e: ChangeEvent<HTMLSelectElement>) => updateField("gender", e.target.value)} autoComplete="sex" className={cn(inputClass, "appearance-none")}>
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Mobile (Read Only) */}
              <div className="space-y-2">
                <label htmlFor="profile-mobile" className={labelClass}>Mobile Number</label>
                <div className="relative opacity-70">
                  <Phone className={iconClass} />
                  <input id="profile-mobile" type="tel" value={formData.mobile ? `+91 ${formData.mobile}` : ""} readOnly aria-describedby="profile-mobile-help" autoComplete="tel" className={cn(inputClass, "cursor-not-allowed")} />
                </div>
                <p id="profile-mobile-help" className="ml-1 text-sm text-slate-500">Yahi number aapka sign-in hai, isliye yeh badla nahi ja sakta.</p>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label htmlFor="profile-email" className={labelClass}>Email ID</label>
                <div className="relative">
                  <Mail className={iconClass} />
                  <input id="profile-email" type="email" value={formData.email} onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("email", e.target.value)} placeholder="Apna email ID likhein" autoComplete="email" className={inputClass} />
                </div>
              </div>

              {/* Voice Preferences - Premium Card */}
              <div className="rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/8 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">Voice Preferences</h3>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-500 mb-4">Yaara (F) aur Yaar (M) ke liye apni pasand ki awaaz chunein.</p>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="profile-female-voice" className={labelClass}>Yaara (F) Voice</label>
                    <select id="profile-female-voice" value={formData.yaaraFemaleVoiceId} onChange={(e: ChangeEvent<HTMLSelectElement>) => updateField("yaaraFemaleVoiceId", e.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-lg font-bold text-amber-50 focus:border-amber-500/40 outline-none">
                      {FEMALE_VOICE_OPTIONS.map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.label}{voice.note ? ` - ${voice.note}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="profile-male-voice" className={labelClass}>Yaar (M) Voice</label>
                    <select id="profile-male-voice" value={formData.yaarMaleVoiceId} onChange={(e: ChangeEvent<HTMLSelectElement>) => updateField("yaarMaleVoiceId", e.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-lg font-bold text-amber-50 focus:border-amber-500/40 outline-none">
                      {MALE_VOICE_OPTIONS.map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.label}{voice.note ? ` - ${voice.note}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

            </div>

            <div className="mt-10 pt-6 border-t border-white/5">
               <button
                 type="submit"
                 disabled={isSaving}
                 className={cn(
                    "w-full flex items-center justify-center gap-3 rounded-2xl py-6 text-xl font-black text-white shadow-xl transition-all active:scale-95",
                    isSaving ? "bg-amber-500/50" : "bg-gradient-to-r from-amber-500 to-orange-600 shadow-amber-500/20 hover:shadow-amber-500/30 hover:-translate-y-0.5"
                 )}
               >
                 <Save className="h-6 w-6" />
                 {isSaving ? "Saving..." : "Save Profile Details"}
               </button>
            </div>
          </div>
        </form>

        <AccountSection signout={signout} changePin={changePin} deleteAccount={deleteAccount} onSignedOut={() => navigate("/signin", { replace: true })} />

      </div>
    </div>
  );
};

const smallInput = "w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-lg font-bold text-amber-50 tracking-[0.5em] tabular-nums placeholder:tracking-normal placeholder:text-slate-600 outline-none focus:border-amber-500/40 focus:ring-2 focus:ring-amber-500/20";
const pinDigits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

/** Rate Yaara, change PIN, sign out, delete the account. */
function AccountSection({ signout, changePin, deleteAccount, onSignedOut }: {
  signout: () => Promise<void>;
  changePin: (pin: string, newPin: string, confirmPin: string) => Promise<void>;
  deleteAccount: (pin: string) => Promise<void>;
  onSignedOut: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState<"pin" | "delete" | null>(null);
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (next: "pin" | "delete" | null) => {
    setOpen(next); setPin(""); setNewPin(""); setConfirmPin(""); setError(null);
  };

  const submitPin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await changePin(pin, newPin, confirmPin);
      toast({ title: "PIN badal gaya", description: "Agli baar naye PIN se sign in kijiye." });
      reset(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "PIN nahi badla. Dobara try kijiye.");
    } finally { setBusy(false); }
  };

  const submitDelete = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await deleteAccount(pin);
      toast({ title: "Account delete ho gaya", description: "Aapki saari calls aur recordings hata di gayi hain." });
      onSignedOut();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Account delete nahi hua.");
    } finally { setBusy(false); }
  };

  const rowClass = "flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left text-lg font-bold transition hover:bg-white/5";

  return (
    <section className="mt-8 rounded-[32px] glass-card p-4 md:p-6" aria-label="Account">
      <Link to="/review" className={cn(rowClass, "text-amber-200")}>
        <Star className="h-5 w-5 text-amber-400" /> Yaara ko rate kijiye
      </Link>

      <button type="button" onClick={() => reset(open === "pin" ? null : "pin")} aria-expanded={open === "pin"} className={cn(rowClass, "text-slate-200")}>
        <KeyRound className="h-5 w-5 text-slate-400" /> PIN badaliye
      </button>
      {open === "pin" && (
        <form onSubmit={submitPin} className="grid gap-3 px-4 pb-4" noValidate>
          <label className="text-sm font-bold uppercase tracking-widest text-slate-400" htmlFor="pin-now">Abhi wala PIN</label>
          <input id="pin-now" type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => setPin(pinDigits(e.target.value))} placeholder="••••" className={smallInput} />
          <label className="text-sm font-bold uppercase tracking-widest text-slate-400" htmlFor="pin-new">Naya PIN</label>
          <input id="pin-new" type="password" inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(e) => setNewPin(pinDigits(e.target.value))} placeholder="••••" className={smallInput} />
          <label className="text-sm font-bold uppercase tracking-widest text-slate-400" htmlFor="pin-again">Naya PIN dobara</label>
          <input id="pin-again" type="password" inputMode="numeric" autoComplete="new-password" value={confirmPin} onChange={(e) => setConfirmPin(pinDigits(e.target.value))} placeholder="••••" className={smallInput} />
          {error && <p role="alert" className="text-base font-semibold text-red-300">{error}</p>}
          <button type="submit" disabled={busy || pin.length !== 4 || newPin.length !== 4 || confirmPin.length !== 4} className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-4 text-lg font-black text-white disabled:opacity-50">
            {busy ? "Badal raha hai..." : "Naya PIN rakhiye"}
          </button>
        </form>
      )}

      <button type="button" onClick={async () => { await signout(); onSignedOut(); }} className={cn(rowClass, "text-slate-300 hover:text-red-300")}>
        <LogOut className="h-5 w-5" /> Sign out
      </button>

      <button type="button" onClick={() => reset(open === "delete" ? null : "delete")} aria-expanded={open === "delete"} className={cn(rowClass, "text-red-300")}>
        <Trash2 className="h-5 w-5" /> Account delete kijiye
      </button>
      {open === "delete" && (
        <form onSubmit={submitDelete} className="grid gap-3 px-4 pb-4" noValidate>
          <p className="text-base text-slate-300">Aapka account, saari calls, recordings aur review hamesha ke liye hat jayenge. Yeh wapas nahi hoga.</p>
          <label className="text-sm font-bold uppercase tracking-widest text-slate-400" htmlFor="pin-delete">Pakka karne ke liye apna PIN</label>
          <input id="pin-delete" type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => setPin(pinDigits(e.target.value))} placeholder="••••" className={smallInput} />
          {error && <p role="alert" className="text-base font-semibold text-red-300">{error}</p>}
          <button type="submit" disabled={busy || pin.length !== 4} className="rounded-2xl bg-red-600 px-6 py-4 text-lg font-black text-white disabled:opacity-50">
            {busy ? "Delete ho raha hai..." : "Haan, sab delete kijiye"}
          </button>
        </form>
      )}
    </section>
  );
}

export default Profile;
