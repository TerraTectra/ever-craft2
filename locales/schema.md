# Locale Schema

Files:
- `locales/en.json` (baseline / fallback)
- `locales/ru.json` (Russian)

Top-level sections:
- `meta`: locale metadata
- `strings`: keyed UI strings and dynamic templates
- `raw`: exact phrase mappings for legacy/static UI fragments
- `words`: word-level fallback translations for runtime text updates

Keying strategy:
- Use stable semantic keys: `domain.section.item`
- Do not use full source sentences as keys
- Examples:
  - `tabs.main`
  - `settings.language.title`
  - `tooltip.net_mana_rate`

Interpolation:
- Use `{var}` placeholders, e.g. `"Time Warp ({count})"`

Pluralization:
- Store pluralized values as objects:
  - English: `one`, `other`
  - Russian: `one`, `few`, `many`, `other`
- Runtime selects plural form from `count`.

Missing keys:
- Runtime falls back to `en`.
- If key is missing in both locales, runtime returns the key and logs when debug mode is enabled.
