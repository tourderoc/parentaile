import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../../lib/firebase';
import { signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { LogOut, Loader2, MessageSquarePlus, LayoutGrid, Users, Settings, ShieldCheck } from 'lucide-react';
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
    label: 'Groupes',
    description: 'Groupes de parole',
    icon: Users,
    bgImage: '/assets/backgrounds/slide_bg_forum.png',
    slideIndex: 1,
  },
  {
    label: 'Mon Espace',
    description: 'Votre espace personnel',
    icon: LayoutGrid,
    bgImage: '/assets/backgrounds/slide_bg_messages.png',
    slideIndex: 2,
  },
  {
    label: 'Contact',
    description: hasChildren ? 'Ecrire au medecin' : 'Ajouter un enfant',
    icon: MessageSquarePlus,
    bgImage: '/assets/backgrounds/slide_bg_contact.png',
    slideIndex: 3,
    requiresAuth: true,
  },
  {
    label: 'Parametres',
    description: 'Gerer votre compte',
    icon: Settings,
    bgImage: '/assets/backgrounds/slide_bg_settings.png',
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
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(auth.currentUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setIsLoading(false);
        setTokenIds([]);
        setPseudo('');
        setAvatarConfig(null);
      } else {
        loadData(user);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadData = async (user: FirebaseUser) => {
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

      {/* Logout / Login button top-right */}
      <div className="absolute top-4 right-4 z-20">
        {currentUser ? (
          <button
            onClick={handleLogout}
            className="p-2.5 glass rounded-xl text-gray-400 hover:text-red-500 transition-colors shadow-glass"
          >
            <LogOut size={18} />
          </button>
        ) : null}
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
        className="mx-6 relative z-10"
      >
        <div className="rounded-[2.5rem] border border-white/60 shadow-premium py-6 px-6 relative overflow-hidden group">
          {/* Background Image */}
          <div 
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
            style={{ backgroundImage: 'url(/assets/backgrounds/profile_bg.png)' }}
          />
          {/* Glass overlay for text readability */}
          <div className="absolute inset-0 bg-white/50 backdrop-blur-xl pointer-events-none" />

          {/* Subtle inside glow */}
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />
          
          <div className="flex flex-col items-center text-center relative z-10 w-full">
            {currentUser ? (
              <>
                <div className="relative mb-3">
                  <div className="absolute inset-0 bg-orange-400/20 blur-xl rounded-full scale-110" />
                  <div className="relative rounded-full ring-4 ring-white shadow-sm overflow-hidden">
                    <UserAvatar config={avatarConfig} size={56} className="bg-white" />
                  </div>
                </div>
                
                <p className="text-[11px] font-extrabold text-orange-500 uppercase tracking-[0.2em] drop-shadow-sm">Mon Profil</p>
                <p className="text-3xl font-extrabold text-gray-800 tracking-tight mt-1 drop-shadow-sm">{pseudo || 'Parent'}</p>
                
                <div className="flex items-center gap-1.5 mt-2 bg-white/50 px-3 py-1 rounded-full border border-white/60 shadow-sm backdrop-blur-sm">
                  <ShieldCheck size={14} className="text-green-600" />
                  <p className="text-[10px] font-extrabold text-green-700 uppercase tracking-widest">Session sécurisée</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-gradient-to-br from-orange-100 to-rose-100 rounded-[1.2rem] flex items-center justify-center shadow-inner border border-white mb-3 overflow-hidden">
                  <UserAvatar size={50} className="opacity-40" />
                </div>
                <h2 className="text-2xl font-extrabold text-gray-800 drop-shadow-sm">Bienvenue !</h2>
                <p className="text-xs font-semibold text-gray-500 mb-5 relative z-20">Rejoignez la communauté Parent'aile</p>
                
                <div className="flex gap-2 w-full relative z-30">
                  <button 
                    onClick={() => navigate('/espace?mode=login')}
                    className="flex-1 py-3 px-2 glass bg-white/50 rounded-xl text-[11px] uppercase tracking-wider font-extrabold text-gray-600 shadow-sm hover:bg-white/70 hover:text-orange-600 transition-all border border-white/60"
                  >
                    Connexion
                  </button>
                  <button 
                    onClick={() => navigate('/espace?mode=register')}
                    className="flex-1 py-3 px-2 bg-gradient-to-r from-orange-400 to-orange-500 rounded-xl text-[11px] uppercase tracking-wider font-extrabold text-white shadow-md hover:shadow-lg transition-all border border-orange-400/50"
                  >
                    S'inscrire
                  </button>
                </div>
              </>
            )}
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
        onTouchStart={(e: React.TouchEvent) => e.stopPropagation()}
        onTouchMove={(e: React.TouchEvent) => e.stopPropagation()}
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
                onClick={() => {
                  if (card.requiresAuth && !currentUser) {
                    navigate('/espace?mode=login');
                  } else {
                    navigateToSlide?.(card.slideIndex);
                  }
                }}
                className="w-full h-[85%] rounded-[2rem] shadow-premium flex flex-col items-center justify-center gap-3 transition-all active:scale-[0.96] relative overflow-hidden group"
              >
                {/* Background Image */}
                <div 
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                  style={{ backgroundImage: `url(${card.bgImage})` }}
                />
                
                {/* Overlay gradient for readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

                {/* Badge "Accès Réservé" for Contact */}
                {card.requiresAuth && (
                  <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center gap-1.5 border border-white/20">
                    <ShieldCheck size={12} className="text-white" />
                    <span className="text-white text-[9px] font-bold uppercase tracking-wider">Accès Réservé</span>
                  </div>
                )}

                <div className="relative z-10 w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/30 shadow-glass">
                  <card.icon size={32} className="text-white drop-shadow-md" />
                </div>
                
                <h3 className="relative z-10 text-xl font-extrabold text-white tracking-tight drop-shadow-md mt-1">
                  {card.label}
                </h3>
                
                <p className="relative z-10 text-white/90 text-xs font-medium drop-shadow-sm">
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
