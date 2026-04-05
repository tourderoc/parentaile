import { useRef, useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { onUnreadParentNotifCount } from '../../lib/parentNotificationService';
import { Swiper, SwiperSlide } from 'swiper/react';
import type { SwiperClass } from 'swiper/react';
import 'swiper/css';
import { SlideAccueil } from './slides/SlideAccueil';
import { SlideContact } from './slides/SlideContact';
import { SlideMonEspace } from './slides/SlideMonEspace';
import { SlideForum } from './slides/SlideForum';
import { SlideParametres } from './slides/SlideParametres';
import { BottomNavSwiper } from '../../components/ui/BottomNavSwiper';
import { SwiperModeContext } from '../../lib/swiperContext';
import { UpcomingGroupProvider } from '../../lib/upcomingGroupContext';
import { UpcomingGroupCard } from '../../components/ui/UpcomingGroupCard';
import { UserProvider } from '../../lib/userContext';

const sectionToSlide: Record<string, number> = {
  'dashboard': 0,
  'app': 0,
  'forum': 1,       // compat
  'groupes': 1,
  'mon-espace': 2,
  'messages': 2,  // compat
  'nouveau-message': 3,
  'parametres': 4,
};

const slideToSection: Record<number, string> = {
  0: 'dashboard',
  1: 'groupes',
  2: 'mon-espace',
  3: 'nouveau-message', // Contact slide
  4: 'parametres',
};

export const EspaceMain = () => {
  const { section } = useParams<{ section: string }>();
  const navigate = useNavigate();
  const swiperRef = useRef<SwiperClass | null>(null);
  const [activeSlide, setActiveSlide] = useState(() =>
    sectionToSlide[section || 'dashboard'] ?? 0
  );
  const [unreadParentCount, setUnreadParentCount] = useState(0);

  // Single listener for parent notifications — shared by BottomNavSwiper and SlideMonEspace
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    return onUnreadParentNotifCount(user.uid, setUnreadParentCount);
  }, []);

  // Ref to track section for use in callbacks without stale closures
  const sectionRef = useRef(section);
  sectionRef.current = section;

  // Ref to skip URL→Swiper sync when Swiper already triggered the URL change
  const skipUrlSync = useRef(false);

  // Ecouter les deep links envoyes par le service worker (clic notification)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data?.url) {
        navigate(event.data.url);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [navigate]);

  // URL → Swiper sync (when navigate() is called from inside a component)
  useEffect(() => {
    if (skipUrlSync.current) {
      skipUrlSync.current = false;
      return;
    }
    const target = sectionToSlide[section || 'dashboard'] ?? 0;
    if (swiperRef.current && swiperRef.current.activeIndex !== target) {
      swiperRef.current.slideTo(target);
    }
  }, [section]);

  // Swiper → URL sync (when user swipes or clicks BottomNav)
  const handleSlideChange = useCallback((swiper: SwiperClass) => {
    const idx = swiper.activeIndex;
    setActiveSlide(idx);
    const newSection = slideToSection[idx];
    if (newSection && sectionRef.current !== newSection) {
      skipUrlSync.current = true;
      navigate(`/espace/${newSection}`, { replace: true });
    }
  }, [navigate]);

  const handleNavigate = useCallback((index: number) => {
    swiperRef.current?.slideTo(index);
  }, []);

  return (
    <UserProvider>
    <UpcomingGroupProvider>
    <SwiperModeContext.Provider value={{ isSwiperMode: true, navigateToSlide: handleNavigate }}>
      <div className="h-screen flex flex-col bg-[#FFFBF0]">
        <UpcomingGroupCard />
        <Swiper
          onSwiper={(swiper) => { swiperRef.current = swiper; }}
          onSlideChange={handleSlideChange}
          initialSlide={sectionToSlide[section || 'dashboard'] ?? 0}
          slidesPerView={1}
          spaceBetween={0}
          className="flex-1 w-full"
        >
          <SwiperSlide>
            <div className="h-full overflow-y-auto">
              <SlideAccueil />
            </div>
          </SwiperSlide>
          <SwiperSlide>
            <div className="h-full overflow-y-auto">
              <SlideForum />
            </div>
          </SwiperSlide>
          <SwiperSlide>
            <div className="h-full overflow-y-auto">
              <SlideMonEspace unreadParentCount={unreadParentCount} />
            </div>
          </SwiperSlide>
          <SwiperSlide>
            <div className="h-full overflow-y-auto">
              <SlideContact />
            </div>
          </SwiperSlide>
          <SwiperSlide>
            <div className="h-full overflow-y-auto">
              <SlideParametres />
            </div>
          </SwiperSlide>
        </Swiper>
        {activeSlide > 0 && (
          <BottomNavSwiper
            activeIndex={activeSlide}
            onNavigate={handleNavigate}
            unreadParentCount={unreadParentCount}
          />
        )}
      </div>
    </SwiperModeContext.Provider>
    </UpcomingGroupProvider>
    </UserProvider>
  );
};

export default EspaceMain;
