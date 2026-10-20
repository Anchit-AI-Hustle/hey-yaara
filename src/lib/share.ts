/**
 * share.ts - the post someone shares after rating Hey Yaara.
 *
 * The words follow the stars they gave: a warm invitation for 4-5, a plain
 * "I tried it" for 3, and an honest neutral line for 1-2 (we never put praise
 * in someone's mouth they did not give). Their own review is quoted as typed.
 */

export const PUBLIC_URL = "https://hey-yaara.vercel.app";

/** The address people should open: this site, unless it is a local or app copy. */
export function shareUrl(origin = typeof location !== "undefined" ? location.origin : ""): string {
  return /^https:\/\/(?!localhost)[^/]+$/.test(origin) ? origin : PUBLIC_URL;
}

export const stars = (rating: number) => "★".repeat(rating) + "☆".repeat(5 - rating);

const clip = (text: string, max: number) => {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, Math.max(0, max - 1));
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), Math.floor(max * 0.6))).trim() + "…";
};

/**
 * The post. `maxLength` fits it to a network's limit (X allows 280 characters,
 * and counts any link as 23); the review is shortened first, never the link.
 */
export function buildShareMessage(rating: number, review: string, url: string, maxLength = 1000): string {
  const r = Math.max(1, Math.min(5, Math.round(rating)));
  const head = r >= 4
    ? `${stars(r)} Hey Yaara mera AI saathi hai: Hinglish mein pyaar se baat karti hai, gaane aur games bhi hain.`
    : r === 3
      ? `${stars(r)} Maine Hey Yaara try kiya: ek AI saathi jisse Hinglish mein baat kar sakte hain.`
      : `${stars(r)} Maine Hey Yaara (AI saathi) try kiya.`;
  const tail = r >= 4 ? `Aap bhi try kijiye: ${url}` : url;
  const linkCost = Math.max(0, url.length - 23);
  const room = maxLength - head.length - tail.length - 6 + (maxLength <= 280 ? linkCost : 0);
  const quote = review.trim() && room > 12 ? `"${clip(review, room)}"` : "";
  return [head, quote, tail].filter(Boolean).join("\n");
}

export type ShareTarget = { id: string; label: string; href: string };

/** Links that open each network's own share screen with the post filled in. */
export function shareLinks(rating: number, review: string, url: string): ShareTarget[] {
  const long = encodeURIComponent(buildShareMessage(rating, review, url));
  const forX = encodeURIComponent(buildShareMessage(rating, review, url, 280));
  const u = encodeURIComponent(url);
  return [
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${long}` },
    { id: "x", label: "X", href: `https://x.com/intent/post?text=${forX}` },
    { id: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { id: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { id: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${u}&text=${long}` },
  ];
}

/** Characters as X counts them: every link is 23. */
export const xLength = (text: string) => text.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
