import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface ExampleDraft {

  selectedLevel1Id: string;
  selectedLevel2Id: string;
  selectedCategoryId: string;
  videoPremium: boolean;
  planType: string;
  exampleName: string;
  dynamicOptions: { id: string; text: string; isCorrect: boolean }[];
}

interface DashboardState {
  // Example tab state
  exampleCategoryId: string;
  setExampleCategoryId: (id: string) => void;

  // Category tab state (React Flow)
  categoryViewport: Viewport | null;
  setCategoryViewport: (viewport: Viewport) => void;

  // General UI state
  activeTab: string;
  setActiveTab: (tab: string) => void;

  exampleDraft: ExampleDraft;
  setExampleDraft: (draft: Partial<ExampleDraft>) => void;
  clearExampleDraft: () => void;
}

const emptyExampleDraft: ExampleDraft = {

  selectedLevel1Id: '',
  selectedLevel2Id: '',
  selectedCategoryId: '',
  videoPremium: true,
  planType: 'basicbook',
  exampleName: '',
  dynamicOptions: [{ id:Math.random().toString(), text: 'أ/', isCorrect: false },{ id:Math.random().toString(), text: 'ب/', isCorrect: false }],
};

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({

      exampleCategoryId: "",
      setExampleCategoryId: (id: string) => set({ exampleCategoryId: id }),

      categoryViewport: null,
      setCategoryViewport: (viewport: Viewport) => set({ categoryViewport: viewport }),

      activeTab: "/",
      setActiveTab: (tab: string) => set({ activeTab: tab }),

      exampleDraft: emptyExampleDraft,
      setExampleDraft: (draft) => set((state) => ({
        exampleDraft: { ...state.exampleDraft, ...draft },
      })),
      clearExampleDraft: () => set({ exampleDraft: emptyExampleDraft}),
    }),
    {
      name: 'dashboard-storage',
    }
  )
);
