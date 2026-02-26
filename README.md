# ever-craft2

## Localization (EN/RU)

This project uses key-based localization with runtime fallback:

- Baseline locale: `locales/en.json`
- Russian locale: `locales/ru.json`
- Runtime loader/translator: `assets/i18n-runtime.js`

### Language selection

- The game stores language in `localStorage` key `evercraft-language`.
- Default behavior:
  - If user already selected a language, use it.
  - Otherwise, if browser language starts with `ru`, use Russian.
  - Else use English.
- A language dropdown is injected into Settings.

### Adding or changing translations

1. Add/update keys in `locales/en.json`.
2. Add matching keys in `locales/ru.json`.
3. Keep placeholders identical between locales (for example `{count}`, `{name}`).
4. For pluralized entries:
   - EN: `one`, `other`
   - RU: `one`, `few`, `many` (optionally `other`)

Key conventions are documented in `locales/schema.md`.

### Validate locale consistency

Run:

```bash
node scripts/i18n/validate-locales.mjs
```

This checks:

- key parity between EN and RU
- placeholder parity
- plural-form requirements

### Missing key diagnostics at runtime

Enable missing-key logs:

```js
window.__ecI18n.setDebugMissing(true)
```

Then inspect unresolved keys:

```js
window.__ecI18n.reportMissingKeys()
```
