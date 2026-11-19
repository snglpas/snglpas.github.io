import {
  calculateCalculatorQuote,
  calculatorHref,
  calculatorSliderAmount,
  calculatorSliderPosition,
  formatCalculatorAmount,
  formatCalculatorKopecks,
  formatCalculatorPercent,
  parseCalculatorAmount,
  readCalculatorDraft,
} from "./calculator-inputs.js";

const form = document.querySelector("#deal-calculator");
if (form) {
  const { config, quote: initialQuote } = JSON.parse(
    document.querySelector("#calculator-data").textContent,
  );
  const $ = (selector) => document.querySelector(selector),
    $$ = (selector) => [...document.querySelectorAll(selector)];
  const amount = $("#calc-amount"),
    slider = $("#calc-amount-slider"),
    days = $("#calc-days"),
    stages = $("#calc-stages"),
    share = $("#calc-share");
  const result = $("#calc-result"),
    price = $("#calc-price"),
    caption = $("#calc-price-caption");
  const payment = $(".calculator-payment"),
    approval = $("#calc-approval"),
    announcement = $("#calc-announcement");
  let revision = 0,
    timer = null,
    announcementTimer = null,
    latestQuote = null;
  const formatRub = (rub) => formatCalculatorKopecks(BigInt(rub) * 100n);
  const chosen = (name) =>
    form.querySelector(`input[name="${name}"]:checked`)?.value || "";
  const splitLabel = (value) =>
    Number(value) === 100
      ? "Покупатель — 100%"
      : Number(value) === 0
        ? "Продавец — 100%"
        : Number(value) === 50
          ? "Поровну — 50 / 50"
          : `Покупатель — ${formatCalculatorPercent(value)}%`;
  const draft = () => ({
    amountRub: amount.value,
    service: chosen("service"),
    days: days.value,
    stages: stages.value,
    buyerShare:
      chosen("paymentSplit") === "custom"
        ? share.value
        : chosen("paymentSplit"),
  });
  function matchesCurrentQuote() {
    const checked = readCalculatorDraft(draft(), config),
      prior = latestQuote?.inputs;
    return Boolean(
      prior &&
        !Object.keys(checked.errors).length &&
        checked.inputs.amountRub === prior.amountRub &&
        checked.inputs.service === prior.service &&
        checked.inputs.days === prior.days &&
        checked.inputs.stages === prior.stages &&
        Number(checked.inputs.buyerShare) === Number(prior.buyerShare),
    );
  }
  const errorInput = (name) =>
    ({
      amountRub: amount,
      service: form.querySelector('input[name="service"]:checked'),
      days,
      stages,
      buyerShare: share,
    })[name];

  function showErrors(fields, reveal = true) {
    for (const name of [
      "amountRub",
      "service",
      "days",
      "stages",
      "buyerShare",
    ]) {
      const node = $("#calc-error-" + name),
        input = errorInput(name);
      const visible = Boolean(fields[name] && reveal);
      node.hidden = !visible;
      node.textContent = visible ? fields[name] : "";
      if (visible) input?.setAttribute("aria-invalid", "true");
      else input?.removeAttribute("aria-invalid");
    }
  }
  function syncControls(raw) {
    const parsed = parseCalculatorAmount(raw.amountRub);
    if (
      parsed !== null &&
      Number(parsed) >= Number(config.limits.minAmountRub) &&
      Number(parsed) <= Number(config.limits.maxAmountRub)
    ) {
      slider.value = String(calculatorSliderPosition(parsed));
      slider.setAttribute(
        "aria-valuetext",
        formatCalculatorAmount(parsed) + " рублей",
      );
    }
    slider.style.setProperty(
      "--calculator-progress",
      Number(slider.value) / 10 + "%",
    );
    $$("[data-calc-amount]").forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(parsed === button.dataset.calcAmount),
      ),
    );
    $$("[data-calc-days]").forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(String(raw.days).trim() === button.dataset.calcDays),
      ),
    );
    const custom = chosen("paymentSplit") === "custom";
    $("#calc-custom-share").hidden = !custom;
    share.disabled = !custom;
    const shareValid =
      /^\d{1,3}(?:[.,]\d{1,2})?$/u.test(String(raw.buyerShare).trim()) &&
      Number(String(raw.buyerShare).replace(",", ".")) <= 100;
    $("#calc-share-summary").textContent = shareValid
      ? splitLabel(String(raw.buyerShare).replace(",", "."))
      : "Укажите пропорцию";
    const minus = form.querySelector('[data-calc-stage="-1"]'),
      plus = form.querySelector('[data-calc-stage="1"]');
    minus.disabled =
      !Number.isSafeInteger(Number(stages.value)) ||
      Number(stages.value) <= config.limits.minStages;
    plus.disabled =
      !Number.isSafeInteger(Number(stages.value)) ||
      (config.limits.maxStages !== null &&
        Number(stages.value) >= config.limits.maxStages);
  }
  function setUnavailable(state, title, description = "") {
    latestQuote = null;
    result.dataset.state = state;
    result.setAttribute("aria-busy", String(state === "pending"));
    price.textContent = title;
    caption.textContent = description;
    payment.hidden = true;
    approval.replaceChildren();
    $("#calc-tariff-description").textContent = "";
    $("#calc-extra-description").textContent = "";
    $("#calc-effective-rate").textContent = "";
    $("#calc-retry").hidden = state !== "error";
    clearTimeout(announcementTimer);
    announcement.textContent = "";
  }
  function validQuote(quote) {
    return (
      quote &&
      ["priced", "individual"].includes(quote.status) &&
      quote.inputs &&
      quote.tariff &&
      Array.isArray(quote.reasons) &&
      (quote.status === "individual"
        ? quote.commissionRub === null
        : /^\d+$/u.test(quote.commissionRub))
    );
  }
  function announce(text) {
    clearTimeout(announcementTimer);
    announcementTimer = setTimeout(() => {
      announcement.textContent = text;
    }, 650);
  }
  function renderQuote(quote, shouldAnnounce = false) {
    if (!validQuote(quote)) throw new Error("Некорректный ответ калькулятора");
    latestQuote = quote;
    result.dataset.state = quote.status;
    result.setAttribute("aria-busy", "false");
    const individual = quote.status === "individual";
    price.textContent = individual
      ? "Рассчитаем индивидуально"
      : formatRub(quote.commissionRub);
    caption.textContent = individual
      ? "Стоимость требует индивидуального согласования"
      : "Комиссия за сопровождение сделки";
    $("#calc-retry").hidden = true;
    const rate = formatCalculatorPercent(quote.tariff.ratePercent),
      fixed =
        quote.tariff.fixedRub === "0"
          ? ""
          : " + " + formatRub(quote.tariff.fixedRub);
    $("#calc-tariff-description").textContent = individual
      ? "Точный состав сопровождения и стоимость определим после обсуждения."
      : quote.pricingBasis === "agreed"
        ? "Базовый этап рассчитан по согласованным условиям."
        : `Базовый тариф: ${rate}% от суммы сделки${fixed}.`;
    $("#calc-extra-description").textContent = quote.breakdown
      .additionalAcceptanceCount
      ? `Дополнительные приёмки: ${quote.breakdown.additionalAcceptanceCount} × ${formatRub(quote.tariff.extraAcceptanceRub)}${individual ? "." : " = " + formatRub(quote.breakdown.additionalAcceptanceRub) + "."}`
      : "Первый этап с приёмкой включён.";
    $("#calc-effective-rate").textContent =
      !individual && quote.effectiveRatePercent
        ? `Итоговая комиссия — ${formatCalculatorPercent(quote.effectiveRatePercent)}% от суммы сделки.`
        : "";
    approval.replaceChildren();
    for (const reason of quote.reasons) {
      const paragraph = document.createElement("p");
      paragraph.textContent = reason.message;
      approval.append(paragraph);
    }
    approval.classList.toggle(
      "requires-approval",
      quote.manualApprovalRequired,
    );
    payment.hidden = individual;
    $("#calc-deal-total").textContent =
      formatCalculatorAmount(quote.inputs.amountRub) + " ₽";
    $("#calc-buyer-total").textContent =
      quote.buyerTotalKopecks === null
        ? "—"
        : formatCalculatorKopecks(quote.buyerTotalKopecks);
    $("#calc-seller-total").textContent =
      quote.sellerReceivedKopecks === null
        ? "—"
        : formatCalculatorKopecks(quote.sellerReceivedKopecks);
    $("#calc-payment-summary").textContent = splitLabel(
      quote.inputs.buyerShare,
    );
    if (shouldAnnounce)
      announce(
        individual
          ? "Стоимость рассчитывается индивидуально."
          : `Ориентировочная стоимость сопровождения: ${formatRub(quote.commissionRub)}.${quote.manualApprovalRequired ? " Требуется согласование." : ""}`,
      );
  }
  function requestQuote(currentRevision, inputs) {
    // The static snapshot has no backend, so the quote is computed locally from
    // the page-embedded config instead of POSTing to /api/calculator.
    if (currentRevision !== revision) return;
    let calculation;
    try {
      calculation = calculateCalculatorQuote(inputs, config);
    } catch {
      setUnavailable(
        "error",
        "Не удалось получить расчёт",
        "Проверьте параметры и повторите попытку. Параметры сохранены.",
      );
      announce(
        "Расчёт временно недоступен. Параметры сохранены, можно повторить попытку.",
      );
      return;
    }
    renderQuote(calculation, true);
    history.replaceState(history.state, "", calculatorHref(calculation.inputs));
  }
  function update({ immediate = false, reveal = true } = {}) {
    clearTimeout(timer);
    const currentRevision = ++revision;
    const raw = draft(),
      checked = readCalculatorDraft(raw, config);
    syncControls(raw);
    showErrors(checked.errors, reveal);
    if (Object.keys(checked.errors).length) {
      setUnavailable(
        "invalid",
        "Укажите корректные параметры",
        "Проверьте сумму, срок и количество этапов.",
      );
      announce(
        "Укажите корректные параметры расчёта. Предыдущая стоимость больше не актуальна.",
      );
      return;
    }
    setUnavailable(
      "pending",
      "Пересчитываем…",
      "Обновляем стоимость по выбранным параметрам",
    );
    timer = setTimeout(
      () => requestQuote(currentRevision, checked.inputs),
      immediate ? 0 : 200,
    );
  }
  form.addEventListener("input", (event) => {
    if (event.target === slider)
      amount.value = formatCalculatorAmount(
        calculatorSliderAmount(slider.value),
      );
    update({ reveal: event.target.value.trim() !== "" });
  });
  form.addEventListener("change", (event) => {
    if (
      ["radio", "range"].includes(event.target.type) ||
      !matchesCurrentQuote()
    )
      update({ immediate: true });
  });
  amount.addEventListener("blur", () => {
    const parsed = parseCalculatorAmount(amount.value);
    if (parsed !== null) amount.value = formatCalculatorAmount(parsed);
    if (!matchesCurrentQuote()) update({ immediate: true });
  });
  form.addEventListener("click", (event) => {
    const presetAmount = event.target.closest("[data-calc-amount]"),
      presetDays = event.target.closest("[data-calc-days]"),
      step = event.target.closest("[data-calc-stage]");
    if (presetAmount)
      amount.value = formatCalculatorAmount(presetAmount.dataset.calcAmount);
    if (presetDays) days.value = presetDays.dataset.calcDays;
    if (step) {
      const current = Number(stages.value),
        next = current + Number(step.dataset.calcStage);
      if (
        Number.isSafeInteger(current) &&
        Number.isSafeInteger(next) &&
        next >= config.limits.minStages &&
        (config.limits.maxStages === null || next <= config.limits.maxStages)
      )
        stages.value = String(next);
    }
    if (presetAmount || presetDays || step) update({ immediate: true });
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update({ immediate: true });
  });
  $("#calc-retry").addEventListener("click", () => update({ immediate: true }));
  window.addEventListener("pagehide", () => {
    clearTimeout(timer);
    clearTimeout(announcementTimer);
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) update({ immediate: true });
  });
  syncControls(draft());
  if (initialQuote) renderQuote(initialQuote);
  else update({ immediate: true });
}
