const App = {
    state: {
        currentView: 'dashboard',
        currentUser: {
            staff_id: 1,
            staff_code: 'STF-101',
            full_name: 'Dr. Rajesh Sharma',
            email: 'admin@library.edu',
            role: 'Admin'
        },
        books: [],
        booksPage: 1,
        booksLimit: 25,
        booksPagination: { total: 0, totalPages: 1, limit: 25, page: 1 },
        members: [],
        loans: [],
        overdueCount: 0,
        isLoading: false
    },

    async init() {
        this.setupNavigation();
        this.setupEventListeners();
        this.updateDateDisplay();

        const isAuthenticated = await this.checkCurrentSession();
        if (isAuthenticated) {
            this.showApp();
        } else {
            this.showLoginGate();
        }
    },

    async checkCurrentSession() {
        try {
            const data = await ApiService.auth.me();
            if (data && data.authenticated && data.user) {
                this.setCurrentUser(data.user);
                return true;
            }
        } catch (err) {
            console.warn('[Session] Session check failed:', err.message);
        }

        if (typeof localStorage !== 'undefined') {
            try {
                const saved = localStorage.getItem('campuslib_user');
                if (saved) {
                    const user = JSON.parse(saved);
                    if (user && user.email) {
                        this.setCurrentUser(user);
                        return true;
                    }
                }
            } catch (e) {}
        }
        return false;
    },

    showApp() {
        const gate = document.getElementById('login-gate');
        if (gate) gate.style.display = 'none';

        const appContainer = document.getElementById('app-container');
        if (appContainer) appContainer.hidden = false;

        document.body.classList.remove('is-locked');
        this.loadStaffList();
        this.navigate(this.state.currentView || 'dashboard');
    },

    showLoginGate() {
        const appContainer = document.getElementById('app-container');
        if (appContainer) appContainer.hidden = true;

        const gate = document.getElementById('login-gate');
        if (gate) gate.style.display = 'flex';

        document.body.classList.add('is-locked');
        this.setGateError('');

        const username = document.getElementById('gate-username');
        if (username) {
            setTimeout(() => username.focus(), 60);
        }
    },

    setGateError(message) {
        const box = document.getElementById('gate-login-error');
        if (!box) return;
        if (message) {
            box.textContent = message;
            box.hidden = false;
        } else {
            box.textContent = '';
            box.hidden = true;
        }
    },

    async handleGateLogin(e) {
        e.preventDefault();

        const usernameInput = document.getElementById('gate-username');
        const passwordInput = document.getElementById('gate-password');
        const submitBtn = document.getElementById('gate-login-submit');
        const submitLabel = submitBtn ? submitBtn.querySelector('.login-submit-label') : null;

        const username = usernameInput ? usernameInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';

        this.setGateError('');

        if (!username || !password) {
            this.setGateError('Please enter both your staff email/staff code and password.');
            if (!username && usernameInput) usernameInput.focus();
            else if (passwordInput) passwordInput.focus();
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.add('is-loading');
            if (submitLabel) submitLabel.textContent = 'Signing in…';
        }

        try {
            const data = await ApiService.auth.login(username, password);
            if (!data.success) throw new Error(data.message);

            this.setCurrentUser(data.user);
            this.resetForm('form-gate-login');
            this.showApp();
            this.showToast(data.message || 'Signed in successfully.', 'success');
        } catch (err) {
            this.setGateError(err.message || 'Sign in failed. Please try again.');
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('is-loading');
                if (submitLabel) submitLabel.textContent = 'Sign In';
            }
        }
    },

    toggleGatePassword() {
        const input = document.getElementById('gate-password');
        const toggle = document.getElementById('gate-toggle-password');
        if (!input || !toggle) return;

        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggle.setAttribute('aria-pressed', String(show));
        toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    },

    setCurrentUser(user) {
        if (!user) return;
        this.state.currentUser = user;
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem('campuslib_user', JSON.stringify(user));
            } catch (e) {}
        }

        const staffName = document.getElementById('sidebar-staff-name');
        if (staffName) staffName.textContent = user.full_name || 'Librarian';

        const staffRole = document.getElementById('sidebar-staff-role');
        if (staffRole) staffRole.textContent = `${user.role || 'Staff'} (${user.staff_code || 'ID'})`;

        const avatar = document.getElementById('sidebar-staff-avatar');
        if (avatar && user.full_name) {
            const initials = user.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            avatar.textContent = initials || 'LIB';
        }

        const modalName = document.getElementById('modal-current-user-name');
        if (modalName) modalName.textContent = user.full_name || 'Staff';

        const modalRole = document.getElementById('modal-current-user-role');
        if (modalRole) modalRole.textContent = `Role: ${user.role || 'Staff'} (${user.staff_code || 'ID'})`;
    },

    updateDateDisplay() {
        const now = new Date();
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        const dateStr = now.toLocaleDateString('en-US', options);
        const dateElem = document.getElementById('current-date-display');
        if (dateElem) dateElem.textContent = dateStr;

        const issueDateInput = document.getElementById('issue-date-input');
        if (issueDateInput) issueDateInput.value = now.toISOString().split('T')[0];
    },

    setupNavigation() {
        const navButtons = document.querySelectorAll('.sidebar-nav .nav-item');
        navButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const view = btn.getAttribute('data-view');
                if (view) {
                    this.navigate(view);
                    const sidebar = document.getElementById('sidebar');
                    if (sidebar) sidebar.classList.remove('open');
                }
            });
        });

        const mobileToggle = document.getElementById('mobile-toggle');
        if (mobileToggle) {
            mobileToggle.addEventListener('click', () => {
                document.getElementById('sidebar').classList.toggle('open');
            });
        }

        const globalSearch = document.getElementById('global-search-input');
        if (globalSearch) {
            globalSearch.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const query = globalSearch.value.trim();
                    if (query) {
                        this.navigate('books');
                        const booksSearch = document.getElementById('books-search-input');
                        if (booksSearch) {
                            booksSearch.value = query;
                            this.loadBooks({ resetPage: true });
                        }
                    }
                }
            });
        }
    },

    navigate(viewName) {
        this.state.currentView = viewName;

        document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
            if (btn.getAttribute('data-view') === viewName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        document.querySelectorAll('.page-view').forEach(view => {
            view.style.display = 'none';
        });

        const targetView = document.getElementById(`view-${viewName}`);
        if (targetView) {
            targetView.style.display = 'block';
        }

        switch (viewName) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'books':
                this.loadBooks({ resetPage: true });
                break;
            case 'members':
                this.loadMembers();
                break;
            case 'issue':
                this.prepareIssueDesk();
                break;
            case 'return':
                this.loadReturnDesk();
                break;
            case 'overdue':
                this.loadOverdueList();
                break;
            case 'transactions':
                this.loadTransactions();
                break;
            case 'reports':
                this.loadReports();
                break;
            case 'viva':
                break;
            case 'terms':
                break;
        }
    },

    setupEventListeners() {
        const booksSearch = document.getElementById('books-search-input');
        if (booksSearch) booksSearch.addEventListener('input', this.debounce(() => this.loadBooks({ resetPage: true }), 300));
        const genreFilter = document.getElementById('books-genre-filter');
        if (genreFilter) genreFilter.addEventListener('change', () => this.loadBooks({ resetPage: true }));
        const availFilter = document.getElementById('books-avail-filter');
        if (availFilter) availFilter.addEventListener('change', () => this.loadBooks({ resetPage: true }));
        const sortFilter = document.getElementById('books-sort-filter');
        if (sortFilter) sortFilter.addEventListener('change', () => this.loadBooks({ resetPage: true }));

        const booksPrevBtn = document.getElementById('books-prev-btn');
        if (booksPrevBtn) {
            booksPrevBtn.addEventListener('click', () => {
                if (this.state.booksPage > 1) {
                    this.state.booksPage--;
                    this.loadBooks();
                }
            });
        }
        const booksNextBtn = document.getElementById('books-next-btn');
        if (booksNextBtn) {
            booksNextBtn.addEventListener('click', () => {
                if (this.state.booksPage < (this.state.booksPagination?.totalPages || 1)) {
                    this.state.booksPage++;
                    this.loadBooks();
                }
            });
        }

        const btnAddBook = document.getElementById('btn-add-book');
        if (btnAddBook) {
            btnAddBook.addEventListener('click', () => {
                this.resetForm('form-book');
                document.getElementById('book-form-id').value = '';
                document.getElementById('modal-book-title').textContent = 'Add New Book to Catalog';
                this.openModal('modal-book');
            });
        }

        const btnImportBooks = document.getElementById('btn-import-books');
        const booksCsvInput = document.getElementById('books-csv-input');
        if (btnImportBooks && booksCsvInput) {
            btnImportBooks.addEventListener('click', () => {
                booksCsvInput.value = '';
                booksCsvInput.click();
            });
            booksCsvInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) this.handleImportBooks(file);
            });
        }

        const formBook = document.getElementById('form-book');
        if (formBook) {
            formBook.addEventListener('submit', (e) => this.handleSaveBook(e));
        }

        const membersSearch = document.getElementById('members-search-input');
        if (membersSearch) membersSearch.addEventListener('input', this.debounce(() => this.loadMembers(), 300));
        const memberStatusFilter = document.getElementById('members-status-filter');
        if (memberStatusFilter) memberStatusFilter.addEventListener('change', () => this.loadMembers());
        const memberTypeFilter = document.getElementById('members-type-filter');
        if (memberTypeFilter) memberTypeFilter.addEventListener('change', () => this.loadMembers());

        const btnAddMember = document.getElementById('btn-add-member');
        if (btnAddMember) {
            btnAddMember.addEventListener('click', () => {
                this.resetForm('form-member');
                document.getElementById('member-form-id').value = '';
                document.getElementById('modal-member-title').textContent = 'Register New Library Cardholder';
                document.getElementById('group-member-status').style.display = 'none';
                this.openModal('modal-member');
            });
        }

        const formMember = document.getElementById('form-member');
        if (formMember) {
            formMember.addEventListener('submit', (e) => this.handleSaveMember(e));
        }

        const formIssue = document.getElementById('form-issue-book');
        if (formIssue) {
            formIssue.addEventListener('submit', (e) => this.handleIssueBook(e));
        }

        const returnSearch = document.getElementById('return-search-input');
        if (returnSearch) {
            returnSearch.addEventListener('input', this.debounce(() => this.loadReturnDesk(), 300));
        }

        const formReturn = document.getElementById('form-process-return');
        if (formReturn) {
            formReturn.addEventListener('submit', (e) => this.handleConfirmReturn(e));
        }

        const transSearch = document.getElementById('transactions-search-input');
        if (transSearch) transSearch.addEventListener('input', this.debounce(() => this.loadTransactions(), 300));
        const transStatus = document.getElementById('transactions-status-filter');
        if (transStatus) transStatus.addEventListener('change', () => this.loadTransactions());

        const gateForm = document.getElementById('form-gate-login');
        if (gateForm) {
            gateForm.addEventListener('submit', (e) => this.handleGateLogin(e));
        }
        const gatePasswordToggle = document.getElementById('gate-toggle-password');
        if (gatePasswordToggle) {
            gatePasswordToggle.addEventListener('click', () => this.toggleGatePassword());
        }

        document.addEventListener('auth:required', () => {
            if (!document.getElementById('app-container')?.hidden) {
                this.showLoginGate();
                this.showToast('Your session has ended. Please sign in again.', 'info');
            }
        });

        const formLogin = document.getElementById('form-staff-login');
        if (formLogin) {
            formLogin.addEventListener('submit', (e) => this.handleLogin(e));
        }

        const btnViva = document.getElementById('btn-viva-modal');
        if (btnViva) {
            btnViva.addEventListener('click', () => this.openModal('modal-viva'));
        }

        const btnAuth = document.getElementById('btn-open-auth');
        if (btnAuth) {
            btnAuth.addEventListener('click', () => this.openModal('modal-auth'));
        }

        document.querySelectorAll('.modal-backdrop').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-backdrop.active').forEach(modal => {
                    modal.classList.remove('active');
                });
            }
        });
    },

    async loadDashboard() {
        try {
            const data = await ApiService.reports.getDashboard();
            if (!data || !data.success) {
                throw new Error(data?.message || 'Invalid server response');
            }

            const stats = data.stats || {};
            const setElem = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };

            setElem('stat-total-titles', stats.totalTitles ?? 0);
            setElem('stat-total-copies', `${stats.totalCopies ?? 0} physical copies`);
            setElem('stat-available-copies', stats.availableCopies ?? 0);
            setElem('stat-issued-copies', stats.issuedCopies ?? 0);
            setElem('stat-active-loans', `${stats.activeLoans ?? 0} active loan records`);
            setElem('stat-overdue-loans', stats.overdueLoans ?? 0);
            setElem('stat-pending-fines', `₹${parseFloat(stats.pendingFines || 0).toFixed(2)} pending late fines`);
            setElem('stat-total-members', stats.totalMembers ?? 0);
            setElem('stat-active-members', `${stats.activeMembers ?? 0} active cardholders`);

            this.state.overdueCount = stats.overdueLoans || 0;
            const badge = document.getElementById('sidebar-overdue-badge');
            if (badge) {
                badge.textContent = stats.overdueLoans || 0;
                badge.style.display = (stats.overdueLoans > 0) ? 'inline-block' : 'none';
            }

            const recentIssuesTbody = document.getElementById('dashboard-recent-issues-table');
            if (recentIssuesTbody) {
                if (data.recentIssues && data.recentIssues.length > 0) {
                    recentIssuesTbody.innerHTML = data.recentIssues.map(issue => `
                        <tr>
                            <td>
                                <strong>${this.escapeHtml(issue.book_title)}</strong>
                                <div style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHtml(issue.isbn)}</div>
                            </td>
                            <td>
                                <div>${this.escapeHtml(issue.member_name)}</div>
                                <span class="badge badge-neutral" style="font-size:0.68rem;">${this.escapeHtml(issue.member_code)}</span>
                            </td>
                            <td>${issue.issue_date || '—'}</td>
                            <td><strong>${issue.due_date || '—'}</strong></td>
                            <td>
                                <button class="btn btn-sm btn-outline" onclick="App.openReturnModal(${issue.loan_id})">
                                    Return
                                </button>
                            </td>
                        </tr>
                    `).join('');
                } else {
                    recentIssuesTbody.innerHTML = `<tr><td colspan="5" class="empty-state">No active loans issued recently.</td></tr>`;
                }
            }

            const alertsTbody = document.getElementById('dashboard-alerts-table');
            if (alertsTbody) {
                if (data.dueSoonOrOverdue && data.dueSoonOrOverdue.length > 0) {
                    alertsTbody.innerHTML = data.dueSoonOrOverdue.map(item => {
                        const isOverdue = item.status === 'Overdue' || (item.days_remaining !== null && item.days_remaining < 0);
                        const badgeClass = isOverdue ? 'badge-danger' : 'badge-warning';
                        const badgeLabel = isOverdue 
                            ? `Overdue (${Math.abs(item.days_remaining || 0)}d) · Fine: ₹${item.fine_amount || 0}` 
                            : `Due in ${item.days_remaining || 0} day(s)`;

                        return `
                            <tr>
                                <td>
                                    <strong>${this.escapeHtml(item.book_title)}</strong>
                                    <div style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHtml(item.member_name)} (${this.escapeHtml(item.member_phone || 'N/A')})</div>
                                </td>
                                <td>${item.due_date || '—'}</td>
                                <td>
                                    <span class="badge ${badgeClass}">
                                        <span class="badge-dot"></span>
                                        ${badgeLabel}
                                    </span>
                                </td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    alertsTbody.innerHTML = `<tr><td colspan="3" class="empty-state">No overdue books or urgent deadlines this week.</td></tr>`;
                }
            }

            const activityList = document.getElementById('dashboard-activity-list');
            if (activityList) {
                if (data.recentLogs && data.recentLogs.length > 0) {
                    activityList.innerHTML = data.recentLogs.map(log => `
                        <li class="activity-item">
                            <div class="activity-icon-bubble">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div class="activity-content">
                                <div class="activity-desc">${this.escapeHtml(log.description)}</div>
                                <div class="activity-meta">
                                    <span><strong>${this.escapeHtml(log.staff_name || 'System')}</strong></span>
                                    <span>&bull;</span>
                                    <span>${log.timestamp || ''}</span>
                                </div>
                            </div>
                        </li>
                    `).join('');
                } else {
                    activityList.innerHTML = `<li class="empty-state">No activity logs recorded yet.</li>`;
                }
            }

            const genreTbody = document.getElementById('dashboard-genre-table');
            if (genreTbody) {
                if (data.genreDistribution && data.genreDistribution.length > 0) {
                    genreTbody.innerHTML = data.genreDistribution.map(g => `
                        <tr>
                            <td><strong>${this.escapeHtml(g.genre)}</strong></td>
                            <td>${g.titles_count}</td>
                            <td>${g.total_copies}</td>
                            <td><span class="badge ${g.available_copies > 0 ? 'badge-success' : 'badge-danger'}">${g.available_copies}</span></td>
                        </tr>
                    `).join('');
                } else {
                    genreTbody.innerHTML = `<tr><td colspan="4" class="empty-state">No categories available.</td></tr>`;
                }
            }

        } catch (err) {
            console.error('Failed to load dashboard:', err);
            this.showToast(err.message, 'error');
        }
    },

    async loadBooks({ resetPage = false } = {}) {
        try {
            const search = document.getElementById('books-search-input')?.value || '';
            const genre = document.getElementById('books-genre-filter')?.value || 'All';
            const availability = document.getElementById('books-avail-filter')?.value || 'all';
            const sortVal = document.getElementById('books-sort-filter')?.value || 'title:ASC';
            const [sortBy, sortOrder] = sortVal.split(':');

            if (resetPage) this.state.booksPage = 1;

            const page = this.state.booksPage || 1;
            const limit = this.state.booksLimit || 25;

            const data = await ApiService.books.getAll({ search, genre, availability, sortBy, sortOrder, page, limit });
            if (!data.success) throw new Error(data.message);

            this.state.books = data.books || [];
            this.state.booksPage = data.page || 1;
            this.state.booksPagination = {
                total: data.count || 0,
                totalPages: data.totalPages || 1,
                limit: data.limit || limit,
                page: data.page || 1
            };

            const genreSelect = document.getElementById('books-genre-filter');
            if (genreSelect && genreSelect.options.length <= 1 && data.genres) {
                data.genres.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g;
                    opt.textContent = g;
                    genreSelect.appendChild(opt);
                });
            }

            const tbody = document.getElementById('books-table-body');
            if (tbody) {
                if (this.state.books.length > 0) {
                    tbody.innerHTML = this.state.books.map(b => {
                        const isAvailable = b.available_copies > 0;
                        const badgeClass = isAvailable ? (b.available_copies <= 2 ? 'badge-warning' : 'badge-success') : 'badge-danger';
                        const badgeLabel = isAvailable ? `${b.available_copies} Available` : 'Out of Stock';

                        return `
                            <tr>
                                <td>
                                    <div class="cell-primary cell-clamp-2" title="${this.escapeHtml(b.title)}">${this.escapeHtml(b.title)}</div>
                                    <div class="cell-sub" title="${this.escapeHtml(b.author)}">${this.escapeHtml(b.author)}</div>
                                    <code class="cell-code" title="${this.escapeHtml(b.isbn)}">${this.escapeHtml(b.isbn)}</code>
                                </td>
                                <td><span class="badge badge-neutral badge-fit">${this.escapeHtml(b.genre)}</span></td>
                                <td>
                                    <div class="cell-truncate" title="${this.escapeHtml(b.publisher || 'N/A')}">${this.escapeHtml(b.publisher || 'N/A')}</div>
                                    <div class="cell-sub">${b.publication_year || '—'}</div>
                                </td>
                                <td><span class="cell-truncate cell-strong" title="${this.escapeHtml(b.shelf_location || 'General')}">${this.escapeHtml(b.shelf_location || 'General')}</span></td>
                                <td class="cell-nowrap"><strong>${b.available_copies}</strong> <span class="cell-muted">/ ${b.total_copies}</span></td>
                                <td>
                                    <span class="badge ${badgeClass}">
                                        <span class="badge-dot"></span>
                                        ${badgeLabel}
                                    </span>
                                </td>
                                <td>
                                    <div class="table-actions">
                                        <button class="btn btn-sm btn-outline" onclick="App.openEditBookModal(${b.book_id})">Edit</button>
                                        <button class="btn btn-sm btn-outline" style="color:var(--danger-600);" onclick="App.deleteBook(${b.book_id})">Delete</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No books found matching search criteria.</td></tr>`;
                }
            }

            this.renderBooksPagination();
        } catch (err) {
            console.error('Failed to load books:', err);
            this.showToast('Error loading books catalog: ' + err.message, 'error');
        }
    },

    renderBooksPagination() {
        const info = document.getElementById('books-page-info');
        const label = document.getElementById('books-page-label');
        const prev = document.getElementById('books-prev-btn');
        const next = document.getElementById('books-next-btn');
        if (!info || !label || !prev || !next) return;

        const p = this.state.booksPagination || { total: 0, totalPages: 1, limit: 25, page: 1 };
        const start = p.total === 0 ? 0 : (p.page - 1) * p.limit + 1;
        const end = Math.min(p.page * p.limit, p.total);

        info.textContent = `Showing ${start.toLocaleString('en-IN')}–${end.toLocaleString('en-IN')} of ${p.total.toLocaleString('en-IN')} titles`;
        label.textContent = `Page ${p.page} of ${p.totalPages}`;
        prev.disabled = p.page <= 1;
        next.disabled = p.page >= p.totalPages;
    },

    openEditBookModal(bookId) {
        const book = this.state.books.find(b => b.book_id === parseInt(bookId, 10));
        if (!book) return;

        document.getElementById('book-form-id').value = book.book_id;
        document.getElementById('book-isbn').value = book.isbn;
        document.getElementById('book-genre').value = book.genre;
        document.getElementById('book-title').value = book.title;
        document.getElementById('book-author').value = book.author;
        document.getElementById('book-publisher').value = book.publisher || '';
        document.getElementById('book-year').value = book.publication_year || '';
        document.getElementById('book-copies').value = book.total_copies;
        document.getElementById('book-shelf').value = book.shelf_location || '';

        document.getElementById('modal-book-title').textContent = `Edit Book: ${book.title}`;
        this.openModal('modal-book');
    },

    async handleSaveBook(e) {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Saving...</span>';
        }

        const bookId = document.getElementById('book-form-id').value;
        const payload = {
            isbn: document.getElementById('book-isbn').value.trim(),
            genre: document.getElementById('book-genre').value.trim(),
            title: document.getElementById('book-title').value.trim(),
            author: document.getElementById('book-author').value.trim(),
            publisher: document.getElementById('book-publisher').value.trim(),
            publication_year: document.getElementById('book-year').value.trim(),
            total_copies: document.getElementById('book-copies').value.trim(),
            shelf_location: document.getElementById('book-shelf').value.trim(),
            staff_name: this.state.currentUser.full_name
        };

        try {
            const data = bookId 
                ? await ApiService.books.update(bookId, payload)
                : await ApiService.books.create(payload);

            if (!data.success) throw new Error(data.message);

            this.showToast(data.message, 'success');
            this.closeModal('modal-book');
            this.loadBooks();
        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        }
    },

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Could not read the selected CSV file.'));
            reader.readAsText(file);
        });
    },

    async handleImportBooks(file) {
        const btn = document.getElementById('btn-import-books');
        const originalBtnHtml = btn ? btn.innerHTML : '';

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>Importing…</span>';
        }

        try {
            if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
                throw new Error('Please choose a .csv file.');
            }
            if (file.size > 5 * 1024 * 1024) {
                throw new Error('CSV file is too large (maximum 5 MB).');
            }

            const csv = await this.readFileAsText(file);
            if (!csv.trim()) throw new Error('The selected CSV file is empty.');

            const data = await ApiService.books.importCsv(csv, file.name, this.state.currentUser.full_name);
            if (!data.success) throw new Error(data.message);

            this.showToast(data.message, data.imported > 0 ? 'success' : 'info');
            if (data.errors && data.errors.length) {
                console.warn('[Book Import] Rejected rows:', data.errors);
            }
            this.loadBooks({ resetPage: true });
        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalBtnHtml;
            }
        }
    },

    async deleteBook(bookId) {
        const book = this.state.books.find(b => b.book_id === parseInt(bookId, 10));
        const title = book ? book.title : 'this book';
        if (!confirm(`Are you sure you want to remove "${title}" from the catalog?`)) {
            return;
        }

        try {
            const data = await ApiService.books.delete(bookId, this.state.currentUser.full_name);
            if (!data.success) throw new Error(data.message);

            this.showToast(data.message, 'success');
            this.loadBooks();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async loadMembers() {
        try {
            const search = document.getElementById('members-search-input')?.value || '';
            const status = document.getElementById('members-status-filter')?.value || 'All';
            const type = document.getElementById('members-type-filter')?.value || 'All';

            const data = await ApiService.members.getAll({ search, status, type });
            if (!data.success) throw new Error(data.message);

            this.state.members = data.members || [];
            const tbody = document.getElementById('members-table-body');
            if (tbody) {
                if (this.state.members.length > 0) {
                    tbody.innerHTML = this.state.members.map(m => {
                        const isSuspended = m.status === 'Suspended';
                        const statusClass = isSuspended ? 'badge-danger' : 'badge-success';

                        return `
                            <tr>
                                <td>
                                    <div class="cell-primary cell-truncate" title="${this.escapeHtml(m.full_name)}">${this.escapeHtml(m.full_name)}</div>
                                    <div class="cell-sub" title="${this.escapeHtml(m.member_code)} — ${this.escapeHtml(m.address || 'Campus Resident')}"><span class="cell-code-inline">${this.escapeHtml(m.member_code)}</span> · ${this.escapeHtml(m.address || 'Campus Resident')}</div>
                                </td>
                                <td>
                                    <div class="cell-truncate" title="${this.escapeHtml(m.email)}">${this.escapeHtml(m.email)}</div>
                                    <div class="cell-sub" title="${this.escapeHtml(m.phone)}">${this.escapeHtml(m.phone)}</div>
                                </td>
                                <td><span class="badge badge-neutral badge-fit">${this.escapeHtml(m.membership_type)}</span></td>
                                <td class="cell-nowrap">${m.membership_date}</td>
                                <td class="cell-nowrap">
                                    <strong>${m.currently_borrowed}</strong> <span class="cell-muted">/ ${m.max_borrow_limit}</span>
                                    ${m.pending_fines > 0 ? `<div class="cell-sub" style="color:var(--danger-600); font-weight:600;">Fine: ₹${m.pending_fines}</div>` : ''}
                                </td>
                                <td>
                                    <span class="badge ${statusClass}">
                                        <span class="badge-dot"></span>
                                        ${m.status}
                                    </span>
                                </td>
                                <td>
                                    <div class="table-actions">
                                        <button class="btn btn-sm btn-outline" onclick="App.openEditMemberModal(${m.member_id})">Edit</button>
                                        <button class="btn btn-sm btn-outline" style="color:var(--danger-600);" onclick="App.deleteMember(${m.member_id})">Delete</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No members found.</td></tr>`;
                }
            }
        } catch (err) {
            console.error('Failed to load members:', err);
            this.showToast('Error loading members directory: ' + err.message, 'error');
        }
    },

    openEditMemberModal(memberId) {
        const member = this.state.members.find(m => m.member_id === parseInt(memberId, 10));
        if (!member) return;

        document.getElementById('member-form-id').value = member.member_id;
        document.getElementById('member-name').value = member.full_name;
        document.getElementById('member-email').value = member.email;
        document.getElementById('member-phone').value = member.phone;
        document.getElementById('member-address').value = member.address || '';
        document.getElementById('member-type').value = member.membership_type;

        document.getElementById('group-member-status').style.display = 'block';
        document.getElementById('member-status').value = member.status;

        document.getElementById('modal-member-title').textContent = `Edit Member Profile: ${member.full_name}`;
        this.openModal('modal-member');
    },

    async handleSaveMember(e) {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Saving...</span>';
        }

        const memberId = document.getElementById('member-form-id').value;
        const payload = {
            full_name: document.getElementById('member-name').value.trim(),
            email: document.getElementById('member-email').value.trim(),
            phone: document.getElementById('member-phone').value.trim(),
            address: document.getElementById('member-address').value.trim(),
            membership_type: document.getElementById('member-type').value,
            status: document.getElementById('member-status')?.value || 'Active',
            staff_name: this.state.currentUser.full_name
        };

        try {
            const data = memberId 
                ? await ApiService.members.update(memberId, payload)
                : await ApiService.members.create(payload);

            if (!data.success) throw new Error(data.message);

            this.showToast(data.message, 'success');
            this.closeModal('modal-member');
            this.loadMembers();
        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        }
    },

    async deleteMember(memberId) {
        const member = this.state.members.find(m => m.member_id === parseInt(memberId, 10));
        const name = member ? member.full_name : 'this member';
        if (!confirm(`Are you sure you want to delete member profile for "${name}"?`)) {
            return;
        }

        try {
            const data = await ApiService.members.delete(memberId, this.state.currentUser.full_name);
            if (!data.success) throw new Error(data.message);

            this.showToast(data.message, 'success');
            this.loadMembers();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async prepareIssueDesk() {
        try {
            document.getElementById('issue-success-slip').style.display = 'none';

            const [booksData, membersData] = await Promise.all([
                ApiService.books.getAll({ availability: 'all', sortBy: 'title', sortOrder: 'ASC', page: 1, limit: 300 }),
                ApiService.members.getAll({ status: 'All' })
            ]);

            this.state.books = booksData.books || [];
            this.state.bookMatchCount = booksData.count || this.state.books.length;
            this.state.members = membersData.members || [];

            this.resetIssueBookPicker();
            this.setupIssueBookPicker();

            const memberSelect = document.getElementById('issue-member-select');
            if (memberSelect) {
                memberSelect.innerHTML = `<option value="">-- Choose registered student / faculty --</option>` +
                    this.state.members.map(m => {
                        const statusNote = m.status !== 'Active' ? `[${m.status.toUpperCase()}]` : `(${m.currently_borrowed}/${m.max_borrow_limit} borrowed)`;
                        return `<option value="${m.member_id}">${this.escapeHtml(m.full_name)} - ${m.member_code} ${statusNote}</option>`;
                    }).join('');

                memberSelect.onchange = () => {
                    const memberId = parseInt(memberSelect.value, 10);
                    const member = this.state.members.find(m => m.member_id === memberId);
                    const hint = document.getElementById('issue-member-hint');
                    if (member && hint) {
                        if (member.status !== 'Active') {
                            hint.innerHTML = `<span style="color:var(--danger-600); font-weight:600;">⚠ Account Suspended:</span> Member cannot borrow books until cleared.`;
                        } else if (member.currently_borrowed >= member.max_borrow_limit) {
                            hint.innerHTML = `<span style="color:var(--danger-600); font-weight:600;">⚠ Quota Reached:</span> Already has ${member.currently_borrowed} books (Max: ${member.max_borrow_limit}).`;
                        } else {
                            hint.innerHTML = `<span style="color:var(--accent-600); font-weight:600;">✓ Eligible:</span> ${member.membership_type} cardholder. Active loans: ${member.currently_borrowed}/${member.max_borrow_limit}.`;
                        }
                    } else if (hint) {
                        hint.textContent = '';
                    }
                };
            }

        } catch (err) {
            console.error('Error preparing issue desk:', err);
            this.showToast('Failed to load issue desk data: ' + err.message, 'error');
        }
    },

    setupIssueBookPicker() {
        const picker = document.getElementById('issue-book-picker');
        const trigger = document.getElementById('issue-book-trigger');
        const bookSearch = document.getElementById('issue-book-search');

        if (trigger) {
            trigger.onclick = () => this.toggleIssueBookPanel();
        }

        if (!this._issuePickerOutsideHandler) {
            this._issuePickerOutsideHandler = (e) => {
                const pickerEl = document.getElementById('issue-book-picker');
                const inPicker = pickerEl && pickerEl.contains(e.target);
                const inSearch = e.target && e.target.id === 'issue-book-search';
                if (!inPicker && !inSearch) this.closeIssueBookPanel();
            };
            document.addEventListener('click', this._issuePickerOutsideHandler);
        }

        if (!this._issuePickerKeyHandler) {
            this._issuePickerKeyHandler = (e) => {
                if (e.key === 'Escape') this.closeIssueBookPanel();
            };
            document.addEventListener('keydown', this._issuePickerKeyHandler);
        }

        this.renderIssueBookOptions();

        if (bookSearch) {
            bookSearch.value = '';
            bookSearch.oninput = this.debounce(async () => {
                const term = bookSearch.value.trim();
                try {
                    const results = await ApiService.books.getAll({
                        search: term,
                        availability: 'all',
                        sortBy: 'title',
                        sortOrder: 'ASC',
                        page: 1,
                        limit: 300
                    });
                    this.state.books = results.books || [];
                    this.state.bookMatchCount = results.count || this.state.books.length;
                    this.renderIssueBookOptions();
                    this.openIssueBookPanel();
                    document.getElementById('issue-book-stock-hint').textContent = '';
                } catch (err) {
                    this.showToast('Failed to search books: ' + err.message, 'error');
                }
            }, 300);

            bookSearch.onfocus = () => this.openIssueBookPanel();
        }
    },

    renderIssueBookOptions() {
        const list = document.getElementById('issue-book-list');
        const resultHint = document.getElementById('issue-book-result-hint');
        if (!list) return;

        if (!this.state.books.length) {
            list.innerHTML = `<div class="book-picker-empty">No titles match your search.</div>`;
            if (resultHint) resultHint.textContent = '';
            return;
        }

        if (resultHint) {
            const shown = this.state.books.length;
            const total = this.state.bookMatchCount || shown;
            if (total > shown) {
                resultHint.textContent = `Showing ${shown} of ${total.toLocaleString()} matching titles — type more to narrow the list.`;
            } else {
                resultHint.textContent = `Showing all ${shown.toLocaleString()} matching titles.`;
            }
        }

        const selectedId = document.getElementById('issue-book-id')?.value || '';

        list.innerHTML = this.state.books.map(b => {
            const isAvailable = b.available_copies > 0;
            const badgeClass = isAvailable ? 'badge-success' : 'badge-danger';
            const badgeLabel = isAvailable ? `${b.available_copies} available` : 'Out of stock';

            return `
                <button type="button"
                        class="book-picker-option${String(b.book_id) === selectedId ? ' is-selected' : ''}"
                        role="option"
                        aria-selected="${String(b.book_id) === selectedId}"
                        onclick="App.selectIssueBook(${b.book_id})">
                    <span class="book-picker-main">
                        <span class="book-picker-title">${this.escapeHtml(b.title)}</span>
                        <span class="book-picker-meta">${this.escapeHtml(b.author || 'Unknown Author')} · ${b.publication_year || '—'} · ${this.escapeHtml(b.isbn)}</span>
                    </span>
                    <span class="book-picker-side">
                        <span class="badge ${badgeClass}"><span class="badge-dot"></span>${badgeLabel}</span>
                        <span class="book-picker-shelf">${this.escapeHtml(b.shelf_location || 'General')}</span>
                    </span>
                </button>
            `;
        }).join('');
    },

    selectIssueBook(bookId) {
        const book = this.state.books.find(b => b.book_id === bookId);
        if (!book) return;

        const hidden = document.getElementById('issue-book-id');
        const trigger = document.getElementById('issue-book-trigger');
        const triggerText = document.getElementById('issue-book-trigger-text');
        if (hidden) hidden.value = String(bookId);

        if (trigger && triggerText) {
            triggerText.textContent = book.title;
            trigger.classList.remove('is-placeholder');
            trigger.title = book.title;
        }

        this.renderIssueBookOptions();
        this.closeIssueBookPanel();

        const hint = document.getElementById('issue-book-stock-hint');
        if (hint) {
            if (book.available_copies > 0) {
                hint.innerHTML = `<span style="color:var(--accent-600); font-weight:600;">✓ In Stock:</span> ${book.available_copies} of ${book.total_copies} copies ready on <strong>${this.escapeHtml(book.shelf_location || 'General')}</strong>.`;
            } else {
                hint.innerHTML = `<span style="color:var(--danger-600); font-weight:600;">⚠ Out of Stock:</span> All ${book.total_copies} copies currently issued. Cannot issue.`;
            }
        }
    },

    resetIssueBookPicker() {
        const hidden = document.getElementById('issue-book-id');
        const trigger = document.getElementById('issue-book-trigger');
        const triggerText = document.getElementById('issue-book-trigger-text');
        if (hidden) hidden.value = '';
        if (trigger && triggerText) {
            triggerText.textContent = '-- Choose a title from catalog --';
            trigger.classList.add('is-placeholder');
            trigger.removeAttribute('title');
        }
        this.closeIssueBookPanel();
    },

    openIssueBookPanel() {
        const picker = document.getElementById('issue-book-picker');
        const trigger = document.getElementById('issue-book-trigger');
        if (!picker) return;
        picker.classList.add('open');
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
    },

    closeIssueBookPanel() {
        const picker = document.getElementById('issue-book-picker');
        const trigger = document.getElementById('issue-book-trigger');
        if (!picker) return;
        picker.classList.remove('open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
    },

    toggleIssueBookPanel() {
        const picker = document.getElementById('issue-book-picker');
        if (!picker) return;
        if (picker.classList.contains('open')) {
            this.closeIssueBookPanel();
        } else {
            this.openIssueBookPanel();
        }
    },

    async handleIssueBook(e) {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';

        const bookId = document.getElementById('issue-book-id').value;
        const memberId = document.getElementById('issue-member-select').value;
        const loanDays = document.getElementById('issue-days-select').value;
        const remarks = document.getElementById('issue-remarks-input').value.trim();

        if (!bookId || !memberId) {
            this.showToast('Please select both a book and a member.', 'error');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Issuing...</span>';
        }

        try {
            const data = await ApiService.loans.issue({
                book_id: parseInt(bookId, 10),
                member_id: parseInt(memberId, 10),
                loan_days: parseInt(loanDays, 10),
                staff_id: this.state.currentUser.staff_id,
                staff_name: this.state.currentUser.full_name,
                remarks
            });

            if (!data.success) throw new Error(data.message);

            this.showToast(data.message, 'success');

            this.resetIssueBookPicker();

            const slip = document.getElementById('issue-success-slip');
            const content = document.getElementById('slip-content');
            if (slip && content && data.loan) {
                content.innerHTML = `
                    <div><strong>Transaction ID:</strong> LOAN-#${data.loan.loan_id}</div>
                    <div><strong>Date of Issue:</strong> ${data.loan.issue_date}</div>
                    <div><strong>Due Date:</strong> <span style="font-weight:700; color:#1e3a8a;">${data.loan.due_date}</span></div>
                    <div><strong>Borrower Name:</strong> ${this.escapeHtml(data.loan.member_name)}</div>
                    <div><strong>Book Title:</strong> ${this.escapeHtml(data.loan.book_title)}</div>
                    <div><strong>Authorized By:</strong> ${this.escapeHtml(this.state.currentUser.full_name)} (${this.state.currentUser.role})</div>
                    <div style="margin-top:6px; font-size:0.75rem; color:#475569;">* Please return or renew on or before due date to avoid ₹5.00/day late fine.</div>
                `;
                slip.style.display = 'block';
            }

            this.prepareIssueDesk();

        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        }
    },

    async loadReturnDesk() {
        try {
            const search = document.getElementById('return-search-input')?.value || '';
            const data = await ApiService.loans.getAll({ status: 'all', search });
            if (!data.success) throw new Error(data.message);

            const activeLoans = (data.loans || []).filter(l => l.return_date === null);
            const badge = document.getElementById('active-loans-count-badge');
            if (badge) badge.textContent = `${activeLoans.length} Active Loans`;

            const tbody = document.getElementById('return-loans-table-body');
            if (tbody) {
                if (activeLoans.length > 0) {
                    tbody.innerHTML = activeLoans.map(loan => {
                        const isOverdue = loan.status === 'Overdue';
                        const badgeClass = isOverdue ? 'badge-danger' : 'badge-primary';
                        const fineText = isOverdue ? `<div style="font-size:0.75rem; color:var(--danger-600); font-weight:700;">Fine: ₹${parseFloat(loan.fine_amount || 0).toFixed(2)}</div>` : '';

                        return `
                            <tr>
                                <td><strong>#${loan.loan_id}</strong></td>
                                <td>
                                    <strong>${this.escapeHtml(loan.book_title)}</strong>
                                    <div style="font-size:0.78rem; color:var(--text-muted);">${this.escapeHtml(loan.isbn)}</div>
                                </td>
                                <td>
                                    <strong>${this.escapeHtml(loan.member_name)}</strong>
                                    <div style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHtml(loan.member_code)} (${this.escapeHtml(loan.member_phone || 'N/A')})</div>
                                </td>
                                <td>${loan.issue_date}</td>
                                <td><strong>${loan.due_date}</strong></td>
                                <td>
                                    <span class="badge ${badgeClass}">
                                        <span class="badge-dot"></span>
                                        ${loan.status}
                                    </span>
                                    ${fineText}
                                </td>
                                <td>
                                    <div style="display:flex; gap:0.4rem;">
                                        <button class="btn btn-sm btn-success" onclick="App.openReturnModal(${loan.loan_id})">
                                            Return Book
                                        </button>
                                        <button class="btn btn-sm btn-outline" onclick="App.renewLoan(${loan.loan_id})">
                                            Renew
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No active loans found matching search.</td></tr>`;
                }
            }
        } catch (err) {
            console.error('Error loading return desk:', err);
            this.showToast('Failed to load active loans: ' + err.message, 'error');
        }
    },

    async openReturnModal(loanId) {
        try {
            let loan = null;
            try {
                const res = await ApiService.loans.getById(loanId);
                if (res && res.success && res.loan) {
                    loan = res.loan;
                }
            } catch (fetchErr) {
                const data = await ApiService.loans.getAll({ status: 'all' });
                loan = (data.loans || []).find(l => l.loan_id === parseInt(loanId, 10));
            }

            if (!loan) throw new Error('Loan record not found');

            document.getElementById('return-loan-id').value = loan.loan_id;
            const summary = document.getElementById('return-loan-summary');
            if (summary) {
                summary.innerHTML = `
                    <div><strong>Book:</strong> ${this.escapeHtml(loan.book_title)} (${this.escapeHtml(loan.isbn)})</div>
                    <div><strong>Borrower:</strong> ${this.escapeHtml(loan.member_name)} (${this.escapeHtml(loan.member_code)})</div>
                    <div><strong>Issued on:</strong> ${loan.issue_date} &bull; <strong>Due on:</strong> ${loan.due_date}</div>
                `;
            }

            const today = new Date().toISOString().split('T')[0];
            const fineAlert = document.getElementById('return-fine-alert');
            const fineText = document.getElementById('return-fine-text');

            if (today > loan.due_date) {
                const diffTime = Math.abs(new Date(today) - new Date(loan.due_date));
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const fine = diffDays * 5.00;
                if (fineText) fineText.textContent = `Overdue Notice: ${diffDays} day(s) late. Late Fine Due: ₹${fine.toFixed(2)}`;
                if (fineAlert) fineAlert.style.display = 'block';
            } else {
                if (fineAlert) fineAlert.style.display = 'none';
            }

            document.getElementById('return-remarks').value = 'Returned in good condition';
            this.openModal('modal-return');
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async handleConfirmReturn(e) {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Processing...</span>';
        }

        const loanId = document.getElementById('return-loan-id').value;
        const finePaid = document.getElementById('return-fine-paid-checkbox').checked ? 1 : 0;
        const remarks = document.getElementById('return-remarks').value.trim();

        try {
            const data = await ApiService.loans.return(loanId, {
                fine_paid: finePaid,
                remarks,
                staff_name: this.state.currentUser.full_name
            });

            if (!data.success) throw new Error(data.message);

            this.showToast(data.message, 'success');
            this.closeModal('modal-return');

            if (this.state.currentView === 'return') this.loadReturnDesk();
            if (this.state.currentView === 'dashboard') this.loadDashboard();
            if (this.state.currentView === 'overdue') this.loadOverdueList();
        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        }
    },

    async renewLoan(loanId) {
        if (!confirm('Extend due date of this book by 14 days?')) return;

        try {
            const data = await ApiService.loans.renew(loanId, 14);
            if (!data.success) throw new Error(data.message);

            this.showToast(data.message, 'success');
            this.loadReturnDesk();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async loadOverdueList() {
        try {
            const data = await ApiService.reports.getOverdue();
            if (!data.success) throw new Error(data.message);

            const countEl = document.getElementById('overdue-total-count');
            if (countEl) countEl.textContent = data.summary?.count || 0;

            const finesEl = document.getElementById('overdue-total-fines');
            if (finesEl) finesEl.textContent = `₹${parseFloat(data.summary?.total_fines || 0).toFixed(2)}`;

            const tbody = document.getElementById('overdue-table-body');
            if (tbody) {
                if (data.overdueList && data.overdueList.length > 0) {
                    tbody.innerHTML = data.overdueList.map(loan => `
                        <tr>
                            <td><strong>#${loan.loan_id}</strong></td>
                            <td>
                                <strong>${this.escapeHtml(loan.member_name)}</strong>
                                <div style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHtml(loan.member_phone)} &bull; ${this.escapeHtml(loan.member_email)}</div>
                            </td>
                            <td>
                                <strong>${this.escapeHtml(loan.book_title)}</strong>
                                <div style="font-size:0.75rem; color:var(--text-muted);">${loan.isbn} (${loan.shelf_location || 'General'})</div>
                            </td>
                            <td>${loan.due_date}</td>
                            <td>
                                <span class="badge badge-danger">
                                    <span class="badge-dot"></span>
                                    ${loan.days_overdue} days late
                                </span>
                            </td>
                            <td>
                                <strong style="color:var(--danger-600); font-size:0.95rem;">₹${parseFloat(loan.fine_amount || 0).toFixed(2)}</strong>
                                <div style="font-size:0.7rem; color:var(--text-muted);">@ ₹5/day</div>
                            </td>
                            <td>
                                <div style="display:flex; gap:0.4rem;">
                                    <button class="btn btn-sm btn-outline" onclick="App.sendOverdueReminder(${loan.loan_id})">
                                        Send Notice
                                    </button>
                                    <button class="btn btn-sm btn-success" onclick="App.openReturnModal(${loan.loan_id})">
                                        Collect & Return
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('');
                } else {
                    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Excellent! No overdue books currently in circulation.</td></tr>`;
                }
            }
        } catch (err) {
            console.error('Failed to load overdue books:', err);
            this.showToast('Error loading overdue list: ' + err.message, 'error');
        }
    },

    async sendOverdueReminder(loanId) {
        try {
            const data = await ApiService.loans.sendReminder(loanId);
            if (!data.success) throw new Error(data.message);

            this.showToast(data.message, 'success');
            this.loadOverdueList();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async loadTransactions() {
        try {
            const search = document.getElementById('transactions-search-input')?.value || '';
            const status = document.getElementById('transactions-status-filter')?.value || 'All';

            const data = await ApiService.loans.getAll({ status, search });
            if (!data.success) throw new Error(data.message);

            const tbody = document.getElementById('transactions-table-body');
            if (tbody) {
                if (data.loans && data.loans.length > 0) {
                    tbody.innerHTML = data.loans.map(l => {
                        const statusClass = l.status === 'Returned' ? 'badge-success' : (l.status === 'Overdue' ? 'badge-danger' : 'badge-primary');
                        const fineBadge = l.fine_amount > 0 
                            ? (l.fine_paid ? `<span class="badge badge-success">₹${l.fine_amount} Paid</span>` : `<span class="badge badge-danger">₹${l.fine_amount} Unpaid</span>`)
                            : `<span class="badge badge-neutral">No Fine</span>`;

                        return `
                            <tr>
                                <td><strong>#${l.loan_id}</strong></td>
                                <td>
                                    <strong>${this.escapeHtml(l.book_title)}</strong>
                                    <div style="font-size:0.75rem; color:var(--text-muted);">${l.isbn}</div>
                                </td>
                                <td>
                                    <strong>${this.escapeHtml(l.member_name)}</strong>
                                    <div style="font-size:0.75rem; color:var(--text-muted);">${l.member_code}</div>
                                </td>
                                <td>${l.issue_date}</td>
                                <td>${l.due_date}</td>
                                <td>${l.return_date ? `<strong>${l.return_date}</strong>` : '<span style="color:var(--text-muted);">Active</span>'}</td>
                                <td>${fineBadge}</td>
                                <td>
                                    <span class="badge ${statusClass}">
                                        <span class="badge-dot"></span>
                                        ${l.status}
                                    </span>
                                </td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No transactions recorded.</td></tr>`;
                }
            }
        } catch (err) {
            console.error('Failed to load transactions:', err);
            this.showToast('Error loading transaction history: ' + err.message, 'error');
        }
    },

    async loadReports() {
        try {
            const data = await ApiService.reports.getAnalytics();
            if (!data.success) throw new Error(data.message);

            const popularTbody = document.getElementById('reports-popular-books');
            if (popularTbody) {
                if (data.popularBooks && data.popularBooks.length > 0) {
                    popularTbody.innerHTML = data.popularBooks.map(b => `
                        <tr>
                            <td>
                                <strong>${this.escapeHtml(b.title)}</strong>
                                <div style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHtml(b.author)} (${b.isbn})</div>
                            </td>
                            <td><span class="badge badge-neutral">${this.escapeHtml(b.genre)}</span></td>
                            <td><strong style="color:var(--primary-700); font-size:0.95rem;">${b.times_borrowed}</strong> times</td>
                        </tr>
                    `).join('');
                } else {
                    popularTbody.innerHTML = `<tr><td colspan="3" class="empty-state">No borrow history yet.</td></tr>`;
                }
            }

            const borrowersTbody = document.getElementById('reports-top-borrowers');
            if (borrowersTbody) {
                if (data.topBorrowers && data.topBorrowers.length > 0) {
                    borrowersTbody.innerHTML = data.topBorrowers.map(m => `
                        <tr>
                            <td><strong>${this.escapeHtml(m.member_code)}</strong></td>
                            <td>${this.escapeHtml(m.full_name)}</td>
                            <td><span class="badge badge-neutral">${m.membership_type}</span></td>
                            <td><strong style="color:var(--accent-700);">${m.total_borrowed}</strong> books</td>
                        </tr>
                    `).join('');
                } else {
                    borrowersTbody.innerHTML = `<tr><td colspan="4" class="empty-state">No borrowers yet.</td></tr>`;
                }
            }

            const inv = data.inventory || {};
            const setVal = (id, v) => {
                const el = document.getElementById(id);
                if (el) el.textContent = v;
            };
            setVal('report-inv-titles', inv.total_titles || 0);
            setVal('report-inv-volumes', inv.total_volumes || 0);
            setVal('report-inv-circ', inv.circulating_volumes || 0);
            setVal('report-fines-collected', `₹${parseFloat(data.fines?.fines_collected || 0).toFixed(2)}`);

        } catch (err) {
            console.error('Failed to load reports:', err);
            this.showToast('Error generating reports: ' + err.message, 'error');
        }
    },

    exportCsvReport() {
        const url = ApiService.reports.getExportUrl();
        window.open(url, '_blank');
    },

    async handleLogin(e) {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';

        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        if (!username || !password) {
            this.showToast('Please enter both username and password.', 'error');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Verifying...</span>';
        }

        try {
            const data = await ApiService.auth.login(username, password);
            if (!data.success) throw new Error(data.message);

            this.setCurrentUser(data.user);
            this.showToast(data.message, 'success');
            this.closeModal('modal-auth');
            this.resetForm('form-staff-login');

            this.navigate(this.state.currentView);
        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        }
    },

    async handleLogout() {
        try {
            const data = await ApiService.auth.logout();
            if (typeof localStorage !== 'undefined') {
                try { localStorage.removeItem('campuslib_user'); } catch(e){}
            }
            this.closeModal('modal-auth');
            this.showLoginGate();
            this.showToast(data.message || 'Logged out successfully', 'info');
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async loadStaffList() {
        try {
            const data = await ApiService.system.getStaff();
            if (data.success && data.staff) {
                const listElem = document.getElementById('staff-accounts-list');
                if (listElem) {
                    listElem.innerHTML = data.staff.map(s => `
                        <div style="border:1px solid var(--border-subtle); padding:10px; border-radius:6px; display:flex; align-items:center; justify-content:space-between;">
                            <div>
                                <strong>${this.escapeHtml(s.full_name)}</strong>
                                <div style="font-size:0.75rem; color:var(--text-muted);">${s.staff_code} &bull; ${s.role}</div>
                            </div>
                            <button class="btn btn-sm ${this.state.currentUser.staff_id === s.staff_id ? 'btn-primary' : 'btn-outline'}" onclick="App.quickSwitchStaff('${s.email}', 'admin123')">
                                ${this.state.currentUser.staff_id === s.staff_id ? 'Active' : 'Switch'}
                            </button>
                        </div>
                    `).join('');
                }
            }
        } catch (err) {
            console.warn('[StaffList] Could not load staff list:', err.message);
        }
    },

    async quickSwitchStaff(email, password) {
        try {
            const pass = email.includes('admin') ? 'admin123' : 'lib123';
            const data = await ApiService.auth.login(email, pass);
            if (data.success) {
                this.setCurrentUser(data.user);
                this.showToast(`Switched active profile to ${data.user.full_name} (${data.user.role})`, 'success');
                this.closeModal('modal-auth');
                this.loadStaffList();
            }
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    demoScenario(scenario) {
        this.closeModal('modal-viva');
        switch (scenario) {
            case 'stock_check':
                this.navigate('issue');
                this.showToast('Demonstration: Trying to issue an Out-of-Stock book...', 'info');
                setTimeout(async () => {
                    try {
                        let book = this.state.books.find(b => b.available_copies === 0);
                        if (!book) {
                            const res = await ApiService.books.getAll({ availability: 'unavailable', page: 1, limit: 1 });
                            book = (res.books || [])[0];
                            if (book) this.state.books = [book, ...this.state.books];
                        }
                        if (book) {
                            this.renderIssueBookOptions();
                            this.selectIssueBook(book.book_id);
                            this.showToast('Note how the system detects available_copies = 0 and blocks the transaction!', 'warning');
                        }
                    } catch (err) {
                        console.warn('[Demo] Could not load an out-of-stock title:', err.message);
                    }
                }, 800);
                break;

            case 'fine_calc':
                this.navigate('overdue');
                this.showToast('Inspecting Overdue Loans: Fine is automatically calculated at ₹5.00/day!', 'info');
                break;

            case 'suspended_member':
                this.navigate('issue');
                this.showToast('Demonstration: Verifying that suspended members cannot borrow books...', 'info');
                setTimeout(() => {
                    const memberSelect = document.getElementById('issue-member-select');
                    if (memberSelect) {
                        for (let i = 0; i < memberSelect.options.length; i++) {
                            if (memberSelect.options[i].text.includes('Priya Kapoor') || memberSelect.options[i].text.includes('SUSPENDED')) {
                                memberSelect.selectedIndex = i;
                                memberSelect.dispatchEvent(new Event('change'));
                                this.showToast('System blocks loan eligibility for suspended cardholder!', 'warning');
                                break;
                            }
                        }
                    }
                }, 500);
                break;
        }
    },

    async resetDemoData() {
        if (!confirm('Reset all library records back to clean initial demo data?')) return;

        try {
            const data = await ApiService.system.resetDemoData();
            if (!data.success) throw new Error(data.message);

            this.showToast(data.message, 'success');
            this.closeModal('modal-viva');
            this.navigate('dashboard');
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('active');
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
    },

    resetForm(formId) {
        const form = document.getElementById(formId);
        if (form) form.reset();
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const iconSvg = type === 'success' 
            ? `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" style="width:18px;height:18px;color:var(--accent-600);"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>`
            : (type === 'error' 
                ? `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" style="width:18px;height:18px;color:var(--danger-600);"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`
                : `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" style="width:18px;height:18px;color:var(--primary-600);"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`);

        toast.innerHTML = `
            ${iconSvg}
            <span style="flex:1;">${this.escapeHtml(message)}</span>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    escapeJs(str) {
        if (!str) return '';
        return String(str)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '&quot;')
            .replace(/\r?\n/g, ' ');
    }
};

window.addEventListener('DOMContentLoaded', () => {
    App.init();
});
