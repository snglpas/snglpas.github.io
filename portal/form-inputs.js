const onlyDigits = (value) => String(value ?? "").replace(/[^0-9]/g, "");
const PHONE_ERROR = "Введите корректный российский номер: 10 цифр после +7.";
const DATE_ERROR =
  "Укажите существующую дату в формате ДД.ММ.ГГГГ: не в будущем и не старше 120 лет.";

export function formatBirthDate(value) {
  const digits = onlyDigits(value);
  return (
    digits.slice(0, 2) +
    (digits.length >= 2 ? "." : "") +
    digits.slice(2, 4) +
    (digits.length >= 4 ? "." : "") +
    digits.slice(4)
  );
}

export function normalizeBirthDate(value, now = new Date()) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (!/^(?:[0-9]{8}|[0-9]{2}\.[0-9]{2}\.[0-9]{4})$/.test(raw)) return null;
  const digits = onlyDigits(raw),
    iso = `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  const date = new Date(iso + "T00:00:00.000Z");
  if (
    iso.startsWith("0000-") ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== iso
  )
    return null;
  const today = now.toISOString().slice(0, 10),
    oldest = new Date(today + "T00:00:00.000Z");
  oldest.setUTCFullYear(oldest.getUTCFullYear() - 120);
  return iso > today || iso < oldest.toISOString().slice(0, 10) ? null : iso;
}

export function parsePhoneInput(value) {
  const raw = String(value ?? "").trim();
  if (
    /[^0-9+()\s.-]/u.test(raw) ||
    (raw.match(/\+/g)?.length ?? 0) > 1 ||
    (raw.includes("+") && !raw.startsWith("+"))
  )
    return { digits: "", error: PHONE_ERROR };
  if (raw.startsWith("+") && !/^\+7(?:[^0-9]|[0-9]|$)/.test(raw))
    return {
      digits: "",
      error: "Поддерживаются российские номера с кодом +7.",
    };
  let digits = onlyDigits(raw);
  if (raw.startsWith("+7")) digits = digits.slice(1);
  else if (digits.length === 11 && /^[78]/.test(digits))
    digits = digits.slice(1);
  if (digits.length > 10) return { digits: "", error: PHONE_ERROR };
  return { digits, error: "" };
}

export function formatNationalPhone(value) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  return (
    "(" +
    digits.slice(0, 3) +
    (digits.length >= 3 ? ") " : "") +
    digits.slice(3, 6) +
    (digits.length >= 6 ? "-" : "") +
    digits.slice(6, 8) +
    (digits.length >= 8 ? "-" : "") +
    digits.slice(8)
  );
}

export function normalizeRussianPhone(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = parsePhoneInput(raw);
  const normalized = "7" + parsed.digits;
  return parsed.error ||
    !/^7[3489][0-9]{9}$/.test(normalized) ||
    /^([0-9])\1{9}$/.test(parsed.digits)
    ? null
    : normalized;
}

export function digitIndexAtPosition(value, position) {
  return onlyDigits(String(value).slice(0, Math.max(0, position))).length;
}

export function positionAfterDigits(value, count) {
  let index = 0,
    seen = 0;
  while (index < value.length && seen < count) {
    if (/[0-9]/.test(value[index])) seen++;
    index++;
  }
  while (index < value.length && !/[0-9]/.test(value[index])) index++;
  return index;
}

// Edit logical digits rather than punctuation, so backspace at a separator
// removes the previous digit instead of restoring the same separator forever.
export function editDigitSelection(
  value,
  selectionStart,
  selectionEnd,
  insertion = "",
  direction = "",
) {
  const digits = onlyDigits(value);
  let from = digitIndexAtPosition(value, selectionStart),
    to = digitIndexAtPosition(value, selectionEnd);
  if (from === to && direction === "backward" && from > 0) from--;
  else if (from === to && direction === "forward" && to < digits.length) to++;
  return {
    digits: digits.slice(0, from) + insertion + digits.slice(to),
    caret: from + insertion.length,
  };
}

function bindMask(input, { maximum, format, parse, normalize, error }) {
  let internalEvent = false;
  function notify() {
    internalEvent = true;
    try {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } finally {
      internalEvent = false;
    }
  }
  function reject(message) {
    input.dataset.maskError = message;
    notify();
  }
  function apply(digits, caret) {
    input.value = format(digits);
    delete input.dataset.maskError;
    const position = positionAfterDigits(input.value, caret);
    input.setSelectionRange(position, position);
    notify();
  }
  function edit(insertion, direction = "") {
    const result = editDigitSelection(
      input.value,
      input.selectionStart ?? input.value.length,
      input.selectionEnd ?? input.value.length,
      insertion,
      direction,
    );
    if (result.digits.length > maximum) {
      reject(error);
      return;
    }
    apply(result.digits, result.caret);
  }
  input.addEventListener("keydown", (event) => {
    if (
      input.readOnly ||
      input.disabled ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      !["Backspace", "Delete"].includes(event.key)
    )
      return;
    event.preventDefault();
    edit("", event.key === "Backspace" ? "backward" : "forward");
  });
  input.addEventListener("beforeinput", (event) => {
    if (input.readOnly || input.disabled || event.isComposing) return;
    if (
      ["deleteContentBackward", "deleteContentForward", "deleteByCut"].includes(
        event.inputType,
      )
    ) {
      event.preventDefault();
      edit(
        "",
        event.inputType === "deleteContentBackward"
          ? "backward"
          : event.inputType === "deleteContentForward"
            ? "forward"
            : "",
      );
      return;
    }
    if (
      !["insertText", "insertReplacementText"].includes(event.inputType) ||
      typeof event.data !== "string"
    )
      return;
    event.preventDefault();
    if (event.inputType === "insertReplacementText") {
      const parsed = parse(event.data);
      if (parsed.error) reject(parsed.error);
      else edit(parsed.digits);
    } else {
      const digits = onlyDigits(event.data);
      if (digits) edit(digits);
    }
  });
  input.addEventListener("paste", (event) => {
    if (input.readOnly || input.disabled) return;
    const text = event.clipboardData?.getData("text");
    if (typeof text !== "string") return;
    event.preventDefault();
    const parsed = parse(text);
    if (parsed.error) reject(parsed.error);
    else edit(parsed.digits);
  });
  function reconcile() {
    if (internalEvent) return;
    const raw = input.value,
      oldCaret = input.selectionStart ?? raw.length,
      parsed = parse(raw);
    if (parsed.error) {
      input.value = "";
      input.dataset.maskError = parsed.error;
      return;
    }
    const prefixRemoved = Math.max(
      0,
      onlyDigits(raw).length - parsed.digits.length,
    );
    input.value = format(parsed.digits);
    const position = positionAfterDigits(
      input.value,
      Math.max(0, digitIndexAtPosition(raw, oldCaret) - prefixRemoved),
    );
    input.setSelectionRange(position, position);
    delete input.dataset.maskError;
  }
  input.addEventListener("input", reconcile);
  input.addEventListener("change", reconcile);
  input.addEventListener("blur", () => {
    if (
      input.value &&
      !input.dataset.maskError &&
      normalize(input.value) === null
    )
      reject(error);
  });
  reconcile();
}

export function bindBirthDateInput(input) {
  bindMask(input, {
    maximum: 8,
    format: formatBirthDate,
    normalize: normalizeBirthDate,
    error: DATE_ERROR,
    parse(value) {
      const raw = String(value ?? "").trim(),
        digits = onlyDigits(raw);
      return /[^0-9.\s/-]/u.test(raw) || digits.length > 8
        ? { digits: "", error: DATE_ERROR }
        : { digits, error: "" };
    },
  });
}

export function bindRussianPhoneInput(input) {
  bindMask(input, {
    maximum: 10,
    format: formatNationalPhone,
    parse: parsePhoneInput,
    normalize: normalizeRussianPhone,
    error: PHONE_ERROR,
  });
}
