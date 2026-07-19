import type { CallLanguage } from "@/lib/languages";

/** Client-safe, short onboarding samples. Kept separate from IVR assembly so
 * the onboarding bundle does not need date/time utilities. */
const SAMPLES: Record<CallLanguage, (name: string) => string> = {
  en: (name) => `Hello ${name || "there"}, this is DawaiSaathi. It's time for your medicines. Please take them now.`,
  hi: (name) => `नमस्ते ${name || "जी"}। मैं दवाई साथी बोल रही हूँ। दवाई का समय हो गया है, कृपया अपनी दवाई ले लीजिए।`,
  es: (name) => `Hola ${name}. Soy DawaiSaathi. Es la hora de tus medicinas, por favor tómalas ahora.`,
  bn: (name) => `নমস্কার ${name || "আপনি"}। আমি দাওয়াইসাথী বলছি। ওষুধের সময় হয়েছে, অনুগ্রহ করে এখন ওষুধ নিন।`,
  ur: (name) => `السلام علیکم ${name}. یہ DawaiSaathi ہے۔ دوائی کا وقت ہو گیا ہے، براہ کرم ابھی اپنی دوائی لے لیں۔`,
  ta: (name) => `வணக்கம் ${name}. இது DawaiSaathi. மருந்து நேரம் ஆகிவிட்டது, தயவுசெய்து இப்போது எடுத்துக்கொள்ளுங்கள்.`,
  te: (name) => `నమస్కారం ${name}. ఇది DawaiSaathi. మందుల సమయం వచ్చింది, దయచేసి ఇప్పుడు తీసుకోండి.`,
  mr: (name) => `नमस्कार ${name}. हे DawaiSaathi आहे. औषधांची वेळ झाली आहे, कृपया आत्ताच घ्या.`,
  gu: (name) => `નમસ્તે ${name}. આ DawaiSaathi છે. દવાનો સમય થયો છે, કૃપા કરીને હવે લો.`,
  pa: (name) => `ਸਤ ਸ੍ਰੀ ਅਕਾਲ ${name}. ਇਹ DawaiSaathi ਹੈ। ਦਵਾਈ ਦਾ ਸਮਾਂ ਹੋ ਗਿਆ ਹੈ, ਕਿਰਪਾ ਕਰਕੇ ਹੁਣ ਲਓ।`,
  ar: (name) => `مرحباً ${name || "صديقي"}. هذا دَواي ساتهي. حان وقت أدويتك، يرجى تناولها الآن.`,
  fr: (name) => `Bonjour ${name}. Ici DawaiSaathi. C'est l'heure de vos médicaments, veuillez les prendre maintenant.`,
  pt: (name) => `Olá ${name}. Aqui é o DawaiSaathi. Está na hora dos seus medicamentos, por favor tome-os agora.`,
  zh: (name) => `你好 ${name}，这里是 DawaiSaathi。现在是服药时间，请现在服用。`,
  id: (name) => `Halo ${name}, ini DawaiSaathi. Sekarang waktunya obat Anda, silakan minum sekarang.`,
  ms: (name) => `Helo ${name}, ini DawaiSaathi. Sudah tiba masa untuk ubat anda, sila ambil sekarang.`,
  sw: (name) => `Habari ${name}. Huyu ni DawaiSaathi. Ni wakati wa dawa zako, tafadhali tumia sasa.`,
  ha: (name) => `Sannu ${name}. Wannan DawaiSaathi ne. Lokacin shan maganinka ya yi, don Allah ka ko ki sha yanzu.`,
  yo: (name) => `Báwo ni ${name}. DawaiSaathi ni èyí. Ó ti tó àkókò oogun rẹ, jọ̀wọ́ mu ní báyìí.`,
  af: (name) => `Hallo ${name}. Dit is DawaiSaathi. Dit is tyd vir jou medisyne, neem dit asseblief nou.`,
  am: (name) => `ሰላም ${name}። ይህ DawaiSaathi ነው። የመድሃኒትዎ ጊዜ ደርሷል፣ እባክዎ አሁን ይውሰዱ።`,
  de: (name) => `Hallo ${name}, hier ist DawaiSaathi. Es ist Zeit für Ihre Medikamente, bitte nehmen Sie sie jetzt.`,
  it: (name) => `Ciao ${name}, sono DawaiSaathi. È ora delle tue medicine, per favore prendile adesso.`,
  ja: (name) => `こんにちは ${name}さん。DawaiSaathiです。お薬の時間です。今お飲みください。`,
  ko: (name) => `안녕하세요 ${name}님, DawaiSaathi입니다. 약을 드실 시간입니다. 지금 복용하세요.`,
  ru: (name) => `Здравствуйте, ${name}. Это DawaiSaathi. Пора принять лекарства, пожалуйста, примите их сейчас.`,
  tr: (name) => `Merhaba ${name}, ben DawaiSaathi. İlaç zamanınız geldi, lütfen şimdi alın.`,
  vi: (name) => `Xin chào ${name}, đây là DawaiSaathi. Đã đến giờ dùng thuốc, vui lòng dùng ngay bây giờ.`,
  th: (name) => `สวัสดี ${name} นี่คือ DawaiSaathi ถึงเวลายาของคุณแล้ว โปรดรับประทานตอนนี้`,
  fa: (name) => `سلام ${name}. این DawaiSaathi است. وقت داروی شماست، لطفاً اکنون مصرف کنید.`,
  nl: (name) => `Hallo ${name}, dit is DawaiSaathi. Het is tijd voor uw medicijnen, neem ze nu alstublieft.`,
  pl: (name) => `Dzień dobry ${name}, tu DawaiSaathi. Czas na leki, proszę przyjąć je teraz.`,
};

export function voiceSampleScript(language: CallLanguage, patientName = ""): string {
  return SAMPLES[language](patientName);
}
