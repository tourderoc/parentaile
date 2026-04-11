import { db, auth } from './firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { AvatarConfig } from './avatarTypes';

const VPS_URL = 'https://avatar.parentaile.fr';
const API_KEY = import.meta.env.VITE_AVATAR_API_KEY as string;

export interface QuotaStatus {
  canGenerate: boolean;
  remaining: number;
  reason?: string;
}

const vpsHeaders = () => ({ 'X-Api-Key': API_KEY });

export const AvatarAIService = {
  /**
   * Vérifie le quota auprès du VPS (Étape 1 migration - quota sur SQLite VPS)
   */
  async checkQuota(userId: string): Promise<QuotaStatus> {
    try {
      const email = auth.currentUser?.email || '';
      const url = new URL(`${VPS_URL}/avatar/${userId}/quota`);
      if (email) url.searchParams.append('email', email);

      const response = await fetch(url.toString(), {
        headers: vpsHeaders(),
      });

      if (!response.ok) {
        return { canGenerate: false, remaining: 0, reason: 'Erreur serveur quota' };
      }

      const quota = await response.json();
      console.log('[Avatar] Quota check - userId:', userId, 'email:', email, 'result:', quota);
      return {
        canGenerate: quota.canGenerate,
        remaining: quota.remaining,
        reason: quota.reason,
      };
    } catch (error) {
      console.error('Error checking quota:', error);
      return { canGenerate: false, remaining: 0, reason: 'Erreur technique' };
    }
  },

  async resizeImage(file: File, size = 512): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas context failed')); return; }

          let drawWidth = img.width;
          let drawHeight = img.height;
          let offsetX = 0;
          let offsetY = 0;

          if (img.width > img.height) {
            drawWidth = img.width * (size / img.height);
            drawHeight = size;
            offsetX = (size - drawWidth) / 2;
          } else {
            drawHeight = img.height * (size / img.width);
            drawWidth = size;
            offsetY = (size - drawHeight) / 2;
          }

          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas toBlob failed'));
          }, 'image/jpeg', 0.9);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  },

  /**
   * Génère un avatar. Le quota est géré au VPS (Étape 1 migration)
   * N'écrit plus sur Firebase - le VPS incrémente automatiquement
   */
  async generatePreview(userId: string, imageFile: File): Promise<string> {
    const email = auth.currentUser?.email || '';
    console.log('[Avatar] generatePreview START - userId:', userId, 'email:', email);

    const blob = await this.resizeImage(imageFile);
    const formData = new FormData();
    formData.append('file', blob, 'portrait.jpg');

    const url = new URL(`${VPS_URL}/avatar/${userId}/generate`);
    if (email) url.searchParams.append('email', email);
    console.log('[Avatar] POST URL:', url.toString());

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: vpsHeaders(),
      body: formData,
    });

    const result = await response.json();
    console.log('[Avatar] VPS Response:', result);

    if (result.status !== 'success') throw new Error(result.message || 'Erreur lors de la génération');

    const finalUrl = `${result.url}?t=${Date.now()}`;
    console.log('[Avatar] Final URL (with timestamp):', finalUrl);

    // Quota est maintenant géré au VPS - pas de mise à jour Firebase
    // Le VPS incrémente automatiquement via SQLite

    return finalUrl;
  },

  async saveAvatar(userId: string, aiUrl: string): Promise<void> {
    const userRef = doc(db, 'accounts', userId);
    await updateDoc(userRef, {
      'avatar.aiUrl': aiUrl,
      'avatar.avatarType': 'ai',
      updatedAt: serverTimestamp(),
    });
  },

  async saveCustomConfig(userId: string, config: AvatarConfig): Promise<void> {
    const response = await fetch(`${VPS_URL}/avatar/${userId}/config`, {
      method: 'POST',
      headers: { ...vpsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Erreur sauvegarde config avatar VPS');
  },

  async getAvatarInfo(userId: string): Promise<{ type: string; url?: string; config?: AvatarConfig }> {
    const response = await fetch(`${VPS_URL}/avatar/${userId}`, {
      headers: vpsHeaders(),
    });
    return response.json();
  },
};
