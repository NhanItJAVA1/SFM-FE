/** Keep the editable VND amount as digits so API payloads never contain grouping separators. */
export function getVndAmountDigits(value: string) {
  return value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}

export function formatVndAmountInput(value: string) {
  // Format the string directly to avoid rounding large amounts while typing.
  return getVndAmountDigits(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Format a raw numeric string (decimal point) using Vietnamese grouping and decimal separators. */
export function formatMoneyInputValue(value: string) {
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(value);
  if (!match || value === '' || value === '-') return value;
  const [, sign, integer, fraction] = match;
  const grouped = formatVndAmountInput(integer || '0');
  return `${sign}${grouped}${fraction === undefined ? '' : `,${fraction}`}`;
}

/** Return the raw numeric string expected by Number(), transfer validation and API builders. */
export function getMoneyInputValue(value: string, previousValue?: string) {
  const cleaned = value.replace(/[^\d.,-]/g, '');
  // Accept pasted amounts with English thousands separators too, including a decimal suffix.
  const isDecimalContinuation = previousValue?.includes('.') && cleaned.indexOf(',') === cleaned.lastIndexOf(',') && !cleaned.includes('.');
  if (!isDecimalContinuation && /^-?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(cleaned)) {
    return cleaned.replace(/,/g, '');
  }
  const sign = cleaned.startsWith('-') ? '-' : '';
  const comma = cleaned.indexOf(',');
  const integer = getVndAmountDigits(comma === -1 ? cleaned : cleaned.slice(0, comma));
  if (comma === -1) return `${sign}${integer}`;
  const fraction = cleaned.slice(comma + 1).replace(/\D/g, '');
  return `${sign}${integer || '0'}.${fraction}`;
}
