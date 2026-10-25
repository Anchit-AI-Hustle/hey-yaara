// Writes public/install/hey-yaara.mobileconfig: an iOS configuration profile
// holding one Web Clip. Installing it from Safari puts Hey Yaara on the Home
// Screen as a full-screen app, on any iPhone, with no App Store, no signing and
// no expiry. The UUIDs are fixed so installing again replaces the same profile.
// Run again after the icon changes: node scripts/make-webclip.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const APP_URL = "https://hey-yaara.anchit-tandon.com/";
const icon = readFileSync(join(root, "public/apple-touch-icon.png")).toString("base64").replace(/.{1,68}/g, "\t\t\t$&\n");

const profile = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>PayloadContent</key>
\t<array>
\t\t<dict>
\t\t\t<key>PayloadType</key><string>com.apple.webClip.managed</string>
\t\t\t<key>PayloadVersion</key><integer>1</integer>
\t\t\t<key>PayloadIdentifier</key><string>com.heyyaara.app.webclip</string>
\t\t\t<key>PayloadUUID</key><string>7C2E4A91-3B5D-4F08-9A6E-1D2C8B4F5E37</string>
\t\t\t<key>PayloadDisplayName</key><string>Hey Yaara</string>
\t\t\t<key>URL</key><string>${APP_URL}</string>
\t\t\t<key>Label</key><string>Hey Yaara</string>
\t\t\t<key>Icon</key>
\t\t\t<data>
${icon}\t\t\t</data>
\t\t\t<key>FullScreen</key><true/>
\t\t\t<key>IsRemovable</key><true/>
\t\t\t<key>Precomposed</key><true/>
\t\t</dict>
\t</array>
\t<key>PayloadType</key><string>Configuration</string>
\t<key>PayloadVersion</key><integer>1</integer>
\t<key>PayloadIdentifier</key><string>com.heyyaara.app</string>
\t<key>PayloadUUID</key><string>E5A0C7D2-91F4-4B3A-8C6D-2F7E1A9B4C08</string>
\t<key>PayloadDisplayName</key><string>Hey Yaara app</string>
\t<key>PayloadDescription</key><string>Adds Hey Yaara to your Home Screen as a full-screen app.</string>
\t<key>PayloadOrganization</key><string>Hey Yaara</string>
\t<key>PayloadRemovalDisallowed</key><false/>
</dict>
</plist>
`;

mkdirSync(join(root, "public/install"), { recursive: true });
writeFileSync(join(root, "public/install/hey-yaara.mobileconfig"), profile);
console.log("wrote public/install/hey-yaara.mobileconfig", profile.length, "bytes");
