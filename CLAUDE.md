# CLAUDE.md — Project Intelligence

> Ce fichier définit les règles de comportement de Claude Code sur ce projet.
> À placer à la racine de chaque repo.

---

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

## Documentation Vivante (OBLIGATOIRE)

> L'objectif : n'importe qui (ou toi-même dans 6 mois) doit pouvoir comprendre
> l'architecture, le pourquoi des choix, et debugger un problème en < 30 minutes.

### Fichiers de documentation à maintenir

| Fichier | Rôle | Quand le mettre à jour |
|---|---|---|
| `docs/ARCHITECTURE.md` | Vision macro : arborescence, flux de données, schéma BDD, APIs externes | À chaque ajout de module, changement de structure, ou nouvelle intégration |
| `docs/DECISIONS.md` | Journal des choix techniques : pourquoi X plutôt que Y | À chaque décision non triviale (lib, pattern, structure) |
| `docs/CHANGELOG.md` | Log horodaté des modifications avec fichiers touchés | À chaque session de travail |
| `docs/API-MAP.md` | Cartographie des endpoints, APIs externes, webhooks utilisés | À chaque ajout/modification d'API |

### Règles de documentation inline

- **Chaque fichier** commence par un bloc commentaire de 2-5 lignes :
  ```javascript
  /**
   * lead-pipeline.js
   * Gère le pipeline drag-and-drop des leads à travers 6 étapes.
   * Stockage : localStorage (clé 'leon_leads') — migration Supabase prévue.
   * Dépendances : utils/dates.js, components/lead-card.js
   */
  ```
- **Commenter le "pourquoi", jamais le "quoi"** — le code dit déjà ce qu'il fait
- **Toute logique métier complexe** (calculs, conditions multiples, workarounds) doit avoir un commentaire expliquant le contexte business
- **Pas de magic numbers** — toute valeur doit être une constante nommée avec contexte :
  ```javascript
  const MAX_LEADS_PER_STAGE = 50; // Limite UX pour éviter le scroll infini
  ```

### Règle de fin de session

À la fin de CHAQUE session, produire un résumé structuré :

```markdown
## Session [DATE]

### Modifications
- [fichier] : [ce qui a changé et pourquoi]

### Fichiers créés/modifiés
- chemin/complet/du/fichier.js

### Points d'attention / bugs connus
- [description]

### Prochaines étapes prioritaires
- [description]
```

Ce résumé est ajouté à `docs/CHANGELOG.md` ET présenté à l'utilisateur.

---

## Conventions de Code (Debuggabilité)

### Nommage
- **Fonctions** : verbe + contexte explicite → `handleLeadStageChange()`, pas `handleClick2()`
- **Variables** : descriptives et contextuelles → `dvfPropertyCache`, pas `tempData`
- **Constantes** : SCREAMING_SNAKE_CASE avec commentaire → `const API_TIMEOUT_MS = 5000; // Timeout DVF API`
- **Fichiers** : kebab-case reflétant le contenu → `lead-pipeline.js`, `dvf-map-integration.js`

### Structure du code
- **Fonctions < 30 lignes** — sinon, découper en sous-fonctions nommées
- **Une fonction = une responsabilité** — si tu utilises "et" pour décrire ce qu'elle fait, elle fait trop
- **Pas de nesting > 3 niveaux** — extraire en fonctions ou utiliser early returns
- **Gestion d'erreurs explicite** avec messages contextuels :
  ```javascript
  if (!lead.id) {
    console.error('[LeadPipeline] Impossible de déplacer le lead : ID manquant', { lead, targetStage });
    return;
  }
  ```

### Logging structuré
- Utiliser des préfixes par module : `[DVF]`, `[Pipeline]`, `[Auth]`, `[Workflow]`
- Logger les entrées/sorties des fonctions critiques en mode debug
- Inclure le contexte dans les erreurs (pas juste "erreur", mais quoi, où, avec quelles données)

---

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

---

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **Debuggable by Default**: Code should be understandable without its author present.
- **Documentation = Code**: Undocumented code is unfinished code.

---

## Communication Style

- Réponds en français sauf si le code ou le contexte technique impose l'anglais
- Sois direct et orienté solution — pas de blabla inutile
- Propose des alternatives quand tu identifies un meilleur chemin
- Si tu n'es pas sûr, dis-le plutôt que de deviner

---

## Project Structure Conventions

```
project-root/
├── CLAUDE.md                # Ce fichier — règles du projet
├── tasks/
│   ├── todo.md              # Plan & suivi des tâches en cours
│   └── lessons.md           # Erreurs passées & règles apprises
├── docs/
│   ├── ARCHITECTURE.md      # Structure du projet, flux de données, schéma BDD
│   ├── DECISIONS.md         # Journal des choix techniques (pourquoi X pas Y)
│   ├── CHANGELOG.md         # Historique horodaté des modifications
│   └── API-MAP.md           # Cartographie des APIs et endpoints
├── src/                     # Code source
└── ...
```

---

## Quick Reference — Session Start Checklist

```markdown
[ ] Lire CLAUDE.md
[ ] Lire tasks/lessons.md (si existant)
[ ] Lire tasks/todo.md (si existant)
[ ] Lire docs/ARCHITECTURE.md (si existant)
[ ] Identifier le contexte du projet
[ ] Confirmer le plan avant d'agir
```

## Quick Reference — Session End Checklist

```markdown
[ ] Mettre à jour docs/CHANGELOG.md avec résumé de session
[ ] Mettre à jour docs/ARCHITECTURE.md si structure modifiée
[ ] Mettre à jour docs/DECISIONS.md si choix technique fait
[ ] Mettre à jour docs/API-MAP.md si API ajoutée/modifiée
[ ] Mettre à jour tasks/todo.md avec prochaines étapes
[ ] Mettre à jour tasks/lessons.md si correction reçue
[ ] Présenter le résumé de session à l'utilisateur
```

---

## Audit de Lisibilité (toutes les 10 sessions)

Tous les 10 sessions environ, effectuer un audit :

> "Relis l'ensemble du projet comme si tu le découvrais. Un développeur junior
> pourrait-il comprendre l'architecture en 30 minutes avec la documentation actuelle ?
> Si non, identifie les manques et corrige-les."
