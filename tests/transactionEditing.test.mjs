import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildUpdateTransactionPayload, createTransactionEditForm, getTransactionMutationError, parseTransactionDate } from '../src/utils/transactionEditing.ts';

const transaction = {
  id: 1, accountId: 10, categoryId: 20, transferId: null, type: 'Expense', amount: 50000,
  description: 'Ăn trưa', categoryName: 'Ăn uống', transactionDate: '2026-10-25T05:23:45.123Z',
  location: 'Quận 1', isExcluded: true,
};
const accounts = [{ id: 10, isActive: true }, { id: 11, isActive: true }, { id: 12, isActive: false }];
const categories = [{ id: 20, type: 'Expense' }, { id: 21, type: 'Income' }];
const build = (patch = {}, original = transaction) => buildUpdateTransactionPayload(original, { ...createTransactionEditForm(original), ...patch }, accounts, categories);

test('preserves the original instant, location and exclusion flag when editing a note', () => {
  assert.deepEqual(build({ description: '  Ăn tối  ' }), {
    accountId: 10, categoryId: 20, type: 'Expense', amount: 50000, description: 'Ăn tối',
    transactionDate: transaction.transactionDate, location: 'Quận 1', isExcluded: true,
  });
});

test('supports changing wallet, type, category, amount and statistics together', () => {
  const result = build({ accountId: 11, type: 'Income', categoryId: 21, amount: '120,50', isExcluded: false });
  assert.equal(result.accountId, 11);
  assert.equal(result.type, 'Income');
  assert.equal(result.categoryId, 21);
  assert.equal(result.amount, 120.5);
  assert.equal(result.isExcluded, false);
});

test('clears optional fields explicitly instead of omitting old values', () => {
  const result = build({ categoryId: null, description: '  ', location: '' });
  assert.equal(result.categoryId, null);
  assert.equal(result.description, null);
  assert.equal(result.location, null);
});

test('rejects zero, negative, malformed, overprecise and unsafe amounts', () => {
  for (const amount of ['0', '-1', '', '1.234', '1,234,567', '1e3', 'Infinity', '99999999999999999']) {
    assert.throws(() => build({ amount }), /Số tiền/);
  }
});

test('requires an active wallet and a category matching the transaction type', () => {
  assert.throws(() => build({ accountId: 12 }), /ví đang hoạt động/);
  assert.throws(() => build({ accountId: 999 }), /ví đang hoạt động/);
  assert.throws(() => build({ type: 'Income' }), /danh mục phù hợp/);
  assert.throws(() => build({ categoryId: 999 }), /danh mục phù hợp/);
  assert.throws(() => build({ type: 'Unknown' }), /Loại giao dịch/);
});

test('blocks editing either linked transfer legs or legacy transfer types', () => {
  assert.throws(() => build({}, { ...transaction, transferId: 77 }), /chuyển tiền/);
  for (const type of ['TransferIn', 'TransferOut']) assert.throws(() => build({}, { ...transaction, type }), /chuyển tiền/);
});

test('enforces database limits for notes and locations', () => {
  assert.equal(build({ description: 'x'.repeat(500), location: 'x'.repeat(255) }).description.length, 500);
  assert.throws(() => build({ description: 'x'.repeat(501) }), /500 ký tự/);
  assert.throws(() => build({ location: 'x'.repeat(256) }), /255 ký tự/);
});

test('rejects impossible calendar dates and times instead of rolling them over', () => {
  for (const [date, time] of [['31/02/2026', '12:00'], ['29/02/2025', '12:00'], ['00/10/2026', '12:00'], ['01/13/2026', '12:00'], ['25/10/2026', '24:00'], ['25/10/2026', '12:60'], ['2026-10-25', '12:00']]) {
    assert.throws(() => parseTransactionDate(date, time));
  }
  assert.equal(parseTransactionDate('29/02/2024', '23:59').getDate(), 29);
});

test('converts an edited local date and time into the correct API instant', () => {
  const result = build({ date: '26/10/2026', time: '16:45' });
  assert.equal(result.transactionDate, new Date(2026, 9, 26, 16, 45).toISOString());
});

test('maps missing-wallet and transfer protections without exposing server messages', () => {
  const apiError = (code, status = 400) => ({ isAxiosError: true, response: { status, data: { code, message: 'internal database details' } } });
  assert.match(getTransactionMutationError(apiError('FINANCIAL_ACCOUNT_NOT_FOUND', 404)), /Ví không còn hoạt động/);
  assert.match(getTransactionMutationError(apiError('TRANSACTION_NOT_FOUND', 404)), /không còn tồn tại/);
  assert.match(getTransactionMutationError(apiError('TRANSFER_TRANSACTION_READ_ONLY')), /toàn bộ lần chuyển/);
  assert.doesNotMatch(getTransactionMutationError(apiError('OTHER')), /internal database/);
});
