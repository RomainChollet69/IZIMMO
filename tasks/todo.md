# TODO — Plan & suivi des tâches

> Tâches en cours et à venir pour le projet Léon.

---

## En cours

_(rien en cours)_

## À faire

### Matching / Visites
- [ ] Tester le rendu des chips visite avec différents retours (feedback, prix, points, décision)
- [ ] Vérifier le deep-link acquéreur depuis les cartes visite (clic nom → fiche)
- [ ] Tester le micro avec tous les champs vendeur (source recommandation + referrer_name)

### Messages IA
- [ ] Tester le retour visite avec différents feedback_rating (coup de coeur vs pas convaincu)
- [ ] Tester les 3 canaux (SMS, WhatsApp, Email) avec tu et vous
- [ ] Vérifier que la signature agent fonctionne sur les deux pages
- [ ] Tester le bouton "Demander un retour" depuis une visite effectuée (popup + génération)
- [ ] Vérifier que le vouvoiement ne produit plus de "Salut" / langage familier
- [ ] Tester l'ouverture auto de SMS/WhatsApp/Email sur mobile (iOS + Android)

### Acquéreurs
- [ ] Vérifier que l'import CSV acquéreurs fonctionne (jamais confirmé)

### Debug cleanup
- [ ] Retirer les console.log de debug visites (index.html + acquereurs.html)

### DVF
- [ ] Tester la page DVF sur mobile (responsive 375px) — responsive revu mais pas testé en conditions réelles
- [ ] Envisager d'augmenter `MAX_PARCELS` progressivement (actuellement 500, clustering supporte plus)
- [ ] Tester le clustering avec des zones à haute densité (Paris, Lyon centre)

### Pipeline
- [ ] Retirer les console.log de debug mobile une fois stabilisé
- [ ] Tester le card deck sur différents appareils iOS et Android
- [ ] Envisager la refonte card deck pour le pipeline acquéreurs mobile

### Migrations SQL en attente
- [ ] `ALTER TABLE sellers ADD COLUMN IF NOT EXISTS appointment_date DATE` (005)
- [ ] `ALTER TABLE sellers ADD COLUMN rdv_done BOOLEAN DEFAULT false`
- [ ] `ALTER TABLE sellers ADD COLUMN contact2_name TEXT, contact2_phone TEXT, contact2_email TEXT`

### Nettoyage
- [ ] Nettoyer requête `gamification_profiles` dans parametres.html (table probablement inutilisée)
- [ ] Archiver bonmatin.html quand l'utilisateur le demande
- [ ] Mettre en place le logging structuré par module (`[DVF]`, `[Pipeline]`, `[Auth]`, `[Workflow]`)

### Assistant Vocal (micro.html) — Prochaines étapes
- [ ] Gérer les cas vocaux agenda : "planifie une visite vendredi 14h avec M. Dupont" → Google Calendar + CRM
- [ ] Gérer les cas vocaux visites : "visite faite ce matin chez Dupont" → table visits
- [ ] Gérer les cas vocaux rappels : "relance M. Martin dans 10 jours" → reminder_date
- [ ] Tester l'onboarding sur mobile iOS/Android en conditions réelles

## Terminé

- [x] Refonte visuelle onglet Matching : chips colorées, cartes aérées, boutons discrets, barres fines
- [x] Nom acquéreur cliquable dans cartes visite (deep-link openLead)
- [x] Match cards deep-link vers fiche acquéreur/vendeur
- [x] Champ rooms (pièces) vendeurs : formulaire, carte, micro, SQL migration
- [x] Fix ordering cartes (prepend → appendChild + nullsFirst)
- [x] Fix scroll chaining (overscroll-behavior-y: none)
- [x] Fix Leon doublon (FAB désactivé)
- [x] Auto-close micro modal après création lead
- [x] Card cleanup (suppression À RELANCER, match indicator compact, max-height 150px)
- [x] Header acquéreurs aligné sur vendeurs (bouton Lead dans search-bar-section)
- [x] Bouton + Lead positionné identique sur les deux pipelines
- [x] Actions rapides widget relances (snooze +7j / dismiss) + fix arrondissements 1er/2e
- [x] Date de RDV vendeur + auto-relance J+15 (appointment_date, badge vert, constante 15j)
- [x] Fix CSS iOS WebKit pour card deck (préfixes -webkit-, suppression propriétés problématiques)
- [x] Ajout dropdown déconnexion dans le header mobile (auth.js)
- [x] Diagnostic et résolution du bug login OAuth (Client Secret Google changé)
- [x] Headers anti-cache vercel.json + meta tags + cache-busting scripts
- [x] Résolution cache Chrome iOS (nécessite réinstallation de Chrome)
- [x] Créer `CLAUDE.md` — règles de comportement Claude Code
- [x] Créer `docs/ARCHITECTURE.md` — architecture complète du projet
- [x] Créer `docs/DECISIONS.md` — journal des choix techniques
- [x] Créer `docs/API-MAP.md` — cartographie des endpoints et APIs
- [x] Créer `docs/CHANGELOG.md` — historique horodaté
- [x] Créer `tasks/todo.md` et `tasks/lessons.md`
- [x] Fix InfoWindow whitespace DPE (CSS aggressif)
- [x] Fix filtres DPE invisibles (sortis du panel repliable)
- [x] Fix sidebar overflow quand DPE + DVF actifs ensemble
- [x] Extraction complète DPE (14.1M, 96 départements)
- [x] Upload DPE vers Supabase Storage (97 fichiers, 1.34 Go)
- [x] Support fichiers DPE splittés (59, 75)
- [x] En-têtes documentation sur tous les fichiers HTML/JS
- [x] Simplification produit : archivage pages obsolètes (leon, assistant, bonmatin, pipeline-acquereurs, reset-password)
- [x] Suppression js/gamification.js de toutes les pages
- [x] home.html : redirection mobile → micro.html, nettoyage tuiles
- [x] micro.html : renommage Micro → Vocal, onboarding première connexion
- [x] mobile-nav.js : nettoyage menu Plus (suppression pages archivées)
