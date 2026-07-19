/**
 * Phone entry is global but stays friendly for people who know their local
 * number better than E.164. The selected country code is only a formatting
 * aid; the server always receives a validated E.164 number.
 */

export const DIALING_REGIONS = [
  { code: "IN", name: "India", dialCode: "91", trunkPrefix: "0", example: "98765 43210" },
  { code: "US", name: "United States", dialCode: "1", trunkPrefix: null, example: "202 555 0123" },
  { code: "CA", name: "Canada", dialCode: "1", trunkPrefix: null, example: "416 555 0123" },
  { code: "GB", name: "United Kingdom", dialCode: "44", trunkPrefix: "0", example: "7123 456789" },
  { code: "PK", name: "Pakistan", dialCode: "92", trunkPrefix: "0", example: "301 2345678" },
  { code: "BD", name: "Bangladesh", dialCode: "880", trunkPrefix: "0", example: "1712 345678" },
  { code: "LK", name: "Sri Lanka", dialCode: "94", trunkPrefix: "0", example: "71 234 5678" },
  { code: "NP", name: "Nepal", dialCode: "977", trunkPrefix: "0", example: "984 1234567" },
  { code: "AE", name: "United Arab Emirates", dialCode: "971", trunkPrefix: "0", example: "50 123 4567" },
  { code: "SG", name: "Singapore", dialCode: "65", trunkPrefix: null, example: "8123 4567" },
  { code: "MY", name: "Malaysia", dialCode: "60", trunkPrefix: "0", example: "12 345 6789" },
  { code: "ID", name: "Indonesia", dialCode: "62", trunkPrefix: "0", example: "812 3456 7890" },
  { code: "PH", name: "Philippines", dialCode: "63", trunkPrefix: "0", example: "917 123 4567" },
  { code: "TH", name: "Thailand", dialCode: "66", trunkPrefix: "0", example: "81 234 5678" },
  { code: "VN", name: "Vietnam", dialCode: "84", trunkPrefix: "0", example: "91 234 5678" },
  { code: "CN", name: "China", dialCode: "86", trunkPrefix: null, example: "138 0013 8000" },
  { code: "JP", name: "Japan", dialCode: "81", trunkPrefix: "0", example: "90 1234 5678" },
  { code: "KR", name: "South Korea", dialCode: "82", trunkPrefix: "0", example: "10 1234 5678" },
  { code: "AU", name: "Australia", dialCode: "61", trunkPrefix: "0", example: "412 345 678" },
  { code: "NZ", name: "New Zealand", dialCode: "64", trunkPrefix: "0", example: "21 123 4567" },
  { code: "NG", name: "Nigeria", dialCode: "234", trunkPrefix: "0", example: "801 234 5678" },
  { code: "KE", name: "Kenya", dialCode: "254", trunkPrefix: "0", example: "712 345 678" },
  { code: "TZ", name: "Tanzania", dialCode: "255", trunkPrefix: "0", example: "712 345 678" },
  { code: "UG", name: "Uganda", dialCode: "256", trunkPrefix: "0", example: "712 345 678" },
  { code: "GH", name: "Ghana", dialCode: "233", trunkPrefix: "0", example: "24 123 4567" },
  { code: "ZA", name: "South Africa", dialCode: "27", trunkPrefix: "0", example: "82 123 4567" },
  { code: "ET", name: "Ethiopia", dialCode: "251", trunkPrefix: "0", example: "91 123 4567" },
  { code: "SN", name: "Senegal", dialCode: "221", trunkPrefix: "0", example: "77 123 45 67" },
  { code: "MA", name: "Morocco", dialCode: "212", trunkPrefix: "0", example: "612 345 678" },
  { code: "AO", name: "Angola", dialCode: "244", trunkPrefix: "0", example: "923 123 456" },
  { code: "MZ", name: "Mozambique", dialCode: "258", trunkPrefix: "0", example: "82 123 4567" },
  { code: "BR", name: "Brazil", dialCode: "55", trunkPrefix: "0", example: "11 91234 5678" },
  { code: "MX", name: "Mexico", dialCode: "52", trunkPrefix: null, example: "55 1234 5678" },
  { code: "DE", name: "Germany", dialCode: "49", trunkPrefix: "0", example: "151 23456789" },
  { code: "FR", name: "France", dialCode: "33", trunkPrefix: "0", example: "6 12 34 56 78" },
  { code: "ES", name: "Spain", dialCode: "34", trunkPrefix: null, example: "612 34 56 78" },
  { code: "IT", name: "Italy", dialCode: "39", trunkPrefix: null, example: "312 345 6789" },
  { code: "NL", name: "Netherlands", dialCode: "31", trunkPrefix: "0", example: "6 12345678" },
  { code: "PL", name: "Poland", dialCode: "48", trunkPrefix: null, example: "512 345 678" },
  { code: "OTHER", name: "Other country", dialCode: null, trunkPrefix: null, example: "+1 202 555 0123" },
] as const;

export type DialingRegion = (typeof DIALING_REGIONS)[number];
export type DialingRegionCode = DialingRegion["code"];

const E164 = /^\+\d{7,15}$/;

export function dialingRegion(code: DialingRegionCode): DialingRegion {
  return DIALING_REGIONS.find((region) => region.code === code) ?? DIALING_REGIONS[0];
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function directE164(value: string): string | null {
  const trimmed = value.trim();
  const numeric = digits(trimmed);
  if (trimmed.startsWith("+")) return numeric ? `+${numeric}` : null;
  if (trimmed.startsWith("00")) return numeric.length > 2 ? `+${numeric.slice(2)}` : null;
  return null;
}

/** Convert a local or pasted phone number into the only persisted format. */
export function phoneToE164(value: string, regionCode: DialingRegionCode): string {
  const pasted = directE164(value);
  if (pasted) return pasted;

  const region = dialingRegion(regionCode);
  let local = digits(value);
  if (!local) return "";
  if (!region.dialCode) return `+${local}`;

  // People often paste a country code without the leading plus. Keep it
  // rather than accidentally turning +234… into +234234….
  if (local.startsWith(region.dialCode) && local.length > region.dialCode.length + 6) {
    return `+${local}`;
  }
  if (region.trunkPrefix && local.startsWith(region.trunkPrefix)) {
    local = local.slice(region.trunkPrefix.length);
  }
  return `+${region.dialCode}${local}`;
}

export function isValidPhoneInput(value: string, regionCode: DialingRegionCode): boolean {
  if (!dialingRegion(regionCode).dialCode && !directE164(value)) return false;
  return E164.test(phoneToE164(value, regionCode));
}

/**
 * Keep local input visually simple. Pasting E.164 for the selected country
 * removes its prefix; a number for another country remains explicitly +… so
 * it is never silently reinterpreted.
 */
export function phoneInputFromValue(value: string, regionCode: DialingRegionCode): string {
  const pasted = directE164(value);
  const region = dialingRegion(regionCode);
  if (pasted && region.dialCode && pasted.startsWith(`+${region.dialCode}`)) {
    return pasted.slice(region.dialCode.length + 1);
  }
  if (pasted) return pasted;
  return digits(value).slice(0, region.dialCode ? 15 - region.dialCode.length : 15);
}

export function phonePartsFromE164(phoneE164: string): { regionCode: DialingRegionCode; localNumber: string } {
  const normalized = directE164(phoneE164) ?? phoneE164;
  const matching = DIALING_REGIONS.filter((region) => region.dialCode && normalized.startsWith(`+${region.dialCode}`))
    .sort((a, b) => (b.dialCode?.length ?? 0) - (a.dialCode?.length ?? 0))[0];
  if (!matching?.dialCode) return { regionCode: "OTHER", localNumber: normalized };
  return {
    regionCode: matching.code,
    localNumber: normalized.slice(matching.dialCode.length + 1),
  };
}

// Legacy India helpers stay exported for existing callers and migration-safe
// tests. New UI uses the global helpers above.
export function indianMobileFromInput(value: string): string {
  return phoneInputFromValue(value, "IN").replace(/\D/g, "").slice(0, 10);
}

export function isValidIndianMobile(value: string): boolean {
  return /^[6-9]\d{9}$/.test(value);
}

export function indianMobileToE164(value: string): string {
  return `+91${indianMobileFromInput(value)}`;
}
