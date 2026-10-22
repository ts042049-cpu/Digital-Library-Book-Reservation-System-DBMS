-- ====================================================================
-- LIBRARY MANAGEMENT SYSTEM - RELATIONAL DATABASE SCHEMA
-- Designed for College DBMS Project / Academic Project Viva
-- Compatible with SQLite3 & MySQL (ANSI SQL Standard)
-- Based on Relational Diagram: Book, Member, Staff, Loan, Reservation
-- ====================================================================

PRAGMA foreign_keys = ON;

-- --------------------------------------------------------------------
-- 1. BOOKS TABLE
-- Stores catalogued books with physical copy quantities & shelf metadata
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS books (
    book_id INTEGER PRIMARY KEY AUTOINCREMENT,
    isbn VARCHAR(20) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    publisher VARCHAR(255),
    publication_year INTEGER,
    genre VARCHAR(100) NOT NULL,
    total_copies INTEGER NOT NULL CHECK(total_copies >= 0),
    available_copies INTEGER NOT NULL CHECK(available_copies >= 0 AND available_copies <= total_copies),
    shelf_location VARCHAR(50) DEFAULT 'Section A',
    cover_color VARCHAR(20) DEFAULT '#1e3a8a',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index on commonly queried columns for faster search and filtering
CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_genre ON books(genre);

-- --------------------------------------------------------------------
-- 2. MEMBERS TABLE
-- Stores registered library card holders (students, faculty, guests)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
    member_id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_code VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL,
    address TEXT,
    membership_type VARCHAR(50) DEFAULT 'Student', -- 'Student', 'Faculty', 'Researcher'
    membership_date DATE DEFAULT (date('now')),
    status VARCHAR(20) DEFAULT 'Active',            -- 'Active', 'Suspended', 'Expired'
    max_borrow_limit INTEGER DEFAULT 4,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_members_code ON members(member_code);
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);

-- --------------------------------------------------------------------
-- 3. STAFF TABLE
-- Stores library employees, roles, and administrative credentials
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff (
    staff_id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_code VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    role VARCHAR(50) NOT NULL DEFAULT 'Librarian', -- 'Admin', 'Librarian', 'Assistant'
    hire_date DATE DEFAULT (date('now')),
    password VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 4. LOANS (CIRCULATION) TABLE
-- Tracks borrowed books, issue & return timestamps, due dates & fines
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loans (
    loan_id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    staff_id INTEGER,
    issue_date DATE NOT NULL DEFAULT (date('now')),
    due_date DATE NOT NULL,
    return_date DATE DEFAULT NULL,
    status VARCHAR(20) DEFAULT 'Issued', -- 'Issued', 'Returned', 'Overdue'
    fine_amount DECIMAL(8, 2) DEFAULT 0.00,
    fine_paid INTEGER DEFAULT 0,         -- 0 = unpaid/no fine, 1 = paid
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES books(book_id) ON DELETE RESTRICT,
    FOREIGN KEY (member_id) REFERENCES members(member_id) ON DELETE RESTRICT,
    FOREIGN KEY (staff_id) REFERENCES staff(staff_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_loans_book ON loans(book_id);
CREATE INDEX IF NOT EXISTS idx_loans_member ON loans(member_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_due ON loans(due_date);

-- --------------------------------------------------------------------
-- 5. RESERVATIONS TABLE
-- Allows members to hold books that are currently out of stock
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
    reservation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    reservation_date DATE DEFAULT (date('now')),
    status VARCHAR(20) DEFAULT 'Pending', -- 'Pending', 'Fulfilled', 'Cancelled', 'Expired'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES books(book_id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(member_id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------
-- 6. AUDIT_LOGS TABLE
-- Maintains an activity history for accountability and reporting
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type VARCHAR(50) NOT NULL, -- 'ISSUE', 'RETURN', 'RENEWAL', 'BOOK_ADD', etc.
    description TEXT NOT NULL,
    staff_name VARCHAR(100) DEFAULT 'System',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
