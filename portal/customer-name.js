const NAME_REQUIRED = "Укажите фамилию и имя. Отчество — при наличии.";
const NAME_CHARACTERS = "В ФИО допустимы буквы, пробелы, дефис и апостроф.";
const NAME_PLACEHOLDER = "Проверьте правильность написания ФИО.";
const placeholders = new Set([
  "нет",
  "нету",
  "не",
  "да",
  "тест",
  "test",
  "testing",
  "admin",
  "administrator",
  "админ",
  "администратор",
  "anonymous",
  "аноним",
  "анонимный",
  "unknown",
  "none",
  "null",
  "undefined",
  "безимени",
  "имя",
  "фамилия",
  "отчество",
  "чепуха",
  "чушь",
  "абракадабра",
  "пользователь",
  "клиент",
  "username",
  "user",
  "hello",
  "привет",
  "asdf",
  "qwerty",
  "йцукен",
  "фыва",
  "ыва",
]);
const keyboardRows = [
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "йцукенгшщзхъ",
  "фывапролджэ",
  "ячсмитьбю",
];
const wordPattern = /^\p{L}[\p{L}\p{M}]*(?:[-']\p{L}[\p{L}\p{M}]*)*$/u;
const compactScript =
  /^[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]+$/u;

function inspect(value) {
  if (typeof value !== "string" || value.length > 240)
    return { error: NAME_REQUIRED };
  const normalized = value
    .normalize("NFC")
    .replace(/[’ʼ‘]/gu, "'")
    .trim()
    .replace(/\s+/gu, " ");
  const parts = normalized.split(" ");
  if (
    !normalized ||
    normalized.length > 120 ||
    parts.length < 2 ||
    parts.length > 4
  )
    return { error: NAME_REQUIRED };
  for (const part of parts) {
    if (!wordPattern.test(part)) return { error: NAME_CHARACTERS };
    const letters = part.replace(/[^\p{L}]/gu, "").toLocaleLowerCase("ru");
    const length = [...letters].length;
    if ((length < 2 && !compactScript.test(part)) || length > 60)
      return { error: NAME_REQUIRED };
    if (placeholders.has(letters)) return { error: NAME_PLACEHOLDER };
    if (/\p{Script=Cyrillic}/u.test(part) && /\p{Script=Latin}/u.test(part))
      return { error: NAME_CHARACTERS };
    if (
      /(.)\1{2,}/u.test(letters) ||
      (length >= 6 && new Set(letters).size <= 2)
    )
      return { error: NAME_PLACEHOLDER };
    if (
      length >= 4 &&
      keyboardRows.some(
        (row) =>
          row.includes(letters) ||
          [...row].reverse().join("").includes(letters),
      )
    )
      return { error: NAME_PLACEHOLDER };
  }
  return { value: normalized, error: "" };
}

// This checks form and obvious placeholders, not a person's legal identity.
export const normalizeCustomerName = (value) => inspect(value).value ?? null;
export const customerNameError = (value) => inspect(value).error;
export const isValidCustomerName = (value) => !customerNameError(value);
