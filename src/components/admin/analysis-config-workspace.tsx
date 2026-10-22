import {
  aiApi,
  type AnalysisConfigVersion,
  type AnalysisPreview,
  type AnalysisPreviewInput,
  type AnalysisSettings,
} from "@/api/aiApi";
import { getCurrentAnomalyReasonCodes } from "@/utils/anomalyReasons";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { adminStyleSheet, useAdminTheme } from "./admin-design";

type Form = {
  savingsRisk: string;
  savingsWarning: string;
  budgetWarning: string;
  budgetRisk: string;
  contamination: string;
  minExpenseCount: string;
};
const fields: { key: keyof Form; label: string; help: string }[] = [
  {
    key: "savingsRisk",
    label: "Tiết kiệm: ngưỡng rủi ro (%)",
    help: "Dưới mức này → Risk. Chi vượt thu nhập luôn là Risk.",
  },
  {
    key: "savingsWarning",
    label: "Tiết kiệm: ngưỡng cảnh báo (%)",
    help: "Dưới mức này → Warning, nếu chưa thuộc Risk.",
  },
  {
    key: "budgetWarning",
    label: "Ngân sách: ngưỡng cảnh báo (%)",
    help: "Từ mức này trở lên → Warning, nếu chưa thuộc Risk.",
  },
  { key: "budgetRisk", label: "Ngân sách: ngưỡng rủi ro (%)", help: "Từ mức này trở lên → Risk." },
  {
    key: "contamination",
    label: "Độ nhạy phát hiện (%)",
    help: "Từ 1–25%. Mức cao thường đánh dấu nhiều giao dịch hơn; đây không phải xác suất gian lận.",
  },
  {
    key: "minExpenseCount",
    label: "Số giao dịch chi tối thiểu",
    help: "Số nguyên từ 20–500. Thiếu dữ liệu thì chưa kết luận bất thường.",
  },
];
const sampleFields = [
  { key: "income", label: "Thu nhập trong kỳ (VND)", value: "18000000" },
  { key: "expense", label: "Chi tiêu trong kỳ (VND)", value: "15000000" },
  { key: "budgetLimit", label: "Hạn mức ngân sách (VND)", value: "8000000" },
  { key: "budgetSpent", label: "Đã dùng ngân sách (VND)", value: "6800000" },
  { key: "unusualExpense", label: "Khoản chi cần thử (VND)", value: "3000000" },
] as const;
type SampleKey = (typeof sampleFields)[number]["key"];
const statusName = (status: string) => ({ Healthy: "Ổn định", Warning: "Cảnh báo", Risk: "Rủi ro" })[status] || status;
const reasons: Record<string, string> = {
  HIGH_VS_USER_MEDIAN: "Cao so với mức chi thường ngày",
  HIGH_VS_CATEGORY_MEDIAN: "Cao so với danh mục",
  HIGH_USER_ROBUST_Z: "Lệch nhiều so với lịch sử",
  HIGH_CATEGORY_ROBUST_Z: "Lệch nhiều trong danh mục",
  LARGE_SHARE_OF_MONTHLY_INCOME: "Chiếm tỷ trọng thu nhập lớn",
  UNUSUAL_FEATURE_COMBINATION: "Cần xem xét thêm",
};
const percent = (v: number) => `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(v * 100)}%`;
const vnd = (v: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(v);
function toForm(settings: AnalysisSettings): Form {
  const h = settings.health;
  return {
    savingsRisk: String(h.savingsRisk * 100),
    savingsWarning: String(h.savingsWarning * 100),
    budgetWarning: String(h.budgetWarning * 100),
    budgetRisk: String(h.budgetRisk * 100),
    contamination: String(settings.anomaly.contamination * 100),
    minExpenseCount: String(settings.anomaly.minExpenseCount),
  };
}
function numeric(value: string) {
  return /^\d+(?:[.,]\d+)?$/.test(value.trim()) ? Number(value.replace(",", ".")) : NaN;
}
function parseForm(form: Form): AnalysisSettings | null {
  const n = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, numeric(value)])) as Record<
    keyof Form,
    number
  >;
  if (
    Object.values(n).some((value) => !Number.isFinite(value)) ||
    n.savingsRisk < 0 ||
    n.savingsWarning > 100 ||
    n.savingsRisk >= n.savingsWarning ||
    n.budgetWarning < 0 ||
    n.budgetWarning >= n.budgetRisk ||
    n.budgetRisk > 500 ||
    n.contamination < 1 ||
    n.contamination > 25 ||
    !Number.isInteger(n.minExpenseCount) ||
    n.minExpenseCount < 20 ||
    n.minExpenseCount > 500
  )
    return null;
  return {
    health: {
      savingsRisk: n.savingsRisk / 100,
      savingsWarning: n.savingsWarning / 100,
      budgetWarning: n.budgetWarning / 100,
      budgetRisk: n.budgetRisk / 100,
    },
    anomaly: { contamination: n.contamination / 100, minExpenseCount: n.minExpenseCount },
  };
}
function message(error: unknown) {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
    (error instanceof Error ? error.message : "Không xử lý được yêu cầu. Vui lòng thử lại.")
  );
}

export function AnalysisConfigWorkspace() {
  const theme = useAdminTheme();
  const styles = adminStyleSheet({
    screen: { flex: 1, backgroundColor: theme.screen },
    content: { padding: 24, gap: 18, maxWidth: 1200, width: "100%", alignSelf: "center" },
    heading: { color: theme.text, fontSize: 23, fontWeight: "600" },
    title: { color: theme.text, fontSize: 15, fontWeight: "600" },
    text: { color: theme.text, fontSize: 12, lineHeight: 20 },
    help: { color: theme.textMuted, fontSize: 12, lineHeight: 20 },
    error: { color: theme.danger, fontSize: 12, lineHeight: 20 },
    notice: { color: theme.primary, fontSize: 12, lineHeight: 20 },
    panel: {
      padding: 20,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      gap: 14,
    },
    row: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 18 },
    field: { flexGrow: 1, flexBasis: 260, gap: 7 },
    label: { color: theme.text, fontSize: 12, fontWeight: "500" },
    input: {
      color: theme.text,
      backgroundColor: theme.inputBackground,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 7,
      padding: 12,
      fontSize: 13,
      minHeight: 42,
    },
    button: { borderWidth: 1, borderColor: theme.border, padding: 12, borderRadius: 7, backgroundColor: theme.card },
    primary: { backgroundColor: theme.primary, borderColor: theme.primary },
    primaryText: { color: theme.textInverse, fontSize: 12, fontWeight: "600" },
    disabled: { opacity: 0.4 },
    selected: { borderColor: theme.primary, backgroundColor: theme.primaryPressed },
    line: { borderTopWidth: 1, borderColor: theme.border, paddingTop: 14, gap: 6 },
    overlay: {
      flex: 1,
      padding: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,.5)",
    },
    modal: { width: "100%", maxWidth: 540, backgroundColor: theme.card, borderRadius: 12, padding: 24, gap: 18 },
  });
  const [current, setCurrent] = useState<AnalysisConfigVersion | null>(null);
  const [history, setHistory] = useState<AnalysisConfigVersion[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [tab, setTab] = useState<"health" | "anomaly">("health");
  const [samples, setSamples] = useState<Record<SampleKey, string>>({
    income: "18000000",
    expense: "15000000",
    budgetLimit: "8000000",
    budgetSpent: "6800000",
    unusualExpense: "3000000",
  });
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<AnalysisPreview | null>(null);
  const [confirmation, setConfirmation] = useState<"save" | AnalysisConfigVersion | null>(null);
  const [restoreReason, setRestoreReason] = useState("");
  const mounted = useRef(true);
  const locked = useRef(false);
  const previewRequest = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await aiApi.analysisConfigHistory();
      const active = data.items.find((row) => row.version === data.activeVersion);
      if (!active) throw new Error("Không tìm thấy cấu hình đang sử dụng.");
      if (mounted.current) {
        setCurrent(active);
        setHistory(data.items);
        setForm(toForm(active.settings));
        setReason("");
        setPreview(null);
      }
    } catch (e) {
      if (mounted.current) setError(message(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);
  const settings = form ? parseForm(form) : null;
  const changed = current && settings && JSON.stringify(current.settings) !== JSON.stringify(settings);
  const sampleValues = Object.fromEntries(Object.entries(samples).map(([key, value]) => [key, numeric(value)])) as Omit<
    AnalysisPreviewInput,
    "settings"
  >;
  const samplesValid =
    Object.values(sampleValues).every((value) => Number.isFinite(value) && value >= 0 && value <= 1e12) &&
    sampleValues.budgetLimit > 0;
  const disabled = busy || loading || confirmation !== null;
  function invalidatePreview() {
    previewRequest.current++;
    setPreview(null);
    setPreviewing(false);
  }

  async function runPreview() {
    if (!settings || !samplesValid || disabled || previewing) return;
    const id = ++previewRequest.current;
    setPreviewing(true);
    setError("");
    try {
      const { data } = await aiApi.previewAnalysisConfig({ settings, ...sampleValues });
      if (mounted.current && id === previewRequest.current) setPreview(data);
    } catch (e) {
      if (mounted.current && id === previewRequest.current) setError(message(e));
    } finally {
      if (mounted.current && id === previewRequest.current) setPreviewing(false);
    }
  }
  async function commit() {
    if (locked.current || !confirmation || !current || (confirmation === "save" && !settings)) return;
    const note = confirmation === "save" ? reason.trim() : restoreReason.trim();
    if (!note) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    invalidatePreview();
    try {
      if (confirmation === "save") {
        if (!settings) return;
        await aiApi.saveAnalysisConfig({ settings, baseVersion: current.version, reason: note });
      } else await aiApi.restoreAnalysisConfig(confirmation.version, { baseVersion: current.version, reason: note });
      if (!mounted.current) return;
      setConfirmation(null);
      setNotice("Đã áp dụng cấu hình. Các lần phân tích tiếp theo sẽ sử dụng phiên bản mới.");
      await load();
    } catch (e) {
      if (mounted.current) {
        setError(message(e));
        setConfirmation(null);
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const relevant = fields.filter((field) =>
    tab === "health"
      ? field.key !== "contamination" && field.key !== "minExpenseCount"
      : field.key === "contamination" || field.key === "minExpenseCount",
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Cấu hình phân tích tài chính</Text>
      <Text style={styles.help}>
        Health đánh giá bằng ngưỡng nghiệp vụ. Anomaly phát hiện chi tiêu khác thường theo lịch sử từng người dùng.
      </Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          disabled={disabled || previewing}
          onPress={() => {
            invalidatePreview();
            void load();
          }}
          style={[styles.button, (disabled || previewing) && styles.disabled]}
        >
          <Text style={styles.text}>Tải lại cấu hình</Text>
        </Pressable>
        {loading ? <ActivityIndicator color={theme.primary} /> : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text accessibilityRole="alert" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
      {current && form ? (
        <>
          <View style={styles.panel}>
            <Text style={styles.title}>Đang sử dụng</Text>
            <Text selectable style={styles.text}>
              {current.version}
            </Text>
            <Text style={styles.help}>
              Health: quy tắc ngưỡng · Anomaly: Isolation Forest · Không cần train model qua Admin.
            </Text>
          </View>
          <View style={styles.row}>
            {(["health", "anomaly"] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === value }}
                onPress={() => setTab(value)}
                style={[styles.button, tab === value && styles.selected]}
              >
                <Text style={styles.text}>
                  {value === "health" ? "Health · Sức khỏe tài chính" : "Anomaly · Chi tiêu bất thường"}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.panel}>
            <Text style={styles.title}>
              {tab === "health" ? "Ngưỡng đánh giá sức khỏe" : "Độ nhạy cảnh báo bất thường"}
            </Text>
            <View style={styles.grid}>
              {relevant.map((field) => (
                <View key={field.key} style={styles.field}>
                  <Text style={styles.label}>{field.label}</Text>
                  <TextInput
                    accessibilityLabel={field.label}
                    inputMode="decimal"
                    editable={!disabled}
                    value={form[field.key]}
                    onChangeText={(value) => {
                      setForm({ ...form, [field.key]: value });
                      invalidatePreview();
                    }}
                    style={styles.input}
                  />
                  <Text style={styles.help}>{field.help}</Text>
                </View>
              ))}
            </View>
            {!settings ? (
              <Text accessibilityRole="alert" style={styles.error}>
                Kiểm tra cấu hình ở cả hai tab: tiết kiệm 0–100% với Risk &lt; Warning; ngân sách 0–500% với Warning
                &lt; Risk; độ nhạy 1–25%; số giao dịch nguyên 20–500.
              </Text>
            ) : null}
          </View>
          <View style={styles.panel}>
            <Text style={styles.title}>Xem thử trước khi áp dụng</Text>
            <Text style={styles.help}>
              Health dùng tổng thu/chi và ngân sách bên dưới. Anomaly dùng 60 giao dịch chi mô phỏng ăn uống, đi lại,
              mua sắm trong 60 ngày; khoản chi cuối do bạn điều chỉnh. Xem thử không lưu cấu hình.
            </Text>
            <View style={styles.grid}>
              {sampleFields
                .filter((field) =>
                  tab === "health"
                    ? field.key !== "unusualExpense"
                    : field.key === "unusualExpense" || field.key === "income",
                )
                .map((field) => (
                  <View key={field.key} style={styles.field}>
                    <Text style={styles.label}>{field.label}</Text>
                    <TextInput
                      accessibilityLabel={field.label}
                      editable={!disabled}
                      inputMode="numeric"
                      value={samples[field.key]}
                      onChangeText={(value) => {
                        setSamples({ ...samples, [field.key]: value });
                        invalidatePreview();
                      }}
                      style={styles.input}
                    />
                  </View>
                ))}
            </View>
            {!samplesValid ? (
              <Text style={styles.error}>Số tiền từ 0 đến 1.000 tỷ VND; hạn mức ngân sách phải lớn hơn 0.</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={disabled || !settings || !samplesValid || previewing}
              onPress={() => void runPreview()}
              style={[styles.button, (disabled || !settings || !samplesValid || previewing) && styles.disabled]}
            >
              <Text style={styles.text}>{previewing ? "Đang phân tích mẫu…" : "Xem thử kết quả"}</Text>
            </Pressable>
            {preview ? (
              tab === "health" ? (
                <View style={styles.line}>
                  <Text style={styles.title}>Kết quả: {statusName(preview.health.status)}</Text>
                  <Text style={styles.text}>
                    Tiết kiệm {percent(preview.health.savingsRate)} · Dùng ngân sách{" "}
                    {percent(preview.health.budgetUsage)}
                  </Text>
                  {preview.health.breakdown.reasons.map((text) => (
                    <Text key={text} style={styles.help}>
                      {text}
                    </Text>
                  ))}
                </View>
              ) : (
                <View style={styles.line}>
                  <Text style={styles.title}>
                    {preview.anomaly.summary.status === "insufficient_data"
                      ? "Chưa đủ dữ liệu mẫu"
                      : `${preview.anomaly.summary.anomalyCount} / ${preview.sampleExpenseCount} khoản chi được đánh dấu`}
                  </Text>
                  <Text style={styles.help}>
                    Cần ít nhất {preview.anomaly.summary.minRequiredExpenseCount} khoản chi. Đây là kết quả trên dữ liệu
                    mô phỏng, cần xem xét ngữ cảnh trước khi kết luận.
                  </Text>
                  {preview.anomaly.transactions.map((row) => (
                    <View key={row.transactionId} style={styles.line}>
                      <Text style={styles.text}>
                        {row.date.slice(0, 10)} · {row.category} · {vnd(row.amount)}
                      </Text>
                      <Text style={styles.help}>
                        {getCurrentAnomalyReasonCodes(row.reasonCodes)
                          .map((code) => reasons[code] || code)
                          .join(" · ") || "Được AI đánh dấu bất thường"}
                      </Text>
                    </View>
                  ))}
                </View>
              )
            ) : null}
          </View>
          <View style={styles.panel}>
            <Text style={styles.title}>Lưu và áp dụng cho các lần phân tích tiếp theo</Text>
            <TextInput
              accessibilityLabel="Lý do thay đổi cấu hình"
              placeholder="Ví dụ: giảm cảnh báo cho chi tiêu mua sắm thông thường"
              placeholderTextColor={theme.inputPlaceholder}
              editable={!disabled}
              maxLength={500}
              value={reason}
              onChangeText={setReason}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              disabled={disabled || !changed || !reason.trim()}
              onPress={() => setConfirmation("save")}
              style={[styles.button, styles.primary, (disabled || !changed || !reason.trim()) && styles.disabled]}
            >
              <Text style={styles.primaryText}>Lưu và áp dụng cấu hình</Text>
            </Pressable>
          </View>
          <View style={styles.panel}>
            <Text style={styles.title}>Lịch sử cấu hình · {history.length} phiên bản</Text>
            <Text style={styles.help}>
              Khôi phục tạo một phiên bản mới và giữ nguyên lịch sử. Người thực hiện được BE xác định từ tài khoản đăng
              nhập.
            </Text>
            {history.map((row) => (
              <View key={row.version} style={styles.line}>
                <Text selectable style={styles.text}>
                  {row.version}
                  {row.version === current.version ? " · Đang dùng" : ""}
                </Text>
                <Text style={styles.help}>
                  {row.createdAt
                    ? new Date(row.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
                    : "Mặc định"}{" "}
                  · {row.actor === "system" ? "Hệ thống" : `Admin #${row.actor}`}
                </Text>
                <Text style={styles.text}>{row.reason}</Text>
                <Text style={styles.help}>
                  Tiết kiệm: Risk &lt; {percent(row.settings.health.savingsRisk)}, Warning &lt;{" "}
                  {percent(row.settings.health.savingsWarning)} · Ngân sách: Warning ≥{" "}
                  {percent(row.settings.health.budgetWarning)}, Risk ≥ {percent(row.settings.health.budgetRisk)}
                </Text>
                <Text style={styles.help}>
                  Anomaly: {percent(row.settings.anomaly.contamination)} · Tối thiểu{" "}
                  {row.settings.anomaly.minExpenseCount} khoản chi
                  {row.restoredFrom ? ` · Khôi phục từ ${row.restoredFrom}` : ""}
                </Text>
                {row.version !== current.version ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Khôi phục ${row.version}`}
                    disabled={disabled}
                    onPress={() => {
                      setRestoreReason("");
                      setConfirmation(row);
                    }}
                    style={styles.button}
                  >
                    <Text style={styles.text}>Khôi phục cấu hình này</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        </>
      ) : null}
      <Modal
        visible={confirmation !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!busy) setConfirmation(null);
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.title}>
              {confirmation === "save" ? "Áp dụng cấu hình mới?" : "Khôi phục cấu hình cũ?"}
            </Text>
            <Text style={styles.help}>
              Các lần phân tích tiếp theo sẽ dùng cấu hình này. Kết quả đã lưu trước đây không được tính lại.
            </Text>
            {confirmation && confirmation !== "save" ? (
              <>
                <Text style={styles.text}>{confirmation.version}</Text>
                <TextInput
                  accessibilityLabel="Lý do khôi phục cấu hình"
                  placeholder="Nhập lý do khôi phục"
                  placeholderTextColor={theme.inputPlaceholder}
                  editable={!busy}
                  value={restoreReason}
                  onChangeText={setRestoreReason}
                  maxLength={500}
                  style={styles.input}
                />
              </>
            ) : (
              <Text style={styles.text}>{reason}</Text>
            )}
            <View style={styles.row}>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => setConfirmation(null)}
                style={styles.button}
              >
                <Text style={styles.text}>Hủy</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy || !(confirmation === "save" ? reason.trim() : restoreReason.trim())}
                onPress={() => void commit()}
                style={[styles.button, styles.primary, busy && styles.disabled]}
              >
                <Text style={styles.primaryText}>{busy ? "Đang lưu…" : "Xác nhận áp dụng"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
