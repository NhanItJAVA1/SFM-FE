import type { ComponentProps } from 'react';

import { AppTextInput } from '@/components/app-text';
import { formatMoneyInputValue, formatVndAmountInput, getMoneyInputValue, getVndAmountDigits } from '@/utils/amountInput';

type MoneyInputProps = Omit<ComponentProps<typeof AppTextInput>, 'value' | 'defaultValue'> & {
  /** Unformatted numeric value; grouping separators are only used for display. */
  value: string;
  allowDecimals?: boolean;
};

export function MoneyInput({ value, onChangeText, allowDecimals = true, keyboardType = allowDecimals ? 'decimal-pad' : 'number-pad', ...props }: MoneyInputProps) {
  return (
    <AppTextInput
      {...props}
      keyboardType={keyboardType}
      value={allowDecimals ? formatMoneyInputValue(value) : formatVndAmountInput(value)}
      onChangeText={text => onChangeText?.(allowDecimals ? getMoneyInputValue(text, value) : getVndAmountDigits(text))}
    />
  );
}
