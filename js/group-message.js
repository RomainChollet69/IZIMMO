/**
 * group-message.js
 * Modale de message groupé (Email BCC / WhatsApp / SMS), 100% client (mailto / wa.me / sms).
 * Réutilisable sur n'importe quelle page, sans dépendance aux globals : GroupMessage.open({...}).
 *   recipients : [{ first_name, last_name, civility, email, phone }]
 *   context    : { adresse, prix, ville, type }  → pré-remplit [adresse]/[prix]/[ville]/[type]
 *   defaultTemplate : 'baisse_prix' | 'nouveau_bien' | 'visite_groupee' | 'libre' (def: baisse_prix)
 * Pourquoi client-only : pas d'envoi serveur, on ouvre la messagerie native de l'agent
 * (mailto en cci, wa.me, sms:) — l'agent garde la main et l'envoi part de son adresse.
 */
(function () {
    const TEMPLATES = {
        baisse_prix: {
            label: '📉 Baisse de prix',
            subject: 'Baisse de prix sur un bien qui pourrait vous intéresser',
            body: `Bonjour [salutation],

Je vous contacte rapidement : le prix du bien situé [adresse] vient d'être révisé à la baisse, à [prix].

Compte tenu de vos critères, je pense qu'il pourrait vraiment vous correspondre. Souhaitez-vous une visite ?

Très cordialement,`
        },
        nouveau_bien: {
            label: '🏠 Nouveau bien',
            subject: 'Nouveau bien à votre attention',
            body: `Bonjour [salutation],

J'ai rentré un nouveau bien qui correspond à votre recherche : [type] à [ville] à [prix].

Souhaitez-vous que je vous envoie le dossier complet ?

Très cordialement,`
        },
        visite_groupee: {
            label: '📅 Visite groupée',
            subject: 'Proposition de visite',
            body: `Bonjour [salutation],

Je vous propose une visite du bien situé [adresse] le [date].

Pouvez-vous me confirmer votre disponibilité ?

Très cordialement,`
        },
        libre: { label: '✏️ Message libre', subject: '', body: '' }
    };

    let recipients = [];   // destinataires courants
    let context = {};      // contexte du bien

    function salutation(r) {
        const last = (r.last_name || '').trim();
        const civ = (r.civility || '').trim();
        if (civ && last) return `${civ} ${last}`;
        if (last) return last;
        return '';
    }

    // [salutation]/[prénom]/[nom] personnalisés par destinataire (au moment de l'envoi WhatsApp/SMS)
    function personalize(tpl, r) {
        return tpl
            .replace(/\[salutation\]/g, salutation(r) || 'à vous')
            .replace(/\[prénom\]/gi, r.first_name || '')
            .replace(/\[nom\]/gi, r.last_name || '');
    }

    function formatPrice(p) {
        const n = parseInt(String(p == null ? '' : p).replace(/[^\d]/g, ''), 10);
        return isNaN(n) ? '' : n.toLocaleString('fr-FR') + ' €';
    }

    // Remplit les variables du bien ([adresse]/[prix]/[ville]/[type]) ; laisse [salutation]/[date].
    function fillContext(text) {
        const c = context || {};
        const prix = c.prix ? formatPrice(c.prix) : '';
        return text
            .replace(/\[adresse\]/g, c.adresse || '[adresse]')
            .replace(/\[prix\]/g, prix || '[prix]')
            .replace(/\[ville\]/g, c.ville || '[ville]')
            .replace(/\[type\]/g, c.type || '[type]');
    }

    function ensureStyles() {
        if (document.getElementById('lgm-styles')) return;
        const s = document.createElement('style');
        s.id = 'lgm-styles';
        s.textContent = `
            .lgm-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px}
            .lgm-card{background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:90vh;overflow:auto;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:Inter,sans-serif}
            .lgm-card select,.lgm-card input,.lgm-card textarea{width:100%;padding:11px 12px;border:1.5px solid #E1E8ED;border-radius:10px;font-family:Inter,sans-serif;font-size:13px;color:#334155;box-sizing:border-box}
            .lgm-card label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px}
            .lgm-chip{display:inline-block;padding:3px 9px;background:#EEF2FF;color:#4F46E5;border-radius:999px;font-size:12px;cursor:pointer;border:1px solid #E0E7FF}
            .lgm-chip:hover{background:#E0E7FF}
            .lgm-btn{flex:1;padding:11px;border:none;border-radius:10px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;font-family:Inter,sans-serif}
            .lgm-btn[disabled]{opacity:.4;cursor:not-allowed}
        `;
        document.head.appendChild(s);
    }

    function close() {
        const m = document.getElementById('lgmModal');
        if (m) m.remove();
    }

    function insertVar(v) {
        const ta = document.getElementById('lgmBody');
        if (!ta) return;
        const start = ta.selectionStart || 0, end = ta.selectionEnd || 0;
        ta.value = ta.value.substring(0, start) + v + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = start + v.length;
        ta.focus();
    }

    function toast(msg) {
        if (typeof window.showToast === 'function') window.showToast(msg);
    }

    async function send(channel) {
        const subject = (document.getElementById('lgmSubject') || {}).value || '';
        const bodyTemplate = ((document.getElementById('lgmBody') || {}).value || '').trim();
        if (!bodyTemplate) { alert('Merci de saisir un message.'); return; }

        if (channel === 'email') {
            const emails = recipients.filter(r => r.email).map(r => r.email);
            if (!emails.length) { alert('Aucun destinataire avec email.'); return; }
            // 1 email en cci (les destinataires ne se voient pas) → pas de perso par personne
            const generic = bodyTemplate.replace(/\[salutation\]/g, 'à vous');
            window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(','))}`
                + `&subject=${encodeURIComponent(subject.trim())}&body=${encodeURIComponent(generic)}`;
            toast(`Email préparé pour ${emails.length} destinataire${emails.length > 1 ? 's' : ''}`);
            close();
            return;
        }

        const withPhone = recipients.filter(r => r.phone);
        if (!withPhone.length) { alert('Aucun destinataire avec téléphone.'); return; }
        if (withPhone.length > 10 && !confirm(`Vous allez ouvrir ${withPhone.length} conversations ${channel.toUpperCase()} successivement. Continuer ?`)) return;

        close();
        toast(`Préparation de ${withPhone.length} ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}...`);
        for (let i = 0; i < withPhone.length; i++) {
            const r = withPhone[i];
            const text = personalize(bodyTemplate, r);
            let url;
            if (channel === 'whatsapp') {
                const phone = r.phone.replace(/[\s.\-]/g, '').replace(/^0/, '33');
                url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
            } else {
                url = `sms:${r.phone}?body=${encodeURIComponent(text)}`;
            }
            window.open(url, '_blank');
            if (i < withPhone.length - 1) await new Promise(res => setTimeout(res, 400));
        }
    }

    function open(opts) {
        opts = opts || {};
        recipients = (opts.recipients || []).filter(Boolean);
        context = opts.context || {};
        if (!recipients.length) { alert('Aucun contact avec fiche acquéreur pour ce bien.'); return; }

        ensureStyles();
        close();

        const withEmail = recipients.filter(r => r.email).length;
        const withPhone = recipients.filter(r => r.phone).length;
        const n = recipients.length;

        const overlay = document.createElement('div');
        overlay.className = 'lgm-overlay';
        overlay.id = 'lgmModal';
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        overlay.innerHTML = `
            <div class="lgm-card">
                <h3 style="margin:0 0 4px;font-size:17px;font-weight:700;color:#2C3E50">
                    <i class="fa-solid fa-paper-plane" style="color:#10B981"></i> Message groupé
                </h3>
                <div style="font-size:13px;color:#64748b;margin-bottom:14px">
                    ${n} destinataire${n > 1 ? 's' : ''} · <span style="color:#10B981">${withEmail} email</span> · <span style="color:#10B981">${withPhone} téléphone</span>
                </div>
                <label>Template</label>
                <select id="lgmTemplate" style="margin-bottom:14px">
                    ${Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join('')}
                </select>
                <label>Objet (email)</label>
                <input type="text" id="lgmSubject" style="margin-bottom:14px">
                <label>Message</label>
                <textarea id="lgmBody" rows="9" style="resize:vertical;margin-bottom:8px"></textarea>
                <details style="margin-bottom:14px">
                    <summary style="font-size:12px;color:#64748B;cursor:pointer;user-select:none;padding:6px 0">
                        <i class="fa-solid fa-circle-info" style="font-size:11px"></i> Variables disponibles
                    </summary>
                    <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">
                        <span class="lgm-chip" onclick="GroupMessage._insertVar('[salutation]')">[salutation]</span>
                        <span class="lgm-chip" onclick="GroupMessage._insertVar('[adresse]')">[adresse]</span>
                        <span class="lgm-chip" onclick="GroupMessage._insertVar('[prix]')">[prix]</span>
                        <span class="lgm-chip" onclick="GroupMessage._insertVar('[ville]')">[ville]</span>
                        <span class="lgm-chip" onclick="GroupMessage._insertVar('[type]')">[type]</span>
                        <span class="lgm-chip" onclick="GroupMessage._insertVar('[date]')">[date]</span>
                    </div>
                </details>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button type="button" class="lgm-btn" style="background:#667eea" ${withEmail === 0 ? 'disabled' : ''} onclick="GroupMessage._send('email')"><i class="fa-solid fa-envelope"></i> Email (${withEmail})</button>
                    <button type="button" class="lgm-btn" style="background:#25D366" ${withPhone === 0 ? 'disabled' : ''} onclick="GroupMessage._send('whatsapp')"><i class="fa-brands fa-whatsapp"></i> WhatsApp (${withPhone})</button>
                    <button type="button" class="lgm-btn" style="background:#22c55e" ${withPhone === 0 ? 'disabled' : ''} onclick="GroupMessage._send('sms')"><i class="fa-solid fa-comment-sms"></i> SMS (${withPhone})</button>
                </div>
                <button type="button" onclick="GroupMessage._close()" style="width:100%;margin-top:8px;padding:10px;background:none;border:1.5px solid #E1E8ED;border-radius:10px;font-size:13px;color:#64748b;cursor:pointer;font-family:Inter,sans-serif">Annuler</button>
            </div>`;
        document.body.appendChild(overlay);

        const sel = document.getElementById('lgmTemplate');
        const applyTemplate = () => {
            const t = TEMPLATES[sel.value] || TEMPLATES.libre;
            document.getElementById('lgmSubject').value = t.subject;
            document.getElementById('lgmBody').value = fillContext(t.body);
        };
        sel.addEventListener('change', applyTemplate);
        sel.value = TEMPLATES[opts.defaultTemplate] ? opts.defaultTemplate : 'baisse_prix';
        applyTemplate();
    }

    window.GroupMessage = { open, _send: send, _insertVar: insertVar, _close: close };
})();
