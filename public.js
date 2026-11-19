import {
  bindBirthDateInput,
  bindRussianPhoneInput,
  formatBirthDate,
  normalizeBirthDate,
  normalizeRussianPhone,
} from "/portal/form-inputs.js";
import {
  customerNameError,
  normalizeCustomerName,
} from "/portal/customer-name.js";
// Shared profanity moderation, used by the application form's text validation.
import {
  chatLanguageError,
  PROFANITY_BLOCKED_MESSAGE,
  MODERATION_UNAVAILABLE_MESSAGE,
} from "/portal/chat-language.js";
import { normalizeSettlementName } from "/portal/settlement-input.js";
import { mountSettlementPicker } from "/portal/settlement-picker.js";
import { SITE_PHONES, SHOW_PHONES } from "/portal/site-data.js";

(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [
    ...root.querySelectorAll(selector),
  ];
  // Decode UTF-8 from a base64 string (handles Cyrillic company data).
  function decodeB64(value) {
    const binary = atob(String(value).replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  // Reveal company data that is stored base64-encoded in the markup, so the
  // plaintext values do not appear in the raw HTML source.
  function revealCompanyData() {
    $$("[data-b64]").forEach((node) => {
      const value = decodeB64(node.dataset.b64);
      if (node.tagName === "META") node.setAttribute("content", value);
      else if (node.children.length) node.prepend(value);
      else node.textContent = value;
    });
    $$("[data-b64-aria-label]").forEach((node) => {
      node.setAttribute("aria-label", decodeB64(node.dataset.b64AriaLabel));
    });
    $$("[data-b64-copy]").forEach((node) => {
      node.dataset.copy = decodeB64(node.dataset.b64Copy);
    });
  }
  revealCompanyData();
  // Render (or hide) every phone number from the single config in site-data.js.
  function syncPhones() {
    $$("[data-phone]").forEach((node) => {
      const phone = SITE_PHONES[Number(node.dataset.phone)];
      if (!phone || !SHOW_PHONES) {
        node.hidden = true;
        node.removeAttribute("href");
        return;
      }
      node.hidden = false;
      node.setAttribute("href", "tel:" + phone.tel);
      node.setAttribute("title", phone.display);
      node.setAttribute("aria-label", phone.display);
      const full = $(".header-phone-full", node);
      const compact = $(".header-phone-compact", node);
      if (full && compact) {
        full.textContent = phone.display;
        compact.textContent = phone.tel;
      } else {
        node.textContent = phone.display;
      }
    });
  }
  syncPhones();
  const uuid = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
          (
            c ^
            (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
          ).toString(16),
        );
  const state = {
    csrf: "",
    features: {
      intakeEnabled: false,
      policyReady: false,
      policyVersion: "",
    },
  };
  let bootstrapRequest;
  const reviewForm = $("#review-form");
  let pendingReview,
    reviewBusy = false;

  class ApiError extends Error {
    constructor(message, status = 0, code = "", fields = {}) {
      super(message);
      this.status = status;
      this.code = code;
      this.fields = fields;
    }
  }
  const policyChangedMessage =
    "Документы обновились. Откройте актуальные согласие и политику по ссылкам у галочки, затем отметьте согласие заново. Если документы не загружаются, обновите страницу.";
  let featureRequest = 0,
    lastFeatureResponse = 0;
  function updateFeatures(features, request) {
    // Bootstrap and the intake form share policy state, even when their responses arrive out of order.
    if (!features || request < lastFeatureResponse) return;
    lastFeatureResponse = request;
    const previous = state.features;
    state.features = { ...previous, ...features };
    syncReviewForm();
    const reviewVersion =
      previous.policyVersion || reviewForm?.dataset.policyVersion;
    if (
      reviewForm?.elements.consent?.checked &&
      !reviewBusy &&
      reviewVersion &&
      (reviewVersion !== state.features.policyVersion ||
        !state.features.policyReady)
    ) {
      reviewForm.elements.consent.checked = false;
      showReviewError(policyChangedMessage);
    }
    const unchanged =
      previous.policyVersion === state.features.policyVersion &&
      previous.policyReady === state.features.policyReady;
    if (!previous.policyVersion || unchanged) return;
    const applicationConsent = applicationForm?.elements.consent;
    if (applicationConsent?.checked) {
      applicationConsent.checked = false;
      if (!pendingApplication && state.features.policyReady)
        showAppError(policyChangedMessage);
    }
  }
  function draftLanguageError(text) {
    try {
      const error = chatLanguageError(text);
      if (typeof error !== "string")
        throw new Error("Invalid moderation result");
      return error;
    } catch {
      return MODERATION_UNAVAILABLE_MESSAGE;
    }
  }
  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch(path, {
        credentials: "same-origin",
        cache: "no-store",
        ...options,
        headers: {
          Accept: "application/json",
          ...(options.body
            ? { "Content-Type": "application/json", "X-CSRF-Token": state.csrf }
            : {}),
          ...(options.headers || {}),
        },
      });
    } catch {
      throw new ApiError(
        "Не удалось связаться с сервером. Проверьте подключение и повторите попытку.",
      );
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new ApiError(
        "Сервер вернул неожиданный ответ. Повторите попытку.",
        response.status,
      );
    }
    if (!response.ok)
      throw new ApiError(
        result.error?.message ||
          "Не удалось выполнить запрос. Попробуйте ещё раз.",
        response.status,
        result.error?.code,
        result.error?.fields,
      );
    return result;
  }
  async function bootstrap(force = false) {
    if (bootstrapRequest && !force) return bootstrapRequest;
    const request = ++featureRequest;
    bootstrapRequest = api("/api/bootstrap")
      .then((data) => {
        state.csrf = data.csrf || "";
        updateFeatures(data.features, request);
        syncCollectionState();
        return data;
      })
      .catch((error) => {
        bootstrapRequest = null;
        throw error;
      });
    return bootstrapRequest;
  }

  function showReviewError(message) {
    const error = $("#review-error");
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  }
  function syncReviewForm() {
    if (!reviewForm || reviewForm.dataset.enabled !== "true") return;
    $("#review-submit").disabled =
      reviewBusy || !state.csrf || !state.features.policyReady;
  }
  reviewForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (
      reviewBusy ||
      reviewForm.dataset.enabled !== "true" ||
      !reviewForm.reportValidity()
    )
      return;
    showReviewError("");
    const submit = $("#review-submit");
    const status = $("#review-status");
    const fields = reviewForm.elements;
    const label = submit.textContent;
    status.textContent = "";
    reviewBusy = true;
    syncReviewForm();
    submit.textContent = "Отправляем…";
    fields.name.readOnly = fields.text.readOnly = true;
    fields.consent.disabled = true;
    const versionBefore =
      state.features.policyVersion || reviewForm.dataset.policyVersion;
    try {
      await bootstrap();
      if (!state.features.policyReady)
        throw new Error("Приём отзывов временно недоступен. Попробуйте позже.");
      if (versionBefore && versionBefore !== state.features.policyVersion) {
        fields.consent.checked = false;
        throw new Error(policyChangedMessage);
      }
      const body = JSON.stringify({
        name: fields.name.value.trim(),
        text: fields.text.value.trim(),
        consent: fields.consent.checked,
        policyVersion: state.features.policyVersion,
        website: fields.website.value,
      });
      if (pendingReview?.body !== body) pendingReview = { body, key: uuid() };
      await api("/api/reviews", {
        method: "POST",
        body,
        headers: { "Idempotency-Key": pendingReview.key },
      });
      pendingReview = undefined;
      reviewForm.reset();
      status.textContent =
        "Спасибо за отзыв. Он отправлен на модерацию и появится на странице после одобрения.";
    } catch (error) {
      if (error.fields?.policyVersion) {
        pendingReview = undefined;
        fields.consent.checked = false;
        try {
          await bootstrap(true);
        } catch {}
        showReviewError(policyChangedMessage);
      } else {
        const fieldError = Object.values(error.fields || {}).find(
          (value) => typeof value === "string",
        );
        showReviewError(fieldError || error.message);
      }
    } finally {
      reviewBusy = false;
      fields.name.readOnly = fields.text.readOnly = false;
      fields.consent.disabled = false;
      submit.textContent = label;
      syncReviewForm();
    }
  });

  const menuToggle = $(".menu-toggle");
  const mainNav = $("#main-nav");
  function closeMenu() {
    if (!menuToggle) return;
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Открыть меню");
    mainNav.classList.remove("is-open");
  }
  menuToggle?.addEventListener("click", () => {
    const open = menuToggle.getAttribute("aria-expanded") !== "true";
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute(
      "aria-label",
      open ? "Закрыть меню" : "Открыть меню",
    );
    mainNav.classList.toggle("is-open", open);
  });
  mainNav?.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      menuToggle?.getAttribute("aria-expanded") === "true"
    ) {
      closeMenu();
      menuToggle.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (
      menuToggle?.getAttribute("aria-expanded") === "true" &&
      !event.target.closest(".header")
    )
      closeMenu();
  });
  if (
    location.pathname === "/" &&
    ["#careers", "#about", "#contacts", "#information", "#corporate"].includes(
      location.hash,
    )
  ) {
    const destinations = {
      "#careers": "/careers",
      "#about": "/about",
      "#contacts": "/contacts",
      "#information": "/contacts#requisites",
      "#corporate": "/about",
    };
    location.replace(destinations[location.hash]);
  }

  let toastTimer;
  $$("[data-copy]").forEach((button) =>
    button.addEventListener("click", async () => {
      const toast = $("#copy-toast");
      let copied = false;
      let copyTimeout;
      try {
        const writing = navigator.clipboard?.writeText(button.dataset.copy);
        if (!writing) throw new Error("Clipboard unavailable");
        await Promise.race([
          writing,
          new Promise((_, reject) => {
            copyTimeout = setTimeout(
              () => reject(new Error("Clipboard timeout")),
              1200,
            );
          }),
        ]);
        copied = true;
      } catch {
        const temp = document.createElement("textarea");
        temp.value = button.dataset.copy;
        temp.setAttribute("readonly", "");
        temp.className = "sr-only";
        document.body.append(temp);
        temp.select();
        try {
          copied = document.execCommand("copy");
        } catch {}
        temp.remove();
        button.focus();
      } finally {
        clearTimeout(copyTimeout);
      }
      if (toast) {
        toast.textContent = copied
          ? "Реквизиты скопированы"
          : "Не удалось скопировать. Выделите и скопируйте текст вручную.";
        toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
          toast.hidden = true;
        }, 3500);
      }
    }),
  );

  const applicationForm = $("#application-form");
  const applicationSubmit = $("#application-submit");
  let applicationBusy = false;
  let applicationStep = 0;
  let applicationKey = uuid();
  let pendingApplication = null;
  const startedAt = Date.now();
  function collectionAllowed() {
    return !!(
      state.csrf &&
      state.features.policyReady &&
      state.features.intakeEnabled
    );
  }
  function syncCollectionState() {
    if (applicationForm) {
      const allowed = collectionAllowed();
      applicationForm.dataset.enabled = String(allowed);
      applicationSubmit.disabled = !allowed || applicationBusy;
      const consent = applicationForm.elements.consent;
      consent.disabled =
        !state.features.policyReady ||
        applicationBusy ||
        Boolean(pendingApplication);
      if (!state.features.policyReady) consent.checked = false;
      const note = $("#application-submit-note");
      if (note && !applicationBusy)
        note.textContent = allowed
          ? "Отправка анкеты не является заключением договора."
          : "Приём анкет пока не запущен. Данные не отправляются.";
      // The server-rendered notice remains truthful until a fresh approved page is loaded.
      const gateNotice = $(".application-main > .notice");
      if (gateNotice) gateNotice.hidden = allowed;
      const policyHint = $(".consent-box .field-hint");
      if (policyHint) {
        policyHint.hidden = allowed;
        policyHint.textContent = state.features.policyReady
          ? "Документы опубликованы. Приём анкет пока не запущен."
          : "Документы об обработке данных ещё не опубликованы. Согласие и отправка пока недоступны.";
      }
    }
  }
  function appElement(name) {
    const control = applicationForm?.elements.namedItem(name);
    return control instanceof RadioNodeList
      ? [...control].find((input) => input.checked) || control[0]
      : control;
  }
  function appChoiceTitle(name) {
    return (
      appElement(name)?.closest("label")?.querySelector("strong")
        ?.textContent || ""
    );
  }
  function showAppError(message, fields = {}) {
    const summary = $("#application-error");
    summary.replaceChildren();
    const text = document.createElement("p");
    text.textContent = message;
    summary.append(text);
    summary.hidden = false;
    if (fields && typeof fields === "object")
      Object.entries(fields).forEach(([name, value]) =>
        setFieldError(
          name,
          Array.isArray(value) ? value.join(" ") : String(value),
        ),
      );
  }
  function clearAppErrors() {
    if (!applicationForm) return;
    $("#application-error").hidden = true;
    $$(".field-error", applicationForm).forEach((el) => {
      el.hidden = true;
      el.textContent = "";
    });
    $$("[aria-invalid]", applicationForm).forEach((el) =>
      el.removeAttribute("aria-invalid"),
    );
  }
  function setFieldError(name, message) {
    const element = appElement(name);
    const error = $("#error-" + name);
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
    if (element instanceof HTMLElement)
      element.setAttribute("aria-invalid", "true");
  }
  function validateApplication(step) {
    clearAppErrors();
    const errors = {};
    if (step === 0) {
      if (appElement("description").value.trim().length < 10)
        errors.description =
          "Опишите задачу или комментарий не менее чем в 10 символах.";
      const choice = appElement(
        appElement("kind").value === "career" ? "job" : "service",
      );
      if (!choice?.value || !choice.checked)
        errors[appElement("kind").value === "career" ? "job" : "service"] =
          "Выберите опубликованную услугу или вакансию.";
    }
    if (step === 0 || step === 2) {
      for (const name of [
        "description",
        ...(appElement("kind").value === "career" ? ["experience"] : []),
      ]) {
        const error = draftLanguageError(appElement(name).value);
        if (error) errors[name] = error;
      }
    }
    if (step === 1) {
      const name = appElement("name").value.trim(),
        email = appElement("email").value.trim(),
        phone = appElement("phone").value.trim();
      if (customerNameError(name)) errors.name = customerNameError(name);
      if (
        appElement("birthDate").dataset.maskError ||
        normalizeBirthDate(appElement("birthDate").value) === null
      )
        errors.birthDate =
          appElement("birthDate").dataset.maskError ||
          "Укажите существующую дату в формате ДД.ММ.ГГГГ: не в будущем и не старше 120 лет.";
      if (email && !appElement("email").validity.valid)
        errors.email = "Проверьте адрес электронной почты.";
      if (
        appElement("phone").dataset.maskError ||
        (phone && normalizeRussianPhone(phone) === null)
      )
        errors.phone =
          appElement("phone").dataset.maskError ||
          "Введите корректный российский номер: 10 цифр после +7.";
      if (normalizeSettlementName(appElement("city")?.value || "") === null)
        errors.city = "Проверьте название населённого пункта.";
      if (!email && !phone) {
        errors.email = "Укажите электронную почту или телефон для ответа.";
        errors.phone = "Достаточно одного действующего контакта.";
      }
    }
    if (step === 2 && !appElement("consent").checked)
      errors.consent =
        "Чтобы отправить анкету, необходимо дать согласие на обработку данных.";
    if (Object.keys(errors).length) {
      const moderationMessage = Object.values(errors).find(
        (error) =>
          error === PROFANITY_BLOCKED_MESSAGE ||
          error === MODERATION_UNAVAILABLE_MESSAGE,
      );
      showAppError(moderationMessage || "Проверьте отмеченные поля.", errors);
      const first = appElement(Object.keys(errors)[0]),
        panel = first?.closest("[data-form-step]");
      if (panel && Number(panel.dataset.formStep) !== applicationStep)
        showApplicationStep(Number(panel.dataset.formStep), false);
      first?.focus();
      return false;
    }
    return true;
  }
  function showApplicationStep(step, focus = true) {
    applicationStep = step;
    $$("[data-form-step]", applicationForm).forEach((panel, index) => {
      panel.hidden = index !== step;
    });
    $$("[data-step-indicator]").forEach((item, index) => {
      item.classList.toggle("is-active", index === step);
      item.classList.toggle("is-complete", index < step);
      if (index === step) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    $("#application-live").textContent =
      `Шаг ${step + 1} из 3: ${["задача", "контакты", "проверка данных"][step]}.`;
    if (step === 2) buildReview();
    if (focus) {
      const heading = $(
        '[data-form-step="' + step + '"] .form-panel-heading h2',
        applicationForm,
      );
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      applicationForm.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
    }
  }
  function selectKind() {
    const career = appElement("kind").value === "career";
    applicationForm.dataset.kind = career ? "career" : "client";
    $("#apply-detail-title").textContent = career
      ? "Вакансия и опыт"
      : "Детали обращения";
    $$("[data-client-fields]", applicationForm).forEach((group) => {
      group.hidden = career;
      $$("input,select,textarea", group).forEach((input) => {
        input.disabled = career;
      });
    });
    $$("[data-career-fields]", applicationForm).forEach((group) => {
      group.hidden = !career;
      $$("input,select,textarea", group).forEach((input) => {
        input.disabled = !career;
      });
    });
    const descriptionLabel = $(
      'label[for="apply-description"]',
      applicationForm,
    );
    descriptionLabel.replaceChildren(
      document.createTextNode(
        career ? "Короткий комментарий " : "Описание задачи ",
      ),
    );
    const star = document.createElement("span");
    star.setAttribute("aria-hidden", "true");
    star.textContent = "*";
    descriptionLabel.append(star);
    appElement("description").placeholder = career
      ? "Почему вам интересна эта роль?"
      : "На каком этапе находится сделка и в каких вопросах требуется сопровождение?";
    const heading = $(
      '[data-form-step="0"] .form-panel-heading h2',
      applicationForm,
    );
    heading.textContent = career ? "Интересующая роль" : "О чём поговорим?";
    const intro = $(
      '[data-form-step="0"] .form-panel-heading > p',
      applicationForm,
    );
    intro.textContent = career
      ? "Выберите вакансию и расскажите о релевантном опыте."
      : "Кратко опишите ситуацию, текущий этап и открытые вопросы.";
    updateApplicationContext();
  }
  function updateApplicationContext() {
    $("#apply-context").textContent = appChoiceTitle(
      appElement("kind").value === "career" ? "job" : "service",
    );
  }
  function buildReview() {
    const career = appElement("kind").value === "career";
    const data = [
      ["Тип обращения", career ? "Отклик на вакансию" : "Сопровождение сделки"],
      [
        career ? "Вакансия" : "Услуга",
        appChoiceTitle(career ? "job" : "service"),
      ],
      ["Описание", appElement("description").value.trim()],
    ];
    if (career && appElement("experience").value.trim())
      data.push(["Опыт", appElement("experience").value.trim()]);
    data.push([
      "ФИО",
      normalizeCustomerName(appElement("name").value) ||
        appElement("name").value.trim(),
    ]);
    const birthDate = appElement("birthDate").value;
    if (birthDate) data.push(["Дата рождения", formatBirthDate(birthDate)]);
    if (appElement("email").value.trim())
      data.push(["Почта", appElement("email").value.trim()]);
    if (appElement("phone").value.trim())
      data.push(["Телефон", "+7 " + appElement("phone").value.trim()]);
    const city = normalizeSettlementName(appElement("city")?.value || "");
    if (city) data.push(["Населённый пункт", city]);
    const review = $("#application-review");
    review.replaceChildren();
    for (const [key, value] of data) {
      const row = document.createElement("div"),
        dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = key;
      dd.textContent = value;
      row.append(dt, dd);
      review.append(row);
    }
  }
  function applicationPayload() {
    const career = appElement("kind").value === "career";
    const data = {
      kind: career ? "career" : "client",
      name: normalizeCustomerName(appElement("name").value),
      birthDate: normalizeBirthDate(appElement("birthDate").value),
      email: appElement("email").value.trim(),
      phone: normalizeRussianPhone(appElement("phone").value),
      city: normalizeSettlementName(appElement("city")?.value || ""),
      description: appElement("description").value,
      consent: appElement("consent").checked,
      policyVersion: state.features.policyVersion,
      website: appElement("website").value,
      startedAt,
    };
    if (career) {
      data.job = appElement("job").value;
      data.experience = appElement("experience").value;
    } else data.service = appElement("service").value;
    return data;
  }
  if (applicationForm) {
    applicationSubmit.disabled = true;
    appElement("consent").disabled = true;
    $$("[data-next-step]", applicationForm).forEach((button) =>
      button.addEventListener("click", () => {
        if (validateApplication(applicationStep))
          showApplicationStep(Math.min(2, applicationStep + 1));
      }),
    );
    $$("[data-prev-step]", applicationForm).forEach((button) =>
      button.addEventListener("click", () => {
        clearAppErrors();
        showApplicationStep(Math.max(0, applicationStep - 1));
      }),
    );
    applicationForm.addEventListener("change", (event) => {
      if (event.target.matches('input[name="kind"]')) {
        selectKind();
        clearAppErrors();
      } else if (
        event.target.matches('input[name="job"],input[name="service"]')
      )
        updateApplicationContext();
    });
    bindRussianPhoneInput(appElement("phone"));
    bindBirthDateInput(appElement("birthDate"));
    if (appElement("city")) mountSettlementPicker(appElement("city"));
    applicationForm.addEventListener("input", (event) => {
      const target = event.target;
      if (target.name && target.dataset.maskError) {
        setFieldError(target.name, target.dataset.maskError);
        return;
      }
      if (target.name && target.hasAttribute("aria-invalid")) {
        target.removeAttribute("aria-invalid");
        const error = $("#error-" + target.name);
        if (error) error.hidden = true;
      }
    });
    applicationForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (applicationBusy) return;
      if (applicationStep < 2) {
        if (validateApplication(applicationStep))
          showApplicationStep(applicationStep + 1);
        return;
      }
      if (!collectionAllowed()) {
        showAppError("Приём анкет пока не запущен. Данные не отправлены.");
        return;
      }
      if (!pendingApplication && !validateApplication(2)) return;
      pendingApplication ||= applicationPayload();
      applicationBusy = true;
      applicationSubmit.disabled = true;
      applicationSubmit.textContent = "Отправляем…";
      $$("[data-prev-step]", applicationForm).forEach((button) => {
        button.disabled = true;
      });
      $("#application-live").textContent =
        "Отправляем анкету. Дождитесь подтверждения сервера.";
      let consentVersionChanged = false;
      try {
        const result = await api("/api/applications", {
          method: "POST",
          headers: { "Idempotency-Key": applicationKey },
          body: JSON.stringify(pendingApplication),
        });
        if (!result.reference || !result.id)
          throw new ApiError(
            "Не получено подтверждение приёма. Повторите отправку с теми же данными.",
          );
        $("#application-reference").textContent = String(result.reference);
        applicationForm.hidden = true;
        $("#application-success").hidden = false;
        $("#application-success").focus();
        $("#application-live").textContent =
          "Анкета получена. Номер обращения " + result.reference + ".";
        pendingApplication = null;
        applicationKey = uuid();
      } catch (error) {
        if (
          (error.status >= 400 && error.status < 500 && error.status !== 429) ||
          error.code === "moderation_unavailable"
        ) {
          pendingApplication = null;
          applicationKey = uuid();
          $$("[data-prev-step]", applicationForm).forEach((button) => {
            delete button.dataset.retryLocked;
          });
        }
        const policyChanged = !!error.fields?.policyVersion;
        if (policyChanged) {
          consentVersionChanged = true;
          try {
            await bootstrap(true);
          } catch {}
          appElement("consent").checked = false;
        }
        if (
          error.code === "collection_disabled" ||
          error.code === "policy_not_ready"
        ) {
          state.features.intakeEnabled = false;
          syncCollectionState();
        }
        const fields = error.fields || {};
        const firstName = Object.keys(fields).find((name) => appElement(name));
        if (firstName) {
          const target = appElement(firstName);
          const panel = target.closest("[data-form-step]");
          if (panel) showApplicationStep(Number(panel.dataset.formStep));
        }
        showAppError(
          policyChanged ? policyChangedMessage : error.message,
          fields,
        );
        $("#application-live").textContent =
          "Анкета не подтверждена. Данные сохранены в форме.";
        $("#application-submit-note").textContent = pendingApplication
          ? "Подтверждение не получено. Повторная отправка использует ту же анкету и защищена от дублирования."
          : "Проверьте сведения и попробуйте отправить ещё раз. Данные сохранены в форме.";
        if (pendingApplication) {
          // Retry an uncertain request verbatim; do not silently submit an edited body with its old key.
          $$("[data-prev-step]", applicationForm).forEach((button) => {
            button.dataset.retryLocked = "true";
          });
          appElement("consent").disabled = true;
        }
        $("#application-error").scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      } finally {
        applicationBusy = false;
        applicationSubmit.disabled = !collectionAllowed();
        applicationSubmit.textContent = pendingApplication
          ? "Повторить отправку"
          : "Отправить анкету ↗";
        appElement("consent").disabled =
          !state.features.policyReady || Boolean(pendingApplication);
        $$("[data-prev-step]", applicationForm).forEach((button) => {
          button.disabled = button.dataset.retryLocked === "true";
        });
        if (
          consentVersionChanged &&
          !pendingApplication &&
          state.features.policyReady
        )
          appElement("consent").focus({ preventScroll: true });
      }
    });
  }

  // Only the server-owned HttpOnly cookie identifies a visitor.
  bootstrap().catch(() => {
    if (reviewForm?.dataset.enabled === "true") {
      syncReviewForm();
    }
  });
})();
