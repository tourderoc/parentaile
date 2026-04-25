import React, { useRef, useState } from 'react';
import { Camera, FolderOpen, Trash2, Loader2, AlertCircle, Check, Info } from 'lucide-react';
import { useUser } from '../../lib/userContext';
import { AvatarAIService } from '../../lib/avatarAIService';
import { motion } from 'framer-motion';
import { DEFAULT_AVATAR } from '../../lib/avatarTypes';

interface AvatarAISelectorProps {
  onPreviewGenerated?: (url: string) => void;
  onSaved?: () => void;
  onReset?: () => void;
}

export const AvatarAISelector = ({ onPreviewGenerated, onSaved, onReset }: AvatarAISelectorProps) => {
  const { currentUser, avatarConfig, setLocalData } = useUser();
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Photo actuelle déjà enregistrée (si l'utilisateur en a une)
  const currentPhotoUrl = avatarConfig?.avatarType === 'ai' ? avatarConfig?.aiUrl : null;

  // Ce qu'on affiche : la preview en attente de confirmation, sinon la photo actuelle
  const displayUrl = pendingUrl || currentPhotoUrl || null;
  const hasPending = Boolean(pendingUrl);
  const hasStoredPhoto = Boolean(currentPhotoUrl);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permettre de resélectionner le même fichier
    if (!file || !currentUser) return;

    setError(null);
    setIsUploading(true);
    setIsSaved(false);

    try {
      const url = await AvatarAIService.uploadPhoto(currentUser.uid, file);
      setPendingUrl(url);
      onPreviewGenerated?.(url);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "L'envoi de la photo a échoué. Réessayez.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!currentUser || !pendingUrl) return;
    setIsSaving(true);
    setError(null);
    try {
      await AvatarAIService.saveAvatar(currentUser.uid, pendingUrl);
      setLocalData({ avatarConfig: { aiUrl: pendingUrl, avatarType: 'ai' } });
      setIsSaved(true);
      setTimeout(() => {
        setPendingUrl(null);
        setIsSaved(false);
        onSaved?.();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setPendingUrl(null);
    setError(null);
    onReset?.();
  };

  const handleDelete = async () => {
    if (!currentUser) return;
    setIsDeleting(true);
    setError(null);
    try {
      await AvatarAIService.deletePhoto(currentUser.uid);
      setLocalData({ avatarConfig: { avatarType: 'static', aiUrl: '' } });
      setPendingUrl(null);
      onSaved?.();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la suppression');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Bandeau info */}
      <div className="p-4 rounded-2xl flex items-center gap-3 border bg-orange-50 border-orange-100 text-orange-700">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white text-orange-500">
          <Camera size={20} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-extrabold">Ma Photo</p>
          <p className="text-[11px] font-bold opacity-80">
            Prenez un selfie ou choisissez une image depuis votre appareil.
          </p>
        </div>
      </div>

      {/* Zone d'affichage : preview en attente OU photo actuelle OU placeholder */}
      <div className="flex flex-col items-center gap-2">
        <div className="relative aspect-square w-full max-w-[200px]">
          <div
            className={`w-full h-full rounded-[2.5rem] overflow-hidden flex items-center justify-center ${
              hasPending
                ? 'shadow-lg border-4 border-orange-200'
                : displayUrl
                  ? 'shadow-md border-2 border-orange-100'
                  : 'bg-gray-100 border-4 border-dashed border-gray-200'
            }`}
          >
            {displayUrl ? (
              <img src={displayUrl} alt="Photo" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center text-gray-400">
                <Camera size={40} strokeWidth={1.5} />
                <p className="text-[10px] font-bold mt-2 uppercase tracking-widest">Aucune photo</p>
              </div>
            )}
          </div>
        </div>
        {hasPending && (
          <p className="text-[11px] text-orange-600 font-bold">Aperçu avant enregistrement</p>
        )}
        {!hasPending && hasStoredPhoto && (
          <p className="text-[10px] text-gray-400 font-bold">Photo actuelle</p>
        )}
      </div>

      {/* Message d'erreur */}
      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded-xl flex items-center gap-2 text-[11px] font-bold border border-red-100">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Inputs files cachés (un pour caméra, un pour parcourir) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={handleFileSelected}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Actions */}
      {hasPending ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-3"
        >
          <button
            onClick={handleCancel}
            disabled={isSaving || isSaved}
            className="flex-1 h-12 bg-gray-100 text-gray-600 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isSaved}
            className={`flex-1 h-12 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
              isSaved
                ? 'bg-green-500 text-white scale-95'
                : 'bg-orange-500 text-white active:scale-95 shadow-premium'
            }`}
          >
            {isSaving ? (
              <Loader2 className="animate-spin" size={18} />
            ) : isSaved ? (
              <>
                <Check size={18} />
                Enregistré !
              </>
            ) : (
              <>
                <Check size={18} />
                Enregistrer
              </>
            )}
          </button>
        </motion.div>
      ) : (
        <div className="space-y-3">
          <button
            onClick={() => cameraInputRef.current?.click()}
            disabled={isUploading || isDeleting}
            className="w-full h-14 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-premium bg-orange-500 text-white active:scale-95 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none"
          >
            {isUploading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Envoi en cours...
              </>
            ) : (
              <>
                <Camera size={20} />
                Prendre un selfie
              </>
            )}
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isDeleting}
            className="w-full h-14 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all bg-white border-2 border-orange-200 text-orange-600 active:scale-95 disabled:border-gray-200 disabled:text-gray-400"
          >
            <FolderOpen size={20} />
            Choisir une image
          </button>

          {hasStoredPhoto && (
            <button
              onClick={handleDelete}
              disabled={isUploading || isDeleting}
              className="w-full h-12 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all text-red-500 bg-red-50 border border-red-100 active:scale-95 disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <>
                  <Trash2 size={16} />
                  Supprimer ma photo
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Conseils */}
      <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50 flex gap-3">
        <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-blue-600/80 font-bold leading-relaxed">
          CONSEIL : Votre photo sera visible par les autres parents dans les groupes de parole.
          Choisissez une image qui vous représente bien.
        </p>
      </div>
    </div>
  );
};
