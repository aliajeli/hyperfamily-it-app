import { create } from 'zustand'

export const useVpnStore: any = create((set) => ({
  state: 'disconnected',
  mode: null,
  message: '',
  setStatus: (status) => set(status)
}))
