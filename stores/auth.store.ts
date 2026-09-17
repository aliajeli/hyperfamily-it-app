import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const useAuthStore: any = create(
  persist(
    (set) => ({
      user: null,
      hydrated: false,
      login: (user) => set({ user }),
      updateUser: (user) => set({ user }),
      logout: () => set({ user: null }),
      setHydrated: () => set({ hydrated: true })
    }),
    {
      name: 'hyperfamily-session',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state: any) => ({ user: state.user }),
      onRehydrateStorage: () => (state: any) => state?.setHydrated()
    }
  )
)
