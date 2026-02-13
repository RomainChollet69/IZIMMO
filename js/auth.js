// Auth guard + user profile for protected pages
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

function renderUserProfile(user) {
    const container = document.getElementById('userProfile');
    if (!container) return;

    const meta = user.user_metadata;
    const name = meta.full_name || meta.name || user.email;
    const avatar = meta.avatar_url || meta.picture || '';

    container.innerHTML = `
        <img src="${avatar}" alt="" class="user-avatar" referrerpolicy="no-referrer">
        <span class="user-name">${name}</span>
        <button class="logout-btn" onclick="logout()" title="Déconnexion">✕</button>
    `;
}

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}
