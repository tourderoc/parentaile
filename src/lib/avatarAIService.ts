import { db } from './firebase';
import { doc, updateDoc, getDoc, serverTimestamp, increment } from 'firebase/firestore';

const VPS_URL = 'https://avatar.parentaile.fr';
const DAILY_LIMIT = 2;

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
      const userRef = doc(db, 'accounts', userId);
      const snap = await getDoc(userRef);
      
      if (!snap.exists()) return { canGenerate: false, remaining: 0, reason: 'Utilisateur non trouvé' };
      
      const data = snap.data();
      const today = new Date().toISOString().split('T')[0];
      const lastGenDate = data.lastAvatarGenDate || '';
      const count = data.avatarGenCount || 0;

      if (lastGenDate !== today) {
        // Nouvelle journée
        return { canGenerate: true, remaining: DAILY_LIMIT };
      }

      const remaining = Math.max(0, DAILY_LIMIT - count);
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
   * Envoie l'image au VPS et met à jour Firestore
   */
  async generateAvatar(userId: string, imageFile: File): Promise<string> {
    // 1. Redimensionnement
    const blob = await this.resizeImage(imageFile);
    
    // 2. Envoi au VPS
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

    // 3. Mise à jour Firestore
    const userRef = doc(db, 'accounts', userId);
    const today = new Date().toISOString().split('T')[0];
    
    // Obtenir l'état actuel pour savoir si on reset le compteur
    const snap = await getDoc(userRef);
    const lastGenDate = snap.data()?.lastAvatarGenDate || '';

    await updateDoc(userRef, {
      'avatar.aiUrl': result.url,
      'avatar.avatarType': 'ai',
      lastAvatarGenDate: today,
      avatarGenCount: lastGenDate === today ? increment(1) : 1,
      updatedAt: serverTimestamp()
    });

    return result.url;
  }
};
