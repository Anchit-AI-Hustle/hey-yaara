import { describe, expect, it, vi } from "vitest";
import { canPromptInstall, listenForInstallPrompt, onInstallPromptChange, promptInstall, wasInstalledNow } from "@/lib/install-prompt";

// Chrome and Edge on Mac and Windows offer "install app" once, early. The
// store keeps it so /get's "Mac par install karein" button can show it later.
describe("computer install prompt", () => {
  it("keeps the browser's offer, shows it once from our button, and knows when installed", async () => {
    const target = new EventTarget() as unknown as Window;
    listenForInstallPrompt(target);
    const changed = vi.fn();
    const stop = onInstallPromptChange(changed);
    expect(canPromptInstall()).toBe(false);
    expect(await promptInstall()).toBe(false); // nothing to show yet

    const offer = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: vi.fn(async () => {}),
      userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
    });
    target.dispatchEvent(offer);
    expect(offer.defaultPrevented).toBe(true); // no mini-infobar: our button offers it
    expect(canPromptInstall()).toBe(true);
    expect(changed).toHaveBeenCalled();

    expect(await promptInstall()).toBe(true);
    expect(offer.prompt).toHaveBeenCalledTimes(1);
    expect(canPromptInstall()).toBe(false); // a prompt can be used once

    target.dispatchEvent(new Event("appinstalled"));
    expect(wasInstalledNow()).toBe(true);
    stop();
  });
});
