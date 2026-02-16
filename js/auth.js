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

// Inject dropdown CSS
(function () {
    const style = document.createElement('style');
    style.textContent = `
        .profile-menu-wrapper {
            position: relative;
        }
        .profile-menu-trigger {
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 10px;
            transition: background 0.2s;
        }
        .profile-menu-trigger:hover {
            background: rgba(0, 0, 0, 0.06);
        }
        .profile-dropdown {
            display: none;
            position: absolute;
            top: calc(100% + 8px);
            right: 0;
            background: white;
            border-radius: 10px;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
            min-width: 220px;
            z-index: 9999;
            overflow: hidden;
            animation: dropdownSlide 0.2s ease;
        }
        @keyframes dropdownSlide {
            from { opacity: 0; transform: translateY(-8px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .profile-dropdown.active {
            display: block;
        }
        .profile-dropdown-item {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            padding: 13px 18px;
            border: none;
            background: none;
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            font-weight: 500;
            color: #2C3E50;
            cursor: pointer;
            text-decoration: none;
            transition: background 0.2s;
        }
        .profile-dropdown-item:hover {
            background: #f0f2f5;
        }
        .profile-dropdown-divider {
            height: 1px;
            background: #E1E8ED;
            margin: 0;
        }
        @media (max-width: 768px) {
            .profile-dropdown {
                right: -10px;
                min-width: 180px;
            }
        }
    `;
    document.head.appendChild(style);
})();

function renderUserProfile(user) {
    const container = document.getElementById('userProfile');
    if (!container) return;

    const meta = user.user_metadata;
    const name = meta.full_name || meta.name || user.email;
    const avatar = meta.avatar_url || meta.picture || '';

    container.innerHTML = `
        <div class="profile-menu-wrapper">
            <div class="profile-menu-trigger" onclick="toggleProfileMenu(event)">
                <img src="${avatar}" alt="" class="user-avatar" referrerpolicy="no-referrer">
                <span class="user-name">${name}</span>
            </div>
            <div class="profile-dropdown" id="profileDropdown">
                <a href="parametres.html" class="profile-dropdown-item">⚙️ Paramètres</a>
                <div class="profile-dropdown-divider"></div>
                <button class="profile-dropdown-item" onclick="logout()">🚪 Déconnexion</button>
            </div>
        </div>
    `;
}

function toggleProfileMenu(e) {
    e.stopPropagation();
    const dropdown = document.getElementById('profileDropdown');
    dropdown.classList.toggle('active');
}

// Close dropdown on click outside
document.addEventListener('click', () => {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) dropdown.classList.remove('active');
});

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}
