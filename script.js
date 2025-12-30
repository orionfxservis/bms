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
    BANNER: 'ims_banner' // New Key
};

const ROLES = {
    ADMIN: 'Admin',
    USER: 'User'
};

// Initial Mock Data (If empty)
const INITIAL_ADMIN = {
    id: 'admin_001',
    companyName: 'System Admin',
    username: 'admin',
    password: 'admin123', // In real app, hash this!
    role: ROLES.ADMIN,
    status: 'Approved'
};

class BMS_Core {
    constructor() {
        this.initStorage();
        this.setupNavigation();
    }

    initStorage() {
        if (!localStorage.getItem(DB_KEYS.USERS)) {
            localStorage.setItem(DB_KEYS.USERS, JSON.stringify([INITIAL_ADMIN]));
        }
        if (!localStorage.getItem(DB_KEYS.INVENTORY)) {
            localStorage.setItem(DB_KEYS.INVENTORY, JSON.stringify([]));
        }
        if (!localStorage.getItem(DB_KEYS.SALES)) localStorage.setItem(DB_KEYS.SALES, JSON.stringify([]));
        if (!localStorage.getItem(DB_KEYS.PURCHASES)) localStorage.setItem(DB_KEYS.PURCHASES, JSON.stringify([]));
        if (!localStorage.getItem(DB_KEYS.EXPENSES)) localStorage.setItem(DB_KEYS.EXPENSES, JSON.stringify([])); // Init Expenses
        if (!localStorage.getItem(DB_KEYS.BANNER)) localStorage.setItem(DB_KEYS.BANNER, ''); // Init Banner
    }

    // --- Authentication ---
    login(username, password) {
        const users = JSON.parse(localStorage.getItem(DB_KEYS.USERS));
        console.log("Attempting login for:", username);

        // precise match for password, case-insensitive for username
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

        if (!user) {
            // Debug help for user
            console.warn("Login failed. User not found or password mismatch.");
            return { success: false, message: 'Invalid credentials. Please check capitalization.' };
        }
        if (user.status !== 'Approved') return { success: false, message: 'Account not approved yet' };

        localStorage.setItem(DB_KEYS.CURRENT_USER, JSON.stringify(user));
        return { success: true, user };
    }

    register(companyName, username, password) {
        const users = JSON.parse(localStorage.getItem(DB_KEYS.USERS));
        // Check if company name (username) already exists
        if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            return { success: false, message: 'User Name already taken' };
        }

        const newUser = {
            id: 'user_' + Date.now(),
            companyName: companyName,
            username: username, // Keep original casing for display
            password: password,
            role: ROLES.USER,
            status: 'Pending' // Default to pending
        };

        users.push(newUser);
        localStorage.setItem(DB_KEYS.USERS, JSON.stringify(users));
        return { success: true, message: 'Registration successful! Wait for Admin approval.' };
    }

    resetPassword(userId, newPassword) {
        let users = this.getUsers();
        let userIndex = users.findIndex(u => u.id === userId);
        if (userIndex > -1) {
            users[userIndex].password = newPassword;
            localStorage.setItem(DB_KEYS.USERS, JSON.stringify(users));
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
        // Hide/Show links
        if (user.role === ROLES.ADMIN) {
            document.querySelectorAll('.nav-link').forEach(el => {
                const href = el.getAttribute('href');
                if (href === 'purchase.html' || href === 'sale.html' || href === 'reports.html' || href === 'expense.html') {
                    el.style.display = 'none'; // Hide operational links for Admin
                }
            });
        } else {
            // Regular user: Hide Admin link
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

    // --- Data Management (Admin) ---
    getUsers() {
        return JSON.parse(localStorage.getItem(DB_KEYS.USERS)) || [];
    }

    updateUserStatus(userId, newStatus) {
        let users = this.getUsers();
        let userIndex = users.findIndex(u => u.id === userId);
        if (userIndex > -1 && users[userIndex].role !== ROLES.ADMIN) {
            // Should not be able to delete/hold the main admin for safety in this demo
            if (newStatus === 'Delete') {
                users.splice(userIndex, 1);
            } else {
                users[userIndex].status = newStatus;
            }
            localStorage.setItem(DB_KEYS.USERS, JSON.stringify(users));
            return true;
        }
        return false;
    }

    // --- Banner Management ---
    getBanner() {
        return localStorage.getItem(DB_KEYS.BANNER) || '';
    }

    setBanner(url) {
        localStorage.setItem(DB_KEYS.BANNER, url);
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

    addExpense(name, amount, date) {
        const user = this.getCurrentUser();
        if (!user) return false;

        let allExpenses = JSON.parse(localStorage.getItem(DB_KEYS.EXPENSES)) || [];

        allExpenses.push({
            id: 'exp_' + Date.now(),
            owner: user.username,
            name,
            amount: parseFloat(amount),
            date: date || new Date().toISOString().split('T')[0]
        });

        localStorage.setItem(DB_KEYS.EXPENSES, JSON.stringify(allExpenses));
        return true;
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

        // Add to Purchases Report
        allPurchases.push({
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
        });
        localStorage.setItem(DB_KEYS.PURCHASES, JSON.stringify(allPurchases));

        // Update Stock (Scoped to Owner)
        let item = allInventory.find(i => i.owner === user.username && i.itemName.toLowerCase() === itemName.toLowerCase());
        if (item) {
            item.quantity += parseInt(quantity);
            // Average cost logic omitted for simplicity
        } else {
            allInventory.push({
                owner: user.username, // Data Isolation
                itemName,
                quantity: parseInt(quantity),
                avgCost: parseFloat(cost)
            });
        }
        localStorage.setItem(DB_KEYS.INVENTORY, JSON.stringify(allInventory));
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

        // Record Sale
        let allSales = JSON.parse(localStorage.getItem(DB_KEYS.SALES)) || [];
        allSales.push({
            id: 'sale_' + Date.now(),
            owner: user.username, // Data Isolation
            date: new Date().toISOString(),
            itemName,
            quantity: parseInt(quantity),
            price: parseFloat(price),
            total: parseInt(quantity) * parseFloat(price)
        });
        localStorage.setItem(DB_KEYS.SALES, JSON.stringify(allSales));

        return { success: true };
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
