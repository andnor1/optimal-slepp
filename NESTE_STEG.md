# Neste steg – når Apple Developer-kontoen er godkjent

Forutsetning: Apple Developer-kontoen til **andre.normann@hotmail.com** er aktiv og Team ID er tilgjengelig i [developer.apple.com](https://developer.apple.com).

---

## Steg 1 – Registrer App ID i Apple Developer Portal

Gå til [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list):

1. Trykk **+** → velg **App IDs** → **App**
2. Bundle ID: `com.andrenormann.optimalslepp` (Explicit)
3. Aktiver capabilities:
   - **Push Notifications**
   - **HealthKit**
4. Trykk **Register**

---

## Steg 2 – Bytt aps-environment til production i entitlements

Når du er klar for TestFlight/App Store (ikke nødvendig for lokal testing):

Rediger `ios/optimalsleppny/optimalsleppny.entitlements` og endre:
```xml
<key>aps-environment</key>
<string>development</string>
```
til:
```xml
<key>aps-environment</key>
<string>production</string>
```

Gjør det samme i `app.json` under `ios.entitlements`.

---

## Steg 3 – Sett opp signeringsertifikater

I Xcode (`ios/optimalsleppny.xcworkspace`):

1. Åpne **Signing & Capabilities**-fanen for `optimalsleppny`-target
2. Velg ditt team under **Team**
3. La Xcode håndtere **Automatically manage signing** (anbefalt)
4. Xcode lager nødvendige provisioning profiles automatisk

---

## Steg 4 – Kjør appen på fysisk enhet

```bash
npx expo run:ios --device
```

Velg din iPhone fra listen. Appen bygges og installeres direkte.

---

## Steg 5 – Test Push Notifications

1. Kjør appen på fysisk enhet (push fungerer ikke i simulator)
2. Godta varslingstillatelse i appen
3. Hent device token fra konsollen og test med en push-tjeneste

---

## Steg 6 – App Store-innsending

```bash
# Bygg release-arkiv
npx expo build:ios --type archive

# Alternativt med EAS Build (anbefalt)
npx eas build --platform ios --profile production
npx eas submit --platform ios
```

For EAS Build, sett opp `eas.json` med:
```json
{
  "build": {
    "production": {
      "ios": {
        "bundleIdentifier": "com.andrenormann.optimalslepp"
      }
    }
  }
}
```

---

## Hva er allerede klart

- [x] Bundle ID satt til `com.andrenormann.optimalslepp` overalt
- [x] Push Notifications (`aps-environment: development`) i entitlements
- [x] Push Notifications capability i Xcode-prosjektet
- [x] `expo-notifications` lagt til i plugins
- [x] `react-native-health` konfigurert med norske permissions
- [x] HealthKit-entitlements
- [x] `remote-notification` i UIBackgroundModes
- [x] Alle permissions på norsk (Microphone, Health, Notifications, Motion)
- [x] Native filer generert med `expo prebuild --clean`
