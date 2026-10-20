/**
 * Index.tsx  –  Yaara Premium Home Hub
 *
 * Premium dark theme with enhanced visuals.
 * Features:
 *  - Premium glass morphism with animated gradients
 *  - Large tap targets and readable text
 *  - Voice Hub centerpiece
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  MessageCircleHeart, Music, Gamepad2, Sparkles, HeartHandshake, 
  Clock, Play, ShieldCheck, Star, Zap, ArrowRight, Sparkle
} from "lucide-react";
import VoiceOrb from "@/components/VoiceOrb";
import InstallAppBanner from "@/components/InstallAppBanner";
import { useAuth } from "@/contexts/AuthContext";
import { ToastAction } from "@/components/ui/toast";
import { matchVoiceGameCommand, openGame } from "@/lib/games";
import { useToast } from "@/hooks/use-toast";
import { useDeviceType } from "@/hooks/use-device-type";
import { cn } from "@/lib/utils";

const primaryActivities = [
  { 
    label: "Talk with Yaara", 
    desc: "Dil ki baat karein - Aapki saheli",
    icon: MessageCircleHeart, 
    path: "/talk", 
    emoji: "💬", 
    gradient: "from-amber-500/20 to-orange-500/10",
    gradientHover: "from-amber-600/30 to-orange-600/20",
    iconBg: "bg-amber-500/15",
    accent: "text-amber-400",
    border: "border-amber-500/20 hover:border-amber-500/50",
    btnColor: "from-amber-500 to-orange-600",
  },
  { 
    label: "Play Music", 
    desc: "Suhrili dhun suniye",
    icon: Music, 
    path: "/music", 
    emoji: "🎵", 
    gradient: "from-rose-500/15 to-pink-500/10",
    gradientHover: "from-rose-600/25 to-pink-600/15",
    iconBg: "bg-rose-500/15",
    accent: "text-rose-400",
    border: "border-rose-500/20 hover:border-rose-500/50",
    btnColor: "from-rose-500 to-pink-600",
  },
  { 
    label: "Play Games", 
    desc: "Dimag aur maza",
    icon: Gamepad2, 
    path: "/games", 
    emoji: "🎮", 
    gradient: "from-emerald-500/15 to-teal-500/10",
    gradientHover: "from-emerald-600/25 to-teal-600/15",
    iconBg: "bg-emerald-500/15",
    accent: "text-emerald-400",
    border: "border-emerald-500/20 hover:border-emerald-500/50",
    btnColor: "from-emerald-500 to-teal-600",
  },
];

const smartSuggestions = [
  { icon: Music, text: "Aapko bhajan sunna hai?", emoji: "🙏" },
  { icon: Gamepad2, text: "Chaliye Sudoku khelte hain", emoji: "🔢" },
  { icon: HeartHandshake, text: "Yaara se dosti ki baatein", emoji: "💝" },
];

const recentActivity = [
  // Shortcuts, not history: there is no "2 hours ago" behind them.
  { type: "music", title: "Bhajan aur gaane", time: "Music Hub", emoji: "🙏" },
  { type: "game", title: "Sudoku aur games", time: "Games Center", emoji: "🔢" },
  { type: "talk", title: "Yaara se baat", time: "Talk with Yaara", emoji: "🌅" },
];

/** The bits of the browser's speech recognition the home mic uses. */
type HomeRecognition = {
  lang: string;
  interimResults: boolean;
  onstart: (() => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  start: () => void;
  stop: () => void;
};

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const deviceType = useDeviceType();
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<HomeRecognition | null>(null);
  const orbSize = deviceType === "desktop" ? "xl" : "lg";
  const profilePromptShown = useRef(false);
  const hasShownAfterSignIn = useRef(false);
  const prevUserRef = useRef(user?.mobile);

  useEffect(() => {
    const justSignedIn = prevUserRef.current && !user?.mobile;
    const isNewUser = user && (!user.age || !user.gender);
    
    if (isNewUser && !hasShownAfterSignIn.current) {
      if (justSignedIn || !prevUserRef.current) {
        hasShownAfterSignIn.current = true;
        const timeout = setTimeout(() => {
          toast({
            title: "Profile Incomplete",
            description: "Tap to add your details.",
            action: (
              <ToastAction altText="Complete Profile" onClick={() => navigate("/profile")}>
                Complete Now
              </ToastAction>
            ),
            duration: 8000,
          });
        }, 1500);
        return () => clearTimeout(timeout);
      }
    }
    
    prevUserRef.current = user?.mobile;
  }, [user, toast, navigate]);

  const handleVoiceResult = useCallback((spokenText: string) => {
    const matched = matchVoiceGameCommand(spokenText);
    if (matched.intent === "open-game" && matched.game) {
      openGame(matched.game);
      return;
    }
    if (matched.intent === "open-games-page") {
      navigate("/games");
      return;
    }
    navigate("/talk");
  }, [navigate]);

  const toggleVoiceMode = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: new () => HomeRecognition; webkitSpeechRecognition?: new () => HomeRecognition };
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognition) { navigate("/talk"); return; }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.onstart = () => setIsListening(true);
    rec.onerror = () => {
      setIsListening(false);
      toast({ title: "Dobara boliye", description: "Main sun nahi paaya." });
    };
    rec.onend = () => setIsListening(false);
    rec.onresult = (e) => handleVoiceResult(e.results[0][0].transcript);
    
    recognitionRef.current = rec;
    rec.start();
  }, [handleVoiceResult, isListening, navigate, toast]);

  return (
    <div className="min-h-screen pb-32 overflow-x-hidden">
      
      {/* ── Enhanced Background with multiple layers ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-5%] w-[50%] h-[50%] bg-amber-500/8 rounded-full blur-[140px]" />
        <div className="absolute top-[20%] right-[-10%] w-[45%] h-[45%] bg-blue-500/6 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-5%] left-[20%] w-[60%] h-[40%] bg-emerald-500/4 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] bg-orange-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative mx-auto w-full max-w-screen-xl px-4 pt-8 md:px-8 lg:px-12 xl:max-w-screen-2xl 2xl:max-w-[90rem]">
        
        {/* ── Premium Header / Welcome ── */}
        <header className="mb-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-500">
               <ShieldCheck className="h-3.5 w-3.5" />
               Your Trusted Companion
            </div>
            <h1 className="text-4xl font-black text-amber-50 md:text-5xl lg:text-6xl tracking-tight leading-tight">
              Namaste, <span className="gradient-text">Yaara</span> Yahi Hai.
            </h1>
            <p className="text-lg text-slate-400 font-medium max-w-xl">
              Aaj ka din halka aur sukoon bhara bitayein. Aapke liye sab kuch pehle se tayyar hai.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Yaara Engine v3.0 Active</span>
            </div>
          </div>
          
          <div className="hidden md:block">
             <div className="rounded-[24px] glass-card-premium p-6 text-right">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Local Time</p>
                <p className="text-3xl font-black text-amber-50">
                   {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </p>
                <p className="text-sm font-medium text-slate-500 mt-1">
                  {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
                </p>
              </div>
           </div>
         </header>

         {/* ── Premium Main Activity Grid ── */}
         <section className="mb-12 grid gap-6 md:grid-cols-3">
          {primaryActivities.map((act) => (
            <button
              key={act.label}
              onClick={() => navigate(act.path)}
              className={cn(
                "group relative overflow-hidden rounded-[32px] glass-card-premium p-8 text-left transition-all duration-500",
                "hover:-translate-y-2 hover:shadow-2xl hover:shadow-black/40 active:scale-[0.98]",
                act.border,
              )}
            >
              <div className={cn(
                "absolute top-0 right-0 h-40 w-40 translate-x-14 -translate-y-14 rounded-full bg-gradient-to-br transition-transform duration-700 group-hover:scale-150",
                act.gradient
              )} />
              <div className={cn(
                "absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-100",
                act.gradientHover
              )} />
              
              <div className="relative z-10 space-y-6">
                <span className={cn("inline-flex h-16 w-16 items-center justify-center rounded-3xl text-4xl group-hover:scale-110 transition-transform duration-500", act.iconBg)}>
                  {act.emoji}
                </span>
                <div>
                  <h3 className="text-2xl font-black text-amber-50 leading-tight">{act.label}</h3>
                  <p className="text-slate-400 font-medium mt-1">{act.desc}</p>
                </div>
                <div className={cn(
                  "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition-all duration-300",
                  "bg-gradient-to-r shadow-lg group-hover:px-7", act.btnColor
                )}>
                   Open <Play className="h-3 w-3 fill-current" />
                </div>
              </div>
            </button>
          ))}
        </section>

        {/* ── Premium Voice Hub (The Centerpiece) ── */}
        <section className="relative mb-12 overflow-hidden rounded-[40px] border border-amber-500/20" style={{ background: "linear-gradient(135deg, hsla(222,35%,12%,0.95), hsla(25,30%,10%,0.95))" }}>
           {/* Animated gradient overlay */}
           <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5" />
           <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-[120px] animate-pulse-glow" />
           
           <div className="relative z-10 grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center p-8 md:p-12">
               <div className="space-y-6 text-center lg:text-left">
                 <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/20 px-4 py-2 text-sm font-bold text-amber-400 uppercase tracking-[0.2em]">
                    <Zap className="h-4 w-4" /> Live AI Interaction
                 </div>
                 <h2 className="text-4xl font-extrabold text-amber-50 md:text-5xl leading-tight">
                   Boliye, Main Sun Rahi Hoon.
                 </h2>
                 <p className="text-lg text-slate-400 font-medium max-w-xl">
                   Aapko thakna nahi hai, bas dil ki baat keh deni hai. Main yahan aapki dosti ke liye haazir hoon.
                 </p>
                 <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-4">
                    <div className="flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-6 py-4 backdrop-blur-md">
                       <div className={cn("h-3 w-3 rounded-full animate-pulse", isListening ? "bg-amber-500" : "bg-blue-400")} />
                       <span className="text-amber-50 font-bold">
                         {isListening ? "Aapki awaaz capture ho rahi hai..." : "Mic active karne ke liye tap karein"}
                       </span>
                    </div>
                 </div>
               </div>

               <div className="flex items-center justify-center py-6">
                 <div className="relative scale-110">
                    <div className={cn(
                      "absolute inset-0 rounded-full blur-[60px] opacity-30 transition-all duration-1000",
                      isListening ? "bg-amber-500 scale-150" : "bg-blue-500 scale-100"
                    )} />
                    <VoiceOrb size={orbSize} isListening={isListening} onClick={toggleVoiceMode} />
                 </div>
               </div>
           </div>
        </section>

        {/* ── Premium Activity Dashboard ── */}
        <div className="grid gap-6 lg:grid-cols-[0.6fr_0.4fr]">
           
           {/* Smart Suggestions */}
           <section className="rounded-[32px] glass-card-premium p-8">
              <div className="mb-6 flex items-center justify-between">
                 <h3 className="text-2xl font-black text-amber-50">Your Journey Today</h3>
                 <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 text-sm font-bold text-amber-400">Daily Routine</span>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                 {smartSuggestions.map((s, i) => (
                    <div key={i} className="group rounded-[24px] bg-white/5 p-5 border border-white/5 transition-all hover:border-amber-500/30 hover:bg-white/[0.08] cursor-default">
                       <span className="text-3xl mb-4 block group-hover:scale-125 transition-transform">{s.emoji}</span>
                       <p className="font-bold text-slate-300 leading-snug">{s.text}</p>
                       <div className="mt-3 text-xs font-bold text-slate-500 flex items-center gap-1 uppercase tracking-widest">
                          <Clock className="h-3 w-3" /> Step {i + 1}
                       </div>
                    </div>
                 ))}
              </div>
           </section>

           {/* Recent Activity Mini-Feed */}
           <section className="rounded-[32px] glass-card-premium p-8">
              <div className="mb-6 flex items-center justify-between">
                 <h3 className="text-2xl font-black text-amber-50">Jaldi kholiye</h3>
                 <Clock className="h-6 w-6 text-slate-500" />
              </div>
              <div className="space-y-4">
                 {recentActivity.map((r, i) => (
                    <div key={i} className="flex items-center gap-4 rounded-2xl bg-white/5 p-4 transition-colors hover:bg-white/10 cursor-pointer" onClick={() => {
                      if (r.type === "talk") navigate("/talk");
                      else if (r.type === "music") navigate("/music");
                      else if (r.type === "game") navigate("/games");
                    }}>
                       <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-2xl">
                          {r.emoji}
                       </div>
                       <div className="flex-1">
                          <p className="font-bold text-amber-50 leading-none">{r.title}</p>
                          <p className="text-sm font-medium text-slate-500 mt-1">{r.time}</p>
                       </div>
                       <ArrowRight className="h-5 w-5 text-slate-500 group-hover:text-amber-400 transition-colors" />
                    </div>
                 ))}
              </div>
           </section>

        </div>

        {/* ── Premium Footer ── */}
        <footer className="mt-12 text-center p-8 rounded-[32px] glass-card-premium border border-amber-500/10">
           <div className="inline-flex items-center gap-2 text-amber-400 font-bold mb-4">
              <Star className="h-5 w-5 fill-current" /> Special Selection For You
           </div>
           <p className="text-2xl font-black text-amber-50 italic">
              "Yaara ke saath har pal khubsurat hai."
           </p>
           <p className="mt-2 text-slate-500 font-medium">Main hamesha aapke ek tap ki duri par hoon.</p>
           <button
             type="button"
             onClick={() => navigate("/review")}
             className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-3 text-lg font-black text-white shadow-lg shadow-amber-500/20 transition hover:-translate-y-0.5"
           >
             <Star className="h-5 w-5" /> Yaara kaisi lagi? Rate kijiye
           </button>
        </footer>

      </div>
    </div>
  );
};

export default Index;
