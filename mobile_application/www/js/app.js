// js/app.js
function resolveApiBase() {
    const custom = localStorage.getItem('api_server');
    if (custom) return custom.replace(/\/+$/, '');
    if (window.location.protocol === 'file:') {
        // Default Android emulator/device loopback or LAN IP
        return 'http://10.0.2.2/title-deeds-system/api';
    }
    return 'api';
}
const API_BASE = resolveApiBase();

window.setApiServer = function(url) {
    if (url) {
        localStorage.setItem('api_server', url);
        alert('Server API updated to: ' + url);
        window.location.reload();
    } else {
        localStorage.removeItem('api_server');
        alert('Server API reset to default.');
        window.location.reload();
    }
};

async function apiCall(endpoint, method = 'GET', body = null, isFormData = false) {
    const token = localStorage.getItem('jwt');
    const headers = {};
    if (!isFormData) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = { method, headers };
    if (body) config.body = isFormData ? body : JSON.stringify(body);

    try {
        const response = await fetch(`${API_BASE}/${endpoint}`, config);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || data.error || 'API Error');
        return data;
    } catch (error) {
        console.error('API Call Failed:', error);
        throw error;
    }
}

function checkAuth() {
    const token = localStorage.getItem('jwt');
    const user = JSON.parse(localStorage.getItem('user'));
    if (!token || !user) {
        window.location.href = 'index.html';
    }
    return user;
}

function logout() {
    localStorage.removeItem('jwt');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

function getStageBadge(stage) {
    const map = {
        'SUBMITTED': 'badge-pending',
        'VERIFIED': 'badge-verified',
        'ZLC_CLEARED': 'badge-cleared',
        'SURVEYED': 'badge-verified',
        'PAID': 'badge-cleared',
        'DEED_ISSUED': 'badge-cleared'
    };
    return `<span class="badge ${map[stage] || 'badge-pending'}">${stage}</span>`;
}
