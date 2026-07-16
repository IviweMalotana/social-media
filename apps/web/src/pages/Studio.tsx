import { StudioModule } from '../studio/StudioModule'

/**
 * Studio page — hosts the full canvas editor as an in-app route. The module
 * mounts full-bleed via `position: fixed` on its shell so it can escape the
 * scheduler's `.main` padding + max-width; when this page unmounts the shell
 * goes with it and the scheduler chrome returns to normal.
 */
export default function Studio() {
  return (
    <div className="studio-shell">
      <StudioModule />
    </div>
  )
}
