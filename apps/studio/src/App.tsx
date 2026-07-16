import { CanvasStage } from './components/CanvasStage'
import { Toolbar } from './components/Toolbar'
import { LayerPanel } from './components/LayerPanel'
import { PropertiesPanel } from './components/PropertiesPanel'
import { TemplateGallery } from './components/TemplateGallery'
import { VideoStudio } from './components/VideoStudio'
import { useHotkeys } from './hooks/useHotkeys'
import './App.css'

function App() {
  useHotkeys()

  return (
    <div className="app-shell">
      <Toolbar />
      <div className="app-body">
        <CanvasStage />
        <aside className="side-panel">
          <LayerPanel />
          <PropertiesPanel />
        </aside>
      </div>
      <TemplateGallery />
      <VideoStudio />
    </div>
  )
}

export default App
