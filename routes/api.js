
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const {
    getDb,
    nextSequence,
    nextSequenceRange,
    logAudit,
    refreshOverdueLoans,
    resetDemoData,
    toDate,
    toDateOnly,
    toDateTime,
    startOfDayUTC,
    addDays,
    daysBetween,
    escapeRegex
} = require('../database/db');

const collection = (name) => getDb().collection(name);

function publicDoc(doc) {
    if (!doc) return doc;
    const { _id, ...rest } = doc;
    return rest;
}

function serializeMember(member) {
    return {
        ...publicDoc(member),
        membership_date: toDateOnly(member.membership_date),
        created_at: toDateTime(member.created_at)
    };
}

function serializeBook(book) {
    return {
        ...publicDoc(book),
        created_at: toDateTime(book.created_at)
    };
}

async function staffMapFor(ids) {
    const unique = [...new Set(ids.filter((id) => id !== null && id !== undefined))];
    if (!unique.length) return new Map();
    const docs = await collection('staffs').find({ staff_id: { $in: unique } }).toArray();
    return new Map(docs.map((doc) => [doc.staff_id, doc]));
}

const BOOK_CSV_COLUMNS = {
    isbn: ['isbn', 'isbn_13', 'isbn13', 'isbn_10', 'isbn10'],
    title: ['title', 'book_title', 'book_name', 'name'],
    author: ['author', 'authors', 'author_name', 'authored_by'],
    publisher: ['publisher', 'publication', 'publisher_name'],
    publication_year: ['publication_year', 'published_year', 'pub_year', 'year'],
    genre: ['genre', 'category', 'subject', 'department'],
    total_copies: ['total_copies', 'copies', 'quantity', 'qty', 'no_of_copies', 'num_copies'],
    shelf_location: ['shelf_location', 'shelf', 'shelf_code', 'shelf_no', 'location', 'call_number']
};

function normalizeCsvHeader(value) {
    return String(value || '')
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function detectCsvDelimiter(text) {
    const firstLine = String(text).split(/\r?\n/, 1)[0] || '';
    const candidates = [',', ';', '\t'];
    let best = ',';
    let bestCount = -1;

    for (const candidate of candidates) {
        let count = 0;
        let inQuotes = false;
        for (const char of firstLine) {
            if (char === '"') inQuotes = !inQuotes;
            else if (!inQuotes && char === candidate) count += 1;
        }
        if (count > bestCount) {
            best = candidate;
            bestCount = count;
        }
    }
    return best;
}

function parseCsvRows(text, delimiter = ',') {
    const rows = [];
    const source = String(text).replace(/^\uFEFF/, '');
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < source.length; i += 1) {
        const char = source[i];

        if (inQuotes) {
            if (char === '"') {
                if (source[i + 1] === '"') {
                    field += '"';
                    i += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                field += char;
            }
            continue;
        }

        if (char === '"') {
            inQuotes = true;
        } else if (char === delimiter) {
            row.push(field);
            field = '';
        } else if (char === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else if (char === '\r') {
        } else {
            field += char;
        }
    }

    if (field.length || row.length) {
        row.push(field);
        rows.push(row);
    }

    return rows;
}

function mapCsvColumns(headers) {
    const normalized = headers.map(normalizeCsvHeader);
    const mapping = {};
    for (const [field, aliases] of Object.entries(BOOK_CSV_COLUMNS)) {
        const index = normalized.findIndex((header) => aliases.includes(header));
        if (index !== -1) mapping[field] = index;
    }
    return mapping;
}

async function hydrateLoans(loans, { includeBookStock = false } = {}) {
    if (!loans.length) return [];

    const bookIds = [...new Set(loans.map((l) => l.book_id))];
    const memberIds = [...new Set(loans.map((l) => l.member_id))];

    const [books, members, staffs] = await Promise.all([
        collection('books').find({ book_id: { $in: bookIds } }).toArray(),
        collection('members').find({ member_id: { $in: memberIds } }).toArray(),
        staffMapFor(loans.map((l) => l.staff_id))
    ]);

    const bookMap = new Map(books.map((b) => [b.book_id, b]));
    const memberMap = new Map(members.map((m) => [m.member_id, m]));

    return loans.map((loan) => {
        const book = bookMap.get(loan.book_id) || {};
        const member = memberMap.get(loan.member_id) || {};
        const staff = loan.staff_id ? staffs.get(loan.staff_id) : null;

        return {
            ...publicDoc(loan),
            issue_date: toDateOnly(loan.issue_date),
            due_date: toDateOnly(loan.due_date),
            return_date: toDateOnly(loan.return_date),
            created_at: toDateTime(loan.created_at),
            book_title: book.title,
            isbn: book.isbn,
            genre: book.genre,
            shelf_location: book.shelf_location,
            ...(includeBookStock
                ? { available_copies: book.available_copies, total_copies: book.total_copies }
                : {}),
            member_code: member.member_code,
            member_name: member.full_name,
            member_email: member.email,
            member_phone: member.phone,
            staff_name: staff ? staff.full_name : null
        };
    });
}

async function activeStaff(req, requestedId) {
    if (requestedId) {
        const staff = await collection('staffs').findOne({ staff_id: Number(requestedId) });
        if (staff) return staff;
    }
    return collection('staffs').findOne({ status: 'Active' }, { sort: { staff_id: 1 } });
}


router.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide both username/email and password.'
            });
        }

        const key = String(username).trim();
        const staff = await collection('staffs').findOne({
            status: 'Active',
            $or: [{ email: key }, { staff_code: key }]
        });

        if (!staff) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials. Staff account not found or inactive.'
            });
        }

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

        const sessionUser = {
            staff_id: staff.staff_id,
            staff_code: staff.staff_code,
            full_name: staff.full_name,
            email: staff.email,
            role: staff.role
        };
        req.session.user = sessionUser;

        await logAudit('STAFF_LOGIN', `${staff.full_name} (${staff.role}) logged in.`, staff.full_name);

        res.json({
            success: true,
            message: `Welcome back, ${staff.full_name}!`,
            user: sessionUser
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error during authentication.',
            details: err.message
        });
    }
});

router.get('/auth/me', async (req, res) => {
    if (req.session && req.session.user) {
        return res.json({
            success: true,
            authenticated: true,
            user: req.session.user
        });
    }

    try {
        const defaultStaff = await collection('staffs').findOne(
            { status: 'Active' },
            { sort: { staff_id: 1 }, projection: { staff_id: 1, staff_code: 1, full_name: 1, email: 1, role: 1 } }
        );

        res.json({
            success: true,
            authenticated: false,
            user: defaultStaff ? publicDoc(defaultStaff) : {
                staff_id: null,
                staff_code: 'GUEST',
                full_name: 'Dr. Rajesh Sharma',
                email: 'admin@library.edu',
                role: 'Admin'
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to load staff session.' });
    }
});

router.post('/auth/logout', (req, res) => {
    const staffName = req.session && req.session.user ? req.session.user.full_name : 'Staff';
    req.session.destroy(async (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Could not log out.' });
        }
        res.clearCookie('connect.sid');
        await logAudit('STAFF_LOGOUT', `${staffName} logged out of session.`, staffName);
        res.json({ success: true, message: 'Logged out successfully.' });
    });
});

async function getDashboardMetrics(req, res) {
    try {
        await refreshOverdueLoans();
        const today = startOfDayUTC(new Date());

        const [bookStats, totalMembers, activeMembers, activeLoans, overdueStats, collectedFines] = await Promise.all([
            collection('books').aggregate([
                {
                    $group: {
                        _id: null,
                        count: { $sum: 1 },
                        total_copies: { $sum: '$total_copies' },
                        available_copies: { $sum: '$available_copies' }
                    }
                }
            ]).toArray(),
            collection('members').countDocuments({}),
            collection('members').countDocuments({ status: 'Active' }),
            collection('loans').countDocuments({ return_date: null, status: 'Issued' }),
            collection('loans').aggregate([
                { $match: { return_date: null, status: 'Overdue' } },
                { $group: { _id: null, count: { $sum: 1 }, pending_fines: { $sum: '$fine_amount' } } }
            ]).toArray(),
            collection('loans').aggregate([
                { $match: { fine_paid: 1 } },
                { $group: { _id: null, total_collected: { $sum: '$fine_amount' } } }
            ]).toArray()
        ]);

        const totals = bookStats[0] || { count: 0, total_copies: 0, available_copies: 0 };
        const overdue = overdueStats[0] || { count: 0, pending_fines: 0 };
        const fines = collectedFines[0] || { total_collected: 0 };

        const recentLoanDocs = await collection('loans')
            .find({ return_date: null })
            .sort({ issue_date: -1, loan_id: -1 })
            .limit(6)
            .toArray();

        const recentIssues = (await hydrateLoans(recentLoanDocs)).map((loan) => ({
            loan_id: loan.loan_id,
            issue_date: loan.issue_date,
            due_date: loan.due_date,
            status: loan.status,
            book_title: loan.book_title,
            isbn: loan.isbn,
            genre: loan.genre,
            member_name: loan.member_name,
            member_code: loan.member_code,
            member_email: loan.member_email
        }));

        const dueSoonLimit = addDays(today, 3);
        const dueSoonDocs = await collection('loans')
            .find({
                return_date: null,
                $or: [{ due_date: { $lte: dueSoonLimit } }, { status: 'Overdue' }]
            })
            .sort({ due_date: 1 })
            .limit(8)
            .toArray();

        const dueSoonOrOverdue = (await hydrateLoans(dueSoonDocs)).map((loan) => ({
            loan_id: loan.loan_id,
            issue_date: loan.issue_date,
            due_date: loan.due_date,
            status: loan.status,
            fine_amount: loan.fine_amount,
            book_title: loan.book_title,
            isbn: loan.isbn,
            member_name: loan.member_name,
            member_code: loan.member_code,
            member_phone: loan.member_phone,
            days_remaining: daysBetween(today, loan.due_date)
        }));

        const recentLogs = (await collection('auditlogs')
            .find({})
            .sort({ log_id: -1 })
            .limit(7)
            .toArray())
            .map((log) => ({
                log_id: log.log_id,
                action_type: log.action_type,
                description: log.description,
                staff_name: log.staff_name,
                timestamp: toDateTime(log.timestamp)
            }));

        const genreDistribution = (await collection('books').aggregate([
            {
                $group: {
                    _id: '$genre',
                    titles_count: { $sum: 1 },
                    total_copies: { $sum: '$total_copies' },
                    available_copies: { $sum: '$available_copies' }
                }
            },
            { $project: { _id: 0, genre: '$_id', titles_count: 1, total_copies: 1, available_copies: 1 } },
            { $sort: { total_copies: -1 } }
        ]).toArray());

        res.json({
            success: true,
            stats: {
                totalTitles: totals.count,
                totalCopies: totals.total_copies,
                availableCopies: totals.available_copies,
                issuedCopies: totals.total_copies - totals.available_copies,
                totalMembers,
                activeMembers,
                activeLoans,
                overdueLoans: overdue.count,
                pendingFines: overdue.pending_fines,
                collectedFines: fines.total_collected
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

router.get('/books', async (req, res) => {
    try {
        const { search, genre, availability, sortBy = 'title', sortOrder = 'ASC', page, limit } = req.query;

        const filter = {};

        if (search && search.trim() !== '') {
            const rx = new RegExp(escapeRegex(search.trim()), 'i');
            filter.$or = [{ title: rx }, { author: rx }, { isbn: rx }, { publisher: rx }];
        }

        if (genre && genre !== 'All') {
            filter.genre = genre;
        }

        if (availability === 'available') {
            filter.available_copies = { $gt: 0 };
        } else if (availability === 'unavailable') {
            filter.available_copies = 0;
        }

        const total = await collection('books').countDocuments(filter);

        const validSortCols = ['title', 'author', 'publication_year', 'available_copies', 'total_copies', 'book_id'];
        const col = validSortCols.includes(sortBy) ? sortBy : 'title';
        const dir = sortOrder.toUpperCase() === 'DESC' ? -1 : 1;

        const genres = (await collection('books').distinct('genre')).filter(Boolean).sort();

        let cursor = collection('books').find(filter).sort({ [col]: dir });
        let responsePage = 1;
        let perPage = total;
        let totalPages = 1;

        if (page !== undefined || limit !== undefined) {
            perPage = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 1000);
            totalPages = Math.max(1, Math.ceil(total / perPage));
            responsePage = Math.min(Math.max(parseInt(page, 10) || 1, 1), totalPages);
            const offset = (responsePage - 1) * perPage;
            cursor = cursor.skip(offset).limit(perPage);
        }

        const bookDocs = await cursor.toArray();

        const bookIds = bookDocs.map((b) => b.book_id);
        const reservationCounts = new Map();
        if (bookIds.length) {
            const grouped = await collection('reservations').aggregate([
                { $match: { book_id: { $in: bookIds }, status: 'Pending' } },
                { $group: { _id: '$book_id', count: { $sum: 1 } } }
            ]).toArray();
            for (const row of grouped) reservationCounts.set(row._id, row.count);
        }

        const books = bookDocs.map((book) => ({
            ...serializeBook(book),
            issued_copies: book.total_copies - book.available_copies,
            reservation_count: reservationCounts.get(book.book_id) || 0
        }));

        res.json({
            success: true,
            count: total,
            page: responsePage,
            limit: perPage,
            totalPages,
            books,
            genres
        });
    } catch (err) {
        console.error('Fetch books error:', err);
        res.status(500).json({ success: false, message: 'Database error fetching books' });
    }
});

router.get('/books/:id', async (req, res) => {
    try {
        const bookId = parseInt(req.params.id, 10);
        if (isNaN(bookId)) {
            return res.status(404).json({ success: false, message: 'Book not found' });
        }

        const book = await collection('books').findOne({ book_id: bookId });
        if (!book) {
            return res.status(404).json({ success: false, message: 'Book not found' });
        }

        const loanDocs = await collection('loans')
            .find({ book_id: bookId, return_date: null })
            .sort({ due_date: 1 })
            .toArray();

        const memberIds = [...new Set(loanDocs.map((l) => l.member_id))];
        const members = memberIds.length
            ? await collection('members').find({ member_id: { $in: memberIds } }).toArray()
            : [];
        const memberMap = new Map(members.map((m) => [m.member_id, m]));

        const currentLoans = loanDocs.map((loan) => {
            const member = memberMap.get(loan.member_id) || {};
            return {
                loan_id: loan.loan_id,
                issue_date: toDateOnly(loan.issue_date),
                due_date: toDateOnly(loan.due_date),
                status: loan.status,
                member_code: member.member_code,
                full_name: member.full_name,
                email: member.email,
                phone: member.phone
            };
        });

        res.json({ success: true, book: serializeBook(book), currentLoans });
    } catch (err) {
        console.error('Fetch book detail error:', err);
        res.status(500).json({ success: false, message: 'Error fetching book details' });
    }
});

router.post('/books/import', async (req, res) => {
    try {
        const csv = typeof req.body?.csv === 'string' ? req.body.csv : '';
        if (!csv.trim()) {
            return res.status(400).json({
                success: false,
                message: 'CSV content is empty. Upload a .csv file with at least ISBN, Title and Author columns.'
            });
        }

        const delimiter = detectCsvDelimiter(csv);
        const rows = parseCsvRows(csv, delimiter).filter((row) => row.some((cell) => String(cell).trim() !== ''));

        if (rows.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'CSV must contain a header row and at least one data row.'
            });
        }

        const columns = mapCsvColumns(rows[0]);
        const missing = ['isbn', 'title', 'author'].filter((field) => columns[field] === undefined);
        if (missing.length) {
            return res.status(400).json({
                success: false,
                message: `CSV is missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Accepted headers include ISBN, Title, Author, Publisher, Year, Genre/Category, Copies and Shelf.`
            });
        }

        const errors = [];
        const candidates = [];
        const seenIsbns = new Set();
        let skipped = 0;

        for (let r = 1; r < rows.length; r += 1) {
            const cells = rows[r];
            const value = (field) => {
                const index = columns[field];
                return index === undefined ? '' : String(cells[index] ?? '').trim();
            };

            const isbn = value('isbn');
            const title = value('title');
            const author = value('author');
            const line = r + 1;

            if (!isbn || !title || !author) {
                errors.push({ line, message: 'ISBN, Title and Author are all required.' });
                continue;
            }

            const isbnKey = isbn.toLowerCase();
            if (seenIsbns.has(isbnKey)) {
                errors.push({ line, message: `Duplicate ISBN "${isbn}" within the CSV.` });
                continue;
            }
            seenIsbns.add(isbnKey);

            const copiesRaw = value('total_copies');
            const copies = copiesRaw === '' ? 1 : parseInt(copiesRaw, 10);
            if (!Number.isInteger(copies) || copies <= 0) {
                errors.push({ line, message: `Total copies must be a positive integer (received "${copiesRaw}").` });
                continue;
            }

            const yearRaw = value('publication_year');
            const parsedYear = yearRaw === '' ? null : parseInt(yearRaw, 10);

            candidates.push({
                line,
                isbn,
                title,
                author,
                publisher: value('publisher') || null,
                publication_year: Number.isFinite(parsedYear) ? parsedYear : null,
                genre: value('genre') || 'General',
                total_copies: copies,
                shelf_location: value('shelf_location') || 'Section A'
            });
        }

        let toInsert = candidates;
        if (candidates.length) {
            const existing = await collection('books')
                .find({ isbn: { $in: candidates.map((book) => book.isbn) } }, { projection: { isbn: 1 } })
                .toArray();
            const existingIsbns = new Set(existing.map((book) => String(book.isbn).toLowerCase()));

            toInsert = candidates.filter((book) => {
                if (existingIsbns.has(book.isbn.toLowerCase())) {
                    skipped += 1;
                    return false;
                }
                return true;
            });
        }

        let imported = 0;
        if (toInsert.length) {
            const firstId = await nextSequenceRange('book', toInsert.length);
            const now = new Date();
            const docs = toInsert.map((book, index) => {
                const { line, ...rest } = book;
                return {
                    book_id: firstId + index,
                    ...rest,
                    available_copies: book.total_copies,
                    cover_color: '#1e3a8a',
                    created_at: now
                };
            });

            try {
                const result = await collection('books').insertMany(docs, { ordered: false });
                imported = result.insertedCount;
            } catch (insertErr) {
                if (!insertErr.writeErrors) throw insertErr;
                imported = insertErr.result?.nInserted ?? (docs.length - insertErr.writeErrors.length);
            }
        }

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Admin');
        const fileName = req.body.file_name ? ` from "${req.body.file_name}"` : '';
        await logAudit(
            'BOOK_IMPORT',
            `Imported ${imported} book title(s)${fileName} (${skipped} duplicate ISBN(s) skipped, ${errors.length} row(s) rejected).`,
            staffName
        );

        const parts = [`Imported ${imported} book title${imported === 1 ? '' : 's'}`];
        if (skipped) parts.push(`${skipped} duplicate ISBN${skipped === 1 ? '' : 's'} skipped`);
        if (errors.length) parts.push(`${errors.length} row${errors.length === 1 ? '' : 's'} rejected`);

        res.json({
            success: true,
            message: `${parts.join('; ')}.`,
            imported,
            skipped,
            failed: errors.length,
            totalRows: rows.length - 1,
            errors: errors.slice(0, 50)
        });
    } catch (err) {
        console.error('Book CSV import error:', err);
        res.status(500).json({ success: false, message: 'Failed to import books: ' + err.message });
    }
});

router.post('/books', async (req, res) => {
    try {
        const { isbn, title, author, publisher, publication_year, genre, total_copies, shelf_location } = req.body;

        if (!isbn || !title || !author || !genre) {
            return res.status(400).json({ success: false, message: 'ISBN, Title, Author, and Genre are required.' });
        }

        const copies = parseInt(total_copies, 10);
        if (isNaN(copies) || copies <= 0) {
            return res.status(400).json({ success: false, message: 'Total copies must be a positive integer.' });
        }

        const existing = await collection('books').findOne({ isbn: isbn.trim() });
        if (existing) {
            return res.status(409).json({ success: false, message: `Book with ISBN "${isbn}" already exists in the catalog.` });
        }

        const parsedYear = publication_year ? parseInt(publication_year, 10) : null;
        const year = isNaN(parsedYear) ? null : parsedYear;
        const shelf = shelf_location ? shelf_location.trim() : 'Section A';
        const book_id = await nextSequence('book');

        await collection('books').insertOne({
            book_id,
            isbn: isbn.trim(),
            title: title.trim(),
            author: author.trim(),
            publisher: publisher ? publisher.trim() : null,
            publication_year: year,
            genre: genre.trim(),
            total_copies: copies,
            available_copies: copies,
            shelf_location: shelf,
            cover_color: '#1e3a8a',
            created_at: new Date()
        });

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Admin');
        await logAudit('BOOK_ADD', `Added book "${title.trim()}" (ISBN: ${isbn.trim()}, Copies: ${copies})`, staffName);

        res.status(201).json({
            success: true,
            message: `Book "${title}" added successfully.`,
            bookId: book_id
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to add book: ' + err.message });
    }
});

router.put('/books/:id', async (req, res) => {
    try {
        const bookId = parseInt(req.params.id, 10);
        const { isbn, title, author, publisher, publication_year, genre, total_copies, shelf_location } = req.body;

        if (isNaN(bookId)) {
            return res.status(404).json({ success: false, message: 'Book not found' });
        }

        const currentBook = await collection('books').findOne({ book_id: bookId });
        if (!currentBook) {
            return res.status(404).json({ success: false, message: 'Book not found' });
        }

        if (isbn && isbn.trim() !== currentBook.isbn) {
            const conflict = await collection('books').findOne({ isbn: isbn.trim(), book_id: { $ne: bookId } });
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

        await collection('books').updateOne(
            { book_id: bookId },
            {
                $set: {
                    isbn: isbn ? isbn.trim() : currentBook.isbn,
                    title: title ? title.trim() : currentBook.title,
                    author: author ? author.trim() : currentBook.author,
                    publisher: publisher !== undefined ? publisher : currentBook.publisher,
                    publication_year: publication_year ? parseInt(publication_year, 10) : currentBook.publication_year,
                    genre: genre ? genre.trim() : currentBook.genre,
                    total_copies: newTotalCopies,
                    available_copies: currentBook.available_copies + copyDifference,
                    shelf_location: shelf_location ? shelf_location.trim() : currentBook.shelf_location
                }
            }
        );

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Admin');
        await logAudit('BOOK_UPDATE', `Updated book details for "${title || currentBook.title}" (ID: ${bookId})`, staffName);

        res.json({ success: true, message: 'Book details updated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update book: ' + err.message });
    }
});

router.delete('/books/:id', async (req, res) => {
    try {
        const bookId = parseInt(req.params.id, 10);
        if (isNaN(bookId)) {
            return res.status(404).json({ success: false, message: 'Book not found' });
        }

        const book = await collection('books').findOne({ book_id: bookId });
        if (!book) {
            return res.status(404).json({ success: false, message: 'Book not found' });
        }

        const activeLoans = await collection('loans').countDocuments({ book_id: bookId, return_date: null });
        if (activeLoans > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete book. ${activeLoans} copy/copies are currently borrowed. They must be returned first.`
            });
        }

        await collection('reservations').deleteMany({ book_id: bookId });
        await collection('loans').deleteMany({ book_id: bookId });
        await collection('books').deleteOne({ book_id: bookId });

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Admin');
        await logAudit('BOOK_DELETE', `Deleted book "${book.title}" (ISBN: ${book.isbn})`, staffName);

        res.json({ success: true, message: `Book "${book.title}" was removed from the library catalog.` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to delete book: ' + err.message });
    }
});

router.get('/members', async (req, res) => {
    try {
        const { search, status, type } = req.query;
        const filter = {};

        if (search && search.trim() !== '') {
            const rx = new RegExp(escapeRegex(search.trim()), 'i');
            filter.$or = [{ full_name: rx }, { member_code: rx }, { email: rx }, { phone: rx }];
        }

        if (status && status !== 'All') {
            filter.status = status;
        }

        if (type && type !== 'All') {
            filter.membership_type = type;
        }

        const memberDocs = await collection('members').find(filter).sort({ member_id: -1 }).toArray();

        const memberIds = memberDocs.map((m) => m.member_id);
        const stats = new Map();
        if (memberIds.length) {
            const grouped = await collection('loans').aggregate([
                { $match: { member_id: { $in: memberIds }, return_date: null } },
                {
                    $group: {
                        _id: '$member_id',
                        currently_borrowed: { $sum: 1 },
                        pending_fines: {
                            $sum: { $cond: [{ $eq: ['$status', 'Overdue'] }, '$fine_amount', 0] }
                        }
                    }
                }
            ]).toArray();
            for (const row of grouped) stats.set(row._id, row);
        }

        const members = memberDocs.map((member) => {
            const stat = stats.get(member.member_id);
            return {
                ...serializeMember(member),
                currently_borrowed: stat ? stat.currently_borrowed : 0,
                pending_fines: stat ? stat.pending_fines : 0
            };
        });

        res.json({ success: true, count: members.length, members });
    } catch (err) {
        console.error('Fetch members error:', err);
        res.status(500).json({ success: false, message: 'Database error fetching members' });
    }
});

router.get('/members/:id', async (req, res) => {
    try {
        const memberId = parseInt(req.params.id, 10);
        if (isNaN(memberId)) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        const member = await collection('members').findOne({ member_id: memberId });
        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        const [activeDocs, pastDocs] = await Promise.all([
            collection('loans').find({ member_id: memberId, return_date: null }).sort({ due_date: 1 }).toArray(),
            collection('loans').find({ member_id: memberId, return_date: { $ne: null } }).sort({ return_date: -1 }).limit(15).toArray()
        ]);

        const allDocs = [...activeDocs, ...pastDocs];
        const bookIds = [...new Set(allDocs.map((l) => l.book_id))];
        const books = bookIds.length
            ? await collection('books').find({ book_id: { $in: bookIds } }).toArray()
            : [];
        const bookMap = new Map(books.map((b) => [b.book_id, b]));

        const shape = (loan) => {
            const book = bookMap.get(loan.book_id) || {};
            return {
                ...publicDoc(loan),
                issue_date: toDateOnly(loan.issue_date),
                due_date: toDateOnly(loan.due_date),
                return_date: toDateOnly(loan.return_date),
                created_at: toDateTime(loan.created_at),
                book_title: book.title,
                isbn: book.isbn,
                genre: book.genre
            };
        };

        res.json({
            success: true,
            member: serializeMember(member),
            activeLoans: activeDocs.map(shape),
            pastLoans: pastDocs.map(shape)
        });
    } catch (err) {
        console.error('Fetch member profile error:', err);
        res.status(500).json({ success: false, message: 'Database error fetching member profile' });
    }
});

router.post('/members', async (req, res) => {
    try {
        const { full_name, email, phone, address, membership_type, max_borrow_limit } = req.body;

        if (!full_name || !email || !phone) {
            return res.status(400).json({ success: false, message: 'Full Name, Email, and Phone are required.' });
        }

        const emailKey = email.trim().toLowerCase();
        const existing = await collection('members').findOne({ email: emailKey });
        if (existing) {
            return res.status(409).json({ success: false, message: 'A member with this email address already exists.' });
        }

        const currentYear = new Date().getFullYear();
        const member_id = await nextSequence('member');
        const memberCode = `MEM-${currentYear}-${String(member_id).padStart(3, '0')}`;
        const limit = max_borrow_limit ? parseInt(max_borrow_limit, 10) : (membership_type === 'Faculty' ? 8 : 4);

        await collection('members').insertOne({
            member_id,
            member_code: memberCode,
            full_name: full_name.trim(),
            email: emailKey,
            phone: phone.trim(),
            address: address ? address.trim() : '',
            membership_type: membership_type || 'Student',
            membership_date: startOfDayUTC(new Date()),
            status: 'Active',
            max_borrow_limit: limit,
            created_at: new Date()
        });

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Circulation Desk');
        await logAudit('MEMBER_REGISTER', `Registered member ${full_name.trim()} (${memberCode})`, staffName);

        res.status(201).json({
            success: true,
            message: `Member ${full_name} registered successfully with ID ${memberCode}.`,
            memberId: member_id,
            memberCode
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to register member: ' + err.message });
    }
});

router.put('/members/:id', async (req, res) => {
    try {
        const memberId = parseInt(req.params.id, 10);
        const { full_name, email, phone, address, membership_type, status, max_borrow_limit } = req.body;

        if (isNaN(memberId)) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        const currentMember = await collection('members').findOne({ member_id: memberId });
        if (!currentMember) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        if (email && email.trim().toLowerCase() !== currentMember.email) {
            const conflict = await collection('members').findOne({ email: email.trim().toLowerCase(), member_id: { $ne: memberId } });
            if (conflict) {
                return res.status(409).json({ success: false, message: 'Another member is already using this email.' });
            }
        }

        await collection('members').updateOne(
            { member_id: memberId },
            {
                $set: {
                    full_name: full_name ? full_name.trim() : currentMember.full_name,
                    email: email ? email.trim().toLowerCase() : currentMember.email,
                    phone: phone ? phone.trim() : currentMember.phone,
                    address: address !== undefined ? address.trim() : currentMember.address,
                    membership_type: membership_type || currentMember.membership_type,
                    status: status || currentMember.status,
                    max_borrow_limit: max_borrow_limit ? parseInt(max_borrow_limit, 10) : currentMember.max_borrow_limit
                }
            }
        );

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Admin');
        await logAudit('MEMBER_UPDATE', `Updated member profile ${full_name || currentMember.full_name} (${currentMember.member_code})`, staffName);

        res.json({ success: true, message: 'Member profile updated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update member: ' + err.message });
    }
});

router.delete('/members/:id', async (req, res) => {
    try {
        const memberId = parseInt(req.params.id, 10);
        if (isNaN(memberId)) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        const member = await collection('members').findOne({ member_id: memberId });
        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        const activeLoans = await collection('loans').countDocuments({ member_id: memberId, return_date: null });
        if (activeLoans > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete member. Member currently has ${activeLoans} borrowed book(s). All books must be returned first.`
            });
        }

        await collection('reservations').deleteMany({ member_id: memberId });
        await collection('loans').deleteMany({ member_id: memberId });
        await collection('members').deleteOne({ member_id: memberId });

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Admin');
        await logAudit('MEMBER_DELETE', `Deleted member record ${member.full_name} (${member.member_code})`, staffName);

        res.json({ success: true, message: `Member ${member.full_name} removed successfully.` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to delete member: ' + err.message });
    }
});

router.get('/loans', async (req, res) => {
    try {
        await refreshOverdueLoans();
        const { status, search } = req.query;
        const filter = {};

        if (status && status.toLowerCase() !== 'all') {
            filter.status = { $regex: `^${escapeRegex(status)}$`, $options: 'i' };
        }

        if (search && search.trim() !== '') {
            const rx = new RegExp(escapeRegex(search.trim()), 'i');
            const [bookMatches, memberMatches] = await Promise.all([
                collection('books').find({ $or: [{ title: rx }, { isbn: rx }] }, { projection: { book_id: 1 } }).toArray(),
                collection('members').find({ $or: [{ full_name: rx }, { member_code: rx }] }, { projection: { member_id: 1 } }).toArray()
            ]);
            filter.$or = [
                { book_id: { $in: bookMatches.map((b) => b.book_id) } },
                { member_id: { $in: memberMatches.map((m) => m.member_id) } }
            ];
        }

        const loanDocs = await collection('loans').find(filter).sort({ loan_id: -1 }).toArray();
        const loans = await hydrateLoans(loanDocs);

        res.json({ success: true, count: loans.length, loans });
    } catch (err) {
        console.error('Fetch loans error:', err);
        res.status(500).json({ success: false, message: 'Database error fetching circulation records' });
    }
});

router.get('/loans/:id', async (req, res) => {
    try {
        await refreshOverdueLoans();
        const loanId = parseInt(req.params.id, 10);
        if (isNaN(loanId)) {
            return res.status(404).json({ success: false, message: 'Loan transaction record not found.' });
        }

        const loanDoc = await collection('loans').findOne({ loan_id: loanId });
        if (!loanDoc) {
            return res.status(404).json({ success: false, message: 'Loan transaction record not found.' });
        }

        const [loan] = await hydrateLoans([loanDoc], { includeBookStock: true });
        res.json({ success: true, loan });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to retrieve loan record: ' + err.message });
    }
});

router.post('/loans/issue', async (req, res) => {
    try {
        const { book_id, member_id, loan_days = 14, remarks, due_date } = req.body;

        const bookId = parseInt(book_id, 10);
        const memberId = parseInt(member_id, 10);

        if (!bookId || !memberId) {
            return res.status(400).json({ success: false, message: 'Book ID and Member ID are required to issue a book.' });
        }

        const book = await collection('books').findOne({ book_id: bookId });
        if (!book) {
            return res.status(404).json({ success: false, message: 'Book not found in catalog.' });
        }
        if (book.available_copies <= 0) {
            return res.status(400).json({
                success: false,
                message: `Book "${book.title}" is currently Out of Stock (0 of ${book.total_copies} available). Cannot issue.`
            });
        }

        const member = await collection('members').findOne({ member_id: memberId });
        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found.' });
        }
        if (member.status !== 'Active') {
            return res.status(400).json({
                success: false,
                message: `Member status is "${member.status}". Only Active members are permitted to borrow books.`
            });
        }

        const activeLoansCount = await collection('loans').countDocuments({ member_id: memberId, return_date: null });
        if (activeLoansCount >= member.max_borrow_limit) {
            return res.status(400).json({
                success: false,
                message: `Borrowing limit reached. Member ${member.full_name} already has ${activeLoansCount} book(s) issued (Limit: ${member.max_borrow_limit}).`
            });
        }

        const decrement = await collection('books').findOneAndUpdate(
            { book_id: bookId, available_copies: { $gt: 0 } },
            { $inc: { available_copies: -1 } },
            { returnDocument: 'after' }
        );
        const updatedBook = decrement && decrement.value ? decrement.value : decrement;
        if (!updatedBook) {
            return res.status(400).json({
                success: false,
                message: `Book "${book.title}" is currently Out of Stock. Another issue may have just taken the last copy.`
            });
        }

        const today = startOfDayUTC(new Date());
        const issueDate = toDateOnly(today);
        let finalDueDate;
        if (due_date && /^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
            finalDueDate = due_date;
        } else {
            const days = parseInt(loan_days, 10) || 14;
            finalDueDate = toDateOnly(addDays(today, days));
        }

        const requestedStaffId = req.session && req.session.user ? req.session.user.staff_id : req.body.staff_id;
        const staff = await activeStaff(req, requestedStaffId);
        const finalStaffId = staff ? staff.staff_id : null;
        const staffName = staff ? staff.full_name : (req.body.staff_name || 'Circulation Desk');

        const loan_id = await nextSequence('loan');
        try {
            await collection('loans').insertOne({
                loan_id,
                book_id: bookId,
                member_id: memberId,
                staff_id: finalStaffId,
                issue_date: today,
                due_date: toDate(finalDueDate),
                return_date: null,
                status: 'Issued',
                fine_amount: 0,
                fine_paid: 0,
                remarks: remarks || 'Standard Loan',
                created_at: new Date()
            });
        } catch (insertErr) {
            await collection('books').updateOne({ book_id: bookId }, { $inc: { available_copies: 1 } });
            throw insertErr;
        }

        await collection('reservations').updateMany(
            { book_id: bookId, member_id: memberId, status: 'Pending' },
            { $set: { status: 'Fulfilled' } }
        );

        await logAudit('LOAN_ISSUE', `Issued "${book.title}" to ${member.full_name} (${member.member_code}). Due on ${finalDueDate}.`, staffName);

        res.status(201).json({
            success: true,
            message: `Book "${book.title}" issued successfully to ${member.full_name}.`,
            loan: {
                loan_id,
                book_title: book.title,
                member_name: member.full_name,
                issue_date: issueDate,
                due_date: finalDueDate
            }
        });
    } catch (err) {
        console.error('Issue book error:', err);
        res.status(500).json({ success: false, message: 'Failed to issue book: ' + err.message });
    }
});

router.post('/loans/:id/return', async (req, res) => {
    try {
        const loanId = parseInt(req.params.id, 10);
        const { fine_paid = 1, remarks } = req.body;

        if (isNaN(loanId)) {
            return res.status(404).json({ success: false, message: 'Loan transaction record not found.' });
        }

        const loan = await collection('loans').findOne({ loan_id: loanId });
        if (!loan) {
            return res.status(404).json({ success: false, message: 'Loan transaction record not found.' });
        }

        const [book, member] = await Promise.all([
            collection('books').findOne({ book_id: loan.book_id }),
            collection('members').findOne({ member_id: loan.member_id })
        ]);
        const bookTitle = book ? book.title : 'Unknown title';
        const memberName = member ? member.full_name : 'Unknown member';

        if (loan.return_date !== null && loan.return_date !== undefined) {
            return res.status(400).json({
                success: false,
                message: `This book was already returned on ${toDateOnly(loan.return_date)}.`
            });
        }

        const today = startOfDayUTC(new Date());
        const todayStr = toDateOnly(today);
        let calculatedFine = 0;
        if (todayStr > toDateOnly(loan.due_date)) {
            calculatedFine = daysBetween(loan.due_date, today) * 5;
        }

        const isFinePaid = calculatedFine > 0 ? (fine_paid ? 1 : 0) : 1;
        const finalRemarks = remarks ? `${remarks} (Returned on ${todayStr})` : (loan.remarks || 'Returned');

        await collection('loans').updateOne(
            { loan_id: loanId },
            {
                $set: {
                    return_date: today,
                    status: 'Returned',
                    fine_amount: calculatedFine,
                    fine_paid: isFinePaid,
                    remarks: finalRemarks
                }
            }
        );

        await collection('books').updateOne(
            { book_id: loan.book_id },
            [{ $set: { available_copies: { $min: ['$total_copies', { $add: ['$available_copies', 1] }] } } }]
        );

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Circulation Desk');
        const fineMsg = calculatedFine > 0 ? ` (Overdue fine of ₹${calculatedFine.toFixed(2)} ${isFinePaid ? 'collected' : 'pending'})` : '';
        await logAudit('LOAN_RETURN', `Received return of "${bookTitle}" from ${memberName}${fineMsg}.`, staffName);

        res.json({
            success: true,
            message: `Book "${bookTitle}" successfully returned!${fineMsg}`,
            details: {
                return_date: todayStr,
                fine_amount: calculatedFine,
                fine_paid: isFinePaid
            }
        });
    } catch (err) {
        console.error('Return book error:', err);
        res.status(500).json({ success: false, message: 'Failed to process return: ' + err.message });
    }
});

router.post('/loans/:id/renew', async (req, res) => {
    try {
        const loanId = parseInt(req.params.id, 10);
        const { additional_days = 14 } = req.body;

        if (isNaN(loanId)) {
            return res.status(404).json({ success: false, message: 'Loan record not found.' });
        }

        const loan = await collection('loans').findOne({ loan_id: loanId });
        if (!loan) {
            return res.status(404).json({ success: false, message: 'Loan record not found.' });
        }

        if (loan.return_date !== null && loan.return_date !== undefined) {
            return res.status(400).json({ success: false, message: 'Cannot renew a book that has already been returned.' });
        }

        const [book, member] = await Promise.all([
            collection('books').findOne({ book_id: loan.book_id }),
            collection('members').findOne({ member_id: loan.member_id })
        ]);

        const now = startOfDayUTC(new Date());
        const dueDate = toDate(loan.due_date);
        const baseDate = dueDate > now ? dueDate : now;
        const days = parseInt(additional_days, 10) || 14;
        const newDue = toDateOnly(addDays(baseDate, days));

        await collection('loans').updateOne(
            { loan_id: loanId },
            { $set: { due_date: toDate(newDue), status: 'Issued' } }
        );

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'Circulation Desk');
        await logAudit(
            'LOAN_RENEW',
            `Renewed loan for "${book ? book.title : 'Unknown'}" to ${member ? member.full_name : 'Unknown'}. New due date: ${newDue}`,
            staffName
        );

        res.json({
            success: true,
            message: `Loan renewed successfully until ${newDue}.`,
            newDueDate: newDue
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to renew loan: ' + err.message });
    }
});

async function getOverdueList(req, res) {
    try {
        await refreshOverdueLoans();
        const today = startOfDayUTC(new Date());

        const loanDocs = await collection('loans')
            .find({ return_date: null, due_date: { $lt: today } })
            .toArray();

        const hydrated = await hydrateLoans(loanDocs);
        const overdueList = hydrated
            .map((loan) => ({
                loan_id: loan.loan_id,
                issue_date: loan.issue_date,
                due_date: loan.due_date,
                fine_amount: loan.fine_amount,
                fine_paid: loan.fine_paid,
                remarks: loan.remarks,
                book_id: loan.book_id,
                book_title: loan.book_title,
                isbn: loan.isbn,
                genre: loan.genre,
                shelf_location: loan.shelf_location,
                member_id: loan.member_id,
                member_code: loan.member_code,
                member_name: loan.member_name,
                member_email: loan.member_email,
                member_phone: loan.member_phone,
                days_overdue: daysBetween(loan.due_date, today)
            }))
            .sort((a, b) => b.days_overdue - a.days_overdue);

        const summaryAgg = await collection('loans').aggregate([
            { $match: { return_date: null, status: 'Overdue' } },
            { $group: { _id: null, count: { $sum: 1 }, total_fines: { $sum: '$fine_amount' } } }
        ]).toArray();

        const summary = summaryAgg[0]
            ? { count: summaryAgg[0].count, total_fines: summaryAgg[0].total_fines }
            : { count: 0, total_fines: 0 };

        res.json({ success: true, summary, overdueList });
    } catch (err) {
        console.error('Overdue list error:', err);
        res.status(500).json({ success: false, message: 'Database error fetching overdue records' });
    }
}

router.get('/reports/overdue', getOverdueList);
router.get('/overdue', getOverdueList);

router.post('/overdue/remind/:id', async (req, res) => {
    try {
        const loanId = parseInt(req.params.id, 10);
        if (isNaN(loanId)) {
            return res.status(404).json({ success: false, message: 'Loan record not found' });
        }

        const loan = await collection('loans').findOne({ loan_id: loanId });
        if (!loan) {
            return res.status(404).json({ success: false, message: 'Loan record not found' });
        }

        const [book, member] = await Promise.all([
            collection('books').findOne({ book_id: loan.book_id }),
            collection('members').findOne({ member_id: loan.member_id })
        ]);

        const dateStr = toDateOnly(startOfDayUTC(new Date()));
        const updatedRemarks = `${loan.remarks ? loan.remarks + ' | ' : ''}Reminder notice dispatched on ${dateStr}`;
        await collection('loans').updateOne({ loan_id: loanId }, { $set: { remarks: updatedRemarks } });

        const staffName = req.session && req.session.user ? req.session.user.full_name : (req.body.staff_name || 'System');
        await logAudit(
            'REMINDER_SENT',
            `Sent overdue notice to ${member ? member.full_name : 'Unknown'} (${member ? member.phone : '-'}) for "${book ? book.title : 'Unknown'}".`,
            staffName
        );

        res.json({
            success: true,
            message: `Overdue reminder notification successfully logged & sent to ${member ? member.full_name : 'Unknown'} (${member ? member.email : '-'}).`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to send reminder: ' + err.message });
    }
});

router.get('/reports/export', async (req, res) => {
    try {
        const loanDocs = await collection('loans').find({}).sort({ loan_id: -1 }).toArray();
        const loans = await hydrateLoans(loanDocs);

        let csv = 'LoanID,ISBN,BookTitle,MemberCode,MemberName,IssueDate,DueDate,ReturnDate,Status,FineAmount\n';
        loans.forEach((row) => {
            csv += `"${row.loan_id}","${row.isbn || ''}","${String(row.book_title || '').replace(/"/g, '""')}","${row.member_code || ''}","${String(row.member_name || '').replace(/"/g, '""')}","${row.issue_date || ''}","${row.due_date || ''}","${row.return_date || ''}","${row.status}","${row.fine_amount}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="krmu_library_circulation_report.csv"');
        res.send(csv);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to export CSV report' });
    }
});

router.get('/reports', async (req, res) => {
    try {
        const [borrowCounts, borrowerCounts, monthlyStats, inventoryAgg, finesAgg] = await Promise.all([
            collection('loans').aggregate([
                { $group: { _id: '$book_id', times_borrowed: { $sum: 1 } } },
                { $sort: { times_borrowed: -1 } },
                { $limit: 5 }
            ]).toArray(),
            collection('loans').aggregate([
                { $group: { _id: '$member_id', total_borrowed: { $sum: 1 } } },
                { $sort: { total_borrowed: -1 } },
                { $limit: 5 }
            ]).toArray(),
            collection('loans').aggregate([
                { $match: { issue_date: { $type: 'date' } } },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m', date: '$issue_date' } },
                        issue_count: { $sum: 1 }
                    }
                },
                { $sort: { _id: -1 } },
                { $limit: 6 },
                { $project: { _id: 0, month: '$_id', issue_count: 1 } }
            ]).toArray(),
            collection('books').aggregate([
                {
                    $group: {
                        _id: null,
                        total_titles: { $sum: 1 },
                        total_volumes: { $sum: '$total_copies' },
                        available_volumes: { $sum: '$available_copies' },
                        circulating_volumes: { $sum: { $subtract: ['$total_copies', '$available_copies'] } }
                    }
                },
                { $project: { _id: 0 } }
            ]).toArray(),
            collection('loans').aggregate([
                {
                    $group: {
                        _id: null,
                        fines_collected: {
                            $sum: { $cond: [{ $eq: ['$fine_paid', 1] }, '$fine_amount', 0] }
                        },
                        fines_pending: {
                            $sum: {
                                $cond: [
                                    { $and: [{ $eq: ['$return_date', null] }, { $eq: ['$status', 'Overdue'] }] },
                                    '$fine_amount',
                                    0
                                ]
                            }
                        }
                    }
                },
                { $project: { _id: 0 } }
            ]).toArray()
        ]);

        const borrowedBooks = borrowCounts.length
            ? await collection('books').find({ book_id: { $in: borrowCounts.map((row) => row._id) } }).toArray()
            : [];
        const borrowedBookMap = new Map(borrowedBooks.map((b) => [b.book_id, b]));

        const popularBooks = [];
        for (const row of borrowCounts) {
            const book = borrowedBookMap.get(row._id);
            if (book) {
                popularBooks.push({
                    title: book.title,
                    author: book.author,
                    isbn: book.isbn,
                    genre: book.genre,
                    times_borrowed: row.times_borrowed
                });
            }
        }

        if (popularBooks.length < 5) {
            const usedIds = borrowCounts.map((row) => row._id);
            const idleBooks = await collection('books')
                .find({ book_id: { $nin: usedIds } })
                .sort({ title: 1 })
                .limit(5 - popularBooks.length)
                .toArray();
            for (const book of idleBooks) {
                popularBooks.push({
                    title: book.title,
                    author: book.author,
                    isbn: book.isbn,
                    genre: book.genre,
                    times_borrowed: 0
                });
            }
        }

        const borrowerMembers = borrowerCounts.length
            ? await collection('members').find({ member_id: { $in: borrowerCounts.map((row) => row._id) } }).toArray()
            : [];
        const borrowerMap = new Map(borrowerMembers.map((m) => [m.member_id, m]));

        const topBorrowers = borrowerCounts
            .map((row) => {
                const member = borrowerMap.get(row._id);
                if (!member) return null;
                return {
                    member_code: member.member_code,
                    full_name: member.full_name,
                    membership_type: member.membership_type,
                    total_borrowed: row.total_borrowed
                };
            })
            .filter(Boolean);

        const inventory = inventoryAgg[0] || {
            total_titles: 0,
            total_volumes: 0,
            available_volumes: 0,
            circulating_volumes: 0
        };
        const fines = finesAgg[0] || { fines_collected: 0, fines_pending: 0 };

        res.json({
            success: true,
            popularBooks,
            topBorrowers,
            monthlyStats,
            inventory,
            fines
        });
    } catch (err) {
        console.error('Reports error:', err);
        res.status(500).json({ success: false, message: 'Failed to generate library reports' });
    }
});

router.get('/staff', async (req, res) => {
    try {
        const staffList = await collection('staffs')
            .find(
                {},
                { projection: { staff_id: 1, staff_code: 1, full_name: 1, email: 1, phone: 1, role: 1, hire_date: 1, status: 1 } }
            )
            .sort({ staff_id: 1 })
            .toArray();

        res.json({
            success: true,
            staff: staffList.map((s) => ({
                ...publicDoc(s),
                hire_date: toDateOnly(s.hire_date)
            }))
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch staff accounts' });
    }
});

router.post('/system/reset-demo-data', async (req, res) => {
    try {
        await resetDemoData();

        const staffName = req.session && req.session.user ? req.session.user.full_name : 'Admin';
        await logAudit('SYSTEM_RESET', 'Demo database records restored to pristine initial state.', staffName);

        res.json({ success: true, message: 'Library database successfully restored to fresh demo state.' });
    } catch (err) {
        console.error('Reset error:', err);
        res.status(500).json({ success: false, message: 'Failed to reset demo data: ' + err.message });
    }
});

module.exports = router;
