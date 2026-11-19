const grouped = new Intl.NumberFormat("ru-RU");
export const calculatorQueryKeys = Object.freeze({
  amountRub: "calcAmount",
  service: "calcService",
  days: "calcDays",
  stages: "calcStages",
  buyerShare: "calcShare",
});

export function parseCalculatorAmount(value) {
  const text = String(value ?? "")
    .trim()
    .replace(/\s*(?:₽|руб\.?)$/iu, "")
    .replace(/[ \u00a0\u202f]/gu, "")
    .replace(",", ".");
  if (!/^\d{1,20}(?:\.\d{1,2})?$/u.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const clean = fraction.replace(/0+$/u, "");
  return BigInt(whole).toString() + (clean ? "." + clean : "");
}

export function formatCalculatorAmount(value) {
  const amount = parseCalculatorAmount(value);
  if (amount === null) return String(value ?? "");
  const [whole, fraction] = amount.split(".");
  return (
    grouped.format(BigInt(whole)).replace(/[\u00a0\u202f]/gu, " ") +
    (fraction ? "," + fraction : "")
  );
}

export function formatCalculatorKopecks(value, suffix = true) {
  if (!/^-?\d+$/u.test(String(value))) return "—";
  const number = BigInt(value),
    positive = number < 0n ? -number : number,
    fraction = positive % 100n;
  return (
    (number < 0n ? "−" : "") +
    grouped.format(positive / 100n).replace(/[\u00a0\u202f]/gu, " ") +
    (fraction ? "," + String(fraction).padStart(2, "0") : "") +
    (suffix ? " ₽" : "")
  );
}

export const formatCalculatorPercent = (value) =>
  String(value).replace(".", ",");
export function calculatorInputsFromParams(params, defaults) {
  return Object.fromEntries(
    Object.entries(calculatorQueryKeys).map(([field, key]) => [
      field,
      params.has(key) ? params.get(key) : defaults[field],
    ]),
  );
}
export function calculatorHref(inputs) {
  const params = new URLSearchParams();
  for (const [field, key] of Object.entries(calculatorQueryKeys))
    params.set(key, String(inputs[field]));
  return "/services.html?" + params.toString() + "#calculator";
}

const scale = [
  [0, 300000],
  [250, 1000000],
  [500, 3000000],
  [750, 10000000],
  [1000, 50000000],
];
export function calculatorSliderAmount(position) {
  const value = Math.max(0, Math.min(1000, Number(position)));
  const index = scale.findIndex(([point]) => point >= value);
  if (index <= 0) return "300000";
  const [left, amountLeft] = scale[index - 1],
    [right, amountRight] = scale[index];
  return String(
    Math.round(
      amountLeft +
        ((value - left) / (right - left)) * (amountRight - amountLeft),
    ),
  );
}
export function calculatorSliderPosition(amount) {
  const value = Number(amount),
    index = scale.findIndex(([, point]) => point >= value);
  if (index <= 0) return index === 0 ? 0 : 1000;
  const [left, amountLeft] = scale[index - 1],
    [right, amountRight] = scale[index];
  return Math.round(
    left + ((value - amountLeft) / (amountRight - amountLeft)) * (right - left),
  );
}

export function readCalculatorDraft(raw, config) {
  const errors = {},
    amountRub = parseCalculatorAmount(raw.amountRub);
  const toKopecks = (amount) => {
    const [whole, fraction = ""] = amount.split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  };
  if (
    amountRub === null ||
    toKopecks(amountRub) < toKopecks(config.limits.minAmountRub) ||
    toKopecks(amountRub) > toKopecks(config.limits.maxAmountRub)
  )
    errors.amountRub = `Введите сумму от ${formatCalculatorAmount(config.limits.minAmountRub)} до ${formatCalculatorAmount(config.limits.maxAmountRub)} ₽.`;
  const service = String(raw.service || "");
  if (!config.services.some((item) => item.id === service))
    errors.service = "Выберите тип услуги.";
  const integer = (field, label, min, max) => {
    const text = String(raw[field] ?? "").trim(),
      number = /^\d{1,16}$/u.test(text) ? Number(text) : NaN;
    if (
      !Number.isSafeInteger(number) ||
      number < min ||
      (max !== null && number > max)
    )
      errors[field] =
        `${label}: укажите целое число от ${min}${max === null ? "" : " до " + max}.`;
    return number;
  };
  const days = integer(
    "days",
    "Срок",
    config.limits.minDays,
    config.limits.maxDays,
  );
  const stages = integer(
    "stages",
    "Этапы",
    config.limits.minStages,
    config.limits.maxStages,
  );
  const shareText = String(raw.buyerShare ?? "")
    .trim()
    .replace(",", ".");
  if (!/^\d{1,3}(?:\.\d{1,2})?$/u.test(shareText) || Number(shareText) > 100)
    errors.buyerShare = "Введите долю покупателя от 0 до 100%.";
  return {
    errors,
    inputs: { amountRub, service, days, stages, buyerShare: shareText },
  };
}

// Exact fixed-point helpers so the quote is deterministic regardless of how the
// browser represents floating point numbers.
function roundDivide(numerator, denominator) {
  const quotient = numerator / denominator,
    remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}
function decimalParts(value) {
  const [whole, fraction = ""] = String(value).split(".");
  const denominator = 10n ** BigInt(fraction.length);
  return {
    numerator: BigInt(whole) * denominator + BigInt(fraction || "0"),
    denominator,
  };
}
function kopecks(amount) {
  const [whole, fraction = ""] = String(amount).split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}

// Computes the same quote shape the removed backend returned, entirely from the
// page-embedded config and the already-validated inputs. Formula derived from the
// starting `#calculator-data` quote:
//   base = round(amount × rate% / 100) + fixed fee
//   commission = base + (stages − 1) × extra acceptance fee
//   effective rate = commission / amount × 100 (2 decimals)
export function calculateCalculatorQuote(inputs, config) {
  const amountRub = String(inputs.amountRub),
    amountKopecks = kopecks(amountRub),
    service = config.services.find((item) => item.id === inputs.service),
    days = Number(inputs.days),
    stages = Number(inputs.stages),
    buyerShare = String(inputs.buyerShare).trim();
  const reasons = [];
  const tariff = {
    ratePercent: service.ratePercent,
    fixedRub: service.fixedRub,
    extraAcceptanceRub: config.extraAcceptanceRub,
  };
  const serviceRef = { id: service.id, title: service.title };
  const build = (extra) => ({
    tariffVersion: config.tariffVersion,
    inputs,
    status: extra.status,
    manualApprovalRequired: extra.manualApprovalRequired,
    reasons,
    service: serviceRef,
    tariff,
    breakdown: extra.breakdown,
    commissionRub: extra.commissionRub,
    commissionKopecks: extra.commissionKopecks,
    effectiveRatePercent: extra.effectiveRatePercent,
    buyerCommissionKopecks: extra.buyerCommissionKopecks,
    sellerCommissionKopecks: extra.sellerCommissionKopecks,
    buyerTotalKopecks: extra.buyerTotalKopecks,
    sellerReceivedKopecks: extra.sellerReceivedKopecks,
    pricingBasis: extra.pricingBasis,
  });

  if (amountKopecks > kopecks(config.individualThresholdRub)) {
    reasons.push({
      message: `Сумма сделки превышает ${formatCalculatorAmount(config.individualThresholdRub)} ₽ — стоимость рассчитывается индивидуально.`,
    });
    return build({
      status: "individual",
      manualApprovalRequired: false,
      breakdown: {
        baseRub: null,
        additionalAcceptanceRub: null,
        additionalAcceptanceCount: 0,
      },
      commissionRub: null,
      commissionKopecks: null,
      effectiveRatePercent: null,
      buyerCommissionKopecks: null,
      sellerCommissionKopecks: null,
      buyerTotalKopecks: null,
      sellerReceivedKopecks: null,
      pricingBasis: "individual",
    });
  }

  let manualApprovalRequired = false;
  if (days > config.manualApprovalAfterDays) {
    manualApprovalRequired = true;
    reasons.push({
      message: `Срок сопровождения ${days} дней превышает ${config.manualApprovalAfterDays} — итоговые условия согласуем отдельно.`,
    });
  }

  const rate = decimalParts(service.ratePercent);
  const baseRub = roundDivide(
    amountKopecks * rate.numerator,
    rate.denominator * 10000n,
  );
  const additionalAcceptanceCount = stages - 1;
  const additionalAcceptanceRub =
    BigInt(additionalAcceptanceCount) * BigInt(config.extraAcceptanceRub);
  const commissionRub =
    baseRub + BigInt(service.fixedRub) + additionalAcceptanceRub;
  const commissionKopecks = commissionRub * 100n;
  const effectiveRatePercent = (
    (Number(commissionRub) / Number(amountRub)) *
    100
  ).toFixed(2);
  const share = decimalParts(buyerShare);
  const buyerCommissionKopecks = roundDivide(
    commissionKopecks * share.numerator,
    share.denominator * 100n,
  );
  const sellerCommissionKopecks = commissionKopecks - buyerCommissionKopecks;

  return build({
    status: "priced",
    manualApprovalRequired,
    breakdown: {
      baseRub: baseRub.toString(),
      additionalAcceptanceRub: additionalAcceptanceRub.toString(),
      additionalAcceptanceCount,
    },
    commissionRub: commissionRub.toString(),
    commissionKopecks: commissionKopecks.toString(),
    effectiveRatePercent,
    buyerCommissionKopecks: buyerCommissionKopecks.toString(),
    sellerCommissionKopecks: sellerCommissionKopecks.toString(),
    buyerTotalKopecks: (amountKopecks + buyerCommissionKopecks).toString(),
    sellerReceivedKopecks: (amountKopecks - sellerCommissionKopecks).toString(),
    pricingBasis: "standard",
  });
}
