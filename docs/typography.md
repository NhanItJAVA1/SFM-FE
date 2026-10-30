# User interface typography

User screens use the local Inter Regular, Medium, SemiBold and Bold files in
`assets/fonts/inter`. Keep these assets when removing the admin interface.
`useAppFonts` loads them in the root layout; the app falls back to system fonts
if loading fails.

Use `AppText` and `AppTextInput` from `@/components/app-text` instead of the native
components in user screens. They preserve native props and refs, select the
correct font file, and allow nested text to inherit its parent's typography.
Use `Typography` from `@/theme/typography` for shared text roles:

| Role | Size / line height | Weight |
| --- | --- | --- |
| caption | 12 / 18 | Regular |
| small | 13 / 18 | Regular |
| body | 14 / 20 | Regular |
| bodyLarge (input default) | 16 / 24 | Regular |
| label | 14 / 20 | Medium |
| button | 16 / 24 | SemiBold |
| section | 18 / 24 | SemiBold |
| title | 22 / 28 | SemiBold |
| amount | 28 / 36 | SemiBold |
| tab | 11 / 16 | Medium |

For example, `title: { ...Typography.title, color: theme.text }` can be passed to
`AppText`. For third-party text renderers (SVG or Markdown), use `useInterFont`
to get a font family and weight that also respect the loading fallback.
Code snippets retain their monospace font.
Use `fontWeight: '700'` for explicit bold emphasis, such as the AI analysis label.

Run the typography checks with `node --test scripts/test-typography.cjs`.
