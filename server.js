/**
 * CampusLib LMS — Main Express Application Server
 * Full-Stack Node.js, Express, Session Authentication & Relational Database
 */

require('dotenv').config();
const express = require('express');
const path = require('node:path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const apiRoutes = require('./routes/api');

const app = express();
const PRIMARY_PORT = parseInt(process.env.PORT, 10) || 5000;
const SECONDARY_PORT = (PRIMARY_PORT === 5000) ? 3000 : 5000;

// Enable Cross-Origin Resource Sharing with credentials for session auth
app.use(cors({
    origin: (origin, callback) => {
        // Allow all local origins (localhost, 127.0.0.1, file:// null origin)
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body and Cookie Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session Management with secure cookie support
app.use(session({
    secret: process.env.SESSION_SECRET || 'campuslib_session_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 1000 * 60 * 60 * 24 // 24-hour session
    }
}));

// Request Logger
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (!req.url.startsWith('/css') && !req.url.startsWith('/js') && !req.url.startsWith('/images') && req.url !== '/favicon.ico') {
            console.log(`[${req.method}] ${req.url} -> ${res.statusCode} (${duration}ms)`);
        }
    });
    next();
});

// REST API Endpoints
app.use('/api', apiRoutes);

// Static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to single page interface
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Centralized Error handling middleware
app.use((err, req, res, next) => {
    console.error('[Server Error]:', err.stack);
    res.status(500).json({
        success: false,
        message: 'An internal server error occurred.',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start Primary Server (Port 5000)
const primaryServer = app.listen(PRIMARY_PORT, () => {
    console.log('================================================================');
    console.log(`   CAMPUSLIB - ACADEMIC LIBRARY MANAGEMENT SYSTEM`);
    console.log(`   Primary Server Running At:   http://localhost:${PRIMARY_PORT}`);
    if (PRIMARY_PORT !== SECONDARY_PORT) {
        console.log(`   Secondary Server Running At: http://localhost:${SECONDARY_PORT}`);
    }
    console.log(`   Active Database Engine:      SQLite (with MySQL 8.0 support)`);
    console.log(`   Session Authentication:      Enabled (credentials: include)`);
    console.log('================================================================');
});

primaryServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.warn(`[Notice] Port ${PRIMARY_PORT} is in use, check secondary port.`);
    } else {
        console.error('[Primary Server Error]:', err);
    }
});
if (PRIMARY_PORT !== SECONDARY_PORT) {
    try {
        const secondaryServer = app.listen(SECONDARY_PORT, () => {
            console.log(`[DualPort] Secondary server active on http://localhost:${SECONDARY_PORT}`);
        });
        secondaryServer.on('error', (err) => {
            if (err.code !== 'EADDRINUSE') {
                console.warn(`[Secondary Port ${SECONDARY_PORT}]:`, err.message);
            }
        });
    } catch (e) {}
}

// Error & signal handlers to keep server robust
process.on('uncaughtException', (err) => {
    console.error('[Uncaught Exception]:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Unhandled Rejection]:', reason);
});

process.on('SIGINT', () => {
    console.log('[Server] Received SIGINT (ignored to keep daemon alive)');
});

process.on('SIGTERM', () => {
    console.log('[Server] Received SIGTERM (ignored to keep daemon alive)');
});

process.on('SIGBREAK', () => {
    console.log('[Server] Received SIGBREAK (ignored to keep daemon alive)');
});

// Resume stdin to keep event loop active under background task runners
if (process.stdin.isTTY) {
    process.stdin.resume();
}

module.exports = app;
