import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ShippingInfo {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  email?: string;
  phone?: string;
  saveForNextOrder: boolean;
}

interface ShippingStore {
  shippingInfo: ShippingInfo | null;
  setShippingInfo: (info: ShippingInfo) => void;
  clearShippingInfo: () => void;
}

export const useShippingStore = create<ShippingStore>()(
  persist(
    (set) => ({
      shippingInfo: null,
      setShippingInfo: (info) => set({ shippingInfo: info }),
      clearShippingInfo: () => set({ shippingInfo: null }),
    }),
    {
      name: 'shipping-storage',
      // Only persist if saveForNextOrder is true
      partialize: (state) => 
        state.shippingInfo?.saveForNextOrder ? state : { shippingInfo: null },
    }
  )
);

// Calculate shipping cost based on cart total
export const calculateShippingCost = (cartTotal: number): number => {
  // Free shipping for orders over 30€
  return cartTotal >= 30 ? 0 : 3;
};
