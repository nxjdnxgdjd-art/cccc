// ==========================================
// AETHERCHAT - FRONTEND LOGIC & WEBSOCKETS
// ==========================================

// Global Application State
let state = {
    token: localStorage.getItem('aether_token') || null,
    currentUser: null,
    friends: [],
    pendingIncoming: [],
    pendingOutgoing: [],
    activeFriendId: null,
    ws: null,
    selectedAttachmentFile: null,
    activeSidebarTab: 'chats' // chats, explore, requests
};

// Initialization on DOM Load
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});

// ================= AUTHENTICATION LOGIC =================
async function checkAuth() {
    if (!state.token) {
        showPage('auth-page');
        return;
    }

    try {
        const response = await fetch('/api/users/me', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (response.ok) {
            state.currentUser = await response.json();
            showPage('dashboard-page');
            initializeDashboard();
        } else {
            // Token is expired or invalid
            handleLogout();
        }
    } catch (err) {
        console.error("Auth check failed:", err);
        // Connection error or server offline: stay on auth page or show offline alert
        showPage('auth-page');
        showAuthAlert("Server is offline or unreachable.", "danger");
    }
}

async function handleLogin(event) {
    event.preventDefault();
    clearAuthAlert();

    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');

    const payload = {
        username: usernameInput.value,
        password: passwordInput.value
    };

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            state.token = data.token;
            state.currentUser = data.user;
            localStorage.setItem('aether_token', data.token);
            
            usernameInput.value = '';
            passwordInput.value = '';
            
            showPage('dashboard-page');
            initializeDashboard();
        } else {
            showAuthAlert(data.error || "Login failed.", "danger");
        }
    } catch (err) {
        console.error("Login request error:", err);
        showAuthAlert("Could not establish connection to the server.", "danger");
    }
}

async function handleRegister(event) {
    event.preventDefault();
    clearAuthAlert();

    const usernameInput = document.getElementById('register-username');
    const nicknameInput = document.getElementById('register-nickname');
    const passwordInput = document.getElementById('register-password');

    const payload = {
        username: usernameInput.value,
        nickname: nicknameInput.value,
        password: passwordInput.value
    };

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            state.token = data.token;
            state.currentUser = data.user;
            localStorage.setItem('aether_token', data.token);

            usernameInput.value = '';
            nicknameInput.value = '';
            passwordInput.value = '';

            showPage('dashboard-page');
            initializeDashboard();
        } else {
            showAuthAlert(data.error || "Registration failed.", "danger");
        }
    } catch (err) {
        console.error("Registration request error:", err);
        showAuthAlert("Could not establish connection to the server.", "danger");
    }
}

function handleLogout() {
    // Clean states
    localStorage.removeItem('aether_token');
    state.token = null;
    state.currentUser = null;
    state.friends = [];
    state.pendingIncoming = [];
    state.pendingOutgoing = [];
    state.activeFriendId = null;
    
    if (state.ws) {
        state.ws.close();
        state.ws = null;
    }

    // Reset views
    document.getElementById('friends-list').innerHTML = '';
    closeActiveChat();
    showPage('auth-page');
}

// ================= DASHBOARD INITIALIZATION =================
function initializeDashboard() {
    // Render current user profile info
    updateMyProfileUI();
    
    // Switch to active chats panel
    switchSidebarTab('chats');

    // Fetch lists in parallel
    loadFriends();
    loadPendingRequests();

    // Establish WebSocket Connection
    initWebSocket();
}

function updateMyProfileUI() {
    document.getElementById('my-nickname').innerText = state.currentUser.nickname;
    document.getElementById('my-username').innerText = `@${state.currentUser.username}`;
    
    const avatarImg = document.getElementById('my-avatar');
    const avatarFallback = document.getElementById('my-avatar-fallback');

    if (state.currentUser.profilePicture && state.currentUser.profilePicture.trim() !== '') {
        avatarImg.src = state.currentUser.profilePicture;
        avatarImg.classList.remove('hidden');
        avatarFallback.classList.add('hidden');
    } else {
        avatarImg.classList.add('hidden');
        avatarFallback.innerText = state.currentUser.nickname.substring(0, 1);
        avatarFallback.classList.remove('hidden');
    }
}

// ================= WEBSOCKET REAL-TIME CHAT =================
function initWebSocket() {
    if (state.ws) {
        state.ws.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/chat-ws?token=${state.token}`;

    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
        console.log("WebSocket connection established successfully.");
    };

    state.ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);

            if (msg.error) {
                console.error("Server WebSocket Error:", msg.error);
                return;
            }

            // Message is either sent by current user (confirmation) or received from someone else
            const isSentByMe = msg.senderId === state.currentUser.id;
            const targetFriendId = isSentByMe ? msg.receiverId : msg.senderId;

            // If we have an active chat open with the sender/receiver of the message, append immediately
            if (state.activeFriendId && state.activeFriendId === targetFriendId) {
                renderMessage(msg);
                scrollMessagesToBottom();
            } else {
                // If conversation is not open, highlight the friend in the sidebar
                highlightUnreadMessage(targetFriendId);
            }
        } catch (ex) {
            console.error("Error reading socket payload:", ex);
        }
    };

    state.ws.onerror = (err) => {
        console.error("WebSocket connection encountered an error:", err);
    };

    state.ws.onclose = (event) => {
        console.log("WebSocket connection closed. Reconnecting in 5 seconds...", event);
        if (state.token) {
            setTimeout(initWebSocket, 5000);
        }
    };
}

// Highlight unread message notifications
function highlightUnreadMessage(friendId) {
    const friendEl = document.querySelector(`.user-list-item[data-friend-id="${friendId}"]`);
    if (friendEl) {
        friendEl.classList.add('unread');
        // Add a dot if not already there
        if (!friendEl.querySelector('.unread-dot')) {
            const details = friendEl.querySelector('.item-details');
            const dot = document.createElement('div');
            dot.className = 'unread-dot';
            dot.style.width = '8px';
            dot.style.height = '8px';
            dot.style.borderRadius = '50%';
            dot.style.backgroundColor = 'var(--primary)';
            dot.style.position = 'absolute';
            dot.style.right = '15px';
            dot.style.top = '50%';
            dot.style.transform = 'translateY(-50%)';
            friendEl.style.position = 'relative';
            friendEl.appendChild(dot);
        }
    }
}

// ================= SIDEBAR TABS & LIST RENDER =================
function switchSidebarTab(tab) {
    state.activeSidebarTab = tab;
    
    // Update Tab Navigation Buttons Active Styles
    document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`nav-btn-${tab}`).classList.add('active');

    // Update Panel Contents Visibility
    document.querySelectorAll('.sidebar-panel-content').forEach(p => p.classList.add('hidden'));
    document.getElementById(`tab-content-${tab}`).classList.remove('hidden');

    if (tab === 'chats') {
        loadFriends();
    } else if (tab === 'requests') {
        loadPendingRequests();
    }
}

async function loadFriends() {
    try {
        const response = await fetch('/api/friends/list', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (!response.ok) return;

        const friends = await response.json();
        state.friends = friends;

        const container = document.getElementById('friends-list');
        if (friends.length === 0) {
            container.innerHTML = `
                <div class="list-placeholder">
                    <i class="fa-solid fa-users-viewfinder"></i>
                    <p>Your friend circle is empty. Switch to <strong>Find Friends</strong> to discover users!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        friends.forEach(f => {
            const isSelected = state.activeFriendId === f.id;
            const hasAvatar = f.profilePicture && f.profilePicture.trim() !== '';

            const item = document.createElement('div');
            item.className = `user-list-item ${isSelected ? 'selected' : ''}`;
            item.setAttribute('data-friend-id', f.id);
            item.onclick = () => openChat(f.id, f.nickname, f.username, f.profilePicture);

            item.innerHTML = `
                <div class="item-avatar-wrapper">
                    ${hasAvatar 
                        ? `<img class="avatar" src="${f.profilePicture}" alt="Avatar">` 
                        : `<div class="avatar-fallback">${f.nickname.substring(0, 1)}</div>`}
                    <div class="online-indicator"></div>
                </div>
                <div class="item-details">
                    <h4>${f.nickname}</h4>
                    <p>@${f.username}</p>
                </div>
            `;
            container.appendChild(item);
        });
    } catch (err) {
        console.error("Could not fetch friends:", err);
    }
}

// Searching Users to add
let searchTimeout;
function handleFriendSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        const query = document.getElementById('friend-search-input').value.trim();
        const container = document.getElementById('search-results-list');

        if (query === '') {
            container.innerHTML = `
                <div class="list-placeholder">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <p>Type a username above to search for people on AetherChat.</p>
                </div>
            `;
            return;
        }

        try {
            const response = await fetch(`/api/users/search?username=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': `Bearer ${state.token}` }
            });

            if (!response.ok) return;

            const results = await response.json();

            if (results.length === 0) {
                container.innerHTML = `
                    <div class="list-placeholder">
                        <i class="fa-solid fa-face-frown-open"></i>
                        <p>No users found matching "${query}". Check spelling and try again.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = '';
            results.forEach(u => {
                // Determine action button based on friendship state
                let actionBtnHtml = '';
                const isAlreadyFriend = state.friends.some(f => f.id === u.id);
                const isIncomingPending = state.pendingIncoming.some(r => r.sender.id === u.id);
                const isOutgoingPending = state.pendingOutgoing.some(r => r.receiver.id === u.id);

                if (isAlreadyFriend) {
                    actionBtnHtml = `<span class="badge" style="background-color: var(--secondary); border: 1px solid var(--border-color); color: var(--text-secondary)">Friends</span>`;
                } else if (isIncomingPending) {
                    actionBtnHtml = `<button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem" onclick="switchSidebarTab('requests')">Respond</button>`;
                } else if (isOutgoingPending) {
                    actionBtnHtml = `<span class="badge" style="background-color: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.2); color: var(--primary)">Pending</span>`;
                } else {
                    actionBtnHtml = `
                        <button class="icon-btn" onclick="sendRequest(${u.id}, this)" title="Add Friend">
                            <i class="fa-solid fa-user-plus" style="color: var(--primary)"></i>
                        </button>
                    `;
                }

                const hasAvatar = u.profilePicture && u.profilePicture.trim() !== '';
                const row = document.createElement('div');
                row.className = 'user-list-item';
                row.innerHTML = `
                    <div class="item-avatar-wrapper">
                        ${hasAvatar 
                            ? `<img class="avatar" src="${u.profilePicture}" alt="Avatar">` 
                            : `<div class="avatar-fallback">${u.nickname.substring(0, 1)}</div>`}
                    </div>
                    <div class="item-details">
                        <h4>${u.nickname}</h4>
                        <p>@${u.username}</p>
                    </div>
                    <div class="item-actions">
                        ${actionBtnHtml}
                    </div>
                `;
                container.appendChild(row);
            });
        } catch (err) {
            console.error("Search query failed:", err);
        }
    }, 300);
}

async function sendRequest(receiverId, btnElement) {
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }

    try {
        const response = await fetch('/api/friends/request/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ receiverId })
        });

        if (response.ok) {
            // Reload requests list and re-search users to refresh buttons
            await loadPendingRequests();
            handleFriendSearch();
        } else {
            const data = await response.json();
            alert(data.error || "Failed to send request.");
            handleFriendSearch();
        }
    } catch (err) {
        console.error("Could not send friend request:", err);
    }
}

async function loadPendingRequests() {
    try {
        const response = await fetch('/api/friends/requests/pending', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (!response.ok) return;

        const data = await response.json();
        state.pendingIncoming = data.incoming;
        state.pendingOutgoing = data.outgoing;

        // Update notification count badge
        const badge = document.getElementById('requests-badge');
        const totalPending = data.incoming.length;
        if (totalPending > 0) {
            badge.innerText = totalPending;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        // Render incoming requests
        const incomingContainer = document.getElementById('received-requests-list');
        if (data.incoming.length === 0) {
            incomingContainer.innerHTML = `<p class="empty-text">No pending incoming requests</p>`;
        } else {
            incomingContainer.innerHTML = '';
            data.incoming.forEach(r => {
                const hasAvatar = r.sender.profilePicture && r.sender.profilePicture.trim() !== '';
                const item = document.createElement('div');
                item.className = 'user-list-item';
                item.style.cursor = 'default';
                item.innerHTML = `
                    <div class="item-avatar-wrapper">
                        ${hasAvatar 
                            ? `<img class="avatar" src="${r.sender.profilePicture}" alt="Avatar">` 
                            : `<div class="avatar-fallback">${r.sender.nickname.substring(0, 1)}</div>`}
                    </div>
                    <div class="item-details">
                        <h4>${r.sender.nickname}</h4>
                        <p>@${r.sender.username}</p>
                    </div>
                    <div class="item-actions">
                        <button class="icon-btn" onclick="respondRequest(${r.requestId}, 'ACCEPT')" style="color: var(--accent-emerald)" title="Accept">
                            <i class="fa-solid fa-circle-check"></i>
                        </button>
                        <button class="icon-btn" onclick="respondRequest(${r.requestId}, 'REJECT')" style="color: var(--accent-rose)" title="Decline">
                            <i class="fa-solid fa-circle-xmark"></i>
                        </button>
                    </div>
                `;
                incomingContainer.appendChild(item);
            });
        }

        // Render outgoing requests
        const outgoingContainer = document.getElementById('sent-requests-list');
        if (data.outgoing.length === 0) {
            outgoingContainer.innerHTML = `<p class="empty-text">No active outgoing requests</p>`;
        } else {
            outgoingContainer.innerHTML = '';
            data.outgoing.forEach(r => {
                const hasAvatar = r.receiver.profilePicture && r.receiver.profilePicture.trim() !== '';
                const item = document.createElement('div');
                item.className = 'user-list-item';
                item.style.cursor = 'default';
                item.innerHTML = `
                    <div class="item-avatar-wrapper">
                        ${hasAvatar 
                            ? `<img class="avatar" src="${r.receiver.profilePicture}" alt="Avatar">` 
                            : `<div class="avatar-fallback">${r.receiver.nickname.substring(0, 1)}</div>`}
                    </div>
                    <div class="item-details">
                        <h4>${r.receiver.nickname}</h4>
                        <p>@${r.receiver.username}</p>
                    </div>
                    <div class="item-actions">
                        <span class="badge" style="background-color: rgba(255,255,255,0.05); border: 1px solid var(--border-color); color: var(--text-muted)">Sent</span>
                    </div>
                `;
                outgoingContainer.appendChild(item);
            });
        }
    } catch (err) {
        console.error("Could not load pending requests:", err);
    }
}

async function respondRequest(requestId, action) {
    try {
        const response = await fetch('/api/friends/request/respond', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ requestId, action })
        });

        if (response.ok) {
            await loadPendingRequests();
            loadFriends();
        }
    } catch (err) {
        console.error("Could not respond to request:", err);
    }
}

// ================= CHAT MESSAGING CONTROLLER =================
async function openChat(friendId, nickname, username, profilePic) {
    state.activeFriendId = friendId;

    // Highlight selected item in sidebar list
    document.querySelectorAll('.user-list-item').forEach(item => item.classList.remove('selected'));
    const selectedItem = document.querySelector(`.user-list-item[data-friend-id="${friendId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
        selectedItem.classList.remove('unread');
        // Remove unread indicator dot if exists
        const dot = selectedItem.querySelector('.unread-dot');
        if (dot) dot.remove();
    }

    // Set friend details in header
    document.getElementById('chat-friend-nickname').innerText = nickname;
    document.getElementById('chat-friend-username').innerText = `@${username}`;

    const chatAvatar = document.getElementById('chat-avatar');
    const chatAvatarFallback = document.getElementById('chat-avatar-fallback');

    if (profilePic && profilePic.trim() !== '') {
        chatAvatar.src = profilePic;
        chatAvatar.classList.remove('hidden');
        chatAvatarFallback.classList.add('hidden');
    } else {
        chatAvatar.classList.add('hidden');
        chatAvatarFallback.innerText = nickname.substring(0, 1);
        chatAvatarFallback.classList.remove('hidden');
    }

    // Hide Placeholder, Show Active Window
    document.getElementById('chat-placeholder').classList.add('hidden');
    document.getElementById('active-chat-screen').classList.remove('hidden');

    // Load Chat History
    const feed = document.getElementById('messages-feed');
    feed.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:var(--primary)"></i></div>';

    try {
        const response = await fetch(`/api/messages/history?friendId=${friendId}`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (response.ok) {
            const messages = await response.json();
            feed.innerHTML = '';
            messages.forEach(msg => renderMessage(msg));
            scrollMessagesToBottom();
        } else {
            feed.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%; color:var(--accent-rose)"><p>Could not load conversation history.</p></div>';
        }
    } catch (err) {
        console.error("Failed to load chat history:", err);
    }

    // Adjust for mobile viewports
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.add('hidden-mobile');
    }
}

function closeActiveChat() {
    state.activeFriendId = null;
    document.getElementById('active-chat-screen').classList.add('hidden');
    document.getElementById('chat-placeholder').classList.remove('hidden');

    document.querySelectorAll('.user-list-item').forEach(item => item.classList.remove('selected'));

    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('hidden-mobile');
    }
}

function renderMessage(msg) {
    const feed = document.getElementById('messages-feed');
    const isSentByMe = msg.senderId === state.currentUser.id;

    const row = document.createElement('div');
    row.className = `message-row ${isSentByMe ? 'sent' : 'received'}`;

    // Format local time nicely
    let formattedTime = "";
    if (msg.createdAt) {
        try {
            const date = new Date(msg.createdAt);
            formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            formattedTime = msg.createdAt;
        }
    }

    row.innerHTML = `
        <div class="message-bubble">
            ${msg.imageUrl && msg.imageUrl.trim() !== '' 
                ? `<img class="message-image" src="${msg.imageUrl}" alt="Shared image" onclick="viewImageFull('${msg.imageUrl}')">` 
                : ''}
            ${msg.content && msg.content.trim() !== '' 
                ? `<div class="message-text">${escapeHTML(msg.content)}</div>` 
                : ''}
            <span class="message-time">${formattedTime}</span>
        </div>
    `;

    feed.appendChild(row);
}

function scrollMessagesToBottom() {
    const feed = document.getElementById('messages-feed');
    feed.scrollTop = feed.scrollHeight;
}

// Sending WebSocket Text/Image Messages
async function sendChatMessage() {
    if (!state.activeFriendId) return;

    const textInput = document.getElementById('chat-message-input');
    const textContent = textInput.value.trim();

    // Check if there is either text or an uploaded image preview
    if (textContent === '' && !state.selectedAttachmentFile) return;

    let imageUrl = '';

    // Upload attachment if exists
    if (state.selectedAttachmentFile) {
        const sendBtn = document.getElementById('chat-send-btn');
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        const formData = new FormData();
        formData.append('file', state.selectedAttachmentFile);

        try {
            const response = await fetch('/api/messages/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${state.token}` },
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                imageUrl = data.imageUrl;
            } else {
                alert("Could not upload image. Message not sent.");
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
                return;
            }
        } catch (err) {
            console.error("Upload error:", err);
            alert("Error sending attachment.");
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
            return;
        }
    }

    // Prepare JSON payload for WebSocket
    const payload = {
        receiverId: state.activeFriendId,
        content: textContent,
        imageUrl: imageUrl
    };

    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify(payload));
        
        // Reset Inputs
        textInput.value = '';
        clearAttachmentSelection();

        const sendBtn = document.getElementById('chat-send-btn');
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    } else {
        alert("Chat server disconnected. Trying to reconnect...");
        initWebSocket();
    }
}

// Handling text entry keys
function handleInputKeyPress(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}

// Attachment triggers
function triggerFileInput() {
    document.getElementById('chat-file-input').click();
}

function handleFileSelection(event) {
    const file = event.target.files[0];
    if (!file) return;

    state.selectedAttachmentFile = file;

    // Display image preview wrapper
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('attachment-thumbnail').src = e.target.result;
        document.getElementById('attachment-filename').innerText = file.name;
        document.getElementById('attachment-preview-container').classList.remove('hidden');
        scrollMessagesToBottom();
    };
    reader.readAsDataURL(file);
}

function clearAttachmentSelection() {
    state.selectedAttachmentFile = null;
    document.getElementById('chat-file-input').value = '';
    document.getElementById('attachment-preview-container').classList.add('hidden');
    document.getElementById('attachment-thumbnail').src = '';
}

// Lightbox for visual full screens
function viewImageFull(url) {
    window.open(url, '_blank');
}

// ================= USER PROFILE SETTINGS MODAL =================
function openProfileModal() {
    document.getElementById('profile-nickname-input').value = state.currentUser.nickname;
    
    const previewImg = document.getElementById('modal-avatar-img');
    const fallback = document.getElementById('modal-avatar-fallback');

    if (state.currentUser.profilePicture && state.currentUser.profilePicture.trim() !== '') {
        previewImg.src = state.currentUser.profilePicture;
        previewImg.classList.remove('hidden');
        fallback.classList.add('hidden');
    } else {
        previewImg.classList.add('hidden');
        fallback.innerText = state.currentUser.nickname.substring(0, 1);
        fallback.classList.remove('hidden');
    }

    clearProfileAlert();
    document.getElementById('profile-modal').classList.remove('hidden');
}

function closeProfileModal() {
    document.getElementById('profile-pic-file').value = '';
    document.getElementById('profile-modal').classList.add('hidden');
}

function handleProfilePicSelection(event) {
    const file = event.target.files[0];
    if (!file) return;

    const previewImg = document.getElementById('modal-avatar-img');
    const fallback = document.getElementById('modal-avatar-fallback');

    const reader = new FileReader();
    reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewImg.classList.remove('hidden');
        fallback.classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

async function handleProfileUpdate(event) {
    event.preventDefault();
    clearProfileAlert();

    const nickname = document.getElementById('profile-nickname-input').value.trim();
    const fileInput = document.getElementById('profile-pic-file');
    const file = fileInput.files[0];

    const formData = new FormData();
    formData.append('nickname', nickname);
    if (file) {
        formData.append('profilePicture', file);
    }

    try {
        const response = await fetch('/api/users/update', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.token}` },
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            state.currentUser = data;
            
            // Sync with local headers and states
            updateMyProfileUI();
            
            // Reload conversations if nickname changed
            loadFriends();
            
            showProfileAlert("Profile details updated successfully!", "success");
            setTimeout(closeProfileModal, 1500);
        } else {
            showProfileAlert(data.error || "Update failed.", "danger");
        }
    } catch (err) {
        console.error("Profile update failed:", err);
        showProfileAlert("Failed to update profile due to network issue.", "danger");
    }
}

// ================= LAYOUT HELPER ROUTINGS =================
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
    document.getElementById(pageId).classList.remove('hidden');
}

function switchAuthTab(type) {
    clearAuthAlert();
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));

    if (type === 'login') {
        document.getElementById('tab-login').classList.add('active');
        document.getElementById('login-form').classList.remove('hidden');
    } else {
        document.getElementById('tab-register').classList.add('active');
        document.getElementById('register-form').classList.remove('hidden');
    }
}

// ================= UI HELPER NOTIFIERS =================
function showAuthAlert(message, type) {
    const alertBox = document.getElementById('auth-alert');
    alertBox.innerText = message;
    alertBox.className = `alert alert-${type}`;
    alertBox.classList.remove('hidden');
}

function clearAuthAlert() {
    document.getElementById('auth-alert').classList.add('hidden');
}

function showProfileAlert(message, type) {
    const alertBox = document.getElementById('profile-alert');
    alertBox.innerText = message;
    alertBox.className = `alert alert-${type}`;
    alertBox.classList.remove('hidden');
}

function clearProfileAlert() {
    document.getElementById('profile-alert').classList.add('hidden');
}

// Sanitization of inputs to prevent script injections
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
