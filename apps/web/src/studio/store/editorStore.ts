import { create } from 'zustand'
import type { Canvas } from 'fabric'
import type { TextCandidate } from '../lib/textErase'

export type Tool = 'select' | 'text' | 'rectangle' | 'circle' | 'crop' | 'eraser'

interface EditorState {
  canvas: Canvas | null
  activeTool: Tool
  selectedId: string | null
  layersVersion: number
  isCropping: boolean
  isTemplateGalleryOpen: boolean
  isVideoStudioOpen: boolean
  eraserBrushSize: number
  eraserMode: 'brush' | 'box'
  /**
   * Text-review mode: null when not active. When set, contains the
   * OCR-detected candidates (all of them, not just the confident ones)
   * plus which of their IDs the user has toggled on for erasure.
   * `targetImageId` remembers which layer the review is scoped to so
   * we don't erase the wrong image if selection drifts mid-review.
   */
  textReview: {
    targetImageId: string
    candidates: TextCandidate[]
    selectedIds: Set<string>
  } | null
  setCanvas: (c: Canvas | null) => void
  setActiveTool: (t: Tool) => void
  setSelectedId: (id: string | null) => void
  bumpLayers: () => void
  setCropping: (v: boolean) => void
  setTemplateGalleryOpen: (v: boolean) => void
  setVideoStudioOpen: (v: boolean) => void
  setEraserBrushSize: (n: number) => void
  setEraserMode: (m: 'brush' | 'box') => void
  startTextReview: (targetImageId: string, candidates: TextCandidate[]) => void
  toggleTextCandidate: (id: string) => void
  cancelTextReview: () => void
}

export const useEditorStore = create<EditorState>((set) => ({
  canvas: null,
  activeTool: 'select',
  selectedId: null,
  layersVersion: 0,
  isCropping: false,
  isTemplateGalleryOpen: false,
  isVideoStudioOpen: false,
  eraserBrushSize: 30,
  eraserMode: 'brush',
  textReview: null,
  setCanvas: (canvas) => set({ canvas }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setSelectedId: (selectedId) => set({ selectedId }),
  bumpLayers: () => set((s) => ({ layersVersion: s.layersVersion + 1 })),
  setCropping: (isCropping) => set({ isCropping }),
  setTemplateGalleryOpen: (isTemplateGalleryOpen) => set({ isTemplateGalleryOpen }),
  setVideoStudioOpen: (isVideoStudioOpen) => set({ isVideoStudioOpen }),
  setEraserBrushSize: (eraserBrushSize) => set({ eraserBrushSize }),
  setEraserMode: (eraserMode) => set({ eraserMode }),
  startTextReview: (targetImageId, candidates) =>
    set({
      textReview: {
        targetImageId,
        candidates,
        // Pre-select high-confidence hits so "detect → apply" without
        // clicking anything still nukes the obvious labels.
        selectedIds: new Set(candidates.filter((c) => c.likelyReal).map((c) => c.id)),
      },
    }),
  toggleTextCandidate: (id) =>
    set((s) => {
      if (!s.textReview) return {}
      const next = new Set(s.textReview.selectedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { textReview: { ...s.textReview, selectedIds: next } }
    }),
  cancelTextReview: () => set({ textReview: null }),
}))
