// Shared deterministic text lookup. The original message is never rewritten.
import {
  PROFANITY_BLOCKED_MESSAGE,
  MODERATION_SETTINGS,
  RUSSIAN_FAMILIES,
  ENGLISH_FAMILIES,
  RUSSIAN_MASK_FAMILIES,
  EXACT_EXCEPTIONS,
  MASK_WORDS,
  VISUAL_TO_RUSSIAN,
  PHONETIC_TO_RUSSIAN,
  MIXED_ROMAN_TO_RUSSIAN,
  VISUAL_TO_ENGLISH,
  KEYBOARD_TO_RUSSIAN,
  KEYBOARD_HINTS,
} from "./chat-language-data.js";
export {
  PROFANITY_BLOCKED_MESSAGE,
  MODERATION_UNAVAILABLE_MESSAGE,
  MODERATION_SETTINGS,
} from "./chat-language-data.js";

const compile = (source) => new RegExp("^(?:" + source + ")$", "u");
const russian = compile(
  RUSSIAN_FAMILIES.map((family) => family.source).join("|"),
);
const english = compile(
  ENGLISH_FAMILIES.map((family) => family.source).join("|"),
);
const russianMasks = compile(RUSSIAN_MASK_FAMILIES.join("|"));
const exceptions = new Set(EXACT_EXCEPTIONS);
const maskWords = [...new Set(MASK_WORDS)];
const transliteratedWords = new Set(
  maskWords
    .filter((word) => /^[а-я]+$/u.test(word))
    .flatMap((word) => [
      word,
      word.replace(/[ъь]/g, ""),
      word.replace(/й/g, "и"),
      word.replace(/[ъь]/g, "").replace(/й/g, "и"),
    ]),
);
const englishVisualLetters = new Set(Object.keys(VISUAL_TO_ENGLISH));
const map = (value, alphabet) =>
  [...value].map((char) => alphabet[char] ?? char).join("");
const once = (value) => value.replace(/(.)\1+/gu, "$1");
const twice = (value) => value.replace(/(.)\1{2,}/gu, "$1$1");
const forms = (value) => [...new Set([value, once(value), twice(value)])];

// NFKC composes a decomposed й; NFD then exposes decorative marks. Restore
// Cyrillic и + breve to й before removing remaining accents. ё folds to е only
// in this private lookup representation. ZWJ emoji in the original stay intact.
export function normalizeChatLanguageText(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/и\u0306/gu, "й")
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .replace(/ё/g, "е");
}
function transliterate(value) {
  return value
    .replace(/shch|sch/g, "щ")
    .replace(/shlyu|shlu/g, "шлю")
    .replace(/zh/g, "ж")
    .replace(/kh/g, "х")
    .replace(/ch/g, "ч")
    .replace(/sh/g, "ш")
    .replace(/ts/g, "ц")
    .replace(/ya|ja|ia/g, "я")
    .replace(/yu|ju/g, "ю")
    .replace(/yo|jo|ye/g, "е");
}
function keyboard(value) {
  if (
    !/^[a-z0-9[\];',.*#_@$]+$/u.test(value) ||
    !KEYBOARD_HINTS.some((pattern) => pattern.test(value))
  )
    return null;
  return map(value, KEYBOARD_TO_RUSSIAN);
}
function excepted(value) {
  if (exceptions.has(value)) return true;
  if (/^(?:[а-я]+|[a-z]+)$/u.test(value)) return false;
  return (
    exceptions.has(map(value, VISUAL_TO_RUSSIAN)) ||
    exceptions.has(map(value, VISUAL_TO_ENGLISH))
  );
}
function masked(value) {
  const mask = value.replace(/[#_]/g, "*").replace(/\*+/g, "*");
  const count = (mask.match(/\*/g) || []).length;
  if (
    !count ||
    count > MODERATION_SETTINGS.maxMaskLength ||
    mask.length > MODERATION_SETTINGS.maxJoinedCharacters
  )
    return false;
  const known = mask.replace(/\*/g, "");
  if (known.length < 2 || !/^[а-яa-z]+$/u.test(known)) return false;
  const pattern = compile(mask.split("*").join("[а-яa-z]{1,3}"));
  const minimum = known.length + count,
    maximum = known.length + count * 3;
  return maskWords.some(
    (word) =>
      word.length >= minimum &&
      word.length <= maximum &&
      (mask[0] === "*" || word[0] === mask[0]) &&
      pattern.test(word),
  );
}
function rejected(raw) {
  if (excepted(raw)) return false;
  // Most ordinary Russian input needs no Latin/transliteration allocations.
  // Retain the English visual lane when every Cyrillic letter is convertible.
  if (/^[а-я]+$/u.test(raw)) {
    if (forms(raw).some((value) => russian.test(value))) return true;
    if (![...raw].every((char) => englishVisualLetters.has(char))) return false;
    return forms(map(raw, VISUAL_TO_ENGLISH)).some((value) =>
      english.test(value),
    );
  }
  const pureRoman = /^[a-z0-9@$_*#]+$/u.test(raw);
  const ru = new Set(),
    en = new Set();
  for (const input of forms(raw)) {
    const visual = map(input, VISUAL_TO_RUSSIAN);
    if (!pureRoman)
      for (const variant of forms(visual))
        ru.add(variant.replace(/[#_]/g, "*"));
    // English words such as hue, ebony or ebanking must not be run through
    // broad Russian prefix+stem morphology. Transliterations match a finite
    // list of concrete forms (including optional soft/hard signs) instead.
    for (const candidate of [
      visual,
      map(transliterate(input), PHONETIC_TO_RUSSIAN),
      map(transliterate(input), MIXED_ROMAN_TO_RUSSIAN),
    ]) {
      for (const variant of forms(candidate)) {
        if (
          transliteratedWords.has(variant) ||
          transliteratedWords.has(variant.replace(/[*#_]/g, ""))
        )
          return true;
      }
    }
    const layout = keyboard(input);
    if (layout !== null)
      for (const variant of forms(layout))
        ru.add(variant.replace(/[#_]/g, "*"));
    for (const variant of forms(map(input, VISUAL_TO_ENGLISH)))
      en.add(variant.replace(/[#_]/g, "*"));
  }
  for (const candidate of ru) {
    if (excepted(candidate)) continue;
    if (
      russian.test(candidate) ||
      russian.test(candidate.replace(/\*/g, "")) ||
      russianMasks.test(candidate) ||
      masked(candidate)
    )
      return true;
  }
  for (const candidate of en) {
    if (excepted(candidate)) continue;
    if (
      english.test(candidate) ||
      english.test(candidate.replace(/\*/g, "")) ||
      masked(candidate)
    )
      return true;
  }
  return false;
}

function scan(text, tokens, checked) {
  const spans = [],
    protectedUntil = new Int32Array(tokens.length).fill(-1);
  const atomicRejections = new Map();
  const containsForbiddenWord = (start, end) => {
    for (let index = start; index <= end; index++) {
      const word = tokens[index][0];
      if (word.length < 2) continue;
      if (!atomicRejections.has(word))
        atomicRejections.set(word, rejected(word));
      if (atomicRejections.get(word)) return true;
    }
    return false;
  };
  for (let start = 0; start < tokens.length; start++) {
    let joined = tokens[start][0];
    for (
      let end = start;
      end <
      Math.min(tokens.length, start + MODERATION_SETTINGS.maxJoinedFragments);
      end++
    ) {
      if (end > start) {
        const before = tokens[end - 1],
          part = tokens[end][0];
        const separator = text.slice(
          before.index + before[0].length,
          tokens[end].index,
        );
        if (separator.length > 16) break;
        const previousSize = before[0].replace(/[*#_]/g, "").length;
        const size = part.replace(/[*#_]/g, "").length;
        if (
          /\s/u.test(separator) &&
          Math.max(previousSize, size) >
            MODERATION_SETTINGS.maxWhitespaceFragmentLength
        )
          break;
        if (
          joined.length + part.length >
          MODERATION_SETTINGS.maxJoinedCharacters
        )
          break;
        joined += part;
      }
      spans.push({ start, end, value: joined });
      // Whole neutral spellings protect their constituent fragments, not other
      // words in the message. This avoids early matches in «п е д и к ю р».
      // An exception must not swallow an already forbidden standalone word:
      // «хер сон» is not an exception just because its letters form «Херсон».
      if (excepted(joined) && !containsForbiddenWord(start, end))
        for (let index = start; index <= end; index++)
          protectedUntil[index] = Math.max(protectedUntil[index], end);
    }
  }
  for (const span of spans) {
    if (protectedUntil[span.start] >= span.end || checked.has(span.value))
      continue;
    checked.add(span.value);
    if (rejected(span.value)) return true;
  }
  return false;
}

export function chatLanguageError(value) {
  if (typeof value !== "string" || !value) return "";
  if (value.length > MODERATION_SETTINGS.maxInputLength)
    throw new RangeError(
      "Moderation input exceeds the configured maximum length",
    );
  const text = normalizeChatLanguageText(value),
    checked = new Set();
  const normal = [...text.matchAll(/[\p{L}\p{N}@$_*#]+/gu)];
  if (scan(text, normal, checked)) return PROFANITY_BLOCKED_MESSAGE;
  // A separate bounded pass keeps keyboard punctuation (e.g. [eq, ,kznm)
  // without interpreting every punctuation mark as a Russian letter.
  const layout = [...text.matchAll(/[a-z0-9[\];',*#_@$]+/gu)];
  return scan(text, layout, checked) ? PROFANITY_BLOCKED_MESSAGE : "";
}
export const isAcceptableChatMessage = (value) =>
  chatLanguageError(value) === "";
