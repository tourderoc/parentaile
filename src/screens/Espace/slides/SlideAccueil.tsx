import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../../lib/firebase';
import { signOut } from 'firebase/auth';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { LogOut, Loader2, MessageSquarePlus, Inbox, Mic, Settings, ShieldCheck } from 'lucide-react';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import type { AvatarConfig } from '../../../lib/avatarTypes';
import { motion } from 'framer-motion';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { DoctorNotifications } from '../../../components/ui/DoctorNotifications';
import { useSwiperMode } from '../../../lib/swiperContext';
import { initializePushNotifications, clearAppBadge, onForegroundNotification } from '../../../lib/pushNotifications';
import { markAllAsReadForTokens } from '../../../lib/doctorNotifications';

const getSectionCards = (hasChildren: boolean) => [
  {
    label: 'Contact',
    description: hasChildren ? 'Ecrire au medecin' : 'Ajouter un enfant',
    icon: MessageSquarePlus,
    gradient: 'from-orange-500 to-amber-400',
    slideIndex: 1,
  },
  {
    label: 'Messages',
    description: 'Historique des echanges',
    icon: Inbox,
    gradient: 'from-blue-500 to-cyan-400',
    slideIndex: 2,
  },
  {
    label: 'Forum',
    description: 'Forum vocal',
    icon: Mic,
    gradient: 'from-purple-500 to-violet-400',
    slideIndex: 3,
  },
  {
    label: 'Parametres',
    description: 'Gerer votre compte',
    icon: Settings,
    gradient: 'from-gray-600 to-gray-400',
    slideIndex: 4,
  },
];

export const SlideAccueil = () => {
  const navigate = useNavigate();
  const { navigateToSlide } = useSwiperMode();
  const [tokenIds, setTokenIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pseudo, setPseudo] = useState<string>('');
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);

  useEffect(() => {
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
          if (accountSnap.data().avatar) {
            setAvatarConfig(accountSnap.data().avatar);
          }
        }

        const childrenRef = collection(db, 'accounts', user.uid, 'children');
        const q = query(childrenRef, orderBy('addedAt', 'desc'));
        const snapshot = await getDocs(q);
        setTokenIds(snapshot.docs.map(d => d.id));
      } catch (error) {
        console.error('Erreur chargement données:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [navigate]);

  // Push notifications + badge
  useEffect(() => {
    if (tokenIds.length > 0 && !isLoading) {
      initializePushNotifications(tokenIds);

      const unsubscribe = onForegroundNotification((payload) => {
        console.log('[SlideAccueil] Notification premier plan:', payload.title);
      });

      markAllAsReadForTokens(tokenIds).then(() => clearAppBadge());

      return () => unsubscribe();
    } else if (!isLoading && tokenIds.length === 0) {
      clearAppBadge();
    }
  }, [tokenIds, isLoading]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/welcome');
  };

  if (isLoading) {
    return (
      <div className="h-full bg-[#FFFBF0] flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="h-full bg-[#FFFBF0] flex flex-col relative overflow-hidden">
      {/* Decorative floating blobs */}
      <div className="absolute top-[5%] right-[-12%] w-56 h-56 bg-orange-200/40 rounded-full blur-3xl animate-float pointer-events-none" />
      <div className="absolute bottom-[20%] left-[-8%] w-64 h-64 bg-rose-200/30 rounded-full blur-3xl animate-float pointer-events-none" style={{ animationDelay: '1s' }} />

      {/* Logout button top-right */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={handleLogout}
          className="p-2.5 glass rounded-xl text-gray-400 hover:text-red-500 transition-colors shadow-glass"
        >
          <LogOut size={18} />
        </button>
      </div>

      {/* ===== ZONE 1: Logo centré ~20% hauteur ===== */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, type: 'spring' }}
        className="flex items-center justify-center relative z-10"
        style={{ height: '20%' }}
      >
        <div className="relative">
          <div className="absolute inset-[-40%] bg-orange-500/10 rounded-full blur-3xl" />
          <img
            src="/frame-8.png"
            alt="Parent'aile"
            className="w-24 h-24 object-contain relative"
          />
        </div>
      </motion.div>

      {/* ===== ZONE 2: Cartouche profil centrée ===== */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="mx-6 glass rounded-3xl border-2 border-white shadow-glass py-5 px-6 relative z-10"
      >
        <div className="flex flex-col items-center text-center">
          <UserAvatar config={avatarConfig} size={48} className="mb-2" />
          <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Mon Profil</p>
          <p className="text-2xl font-extrabold text-gray-800 tracking-tight mt-0.5">{pseudo || 'Parent'}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <ShieldCheck size={13} className="text-green-500" />
            <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Session sécurisée</p>
          </div>
        </div>
      </motion.div>

      {/* Doctor Notifications */}
      {tokenIds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="px-6 mt-3 relative z-10"
        >
          <DoctorNotifications tokenIds={tokenIds} />
        </motion.div>
      )}

      {/* ===== ZONE 3: Cartes navigation swipables ===== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex-1 flex flex-col justify-center relative z-10 mt-3 min-h-0"
      >
        <Swiper
          nested={true}
          slidesPerView={1.4}
          spaceBetween={14}
          centeredSlides={true}
          slidesOffsetBefore={0}
          slidesOffsetAfter={0}
          className="w-full h-full py-2"
        >
          {getSectionCards(tokenIds.length > 0).map((card, i) => (
            <SwiperSlide key={card.label} className="!flex items-center">
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35 + i * 0.08 }}
                onClick={() => navigateToSlide?.(card.slideIndex)}
                className={`
                  w-full h-[85%] bg-gradient-to-br ${card.gradient}
                  rounded-[2rem] shadow-premium
                  flex flex-col items-center justify-center gap-3
                  transition-all active:scale-[0.96]
                  relative overflow-hidden
                `}
              >
                {/* Background decorative circle */}
                <div className="absolute top-[-20%] right-[-20%] w-40 h-40 bg-white/10 rounded-full" />
                <div className="absolute bottom-[-15%] left-[-15%] w-32 h-32 bg-white/5 rounded-full" />

                <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                  <card.icon size={32} className="text-white" />
                </div>
                <h3 className="text-xl font-extrabold text-white tracking-tight">
                  {card.label}
                </h3>
                <p className="text-white/70 text-xs font-medium">
                  {card.description}
                </p>
              </motion.button>
            </SwiperSlide>
          ))}
        </Swiper>
      </motion.div>

      {/* Swipe hint */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="text-center text-[10px] text-gray-300 font-bold uppercase tracking-widest pb-4 relative z-10"
      >
        Balayez pour naviguer
      </motion.p>
    </div>
  );
};

export default SlideAccueil;
