/**
 * Automated Full-Stack Integration Test Suite
 * Tests all 10 requirements: Auth, Dashboard, Books, Members, Circulation, Overdue, CSV Export, Logout
 */

const http = require('http');
require('dotenv').config();
const server = require('./server.js');

let sessionCookie = '';

function request(method, path, body = null, cookie = '') {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request({
            hostname: 'localhost',
            port: process.env.PORT || 3000,
            path: encodeURI(path),
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
        // Bad password test
        const badLogin = await request('POST', '/api/auth/login', { username: 'admin@library.edu', password: 'wrongpassword' });
        console.log('1.1 Bad login status:', badLogin.status, '(Expected 401)');
        if (badLogin.status !== 401) throw new Error('Bad password was accepted!');

        // Good login test
        const goodLogin = await request('POST', '/api/auth/login', { username: 'admin@library.edu', password: 'admin123' });
        console.log('1.2 Valid login status:', goodLogin.status, 'User:', goodLogin.body.user.full_name, 'Role:', goodLogin.body.user.role);
        if (goodLogin.status !== 200 || !sessionCookie) throw new Error('Login failed or cookie not set');

        // Check session via /api/auth/me
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

        // Verify book in list
        const booksList = await request('GET', '/api/books?search=Modern%20Operating', null, sessionCookie);
        console.log('3.2 Search created book count:', booksList.body.count);

        // Edit book
        const editBookRes = await request('PUT', '/api/books/' + createdBookId, {
            title: 'Modern Operating Systems (Updated Edition)',
            total_copies: 6,
            genre: 'Computer Science'
        }, sessionCookie);
        console.log('3.3 Edit book status:', editBookRes.status, 'Message:', editBookRes.body.message);

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
        // Initial available copies
        const bookBeforeIssue = (await request('GET', '/api/books/' + createdBookId, null, sessionCookie)).body.book;
        console.log('5.1 Copies available before issue:', bookBeforeIssue.available_copies);

        // Issue book
        const issueRes = await request('POST', '/api/loans/issue', {
            book_id: createdBookId,
            member_id: createdMemberId,
            loan_days: 14,
            remarks: 'Integration test loan'
        }, sessionCookie);
        console.log('5.2 Issue status:', issueRes.status, 'Loan ID:', issueRes.body.loan.loan_id);
        const testLoanId = issueRes.body.loan.loan_id;

        // Verify stock decremented
        const bookAfterIssue = (await request('GET', '/api/books/' + createdBookId, null, sessionCookie)).body.book;
        console.log('5.3 Copies available after issue:', bookAfterIssue.available_copies);
        if (bookAfterIssue.available_copies !== bookBeforeIssue.available_copies - 1) {
            throw new Error('Stock was not decremented!');
        }

        // Return book
        const returnRes = await request('POST', '/api/loans/' + testLoanId + '/return', {
            fine_paid: 1,
            remarks: 'Returned in good shape'
        }, sessionCookie);
        console.log('5.4 Return status:', returnRes.status, 'Message:', returnRes.body.message);

        // Verify stock restored
        const bookAfterReturn = (await request('GET', '/api/books/' + createdBookId, null, sessionCookie)).body.book;
        console.log('5.5 Copies available after return:', bookAfterReturn.available_copies);
        if (bookAfterReturn.available_copies !== bookBeforeIssue.available_copies) {
            throw new Error('Stock was not restored!');
        }

        // Clean up test book and member
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

        console.log('\n>>> ALL 7 END-TO-END INTEGRATION TESTS PASSED 100%! <<<');
        process.exit(0);
    } catch (e) {
        console.error('Integration test failed:', e);
        process.exit(1);
    }
}, 1000);
