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

// ===== MOBILE HEADER (logo + prénom + photo/initiale) =====
function renderMobileHeader(user) {
    // Skip if page already has its own mobile header (micro.html)
    if (document.querySelector('.header-mobile')) return;
    // Skip if no desktop header to replace
    const desktopHeader = document.querySelector('.header') || document.querySelector('.header-desktop');
    if (!desktopHeader) return;

    const meta = user.user_metadata || {};
    const fullName = meta.full_name || meta.name || user.email.split('@')[0];
    const firstName = fullName.split(' ')[0];
    const avatarUrl = meta.avatar_url || meta.picture || '';
    const avatarHTML = avatarUrl
        ? `<img src="${avatarUrl}" alt="${firstName}" class="mobile-hdr-avatar" referrerpolicy="no-referrer">`
        : `<div class="mobile-hdr-initial">${firstName.charAt(0).toUpperCase()}</div>`;

    const mobileHeader = document.createElement('div');
    mobileHeader.className = 'header-mobile';
    mobileHeader.innerHTML = `
        <a href="home.html" class="logo-mobile">
            <img src="img/Logo_leon.svg" alt="Léon">
        </a>
        <div class="mobile-hdr-user" id="mobileHdrUser">
            <span class="mobile-hdr-name">${firstName}</span>
            ${avatarHTML}
            <div class="mobile-hdr-dropdown" id="mobileHdrDropdown">
                <a href="parametres.html" class="mobile-hdr-dropdown-item">Paramètres</a>
                <button class="mobile-hdr-dropdown-item" onclick="logout()">Déconnexion</button>
            </div>
        </div>
    `;
    desktopHeader.parentNode.insertBefore(mobileHeader, desktopHeader.nextSibling);

    // Toggle mobile dropdown on user area tap
    const mobileUser = mobileHeader.querySelector('#mobileHdrUser');
    mobileUser.addEventListener('click', function(e) {
        e.stopPropagation();
        const dd = document.getElementById('mobileHdrDropdown');
        if (dd) dd.classList.toggle('active');
    });
    document.addEventListener('click', function() {
        const dd = document.getElementById('mobileHdrDropdown');
        if (dd) dd.classList.remove('active');
    });

    // Inject mobile header CSS
    const style = document.createElement('style');
    style.textContent = `
        .header-mobile {
            display: none;
            padding: 16px 24px;
            align-items: center;
            justify-content: space-between;
            background: #fff;
        }
        .header-mobile .logo-mobile {
            display: flex; align-items: center; text-decoration: none;
        }
        .header-mobile .logo-mobile img { height: 28px; width: auto; }
        .mobile-hdr-user {
            display: flex; align-items: center; gap: 8px;
        }
        .mobile-hdr-name {
            font-family: 'Inter', sans-serif;
            font-size: 15px; font-weight: 500; color: #64748B;
        }
        .mobile-hdr-avatar {
            width: 34px; height: 34px; border-radius: 50%;
            object-fit: cover; border: 2px solid #E5E7EB;
        }
        .mobile-hdr-initial {
            width: 34px; height: 34px; border-radius: 50%;
            background: #243b53; color: white;
            display: flex; align-items: center; justify-content: center;
            font-size: 14px; font-weight: 600; font-family: 'Inter', sans-serif;
        }
        .mobile-hdr-user {
            position: relative; cursor: pointer;
        }
        .mobile-hdr-dropdown {
            display: none;
            position: absolute;
            top: calc(100% + 8px);
            right: 0;
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.15);
            min-width: 180px;
            z-index: 1000;
            overflow: hidden;
        }
        .mobile-hdr-dropdown.active {
            display: block;
            animation: dropdownSlide 0.2s ease;
        }
        .mobile-hdr-dropdown-item {
            display: block; width: 100%;
            padding: 14px 20px;
            font-family: 'Inter', sans-serif;
            font-size: 14px; font-weight: 500;
            color: #334155;
            background: none; border: none;
            text-align: left; text-decoration: none;
            cursor: pointer;
        }
        .mobile-hdr-dropdown-item:hover,
        .mobile-hdr-dropdown-item:active {
            background: #F1F5F9;
        }
        .mobile-hdr-dropdown-item + .mobile-hdr-dropdown-item {
            border-top: 1px solid #E2E8F0;
        }
        @media (max-width: 768px) {
            .header-mobile { display: flex; }
            .header, .header-desktop { display: none !important; }
        }
    `;
    document.head.appendChild(style);
}
