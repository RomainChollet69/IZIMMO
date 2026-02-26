# TODO — Plan & suivi des tâches

> Tâches en cours et à venir pour le projet Léon.

---

## En cours

_(rien en cours)_

## À faire

- [ ] **SQL migration en attente** : `ALTER TABLE sellers ADD COLUMN IF NOT EXISTS appointment_date DATE` (005)
- [ ] Retirer les console.log de debug mobile une fois stabilisé
- [ ] Tester le card deck sur différents appareils iOS et Android
- [ ] Envisager la refonte card deck pour le pipeline acquéreurs mobile
- [ ] SQL migrations en attente : `ALTER TABLE sellers ADD COLUMN rdv_done BOOLEAN DEFAULT false`
- [ ] SQL migrations en attente : `ALTER TABLE sellers ADD COLUMN contact2_name TEXT, contact2_phone TEXT, contact2_email TEXT`
- [ ] Tester filtres DPE en production (classe A-G + DPE récents)
- [ ] Vérifier chargement des départements splittés (59 Nord, 75 Paris)
- [ ] Nettoyer `pipeline-acquereurs.html` (fichier deprecated)
- [ ] Supprimer `reset-password.html` (inutilisé — auth Google uniquement)
- [ ] Mettre en place le logging structuré par module (`[DVF]`, `[Pipeline]`, `[Auth]`, `[Workflow]`)

## Terminé

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
