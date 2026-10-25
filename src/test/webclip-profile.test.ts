import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IOS_PROFILE } from "@/lib/app-downloads";

// /get installs Hey Yaara on any iPhone through this profile: it must open the
// live app full screen with the app's own icon, and be served as a profile.
const root = join(__dirname, "..", "..");
const profile = readFileSync(join(root, "public", IOS_PROFILE), "utf8");
const tag = (key: string) => profile.match(new RegExp(`<key>${key}</key>\\s*<(\\w+)>([^<]*)</\\1>`))?.[2];

describe("iPhone install profile", () => {
  it("is one full-screen Web Clip of the live app", () => {
    expect(profile).toContain("<string>com.apple.webClip.managed</string>");
    expect(profile).toContain("<key>PayloadType</key><string>Configuration</string>");
    expect(tag("URL")).toBe("https://hey-yaara.anchit-tandon.com/");
    expect(tag("Label")).toBe("Hey Yaara");
    expect(profile).toMatch(/<key>FullScreen<\/key><true\/>/);
  });

  it("carries the app icon unchanged", () => {
    const data = profile.match(/<key>Icon<\/key>\s*<data>([\s\S]*?)<\/data>/)?.[1].replace(/\s+/g, "") ?? "";
    expect(data).toBe(readFileSync(join(root, "public", "apple-touch-icon.png")).toString("base64"));
  });

  it("is served as a profile, so Safari offers to install it", () => {
    const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
    const route = vercel.routes.find((r: { src?: string }) => r.src?.includes("mobileconfig"));
    expect(route?.headers["Content-Type"]).toBe("application/x-apple-aspen-config");
    const filesystem = vercel.routes.findIndex((r: { handle?: string }) => r.handle === "filesystem");
    expect(vercel.routes.indexOf(route)).toBeLessThan(filesystem);
  });
});
