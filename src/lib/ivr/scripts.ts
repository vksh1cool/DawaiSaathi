import { slotLabel } from "@/lib/util/dates";
import type { CallLanguage } from "@/lib/languages";
import type { FoodRelation } from "@/types/domain";

/**
 * Short, deliberately repetitive reminder scripts. They never describe why a
 * medicine is prescribed and every language keeps the same safety instruction
 * to speak with a doctor or pharmacist before changing a medicine.
 */

export type ScriptMed = {
  brandName: string;
  /** Exact caregiver-verified text, in the language the patient will hear. */
  doseInstruction: string;
};

export type ReminderScriptInput = {
  patientName: string;
  time: string; // "HH:mm"
  meds: ScriptMed[];
  foodRelation: FoodRelation;
  language: CallLanguage;
  caregiverName?: string;
};

function medLine(med: ScriptMed): string {
  // Do not interpret, translate, or normalize a medical instruction here.
  // The phrase was explicitly reviewed in the selected call language.
  return `${med.brandName}: ${med.doseInstruction.trim()}`;
}

const FOOD: Record<CallLanguage, Record<FoodRelation, string>> = {
  en: { after_food: "after food", before_food: "before food", with_food: "with food", any: "" },
  hi: { after_food: "खाने के बाद", before_food: "खाने से पहले", with_food: "खाने के साथ", any: "" },
  es: { after_food: "después de comer", before_food: "antes de comer", with_food: "con comida", any: "" },
  bn: { after_food: "খাবারের পরে", before_food: "খাবারের আগে", with_food: "খাবারের সঙ্গে", any: "" },
  ur: { after_food: "کھانے کے بعد", before_food: "کھانے سے پہلے", with_food: "کھانے کے ساتھ", any: "" },
  ta: { after_food: "உணவுக்குப் பிறகு", before_food: "உணவுக்கு முன்", with_food: "உணவுடன்", any: "" },
  te: { after_food: "ఆహారం తర్వాత", before_food: "ఆహారం ముందు", with_food: "ఆహారంతో", any: "" },
  mr: { after_food: "जेवणानंतर", before_food: "जेवणापूर्वी", with_food: "जेवणासोबत", any: "" },
  gu: { after_food: "ભોજન પછી", before_food: "ભોજન પહેલાં", with_food: "ભોજન સાથે", any: "" },
  pa: { after_food: "ਖਾਣੇ ਤੋਂ ਬਾਅਦ", before_food: "ਖਾਣੇ ਤੋਂ ਪਹਿਲਾਂ", with_food: "ਖਾਣੇ ਨਾਲ", any: "" },
  ar: { after_food: "بعد الطعام", before_food: "قبل الطعام", with_food: "مع الطعام", any: "" },
  fr: { after_food: "après le repas", before_food: "avant le repas", with_food: "avec le repas", any: "" },
  pt: { after_food: "depois da comida", before_food: "antes da comida", with_food: "com a comida", any: "" },
  zh: { after_food: "饭后", before_food: "饭前", with_food: "随餐", any: "" },
  id: { after_food: "setelah makan", before_food: "sebelum makan", with_food: "bersama makanan", any: "" },
  ms: { after_food: "selepas makan", before_food: "sebelum makan", with_food: "bersama makanan", any: "" },
  sw: { after_food: "baada ya chakula", before_food: "kabla ya chakula", with_food: "pamoja na chakula", any: "" },
  ha: { after_food: "bayan abinci", before_food: "kafin abinci", with_food: "tare da abinci", any: "" },
  yo: { after_food: "lẹ́yìn oúnjẹ", before_food: "ṣáájú oúnjẹ", with_food: "pẹ̀lú oúnjẹ", any: "" },
  af: { after_food: "ná ete", before_food: "voor ete", with_food: "saam met ete", any: "" },
  am: { after_food: "ከምግብ በኋላ", before_food: "ከምግብ በፊት", with_food: "ከምግብ ጋር", any: "" },
  de: { after_food: "nach dem Essen", before_food: "vor dem Essen", with_food: "mit dem Essen", any: "" },
  it: { after_food: "dopo il cibo", before_food: "prima del cibo", with_food: "con il cibo", any: "" },
  ja: { after_food: "食後", before_food: "食前", with_food: "食事と一緒に", any: "" },
  ko: { after_food: "식후", before_food: "식전", with_food: "음식과 함께", any: "" },
  ru: { after_food: "после еды", before_food: "до еды", with_food: "с едой", any: "" },
  tr: { after_food: "yemekten sonra", before_food: "yemekten önce", with_food: "yemekle birlikte", any: "" },
  vi: { after_food: "sau khi ăn", before_food: "trước khi ăn", with_food: "cùng thức ăn", any: "" },
  th: { after_food: "หลังอาหาร", before_food: "ก่อนอาหาร", with_food: "พร้อมอาหาร", any: "" },
  fa: { after_food: "بعد از غذا", before_food: "قبل از غذا", with_food: "همراه غذا", any: "" },
  nl: { after_food: "na het eten", before_food: "voor het eten", with_food: "met eten", any: "" },
  pl: { after_food: "po jedzeniu", before_food: "przed jedzeniem", with_food: "z jedzeniem", any: "" },
};

function joinMeds(lines: string[], language: CallLanguage): string {
  if (lines.length <= 1) return lines[0] ?? "";
  const lastJoin: Record<CallLanguage, string> = {
    en: ", and ",
    hi: ", और ",
    es: " y ",
    bn: ", এবং ",
    ur: "، اور ",
    ta: " மற்றும் ",
    te: " మరియు ",
    mr: " आणि ",
    gu: " અને ",
    pa: " ਅਤੇ ",
    ar: "، و",
    fr: " et ",
    pt: " e ",
    zh: " 和 ",
    id: " dan ",
    ms: " dan ",
    sw: " na ",
    ha: " da ",
    yo: " àti ",
    af: " en ",
    am: " እና ",
    de: " und ",
    it: " e ",
    ja: " と ",
    ko: " 그리고 ",
    ru: " и ",
    tr: " ve ",
    vi: " và ",
    th: " และ ",
    fa: " و ",
    nl: " en ",
    pl: " i ",
  };
  return `${lines.slice(0, -1).join(", ")}${lastJoin[language]}${lines[lines.length - 1]}`;
}

export type ReminderScripts = {
  greetingMedlist: string;
  menu: string;
  thanks: string;
  goodbyeNoinput: string;
  goodbyeFinal: string;
};

const consult: Record<CallLanguage, string> = {
  en: "Confirm any medicine changes with your doctor or pharmacist.",
  hi: "दवाई में बदलाव से पहले डॉक्टर या फार्मासिस्ट से पूछें।",
  es: "Confirma cualquier cambio de medicina con tu médico o farmacéutico.",
  bn: "ওষুধে কোনো পরিবর্তন করার আগে আপনার ডাক্তার বা ফার্মাসিস্টের সঙ্গে কথা বলুন।",
  ur: "دوا میں کوئی تبدیلی کرنے سے پہلے اپنے ڈاکٹر یا فارماسسٹ سے مشورہ کریں۔",
  ta: "மருந்தில் மாற்றம் செய்ய முன் உங்கள் மருத்துவர் அல்லது மருந்தாளரிடம் உறுதிப்படுத்துங்கள்.",
  te: "మందులో ఏ మార్పైనా చేసే ముందు మీ డాక్టర్ లేదా ఫార్మసిస్టుతో మాట్లాడండి.",
  mr: "औषधात बदल करण्यापूर्वी डॉक्टर किंवा फार्मासिस्टशी बोला.",
  gu: "દવામાં કોઈ ફેરફાર કરતા પહેલાં તમારા ડૉક્ટર અથવા ફાર્માસિસ્ટ સાથે વાત કરો.",
  pa: "ਦਵਾਈ ਵਿੱਚ ਕੋਈ ਤਬਦੀਲੀ ਕਰਨ ਤੋਂ ਪਹਿਲਾਂ ਆਪਣੇ ਡਾਕਟਰ ਜਾਂ ਫਾਰਮਾਸਿਸਟ ਨਾਲ ਗੱਲ ਕਰੋ.",
  ar: "قبل تغيير أي دواء، استشر طبيبك أو الصيدلي.",
  fr: "Confirmez tout changement de médicament avec votre médecin ou votre pharmacien.",
  pt: "Confirme qualquer mudança de medicamento com o seu médico ou farmacêutico.",
  zh: "更改任何药物前，请先咨询医生或药剂师。",
  id: "Konfirmasi perubahan obat apa pun dengan dokter atau apoteker Anda.",
  ms: "Sahkan sebarang perubahan ubat dengan doktor atau ahli farmasi anda.",
  sw: "Thibitisha mabadiliko yoyote ya dawa na daktari au mfamasia wako.",
  ha: "Kafin canza wani magani, ka ko ki tuntubi likita ko mai harhada magani.",
  yo: "Ṣaaju ki o to yi oogun eyikeyi pada, ba dokita tabi oloogun sọrọ.",
  af: "Bevestig enige verandering aan medisyne met jou dokter of apteker.",
  am: "የመድሃኒት ለውጥ ከማድረግዎ በፊት ከሐኪምዎ ወይም ከፋርማሲስትዎ ጋር ይነጋገሩ።",
  de: "Bestätigen Sie jede Änderung Ihrer Medikamente mit Ihrem Arzt oder Apotheker.",
  it: "Conferma ogni cambiamento dei farmaci con il medico o il farmacista.",
  ja: "薬を変更する前に、医師または薬剤師に確認してください。",
  ko: "약을 변경하기 전에 의사나 약사와 확인하세요.",
  ru: "Перед любым изменением лекарств посоветуйтесь с врачом или фармацевтом.",
  tr: "Herhangi bir ilaç değişikliğini doktorunuz veya eczacınızla teyit edin.",
  vi: "Hãy xác nhận mọi thay đổi thuốc với bác sĩ hoặc dược sĩ của bạn.",
  th: "ก่อนเปลี่ยนยาใด ๆ โปรดปรึกษาแพทย์หรือเภสัชกรของคุณ.",
  fa: "قبل از هر تغییر در دارو، با پزشک یا داروساز خود مشورت کنید.",
  nl: "Bespreek elke medicijnwijziging met uw arts of apotheker.",
  pl: "Każdą zmianę leku potwierdź z lekarzem lub farmaceutą.",
};

function scriptsFor(
  language: CallLanguage,
  name: string,
  slot: string,
  medicineLines: string,
  food: string,
  caregiverName?: string,
): ReminderScripts {
  const foodClause = food ? `, ${food}` : "";
  const caregiver = caregiverName ?? "";

  switch (language) {
    case "hi":
      return {
        greetingMedlist: `नमस्ते ${name} जी। मैं दवाई साथी बोल रही हूँ। ${slot} की दवाई का समय हो गया है। कृपया अभी लें — ${medicineLines}${foodClause}।`,
        menu: "दवाई लेने के बाद 1 दबाएँ। दोबारा सुनने के लिए 2 दबाएँ।",
        thanks: `बहुत बढ़िया, ${name} जी! आपकी दवाई दर्ज हो गई है। ${consult.hi} अपना ध्यान रखिए। नमस्ते।`,
        goodbyeNoinput: `कोई बात नहीं। दवाई ज़रूर ले लीजिएगा। ${consult.hi} हम थोड़ी देर में फिर फ़ोन करेंगे। नमस्ते।`,
        goodbyeFinal: caregiver
          ? `कृपया दवाई ले लीजिएगा और ${caregiver} को बता दीजिएगा। ${consult.hi} नमस्ते।`
          : `कृपया दवाई ले लीजिएगा। ${consult.hi} नमस्ते।`,
      };
    case "bn":
      return {
        greetingMedlist: `নমস্কার ${name}। আমি দাওয়াইসাথী বলছি। ${slot} ওষুধের সময় হয়েছে। অনুগ্রহ করে এখন নিন — ${medicineLines}${foodClause}।`,
        menu: "ওষুধ নেওয়ার পরে 1 চাপুন। আবার শুনতে 2 চাপুন।",
        thanks: `ভালো হয়েছে, ${name}! আপনার ওষুধ নেওয়া নথিভুক্ত হয়েছে। ${consult.bn} বিদায়।`,
        goodbyeNoinput: `কোনো সমস্যা নেই। অনুগ্রহ করে ওষুধ নিন। ${consult.bn} আমরা কিছুক্ষণ পরে আবার ফোন করব। বিদায়।`,
        goodbyeFinal: caregiver
          ? `অনুগ্রহ করে ওষুধ নিন এবং ${caregiver} কে জানান। ${consult.bn} বিদায়।`
          : `অনুগ্রহ করে ওষুধ নিন। ${consult.bn} বিদায়।`,
      };
    case "ur":
      return {
        greetingMedlist: `السلام علیکم ${name}. یہ DawaiSaathi ہے۔ ${slot} کی دوائیوں کا وقت ہو گیا ہے۔ براہ کرم ابھی لیں — ${medicineLines}${foodClause}۔`,
        menu: "دوائیاں لینے کے بعد 1 دبائیں۔ دوبارہ سننے کے لیے 2 دبائیں۔",
        thanks: `بہت اچھا، ${name}. آپ کی خوراک درج ہو گئی ہے۔ ${consult.ur} خدا حافظ۔`,
        goodbyeNoinput: `کوئی بات نہیں۔ براہ کرم اپنی دوائیاں لے لیں۔ ${consult.ur} ہم جلد دوبارہ کال کریں گے۔ خدا حافظ۔`,
        goodbyeFinal: caregiver
          ? `براہ کرم اپنی دوائیاں لے لیں اور ${caregiver} کو بتا دیں۔ ${consult.ur} خدا حافظ۔`
          : `براہ کرم اپنی دوائیاں لے لیں۔ ${consult.ur} خدا حافظ۔`,
      };
    case "ta":
      return {
        greetingMedlist: `வணக்கம் ${name}. இது DawaiSaathi. உங்கள் ${slot} மருந்துகளுக்கான நேரம். தயவுசெய்து இப்போது எடுத்துக்கொள்ளுங்கள் — ${medicineLines}${foodClause}.`,
        menu: "மருந்துகளை எடுத்த பின் 1 ஐ அழுத்துங்கள். மீண்டும் கேட்க 2 ஐ அழுத்துங்கள்.",
        thanks: `நன்றாக செய்தீர்கள், ${name}. உங்கள் மருந்து எடுத்தது பதிவு செய்யப்பட்டது. ${consult.ta} வணக்கம்.`,
        goodbyeNoinput: `பரவாயில்லை. தயவுசெய்து உங்கள் மருந்துகளை எடுத்துக்கொள்ளுங்கள். ${consult.ta} விரைவில் மீண்டும் அழைப்போம். வணக்கம்.`,
        goodbyeFinal: caregiver
          ? `தயவுசெய்து உங்கள் மருந்துகளை எடுத்துக்கொண்டு ${caregiver}க்கு தெரிவியுங்கள். ${consult.ta} வணக்கம்.`
          : `தயவுசெய்து உங்கள் மருந்துகளை எடுத்துக்கொள்ளுங்கள். ${consult.ta} வணக்கம்.`,
      };
    case "te":
      return {
        greetingMedlist: `నమస్కారం ${name}. ఇది DawaiSaathi. మీ ${slot} మందుల సమయం వచ్చింది. దయచేసి ఇప్పుడు తీసుకోండి — ${medicineLines}${foodClause}.`,
        menu: "మందులు తీసుకున్న తర్వాత 1 నొక్కండి. మళ్లీ వినడానికి 2 నొక్కండి.",
        thanks: `బాగా చేశారు, ${name}. మీ మోతాదు నమోదు అయింది. ${consult.te} నమస్కారం.`,
        goodbyeNoinput: `పరవాలేదు. దయచేసి మీ మందులు తీసుకోండి. ${consult.te} మేము కొద్దిసేపట్లో మళ్లీ కాల్ చేస్తాము. నమస్కారం.`,
        goodbyeFinal: caregiver
          ? `దయచేసి మీ మందులు తీసుకుని ${caregiver}కి చెప్పండి. ${consult.te} నమస్కారం.`
          : `దయచేసి మీ మందులు తీసుకోండి. ${consult.te} నమస్కారం.`,
      };
    case "mr":
      return {
        greetingMedlist: `नमस्कार ${name}. हे DawaiSaathi आहे. तुमच्या ${slot} औषधांची वेळ झाली आहे. कृपया आत्ताच घ्या — ${medicineLines}${foodClause}.`,
        menu: "औषधे घेतल्यानंतर 1 दाबा. पुन्हा ऐकण्यासाठी 2 दाबा.",
        thanks: `छान, ${name}. तुमची मात्रा नोंदली गेली आहे. ${consult.mr} नमस्कार.`,
        goodbyeNoinput: `काही हरकत नाही. कृपया औषधे घ्या. ${consult.mr} आम्ही थोड्या वेळाने पुन्हा फोन करू. नमस्कार.`,
        goodbyeFinal: caregiver
          ? `कृपया औषधे घ्या आणि ${caregiver}ला कळवा. ${consult.mr} नमस्कार.`
          : `कृपया औषधे घ्या. ${consult.mr} नमस्कार.`,
      };
    case "gu":
      return {
        greetingMedlist: `નમસ્તે ${name}. આ DawaiSaathi છે. તમારી ${slot} દવાઓનો સમય થયો છે. કૃપા કરીને હવે લો — ${medicineLines}${foodClause}.`,
        menu: "દવાઓ લીધા પછી 1 દબાવો. ફરી સાંભળવા માટે 2 દબાવો.",
        thanks: `સરસ, ${name}. તમારી દવા લીધાની નોંધ થઈ ગઈ છે. ${consult.gu} આવજો.`,
        goodbyeNoinput: `કોઈ વાંધો નહીં. કૃપા કરીને તમારી દવાઓ લો. ${consult.gu} અમે થોડા સમય પછી ફરી ફોન કરીશું. આવજો.`,
        goodbyeFinal: caregiver
          ? `કૃપા કરીને તમારી દવાઓ લો અને ${caregiver}ને જાણ કરો. ${consult.gu} આવજો.`
          : `કૃપા કરીને તમારી દવાઓ લો. ${consult.gu} આવજો.`,
      };
    case "pa":
      return {
        greetingMedlist: `ਸਤ ਸ੍ਰੀ ਅਕਾਲ ${name}. ਇਹ DawaiSaathi ਹੈ। ਤੁਹਾਡੀਆਂ ${slot} ਦਵਾਈਆਂ ਦਾ ਸਮਾਂ ਹੋ ਗਿਆ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਹੁਣ ਲਓ — ${medicineLines}${foodClause}।`,
        menu: "ਦਵਾਈਆਂ ਲੈਣ ਤੋਂ ਬਾਅਦ 1 ਦਬਾਓ। ਦੁਬਾਰਾ ਸੁਣਨ ਲਈ 2 ਦਬਾਓ।",
        thanks: `ਬਹੁਤ ਵਧੀਆ, ${name}. ਤੁਹਾਡੀ ਖੁਰਾਕ ਦਰਜ ਹੋ ਗਈ ਹੈ। ${consult.pa} ਅਲਵਿਦਾ।`,
        goodbyeNoinput: `ਕੋਈ ਗੱਲ ਨਹੀਂ। ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੀਆਂ ਦਵਾਈਆਂ ਲੈ ਲਓ। ${consult.pa} ਅਸੀਂ ਜਲਦੀ ਦੁਬਾਰਾ ਕਾਲ ਕਰਾਂਗੇ। ਅਲਵਿਦਾ।`,
        goodbyeFinal: caregiver
          ? `ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੀਆਂ ਦਵਾਈਆਂ ਲੈ ਲਓ ਅਤੇ ${caregiver}ਨੂੰ ਦੱਸ ਦਿਓ। ${consult.pa} ਅਲਵਿਦਾ।`
          : `ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੀਆਂ ਦਵਾਈਆਂ ਲੈ ਲਓ। ${consult.pa} ਅਲਵਿਦਾ।`,
      };
    case "ar":
      return {
        greetingMedlist: `مرحباً ${name}. هذا دَواي ساتهي. حان وقت أدوية ${slot}. يرجى تناول ${medicineLines}${foodClause}.`,
        menu: "بعد تناول أدويتك، اضغط 1. لإعادة الاستماع، اضغط 2.",
        thanks: `أحسنت، ${name}. تم تسجيل جرعتك. ${consult.ar} إلى اللقاء.`,
        goodbyeNoinput: `لا بأس. يرجى تناول أدويتك. ${consult.ar} سنتصل بك مرة أخرى قريباً. إلى اللقاء.`,
        goodbyeFinal: caregiver
          ? `يرجى تناول أدويتك وأخبر ${caregiver}. ${consult.ar} إلى اللقاء.`
          : `يرجى تناول أدويتك. ${consult.ar} إلى اللقاء.`,
      };
    case "fr":
      return {
        greetingMedlist: `Bonjour ${name}, ici DawaiSaathi. C'est l'heure de vos médicaments du ${slot}. Veuillez prendre ${medicineLines}${foodClause}.`,
        menu: "Après avoir pris vos médicaments, appuyez sur 1. Pour réécouter, appuyez sur 2.",
        thanks: `Très bien, ${name}. Votre prise est enregistrée. ${consult.fr} Au revoir.`,
        goodbyeNoinput: `Ce n'est pas grave. Prenez bien vos médicaments. ${consult.fr} Nous vous appellerons de nouveau bientôt. Au revoir.`,
        goodbyeFinal: caregiver
          ? `Prenez vos médicaments et prévenez ${caregiver}. ${consult.fr} Au revoir.`
          : `Prenez vos médicaments. ${consult.fr} Au revoir.`,
      };
    case "pt":
      return {
        greetingMedlist: `Olá ${name}, aqui é o DawaiSaathi. Está na hora dos seus medicamentos da ${slot}. Por favor, tome ${medicineLines}${foodClause}.`,
        menu: "Depois de tomar os seus medicamentos, prima 1. Para ouvir novamente, prima 2.",
        thanks: `Muito bem, ${name}. A sua dose foi registada. ${consult.pt} Adeus.`,
        goodbyeNoinput: `Está tudo bem. Por favor, tome os seus medicamentos. ${consult.pt} Ligaremos novamente em breve. Adeus.`,
        goodbyeFinal: caregiver
          ? `Tome os seus medicamentos e avise ${caregiver}. ${consult.pt} Adeus.`
          : `Tome os seus medicamentos. ${consult.pt} Adeus.`,
      };
    case "zh":
      return {
        greetingMedlist: `你好 ${name}，这里是 DawaiSaathi。现在是你${slot}服药的时间。请现在服用 — ${medicineLines}${foodClause}。`,
        menu: "服药后，请按 1。要再听一遍，请按 2。",
        thanks: `很好，${name}。你的服药记录已保存。${consult.zh} 再见。`,
        goodbyeNoinput: `没关系。请记得服药。${consult.zh} 我们稍后会再打电话。再见。`,
        goodbyeFinal: caregiver
          ? `请服药，并告诉 ${caregiver}。${consult.zh} 再见。`
          : `请服药。${consult.zh} 再见。`,
      };
    case "id":
      return {
        greetingMedlist: `Halo ${name}, ini DawaiSaathi. Sekarang waktunya obat ${slot} Anda. Silakan minum — ${medicineLines}${foodClause}.`,
        menu: "Setelah minum obat, tekan 1. Untuk mendengar lagi, tekan 2.",
        thanks: `Bagus, ${name}. Dosis Anda sudah dicatat. ${consult.id} Sampai jumpa.`,
        goodbyeNoinput: `Tidak apa-apa. Silakan minum obat Anda. ${consult.id} Kami akan menelepon lagi sebentar lagi. Sampai jumpa.`,
        goodbyeFinal: caregiver
          ? `Silakan minum obat Anda dan beri tahu ${caregiver}. ${consult.id} Sampai jumpa.`
          : `Silakan minum obat Anda. ${consult.id} Sampai jumpa.`,
      };
    case "ms":
      return {
        greetingMedlist: `Helo ${name}, ini DawaiSaathi. Sudah tiba masa untuk ubat ${slot} anda. Sila ambil — ${medicineLines}${foodClause}.`,
        menu: "Selepas mengambil ubat, tekan 1. Untuk mendengar semula, tekan 2.",
        thanks: `Bagus, ${name}. Dos anda telah direkodkan. ${consult.ms} Selamat tinggal.`,
        goodbyeNoinput: `Tidak mengapa. Sila ambil ubat anda. ${consult.ms} Kami akan menelefon lagi sebentar lagi. Selamat tinggal.`,
        goodbyeFinal: caregiver
          ? `Sila ambil ubat anda dan beritahu ${caregiver}. ${consult.ms} Selamat tinggal.`
          : `Sila ambil ubat anda. ${consult.ms} Selamat tinggal.`,
      };
    case "af":
      return {
        greetingMedlist: `Hallo ${name}, dit is DawaiSaathi. Dit is tyd vir jou ${slot}-medisyne. Neem asseblief ${medicineLines}${foodClause}.`,
        menu: "Nadat jy jou medisyne geneem het, druk 1. Om weer te luister, druk 2.",
        thanks: `Goed gedaan, ${name}. Jou dosis is aangeteken. ${consult.af} Totsiens.`,
        goodbyeNoinput: `Dis reg. Neem asseblief jou medisyne. ${consult.af} Ons sal jou binnekort weer bel. Totsiens.`,
        goodbyeFinal: caregiver
          ? `Neem asseblief jou medisyne en laat ${caregiver} weet. ${consult.af} Totsiens.`
          : `Neem asseblief jou medisyne. ${consult.af} Totsiens.`,
      };
    case "am":
      return {
        greetingMedlist: `ሰላም ${name}። ይህ DawaiSaathi ነው። የ${slot} መድሃኒትዎ ጊዜ ደርሷል። እባክዎ ${medicineLines}${foodClause} ይውሰዱ።`,
        menu: "መድሃኒትዎን ከወሰዱ በኋላ 1 ይጫኑ። እንደገና ለመስማት 2 ይጫኑ።",
        thanks: `በጣም ጥሩ፣ ${name}። መጠንዎ ተመዝግቧል። ${consult.am} ደህና ይቆዩ።`,
        goodbyeNoinput: `ችግር የለም። እባክዎ መድሃኒትዎን ይውሰዱ። ${consult.am} በቅርቡ እንደገና እንደውልልዎታለን።`,
        goodbyeFinal: caregiver
          ? `እባክዎ መድሃኒትዎን ይውሰዱ እና ${caregiver}ን ያሳውቁ። ${consult.am}`
          : `እባክዎ መድሃኒትዎን ይውሰዱ። ${consult.am}`,
      };
    case "de":
      return {
        greetingMedlist: `Hallo ${name}, hier ist DawaiSaathi. Es ist Zeit für Ihre ${slot}-Medikamente. Bitte nehmen Sie — ${medicineLines}${foodClause}.`,
        menu: "Nachdem Sie Ihre Medikamente genommen haben, drücken Sie 1. Um die Liste erneut zu hören, drücken Sie 2.",
        thanks: `Sehr gut, ${name}. Ihre Dosis wurde gespeichert. ${consult.de} Auf Wiederhören.`,
        goodbyeNoinput: `In Ordnung. Bitte nehmen Sie Ihre Medikamente. ${consult.de} Wir rufen bald wieder an. Auf Wiederhören.`,
        goodbyeFinal: caregiver
          ? `Bitte nehmen Sie Ihre Medikamente und informieren Sie ${caregiver}. ${consult.de} Auf Wiederhören.`
          : `Bitte nehmen Sie Ihre Medikamente. ${consult.de} Auf Wiederhören.`,
      };
    case "it":
      return {
        greetingMedlist: `Ciao ${name}, sono DawaiSaathi. È ora delle tue medicine del ${slot}. Per favore prendi — ${medicineLines}${foodClause}.`,
        menu: "Dopo aver preso le medicine, premi 1. Per ascoltare di nuovo, premi 2.",
        thanks: `Molto bene, ${name}. La tua dose è stata registrata. ${consult.it} Arrivederci.`,
        goodbyeNoinput: `Va bene. Per favore prendi le tue medicine. ${consult.it} Ti chiameremo di nuovo tra poco. Arrivederci.`,
        goodbyeFinal: caregiver
          ? `Per favore prendi le tue medicine e avvisa ${caregiver}. ${consult.it} Arrivederci.`
          : `Per favore prendi le tue medicine. ${consult.it} Arrivederci.`,
      };
    case "ja":
      return {
        greetingMedlist: `こんにちは ${name}さん。DawaiSaathiです。${slot}のお薬の時間です。今お飲みください — ${medicineLines}${foodClause}。`,
        menu: "お薬を飲んだら1を押してください。もう一度聞くには2を押してください。",
        thanks: `よくできました、${name}さん。服薬を記録しました。${consult.ja} さようなら。`,
        goodbyeNoinput: `大丈夫です。お薬を飲んでください。${consult.ja} まもなくまたお電話します。さようなら。`,
        goodbyeFinal: caregiver
          ? `お薬を飲んで、${caregiver}さんに知らせてください。${consult.ja} さようなら。`
          : `お薬を飲んでください。${consult.ja} さようなら。`,
      };
    case "ko":
      return {
        greetingMedlist: `안녕하세요 ${name}님, DawaiSaathi입니다. ${slot} 약을 드실 시간입니다. 지금 복용하세요 — ${medicineLines}${foodClause}.`,
        menu: "약을 드신 후 1번을 누르세요. 다시 들으려면 2번을 누르세요.",
        thanks: `잘하셨어요, ${name}님. 복용이 기록되었습니다. ${consult.ko} 안녕히 계세요.`,
        goodbyeNoinput: `괜찮습니다. 약을 꼭 드세요. ${consult.ko} 잠시 후 다시 전화드리겠습니다. 안녕히 계세요.`,
        goodbyeFinal: caregiver
          ? `약을 드시고 ${caregiver}에게 알려 주세요. ${consult.ko} 안녕히 계세요.`
          : `약을 드세요. ${consult.ko} 안녕히 계세요.`,
      };
    case "ru":
      return {
        greetingMedlist: `Здравствуйте, ${name}. Это DawaiSaathi. Пора принять ваши лекарства на ${slot}. Пожалуйста, примите — ${medicineLines}${foodClause}.`,
        menu: "После приема лекарств нажмите 1. Чтобы прослушать снова, нажмите 2.",
        thanks: `Хорошо, ${name}. Прием лекарства записан. ${consult.ru} До свидания.`,
        goodbyeNoinput: `Ничего страшного. Пожалуйста, примите лекарства. ${consult.ru} Мы скоро позвоним еще раз. До свидания.`,
        goodbyeFinal: caregiver
          ? `Пожалуйста, примите лекарства и сообщите ${caregiver}. ${consult.ru} До свидания.`
          : `Пожалуйста, примите лекарства. ${consult.ru} До свидания.`,
      };
    case "tr":
      return {
        greetingMedlist: `Merhaba ${name}, ben DawaiSaathi. ${slot} ilaçlarınızın zamanı geldi. Lütfen şimdi alın — ${medicineLines}${foodClause}.`,
        menu: "İlaçlarınızı aldıktan sonra 1'e basın. Tekrar dinlemek için 2'ye basın.",
        thanks: `Çok iyi, ${name}. Dozunuz kaydedildi. ${consult.tr} Hoşça kalın.`,
        goodbyeNoinput: `Sorun değil. Lütfen ilaçlarınızı alın. ${consult.tr} Kısa süre sonra tekrar arayacağız. Hoşça kalın.`,
        goodbyeFinal: caregiver
          ? `Lütfen ilaçlarınızı alın ve ${caregiver} kişisine haber verin. ${consult.tr} Hoşça kalın.`
          : `Lütfen ilaçlarınızı alın. ${consult.tr} Hoşça kalın.`,
      };
    case "vi":
      return {
        greetingMedlist: `Xin chào ${name}, đây là DawaiSaathi. Đã đến giờ dùng thuốc ${slot} của bạn. Vui lòng dùng — ${medicineLines}${foodClause}.`,
        menu: "Sau khi uống thuốc, bấm 1. Để nghe lại, bấm 2.",
        thanks: `Rất tốt, ${name}. Liều thuốc của bạn đã được ghi nhận. ${consult.vi} Tạm biệt.`,
        goodbyeNoinput: `Không sao. Vui lòng dùng thuốc của bạn. ${consult.vi} Chúng tôi sẽ gọi lại sớm. Tạm biệt.`,
        goodbyeFinal: caregiver
          ? `Vui lòng dùng thuốc và báo cho ${caregiver}. ${consult.vi} Tạm biệt.`
          : `Vui lòng dùng thuốc của bạn. ${consult.vi} Tạm biệt.`,
      };
    case "th":
      return {
        greetingMedlist: `สวัสดี ${name} นี่คือ DawaiSaathi ถึงเวลายา${slot}ของคุณแล้ว โปรดรับประทาน — ${medicineLines}${foodClause}`,
        menu: "หลังจากรับประทานยาแล้ว กด 1 หากต้องการฟังอีกครั้ง กด 2",
        thanks: `ดีมาก ${name} บันทึกการรับประทานยาของคุณแล้ว ${consult.th} ลาก่อน`,
        goodbyeNoinput: `ไม่เป็นไร โปรดรับประทานยาของคุณ ${consult.th} เราจะโทรอีกครั้งในไม่ช้า ลาก่อน`,
        goodbyeFinal: caregiver
          ? `โปรดรับประทานยาและแจ้ง ${caregiver} ${consult.th} ลาก่อน`
          : `โปรดรับประทานยาของคุณ ${consult.th} ลาก่อน`,
      };
    case "fa":
      return {
        greetingMedlist: `سلام ${name}. این DawaiSaathi است. وقت داروهای ${slot} شماست. لطفاً اکنون مصرف کنید — ${medicineLines}${foodClause}.`,
        menu: "بعد از مصرف داروها، 1 را فشار دهید. برای شنیدن دوباره، 2 را فشار دهید.",
        thanks: `خیلی خوب، ${name}. دوز شما ثبت شد. ${consult.fa} خداحافظ.`,
        goodbyeNoinput: `اشکالی ندارد. لطفاً داروهای خود را مصرف کنید. ${consult.fa} به‌زودی دوباره تماس می‌گیریم. خداحافظ.`,
        goodbyeFinal: caregiver
          ? `لطفاً داروهای خود را مصرف کنید و به ${caregiver} اطلاع دهید. ${consult.fa} خداحافظ.`
          : `لطفاً داروهای خود را مصرف کنید. ${consult.fa} خداحافظ.`,
      };
    case "nl":
      return {
        greetingMedlist: `Hallo ${name}, dit is DawaiSaathi. Het is tijd voor uw ${slot}-medicijnen. Neem alstublieft — ${medicineLines}${foodClause}.`,
        menu: "Druk op 1 nadat u uw medicijnen hebt genomen. Druk op 2 om opnieuw te luisteren.",
        thanks: `Goed gedaan, ${name}. Uw dosis is vastgelegd. ${consult.nl} Tot ziens.`,
        goodbyeNoinput: `Geen probleem. Neem alstublieft uw medicijnen. ${consult.nl} We bellen u binnenkort opnieuw. Tot ziens.`,
        goodbyeFinal: caregiver
          ? `Neem alstublieft uw medicijnen en laat ${caregiver} het weten. ${consult.nl} Tot ziens.`
          : `Neem alstublieft uw medicijnen. ${consult.nl} Tot ziens.`,
      };
    case "pl":
      return {
        greetingMedlist: `Dzień dobry ${name}, tu DawaiSaathi. Czas na leki na ${slot}. Proszę przyjąć — ${medicineLines}${foodClause}.`,
        menu: "Po przyjęciu leków naciśnij 1. Aby odsłuchać ponownie, naciśnij 2.",
        thanks: `Dobrze, ${name}. Dawka została zapisana. ${consult.pl} Do widzenia.`,
        goodbyeNoinput: `W porządku. Proszę przyjąć leki. ${consult.pl} Wkrótce zadzwonimy ponownie. Do widzenia.`,
        goodbyeFinal: caregiver
          ? `Proszę przyjąć leki i poinformować ${caregiver}. ${consult.pl} Do widzenia.`
          : `Proszę przyjąć leki. ${consult.pl} Do widzenia.`,
      };
    case "sw":
      return {
        greetingMedlist: `Habari ${name}. Huyu ni DawaiSaathi. Ni wakati wa dawa zako za ${slot}. Tafadhali tumia ${medicineLines}${foodClause}.`,
        menu: "Baada ya kutumia dawa zako, bonyeza 1. Kusikia tena, bonyeza 2.",
        thanks: `Vizuri, ${name}. Dozi yako imerekodiwa. ${consult.sw} Kwaheri.`,
        goodbyeNoinput: `Sawa. Tafadhali tumia dawa zako. ${consult.sw} Tutakupigia tena hivi karibuni. Kwaheri.`,
        goodbyeFinal: caregiver
          ? `Tafadhali tumia dawa zako na umjulishe ${caregiver}. ${consult.sw} Kwaheri.`
          : `Tafadhali tumia dawa zako. ${consult.sw} Kwaheri.`,
      };
    case "ha":
      return {
        greetingMedlist: `Sannu ${name}. Wannan DawaiSaathi ne. Lokacin shan maganin ${slot} ya yi. Don Allah ka ko ki sha ${medicineLines}${foodClause}.`,
        menu: "Bayan ka ko ki sha magungunanka, danna 1. Don sake ji, danna 2.",
        thanks: `Da kyau, ${name}. An rubuta cewa ka ko ki sha maganin. ${consult.ha} Sai an jima.`,
        goodbyeNoinput: `Ba komai. Don Allah ka ko ki sha magungunanka. ${consult.ha} Za mu sake kira nan ba da daɗewa ba. Sai an jima.`,
        goodbyeFinal: caregiver
          ? `Don Allah ka ko ki sha magungunanka kuma ka ko ki sanar da ${caregiver}. ${consult.ha} Sai an jima.`
          : `Don Allah ka ko ki sha magungunanka. ${consult.ha} Sai an jima.`,
      };
    case "yo":
      return {
        greetingMedlist: `Báwo ni ${name}. DawaiSaathi ni èyí. Ó ti tó àkókò oogun ${slot} rẹ. Jọ̀wọ́ mu ${medicineLines}${foodClause}.`,
        menu: "Lẹ́yìn tí o ti mu oogun rẹ, tẹ 1. Láti gbọ́ lẹ́ẹ̀kansi, tẹ 2.",
        thanks: `Ó dára, ${name}. A ti forúkọsílẹ̀ ìwọ̀n oogun rẹ. ${consult.yo} Ó dàbọ̀.`,
        goodbyeNoinput: `Kò burú. Jọ̀wọ́ mu oogun rẹ. ${consult.yo} A máa pè ọ́ lẹ́ẹ̀kansi láìpẹ́. Ó dàbọ̀.`,
        goodbyeFinal: caregiver
          ? `Jọ̀wọ́ mu oogun rẹ kí o sì sọ fún ${caregiver}. ${consult.yo} Ó dàbọ̀.`
          : `Jọ̀wọ́ mu oogun rẹ. ${consult.yo} Ó dàbọ̀.`,
      };
    case "es":
      return {
        greetingMedlist: `Hola ${name}, soy DawaiSaathi. Es la hora de tus medicinas de la ${slot}. Por favor toma ${medicineLines}${foodClause}.`,
        menu: "Después de tomar tus medicinas, pulsa 1. Para escuchar de nuevo, pulsa 2.",
        thanks: `Muy bien, ${name}. Tu dosis ha quedado registrada. ${consult.es} Adiós.`,
        goodbyeNoinput: `No pasa nada. Por favor toma tus medicinas. ${consult.es} Te llamaremos de nuevo pronto. Adiós.`,
        goodbyeFinal: caregiver
          ? `Por favor toma tus medicinas y avisa a ${caregiver}. ${consult.es} Adiós.`
          : `Por favor toma tus medicinas. ${consult.es} Adiós.`,
      };
    case "en":
    default:
      return {
        greetingMedlist: `Hello ${name}, this is DawaiSaathi. It's time for your ${slot} medicines. Please take — ${medicineLines}${foodClause}.`,
        menu: "After taking your medicines, press 1. To hear the list again, press 2.",
        thanks: `Well done, ${name}! Your dose is recorded. ${consult.en} Take care. Goodbye.`,
        goodbyeNoinput: `That's alright. Please do take your medicines. ${consult.en} We will call again shortly. Goodbye.`,
        goodbyeFinal: caregiver
          ? `Please take your medicines and let ${caregiver} know. ${consult.en} Goodbye.`
          : `Please take your medicines. ${consult.en} Goodbye.`,
      };
  }
}

export function buildReminderScripts(input: ReminderScriptInput): ReminderScripts {
  const medicineLines = joinMeds(input.meds.map((med) => medLine(med)), input.language);
  return scriptsFor(
    input.language,
    input.patientName,
    slotLabel(input.time, input.language),
    medicineLines,
    FOOD[input.language][input.foodRelation],
    input.caregiverName,
  );
}

/** Static (medicine-independent) scripts for pre-generation. */
export function staticScripts(language: CallLanguage, patientName = ""): Record<string, string> {
  const scripts = buildReminderScripts({
    patientName,
    time: "08:00",
    meds: [],
    foodRelation: "any",
    language,
  });
  return {
    menu: scripts.menu,
    thanks: scripts.thanks,
    goodbyeNoinput: scripts.goodbyeNoinput,
  };
}
