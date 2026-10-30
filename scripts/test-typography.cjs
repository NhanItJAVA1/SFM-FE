/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/theme/typography.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const { interFont, resolveTypography, Typography } = new Function('exports', `${compiled.outputText}; return exports;`)({});

test('top-level text gets a readable default; nested spans inherit size and face', () => {
  assert.equal(resolveTypography().fontFamily, 'AppInter');
  assert.equal(resolveTypography().fontSize, 14);
  assert.deepEqual(resolveTypography({ color: 'red' }, true, true), { color: 'red' });
  assert.equal(resolveTypography({ fontWeight: '600' }, true, true).fontFamily, 'AppInterSemiBold');
});

test('font loading failure uses system weights without an unavailable font family', () => {
  const fallback = resolveTypography({ fontWeight: '900', color: 'red' }, false);
  assert.equal(fallback.fontFamily, undefined);
  assert.equal(fallback.fontWeight, '700');
  assert.equal(fallback.color, 'red');
});

test('semibold and bold weights select real font faces without synthetic bold', () => {
  assert.deepEqual(interFont('600'), { fontFamily: 'AppInterSemiBold', fontWeight: 'normal' });
  for (const weight of ['700', '800', '900', 'bold', 700]) {
    assert.deepEqual(interFont(weight), { fontFamily: 'AppInterBold', fontWeight: 'normal' });
  }
  assert.equal(interFont('500').fontFamily, 'AppInterMedium');
  assert.equal(interFont('normal').fontFamily, 'AppInter');
});

test('custom-size inputs get enough line height and retain explicit layout overrides', () => {
  const amount = resolveTypography({ fontSize: 32 }, true, false, Typography.bodyLarge);
  assert.equal(amount.lineHeight, 45);
  assert.equal(resolveTypography({ fontSize: 32, lineHeight: 48 }).lineHeight, 48);
  assert.equal(resolveTypography({}, true, false, Typography.bodyLarge).fontSize, 16);
});

test('code preserves its explicit monospace face and weight', () => {
  const code = { fontFamily: 'monospace', fontWeight: '700', fontSize: 12, lineHeight: 18 };
  assert.deepEqual(resolveTypography(code), code);
});

test('web rendering keeps nested inheritance, style array precedence and input props', () => {
  const React = require('react');
  const nativeWeb = require('react-native-web');
  const { renderToStaticMarkup } = require('react-dom/server');
  const componentSource = fs.readFileSync(path.join(__dirname, '../src/components/app-text.tsx'), 'utf8');
  const componentCode = ts.transpileModule(componentSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const components = {};
  const importModule = name => name === 'react-native' ? nativeWeb
    : name === '@/theme/typography' ? { interFont, resolveTypography, Typography } : require(name);
  new Function('require', 'exports', componentCode)(importModule, components);
  const { AppText, AppTextInput, AppTypographyProvider } = components;
  const markup = renderToStaticMarkup(React.createElement(AppTypographyProvider, { ready: true },
    React.createElement(AppText, { style: [Typography.title, { color: '#123456' }] },
      'Tổng quan ', React.createElement(AppText, { style: { color: '#654321' } }, 'Chi tiêu')),
    React.createElement(AppTextInput, { placeholder: 'Số tiền', style: { fontSize: 32 }, value: '123', readOnly: true }),
  ));

  assert.match(markup, /font-family:AppInterSemiBold/);
  assert.match(markup, /<span[^>]*style="color:[^"]+">Chi tiêu<\/span>/);
  assert.match(markup, /font-size:32px;line-height:45px/);
  assert.match(markup, /placeholder="Số tiền"/);
  assert.match(markup, /value="123"/);
});
