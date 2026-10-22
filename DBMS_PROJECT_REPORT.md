# Academic DBMS Project Report: Library Management System

**Student Name:** Tushar Saini  
**Roll Number:** 2501730053  
**Course:** Database Management Systems (DBMS)  
**System:** CampusLib — Central Academic Library Management System  

---

## 1. Relational Schema & Mathematical Specification

Based directly on the coursework relational model design in `Library_Relational_Diagram.drawio`:

```
BOOK (
    BookID: INT [PK],
    ISBN: VARCHAR(20) [CK, NOT NULL, UNIQUE],
    Title: VARCHAR(255) [NOT NULL],
    Author: VARCHAR(255) [NOT NULL],
    Publisher: VARCHAR(255),
    PublicationYear: INT,
    Genre: VARCHAR(100) [NOT NULL],
    TotalCopies: INT [NOT NULL, CHECK (TotalCopies >= 0)],
    AvailableCopies: INT [NOT NULL, CHECK (AvailableCopies >= 0 AND AvailableCopies <= TotalCopies)],
    ShelfLocation: VARCHAR(50),
    CreatedAt: DATETIME
)

MEMBER (
    MemberID: INT [PK],
    MemberCode: VARCHAR(50) [CK, NOT NULL, UNIQUE],
    FullName: VARCHAR(255) [NOT NULL],
    Email: VARCHAR(255) [CK, NOT NULL, UNIQUE],
    Phone: VARCHAR(20) [NOT NULL],
    Address: TEXT,
    MembershipType: VARCHAR(50) [CHECK (MembershipType IN ('Student', 'Faculty', 'Researcher'))],
    MembershipDate: DATE,
    Status: VARCHAR(20) [CHECK (Status IN ('Active', 'Suspended', 'Expired'))],
    MaxBorrowLimit: INT,
    CreatedAt: DATETIME
)

STAFF (
    StaffID: INT [PK],
    StaffCode: VARCHAR(50) [CK, NOT NULL, UNIQUE],
    FullName: VARCHAR(255) [NOT NULL],
    Email: VARCHAR(255) [CK, NOT NULL, UNIQUE],
    Phone: VARCHAR(20),
    Role: VARCHAR(50) [CHECK (Role IN ('Admin', 'Librarian', 'Assistant'))],
    HireDate: DATE,
    Password: VARCHAR(255) [NOT NULL],
    Status: VARCHAR(20) [DEFAULT 'Active'],
    CreatedAt: DATETIME
)

LOAN (
    LoanID: INT [PK],
    BookID: INT [FK -> BOOK.BookID, ON DELETE RESTRICT],
    MemberID: INT [FK -> MEMBER.MemberID, ON DELETE RESTRICT],
    StaffID: INT [FK -> STAFF.StaffID, ON DELETE SET NULL],
    IssueDate: DATE [NOT NULL],
    DueDate: DATE [NOT NULL],
    ReturnDate: DATE [DEFAULT NULL],
    Status: VARCHAR(20) [CHECK (Status IN ('Issued', 'Returned', 'Overdue'))],
    FineAmount: DECIMAL(8,2) [DEFAULT 0.00],
    FinePaid: INT [CHECK (FinePaid IN (0, 1))],
    Remarks: TEXT,
    CreatedAt: DATETIME
)

RESERVATION (
    ReservationID: INT [PK],
    BookID: INT [FK -> BOOK.BookID, ON DELETE CASCADE],
    MemberID: INT [FK -> MEMBER.MemberID, ON DELETE CASCADE],
    ReservationDate: DATE,
    Status: VARCHAR(20) [CHECK (Status IN ('Pending', 'Fulfilled', 'Cancelled', 'Expired'))],
    CreatedAt: DATETIME
)

AUDIT_LOGS (
    LogID: INT [PK],
    ActionType: VARCHAR(50) [NOT NULL],
    Description: TEXT [NOT NULL],
    StaffName: VARCHAR(100),
    Timestamp: DATETIME [DEFAULT CURRENT_TIMESTAMP]
)
```

---

## 2. Normalization Analysis (1NF to BCNF)

### First Normal Form (1NF)
- **Criterion**: Every attribute contains only atomic (indivisible) values, and each record has a unique primary key.
- **Application**: In our design, multi-valued attributes (such as multiple book copies or multiple authors) are handled cleanly. Copies are managed through distinct physical quantity integers (`TotalCopies`, `AvailableCopies`) and individually indexed loan records, avoiding repeating groups or comma-separated lists.

### Second Normal Form (2NF)
- **Criterion**: The relation is in 1NF and every non-prime attribute is fully functionally dependent on the entire primary key (no partial dependencies).
- **Application**: All candidate keys in our tables are single-attribute integer identifiers (`BookID`, `MemberID`, `LoanID`, `StaffID`). Because all primary keys are atomic (not composite), no partial dependencies can exist.

### Third Normal Form (3NF)
- **Criterion**: The relation is in 2NF and there are no transitive functional dependencies (i.e., non-prime attributes depending on other non-prime attributes: $X \to Y \to Z$).
- **Application**: Member details (address, phone) reside strictly in `MEMBER`; book metadata (author, genre, shelf) resides strictly in `BOOK`. The `LOAN` relation stores only foreign keys referencing these entities, preventing transitive anomalies like updating a member's phone number affecting historical loans.

### Boyce-Codd Normal Form (BCNF)
- **Criterion**: For every functional dependency $X \to Y$, $X$ must be a superkey.
- **Application**: In each table, every determinant is either the primary key (e.g. `BookID`) or a designated candidate key (e.g. `ISBN`, `MemberCode`, `Email`).

---

## 3. Relational Integrity Constraints

1. **Entity Integrity**:
   - Every primary key (`BookID`, `MemberID`, `LoanID`, `StaffID`) is unique, non-null, and auto-incremented.
2. **Referential Integrity**:
   - `LOAN.BookID` $\to$ `BOOK.BookID` with `ON DELETE RESTRICT` (ensures catalog titles cannot be deleted while copies are in active circulation).
   - `LOAN.MemberID` $\to$ `MEMBER.MemberID` with `ON DELETE RESTRICT` (prevents deleting student records with unresolved loans).
3. **Domain & Check Constraints**:
   - `CHECK (AvailableCopies >= 0 AND AvailableCopies <= TotalCopies)` prevents overselling inventory and negative copy counts.
   - `CHECK (TotalCopies >= 0)` prevents invalid copy values.
   - `CHECK (Status IN ('Active', 'Suspended', 'Expired'))` preserves state validity.

---

## 4. ACID Transaction Implementation

During loan issue and book return, atomicity is guaranteed using SQLite transaction boundaries:

```javascript
// Issue Book ACID Transaction (from routes/api.js)
runTransaction((tx) => {
    // 1. Insert new loan record
    const insertStmt = tx.prepare(`
        INSERT INTO loans (book_id, member_id, staff_id, issue_date, due_date, status, fine_amount, remarks)
        VALUES (?, ?, ?, ?, ?, 'Issued', 0.00, ?)
    `);
    const loanResult = insertStmt.run(bookId, memberId, staffId, issueDate, dueDate, remarks);

    // 2. Decrement available copies atomically
    tx.prepare('UPDATE books SET available_copies = available_copies - 1 WHERE book_id = ?').run(bookId);

    // 3. Fulfill any existing reservation hold
    tx.prepare("UPDATE reservations SET status = 'Fulfilled' WHERE book_id = ? AND member_id = ? AND status = 'Pending'").run(bookId, memberId);
});
```

If the inventory update encounters a lock or violates `CHECK (AvailableCopies >= 0)`, the entire transaction automatically rolls back (`ROLLBACK`), leaving both the catalog and the loans table untouched.

---

## 5. Key SQL Queries for Viva Demonstration

### Q1: Find All Overdue Loans with Computed Fines
```sql
SELECT l.loan_id, b.title, m.full_name, m.phone, l.due_date,
       CAST(julianday('now') - julianday(l.due_date) AS INTEGER) AS days_overdue,
       ROUND(MAX(0, (julianday('now') - julianday(l.due_date)) * 5.0), 2) AS fine_due
FROM loans l
JOIN books b ON l.book_id = b.book_id
JOIN members m ON l.member_id = m.member_id
WHERE l.return_date IS NULL AND l.due_date < date('now')
ORDER BY days_overdue DESC;
```

### Q2: Top 5 Most Borrowed Books (Aggregation & JOIN)
```sql
SELECT b.title, b.author, b.genre, COUNT(l.loan_id) AS total_times_borrowed
FROM books b
LEFT JOIN loans l ON b.book_id = l.book_id
GROUP BY b.book_id
ORDER BY total_times_borrowed DESC
LIMIT 5;
```

### Q3: Member Borrowing Quota Verification
```sql
SELECT m.member_code, m.full_name, m.max_borrow_limit,
       COUNT(l.loan_id) AS active_loans
FROM members m
LEFT JOIN loans l ON m.member_id = l.member_id AND l.return_date IS NULL
WHERE m.member_id = ?
GROUP BY m.member_id;
```

---

## 6. Viva Presentation Talking Points (Q&A)

| Question | Recommended Answer |
| :--- | :--- |
| **Q: Why did you use SQLite for this project?** | *SQLite is a serverless, zero-configuration, ACID-compliant relational database engine that implements the ANSI SQL standard. Because Node.js 22+ includes native synchronous SQLite (`node:sqlite`), our project is 100% portable, requires no external database daemons or native C++ compilation, and handles concurrent reads using Write-Ahead Logging (WAL).* |
| **Q: How does your system prevent two students from borrowing the last copy?** | *We run the stock check and the decrement operation inside an isolated atomic transaction (`runTransaction`). Furthermore, the database schema enforces a `CHECK(available_copies >= 0)` constraint, so even under simultaneous requests, the database engine prevents negative copy counts.* |
| **Q: How are late return fines calculated?** | *Fines are calculated dynamically using the date difference function: `(julianday(return_date) - julianday(due_date)) * 5.00`. An active loan that is overdue accrues ₹5.00 per calendar day until the book is returned.* |
| **Q: Can a book be deleted while it is issued?** | *No. The system performs two checks: first, an application-level validation checking if `active_loans > 0`, and second, the database schema defines a `FOREIGN KEY (book_id) REFERENCES books(book_id) ON DELETE RESTRICT`, preventing cascading deletion of active loan records.* |
