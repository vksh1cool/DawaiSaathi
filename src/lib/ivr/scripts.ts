import { slotLabel } from "@/lib/util/dates";
import type { Language, FoodRelation, MedForm } from "@/types/domain";

/**
 * Verbatim IVR scripts (02-DESIGN §7.2). Numbers are spoken as words in Hindi.
 * The system never states a medicine's indication/disease (PRD §9.6).
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
  language: Language;
  caregiverName?: string;
};

const HINDI_NUMS = ["शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ", "दस"];
const hiNum = (n: number) => HINDI_NUMS[n] ?? String(n);

function medLine(m: ScriptMed, lang: Language): string {
  if (m.form === "syrup" || m.form === "drops") {
    const ml = m.doseMl ?? 5;
    return lang === "hi" ? `${m.brandName} ${hiNum(ml)} एम एल` : `${ml} ml of ${m.brandName}`;
  }
  return lang === "hi"
    ? `${m.brandName} की ${hiNum(m.count)} गोली`
    : `${m.count} tablet${m.count === 1 ? "" : "s"} of ${m.brandName}`;
}

function foodSuffix(rel: FoodRelation, lang: Language): string {
  const hi: Record<FoodRelation, string> = {
    after_food: "खाने के बाद",
    before_food: "खाने से पहले",
    with_food: "खाने के साथ",
    any: "",
  };
  const en: Record<FoodRelation, string> = {
    after_food: "after food",
    before_food: "before food",
    with_food: "with food",
    any: "",
  };
  return (lang === "hi" ? hi : en)[rel];
}

function joinMeds(lines: string[], lang: Language): string {
  if (lines.length <= 1) return lines[0] ?? "";
  const sep = lang === "hi" ? ", और " : ", ";
  return lines.slice(0, -1).join(", ") + sep + lines[lines.length - 1];
}

export type ReminderScripts = {
  greetingMedlist: string;
  menu: string;
  thanks: string;
  goodbyeNoinput: string;
  goodbyeFinal: string;
};

export function buildReminderScripts(input: ReminderScriptInput): ReminderScripts {
  const { patientName: name, time, meds, foodRelation, language, caregiverName } = input;
  const lbl = slotLabel(time, language);
  const medLines = joinMeds(meds.map((m) => medLine(m, language)), language);
  const food = foodSuffix(foodRelation, language);

  if (language === "hi") {
    const foodClause = food ? `, ${food}` : "";
    return {
      greetingMedlist: `नमस्ते ${name} जी। मैं दवाई साथी बोल रही हूँ। ${lbl} की दवाई का समय हो गया है। कृपया अभी लें — ${medLines}${foodClause}।`,
      menu: `दवाई लेने के बाद 1 दबाएँ। दोबारा सुनने के लिए 2 दबाएँ।`,
      thanks: `बहुत बढ़िया, ${name} जी! आपकी दवाई दर्ज हो गई है। अपना ध्यान रखिए। नमस्ते।`,
      goodbyeNoinput: `कोई बात नहीं। दवाई ज़रूर ले लीजिएगा। हम थोड़ी देर में फिर फ़ोन करेंगे। नमस्ते।`,
      goodbyeFinal: caregiverName
        ? `कृपया दवाई ले लीजिएगा और ${caregiverName} को बता दीजिएगा। नमस्ते।`
        : `कृपया दवाई ले लीजिएगा। नमस्ते।`,
    };
  }

  const foodClause = food ? `, ${food}` : "";
  return {
    greetingMedlist: `Hello ${name}, this is DawaiSaathi. It's time for your ${lbl} medicines. Please take — ${medLines}${foodClause}.`,
    menu: `After taking your medicines, press 1. To hear the list again, press 2.`,
    thanks: `Well done, ${name}! Your dose is recorded. Take care. Goodbye.`,
    goodbyeNoinput: `That's alright. Please do take your medicines. We will call again shortly. Goodbye.`,
    goodbyeFinal: caregiverName
      ? `Please take your medicines and let ${caregiverName} know. Goodbye.`
      : `Please take your medicines. Goodbye.`,
  };
}

/** Static (medicine-independent) scripts for pre-generation. */
export function staticScripts(language: Language, patientName = ""): Record<string, string> {
  const s = buildReminderScripts({
    patientName,
    time: "08:00",
    meds: [],
    foodRelation: "any",
    language,
  });
  return {
    menu: s.menu,
    thanks: s.thanks,
    goodbyeNoinput: s.goodbyeNoinput,
  };
}
