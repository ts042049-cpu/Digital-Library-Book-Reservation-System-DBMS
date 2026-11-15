require('dotenv').config();
const express = require('express');
const path = require('node:path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const apiRoutes = require('./routes/api');
const { connect, close, MONGO_DB_NAME } = require('./database/db');

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

// Body and Cookie Parsers (generous JSON limit for CSV bulk imports)
app.use(express.json({ limit: '10mb' }));
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
        sameSite: 'lax',
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

// Fallback for non-existent API routes (must precede frontend catch-all)
app.all('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `API endpoint '${req.method} ${req.originalUrl}' was not found.`
    });
});

// Login and Terms/Policy share the same public entry point.
// The app shell contains the circulation-desk login gate, so /login serves
// index.html too — giving a single, consistent login screen everywhere.
app.get(['/login', '/login.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/terms', '/terms.html', '/policy', '/policies', '/terms-and-policy', '/privacy'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// The app shell is always served. When there is no staff session the shell's
// built-in login gate is displayed; every data endpoint stays auth-protected.
app.get(['/', '/index.html', '/dashboard', '/home'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Static frontend assets (styles, scripts, images)
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Fallback for client-side navigation: always hand back the app shell.
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

let primaryServer = null;
let secondaryServer = null;

// Start the HTTP listeners only after MongoDB is reachable & seeded.
async function startServers() {
    if (primaryServer) return primaryServer;

    await connect();

    // Start Primary Server (Port 5000)
    primaryServer = app.listen(PRIMARY_PORT, () => {
        console.log('================================================================');
        console.log('   KRMU LIBRARY - K.R. MANGALAM UNIVERSITY');
        console.log(`   Primary Server Running At:   http://localhost:${PRIMARY_PORT}`);
        if (PRIMARY_PORT !== SECONDARY_PORT) {
            console.log(`   Secondary Server Running At: http://localhost:${SECONDARY_PORT}`);
        }
        console.log(`   Active Database Engine:      MongoDB (database: ${MONGO_DB_NAME})`);
        console.log('   Session Authentication:      Enabled (credentials: include)');
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
            secondaryServer = app.listen(SECONDARY_PORT, () => {
                console.log(`[DualPort] Secondary server active on http://localhost:${SECONDARY_PORT}`);
            });
            secondaryServer.on('error', (err) => {
                if (err.code !== 'EADDRINUSE') {
                    console.warn(`[Secondary Port ${SECONDARY_PORT}]:`, err.message);
                }
            });
        } catch (e) {}
    }

    return primaryServer;
}

function stopServers() {
    if (primaryServer) {
        primaryServer.close();
        primaryServer = null;
    }
    if (secondaryServer) {
        secondaryServer.close();
        secondaryServer = null;
    }
}

function handleStartupFailure() {
    console.error('================================================================');
    console.error('   STARTUP ABORTED: MongoDB is not reachable.');
    console.error(`   URI: ${process.env.MONGO_URI || 'mongodb://127.0.0.1:27017'}`);
    console.error('   Start the "MongoDB" Windows service (or run mongod) and retry.');
    console.error('================================================================');
    process.exit(1);
}

// Auto-start when executed directly as main script
if (require.main === module) {
    startServers().catch(handleStartupFailure);
}

function gracefulShutdown(signal) {
    console.log(`[Server] Received ${signal}. Closing active listeners...`);
    stopServers();
    close().finally(() => process.exit(0));
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
    console.error('[Uncaught Exception]:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Unhandled Rejection]:', reason);
});

// Attach helper methods to app export for testing and programmatic usage
app.startServers = startServers;
app.stopServers = stopServers;

module.exports = app;
module.exports.closeDatabase = close;
