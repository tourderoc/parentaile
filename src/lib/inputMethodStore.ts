import { create } from 'zustand';

interface InputMethodStore {
  method: 'text' | 'voice';
  setMethod: (method: 'text' | 'voice') => void;
}

export const useInputMethodStore = create<InputMethodStore>((set) => ({
  method: 'text',
  setMethod: (method) => set({ method }),
}));