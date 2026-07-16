import type { CallLanguage } from "@/lib/languages";

/** Client-safe, short onboarding samples. Kept separate from IVR assembly so
 * the onboarding bundle does not need date/time utilities. */
const SAMPLES: Record<CallLanguage, (name: string) => string> = {
  en: (name) => `Hello ${name || "there"}, this is DawaiSaathi. It's time for your medicines. Please take them now.`,
  hi: (name) => `नमस्ते ${name || "जी"}। मैं दवाई साथी बोल रही हूँ। दवाई का समय हो गया है, कृपया अपनी दवाई ले लीजिए।`,
  bn: (name) => `নমস্কার ${name || "আপনি"}। আমি দাওয়াইসাথী বলছি। ওষুধের সময় হয়েছে, অনুগ্রহ করে এখন ওষুধ নিন।`,
  ar: (name) => `مرحباً ${name || "صديقي"}. هذا دَواي ساتهي. حان وقت أدويتك، يرجى تناولها الآن.`,
  fr: (name) => `Bonjour ${name}. Ici DawaiSaathi. C'est l'heure de vos médicaments, veuillez les prendre maintenant.`,
  pt: (name) => `Olá ${name}. Aqui é o DawaiSaathi. Está na hora dos seus medicamentos, por favor tome-os agora.`,
  af: (name) => `Hallo ${name}. Dit is DawaiSaathi. Dit is tyd vir jou medisyne, neem dit asseblief nou.`,
  am: (name) => `ሰላም ${name}። ይህ DawaiSaathi ነው። የመድሃኒትዎ ጊዜ ደርሷል፣ እባክዎ አሁን ይውሰዱ።`,
  sw: (name) => `Habari ${name}. Huyu ni DawaiSaathi. Ni wakati wa dawa zako, tafadhali tumia sasa.`,
  ha: (name) => `Sannu ${name}. Wannan DawaiSaathi ne. Lokacin shan maganinka ya yi, don Allah ka ko ki sha yanzu.`,
  yo: (name) => `Báwo ni ${name}. DawaiSaathi ni èyí. Ó ti tó àkókò oogun rẹ, jọ̀wọ́ mu ní báyìí.`,
  es: (name) => `Hola ${name}. Soy DawaiSaathi. Es la hora de tus medicinas, por favor tómalas ahora.`,
};

export function voiceSampleScript(language: CallLanguage, patientName = ""): string {
  return SAMPLES[language](patientName);
}
