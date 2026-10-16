// Red-flag symptoms (REQUIREMENTS F10): any of these in a patient's question means
// "stop and contact your doctor" — checked here before the question reaches an AI,
// so the answer never depends on a model noticing.

const PATTERNS = [
  // English
  /chest\s*(pain|tight)/i,
  /(severe|sharp|unbearable|terrible|extreme|a lot of)\s+pain/i,
  /pain\s+is\s+(severe|unbearable|getting worse)/i,
  /\bnumb(ness|ed)?\b/i,
  /tingl/i,
  /pins and needles/i,
  /swell|swollen/i,
  /\b(fell|fallen|falling|fall down|i fall)\b/i,
  /\bdizz|faint|black(ed)? out|passed out/i,
  /(short|out) of breath|can'?t breathe|breathless/i,
  /bleed/i,
  // Malayalam
  /നെഞ്ചു?\s*വേദന|നെഞ്ചുവേദന|നെഞ്ചിൽ\s*വേദന/,
  /(കഠിന|കടുത്ത|ഭയങ്കര|സഹിക്കാൻ\s*പറ്റാത്ത)\S*\s*വേദന/,
  /മരവിപ്പ്|മരവിച്ചു|തരിപ്പ്|തരിച്ചു/,
  /നീര്|നീരു|വീക്കം|വീങ്ങി/,
  /വീണു|വീഴ്ച/,
  /തലകറക്കം|തല\s*കറങ്ങ|ബോധം\s*പോയി|തളർന്നു\s*വീണു/,
  /ശ്വാസം\s*മുട്ട|ശ്വാസതടസ്സം/,
  /രക്തം|ചോര/,
]

/** @returns {boolean} true when the text mentions a red-flag symptom */
export function hasRedFlag(text = '') {
  return PATTERNS.some((re) => re.test(text))
}
