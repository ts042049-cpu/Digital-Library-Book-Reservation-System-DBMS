
const http = require('http');
require('dotenv').config();
const app = require('./server.js');
if (app.startServers) {
    app.startServers();
}

let sessionCookie = '';

function request(method, path, body = null, cookie = '') {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request({
            hostname: 'localhost',
            port: process.env.PORT || 3000,
            path: encodeURI(decodeURI(path)),
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                ...(cookie ? { 'Cookie': cookie } : {})
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const setCookie = res.headers['set-cookie'];
                if (setCookie) {
                    sessionCookie = setCookie.map(c => c.split(';')[0]).join('; ');
                }
                let parsed = data;
                try { parsed = JSON.parse(data); } catch(e) {}
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

setTimeout(async () => {
    try {
        console.log('=== TEST 1: AUTHENTICATION FLOW ===');
        const badLogin = await request('POST', '/api/auth/login', { username: 'admin@library.edu', password: 'wrongpassword' });
        console.log('1.1 Bad login status:', badLogin.status, '(Expected 401)');
        if (badLogin.status !== 401) throw new Error('Bad password was accepted!');

        const goodLogin = await request('POST', '/api/auth/login', { username: 'admin@library.edu', password: 'admin123' });
        console.log('1.2 Valid login status:', goodLogin.status, 'User:', goodLogin.body.user.full_name, 'Role:', goodLogin.body.user.role);
        if (goodLogin.status !== 200 || !sessionCookie) throw new Error('Login failed or cookie not set');

        const meRes = await request('GET', '/api/auth/me', null, sessionCookie);
        console.log('1.3 /api/auth/me status:', meRes.status, 'Session User:', meRes.body.user.full_name);
        if (!meRes.body.authenticated) throw new Error('/api/auth/me did not recognize session!');

        console.log('\n=== TEST 2: DASHBOARD METRICS (/api/reports/dashboard) ===');
        const dash = await request('GET', '/api/reports/dashboard', null, sessionCookie);
        console.log('2.1 Dashboard status:', dash.status, 'Total Titles:', dash.body.stats.totalTitles, 'Total Copies:', dash.body.stats.totalCopies, 'Overdue Loans:', dash.body.stats.overdueLoans);
        if (dash.status !== 200 || !dash.body.stats) throw new Error('Dashboard stats missing');

        console.log('\n=== TEST 3: BOOK MANAGEMENT CRUD ===');
        const testIsbn = '978-' + Math.floor(1000000000 + Math.random() * 9000000000);
        const newBookRes = await request('POST', '/api/books', {
            isbn: testIsbn,
            title: 'Modern Operating Systems (4th Ed)',
            author: 'Andrew S. Tanenbaum',
            genre: 'Computer Science',
            publisher: 'Pearson',
            publication_year: 2015,
            total_copies: 5,
            shelf_location: 'Shelf OS-01'
        }, sessionCookie);
        console.log('3.1 Create book status:', newBookRes.status, 'Message:', newBookRes.body.message);
        const createdBookId = newBookRes.body.bookId;

        const booksList = await request('GET', '/api/books?search=Modern Operating', null, sessionCookie);
        console.log('3.2 Search created book count:', booksList.body.count);
        if (!booksList.body.count || booksList.body.count < 1) {
            throw new Error('Book search did not find the newly created title!');
        }

        const editBookRes = await request('PUT', '/api/books/' + createdBookId, {
            title: 'Modern Operating Systems (Updated Edition)',
            total_copies: 6,
            genre: 'Computer Science'
        }, sessionCookie);
        console.log('3.3 Edit book status:', editBookRes.status, 'Message:', editBookRes.body.message);

        const importIsbn = '978-' + Math.floor(1000000000 + Math.random() * 9000000000);
        const csvSample = [
            'ISBN,Title,Author,Genre,Copies,Shelf',
            `${importIsbn},CSV Import Test Title,CSV Author,Reference,2,Shelf CSV-01`,
            `${importIsbn},CSV Import Duplicate Title,CSV Author,Reference,1,Shelf CSV-02`,
            ',CSV Import Missing ISBN,CSV Author,,,'
        ].join('\n');
        const importRes = await request('POST', '/api/books/import', {
            csv: csvSample,
            file_name: 'integration_test.csv'
        }, sessionCookie);
        console.log('3.4 CSV import status:', importRes.status, 'Message:', importRes.body.message);
        if (importRes.status !== 200 || importRes.body.imported !== 1 || importRes.body.failed !== 2) {
            throw new Error('CSV import did not report the expected 1 imported / 2 rejected!');
        }

        const importedSearch = await request('GET', '/api/books?search=' + encodeURIComponent(importIsbn), null, sessionCookie);
        const importedBook = (importedSearch.body.books || [])[0];
        if (!importedBook || importedBook.total_copies !== 2) {
            throw new Error('CSV-imported book was not found in the catalog!');
        }
        await request('DELETE', '/api/books/' + importedBook.book_id, null, sessionCookie);
        console.log('3.5 Imported book verified and cleaned up (ID ' + importedBook.book_id + ').');

        console.log('\n=== TEST 4: MEMBER MANAGEMENT CRUD ===');
        const testEmail = 'test.' + Date.now() + '@student.edu';
        const newMemberRes = await request('POST', '/api/members', {
            full_name: 'Harshit Saxena',
            email: testEmail,
            phone: '+91 98888 77777',
            membership_type: 'Student',
            address: 'Hostel Block D, Room 101'
        }, sessionCookie);
        console.log('4.1 Register member status:', newMemberRes.status, 'Code:', newMemberRes.body.memberCode);
        const createdMemberId = newMemberRes.body.memberId;

        console.log('\n=== TEST 5: CIRCULATION (ISSUE & RETURN ATOMICITY) ===');
        const bookBeforeIssue = (await request('GET', '/api/books/' + createdBookId, null, sessionCookie)).body.book;
        console.log('5.1 Copies available before issue:', bookBeforeIssue.available_copies);

        const issueRes = await request('POST', '/api/loans/issue', {
            book_id: createdBookId,
            member_id: createdMemberId,
            loan_days: 14,
            remarks: 'Integration test loan'
        }, sessionCookie);
        console.log('5.2 Issue status:', issueRes.status, 'Loan ID:', issueRes.body.loan.loan_id);
        const testLoanId = issueRes.body.loan.loan_id;

        const bookAfterIssue = (await request('GET', '/api/books/' + createdBookId, null, sessionCookie)).body.book;
        console.log('5.3 Copies available after issue:', bookAfterIssue.available_copies);
        if (bookAfterIssue.available_copies !== bookBeforeIssue.available_copies - 1) {
            throw new Error('Stock was not decremented!');
        }

        const returnRes = await request('POST', '/api/loans/' + testLoanId + '/return', {
            fine_paid: 1,
            remarks: 'Returned in good shape'
        }, sessionCookie);
        console.log('5.4 Return status:', returnRes.status, 'Message:', returnRes.body.message);

        const bookAfterReturn = (await request('GET', '/api/books/' + createdBookId, null, sessionCookie)).body.book;
        console.log('5.5 Copies available after return:', bookAfterReturn.available_copies);
        if (bookAfterReturn.available_copies !== bookBeforeIssue.available_copies) {
            throw new Error('Stock was not restored!');
        }

        await request('DELETE', '/api/books/' + createdBookId, null, sessionCookie);
        await request('DELETE', '/api/members/' + createdMemberId, null, sessionCookie);
        console.log('5.6 Cleanup of temporary test records complete.');

        console.log('\n=== TEST 6: OVERDUE & CSV EXPORT ===');
        const overdueRes = await request('GET', '/api/reports/overdue', null, sessionCookie);
        console.log('6.1 Overdue records status:', overdueRes.status, 'Count:', overdueRes.body.overdueList.length);

        const exportRes = await request('GET', '/api/reports/export', null, sessionCookie);
        console.log('6.2 CSV Export status:', exportRes.status, 'ContentType:', exportRes.headers['content-type'], 'CSV Header:', exportRes.body.split('\n')[0]);
        if (!exportRes.body.startsWith('LoanID,ISBN,BookTitle')) {
            throw new Error('CSV Export format invalid');
        }

        console.log('\n=== TEST 7: LOGOUT ===');
        const logoutRes = await request('POST', '/api/auth/logout', null, sessionCookie);
        console.log('7.1 Logout status:', logoutRes.status, 'Message:', logoutRes.body.message);

        console.log('\n=== TEST 8: LOGIN & TERMS PAGES ROUTING & LOGIN GATE ===');
        const loginPageRes = await request('GET', '/login');
        const loginHasGate = typeof loginPageRes.body === 'string' && loginPageRes.body.includes('id="login-gate"');
        console.log('8.1 GET /login status:', loginPageRes.status, 'Has Login Gate:', loginHasGate);
        if (loginPageRes.status !== 200 || !loginHasGate) {
            throw new Error('/login did not return the app shell with the login gate');
        }

        const termsPageRes = await request('GET', '/terms');
        console.log('8.2 GET /terms status:', termsPageRes.status, 'Has Terms HTML:', typeof termsPageRes.body === 'string' && termsPageRes.body.includes('Terms of Service & Library Policies'));
        if (termsPageRes.status !== 200 || !termsPageRes.body.includes('Terms of Service & Library Policies')) {
            throw new Error('/terms did not return terms.html');
        }

        const unauthHomeRes = await request('GET', '/');
        const homeHasGate = typeof unauthHomeRes.body === 'string' && unauthHomeRes.body.includes('id="login-gate"');
        console.log('8.3 Unauthenticated GET / status:', unauthHomeRes.status, 'Has Login Gate:', homeHasGate);
        if (unauthHomeRes.status !== 200 || !homeHasGate) {
            throw new Error('Unauthenticated GET / did not return the login gate!');
        }

        const unauthIndexRes = await request('GET', '/index.html');
        const indexHasGate = typeof unauthIndexRes.body === 'string' && unauthIndexRes.body.includes('id="login-gate"');
        console.log('8.4 Unauthenticated GET /index.html status:', unauthIndexRes.status, 'Has Login Gate:', indexHasGate);
        if (unauthIndexRes.status !== 200 || !indexHasGate) {
            throw new Error('Unauthenticated GET /index.html did not return the login gate!');
        }

        const directLoginRes = await request('GET', '/login.html');
        const directTermsRes = await request('GET', '/terms.html');
        const directLoginHasGate = typeof directLoginRes.body === 'string' && directLoginRes.body.includes('id="login-gate"');
        console.log('8.5 /login.html status:', directLoginRes.status, 'Has Login Gate:', directLoginHasGate, '| /terms.html status:', directTermsRes.status);
        if (directLoginRes.status !== 200 || !directLoginHasGate || directTermsRes.status !== 200) {
            throw new Error('Direct static page access failed');
        }

        console.log('\n>>> ALL 8 END-TO-END INTEGRATION TESTS PASSED 100%! <<<');
        if (app.stopServers) app.stopServers();
        process.exit(0);
    } catch (e) {
        console.error('Integration test failed:', e);
        if (app.stopServers) app.stopServers();
        process.exit(1);
    }
}, 1000);
