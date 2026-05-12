# Optimal Slepp

Søvnoptimering for skiftarbeidere. Appen modellerer kroppens melatoninkurve og beregner optimale sovetidspunkter basert på dine arbeidsvinduer og søvnhistorikk. Den registrerer søvn automatisk via mikrofon og akselerometer, og vekker deg i lett søvn med en gradvis stigende alarm.

---

## Funksjoner

- **Søvnplanlegger** — beregner anbefalt legge- og opptid for hvert arbeidsvindu, basert på melatonin-modell og tidligere søvn
- **Smart vekkerklokke** — vekker i lett søvn innenfor et konfigurerbart vindu (15/30/45 min før alarmen), med gradvis stigende lydvolum og haptikk
- **Nattopptak** — mikrofon + akselerometer samples hvert 10. sekund hele natten; data beholdes lokalt
- **Søvnfase-analyse** — klassifiserer dyp søvn, lett søvn, REM og våken basert på normalisert RMS + bevegelsesdata; generer søvnkurve-graf
- **Apple Health / Google Fit** — valgfri integrasjon for pulsmålinger (krever native build, se under)
- **Kalibrering** — etter 3+ loggede netter kalibreres personlig DLMO-fase og melatonin-amplitude
- **Onboarding** — 6-stegs flyt som setter første sovepunkt uten konto

---

## Tech stack

| Område | Teknologi |
|---|---|
| Rammeverk | React Native via Expo SDK 54 |
| Navigasjon | expo-router v6 (filbasert routing) |
| Arkitektur | New Architecture (`newArchEnabled: true`) |
| Audio-opptak | expo-av (`Audio.Recording`, metering-API) |
| Alarm-lyd | expo-av (`Audio.Sound`, volum-ramp) |
| Akselerometer | expo-sensors (`Accelerometer`, 2 Hz) |
| Push-varsler | expo-notifications |
| Haptikk | expo-haptics |
| Skjerm alltid på | expo-keep-awake |
| Animasjon | react-native-reanimated v4 |
| SVG-grafikk | react-native-svg (melatonin-ring, søvnkurve, QArc) |
| Lagring | @react-native-async-storage/async-storage |
| Apple Health | react-native-health *(valgfri, krever native build)* |
| Google Health Connect | react-native-health-connect *(valgfri, krever native build)* |
| Språk | JavaScript (JSX) |

### Søvnmotor (`src/engine/sleepEngine.js`)

Ren JS-modul uten React-avhengigheter:

- **Melatonin-modell** — kosinuskurve med personlig DLMO-faseforskyvning og amplitude
- **Søvnoptimalisering** — velger beste innsovningstidspunkt per arbeidsvindu basert på melatonin-score, timer siden sist våken og tilgjengelig budsjetttid
- **`analyseNightRecording`** — kombinerer mikrofon (RMS), akselerometer (bevegelse) og puls med lik vekting per tilgjengelig signal; klassifiserer faser via normalisert aktivitet + lokal varians

---

## Prosjektstruktur

```
app/
  (tabs)/
    index.jsx       # Hjem — plan, melatonin-ring, sovevinduer
    plan.jsx        # Planlegger — dato/tid-input, søvnplan med QArc
    alarm.jsx       # Vekkerklokke — alarm-oppsett, nattopptak, signalbadger
    analyse.jsx     # Analyse — søvnkurve-graf, statistikk, søvnlogg
    profil.jsx      # Profil — brukernavn, kalibrering, innstillinger
  onboarding.jsx
src/
  engine/
    sleepEngine.js  # Melatonin-modell, optimalisering, nattanalyse
  hooks/
    useSleepRecorder.js   # Mikrofon + akselerometer + valgfri puls
    useSmartAlarm.js      # Alarmplanlegging, smart oppvåkning, lydramp
  components/
    TimePicker.jsx  # Avhengighetsfri tidvelger (▲/▼, 15-min steg)
    DatePicker.jsx  # Avhengighetsfri datevelger (‹/› piler)
  utils/
    storage.js      # AsyncStorage-hjelpere (søvnlogg, alarmer, analyse)
    healthKit.js    # Graceful wrapper for native helsemoduler
```

---

## Kom i gang

```bash
npm install
npx expo start
```

Åpne i Expo Go (iOS/Android) eller simulator. Merk at nattopptak krever fysisk enhet med mikrofon.

### Apple Health / Google Fit (valgfritt)

Krever native build og installerte pakker:

```bash
# iOS
npm install react-native-health
npx expo prebuild

# Android
npm install react-native-health-connect
npx expo prebuild
```

Legg deretter til plugin i `app.json`:

```json
"plugins": [
  ["react-native-health", {
    "healthSharePermission": "Optimal Slepp bruker pulsmålinger for søvnanalyse"
  }]
]
```

---

## Data og personvern

All data lagres lokalt på enheten via AsyncStorage. Ingen server, ingen konto, ingen datadeling.
