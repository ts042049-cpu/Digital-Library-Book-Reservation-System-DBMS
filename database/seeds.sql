-- 1. Insert Staff Accounts
-- Default passwords for testing: 'admin123' for Admin, 'lib123' for Librarian
INSERT INTO staff (staff_id, staff_code, full_name, email, phone, role, hire_date, password, status) VALUES
(1, 'STF-101', 'Dr. Rajesh Sharma', 'admin@library.edu', '+91 98765 43210', 'Admin', '2023-01-15', 'admin123', 'Active'),
(2, 'STF-102', 'Pooja Verma', 'pooja.verma@library.edu', '+91 98123 45678', 'Librarian', '2024-03-01', 'lib123', 'Active'),
(3, 'STF-103', 'Amit Kumar', 'amit.k@library.edu', '+91 98234 56789', 'Assistant', '2024-08-10', 'lib123', 'Active');

-- 2. Insert Books (Academic, Technical, and General Literature)
INSERT INTO books (book_id, isbn, title, author, publisher, publication_year, genre, total_copies, available_copies, shelf_location, cover_color) VALUES
(1, '978-0133970777', 'Fundamentals of Database Systems', 'Ramez Elmasri & Shamkant Navathe', 'Pearson', 2016, 'Computer Science', 6, 4, 'Shelf CS-01', '#1e3a8a'),
(2, '978-0078022159', 'Database System Concepts (6th Edition)', 'Abraham Silberschatz, Henry F. Korth & S. Sudarshan', 'McGraw-Hill', 2011, 'Computer Science', 8, 6, 'Shelf CS-01', '#0d9488'),
(3, '978-0262033848', 'Introduction to Algorithms (CLRS)', 'Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest, Clifford Stein', 'MIT Press', 2009, 'Computer Science', 5, 2, 'Shelf CS-02', '#3b82f6'),
(4, '978-0132350884', 'Clean Code: A Handbook of Agile Software Craftsmanship', 'Robert C. Martin', 'Prentice Hall', 2008, 'Software Engineering', 4, 3, 'Shelf SE-01', '#059669'),
(5, '978-0131103627', 'The C Programming Language (2nd Edition)', 'Brian W. Kernighan & Dennis M. Ritchie', 'Prentice Hall', 1988, 'Computer Science', 7, 5, 'Shelf CS-03', '#475569'),
(6, '978-0132143011', 'Computer Networks (5th Edition)', 'Andrew S. Tanenbaum & David J. Wetherall', 'Pearson', 2011, 'Networking', 5, 4, 'Shelf NET-01', '#0284c7'),
(7, '978-0133594140', 'Operating System Concepts (10th Edition)', 'Abraham Silberschatz, Peter B. Galvin & Greg Gagne', 'Wiley', 2018, 'Computer Science', 6, 4, 'Shelf CS-02', '#7c3aed'),
(8, '978-0073383095', 'Discrete Mathematics and Its Applications', 'Kenneth H. Rosen', 'McGraw-Hill', 2012, 'Mathematics', 5, 5, 'Shelf MATH-01', '#d97706'),
(9, '978-0980232776', 'Introduction to Linear Algebra (5th Edition)', 'Gilbert Strang', 'Wellesley-Cambridge Press', 2016, 'Mathematics', 4, 3, 'Shelf MATH-02', '#ea580c'),
(10, '978-0134610993', 'Artificial Intelligence: A Modern Approach (4th Edition)', 'Stuart Russell & Peter Norvig', 'Pearson', 2020, 'Artificial Intelligence', 4, 2, 'Shelf AI-01', '#4f46e5'),
(11, '978-0451524935', '1984', 'George Orwell', 'Signet Classic', 1949, 'Fiction & Literature', 6, 5, 'Shelf LIT-01', '#b91c1c'),
(12, '978-0061120084', 'To Kill a Mockingbird', 'Harper Lee', 'Harper Perennial', 1960, 'Fiction & Literature', 5, 4, 'Shelf LIT-02', '#be185d'),
(13, '978-0441013593', 'Dune', 'Frank Herbert', 'Ace Books', 1965, 'Science Fiction', 4, 3, 'Shelf SCIFI-01', '#0f766e'),
(14, '978-0596517748', 'JavaScript: The Good Parts', 'Douglas Crockford', 'O''Reilly Media', 2008, 'Web Development', 3, 3, 'Shelf WEB-01', '#ca8a04');

-- 3. Insert Members (Students & Faculty)
INSERT INTO members (member_id, member_code, full_name, email, phone, address, membership_type, membership_date, status, max_borrow_limit) VALUES
(1, 'MEM-2026-001', 'Tushar Saini', 'tushar.saini@student.edu', '+91 98711 22334', 'Hostel Block B, Room 204, Campus', 'Student', '2026-08-01', 'Active', 4),
(2, 'MEM-2026-002', 'Aarav Patel', 'aarav.patel@student.edu', '+91 98722 33445', '14 Green Park Avenue, New Delhi', 'Student', '2026-08-05', 'Active', 4),
(3, 'MEM-2026-003', 'Ananya Sharma', 'ananya.s@student.edu', '+91 98733 44556', 'Hostel Block A, Room 112, Campus', 'Student', '2026-08-10', 'Active', 4),
(4, 'MEM-2026-004', 'Dr. Sunita Rao', 'sunita.rao@faculty.edu', '+91 98744 55667', 'Staff Quarters Q-7, University Campus', 'Faculty', '2025-07-15', 'Active', 8),
(5, 'MEM-2026-005', 'Rohan Mehta', 'rohan.m@student.edu', '+91 98755 66778', 'Plot 42, Sector 15, Rohini', 'Student', '2026-08-12', 'Active', 4),
(6, 'MEM-2026-006', 'Priya Kapoor', 'priya.k@student.edu', '+91 98766 77889', 'Hostel Block C, Room 305, Campus', 'Student', '2026-08-15', 'Suspended', 0),
(7, 'MEM-2026-007', 'Vikramaditya Singh', 'vikram.singh@research.edu', '+91 98777 88990', 'Research Scholar Hostel Room 402', 'Researcher', '2026-01-10', 'Active', 6);

-- 4. Insert Circulation Records (Loans)
-- Past completed loans (Returned)
INSERT INTO loans (loan_id, book_id, member_id, staff_id, issue_date, due_date, return_date, status, fine_amount, fine_paid, remarks) VALUES
(1, 1, 1, 2, '2026-09-01', '2026-09-15', '2026-09-14', 'Returned', 0.00, 1, 'Returned in good condition before due date'),
(2, 5, 2, 2, '2026-09-05', '2026-09-19', '2026-09-18', 'Returned', 0.00, 1, 'Returned on time'),
(3, 1, 1, 2, '2026-10-15', '2026-10-29', NULL, 'Issued', 0.00, 0, 'Mid-term DBMS exam preparation'),
(4, 2, 2, 3, '2026-10-16', '2026-10-30', NULL, 'Issued', 0.00, 0, 'Course reference copy'),
(5, 4, 3, 2, '2026-10-18', '2026-11-01', NULL, 'Issued', 0.00, 0, 'Software Engineering lab assignment'),
(6, 9, 4, 1, '2026-10-10', '2026-11-10', NULL, 'Issued', 0.00, 0, 'Faculty 30-day extended loan'),
(7, 3, 5, 2, '2026-09-20', '2026-10-04', NULL, 'Overdue', 90.00, 0, 'First reminder email sent on 2026-10-06'),
(8, 10, 6, 2, '2026-09-15', '2026-09-29', NULL, 'Overdue', 115.00, 0, 'Second overdue notice dispatched; membership suspended');

-- 5. Insert Sample Reservations
INSERT INTO reservations (reservation_id, book_id, member_id, reservation_date, status) VALUES
(1, 3, 2, '2026-10-19', 'Pending'),
(2, 10, 1, '2026-10-20', 'Pending');

-- 6. Insert Initial Audit Logs
INSERT INTO audit_logs (action_type, description, staff_name, timestamp) VALUES
('SYSTEM_INIT', 'Library database initialized with baseline catalog and student profiles.', 'System', '2026-08-01 09:00:00'),
('BOOK_ADD', 'Added 14 book titles across Computer Science, Math and Literature.', 'Dr. Rajesh Sharma', '2026-08-01 10:15:00'),
('MEMBER_REGISTER', 'Registered initial student batch MEM-2026-001 through MEM-2026-007.', 'Pooja Verma', '2026-08-01 11:30:00'),
('LOAN_ISSUE', 'Issued "Fundamentals of Database Systems" to Tushar Saini (MEM-2026-001).', 'Pooja Verma', '2026-10-15 14:22:10');
