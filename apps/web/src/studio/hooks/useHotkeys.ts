import { useEffect } from 'react'
import { useEditorStore } from '../store/editorStore'
import { deleteObject } from '../lib/canvasActions'
import type { HistoryManager } from '../lib/history'

export function useHotkeys() {
  const canvas = useEditorStore((s) => s.canvas)
  const isCropping = useEditorStore((s) => s.isCropping)

  useEffect(() => {
    if (!canvas) return
    const handler = (e: KeyboardEvent) => {
      const active = canvas.getActiveObject() as unknown as { isEditing?: boolean } | undefined
      if (active?.isEditing) return
      const isMeta = e.metaKey || e.ctrlKey
      const history = (canvas as unknown as { history?: HistoryManager }).history

      if ((e.key === 'Delete' || e.key === 'Backspace') && canvas.getActiveObject() && !isCropping) {
        e.preventDefault()
        deleteObject(canvas, canvas.getActiveObject()!)
      } else if (isMeta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        history?.undo()
      } else if (isMeta && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        history?.redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canvas, isCropping])
}
