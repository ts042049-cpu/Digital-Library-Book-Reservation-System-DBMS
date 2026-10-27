/**
 * REST API Routes for CampusLib LMS
 * Handles Authentication, Books, Members, Circulation, Reports, and Overdue management.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db, runTransaction, logAudit, updateOverdueLoans } = require('../database/db');
const { requireAuth, requireRole } = require('../middleware/auth');

// ====================================================================
// 1. AUTHENTICATION & SESSION MANAGEMENT
// ====================================================================

// POST /api/auth/login
router.post('/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide both username/email and password.'
            });
        }

        const staff = db.prepare(`
            SELECT staff_id, staff_code, full_name, email, role, status, password
            FROM staff
            WHERE (email = ? OR staff_code = ?) AND status = 'Active'
        `).get(username.trim(), username.trim());

        if (!staff) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials. Staff account not found or inactive.'
            });
        }

        // Verify password using bcrypt or direct comparison for initial seed passwords
        let isMatch = false;
        if (staff.password.startsWith('$2a$') || staff.password.startsWith('$2b$')) {
            isMatch = bcrypt.compareSync(password, staff.password);
        } else {
            isMatch = (password === staff.password);
        }

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid password. Please check your credentials.'
            });
        }

        // Create session
        const sessionUser = {
            staff_id: staff.staff_id,
            staff_code: staff.staff_code,
            full_name: staff.full_name,
            email: staff.email,
            role: staff.role
        };
        req.session.user = sessionUser;

        logAudit('STAFF_LOGIN', `${staff.full_name} (${staff.role}) logged in.`, staff.full_name);

        res.json({
            success: true,
            message: `Welcome back, ${staff.full_name}!`,
            user: sessionUser
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Internal server error during authentication.' });
    }
});

// GET /api/auth/me (Check current session)
router.get('/auth/me', (req, res) => {
    if (req.session && req.session.user) {
        return res.json({
            success: true,
            authenticated: true,
            user: req.session.user
        });
    }
    res.json({
        success: true,
        authenticated: false,
        user: null
    });
});

// POST /api/auth/logout
router.post('/auth/logout', (req, res) => {
    const staffName = req.session && req.session.user ? req.session.user.full_name : 'Staff';
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Could not log out.' });
        }
        res.clearCookie('connect.sid');
        logAudit('STAFF_LOGOUT', `${staffName} logged out of session.`, staffName);
        res.json({ success: true, message: 'Logged out successfully.' });
    });
});

// ====================================================================
// 2. DASHBOARD & SUMMARY METRICS
// Supports both /api/reports/dashboard AND /api/dashboard
// ====================================================================
function getDashboardMetrics(req, res) {
    try {
        updateOverdueLoans();

        const totalBooks = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(total_copies), 0) as total_copies, COALESCE(SUM(available_copies), 0) as available_copies FROM books').get();
        const totalMembers = db.prepare("SELECT COUNT(*) as count, SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active_count FROM members").get();
        const activeLoans = db.prepare("SELECT COUNT(*) as count FROM loans WHERE return_date IS NULL AND status = 'Issued'").get();
        const overdueLoans = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(fine_amount), 0) as pending_fines FROM loans WHERE return_date IS NULL AND status = 'Overdue'").get();
        const collectedFines = db.prepare('SELECT COALESCE(SUM(fine_amount), 0) as total_collected FROM loans WHERE fine_paid = 1').get();

        // Recently Issued Books (last 6)
        const recentIssues = db.prepare(`
            SELECT l.loan_id, l.issue_date, l.due_date, l.status,
                   b.title as book_title, b.isbn, b.genre,
                   m.full_name as member_name, m.member_code, m.email as member_email
            FROM loans l
            JOIN books b ON l.book_id = b.book_id
            JOIN members m ON l.member_id = m.member_id
            WHERE l.return_date IS NULL
            ORDER BY l.issue_date DESC, l.loan_id DESC
            LIMIT 6
        `).all();

        // Upcoming Due Dates / Overdue Alerts
        const today = new Date().toISOString().split('T')[0];
        const dueSoonOrOverdue = db.prepare(`
            SELECT l.loan_id, l.issue_date, l.due_date, l.status, l.fine_amount,
                   b.title as book_title, b.isbn,
                   m.full_name as member_name, m.member_code, m.phone as member_phone,
                   CAST(julianday(l.due_date) - julianday(?) AS INTEGER) as days_remaining
            FROM loans l
            JOIN books b ON l.book_id = b.book_id
            JOIN members m ON l.member_id = m.member_id
            WHERE l.return_date IS NULL AND (l.due_date <= date(?, '+3 days') OR l.status = 'Overdue')
            ORDER BY l.due_date ASC
            LIMIT 8
        `).all(today, today);

        // Activity Logs
        const recentLogs = db.prepare(`
            SELECT log_id, action_type, description, staff_name, timestamp
            FROM audit_logs
            ORDER BY log_id DESC
            LIMIT 7
        `).all();

        // Category breakdown
        const genreDistribution = db.prepare(`
            SELECT genre, COUNT(*) as titles_count, SUM(total_copies) as total_copies, SUM(available_copies) as available_copies
            FROM books
            GROUP BY genre
            ORDER BY total_copies DESC
        `).all();

        res.json({
            success: true,
            stats: {
                totalTitles: totalBooks.count,
                totalCopies: totalBooks.total_copies,
                availableCopies: totalBooks.available_copies,
                issuedCopies: totalBooks.total_copies - totalBooks.available_copies,
                totalMembers: totalMembers.count,
                activeMembers: totalMembers.active_count || 0,
                activeLoans: activeLoans.count,
                overdueLoans: overdueLoans.count,
                pendingFines: overdueLoans.pending_fines,
                collectedFines: collectedFines.total_collected
            },
            recentIssues,
            dueSoonOrOverdue,
            recentLogs,
            genreDistribution
        });
    } catch (err) {
        console.error('Dashboard metrics error:', err);
        res.status(500).json({ success: false, message: 'Failed to retrieve dashboard metrics: ' + err.message });
    }
}

router.get('/reports/dashboard', getDashboardMetrics);
router.get('/dashboard', getDashboardMetrics);

// ====================================================================
// 3. BOOK MANAGEMENT
// ====================================================================
router.get('/books', (req, res) => {
    try {
        const { search, genre, availability, sortBy = 'title', sortOrder = 'ASC' } = req.query;

        let query = `
            SELECT b.*,
                   (b.total_copies - b.available_copies) as issued_copies,
                   (SELECT COUNT(*) FROM reservations r WHERE r.book_id = b.book_id AND r.status = 'Pending') as reservation_count
            FROM books b
            WHERE 1=1
        `;
        const params = [];

        if (search && search.trim() !== '') {
            query += ` AND (b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ? OR b.publisher LIKE ?)`;
            const term = `%${search.trim()}%`;
            params.push(term, term, term, term);
        }

        if (genre && genre !== 'All') {
            query += ` AND b.genre = ?`;
            params.push(genre);
        }

        if (availability === 'available') {
            query += ` AND b.available_copies > 0`;
        } else if (availability === 'unavailable') {
            query += ` AND b.available_copies = 0`;
        }

        const validSortCols = ['title', 'author', 'publication_year', 'available_copies', 'total_copies', 'book_id'];
        const col = validSortCols.includes(sortBy) ? sortBy : 'title';
        const dir = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        query += ` ORDER BY b.${col} ${dir}`;

        const books = db.prepare(query).all(...params);
        const genres = db.prepare('SELECT DISTINCT genre FROM books ORDER BY genre ASC').all().map(g => g.genre);

        res.json({ success: true, count: books.length, genres, books });
    } catch (err) {
        console.error('Fetch books error:', err);
        res.status(500).json({ success: false, message: 'Database error fetching books' });
    }
});

router.get('/books/:id', (req, res) => {
    try {
        const bookId = req.params.id;
        const book = db.prepare('SELECT * FROM books WHERE book_id = ?').get(bookId);

        if (!book) {
            return res.status(404).json({ success: false, message: 'Book not found' });
        }

        const currentLoans = db.prepare(`
            SELECT l.loan_id, l.issue_date, l.due_date, l.status,
                   m.member_code, m.full_name, m.email, m.phone
            FROM loans l
            JOIN members m ON l.member_id = m.member_id
            WHERE l.book_id = ? AND l.return_date IS NULL
            ORDER BY l.due_date ASC
        `).all(bookId);

        res.json({ success: true, book, currentLoans });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching book details' });
    }
});

router.post('/books', (req, res) => {
    try {
        const { isbn, title, author, publisher, publication_year, genre, total_copies, shelf_location } = req.body;

        if (!isbn || !title || !author || !genre) {
            return res.status(400).json({ success: false, message: 'ISBN, Title, Author, and Genre are required.' });
        }

        const copies = parseInt(total_copies, 10);
        if (isNaN(copies) || copies <= 0) {
            return res.status(400).json({ success: false, message: 'Total copies must be a positive integer.' });
        }

        const existing = db.prepare('SELECT book_id FROM books WHERE isbn = ?').get(isbn.trim());
        if (existing) {
            return res.status(409).json({ success: false, message: `Book with ISBN "${isbn}" already exists in the catalog.` });
        }

        const parsedYear = publication_year ? parseInt(publication_year, 10) : null;
        const year = isNaN(parsedYear) ? null : parsedYear;
        const shelf = shelf_location ? shelf_location.trim() : 'Section A';

        const stmt = db.prepare(`
            INSERT INTO books (isbn, title, author, publisher, publication_year, genre, total_copies, available_copies, shelf_location)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            isbn.trim(),
            title.trim(),
            author.trim(),
            publisher ? publisher.trim() : null,
            year,
            genre.trim(),
            copies,
            copies,
            shelf
        );

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Admin');
        logAudit('BOOK_ADD', `Added book "${title.trim()}" (ISBN: ${isbn.trim()}, Copies: ${copies})`, staffName);

        res.status(201).json({
            success: true,
            message: `Book "${title}" added successfully.`,
            bookId: result.lastInsertRowid
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to add book: ' + err.message });
    }
});

router.put('/books/:id', (req, res) => {
    try {
        const bookId = req.params.id;
        const { isbn, title, author, publisher, publication_year, genre, total_copies, shelf_location } = req.body;

        const currentBook = db.prepare('SELECT * FROM books WHERE book_id = ?').get(bookId);
        if (!currentBook) {
            return res.status(404).json({ success: false, message: 'Book not found' });
        }

        if (isbn && isbn.trim() !== currentBook.isbn) {
            const conflict = db.prepare('SELECT book_id FROM books WHERE isbn = ? AND book_id != ?').get(isbn.trim(), bookId);
            if (conflict) {
                return res.status(409).json({ success: false, message: 'Another book already uses this ISBN.' });
            }
        }

        const newTotalCopies = parseInt(total_copies, 10);
        if (isNaN(newTotalCopies) || newTotalCopies <= 0) {
            return res.status(400).json({ success: false, message: 'Total copies must be a positive integer.' });
        }

        const currentlyIssued = currentBook.total_copies - currentBook.available_copies;
        if (newTotalCopies < currentlyIssued) {
            return res.status(400).json({
                success: false,
                message: `Cannot reduce total copies below ${currentlyIssued} because ${currentlyIssued} copies are currently issued to members.`
            });
        }

        const copyDifference = newTotalCopies - currentBook.total_copies;
        const newAvailableCopies = currentBook.available_copies + copyDifference;

        const stmt = db.prepare(`
            UPDATE books
            SET isbn = ?, title = ?, author = ?, publisher = ?, publication_year = ?,
                genre = ?, total_copies = ?, available_copies = ?, shelf_location = ?
            WHERE book_id = ?
        `);

        stmt.run(
            isbn ? isbn.trim() : currentBook.isbn,
            title ? title.trim() : currentBook.title,
            author ? author.trim() : currentBook.author,
            publisher !== undefined ? publisher : currentBook.publisher,
            publication_year !== undefined ? (!isNaN(parseInt(publication_year, 10)) ? parseInt(publication_year, 10) : null) : currentBook.publication_year,
            genre ? genre.trim() : currentBook.genre,
            newTotalCopies,
            newAvailableCopies,
            shelf_location ? shelf_location.trim() : currentBook.shelf_location,
            bookId
        );

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Admin');
        logAudit('BOOK_UPDATE', `Updated book details for "${title || currentBook.title}" (ID: ${bookId})`, staffName);

        res.json({ success: true, message: 'Book details updated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update book: ' + err.message });
    }
});

router.delete('/books/:id', (req, res) => {
    try {
        const bookId = req.params.id;
        const book = db.prepare('SELECT * FROM books WHERE book_id = ?').get(bookId);
        if (!book) {
            return res.status(404).json({ success: false, message: 'Book not found' });
        }

        const activeLoans = db.prepare('SELECT COUNT(*) as count FROM loans WHERE book_id = ? AND return_date IS NULL').get(bookId);
        if (activeLoans && activeLoans.count > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete book. ${activeLoans.count} copy/copies are currently borrowed. They must be returned first.`
            });
        }

        runTransaction((tx) => {
            tx.prepare('DELETE FROM reservations WHERE book_id = ?').run(bookId);
            tx.prepare('DELETE FROM loans WHERE book_id = ?').run(bookId);
            tx.prepare('DELETE FROM books WHERE book_id = ?').run(bookId);
        });

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Admin');
        logAudit('BOOK_DELETE', `Deleted book "${book.title}" (ISBN: ${book.isbn})`, staffName);

        res.json({ success: true, message: `Book "${book.title}" was removed from the library catalog.` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to delete book: ' + err.message });
    }
});

// ====================================================================
// 4. MEMBER MANAGEMENT
// ====================================================================
router.get('/members', (req, res) => {
    try {
        const { search, status, type } = req.query;
        let query = `
            SELECT m.*,
                   (SELECT COUNT(*) FROM loans l WHERE l.member_id = m.member_id AND l.return_date IS NULL) as currently_borrowed,
                   (SELECT COALESCE(SUM(l.fine_amount), 0) FROM loans l WHERE l.member_id = m.member_id AND l.return_date IS NULL AND l.status = 'Overdue') as pending_fines
            FROM members m
            WHERE 1=1
        `;
        const params = [];

        if (search && search.trim() !== '') {
            query += ` AND (m.full_name LIKE ? OR m.member_code LIKE ? OR m.email LIKE ? OR m.phone LIKE ?)`;
            const term = `%${search.trim()}%`;
            params.push(term, term, term, term);
        }

        if (status && status !== 'All') {
            query += ` AND m.status = ?`;
            params.push(status);
        }

        if (type && type !== 'All') {
            query += ` AND m.membership_type = ?`;
            params.push(type);
        }

        query += ` ORDER BY m.member_id DESC`;
        const members = db.prepare(query).all(...params);

        res.json({ success: true, count: members.length, members });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Database error fetching members' });
    }
});

router.get('/members/:id', (req, res) => {
    try {
        const memberId = req.params.id;
        const member = db.prepare('SELECT * FROM members WHERE member_id = ?').get(memberId);
        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        const activeLoans = db.prepare(`
            SELECT l.*, b.title as book_title, b.isbn, b.genre
            FROM loans l
            JOIN books b ON l.book_id = b.book_id
            WHERE l.member_id = ? AND l.return_date IS NULL
            ORDER BY l.due_date ASC
        `).all(memberId);

        const pastLoans = db.prepare(`
            SELECT l.*, b.title as book_title, b.isbn
            FROM loans l
            JOIN books b ON l.book_id = b.book_id
            WHERE l.member_id = ? AND l.return_date IS NOT NULL
            ORDER BY l.return_date DESC
            LIMIT 15
        `).all(memberId);

        res.json({ success: true, member, activeLoans, pastLoans });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Database error fetching member profile' });
    }
});

router.post('/members', (req, res) => {
    try {
        const { full_name, email, phone, address, membership_type, max_borrow_limit } = req.body;

        if (!full_name || !email || !phone) {
            return res.status(400).json({ success: false, message: 'Full Name, Email, and Phone are required.' });
        }

        const existing = db.prepare('SELECT member_id FROM members WHERE email = ?').get(email.trim().toLowerCase());
        if (existing) {
            return res.status(409).json({ success: false, message: 'A member with this email address already exists.' });
        }

        const currentYear = new Date().getFullYear();
        let seq = 1;
        const lastMember = db.prepare('SELECT member_id FROM members ORDER BY member_id DESC LIMIT 1').get();
        if (lastMember) {
            seq = lastMember.member_id + 1;
        }
        let memberCode = `MEM-${currentYear}-${String(seq).padStart(3, '0')}`;
        while (db.prepare('SELECT member_id FROM members WHERE member_code = ?').get(memberCode)) {
            seq++;
            memberCode = `MEM-${currentYear}-${String(seq).padStart(3, '0')}`;
        }

        const limit = max_borrow_limit ? parseInt(max_borrow_limit, 10) : (membership_type === 'Faculty' ? 8 : 4);

        const stmt = db.prepare(`
            INSERT INTO members (member_code, full_name, email, phone, address, membership_type, status, max_borrow_limit)
            VALUES (?, ?, ?, ?, ?, ?, 'Active', ?)
        `);

        const result = stmt.run(
            memberCode,
            full_name.trim(),
            email.trim().toLowerCase(),
            phone.trim(),
            address ? address.trim() : '',
            membership_type || 'Student',
            limit
        );

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Circulation Desk');
        logAudit('MEMBER_REGISTER', `Registered member ${full_name.trim()} (${memberCode})`, staffName);

        res.status(201).json({
            success: true,
            message: `Member ${full_name} registered successfully with ID ${memberCode}.`,
            memberId: result.lastInsertRowid,
            memberCode
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to register member: ' + err.message });
    }
});

router.put('/members/:id', (req, res) => {
    try {
        const memberId = req.params.id;
        const { full_name, email, phone, address, membership_type, status, max_borrow_limit } = req.body;

        const currentMember = db.prepare('SELECT * FROM members WHERE member_id = ?').get(memberId);
        if (!currentMember) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        if (email && email.trim().toLowerCase() !== currentMember.email) {
            const conflict = db.prepare('SELECT member_id FROM members WHERE email = ? AND member_id != ?').get(email.trim().toLowerCase(), memberId);
            if (conflict) {
                return res.status(409).json({ success: false, message: 'Another member is already using this email.' });
            }
        }

        const stmt = db.prepare(`
            UPDATE members
            SET full_name = ?, email = ?, phone = ?, address = ?, membership_type = ?, status = ?, max_borrow_limit = ?
            WHERE member_id = ?
        `);

        stmt.run(
            full_name ? full_name.trim() : currentMember.full_name,
            email ? email.trim().toLowerCase() : currentMember.email,
            phone ? phone.trim() : currentMember.phone,
            address !== undefined ? address.trim() : currentMember.address,
            membership_type || currentMember.membership_type,
            status || currentMember.status,
            max_borrow_limit ? (!isNaN(parseInt(max_borrow_limit, 10)) ? parseInt(max_borrow_limit, 10) : currentMember.max_borrow_limit) : currentMember.max_borrow_limit,
            memberId
        );

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Admin');
        logAudit('MEMBER_UPDATE', `Updated member profile ${full_name || currentMember.full_name} (${currentMember.member_code})`, staffName);

        res.json({ success: true, message: 'Member profile updated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update member: ' + err.message });
    }
});

router.delete('/members/:id', (req, res) => {
    try {
        const memberId = req.params.id;
        const member = db.prepare('SELECT * FROM members WHERE member_id = ?').get(memberId);
        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        const activeLoans = db.prepare('SELECT COUNT(*) as count FROM loans WHERE member_id = ? AND return_date IS NULL').get(memberId);
        if (activeLoans && activeLoans.count > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete member. Member currently has ${activeLoans.count} borrowed book(s). All books must be returned first.`
            });
        }

        runTransaction((tx) => {
            tx.prepare('DELETE FROM reservations WHERE member_id = ?').run(memberId);
            tx.prepare('DELETE FROM loans WHERE member_id = ?').run(memberId);
            tx.prepare('DELETE FROM members WHERE member_id = ?').run(memberId);
        });

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Admin');
        logAudit('MEMBER_DELETE', `Deleted member record ${member.full_name} (${member.member_code})`, staffName);

        res.json({ success: true, message: `Member ${member.full_name} removed successfully.` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to delete member: ' + err.message });
    }
});

// ====================================================================
// 5. CIRCULATION: ISSUE, RETURN & TRANSACTION LOGS
// ====================================================================
router.get('/loans', (req, res) => {
    try {
        updateOverdueLoans();
        const { status, search } = req.query;

        let query = `
            SELECT l.*,
                   b.title as book_title, b.isbn, b.genre, b.shelf_location,
                   m.member_code, m.full_name as member_name, m.email as member_email, m.phone as member_phone,
                   s.full_name as staff_name
            FROM loans l
            JOIN books b ON l.book_id = b.book_id
            JOIN members m ON l.member_id = m.member_id
            LEFT JOIN staff s ON l.staff_id = s.staff_id
            WHERE 1=1
        `;
        const params = [];

        if (status && status.toLowerCase() !== 'all') {
            query += ` AND LOWER(l.status) = LOWER(?)`;
            params.push(status);
        }

        if (search && search.trim() !== '') {
            query += ` AND (b.title LIKE ? OR b.isbn LIKE ? OR m.full_name LIKE ? OR m.member_code LIKE ?)`;
            const term = `%${search.trim()}%`;
            params.push(term, term, term, term);
        }

        query += ` ORDER BY l.loan_id DESC`;
        const loans = db.prepare(query).all(...params);

        res.json({ success: true, count: loans.length, loans });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Database error fetching circulation records' });
    }
});

router.get('/loans/:id', (req, res) => {
    try {
        updateOverdueLoans();
        const loanId = req.params.id;
        const loan = db.prepare(`
            SELECT l.*,
                   b.title as book_title, b.isbn, b.genre, b.shelf_location, b.available_copies, b.total_copies,
                   m.member_code, m.full_name as member_name, m.email as member_email, m.phone as member_phone,
                   s.full_name as staff_name
            FROM loans l
            JOIN books b ON l.book_id = b.book_id
            JOIN members m ON l.member_id = m.member_id
            LEFT JOIN staff s ON l.staff_id = s.staff_id
            WHERE l.loan_id = ?
        `).get(loanId);

        if (!loan) {
            return res.status(404).json({ success: false, message: 'Loan transaction record not found.' });
        }

        res.json({ success: true, loan });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to retrieve loan record: ' + err.message });
    }
});

router.post('/loans/issue', (req, res) => {
    try {
        const { book_id, member_id, loan_days = 14, remarks, due_date } = req.body;

        if (!book_id || !member_id) {
            return res.status(400).json({ success: false, message: 'Book ID and Member ID are required to issue a book.' });
        }

        const book = db.prepare('SELECT * FROM books WHERE book_id = ?').get(book_id);
        if (!book) {
            return res.status(404).json({ success: false, message: 'Book not found in catalog.' });
        }
        if (book.available_copies <= 0) {
            return res.status(400).json({
                success: false,
                message: `Book "${book.title}" is currently Out of Stock (0 of ${book.total_copies} available). Cannot issue.`
            });
        }

        const member = db.prepare('SELECT * FROM members WHERE member_id = ?').get(member_id);
        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found.' });
        }
        if (member.status !== 'Active') {
            return res.status(400).json({
                success: false,
                message: `Member status is "${member.status}". Only Active members are permitted to borrow books.`
            });
        }

        const activeLoansCount = db.prepare('SELECT COUNT(*) as count FROM loans WHERE member_id = ? AND return_date IS NULL').get(member_id).count;
        if (activeLoansCount >= member.max_borrow_limit) {
            return res.status(400).json({
                success: false,
                message: `Borrowing limit reached. Member ${member.full_name} already has ${activeLoansCount} book(s) issued (Limit: ${member.max_borrow_limit}).`
            });
        }

        const today = new Date();
        const issueDate = today.toISOString().split('T')[0];

        let finalDueDate;
        if (due_date && due_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            if (due_date < issueDate) {
                return res.status(400).json({ success: false, message: 'Due date cannot be earlier than today.' });
            }
            finalDueDate = due_date;
        } else {
            const days = Math.max(1, parseInt(loan_days, 10) || 14);
            const dueDateObj = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
            finalDueDate = dueDateObj.toISOString().split('T')[0];
        }

        let staffId = req.session && req.session.user ? req.session.user.staff_id : req.body.staff_id;
        let validStaff = null;
        if (staffId) {
            validStaff = db.prepare('SELECT staff_id, full_name FROM staff WHERE staff_id = ?').get(staffId);
        }
        if (!validStaff) {
            validStaff = db.prepare("SELECT staff_id, full_name FROM staff WHERE status = 'Active' ORDER BY staff_id ASC LIMIT 1").get();
        }

        const finalStaffId = validStaff ? validStaff.staff_id : null;
        const staffName = validStaff ? validStaff.full_name : (req.body.staff_name || 'Circulation Desk');

        let newLoanId;
        runTransaction((tx) => {
            const insertStmt = tx.prepare(`
                INSERT INTO loans (book_id, member_id, staff_id, issue_date, due_date, status, fine_amount, remarks)
                VALUES (?, ?, ?, ?, ?, 'Issued', 0.00, ?)
            `);
            const loanResult = insertStmt.run(book_id, member_id, finalStaffId, issueDate, finalDueDate, remarks || 'Standard Loan');
            newLoanId = loanResult.lastInsertRowid;

            tx.prepare('UPDATE books SET available_copies = available_copies - 1 WHERE book_id = ?').run(book_id);
            tx.prepare("UPDATE reservations SET status = 'Fulfilled' WHERE book_id = ? AND member_id = ? AND status = 'Pending'").run(book_id, member_id);
        });

        logAudit('LOAN_ISSUE', `Issued "${book.title}" to ${member.full_name} (${member.member_code}). Due on ${finalDueDate}.`, staffName);

        res.status(201).json({
            success: true,
            message: `Book "${book.title}" issued successfully to ${member.full_name}.`,
            loan: {
                loan_id: newLoanId,
                book_title: book.title,
                member_name: member.full_name,
                issue_date: issueDate,
                due_date: finalDueDate
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to issue book: ' + err.message });
    }
});

router.post('/loans/:id/return', (req, res) => {
    try {
        const loanId = req.params.id;
        const { fine_paid = 1, remarks } = req.body;

        const loan = db.prepare(`
            SELECT l.*, b.title as book_title, b.available_copies, b.total_copies,
                   m.full_name as member_name, m.member_code
            FROM loans l
            JOIN books b ON l.book_id = b.book_id
            JOIN members m ON l.member_id = m.member_id
            WHERE l.loan_id = ?
        `).get(loanId);

        if (!loan) {
            return res.status(404).json({ success: false, message: 'Loan transaction record not found.' });
        }

        if (loan.return_date !== null) {
            return res.status(400).json({ success: false, message: `This book was already returned on ${loan.return_date}.` });
        }

        const today = new Date().toISOString().split('T')[0];
        let calculatedFine = 0.00;
        if (today > loan.due_date) {
            const dueDateObj = new Date(loan.due_date);
            const returnDateObj = new Date(today);
            const diffTime = Math.abs(returnDateObj - dueDateObj);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            calculatedFine = diffDays * 5.00; // ₹5 per day
        }

        const isFinePaid = calculatedFine > 0 ? (fine_paid ? 1 : 0) : 1;
        const finalRemarks = remarks ? `${remarks} (Returned on ${today})` : (loan.remarks || 'Returned');

        runTransaction((tx) => {
            tx.prepare(`
                UPDATE loans
                SET return_date = ?,
                    status = 'Returned',
                    fine_amount = ?,
                    fine_paid = ?,
                    remarks = ?
                WHERE loan_id = ?
            `).run(today, calculatedFine, isFinePaid, finalRemarks, loanId);

            tx.prepare(`
                UPDATE books
                SET available_copies = MIN(total_copies, available_copies + 1)
                WHERE book_id = ?
            `).run(loan.book_id);
        });

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Circulation Desk');
        const fineMsg = calculatedFine > 0 ? ` (Overdue fine of ₹${calculatedFine.toFixed(2)} ${isFinePaid ? 'collected' : 'pending'})` : '';
        logAudit('LOAN_RETURN', `Received return of "${loan.book_title}" from ${loan.member_name}${fineMsg}.`, staffName);

        res.json({
            success: true,
            message: `Book "${loan.book_title}" successfully returned!${fineMsg}`,
            details: {
                return_date: today,
                fine_amount: calculatedFine,
                fine_paid: isFinePaid
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to process return: ' + err.message });
    }
});

router.post('/loans/:id/renew', (req, res) => {
    try {
        const loanId = req.params.id;
        const { additional_days = 14 } = req.body;

        const loan = db.prepare(`
            SELECT l.*, b.title as book_title, m.full_name as member_name
            FROM loans l
            JOIN books b ON l.book_id = b.book_id
            JOIN members m ON l.member_id = m.member_id
            WHERE l.loan_id = ?
        `).get(loanId);

        if (!loan) {
            return res.status(404).json({ success: false, message: 'Loan record not found.' });
        }

        if (loan.return_date !== null) {
            return res.status(400).json({ success: false, message: 'Cannot renew a book that has already been returned.' });
        }

        const baseDate = new Date(loan.due_date) > new Date() ? new Date(loan.due_date) : new Date();
        const days = Math.max(1, parseInt(additional_days, 10) || 14);
        const newDue = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        db.prepare("UPDATE loans SET due_date = ?, status = 'Issued' WHERE loan_id = ?").run(newDue, loanId);

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Circulation Desk');
        logAudit('LOAN_RENEW', `Renewed loan for "${loan.book_title}" to ${loan.member_name}. New due date: ${newDue}`, staffName);

        res.json({
            success: true,
            message: `Loan renewed successfully until ${newDue}.`,
            newDueDate: newDue
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to renew loan: ' + err.message });
    }
});

// ====================================================================
// 6. OVERDUE MANAGEMENT & REPORTS
// Supports both /api/reports/overdue AND /api/overdue
// ====================================================================
function getOverdueList(req, res) {
    try {
        updateOverdueLoans();

        const today = new Date().toISOString().split('T')[0];
        const overdueList = db.prepare(`
            SELECT l.loan_id, l.issue_date, l.due_date, l.fine_amount, l.fine_paid, l.remarks,
                   b.book_id, b.title as book_title, b.isbn, b.genre, b.shelf_location,
                   m.member_id, m.member_code, m.full_name as member_name, m.email as member_email, m.phone as member_phone,
                   CAST(julianday(?) - julianday(l.due_date) AS INTEGER) as days_overdue
            FROM loans l
            JOIN books b ON l.book_id = b.book_id
            JOIN members m ON l.member_id = m.member_id
            WHERE l.return_date IS NULL AND l.due_date < ?
            ORDER BY days_overdue DESC
        `).all(today, today);

        const summary = db.prepare(`
            SELECT COUNT(*) as count, COALESCE(SUM(fine_amount), 0) as total_fines
            FROM loans
            WHERE return_date IS NULL AND status = 'Overdue'
        `).get();

        res.json({ success: true, summary, overdueList });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Database error fetching overdue records' });
    }
}

router.get('/reports/overdue', getOverdueList);
router.get('/overdue', getOverdueList);

router.post('/overdue/remind/:id', (req, res) => {
    try {
        const loanId = req.params.id;
        const loan = db.prepare(`
            SELECT l.*, b.title, m.full_name, m.email, m.phone
            FROM loans l
            JOIN books b ON l.book_id = b.book_id
            JOIN members m ON l.member_id = m.member_id
            WHERE l.loan_id = ?
        `).get(loanId);

        if (!loan) {
            return res.status(404).json({ success: false, message: 'Loan record not found' });
        }

        const dateStr = new Date().toISOString().split('T')[0];
        const updatedRemarks = `${loan.remarks ? loan.remarks + ' | ' : ''}Reminder notice dispatched on ${dateStr}`;
        db.prepare('UPDATE loans SET remarks = ? WHERE loan_id = ?').run(updatedRemarks, loanId);

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'System');
        logAudit('REMINDER_SENT', `Sent overdue notice to ${loan.full_name} (${loan.phone}) for "${loan.title}".`, staffName);

        res.json({
            success: true,
            message: `Overdue reminder notification successfully logged & sent to ${loan.full_name} (${loan.email}).`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to send reminder: ' + err.message });
    }
});

// CSV Export Endpoint for Reports
router.get('/reports/export', (req, res) => {
    try {
        const loans = db.prepare(`
            SELECT l.loan_id, b.isbn, b.title, m.member_code, m.full_name, l.issue_date, l.due_date, l.return_date, l.status, l.fine_amount
            FROM loans l
            JOIN books b ON l.book_id = b.book_id
            JOIN members m ON l.member_id = m.member_id
            ORDER BY l.loan_id DESC
        `).all();

        let csv = 'LoanID,ISBN,BookTitle,MemberCode,MemberName,IssueDate,DueDate,ReturnDate,Status,FineAmount\n';
        loans.forEach(row => {
            csv += `"${row.loan_id}","${row.isbn}","${row.title.replace(/"/g, '""')}","${row.member_code}","${row.full_name.replace(/"/g, '""')}","${row.issue_date}","${row.due_date}","${row.return_date || ''}","${row.status}","${row.fine_amount}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="campuslib_circulation_report.csv"');
        res.send(csv);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to export CSV report' });
    }
});

router.get('/reports', (req, res) => {
    try {
        const popularBooks = db.prepare(`
            SELECT b.title, b.author, b.isbn, b.genre, COUNT(l.loan_id) as times_borrowed
            FROM books b
            LEFT JOIN loans l ON b.book_id = l.book_id
            GROUP BY b.book_id
            ORDER BY times_borrowed DESC
            LIMIT 5
        `).all();

        const topBorrowers = db.prepare(`
            SELECT m.member_code, m.full_name, m.membership_type, COUNT(l.loan_id) as total_borrowed
            FROM members m
            JOIN loans l ON m.member_id = l.member_id
            GROUP BY m.member_id
            ORDER BY total_borrowed DESC
            LIMIT 5
        `).all();

        const monthlyStats = db.prepare(`
            SELECT strftime('%Y-%m', issue_date) as month, COUNT(*) as issue_count
            FROM loans
            GROUP BY month
            ORDER BY month DESC
            LIMIT 6
        `).all();

        const inventory = db.prepare(`
            SELECT 
                COUNT(*) as total_titles,
                SUM(total_copies) as total_volumes,
                SUM(available_copies) as available_volumes,
                SUM(total_copies - available_copies) as circulating_volumes
            FROM books
        `).get();

        const fines = db.prepare(`
            SELECT 
                COALESCE(SUM(CASE WHEN fine_paid = 1 THEN fine_amount ELSE 0 END), 0) as fines_collected,
                COALESCE(SUM(CASE WHEN return_date IS NULL AND status = 'Overdue' THEN fine_amount ELSE 0 END), 0) as fines_pending
            FROM loans
        `).get();

        res.json({
            success: true,
            popularBooks,
            topBorrowers,
            monthlyStats,
            inventory,
            fines
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to generate library reports' });
    }
});

// Staff accounts list
router.get('/staff', (req, res) => {
    try {
        const staffList = db.prepare(`
            SELECT staff_id, staff_code, full_name, email, phone, role, hire_date, status
            FROM staff
            ORDER BY staff_id ASC
        `).all();
        res.json({ success: true, staff: staffList });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch staff accounts' });
    }
});

// Pristine Demo Reset
router.post('/system/reset-demo-data', (req, res) => {
    try {
        const fs = require('node:fs');
        const path = require('node:path');
        const SEEDS_PATH = path.join(__dirname, '..', 'database', 'seeds.sql');

        db.exec('PRAGMA foreign_keys = OFF;');
        try {
            runTransaction((tx) => {
                tx.exec('DELETE FROM audit_logs;');
                tx.exec('DELETE FROM reservations;');
                tx.exec('DELETE FROM loans;');
                tx.exec('DELETE FROM members;');
                tx.exec('DELETE FROM books;');
                tx.exec('DELETE FROM staff;');
                tx.exec('DELETE FROM sqlite_sequence;');

                const seedsSql = fs.readFileSync(SEEDS_PATH, 'utf-8');
                tx.exec(seedsSql);
            });
        } finally {
            db.exec('PRAGMA foreign_keys = ON;');
        }

        updateOverdueLoans();
        const staffName = req.session && req.session.user ? req.session.user.full_name : 'Admin';
        logAudit('SYSTEM_RESET', 'Demo database records restored to pristine initial state.', staffName);

        res.json({ success: true, message: 'Library database successfully restored to fresh demo state.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to reset demo data: ' + err.message });
    }
});

module.exports = router;
