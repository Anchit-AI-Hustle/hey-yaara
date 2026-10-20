import { describe, expect, it } from "vitest";
import { buildShareMessage, PUBLIC_URL, shareLinks, shareUrl, stars, xLength } from "@/lib/share";

const URL = "https://hey-yaara.vercel.app";

describe("share message", () => {
  it("follows the stars: an invitation for 4-5, plain for 3, neutral for 1-2", () => {
    expect(buildShareMessage(5, "", URL)).toBe(`★★★★★ Hey Yaara mera AI saathi hai: Hinglish mein pyaar se baat karti hai, gaane aur games bhi hain.\nAap bhi try kijiye: ${URL}`);
    expect(buildShareMessage(3, "", URL)).toMatch(/^★★★☆☆ Maine Hey Yaara try kiya/);
    const low = buildShareMessage(1, "Awaaz ruk ruk ke aati hai", URL);
    expect(low).toBe(`★☆☆☆☆ Maine Hey Yaara (AI saathi) try kiya.\n"Awaaz ruk ruk ke aati hai"\n${URL}`);
    expect(low).not.toMatch(/pyaar|Aap bhi try/);
  });

  it("quotes the review as typed, Hindi included", () => {
    expect(buildShareMessage(5, "रोज़ बात करती हूँ", URL)).toContain('"रोज़ बात करती हूँ"');
  });

  it("fits X's 280 characters by shortening the review, never the link", () => {
    const long = "Bahut accha ".repeat(60);
    const msg = buildShareMessage(5, long, URL, 280);
    expect(xLength(msg)).toBeLessThanOrEqual(280);
    expect(msg.split("\n").at(-1)).toBe(`Aap bhi try kijiye: ${URL}`);
    expect(msg).toContain("…");
  });

  it("stars and the address to share", () => {
    expect(stars(4)).toBe("★★★★☆");
    expect(shareUrl("https://hey-yaara.vercel.app")).toBe(URL);
    expect(shareUrl("http://localhost:8080")).toBe(PUBLIC_URL);
    expect(shareUrl("capacitor://localhost")).toBe(PUBLIC_URL);
  });

  it("links open each network's share screen with the post", () => {
    const links = shareLinks(5, "Mast hai", URL);
    expect(links.map((l) => l.id)).toEqual(["whatsapp", "x", "facebook", "linkedin", "telegram"]);
    const wa = decodeURIComponent(links[0].href.split("text=")[1]);
    expect(wa).toContain('"Mast hai"');
    expect(links[2].href).toBe(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(URL)}`);
    expect(xLength(decodeURIComponent(links[1].href.split("text=")[1]))).toBeLessThanOrEqual(280);
  });
});
