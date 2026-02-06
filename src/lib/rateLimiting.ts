/**
 * Service de rate limiting pour la reformulation de texte
 *
 * - 2 reformulations par jour par utilisateur
 * - Illimité pour les comptes admin
 */

const RATE_LIMIT_KEY = 'parentaile_refine_usage';
const MAX_DAILY_USES = 2;

// Emails admin (pas de limite)
const ADMIN_EMAILS = [
  'nairmedcin@gmail.com',
];

interface UsageRecord {
  date: string; // Format YYYY-MM-DD
  count: number;
}

/**
 * Vérifie si l'utilisateur est admin
 */
export function isAdminUser(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Ajouter un email admin dynamiquement
 */
export function addAdminEmail(email: string): void {
  if (!ADMIN_EMAILS.includes(email.toLowerCase())) {
    ADMIN_EMAILS.push(email.toLowerCase());
  }
}

/**
 * Récupère le nombre d'utilisations aujourd'hui
 */
export function getTodayUsageCount(): number {
  try {
    const stored = localStorage.getItem(RATE_LIMIT_KEY);
    if (!stored) return 0;

    const record: UsageRecord = JSON.parse(stored);
    const today = new Date().toISOString().split('T')[0];

    // Si c'est un nouveau jour, reset
    if (record.date !== today) {
      return 0;
    }

    return record.count;
  } catch {
    return 0;
  }
}

/**
 * Vérifie si l'utilisateur peut utiliser la reformulation
 */
export function canUseRefinement(userEmail: string | null | undefined): boolean {
  // Admin = pas de limite
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
