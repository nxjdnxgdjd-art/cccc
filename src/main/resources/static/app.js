// PlayZone Main SPA Application Logic

const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:8088' : '';

const STATE = {
    token: localStorage.getItem('pz_token') || null,
    user: null,
    activeView: 'home',
    transactions: [],
    gameHistory: [],
    notifications: [
        { id: 1, message: "Welcome to PlayZone! Start your winning journey today.", time: "1m ago" },
        { id: 2, message: "Add money to your wallet to get a 100% deposit bonus!", time: "10m ago" }
    ],
    showNotifications: false
};

// API Helper
async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (STATE.token) {
        headers['Authorization'] = `Bearer ${STATE.token}`;
    }

    const options = { method, headers };
    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, options);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
    }
    return response.json();
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2
    }).format(amount).replace('INR', '₹');
}

// Toggle notifications popup
function toggleNotifications() {
    STATE.showNotifications = !STATE.showNotifications;
    const popup = document.getElementById('notifications-popup');
    if (STATE.showNotifications) {
        renderNotifications();
        popup.classList.remove('hidden');
    } else {
        popup.classList.add('hidden');
    }
}

function addNotification(message) {
    STATE.notifications.unshift({
        id: Date.now(),
        message,
        time: "Just now"
    });
    // show red badge
    const badge = document.getElementById('noti-badge');
    badge.classList.remove('hidden');
    renderNotifications();
}

function renderNotifications() {
    const list = document.getElementById('notifications-list');
    list.innerHTML = '';
    if (STATE.notifications.length === 0) {
        list.innerHTML = '<div class="text-gray-400 text-sm p-4 text-center">No notifications</div>';
        return;
    }
    STATE.notifications.forEach(n => {
        list.innerHTML += `
            <div class="p-3 border-b border-purple-900/40 hover:bg-purple-950/20 transition duration-150">
                <p class="text-sm text-gray-200">${n.message}</p>
                <span class="text-xs text-purple-400 mt-1 block">${n.time}</span>
            </div>
        `;
    });
}

// Synchronize balance across all HTML elements
function syncBalanceDisplays(balance) {
    const formatted = formatCurrency(balance);
    
    // Top Navbar balance text
    const navText = document.getElementById('nav-balance-text');
    if (navText) navText.innerText = formatted;

    // Wallet Page Display
    const wText = document.getElementById('wallet-balance-display');
    if (wText) wText.innerText = formatted;

    // Aviator bet panel label or sub-balance displays
    const aviatorBal = document.getElementById('aviator-balance-display');
    if (aviatorBal) aviatorBal.innerText = formatted;
}

// Load current user profile
async function loadUserProfile() {
    try {
        const user = await apiCall('/api/auth/me');
        STATE.user = user;
        
        // Update user elements
        document.getElementById('nav-username').innerText = user.username;
        document.getElementById('nav-vip-level').innerText = `VIP Level ${user.vipLevel}`;
        
        // Update sidebar profile card
        document.getElementById('sidebar-username').innerText = user.username;
        document.getElementById('sidebar-vip').innerText = `VIP Level ${user.vipLevel}`;
        
        // Sync balance
        syncBalanceDisplays(user.walletBalance);

        // Update profile fields on profile page
        document.getElementById('prof-fullname').innerText = `${user.firstName} ${user.lastName}`;
        document.getElementById('prof-email').innerText = user.email;
        document.getElementById('prof-phone').innerText = user.phoneNumber;
        document.getElementById('prof-username').innerText = user.username;
        document.getElementById('prof-joined').innerText = new Date(user.createdAt).toLocaleDateString();

        return user;
    } catch (err) {
        console.error("Failed to load user profile:", err.message);
        logout();
    }
}

// Router logic
function switchView(viewName) {
    if (!STATE.token) {
        showGuestLayout('login');
        return;
    }

    STATE.activeView = viewName;

    // Hide all view panels
    const views = ['home-view', 'aviator-view', 'mines-view', 'wallet-view', 'transactions-view', 'refer-view', 'profile-view', 'support-view', 'settings-view'];
    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.classList.add('hidden');
    });

    // Show selected view panel
    const target = document.getElementById(`${viewName}-view`);
    if (target) target.classList.remove('hidden');

    // Update active state in sidebar navigation
    const navItems = ['home', 'aviator', 'mines', 'wallet', 'transactions', 'refer', 'profile', 'support', 'settings'];
    navItems.forEach(item => {
        const sidebarLink = document.getElementById(`side-link-${item}`);
        if (sidebarLink) {
            if (item === viewName) {
                sidebarLink.classList.add('bg-purple-900/40', 'border-l-4', 'border-purple-500', 'text-white');
                sidebarLink.classList.remove('text-gray-400');
            } else {
                sidebarLink.classList.remove('bg-purple-900/40', 'border-l-4', 'border-purple-500', 'text-white');
                sidebarLink.classList.add('text-gray-400');
            }
        }
    });

    // Game lifecycle activations/cleanup
    if (viewName === 'aviator') {
        if (window.AviatorGame) window.AviatorGame.init();
    } else {
        if (window.AviatorGame) window.AviatorGame.cleanup();
    }

    if (viewName === 'mines') {
        if (window.MinesGame) window.MinesGame.init();
    }

    if (viewName === 'transactions') {
        loadTransactions();
    }

    if (viewName === 'wallet') {
        loadTransactions();
    }

    // Scroll to top of content
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Show Guest layout or Authenticated layout
function showGuestLayout(mode = 'login') {
    document.getElementById('auth-layout').classList.remove('hidden');
    document.getElementById('app-layout').classList.add('hidden');

    if (mode === 'login') {
        document.getElementById('login-form-container').classList.remove('hidden');
        document.getElementById('register-form-container').classList.add('hidden');
    } else {
        document.getElementById('login-form-container').classList.add('hidden');
        document.getElementById('register-form-container').classList.remove('hidden');
    }
}

function showAppLayout() {
    document.getElementById('auth-layout').classList.add('hidden');
    document.getElementById('app-layout').classList.remove('hidden');
    loadUserProfile();
    switchView('home');
}

// Authentication handling
async function handleLogin(e) {
    e.preventDefault();
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    errorEl.classList.add('hidden');

    if (!identifier || !password) {
        errorEl.innerText = "Please fill in all fields.";
        errorEl.classList.remove('hidden');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<div class="spinner mx-auto"></div>`;
    btn.disabled = true;

    try {
        const response = await apiCall('/api/auth/login', 'POST', { identifier, password });
        STATE.token = response.token;
        localStorage.setItem('pz_token', response.token);
        
        showAppLayout();
        // Clear login form
        e.target.reset();
    } catch (err) {
        errorEl.innerText = err.message || "Failed to log in. Please check your credentials.";
        errorEl.classList.remove('hidden');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const firstName = document.getElementById('reg-firstname').value.trim();
    const lastName = document.getElementById('reg-lastname').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const phoneNumber = document.getElementById('reg-phone').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    const referralCode = document.getElementById('reg-referral').value.trim();
    const agree = document.getElementById('reg-agree').checked;
    const errorEl = document.getElementById('reg-error');

    errorEl.classList.add('hidden');

    if (!firstName || !lastName || !email || !phoneNumber || !username || !password || !confirmPassword) {
        errorEl.innerText = "All fields are required.";
        errorEl.classList.remove('hidden');
        return;
    }

    if (password !== confirmPassword) {
        errorEl.innerText = "Passwords do not match.";
        errorEl.classList.remove('hidden');
        return;
    }

    if (!agree) {
        errorEl.innerText = "You must agree to the Terms and Conditions.";
        errorEl.classList.remove('hidden');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<div class="spinner mx-auto"></div>`;
    btn.disabled = true;

    try {
        await apiCall('/api/auth/register', 'POST', {
            firstName, lastName, email, phoneNumber, username, password, confirmPassword, referralCode
        });
        
        // Auto log in after register
        const loginResponse = await apiCall('/api/auth/login', 'POST', { identifier: username, password });
        STATE.token = loginResponse.token;
        localStorage.setItem('pz_token', loginResponse.token);
        
        showAppLayout();
        e.target.reset();
    } catch (err) {
        errorEl.innerText = err.message || "Registration failed.";
        errorEl.classList.remove('hidden');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function logout() {
    STATE.token = null;
    STATE.user = null;
    localStorage.removeItem('pz_token');
    if (window.AviatorGame) window.AviatorGame.cleanup();
    showGuestLayout('login');
}

// Wallet Functions
window.currentDepositAmount = 0;

window.setDepositAmount = function(amount) {
    const amountInput = document.getElementById('deposit-amount');
    if (amountInput) {
        amountInput.value = amount;
    }
};

window.copyText = function(text, message) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            alert(message);
        }).catch(err => {
            console.error("Copy failed: ", err);
        });
    } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand("copy");
            alert(message);
        } catch (e) {
            console.error("Fallback copy failed: ", e);
        }
        document.body.removeChild(textarea);
    }
};

async function handleDeposit(e) {
    e.preventDefault();
    const amountInput = document.getElementById('deposit-amount');
    const amount = parseFloat(amountInput.value);
    const errorEl = document.getElementById('deposit-error');
    const successEl = document.getElementById('deposit-success');

    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if (isNaN(amount) || amount <= 0) {
        errorEl.innerText = "Please enter a valid deposit amount.";
        errorEl.classList.remove('hidden');
        return;
    }

    // Check if first-time depositing
    const hasPrevious = STATE.transactions.some(tx => 
        tx.type === 'DEPOSIT' && 
        tx.status === 'SUCCESS' && 
        tx.description && 
        tx.description.startsWith('PhonePe UPI Deposit')
    );

    if (!hasPrevious && amount < 100) {
        errorEl.innerText = "First-time deposit must be at least ₹100.00.";
        errorEl.classList.remove('hidden');
        return;
    }

    window.currentDepositAmount = amount;

    // Update labels on UPI screen
    document.getElementById('deposit-upi-amount-label').innerText = amount.toFixed(2);
    document.getElementById('deposit-upi-amount-label2').innerText = amount.toFixed(2);

    // Keep using the same static QR from Mushab Khan
    document.getElementById('deposit-upi-qr').src = 'assets/images/payment_qr.png';

    // Transition panels
    document.getElementById('deposit-form').classList.add('hidden');
    document.getElementById('deposit-upi-container').classList.remove('hidden');
}

async function handleDepositUtrSubmit(e) {
    e.preventDefault();
    const utrInput = document.getElementById('deposit-utr');
    const utr = utrInput.value.trim();
    const errorEl = document.getElementById('deposit-error');
    const successEl = document.getElementById('deposit-success');

    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if (!/^\d{12}$/.test(utr)) {
        errorEl.innerText = "UTR must be a 12-digit number.";
        errorEl.classList.remove('hidden');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<div class="spinner mx-auto"></div>`;
    btn.disabled = true;

    try {
        const response = await apiCall('/api/wallet/deposit', 'POST', { 
            amount: window.currentDepositAmount,
            utr: utr
        });
        STATE.user = response;
        syncBalanceDisplays(response.walletBalance);
        
        successEl.innerText = `Deposit of ${formatCurrency(window.currentDepositAmount)} verified & credited to wallet successfully!`;
        successEl.classList.remove('hidden');
        
        // Reset state and go back to step 1
        document.getElementById('deposit-amount').value = '';
        utrInput.value = '';
        window.currentDepositAmount = 0;
        
        document.getElementById('deposit-upi-container').classList.add('hidden');
        document.getElementById('deposit-form').classList.remove('hidden');
        
        addNotification(`PhonePe UPI Deposit of ${formatCurrency(response.walletBalance)} verified.`);
        loadTransactions();
    } catch (err) {
        errorEl.innerText = err.message || "UTR verification failed. Please try again.";
        errorEl.classList.remove('hidden');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function handleCancelUpi() {
    document.getElementById('deposit-upi-container').classList.add('hidden');
    document.getElementById('deposit-form').classList.remove('hidden');
    document.getElementById('deposit-utr').value = '';
    window.currentDepositAmount = 0;
    
    // Clear errors
    document.getElementById('deposit-error').classList.add('hidden');
    document.getElementById('deposit-success').classList.add('hidden');
}

async function handleWithdraw(e) {
    e.preventDefault();
    const amountInput = document.getElementById('withdraw-amount');
    const amount = parseFloat(amountInput.value);
    const errorEl = document.getElementById('withdraw-error');
    const successEl = document.getElementById('withdraw-success');

    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if (isNaN(amount) || amount < 109) {
        errorEl.innerText = "Minimum withdrawal amount is ₹109.00.";
        errorEl.classList.remove('hidden');
        return;
    }

    if (amount > STATE.user.walletBalance) {
        errorEl.innerText = "Insufficient wallet balance.";
        errorEl.classList.remove('hidden');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
        const response = await apiCall('/api/wallet/withdraw', 'POST', { amount });
        STATE.user = response;
        syncBalanceDisplays(response.walletBalance);

        successEl.innerText = `Withdrawal of ${formatCurrency(amount)} initiated successfully!`;
        successEl.classList.remove('hidden');
        amountInput.value = '';

        addNotification(`Withdrawn ${formatCurrency(amount)} successfully.`);
        loadTransactions();
    } catch (err) {
        errorEl.innerText = err.message || "Withdrawal failed.";
        errorEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
    }
}

async function loadTransactions() {
    try {
        const transactions = await apiCall('/api/wallet/transactions');
        STATE.transactions = transactions;
        renderTransactions();
    } catch (err) {
        console.error("Failed to load transactions:", err.message);
    }
}

function renderTransactions() {
    const renderTable = (elementId) => {
        const tableBody = document.getElementById(elementId);
        if (!tableBody) return;
        
        tableBody.innerHTML = '';
        if (STATE.transactions.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-6 py-4 text-center text-gray-500">No transactions recorded yet.</td>
                </tr>
            `;
            return;
        }

        STATE.transactions.forEach(tx => {
            const date = new Date(tx.createdAt).toLocaleString();
            const statusClass = tx.status === 'SUCCESS' ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10';
            const amountPrefix = tx.type === 'DEPOSIT' || tx.type === 'BET_WIN' ? '+' : '-';
            const amountClass = tx.type === 'DEPOSIT' || tx.type === 'BET_WIN' ? 'text-green-400 font-semibold' : 'text-red-400';
            
            tableBody.innerHTML += `
                <tr class="border-b border-purple-950/40 hover:bg-purple-950/10 transition duration-150">
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">${tx.id}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${date}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                        <span class="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20">${tx.type}</span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm ${amountClass}">${amountPrefix}${formatCurrency(tx.amount)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                        <span class="px-2.5 py-1 rounded-full text-xs font-medium ${statusClass}">${tx.status}</span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">${tx.description || '-'}</td>
                </tr>
            `;
        });
    };

    renderTable('transaction-table-body');
    renderTable('wallet-tx-table-body');
}

// Support Chat Bot Simulation
function handleSupportSend(e) {
    e.preventDefault();
    const input = document.getElementById('support-input');
    const message = input.value.trim();
    if (!message) return;

    appendSupportMessage('user', message);
    input.value = '';

    // Scroll chat area
    const chatContainer = document.getElementById('support-chat-messages');
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Auto reply simulation
    setTimeout(() => {
        let reply = "Thank you for contacting PlayZone VIP support. How can we assist you today?";
        const low = message.toLowerCase();
        if (low.includes('deposit') || low.includes('add money')) {
            reply = "To add money, navigate to the Wallet section, click the 'Add Money' tab, enter your deposit amount, and click Deposit. Winnings and deposits reflect instantly!";
        } else if (low.includes('withdraw') || low.includes('cash out')) {
            reply = "Withdrawals are processed instantly to your linked banking credentials. Open the Wallet section, enter the amount in the Withdraw tab, and click Confirm.";
        } else if (low.includes('aviator') || low.includes('multiplier')) {
            reply = "In Aviator, place your bet and click Cash Out before the plane flies away! The multiplier grows from 1.0x. If the plane flies away, your bet is lost.";
        } else if (low.includes('mines') || low.includes('mini blast')) {
            reply = "In Mines (Mini Blast), choose your mines count and place a bet. Click tiles to reveal diamonds and increase your multiplier. If you click a bomb, the game ends. Cash out anytime!";
        } else if (low.includes('hack') || low.includes('cheat')) {
            reply = "PlayZone games are 100% Provably Fair and computed strictly on secure databases. We do not tolerate cheating, hacking, or compromise attempts.";
        }
        
        appendSupportMessage('agent', reply);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 1000);
}

function appendSupportMessage(sender, text) {
    const chatContainer = document.getElementById('support-chat-messages');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (sender === 'user') {
        chatContainer.innerHTML += `
            <div class="flex items-end justify-end space-x-2">
                <div class="flex flex-col space-y-1 max-w-[70%]">
                    <div class="bg-purple-600 text-white rounded-2xl rounded-br-none px-4 py-2.5 text-sm">
                        ${text}
                    </div>
                    <span class="text-[10px] text-gray-500 self-end">${time}</span>
                </div>
                <div class="h-8 w-8 rounded-full bg-purple-950 border border-purple-500/30 flex items-center justify-center font-bold text-xs text-purple-300">U</div>
            </div>
        `;
    } else {
        chatContainer.innerHTML += `
            <div class="flex items-end space-x-2">
                <div class="h-8 w-8 rounded-full bg-purple-900/60 border border-purple-400 flex items-center justify-center font-bold text-xs text-purple-200">A</div>
                <div class="flex flex-col space-y-1 max-w-[70%]">
                    <div class="bg-purple-950/60 border border-purple-900/50 text-gray-200 rounded-2xl rounded-bl-none px-4 py-2.5 text-sm">
                        ${text}
                    </div>
                    <span class="text-[10px] text-gray-500">${time}</span>
                </div>
            </div>
        `;
    }
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
    // Bind Event Listeners
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    const registerForm = document.getElementById('register-form');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);

    const depositForm = document.getElementById('deposit-form');
    if (depositForm) depositForm.addEventListener('submit', handleDeposit);

    const depositUtrForm = document.getElementById('deposit-utr-form');
    if (depositUtrForm) depositUtrForm.addEventListener('submit', handleDepositUtrSubmit);

    const cancelUpiBtn = document.getElementById('btn-cancel-upi');
    if (cancelUpiBtn) cancelUpiBtn.addEventListener('click', handleCancelUpi);

    const withdrawForm = document.getElementById('withdraw-form');
    if (withdrawForm) withdrawForm.addEventListener('submit', handleWithdraw);

    const supportForm = document.getElementById('support-send-form');
    if (supportForm) supportForm.addEventListener('submit', handleSupportSend);

    // Sidebar navigation bindings
    const sidelinks = ['home', 'aviator', 'mines', 'wallet', 'transactions', 'refer', 'profile', 'support', 'settings'];
    sidelinks.forEach(link => {
        const el = document.getElementById(`side-link-${link}`);
        if (el) el.addEventListener('click', () => switchView(link));
    });

    // Logo routing
    const logoLink = document.getElementById('logo-home-link');
    if (logoLink) logoLink.addEventListener('click', () => switchView('home'));

    // Dashboard navigation shortcuts
    const playAviatorBtn = document.getElementById('dash-play-aviator');
    if (playAviatorBtn) playAviatorBtn.addEventListener('click', () => switchView('aviator'));

    const playMinesBtn = document.getElementById('dash-play-mines');
    if (playMinesBtn) playMinesBtn.addEventListener('click', () => switchView('mines'));

    const addMoneyNavBtn = document.getElementById('nav-add-money-btn');
    if (addMoneyNavBtn) addMoneyNavBtn.addEventListener('click', () => switchView('wallet'));

    const notiIcon = document.getElementById('noti-icon-btn');
    if (notiIcon) notiIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleNotifications();
        document.getElementById('noti-badge').classList.add('hidden');
    });

    const logoutBtn = document.getElementById('sidebar-logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    // Close notifications click outside
    document.addEventListener('click', (e) => {
        const popup = document.getElementById('notifications-popup');
        if (popup && !popup.classList.contains('hidden') && !popup.contains(e.target) && e.target.id !== 'noti-icon-btn') {
            toggleNotifications();
        }
    });

    // Check if token exists on load
    if (STATE.token) {
        showAppLayout();
    } else {
        showGuestLayout('login');
    }
});
