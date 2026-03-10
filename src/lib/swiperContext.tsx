import { createContext, useContext } from 'react';

interface SwiperModeContextType {
  isSwiperMode: boolean;
  navigateToSlide?: (index: number) => void;
}

export const SwiperModeContext = createContext<SwiperModeContextType>({
  isSwiperMode: false,
});

export const useSwiperMode = () => useContext(SwiperModeContext);
