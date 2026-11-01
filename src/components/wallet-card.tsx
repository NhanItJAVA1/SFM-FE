import { Banknote, ChevronRight, Ellipsis, Landmark, PiggyBank, type LucideIcon } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { AccountType, FinancialAccount } from '@/api/financialAccountApi';
import { AppText as Text } from '@/components/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';
import type { AppTheme } from '@/theme/appTheme';
import { Typography } from '@/theme/typography';
import { getAccountCurrentBalance } from '@/utils/accountBalance';
import { formatCashflowAmount } from '@/utils/walletCashflow';

export const accountTypes: { value: AccountType; label: string; Icon: LucideIcon; color: string }[] = [
  { value: 'Cash', label: 'Tiền mặt', Icon: Banknote, color: '#22A86B' },
  { value: 'Bank', label: 'Ngân hàng', Icon: Landmark, color: '#4285E5' },
  { value: 'Savings', label: 'Tiết kiệm', Icon: PiggyBank, color: '#CF9131' },
];

export const getAccountTypeMeta = (type: AccountType) => accountTypes.find(option => option.value === type) ?? accountTypes[0];

export function AccountIcon({ type, compact = false }: { type: AccountType; compact?: boolean }) {
  const { Icon, color } = getAccountTypeMeta(type);
  return <View style={[iconStyle, compact && { width: 32, height: 32, borderRadius: 11 }, { backgroundColor: `${color}18` }]}><Icon size={compact ? 18 : 24} color={color} strokeWidth={1.8} /></View>;
}

const iconStyle = { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' } as const;

export function WalletMiniRow({ account, showDivider = false }: { account: FinancialAccount; showDivider?: boolean }) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const meta = getAccountTypeMeta(account.type);
  const balance = getAccountCurrentBalance(account);
  const balanceLabel = formatCashflowAmount(balance, account.currency);

  return (
    <View accessible accessibilityLabel={`${account.name}, ${meta.label}, số dư ${balanceLabel}`} style={[styles.miniRow, showDivider && styles.miniDivider]}>
      <AccountIcon type={account.type} compact />
      <View style={styles.grow}>
        <Text numberOfLines={1} style={styles.miniName}>{account.name}</Text>
        <Text style={styles.miniKind}>{meta.label}</Text>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.miniBalance, balance < 0 && { color: theme.dangerText }]}>{balanceLabel}</Text>
    </View>
  );
}

export function WalletCard({ account, onPress, actionIcon = 'chevron' }: {
  account: FinancialAccount;
  onPress: () => void;
  actionIcon?: 'chevron' | 'menu';
}) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const meta = getAccountTypeMeta(account.type);
  const balance = getAccountCurrentBalance(account);
  const balanceLabel = formatCashflowAmount(balance, account.currency);
  const ActionIcon = actionIcon === 'menu' ? Ellipsis : ChevronRight;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Quản lý ví ${account.name}`}
      accessibilityHint={`${meta.label}, số dư ${balanceLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, !account.isActive && styles.inactive, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <AccountIcon type={account.type} />
        <View style={styles.grow}>
          <Text numberOfLines={2} style={styles.name}>{account.name}</Text>
          <Text style={styles.kind}>{meta.label} · {account.currency}</Text>
        </View>
        <View style={styles.actionIcon}><ActionIcon size={21} color={theme.textMuted} /></View>
      </View>
      <View style={styles.footer}>
        <View style={styles.grow}>
          <Text style={styles.caption}>Số dư hiện tại</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={[styles.amount, balance < 0 && { color: theme.dangerText }]}>{balanceLabel}</Text>
        </View>
        {!account.isActive ? <View style={styles.inactiveBadge}><Text style={styles.inactiveText}>Tạm ngưng</Text></View> : null}
      </View>
    </Pressable>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    miniRow: { minHeight: 60, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
    miniDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
    miniName: { ...Typography.label, color: theme.text },
    miniKind: { ...Typography.caption, color: theme.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
    miniBalance: { ...Typography.label, fontWeight: '600', color: theme.text, textAlign: 'right', maxWidth: '48%' },
    card: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 20, padding: 16, gap: 16 },
    pressed: { opacity: 0.72 },
    inactive: { opacity: 0.7 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    grow: { flex: 1, minWidth: 0 },
    name: { ...Typography.bodyLarge, fontWeight: '600', color: theme.text },
    kind: { ...Typography.caption, color: theme.textMuted, marginTop: 4 },
    actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingTop: 13 },
    caption: { ...Typography.caption, color: theme.textMuted },
    amount: { fontSize: 23, lineHeight: 32, fontWeight: '600', color: theme.text, marginTop: 2 },
    inactiveBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: theme.cardAlt },
    inactiveText: { ...Typography.caption, color: theme.textMuted },
  });
}
