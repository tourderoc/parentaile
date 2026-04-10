import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { signOut, updateEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential, deleteUser, GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';
import {
  doc,
  updateDoc,
  getDoc,
  deleteDoc,
  collection,
  getDocs
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  User,
  Pencil,
  LogOut,
  X,
  Check,
  Loader2,
  ChevronRight,
  Mail,
  Key,
  Eye,
  EyeOff,
  Bell,
  Volume2,
  Smile,
  Settings,
  AlertTriangle
} from 'lucide-react';
import {
  getUserPreferences,
  setNotificationsEnabled,
  setNotificationSoundEnabled,
  playNotificationSound
} from '../../lib/userPreferences';
import { UserAvatar } from '../../components/ui/UserAvatar';
import type { AvatarConfig } from '../../lib/avatarTypes';
import {
  DEFAULT_AVATAR,
  BG_COLORS,
  DICEBEAR_STYLES
} from '../../lib/avatarTypes';
import { RefreshCw, Sparkles, Star } from 'lucide-react';
import { AuthWall } from '../../components/ui/AuthWall';
import { AvatarAISelector } from '../../components/ui/AvatarAISelector';
import { useUser } from '../../lib/userContext';
import { AvatarAIService } from '../../lib/avatarAIService';

export const EspaceSettings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const tabParam = new URLSearchParams(location.search).get('tab');
  const { avatarConfig: contextAvatar } = useUser();
  const initialTab = tabParam === 'avatar' ? 1 : tabParam === 'notifs' ? 2 : 0;
  const [activeTab, setActiveTab] = useState(initialTab);

  const [isLoading, setIsLoading] = useState(true);
  const [pseudo, setPseudo] = useState('');

  // Edit account states
  const [editModal, setEditModal] = useState<'pseudo' | 'email' | 'password' | 'delete' | null>(null);
  const [newPseudo, setNewPseudo] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  // Notification preferences
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [soundEnabled, setSoundEnabledState] = useState(true);

  // Avatar
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(DEFAULT_AVATAR);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);
  const [avatarStep, setAvatarStep] = useState(0);
  const [recentConfigs, setRecentConfigs] = useState<AvatarConfig[]>([]);
  const AVATAR_STEPS = ['Style', 'Inspiration', 'Fond'];
  const [avatarMode, setAvatarMode] = useState<'static' | 'ai'>(
    contextAvatar?.avatarType === 'ai' ? 'ai' : 'static'
  );
  const [hasLocalPreview, setHasLocalPreview] = useState(false);

  useEffect(() => {
    loadData();
    const prefs = getUserPreferences();
    setNotificationsEnabledState(prefs.notificationsEnabled);
    setSoundEnabledState(prefs.notificationSoundEnabled);

    if (tabParam) {
      window.history.replaceState({}, '', '/espace/parametres');
    }
  }, [navigate]);

  // Sync avatar config from context (skip if user has a local preview pending)
  useEffect(() => {
    if (contextAvatar && !hasLocalPreview) {
      setAvatarConfig(contextAvatar);
    }
  }, [contextAvatar, hasLocalPreview]);

  const loadData = async () => {
    const user = auth.currentUser;
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const accountRef = doc(db, 'accounts', user.uid);
      const accountSnap = await getDoc(accountRef);
      if (accountSnap.exists()) {
        setPseudo(accountSnap.data().pseudo || '');
        if (accountSnap.data().avatar) {
          setAvatarConfig(accountSnap.data().avatar);
        }
      }
    } catch (err) {
      console.error('Erreur chargement donnees:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/welcome');
  };

  const handleNotificationsToggle = () => {
    const newValue = !notificationsEnabled;
    setNotificationsEnabledState(newValue);
    setNotificationsEnabled(newValue);
  };

  const handleSoundToggle = () => {
    const newValue = !soundEnabled;
    setSoundEnabledState(newValue);
    setNotificationSoundEnabled(newValue);
    if (newValue) {
      setTimeout(() => playNotificationSound(), 100);
    }
  };

  const handleSaveAvatar = async () => {
    setAvatarSaving(true);
    setAvatarSuccess(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Non connecte');
      const cleanConfig = { ...avatarConfig, avatarType: 'static', aiUrl: '' };

      // Sauvegarde VPS (source de vérité) + Firebase (compat userContext)
      await Promise.all([
        AvatarAIService.saveCustomConfig(user.uid, cleanConfig),
        updateDoc(doc(db, 'accounts', user.uid), { avatar: cleanConfig }),
      ]);

      setAvatarConfig(cleanConfig);
      setAvatarSuccess('Avatar enregistre !');
      setTimeout(() => setAvatarSuccess(null), 3000);
    } catch (err) {
      console.error('Erreur sauvegarde avatar:', err);
    } finally {
      setAvatarSaving(false);
    }
  };

  const openEditModal = (type: 'pseudo' | 'email' | 'password' | 'delete') => {
    setEditError(null);
    setEditSuccess(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');

    if (type === 'pseudo') {
      setNewPseudo(pseudo);
    } else if (type === 'email') {
      setNewEmail(auth.currentUser?.email || '');
    }
    setEditModal(type);
  };

  const handleSavePseudo = async () => {
    if (!newPseudo.trim() || newPseudo.trim().length < 2) {
      setEditError('Le pseudo doit contenir au moins 2 caracteres');
      return;
    }

    setIsSaving(true);
    setEditError(null);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Non connecte');

      const accountRef = doc(db, 'accounts', user.uid);
      await updateDoc(accountRef, { pseudo: newPseudo.trim() });

      setPseudo(newPseudo.trim());
      setEditSuccess('Pseudo mis a jour !');
      setTimeout(() => setEditModal(null), 1500);
    } catch (err: any) {
      console.error('Erreur:', err);
      setEditError('Erreur lors de la mise a jour');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setEditError('Email invalide');
      return;
    }

    if (!currentPassword) {
      setEditError('Mot de passe actuel requis');
      return;
    }

    setIsSaving(true);
    setEditError(null);

    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error('Non connecte');

      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updateEmail(user, newEmail.trim());

      const accountRef = doc(db, 'accounts', user.uid);
      await updateDoc(accountRef, { email: newEmail.trim() });

      setEditSuccess('Email mis a jour !');
      setTimeout(() => setEditModal(null), 1500);
    } catch (err: any) {
      console.error('Erreur:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setEditError('Mot de passe incorrect');
      } else if (err.code === 'auth/email-already-in-use') {
        setEditError('Cet email est deja utilise');
      } else if (err.code === 'auth/requires-recent-login') {
        setEditError('Veuillez vous reconnecter pour changer l\'email');
      } else {
        setEditError('Erreur lors de la mise a jour');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePassword = async () => {
    if (!currentPassword) {
      setEditError('Mot de passe actuel requis');
      return;
    }

    if (newPassword.length < 6) {
      setEditError('Le nouveau mot de passe doit contenir au moins 6 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      setEditError('Les mots de passe ne correspondent pas');
      return;
    }

    setIsSaving(true);
    setEditError(null);

    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error('Non connecte');

      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      setEditSuccess('Mot de passe mis a jour !');
      setTimeout(() => setEditModal(null), 1500);
    } catch (err: any) {
      console.error('Erreur:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setEditError('Mot de passe actuel incorrect');
      } else if (err.code === 'auth/requires-recent-login') {
        setEditError('Veuillez vous reconnecter pour changer le mot de passe');
      } else {
        setEditError('Erreur lors de la mise a jour');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsSaving(true);
    setEditError(null);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Non connecte');

      const isGoogle = user.providerData.some(p => p.providerId === 'google.com');

      if (isGoogle) {
        const provider = new GoogleAuthProvider();
        await reauthenticateWithPopup(user, provider);
      } else {
        if (!currentPassword) {
          setEditError('Mot de passe actuel requis');
          setIsSaving(false);
          return;
        }
        if (!user.email) throw new Error('Email manquant');
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
      }

      // Supprimer les enfants d'abord
      const childrenRef = collection(db, 'accounts', user.uid, 'children');
      const childrenSnap = await getDocs(childrenRef);
      const deletePromises = childrenSnap.docs.map(childDoc => deleteDoc(childDoc.ref));
      await Promise.all(deletePromises);

      // Supprimer le document account parent
      const accountRef = doc(db, 'accounts', user.uid);
      await deleteDoc(accountRef);

      // Supprimer l'utilisateur Auth Firebase
      await deleteUser(user);

      navigate('/welcome');
    } catch (err: any) {
      console.error('Erreur suppression compte:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setEditError('Mot de passe actuel incorrect');
      } else if (err.code === 'auth/requires-recent-login') {
        setEditError('Veuillez vous reconnecter pour supprimer votre compte');
      } else if (err.code === 'auth/popup-closed-by-user') {
        setEditError('La validation par Google a ete annulee');
      } else {
        setEditError('Erreur lors de la suppression du compte');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FFFBF0] flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!auth.currentUser) {
    return (
      <AuthWall 
        title="Paramètres" 
        description="Connectez-vous pour configurer votre profil, votre sécurité et vos préférences de notification."
        icon={Settings}
      />
    );
  }

  return (
    <div className="min-h-full flex flex-col">
      {/* Hero Header sticky - Premium Dark Cartouche Version matching SlideAccueil */}
      <div className="sticky top-0 z-40 px-6 pt-3 pb-2">
        <div className="relative border border-white/20 shadow-premium overflow-hidden bg-gray-900 rounded-[2rem]">
          {/* Background Image - Full color like the Accueil card */}
          <div className="absolute inset-0 opacity-80">
            <img 
              src="/assets/backgrounds/slide_bg_settings.png" 
              alt="Settings Wallpaper"
              className="w-full h-full object-cover transform translate-y-[-5%] scale-110"
            />
          </div>
          
          {/* Dark Overlay gradient matching SlideAccueil card */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10 pointer-events-none" />

          {/* Compact Flex Content */}
          <div className="relative px-5 py-5 flex items-center gap-4">
            <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex flex-shrink-0 items-center justify-center shadow-glass border border-white/20">
              <Settings size={28} className="text-white drop-shadow-md" />
            </div>
            <div className="flex-1">
              <h1 className="text-[20px] font-black text-white tracking-tight drop-shadow-md leading-tight">
                Parametres
              </h1>
              <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest mt-0.5 drop-shadow-sm line-clamp-1">
                Compte, avatar et notifications
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="max-w-md mx-auto px-6 pb-1 pt-1 w-full">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {[
            { icon: User, label: 'Compte' },
            { icon: Smile, label: 'Avatar' },
            { icon: Bell, label: 'Notifs' },
          ].map((tab, index) => (
            <button
              key={index}
              onClick={() => setActiveTab(index)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === index
                  ? 'text-orange-600 bg-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 pb-32">
        {/* Tab 1: Mon Compte */}
        {activeTab === 0 && (
          <div className="max-w-md mx-auto px-6 pt-8">
            <section className="space-y-4">
              <h2 className="text-xl font-extrabold text-gray-800 tracking-tight px-1">Mon Compte</h2>
              <div className="bg-white/40 backdrop-blur-xl rounded-[2rem] border border-white/60 shadow-[0_8px_32px_rgba(31,38,135,0.07)] overflow-hidden">
                {/* Pseudo */}
                <button
                   onClick={() => openEditModal('pseudo')}
                   className="w-full p-6 flex items-center gap-4 border-b border-black/5 hover:bg-orange-50/50 transition-colors group"
                >
                   <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-500">
                      <User size={24} />
                   </div>
                   <div className="flex-1 text-left">
                      <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Pseudo Parent</p>
                      <p className="text-lg font-extrabold text-gray-800">{pseudo || 'Non defini'}</p>
                   </div>
                   <Pencil size={18} className="text-gray-300 group-hover:text-orange-500 transition-colors" />
                </button>

                {/* Email */}
                <button
                   onClick={() => openEditModal('email')}
                   className="w-full p-6 flex items-center gap-4 border-b border-black/5 hover:bg-gray-50 transition-colors group"
                >
                   <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-500">
                      <Mail size={24} />
                   </div>
                   <div className="flex-1 text-left truncate">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Email</p>
                      <p className="text-gray-600 font-bold truncate">{auth.currentUser?.email}</p>
                   </div>
                   <Pencil size={18} className="text-gray-300 group-hover:text-orange-500 transition-colors" />
                </button>

                {/* Mot de passe */}
                <button
                   onClick={() => openEditModal('password')}
                   className="w-full p-6 flex items-center gap-4 border-b border-black/5 hover:bg-gray-50 transition-colors group"
                >
                   <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-500">
                      <Key size={24} />
                   </div>
                   <div className="flex-1 text-left">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Mot de passe</p>
                      <p className="text-gray-600 font-bold">........</p>
                   </div>
                   <Pencil size={18} className="text-gray-300 group-hover:text-orange-500 transition-colors" />
                </button>

                {/* Deconnexion */}
                <button
                   onClick={handleLogout}
                   className="w-full p-6 flex items-center justify-between hover:bg-red-50 transition-colors group"
                >
                    <div className="flex items-center gap-4 text-red-500">
                       <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center">
                          <LogOut size={24} />
                       </div>
                       <span className="font-extrabold">Me deconnecter</span>
                    </div>
                    <ChevronRight size={20} className="text-gray-300 group-hover:translate-x-1 transition-transform" />
                </button>

                {/* Supprimer compte */}
                <button
                   onClick={() => openEditModal('delete')}
                   className="w-full px-6 py-5 flex items-center justify-center group border-t border-red-100 bg-red-50/20 hover:bg-red-50 transition-colors"
                >
                    <span className="text-[11px] font-bold text-red-400 group-hover:text-red-600 uppercase tracking-widest transition-colors flex items-center gap-2">
                       <AlertTriangle size={14} />
                       Supprimer mon compte
                    </span>
                </button>
              </div>
            </section>
          </div>
        )}

        {/* Tab 2: Avatar */}
        {activeTab === 1 && (
          <div className="max-w-md mx-auto px-6 pt-4 flex flex-col">
            {/* Mode Switcher */}
            <div className="flex p-1 bg-gray-100 rounded-xl mb-6">
              <button
                onClick={() => setAvatarMode('static')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  avatarMode === 'static' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500'
                }`}
              >
                Avatar Dessiné
              </button>
              <button
                onClick={() => setAvatarMode('ai')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  avatarMode === 'ai' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500'
                }`}
              >
                <Sparkles size={12} />
                Avatar Portrait (IA)
              </button>
            </div>

            {/* Preview - always visible */}
            <div className="flex flex-col items-center">
              <UserAvatar config={avatarConfig} size={100} className="shadow-premium" />
              {avatarSuccess && (
                <motion.p
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-xs font-bold text-green-600 flex items-center gap-1"
                >
                  <Check size={14} />
                  {avatarSuccess}
                </motion.p>
              )}
            </div>

            {/* Step content */}
            {avatarMode === 'static' ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex justify-center gap-2 mt-3 mb-3">
                  {AVATAR_STEPS.map((label, i) => (
                    <button
                      key={label}
                      onClick={() => setAvatarStep(i)}
                      className={`h-2 rounded-full transition-all ${
                        avatarStep === i ? 'w-6 bg-orange-500' : 'w-2 bg-gray-300'
                      }`}
                    />
                  ))}
                </div>
                
                <AnimatePresence mode="wait">
                    <motion.div
                      key={avatarStep}
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -30 }}
                      transition={{ duration: 0.2 }}
                      className="bg-white/40 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_8px_32px_rgba(31,38,135,0.07)] p-4 space-y-3 mb-3"
                    >
                    <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest text-center">
                      {AVATAR_STEPS[avatarStep]}
                    </p>
                    {avatarStep === 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {DICEBEAR_STYLES.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => {
                              setAvatarConfig(prev => ({
                                ...prev,
                                avatarType: 'static',
                                version: 'v2',
                                dicebearStyle: s.id as any,
                              }));
                            }}
                            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-[0.97] border-2 ${
                              avatarConfig.dicebearStyle === s.id
                                ? 'bg-orange-50 border-orange-500 shadow-sm'
                                : 'bg-gray-50 border-transparent hover:bg-gray-100'
                            }`}
                          >
                            <div className="w-11 h-11 rounded-lg overflow-hidden shadow-inner bg-white">
                               <img src={s.preview} alt={s.label} className="w-full h-full object-cover" />
                            </div>
                            <span className={`text-[9px] font-bold uppercase tracking-wider ${
                              avatarConfig.dicebearStyle === s.id ? 'text-orange-600' : 'text-gray-500'
                            }`}>
                              {s.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {avatarStep === 1 && (
                      <div className="flex flex-col items-center justify-center py-6 space-y-6">
                        <div className="text-center space-y-2">
                          <Sparkles className="w-8 h-8 text-orange-400 mx-auto" />
                          <h4 className="text-sm font-extrabold text-gray-800">Trouvez votre style</h4>
                          <p className="text-xs text-gray-500">Cliquez pour générer une nouvelle combinaison unique.</p>
                        </div>
                        
                        <div className="flex items-center gap-6">
                          <div className="relative group">
                            <button
                              onClick={() => {
                                setAvatarConfig(prev => ({
                                  ...prev,
                                  avatarType: 'static',
                                  version: 'v2',
                                  seed: Math.random().toString(36).substring(7),
                                }));
                              }}
                              className="w-20 h-20 bg-orange-500 text-white rounded-3xl shadow-lg flex items-center justify-center active:rotate-180 transition-transform duration-500 hover:scale-105 z-10"
                              title="Nouvelle inspiration"
                            >
                              <RefreshCw size={32} />
                            </button>
                            
                            <button
                              onClick={() => {
                                const exists = recentConfigs.some(c => c.seed === avatarConfig.seed && c.dicebearStyle === avatarConfig.dicebearStyle);
                                if (!exists) {
                                  setRecentConfigs(prev => [avatarConfig, ...prev].slice(0, 3));
                                }
                              }}
                              className="absolute -top-2 -right-2 w-10 h-10 bg-yellow-400 text-white rounded-2xl shadow-md flex items-center justify-center hover:scale-110 active:scale-95 transition-all border-4 border-white z-20"
                              title="Ajouter aux favoris"
                            >
                              <Star size={20} fill="white" />
                            </button>
                          </div>

                          <div className="flex flex-col gap-2">
                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-tighter text-center">
                              {recentConfigs.length > 0 ? 'Tes Favoris' : 'Sélection'}
                            </p>
                            <div className="flex gap-2 min-w-[120px]">
                              {[0, 1, 2].map((idx) => {
                                const config = recentConfigs[idx];
                                return (
                                  <button
                                    key={idx}
                                    onClick={() => config && setAvatarConfig(config)}
                                    className={`w-12 h-12 rounded-xl border-2 transition-all overflow-hidden bg-white/40 backdrop-blur-sm shadow-sm ${
                                      config ? 'border-yellow-200 active:scale-90 opacity-100' : 'border-gray-100 border-dashed opacity-40 grayscale pointer-events-none'
                                    }`}
                                  >
                                    {config ? (
                                      <UserAvatar config={config} size={48} className="w-full h-full" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                                        <Star size={12} />
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                           <span className="px-3 py-1 bg-gray-100 rounded-full text-[10px] font-bold text-gray-500">
                             Identifiant: {avatarConfig.seed || 'aucun'}
                           </span>
                        </div>
                      </div>
                    )}

                    {avatarStep === 2 && (
                      <div className="flex flex-wrap gap-4 justify-center py-4">
                        {BG_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => setAvatarConfig(prev => ({ ...prev, avatarType: 'static', bgColor: color }))}
                            className={`w-12 h-12 rounded-full border-[3px] transition-all active:scale-90 ${
                              avatarConfig.bgColor === color ? 'border-orange-500 scale-110 shadow-md' : 'border-transparent'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                {/* Navigation + Save (Pinned) */}
                <div className="flex gap-3 mt-auto shrink-0 pb-4">
                  {avatarStep > 0 && (
                    <button
                      onClick={() => setAvatarStep(prev => prev - 1)}
                      className="w-14 h-12 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-500 active:scale-95 transition-all"
                    >
                      <ArrowLeft size={20} />
                    </button>
                  )}
                  {avatarStep < AVATAR_STEPS.length - 1 ? (
                    <button
                      onClick={() => setAvatarStep(prev => prev + 1)}
                      className="flex-1 h-12 bg-orange-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-[0.97] transition-all shadow-premium"
                    >
                      Suivant
                      <ChevronRight size={18} />
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveAvatar}
                      disabled={avatarSaving}
                      className="flex-1 h-12 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-[0.97] transition-all shadow-premium"
                    >
                      {avatarSaving ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Check size={18} />
                          Enregistrer
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pb-4">
                <AvatarAISelector
                  onPreviewGenerated={(url) => {
                    setHasLocalPreview(true);
                    setAvatarConfig(prev => ({ ...prev, avatarType: 'ai', aiUrl: url }));
                  }}
                  onSaved={() => setHasLocalPreview(false)}
                  onReset={() => {
                    setHasLocalPreview(false);
                    if (contextAvatar) setAvatarConfig(contextAvatar);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Notifications */}
        {activeTab === 2 && (
          <div className="max-w-md mx-auto px-6 pt-8">
            <section className="space-y-4">
              <h2 className="text-xl font-extrabold text-gray-800 tracking-tight px-1">Notifications</h2>
              <div className="bg-white/40 backdrop-blur-xl rounded-[2rem] border border-white/60 shadow-[0_8px_32px_rgba(31,38,135,0.07)] overflow-hidden">
                {/* Toggle Notifications */}
                <button
                   onClick={handleNotificationsToggle}
                   className="w-full p-6 flex items-center gap-4 border-b border-black/5 hover:bg-orange-50/50 transition-colors group"
                >
                   <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                     notificationsEnabled ? 'bg-orange-100 text-orange-500' : 'bg-gray-100 text-gray-500'
                   }`}>
                      <Bell size={24} />
                   </div>
                   <div className="flex-1 text-left">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Notifications</p>
                      <p className="text-lg font-extrabold text-gray-800">
                        {notificationsEnabled ? 'Activees' : 'Desactivees'}
                      </p>
                   </div>
                   <div className={`w-14 h-8 rounded-full p-1 transition-colors ${
                     notificationsEnabled ? 'bg-orange-500' : 'bg-gray-300'
                   }`}>
                     <div className={`w-6 h-6 bg-white rounded-full shadow-md transition-transform ${
                       notificationsEnabled ? 'translate-x-6' : 'translate-x-0'
                     }`} />
                   </div>
                </button>

                {/* Toggle Son */}
                <button
                   onClick={handleSoundToggle}
                   disabled={!notificationsEnabled}
                   className={`w-full p-6 flex items-center gap-4 transition-colors ${
                     notificationsEnabled ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'
                   }`}
                >
                   <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                     soundEnabled && notificationsEnabled ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-500'
                   }`}>
                      <Volume2 size={24} />
                   </div>
                   <div className="flex-1 text-left">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Son</p>
                      <p className="text-lg font-extrabold text-gray-800">
                        {soundEnabled ? 'Active' : 'Desactive'}
                      </p>
                   </div>
                   <div className={`w-14 h-8 rounded-full p-1 transition-colors ${
                     soundEnabled && notificationsEnabled ? 'bg-blue-500' : 'bg-gray-300'
                   }`}>
                     <div className={`w-6 h-6 bg-white rounded-full shadow-md transition-transform ${
                       soundEnabled && notificationsEnabled ? 'translate-x-6' : 'translate-x-0'
                     }`} />
                   </div>
                </button>
              </div>
              <p className="text-sm font-bold text-gray-700 text-center px-8 mt-4 leading-relaxed">
                Recevez des alertes lorsque votre medecin vous envoie un message
              </p>
            </section>
          </div>
        )}
      </div>

      {/* Modal Edit Account */}
      <AnimatePresence>
        {editModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center px-4"
            onClick={() => setEditModal(null)}
          >
            <motion.div
              initial={{ y: 100, scale: 0.9 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 100, scale: 0.9 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-premium pb-32 sm:pb-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-extrabold text-gray-800 tracking-tight">
                  {editModal === 'pseudo' && 'Modifier le pseudo'}
                  {editModal === 'email' && 'Modifier l\'email'}
                  {editModal === 'password' && 'Modifier le mot de passe'}
                  {editModal === 'delete' && 'Supprimer le compte'}
                </h3>
                <button onClick={() => setEditModal(null)} className="p-2 bg-gray-100 rounded-xl text-gray-500">
                  <X size={20} />
                </button>
              </div>

              {editSuccess && (
                <div className="mb-4 p-4 bg-green-50 text-green-600 rounded-2xl text-sm font-bold flex items-center gap-2">
                  <Check size={18} />
                  {editSuccess}
                </div>
              )}

              {editError && (
                <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-bold">
                  {editError}
                </div>
              )}

              <div className="space-y-4">
                {editModal === 'pseudo' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
                        Nouveau pseudo
                      </label>
                      <input
                        value={newPseudo}
                        onChange={(e) => setNewPseudo(e.target.value)}
                        placeholder="Ex: Maman de Theo"
                        maxLength={20}
                        className="w-full h-14 bg-gray-50 rounded-2xl border-2 border-gray-100 px-5 focus:outline-none focus:border-orange-500 font-bold"
                        autoFocus
                      />
                      <p className="text-[10px] text-gray-500 text-right">{newPseudo.length}/20</p>
                    </div>
                    <button
                      onClick={handleSavePseudo}
                      disabled={isSaving}
                      className="w-full h-14 bg-orange-500 text-white rounded-2xl font-bold shadow-premium flex items-center justify-center"
                    >
                      {isSaving ? <Loader2 className="animate-spin" /> : 'Enregistrer'}
                    </button>
                  </>
                )}

                {editModal === 'email' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
                        Nouvel email
                      </label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="votre@email.com"
                        className="w-full h-14 bg-gray-50 rounded-2xl border-2 border-gray-100 px-5 focus:outline-none focus:border-orange-500 font-bold"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
                        Mot de passe actuel (requis)
                      </label>
                      <div className="relative">
                        <input
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="........"
                          className="w-full h-14 bg-gray-50 rounded-2xl border-2 border-gray-100 px-5 pr-12 focus:outline-none focus:border-orange-500 font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500"
                        >
                          {showCurrentPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={handleSaveEmail}
                      disabled={isSaving}
                      className="w-full h-14 bg-orange-500 text-white rounded-2xl font-bold shadow-premium flex items-center justify-center"
                    >
                      {isSaving ? <Loader2 className="animate-spin" /> : 'Enregistrer'}
                    </button>
                  </>
                )}

                {editModal === 'password' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                        Mot de passe actuel
                      </label>
                      <div className="relative">
                        <input
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="........"
                          className="w-full h-14 bg-gray-50 rounded-2xl border-2 border-gray-100 px-5 pr-12 focus:outline-none focus:border-orange-500 font-bold"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                        >
                          {showCurrentPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                        Nouveau mot de passe
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="........"
                          className="w-full h-14 bg-gray-50 rounded-2xl border-2 border-gray-100 px-5 pr-12 focus:outline-none focus:border-orange-500 font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                        >
                          {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                        Confirmer le nouveau mot de passe
                      </label>
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="........"
                        className="w-full h-14 bg-gray-50 rounded-2xl border-2 border-gray-100 px-5 focus:outline-none focus:border-orange-500 font-bold"
                      />
                    </div>
                    <button
                      onClick={handleSavePassword}
                      disabled={isSaving}
                      className="w-full h-14 bg-orange-500 text-white rounded-2xl font-bold shadow-premium flex items-center justify-center"
                    >
                      {isSaving ? <Loader2 className="animate-spin" /> : 'Enregistrer'}
                    </button>
                  </>
                )}

                {editModal === 'delete' && (
                  <>
                    <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex flex-col items-center text-center gap-2 mb-6">
                      <AlertTriangle size={32} className="text-red-500 mb-2" />
                      <h4 className="text-sm font-extrabold text-red-600">Action irrevocable</h4>
                      <p className="text-[11px] font-bold text-red-400/80 leading-relaxed uppercase tracking-widest">
                        La suppression effacera vos donnees, l'historique et les dossiers de vos enfants.
                      </p>
                    </div>

                    {auth.currentUser?.providerData.some(p => p.providerId === 'google.com') ? (
                      <p className="text-xs text-gray-500 font-medium text-center px-4 mb-6">
                        Veuillez vous re-authentifier avec Google pour confirmer votre identite.
                      </p>
                    ) : (
                      <div className="space-y-1.5 mb-6">
                        <label className="text-[10px] font-bold text-red-500 uppercase tracking-widest ml-1">
                          Mot de passe actuel
                        </label>
                        <div className="relative">
                          <input
                            type={showCurrentPassword ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="Entrez votre mot de passe pour confirmer"
                            className="w-full h-14 bg-red-50/50 rounded-2xl border-2 border-red-100 px-5 pr-12 focus:outline-none focus:border-red-500 font-bold text-red-600 placeholder:text-red-300"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-red-400 hover:text-red-600 transition-colors"
                          >
                            {showCurrentPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleDeleteAccount}
                      disabled={isSaving}
                      className="w-full h-14 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-bold shadow-premium flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                      {isSaving ? <Loader2 className="animate-spin" /> : 'Supprimer definitivement'}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default EspaceSettings;
