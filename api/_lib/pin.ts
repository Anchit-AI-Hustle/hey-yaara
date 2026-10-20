// Mobile number + 4-digit PIN: the rules, with no I/O in them.
//
// scrypt with a per-PIN salt, constant-time compare, five wrong tries then a
// fifteen-minute lock, and a random session token of which only the sha256 is
// ever stored. Files under api/_lib are not functions on Vercel.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const MAX_TRIES = 5;
export const LOCK_MINUTES = 15;
export const SESSION_DAYS = 60;
export const COOKIE = "yaara_session";

// The ones a thief tries first. Refused when a PIN is chosen, never when one is
// typed to sign in.
const WEAK = new Set([
  "1234", "4321", "1212", "1122", "2580", "0852", "1004", "2000", "2020",
  "6969", "1313", "2468", "1357", "0123", "9876", "5683", "7777", "1010",
  "2121", "1111", "0000", "2001", "1990", "1230", "0007",
]);

/** Any PIN that is typed: exactly 4 digits. */
export function pinShapeError(pin: unknown): string | null {
  const p = String(pin ?? "");
  if (!p) return "Enter your 4-digit PIN.";
  if (!/^\d+$/.test(p)) return "PIN mein sirf numbers hote hain (4 numbers).";
  if (!/^\d{4}$/.test(p)) return `PIN exactly 4 numbers ka hota hai. Aapne ${p.length} type kiye.`;
  return null;
}

/** Choosing a PIN: the shape, plus not one of the obvious ones. */
export function choosePinError(pin: unknown): string | null {
  const shape = pinShapeError(pin);
  if (shape) return shape;
  const p = String(pin);
  const obvious = "Yeh PIN bahut aasaan hai, koi bhi guess kar lega. Koi aur 4 numbers chuniye.";
  if (WEAK.has(p) || /^(\d)\1+$/.test(p)) return obvious;
  let up = true;
  let down = true;
  for (let i = 1; i < p.length; i++) {
    if (+p[i] !== +p[i - 1] + 1) up = false;
    if (+p[i] !== +p[i - 1] - 1) down = false;
  }
  return up || down ? obvious : null;
}

// There are only ten thousand 4-digit PINs, so the cost of each guess is what
// protects a copied table.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function hashPin(pin: string, salt?: string): { salt: string; hash: string } {
  const s = salt || randomBytes(16).toString("hex");
  const key = scryptSync(String(pin), s, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return { salt: s, hash: key.toString("hex") };
}

export function verifyPin(pin: unknown, salt: string | null, hash: string | null): boolean {
  if (!salt || !hash || !/^\d{4}$/.test(String(pin ?? ""))) return false;
  const a = Buffer.from(hashPin(String(pin), salt).hash, "hex");
  const b = Buffer.from(String(hash), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Indian mobile numbers (the app asks for +91 and 10 digits). E.164 or null. */
export function normPhone(raw: unknown): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) return null;
  return "+91" + d;
}

export function lockMessage(until: string | Date, now = Date.now()): string {
  const mins = Math.max(1, Math.ceil((new Date(until).getTime() - now) / 60000));
  return `Bahut baar galat PIN. ${mins} minute baad try kijiye.`;
}

export function wrongPinMessage(left: number): string {
  return `PIN galat hai. ${left} ${left === 1 ? "try" : "tries"} baaki.`;
}

export const newToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (t: string) => createHash("sha256").update(String(t)).digest("hex");
const looksLikeToken = (t: string) => /^[A-Za-z0-9_-]{40,90}$/.test(t);

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** The session token: a Bearer header (the native apps) or the cookie (web). */
export function tokenFrom(headers: Headers): string | null {
  const m = (headers.get("authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (m && looksLikeToken(m[1])) return m[1];
  for (const part of (headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === COOKIE) {
      const v = part.slice(i + 1).trim();
      if (looksLikeToken(v)) return v;
    }
  }
  return null;
}
