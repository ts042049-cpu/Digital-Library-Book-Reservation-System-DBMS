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

// Trust reverse proxy (essential for Vercel, Heroku, and reverse proxy deployments)
app.set('trust proxy', 1);

app.use(cors({
    origin: (origin, callback) => {
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(session({
    secret: process.env.SESSION_SECRET || 'campuslib_session_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: 'auto',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// Stateless session header fallback (preserves session across serverless functions on Vercel)
app.use((req, res, next) => {
    if ((!req.session || !req.session.user) && req.headers['x-staff-user']) {
        try {
            req.session = req.session || {};
            req.session.user = JSON.parse(decodeURIComponent(req.headers['x-staff-user']));
        } catch (e) {}
    }
    next();
});

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

// Automatically ensure MongoDB is connected before processing API requests (critical for Vercel/serverless)
const ensureDb = async (req, res, next) => {
    try {
        await connect();
        next();
    } catch (err) {
        console.error('[Database Connection Error]:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Database connection failed. Please ensure MONGO_URI is set correctly in environment variables.',
            error: err.message
        });
    }
};

app.use('/api', ensureDb, apiRoutes);

// Fallback for Vercel serverless functions if /api prefix is stripped by edge rewrites
app.use((req, res, next) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/css') || req.url.startsWith('/js') || req.url.startsWith('/images') || req.url.startsWith('/assets') || req.url === '/' || req.url.startsWith('/login') || req.url.startsWith('/terms')) {
        return next();
    }
    ensureDb(req, res, () => {
        apiRoutes(req, res, next);
    });
});

app.all('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `API endpoint '${req.method} ${req.originalUrl}' was not found.`
    });
});

app.get(['/login', '/login.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get(['/terms', '/terms.html', '/policy', '/policies', '/terms-and-policy', '/privacy'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

app.get(['/', '/index.html', '/dashboard', '/home'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

async function startServers() {
    if (primaryServer) return primaryServer;

    await connect();

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

app.startServers = startServers;
app.stopServers = stopServers;

module.exports = app;
module.exports.closeDatabase = close;
