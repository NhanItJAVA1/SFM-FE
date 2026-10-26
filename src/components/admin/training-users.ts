import { adminApi, type AdminUser } from '@/api/adminApi';

export function isTrainingUser(user: AdminUser) {
  return String(user.role).trim().toLowerCase() === 'user';
}

export function getTrainingUserIssue(user: AdminUser, asOf: string): string | null {
  if (!isTrainingUser(user)) return 'Tài khoản Admin không được dùng để huấn luyện.';
  if (user.deletedAt) return 'Người dùng đã bị xóa.';
  if (user.status !== 'Active') return 'Người dùng không ở trạng thái hoạt động.';
  if (!isTrainingDateValid(asOf)) return 'Chưa chọn ngày chốt hợp lệ.';
  if (user.firstFinancialAccountCreatedAt === null) return 'Chưa có tài khoản tài chính.';
  if (!user.firstFinancialAccountCreatedAt) return 'Chưa xác minh được thời điểm tạo tài khoản tài chính.';

  // SQL datetime values may be serialized without a suffix; CreatedAt is stored in UTC.
  const timestamp = user.firstFinancialAccountCreatedAt;
  const utcTimestamp = /(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp) ? timestamp : `${timestamp}Z`;
  const createdAt = new Date(utcTimestamp);
  if (Number.isNaN(createdAt.getTime())) return 'Chưa xác minh được thời điểm tạo tài khoản tài chính.';
  // Match BE: strictly before midnight following asOf in Vietnam (UTC+7).
  const endExclusive = new Date(`${asOf}T00:00:00+07:00`).getTime() + 24 * 60 * 60 * 1000;
  if (createdAt.getTime() >= endExclusive) {
    const accountDate = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(createdAt);
    return `Tài khoản tài chính đầu tiên được tạo ngày ${accountDate}, sau ngày chốt ${asOf.split('-').reverse().join('/')}.`;
  }
  return null;
}

export function canTrainUser(user: AdminUser, asOf: string) {
  return getTrainingUserIssue(user, asOf) === null;
}

export function getTrainingErrorMessage(error: unknown, asOf: string) {
  const response = typeof error === 'object' && error !== null && 'response' in error
    ? (error as { response?: { data?: { errorCode?: string; message?: string } } }).response
    : undefined;
  const data = response?.data;
  if (data?.errorCode === 'FORECAST_TRAINING_USERS_INSUFFICIENT') {
    return `Không thể huấn luyện với danh sách hiện tại. Tất cả người dùng được chọn phải chưa bị xóa, đang hoạt động và có tài khoản tài chính trước hoặc trong ngày ${asOf.split('-').reverse().join('/')}. Cần ít nhất 2 người dùng đủ điều kiện. Hãy tải lại danh sách hoặc đổi ngày chốt.`;
  }
  if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  return error instanceof Error ? error.message : 'Huấn luyện thất bại. Vui lòng thử lại.';
}

/** Load every page for accurate training eligibility counts and selections. */
export async function loadTrainingUsers(): Promise<AdminUser[]> {
  const users = new Map<number, AdminUser>();
  const seenIds = new Set<number>();
  for (let page = 1; ; page += 1) {
    const { data } = await adminApi.listUsers({ role: 'User', page, pageSize: 100 });
    const items = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(items)) throw new Error('Không đọc được danh sách người dùng. Vui lòng tải lại.');
    if (!Array.isArray(data) && (!Number.isFinite(data.totalCount) || data.totalCount < 0)) {
      throw new Error('Không đọc được tổng số người dùng. Vui lòng tải lại.');
    }
    const previousCount = seenIds.size;
    for (const user of items) {
      seenIds.add(user.id);
      // Keep this check even when the API supports filtering by role.
      if (isTrainingUser(user)) users.set(user.id, user);
      else users.delete(user.id);
    }
    if (Array.isArray(data) || seenIds.size >= data.totalCount) break;
    if (seenIds.size === previousCount) {
      throw new Error('Chưa tải đủ danh sách người dùng. Vui lòng thử lại.');
    }
  }
  return [...users.values()];
}

export function isTrainingDateValid(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
