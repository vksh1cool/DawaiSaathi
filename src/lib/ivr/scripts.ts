import { slotLabel } from "@/lib/util/dates";
import type { CallLanguage } from "@/lib/languages";
import type { FoodRelation, MedForm } from "@/types/domain";

/**
 * Short, deliberately repetitive reminder scripts. They never describe why a
 * medicine is prescribed and every language keeps the same safety instruction
 * to speak with a doctor or pharmacist before changing a medicine.
 */

export type ScriptMed = {
  brandName: string;
  count: number;
  form: MedForm;
  doseMl?: number | null;
};

export type ReminderScriptInput = {
  patientName: string;
  time: string; // "HH:mm"
  meds: ScriptMed[];
  foodRelation: FoodRelation;
  language: CallLanguage;
  caregiverName?: string;
};

const HINDI_NUMS = ["शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ", "दस"];
const BENGALI_NUMS = ["শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়", "দশ"];

function spokenNumber(count: number, language: CallLanguage): string {
  if (language === "hi") return HINDI_NUMS[count] ?? String(count);
  if (language === "bn") return BENGALI_NUMS[count] ?? String(count);
  return String(count);
}

function medLine(med: ScriptMed, language: CallLanguage): string {
  const count = spokenNumber(med.count, language);
  if (med.form === "syrup" || med.form === "drops") {
    const ml = spokenNumber(med.doseMl ?? 5, language);
    const liquid: Record<CallLanguage, string> = {
      en: `${ml} ml of ${med.brandName}`,
      hi: `${med.brandName} के ${ml} एम एल`,
      bn: `${med.brandName} এর ${ml} মিলি`,
      ar: `${ml} مل من ${med.brandName}`,
      fr: `${ml} ml de ${med.brandName}`,
      pt: `${ml} ml de ${med.brandName}`,
      af: `${ml} ml ${med.brandName}`,
      am: `${ml} ሚሊ ሊትር ${med.brandName}`,
      sw: `${ml} ml ya ${med.brandName}`,
      ha: `${ml} ml na ${med.brandName}`,
      yo: `${ml} ml ti ${med.brandName}`,
      es: `${ml} ml de ${med.brandName}`,
    };
    return liquid[language];
  }

  const tablets: Record<CallLanguage, string> = {
    en: `${count} tablet${med.count === 1 ? "" : "s"} of ${med.brandName}`,
    hi: `${med.brandName} की ${count} गोली`,
    bn: `${med.brandName} এর ${count} ট্যাবলেট`,
    ar: `${count} قرص من ${med.brandName}`,
    fr: `${count} comprimé${med.count === 1 ? "" : "s"} de ${med.brandName}`,
    pt: `${count} comprimido${med.count === 1 ? "" : "s"} de ${med.brandName}`,
    af: `${count} tablet${med.count === 1 ? "" : "te"} ${med.brandName}`,
    am: `${count} ጽላት ${med.brandName}`,
    sw: `kidonge ${count} cha ${med.brandName}`,
    ha: `ƙwaya ${count} ta ${med.brandName}`,
    yo: `tabulẹti ${count} ti ${med.brandName}`,
    es: `${count} tableta${med.count === 1 ? "" : "s"} de ${med.brandName}`,
  };
  return tablets[language];
}

const FOOD: Record<CallLanguage, Record<FoodRelation, string>> = {
  en: { after_food: "after food", before_food: "before food", with_food: "with food", any: "" },
  hi: { after_food: "खाने के बाद", before_food: "खाने से पहले", with_food: "खाने के साथ", any: "" },
  bn: { after_food: "খাবারের পরে", before_food: "খাবারের আগে", with_food: "খাবারের সঙ্গে", any: "" },
  ar: { after_food: "بعد الطعام", before_food: "قبل الطعام", with_food: "مع الطعام", any: "" },
  fr: { after_food: "après le repas", before_food: "avant le repas", with_food: "avec le repas", any: "" },
  pt: { after_food: "depois da comida", before_food: "antes da comida", with_food: "com a comida", any: "" },
  af: { after_food: "ná ete", before_food: "voor ete", with_food: "saam met ete", any: "" },
  am: { after_food: "ከምግብ በኋላ", before_food: "ከምግብ በፊት", with_food: "ከምግብ ጋር", any: "" },
  sw: { after_food: "baada ya chakula", before_food: "kabla ya chakula", with_food: "pamoja na chakula", any: "" },
  ha: { after_food: "bayan abinci", before_food: "kafin abinci", with_food: "tare da abinci", any: "" },
  yo: { after_food: "lẹ́yìn oúnjẹ", before_food: "ṣáájú oúnjẹ", with_food: "pẹ̀lú oúnjẹ", any: "" },
  es: { after_food: "después de comer", before_food: "antes de comer", with_food: "con comida", any: "" },
};

function joinMeds(lines: string[], language: CallLanguage): string {
  if (lines.length <= 1) return lines[0] ?? "";
  const lastJoin: Record<CallLanguage, string> = {
    en: ", and ",
    hi: ", और ",
    bn: ", এবং ",
    ar: "، و",
    fr: " et ",
    pt: " e ",
    af: " en ",
    am: " እና ",
    sw: " na ",
    ha: " da ",
    yo: " àti ",
    es: " y ",
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
  bn: "ওষুধে কোনো পরিবর্তন করার আগে আপনার ডাক্তার বা ফার্মাসিস্টের সঙ্গে কথা বলুন।",
  ar: "قبل تغيير أي دواء، استشر طبيبك أو الصيدلي.",
  fr: "Confirmez tout changement de médicament avec votre médecin ou votre pharmacien.",
  pt: "Confirme qualquer mudança de medicamento com o seu médico ou farmacêutico.",
  af: "Bevestig enige verandering aan medisyne met jou dokter of apteker.",
  am: "የመድሃኒት ለውጥ ከማድረግዎ በፊት ከሐኪምዎ ወይም ከፋርማሲስትዎ ጋር ይነጋገሩ።",
  sw: "Thibitisha mabadiliko yoyote ya dawa na daktari au mfamasia wako.",
  ha: "Kafin canza wani magani, ka ko ki tuntubi likita ko mai harhada magani.",
  yo: "Ṣaaju ki o to yi oogun eyikeyi pada, ba dokita tabi oloogun sọrọ.",
  es: "Confirma cualquier cambio de medicina con tu médico o farmacéutico.",
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
  const medicineLines = joinMeds(input.meds.map((med) => medLine(med, input.language)), input.language);
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
