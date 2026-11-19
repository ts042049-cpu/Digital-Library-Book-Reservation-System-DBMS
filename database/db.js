const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const MONGO_DB_NAME = process.env.MONGO_DB || 'krmu_library';
const SEEDS_DIR = path.join(__dirname, 'seeds');

const DAY_MS = 24 * 60 * 60 * 1000;

let client = null;
let database = null;
let connectPromise = null;

const DATE_FIELDS = {
    staffs: ['hire_date', 'created_at'],
    members: ['membership_date', 'created_at'],
    books: ['created_at'],
    loans: ['issue_date', 'due_date', 'return_date', 'created_at'],
    reservations: ['reservation_date', 'created_at'],
    auditlogs: ['timestamp']
};

function toDate(value) {
    if (value instanceof Date) return value;
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00.000Z`);
        return new Date(value);
    }
    return new Date(value);
}

function startOfDayUTC(value = new Date()) {
    const date = toDate(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(value, days) {
    return new Date(toDate(value).getTime() + days * DAY_MS);
}

function daysBetween(from, to) {
    return Math.round((startOfDayUTC(to) - startOfDayUTC(from)) / DAY_MS);
}

function toDateOnly(value) {
    if (value === null || value === undefined) return null;
    const date = toDate(value);
    if (!date || isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

function toDateTime(value) {
    if (value === null || value === undefined) return null;
    const date = toDate(value);
    if (!date || isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function createIndexes(db) {
    await Promise.all([
        db.collection('books').createIndexes([
            { key: { book_id: 1 }, name: 'ux_books_book_id', unique: true },
            { key: { isbn: 1 }, name: 'ux_books_isbn', unique: true },
            { key: { title: 1 }, name: 'ix_books_title' },
            { key: { author: 1 }, name: 'ix_books_author' },
            { key: { genre: 1 }, name: 'ix_books_genre' },
            { key: { available_copies: 1 }, name: 'ix_books_available' }
        ]),
        db.collection('members').createIndexes([
            { key: { member_id: 1 }, name: 'ux_members_member_id', unique: true },
            { key: { member_code: 1 }, name: 'ux_members_code', unique: true },
            { key: { email: 1 }, name: 'ux_members_email', unique: true },
            { key: { status: 1 }, name: 'ix_members_status' }
        ]),
        db.collection('staffs').createIndexes([
            { key: { staff_id: 1 }, name: 'ux_staffs_staff_id', unique: true },
            { key: { staff_code: 1 }, name: 'ux_staffs_code', unique: true },
            { key: { email: 1 }, name: 'ux_staffs_email', unique: true }
        ]),
        db.collection('loans').createIndexes([
            { key: { loan_id: 1 }, name: 'ux_loans_loan_id', unique: true },
            { key: { book_id: 1 }, name: 'ix_loans_book' },
            { key: { member_id: 1 }, name: 'ix_loans_member' },
            { key: { status: 1 }, name: 'ix_loans_status' },
            { key: { due_date: 1 }, name: 'ix_loans_due' },
            { key: { return_date: 1 }, name: 'ix_loans_return' }
        ]),
        db.collection('reservations').createIndexes([
            { key: { reservation_id: 1 }, name: 'ux_reservations_id', unique: true },
            { key: { book_id: 1 }, name: 'ix_reservations_book' },
            { key: { member_id: 1 }, name: 'ix_reservations_member' }
        ]),
        db.collection('auditlogs').createIndexes([
            { key: { log_id: 1 }, name: 'ux_auditlogs_log_id', unique: true },
            { key: { timestamp: -1 }, name: 'ix_auditlogs_timestamp' }
        ])
    ]);
}

function readSeed(name) {
    const candidates = [
        path.join(SEEDS_DIR, name),
        path.join(process.cwd(), 'database', 'seeds', name),
        path.join(__dirname, 'seeds', name),
        path.join(__dirname, '..', 'database', 'seeds', name)
    ];
    for (const file of candidates) {
        if (fs.existsSync(file)) {
            try {
                return JSON.parse(fs.readFileSync(file, 'utf-8'));
            } catch (err) {
                console.error(`[Database] Error reading seed file ${file}:`, err.message);
            }
        }
    }
    console.warn(`[Database] Seed file "${name}" could not be found.`);
    return [];
}

function reviveDates(collectionName, docs) {
    const fields = DATE_FIELDS[collectionName] || [];
    return docs.map((doc) => {
        const clone = { ...doc };
        for (const field of fields) {
            if (field in clone) clone[field] = clone[field] ? toDate(clone[field]) : null;
        }
        return clone;
    });
}

async function insertSeed(collectionName, docs) {
    if (!docs.length) return;
    const collection = database.collection(collectionName);
    const revived = reviveDates(collectionName, docs);
    const batchSize = 500;
    for (let i = 0; i < revived.length; i += batchSize) {
        await collection.insertMany(revived.slice(i, i + batchSize));
    }
}

async function seedAll() {
    const staffs = readSeed('staffs.json');
    const members = readSeed('members.json');
    const books = readSeed('books.json');
    const loans = readSeed('loans.json');
    const reservations = readSeed('reservations.json');
    const auditlogs = readSeed('auditlogs.json');
    const counters = readSeed('counters.json');

    await insertSeed('staffs', staffs);
    await insertSeed('books', books);
    await insertSeed('members', members);
    await insertSeed('loans', loans);
    await insertSeed('reservations', reservations);
    await insertSeed('auditlogs', auditlogs);

    if (counters.length) {
        await database.collection('counters').deleteMany({});
        await database.collection('counters').insertMany(counters);
    }

    await reconcileBookStock();

    console.log(`[Database] Seeded ${books.length.toLocaleString()} book titles, ${staffs.length} staff, ${members.length} members, ${loans.length} loans.`);
}

async function reconcileBookStock() {
    const active = await database.collection('loans').aggregate([
        { $match: { return_date: null } },
        { $group: { _id: '$book_id', count: { $sum: 1 } } }
    ]).toArray();
    const activeMap = new Map(active.map((row) => [row._id, row.count]));

    const books = await database.collection('books')
        .find({}, { projection: { book_id: 1, total_copies: 1, available_copies: 1 } })
        .toArray();

    const operations = [];
    for (const book of books) {
        const expected = Math.max(0, Math.min(book.total_copies, book.total_copies - (activeMap.get(book.book_id) || 0)));
        if (book.available_copies !== expected) {
            operations.push({
                updateOne: {
                    filter: { book_id: book.book_id },
                    update: { $set: { available_copies: expected } }
                }
            });
        }
    }
    if (operations.length) await database.collection('books').bulkWrite(operations);
}

async function seedIfEmpty() {
    const books = await database.collection('books').estimatedDocumentCount();
    const staffs = await database.collection('staffs').estimatedDocumentCount();
    if (books === 0 && staffs === 0) {
        console.log('[Database] Empty database detected — loading demo data and accession catalog...');
        await seedAll();
    }
}

let isInitialized = false;

async function initDatabase(db) {
    if (isInitialized) return;
    try {
        await createIndexes(db);
        await seedIfEmpty();
        await refreshOverdueLoans();
        isInitialized = true;
    } catch (err) {
        console.warn('[Database] Initial schema setup warning:', err.message);
    }
}

function connect() {
    if (database) return Promise.resolve(database);
    if (connectPromise) return connectPromise;

    if (process.env.VERCEL && !process.env.MONGO_URI) {
        const msg = 'MONGO_URI is missing in Vercel environment variables. Please configure MONGO_URI in your Vercel Project Settings.';
        console.error(`[Database Error] ${msg}`);
        return Promise.reject(new Error(msg));
    }

    connectPromise = (async () => {
        client = new MongoClient(MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
            maxPoolSize: 10
        });
        await client.connect();
        database = client.db(MONGO_DB_NAME);
        await database.command({ ping: 1 });
        await initDatabase(database);
        const safeUri = MONGO_URI.replace(/:([^:@]+)@/, ':****@');
        console.log(`[Database] MongoDB connected — database "${MONGO_DB_NAME}" at ${safeUri}`);
        return database;
    })();

    connectPromise.catch((err) => {
        connectPromise = null;
        client = null;
        database = null;
        console.error('[Database] MongoDB connection failed:', err.message);
    });

    return connectPromise;
}

function getDb() {
    if (!database) throw new Error('MongoDB is not connected yet. Await connect() before using the database.');
    return database;
}

async function close() {
    if (client) {
        await client.close();
        client = null;
        database = null;
        connectPromise = null;
    }
}

async function nextSequence(name) {
    const result = await getDb().collection('counters').findOneAndUpdate(
        { _id: name },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' }
    );
    const doc = result && result.value ? result.value : result;
    return doc.seq;
}

async function nextSequenceRange(name, count) {
    const amount = parseInt(count, 10);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const result = await getDb().collection('counters').findOneAndUpdate(
        { _id: name },
        { $inc: { seq: amount } },
        { upsert: true, returnDocument: 'after' }
    );
    const doc = result && result.value ? result.value : result;
    return doc.seq - amount + 1;
}

async function logAudit(actionType, description, staffName = 'System') {
    try {
        const log_id = await nextSequence('audit_log');
        await getDb().collection('auditlogs').insertOne({
            log_id,
            action_type: actionType,
            description,
            staff_name: staffName,
            timestamp: new Date()
        });
    } catch (err) {
        console.error('[AuditLog Error]', err.message);
    }
}

async function refreshOverdueLoans() {
    if (!database) return;
    try {
        const today = startOfDayUTC(new Date());
        const overdue = await database.collection('loans')
            .find({ return_date: null, due_date: { $lt: today } })
            .project({ due_date: 1, fine_amount: 1, status: 1 })
            .toArray();

        if (!overdue.length) return;

        const operations = overdue.map((loan) => {
            const days = Math.max(0, daysBetween(loan.due_date, today));
            const fine = Math.round(days * 5 * 100) / 100;
            return {
                updateOne: {
                    filter: { _id: loan._id },
                    update: { $set: { status: 'Overdue', fine_amount: fine } }
                }
            };
        });
        await database.collection('loans').bulkWrite(operations);
    } catch (err) {
        console.error('[Database] Failed to refresh overdue loans:', err.message);
    }
}

async function resetDemoData() {
    const db = getDb();
    const collections = ['books', 'members', 'staffs', 'loans', 'reservations', 'auditlogs', 'counters'];
    for (const name of collections) {
        await db.collection(name).deleteMany({});
    }
    await seedAll();
    await refreshOverdueLoans();
}

module.exports = {
    connect,
    getDb,
    close,
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
    escapeRegex,
    MONGO_DB_NAME
};
