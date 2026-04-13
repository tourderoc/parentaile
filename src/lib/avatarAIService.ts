import { accountStorage } from './accountStorage';
import type { AvatarConfig } from './avatarTypes';

const VPS_URL = 'https://avatar.parentaile.fr';
const API_KEY = import.meta.env.VITE_AVATAR_API_KEY as string;

const vpsHeaders = () => ({ 'X-Api-Key': API_KEY });

export const AvatarAIService = {
  /**
   * Pre-compression cote client avant upload.
   * Redimensionne en carre 512x512 (crop centre) et encode en JPEG q0.9.
   * Economise la bande passante mobile — le VPS recompresse ensuite a q80.
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
   * Upload une photo (selfie OU fichier parcouru).
   * Pre-compresse cote client puis POST multipart vers le VPS.
   * Retourne l'URL publique (avec timestamp anti-cache).
   */
  async uploadPhoto(userId: string, imageFile: File): Promise<string> {
    const blob = await this.resizeImage(imageFile);
    const formData = new FormData();
    formData.append('file', blob, 'photo.jpg');

    const response = await fetch(`${VPS_URL}/avatar/${userId}/photo`, {
      method: 'POST',
      headers: vpsHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const msg = await response.text().catch(() => response.statusText);
      throw new Error(`Upload photo echoue (${response.status}): ${msg}`);
    }

    const result = await response.json();
    if (result.status !== 'success' || !result.url) {
      throw new Error(result.message || 'Reponse upload invalide');
    }

    return `${result.url}?t=${Date.now()}`;
  },

  /**
   * Supprime la photo de l'utilisateur cote VPS (tolere 404 si le fichier n'existe pas)
   * puis remet le compte en avatar 'static' dans Firestore.
   */
  async deletePhoto(userId: string): Promise<void> {
    // Tentative de suppression VPS — on ignore 404 (fichier déjà absent ou ancien avatar IA)
    const response = await fetch(`${VPS_URL}/avatar/${userId}/photo`, {
      method: 'DELETE',
      headers: vpsHeaders(),
    });
    if (!response.ok && response.status !== 404) {
      const msg = await response.text().catch(() => response.statusText);
      throw new Error(`Suppression photo echouee (${response.status}): ${msg}`);
    }

    // Toujours nettoyer le profil, que le fichier VPS ait existé ou non
    await accountStorage.updateAccount(userId, {
      avatar: { avatarType: 'static', aiUrl: '' },
    });
  },

  /**
   * Enregistre l'URL de la photo dans le compte (champ avatar).
   * Le type reste 'ai' pour compatibilite avec le code existant (UserAvatar, contextes, etc.).
   */
  async saveAvatar(userId: string, photoUrl: string): Promise<void> {
    await accountStorage.updateAccount(userId, {
      avatar: { aiUrl: photoUrl, avatarType: 'ai' },
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
};
