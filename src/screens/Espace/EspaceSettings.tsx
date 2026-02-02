import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { signOut, updateEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { validateToken, markTokenAsUsed } from '../../lib/tokenService';
import { BottomNav } from '../../components/ui/BottomNav';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  User,
  Plus,
  Pencil,
  Trash2,
  LogOut,
  X,
  Check,
  Loader2,
  QrCode,
  Keyboard,
  ChevronRight,
  Baby,
  ShieldCheck,
  Mail,
  Key,
  Eye,
  EyeOff
} from 'lucide-react';

interface Child {
  tokenId: string;
  nickname: string;
  addedAt: Date;
}

export const EspaceSettings = () => {
  const navigate = useNavigate();

  const [children, setChildren] = useState<Child[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pseudo, setPseudo] = useState('');
  const [editingChild, setEditingChild] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState('');
  const [showAddChild, setShowAddChild] = useState(false);
  const [addMode, setAddMode] = useState<'choice' | 'manual' | 'scan'>('choice');
  const [newToken, setNewToken] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Edit account states
  const [editModal, setEditModal] = useState<'pseudo' | 'email' | 'password' | null>(null);
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

  useEffect(() => {
    loadData();
  }, [navigate]);

  const loadData = async () => {
    const user = auth.currentUser;
    if (!user) {
      navigate('/espace');
      return;
    }

    try {
      // Load pseudo
      const accountRef = doc(db, 'accounts', user.uid);
      const accountSnap = await getDoc(accountRef);
      if (accountSnap.exists()) {
        setPseudo(accountSnap.data().pseudo || '');
      }

      // Load children
      const childrenRef = collection(db, 'accounts', user.uid, 'children');
      const q = query(childrenRef, orderBy('addedAt', 'desc'));
      const snapshot = await getDocs(q);

      const childrenData: Child[] = snapshot.docs.map(doc => ({
        tokenId: doc.id,
        nickname: doc.data().nickname,
        addedAt: doc.data().addedAt?.toDate?.() || new Date()
      }));

      setChildren(childrenData);
    } catch (err) {
      console.error('Erreur chargement données:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveNickname = async (tokenId: string) => {
    if (!editNickname.trim()) return;

    const user = auth.currentUser;
    if (!user) return;

    try {
      const childRef = doc(db, 'accounts', user.uid, 'children', tokenId);
      await updateDoc(childRef, { nickname: editNickname.trim() });

      setChildren(prev =>
        prev.map(c =>
          c.tokenId === tokenId ? { ...c, nickname: editNickname.trim() } : c
        )
      );
      setEditingChild(null);
      setEditNickname('');
    } catch (err) {
      console.error('Erreur:', err);
    }
  };

  const handleDeleteChild = async (tokenId: string) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const childRef = doc(db, 'accounts', user.uid, 'children', tokenId);
      await deleteDoc(childRef);

      setChildren(prev => prev.filter(c => c.tokenId !== tokenId));
      setShowDeleteConfirm(null);
    } catch (err) {
      console.error('Erreur suppression:', err);
    }
  };

  const handleAddChild = async () => {
    if (!newToken.trim() || !newNickname.trim()) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const result = await validateToken(newToken.trim());

      if (!result.valid) {
        setError(result.error || 'Token invalide');
        setIsValidating(false);
        return;
      }

      const existingChild = children.find(c => c.tokenId === newToken.trim());
      if (existingChild) {
        setError('Ce token est déjà associé');
        setIsValidating(false);
        return;
      }

      const user = auth.currentUser;
      if (!user) throw new Error('Non connecté');

      const childRef = doc(db, 'accounts', user.uid, 'children', newToken.trim());
      await setDoc(childRef, {
        nickname: newNickname.trim(),
        addedAt: serverTimestamp()
      });

      await markTokenAsUsed(newToken.trim());
      await loadData();

      setShowAddChild(false);
      setAddMode('choice');
      setNewToken('');
      setNewNickname('');

    } catch (err) {
      console.error('Erreur:', err);
      setError('Erreur inattendue. Réessayez.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/welcome');
  };

  // Ouvrir modal d'édition
  const openEditModal = (type: 'pseudo' | 'email' | 'password') => {
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

  // Sauvegarder le pseudo
  const handleSavePseudo = async () => {
    if (!newPseudo.trim() || newPseudo.trim().length < 2) {
      setEditError('Le pseudo doit contenir au moins 2 caractères');
      return;
    }

    setIsSaving(true);
    setEditError(null);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Non connecté');

      const accountRef = doc(db, 'accounts', user.uid);
      await updateDoc(accountRef, { pseudo: newPseudo.trim() });

      setPseudo(newPseudo.trim());
      setEditSuccess('Pseudo mis à jour !');
      setTimeout(() => setEditModal(null), 1500);
    } catch (err: any) {
      console.error('Erreur:', err);
      setEditError('Erreur lors de la mise à jour');
    } finally {
      setIsSaving(false);
    }
  };

  // Sauvegarder l'email
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
      if (!user || !user.email) throw new Error('Non connecté');

      // Ré-authentification requise pour changer l'email
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Mettre à jour l'email
      await updateEmail(user, newEmail.trim());

      // Mettre à jour Firestore
      const accountRef = doc(db, 'accounts', user.uid);
      await updateDoc(accountRef, { email: newEmail.trim() });

      setEditSuccess('Email mis à jour !');
      setTimeout(() => setEditModal(null), 1500);
    } catch (err: any) {
      console.error('Erreur:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setEditError('Mot de passe incorrect');
      } else if (err.code === 'auth/email-already-in-use') {
        setEditError('Cet email est déjà utilisé');
      } else if (err.code === 'auth/requires-recent-login') {
        setEditError('Veuillez vous reconnecter pour changer l\'email');
      } else {
        setEditError('Erreur lors de la mise à jour');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Sauvegarder le mot de passe
  const handleSavePassword = async () => {
    if (!currentPassword) {
      setEditError('Mot de passe actuel requis');
      return;
    }

    if (newPassword.length < 6) {
      setEditError('Le nouveau mot de passe doit contenir au moins 6 caractères');
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
      if (!user || !user.email) throw new Error('Non connecté');

      // Ré-authentification requise pour changer le mot de passe
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Mettre à jour le mot de passe
      await updatePassword(user, newPassword);

      setEditSuccess('Mot de passe mis à jour !');
      setTimeout(() => setEditModal(null), 1500);
    } catch (err: any) {
      console.error('Erreur:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setEditError('Mot de passe actuel incorrect');
      } else if (err.code === 'auth/requires-recent-login') {
        setEditError('Veuillez vous reconnecter pour changer le mot de passe');
      } else {
        setEditError('Erreur lors de la mise à jour');
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

  return (
    <div className="min-h-screen bg-[#FFFBF0] pb-32">
      {/* Premium Header */}
      <div className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-orange-100">
        <div className="max-w-md mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/espace/dashboard')}
            className="p-2 hover:bg-orange-50 rounded-xl transition-colors text-gray-400"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-extrabold text-gray-800 tracking-tight">Paramètres</h1>
        </div>
      </div>

      <main className="max-w-md mx-auto px-6 pt-8 space-y-10">
        {/* Section Enfants */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xl font-extrabold text-gray-800 tracking-tight">Mes Enfants</h2>
            <button
               onClick={() => setShowAddChild(true)}
               className="p-2 bg-orange-100 text-orange-600 rounded-xl hover:bg-orange-200 transition-colors"
            >
               <Plus size={20} />
            </button>
          </div>

          <div className="space-y-3">
             {children.length === 0 ? (
               <div className="glass p-8 text-center space-y-4 rounded-3xl border-2 border-white shadow-glass">
                  <div className="w-16 h-16 bg-gray-50 rounded-[1.5rem] flex items-center justify-center text-gray-300 mx-auto">
                     <Baby size={32} />
                  </div>
                  <p className="text-gray-400 font-medium text-sm">Aucun enfant n'est <br/>encore associé à votre compte.</p>
                  <button
                    onClick={() => setShowAddChild(true)}
                    className="h-12 px-6 bg-orange-500 text-white rounded-2xl font-bold shadow-premium"
                  >
                    Associer un enfant
                  </button>
               </div>
             ) : (
               children.map((child) => (
                 <motion.div
                   key={child.tokenId}
                   layout
                   className="glass rounded-3xl p-5 border-2 border-white shadow-glass"
                 >
                   {editingChild === child.tokenId ? (
                     <div className="flex items-center gap-3">
                       <input
                         type="text"
                         value={editNickname}
                         onChange={(e) => setEditNickname(e.target.value)}
                         className="flex-1 h-12 bg-white rounded-xl border-2 border-orange-100 px-4 focus:outline-none focus:border-orange-500 font-bold text-gray-700"
                         autoFocus
                       />
                       <button onClick={() => handleSaveNickname(child.tokenId)} className="w-12 h-12 bg-green-500 text-white rounded-xl flex items-center justify-center shadow-lg"><Check size={20}/></button>
                       <button onClick={() => setEditingChild(null)} className="w-12 h-12 bg-gray-100 text-gray-400 rounded-xl flex items-center justify-center"><X size={20}/></button>
                     </div>
                   ) : (
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 shadow-sm">
                           <Baby size={24} />
                        </div>
                        <div className="flex-1">
                           <p className="font-extrabold text-gray-800 text-lg">{child.nickname}</p>
                           <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ajouté le {child.addedAt.toLocaleDateString()}</p>
                        </div>
                        <div className="flex gap-1.5">
                           <button onClick={() => { setEditingChild(child.tokenId); setEditNickname(child.nickname); }} className="p-2.5 bg-gray-50 text-gray-400 hover:text-orange-500 rounded-xl transition-colors"><Pencil size={18}/></button>
                           <button onClick={() => setShowDeleteConfirm(child.tokenId)} className="p-2.5 bg-gray-50 text-gray-400 hover:text-red-500 rounded-xl transition-colors"><Trash2 size={18}/></button>
                        </div>
                     </div>
                   )}

                   <AnimatePresence>
                      {showDeleteConfirm === child.tokenId && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="pt-4 mt-4 border-t border-black/5 space-y-3">
                           <p className="text-sm font-bold text-gray-800">Supprimer de votre compte ?</p>
                           <p className="text-xs text-gray-400">Cette action est réversible en saisissant à nouveau le code famille.</p>
                           <div className="flex gap-2 pt-1">
                              <button onClick={() => handleDeleteChild(child.tokenId)} className="flex-1 h-10 bg-red-500 text-white rounded-xl font-bold text-xs">Supprimer</button>
                              <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 h-10 bg-gray-100 text-gray-400 rounded-xl font-bold text-xs">Annuler</button>
                           </div>
                        </motion.div>
                      )}
                   </AnimatePresence>
                 </motion.div>
               ))
             )}
          </div>
        </section>

        {/* Section Compte */}
        <section className="space-y-4">
           <h2 className="text-xl font-extrabold text-gray-800 tracking-tight px-1">Mon Compte</h2>
           <div className="glass rounded-[2rem] border-2 border-white shadow-glass overflow-hidden">
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
                    <p className="text-lg font-extrabold text-gray-800">{pseudo || 'Non défini'}</p>
                 </div>
                 <Pencil size={18} className="text-gray-300 group-hover:text-orange-500 transition-colors" />
              </button>

              {/* Email */}
              <button
                 onClick={() => openEditModal('email')}
                 className="w-full p-6 flex items-center gap-4 border-b border-black/5 hover:bg-gray-50 transition-colors group"
              >
                 <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400">
                    <Mail size={24} />
                 </div>
                 <div className="flex-1 text-left truncate">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Email</p>
                    <p className="text-gray-600 font-bold truncate">{auth.currentUser?.email}</p>
                 </div>
                 <Pencil size={18} className="text-gray-300 group-hover:text-orange-500 transition-colors" />
              </button>

              {/* Mot de passe */}
              <button
                 onClick={() => openEditModal('password')}
                 className="w-full p-6 flex items-center gap-4 border-b border-black/5 hover:bg-gray-50 transition-colors group"
              >
                 <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400">
                    <Key size={24} />
                 </div>
                 <div className="flex-1 text-left">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mot de passe</p>
                    <p className="text-gray-600 font-bold">••••••••</p>
                 </div>
                 <Pencil size={18} className="text-gray-300 group-hover:text-orange-500 transition-colors" />
              </button>

              {/* Déconnexion */}
              <button
                 onClick={handleLogout}
                 className="w-full p-6 flex items-center justify-between hover:bg-red-50 transition-colors group"
              >
                  <div className="flex items-center gap-4 text-red-500">
                     <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center">
                        <LogOut size={24} />
                     </div>
                     <span className="font-extrabold">Me déconnecter</span>
                  </div>
                  <ChevronRight size={20} className="text-gray-300 group-hover:translate-x-1 transition-transform" />
              </button>
           </div>
        </section>
      </main>

      {/* Modal Ajouter */}
      <AnimatePresence>
        {showAddChild && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center px-4"
            onClick={() => setShowAddChild(false)}
          >
            <motion.div
              initial={{ y: 100, scale: 0.9 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 100, scale: 0.9 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-premium pb-12 sm:pb-8"
            >
              <div className="flex items-center justify-between mb-8">
                 <h3 className="text-2xl font-extrabold text-gray-800 tracking-tight">Ajouter un enfant</h3>
                 <button onClick={() => setShowAddChild(false)} className="p-2 bg-gray-100 rounded-xl text-gray-400"><X size={20}/></button>
              </div>

              {addMode === 'choice' ? (
                <div className="space-y-4">
                   <button onClick={() => setAddMode('manual')} className="w-full h-24 bg-orange-500 rounded-[2rem] flex items-center gap-6 px-6 shadow-premium group transition-all">
                      <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-white"><Keyboard size={28}/></div>
                      <div className="text-left">
                         <p className="text-white font-extrabold text-lg">Saisir le code</p>
                         <p className="text-white/60 text-xs">Entrez manuellement le token</p>
                      </div>
                   </button>
                   <button className="w-full h-24 bg-gray-50 border-2 border-gray-100 rounded-[2rem] flex items-center gap-6 px-6 opacity-60 cursor-not-allowed">
                      <div className="w-14 h-14 bg-gray-200 rounded-2xl flex items-center justify-center text-gray-400"><QrCode size={28}/></div>
                      <div className="text-left">
                         <p className="text-gray-800 font-extrabold text-lg">Scanner le QR</p>
                         <p className="text-gray-400 text-xs">Bientôt disponible</p>
                      </div>
                   </button>
                </div>
              ) : (
                <div className="space-y-6">
                   <div className="space-y-4">
                      <div className="space-y-1.5">
                         <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Code Famille</label>
                         <input
                            value={newToken}
                            onChange={(e) => setNewToken(e.target.value)}
                            placeholder="Ex: abc-123-xyz"
                            className="w-full h-14 bg-gray-50 rounded-2xl border-2 border-gray-100 px-5 focus:outline-none focus:border-orange-500 font-bold"
                         />
                      </div>
                      <div className="space-y-1.5">
                         <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Surnom de l'enfant</label>
                         <input
                            value={newNickname}
                            onChange={(e) => setNewNickname(e.target.value)}
                            placeholder="Ex: Théo"
                            className="w-full h-14 bg-gray-50 rounded-2xl border-2 border-gray-100 px-5 focus:outline-none focus:border-orange-500 font-bold"
                         />
                      </div>
                   </div>

                   {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}

                   <div className="flex gap-3">
                      <button onClick={() => setAddMode('choice')} className="h-14 px-6 bg-gray-100 text-gray-500 rounded-2xl font-bold">Retour</button>
                      <button
                        onClick={handleAddChild}
                        disabled={isValidating}
                        className="flex-1 h-14 bg-orange-500 text-white rounded-2xl font-bold shadow-premium flex items-center justify-center"
                      >
                        {isValidating ? <Loader2 className="animate-spin" /> : 'Confirmer'}
                      </button>
                   </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Edit Account */}
      <AnimatePresence>
        {editModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center px-4"
            onClick={() => setEditModal(null)}
          >
            <motion.div
              initial={{ y: 100, scale: 0.9 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 100, scale: 0.9 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-premium pb-12 sm:pb-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-extrabold text-gray-800 tracking-tight">
                  {editModal === 'pseudo' && 'Modifier le pseudo'}
                  {editModal === 'email' && 'Modifier l\'email'}
                  {editModal === 'password' && 'Modifier le mot de passe'}
                </h3>
                <button onClick={() => setEditModal(null)} className="p-2 bg-gray-100 rounded-xl text-gray-400">
                  <X size={20} />
                </button>
              </div>

              {/* Success message */}
              {editSuccess && (
                <div className="mb-4 p-4 bg-green-50 text-green-600 rounded-2xl text-sm font-bold flex items-center gap-2">
                  <Check size={18} />
                  {editSuccess}
                </div>
              )}

              {/* Error message */}
              {editError && (
                <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-bold">
                  {editError}
                </div>
              )}

              <div className="space-y-4">
                {/* Pseudo form */}
                {editModal === 'pseudo' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                        Nouveau pseudo
                      </label>
                      <input
                        value={newPseudo}
                        onChange={(e) => setNewPseudo(e.target.value)}
                        placeholder="Ex: Maman de Théo"
                        maxLength={20}
                        className="w-full h-14 bg-gray-50 rounded-2xl border-2 border-gray-100 px-5 focus:outline-none focus:border-orange-500 font-bold"
                        autoFocus
                      />
                      <p className="text-[10px] text-gray-400 text-right">{newPseudo.length}/20</p>
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

                {/* Email form */}
                {editModal === 'email' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
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
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                        Mot de passe actuel (requis)
                      </label>
                      <div className="relative">
                        <input
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full h-14 bg-gray-50 rounded-2xl border-2 border-gray-100 px-5 pr-12 focus:outline-none focus:border-orange-500 font-bold"
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
                    <button
                      onClick={handleSaveEmail}
                      disabled={isSaving}
                      className="w-full h-14 bg-orange-500 text-white rounded-2xl font-bold shadow-premium flex items-center justify-center"
                    >
                      {isSaving ? <Loader2 className="animate-spin" /> : 'Enregistrer'}
                    </button>
                  </>
                )}

                {/* Password form */}
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
                          placeholder="••••••••"
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
                          placeholder="••••••••"
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
                        placeholder="••••••••"
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
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
};

export default EspaceSettings;

