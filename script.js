/**
 * Inventory Management System Core Logic
 * Handles Authentication, LocalStorage Simulation, and UI Interactions
 */

// Constants
const DB_KEYS = {
    USERS: 'ims_users',
    INVENTORY: 'ims_inventory',
    SALES: 'ims_sales',
    PURCHASES: 'ims_purchases',
    CURRENT_USER: 'ims_current_user',
    EXPENSES: 'ims_expenses', // New Key
    BANNER: 'ims_banner', // New Key
    VERTICAL_BANNER: 'ims_vertical_banner',
    CLOUD_URL: 'ims_cloud_url', // Google Sheet Web App URL
    VERSION: '1.0.1' // Cache busting key
};

const ROLES = {
    ADMIN: 'Admin',
    USER: 'User'
};

// Initial Mock Data (If empty)
const INITIAL_ADMIN = {
    id: 'admin_001',
    companyName: 'Admin', // Matches username for consistency
    username: 'Admin',
    contactPerson: 'Admin',
    password: 'admin123', // In real app, hash this!
    role: ROLES.ADMIN,
    status: 'Approved'
};

// --- Cloud Sync Service ---
class BMS_Cloud {
    constructor() {
        this.url = localStorage.getItem(DB_KEYS.CLOUD_URL) || '';
    }

    setUrl(url) {
        this.url = url;
        localStorage.setItem(DB_KEYS.CLOUD_URL, url);
    }

    getUrl() {
        return this.url;
    }

    async syncDown() {
        if (!this.url) return { success: false, message: 'No Cloud URL configured' };

        try {
            const res = await fetch(this.url);
            const json = await res.json();

            if (json.result === 'success') {
                const data = json.data; // { ims_users: [], ... }

                // Helper to save if valid
                const saveIfValid = (key, val) => {
                    if (val && Array.isArray(val) && val.length > 0) {
                        localStorage.setItem(key, JSON.stringify(val));
                    }
                };

                saveIfValid(DB_KEYS.USERS, data.ims_users);
                saveIfValid(DB_KEYS.INVENTORY, data.ims_inventory);
                saveIfValid(DB_KEYS.SALES, data.ims_sales);
                saveIfValid(DB_KEYS.PURCHASES, data.ims_purchases);
                saveIfValid(DB_KEYS.EXPENSES, data.ims_expenses);

                if (data.ims_banner) localStorage.setItem(DB_KEYS.BANNER, data.ims_banner);
                if (data.ims_vertical_banner) localStorage.setItem(DB_KEYS.VERTICAL_BANNER, data.ims_vertical_banner);

                return { success: true, message: 'Data synced from Cloud' };
            } else {
                return { success: false, message: 'Cloud Error: ' + json.error };
            }
        } catch (e) {
            return { success: false, message: 'Network/Sync Error: ' + e.toString() };
        }
    }

    // Fire and Forget Push
    pushRecord(key, data) {
        if (!this.url) return;

        // Use beacon or simple fetch without awaiting
        const payload = {
            action: 'save_record',
            key: key,
            data: data
        };

        fetch(this.url, {
            method: 'POST',
            mode: 'no-cors', // Important for Google Script
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => console.error('Cloud Push Failed', err));
    }
}

class BMS_Core {
    constructor() {
        this.cloud = new BMS_Cloud();
        this.initStorage();
        // Try background sync on load
        if (this.cloud.getUrl()) {
            // Delay to not block thread
            setTimeout(() => {
                this.cloud.syncDown().then(res => {
                    if (res.success) console.log('Cloud Synced');
                });
            }, 1000);
        }
        this.setupNavigation();
    }

    initStorage() {
        // ALWAYS ensure the default admin exists and is up to date
        // This fixes any data corruption or legacy data issues
        let users = [];
        try {
            users = JSON.parse(localStorage.getItem(DB_KEYS.USERS)) || [];
        } catch (e) { users = []; }

        // Remove any existing admin_001 to replace with fresh copy
        users = users.filter(u => u.id !== 'admin_001');
        users.unshift(INITIAL_ADMIN); // Add fresh Admin at top

        localStorage.setItem(DB_KEYS.USERS, JSON.stringify(users));

        // Init other keys
        if (!localStorage.getItem(DB_KEYS.INVENTORY)) localStorage.setItem(DB_KEYS.INVENTORY, JSON.stringify([]));
        if (!localStorage.getItem(DB_KEYS.SALES)) localStorage.setItem(DB_KEYS.SALES, JSON.stringify([]));
        if (!localStorage.getItem(DB_KEYS.PURCHASES)) localStorage.setItem(DB_KEYS.PURCHASES, JSON.stringify([]));
        if (!localStorage.getItem(DB_KEYS.EXPENSES)) localStorage.setItem(DB_KEYS.EXPENSES, JSON.stringify([]));
        if (!localStorage.getItem(DB_KEYS.BANNER)) localStorage.setItem(DB_KEYS.BANNER, '');
    }

    // --- Authentication ---
    login(username, customerName, password) {
        // Trim inputs to handle accidental spaces
        username = username.trim();
        customerName = customerName.trim();
        password = password.trim();

        const users = JSON.parse(localStorage.getItem(DB_KEYS.USERS));

        // 1. Find by Company Name (Username)
        const companyMatch = users.find(u =>
            u.username.toLowerCase() === username.toLowerCase()
        );

        if (!companyMatch) {
            return { success: false, message: `Company '${username}' not found.` };
        }

        // 2. Check Customer Name
        if ((companyMatch.contactPerson || '').toLowerCase() !== customerName.toLowerCase()) {
            return { success: false, message: `Incorrect Customer Name for '${username}'.` };
        }

        // 3. Check Password
        if (companyMatch.password !== password) {
            return { success: false, message: 'Incorrect Password.' };
        }

        const user = companyMatch;

        if (user.status !== 'Approved') return { success: false, message: 'Account not approved yet' };

        localStorage.setItem(DB_KEYS.CURRENT_USER, JSON.stringify(user));
        return { success: true, user };
    }

    register(companyName, contactPerson, password) {
        const users = JSON.parse(localStorage.getItem(DB_KEYS.USERS));
        // Check if company name (username) already exists
        const username = companyName; // Use Company Name as the unique username
        if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            return { success: false, message: 'Company Name already registered' };
        }

        const newUser = {
            id: 'user_' + Date.now(),
            companyName: companyName,
            username: username, // Using Company Name as ID
            contactPerson: contactPerson, // New Field
            password: password,
            role: ROLES.USER,
            status: 'Pending' // Default to pending
        };

        users.push(newUser);
        localStorage.setItem(DB_KEYS.USERS, JSON.stringify(users));

        // Push to Cloud
        this.cloud.pushRecord(DB_KEYS.USERS, newUser);

        return { success: true, message: 'Registration successful! Wait for Admin approval.' };
    }

    resetPassword(userId, newPassword) {
        let users = this.getUsers();
        let userIndex = users.findIndex(u => u.id === userId);
        if (userIndex > -1) {
            users[userIndex].password = newPassword;
            localStorage.setItem(DB_KEYS.USERS, JSON.stringify(users));
            this.cloud.pushRecord(DB_KEYS.USERS, users[userIndex]); // Cloud
            return true;
        }
        return false;
    }

    logout() {
        localStorage.removeItem(DB_KEYS.CURRENT_USER);
        window.location.href = 'index.html';
    }

    getCurrentUser() {
        return JSON.parse(localStorage.getItem(DB_KEYS.CURRENT_USER));
    }

    checkAuth(requiredRole = null) {
        const user = this.getCurrentUser();
        if (!user) {
            window.location.href = 'index.html';
            return null;
        }

        // --- Navigation Control based on Role ---
        if (user.role === ROLES.ADMIN) {
            document.querySelectorAll('.nav-link').forEach(el => {
                const href = el.getAttribute('href');
                if (href === 'purchase.html' || href === 'sale.html' || href === 'reports.html' || href === 'expense.html') {
                    el.style.display = 'none';
                }
            });
        } else {
            document.querySelectorAll('.nav-link').forEach(el => {
                if (el.getAttribute('href') === 'admin.html') {
                    el.style.display = 'none';
                }
            });
        }

        if (requiredRole && user.role !== requiredRole) {
            alert('Access Denied');
            window.location.href = 'dashboard.html';
            return null;
        }
        return user;
    }

    getUsers() {
        return JSON.parse(localStorage.getItem(DB_KEYS.USERS)) || [];
    }

    updateUserStatus(userId, newStatus) {
        let users = this.getUsers();
        let userIndex = users.findIndex(u => u.id === userId);
        if (userIndex > -1 && users[userIndex].role !== ROLES.ADMIN) {
            if (newStatus === 'Delete') {
                users.splice(userIndex, 1);
                // Note: Deletion is harder to sync with simple pushRecord, but acceptable for now
            } else {
                users[userIndex].status = newStatus;
                this.cloud.pushRecord(DB_KEYS.USERS, users[userIndex]); // Cloud
            }
            localStorage.setItem(DB_KEYS.USERS, JSON.stringify(users));
            return true;
        }
        return false;
    }

    getBanner() {
        return localStorage.getItem(DB_KEYS.BANNER) || '';
    }

    setBanner(url) {
        localStorage.setItem(DB_KEYS.BANNER, url);
        this.cloud.pushRecord(DB_KEYS.BANNER, { key: DB_KEYS.BANNER, value: url });
        return true;
    }

    setVerticalBanner(url) {
        localStorage.setItem(DB_KEYS.VERTICAL_BANNER, url);
        this.cloud.pushRecord(DB_KEYS.VERTICAL_BANNER, { key: DB_KEYS.VERTICAL_BANNER, value: url });
        return true;
    }

    // --- Inventory Management ---
    getInventory() {
        const allInventory = JSON.parse(localStorage.getItem(DB_KEYS.INVENTORY)) || [];
        const user = this.getCurrentUser();
        if (!user || user.role === ROLES.ADMIN) return []; // Admin sees nothing, isolated users see theirs
        return allInventory.filter(i => i.owner === user.username);
    }

    getSales() {
        const allSales = JSON.parse(localStorage.getItem(DB_KEYS.SALES)) || [];
        const user = this.getCurrentUser();
        if (!user || user.role === ROLES.ADMIN) return [];
        return allSales.filter(s => s.owner === user.username);
    }

    getPurchases() {
        const allPurchases = JSON.parse(localStorage.getItem(DB_KEYS.PURCHASES)) || [];
        const user = this.getCurrentUser();
        if (!user || user.role === ROLES.ADMIN) return [];
        return allPurchases.filter(p => p.owner === user.username);
    }

    // --- Expense Management ---
    getExpenses() {
        const allExpenses = JSON.parse(localStorage.getItem(DB_KEYS.EXPENSES)) || [];
        const user = this.getCurrentUser();
        if (!user || user.role === ROLES.ADMIN) return [];
        return allExpenses.filter(e => e.owner === user.username);
    }

    // Calculate Profit (Sales - Expenses)
    getFinancialSummary() {
        const sales = this.getSales();
        const expenses = this.getExpenses();

        const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
        const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
        const netProfit = totalSales - totalExpenses;

        return { totalSales, totalExpenses, netProfit };
    }

    addStock(vendor, category, brand, model, quantity, cost, paymentType) {
        const user = this.getCurrentUser();
        if (!user) return false;

        let allInventory = JSON.parse(localStorage.getItem(DB_KEYS.INVENTORY)) || [];
        let allPurchases = JSON.parse(localStorage.getItem(DB_KEYS.PURCHASES)) || [];

        const itemName = `${brand} ${model}`;

        const newPurchase = {
            id: 'pur_' + Date.now(),
            owner: user.username, // Data Isolation
            date: new Date().toISOString(),
            vendor,
            category,
            brand,
            model,
            itemName,
            quantity: parseInt(quantity),
            cost: parseFloat(cost),
            paymentType
        };

        // Add to Purchases Report
        allPurchases.push(newPurchase);
        localStorage.setItem(DB_KEYS.PURCHASES, JSON.stringify(allPurchases));
        this.cloud.pushRecord(DB_KEYS.PURCHASES, newPurchase); // Cloud

        // Update Stock (Scoped to Owner)
        let item = allInventory.find(i => i.owner === user.username && i.itemName.toLowerCase() === itemName.toLowerCase());

        let stockRecord = null;
        if (item) {
            item.quantity += parseInt(quantity);
            // Average cost logic omitted for simplicity
            stockRecord = item;
        } else {
            stockRecord = {
                id: 'inv_' + Date.now(), // Ensure ID for cloud
                owner: user.username, // Data Isolation
                itemName,
                quantity: parseInt(quantity),
                avgCost: parseFloat(cost)
            };
            allInventory.push(stockRecord);
        }
        localStorage.setItem(DB_KEYS.INVENTORY, JSON.stringify(allInventory));
        this.cloud.pushRecord(DB_KEYS.INVENTORY, stockRecord); // Cloud Update

        return true;
    }

    processSale(itemName, quantity, price) {
        const user = this.getCurrentUser();
        if (!user) return { success: false, message: 'Not logged in' };

        let allInventory = JSON.parse(localStorage.getItem(DB_KEYS.INVENTORY)) || [];
        let item = allInventory.find(i => i.owner === user.username && i.itemName.toLowerCase() === itemName.toLowerCase());

        if (!item || item.quantity < quantity) {
            return { success: false, message: 'Insufficient Stock' };
        }

        // Deduct Stock
        item.quantity -= parseInt(quantity);
        localStorage.setItem(DB_KEYS.INVENTORY, JSON.stringify(allInventory));
        this.cloud.pushRecord(DB_KEYS.INVENTORY, item); // Cloud Update Stock

        // Record Sale
        let allSales = JSON.parse(localStorage.getItem(DB_KEYS.SALES)) || [];
        const newSale = {
            id: 'sale_' + Date.now(),
            owner: user.username, // Data Isolation
            date: new Date().toISOString(),
            itemName,
            quantity: parseInt(quantity),
            price: parseFloat(price),
            total: parseInt(quantity) * parseFloat(price)
        };

        allSales.push(newSale);
        localStorage.setItem(DB_KEYS.SALES, JSON.stringify(allSales));
        this.cloud.pushRecord(DB_KEYS.SALES, newSale); // Cloud

        return { success: true };
    }

    addExpense(name, amount, date) {
        const user = this.getCurrentUser();
        if (!user) return false;

        let allExpenses = JSON.parse(localStorage.getItem(DB_KEYS.EXPENSES)) || [];

        const newExpense = {
            id: 'exp_' + Date.now(),
            owner: user.username,
            name,
            amount: parseFloat(amount),
            date: date || new Date().toISOString().split('T')[0]
        };

        allExpenses.push(newExpense);

        localStorage.setItem(DB_KEYS.EXPENSES, JSON.stringify(allExpenses));
        this.cloud.pushRecord(DB_KEYS.EXPENSES, newExpense); // Cloud

        return true;
    }

    // --- UI Helpers ---
    setupNavigation() {
        const toggle = document.querySelector('.menu-toggle');
        const links = document.querySelector('.nav-links');
        if (toggle && links) {
            toggle.addEventListener('click', () => {
                links.classList.toggle('show');
            });
        }

        // Highlight active link
        const path = window.location.pathname.split('/').pop() || 'index.html';
        document.querySelectorAll('.nav-link').forEach(link => {
            if (link.getAttribute('href') === path) {
                link.classList.add('active');
            }
        });

        // Logout Handler
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }
    }
}

const app = new BMS_Core();
