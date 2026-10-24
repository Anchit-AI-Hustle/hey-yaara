import { describe, expect, it } from "vitest";
import { ANDROID_APK, IOS_IPA, detectPlatform, formatSize, latestAssetUrl, parseRelease } from "@/lib/app-downloads";

const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
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
});
