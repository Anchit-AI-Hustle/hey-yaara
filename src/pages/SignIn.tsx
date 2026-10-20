import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import PinAuthForm from "@/components/PinAuthForm";
import { useAuth } from "@/contexts/AuthContext";

const SignIn = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Only someone already signed in when the page opened is sent home; right
  // after signing in here, the form decides where to go.
  const [signedInOnArrival] = useState(() => Boolean(user));
  if (signedInOnArrival) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen pb-24">
      {/* Premium Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[20%] w-[50%] h-[50%] bg-blue-500/8 rounded-full blur-[140px]" />
        <div className="absolute bottom-[10%] right-[10%] w-[45%] h-[45%] bg-amber-500/6 rounded-full blur-[140px]" />
        <div className="absolute top-[30%] right-[30%] w-[25%] h-[25%] bg-indigo-500/4 rounded-full blur-[100px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 pt-10 md:px-8 lg:px-12">
        <div className="mb-8 flex items-center gap-4">
          <button type="button" aria-label="Go back" onClick={() => navigate(-1)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-slate-400 hover:text-amber-50 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 border border-blue-500/20 px-3 py-1 text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">
              <Sparkles className="h-3 w-3" /> Welcome Back
            </div>
            <h1 className="text-3xl font-black text-amber-50">Sign In</h1>
            <p className="text-base text-slate-400 font-medium">Mobile number aur 4-digit PIN se.</p>
          </div>
        </div>

        <PinAuthForm mode="signin" />
      </div>
    </div>
  );
};

export default SignIn;
