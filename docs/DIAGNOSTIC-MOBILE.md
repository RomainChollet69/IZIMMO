# Diagnostic mobile — desktop vs mobile (vue refonte)

> Date : 2026-06-19. Objectif : cartographier les écarts entre le rendu desktop et le rendu mobile des pages clés, en vue d'une **refonte mobile assumée**. Ne contient aucune modification de code, c'est un état des lieux priorisé.

---

## 0. Constat central

Le mobile n'est **pas** du CSS responsive sur le même HTML. Sur les pages lourdes, il existe **deux chemins de rendu séparés**, branchés sur `isMobile()` (`window.innerWidth <= 768`) :

| Page | Rendu desktop | Rendu mobile (séparé) |
|---|---|---|
| Vendeurs | `createLeadCard()` → `.lead-card` (dépliable) | `createMobileCard()` → `.deck-card` + overlay détail |
| Acquéreurs | `.lead-card` responsive + JS conditionnel | layout flex 100vw/colonne + `.mobile-*` |
| Visites | `renderPropertyAccordion()` → `.accordion-*` (riche) | `renderMobile*()` → `.mv-*` (appauvri) |
| Accueil/Nav | `app.html` (shell multi-onglets persistants) | `home.html` (tuiles) + rechargement complet par page |

Conséquence : chaque évolution faite côté desktop ne « descend » pas automatiquement sur mobile, et le mobile a accumulé du retard fonctionnel + un sentiment de « fouillis » (infos clés masquées, actions enterrées, contacts noyés). C'est la cause racine de la perception « version mobile à l'abandon ».

---

## 1. VISITES — priorité n°1 (douleur signalée : « je ne vois pas les contacts »)

Rendu desktop riche (`renderPropertyAccordion` ~ligne 3468) vs rendu mobile `mv-*` (`renderMobilePropertyGroups` ligne 2841, `renderMobileVisitItem` ligne 2925).

| Écart | Desktop | Mobile | Gravité |
|---|---|---|---|
| Ligne stats par bien (✉ contacts · ✓ traités · 👁 visites · 📅 planifiées · 🔥 retours) | toujours visible (l.1356-1369) | **absente** | CRITIQUE |
| Boutons d'action par bien | 3 : message groupé ✈️, partager, ajouter contact 👤➕ (l.616-635) | **1 seul** (partager) | CRITIQUE |
| Contacts (leads portail/manuel) | section distincte, cartes `contact-card-*` draggables, source + date + tel + email + statut traité + note (`renderContactCard` l.3734) | **noyés dans la liste plate des visites** (`renderMobileVisitItem`), source confondue avec l'heure, date/email perdus, pas de drag | CRITIQUE |
| Drag contact → planifier visite | oui | absent | MOYEN |
| Archive / demandes traitées | sidebar `.processed-requests-view` | `display:none` (l.2270), accès via FAB seulement | MOYEN |

**Refonte cible Visites mobile :** dans chaque bien déplié, séparer visuellement **« Contacts à traiter »** (groupe dédié avec badge source, date, tel+email, bouton « planifier visite » / « marquer traité ») et **« Visites »**. Remonter la ligne stats sur l'en-tête du bien. Ajouter les boutons **message groupé** et **ajouter contact** à l'en-tête mobile.

---

## 2. PIPELINE VENDEURS — priorité n°2

`createLeadCard()` (l.8544) vs `createMobileCard()` (l.6657, `.deck-card`). Le deck mobile perd des infos métier présentes sur desktop :

| Info / action | Desktop | Mobile deck | Gravité |
|---|---|---|---|
| Badge matching 🎯 (+ accès direct) | oui (l.8656) | **absent du deck** | MOYEN |
| Badge « Off Market » | oui (l.8591) | absent | MINEUR |
| « via [parrain] » (recommandation) | oui (l.8582) | absent | MOYEN |
| Type de mandat (exclusif/simple) | oui (vue étendue) | seulement overlay détail | MOYEN |
| Agence + URL concurrent | oui (vue étendue) | seulement overlay détail | MOYEN |
| Édition inline commission | clic → input (l.8612) | non éditable, faut ouvrir la modale | MOYEN |
| Déplacer un lead | drag & drop | popup « Déplacer vers… » | MOYEN (friction) |

**Note :** la bottom sheet de détail mobile est déjà très bonne. Le problème est la **carte deck** trop pauvre + l'absence de drag.

---

## 3. PIPELINE ACQUÉREURS — priorité n°2 (même famille)

Layout mobile = flex 100vw/colonne + nav par onglets. Écarts notables :

| Info / action | Desktop | Mobile | Gravité |
|---|---|---|---|
| Drag & drop entre colonnes | actif | théoriquement actif mais **neutralisé** par le scroll `touch-action: pan-y` (l.2573) → en pratique inutilisable | CRITIQUE |
| Bouton « Déplacer » 📂 | n/a | visible **seulement** une fois la carte dépliée (l.2288/2649/6028) → friction | MOYEN |
| Barre outils (import screenshot / export) | visible | `display:none` (l.87/113) | MOYEN |
| Barre recherche | toujours visible | masquée derrière l'icône 🔍 (discoverability faible) | MOYEN |
| Formulaire public acquéreur | intégré | non rendu sur mobile | MOYEN |
| Header | 1 ligne propre | grille 3 lignes dense (l.2361-2445), serrée | MOYEN (fouillis) |

---

## 4. ACCUEIL & NAVIGATION — priorité n°3 (cause du « pas optimisé » global)

| Aspect | Desktop (`app.html` + `tab-shell.js`) | Mobile (`home.html` + `mobile-nav.js`) | Gravité |
|---|---|---|---|
| Modèle de navigation | onglets persistants (iframes vivantes) | **rechargement complet** à chaque page | HAUTE |
| Conservation du contexte (scroll, filtres, formulaire) | conservé | **réinitialisé** à chaque navigation | HAUTE |
| Vitesse perçue | switch instantané | rechargement ~1-2s | HAUTE |
| Accès « Accueil » | logo cliquable permanent | **aucun lien direct** dans la bottom nav | MOYENNE |
| Recherche globale, micro, relances, todo | présents | présents (code partagé) | OK |

**Refonte cible nav :** réduire la douleur du rechargement (conservation d'état via sessionStorage/URL, ou cache, voire un shell mobile léger), et ajouter un accès « Accueil » dans la bottom nav.

---

## 5. Thèmes transverses (ce qui crée le « fouillis »)

1. **Perte d'info métier sur les cartes mobiles** : matching, off-market, mandat, concurrent, parrain (pipelines) ; stats portail + source/date/email des contacts (visites).
2. **Actions clés enterrées** : déplacer (popup au lieu de drag), message groupé / ajouter contact absents sur Visites mobile, édition inline perdue, drag-to-plan perdu.
3. **Contacts indistincts des visites** sur mobile (même composant, même apparence).
4. **Navigation qui perd le contexte** (rechargement complet, pas d'accès accueil rapide).
5. **Discoverability** : recherche cachée, onglets de colonnes comme seul repère, header acquéreurs dense.

---

## 6. Roadmap de refonte proposée (à valider)

| Lot | Contenu | Effort | Impact |
|---|---|---|---|
| **L1 — Visites mobile** | Contacts en section dédiée + actions (planifier/traiter), ligne stats par bien, boutons message groupé + ajouter contact sur l'en-tête | Moyen | Très fort (douleur n°1) |
| **L2 — Cartes pipelines** | Remonter sur le deck : matching 🎯, off-market, parrain, mandat ; déplacement plus rapide ; édition rapide commission | Moyen | Fort |
| **L3 — Déplacement & gestes** | Drag&drop tactile fiable OU action « déplacer » accessible sans déplier (les deux pipelines) | Moyen | Fort |
| **L4 — Navigation** | Conservation d'état entre pages + accès Accueil dans la bottom nav | Moyen/Élevé | Fort (perception « optimisé ») |
| **L5 — Discoverability & densité** | Recherche plus visible, header acquéreurs allégé, repère de colonne | Faible | Moyen |

---

## 7. Décisions à valider avant de coder

1. **Ordre des lots** : commencer par L1 (Visites) puis L2/L3 (pipelines), L4 (nav) ensuite ? 
2. **Niveau d'ambition par lot** : combler les écarts (rapide, itératif) vs refonte UX complète page par page (plus long).
3. **Navigation (L4)** : effort potentiellement élevé (shell mobile / state management). À garder pour la fin ou à sortir du scope dans un premier temps ?
4. **Drag&drop tactile** : le réparer (lib `touch-drag-drop.js` déjà présente) ou assumer une action « déplacer » rapide sans drag sur mobile ?
