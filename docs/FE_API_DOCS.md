# FE API Docs

Tai lieu nay duoc tong hop truc tiep tu source ASP.NET Core hien tai.

## Base URL

Local development:

```txt
http://localhost:5153
https://localhost:7130
```

Tat ca endpoint ben duoi dung prefix `/api`.

## Quy uoc chung

- Body request/response la JSON.
- Enum duoc serialize dang string, vi backend cau hinh `JsonStringEnumConverter`.
- Date/time dung ISO 8601 string, vi du `"2026-09-12T15:30:00Z"`.
- Decimal number gui duoi dang JSON number, vi du `1500000`.
- Cac endpoint co `[Authorize]` can header:

```http
Authorization: Bearer <accessToken>
```

## Auth va token

Backend tra `accessToken` trong JSON. `refreshToken` duoc tra trong JSON voi login thuong, dong thoi set cookie `refreshToken` dang `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, het han sau 7 ngay.

Luu y FE:

- Neu chay local bang `http://localhost:5153`, cookie `Secure=true` co the khong duoc browser luu/gui tren HTTP. FE nen uu tien dung HTTPS local hoac gui `refreshToken` trong body cho refresh/logout.
- CORS hien tai allow any origin/header/method, nhung khong bat credentials. Neu FE muon dung cookie refresh token qua browser, backend can them `AllowCredentials()` va origin cu the.

## Error response

Khi backend throw `AppException`, response co dang:

```json
{
  "success": false,
  "statusCode": 404,
  "errorCode": "CATEGORY_NOT_FOUND",
  "message": "Category not found",
  "timestamp": "2026-09-12T10:00:00Z",
  "path": "/api/categories/99"
}
```

Error code dang gap:

- Auth: `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_REQUIRED`, `UNSUPPORTED_AUTH_PROVIDER`, `EXTERNAL_LOGIN_CONFLICT`, `INVALID_GOOGLE_TOKEN`, `GOOGLE_EMAIL_NOT_VERIFIED`
- Register/user: `USERNAME_ALREADY_EXISTS`, `EMAIL_ALREADY_EXISTS`, `USER_NOT_FOUND`
- Resource: `FINANCIAL_ACCOUNT_NOT_FOUND`, `CATEGORY_NOT_FOUND`, `TRANSACTION_NOT_FOUND`, `TRANSFER_NOT_FOUND`, `BUDGET_NOT_FOUND`, `BUDGET_ALERT_NOT_FOUND`, `INVOICE_NOT_FOUND`, `RECURRING_TRANSACTION_NOT_FOUND`

## Enums

Gui va nhan cac enum bang string:

```ts
type AccountType = "Cash" | "Bank" | "EWallet" | "CreditCard" | "Savings";
type AuthProvider = "Google" | "Facebook" | "Github" | "TikTok";
type CategoryType = "Income" | "Expense";
type InvoiceStatus = "Pending" | "Paid" | "Overdue" | "Cancelled";
type RecurringFrequency = "Daily" | "Weekly" | "Monthly" | "Yearly";
type TransactionType = "Income" | "Expense" | "TransferIn" | "TransferOut";
type UserRole = "User" | "Admin";
type UserStatus = "Active" | "Inactive" | "Suspended";
```

## Auth

### Register

`POST /api/auth/register`

Public endpoint. Response thanh cong: `200 OK`, body rong.

Request:

```json
{
  "username": "nguyenvana",
  "email": "a@example.com",
  "password": "123456",
  "displayName": "Nguyen Van A",
  "avatarUrl": "https://example.com/avatar.png"
}
```

### Login

`POST /api/auth/login`

Public endpoint.

Request:

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
    "createdAt": "2026-09-12T10:00:00Z",
    "updatedAt": "2026-09-12T10:00:00Z"
  }
}
```

### External login

`POST /api/auth/external-login`

Public endpoint. Provider hien co service validate chi la Google.

Request:

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
    "createdAt": "2026-09-12T10:00:00Z",
    "updatedAt": "2026-09-12T10:00:00Z"
  }
}
```

### Refresh token

`POST /api/auth/refresh-token`

Public endpoint. Backend doc token tu cookie `refreshToken` truoc; neu khong co cookie thi doc body.

Request body co the null hoac:

```json
{
  "refreshToken": "<refresh-token>"
}
```

Response:

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
    "createdAt": "2026-09-12T10:00:00Z",
    "updatedAt": "2026-09-12T10:00:00Z"
  }
}
```

### Logout

`POST /api/auth/logout`

Public endpoint. Backend doc token tu cookie `refreshToken` truoc; neu khong co cookie thi doc body. Response thanh cong: `200 OK`, body rong.

Request body co the null hoac:

```json
{
  "refreshToken": "<refresh-token>"
}
```

## Users

Base route: `/api/Users`

Controller nay hien khong co `[Authorize]`.

### List users

`GET /api/Users`

Response: `UserResponseDto[]`.

### Get user

`GET /api/Users/{id}`

Response: `UserResponseDto`.

### Update user

`PUT /api/Users/{id}`

Request:

```json
{
  "email": "new@example.com",
  "displayName": "New Name",
  "avatarUrl": "https://example.com/avatar.png"
}
```

Response thanh cong: `200 OK`, body rong.

### Delete user

`DELETE /api/Users/{id}`

Response thanh cong: `204 No Content`.

## Accounts

Base route: `/api/accounts`

Can Bearer token.

### List accounts

`GET /api/accounts`

Response:

```json
[
  {
    "id": 1,
    "userId": 1,
    "name": "Cash wallet",
    "type": "Cash",
    "currency": "VND",
    "initialBalance": 1000000,
    "isActive": true,
    "createdAt": "2026-09-12T10:00:00Z",
    "updatedAt": "2026-09-12T10:00:00Z"
  }
]
```

### Get account

`GET /api/accounts/{id}`

Response: `FinancialAccountResponseDto`.

### Create account

`POST /api/accounts`

Request:

```json
{
  "name": "Cash wallet",
  "type": "Cash",
  "currency": "VND",
  "initialBalance": 1000000
}
```

Response thanh cong: `200 OK`, body rong.

### Update account

`PUT /api/accounts/{id}`

Request:

```json
{
  "name": "Main bank",
  "type": "Bank",
  "currency": "VND",
  "isActive": true
}
```

Response thanh cong: `200 OK`, body rong.

### Delete account

`DELETE /api/accounts/{id}`

Response thanh cong: `204 No Content`.

## Categories

Base route: `/api/categories`

Can Bearer token.

List/get tra ca category cua user va category default co `userId = null`. Update/delete chi tac dong category cua user.

### List categories

`GET /api/categories`

Response:

```json
[
  {
    "id": 1,
    "userId": null,
    "name": "Food",
    "type": "Expense",
    "icon": "utensils",
    "isDefault": true,
    "createdAt": "2026-09-12T10:00:00Z",
    "updatedAt": null
  }
]
```

### Get category

`GET /api/categories/{id}`

Response: `CategoryResponseDto`.

### Create category

`POST /api/categories`

Request:

```json
{
  "name": "Salary",
  "type": "Income",
  "icon": "wallet",
  "isDefault": false
}
```

Response thanh cong: `200 OK`, body rong.

### Update category

`PUT /api/categories/{id}`

Request:

```json
{
  "name": "Groceries",
  "type": "Expense",
  "icon": "shopping-cart",
  "isDefault": false
}
```

Response thanh cong: `200 OK`, body rong.

### Delete category

`DELETE /api/categories/{id}`

Response thanh cong: `204 No Content`.

Side effect hien tai: truoc khi xoa category, backend set `categoryId = null` cho budget, recurring transaction va transaction dang tham chieu category do.

## Transactions

Base route: `/api/transactions`

Can Bearer token.

Backend xac nhan transactions dung `accountId` FE gui de gan giao dich vao tai khoan tai chinh.

### List transactions

`GET /api/transactions`

Response:

```json
[
  {
    "id": 1,
    "userId": 0,
    "accountId": 1,
    "categoryId": 2,
    "type": "Expense",
    "amount": 75000,
    "description": "Lunch",
    "transactionDate": "2026-09-12T05:00:00Z",
    "location": "HCM",
    "isExcluded": false,
    "createdAt": "2026-09-12T10:00:00Z",
    "updatedAt": "2026-09-12T10:00:00Z"
  }
]
```

### Get transaction

`GET /api/transactions/{id}`

Response: `TransactionResponseDto`.

### Create transaction

`POST /api/transactions`

Request:

```json
{
  "accountId": 1,
  "categoryId": 2,
  "type": "Expense",
  "amount": 75000,
  "description": "Lunch",
  "transactionDate": "2026-09-12T05:00:00Z",
  "location": "HCM",
  "isExcluded": false
}
```

Response thanh cong: `200 OK`, body rong.

### Update transaction

`PUT /api/transactions/{id}`

Request: giong create request.

Response thanh cong: `200 OK`, body rong.

### Delete transaction

`DELETE /api/transactions/{id}`

Response thanh cong: `204 No Content`.

## Transfers

Base route: `/api/transfers`

Can Bearer token.

### List transfers

`GET /api/transfers`

Response:

```json
[
  {
    "id": 1,
    "userId": 1,
    "fromAccountId": 1,
    "toAccountId": 2,
    "amount": 500000,
    "description": "Move to savings",
    "transferDate": "2026-09-12T05:00:00Z",
    "createdAt": "2026-09-12T10:00:00Z"
  }
]
```

### Get transfer

`GET /api/transfers/{id}`

Response: `TransferResponseDto`.

### Create transfer

`POST /api/transfers`

Request:

```json
{
  "fromAccountId": 1,
  "toAccountId": 2,
  "amount": 500000,
  "description": "Move to savings",
  "transferDate": "2026-09-12T05:00:00Z"
}
```

Response thanh cong: `200 OK`, body rong.

### Delete transfer

`DELETE /api/transfers/{id}`

Response thanh cong: `204 No Content`.

## Budgets

Base route: `/api/budgets`

Can Bearer token.

### List budgets

`GET /api/budgets`

Response:

```json
[
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
    "createdAt": "2026-09-12T10:00:00Z",
    "updatedAt": "2026-09-12T10:00:00Z"
  }
]
```

### Get budget

`GET /api/budgets/{id}`

Response: `BudgetResponseDto`.

### Create budget

`POST /api/budgets`

Request:

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

Response thanh cong: `200 OK`, body rong.

### Update budget

`PUT /api/budgets/{id}`

Request: giong create request.

Response thanh cong: `200 OK`, body rong.

### Delete budget

`DELETE /api/budgets/{id}`

Response thanh cong: `204 No Content`.

## Budget alerts

Base route: `/api/budget-alerts`

Can Bearer token.

### List alerts

`GET /api/budget-alerts`

Response:

```json
[
  {
    "id": 1,
    "budgetId": 1,
    "threshold": 80,
    "currentPercentage": 92.5,
    "message": "Budget reached 92.5%",
    "isRead": false,
    "createdAt": "2026-09-12T10:00:00Z"
  }
]
```

### Mark alert as read

`POST /api/budget-alerts/{id}/read`

Response thanh cong: `204 No Content`.

## Invoices

Base route: `/api/invoices`

Can Bearer token. Create invoice mac dinh status la `Pending`.

### List invoices

`GET /api/invoices`

Response:

```json
[
  {
    "id": 1,
    "userId": 1,
    "title": "Electric bill",
    "amount": 450000,
    "dueDate": "2026-09-20T00:00:00Z",
    "status": "Pending",
    "description": "September bill",
    "createdAt": "2026-09-12T10:00:00Z",
    "updatedAt": "2026-09-12T10:00:00Z"
  }
]
```

### Get invoice

`GET /api/invoices/{id}`

Response: `InvoiceResponseDto`.

### Create invoice

`POST /api/invoices`

Request:

```json
{
  "title": "Electric bill",
  "amount": 450000,
  "dueDate": "2026-09-20T00:00:00Z",
  "description": "September bill"
}
```

Response thanh cong: `200 OK`, body rong.

### Update invoice

`PUT /api/invoices/{id}`

Request:

```json
{
  "title": "Electric bill",
  "amount": 450000,
  "dueDate": "2026-09-20T00:00:00Z",
  "status": "Paid",
  "description": "Paid by bank"
}
```

Response thanh cong: `200 OK`, body rong.

### Delete invoice

`DELETE /api/invoices/{id}`

Response thanh cong: `204 No Content`.

## Recurring transactions

Base route: `/api/recurring-transactions`

Can Bearer token.

Backend xac nhan recurring transactions dung `accountId` FE gui de gan giao dich lap lai vao tai khoan tai chinh.

### List recurring transactions

`GET /api/recurring-transactions`

Response:

```json
[
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
    "createdAt": "2026-09-12T10:00:00Z",
    "updatedAt": "2026-09-12T10:00:00Z"
  }
]
```

### Get recurring transaction

`GET /api/recurring-transactions/{id}`

Response: `RecurringTransactionResponseDto`.

### Create recurring transaction

`POST /api/recurring-transactions`

Request:

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

Response thanh cong: `200 OK`, body rong.

### Update recurring transaction

`PUT /api/recurring-transactions/{id}`

Request: giong create request.

Response thanh cong: `200 OK`, body rong.

### Delete recurring transaction

`DELETE /api/recurring-transactions/{id}`

Response thanh cong: `204 No Content`.

## TypeScript DTO goi y

```ts
export type ApiError = {
  success: false;
  statusCode: number;
  errorCode: string;
  message: string;
  timestamp: string;
  path: string;
};

export type UserResponse = {
  id: number;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: UserResponse;
};

export type Account = {
  id: number;
  userId: number;
  name: string;
  type: AccountType;
  currency: string;
  initialBalance: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
};
```

## Checklist cho FE integration

- Luu `accessToken` sau login va gan vao `Authorization` header cho tat ca endpoint private.
- Xu ly `401` bang cach goi `/api/auth/refresh-token`; neu khong dung cookie, gui `refreshToken` trong body.
- Dung enum string dung casing nhu docs.
- Sau create/update/delete, backend thuong chi tra body rong; FE nen refetch list/detail neu can data moi.
- Transactions va recurring transactions dung `accountId`; FE can gui dung tai khoan nguon khi create/update.
