// Auth guard + user profile + dropdown menu for protected pages
// Include this script AFTER supabase-config.js on protected pages only

(async function () {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    renderUserProfile(session.user);
    renderMobileHeader(session.user);

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
            <div id="exportInsertPoint"></div>
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

// ===== MOBILE HEADER (.m-header — styles dans css/mobile.css) =====
function renderMobileHeader(user) {
    // Skip si la page a déjà un .m-header ou un .header-mobile legacy
    if (document.querySelector('.m-header') || document.querySelector('.header-mobile')) return;
    // Skip si pas de header desktop à remplacer
    const desktopHeader = document.querySelector('.header') || document.querySelector('.header-desktop');
    if (!desktopHeader) return;

    const meta = user.user_metadata || {};
    const fullName = meta.full_name || meta.name || user.email.split('@')[0];
    const firstName = fullName.split(' ')[0];
    const avatarUrl = meta.avatar_url || meta.picture || '';
    const avatarHTML = avatarUrl
        ? `<img src="${avatarUrl}" alt="${firstName}" class="m-header-avatar" referrerpolicy="no-referrer">`
        : `<div class="m-header-initial">${firstName.charAt(0).toUpperCase()}</div>`;

    const mobileHeader = document.createElement('header');
    mobileHeader.className = 'm-header';
    mobileHeader.innerHTML = `
        <a href="home.html" class="m-header-logo">
            <img src="img/Logo_leon.svg" alt="Léon">
        </a>
        <div class="m-header-right" id="mHeaderRight">
            <span class="m-header-name">${firstName}</span>
            ${avatarHTML}
            <div class="m-header-dropdown" id="mHeaderDropdown">
                <a href="parametres.html" class="m-header-dropdown-item">Paramètres</a>
                <button class="m-header-dropdown-item" onclick="logout()">Déconnexion</button>
            </div>
        </div>
    `;
    desktopHeader.parentNode.insertBefore(mobileHeader, desktopHeader);

    // Toggle dropdown on user area tap
    const userArea = mobileHeader.querySelector('#mHeaderRight');
    userArea.addEventListener('click', function (e) {
        e.stopPropagation();
        const dd = document.getElementById('mHeaderDropdown');
        if (dd) dd.classList.toggle('active');
    });
    document.addEventListener('click', function () {
        const dd = document.getElementById('mHeaderDropdown');
        if (dd) dd.classList.remove('active');
    });
}
