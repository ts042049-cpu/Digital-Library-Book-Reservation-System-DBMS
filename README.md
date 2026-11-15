# KRMU Library — Integrated Full-Stack Library Management System

> **K.R. Mangalam University Library Circulation Desk & DBMS Project**  
> Developed for Academic Evaluation & Project Viva Demonstration  
> **Student:** Tushar Saini (Roll No: 2501730053)  
> **Tech Stack:** Node.js, Express, Session Auth, MongoDB, Vanilla HTML5, CSS3 & Modern JavaScript

---

## 📌 1. Project Overview

**KRMU Library** is a complete, fully integrated full-stack Library Management System. The application pairs an authentic, human-designed frontend with a robust Node.js/Express backend running at `http://localhost:5000`.

All frontend components communicate with backend API endpoints through a centralized, reusable API service layer (`public/js/api.js`) using `credentials: "include"` for session-based cookie authentication. Data is persisted in **MongoDB** through the official Node.js driver (`database/db.js`); the document model is documented in [`database/mongodb_schema.md`](database/mongodb_schema.md).

### Real Library Collection

The catalog is pre-loaded from the K.R. Mangalam University Central Library accession register (`Accession wise books detail`). The raw register contains **46,944 accession copies**; these are aggregated into **14,095 catalog titles** (grouped by title, author, edition, publisher and year) with copy counts, shelf call numbers and school-based categories. The catalog is stored in `database/seeds/books.json` and seeded into MongoDB automatically on first run (or after a demo-data reset). The original 14 demo titles remain available for circulation demonstrations.

---

## 🌐 2. How the Frontend Communicates with the Backend

```
+-------------------------------------------------------------------+
|               KRMU Library Frontend (Browser Client)               |
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
|  - Cookie Parser & Express-Session  - CORS & Request Logging      |
|  - Async MongoDB data access        - Atomic stock operations      |
+-------------------------------------------------------------------+
                                 |
                                 | Official MongoDB Node.js Driver
                                 v
+-------------------------------------------------------------------+
|                    MongoDB — database `krmu_library`              |
|  books · members · staffs · loans · reservations · auditlogs      |
|  counters (atomic ID sequences) · BSON dates · unique indexes      |
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
| **Books** | `GET` | `/api/books/:id` | Book details plus currently active loans | Staff |
| **Books** | `POST` | `/api/books` | Add new catalog title with copy counts & shelf code | Staff / Admin |
| **Books** | `POST` | `/api/books/import` | Bulk-import titles from CSV text (`{ csv, file_name }`) | Staff / Admin |
| **Books** | `PUT` | `/api/books/:id` | Update metadata & copies (validates against issued) | Staff / Admin |
| **Books** | `DELETE` | `/api/books/:id` | Delete book (blocked if copies are currently borrowed) | Admin Only |
| **Members** | `GET` | `/api/members` | Search members, filter by status and type | Staff |
| **Members** | `GET` | `/api/members/:id` | Member profile with active and past loans | Staff |
| **Members** | `POST` | `/api/members` | Register student/faculty with auto-generated code | Staff |
| **Members** | `PUT` | `/api/members/:id` | Update details or toggle status (`Active` / `Suspended`) | Staff |
| **Members** | `DELETE` | `/api/members/:id` | Delete member (blocked if member has active loans) | Admin Only |
| **Loans** | `GET` | `/api/loans` | List circulation records with book/member/staff joins | Staff |
| **Loans** | `GET` | `/api/loans/:id` | Single loan transaction record | Staff |
| **Circulation** | `POST` | `/api/loans/issue` | Issue book: checks stock & quota, atomically decrements copy | Staff |
| **Circulation** | `POST` | `/api/loans/:id/return` | Return book: calculates late fines, restores available copy | Staff |
| **Circulation** | `POST` | `/api/loans/:id/renew` | Extend loan due date by 14 days | Staff |
| **Overdue** | `GET` | `/api/reports/overdue` | List delinquent loans with dynamic fine accrual (₹5/day) | Staff |
| **Overdue** | `POST` | `/api/overdue/remind/:id` | Log an overdue reminder notice | Staff |
| **Reports** | `GET` | `/api/reports` | Popular books, top borrowers, monthly trends, inventory | Staff |
| **Reports** | `GET` | `/api/reports/export` | Download official circulation transaction CSV | Staff |
| **Staff** | `GET` | `/api/staff` | List library staff accounts (passwords excluded) | Staff |
| **System** | `POST` | `/api/system/reset-demo-data` | Restore clean demo database state for exams | Admin |

### Pagination & search

`GET /api/books` paginates only when `page` or `limit` is supplied (default page
size 25, maximum 1000). The Issue Desk requests up to **300 titles** per search
so a large slice of the 14,109-title catalog is browsable, and shows a
“Showing N of M matching titles” hint.

### Bulk book import (CSV)

On **Book Catalog Management**, click **Import CSV** and choose a `.csv` file.
Required columns are `ISBN`, `Title` and `Author`; optional columns are
`Publisher`, `Year` (or `Publication Year`), `Genre` (or `Category`),
`Copies` (or `Total Copies`, default `1`) and `Shelf` (or `Shelf Location`,
default `Section A`). Header names are case-insensitive and `,` `;` or tab
delimiters are auto-detected.

Rows with missing required fields or invalid copy counts are rejected and
reported, while duplicate ISBNs (inside the file or already in the catalog) are
skipped. Valid rows are still imported. A ready-to-use example lives in
`sample_books_import.csv`.

---

## ⚡ 4. How to Run Locally

### Step 1: Start MongoDB
The project expects a local MongoDB server on port `27017`:
```powershell
Get-Service MongoDB          # verify it is Running
# If it is stopped:
Start-Service MongoDB
```
The default database name is `krmu_library`; it is created and seeded
automatically the first time the backend starts.

### Step 2: Install Dependencies
```powershell
cd "D:\DBMS Capstone 3\Digital-Library-Book-Reservation-System-DBMS"
npm install
```

### Step 3: Environment Configuration (optional)
Defaults work without a `.env` file. To override them, copy `.env.example` to
`.env`:
```env
PORT=5000
NODE_ENV=development
SESSION_SECRET=campuslib_super_secret_session_key_2026

MONGO_URI=mongodb://127.0.0.1:27017
MONGO_DB=krmu_library
```
For MongoDB Atlas use `MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net`.

### Step 4: Start the Backend Server
```powershell
npm start
```
The server will start at:
```
http://localhost:5000
```
On first start it creates the indexes and loads the demo data plus the
14,095-title accession catalog (about 5.5 MB of JSON seeds).

### Step 5: Access in Web Browser
Open your browser to:
```
http://localhost:5000
```

---

## 🗄️ 5. MongoDB Setup & Data Model

### Collections
| Collection | Purpose |
| :--- | :--- |
| `books` | 14,109 catalog titles with copy counts and shelf locations |
| `members` | Students, faculty and researchers |
| `staffs` | Library staff accounts and roles |
| `loans` | Issue/return transactions, due dates and fines |
| `reservations` | Pending holds for out-of-stock titles |
| `auditlogs` | Activity trail shown on the dashboard |
| `counters` | Atomic numeric ID sequences (`book`, `member`, `loan`, …) |

### Resetting the demo
```powershell
# From the dashboard, or directly:
Invoke-WebRequest -Uri http://localhost:5000/api/system/reset-demo-data -Method POST
```
This drops all documents and re-imports `database/seeds/*.json`.

### Inspecting data with mongosh
```powershell
mongosh krmu_library --eval "db.books.countDocuments()"                 # 14109
mongosh krmu_library --eval "db.loans.find({return_date:null}).count()"  # 6 active
mongosh krmu_library --eval "db.books.find({title:/database/i}).limit(3)"
```

Full document shapes, indexes and integrity strategy: [`database/mongodb_schema.md`](database/mongodb_schema.md).

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

> The test script starts its own server instance, so stop a running `npm run dev`
> process first (ports 5000/3000 must be free).

---

## 📁 8. Project Structure

```
KRMU Library/
├── server.js                  Express app + MongoDB startup
├── routes/api.js              REST API (async MongoDB handlers)
├── middleware/auth.js         Session / role guards
├── database/
│   ├── db.js                  Mongo connection, indexes, seeds, counters
│   ├── mongodb_schema.md      Document model & index reference
│   └── seeds/                 JSON seed data (demo + full catalog)
├── public/
│   ├── index.html             Single-page interface + staff login gate
│   ├── css/style.css          Design system & responsive tables
│   ├── js/api.js              Central API service layer
│   ├── js/app.js              View controllers & circulation logic
│   └── assets/krmu-logo-mark.webp  University emblem (transparent)
└── test_integration.js        End-to-end test suite
```
