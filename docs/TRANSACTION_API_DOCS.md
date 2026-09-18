# API Tài liệu - Sổ giao dịch (Transaction)

Tài liệu này tổng hợp các API `Transaction` để FE dễ đọc và implement màn **Sổ giao dịch**.

## 1. Thông tin chung

- **Base URL:** `/api/transactions`
- **Auth:** bắt buộc `Bearer token`
- **UserId** được lấy từ token, **không gửi trong body**
- Các request/response đều dùng **JSON**
- Date/time dùng định dạng **ISO 8601**
- Enum `TransactionType` đang được serialize dưới dạng **string** trong JSON

## 2. Enum

### `TransactionType`

- `Income` = 0
- `Expense` = 1
- `TransferIn` = 2
- `TransferOut` = 3

Ví dụ:

```json
{
  "type": "Expense"
}
```

## 3. Danh sách API

### 3.1 Lấy danh sách giao dịch

**GET** `/api/transactions?filter=NotDeleted`

#### Query

- `filter` (optional)
  - `NotDeleted` mặc định
  - `Deleted`
  - `All`

#### Response 200

```json
[
  {
	"id": 101,
	"userId": 1,
	"accountId": 10,
	"categoryId": 5,
	"type": "Expense",
	"amount": 250000,
	"description": "Ăn trưa",
	"transactionDate": "2026-09-17T08:00:00Z",
	"location": "HCM",
	"isExcluded": false,
	"createdAt": "2026-09-17T08:05:00Z",
	"updatedAt": null
  }
]
```

---

### 3.2 Lấy chi tiết giao dịch

**GET** `/api/transactions/{id}`

#### Response 200

```json
{
  "id": 101,
  "userId": 1,
  "accountId": 10,
  "categoryId": 5,
  "type": "Expense",
  "amount": 250000,
  "description": "Ăn trưa",
  "transactionDate": "2026-09-17T08:00:00Z",
  "location": "HCM",
  "isExcluded": false,
  "createdAt": "2026-09-17T08:05:00Z",
  "updatedAt": null
}
```

---

### 3.3 Tạo giao dịch

**POST** `/api/transactions`

#### Request body

```json
{
  "accountId": 10,
  "categoryId": 5,
  "type": "Expense",
  "amount": 250000,
  "description": "Ăn trưa",
  "transactionDate": "2026-09-17T08:00:00Z",
  "location": "HCM",
  "isExcluded": false
}
```

#### Response 200

- Body rỗng

---

### 3.4 Cập nhật giao dịch

**PUT** `/api/transactions/{id}`

#### Request body

```json
{
  "accountId": 10,
  "categoryId": 5,
  "type": "Expense",
  "amount": 300000,
  "description": "Ăn trưa văn phòng",
  "transactionDate": "2026-09-17T08:00:00Z",
  "location": "HCM",
  "isExcluded": false
}
```

#### Response 200

- Body rỗng

---

### 3.5 Xoá giao dịch

**DELETE** `/api/transactions/{id}`

#### Response 204

- Không có body

> Backend đang **xoá mềm** (`DeletedAt`), không xoá vật lý.

## 4. Schema `TransactionResponseDto`

```json
{
  "id": 101,
  "userId": 1,
  "accountId": 10,
  "categoryId": 5,
  "type": "Expense",
  "amount": 250000,
  "description": "Ăn trưa",
  "transactionDate": "2026-09-17T08:00:00Z",
  "location": "HCM",
  "isExcluded": false,
  "createdAt": "2026-09-17T08:05:00Z",
  "updatedAt": null
}
```

### Ý nghĩa field

- `id`: mã giao dịch
- `userId`: chủ sở hữu giao dịch
- `accountId`: tài khoản liên kết
- `categoryId`: danh mục, có thể null
- `type`: loại giao dịch
- `amount`: số tiền
- `description`: ghi chú
- `transactionDate`: ngày giao dịch
- `location`: địa điểm
- `isExcluded`: có loại khỏi tính toán hay không
- `createdAt`: thời gian tạo
- `updatedAt`: thời gian cập nhật

## 5. Gợi ý cho FE

- Màn list Sổ giao dịch: gọi `GET /api/transactions?filter=NotDeleted`
- Màn detail: gọi `GET /api/transactions/{id}`
- Sau khi thêm/sửa/xoá: gọi lại API list để refresh dữ liệu
- FE nên map `type` sang label:
  - `Income` → Thu
  - `Expense` → Chi
  - `TransferIn` → Chuyển vào
  - `TransferOut` → Chuyển ra

## 6. Ví dụ nhanh cho FE

### Tạo giao dịch chi tiêu

```json
{
  "accountId": 10,
  "categoryId": 5,
  "type": "Expense",
  "amount": 75000,
  "description": "Cà phê",
  "transactionDate": "2026-09-17T08:00:00Z",
  "location": "HCM",
  "isExcluded": false
}
```

### Response danh sách

```json
[
  {
	"id": 101,
	"userId": 1,
	"accountId": 10,
	"categoryId": 5,
	"type": "Expense",
	"amount": 75000,
	"description": "Cà phê",
	"transactionDate": "2026-09-17T08:00:00Z",
	"location": "HCM",
	"isExcluded": false,
	"createdAt": "2026-09-17T08:05:00Z",
	"updatedAt": null
  }
]
```
