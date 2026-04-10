import { db, auth } from './firebase';
import { doc, updateDoc, getDoc, serverTimestamp, increment } from 'firebase/firestore';
import { isAdminUser } from './rateLimiting';

const VPS_URL = 'https://avatar.parentaile.fr';
const DAILY_LIMIT = 2;
const ADMIN_DAILY_LIMIT = 999;

export interface QuotaStatus {
  canGenerate: boolean;
  remaining: number;
  reason?: string;
}

export const AvatarAIService = {
  /**
   * Vérifie si l'utilisateur a encore du quota pour aujourd'hui
   */
  async checkQuota(userId: string): Promise<QuotaStatus> {
    try {
      const email = auth.currentUser?.email;
      const isAdmin = isAdminUser(email);
      const limit = isAdmin ? ADMIN_DAILY_LIMIT : DAILY_LIMIT;

      const userRef = doc(db, 'accounts', userId);
      const snap = await getDoc(userRef);

      if (!snap.exists()) return { canGenerate: false, remaining: 0, reason: 'Utilisateur non trouvé' };

      const data = snap.data();
      const today = new Date().toISOString().split('T')[0];
      const lastGenDate = data.lastAvatarGenDate || '';
      const count = data.avatarGenCount || 0;

      if (lastGenDate !== today) {
        return { canGenerate: true, remaining: limit };
      }

      const remaining = Math.max(0, limit - count);
      return {
        canGenerate: remaining > 0,
        remaining,
        reason: remaining > 0 ? undefined : 'Quota quotidien atteint (2/jour)'
      };
    } catch (error) {
      console.error('Error checking quota:', error);
      return { canGenerate: false, remaining: 0, reason: 'Erreur technique' };
    }
  },

  /**
   * Redimensionne une image via Canvas pour économiser la bande passante et le CPU du VPS
   */
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
          
          if (!ctx) {
            reject(new Error('Canvas context failed'));
            return;
          }

          // Center Crop Logic
          let drawWidth = img.width;
          let drawHeight = img.height;
          let offsetX = 0;
          let offsetY = 0;

          if (img.width > img.height) {
            // Landscape: scale by height
            drawWidth = img.width * (size / img.height);
            drawHeight = size;
            offsetX = (size - drawWidth) / 2;
          } else {
            // Portrait or Square: scale by width
            drawHeight = img.height * (size / img.width);
            drawWidth = size;
            offsetY = (size - drawHeight) / 2;
          }

          // Remplit le fond en blanc au cas où
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
   * Envoie l'image au VPS pour génération (sans sauvegarder dans Firestore).
   * Met à jour uniquement le quota. Retourne l'URL de preview.
   */
  async generatePreview(userId: string, imageFile: File): Promise<string> {
    const blob = await this.resizeImage(imageFile);

    const formData = new FormData();
    formData.append('file', blob, 'portrait.jpg');

    const response = await fetch(`${VPS_URL}/generate/${userId}`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (result.status !== 'success') {
      throw new Error(result.message || 'Erreur lors de la génération');
    }

    // Mettre à jour uniquement le quota
    const userRef = doc(db, 'accounts', userId);
    const today = new Date().toISOString().split('T')[0];
    const snap = await getDoc(userRef);
    const lastGenDate = snap.data()?.lastAvatarGenDate || '';

    await updateDoc(userRef, {
      lastAvatarGenDate: today,
      avatarGenCount: lastGenDate === today ? increment(1) : 1,
    });

    return result.url;
  },

  /**
   * Sauvegarde l'avatar IA choisi dans Firestore (après validation utilisateur)
   */
  async saveAvatar(userId: string, aiUrl: string): Promise<void> {
    const userRef = doc(db, 'accounts', userId);
    await updateDoc(userRef, {
      'avatar.aiUrl': aiUrl,
      'avatar.avatarType': 'ai',
      updatedAt: serverTimestamp()
    });
  }
};
