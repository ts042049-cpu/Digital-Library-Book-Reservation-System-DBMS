# Academic DBMS Project Report: KRMU Library

**Student Name:** Tushar Saini  
**Roll Number:** 2501730053  
**Course:** Database Management Systems (DBMS)  
**System:** KRMU Library — K.R. Mangalam University Library Management System  
**Database Engine:** MongoDB 9.0 (document store / NoSQL)  
**Driver:** Official `mongodb` Node.js driver  
**Database:** `krmu_library`

---

## 1. System Overview

KRMU Library is a full-stack Library Management System for the K.R. Mangalam
University Central Library. The first phase of the project modelled the library
as a relational schema (see §3); the current phase migrates the same business
domain to a **document-oriented MongoDB database** without changing the REST API
or the frontend contract.

| Layer | Technology |
| :--- | :--- |
| Frontend | Vanilla HTML5, CSS3, modern JavaScript (single-page app) |
| Backend | Node.js + Express 4, cookie sessions (`express-session`) |
| Database | MongoDB 9.0, official `mongodb` driver |
| Auth | `bcryptjs` password verification, server-side session store |
| Tests | `test_integration.js` (7 end-to-end workflows) |

The migration preserved:

- All numeric business keys (`book_id`, `member_id`, `staff_id`, `loan_id`,
  `reservation_id`, `log_id`) so URLs and API payloads are unchanged.
- The original date contract (`YYYY-MM-DD` and `YYYY-MM-DD HH:mm:ss` strings in
  JSON) while storing real BSON `Date` values inside MongoDB.
- The complete **14,095-title accession catalog** (grouped from 46,944 accession
  copies) plus 14 demo titles → **14,109 catalog titles / 47,018 copies**.

---

## 2. Conceptual Entity–Relationship Model

The conceptual model is unchanged from the relational design; only the physical
representation changed. Six entities and one supporting collection:

```
        ┌────────────┐          ┌─────────────┐
        │   STAFF    │          │   MEMBER    │
        │ staff_id PK│          │ member_id PK│
        └─────┬──────┘          └──────┬──────┘
              │ 1                    1 │
              │                        │
              │        ┌───────────────┴──────────────┐
              │        │                              │
              │     N  │                           N  │
        ┌─────┴────────┴─────┐          ┌─────────────┴────────┐
        │       LOAN         │          │     RESERVATION      │
        │ loan_id PK         │          │ reservation_id PK    │
        │ book_id  FK        │          │ book_id  FK          │
        │ member_id FK       │          │ member_id FK         │
        │ staff_id FK        │          │ reservation_date     │
        │ issue/due/return   │          │ status               │
        │ status, fines      │          └──────────┬───────────┘
        └─────────┬──────────┘                     │
                 │ N                              N │
                 │            ┌───────────────────┴─┐
                 └───────────►│        BOOK         │
                              │ book_id PK          │
                              │ isbn UNIQUE         │
                              │ title, author, …    │
                              │ total/available     │
                              └─────────────────────┘

        AUDIT_LOGS (log_id PK) — append-only activity trail
```

**Relationship cardinalities**

| Relationship | Cardinality | Implementation |
| :--- | :--- | :--- |
| BOOK → LOAN | 1 : N | `loans.book_id` references `books.book_id` |
| MEMBER → LOAN | 1 : N | `loans.member_id` references `members.member_id` |
| STAFF → LOAN | 1 : N (optional) | `loans.staff_id`, nullable (`ON DELETE SET NULL` semantics) |
| BOOK → RESERVATION | 1 : N | `reservations.book_id` |
| MEMBER → RESERVATION | 1 : N | `reservations.member_id` |
| STAFF → AUDIT_LOG | 1 : N (by name) | `auditlogs.staff_name` (historical label, not a hard FK) |

---

## 3. From Relational Tables to MongoDB Collections

### 3.1 Relational baseline (phase 1)

```
BOOK(BookID PK, ISBN UNIQUE, Title, Author, Publisher, PublicationYear,
     Genre, TotalCopies, AvailableCopies, ShelfLocation, CreatedAt)

MEMBER(MemberID PK, MemberCode UNIQUE, FullName, Email UNIQUE, Phone, Address,
       MembershipType, MembershipDate, Status, MaxBorrowLimit, CreatedAt)

STAFF(StaffID PK, StaffCode UNIQUE, FullName, Email UNIQUE, Phone, Role,
      HireDate, Password, Status, CreatedAt)

LOAN(LoanID PK, BookID FK→BOOK, MemberID FK→MEMBER, StaffID FK→STAFF,
     IssueDate, DueDate, ReturnDate, Status, FineAmount, FinePaid,
     Remarks, CreatedAt)

RESERVATION(ReservationID PK, BookID FK→BOOK, MemberID FK→MEMBER,
            ReservationDate, Status, CreatedAt)

AUDIT_LOGS(LogID PK, ActionType, Description, StaffName, Timestamp)
```

### 3.2 Document model (phase 2 — MongoDB)

Each relation became a **collection**; each tuple became a **document**. The
business keys remain ordinary numeric fields (not MongoDB's `_id`), which keeps
the API contract stable and lets us reuse the original integer IDs.

```javascript
// books
{
  _id: ObjectId("..."),
  book_id: 1,                       // unique business key
  isbn: "978-0133970777",           // unique
  title: "Fundamentals of Database Systems",
  author: "Ramez Elmasri & Shamkant Navathe",
  publisher: "Pearson",
  publication_year: 2020,
  genre: "Computer Science",
  total_copies: 6,
  available_copies: 5,              // total_copies − active loans
  shelf_location: "Shelf CS-01",
  cover_color: "#1e3a8a",
  created_at: ISODate("2026-08-01T00:00:00Z")
}
```

```javascript
// members
{
  _id: ObjectId("..."),
  member_id: 2,
  member_code: "MEM-2026-002",
  full_name: "Aarav Patel",
  email: "aarav.patel@student.edu",   // unique, lower-case
  phone: "+91 98722 33445",
  address: "14 Green Park Avenue, New Delhi",
  membership_type: "Student",         // Student | Faculty | Researcher
  membership_date: ISODate("2026-08-05T00:00:00Z"),
  status: "Active",                   // Active | Suspended | Expired
  max_borrow_limit: 4,
  created_at: ISODate("2026-08-05T09:12:00Z")
}
```

```javascript
// staffs
{
  _id: ObjectId("..."),
  staff_id: 1,
  staff_code: "STF-101",
  full_name: "Dr. Rajesh Sharma",
  email: "admin@library.edu",         // unique
  phone: "+91 98765 43210",
  role: "Admin",                      // Admin | Librarian | Assistant
  hire_date: ISODate("2023-01-15T00:00:00Z"),
  password: "admin123",               // bcrypt hash supported
  status: "Active",
  created_at: ISODate("2023-01-15T10:00:00Z")
}
```

```javascript
// loans
{
  _id: ObjectId("..."),
  loan_id: 7,
  book_id: 3,                         // → books.book_id
  member_id: 4,                       // → members.member_id
  staff_id: 2,                        // → staffs.staff_id (nullable)
  issue_date: ISODate("2026-09-20T00:00:00Z"),
  due_date: ISODate("2026-10-04T00:00:00Z"),
  return_date: null,                  // null while the copy is out
  status: "Overdue",                  // Issued | Returned | Overdue
  fine_amount: 115,                   // ₹5 per day past due
  fine_paid: 0,                       // 1 = paid / no fine
  remarks: "Standard Loan",
  created_at: ISODate("2026-09-20T10:31:00Z")
}
```

```javascript
// reservations
{
  _id: ObjectId("..."),
  reservation_id: 1,
  book_id: 5,
  member_id: 3,
  reservation_date: ISODate("2026-10-20T00:00:00Z"),
  status: "Pending",                  // Pending | Fulfilled | Cancelled | Expired
  created_at: ISODate("2026-10-20T11:02:00Z")
}
```

```javascript
// auditlogs
{
  _id: ObjectId("..."),
  log_id: 21,
  action_type: "LOAN_ISSUE",
  description: "Issued \"Clean Code\" to Aarav Patel (MEM-2026-002). Due on 2026-11-10.",
  staff_name: "Dr. Rajesh Sharma",
  timestamp: ISODate("2026-10-27T09:03:03Z")
}
```

```javascript
// counters — atomic numeric sequence generator
{ _id: "book",        seq: 14109 }
{ _id: "member",      seq: 7     }
{ _id: "staff",       seq: 3     }
{ _id: "loan",        seq: 8     }
{ _id: "reservation", seq: 2     }
{ _id: "audit_log",   seq: 5     }
```

### 3.3 Embedding vs. referencing decision

We deliberately **reference** (not embed) across entities:

| Candidate | Decision | Reason |
| :--- | :--- | :--- |
| Loans inside a book document | ❌ Reference | A popular title can have thousands of historical loans; embedding would exceed the 16 MB document limit and violate the unbounded-array anti-pattern. |
| Loans inside a member document | ❌ Reference | Same unbounded growth; also needs book/member lookups from both directions. |
| Book title/author copied into a loan | ❌ Not stored | Snapshotting stale metadata creates anomalies; the API performs a lookup (`$in` batched join) and merges the current title. |
| Staff name inside an audit log | ✅ Embedded string | Audit entries are historical facts; the name at the time of the action must not change if the staff record is renamed. |
| Staff/member address … | ✅ Single document | Atomic to their owning entity. |

The join is performed in application code with a batched `$in` query rather
than `$lookup`, because the loan list only needs a handful of referenced
documents and batched lookups keep latency predictable at 14,109 titles.

---

## 4. Normalization Analysis in the Document Model

The MongoDB model is still evaluated against classical normalization, then
deliberately denormalized only where it is safe.

### First Normal Form (1NF)
- **Criterion:** atomic attributes, no repeating groups.
- **Application:** copies are integers (`total_copies`, `available_copies`) and
  each physical loan is its own document — no comma-separated arrays of copies
  or borrowers. `reservations` is a separate collection, so no array of holds is
  embedded in a book.

### Second Normal Form (2NF)
- **Criterion:** no partial dependency of a non-key attribute on part of a
  composite key.
- **Application:** every document is keyed by a single-field business ID
  (`book_id`, `member_id`, `loan_id`, …); MongoDB's `_id` is also a single
  field. No composite keys exist, so partial dependencies cannot occur.

### Third Normal Form (3NF)
- **Criterion:** no transitive dependency $X \to Y \to Z$ among non-prime
  attributes.
- **Application:** member contact data lives only in `members`; book metadata
  (author, genre, shelf) lives only in `books`. A `loans` document stores only
  `book_id` / `member_id` / `staff_id`, so editing a member's phone number can
  never mutate a historical loan.

### BCNF
- **Criterion:** every determinant is a superkey.
- **Application:** the determinants are the business IDs and the alternate keys
  `isbn`, `member_code`, `email`, `staff_code` — all enforced as **unique
  indexes** in MongoDB, making each one a candidate key.

### Controlled denormalization
- `available_copies` is derived from `total_copies` minus active loans, but it is
  **materialized** on the book document so stock checks are a single-document
  atomic operation instead of a per-request aggregation over all loans.
  Consistency is restored by `reconcileBookStock()` during seeding/reset and by
  atomic `$inc` updates during issue/return.
- `auditlogs.staff_name` is an intentional historical snapshot (see §3.3).

---

## 5. Integrity Constraints in MongoDB

MongoDB is schema-flexible, so constraints that SQL enforced with DDL are
enforced at three levels: **unique indexes**, **atomic update predicates**, and
**application-level referential checks**.

| SQL constraint | MongoDB implementation |
| :--- | :--- |
| `PRIMARY KEY` | Unique index on the business key (`book_id`, `member_id`, …) |
| `UNIQUE` | `books.isbn`, `members.member_code`, `members.email`, `staffs.staff_code`, `staffs.email` |
| `NOT NULL` | Request validation in `routes/api.js` (e.g. ISBN/title/author/genre required) |
| `CHECK (AvailableCopies >= 0)` | Stock is only decremented by `findOneAndUpdate({ available_copies: { $gt: 0 } }, { $inc: { available_copies: -1 } })` |
| `CHECK (AvailableCopies <= TotalCopies)` | Return uses `$min: ['$total_copies', { $add: ['$available_copies', 1] }]`; issue predicated on `> 0` |
| `CHECK (Status IN (...))` | Validated in handlers before writing |
| `FOREIGN KEY … ON DELETE RESTRICT` | Delete handlers count active loans and return HTTP 400 while any exist |
| `FOREIGN KEY … ON DELETE CASCADE` | Delete handlers explicitly `deleteMany` the dependent reservations/loans before removing the parent |
| `FOREIGN KEY … ON DELETE SET NULL` | `staff_id` is nullable; a missing staff document is hydrated as `null` |

Indexes are created idempotently on every start by `createIndexes()` in
`database/db.js`. Full index list: [`database/mongodb_schema.md`](database/mongodb_schema.md).

---

## 6. Atomicity and Concurrency Without Multi-Document Transactions

The local MongoDB instance runs as a **standalone server**, so multi-document
transactions (which require a replica set) are unavailable. Correctness is
achieved with a **single-document atomic operation plus a compensating rollback**:

```javascript
// routes/api.js — POST /api/loans/issue
// 1. Atomically reserve a copy. The predicate guarantees no overselling:
//    two concurrent requests can never both match the last available copy.
const decrement = await books.findOneAndUpdate(
  { book_id: bookId, available_copies: { $gt: 0 } },
  { $inc: { available_copies: -1 } },
  { returnDocument: 'after' }
);
if (!decrement) {
  return res.status(400).json({ success: false, message: 'Out of stock.' });
}

// 2. Insert the loan document. If this fails, compensate by giving the copy back.
try {
  await loans.insertOne({ loan_id, book_id: bookId, member_id: memberId, /* … */ });
} catch (insertErr) {
  await books.updateOne({ book_id: bookId }, { $inc: { available_copies: 1 } });
  throw insertErr;
}

// 3. Fulfil a pending hold for this member, then write the audit entry.
await reservations.updateMany(
  { book_id: bookId, member_id: memberId, status: 'Pending' },
  { $set: { status: 'Fulfilled' } }
);
```

Key properties:

1. **No lost updates.** `$inc` is applied server-side; read-modify-write races on
   `available_copies` are impossible.
2. **No overselling.** The `available_copies: { $gt: 0 }` predicate is evaluated
   atomically with the decrement.
3. **Compensation.** If the dependent insert fails, the decrement is reversed.
4. **Idempotent returns.** `POST /api/loans/:id/return` rejects loans whose
   `return_date` is already set, so a copy cannot be incremented twice.
5. **Race-free IDs.** `counters.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } })`
   allocates gap-free numeric IDs without a separate read.
6. **Read-repair on startup.** `refreshOverdueLoans()` re-evaluates open loans
   and recalculates `status`/`fine_amount` at ₹5 per day.

If the deployment were moved to a replica set, the same flow could be wrapped in
a `session.withTransaction(...)` block; the compensating rollback is retained as
defence in depth.

---

## 7. Indexing and Query Performance

| Collection | Index | Purpose |
| :--- | :--- | :--- |
| `books` | `book_id` (unique), `isbn` (unique) | primary/alternate key lookups |
| `books` | `title`, `author`, `genre`, `available_copies` | catalog filters and sorts |
| `members` | `member_id`, `member_code`, `email` (unique) | login/lookup/registration |
| `members` | `status` | active-member counts |
| `staffs` | `staff_id`, `staff_code`, `email` (unique) | authentication |
| `loans` | `loan_id` (unique) | single loan lookups |
| `loans` | `book_id`, `member_id`, `status` | joins, quota checks, filters |
| `loans` | `due_date`, `return_date` | overdue scans |
| `reservations` | `reservation_id` (unique), `book_id`, `member_id` | hold lookups |
| `auditlogs` | `log_id` (unique), `timestamp` (desc) | activity feed |

**Full-text-style search.** Case-insensitive catalog search uses an escaped
regular expression over `title`/`author`/`isbn`/`publisher`:

```javascript
const rx = new RegExp(escapeRegex(term), 'i');
const filter = { $or: [{ title: rx }, { author: rx }, { isbn: rx }, { publisher: rx }] };
```

Because the catalog is small (14,109 documents) and title/author indexes are in
place, broad searches such as `organic chemistry` (208 matches) return a 300-row
page in under a second locally.

**Pagination.** `GET /api/books` paginates only when `page`/`limit` are supplied
(default 25, hard cap 1000). The Issue Desk requests 300 rows so staff can browse
a large slice of the catalog, and the UI shows a *"Showing 300 of 14,109 matching
titles"* hint.

---

## 8. Aggregation Pipelines for Viva Demonstration

### Q1: Overdue loans with dynamically accrued fines

```javascript
db.loans.aggregate([
  { $match: { return_date: null, due_date: { $lt: new Date('2026-10-27T00:00:00Z') } } },
  { $lookup: {
      from: 'books', localField: 'book_id', foreignField: 'book_id', as: 'book' } },
  { $unwind: '$book' },
  { $lookup: {
      from: 'members', localField: 'member_id', foreignField: 'member_id', as: 'member' } },
  { $unwind: '$member' },
  { $addFields: {
      days_overdue: {
        $dateDiff: { startDate: '$due_date', endDate: '$$NOW', unit: 'day' }
      } } },
  { $addFields: { fine_due: { $multiply: ['$days_overdue', 5] } } },
  { $project: {
      _id: 0, loan_id: 1, title: '$book.title', member: '$member.full_name',
      phone: '$member.phone', due_date: 1, days_overdue: 1, fine_due: 1 } },
  { $sort: { days_overdue: -1 } }
]);
```

The application implements the same logic through `refreshOverdueLoans()` plus the
batched hydration helper, returning `days_overdue` and ₹5/day fines.

### Q2: Top 5 most borrowed books

```javascript
db.loans.aggregate([
  { $group: { _id: '$book_id', times_borrowed: { $sum: 1 } } },
  { $sort: { times_borrowed: -1 } },
  { $limit: 5 },
  { $lookup: {
      from: 'books', localField: '_id', foreignField: 'book_id', as: 'book' } },
  { $unwind: '$book' },
  { $project: {
      _id: 0, title: '$book.title', author: '$book.author',
      genre: '$book.genre', times_borrowed: 1 } }
]);
```

### Q3: Member borrowing-quota verification

```javascript
db.loans.aggregate([
  { $match: { member_id: 2, return_date: null } },
  { $group: { _id: '$member_id', active_loans: { $sum: 1 } } },
  { $lookup: {
      from: 'members', localField: '_id', foreignField: 'member_id', as: 'member' } },
  { $unwind: '$member' },
  { $project: {
      _id: 0, member_code: '$member.member_code', full_name: '$member.full_name',
      max_borrow_limit: '$member.max_borrow_limit', active_loans: 1 } }
]);
```

### Q4: Dashboard inventory totals (single aggregation)

```javascript
db.books.aggregate([
  { $group: {
      _id: null,
      totalTitles:     { $sum: 1 },
      totalCopies:     { $sum: '$total_copies' },
      availableCopies: { $sum: '$available_copies' } } },
  { $project: {
      _id: 0, totalTitles: 1, totalCopies: 1, availableCopies: 1,
      issuedCopies: { $subtract: ['$totalCopies', '$availableCopies'] } } }
]);
```

### Q5: Genre/category distribution

```javascript
db.books.aggregate([
  { $group: {
      _id: '$genre',
      titles_count:     { $sum: 1 },
      total_copies:     { $sum: '$total_copies' },
      available_copies: { $sum: '$available_copies' } } },
  { $sort: { total_copies: -1 } }
]);
```

### Q6: Monthly circulation trend

```javascript
db.loans.aggregate([
  { $match: { issue_date: { $type: 'date' } } },
  { $group: {
      _id: { $dateToString: { format: '%Y-%m', date: '$issue_date' } },
      issue_count: { $sum: 1 } } },
  { $sort: { _id: -1 } },
  { $limit: 6 }
]);
```

---

## 9. Seeding, Reset and the Accession Catalog

| Seed file | Documents | Contents |
| :--- | ---: | :--- |
| `database/seeds/staffs.json` | 3 | demo staff accounts |
| `database/seeds/members.json` | 7 | students, faculty, researcher |
| `database/seeds/books.json` | 14,109 | 14 demo titles + 14,095 accession titles |
| `database/seeds/loans.json` | 8 | 4 Issued, 2 Overdue, 2 Returned |
| `database/seeds/reservations.json` | 2 | pending holds |
| `database/seeds/auditlogs.json` | 4 | initial activity trail |
| `database/seeds/counters.json` | 6 | sequence starting values |

On an empty database the server seeds automatically. The
`POST /api/system/reset-demo-data` endpoint deletes every document and re-imports
the same files, then reconciles stock from active loans — restoring a pristine
state (14,109 titles, 47,018 copies, 47,012 available, 6 active loans) for
examinations and demonstrations.

The accession catalog was generated from the university register
(`Accession wise books detail`): **46,944 accession copies** aggregated into
**14,095 distinct titles** by title, author, edition, publisher and year, with
copy counts, shelf call numbers and school-based genres.

---

## 10. Validation and Test Evidence

| Test | Result |
| :--- | :--- |
| Authentication (bad password, login, session, logout) | ✅ |
| Dashboard metrics (14,109 titles, 47,018 copies, 4 issued, 2 overdue, ₹255 pending fines, 23 genres) | ✅ |
| Book CRUD + unique ISBN + copy validation | ✅ |
| Member CRUD + auto code `MEM-2026-xxx` | ✅ |
| Issue/return atomicity (stock decrement and restore) | ✅ |
| Loan renewal and dynamic fine calculation | ✅ |
| Overdue report with `days_overdue` | ✅ |
| Reports (popular books, top borrowers, monthly trend, inventory) | ✅ |
| CSV circulation export | ✅ |
| Staff listing (passwords excluded) | ✅ |
| Demo reset (14,109 titles restored) | ✅ |
| `node test_integration.js` — 7 end-to-end workflows | ✅ all passed |
| 36-check manual API sweep | ✅ 36/36 |

Reproduce with:

```powershell
Get-Service MongoDB            # must be Running
node test_integration.js      # stop npm run dev first (ports 5000/3000)
```

---

## 11. Viva Presentation Talking Points (Q&A)

| Question | Recommended Answer |
| :--- | :--- |
| **Q: Why did you move from a relational database to MongoDB?** | *The catalog is a large, read-heavy, document-shaped dataset (14,109 titles with heterogeneous publisher/edition metadata). MongoDB stores each title as a self-contained document, scales horizontally, and lets us add catalog fields without schema migrations. We also wanted to demonstrate the NoSQL document model against the same business rules.* |
| **Q: Did you lose the relational design?** | *No. The conceptual entities and cardinalities are unchanged; each former table became a collection and each row a document. We kept numeric business keys and documented the mapping in `database/mongodb_schema.md`.* |
| **Q: How is normalization handled in a document store?** | *The model is still in 1NF–BCNF: attributes are atomic, keys are single-field, and member/book metadata is stored only once. We denormalize exactly one derived field — `available_copies` — for fast atomic stock checks, and reconcile it from active loans on seeding/reset.* |
| **Q: MongoDB has no foreign keys. How do you enforce referential integrity?** | *Three layers: (1) unique indexes enforce candidate keys such as ISBN, e-mail and member code; (2) delete handlers refuse to remove a book/member while active loans reference it and cascade-delete dependent reservation/loan documents; (3) loan hydration treats a missing referenced document as `null` instead of crashing.* |
| **Q: How does your system prevent two students from borrowing the last copy?** | *The stock check and decrement are one atomic single-document operation: `findOneAndUpdate({ book_id, available_copies: { $gt: 0 } }, { $inc: { available_copies: -1 } })`. Only one concurrent request can match the last copy; the other receives an out-of-stock error.* |
| **Q: You are on standalone MongoDB — how do you get atomicity across collections?** | *Multi-document transactions need a replica set. Instead we use an atomic reservation of the copy followed by the loan insert, with a compensating `$inc: { available_copies: 1 }` rollback if the insert fails. Returns are idempotent because a loan with `return_date` set is rejected. On a replica set the same block could be wrapped in `withTransaction`.* |
| **Q: How are late-return fines calculated?** | *A loan is overdue when `return_date` is null and `due_date < today`. `refreshOverdueLoans()` sets `status = 'Overdue'` and `fine_amount = days_late × ₹5`, and the return handler recomputes the fine again at the actual return date. The overdue report derives `days_overdue` with date arithmetic in UTC.* |
| **Q: Why store dates as BSON `Date` instead of strings?** | *BSON dates support native range queries (`due_date: { $lt: today }`), sorting and `$dateDiff`/`$dateToString` aggregations. The API serializes them back to `YYYY-MM-DD` / `YYYY-MM-DD HH:mm:ss` so the frontend contract is unchanged.* |
| **Q: How are numeric IDs generated without collisions?** | *A dedicated `counters` collection uses `findOneAndUpdate({ _id: 'book' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })`. The increment is atomic, so two concurrent inserts can never receive the same ID, and sequences remain gap-free per entity.* |
| **Q: Can a book be deleted while it is issued?** | *No. The delete handler counts loans with `return_date: null` for that book and returns HTTP 400 if any exist. Once all copies are back, it deletes dependent reservations and closed loans before removing the book document.* |
| **Q: How does the UI browse 14,109 titles without lag?** | *The server paginates (default 25, max 1000 rows) and sorts on indexed fields. The Issue Desk requests 300 rows per query and performs debounced server-side regex search, showing a "Showing N of M matching titles" hint so users know the list is capped.* |

---

## 12. Project Structure

```
Digital-Library-Book-Reservation-System-DBMS/
├── server.js                     Express app; awaits MongoDB connect before listen
├── routes/api.js                 REST API — 29 async MongoDB handlers
├── middleware/auth.js            Session and role guards
├── database/
│   ├── db.js                     Connection, indexes, counters, seeds, dates, audit
│   ├── mongodb_schema.md         Document shapes, indexes, integrity strategy
│   └── seeds/                    JSON seed data (14,109 books + demo circulation)
├── public/
│   ├── index.html                Single-page interface + staff login gate
│   ├── css/style.css             Design system, fixed table layouts, book picker
│   ├── js/api.js                 Central API service layer
│   ├── js/app.js                 View controllers, Issue Desk search/picker
│   └── assets/krmu-logo-mark.webp  University emblem (transparent)
├── test_integration.js           7 end-to-end integration workflows
├── README.md                     Setup and architecture guide
└── DBMS_PROJECT_REPORT.md        This report
```
