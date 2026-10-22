-- ====================================================================
-- CAMPUSLIB - MySQL 8.0 RELATIONAL DATABASE SCHEMA
-- Compatible with MySQL Workbench & MySQL Command Line Client
-- Based on Relational Diagram: Book, Member, Staff, Loan, Reservation
-- ====================================================================

CREATE DATABASE IF NOT EXISTS library_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE library_db;

-- --------------------------------------------------------------------
-- 1. BOOKS TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS books (
    book_id INT AUTO_INCREMENT PRIMARY KEY,
    isbn VARCHAR(20) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    publisher VARCHAR(255),
    publication_year INT,
    genre VARCHAR(100) NOT NULL,
    total_copies INT NOT NULL DEFAULT 1,
    available_copies INT NOT NULL DEFAULT 1,
    shelf_location VARCHAR(50) DEFAULT 'Section A',
    cover_color VARCHAR(20) DEFAULT '#1e3a8a',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_total_copies CHECK (total_copies >= 0),
    CONSTRAINT chk_available_copies CHECK (available_copies >= 0 AND available_copies <= total_copies)
) ENGINE=InnoDB;

CREATE INDEX idx_books_isbn ON books(isbn);
CREATE INDEX idx_books_title ON books(title);
CREATE INDEX idx_books_genre ON books(genre);

-- --------------------------------------------------------------------
-- 2. MEMBERS TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
    member_id INT AUTO_INCREMENT PRIMARY KEY,
    member_code VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL,
    address TEXT,
    membership_type VARCHAR(50) DEFAULT 'Student',
    membership_date DATE DEFAULT (CURRENT_DATE),
    status VARCHAR(20) DEFAULT 'Active',
    max_borrow_limit INT DEFAULT 4,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_member_status CHECK (status IN ('Active', 'Suspended', 'Expired')),
    CONSTRAINT chk_member_type CHECK (membership_type IN ('Student', 'Faculty', 'Researcher'))
) ENGINE=InnoDB;

CREATE INDEX idx_members_code ON members(member_code);
CREATE INDEX idx_members_email ON members(email);
CREATE INDEX idx_members_status ON members(status);

-- --------------------------------------------------------------------
-- 3. STAFF TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff (
    staff_id INT AUTO_INCREMENT PRIMARY KEY,
    staff_code VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    role VARCHAR(50) NOT NULL DEFAULT 'Librarian',
    hire_date DATE DEFAULT (CURRENT_DATE),
    password VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_staff_role CHECK (role IN ('Admin', 'Librarian', 'Assistant'))
) ENGINE=InnoDB;

-- --------------------------------------------------------------------
-- 4. LOANS (CIRCULATION) TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loans (
    loan_id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    member_id INT NOT NULL,
    staff_id INT,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    return_date DATE DEFAULT NULL,
    status VARCHAR(20) DEFAULT 'Issued',
    fine_amount DECIMAL(8, 2) DEFAULT 0.00,
    fine_paid TINYINT(1) DEFAULT 0,
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_loans_book FOREIGN KEY (book_id) REFERENCES books(book_id) ON DELETE RESTRICT,
    CONSTRAINT fk_loans_member FOREIGN KEY (member_id) REFERENCES members(member_id) ON DELETE RESTRICT,
    CONSTRAINT fk_loans_staff FOREIGN KEY (staff_id) REFERENCES staff(staff_id) ON DELETE SET NULL,
    CONSTRAINT chk_loan_status CHECK (status IN ('Issued', 'Returned', 'Overdue'))
) ENGINE=InnoDB;

CREATE INDEX idx_loans_book ON loans(book_id);
CREATE INDEX idx_loans_member ON loans(member_id);
CREATE INDEX idx_loans_status ON loans(status);
CREATE INDEX idx_loans_due ON loans(due_date);

-- --------------------------------------------------------------------
-- 5. RESERVATIONS TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
    reservation_id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    member_id INT NOT NULL,
    reservation_date DATE DEFAULT (CURRENT_DATE),
    status VARCHAR(20) DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_res_book FOREIGN KEY (book_id) REFERENCES books(book_id) ON DELETE CASCADE,
    CONSTRAINT fk_res_member FOREIGN KEY (member_id) REFERENCES members(member_id) ON DELETE CASCADE,
    CONSTRAINT chk_res_status CHECK (status IN ('Pending', 'Fulfilled', 'Cancelled', 'Expired'))
) ENGINE=InnoDB;

-- --------------------------------------------------------------------
-- 6. AUDIT_LOGS TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    staff_name VARCHAR(100) DEFAULT 'System',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
