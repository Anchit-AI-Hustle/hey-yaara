/**
 * sw-routes.ts - addresses the service worker must never answer with the
 * cached app page (index.html). vite.config.ts hands this to Workbox.
 *
 * Without it a returning visitor who taps "iPhone app install karein" gets the
 * app's "Page not found" screen instead of the install profile, because the
 * worker treats every page load as a route inside the app.
 */
export const NAVIGATE_FALLBACK_DENYLIST: RegExp[] = [
  /^\/api\//, // the server's API
  /^\/download\//, // short links that redirect to the app files
  /^\/install\//, // the iPhone install profile
  /\/[^/?]+\.(?!html?(?:\?|$))[a-z0-9]+(?:\?.*)?$/i, // any other file, e.g. .apk, .ipa, .mobileconfig
];

/** True when the worker would answer this address with the app page. */
export const servedByAppShell = (pathAndQuery: string) => !NAVIGATE_FALLBACK_DENYLIST.some((re) => re.test(pathAndQuery));
