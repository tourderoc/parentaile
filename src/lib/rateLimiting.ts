/**
 * Service de rate limiting pour la reformulation de texte
 * Limite à 2 utilisations par jour par défaut
 */

const RATE_LIMIT_KEY = 'parentaile_refinement_usage';
const MAX_DAILY_USES = 2;

interface UsageRecord {
  date: string;
  count: number;
}

const ADMIN_EMAILS = [
  'tourderoc@gmail.com',
  'admin@parentaile.fr'
];

/**
 * Vérifie si l'utilisateur est un administrateur
 */
export function isAdminUser(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Ajoute un email administrateur dynamiquement
 */
export function addAdminEmail(email: string): void {
  if (!ADMIN_EMAILS.includes(email.toLowerCase())) {
    ADMIN_EMAILS.push(email.toLowerCase());
  }
}

/**
 * Récupère le nombre d'utilisations pour aujourd'hui
 */
function getTodayUsageCount(): number {
  const today = new Date().toISOString().split('T')[0];
  const stored = localStorage.getItem(RATE_LIMIT_KEY);

  if (!stored) return 0;

  try {
    const record: UsageRecord = JSON.parse(stored);
    if (record.date === today) {
      return record.count;
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Vérifie si l'utilisateur peut utiliser la reformulation
 */
export function canUseRefinement(userEmail: string | null | undefined): boolean {
  if (isAdminUser(userEmail)) {
    return true;
  }

  const usageCount = getTodayUsageCount();
  return usageCount < MAX_DAILY_USES;
}

/**
 * Retourne le nombre d'utilisations restantes
 */
export function getRemainingUses(userEmail: string | null | undefined): number {
  if (isAdminUser(userEmail)) {
    return Infinity;
  }

  const usageCount = getTodayUsageCount();
  return Math.max(0, MAX_DAILY_USES - usageCount);
}

/**
 * Incrémente le compteur d'utilisation
 */
export function incrementUsage(): void {
  const today = new Date().toISOString().split('T')[0];
  const currentCount = getTodayUsageCount();

  const record: UsageRecord = {
    date: today,
    count: currentCount + 1,
  };

  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(record));
}

/**
 * Reset le compteur (pour les tests)
 */
export function resetUsage(): void {
  localStorage.removeItem(RATE_LIMIT_KEY);
}

export default {
  isAdminUser,
  addAdminEmail,
  canUseRefinement,
  getRemainingUses,
  incrementUsage,
  resetUsage,
  MAX_DAILY_USES,
};
