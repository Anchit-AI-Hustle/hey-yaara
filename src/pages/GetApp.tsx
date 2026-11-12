/**
 * GetApp.tsx - /get: download the Hey Yaara app for Android or iPhone.
 *
 * Android gets the APK from the latest GitHub release. iPhone gets the App
 * Store link when there is one; until then a profile that installs Hey Yaara
 * on the Home Screen from Safari, or Add to Home Screen by hand. The phone the
 * page is opened on comes first.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Apple, ArrowLeft, Check, CheckCircle2, Copy, Download, ExternalLink, Laptop, Share, Smartphone, SquarePlus } from "lucide-react";
import {
  ANDROID_APK, IOS_INSTALL_LINK, IOS_STORE_URL, RELEASES_PAGE,
  detectBrowser, detectDesktop, detectPlatform, fetchLatestRelease, formatSize, latestAssetUrl,
  type DesktopBrowser, type DesktopOs, type LatestRelease, type Platform,
} from "@/lib/app-downloads";
import { canPromptInstall, isInstalledApp, onInstallPromptChange, promptInstall, wasInstalledNow } from "@/lib/install-prompt";
import { isNativeApp } from "@/lib/api";
import { cn } from "@/lib/utils";

type ReleaseState = { status: "loading" } | { status: "ready"; release: LatestRelease | null } | { status: "unknown" };

const Steps = ({ items }: { items: string[] }) => (
  <ol className="mt-5 space-y-3">
    {items.map((step, i) => (
      <li key={step} className="flex gap-3 text-base leading-relaxed text-slate-300">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-black text-amber-100" aria-hidden="true">{i + 1}</span>
        <span>{step}</span>
      </li>
    ))}
  </ol>
);

const OpenElsewhere = ({ text, copied, onCopy }: { text: string; copied: boolean; onCopy: () => void }) => (
  <div role="alert" className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
    <p className="flex gap-2 text-base font-semibold leading-relaxed text-amber-100">
      <AlertTriangle className="mt-1 h-5 w-5 flex-shrink-0" aria-hidden="true" /> <span>{text}</span>
    </p>
    <button type="button" onClick={onCopy} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-base font-bold text-amber-50 transition hover:bg-white/10">
      {copied ? <Check className="h-5 w-5 text-emerald-400" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />} {copied ? "Link copy ho gaya" : "Is page ka link copy karein"}
    </button>
  </div>
);

const DownloadButton = ({ href, label, detail, primary }: { href: string; label: string; detail?: string; primary?: boolean }) => (
  <a
    href={href}
    className={cn(
      "flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl px-6 py-4 text-center text-lg font-black transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400",
      primary
        ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-xl shadow-amber-500/20"
        : "border border-white/15 bg-white/5 text-amber-50 hover:bg-white/10",
    )}
  >
    <Download className="h-6 w-6 flex-shrink-0" aria-hidden="true" />
    <span>
      {label}
      {detail && <span className="block text-sm font-semibold opacity-80">{detail}</span>}
    </span>
  </a>
);

/** How to install the web app on a computer, for browsers with no install button we can press. */
function desktopSteps(os: DesktopOs, browser: DesktopBrowser): string[] {
  if (browser === "chrome") {
    return [
      "Address bar ke daayein taraf “Install” icon (screen par neeche teer) dabaiye, phir “Install”.",
      "Icon na dikhe to upar daayein ⋮ menu → “Cast, save and share” → “Install page as app…” chuniye.",
      os === "mac" ? "Hey Yaara Launchpad aur Dock mein aa jayega." : "Hey Yaara Start menu aur desktop par aa jayega.",
    ];
  }
  if (browser === "edge") {
    return [
      "Address bar mein “App available” icon dabaiye, phir “Install”.",
      "Icon na dikhe to upar daayein … menu → “Apps” → “Install this site as an app” chuniye.",
      os === "mac" ? "Hey Yaara Launchpad aur Dock mein aa jayega." : "Hey Yaara Start menu aur taskbar par pin ho sakta hai.",
    ];
  }
  if (browser === "safari" && os === "mac") {
    return [
      "Upar menu bar mein “File” dabaiye, phir “Add to Dock…” (macOS Sonoma 14 ya naya).",
      "“Add” dabaiye. Hey Yaara Dock aur Launchpad mein aa jayega.",
      "Purana macOS hai to yeh page Chrome mein kholiye aur wahan se install kijiye.",
    ];
  }
  return [
    os === "mac" ? "Yeh page Chrome ya Safari mein kholiye." : "Yeh page Chrome ya Microsoft Edge mein kholiye.",
    "Address bar ke daayein taraf “Install” icon dabaiye, phir “Install”.",
    os === "windows" ? "Hey Yaara Start menu aur desktop par aa jayega." : "Hey Yaara apne app ki tarah alag window mein khulega.",
  ];
}

const GetApp = () => {
  const navigate = useNavigate();
  const [platform, setPlatform] = useState<Platform>("other");
  const [browser, setBrowser] = useState({ inApp: false, iosNotSafari: false });
  const [desktop, setDesktop] = useState<{ os: DesktopOs; browser: DesktopBrowser }>({ os: "other", browser: "other" });
  const [canInstall, setCanInstall] = useState(canPromptInstall());
  const [installedApp, setInstalledApp] = useState(false);
  const [state, setState] = useState<ReleaseState>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const pageUrl = typeof window !== "undefined" ? `${window.location.origin}/get` : "/get";

  useEffect(() => {
    setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints || 0));
    // Inside the Hey Yaara app itself the links open in the phone's browser.
    if (!isNativeApp()) setBrowser(detectBrowser(navigator.userAgent));
    setDesktop(detectDesktop(navigator.userAgent));
    setInstalledApp(isInstalledApp());
    const sync = () => { setCanInstall(canPromptInstall()); if (wasInstalledNow()) setInstalledApp(true); };
    const stop = onInstallPromptChange(sync);
    const controller = new AbortController();
    fetchLatestRelease(controller.signal)
      .then((release) => setState({ status: "ready", release }))
      // GitHub's API is rate-limited per address: the download links work regardless.
      .catch(() => { if (!controller.signal.aborted) setState({ status: "unknown" }); });
    return () => { controller.abort(); stop(); };
  }, []);

  const release = state.status === "ready" ? state.release : null;
  // Before the first build is published the links would 404, so say so instead.
  const notYet = state.status === "ready" && (!release || !release.android);
  const updated = useMemo(() => {
    if (!release?.publishedAt) return "";
    const d = new Date(release.publishedAt);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }, [release]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* the address is on screen to type */ }
  };

  const android = (
    <section
      key="android"
      aria-labelledby="android-title"
      className={cn("rounded-[32px] p-6 md:p-8", platform === "android" ? "glass-card-premium border border-amber-500/30" : "glass-card")}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
          <Smartphone className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id="android-title" className="text-2xl font-black text-amber-50">Android phone</h2>
          <p className="text-base text-slate-400">Samsung, Vivo, Oppo, Redmi, Realme aur baaki sab</p>
        </div>
      </div>

      {platform === "android" && browser.inApp && (
        <OpenElsewhere
          text="Yeh page kisi doosre app ke andar khula hai, wahan download aksar nahi hota. Upar ⋮ dabakar “Chrome mein kholiye” chuniye, ya link copy karke Chrome mein kholiye."
          copied={copied}
          onCopy={copyLink}
        />
      )}
      <div className="mt-6">
        {notYet ? (
          <p className="rounded-2xl bg-white/5 px-5 py-4 text-base font-semibold text-amber-100">Android app taiyaar ho raha hai. Thodi der baad yeh page dobara kholiye.</p>
        ) : (
          <DownloadButton
            href={latestAssetUrl(ANDROID_APK)}
            label="Android app download karein"
            detail={release?.android ? `Version ${release.version} · ${formatSize(release.android.size)}` : "APK file"}
            primary={platform !== "ios"}
          />
        )}
      </div>

      <Steps
        items={[
          "Download poora hone par notification ya Downloads mein hey-yaara.apk kholiye.",
          "Phone poochhe to “Settings” dabakar “Is source se allow karein” (Install unknown apps) chalu kijiye.",
          "“Install” dabaiye, phir Hey Yaara kholiye.",
          "Pehli call par microphone ki permission “Allow” kijiye.",
        ]}
      />
      <p className="mt-4 text-sm leading-relaxed text-slate-500">
        App abhi Play Store par nahi hai, isliye phone ek baar poochhta hai. File seedhe Hey Yaara ke official release se aati hai.
      </p>
    </section>
  );

  const ios = (
    <section
      key="ios"
      aria-labelledby="ios-title"
      className={cn("rounded-[32px] p-6 md:p-8", platform === "ios" ? "glass-card-premium border border-amber-500/30" : "glass-card")}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300">
          <Apple className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id="ios-title" className="text-2xl font-black text-amber-50">iPhone aur iPad</h2>
          <p className="text-base text-slate-400">iOS 15 ya usse naya</p>
        </div>
      </div>

      {platform === "ios" && installedApp ? (
        <p className="mt-6 flex items-center gap-3 rounded-2xl bg-emerald-500/10 px-5 py-4 text-base font-semibold text-emerald-200">
          <CheckCircle2 className="h-6 w-6 flex-shrink-0" aria-hidden="true" /> Hey Yaara aapke iPhone par install hai. Home Screen par uske icon se kholiye.
        </p>
      ) : IOS_STORE_URL ? (
        <div className="mt-6">
          <a
            href={IOS_STORE_URL}
            className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-4 text-lg font-black text-white shadow-xl shadow-amber-500/20 transition hover:-translate-y-0.5"
          >
            <ExternalLink className="h-6 w-6" aria-hidden="true" /> App Store se install karein
          </a>
        </div>
      ) : (
        <>
          {platform === "ios" && (browser.inApp || browser.iosNotSafari) && (
            <OpenElsewhere
              text="iPhone par app sirf Safari se install hota hai. Link copy kijiye, Safari kholiye, upar address bar mein paste karke yeh page kholiye, phir button dabaiye."
              copied={copied}
              onCopy={copyLink}
            />
          )}
          <div className="mt-6">
            <DownloadButton href={IOS_INSTALL_LINK} label="iPhone app install karein" detail="Safari mein, ek minute mein" primary={platform === "ios"} />
          </div>
          <Steps
            items={[
              "Yeh page iPhone ke Safari mein kholiye aur upar wala button dabaiye, phir “Allow”.",
              "Settings kholiye aur sabse upar “Profile Downloaded” dabaiye.",
              "“Install” dabaiye, passcode daaliye, phir dobara “Install”.",
              "Home Screen par Hey Yaara ka icon aa jayega. Kholiye aur sign in kijiye.",
            ]}
          />
          <p className="mt-4 text-sm leading-relaxed text-slate-500">
            Har iPhone aur iPad par chalta hai, App Store ki zaroorat nahi, aur hamesha naya version khulta hai.
          </p>

          <h3 className="mt-6 flex items-center gap-2 text-lg font-black text-amber-100">
            <SquarePlus className="h-5 w-5" aria-hidden="true" /> Ya khud Home Screen par jodiye
          </h3>
          <Steps
            items={[
              "Yeh page iPhone ke Safari mein kholiye.",
              "Neeche Share button (chaukor se upar teer) dabaiye.",
              "“Add to Home Screen” chuniye, phir “Add”.",
            ]}
          />
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Share className="h-4 w-4" aria-hidden="true" /> Calls, music aur games sab isi mein chalte hain.
          </p>
        </>
      )}
    </section>
  );

  const installOnComputer = async () => {
    if (await promptInstall()) setInstalledApp(true);
  };

  const computerName = desktop.os === "mac" ? "Mac" : desktop.os === "windows" ? "Windows PC" : "computer";
  const computer = (
    <section
      key="computer"
      aria-labelledby="computer-title"
      className={cn("rounded-[32px] p-6 md:p-8", platform === "other" ? "glass-card-premium border border-amber-500/30 lg:col-span-2" : "glass-card lg:col-span-2")}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
          <Laptop className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id="computer-title" className="text-2xl font-black text-amber-50">Mac aur Windows computer</h2>
          <p className="text-base text-slate-400">Chrome, Edge ya Safari se, alag app ki tarah</p>
        </div>
      </div>

      {installedApp ? (
        <p className="mt-6 flex items-center gap-3 rounded-2xl bg-emerald-500/10 px-5 py-4 text-base font-semibold text-emerald-200">
          <CheckCircle2 className="h-6 w-6 flex-shrink-0" aria-hidden="true" /> Hey Yaara is {computerName} par install hai. Dock, Launchpad ya Start menu se kholiye.
        </p>
      ) : (
        <>
          {platform === "other" && canInstall && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => void installOnComputer()}
                className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-4 text-center text-lg font-black text-white shadow-xl shadow-amber-500/20 transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                <Download className="h-6 w-6 flex-shrink-0" aria-hidden="true" />
                <span>
                  {computerName} par install karein
                  <span className="block text-sm font-semibold opacity-80">Ek click, koi file download nahi</span>
                </span>
              </button>
            </div>
          )}
          {platform === "other" && desktop.browser === "firefox" && (
            <p role="alert" className="mt-6 flex gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-base font-semibold leading-relaxed text-amber-100">
              <AlertTriangle className="mt-1 h-5 w-5 flex-shrink-0" aria-hidden="true" />
              <span>Firefox apps install nahi karta. Yeh page {desktop.os === "mac" ? "Chrome ya Safari" : "Chrome ya Microsoft Edge"} mein kholiye.</span>
            </p>
          )}
          <h3 className="mt-6 text-lg font-black text-amber-100">{canInstall && platform === "other" ? "Ya khud install kijiye" : "Install kaise karein"}</h3>
          <Steps items={platform === "other" ? desktopSteps(desktop.os, desktop.browser) : desktopSteps("other", "other")} />
          <p className="mt-4 text-sm leading-relaxed text-slate-500">
            Koi file ya setup nahi: Hey Yaara apni window mein khulta hai, calls aur microphone ke saath, aur hamesha naya version chalta hai.
          </p>
        </>
      )}
    </section>
  );

  return (
    <div className="min-h-screen pb-32">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[10%] w-[45%] h-[45%] bg-amber-500/8 rounded-full blur-[140px]" />
        <div className="absolute bottom-[10%] right-[5%] w-[35%] h-[35%] bg-orange-500/6 rounded-full blur-[140px]" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl px-4 pt-8 md:px-8">
        <header className="mb-8 flex items-center gap-4">
          <button type="button" aria-label="Go back" onClick={() => navigate(-1)} className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-slate-400 hover:text-amber-50 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <img src="/icon-192x192.png" alt="" width={56} height={56} className="h-14 w-14 flex-shrink-0 rounded-2xl" />
          <div className="min-w-0">
            <h1 className="text-3xl font-black text-amber-50">Hey Yaara app</h1>
            <p className="text-base text-slate-400 font-medium">Phone ya computer par Yaara ka app install kijiye.</p>
          </div>
        </header>

        {isNativeApp() ? (
          <p className="mb-6 rounded-2xl bg-emerald-500/10 px-5 py-4 text-base font-semibold text-emerald-200">Aap Hey Yaara app mein hi hain. Naya version aane par yahan se update kar sakte hain.</p>
        ) : platform === "other" && (
          <div className="mb-6 flex flex-col gap-3 rounded-[28px] border border-white/10 bg-white/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-base text-slate-300">
              Yeh page apne phone par kholiye: <b className="break-all text-amber-50">{pageUrl.replace(/^https?:\/\//, "")}</b>
            </p>
            <button type="button" onClick={copyLink} className="flex min-h-12 flex-shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-base font-bold text-amber-50 transition hover:bg-white/10">
              {copied ? <Check className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5" />} {copied ? "Copied" : "Link copy"}
            </button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {platform === "ios" ? [ios, android, computer] : platform === "android" ? [android, ios, computer] : [computer, android, ios]}
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          {release ? `Latest version ${release.version}${updated ? `, ${updated}` : ""}. ` : ""}
          <a href={RELEASES_PAGE} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-slate-400 underline hover:text-amber-100">Saare versions</a>
        </p>
      </div>
    </div>
  );
};

export default GetApp;
