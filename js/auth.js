// Auth guard + user profile + dropdown menu for protected pages
// Include this script AFTER supabase-config.js on protected pages only

(async function () {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    renderUserProfile(session.user);

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
            window.location.href = 'login.html';
        }
    });
})();

// Inject dropdown CSS (if not already in page CSS)
(function () {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes dropdownSlide {
            from { opacity: 0; transform: translateY(-8px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);
})();

function renderUserProfile(user) {
    const container = document.getElementById('userProfile');
    if (!container) return;

    const meta = user.user_metadata;
    const name = meta.full_name || meta.name || user.email.split('@')[0];
    const avatar = meta.avatar_url || meta.picture || '';

    const avatarHTML = avatar
        ? `<img src="${avatar}" alt="" class="user-avatar" referrerpolicy="no-referrer">`
        : `<div class="user-initials">${name.charAt(0).toUpperCase()}</div>`;

    container.innerHTML = `
        ${avatarHTML}
        <span class="user-name">${name}</span>
        <div class="user-dropdown" id="userDropdown">
            <a href="parametres.html" class="user-dropdown-item">Paramètres</a>
            <div class="export-dropdown-separator"></div>
            <button class="user-dropdown-item" onclick="logout()">Déconnexion</button>
        </div>
    `;

    // Add click handler to toggle dropdown
    container.addEventListener('click', toggleUserMenu);
}

function toggleUserMenu(e) {
    e.stopPropagation();
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) dropdown.classList.toggle('active');
}

// Close dropdown on click outside
document.addEventListener('click', () => {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) dropdown.classList.remove('active');
});

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}
