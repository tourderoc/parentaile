/**
 * Service de préférences utilisateur (localStorage)
 *
 * Gère les préférences stockées localement:
 * - Notifications activées/désactivées
 * - Son des notifications
 */

// Clés localStorage
const NOTIFICATIONS_ENABLED_KEY = 'parentaile_notifications_enabled';
const NOTIFICATION_SOUND_ENABLED_KEY = 'parentaile_notification_sound';

// ============================================
// TYPES
// ============================================

export interface UserPreferences {
  notificationsEnabled: boolean;
  notificationSoundEnabled: boolean;
}

// ============================================
// FONCTIONS
// ============================================

/**
 * Récupère les préférences utilisateur
 * Par défaut, les notifications sont activées
 */
export function getUserPreferences(): UserPreferences {
  const notificationsEnabled = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
  const soundEnabled = localStorage.getItem(NOTIFICATION_SOUND_ENABLED_KEY);

  return {
    // Par défaut true si pas encore défini
    notificationsEnabled: notificationsEnabled === null ? true : notificationsEnabled === 'true',
    notificationSoundEnabled: soundEnabled === null ? true : soundEnabled === 'true',
  };
}

/**
 * Active ou désactive les notifications
 */
export function setNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled.toString());
}

/**
 * Active ou désactive le son des notifications
 */
export function setNotificationSoundEnabled(enabled: boolean): void {
  localStorage.setItem(NOTIFICATION_SOUND_ENABLED_KEY, enabled.toString());
}

/**
 * Vérifie si les notifications sont activées
 */
export function areNotificationsEnabled(): boolean {
  const value = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
  return value === null ? true : value === 'true';
}

/**
 * Vérifie si le son est activé
 */
export function isNotificationSoundEnabled(): boolean {
  const value = localStorage.getItem(NOTIFICATION_SOUND_ENABLED_KEY);
  return value === null ? true : value === 'true';
}

/**
 * Joue le son de notification si activé
 */
export function playNotificationSound(): void {
  if (!isNotificationSoundEnabled()) return;

  try {
    // Créer un son de notification simple avec Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Note principale
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // La5
    oscillator.frequency.setValueAtTime(1320, audioContext.currentTime + 0.1); // Mi6

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);

    // Seconde note
    setTimeout(() => {
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();

      osc2.connect(gain2);
      gain2.connect(audioContext.destination);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1320, audioContext.currentTime);

      gain2.gain.setValueAtTime(0.25, audioContext.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      osc2.start(audioContext.currentTime);
      osc2.stop(audioContext.currentTime + 0.2);
    }, 150);

  } catch (error) {
    console.warn('[UserPreferences] Impossible de jouer le son:', error);
  }
}

// ============================================
// BADGE DE L'APP (PWA)
// ============================================

/**
 * Vérifie si l'API Badge est supportée
 */
export function isBadgeSupported(): boolean {
  return 'setAppBadge' in navigator;
}

/**
 * Met à jour le badge de l'app avec le nombre de notifications non lues
 */
export async function setAppBadge(count: number): Promise<void> {
  if (!isBadgeSupported()) {
    console.log('[UserPreferences] Badge API non supportée');
    return;
  }

  try {
    if (count > 0) {
      await (navigator as any).setAppBadge(count);
      console.log('[UserPreferences] Badge mis à jour:', count);
    } else {
      await (navigator as any).clearAppBadge();
      console.log('[UserPreferences] Badge effacé');
    }
  } catch (error) {
    console.warn('[UserPreferences] Erreur badge:', error);
  }
}

/**
 * Efface le badge de l'app
 */
export async function clearAppBadge(): Promise<void> {
  if (!isBadgeSupported()) return;

  try {
    await (navigator as any).clearAppBadge();
  } catch (error) {
    console.warn('[UserPreferences] Erreur clearBadge:', error);
  }
}

export default {
  getUserPreferences,
  setNotificationsEnabled,
  setNotificationSoundEnabled,
  areNotificationsEnabled,
  isNotificationSoundEnabled,
  playNotificationSound,
  isBadgeSupported,
  setAppBadge,
  clearAppBadge,
};
