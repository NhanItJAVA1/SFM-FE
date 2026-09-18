# Budget Progress API - FE Integration Guide

Tài liệu này mô tả API **Budget Progress** để FE tích hợp vào màn hình
chi tiết/theo dõi ngân sách.

## 1. Mục đích

API trả về tình trạng sử dụng của một ngân sách, bao gồm:

-   Hạn mức ngân sách.
-   Tổng tiền đã chi trong thời gian của ngân sách.
-   Số tiền còn lại.
-   Phần trăm ngân sách đã sử dụng.
-   Ngưỡng cảnh báo.
-   Thông tin danh mục và khoảng thời gian ngân sách.

`spentAmount` được BE tính trực tiếp từ các Transaction phù hợp, FE
**không cần tự cộng Transaction**.

------------------------------------------------------------------------

## 2. Endpoint

``` http
GET /api/v1/budgets/{budgetId}/progress
```

Ví dụ:

``` http
GET /api/v1/budgets/1/progress
```

### Authentication

API yêu cầu access token:

``` http
Authorization: Bearer <access_token>
```

FE không cần truyền `userId`. BE lấy `userId` từ JWT của user đang đăng
nhập.

### Request body

Không có body vì đây là API `GET`.

### Path parameter

  Field        Type       Required   Description
  ------------ ---------- ---------- --------------------------------
  `budgetId`   `number`   Yes        ID của Budget cần lấy progress

------------------------------------------------------------------------

## 3. Response

Ví dụ:

``` json
{
  "budgetId": 1,
  "name": "Ăn uống tháng 9",
  "categoryId": 1,
  "categoryName": "Ăn uống",
  "amount": 5000000,
  "spentAmount": 1450000,
  "remainingAmount": 3550000,
  "usedPercentage": 29,
  "alertThreshold": 80,
  "isAlert": false,
  "startDate": "2026-09-01T00:00:00",
  "endDate": "2026-09-30T23:59:59"
}
```

### Ý nghĩa các field

  ------------------------------------------------------------------------
  Field                   Type                    Description
  ----------------------- ----------------------- ------------------------
  `budgetId`              `number`                ID ngân sách

  `name`                  `string`                Tên ngân sách

  `categoryId`            `number \| null`        ID danh mục của ngân
                                                  sách

  `categoryName`          `string \| null`        Tên danh mục

  `amount`                `number`                Tổng hạn mức ngân sách

  `spentAmount`           `number`                Tổng tiền đã chi thuộc
                                                  ngân sách

  `remainingAmount`       `number`                Số tiền còn lại,
                                                  `amount - spentAmount`

  `usedPercentage`        `number`                Phần trăm ngân sách đã
                                                  sử dụng

  `alertThreshold`        `number`                Ngưỡng cảnh báo (%)

  `isAlert`               `boolean`               Cho biết ngân sách đã
                                                  đạt/vượt ngưỡng cảnh báo

  `startDate`             `string`                Ngày bắt đầu ngân sách

  `endDate`               `string`                Ngày kết thúc ngân sách
  ------------------------------------------------------------------------

------------------------------------------------------------------------

## 4. Transaction nào được tính vào Budget?

BE tự động tính `spentAmount`.

Một Transaction chỉ được tính khi thỏa các điều kiện:

-   Thuộc user đang đăng nhập thông qua Financial Account.
-   `type = Expense`.
-   `isExcluded = false`.
-   Transaction chưa bị soft delete.
-   `transactionDate` nằm trong `startDate` → `endDate` của Budget.
-   Nếu Budget có `categoryId`, Transaction phải có cùng `categoryId`.

Ví dụ Budget:

``` json
{
  "id": 1,
  "categoryId": 1,
  "amount": 5000000,
  "startDate": "2026-09-01T00:00:00",
  "endDate": "2026-09-30T23:59:59"
}
```

Transaction sau sẽ được tính:

``` json
{
  "accountId": 1,
  "categoryId": 1,
  "type": "Expense",
  "amount": 250000,
  "transactionDate": "2026-09-18T05:00:00",
  "isExcluded": false,
  "items": []
}
```

Nếu `spentAmount` trước đó là `1,200,000`, sau khi transaction trên được
tạo thành công, gọi lại Progress sẽ nhận:

``` json
{
  "amount": 5000000,
  "spentAmount": 1450000,
  "remainingAmount": 3550000,
  "usedPercentage": 29
}
```

FE không gọi API update Budget để cập nhật các giá trị này.

------------------------------------------------------------------------

## 5. TypeScript type

``` ts
export interface BudgetProgress {
  budgetId: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  amount: number;
  spentAmount: number;
  remainingAmount: number;
  usedPercentage: number;
  alertThreshold: number;
  isAlert: boolean;
  startDate: string;
  endDate: string;
}
```

------------------------------------------------------------------------

## 6. Gọi API bằng Axios

Nếu project đã có Axios instance chứa base URL và interceptor gắn access
token:

``` ts
export const getBudgetProgress = async (
  budgetId: number
): Promise<BudgetProgress> => {
  const response = await api.get<BudgetProgress>(
    `/api/v1/budgets/${budgetId}/progress`
  );

  return response.data;
};
```

Sử dụng:

``` ts
const progress = await getBudgetProgress(1);

console.log(progress.spentAmount);
console.log(progress.remainingAmount);
console.log(progress.usedPercentage);
```

------------------------------------------------------------------------

## 7. Dùng trên UI

Các field chính cho màn Budget Detail:

``` ts
progress.amount
progress.spentAmount
progress.remainingAmount
progress.usedPercentage
progress.alertThreshold
progress.isAlert
```

Progress bar có thể dùng:

``` ts
const progressValue = Math.min(progress.usedPercentage / 100, 1);
```

`Math.min(..., 1)` chỉ dùng cho chiều dài progress bar để tránh thanh
vượt quá 100%. Vẫn nên hiển thị `usedPercentage` thật nếu ngân sách đã
vượt hạn mức.

Ví dụ:

``` text
Ngân sách:       5.000.000đ
Đã chi:          1.450.000đ
Còn lại:         3.550.000đ
Đã sử dụng:      29%
Ngưỡng cảnh báo: 80%
```

------------------------------------------------------------------------

## 8. Sau khi tạo/sửa/xóa Transaction

Progress không phải dữ liệu cố định trong Budget. Nó được tính lại từ
Transaction.

Vì vậy sau các thao tác làm thay đổi chi tiêu:

``` text
Create Transaction
Update Transaction
Delete Transaction
```

FE nên refresh/invalidate dữ liệu Budget Progress nếu màn hình đang sử
dụng dữ liệu này.

Luồng đề xuất:

``` text
Create/Update/Delete Transaction thành công
                ↓
Refresh / invalidate Budget Progress
                ↓
GET /api/v1/budgets/{budgetId}/progress
                ↓
Render lại amount / spent / remaining / percentage
```

Nếu dùng TanStack Query/React Query, nên invalidate query tương ứng sau
mutation.

------------------------------------------------------------------------

## 9. Lưu ý

-   FE không tự tính `spentAmount`.
-   FE không gửi `userId`.
-   API GET Progress không có request body.
-   `categoryId` có thể là `null`.
-   `remainingAmount` có thể âm nếu chi tiêu vượt hạn mức.
-   `usedPercentage` có thể lớn hơn `100`.
-   `isAlert` dùng để hiển thị trạng thái/cảnh báo khi ngân sách đạt
    ngưỡng.
-   Sau khi Transaction thay đổi, cần fetch/invalidate Progress để UI
    nhận dữ liệu mới nhất.
