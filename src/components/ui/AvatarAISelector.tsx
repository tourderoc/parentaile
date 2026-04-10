import React, { useState, useEffect } from 'react';
import { Camera, Sparkles, Loader2, AlertCircle, Check, Info, RefreshCw } from 'lucide-react';
import { useUser } from '../../lib/userContext';
import { AvatarAIService, QuotaStatus } from '../../lib/avatarAIService';
import { motion } from 'framer-motion';

export const AvatarAISelector = () => {
  const { currentUser, avatarGenCount, lastAvatarGenDate, avatarConfig } = useUser();
  const [quota, setQuota] = useState<QuotaStatus>({ canGenerate: true, remaining: 2 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  // Show current AI avatar if exists
  const currentAiUrl = avatarConfig?.avatarType === 'ai' ? avatarConfig?.aiUrl : null;

  useEffect(() => {
    if (currentUser) {
      updateQuota();
    }
  }, [currentUser, avatarGenCount, lastAvatarGenDate]);

  const updateQuota = async () => {
    if (!currentUser) return;
    const q = await AvatarAIService.checkQuota(currentUser.uid);
    setQuota(q);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setGeneratedUrl(null);
      setError(null);
    }
  };

  const handleGenerate = async () => {
    if (!currentUser || !selectedFile) return;

    const q = await AvatarAIService.checkQuota(currentUser.uid);
    if (!q.canGenerate) {
      setError(q.reason || 'Quota atteint');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const url = await AvatarAIService.generatePreview(currentUser.uid, selectedFile);
      setGeneratedUrl(url);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'La génération a échoué. Réessayez plus tard.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!currentUser || !generatedUrl) return;

    setIsSaving(true);
    try {
      await AvatarAIService.saveAvatar(currentUser.uid, generatedUrl);
      setSelectedFile(null);
      setPreviewUrl(null);
      setGeneratedUrl(null);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setGeneratedUrl(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Infos Quota */}
      <div className={`p-4 rounded-2xl flex items-center gap-3 border ${
        quota.canGenerate ? 'bg-orange-50 border-orange-100 text-orange-700' : 'bg-gray-50 border-gray-100 text-gray-500'
      }`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          quota.canGenerate ? 'bg-white text-orange-500' : 'bg-white text-gray-400'
        }`}>
          <Sparkles size={20} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-extrabold">Style Portrait IA</p>
          <p className="text-[11px] font-bold opacity-80">
            {quota.canGenerate
              ? `Il vous reste ${quota.remaining} tentative${quota.remaining > 1 ? 's' : ''} aujourd'hui.`
              : "Revenez demain pour de nouveaux essais !"}
          </p>
        </div>
      </div>

      {/* Generated preview → confirm or retry */}
      {generatedUrl ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="relative aspect-square w-full max-w-[220px] mx-auto">
            <div className="w-full h-full rounded-[2.5rem] overflow-hidden shadow-lg border-4 border-orange-200">
              <img src={generatedUrl} alt="Avatar généré" className="w-full h-full object-cover" />
            </div>
          </div>

          <div className="text-center">
            <h4 className="text-sm font-black text-gray-800">Votre nouveau portrait</h4>
            <p className="text-[11px] text-gray-500 mt-1">Ça vous plaît ? Enregistrez-le ou réessayez.</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 h-12 bg-gray-100 text-gray-600 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <RefreshCw size={16} />
              Réessayer
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 h-12 bg-orange-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-premium"
            >
              {isSaving ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  <Check size={18} />
                  Enregistrer
                </>
              )}
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {/* Current AI avatar display */}
          {currentAiUrl && !selectedFile && (
            <div className="flex flex-col items-center gap-2">
              <div className="w-24 h-24 rounded-[1.8rem] overflow-hidden shadow-md border-2 border-orange-100">
                <img src={currentAiUrl} alt="Avatar actuel" className="w-full h-full object-cover" />
              </div>
              <p className="text-[10px] text-gray-400 font-bold">Avatar IA actuel</p>
            </div>
          )}

          {/* Upload Area */}
          <div className="relative aspect-square w-full max-w-[200px] mx-auto group">
            <div className="absolute inset-0 bg-gray-100 rounded-[2.5rem] border-4 border-dashed border-gray-200 flex flex-col items-center justify-center overflow-hidden transition-all group-hover:border-orange-300">
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center text-gray-400">
                  <Camera size={40} strokeWidth={1.5} />
                  <p className="text-[10px] font-bold mt-2 uppercase tracking-widest">Selfie Proche</p>
                </div>
              )}
            </div>

            <input
              type="file"
              accept="image/*"
              capture="user"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={handleFileChange}
              disabled={!quota.canGenerate || isGenerating}
            />
          </div>

          <div className="text-center px-4">
            <h4 className="text-sm font-bold text-gray-800">Transformez-vous !</h4>
            <p className="text-[11px] text-gray-500 mt-1">
              Prenez un selfie bien éclairé de face. <br />
              L'IA créera un portrait unique inspiré de vous.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-xl flex items-center gap-2 text-[11px] font-bold border border-red-100 mx-4">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={!selectedFile || isGenerating || !quota.canGenerate}
            className={`w-full h-14 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-premium ${
              selectedFile && !isGenerating && quota.canGenerate
                ? 'bg-orange-500 text-white active:scale-95'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Transformation en cours...
              </>
            ) : (
              <>
                <Sparkles size={20} />
                Lancer la magie
              </>
            )}
          </button>
        </div>
      )}

      {/* Conseils */}
      <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50 flex gap-3">
        <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-blue-600/80 font-bold leading-relaxed">
          CONSEIL : Pour un meilleur résultat, soyez dans un endroit lumineux sans lunettes de soleil.
        </p>
      </div>
    </div>
  );
};
