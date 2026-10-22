/**
 * CampusLib LMS — Reusable API Service Layer
 * Centralizes all HTTP communication with backend API
 * Handles relative routing on HTTP, fallback auto-detection on file:// protocol,
 * JSON serialization, session credentials, headers, and friendly error normalization.
 */

const ApiService = {
    // When served over HTTP/HTTPS, relative URL '' works automatically on ANY port (5000, 3000, etc.)
    baseUrl: (typeof window !== 'undefined' && window.location.protocol.startsWith('http'))
        ? ''
        : 'http://localhost:5000',

    activeFallbackUrl: null,

    /**
     * Core Fetch Wrapper with Automatic Local Fallback & Informative Diagnostics
     */
    async request(endpoint, options = {}) {
        let base = this.activeFallbackUrl || this.baseUrl;
        let url = `${base}${endpoint}`;

        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        const config = {
            ...options,
            credentials: 'include', // Vital for session cookie persistence
            headers: {
                ...defaultHeaders,
                ...(options.headers || {})
            }
        };

        try {
            return await this._executeFetch(url, config, options);
        } catch (initialError) {
            // If on file:// protocol and 5000 failed, attempt fallback to port 3000
            if (window.location.protocol === 'file:' && !this.activeFallbackUrl) {
                try {
                    const fallbackUrl = 'http://localhost:3000' + endpoint;
                    const fallbackResult = await this._executeFetch(fallbackUrl, config, options);
                    this.activeFallbackUrl = 'http://localhost:3000';
                    return fallbackResult;
                } catch (fallbackError) {
                    // Both ports unreachable
                    throw new Error('Library server is not running. Please open your project folder in terminal, run "npm start", and access http://localhost:5000 in your browser.');
                }
            }

            if (initialError.message && (initialError.message.includes('Failed to fetch') || initialError.message.includes('NetworkError'))) {
                throw new Error('Cannot connect to library server. Please make sure the backend is running ("npm start") at http://localhost:5000.');
            }

            throw initialError;
        }
    },

    async _executeFetch(url, config, options) {
        const response = await fetch(url, config);
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        if (!response.ok) {
            const errorMessage = (data && data.message) 
                ? data.message 
                : `Request failed with HTTP status ${response.status}`;
            const error = new Error(errorMessage);
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    },

    // HTTP Helper Methods
    get(endpoint, params = null) {
        let url = endpoint;
        if (params) {
            const cleanParams = {};
            for (const key in params) {
                if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                    cleanParams[key] = params[key];
                }
            }
            const query = new URLSearchParams(cleanParams).toString();
            if (query) url += `?${query}`;
        }
        return this.request(url, { method: 'GET' });
    },

    post(endpoint, body = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    put(endpoint, body = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    },

    delete(endpoint, body = {}) {
        return this.request(endpoint, {
            method: 'DELETE',
            body: JSON.stringify(body)
        });
    },

    // ================================================================
    // DOMAIN API ENDPOINTS
    // ================================================================

    // Authentication Services
    auth: {
        login(username, password) {
            return ApiService.post('/api/auth/login', { username, password });
        },
        me() {
            return ApiService.get('/api/auth/me');
        },
        logout() {
            return ApiService.post('/api/auth/logout');
        }
    },

    // Dashboard & Reports Services
    reports: {
        getDashboard() {
            return ApiService.get('/api/reports/dashboard');
        },
        getOverdue() {
            return ApiService.get('/api/reports/overdue');
        },
        getAnalytics() {
            return ApiService.get('/api/reports');
        },
        getExportUrl() {
            const base = ApiService.activeFallbackUrl || ApiService.baseUrl;
            return `${base}/api/reports/export`;
        }
    },

    // Book Management Services
    books: {
        getAll(filters = {}) {
            return ApiService.get('/api/books', filters);
        },
        getById(id) {
            return ApiService.get(`/api/books/${id}`);
        },
        create(bookData) {
            return ApiService.post('/api/books', bookData);
        },
        update(id, bookData) {
            return ApiService.put(`/api/books/${id}`, bookData);
        },
        delete(id, staffName = 'Admin') {
            return ApiService.delete(`/api/books/${id}`, { staff_name: staffName });
        }
    },

    // Member Management Services
    members: {
        getAll(filters = {}) {
            return ApiService.get('/api/members', filters);
        },
        getById(id) {
            return ApiService.get(`/api/members/${id}`);
        },
        create(memberData) {
            return ApiService.post('/api/members', memberData);
        },
        update(id, memberData) {
            return ApiService.put(`/api/members/${id}`, memberData);
        },
        delete(id, staffName = 'Admin') {
            return ApiService.delete(`/api/members/${id}`, { staff_name: staffName });
        }
    },

    // Circulation & Loan Services
    loans: {
        getAll(filters = {}) {
            return ApiService.get('/api/loans', filters);
        },
        getById(id) {
            return ApiService.get(`/api/loans/${id}`);
        },
        issue(loanData) {
            return ApiService.post('/api/loans/issue', loanData);
        },
        return(id, returnData) {
            return ApiService.post(`/api/loans/${id}/return`, returnData);
        },
        renew(id, days = 14) {
            return ApiService.post(`/api/loans/${id}/renew`, { additional_days: days });
        },
        sendReminder(id) {
            return ApiService.post(`/api/overdue/remind/${id}`);
        }
    },

    // Staff & System Services
    system: {
        getStaff() {
            return ApiService.get('/api/staff');
        },
        resetDemoData() {
            return ApiService.post('/api/system/reset-demo-data');
        }
    }
};

window.ApiService = ApiService;
