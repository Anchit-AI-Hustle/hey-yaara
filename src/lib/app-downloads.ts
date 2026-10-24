/**
 * app-downloads.ts - where the Android and iOS apps are downloaded from.
 *
 * CI (.github/workflows/native-apps.yml) builds both apps from main and attaches
 * them to the newest GitHub release under fixed file names, so these links
 * always point at the latest build.
 */

export const RELEASES_REPO = "Anchit-AI-Hustle/hey-yaara";
export const RELEASES_PAGE = `https://github.com/${RELEASES_REPO}/releases`;

export const ANDROID_APK = "hey-yaara.apk";
export const IOS_IPA = "hey-yaara-ios.ipa";

export const latestAssetUrl = (name: string) => `${RELEASES_PAGE}/latest/download/${name}`;

/** Set when the iPhone app is on the App Store or TestFlight. */
export const IOS_STORE_URL: string = import.meta.env.VITE_IOS_STORE_URL || "";

export type Platform = "android" | "ios" | "other";

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  // iPadOS asks for the desktop site and says "Macintosh"; it has a touch screen.
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  return "other";
}

export type ReleaseAsset = { name: string; size: number; url: string };
export type LatestRelease = { version: string; publishedAt: string; android?: ReleaseAsset; ios?: ReleaseAsset };

type GithubRelease = {
  tag_name?: string;
  published_at?: string;
  assets?: { name?: string; size?: number; browser_download_url?: string }[];
};

/** The parts of GitHub's "latest release" answer the page shows. */
export function parseRelease(data: GithubRelease): LatestRelease | null {
  if (!data || typeof data.tag_name !== "string") return null;
  const asset = (name: string): ReleaseAsset | undefined => {
    const a = (data.assets || []).find((x) => x.name === name);
    return a && typeof a.size === "number" ? { name, size: a.size, url: latestAssetUrl(name) } : undefined;
  };
  return {
    version: data.tag_name.replace(/^v/, ""),
    publishedAt: data.published_at || "",
    android: asset(ANDROID_APK),
    ios: asset(IOS_IPA),
  };
}

export async function fetchLatestRelease(signal?: AbortSignal): Promise<LatestRelease | null> {
  const r = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
    signal,
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return parseRelease(await r.json());
}

export const formatSize = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
