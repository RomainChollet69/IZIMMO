# LESSONS — Erreurs passées & règles apprises

> Chaque correction de l'utilisateur est enregistrée ici pour éviter de répéter les mêmes erreurs.

---

## Règles du projet

1. **Toujours push sur GitHub à la fin de chaque action** — le déploiement Vercel est automatique
2. **Documentation obligatoire** — mettre à jour `docs/` à chaque changement structurel
3. **Résumé de session** — ajouter une entrée dans `docs/CHANGELOG.md` à chaque fin de session
4. **Plan mode par défaut** — entrer en plan mode pour toute tâche non triviale (3+ étapes)

---

## Leçons apprises

### L001 — CSS `display: none` et `style.display = ''` (2026-02-24)
**Erreur** : Mettre `display: none` dans le CSS d'un élément, puis essayer de le montrer avec `el.style.display = ''` ne fonctionne pas — le style inline vide retombe sur la règle CSS qui est toujours `none`.
**Règle** : Toujours utiliser une valeur explicite (`'block'`, `'flex'`) quand on montre un élément dont le CSS par défaut est `display: none`.

### L002 — Tableaux vides sont truthy en JS (2026-02-24)
**Erreur** : `if (allLeads)` retourne `true` même si `allLeads = []`. Un premier chargement qui retourne un tableau vide empoisonne le cache — toutes les requêtes suivantes sautent le fetch.
**Règle** : Toujours vérifier `array && array.length > 0` pour les caches de données.

### L003 — `showTranscription()` doit réinitialiser tous les états d'affichage (2026-02-24)
**Erreur** : `enterEditMode()` cachait `transcriptionText` avec `display: none`, mais `showTranscription()` ne le remettait pas. Le texte disparaissait à la 2e dictée.
**Règle** : Toute fonction qui "reset" un composant doit remettre TOUS les sous-éléments à leur état initial, pas seulement ceux qu'elle modifie directement.

### L004 — Commission immobilière : pas d'honoraires sur les honoraires (2026-02-24)
**Erreur** : `commission = prix × taux%` est faux. On ne prend pas d'honoraires sur les honoraires.
**Règle** : `commission = prix FAI - (prix FAI / (1 + taux/100))`. Le taux s'applique sur le net vendeur. Utiliser `calcCommission()` et `calcRateFromAmount()` définis dans `supabase-config.js`.
