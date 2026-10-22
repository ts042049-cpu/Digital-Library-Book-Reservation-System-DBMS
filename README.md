# CampusLib — Integrated Full-Stack Library Management System

> **Central Academic Circulation Desk & DBMS Project**  
> Developed for Academic Evaluation & Project Viva Demonstration  
> **Student:** Tushar Saini (Roll No: 2501730053)  
> **Tech Stack:** Node.js, Express, Session Auth, MySQL 8.0 & SQLite3, Vanilla HTML5, CSS3, & Modern JavaScript

---

## 📌 1. Project Overview

**CampusLib** is a complete, fully integrated full-stack Library Management System. The application pairs an authentic, human-designed frontend with a robust Node.js/Express backend running at `http://localhost:5000`.

All frontend components communicate with backend API endpoints through a centralized, reusable API service layer ([api.js](file:///D:/DBMS/New%20folder/public/js/api.js)) using `credentials: "include"` for session-based cookie authentication.

---

## 🌐 2. How the Frontend Communicates with the Backend

```
+-------------------------------------------------------------------+
|               CampusLib Frontend (Browser Client)                 |
|  - Dashboard View   - Catalog Management   - Member Directory     |
|  - Circulation Desk - Return & Fine Desk   - Reports & Analytics  |
+-------------------------------------------------------------------+
                                 |
                                 | Fetch API with { credentials: "include" }
                                 v
+-------------------------------------------------------------------+
|                  ApiService (public/js/api.js)                    |
|  Centralizes all HTTP requests, headers, and error normalization  |
+-------------------------------------------------------------------+
                                 |
                                 | HTTP REST Requests
                                 v
+-------------------------------------------------------------------+
|            Express Backend (server.js @ Port 5000)                |
|  - Cookie Parser & Express-Session  - Role Protection Middleware  |
|  - Request Logging & CORS Enabled   - ACID Transaction Boundaries |
+-------------------------------------------------------------------+
                                 |
                                 | Parameterized Queries & Constraints
                                 v
+-------------------------------------------------------------------+
|               Relational Database Engine                          |
|  - MySQL 8.0 (mysql_schema.sql) OR SQLite3 (library.db)          |
|  - Books, Members, Staff, Loans, Reservations, Audit Logs         |
+-------------------------------------------------------------------+
```

---

## 🚀 3. REST API Endpoints Specification

| Domain | Method | Endpoint | Description | Role Required |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | `POST` | `/api/auth/login` | Authenticate staff member with email/code & password | Public |
| **Auth** | `GET` | `/api/auth/me` | Retrieve active authenticated session profile | Authenticated |
| **Auth** | `POST` | `/api/auth/logout` | Terminate session and clear cookie | Authenticated |
| **Dashboard** | `GET` | `/api/reports/dashboard` | Live statistics: total titles, copies, active loans, overdue | Staff |
| **Books** | `GET` | `/api/books` | Search & filter books (by genre, availability, keyword) | Staff |
| **Books** | `POST` | `/api/books` | Add new catalog title with copy counts & shelf code | Staff / Admin |
| **Books** | `PUT` | `/api/books/:id` | Update metadata & copies (validates against issued) | Staff / Admin |
| **Books** | `DELETE` | `/api/books/:id` | Delete book (blocked if copies are currently borrowed) | Admin Only |
| **Members** | `GET` | `/api/members` | Search members, filter by status and type | Staff |
| **Members** | `POST` | `/api/members` | Register student/faculty with auto-generated code | Staff |
| **Members** | `PUT` | `/api/members/:id` | Update details or toggle status (`Active` / `Suspended`) | Staff |
| **Members** | `DELETE` | `/api/members/:id` | Delete member (blocked if member has active loans) | Admin Only |
| **Circulation** | `POST` | `/api/loans/issue` | Issue book: checks stock & quota, decrements available copy | Staff |
| **Circulation** | `POST` | `/api/loans/:id/return` | Return book: calculates late fines, increments available copy | Staff |
| **Circulation** | `POST` | `/api/loans/:id/renew` | Extend loan due date by 14 days | Staff |
| **Overdue** | `GET` | `/api/reports/overdue` | List delinquent loans with dynamic fine accrual (₹5/day) | Staff |
| **Reports** | `GET` | `/api/reports` | Popular books, top active borrowers, monthly trends | Staff |
| **Reports** | `GET` | `/api/reports/export` | Download official circulation transaction CSV | Staff |
| **System** | `POST` | `/api/system/reset-demo-data` | Restore clean demo database state for exams | Admin |

---

## ⚡ 4. How to Run Locally

### Step 1: Install Dependencies
```powershell
cd "D:\DBMS\New folder"
npm install
```

### Step 2: Environment Configuration
The `.env` file is pre-configured:
```env
PORT=5000
NODE_ENV=development
SESSION_SECRET=campuslib_super_secret_session_key_2026
DB_CLIENT=sqlite
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=library_db
```

### Step 3: Start the Backend Server
```powershell
npm start
```
The server will start at:
```
http://localhost:5000
```

### Step 4: Access in Web Browser
Open your browser to:
```
http://localhost:5000
```

---

## 🗄️ 5. MySQL 8.0 Setup (Optional / For MySQL Evaluation)

If your professor specifically requests demonstrating MySQL Server 8.0:
1. Open MySQL Command Line Client or MySQL Workbench.
2. Run the provided schema script:
   ```sql
   SOURCE D:/DBMS/New folder/database/mysql_schema.sql;
   SOURCE D:/DBMS/New folder/database/mysql_seeds.sql;
   ```
3. In `D:\DBMS\New folder\.env`, set:
   ```env
   DB_CLIENT=mysql
   DB_PASSWORD=your_mysql_password
   ```
4. Restart the server (`npm start`). The backend will connect to MySQL Server 8.0 persistently!

---

## 🧑‍💻 6. Demonstration Staff Accounts

| Staff Name | Role | Email | Password | Allowed Operations |
| :--- | :--- | :--- | :--- | :--- |
| **Dr. Rajesh Sharma** | Admin | `admin@library.edu` | `admin123` | Full Access (Catalog, Members, Deletion, Reset) |
| **Pooja Verma** | Librarian | `pooja.verma@library.edu` | `lib123` | Circulation Desk (Issue, Return, Renewal, Fine Collection) |
| **Amit Kumar** | Assistant | `amit.k@library.edu` | `lib123` | Catalog Search & Member Registration |

---

## 🧪 7. Automated Test Suite

To verify all 7 end-to-end integration workflows at any time, run:
```powershell
node test_integration.js
```
The test suite automatically tests:
- Password validation & rejection of unauthorized requests.
- Cookie session establishment via `POST /api/auth/login` and `GET /api/auth/me`.
- Real-time dashboard statistics via `GET /api/reports/dashboard`.
- Complete Book Management CRUD and constraint validation.
- Complete Member Management and auto-code generation (`MEM-2026-xxx`).
- Atomic Issue and Return workflows with stock decrement/increment validation.
- Overdue tracking, fine calculations, and downloadable CSV report generation.
- Session termination via `POST /api/auth/logout`.
