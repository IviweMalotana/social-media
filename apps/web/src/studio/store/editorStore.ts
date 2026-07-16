import { create } from 'zustand'
import type { Canvas } from 'fabric'

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
  setCanvas: (c: Canvas | null) => void
  setActiveTool: (t: Tool) => void
  setSelectedId: (id: string | null) => void
  bumpLayers: () => void
  setCropping: (v: boolean) => void
  setTemplateGalleryOpen: (v: boolean) => void
  setVideoStudioOpen: (v: boolean) => void
  setEraserBrushSize: (n: number) => void
  setEraserMode: (m: 'brush' | 'box') => void
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
  setCanvas: (canvas) => set({ canvas }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setSelectedId: (selectedId) => set({ selectedId }),
  bumpLayers: () => set((s) => ({ layersVersion: s.layersVersion + 1 })),
  setCropping: (isCropping) => set({ isCropping }),
  setTemplateGalleryOpen: (isTemplateGalleryOpen) => set({ isTemplateGalleryOpen }),
  setVideoStudioOpen: (isVideoStudioOpen) => set({ isVideoStudioOpen }),
  setEraserBrushSize: (eraserBrushSize) => set({ eraserBrushSize }),
  setEraserMode: (eraserMode) => set({ eraserMode }),
}))
