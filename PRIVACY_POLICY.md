# Privacy Policy — Memory Records Free (DRAFT)

**Do not submit this draft to Google Play until all publisher/contact fields
are filled and the final signed release has been audited.**

**Last reviewed:** 27 October 2026  
**App:** Memory Records Free, Android package `app.memoryrecords.free`  
**Publisher:** `[ADD THE EXACT PLAY CONSOLE DEVELOPER / PUBLISHER NAME]`  
**Privacy contact:** `[ADD A PUBLIC EMAIL ADDRESS MONITORED BY THE PUBLISHER]`

This policy describes the free Android edition only. The full edition on the
repository’s `main` branch is a separate release.

## Data the app handles

Memory Records lets you create notes with dates, tags, emotions, and optional
memory-year values. You may attach photos or videos. If Android grants the
required access, the app can read GPS coordinates embedded in a selected photo
and save them with that memory. You can separately choose to attach the phone’s
current location when the photo has no readable location; this is optional and
is not necessarily the photo’s location.

These records and media are stored in the app’s private storage on your device.
The app uses local app storage and secure device storage; the biometric/PIN
app lock is an access-control feature and does not mean your memory files are
end-to-end encrypted by the app.

## Collection, online services, and third parties

The free app does not require an account. Its free-edition code disables the
premium payment/status calls, AI features, and Obsidian integration. The app
does not include advertising or an app-run account/cloud-sync service.

Memory Records Free itself does not use cookies at all: it does not set or read
cookies. External websites, operating-system services, and other apps that you
choose to open or share to may have their own data practices.

Android’s app configuration currently permits operating-system backup
(`allowBackup=true`). Eligible app data may therefore be copied/restored by
Android and the Google account/device-backup service according to your device
and account settings. That transfer is controlled by Android/Google, not by
an app-managed Memory Records server. Check your Android backup settings and
the final release’s manifest before relying on this description.

If you explicitly export a JSON or Complete backup, save it to a location you
choose. Complete backup may include accessible media; JSON contains record
data but not the media files. If you share an image card, memory text, or
exported file, the chosen share target, recipient, file provider, or cloud
service handles what you send under its own terms and privacy policy.

If you dictate text using the microphone control on your Android keyboard,
the keyboard or its speech-recognition service may process that input under
its own privacy terms. The app itself does not record voice memos in this
edition.

No analytics, advertising, crash-reporting, or other third-party network SDK
use has been identified in the reviewed application source. This statement
must be checked against the exact release AAB and all bundled SDKs before
publication.

## Permissions

- **Photos/media:** to let you choose photos and videos for memories.
- **Media location:** to read GPS metadata from a selected photo when
  available.
- **Location (foreground, optional):** only if you choose to use the phone’s
  current location as a fallback.
- **Biometrics:** only if you enable biometric app lock.
- **Internet:** Android/Expo and user-selected system features may require
  connectivity. The free memory content has no app-run cloud sync service.

Review Play Console’s current sensitive-permission requirements. In
particular, this build uses broad image access plus media-location access to
support photo GPS metadata. The app owner must confirm whether Google approves
that permission declaration or change the media access design.

## Retention and deletion

Records, copied media, and local snapshots remain in app storage until you
delete them, clear app data, or uninstall the app. Use the app’s record and
snapshot controls to remove local items. Android system backup may retain
eligible copies according to Android/Google retention and backup behavior.

Exports saved outside the app remain at their destination until you remove
them there. The publisher cannot remotely erase files sent to another app,
recipient, or file provider.

The app does not create user accounts, so there is no app account to delete.

## Security

The app stores records and media in Android app-private storage and relies on
Android’s application sandbox and device security. Optional biometric/PIN
locking can restrict access while the app is in use, but is not a substitute
for device security, a backup, or encryption of exported archives. Protect
your device and exported backup files.

## Children and changes

The publisher should set the target audience accurately in Play Console.
This app is not designed or advertised as a child-directed service. The
publisher will update this policy if app data handling changes and maintain
the public URL linked in Google Play and in the app.

## Contact

For privacy questions or requests, contact:

`[ADD THE SAME PUBLIC PRIVACY CONTACT EMAIL SHOWN IN PLAY CONSOLE]`

`[ADD PUBLISHER LEGAL/POSTAL DETAILS IF REQUIRED FOR THE PUBLISHER AND
JURISDICTIONS WHERE THE APP WILL BE OFFERED]`
