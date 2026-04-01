import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================
// Types
// ============================================

export type PWAInstallMode =
  | 'prompt'       // Chrome/Edge : beforeinstallprompt disponible
  | 'ios'          // Safari iOS : instructions manuelles
  | 'installed'    // Deja installe (standalone)
  | 'unavailable'; // Desktop ou navigateur non supporte

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// ============================================
// Hook
// ============================================

export function usePWAInstall() {
  const [mode, setMode] = useState<PWAInstallMode>('unavailable');
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Deja installe ?
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;

    if (isStandalone) {
      setMode('installed');
      return;
    }

    // iOS Safari ?
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|Chrome/.test(navigator.userAgent);

    if (isIOS) {
      setMode(isSafari ? 'ios' : 'unavailable');
      return;
    }

    // Chrome/Edge Android : ecouter beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setMode('prompt');
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Si on est sur mobile Android mais pas encore de prompt, attendre
    const isMobile = /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (!isMobile) {
      setMode('unavailable');
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt.current) return false;

    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;

    if (outcome === 'accepted') {
      setMode('installed');
      deferredPrompt.current = null;
      return true;
    }

    return false;
  }, []);

  return { mode, install };
}
