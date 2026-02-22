// ===== LÉON — SYSTÈME DE WORKFLOWS =====
// Définitions des workflows, célébrations et fonctions utilitaires

const WORKFLOWS = {
  warm_seller: {
    label: "Parcours vendeur chaud",
    steps: [
      {
        step_key: 'first_contact_done',
        label: 'Premier contact effectué ?',
        delay_days: 0,
        relative_to: 'workflow_start'
      },
      {
        step_key: 'appointment_scheduled',
        label: "Rendez-vous d'estimation calé ?",
        delay_days: 1,
        relative_to: 'workflow_start',
        ai_suggestion: "Je peux préparer un SMS de confirmation.",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'confirmation_rdv' }
      },
      {
        step_key: 'appointment_confirmed',
        label: 'Confirmation de rendez-vous envoyée ?',
        delay_days: 0,
        relative_to: 'appointment_scheduled',
        ai_suggestion: "Envoie un petit message la veille pour confirmer.",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'confirmation_rdv' }
      },
      {
        step_key: 'estimation_visit_done',
        label: "Rendez-vous d'estimation effectué ?",
        delay_days: 3,
        relative_to: 'appointment_scheduled'
      },
      {
        step_key: 'estimation_sent',
        label: 'Estimation envoyée ?',
        delay_days: 2,
        relative_to: 'estimation_visit_done',
        ai_suggestion: "N'attends pas trop — envoie-la dans les 48h, c'est là que l'impact est le plus fort."
      },
      {
        step_key: 'followup_j7',
        label: 'Relance post-estimation faite ?',
        delay_days: 7,
        relative_to: 'estimation_sent',
        ai_suggestion: "Ça fait une semaine. Un petit appel pour prendre la température ?",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'relance_estimation' }
      },
      {
        step_key: 'followup_j14',
        label: 'Deuxième relance faite ?',
        delay_days: 14,
        relative_to: 'estimation_sent',
        ai_suggestion: "Toujours pas de retour. C'est le moment de relancer — après, le contact refroidit.",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'relance_estimation' }
      },
      {
        step_key: 'mandate_discussion',
        label: 'Mandat proposé ou en discussion ?',
        delay_days: 3,
        relative_to: 'followup_j7'
      }
    ]
  },

  mandate: {
    label: "Mise en vente",
    steps: [
      {
        step_key: 'documents_requested',
        label: 'Pièces demandées au vendeur (état civil, copro, titre) ?',
        delay_days: 0,
        relative_to: 'workflow_start'
      },
      {
        step_key: 'mandate_drafted',
        label: 'Mandat rédigé et envoyé en signature ?',
        delay_days: 1,
        relative_to: 'workflow_start'
      },
      {
        step_key: 'mandate_signed',
        label: 'Mandat signé ?',
        delay_days: 2,
        relative_to: 'mandate_drafted',
        ai_suggestion: "Un petit message WhatsApp au vendeur pour confirmer, ça fait toujours plaisir.",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'mandat_signe' }
      },
      {
        step_key: 'diagnostics_ordered',
        label: 'Diagnostics techniques commandés ?',
        delay_days: 1,
        relative_to: 'mandate_signed'
      },
      {
        step_key: 'photos_scheduled',
        label: 'Séance photos planifiée ?',
        delay_days: 2,
        relative_to: 'mandate_signed'
      },
      {
        step_key: 'photos_done',
        label: 'Photos faites et retouchées ?',
        delay_days: 5,
        relative_to: 'photos_scheduled'
      },
      {
        step_key: 'listing_written',
        label: 'Annonce rédigée ?',
        delay_days: 1,
        relative_to: 'photos_done',
        ai_suggestion: "Je peux t'aider à rédiger l'annonce à partir de la fiche.",
        ai_action: 'generate_listing'
      },
      {
        step_key: 'listing_published',
        label: 'Annonce publiée ?',
        delay_days: 1,
        relative_to: 'listing_written'
      },
      {
        step_key: 'buyers_matched',
        label: 'Acquéreurs en base contactés ?',
        delay_days: 1,
        relative_to: 'listing_published',
        ai_suggestion: "Tu as des acquéreurs qui matchent. On leur envoie un message ?",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'nouveau_bien' }
      },
      {
        step_key: 'social_post_done',
        label: 'Post réseaux sociaux publié ?',
        delay_days: 1,
        relative_to: 'listing_published',
        ai_suggestion: "Je peux te préparer un post pour ce nouveau bien.",
        ai_action: 'generate_social_post'
      }
    ]
  },

  post_sale: {
    label: "Après-vente",
    steps: [
      {
        step_key: 'thank_you_sent',
        label: 'Message de remerciement envoyé ?',
        delay_days: 0,
        relative_to: 'workflow_start',
        ai_suggestion: "Bravo pour cette vente ! Envoie un petit message de remerciement.",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'remerciement' }
      },
      {
        step_key: 'google_review',
        label: "Demande d'avis Google envoyée ?",
        delay_days: 3,
        relative_to: 'workflow_start',
        ai_suggestion: "C'est le bon moment pour demander un avis Google. L'émotion est encore fraîche !",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'demande_avis' }
      },
      {
        step_key: 'buyer_followup',
        label: 'Suivi acquéreur : prêt obtenu ?',
        delay_days: 30,
        relative_to: 'workflow_start',
        ai_suggestion: "Ça fait un mois. Un petit message à l'acquéreur pour savoir où en est le financement ?",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'suivi_acquereur_pret' }
      },
      {
        step_key: 'recommendation_3m',
        label: 'Relance recommandation 3 mois faite ?',
        delay_days: 90,
        relative_to: 'workflow_start',
        ai_suggestion: "Ça fait 3 mois. Prends des nouvelles et profites-en pour demander s'ils connaissent quelqu'un qui vend.",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'relance_recommandation' }
      },
      {
        step_key: 'recommendation_6m',
        label: 'Relance recommandation 6 mois faite ?',
        delay_days: 180,
        relative_to: 'workflow_start',
        ai_suggestion: "6 mois déjà ! Un petit message pour garder le lien.",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'relance_recommandation' }
      }
    ]
  },

  active_buyer: {
    label: "Suivi acquéreur actif",
    steps: [
      {
        step_key: 'criteria_confirmed',
        label: 'Critères de recherche confirmés ?',
        delay_days: 1,
        relative_to: 'workflow_start'
      },
      {
        step_key: 'financing_checked',
        label: 'Financement vérifié (pré-accord, courtier) ?',
        delay_days: 2,
        relative_to: 'workflow_start'
      },
      {
        step_key: 'first_selection_sent',
        label: 'Première sélection de biens envoyée ?',
        delay_days: 3,
        relative_to: 'workflow_start',
        ai_suggestion: "Tu as des biens qui matchent. On leur envoie une sélection ?",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'selection_biens' }
      },
      {
        step_key: 'first_visit_done',
        label: 'Première visite effectuée ?',
        delay_days: 7,
        relative_to: 'workflow_start'
      }
    ]
  },

  competitor_watch: {
    label: "Suivi bien concurrent",
    steps: [
      {
        step_key: 'initial_check',
        label: 'Annonce repérée et suivie ?',
        delay_days: 0,
        relative_to: 'workflow_start'
      },
      {
        step_key: 'price_check_2w',
        label: 'Prix toujours le même ?',
        delay_days: 14,
        relative_to: 'workflow_start',
        ai_suggestion: "Ça fait 2 semaines. Vérifie si le prix a bougé — une baisse, c'est une ouverture."
      },
      {
        step_key: 'price_check_1m',
        label: 'Toujours en ligne après 1 mois ?',
        delay_days: 30,
        relative_to: 'workflow_start',
        ai_suggestion: "Un mois en ligne. Si le prix n'a pas bougé, le vendeur commence peut-être à douter."
      },
      {
        step_key: 'mandate_expiry_check',
        label: 'Mandat bientôt expiré (3 mois) ?',
        delay_days: 75,
        relative_to: 'workflow_start',
        ai_suggestion: "Le mandat de 3 mois approche. C'est LE moment pour reprendre contact.",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'relance_fin_mandat_concurrent' }
      },
      {
        step_key: 'recontact',
        label: 'Vendeur recontacté ?',
        delay_days: 90,
        relative_to: 'workflow_start',
        ai_suggestion: "3 mois. Si l'annonce est toujours là, le mandat est peut-être arrivé à échéance. Appelle !"
      }
    ]
  },

  post_purchase: {
    label: "Après-achat acquéreur",
    steps: [
      {
        step_key: 'congrats_sent',
        label: 'Message de félicitations envoyé ?',
        delay_days: 0,
        relative_to: 'workflow_start',
        ai_suggestion: "Bravo pour cette vente ! Un petit message de félicitations à ton acquéreur.",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'felicitations_achat' }
      },
      {
        step_key: 'google_review_buyer',
        label: "Demande d'avis Google envoyée ?",
        delay_days: 3,
        relative_to: 'workflow_start',
        ai_suggestion: "C'est le bon moment pour demander un avis Google. L'émotion est encore fraîche !",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'demande_avis' }
      },
      {
        step_key: 'recommendation_buyer_3m',
        label: 'Relance recommandation 3 mois faite ?',
        delay_days: 90,
        relative_to: 'workflow_start',
        ai_suggestion: "Ça fait 3 mois. Comment se passe l'installation ? Profites-en pour demander s'ils connaissent quelqu'un qui cherche.",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'relance_recommandation' }
      },
      {
        step_key: 'recommendation_buyer_6m',
        label: 'Relance recommandation 6 mois faite ?',
        delay_days: 180,
        relative_to: 'workflow_start',
        ai_suggestion: "6 mois déjà ! Un petit message pour garder le lien.",
        ai_action: 'generate_message',
        ai_action_params: { scenario: 'relance_recommandation' }
      }
    ]
  }
};

// Messages de félicitation de Léon
const CELEBRATIONS = {
  mandate_signed: [
    "Nouveau mandat signé ! Tu construis ton portefeuille.",
    "Un mandat de plus ! La confiance de tes clients, ça se mérite.",
    "Bravo pour ce nouveau mandat. Maintenant, on le vend !"
  ],
  sold: [
    "Vendu ! Bravo, beau travail sur ce dossier.",
    "Une vente de plus ! Bien joué.",
    "Félicitations pour cette vente !"
  ],
  workflow_complete: [
    "Toutes les étapes sont faites. Rien ne t'échappe !",
    "Workflow terminé. Tu gères ton dossier comme un pro.",
    "Tout est en ordre sur ce dossier. Continue comme ça !"
  ],
  bought_with_me: [
    "Un acquéreur satisfait, c'est une future recommandation !",
    "Belle transaction ! Pense à demander un avis Google.",
    "Bravo, encore un client heureux !"
  ]
};

// ===== FONCTIONS UTILITAIRES =====

/**
 * Retourne le workflow_type à déclencher pour un statut donné
 */
function getWorkflowForStatus(status, leadType) {
  if (leadType === 'seller') {
    switch (status) {
      case 'warm': return 'warm_seller';
      case 'mandate': return 'mandate';
      case 'sold': return 'post_sale';
      case 'competitor': return 'competitor_watch';
      default: return null;
    }
  }
  if (leadType === 'buyer') {
    switch (status) {
      case 'nouveau':
      case 'actif': return 'active_buyer';
      case 'achete_avec_moi': return 'post_purchase';
      default: return null;
    }
  }
  return null;
}

/**
 * Crée toutes les étapes d'un workflow en DB
 * due_date = null : les délais serviront plus tard pour le briefing du matin (alertes retard)
 */
async function createWorkflowSteps(supabase, userId, leadId, leadType, workflowType) {
  const workflow = WORKFLOWS[workflowType];
  if (!workflow) return null;

  const leadCol = leadType === 'seller' ? 'seller_id' : 'buyer_id';
  const rows = workflow.steps.map((step, index) => ({
    user_id: userId,
    [leadCol]: leadId,
    workflow_type: workflowType,
    step_key: step.step_key,
    step_label: step.label,
    sort_order: index + 1,
    status: 'pending',
    due_date: null,
    ai_suggestion: step.ai_suggestion || null,
    ai_action: step.ai_action || null
  }));

  const { data, error } = await supabase
    .from('workflow_steps')
    .insert(rows)
    .select();

  if (error) {
    console.error('Erreur création workflow steps:', error);
    return null;
  }
  return data;
}

/**
 * Clôture un workflow : passe toutes les étapes pending en 'skipped'
 */
async function closeWorkflow(supabase, userId, leadId, leadType, workflowType) {
  const leadCol = leadType === 'seller' ? 'seller_id' : 'buyer_id';

  const { error } = await supabase
    .from('workflow_steps')
    .update({ status: 'skipped', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq(leadCol, leadId)
    .eq('workflow_type', workflowType)
    .eq('status', 'pending');

  if (error) {
    console.error('Erreur clôture workflow:', error);
  }
}

/**
 * Retourne la prochaine étape pending pour un lead (par sort_order)
 */
async function getNextPendingStep(supabase, userId, leadId, leadType) {
  const leadCol = leadType === 'seller' ? 'seller_id' : 'buyer_id';

  const { data, error } = await supabase
    .from('workflow_steps')
    .select('*')
    .eq('user_id', userId)
    .eq(leadCol, leadId)
    .eq('status', 'pending')
    .order('sort_order', { ascending: true })
    .limit(1);

  if (error) {
    console.error('Erreur getNextPendingStep:', error);
    return null;
  }
  return data && data.length > 0 ? data[0] : null;
}

/**
 * Retourne toutes les étapes d'un workflow pour un lead
 */
async function getWorkflowSteps(supabase, userId, leadId, leadType) {
  const leadCol = leadType === 'seller' ? 'seller_id' : 'buyer_id';

  const { data, error } = await supabase
    .from('workflow_steps')
    .select('*')
    .eq('user_id', userId)
    .eq(leadCol, leadId)
    .order('workflow_type', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Erreur getWorkflowSteps:', error);
    return [];
  }
  return data || [];
}

/**
 * Marque une étape comme done
 */
async function completeStep(supabase, stepId) {
  const { data, error } = await supabase
    .from('workflow_steps')
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', stepId)
    .select();

  if (error) {
    console.error('Erreur completeStep:', error);
    return null;
  }
  return data && data.length > 0 ? data[0] : null;
}

/**
 * Retourne toutes les étapes en retard pour un user (pour le briefing)
 */
async function getOverdueSteps(supabase, userId) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('workflow_steps')
    .select('*, sellers(first_name, last_name), buyers(first_name, last_name)')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lt('due_date', now)
    .order('due_date', { ascending: true });

  if (error) {
    console.error('Erreur getOverdueSteps:', error);
    return [];
  }
  return data || [];
}

/**
 * Retourne les étapes du jour (due today ou dans les 3 prochains jours)
 */
async function getTodaySteps(supabase, userId) {
  const now = new Date();
  const in3Days = new Date(now);
  in3Days.setDate(in3Days.getDate() + 3);

  const { data, error } = await supabase
    .from('workflow_steps')
    .select('*, sellers(first_name, last_name), buyers(first_name, last_name)')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gte('due_date', now.toISOString())
    .lte('due_date', in3Days.toISOString())
    .order('due_date', { ascending: true });

  if (error) {
    console.error('Erreur getTodaySteps:', error);
    return [];
  }
  return data || [];
}

/**
 * Retourne un message de célébration aléatoire
 */
function getRandomCelebration(type) {
  const messages = CELEBRATIONS[type];
  if (!messages || messages.length === 0) return null;
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Vérifie si une étape pending est "due"
 * Sans due_date → toujours due (enchaînement immédiat)
 * Avec due_date → date passée ou dans les 3 prochains jours (pour futur briefing)
 */
function isStepDue(step) {
  if (!step) return false;
  if (!step.due_date) return true;
  const now = new Date();
  const in3Days = new Date(now);
  in3Days.setDate(in3Days.getDate() + 3);
  const dueDate = new Date(step.due_date);
  return dueDate <= in3Days;
}

/**
 * Logique de déclenchement au changement de statut (drag & drop)
 */
async function onLeadStatusChange(supabase, userId, leadId, leadType, oldStatus, newStatus) {
  // Clôturer les workflows actifs associés à l'ancien statut
  const oldWorkflow = getWorkflowForStatus(oldStatus, leadType);
  if (oldWorkflow) {
    await closeWorkflow(supabase, userId, leadId, leadType, oldWorkflow);
  }

  // Cas spécial : passage en sold clôture aussi active_sale (future) et mandate
  if (leadType === 'seller' && newStatus === 'sold') {
    await closeWorkflow(supabase, userId, leadId, leadType, 'mandate');
  }

  // Déclencher le nouveau workflow
  const newWorkflow = getWorkflowForStatus(newStatus, leadType);
  if (newWorkflow) {
    await createWorkflowSteps(supabase, userId, leadId, leadType, newWorkflow);
  }

  return newWorkflow;
}
