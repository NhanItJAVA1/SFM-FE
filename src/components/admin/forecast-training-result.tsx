import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, ChevronUp, CircleCheck, Database, Info, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import type { ForecastTrainingResponse } from '@/api/aiApi';
import { adminStyleSheet, useAdminTheme, type AdminTheme } from './admin-design';
import { formatResultDate, formatResultNumber as number, getComparison, getModelLabel, summarizeTrainingResult, type ComparisonMetric, type ComparisonSplit } from './training-result-summary';

export function ForecastTrainingResult({ result }: { result: ForecastTrainingResponse }) {
  const theme = useAdminTheme();
  const width = useWindowDimensions().width;
  const styles = createStyles(theme, width >= 1200, width < 600);
  const [split, setSplit] = useState<ComparisonSplit>('test');
  const [metric, setMetric] = useState<ComparisonMetric>('sevenDayTotalWAPE');
  const [showDetails, setShowDetails] = useState(false);
  const summary = summarizeTrainingResult(result);
  const comparison = getComparison(result, split, metric);
  const splitColors = [theme.primary, theme.textMuted, theme.link];
  const baselineLabel = getModelLabel(result.evaluation.saveCheck.baseline, summary.modelName);
  const improved = summary.improvement !== null && summary.improvement >= 0;
  const retention = result.dataset.inputUserCount > 0 ? Math.min(100, Math.max(0, result.dataset.usableUserCount / result.dataset.inputUserCount * 100)) : 0;
  const saveMetric = result.evaluation.saveCheck.metric === 'validation.sevenDayTotalWAPE'
    ? 'Sai số tổng 7 ngày trên tập Đánh giá (Validation)'
    : result.evaluation.saveCheck.metric;
  const retrospective = result.dataset.historicalMode === 'retrospective';
  const limitation = result.dataset.limitation === 'Current snapshots cannot recover previous values before edits or deletions.'
    ? 'Dữ liệu dùng trạng thái hiện tại, không thể khôi phục giá trị trước những lần sửa hoặc xóa. Cần lưu ý giới hạn này khi đọc kết quả đánh giá.'
    : result.dataset.limitation;

  return <View style={styles.root}>
    <View style={styles.outcome}>
      <View style={[styles.outcomeIcon, !result.saved && styles.warningSurface]}>{result.saved ? <CircleCheck size={22} strokeWidth={1.6} color={theme.primary} /> : <Info size={22} color={theme.warning} />}</View>
      <View style={[styles.grow, styles.outcomeCopy]}><Text style={styles.outcomeTitle}>{result.status === 'succeeded' ? 'Huấn luyện hoàn tất' : 'Kết quả huấn luyện'}</Text><Text style={styles.description}>Dữ liệu đến {formatResultDate(result.dataset.asOf)} · {result.dataset.currency} · {number(result.dataset.usableUserCount, 0)} người dùng</Text></View>
      <View style={[styles.savedBadge, !result.saved && styles.warningSurface]}>{result.saved ? <Check size={12} color={theme.primary} /> : null}<Text style={[styles.savedText, !result.saved && styles.warningText]}>{result.saved ? 'Được chọn sử dụng' : result.archived ? 'Đã lưu · Chưa chọn sử dụng' : 'Chưa chọn sử dụng'}</Text></View>
    </View>

    <View style={styles.summaryGrid}>
      <View style={styles.summaryCard}><Text style={styles.cardLabel}>Sai số tổng 7 ngày · Test</Text><Text style={styles.cardValue}>{summary.testError !== undefined ? `${number(summary.testError)}%` : '—'}</Text><Text style={styles.caption}>Đo trên tập Kiểm tra · Càng thấp càng tốt</Text></View>
      <View style={styles.summaryCard}><Text style={styles.cardLabel}>{improved ? 'Giảm sai số so với tham chiếu' : 'Thay đổi so với tham chiếu'}</Text><View style={styles.valueRow}>{summary.improvement !== null ? improved ? <ArrowDownRight size={21} color={theme.primary} /> : <ArrowUpRight size={21} color={theme.warning} /> : null}<Text style={[styles.cardValue, summary.improvement !== null && (improved ? styles.accentText : styles.warningText)]}>{summary.improvement !== null ? `${number(Math.abs(summary.improvement))}%` : '—'}</Text></View><Text style={styles.caption}>{summary.improvement !== null ? `${baselineLabel}: ${number(summary.baselineError)}% → ${number(summary.testError)}%${improved ? '' : ' · Sai số tăng'}` : 'Chưa đủ chỉ số để so sánh'}</Text></View>
      <View style={styles.summaryCard}><Text style={styles.cardLabel}>Người dùng có dữ liệu phù hợp</Text><Text style={styles.cardValue}>{number(result.dataset.usableUserCount, 0)}<Text style={styles.cardDenominator}> / {number(result.dataset.inputUserCount, 0)}</Text></Text><View style={styles.coverageTrack}><View style={[styles.coverageFill, { width: `${retention}%` }]} /></View><Text style={styles.caption}>{number(result.dataset.skippedUserCount, 0)} người dùng bị bỏ qua</Text></View>
      <View style={styles.summaryCard}><Text style={styles.cardLabel}>Bản ghi được xử lý</Text><Text style={styles.cardValue}>{number(result.dataset.rowCount, 0)}</Text><Text style={styles.caption}>{number(result.dataset.forecastWindowCount, 0)} cửa sổ dự báo · Bước dịch {number(result.dataset.originStrideDays, 0)} ngày</Text></View>
    </View>

    <View style={styles.contentGrid}>
      <View style={styles.chartPanel}>
        <View style={styles.panelHeader}><View style={styles.grow}><Text style={styles.panelTitle}>So sánh sai số dự báo</Text><Text style={styles.description}>Thanh ngắn hơn thể hiện sai số thấp hơn.</Text></View></View>
        <View style={styles.chartBody}>
          <View style={styles.controlRow}>
            <View style={styles.segmented}>{([['test', 'Kiểm tra (Test)'], ['validation', 'Đánh giá (Validation)']] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: split === key }} onPress={() => setSplit(key)} style={[styles.segment, split === key && styles.segmentActive]}><Text style={[styles.segmentText, split === key && styles.segmentActiveText]}>{label}</Text></Pressable>)}</View>
          </View>
          <View style={styles.metricRow}>{([['sevenDayTotalWAPE', 'Tổng 7 ngày'], ['dailyWAPE', 'Theo ngày']] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Sai số ${label.toLowerCase()}`} accessibilityState={{ selected: metric === key }} onPress={() => setMetric(key)} style={[styles.metricButton, metric === key && styles.metricActive]}><Text style={[styles.metricText, metric === key && styles.accentText]}>{label}</Text></Pressable>)}<Text style={styles.chartUnit}>WAPE (%)</Text></View>
          <View accessibilityRole="summary" accessibilityLabel={`So sánh WAPE ${metric === 'sevenDayTotalWAPE' ? 'tổng 7 ngày' : 'theo ngày'} trên tập ${split === 'test' ? 'kiểm tra' : 'đánh giá'}`} style={styles.bars}>
            {comparison.rows.map(row => <View key={row.name} style={styles.chartRow}>
              <View style={styles.barLabelRow}><View style={styles.modelNameRow}><Text style={[styles.modelLabel, row.isTrained && styles.accentText]}>{getModelLabel(row.name, summary.modelName)}</Text>{row.isTrained ? <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View> : null}</View><Text style={styles.barValue}>{row.value === null ? '—' : `${number(row.value)}%`}</Text></View>
              <View style={styles.barTrack}><View style={[styles.barFill, { width: `${row.value === null ? 0 : row.value / comparison.scale * 100}%`, backgroundColor: row.isTrained ? theme.primary : row.name === result.evaluation.saveCheck.baseline ? theme.textMuted : theme.textSubtle }]} /></View>
            </View>)}
            <View style={styles.axis}><Text style={styles.axisText}>0%</Text><Text style={styles.axisText}>{number(comparison.scale / 2, 0)}%</Text><Text style={styles.axisText}>{number(comparison.scale, 0)}%</Text></View>
          </View>
          <View style={styles.definition}><Info size={15} color={theme.textMuted} /><Text style={styles.definitionText}>WAPE đo mức sai số so với chi tiêu thực tế. {metric === 'sevenDayTotalWAPE' ? 'Ở đây, mô hình được đánh giá theo tổng chi tiêu của từng khoảng 7 ngày.' : 'Ở đây, mô hình được đánh giá theo chi tiêu từng ngày.'}{comparison.rows.some(row => row.value === null) ? ' Dấu — thể hiện chỉ số chưa có hoặc chưa xác định.' : ''}</Text></View>
        </View>
      </View>

      <View style={styles.dataPanel}>
        <View style={styles.panelHeader}><Database size={17} color={theme.textMuted} /><View style={styles.grow}><Text style={styles.panelTitle}>Dữ liệu theo thời gian</Text><Text style={styles.description}>Phân bố bản ghi giữa các tập dữ liệu.</Text></View></View>
        <View style={styles.dataBody}>
          <View style={styles.timeline} accessibilityLabel="Tỷ lệ bản ghi của các tập dữ liệu">{summary.splits.map((part, index) => <View key={part.key} style={{ width: `${part.percentage}%`, backgroundColor: splitColors[index], height: '100%' }} />)}</View>
          {summary.splits.map((part, index) => <View key={part.key} style={styles.splitRow}><View style={styles.splitLabelRow}><View style={[styles.legendDot, { backgroundColor: splitColors[index] }]} /><Text style={styles.splitLabel}>{part.label}<Text style={styles.splitEnglish}> · {part.key === 'train' ? 'Train' : part.key === 'validation' ? 'Validation' : 'Test'}</Text></Text><Text style={styles.splitPercentage}>{number(part.percentage, 1)}%</Text></View><View style={styles.splitCopy}><Text style={styles.splitDates}>Mốc dự báo: {formatResultDate(part.data.firstOrigin)} — {formatResultDate(part.data.lastOrigin)}</Text><Text style={styles.caption}>{number(part.data.rowCount, 0)} bản ghi · {number(part.data.userCount, 0)} người dùng</Text></View></View>)}
          <Text style={styles.dataNote}>Chia theo thứ tự thời gian với khoảng đệm {number(result.split.purgeHorizonDays, 0)} ngày để hạn chế rò rỉ dữ liệu giữa các tập.</Text>
        </View>
      </View>
    </View>

    <View style={styles.insightGrid}>
      <View style={styles.insightCard}>{result.evaluation.saveCheck.passed ? <CircleCheck size={18} color={theme.primary} /> : <TriangleAlert size={18} color={theme.warning} />}<View style={styles.grow}><Text style={styles.insightTitle}>{result.evaluation.saveCheck.passed ? 'Đạt điều kiện lưu mô hình' : 'Chưa đạt điều kiện lưu mô hình'}</Text><Text style={styles.description}>{saveMetric}, so với {baselineLabel}. Quyết định lưu dựa trên tập Đánh giá; tập Kiểm tra dùng để báo cáo sai số.</Text></View></View>
      <View style={styles.insightCard}><Info size={18} color={theme.warning} /><View style={styles.grow}><Text style={styles.insightTitle}>{retrospective ? 'Lưu ý về dữ liệu hồi cứu' : 'Lưu ý về dữ liệu'}</Text><Text style={styles.description}>{limitation || 'Chưa có ghi chú giới hạn dữ liệu.'}</Text>{result.dataset.skippedIncomeWindowCount > 0 ? <Text style={styles.description}>{number(result.dataset.skippedIncomeWindowCount, 0)} cửa sổ thu nhập đã bị bỏ qua khi chuẩn bị dữ liệu.</Text> : null}</View></View>
    </View>

    <View style={styles.detailsPanel}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDetails }} onPress={() => setShowDetails(value => !value)} style={styles.detailsToggle}><View style={styles.grow}><Text style={styles.panelTitle}>{showDetails ? 'Ẩn chi tiết đánh giá' : 'Xem chi tiết đánh giá'}</Text><Text style={styles.description}>Phiên bản, thông số dữ liệu và đầy đủ chỉ số của từng mô hình</Text></View>{showDetails ? <ChevronUp size={18} color={theme.textMuted} /> : <ChevronDown size={18} color={theme.textMuted} />}</Pressable>
      {showDetails ? <View style={styles.detailsBody}>
        <Text selectable style={styles.version}>Phiên bản ứng viên: {result.candidateModelVersion ?? result.runId ?? result.modelVersion ?? '—'}</Text>
        {result.activeModelVersion !== undefined ? <Text selectable style={styles.caption}>Đang sử dụng: {result.activeModelVersion ?? 'Chưa có model được chọn'}</Text> : null}
        <Text style={styles.caption}>Trạng thái: {result.status} · Chế độ dữ liệu: {result.dataset.historicalMode} · Chia tập: {result.split.method}</Text>
        <Text style={styles.caption}>Bản ghi bị loại khi chia tập: {number(result.split.discardedRows, 0)} · Kết quả kiểm tra lưu: {result.evaluation.saveCheck.reason === 'passed' ? 'Đạt' : result.evaluation.saveCheck.reason}</Text>
        <Text style={styles.detailHeading}>Chỉ số từng mô hình</Text>
        <Text style={styles.caption}>MAE và RMSE tính bằng {result.dataset.currency}; các chỉ số WAPE tính bằng %. Giá trị thấp hơn thể hiện sai số nhỏ hơn.</Text>
        {(['validation', 'test'] as const).map(key => <View key={key} style={styles.metricsSection}><Text style={styles.insightTitle}>{key === 'validation' ? 'Đánh giá (Validation)' : 'Kiểm tra (Test)'} · {number(result.evaluation[key].sampleCount, 0)} mẫu</Text><ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tableContent}><View style={styles.metricTable}>
          <View style={styles.tableRow}>{['Mô hình', 'MAE / ngày', 'RMSE / ngày', 'WAPE / ngày', 'WAPE 7 ngày'].map((label, index) => <Text key={label} style={[styles.tableHead, index === 0 ? styles.nameCell : styles.numericCell]}>{label}</Text>)}</View>
          {summary.names.map(name => { const metrics = result.evaluation[key].models[name]; return <View key={name} style={[styles.tableRow, name === summary.modelName && styles.trainedTableRow]}><Text style={[styles.tableName, styles.nameCell]}>{name}</Text>{[metrics?.dailyMAE, metrics?.dailyRMSE, metrics?.dailyWAPE, metrics?.sevenDayTotalWAPE].map((value, index) => <Text key={index} style={[styles.tableValue, styles.numericCell]}>{typeof value !== 'number' || !Number.isFinite(value) ? '—' : `${number(value, index < 2 ? 0 : 2)}${index >= 2 ? '%' : ''}`}</Text>)}</View>; })}
        </View></ScrollView></View>)}
      </View> : null}
    </View>
  </View>;
}

function createStyles(theme: AdminTheme, desktop: boolean, narrow: boolean) {
  return adminStyleSheet({
    root: { gap: 18 },
    grow: { flex: 1, minWidth: 0 },
    outcomeCopy: { minWidth: narrow ? 180 : 0 },
    outcome: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 13, padding: narrow ? 18 : 22, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 10 },
    outcomeIcon: { width: 42, height: 42, borderRadius: 11, backgroundColor: theme.primaryPressed, alignItems: 'center', justifyContent: 'center' },
    outcomeTitle: { color: theme.text, fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
    description: { color: theme.textMuted, fontSize: 12, lineHeight: 20, marginTop: 4 },
    savedBadge: { marginLeft: narrow ? 55 : 0, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: theme.primaryPressed },
    savedText: { color: theme.primary, fontSize: 11, fontWeight: '500' },
    warningSurface: { backgroundColor: theme.warningBackground },
    warningText: { color: theme.warning },
    accentText: { color: theme.primary },
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    summaryCard: { flexBasis: desktop ? '22%' : '46%', flexGrow: 1, minWidth: 0, borderColor: theme.border, borderWidth: 1, borderRadius: 10, backgroundColor: theme.card, padding: narrow ? 14 : 20, gap: 11 },
    cardLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '500', lineHeight: 18 },
    cardValue: { color: theme.text, fontSize: narrow ? 24 : 28, fontWeight: '600', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
    cardDenominator: { color: theme.textMuted, fontSize: 18, fontWeight: '400' },
    valueRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    caption: { color: theme.textMuted, fontSize: 11, lineHeight: 18 },
    coverageTrack: { height: 4, borderRadius: 3, overflow: 'hidden', backgroundColor: theme.cardAlt },
    coverageFill: { height: '100%', borderRadius: 3, backgroundColor: theme.primary },
    contentGrid: { flexDirection: desktop ? 'row' : 'column', alignItems: 'stretch', gap: 18 },
    chartPanel: { flex: desktop ? 1.4 : undefined, minWidth: 0, borderColor: theme.border, borderWidth: 1, borderRadius: 10, backgroundColor: theme.card, overflow: 'hidden' },
    dataPanel: { flex: desktop ? 1 : undefined, minWidth: 0, borderColor: theme.border, borderWidth: 1, borderRadius: 10, backgroundColor: theme.card, overflow: 'hidden' },
    panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border },
    panelTitle: { color: theme.text, fontSize: 14, fontWeight: '600', lineHeight: 21 },
    chartBody: { padding: narrow ? 16 : 20, gap: 18 },
    controlRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    segmented: { flexDirection: 'row', flexWrap: 'wrap', padding: 3, gap: 3, borderRadius: 7, backgroundColor: theme.cardAlt },
    segment: { paddingVertical: 8, paddingHorizontal: narrow ? 8 : 12, borderRadius: 5 },
    segmentActive: { backgroundColor: theme.card },
    segmentText: { color: theme.textMuted, fontSize: 10, fontWeight: '500' },
    segmentActiveText: { color: theme.text },
    metricRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    metricButton: { borderColor: theme.border, borderWidth: 1, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 6 },
    metricActive: { borderColor: theme.primary, backgroundColor: theme.primaryPressed },
    metricText: { color: theme.textMuted, fontSize: 10, fontWeight: '500' },
    chartUnit: { color: theme.textMuted, fontSize: 10, marginLeft: 'auto' },
    bars: { gap: 20 },
    chartRow: { gap: 9 },
    barLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    modelNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 },
    modelLabel: { color: theme.text, fontSize: 12, fontWeight: '500', flexShrink: 1 },
    aiBadge: { backgroundColor: theme.primaryPressed, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
    aiBadgeText: { color: theme.primary, fontSize: 8, fontWeight: '600' },
    barValue: { color: theme.text, fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
    barTrack: { height: 12, borderRadius: 3, backgroundColor: theme.cardAlt, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 3 },
    axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -10 },
    axisText: { color: theme.textMuted, fontSize: 9 },
    definition: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderTopColor: theme.border, borderTopWidth: 1, paddingTop: 14 },
    definitionText: { color: theme.textMuted, fontSize: 11, lineHeight: 19, flex: 1 },
    dataBody: { padding: 20, gap: 17 },
    timeline: { height: 12, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', backgroundColor: theme.cardAlt },
    splitRow: { gap: 4 },
    splitLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    legendDot: { width: 6, height: 6, borderRadius: 3 },
    splitLabel: { color: theme.text, fontSize: 11, fontWeight: '500', flex: 1 },
    splitEnglish: { color: theme.textMuted, fontSize: 10, fontWeight: '400' },
    splitPercentage: { color: theme.text, fontSize: 11, fontWeight: '500', fontVariant: ['tabular-nums'] },
    splitCopy: { paddingLeft: 13, gap: 3 },
    splitDates: { color: theme.text, fontSize: 11, lineHeight: 18 },
    dataNote: { color: theme.textMuted, fontSize: 10, lineHeight: 18, borderTopColor: theme.border, borderTopWidth: 1, paddingTop: 13 },
    insightGrid: { flexDirection: desktop ? 'row' : 'column', gap: 16 },
    insightCard: { flex: desktop ? 1 : undefined, flexDirection: 'row', gap: 11, borderColor: theme.border, borderWidth: 1, borderRadius: 10, backgroundColor: theme.card, padding: 20 },
    insightTitle: { color: theme.text, fontSize: 12, fontWeight: '500', lineHeight: 20 },
    detailsPanel: { borderColor: theme.border, borderWidth: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: theme.card },
    detailsToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20 },
    detailsBody: { padding: narrow ? 16 : 20, borderTopWidth: 1, borderTopColor: theme.border, gap: 12 },
    version: { color: theme.text, fontSize: 11, lineHeight: 19 },
    detailHeading: { color: theme.text, fontSize: 13, fontWeight: '600', marginTop: 8 },
    metricsSection: { gap: 10 },
    tableContent: { minWidth: '100%' },
    metricTable: { minWidth: '100%', borderWidth: 1, borderColor: theme.border, borderRadius: 7, overflow: 'hidden' },
    tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.border, alignItems: 'center' },
    tableHead: { color: theme.textMuted, backgroundColor: theme.cardAlt, fontSize: 10, fontWeight: '500', padding: 12 },
    nameCell: { width: 198 },
    numericCell: { width: 124, textAlign: 'right' },
    tableName: { color: theme.text, fontSize: 11, fontWeight: '500', padding: 12 },
    tableValue: { color: theme.text, fontSize: 11, padding: 12, fontVariant: ['tabular-nums'] },
    trainedTableRow: { backgroundColor: theme.primaryPressed },
  });
}
