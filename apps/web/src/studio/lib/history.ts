import type { Canvas } from 'fabric'

const MAX_HISTORY = 50
const SERIALIZE_PROPS = ['id', 'name']

export class HistoryManager {
  private undoStack: string[] = []
  private redoStack: string[] = []
  private canvas: Canvas
  private suspended = false
  private onRestore?: () => void

  constructor(canvas: Canvas, onRestore?: () => void) {
    this.canvas = canvas
    this.onRestore = onRestore
  }

  snapshot() {
    if (this.suspended) return
    const json = JSON.stringify(this.canvas.toObject(SERIALIZE_PROPS))
    this.undoStack.push(json)
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift()
    this.redoStack = []
  }

  canUndo() {
    return this.undoStack.length > 1
  }

  canRedo() {
    return this.redoStack.length > 0
  }

  undo() {
    if (!this.canUndo()) return
    const current = this.undoStack.pop()!
    this.redoStack.push(current)
    const prev = this.undoStack[this.undoStack.length - 1]
    this.restore(prev)
  }

  redo() {
    if (!this.canRedo()) return
    const next = this.redoStack.pop()!
    this.undoStack.push(next)
    this.restore(next)
  }

  private restore(json: string) {
    this.suspended = true
    this.canvas.loadFromJSON(JSON.parse(json)).then(() => {
      this.canvas.renderAll()
      this.suspended = false
      this.onRestore?.()
    })
  }
}
