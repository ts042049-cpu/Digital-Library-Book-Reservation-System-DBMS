/**
 * Unified Database Connection & Abstraction Layer
 * Supports SQLite (native node:sqlite) & MySQL 8.0 (mysql2)
 * Ensures persistent storage, parameterized queries, and ACID transactions.
 */

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const DB_PATH = path.join(__dirname, 'library.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const SEEDS_PATH = path.join(__dirname, 'seeds.sql');

// SQLite connection via native node:sqlite
const { DatabaseSync } = require('node:sqlite');
let sqliteDb = null;

try {
    sqliteDb = new DatabaseSync(DB_PATH);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    sqliteDb.exec('PRAGMA journal_mode = WAL;');
    sqliteDb.exec('PRAGMA busy_timeout = 5000;');
} catch (e) {
    console.error('[Database Engine] Failed to initialize SQLite:', e.message);
}

/**
 * Initialize Tables and Seeds if database is empty
 */
function initSQLiteTables() {
    if (!sqliteDb) return;
    try {
        if (fs.existsSync(SCHEMA_PATH)) {
            const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
            sqliteDb.exec(schemaSql);
        }

        const staffCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM staff').get();
        if (staffCount && staffCount.count === 0 && fs.existsSync(SEEDS_PATH)) {
            console.log('[Database] Populating initial demo seed data...');
            const seedsSql = fs.readFileSync(SEEDS_PATH, 'utf-8');
            sqliteDb.exec(seedsSql);
            console.log('[Database] Seed data successfully loaded.');
        }

        updateOverdueLoans();
    } catch (err) {
        console.error('[Database] SQLite table init error:', err.message);
    }
}

/**
 * Automatically update overdue loans status and calculate dynamic fines
 * Standard rule: ₹5.00 per day past due date
 */
function updateOverdueLoans() {
    if (!sqliteDb) return;
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // 1. Mark newly overdue loans
        const updateOverdueStmt = sqliteDb.prepare(`
            UPDATE loans 
            SET status = 'Overdue',
                fine_amount = ROUND(MAX(0, (julianday(?) - julianday(due_date)) * 5.0), 2)
            WHERE return_date IS NULL AND due_date < ?
        `);
        updateOverdueStmt.run(today, today);
    } catch (err) {
        console.error('[Database] Failed to refresh overdue loans:', err.message);
    }
}

/**
 * Execute a transaction atomically with rollback on error
 */
function runTransaction(callback) {
    if (!sqliteDb) throw new Error('Database not initialized');
    sqliteDb.exec('BEGIN TRANSACTION;');
    try {
        const result = callback(sqliteDb);
        sqliteDb.exec('COMMIT;');
        return result;
    } catch (error) {
        try {
            sqliteDb.exec('ROLLBACK;');
        } catch (rollbackErr) {
            console.error('[Database Engine] Rollback warning:', rollbackErr.message);
        }
        throw error;
    }
}

/**
 * Record an activity in the audit trail
 */
function logAudit(actionType, description, staffName = 'System') {
    if (!sqliteDb) return;
    try {
        const stmt = sqliteDb.prepare('INSERT INTO audit_logs (action_type, description, staff_name) VALUES (?, ?, ?)');
        stmt.run(actionType, description, staffName);
    } catch (e) {
        console.error('[AuditLog Error]', e.message);
    }
}

// Run SQLite initialization
initSQLiteTables();

module.exports = {
    db: sqliteDb,
    runTransaction,
    logAudit,
    updateOverdueLoans
};
