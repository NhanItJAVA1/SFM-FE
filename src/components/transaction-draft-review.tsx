import { router } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TransactionDraft } from '@/api/transactionsApi';

type TransactionDraftReviewProps = {
  draft: TransactionDraft;
  imageUri?: string;
  onRetake: () => void;
};

function formatAmount(amount: unknown) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return 'Chưa nhận diện';
  }

  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(amount);
}

function formatDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return 'Chưa nhận diện';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatText(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return 'Chưa nhận diện';
}

function FieldRow({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{formatText(value)}</Text>
    </View>
  );
}

export function TransactionDraftReview({ draft, imageUri, onRetake }: TransactionDraftReviewProps) {
  const items = Array.isArray(draft.items) ? draft.items : [];

  function handleSave() {
    router.back();
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onRetake} hitSlop={12}>
          <Text style={styles.headerAction}>Quét lại</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Kiểm tra giao dịch</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {imageUri ? <Image source={{ uri: imageUri }} style={styles.receiptImage} /> : null}

        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Số tiền</Text>
          <Text style={styles.amountValue}>{formatAmount(draft.amount)}</Text>
        </View>

        <View style={styles.card}>
          <FieldRow label="Loại giao dịch" value={draft.type ?? 'Expense'} />
          <FieldRow label="Mô tả" value={draft.description ?? draft.merchantName} />
          <FieldRow label="Ngày giao dịch" value={formatDate(draft.transactionDate)} />
          <FieldRow label="Địa điểm" value={draft.location} />
          <FieldRow label="Danh mục" value={draft.categoryId} />
          <FieldRow label="Tài khoản" value={draft.accountId} />
        </View>

        {items.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.itemsHeader}>
              <Text style={styles.itemsTitle}>Chi tiết hóa đơn</Text>
              <Text style={styles.itemsCount}>{items.length} món</Text>
            </View>

            {items.map((item, index) => (
              <View key={`${item.name ?? 'item'}-${index}`} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{formatText(item.name)}</Text>
                  <Text style={styles.itemMeta}>
                    {formatText(item.quantity)} × {formatAmount(item.unitPrice)}
                  </Text>
                </View>
                <Text style={styles.itemAmount}>{formatAmount(item.amount)}</Text>
              </View>
            ))}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tổng món</Text>
              <Text style={styles.totalValue}>{formatAmount(draft.itemsTotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Chênh lệch</Text>
              <Text style={styles.totalValue}>{formatAmount(draft.difference)}</Text>
            </View>
          </View>
        ) : null}

        {draft.rawText ? (
          <View style={styles.card}>
            <Text style={styles.rawTitle}>Nội dung nhận diện</Text>
            <Text style={styles.rawText}>{draft.rawText}</Text>
          </View>
        ) : null}

        <Text style={styles.note}>Lưu hiện tại chỉ xác nhận tạm thời và quay lại. BE tạo giao dịch sẽ nối sau.</Text>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.secondaryButton} onPress={onRetake}>
          <Text style={styles.secondaryButtonText}>Chụp lại</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={handleSave}>
          <Text style={styles.primaryButtonText}>Lưu</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#020204', flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 14,
  },
  headerAction: { color: '#31c452', fontSize: 17, fontWeight: '800' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSpacer: { width: 58 },
  content: { gap: 14, padding: 20, paddingBottom: 130 },
  receiptImage: { alignSelf: 'center', borderRadius: 8, height: 180, resizeMode: 'cover', width: '100%' },
  amountCard: { backgroundColor: '#1e1e1f', borderRadius: 8, padding: 18 },
  amountLabel: { color: '#9698a1', fontSize: 14, marginBottom: 4 },
  amountValue: { color: '#fff', fontSize: 30, fontWeight: '800' },
  card: { backgroundColor: '#1e1e1f', borderRadius: 8, overflow: 'hidden' },
  fieldRow: { borderBottomColor: '#303039', borderBottomWidth: 1, gap: 6, paddingHorizontal: 16, paddingVertical: 14 },
  fieldLabel: { color: '#9698a1', fontSize: 13, fontWeight: '700' },
  fieldValue: { color: '#fff', fontSize: 16, fontWeight: '700' },
  rawTitle: { color: '#fff', fontSize: 16, fontWeight: '800', paddingHorizontal: 16, paddingTop: 16 },
  rawText: { color: '#c8cbd2', fontSize: 14, lineHeight: 21, padding: 16 },
  itemsHeader: { alignItems: 'center', borderBottomColor: '#303039', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  itemsTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  itemsCount: { color: '#9698a1', fontSize: 13, fontWeight: '700' },
  itemRow: { alignItems: 'center', borderBottomColor: '#303039', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  itemInfo: { flex: 1, gap: 4 },
  itemName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  itemMeta: { color: '#9698a1', fontSize: 13 },
  itemAmount: { color: '#fff', fontSize: 15, fontWeight: '800' },
  totalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  totalLabel: { color: '#9698a1', fontSize: 14, fontWeight: '700' },
  totalValue: { color: '#fff', fontSize: 15, fontWeight: '800' },
  note: { color: '#8f939d', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  footer: {
    backgroundColor: '#020204',
    borderTopColor: '#1e1e1f',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
    left: 0,
    padding: 20,
    position: 'absolute',
    right: 0,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#1e1e1f',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#31c452',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
