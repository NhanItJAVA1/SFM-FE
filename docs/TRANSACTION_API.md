# Transaction API

## 1. Scan Bill

Scan ảnh hóa đơn và trích xuất thông tin giao dịch bằng AI.

### Endpoint

```http
POST /api/v1/transactions/scan-bill
```

### Authentication

```http
Authorization: Bearer <access_token>
```

### Request

Content-Type:

```http
multipart/form-data
```

| Field | Type | Required | Description |
|---|---|---|---|
| image | File | Yes | Ảnh hóa đơn cần scan |

### Response

```json
{
  "categoryId": 1,
  "type": "Expense",
  "amount": 326000,
  "transactionDate": "2017-01-03T08:40:00",
  "location": "QUÁN NHẬU BÌNH DÂN 129, 129 Huỳnh Tấn Phát - Hải Châu - Đà Nẵng",
  "description": "Chi tiêu tại QUÁN NHẬU BÌNH DÂN 129",
  "isExcluded": false,
  "items": [
    {
      "name": "Tiger nâu",
      "quantity": 4,
      "unitPrice": 14000,
      "amount": 56000
    }
  ],
  "itemsTotal": 326000,
  "difference": 0
}
```

### Response fields

| Field | Type | Nullable | Description |
|---|---|---|---|
| categoryId | long | Yes | Category được AI đề xuất và BE validate |
| type | string | No | Luôn là `Expense` đối với scan hóa đơn |
| amount | decimal | Yes | Tổng tiền trên hóa đơn |
| transactionDate | datetime | Yes | Ngày giờ đọc được từ hóa đơn |
| location | string | Yes | Tên/địa chỉ cửa hàng |
| description | string | Yes | Mô tả giao dịch |
| isExcluded | boolean | No | Mặc định `false` |
| items | array | No | Danh sách sản phẩm/dịch vụ |
| itemsTotal | decimal | No | Tổng `amount` của các item |
| difference | decimal | Yes | `amount - itemsTotal` |

### FE Flow

Sau khi scan:

1. Hiển thị dữ liệu lên form tạo Transaction.
2. Cho phép user chỉnh sửa dữ liệu AI nhận diện.
3. User chọn Account.
4. FE thêm `accountId`.
5. POST sang Create Transaction API.

`accountId` không được trả về từ Scan Bill vì Account do user lựa chọn.

`itemsTotal` và `difference` chỉ phục vụ kiểm tra kết quả scan, không cần gửi khi tạo Transaction.

---

## 2. Create Transaction from Scan

### Endpoint

```http
POST /api/v1/transactions
```

### Request

```json
{
  "accountId": 1,
  "categoryId": 1,
  "type": "Expense",
  "amount": 326000,
  "description": "Chi tiêu tại QUÁN NHẬU BÌNH DÂN 129",
  "transactionDate": "2017-01-03T08:40:00",
  "location": "QUÁN NHẬU BÌNH DÂN 129",
  "isExcluded": false,
  "items": [
    {
      "name": "Tiger nâu",
      "quantity": 4,
      "unitPrice": 14000,
      "amount": 56000
    }
  ]
}
```

### Important

FE không gửi:

```text
itemsTotal
difference
```

FE phải bổ sung:

```text
accountId
```

---

# Category Spending Statistics

Thống kê chi tiêu theo Category và so sánh với một kỳ khác.

## Endpoint

```http
GET /api/v1/transactions/category-spending
```

### Authentication

```http
Authorization: Bearer <access_token>
```

## Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| month | int | No | Tháng cần xem (1-12) |
| year | int | No | Năm cần xem |
| compareMonth | int | No | Tháng dùng để so sánh |
| compareYear | int | No | Năm dùng để so sánh |

`month` và `year` phải được truyền cùng nhau.

`compareMonth` và `compareYear` phải được truyền cùng nhau.

---

## Default Request

```http
GET /api/v1/transactions/category-spending
```

Nếu không truyền query:

```text
Current Period = tháng hiện tại
Compare Period = tháng trước
```

Nếu Current Period là tháng hiện tại, API sử dụng MTD (Month To Date).

Ví dụ hôm nay là 17/09/2026:

```text
Current:  01/09/2026 -> 17/09/2026
Compare:  01/08/2026 -> 17/08/2026
```

---

## View Historical Month

```http
GET /api/v1/transactions/category-spending?month=8&year=2026
```

Khi xem tháng trong quá khứ, API lấy toàn bộ tháng:

```text
Current: 01/08/2026 -> 31/08/2026
Compare: 01/07/2026 -> 31/07/2026
```

---

## Custom Comparison

```http
GET /api/v1/transactions/category-spending?month=9&year=2026&compareMonth=7&compareYear=2026
```

Dùng khi FE cho phép user chọn kỳ so sánh.

---

# Response

```json
{
  "currentPeriod": {
    "month": 9,
    "year": 2026,
    "start": "2026-09-01",
    "end": "2026-09-17"
  },
  "comparePeriod": {
    "month": 8,
    "year": 2026,
    "start": "2026-08-01",
    "end": "2026-08-17"
  },
  "totalAmount": 2726000,
  "compareTotalAmount": 1500000,
  "totalChangePercentage": 81.73,
  "categories": [
    {
      "categoryId": 3,
      "categoryName": "Mua sắm",
      "icon": "shopping",
      "amount": 1200000,
      "compareAmount": 0,
      "percentage": 44.02,
      "changePercentage": null,
      "transactionCount": 1,
      "isUncategorized": false
    },
    {
      "categoryId": 1,
      "categoryName": "Ăn uống",
      "icon": "food",
      "amount": 326000,
      "compareAmount": 500000,
      "percentage": 11.96,
      "changePercentage": -34.8,
      "transactionCount": 1,
      "isUncategorized": false
    }
  ]
}
```

---

## Response Fields

### Period

| Field | Type | Description |
|---|---|---|
| month | int | Tháng |
| year | int | Năm |
| start | date | Ngày bắt đầu |
| end | date | Ngày kết thúc |

### Summary

| Field | Type | Nullable | Description |
|---|---|---|---|
| totalAmount | decimal | No | Tổng chi tiêu kỳ hiện tại |
| compareTotalAmount | decimal | No | Tổng chi tiêu kỳ so sánh |
| totalChangePercentage | decimal | Yes | % thay đổi tổng chi tiêu |

### Category

| Field | Type | Nullable | Description |
|---|---|---|---|
| categoryId | long | Yes | ID Category |
| categoryName | string | No | Tên Category |
| icon | string | Yes | Icon Category |
| amount | decimal | No | Chi tiêu kỳ hiện tại |
| compareAmount | decimal | No | Chi tiêu kỳ so sánh |
| percentage | decimal | No | Tỷ trọng trong tổng chi tiêu hiện tại |
| changePercentage | decimal | Yes | % thay đổi so với kỳ trước |
| transactionCount | int | No | Số Transaction kỳ hiện tại |
| isUncategorized | boolean | No | Transaction chưa có Category |

---

# Percentage Rules

## `percentage`

Tỷ lệ Category trong tổng chi tiêu hiện tại.

```text
percentage = categoryAmount / totalAmount * 100
```

Ví dụ:

```text
Category = 500,000
Total    = 2,000,000

percentage = 25
```

FE hiển thị:

```text
25%
```

---

## `changePercentage`

So sánh với kỳ trước:

```text
(currentAmount - compareAmount)
-------------------------------- × 100
          compareAmount
```

### Increase

```json
{
  "amount": 1000000,
  "compareAmount": 800000,
  "changePercentage": 25
}
```

FE:

```text
↑ 25%
```

### Decrease

```json
{
  "amount": 500000,
  "compareAmount": 1000000,
  "changePercentage": -50
}
```

FE:

```text
↓ 50%
```

### No spending in current period

```json
{
  "amount": 0,
  "compareAmount": 400000,
  "changePercentage": -100
}
```

FE:

```text
↓ 100%
```

### New Category spending

Nếu kỳ trước bằng `0` nhưng kỳ hiện tại có chi tiêu:

```json
{
  "amount": 500000,
  "compareAmount": 0,
  "changePercentage": null
}
```

FE nên hiển thị:

```text
Mới
```

Không hiển thị `0%`.

---

# Uncategorized

Transaction có:

```json
{
  "categoryId": null
}
```

được thống kê thành:

```json
{
  "categoryId": null,
  "categoryName": "Chưa phân loại",
  "icon": "other",
  "isUncategorized": true
}
```

FE không được giả định `categoryId` luôn có giá trị.

---

# FE Chart Rules(!!!Hiện tại bỏ quà Chart này)

Đối với Donut/Pie Chart:

- Chỉ sử dụng Category có `amount > 0`.
- Nên tính kích thước chart từ `amount`.
- `percentage` dùng để hiển thị text.
- Không cần tự cộng lại Transaction ở FE.
- Category có `amount = 0` nhưng `compareAmount > 0` vẫn có thể xuất hiện trong danh sách để thể hiện mức giảm.

Ví dụ:

```ts
const chartData = response.categories
  .filter(x => x.amount > 0)
  .map(x => ({
    name: x.categoryName,
    value: x.amount,
  }));
```

---

# Transactions Included in Statistics

BE chỉ tính Transaction thỏa:

```text
type = Expense
isExcluded = false
deletedAt = null
transactionDate nằm trong kỳ thống kê
transaction thuộc Account của user hiện tại
```

Income không được tính vào Category Spending.

Transaction có:

```json
{
  "isExcluded": true
}
```

không được tính vào thống kê.

---

# Error Cases

## Invalid month

```http
GET /api/v1/transactions/category-spending?month=13&year=2026
```

→ `400 Bad Request`

## Missing year

```http
GET /api/v1/transactions/category-spending?month=9
```

→ `400 Bad Request`

## Missing compare year

```http
GET /api/v1/transactions/category-spending?compareMonth=8
```

→ `400 Bad Request`

## Future period

Request kỳ trong tương lai:

→ `400 Bad Request`

## Same comparison period

Current Period và Compare Period giống nhau:

→ `400 Bad Request`