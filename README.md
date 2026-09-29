# Govindamala Darshan registration

Darshan ticket registration for Sri Vakulamatha Devi Govindamala Bhakta Brundam, Peruru.
Angular 20 + Firebase (Firestore, Google sign-in).

- **Public site**: `/` opens straight on the registration form (with Aadhaar scanning), `/ticket` ticket download.
- **Seva desk** (`/seva`): staff sign in with Google; the main admin approves who gets in.

## How data is stored

| Path | What |
| --- | --- |
| `devotees`, `tickets`, `submissions` | **2025 data, untouched.** The app cannot read it; only the Firebase console shows it. |
| `seasons/2026` | This year's settings (ticket count, fee, coordinators, open/closed). |
| `seasons/2026/meta/counter` | Last ticket and registration number. |
| `seasons/2026/registrations/{id}` | One document per family; Aadhaar shown only as last 4 digits. |
| `seasons/2026/aadhaar/{sha256}` | Full Aadhaar number, used to block duplicates. Admins only. |
| `seasons/2026/phones/{phone}` | Lets a devotee find their ticket by phone. |
| `seasons/2026/staff/{uid}` | Access requests and approved staff. |

Next year: change `season` in `src/environments/environment.ts`, deploy, and create the new season from *Settings*.

## One-time setup (Firebase console)

The main admin is **santhankrishna18@gmail.com**. To change it, edit `ownerEmails` in
`src/environments/environment.ts` *and* `isOwner()` in `firestore.rules`, then deploy both.


1. **Authentication > Sign-in method**: enable **Google**.
   **Authentication > Settings > Authorized domains**: add the site's domain (for example the Vercel domain).
2. Deploy the security rules: `npx firebase deploy --only firestore:rules`.
3. Open `/seva` and sign in with the main admin account (santhankrishna18@gmail.com). The 2026 season is
   created automatically and registration is open. Review the numbers and coordinators under **Settings**.

Volunteers open `/seva` and sign in; they appear under **People** for you to approve as *volunteer*
(register, list, mark payments) or *admin* (also Excel export with full Aadhaar).
You can also allow **fingerprint unlock** per person.

## Aadhaar scanning

Everything runs on the phone; the photo is never uploaded.

1. **QR code** first (the phone's built-in detector, else ZXing). Old QR codes contain every detail;
   newer Secure QR codes contain name, date of birth, gender, address and the last 4 digits.
2. **Straighten**: the tilt of the text is measured (projection profile) and the photo is rotated level.
3. **Read the whole card** with Tesseract OCR, keeping where every line sits.
4. **Targeted re-reads** based on the Aadhaar layouts (e-Aadhaar letter, old letter, PVC card): the
   12-digit number under "Your Aadhaar No." or along the bottom of the card (digits only), the name on
   the first name-like line above DOB or after "To" (letters only), and the DOB and gender lines. Each
   spot is cropped from the full-resolution photo, enlarged and read with only the characters that can
   appear there.
5. **Checks**: the Aadhaar number must pass its Verhoeff checksum; low-confidence name words one slip
   away from a common Telugu name ("Knshna") are corrected ("Krishna"); noise is left blank instead of filled.

Fields filled from the card are highlighted for the person to check. OCR engine files are served from
`/ocr` (copied from `node_modules` at build time), so scanning does not depend on any CDN.

## Language

One language at a time, English by default. The gear (Settings) in the header switches to Telugu;
the choice is remembered on the device. It also holds the tour and install. Admins open `/seva` directly; "New registration" there opens the form inside the admin desk.

## Install as an app (PWA)

The production build includes a service worker and web manifest, so the site can be added to the
home screen and opens full screen with its own icon. Android/Chrome shows an **Add to home screen**
button in Settings; on iPhone it explains Share > Add to Home Screen.
The app shell loads offline; the scanner files are cached after the first scan. Registering still
needs internet. When a new version is deployed, open apps show a **Reload** bar.

## Look and feel

Monochrome theme (tokens in `src/styles.css`, written as hex equivalents of the supplied oklch values),
Geist for Latin text with Noto Sans Telugu for Telugu, and Phosphor icons bundled as inline SVG.
The site is always light (white background, black buttons), even when the phone uses dark mode.

## Guided tours

The registration, ticket and seva desk pages each play a short bilingual walkthrough on the
first visit. **Settings > Show me around** replays it. Tours are remembered per device.

## Fingerprint unlock

Uses the device's platform authenticator (WebAuthn). Google sign-in remains the real identity check enforced by
the Firestore rules; fingerprint unlock is a lock on top, so a phone left signed in cannot be opened by someone else.
There is no server here, so it is not a replacement for Google sign-in on a new device.

## Development

```bash
npm install
npm start                 # against the real Firebase project
npm run start:emulators   # against local Firestore/Auth emulators (needs Java)
npm run test:unit         # Aadhaar parser, QR decoder and checksum tests
npm run test:rules        # security rules tests in the Firestore emulator
npm run build
```
