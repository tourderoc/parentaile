import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../../lib/firebase';
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
} from 'firebase/firestore';
import { validateToken } from '../../../lib/tokenService';
import { QRScanner } from '../../../components/QRScanner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Baby,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Loader2,
  QrCode,
  Keyboard,
  MessageSquarePlus,
  Users
} from 'lucide-react';
import { MessageComposer } from '../MessageComposer';

interface Child {
  tokenId: string;
  nickname: string;
  addedAt: Date;
}

export const SlideContact = () => {
  const navigate = useNavigate();

  // Children state
  const [children, setChildren] = useState<Child[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingChild, setEditingChild] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState('');
  const [showAddChild, setShowAddChild] = useState(false);
  const [addMode, setAddMode] = useState<'choice' | 'manual' | 'scan'>('choice');
  const [newToken, setNewToken] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // View toggle: 'compose' (default) or 'manage'
  const [view, setView] = useState<'compose' | 'manage'>('compose');

  const loadChildren = async () => {
    const user = auth.currentUser;
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const childrenRef = collection(db, 'accounts', user.uid, 'children');
      const q = query(childrenRef, orderBy('addedAt', 'desc'));
      const snapshot = await getDocs(q);

      const childrenData: Child[] = snapshot.docs.map(d => ({
        tokenId: d.id,
        nickname: d.data().nickname,
        addedAt: d.data().addedAt?.toDate?.() || new Date()
      }));

      setChildren(childrenData);
    } catch (err) {
      console.error('Erreur chargement enfants:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadChildren();
  }, [navigate]);

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
        setError('Ce token est deja associe');
        setIsValidating(false);
        return;
      }

      const user = auth.currentUser;
      if (!user) throw new Error('Non connecte');

      const childRef = doc(db, 'accounts', user.uid, 'children', newToken.trim());
      await setDoc(childRef, {
        nickname: newNickname.trim(),
        addedAt: serverTimestamp()
      });

      await loadChildren();

      setShowAddChild(false);
      setAddMode('choice');
      setNewToken('');
      setNewNickname('');
    } catch (err) {
      console.error('Erreur:', err);
      setError('Erreur inattendue. Reessayez.');
    } finally {
      setIsValidating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full bg-[#FFFBF0] flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-orange-500" />
      </div>
    );
  }

  // ========== NOT AUTHENTICATED: Show auth prompt ==========
  if (!auth.currentUser) {
    return (
      <div className="h-full bg-[#FFFBF0] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-orange-100 rounded-3xl flex items-center justify-center text-orange-500 mb-6 shadow-inner">
          <Users size={40} />
        </div>
        <h2 className="text-2xl font-extrabold text-gray-800 mb-2">Espace Privé</h2>
        <p className="text-gray-500 mb-8 font-medium">Une session est requise pour ajouter et gérer vos enfants.</p>
        <button onClick={() => navigate('/espace?mode=login')} className="w-full h-14 bg-orange-500 text-white rounded-2xl font-bold shadow-premium active:scale-95 transition-transform">
          Se connecter
        </button>
      </div>
    );
  }

  // ========== NO CHILDREN: Show empty state ==========
  if (children.length === 0) {
    return (
      <div className="h-full bg-[#FFFBF0] flex flex-col relative overflow-hidden">
        {/* Decorative */}
        <div className="absolute top-[10%] right-[-10%] w-48 h-48 bg-orange-200/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[20%] left-[-8%] w-56 h-56 bg-rose-200/20 rounded-full blur-3xl pointer-events-none" />

        <div className="flex-1 flex flex-col items-center justify-center px-8 relative z-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center space-y-6"
          >
            <div className="w-24 h-24 bg-orange-100 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-premium">
              <Baby size={48} className="text-orange-400" />
            </div>

            <div>
              <h2 className="text-2xl font-extrabold text-gray-800 tracking-tight">
                Aucun enfant inscrit
              </h2>
              <p className="text-gray-400 mt-3 font-medium text-sm leading-relaxed max-w-xs mx-auto">
                Pour contacter votre medecin, ajoutez un enfant avec le <strong className="text-orange-500">code famille</strong> fourni par le cabinet.
              </p>
            </div>

            <button
              onClick={() => setShowAddChild(true)}
              className="px-8 h-14 bg-orange-500 text-white rounded-2xl font-bold shadow-premium hover:bg-orange-600 transition-all flex items-center gap-3 mx-auto"
            >
              <Plus size={20} />
              Ajouter un enfant
            </button>
          </motion.div>
        </div>

        {/* Add child modal */}
        {renderAddChildModal()}

        {/* QR Scanner */}
        <AnimatePresence>
          {addMode === 'scan' && (
            <QRScanner
              onScan={(scannedToken) => {
                setNewToken(scannedToken);
                setAddMode('manual');
                setShowAddChild(true);
              }}
              onClose={() => setAddMode('choice')}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ========== HAS CHILDREN: Show composer or manage view ==========
  return (
    <div className="h-full bg-[#FFFBF0] flex flex-col overflow-hidden">
      {/* Header with toggle */}
      <div className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-orange-100">
        <div className="max-w-md mx-auto px-6 py-3">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setView('compose')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                view === 'compose'
                  ? 'text-orange-600 bg-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <MessageSquarePlus size={16} />
              Ecrire
            </button>
            <button
              onClick={() => setView('manage')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                view === 'manage'
                  ? 'text-orange-600 bg-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Users size={16} />
              Mes Enfants
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {view === 'compose' ? (
        <div className="flex-1 overflow-y-auto">
          <MessageComposer />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-md mx-auto px-6 pt-6 pb-32">
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
                {children.map((child) => (
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
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ajoute le {child.addedAt.toLocaleDateString()}</p>
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
                          <p className="text-xs text-gray-400">Cette action est reversible en saisissant a nouveau le code famille.</p>
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => handleDeleteChild(child.tokenId)} className="flex-1 h-10 bg-red-500 text-white rounded-xl font-bold text-xs">Supprimer</button>
                            <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 h-10 bg-gray-100 text-gray-400 rounded-xl font-bold text-xs">Annuler</button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}

                {/* Dashed add child button */}
                <button
                  onClick={() => setShowAddChild(true)}
                  className="w-full border-2 border-dashed border-gray-200 rounded-3xl p-5 flex items-center gap-4 hover:border-orange-300 hover:bg-orange-50/30 transition-all cursor-pointer group"
                >
                  <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-300 group-hover:bg-orange-100 group-hover:text-orange-500 transition-colors">
                    <Plus size={24} />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-gray-400 group-hover:text-orange-600 transition-colors">Ajouter un enfant</p>
                    <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Par code ou QR code</p>
                  </div>
                </button>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Add child modal */}
      {renderAddChildModal()}

      {/* QR Scanner */}
      <AnimatePresence>
        {addMode === 'scan' && (
          <QRScanner
            onScan={(scannedToken) => {
              setNewToken(scannedToken);
              setAddMode('manual');
              setShowAddChild(true);
            }}
            onClose={() => setAddMode('choice')}
          />
        )}
      </AnimatePresence>
    </div>
  );

  // ========== Shared modal for adding a child ==========
  function renderAddChildModal() {
    return (
      <AnimatePresence>
        {showAddChild && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center px-4"
            onClick={() => setShowAddChild(false)}
          >
            <motion.div
              initial={{ y: 100, scale: 0.9 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 100, scale: 0.9 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-premium pb-32 sm:pb-8 mb-0 sm:mb-0"
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
                  <button
                    onClick={() => {
                      setShowAddChild(false);
                      setAddMode('scan');
                    }}
                    className="w-full h-24 bg-gray-50 border-2 border-gray-100 rounded-[2rem] flex items-center gap-6 px-6 hover:bg-gray-100 hover:border-gray-200 transition-all group"
                  >
                    <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-500 group-hover:bg-blue-200 transition-colors"><QrCode size={28}/></div>
                    <div className="text-left">
                      <p className="text-gray-800 font-extrabold text-lg">Scanner le QR</p>
                      <p className="text-gray-400 text-xs">Utilisez la camera</p>
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
                        placeholder="Ex: Theo"
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
    );
  }
};

export default SlideContact;
