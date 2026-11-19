let pickerSequence = 0;
const hintText =
  "Введите первые буквы названия и выберите город, посёлок или село из списка. Если нужного варианта нет, введите название полностью.";

/** Editable suggestions: an unselected value always remains the visitor's text. */
export function mountSettlementPicker(
  input,
  {
    endpoint = "/api/settlements",
    fetchImpl = globalThis.fetch,
    debounceMs = 180,
    maxResults = 10,
  } = {},
) {
  if (!input?.ownerDocument || !input.parentNode)
    return { close() {}, destroy() {} };
  const document = input.ownerDocument;
  const prefix = `${input.id || "settlement"}-picker-${++pickerSequence}`;
  const savedAttributes = new Map(
    [
      "role",
      "aria-autocomplete",
      "aria-controls",
      "aria-expanded",
      "aria-haspopup",
      "aria-activedescendant",
      "aria-describedby",
      "aria-busy",
      "autocomplete",
      "maxlength",
    ].map((name) => [name, input.getAttribute(name)]),
  );
  const wrapper = document.createElement("div");
  wrapper.className = "settlement-picker";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.append(input);
  const panel = document.createElement("div");
  panel.className = "settlement-picker-panel";
  panel.hidden = true;
  const heading = document.createElement("p");
  heading.className = "settlement-picker-heading";
  heading.id = `${prefix}-heading`;
  const list = document.createElement("ul");
  list.className = "settlement-picker-options";
  list.id = `${prefix}-list`;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-labelledby", heading.id);
  const empty = document.createElement("p");
  empty.className = "settlement-picker-empty";
  empty.hidden = true;
  panel.append(heading, list, empty);
  wrapper.append(panel);
  const hint = document.createElement("p");
  hint.className = "field-hint settlement-picker-hint";
  hint.id = `${prefix}-hint`;
  hint.textContent = hintText;
  const status = document.createElement("p");
  status.className = "sr-only";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  wrapper.after(hint, status);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-haspopup", "listbox");
  input.setAttribute("aria-controls", list.id);
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("autocomplete", "address-level2");
  input.setAttribute("maxlength", "160");
  input.setAttribute(
    "aria-describedby",
    [
      ...new Set([
        ...(savedAttributes.get("aria-describedby") || "")
          .split(/\s+/)
          .filter(Boolean),
        hint.id,
      ]),
    ].join(" "),
  );

  let timer = null,
    controller = null,
    revision = 0,
    destroyed = false,
    composing = false,
    notifying = false;
  let items = [],
    options = [],
    active = -1,
    resultQuery = "",
    nextHighlight = 0;
  const queryValue = () =>
    input.value.normalize("NFC").trim().replace(/\s+/gu, " ");
  const interactive = () =>
    !destroyed &&
    !input.disabled &&
    !input.readOnly &&
    document.activeElement === input;
  function invalidate() {
    revision++;
    clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
    input.removeAttribute("aria-busy");
  }
  function highlight(index) {
    active = index;
    options.forEach((option, position) => {
      option.setAttribute("aria-selected", String(position === active));
      option.classList.toggle("is-active", position === active);
    });
    if (active < 0 || !options[active])
      input.removeAttribute("aria-activedescendant");
    else {
      input.setAttribute("aria-activedescendant", options[active].id);
      options[active].scrollIntoView?.({ block: "nearest" });
    }
  }
  function close() {
    invalidate();
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
    highlight(-1);
    nextHighlight = 0;
  }
  function open() {
    const bounds = input.getBoundingClientRect?.();
    if (bounds) {
      const bottom = globalThis.innerHeight || Infinity;
      const above = bounds.top - 80,
        below = bottom - bounds.bottom;
      panel.classList.toggle("is-above", below < 180 && above > below);
    }
    panel.hidden = false;
    input.setAttribute("aria-expanded", String(items.length > 0));
  }
  function render(result, query) {
    resultQuery = query;
    list.replaceChildren();
    options = [];
    active = -1;
    items = (Array.isArray(result?.items) ? result.items : [])
      .filter(
        (item) =>
          typeof item?.label === "string" &&
          item.label.trim() &&
          item.label.length <= 160,
      )
      .slice(0, Math.max(1, Math.min(10, maxResults)));
    heading.textContent = result?.fuzzy
      ? "Похожие варианты"
      : "Населённые пункты";
    heading.hidden = !items.length;
    list.hidden = !items.length;
    empty.hidden = Boolean(items.length);
    empty.textContent = "Не нашли в списке. Можно оставить введённое название.";
    items.forEach((item, index) => {
      const option = document.createElement("li");
      option.id = `${prefix}-option-${index}`;
      option.className = "settlement-picker-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.dataset.index = String(index);
      const name = document.createElement("span");
      name.className = "settlement-picker-name";
      name.textContent = item.name || item.label;
      const detail = document.createElement("span");
      detail.className = "settlement-picker-region";
      detail.textContent = [item.type, item.region].filter(Boolean).join(" · ");
      option.append(name, detail);
      list.append(option);
      options.push(option);
    });
    open();
    status.textContent = items.length
      ? `${result?.fuzzy ? "Похожие варианты" : "Найдено вариантов"}: ${items.length}. Используйте стрелки и Enter для выбора или оставьте своё название.`
      : empty.textContent;
    if (nextHighlight && items.length)
      highlight(nextHighlight > 0 ? 0 : items.length - 1);
    else highlight(-1);
    nextHighlight = 0;
  }
  async function lookup(expectedRevision) {
    timer = null;
    const query = queryValue();
    if (
      !interactive() ||
      composing ||
      query.length < 2 ||
      expectedRevision !== revision
    )
      return;
    const requestController = new AbortController();
    controller = requestController;
    input.setAttribute("aria-busy", "true");
    try {
      const response = await fetchImpl(
        `${endpoint}${endpoint.includes("?") ? "&" : "?"}q=${encodeURIComponent(query)}`,
        {
          method: "GET",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: requestController.signal,
        },
      );
      if (!response.ok) throw new Error("Suggestions unavailable");
      const result = await response.json();
      if (
        expectedRevision !== revision ||
        !interactive() ||
        queryValue() !== query ||
        requestController.signal.aborted
      )
        return;
      render(result, query);
    } catch (error) {
      if (
        error?.name === "AbortError" ||
        requestController.signal.aborted ||
        expectedRevision !== revision ||
        !interactive() ||
        queryValue() !== query
      )
        return;
      items = [];
      options = [];
      list.replaceChildren();
      heading.hidden = true;
      list.hidden = true;
      empty.hidden = false;
      empty.textContent =
        "Подсказки временно недоступны. Можно ввести название самостоятельно.";
      status.textContent = empty.textContent;
      open();
    } finally {
      if (expectedRevision === revision) {
        input.removeAttribute("aria-busy");
        if (controller === requestController) controller = null;
      }
    }
  }
  function search(delay = debounceMs) {
    invalidate();
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
    highlight(-1);
    items = [];
    options = [];
    resultQuery = "";
    if (!interactive() || composing || queryValue().length < 2) {
      status.textContent = "";
      return;
    }
    const expectedRevision = revision;
    timer = setTimeout(() => lookup(expectedRevision), Math.max(0, delay));
  }
  function choose(index) {
    const item = items[index];
    if (!item || !interactive()) return;
    input.value = item.label;
    close();
    items = [];
    options = [];
    resultQuery = "";
    notifying = true;
    try {
      const EventType = document.defaultView?.Event || Event;
      input.dispatchEvent(new EventType("input", { bubbles: true }));
      input.dispatchEvent(new EventType("change", { bubbles: true }));
    } finally {
      notifying = false;
    }
    status.textContent = `Выбрано: ${item.label}`;
  }
  function onInput(event) {
    if (!notifying) {
      nextHighlight = 0;
      if (event.isComposing) {
        invalidate();
        return;
      }
      search();
    }
  }
  function onFocus() {
    search();
  }
  function onBlur() {
    close();
  }
  function onKey(event) {
    if (event.isComposing || composing || input.disabled || input.readOnly)
      return;
    if (event.key === "Escape" && (!panel.hidden || timer || controller)) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Tab") {
      close();
      return;
    }
    if (event.key === "Enter") {
      if (!panel.hidden && active >= 0) {
        event.preventDefault();
        event.stopPropagation();
        choose(active);
      } else close();
      return;
    }
    if (
      !["ArrowDown", "ArrowUp"].includes(event.key) ||
      queryValue().length < 2
    )
      return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    if (items.length && resultQuery === queryValue()) {
      open();
      highlight(
        active < 0
          ? direction > 0
            ? 0
            : items.length - 1
          : (active + direction + items.length) % items.length,
      );
    } else {
      nextHighlight = direction;
      search(0);
    }
  }
  function onMouseDown(event) {
    if (event.target.closest?.('[role="option"]')) event.preventDefault();
  }
  function onClick(event) {
    const option = event.target.closest?.('[role="option"]');
    if (option && list.contains(option)) choose(Number(option.dataset.index));
  }
  function onOutside(event) {
    if (!wrapper.contains(event.target)) close();
  }
  function onCompositionStart() {
    composing = true;
    close();
  }
  function onCompositionEnd() {
    composing = false;
    search();
  }
  input.addEventListener("input", onInput);
  input.addEventListener("focus", onFocus);
  input.addEventListener("blur", onBlur);
  input.addEventListener("keydown", onKey);
  input.addEventListener("compositionstart", onCompositionStart);
  input.addEventListener("compositionend", onCompositionEnd);
  list.addEventListener("mousedown", onMouseDown);
  list.addEventListener("click", onClick);
  document.addEventListener("pointerdown", onOutside);
  return {
    close,
    destroy() {
      if (destroyed) return;
      close();
      destroyed = true;
      input.removeEventListener("input", onInput);
      input.removeEventListener("focus", onFocus);
      input.removeEventListener("blur", onBlur);
      input.removeEventListener("keydown", onKey);
      input.removeEventListener("compositionstart", onCompositionStart);
      input.removeEventListener("compositionend", onCompositionEnd);
      list.removeEventListener("mousedown", onMouseDown);
      list.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onOutside);
      wrapper.replaceWith(input);
      hint.remove();
      status.remove();
      for (const [name, value] of savedAttributes) {
        if (value === null) input.removeAttribute(name);
        else input.setAttribute(name, value);
      }
    },
  };
}
