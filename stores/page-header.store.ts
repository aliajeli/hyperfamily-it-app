import { create } from 'zustand'

export const usePageHeaderStore: any = create((set: any) => ({
  title: '',
  subtitle: '',
  actions: null as any,
  setHeader: ({ title, subtitle, actions }: any) => set({ title, subtitle, actions }),
  clearHeader: () => set({ title: '', subtitle: '', actions: null })
}))
