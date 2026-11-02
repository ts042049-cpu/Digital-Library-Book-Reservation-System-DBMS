# KRMU Library — MongoDB Data Model

**Database:** `krmu_library` (configurable via `MONGO_DB`)
**Connection:** `mongodb://127.0.0.1:27017` by default (configurable via `MONGO_URI`)
**Driver:** official `mongodb` Node.js driver
**Seeds:** `database/seeds/*.json` (demo data + 14,095-title accession catalog)

The relational design used during the first phase of the project is retained
conceptually, but each "table" is now a collection of documents. Business keys
(`book_id`, `member_id`, `loan_id`, …) are stored as numbers so the REST API and
frontend contracts did not need to change. MongoDB's internal `_id` is never
returned by the API.

---

## 1. Collections

### `books` — catalog titles (14,109 seeded)
```js
{
  _id: ObjectId,
  book_id: Number,            // unique business key (counter: book)
  isbn: String,               // unique (demo ISBN or KRMU-ACC-######)
  title: String,
  author: String,
  publisher: String | null,
  publication_year: Number | null,
  genre: String,
  total_copies: Number,
  available_copies: Number,   // total_copies − active loans
  shelf_location: String,
  cover_color: String,
  created_at: Date
}
```

### `members` — library card holders
```js
{
  _id: ObjectId,
  member_id: Number,          // counter: member
  member_code: String,        // unique, e.g. MEM-2026-001
  full_name: String,
  email: String,              // unique (lower-case)
  phone: String,
  address: String,
  membership_type: String,    // Student | Faculty | Researcher
  membership_date: Date,
  status: String,             // Active | Suspended | Expired
  max_borrow_limit: Number,
  created_at: Date
}
```

### `staffs` — library employees / login accounts
```js
{
  _id: ObjectId,
  staff_id: Number,           // counter: staff
  staff_code: String,         // unique, e.g. STF-101
  full_name: String,
  email: String,              // unique
  phone: String,
  role: String,               // Admin | Librarian | Assistant
  hire_date: Date,
  password: String,           // bcrypt hash or seeded demo password
  status: String,
  created_at: Date
}
```

### `loans` — circulation transactions
```js
{
  _id: ObjectId,
  loan_id: Number,            // counter: loan
  book_id: Number,            // reference -> books.book_id
  member_id: Number,          // reference -> members.member_id
  staff_id: Number | null,    // reference -> staffs.staff_id
  issue_date: Date,
  due_date: Date,
  return_date: Date | null,   // null while the copy is out
  status: String,             // Issued | Returned | Overdue
  fine_amount: Number,        // ₹5 per day past due
  fine_paid: Number,          // 1 = paid / no fine, 0 = pending
  remarks: String,
  created_at: Date
}
```

### `reservations` — holds on out-of-stock titles
```js
{
  _id: ObjectId,
  reservation_id: Number,     // counter: reservation
  book_id: Number,
  member_id: Number,
  reservation_date: Date,
  status: String,             // Pending | Fulfilled | Cancelled | Expired
  created_at: Date
}
```

### `auditlogs` — activity trail
```js
{
  _id: ObjectId,
  log_id: Number,             // counter: audit_log
  action_type: String,        // STAFF_LOGIN, LOAN_ISSUE, BOOK_ADD, ...
  description: String,
  staff_name: String,
  timestamp: Date
}
```

### `counters` — atomic sequence generator
```js
{ _id: 'book', seq: 14109 }
{ _id: 'member', seq: 7 }
{ _id: 'staff', seq: 3 }
{ _id: 'loan', seq: 8 }
{ _id: 'reservation', seq: 2 }
{ _id: 'audit_log', seq: 5 }
```

New identifiers are allocated with a single atomic operation:

```js
db.counters.findOneAndUpdate(
  { _id: 'book' },
  { $inc: { seq: 1 } },
  { upsert: true, returnDocument: 'after' }
);
```

---

## 2. Indexes

| Collection | Index | Options |
| :--- | :--- | :--- |
| `books` | `book_id` | unique |
| `books` | `isbn` | unique |
| `books` | `title`, `author`, `genre`, `available_copies` | search/filter support |
| `members` | `member_id`, `member_code`, `email` | unique |
| `members` | `status` | filter |
| `staffs` | `staff_id`, `staff_code`, `email` | unique |
| `loans` | `loan_id` | unique |
| `loans` | `book_id`, `member_id`, `status`, `due_date`, `return_date` | join/overdue queries |
| `reservations` | `reservation_id` | unique |
| `reservations` | `book_id`, `member_id` | lookups |
| `auditlogs` | `log_id` | unique |
| `auditlogs` | `timestamp` | descending feed |

Indexes are created automatically on startup by `database/db.js`
(`createIndexes`).

---

## 3. Dates and API Serialization

MongoDB stores real BSON `Date` values in UTC so range queries
(`due_date < today`) work natively. The REST API converts them back to the
frontend's original string contract:

| Collection field | API field format | Example |
| :--- | :--- | :--- |
| `issue_date`, `due_date`, `return_date`, `membership_date`, `hire_date`, `reservation_date` | `YYYY-MM-DD` | `2026-10-27` |
| `created_at`, `timestamp` | `YYYY-MM-DD HH:mm:ss` | `2026-10-27 09:03:03` |

---

## 4. Integrity Strategy (standalone MongoDB)

The local MongoDB server runs as a **standalone** instance (no replica set), so
multi-document transactions are not available. The application therefore uses:

1. **Atomic single-document updates** — stock is reserved with
   `findOneAndUpdate({ book_id, available_copies: { $gt: 0 } }, { $inc: { available_copies: -1 } })`,
   which makes overselling impossible even under concurrent requests.
2. **Compensating rollback** — if the loan document fails to insert after the
   stock was decremented, the copy is returned with `$inc: { available_copies: 1 }`.
3. **Application-level referential checks** — deleting a book/member is blocked
   while `loans` documents with `return_date: null` reference it. Related
   reservation/loan documents are removed first, then the parent document.
4. **Unique indexes** — enforce unique ISBN, member code, e-mail, staff code and
   business IDs at the database level.
5. **Counter documents** — guarantee gap-free, race-free numeric IDs
   (`findOneAndUpdate + $inc`).
6. **Startup reconciliation** — `refreshOverdueLoans()` recalculates overdue
   status/fines, and seeding recomputes `available_copies` from active loans.

---

## 5. Seeding and Reset

`database/seeds/` contains the complete initial data set:

| File | Contents |
| :--- | :--- |
| `staffs.json` | 3 demo staff accounts |
| `members.json` | 7 demo members |
| `books.json` | 14 demo titles + 14,095 K.R. Mangalam accession titles |
| `loans.json` | 8 demo loans (4 issued, 2 overdue, 2 returned) |
| `reservations.json` | 2 pending reservations |
| `auditlogs.json` | initial activity trail |
| `counters.json` | sequence starting values |

On an empty database the server seeds everything automatically. The
`POST /api/system/reset-demo-data` endpoint deletes all documents and re-imports
the same files, restoring a pristine state for examinations.
