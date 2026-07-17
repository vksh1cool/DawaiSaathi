# Global voice languages

DawaiSaathi separates the language a caregiver reads in the app from the
language a patient hears on a reminder call. This avoids pretending a partially
translated safety screen is complete while still making the highest-value
interaction — the reminder itself — available in more languages.

## App interface languages

The caregiver interface currently ships reviewed dictionaries for English,
Hindi, and Spanish. Add another UI language only when every key in
`src/lib/i18n/en.json` has a checked-in translation and the dictionary sync
test passes. Draft machine translation is acceptable for a first pass, but
medicine safety, consent, privacy, and error strings must be reviewed before
the language is exposed.

## Launch reminder languages

| Language | Locale | Primary reach | Phone fallback |
| --- | --- | --- | --- |
| English | `en-IN` | Global | Twilio `<Say>` |
| हिन्दी | `hi-IN` | India | Twilio `<Say>` |
| বাংলা | `bn-IN` | South Asia | Twilio `<Say>` |
| العربية | `ar-XA` | North Africa and MENA | Twilio `<Say>` |
| Français | `fr-FR` | West/Central Africa and global | Twilio `<Say>` |
| Português | `pt-PT` | Angola, Mozambique and global | Twilio `<Say>` |
| Afrikaans | `af-ZA` | Southern Africa | Twilio `<Say>` |
| አማርኛ | `am-ET` | Ethiopia | Twilio `<Say>` |
| Kiswahili | `sw-KE` | East/Central Africa | Generated audio required |
| Hausa | `ha-NG` | West Africa | Generated audio required |
| Yorùbá | `yo-NG` | West Africa | Generated audio required |
| Español | `es-US` | Global | Twilio `<Say>` |

For a locale with a Twilio fallback, configure a matching voice under Twilio
Console → Voice → Text-to-Speech → Language Mapping. Twilio documents that a
`<Say>` language must be paired with a supported voice; language mappings let
the application supply only the locale. For Kiswahili, Hausa, and Yoruba the
app blocks a live call if generated audio is unavailable rather than silently
speaking a medicine instruction in a different language.

## Release checks for every language

1. Have a native healthcare communicator review the four fixed scripts:
   reminder, keypress menu, confirmation, and no-response closing.
2. Preview each voice on a low-cost Android device and a real phone call.
3. Verify medicine-brand pronunciation, the `1`/`2` key prompts, and the
   doctor/pharmacist safety line.
4. Test the voice fallback with generated audio disabled. It must either use
   the configured Twilio locale or safely refuse the unsupported live call.

## Translation workflow

For broad draft coverage, prefer open multilingual translation models such as
Meta's NLLB family (`facebook/nllb-200-distilled-600M`) because it targets
200+ languages. OPUS-MT/Helsinki models are also useful for specific language
pairs. Do not translate safety-critical UI at request time: generate drafts
offline, review them, commit the JSON dictionary, and let tests prove it stays
complete.

## Adding another reminder language

Add one entry in `src/lib/languages.ts`, then add its authored scripts and time
labels in `src/lib/ivr/scripts.ts` and `src/lib/util/dates.ts`. TypeScript's
`Record<CallLanguage, …>` checks make a partial script pack fail the build.
Add a test with the native review reference before exposing the language in the
picker.

The reminder-language picker always uses each language's native name, so a
caregiver can select the spoken language without needing English.
