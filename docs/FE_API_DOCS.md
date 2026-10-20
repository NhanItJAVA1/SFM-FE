# SFM-BE Frontend API Docs

Tai lieu nay duoc cap nhat theo source code hien tai cua SFM-BE. Backend code la source of truth.

## Base URL

Local profiles trong `Properties/launchSettings.json`:

```txt
http://localhost:5153
https://localhost:7130
```

Tat ca route ben duoi da bao gom prefix `/api`.

## Quy Uoc Chung

- Request/response body la JSON.
- Property JSON dung camelCase.
- Enum duoc serialize/deserialize bang string do backend cau hinh `JsonStringEnumConverter`.
- Date/time dung ISO 8601 string, vi du `"2026-09-15T10:30:00Z"`.
- Decimal gui bang JSON number, vi du `1500000`.
- Cac endpoint co `[Authorize]` can header:

```http
Authorization: Bearer <accessToken>
```

- Phan lon create/update thanh cong tra `200 OK` body rong. Delete thanh cong thuong tra `204 No Content`.
- DTO hien tai khong co validation attributes. Loi model binding/JSON sai kieu, enum sai value, body invalid co the ve ASP.NET Core validation/problem response, khong theo `GlobalExceptionHandler`.

## Error Format

Khi service/controller throw `AppException`, `GlobalExceptionHandler` tra:

```json
{
  "success": false,
  "statusCode": 404,
  "errorCode": "CATEGORY_NOT_FOUND",
  "message": "Category not found",
  "timestamp": "2026-09-15T10:00:00Z",
  "path": "/api/categories/99"
}
```

Voi exception khong phai `AppException`, backend tra:

```json
{
  "success": false,
  "statusCode": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "An unexpected error occurred.",
  "timestamp": "2026-09-15T10:00:00Z",
  "path": "/api/..."
}
```

## Auth Va Refresh Token

- Login thuong tra `accessToken`, `refreshToken`, `user` trong JSON va set cookie `refreshToken`.
- External login tra `accessToken`,`refreshToken`, `user` trong JSON va set cookie `refreshToken`.
- Cookie refresh token: `HttpOnly=true`, `Secure=true`, `SameSite=Strict`, `Path=/`, expires sau 7 ngay.
- `POST /api/auth/refresh-token` va `POST /api/auth/logout` doc refresh token tu cookie truoc, neu khong co cookie thi doc tu body.
- CORS hien tai `AllowAnyOrigin/Method/Header`, chua `AllowCredentials()`. Neu FE dung cookie qua browser can luu y cau hinh credentials/backend.

## Soft Delete

Convention:

- `DeletedAt == null`: record chua bi xoa.
- `DeletedAt != null`: record da soft delete.
- Delete soft chi cap nhat `DeletedAt`; response DTO hien tai khong expose `deletedAt`.

`DeleteFilter` chi duoc document cho endpoint code hien tai thuc su nhan filter.

```ts
export type DeleteFilter = "NotDeleted" | "Deleted" | "All";
```

Mac dinh la `"NotDeleted"` tren cac list endpoint co filter.

Endpoint list co `DeleteFilter` bang query `?filter=`:

- `GET /api/accounts`
- `GET /api/transactions`
- `GET /api/budgets`
- `GET /api/invoices`
- `GET /api/recurring-transactions`

Endpoint list co `DeleteFilter` nhung code hien tai bind tu body, khong phai query:

- `GET /api/categories` voi JSON body `"NotDeleted"`, `"Deleted"` hoac `"All"`.

GetById cua accounts, categories, transactions, budgets, invoices, recurring transactions dung `ExcludeDeleted()`, nen record da soft delete se khong duoc tra ve va se ra `404`.

Users co `DeletedAt` va delete user la soft delete, nhung list/get user hien tai khong co `DeleteFilter` va khong dung `ExcludeDeleted()`. Transfers khong soft delete; delete transfer la hard delete.

## Enums

```ts
export type AccountType = "Cash" | "Bank" | "Savings";
export type AuthProvider = "Google" | "Facebook" | "Github" | "TikTok";
export type CategoryType = "Income" | "Expense";
export type DeleteFilter = "NotDeleted" | "Deleted" | "All";
export type InvoiceStatus = "Pending" | "Paid" | "Overdue" | "Cancelled";
export type RecurringFrequency = "Daily" | "Weekly" | "Monthly" | "Yearly";
export type TransactionType = "Income" | "Expense" | "TransferIn" | "TransferOut";
export type UserRole = "User" | "Admin";
export type UserStatus = "Active" | "Inactive" | "Suspended";
```

Numeric backing values trong C#:

| Enum | Values |
| --- | --- |
| `AccountType` | `Cash=0`, `Bank=1`, `EWallet=2`, `CreditCard=3`, `Savings=4` |
| `AuthProvider` | `Google=0`, `Facebook=1`, `Github=2`, `TikTok=3` |
| `CategoryType` | `Income=0`, `Expense=1` |
| `DeleteType` | `NotDeleted=0`, `Deleted=1`, `All=2` |
| `InvoiceStatus` | `Pending=0`, `Paid=1`, `Overdue=2`, `Cancelled=3` |
| `RecurringFrequency` | `Daily=0`, `Weekly=1`, `Monthly=2`, `Yearly=3` |
| `TransactionType` | `Income=0`, `Expense=1`, `TransferIn=2`, `TransferOut=3` |
| `UserRole` | `User=0`, `Admin=1` |
| `UserStatus` | `Active=0`, `Inactive=1`, `Suspended=2` |

## DTO Reference

### UserResponseDto

```json
{
  "id": 1,
  "username": "nguyenvana",
  "email": "a@example.com",
  "displayName": "Nguyen Van A",
  "avatarUrl": "https://example.com/avatar.png",
  "role": "User",
  "createdAt": "2026-09-15T10:00:00Z",
  "updatedAt": "2026-09-15T10:00:00Z"
}
```

### FinancialAccountResponseDto

```json
{
  "id": 1,
  "userId": 1,
  "name": "Cash wallet",
  "type": "Cash",
  "currency": "VND",
  "initialBalance": 1000000,
  "isActive": true,
  "createdAt": "2026-09-15T10:00:00Z",
  "updatedAt": null
}
```

### CategoryResponseDto

```json
{
  "id": 1,
  "userId": null,
  "name": "Food",
  "type": "Expense",
  "icon": "utensils",
  "isDefault": true,
  "createdAt": "2026-09-15T10:00:00Z",
  "updatedAt": null
}
```

### TransactionResponseDto

```json
{
  "id": 1,
  "userId": 0,
  "accountId": 1,
  "categoryId": 2,
  "type": "Expense",
  "amount": 75000,
  "description": "Lunch",
  "transactionDate": "2026-09-15T05:00:00Z",
  "location": "HCM",
  "isExcluded": false,
  "createdAt": "2026-09-15T10:00:00Z",
  "updatedAt": null
}
```

### TransferResponseDto

```json
{
  "id": 1,
  "userId": 1,
  "fromAccountId": 1,
  "toAccountId": 2,
  "amount": 500000,
  "description": "Move to savings",
  "transferDate": "2026-09-15T05:00:00Z",
  "createdAt": "2026-09-15T10:00:00Z"
}
```

### BudgetResponseDto

```json
{
  "id": 1,
  "userId": 1,
  "categoryId": 2,
  "name": "Food monthly",
  "amount": 3000000,
  "startDate": "2026-09-01T00:00:00Z",
  "endDate": "2026-09-30T23:59:59Z",
  "alertThreshold": 80,
  "isRecurring": true,
  "createdAt": "2026-09-15T10:00:00Z",
  "updatedAt": null
}
```

### BudgetAlertResponseDto

```json
{
  "id": 1,
  "budgetId": 1,
  "threshold": 80,
  "currentPercentage": 92.5,
  "message": "Budget reached 92.5%",
  "isRead": false,
  "createdAt": "2026-09-15T10:00:00Z"
}
```

### InvoiceResponseDto

```json
{
  "id": 1,
  "userId": 1,
  "title": "Electric bill",
  "amount": 450000,
  "dueDate": "2026-09-20T00:00:00Z",
  "status": "Pending",
  "description": "September bill",
  "createdAt": "2026-09-15T10:00:00Z",
  "updatedAt": null
}
```

### RecurringTransactionResponseDto

```json
{
  "id": 1,
  "userId": 0,
  "accountId": 1,
  "categoryId": 2,
  "type": "Expense",
  "amount": 150000,
  "description": "Weekly groceries",
  "frequency": "Weekly",
  "nextExecutionDate": "2026-09-19T00:00:00Z",
  "isActive": true,
  "createdAt": "2026-09-15T10:00:00Z",
  "updatedAt": null
}
```

## Auth

Public module cho dang ky, dang nhap, external login, refresh token va logout.

| Method | Route | Bearer | Body | Response |
| --- | --- | --- | --- | --- |
| `POST` | `/api/auth/register` | No | `RegisterUserDto` | `200 OK` empty |
| `POST` | `/api/auth/login` | No | `LoginUserDto` | login response |
| `POST` | `/api/auth/external-login` | No | `ExternalLoginDto` | external login response |
| `POST` | `/api/auth/refresh-token` | No | `RefreshTokenDto` or null | `LoginResponseDto` |
| `POST` | `/api/auth/logout` | No | `RefreshTokenDto` or null | `200 OK` empty |

### POST /api/auth/register

Request body:

```json
{
  "username": "nguyenvana",
  "email": "a@example.com",
  "password": "123456",
  "displayName": "Nguyen Van A",
  "avatarUrl": "https://example.com/avatar.png"
}
```

Response: `200 OK`, body rong.

Errors:

- `409 USERNAME_ALREADY_EXISTS`
- `409 EMAIL_ALREADY_EXISTS`
- `500 DEFAULT_ROLE_NOT_FOUND`

### POST /api/auth/login

Request body:

```json
{
  "username": "nguyenvana",
  "password": "123456"
}
```

Response:

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<refresh-token>",
  "user": {
    "id": 1,
    "username": "nguyenvana",
    "email": "a@example.com",
    "displayName": "Nguyen Van A",
    "avatarUrl": null,
    "role": "User",
    "createdAt": "2026-09-15T10:00:00Z",
    "updatedAt": "2026-09-15T10:00:00Z"
  }
}
```

Errors:

- `401 INVALID_CREDENTIALS`

### POST /api/auth/external-login

Provider enum co nhieu value, nhung service hien tai chi register Google provider. Provider khac se bi `UNSUPPORTED_AUTH_PROVIDER`.

Request body:

```json
{
  "provider": "Google",
  "token": "<google-id-token>"
}
```

Response:

```json
{
  "accessToken": "<jwt>",
  "user": {
    "id": 1,
    "username": "a@example.com",
    "email": "a@example.com",
    "displayName": "Nguyen Van A",
    "avatarUrl": "https://example.com/avatar.png",
    "role": "User",
    "createdAt": "2026-09-15T10:00:00Z",
    "updatedAt": "2026-09-15T10:00:00Z"
  }
}
```

Errors:

- `400 UNSUPPORTED_AUTH_PROVIDER`
- `401 INVALID_GOOGLE_TOKEN`
- `401 INVALID_GOOGLE_TOKEN_TYPE`
- `401 GOOGLE_EMAIL_NOT_VERIFIED`
- `409 EXTERNAL_LOGIN_CONFLICT`
- `500 DEFAULT_ROLE_NOT_FOUND`
- `500 INTERNAL_SERVER_ERROR` neu `GOOGLE_CLIENT_ID` chua duoc config

### POST /api/auth/refresh-token

Request body co the null hoac:

```json
{
  "refreshToken": "<refresh-token>"
}
```

Response la `LoginResponseDto`:

```json
{
  "accessToken": "<new-jwt>",
  "refreshToken": "<same-refresh-token>",
  "user": {
    "id": 1,
    "username": "nguyenvana",
    "email": "a@example.com",
    "displayName": "Nguyen Van A",
    "avatarUrl": null,
    "role": "User",
    "createdAt": "2026-09-15T10:00:00Z",
    "updatedAt": "2026-09-15T10:00:00Z"
  }
}
```

Errors:

- `401 REFRESH_TOKEN_REQUIRED`
- `401 INVALID_REFRESH_TOKEN`

### POST /api/auth/logout

Request body co the null hoac:

```json
{
  "refreshToken": "<refresh-token>"
}
```

Response: `200 OK`, body rong. Cookie `refreshToken` bi xoa trong `finally`.

Errors:

- `401 INVALID_REFRESH_TOKEN` neu co token nhung token invalid/expired/revoked

## Users / Account

Controller route la `/api/[controller]`, nen route thuc te la `/api/Users`. Controller hien tai khong co `[Authorize]`.

| Method | Route | Bearer | Params | Body | Response |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/Users` | No | none | none | `UserResponseDto[]` |
| `GET` | `/api/Users/{id}` | No | `id: long` | none | `UserResponseDto` |
| `PUT` | `/api/Users/{id}` | No | `id: long` | `UpdateUserDto` | `200 OK` empty |
| `DELETE` | `/api/Users/{id}` | No | `id: long` | none | `204 No Content` |

### GET /api/Users

Query params: none. Khong ho tro `DeleteFilter`.

Response:

```json
[
  {
    "id": 1,
    "username": "nguyenvana",
    "email": "a@example.com",
    "displayName": "Nguyen Van A",
    "avatarUrl": null,
    "role": "User",
    "createdAt": "2026-09-15T10:00:00Z",
    "updatedAt": "2026-09-15T10:00:00Z"
  }
]
```

Soft-delete behavior: list hien tai khong exclude deleted users, vi service dung `_userRepo.All()`.

### GET /api/Users/{id}

Path params:

| Name | Type | Required |
| --- | --- | --- |
| `id` | `long` | Yes |

Response: `UserResponseDto`.

Soft-delete behavior: get by id hien tai van co the tra user da soft delete, vi service khong dung `ExcludeDeleted()`.

Errors:

- `404 USER_NOT_FOUND`

### PUT /api/Users/{id}

Path params: `id: long`.

Request body:

```json
{
  "email": "new@example.com",
  "displayName": "New Name",
  "avatarUrl": "https://example.com/avatar.png"
}
```

Response: `200 OK`, body rong.

Errors:

- `404 USER_NOT_FOUND`
- `409 EMAIL_ALREADY_EXISTS`

### DELETE /api/Users/{id}

Path params: `id: long`.

Response: `204 No Content`.

Soft-delete behavior: cap nhat `DeletedAt = DateTime.UtcNow` neu user ton tai va chua bi xoa.

Errors:

- `404 USER_NOT_FOUND`

## Financial Account

Quan ly tai khoan tai chinh cua user dang dang nhap. Tat ca endpoint can Bearer token.

| Method | Route | Bearer | Params | Body | Response |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/accounts` | Yes | query `filter?` | none | `FinancialAccountResponseDto[]` |
| `GET` | `/api/accounts/{id}` | Yes | `id: long` | none | `FinancialAccountResponseDto` |
| `POST` | `/api/accounts` | Yes | none | `CreateFinancialAccountDto` | `200 OK` empty |
| `PUT` | `/api/accounts/{id}` | Yes | `id: long` | `UpdateFinancialAccountDto` | `200 OK` empty |
| `DELETE` | `/api/accounts/{id}` | Yes | `id: long` | none | `204 No Content` |

### GET /api/accounts

Query params:

| Name | Type | Required | Default |
| --- | --- | --- | --- |
| `filter` | `DeleteFilter` | No | `NotDeleted` |

Examples:

```http
GET /api/accounts
GET /api/accounts?filter=Deleted
GET /api/accounts?filter=All
```

Response: `FinancialAccountResponseDto[]`.

### GET /api/accounts/{id}

Path params: `id: long`.

Response: `FinancialAccountResponseDto`.

Soft-delete behavior: dung `ExcludeDeleted()`, account da soft delete khong duoc tra ve.

Errors:

- `404 FINANCIAL_ACCOUNT_NOT_FOUND`

### POST /api/accounts

Request body:

```json
{
  "name": "Cash wallet",
  "type": "Cash",
  "currency": "VND",
  "initialBalance": 1000000
}
```

Response: `200 OK`, body rong.

### PUT /api/accounts/{id}

Path params: `id: long`.

Request body:

```json
{
  "name": "Main bank",
  "type": "Bank",
  "currency": "VND",
  "isActive": true
}
```

Response: `200 OK`, body rong.

Errors:

- `404 FINANCIAL_ACCOUNT_NOT_FOUND`

### DELETE /api/accounts/{id}

Path params: `id: long`.

Response: `204 No Content`.

Soft-delete behavior: cap nhat `DeletedAt = DateTime.UtcNow`.

Errors:

- `404 FINANCIAL_ACCOUNT_NOT_FOUND`

## Category

Quan ly category cua user. List/get tra category cua user hien tai va category default co `userId = null`. Update/delete chi ap dung category co `userId` bang user dang dang nhap. Tat ca endpoint can Bearer token.

| Method | Route | Bearer | Params | Body | Response |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/categories` | Yes | none | `DeleteFilter` string optional | `CategoryResponseDto[]` |
| `GET` | `/api/categories/{id}` | Yes | `id: long` | none | `CategoryResponseDto` |
| `POST` | `/api/categories` | Yes | none | `CreateCategoryDto` | `200 OK` empty |
| `PUT` | `/api/categories/{id}` | Yes | `id: long` | `UpdateCategoryDto` | `200 OK` empty |
| `DELETE` | `/api/categories/{id}` | Yes | `id: long` | none | `204 No Content` |

### GET /api/categories

Query params: none in code hien tai.

Request body: do controller dung `[FromBody] DeleteType filter = DeleteType.NotDeleted`, filter neu gui se la JSON string:

```json
"Deleted"
```

Neu khong gui body, mac dinh `NotDeleted`.

Response: `CategoryResponseDto[]`.

### GET /api/categories/{id}

Path params: `id: long`.

Response: `CategoryResponseDto`.

Soft-delete behavior: dung `ExcludeDeleted()`, category da soft delete khong duoc tra ve.

Errors:

- `404 CATEGORY_NOT_FOUND`

### POST /api/categories

Request body:

```json
{
  "name": "Salary",
  "type": "Income",
  "icon": "wallet",
  "isDefault": false
}
```

Response: `200 OK`, body rong.

### PUT /api/categories/{id}

Path params: `id: long`.

Request body:

```json
{
  "name": "Groceries",
  "type": "Expense",
  "icon": "shopping-cart",
  "isDefault": false
}
```

Response: `200 OK`, body rong.

Errors:

- `404 CATEGORY_NOT_FOUND`

### DELETE /api/categories/{id}

Path params: `id: long`.

Response: `204 No Content`.

Soft-delete behavior: cap nhat `DeletedAt = DateTime.UtcNow` cho category cua user neu chua bi xoa. Service dong thoi set `categoryId = null` cho budgets, recurring transactions va transactions dang tham chieu category do.

Errors:

- `404 CATEGORY_NOT_FOUND`

## Transaction

Quan ly transaction. Tat ca endpoint can Bearer token.

Luu y theo code hien tai: controller truyen `GetUserId()` vao service nhung service parameter dat/doi xu nhu `accountId`. Vi vay list/get/create/update hien co behavior theo `AccountId == currentUserId`, va create overwrite `accountId` bang current user id thay vi dung `accountId` trong body. Day la behavior thuc te can FE biet khi tich hop.

| Method | Route | Bearer | Params | Body | Response |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/transactions` | Yes | query `accountId?`, `filter?`, `page?`, `pageSize?` | none | paged transaction response |
| `GET` | `/api/transactions/{id}` | Yes | `id: long` | none | `TransactionResponseDto` |
| `POST` | `/api/transactions` | Yes | none | `CreateTransactionDto` | `200 OK` empty |
| `PUT` | `/api/transactions/{id}` | Yes | `id: long` | `UpdateTransactionDto` | `200 OK` empty |
| `DELETE` | `/api/transactions/{id}` | Yes | `id: long` | none | `204 No Content` |

### GET /api/transactions

Query params:

| Name | Type | Required | Default |
| --- | --- | --- | --- |
| `filter` | `DeleteFilter` | No | `NotDeleted` |
| `page` | `int` | No | `1` |
| `pageSize` | `int` | No | `20` (maximum `100`) |

Response: `{ items: TransactionResponseDto[], page: int, pageSize: int, totalCount: int, totalPages: int }`.

### GET /api/transactions/{id}

Path params: `id: long`.

Response: `TransactionResponseDto`.

Soft-delete behavior: dung `ExcludeDeleted()`, transaction da soft delete khong duoc tra ve.

Errors:

- `404 TRANSACTION_NOT_FOUND`

### POST /api/transactions

Request body:

```json
{
  "accountId": 1,
  "categoryId": 2,
  "type": "Expense",
  "amount": 75000,
  "description": "Lunch",
  "transactionDate": "2026-09-15T05:00:00Z",
  "location": "HCM",
  "isExcluded": false
}
```

Response: `200 OK`, body rong.

Code behavior: `accountId` trong DTO bi mapping ignore va set bang current user id.

### PUT /api/transactions/{id}

Path params: `id: long`.

Request body:

```json
{
  "accountId": 1,
  "categoryId": 2,
  "type": "Expense",
  "amount": 75000,
  "description": "Lunch",
  "transactionDate": "2026-09-15T05:00:00Z",
  "location": "HCM",
  "isExcluded": false
}
```

Response: `200 OK`, body rong.

Errors:

- `404 TRANSACTION_NOT_FOUND`

### DELETE /api/transactions/{id}

Path params: `id: long`.

Response: `204 No Content`.

Soft-delete behavior: cap nhat `DeletedAt = DateTime.UtcNow` neu transaction chua bi xoa. Predicate delete hien tai chi check `id` va `DeletedAt == null`, khong check user/account ownership.

Errors:

- `404 TRANSACTION_NOT_FOUND`

## Transfer

Quan ly transfer cua user dang dang nhap. Tat ca endpoint can Bearer token. Transfer hien tai khong implement soft delete.

| Method | Route | Bearer | Params | Body | Response |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/transfers` | Yes | none | none | `TransferResponseDto[]` |
| `GET` | `/api/transfers/{id}` | Yes | `id: long` | none | `TransferResponseDto` |
| `POST` | `/api/transfers` | Yes | none | `CreateTransferDto` | `200 OK` empty |
| `DELETE` | `/api/transfers/{id}` | Yes | `id: long` | none | `204 No Content` |

### GET /api/transfers

Query params: none. Khong ho tro `DeleteFilter`.

Response: `TransferResponseDto[]`.

### GET /api/transfers/{id}

Path params: `id: long`.

Response: `TransferResponseDto`.

Errors:

- `404 TRANSFER_NOT_FOUND`

### POST /api/transfers

Request body:

```json
{
  "fromAccountId": 1,
  "toAccountId": 2,
  "amount": 500000,
  "description": "Move to savings",
  "transferDate": "2026-09-15T05:00:00Z"
}
```

Response: `200 OK`, body rong.

### DELETE /api/transfers/{id}

Path params: `id: long`.

Response: `204 No Content`.

Delete behavior: hard delete bang `ExecuteDeleteAsync`.

Errors:

- `404 TRANSFER_NOT_FOUND`

## Budget

Quan ly budget cua user dang dang nhap. Tat ca endpoint can Bearer token.

| Method | Route | Bearer | Params | Body | Response |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/budgets` | Yes | query `filter?` | none | `BudgetResponseDto[]` |
| `GET` | `/api/budgets/{id}` | Yes | `id: long` | none | `BudgetResponseDto` |
| `POST` | `/api/budgets` | Yes | none | `CreateBudgetDto` | `200 OK` empty |
| `PUT` | `/api/budgets/{id}` | Yes | `id: long` | `UpdateBudgetDto` | `200 OK` empty |
| `DELETE` | `/api/budgets/{id}` | Yes | `id: long` | none | `204 No Content` |

### GET /api/budgets

Query params:

| Name | Type | Required | Default |
| --- | --- | --- | --- |
| `filter` | `DeleteFilter` | No | `NotDeleted` |

Response: `BudgetResponseDto[]`.

### GET /api/budgets/{id}

Path params: `id: long`.

Response: `BudgetResponseDto`.

Soft-delete behavior: dung `ExcludeDeleted()`, budget da soft delete khong duoc tra ve.

Errors:

- `404 BUDGET_NOT_FOUND`

### POST /api/budgets

Request body:

```json
{
  "categoryId": 2,
  "name": "Food monthly",
  "amount": 3000000,
  "startDate": "2026-09-01T00:00:00Z",
  "endDate": "2026-09-30T23:59:59Z",
  "alertThreshold": 80,
  "isRecurring": true
}
```

Response: `200 OK`, body rong.

### PUT /api/budgets/{id}

Path params: `id: long`.

Request body: same as create.

Response: `200 OK`, body rong.

Errors:

- `404 BUDGET_NOT_FOUND`

### DELETE /api/budgets/{id}

Path params: `id: long`.

Response: `204 No Content`.

Soft-delete behavior: cap nhat `DeletedAt = DateTime.UtcNow`.

Errors theo code hien tai:

- `404 INVOICE_NOT_FOUND` neu khong update duoc budget. Message/error code nay dang bi service throw nham ten invoice.

## Budget Alert

Quan ly alert cua budget thuoc user dang dang nhap. Tat ca endpoint can Bearer token.

| Method | Route | Bearer | Params | Body | Response |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/budget-alerts` | Yes | none | none | `BudgetAlertResponseDto[]` |
| `POST` | `/api/budget-alerts/{id}/read` | Yes | `id: long` | none | `204 No Content` |

### GET /api/budget-alerts

Query params: none. Khong ho tro `DeleteFilter`.

Response: `BudgetAlertResponseDto[]`.

### POST /api/budget-alerts/{id}/read

Path params: `id: long`.

Response: `204 No Content`.

Errors:

- `404 BUDGET_ALERT_NOT_FOUND`

## Invoice

Quan ly invoice cua user dang dang nhap. Tat ca endpoint can Bearer token. Create invoice map `status = Pending` trong backend, request create khong co field `status`.

| Method | Route | Bearer | Params | Body | Response |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/invoices` | Yes | query `filter?` | none | `InvoiceResponseDto[]` |
| `GET` | `/api/invoices/{id}` | Yes | `id: long` | none | `InvoiceResponseDto` |
| `POST` | `/api/invoices` | Yes | none | `CreateInvoiceDto` | `200 OK` empty |
| `PUT` | `/api/invoices/{id}` | Yes | `id: long` | `UpdateInvoiceDto` | `200 OK` empty |
| `DELETE` | `/api/invoices/{id}` | Yes | `id: long` | none | `204 No Content` |

### GET /api/invoices

Query params:

| Name | Type | Required | Default |
| --- | --- | --- | --- |
| `filter` | `DeleteFilter` | No | `NotDeleted` |

Response: `InvoiceResponseDto[]`.

### GET /api/invoices/{id}

Path params: `id: long`.

Response: `InvoiceResponseDto`.

Soft-delete behavior: dung `ExcludeDeleted()`, invoice da soft delete khong duoc tra ve.

Errors:

- `404 INVOICE_NOT_FOUND`

### POST /api/invoices

Request body:

```json
{
  "title": "Electric bill",
  "amount": 450000,
  "dueDate": "2026-09-20T00:00:00Z",
  "description": "September bill"
}
```

Response: `200 OK`, body rong.

### PUT /api/invoices/{id}

Path params: `id: long`.

Request body:

```json
{
  "title": "Electric bill",
  "amount": 450000,
  "dueDate": "2026-09-20T00:00:00Z",
  "status": "Paid",
  "description": "Paid by bank"
}
```

Response: `200 OK`, body rong.

Errors:

- `404 INVOICE_NOT_FOUND`

### DELETE /api/invoices/{id}

Path params: `id: long`.

Response: `204 No Content`.

Soft-delete behavior: cap nhat `DeletedAt = DateTime.UtcNow`.

Errors:

- `404 INVOICE_NOT_FOUND`

## Recurring Transaction

Quan ly recurring transaction. Tat ca endpoint can Bearer token.

Luu y theo code hien tai: controller truyen `GetUserId()` vao service nhung service parameter dat/doi xu nhu `accountId`. Vi vay list/get/create/update hien co behavior theo `AccountId == currentUserId`, va create overwrite `accountId` bang current user id thay vi dung `accountId` trong body.

| Method | Route | Bearer | Params | Body | Response |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/recurring-transactions` | Yes | query `filter?` | none | `RecurringTransactionResponseDto[]` |
| `GET` | `/api/recurring-transactions/{id}` | Yes | `id: long` | none | `RecurringTransactionResponseDto` |
| `POST` | `/api/recurring-transactions` | Yes | none | `CreateRecurringTransactionDto` | `200 OK` empty |
| `PUT` | `/api/recurring-transactions/{id}` | Yes | `id: long` | `UpdateRecurringTransactionDto` | `200 OK` empty |
| `DELETE` | `/api/recurring-transactions/{id}` | Yes | `id: long` | none | `204 No Content` |

### GET /api/recurring-transactions

Query params:

| Name | Type | Required | Default |
| --- | --- | --- | --- |
| `filter` | `DeleteFilter` | No | `NotDeleted` |

Response: `RecurringTransactionResponseDto[]`.

### GET /api/recurring-transactions/{id}

Path params: `id: long`.

Response: `RecurringTransactionResponseDto`.

Soft-delete behavior: dung `ExcludeDeleted()`, recurring transaction da soft delete khong duoc tra ve.

Errors:

- `404 RECURRING_TRANSACTION_NOT_FOUND`

### POST /api/recurring-transactions

Request body:

```json
{
  "accountId": 1,
  "categoryId": 2,
  "type": "Expense",
  "amount": 150000,
  "description": "Weekly groceries",
  "frequency": "Weekly",
  "nextExecutionDate": "2026-09-19T00:00:00Z",
  "isActive": true
}
```

Response: `200 OK`, body rong.

Code behavior: `accountId` trong DTO bi mapping ignore va set bang current user id.

### PUT /api/recurring-transactions/{id}

Path params: `id: long`.

Request body: same as create.

Response: `200 OK`, body rong.

Errors:

- `404 RECURRING_TRANSACTION_NOT_FOUND`

### DELETE /api/recurring-transactions/{id}

Path params: `id: long`.

Response: `204 No Content`.

Soft-delete behavior: cap nhat `DeletedAt = DateTime.UtcNow`; code hien tai cung co y dinh set `IsActive = false` trong update setters.

Errors:

- `404 RECURRING_TRANSACTION_NOT_FOUND`

## Module Khong Ton Tai Endpoint

- Todo: codebase hien tai khong co `TodoController`, DTO, service hay entity todo, nen khong document endpoint Todo.
- Transaction attachments: co entity/DTO/mapping `TransactionAttachment`, nhung khong co controller endpoint public hien tai.
- S3 presigned URL service ton tai, nhung khong co controller endpoint public hien tai.

## Integration Checklist

- Sau login/external-login, luu `accessToken` va gan vao `Authorization` header cho endpoint private.
- Dung enum string dung casing nhu section Enums.
- Sau create/update/delete, refetch list/detail neu FE can data moi vi backend thuong khong tra resource vua thay doi.
- Chi gui `?filter=` cho list endpoint co `[FromQuery] DeleteType filter`.
- Rieng `GET /api/categories`, filter dang bind tu body trong code hien tai.
- Khong ky vong `deletedAt` trong response DTO; backend khong expose field nay.
