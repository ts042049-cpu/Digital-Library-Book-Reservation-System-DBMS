/**
 * ====================================================================
 * CampusLib LMS — Full-Stack Frontend Application
 * Fully integrated with Node.js + Express backend via ApiService
 * ====================================================================
 */

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
        members: [],
        loans: [],
        overdueCount: 0,
        isLoading: false
    },

    /**
     * Initialize Application on DOM Ready
     */
    async init() {
        this.setupNavigation();
        this.setupEventListeners();
        this.updateDateDisplay();

        // 1. Check current authenticated session via GET /api/auth/me
        await this.checkCurrentSession();

        // 2. Load initial dashboard data
        this.navigate('dashboard');

        // 3. Load staff accounts for role switcher / profile demo
        this.loadStaffList();
    },

    /**
     * Verify Session Authentication with Backend
     */
    async checkCurrentSession() {
        try {
            const data = await ApiService.auth.me();
            if (data && data.user) {
                this.setCurrentUser(data.user);
            }
        } catch (err) {
            console.warn('[Session] Session check fallback:', err.message);
        }
    },

    setCurrentUser(user) {
        if (!user) return;
        this.state.currentUser = user;

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

    /**
     * Date display in top navigation
     */
    updateDateDisplay() {
        const now = new Date();
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        const dateStr = now.toLocaleDateString('en-US', options);
        const dateElem = document.getElementById('current-date-display');
        if (dateElem) dateElem.textContent = dateStr;

        const issueDateInput = document.getElementById('issue-date-input');
        if (issueDateInput) issueDateInput.value = now.toISOString().split('T')[0];
    },

    /**
     * Setup sidebar navigation and router
     */
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

        // Mobile drawer toggle
        const mobileToggle = document.getElementById('mobile-toggle');
        if (mobileToggle) {
            mobileToggle.addEventListener('click', () => {
                document.getElementById('sidebar').classList.toggle('open');
            });
        }

        // Global search handler
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
                            this.loadBooks();
                        }
                    }
                }
            });
        }
    },

    /**
     * View Router
     */
    navigate(viewName) {
        this.state.currentView = viewName;

        // Toggle active button in sidebar
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
            if (btn.getAttribute('data-view') === viewName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Toggle views
        document.querySelectorAll('.page-view').forEach(view => {
            view.style.display = 'none';
        });

        const targetView = document.getElementById(`view-${viewName}`);
        if (targetView) {
            targetView.style.display = 'block';
        }

        // Trigger appropriate data loader for active view
        switch (viewName) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'books':
                this.loadBooks();
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
                // Static DBMS specifications view
                break;
            case 'terms':
                // Static terms & policies view
                break;
        }
    },

    /**
     * Event Listeners Registration
     */
    setupEventListeners() {
        // Books view filters
        const booksSearch = document.getElementById('books-search-input');
        if (booksSearch) booksSearch.addEventListener('input', this.debounce(() => this.loadBooks(), 300));
        const genreFilter = document.getElementById('books-genre-filter');
        if (genreFilter) genreFilter.addEventListener('change', () => this.loadBooks());
        const availFilter = document.getElementById('books-avail-filter');
        if (availFilter) availFilter.addEventListener('change', () => this.loadBooks());
        const sortFilter = document.getElementById('books-sort-filter');
        if (sortFilter) sortFilter.addEventListener('change', () => this.loadBooks());

        // Add Book Modal trigger
        const btnAddBook = document.getElementById('btn-add-book');
        if (btnAddBook) {
            btnAddBook.addEventListener('click', () => {
                this.resetForm('form-book');
                document.getElementById('book-form-id').value = '';
                document.getElementById('modal-book-title').textContent = 'Add New Book to Catalog';
                this.openModal('modal-book');
            });
        }

        // Book Form Submission
        const formBook = document.getElementById('form-book');
        if (formBook) {
            formBook.addEventListener('submit', (e) => this.handleSaveBook(e));
        }

        // Members view filters
        const membersSearch = document.getElementById('members-search-input');
        if (membersSearch) membersSearch.addEventListener('input', this.debounce(() => this.loadMembers(), 300));
        const memberStatusFilter = document.getElementById('members-status-filter');
        if (memberStatusFilter) memberStatusFilter.addEventListener('change', () => this.loadMembers());
        const memberTypeFilter = document.getElementById('members-type-filter');
        if (memberTypeFilter) memberTypeFilter.addEventListener('change', () => this.loadMembers());

        // Register Member Modal trigger
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

        // Member Form Submission
        const formMember = document.getElementById('form-member');
        if (formMember) {
            formMember.addEventListener('submit', (e) => this.handleSaveMember(e));
        }

        // Issue Desk Form Submission
        const formIssue = document.getElementById('form-issue-book');
        if (formIssue) {
            formIssue.addEventListener('submit', (e) => this.handleIssueBook(e));
        }

        // Return Search
        const returnSearch = document.getElementById('return-search-input');
        if (returnSearch) {
            returnSearch.addEventListener('input', this.debounce(() => this.loadReturnDesk(), 300));
        }

        // Process Return Form Submission
        const formReturn = document.getElementById('form-process-return');
        if (formReturn) {
            formReturn.addEventListener('submit', (e) => this.handleConfirmReturn(e));
        }

        // Transactions filters
        const transSearch = document.getElementById('transactions-search-input');
        if (transSearch) transSearch.addEventListener('input', this.debounce(() => this.loadTransactions(), 300));
        const transStatus = document.getElementById('transactions-status-filter');
        if (transStatus) transStatus.addEventListener('change', () => this.loadTransactions());

        // Staff Login Form Submission
        const formLogin = document.getElementById('form-staff-login');
        if (formLogin) {
            formLogin.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Viva modal triggers
        const btnViva = document.getElementById('btn-viva-modal');
        if (btnViva) {
            btnViva.addEventListener('click', () => this.openModal('modal-viva'));
        }

        const btnAuth = document.getElementById('btn-open-auth');
        if (btnAuth) {
            btnAuth.addEventListener('click', () => this.openModal('modal-auth'));
        }

        // Close modal on backdrop click
        document.querySelectorAll('.modal-backdrop').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-backdrop.active').forEach(modal => {
                    modal.classList.remove('active');
                });
            }
        });
    },

    // ====================================================================
    // 1. DASHBOARD CONTROLLER (GET /api/reports/dashboard)
    // ====================================================================
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

            // Update Overdue badge in sidebar
            this.state.overdueCount = stats.overdueLoans || 0;
            const badge = document.getElementById('sidebar-overdue-badge');
            if (badge) {
                badge.textContent = stats.overdueLoans || 0;
                badge.style.display = (stats.overdueLoans > 0) ? 'inline-block' : 'none';
            }

            // Render Recently Issued Books Table
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

            // Render Alerts Table (Due soon or Overdue)
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

            // Render Activity Feed
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

            // Render Genre Distribution
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

    // ====================================================================
    // 2. BOOK CATALOG CONTROLLER (GET /api/books)
    // ====================================================================
    async loadBooks() {
        try {
            const search = document.getElementById('books-search-input')?.value || '';
            const genre = document.getElementById('books-genre-filter')?.value || 'All';
            const availability = document.getElementById('books-avail-filter')?.value || 'all';
            const sortVal = document.getElementById('books-sort-filter')?.value || 'title:ASC';
            const [sortBy, sortOrder] = sortVal.split(':');

            const data = await ApiService.books.getAll({ search, genre, availability, sortBy, sortOrder });
            if (!data.success) throw new Error(data.message);

            this.state.books = data.books || [];

            // Populate genres in dropdown
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
                                <td><code style="font-size:0.8rem; background:var(--bg-subtle); padding:2px 5px; border-radius:4px;">${this.escapeHtml(b.isbn)}</code></td>
                                <td>
                                    <strong>${this.escapeHtml(b.title)}</strong>
                                    <div style="font-size:0.78rem; color:var(--text-muted);">${this.escapeHtml(b.author)}</div>
                                </td>
                                <td><span class="badge badge-neutral">${this.escapeHtml(b.genre)}</span></td>
                                <td>${this.escapeHtml(b.publisher || 'N/A')} (${b.publication_year || '—'})</td>
                                <td><span style="font-size:0.8rem; font-weight:500;">${this.escapeHtml(b.shelf_location || 'General')}</span></td>
                                <td>
                                    <strong>${b.available_copies}</strong> / ${b.total_copies}
                                </td>
                                <td>
                                    <span class="badge ${badgeClass}">
                                        <span class="badge-dot"></span>
                                        ${badgeLabel}
                                    </span>
                                </td>
                                <td>
                                    <div style="display:flex; gap:0.4rem;">
                                        <button class="btn btn-sm btn-outline" onclick="App.openEditBookModal(${b.book_id})">Edit</button>
                                        <button class="btn btn-sm btn-outline" style="color:var(--danger-600);" onclick="App.deleteBook(${b.book_id})">Delete</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No books found matching search criteria.</td></tr>`;
                }
            }
        } catch (err) {
            console.error('Failed to load books:', err);
            this.showToast('Error loading books catalog: ' + err.message, 'error');
        }
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

    // ====================================================================
    // 3. MEMBERS DIRECTORY CONTROLLER (GET /api/members)
    // ====================================================================
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
                                <td><strong style="color:var(--primary-700);">${this.escapeHtml(m.member_code)}</strong></td>
                                <td>
                                    <strong>${this.escapeHtml(m.full_name)}</strong>
                                    <div style="font-size:0.78rem; color:var(--text-muted);">${this.escapeHtml(m.address || 'Campus Resident')}</div>
                                </td>
                                <td>
                                    <div>${this.escapeHtml(m.email)}</div>
                                    <div style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHtml(m.phone)}</div>
                                </td>
                                <td><span class="badge badge-neutral">${this.escapeHtml(m.membership_type)}</span></td>
                                <td>${m.membership_date}</td>
                                <td>
                                    <strong>${m.currently_borrowed}</strong> / ${m.max_borrow_limit}
                                    ${m.pending_fines > 0 ? `<div style="font-size:0.75rem; color:var(--danger-600); font-weight:600;">Fine: ₹${m.pending_fines}</div>` : ''}
                                </td>
                                <td>
                                    <span class="badge ${statusClass}">
                                        <span class="badge-dot"></span>
                                        ${m.status}
                                    </span>
                                </td>
                                <td>
                                    <div style="display:flex; gap:0.4rem;">
                                        <button class="btn btn-sm btn-outline" onclick="App.openEditMemberModal(${m.member_id})">Edit</button>
                                        <button class="btn btn-sm btn-outline" style="color:var(--danger-600);" onclick="App.deleteMember(${m.member_id})">Delete</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No members found.</td></tr>`;
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

    // ====================================================================
    // 4. CIRCULATION DESK: ISSUE BOOK (POST /api/loans/issue)
    // ====================================================================
    async prepareIssueDesk() {
        try {
            document.getElementById('issue-success-slip').style.display = 'none';

            const [booksData, membersData] = await Promise.all([
                ApiService.books.getAll({ availability: 'all' }),
                ApiService.members.getAll({ status: 'All' })
            ]);

            this.state.books = booksData.books || [];
            this.state.members = membersData.members || [];

            // Populate Books Select
            const bookSelect = document.getElementById('issue-book-select');
            if (bookSelect) {
                bookSelect.innerHTML = `<option value="">-- Choose a title from catalog --</option>` + 
                    this.state.books.map(b => {
                        const avail = b.available_copies > 0 ? `(${b.available_copies} available)` : `(OUT OF STOCK)`;
                        return `<option value="${b.book_id}" ${b.available_copies === 0 ? 'data-disabled="true"' : ''}>${this.escapeHtml(b.title)} ${avail} - [${b.shelf_location || 'General'}]</option>`;
                    }).join('');

                bookSelect.onchange = () => {
                    const bookId = parseInt(bookSelect.value, 10);
                    const book = this.state.books.find(b => b.book_id === bookId);
                    const hint = document.getElementById('issue-book-stock-hint');
                    if (book && hint) {
                        if (book.available_copies > 0) {
                            hint.innerHTML = `<span style="color:var(--accent-600); font-weight:600;">✓ In Stock:</span> ${book.available_copies} of ${book.total_copies} copies ready on <strong>${book.shelf_location || 'General'}</strong>.`;
                        } else {
                            hint.innerHTML = `<span style="color:var(--danger-600); font-weight:600;">⚠ Out of Stock:</span> All ${book.total_copies} copies currently issued. Cannot issue.`;
                        }
                    } else if (hint) {
                        hint.textContent = '';
                    }
                };
            }

            // Populate Members Select
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

    async handleIssueBook(e) {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';

        const bookId = document.getElementById('issue-book-select').value;
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

            // Render printable issue slip
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

            // Refresh selections
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

    // ====================================================================
    // 5. RETURN DESK (POST /api/loans/:id/return)
    // ====================================================================
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

            // Compute fine dynamically if overdue
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

    // ====================================================================
    // 6. OVERDUE MANAGEMENT (GET /api/reports/overdue)
    // ====================================================================
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

    // ====================================================================
    // 7. TRANSACTION HISTORY (GET /api/loans)
    // ====================================================================
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

    // ====================================================================
    // 8. REPORTS & ANALYTICS (GET /api/reports)
    // ====================================================================
    async loadReports() {
        try {
            const data = await ApiService.reports.getAnalytics();
            if (!data.success) throw new Error(data.message);

            // 1. Popular Books
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

            // 2. Top Borrowers
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

            // 3. Inventory Breakdown
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

    // ====================================================================
    // 9. AUTHENTICATION & LOGIN/LOGOUT (POST /api/auth/login, logout)
    // ====================================================================
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

            // Refresh current view with authorized session
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
            this.showToast(data.message || 'Logged out successfully. Redirecting to login...', 'info');
            this.setCurrentUser({
                staff_id: 0,
                staff_code: 'GUEST',
                full_name: 'Guest Librarian',
                email: 'guest@library.edu',
                role: 'Assistant'
            });
            this.closeModal('modal-auth');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 600);
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

    // ====================================================================
    // 10. VIVA DEMO SCENARIOS RUNNER
    // ====================================================================
    demoScenario(scenario) {
        this.closeModal('modal-viva');
        switch (scenario) {
            case 'stock_check':
                this.navigate('issue');
                this.showToast('Demonstration: Trying to issue an Out-of-Stock book...', 'info');
                setTimeout(() => {
                    const select = document.getElementById('issue-book-select');
                    if (select) {
                        for (let i = 0; i < select.options.length; i++) {
                            if (select.options[i].text.includes('OUT OF STOCK') || select.options[i].text.includes('0 available')) {
                                select.selectedIndex = i;
                                select.dispatchEvent(new Event('change'));
                                this.showToast('Note how the system detects available_copies = 0 and blocks the transaction!', 'warning');
                                break;
                            }
                        }
                    }
                }, 500);
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

    // ====================================================================
    // MODALS & UTILITIES
    // ====================================================================
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
        return String(str).replace(/'/g, "\\'");
    }
};

// Bootstrap application on window load
window.addEventListener('DOMContentLoaded', () => {
    App.init();
});
