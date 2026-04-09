import React, { useState, useEffect } from 'react';
import { Camera, Sparkles, Loader2, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { useUser } from '../../lib/userContext';
import { AvatarAIService, QuotaStatus } from '../../lib/avatarAIService';
import { motion } from 'framer-motion';

export const AvatarAISelector = () => {
  const { currentUser, avatarGenCount, lastAvatarGenDate } = useUser();
  const [quota, setQuota] = useState<QuotaStatus>({ canGenerate: true, remaining: 2 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
      setError(null);
    }
  };

  const handleGenerate = async () => {
    if (!currentUser || !selectedFile) return;

    // Double check quota
    const q = await AvatarAIService.checkQuota(currentUser.uid);
    if (!q.canGenerate) {
      setError(q.reason || 'Quota atteint');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSuccess(false);

    try {
      await AvatarAIService.generateAvatar(currentUser.uid, selectedFile);
      setSuccess(true);
      setSelectedFile(null);
      setPreviewUrl(null);
      // Quota will be updated via UserContext real-time listener
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'La génération a échoué. Réessayez plus tard.');
    } finally {
      setIsGenerating(false);
    }
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

      {!success ? (
        <div className="space-y-4">
          {/* Preview or Upload Area */}
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
      ) : (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="py-12 flex flex-col items-center text-center space-y-4"
        >
          <div className="w-20 h-20 bg-green-100 text-green-500 rounded-3xl flex items-center justify-center">
            <CheckCircle2 size={40} />
          </div>
          <div>
            <h3 className="text-lg font-black text-gray-800 tracking-tight">Portrait Généré !</h3>
            <p className="text-xs text-gray-500 font-bold mt-1 px-8">
              Votre nouvel avatar IA a été appliqué à votre profil avec succès.
            </p>
          </div>
          <button 
            onClick={() => setSuccess(false)}
            className="text-orange-500 font-extrabold text-xs uppercase tracking-widest mt-4"
          >
            Refaire un essai
          </button>
        </motion.div>
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
