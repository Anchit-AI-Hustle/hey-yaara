import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ANDROID_APK, IOS_INSTALL_LINK, IOS_IPA, IOS_PROFILE, detectBrowser, detectDesktop, detectPlatform, formatSize, latestAssetUrl, parseRelease } from "@/lib/app-downloads";
import { servedByAppShell } from "@/lib/sw-routes";

const vercel = JSON.parse(readFileSync(join(__dirname, "..", "..", "vercel.json"), "utf8")) as {
  routes: { src?: string; status?: number; headers?: Record<string, string> }[];
};
const redirect = (path: string) => {
  const r = vercel.routes.find((x) => x.src && x.status && new RegExp(`^${x.src}$`).test(path));
  return r && { status: r.status, location: r.headers?.Location };
};

const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0 Mobile/15E148 Safari/604.1",
  iphoneGoogleApp: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/330.0 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0.0",
  androidFacebook: "Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0 Mobile Safari/537.36 [FBAN/EMA;FBLC/en_US;FBAV/420.0]",
};

describe("app downloads", () => {
  it("puts the visitor's phone first", () => {
    expect(detectPlatform(UA.android)).toBe("android");
    expect(detectPlatform(UA.iphone)).toBe("ios");
    expect(detectPlatform(UA.ipadDesktop, 5)).toBe("ios"); // iPadOS asks for the desktop site
    expect(detectPlatform(UA.ipadDesktop, 0)).toBe("other"); // a real Mac
    expect(detectPlatform(UA.windows)).toBe("other");
  });

  it("links to the newest release's files by fixed names", () => {
    expect(latestAssetUrl(ANDROID_APK)).toBe("https://github.com/Anchit-AI-Hustle/hey-yaara/releases/latest/download/hey-yaara.apk");
    expect(latestAssetUrl(IOS_IPA)).toBe("https://github.com/Anchit-AI-Hustle/hey-yaara/releases/latest/download/hey-yaara-ios.ipa");
  });

  it("reads the version and sizes from GitHub's answer, and only the two app files", () => {
    const r = parseRelease({
      tag_name: "v1.0.7",
      published_at: "2026-10-24T10:00:00Z",
      assets: [
        { name: "hey-yaara.apk", size: 6_500_000, browser_download_url: "x" },
        { name: "hey-yaara-ios.ipa", size: 3_200_000, browser_download_url: "y" },
        { name: "notes.txt", size: 10 },
      ],
    });
    expect(r).toEqual({
      version: "1.0.7",
      publishedAt: "2026-10-24T10:00:00Z",
      android: { name: "hey-yaara.apk", size: 6_500_000, url: latestAssetUrl("hey-yaara.apk") },
      ios: { name: "hey-yaara-ios.ipa", size: 3_200_000, url: latestAssetUrl("hey-yaara-ios.ipa") },
    });
    expect(parseRelease({ tag_name: "v2", assets: [] })).toMatchObject({ android: undefined, ios: undefined });
    expect(parseRelease({})).toBeNull();
    expect(formatSize(6_500_000)).toBe("6.2 MB");
  });

  it("knows when the browser cannot install: iPhone outside Safari, or inside another app", () => {
    expect(detectBrowser(UA.iphone)).toEqual({ inApp: false, iosNotSafari: false });
    expect(detectBrowser(UA.android)).toEqual({ inApp: false, iosNotSafari: false });
    expect(detectBrowser(UA.iphoneChrome).iosNotSafari).toBe(true);
    expect(detectBrowser(UA.iphoneGoogleApp).iosNotSafari).toBe(true);
    expect(detectBrowser(UA.iphoneInstagram).inApp).toBe(true);
    expect(detectBrowser(UA.androidFacebook).inApp).toBe(true);
  });

  it("short links send each phone to the file that installs on it", () => {
    expect(redirect("/download/android")).toEqual({ status: 302, location: latestAssetUrl(ANDROID_APK) });
    expect(redirect("/download/android/")).toEqual({ status: 302, location: latestAssetUrl(ANDROID_APK) });
    expect(redirect("/download/ios-ipa")).toEqual({ status: 302, location: latestAssetUrl(IOS_IPA) });
  });

  it("the iPhone button gets the profile itself from a path no service worker ever caught", () => {
    // Served in place, not redirected: a phone still on an old worker (which
    // only left /api/ and /download/ alone) must install on the first tap.
    expect(IOS_INSTALL_LINK).toBe("/download/ios");
    const oldWorker = [/^\/api\//, /^\/download\//];
    expect(oldWorker.some((re) => re.test(IOS_INSTALL_LINK))).toBe(true);
    const route = vercel.routes.find((r) => r.src && new RegExp(`^${r.src}$`).test(IOS_INSTALL_LINK)) as { dest?: string; status?: number; headers?: Record<string, string> };
    expect(route.status).toBeUndefined();
    expect(route.dest).toBe(IOS_PROFILE);
    expect(route.headers?.["Content-Type"]).toBe("application/x-apple-aspen-config");
    expect(route.headers?.["Content-Disposition"]).toContain("attachment");
  });

  it("the service worker script is never cached, so phones get the new one on the next visit", () => {
    const route = vercel.routes.find((r) => r.src === "/sw.js");
    expect(route?.headers?.["Cache-Control"]).toBe("no-cache");
  });

  it("the offline worker never answers a download with the app page", () => {
    for (const path of [IOS_PROFILE, "/install/hey-yaara.mobileconfig?v=2", "/download/android", "/download/ios", "/download/ios-ipa", "/api/me", "/hey-yaara.apk"]) {
      expect(servedByAppShell(path), path).toBe(false);
    }
    for (const path of ["/", "/get", "/call", "/history", "/get?from=banner", "/index.html"]) {
      expect(servedByAppShell(path), path).toBe(true);
    }
  });

  it("tells Mac and Windows apart, and which browser, for the computer install steps", () => {
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)";
    const win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
    expect(detectDesktop(`${mac} Chrome/131.0.0.0 Safari/537.36`)).toEqual({ os: "mac", browser: "chrome" });
    expect(detectDesktop(UA.ipadDesktop)).toEqual({ os: "mac", browser: "safari" }); // Safari on a Mac
    expect(detectDesktop(`${win} Chrome/131.0.0.0 Safari/537.36`)).toEqual({ os: "windows", browser: "chrome" });
    expect(detectDesktop(`${win} Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0`)).toEqual({ os: "windows", browser: "edge" });
    expect(detectDesktop(`${mac} Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0`)).toEqual({ os: "mac", browser: "edge" });
    expect(detectDesktop("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0")).toEqual({ os: "windows", browser: "firefox" });
    expect(detectDesktop(`${win} Chrome/131.0.0.0 Safari/537.36 OPR/115.0`)).toEqual({ os: "windows", browser: "other" });
    expect(detectDesktop("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36")).toEqual({ os: "other", browser: "chrome" });
  });
});
