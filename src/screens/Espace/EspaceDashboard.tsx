import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore';
import {
  LogOut,
  Loader2,
  Plus,
  MessageSquare,
  User,
  Baby,
  ChevronRight,
  ShieldCheck,
  BellRing,
  CheckCircle2,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { BottomNav } from '../../components/ui/BottomNav';
import { motion } from 'framer-motion';
import { DoctorNotifications } from '../../components/ui/DoctorNotifications';
import { initializePushNotifications, clearAppBadge, onForegroundNotification } from '../../lib/pushNotifications';
import { markAllAsReadForTokens } from '../../lib/doctorNotifications';

interface Child {
  tokenId: string;
  nickname: string;
  addedAt: Date;
}

export const EspaceDashboard = () => {
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pseudo, setPseudo] = useState<string>('');
  const [pushStatus, setPushStatus] = useState<'granted' | 'denied' | 'default' | 'loading'>('loading');
  const [isTestingPush, setIsTestingPush] = useState(false);

  useEffect(() => {
    // Effacer le badge immédiatement à l'entrée sur le dashboard
    clearAppBadge();
    
    const loadData = async () => {
      const user = auth.currentUser;
      if (!user) {
        navigate('/espace');
        return;
      }

      try {
        const accountRef = doc(db, 'accounts', user.uid);
        const accountSnap = await getDoc(accountRef);
        if (accountSnap.exists()) {
          setPseudo(accountSnap.data().pseudo || '');
        }

        const childrenRef = collection(db, 'accounts', user.uid, 'children');
        const q = query(childrenRef, orderBy('addedAt', 'desc'));
        const snapshot = await getDocs(q);

        const childrenData: Child[] = snapshot.docs.map(docSnap => ({
          tokenId: docSnap.id,
          nickname: docSnap.data().nickname,
          addedAt: docSnap.data().addedAt?.toDate?.() || new Date()
        }));

        setChildren(childrenData);
      } catch (error) {
        console.error('Erreur chargement données:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();

    // Vérifier la permission au chargement
    if ('Notification' in window) {
      setPushStatus(Notification.permission);
    }
  }, [navigate]);

  // Initialiser les notifications push et le badge de l'app
  useEffect(() => {
    if (children.length > 0 && !isLoading) {
      const tokenIds = children.map(c => c.tokenId);
      initializePushNotifications(tokenIds).then(success => {
        if (success) {
          console.log('[EspaceDashboard] Push notifications initialisées');
          setPushStatus('granted');
        }
      });

      // Écouter les notifications en premier plan (app ouverte)
      // Cela déclenche l'affichage de la notification système + son + badge
      const unsubscribe = onForegroundNotification((payload) => {
        console.log('[EspaceDashboard] Notification premier plan reçue:', payload.title);
      });

      // Mettre à jour le badge et marquer tout comme lu pour être sûr qu'il disparaisse
      markAllAsReadForTokens(tokenIds).then(() => {
        clearAppBadge();
      });

      return () => unsubscribe();
    } else if (!isLoading && children.length === 0) {
      clearAppBadge();
    }
  }, [children, isLoading]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/welcome');
  };

  const handleWriteMessage = () => {
    if (children.length === 0) {
      navigate('/espace/parametres');
    } else if (children.length === 1) {
      navigate(`/espace/nouveau-message?childId=${children[0].tokenId}`);
    } else {
      navigate('/espace/nouveau-message');
    }
  };

  const handleTestPush = async () => {
    if (children.length === 0) return;
    setIsTestingPush(true);
    try {
      const tokenId = children[0].tokenId;
      const response = await fetch('https://testnotification-ufpaxnd4pa-ew.a.run.app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId,
          title: '🛠️ Test Parent\'aile',
          body: 'Si vous voyez ceci, votre configuration est correcte !'
        })
      });
      if (response.ok) {
        alert('Test envoyé ! Vérifiez vos notifications.');
      } else {
        alert('Échec de l\'envoi du test. Vérifiez la console.');
      }
    } catch (err) {
      console.error(err);
      alert('Erreur lors du test.');
    } finally {
      setIsTestingPush(false);
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
        <div className="max-w-md mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-orange-200">
              <span className="text-white font-bold text-lg">P</span>
            </div>
            <h1 className="text-xl font-extrabold text-gray-800 tracking-tight">Parent'aile</h1>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <main className="max-w-md mx-auto px-6 pt-8 space-y-8">
        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass p-6 rounded-[2rem] shadow-premium relative overflow-hidden"
        >
          <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-orange-200/20 rounded-full blur-2xl" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-500 shadow-sm border border-orange-100">
              <User size={32} />
            </div>
            <div>
              <p className="text-sm font-bold text-orange-400 uppercase tracking-widest">Mon Profil</p>
              <h2 className="text-2xl font-extrabold text-gray-800">{pseudo || 'Parent'}</h2>
              <div className="flex items-center gap-1 mt-1 text-green-600">
                <ShieldCheck size={14} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Session Sécurisée</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Diagnostic Push (Debug) */}
        {children.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/50 border border-orange-100 rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BellRing size={16} className="text-orange-500" />
                <span className="text-sm font-bold text-gray-700">Notifications</span>
              </div>
              <div className="flex items-center gap-1">
                {pushStatus === 'granted' ? (
                  <div className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    <CheckCircle2 size={12} />
                    <span className="text-[10px] font-bold uppercase">Activé</span>
                  </div>
                ) : pushStatus === 'denied' ? (
                  <div className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                    <XCircle size={12} />
                    <span className="text-[10px] font-bold uppercase">Bloqué</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                    <AlertTriangle size={12} />
                    <span className="text-[10px] font-bold uppercase">À configurer</span>
                  </div>
                )}
              </div>
            </div>
            
            {pushStatus !== 'granted' && (
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Appuyez sur "Écrire au médecin" ou rafraîchissez pour autoriser les notifications.
              </p>
            )}

            <button
              onClick={handleTestPush}
              disabled={isTestingPush || children.length === 0}
              className="w-full py-2 bg-white border border-orange-200 rounded-xl text-[11px] font-bold text-orange-500 hover:bg-orange-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isTestingPush ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                'Tester la réception sur ce téléphone'
              )}
            </button>
          </motion.div>
        )}

        {/* Doctor Notifications */}
        {children.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <DoctorNotifications tokenIds={children.map(c => c.tokenId)} />
          </motion.div>
        )}

        {/* Messaging Quick Action */}
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.1 }}
        >
          <button
            onClick={handleWriteMessage}
            className="w-full h-20 bg-orange-500 hover:bg-orange-600 rounded-3xl shadow-premium px-6 flex items-center justify-between transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-2 rounded-xl">
                <MessageSquare className="text-white" size={24} />
              </div>
              <div className="text-left">
                <span className="block text-white font-extrabold text-lg">Écrire au médecin</span>
                <span className="text-white/70 text-xs font-medium">Contacter votre cabinet</span>
              </div>
            </div>
            <ChevronRight className="text-white group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>

        {/* Children Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between px-2">
            <h3 className="text-lg font-bold text-gray-800">Mes Enfants</h3>
            <button
              onClick={() => navigate('/espace/parametres?tab=enfants')}
              className="text-orange-500 text-xs font-bold uppercase tracking-widest hover:underline"
            >
              Gérer
            </button>
          </div>

          <div className="space-y-3">
            {children.length > 0 ? (
              children.map((child) => (
                <div
                  key={child.tokenId}
                  onClick={() => navigate(`/espace/messages?childId=${child.tokenId}`)}
                  className="bg-white rounded-2xl p-4 border border-gray-100 flex items-center justify-between shadow-sm hover:border-orange-200 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 group-hover:bg-blue-100 transition-colors">
                      <Baby size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-gray-800">{child.nickname}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Identifié</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />
                </div>
              ))
            ) : (
              <div
                onClick={() => navigate('/espace/parametres')}
                className="border-2 border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 hover:border-orange-300 transition-colors cursor-pointer"
              >
                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-400">
                  <Plus size={24} />
                </div>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Ajouter un enfant</p>
              </div>
            )}
          </div>
        </motion.div>


      </main>

      <BottomNav />
    </div>
  );
};

export default EspaceDashboard;

