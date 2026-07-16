import { CanvasStage } from './components/CanvasStage'
import { Toolbar } from './components/Toolbar'
import { LayerPanel } from './components/LayerPanel'
import { PropertiesPanel } from './components/PropertiesPanel'
import { QuickActionsPanel } from './components/QuickActionsPanel'
import { TemplateGallery } from './components/TemplateGallery'
import { VideoStudio } from './components/VideoStudio'
import { useHotkeys } from './hooks/useHotkeys'
import './studio.css'

/**
 * Full studio UI, mounted as a nested route inside apps/web. All studio-scoped
 * CSS is namespaced under `.studio-module` so it can't bleed into the scheduler
 * chrome (buttons, sidebar, etc share class names).
 */
export function StudioModule() {
  useHotkeys()

  return (
    <div className="studio-module">
      <div className="app-shell">
        <Toolbar />
        <div className="app-body">
          <CanvasStage />
          <aside className="side-panel">
            <QuickActionsPanel />
            <LayerPanel />
            <PropertiesPanel />
          </aside>
        </div>
        <TemplateGallery />
        <VideoStudio />
      </div>
    </div>
  )
}
