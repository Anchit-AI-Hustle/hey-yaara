/**
 * AuthContext.tsx
 *
 * Sign up and sign in with a mobile number and a 4-digit PIN, checked on the
 * server (/api/auth). Each person has their own account; the session lasts
 * until they sign out (60 days at most). Nothing about the account is trusted
 * from the browser: on every start the server says who is signed in.
 */

import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, saveNativeToken } from "@/lib/api";

export interface AuthUser {
  id: string;
  name: string;
  mobile: string;
  phone?: string;
  age?: string;
  gender?: string;
  email?: string;
  yaaraFemaleVoiceId?: string;
  yaarMaleVoiceId?: string;
  updatedAt?: string;
}

type ProfileUpdate = Partial<Pick<AuthUser, "name" | "age" | "gender" | "email" | "yaaraFemaleVoiceId" | "yaarMaleVoiceId">>;

interface AuthContextValue {
  user: AuthUser | null;
  /** True once the server has said whether someone is signed in. */
  ready: boolean;
  /** The server could not be reached when the app started. */
  offline: boolean;
  signup: (name: string, mobile: string, pin: string, confirmPin: string) => Promise<AuthUser>;
  signin: (mobile: string, pin: string) => Promise<AuthUser>;
  updateUser: (updates: ProfileUpdate) => Promise<AuthUser>;
  changePin: (pin: string, newPin: string, confirmPin: string) => Promise<void>;
  deleteAccount: (pin: string) => Promise<void>;
  signout: () => Promise<void>;
  refresh: () => Promise<void>;
}

type AuthReply = { user: AuthUser; token?: string };

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Left by the old single-profile sign-in. They only ever held that one profile.
const LEGACY_KEYS = ["yaara_users", "yaara_current_user"];

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ signedIn: boolean; user?: AuthUser }>("/api/auth?action=session");
      setUser(r.signedIn && r.user ? r.user : null);
      setOffline(false);
    } catch (e) {
      // Unreachable server: stay signed out rather than guess.
      setOffline(e instanceof ApiError && (e.status === 0 || e.status >= 500));
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    try {
      for (const k of LEGACY_KEYS) localStorage.removeItem(k);
      indexedDB.deleteDatabase("yaara_auth");
    } catch { /* storage off */ }
    void refresh();
  }, [refresh]);

  const signup = useCallback(async (name: string, mobile: string, pin: string, confirmPin: string) => {
    const r = await api<AuthReply>("/api/auth?action=signup", { body: { name, mobile, pin, confirmPin } });
    saveNativeToken(r.token || null);
    setUser(r.user);
    return r.user;
  }, []);

  const signin = useCallback(async (mobile: string, pin: string) => {
    const r = await api<AuthReply>("/api/auth?action=signin", { body: { mobile, pin } });
    saveNativeToken(r.token || null);
    setUser(r.user);
    return r.user;
  }, []);

  const updateUser = useCallback(async (updates: ProfileUpdate) => {
    const r = await api<{ user: AuthUser }>("/api/me", { method: "PATCH", body: updates });
    setUser(r.user);
    return r.user;
  }, []);

  const changePin = useCallback(async (pin: string, newPin: string, confirmPin: string) => {
    await api("/api/me?action=pin", { body: { pin, newPin, confirmPin } });
  }, []);

  const signout = useCallback(async () => {
    try { await api("/api/auth?action=signout", { body: {} }); } catch { /* signed out locally either way */ }
    saveNativeToken(null);
    setUser(null);
  }, []);

  const deleteAccount = useCallback(async (pin: string) => {
    await api("/api/me", { method: "DELETE", body: { pin } });
    saveNativeToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, offline, signup, signin, updateUser, changePin, deleteAccount, signout, refresh }),
    [user, ready, offline, signup, signin, updateUser, changePin, deleteAccount, signout, refresh],
  );

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.14),_transparent_35%),linear-gradient(180deg,_#0c1222,_#121a31)]">
        <div className="flex flex-col items-center gap-4 rounded-[28px] border border-white/10 bg-white/5 px-8 py-7 backdrop-blur-xl">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-400 border-t-transparent" />
          <p className="text-base font-bold text-amber-50">Loading your Yaara space…</p>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
