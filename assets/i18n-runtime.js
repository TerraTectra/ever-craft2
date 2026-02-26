(function () {
  "use strict";

  const LANGUAGE_STORAGE_KEY = "evercraft-language";
  const DEBUG_STORAGE_KEY = "evercraft-i18n-debug-missing";
  const SUPPORTED_LANGUAGES = ["en", "ru"];

  const state = {
    lang: "en",
    locales: { en: {}, ru: {} },
    debugMissing: false,
    missingKeys: new Set(),
    rawEntries: [],
    wordEntries: []
  };

  function safeGetStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeSetStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_) {
      /* no-op */
    }
  }

  function normalizeLang(input) {
    if (!input || typeof input !== "string") return "en";
    const short = input.toLowerCase().slice(0, 2);
    return SUPPORTED_LANGUAGES.includes(short) ? short : "en";
  }

  function detectInitialLanguage() {
    const stored = normalizeLang(safeGetStorage(LANGUAGE_STORAGE_KEY));
    if (stored !== "en" || safeGetStorage(LANGUAGE_STORAGE_KEY) === "en") {
      return stored;
    }

    const browserLang = normalizeLang(window.navigator.language || "");
    return browserLang === "ru" ? "ru" : "en";
  }

  function loadLocaleSync(lang) {
    const request = new XMLHttpRequest();
    request.open("GET", "locales/" + lang + ".json", false);
    request.send(null);
    if ((request.status >= 200 && request.status < 300 || request.status === 0) && request.responseText) {
      return JSON.parse(request.responseText);
    }
    return {};
  }

  function ensureSections(locale) {
    const normalized = locale || {};
    if (!normalized.strings || typeof normalized.strings !== "object") normalized.strings = {};
    if (!normalized.raw || typeof normalized.raw !== "object") normalized.raw = {};
    if (!normalized.words || typeof normalized.words !== "object") normalized.words = {};
    return normalized;
  }

  function getSection(locale, scope) {
    if (!locale || typeof locale !== "object") return {};
    const section = locale[scope];
    return section && typeof section === "object" ? section : {};
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function getScopedValue(locale, scope, key) {
    const section = getSection(locale, scope);
    return hasOwn(section, key) ? section[key] : undefined;
  }

  function normalizeCount(value) {
    if (typeof value === "number") return value;
    const raw = String(value == null ? "" : value).replace(/[,\s]/g, "");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function pluralForm(lang, count) {
    const n = Math.abs(Math.trunc(normalizeCount(count)));
    if (lang === "ru") {
      if (n % 10 === 1 && n % 100 !== 11) return "one";
      if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return "few";
      return "many";
    }
    return n === 1 ? "one" : "other";
  }

  function interpolate(template, vars) {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, name) {
      if (vars && hasOwn(vars, name)) return String(vars[name]);
      return match;
    });
  }

  function trackMissing(scope, key) {
    const full = scope + ":" + key;
    if (!state.missingKeys.has(full)) {
      state.missingKeys.add(full);
      if (state.debugMissing) {
        const prefix = getString("strings", "debug.missing_prefix", {}, "en");
        console.warn(prefix + " " + full);
      }
    }
  }

  function formatLocalizedValue(value, vars, langForRules) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const form = pluralForm(langForRules, vars && hasOwn(vars, "count") ? vars.count : 0);
      value = value[form] ?? value.other ?? value.many ?? value.few ?? value.one;
    }

    if (typeof value !== "string") return "";
    return interpolate(value, vars || {});
  }

  function getString(scope, key, vars, fallbackLang) {
    const lang = fallbackLang || state.lang;
    const preferred = getScopedValue(state.locales[lang], scope, key);
    if (preferred !== undefined) {
      return formatLocalizedValue(preferred, vars, lang);
    }

    const english = getScopedValue(state.locales.en, scope, key);
    if (english !== undefined) {
      if (lang !== "en") trackMissing(scope, key);
      return formatLocalizedValue(english, vars, "en");
    }

    trackMissing(scope, key);
    return key;
  }

  function t(key, vars, options) {
    const scope = options && options.scope ? options.scope : "strings";
    return getString(scope, key, vars || {}, state.lang);
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function rebuildReplacementCaches() {
    const enRaw = getSection(state.locales.en, "raw");
    state.rawEntries = Object.entries(enRaw)
      .filter(function (entry) {
        return typeof entry[1] === "string" && entry[1].length > 0;
      })
      .map(function (entry) {
        return { key: entry[0], source: entry[1] };
      })
      .sort(function (a, b) {
        return b.source.length - a.source.length;
      });

    const enWords = getSection(state.locales.en, "words");
    state.wordEntries = Object.entries(enWords)
      .filter(function (entry) {
        return typeof entry[1] === "string" && entry[1].length > 0;
      })
      .map(function (entry) {
        return {
          key: entry[0],
          source: entry[1],
          regex: new RegExp("\\b" + escapeRegex(entry[1]) + "\\b", "g")
        };
      })
      .sort(function (a, b) {
        return b.source.length - a.source.length;
      });
  }

  const DYNAMIC_RULES = [
    { key: "tabs.main.count", vars: ["count"], textPattern: /^Main \(([^)]+)\)$/, htmlPattern: /Main \(([^)]+)\)/g },
    { key: "tabs.research.count", vars: ["count"], textPattern: /^Research \(([^)]+)\)$/, htmlPattern: /Research \(([^)]+)\)/g },
    { key: "tabs.prestige.count", vars: ["count"], textPattern: /^Prestige \(([^)]+)\)$/, htmlPattern: /Prestige \(([^)]+)\)/g },
    { key: "tabs.tier.count", vars: ["count"], textPattern: /^Tier \(([^)]+)\)$/, htmlPattern: /Tier \(([^)]+)\)/g },
    { key: "ui.time_warp.button", vars: ["count"], textPattern: /^Time Warp \(([^)]+)\)$/, htmlPattern: /Time Warp \(([^)]+)\)/g },
    { key: "popup.accept_charges", vars: ["count"], textPattern: /^Accept ([\d.,]+) Charges?$/, htmlPattern: /Accept ([\d.,]+) Charges?/g },
    { key: "time.h_m", vars: ["hours", "minutes"], textPattern: /^(\d+)h (\d+)m$/, htmlPattern: /(\d+)h (\d+)m/g },
    { key: "time.d_h", vars: ["days", "hours"], textPattern: /^(\d+)d (\d+)h$/, htmlPattern: /(\d+)d (\d+)h/g },
    { key: "time.skipped", vars: ["value"], textPattern: /^\((.+) skipped\)$/, htmlPattern: /\(([^)]+) skipped\)/g },
    { key: "afford.in", vars: ["value"], textPattern: /^Can afford in: (.+)$/, htmlPattern: /Can afford in: ([^<\n]+)/g },
    { key: "ui.theme_applied", vars: ["name"], textPattern: /^Applied "(.+)" theme!$/ }
  ];

  function applyDynamicRules(value, htmlMode) {
    if (typeof value !== "string" || value.length === 0) return value;
    let out = value;

    for (const rule of DYNAMIC_RULES) {
      const pattern = htmlMode ? rule.htmlPattern : rule.textPattern;
      if (!pattern) continue;

      if (!htmlMode) {
        const match = out.match(pattern);
        if (!match) continue;
        const vars = {};
        for (let i = 0; i < rule.vars.length; i += 1) {
          vars[rule.vars[i]] = match[i + 1];
        }
        if (hasOwn(vars, "count")) {
          vars.count = String(vars.count);
        }
        out = t(rule.key, vars);
        continue;
      }

      out = out.replace(pattern, function () {
        const args = Array.from(arguments);
        const vars = {};
        for (let i = 0; i < rule.vars.length; i += 1) {
          vars[rule.vars[i]] = args[i + 1];
        }
        if (hasOwn(vars, "count")) {
          vars.count = String(vars.count);
        }
        return t(rule.key, vars);
      });
    }

    return out;
  }

  function translateText(value) {
    if (state.lang === "en" || typeof value !== "string" || value.length === 0) return value;

    let out = applyDynamicRules(value, false);

    for (const entry of state.rawEntries) {
      if (out === entry.source) {
        out = t(entry.key, {}, { scope: "raw" });
        break;
      }
    }

    for (const entry of state.wordEntries) {
      const translated = t(entry.key, {}, { scope: "words" });
      if (translated && translated !== entry.source) {
        out = out.replace(entry.regex, translated);
      }
    }

    return out;
  }

  function translateHtml(value) {
    if (state.lang === "en" || typeof value !== "string" || value.length === 0) return value;

    let out = applyDynamicRules(value, true);

    for (const entry of state.rawEntries) {
      const translated = t(entry.key, {}, { scope: "raw" });
      if (translated && translated !== entry.source && out.includes(entry.source)) {
        out = out.split(entry.source).join(translated);
      }
    }

    return out;
  }

  function setLanguage(lang, persistChoice) {
    state.lang = normalizeLang(lang);
    document.documentElement.lang = state.lang;
    if (persistChoice) safeSetStorage(LANGUAGE_STORAGE_KEY, state.lang);
    window.dispatchEvent(new CustomEvent("ec:i18n-language-changed", { detail: { lang: state.lang } }));
  }

  function setDebugMissing(enabled) {
    state.debugMissing = Boolean(enabled);
    safeSetStorage(DEBUG_STORAGE_KEY, state.debugMissing ? "1" : "0");
  }

  function patchDomSetters() {
    if (window.__ecI18nDomPatched) return;
    window.__ecI18nDomPatched = true;

    const innerHtmlDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    if (innerHtmlDescriptor && innerHtmlDescriptor.set) {
      Object.defineProperty(Element.prototype, "innerHTML", {
        get: function () {
          return innerHtmlDescriptor.get.call(this);
        },
        set: function (value) {
          let next = value;
          if (
            typeof next === "string" &&
            this.tagName !== "SCRIPT" &&
            this.tagName !== "STYLE" &&
            this.tagName !== "TEXTAREA"
          ) {
            next = translateHtml(next);
          }
          return innerHtmlDescriptor.set.call(this, next);
        }
      });
    }

    const textContentDescriptor = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
    if (textContentDescriptor && textContentDescriptor.set) {
      Object.defineProperty(Node.prototype, "textContent", {
        get: function () {
          return textContentDescriptor.get.call(this);
        },
        set: function (value) {
          let next = value;
          if (typeof next === "string") {
            const host = this.nodeType === Node.TEXT_NODE ? this.parentElement : this;
            const tag = host && host.tagName ? host.tagName : "";
            if (tag !== "SCRIPT" && tag !== "STYLE" && tag !== "TEXTAREA") {
              next = translateText(next);
            }
          }
          return textContentDescriptor.set.call(this, next);
        }
      });
    }

    const innerTextDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "innerText");
    if (innerTextDescriptor && innerTextDescriptor.set) {
      Object.defineProperty(HTMLElement.prototype, "innerText", {
        get: function () {
          return innerTextDescriptor.get.call(this);
        },
        set: function (value) {
          let next = value;
          if (typeof next === "string") {
            next = translateText(next);
          }
          return innerTextDescriptor.set.call(this, next);
        }
      });
    }

    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      let next = value;
      if (
        typeof next === "string" &&
        (name === "title" || name === "placeholder" || name === "aria-label")
      ) {
        next = translateText(next);
      }
      return originalSetAttribute.call(this, name, next);
    };
  }

  function ensureLanguageControl() {
    const main = document.getElementById("main-content");
    if (!main) return;
    if (!main.querySelector('[data-action="show-hotkeys"]')) return;

    let host = main.querySelector("[data-language-control]");
    if (!host) {
      host = document.createElement("div");
      host.className = "mb-8";
      host.setAttribute("data-language-control", "true");
      const firstSection = main.querySelector(".mb-8");
      if (firstSection) {
        main.insertBefore(host, firstSection);
      } else {
        main.prepend(host);
      }
    }

    host.innerHTML = [
      '<h2 class="text-xl text-gold mb-4">' + t("settings.language.title") + "</h2>",
      '<div class="flex items-center gap-4">',
      '  <label for="ec-language-select" class="text-steel font-mono">' + t("settings.language.selector_label") + "</label>",
      '  <select id="ec-language-select" data-input="language-select" class="px-3 py-2 bg-panel border-2 border-text text-text font-mono">',
      '    <option value="en">' + t("settings.language.option.en") + "</option>",
      '    <option value="ru">' + t("settings.language.option.ru") + "</option>",
      "  </select>",
      "</div>",
      '<div class="text-xs text-muted mt-2">' + t("settings.language.reload_hint") + "</div>"
    ].join("");

    const select = host.querySelector('[data-input="language-select"]');
    if (!select) return;
    select.value = state.lang;
    select.onchange = function (event) {
      const next = normalizeLang(event.target.value);
      if (next === state.lang) return;
      setLanguage(next, true);
      window.location.reload();
    };
  }

  function installLanguageControl() {
    ensureLanguageControl();
    window.setInterval(ensureLanguageControl, 1200);
  }

  state.locales.en = ensureSections(loadLocaleSync("en"));
  state.locales.ru = ensureSections(loadLocaleSync("ru"));
  rebuildReplacementCaches();

  state.debugMissing = safeGetStorage(DEBUG_STORAGE_KEY) === "1" || Boolean(window.__EC_I18N_DEBUG_MISSING);
  setLanguage(detectInitialLanguage(), false);
  patchDomSetters();

  window.__ecI18n = {
    t: t,
    getLanguage: function () {
      return state.lang;
    },
    setLanguage: setLanguage,
    setDebugMissing: setDebugMissing,
    getDebugMissing: function () {
      return state.debugMissing;
    },
    reportMissingKeys: function () {
      return Array.from(state.missingKeys).sort();
    },
    clearMissingKeys: function () {
      state.missingKeys.clear();
    },
    translateText: translateText,
    translateHtml: translateHtml
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installLanguageControl, { once: true });
  } else {
    installLanguageControl();
  }
})();
