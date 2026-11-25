import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatMoneyInputValue, formatVndAmountInput, getMoneyInputValue, getVndAmountDigits } from '../src/utils/amountInput.ts';
import { getAmountSuggestions } from '../src/utils/amountSuggestions.ts';
import { buildTransferPayload } from '../src/utils/transfer.ts';
import { buildUpdateTransactionPayload, createTransactionEditForm } from '../src/utils/transactionEditing.ts';
import { buildBudgetPayload } from '../src/screens/budgets/helpers.ts';

test('groups every three digits, including nonzero thousands', () => {
  for (const [input, expected] of [['', ''], ['0', '0'], ['99', '99'], ['999', '999'], ['1000', '1.000'], ['1234', '1.234'], ['1000000', '1.000.000'], ['123456789', '123.456.789']]) {
    assert.equal(formatVndAmountInput(input), expected);
  }
});

test('pasting a formatted VND amount retains the exact API amount', () => {
  for (const input of ['1.234.567', '1,234,567', '1 234 567', '1.234.567 ₫']) {
    const digits = getVndAmountDigits(input);
    assert.equal(digits, '1234567');
    assert.equal(Number(digits), 1234567);
    assert.equal(formatVndAmountInput(digits), '1.234.567');
  }
});

test('regroups after appending, deleting, or clearing the amount', () => {
  assert.equal(formatVndAmountInput('9999'), '9.999');
  assert.equal(formatVndAmountInput('9.99'), '999');
  assert.equal(getVndAmountDigits(''), '');
  assert.equal(formatVndAmountInput(''), '');
});

test('normalizes leading zeros without losing a lone zero', () => {
  assert.equal(getVndAmountDigits('000001000'), '1000');
  assert.equal(formatVndAmountInput('000001000'), '1.000');
  assert.equal(getVndAmountDigits('000'), '0');
});

test('formatting does not round digits through a Number conversion', () => {
  assert.equal(formatVndAmountInput('9007199254740993'), '9.007.199.254.740.993');
});

test('quick amount suggestions still receive digits and selected values format correctly', () => {
  const suggestions = getAmountSuggestions(getVndAmountDigits('1.000'));
  assert.deepEqual(suggestions, [1000000, 10000000, 100000000]);
  assert.equal(formatVndAmountInput(String(suggestions[0])), '1.000.000');
});

test('existing fractional money is displayed without losing or multiplying its value', () => {
  for (const raw of ['1234.5', '1234567.50', '0.25', '1000.00', '1.000', '-1234.5']) {
    const displayed = formatMoneyInputValue(raw);
    assert.equal(Number(getMoneyInputValue(displayed, raw)), Number(raw));
  }
  assert.equal(formatMoneyInputValue('1234567.50'), '1.234.567,50');
  assert.equal(formatMoneyInputValue(''), '');
});

test('typing a decimal comma keeps the fraction in raw state', () => {
  assert.equal(getMoneyInputValue('1.234,'), '1234.');
  assert.equal(formatMoneyInputValue('1234.'), '1.234,');
  assert.equal(getMoneyInputValue('1.234,50', '1234.5'), '1234.50');
  assert.equal(getMoneyInputValue('1,234', '1.23'), '1.234');
});

test('pasted grouping separators are removed before money reaches form state', () => {
  assert.equal(getMoneyInputValue('1.234.567'), '1234567');
  assert.equal(getMoneyInputValue('1 234 567 ₫'), '1234567');
  assert.equal(getMoneyInputValue('1,234,567'), '1234567');
  assert.equal(getMoneyInputValue('1,234,567.50'), '1234567.50');
  assert.equal(getMoneyInputValue('1,234,567', '12.5'), '1234567');
  assert.equal(getMoneyInputValue('1,234.50', '12.5'), '1234.50');
  assert.equal(getMoneyInputValue(''), '');
});

test('formatted transfer amounts reach the API as the exact original number', () => {
  const from = { id: 1, isActive: true, currency: 'VND', createdAt: '2026-01-01T00:00:00Z' };
  const to = { ...from, id: 2 };
  const amount = getMoneyInputValue('1.234.567,50');
  const payload = buildTransferPayload({ from, to, amount, description: '', date: new Date('2026-11-01T00:00:00Z') });
  assert.equal(payload.amount, 1234567.5);
});

test('wallet and scanned bill parsers receive unformatted values, including unit prices', () => {
  assert.equal(Number(getMoneyInputValue('1.000.000')), 1000000);
  const unitPrice = Number(getMoneyInputValue('12.345,50'));
  assert.equal(unitPrice, 12345.5);
  assert.equal(unitPrice * 3, 37036.5);
});

test('budget and transaction edits retain fractional amounts in their real API builders', () => {
  const amount = getMoneyInputValue('1.234.567,50');
  const budget = buildBudgetPayload({ amount, alertThreshold: '80', categoryId: null, name: 'Test', startDate: '2026-11-01', endDate: '2026-11-30', isRecurring: false });
  assert.equal(budget.amount, 1234567.5);
  const original = { id: 1, accountId: 10, categoryId: 20, type: 'Expense', amount: 1000, description: null, transactionDate: '2026-11-01T00:00:00Z', location: null, isExcluded: false };
  const edited = buildUpdateTransactionPayload(original, { ...createTransactionEditForm(original), amount }, [{ id: 10, isActive: true }], [{ id: 20, type: 'Expense' }]);
  assert.equal(edited.amount, 1234567.5);
});
