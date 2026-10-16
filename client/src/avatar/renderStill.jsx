// Dev-only entry for render-exercise-images.html: one exercise, one still pose
// (start = s 0, peak = s 1), rendered with the same AvatarCanvas as the app.
// Sets window.__stillReady once the frame is drawn.

import { createRoot } from 'react-dom/client'
import AvatarCanvas from './AvatarCanvas.jsx'
import { motionFor } from './motions.js'

const params = new URLSearchParams(location.search)
const motion = motionFor(params.get('exercise'))
const s = params.get('pose') === 'peak' ? 1 : 0
const player = { motion, tick: () => ({ pose: motion.pose(s) }) }

createRoot(document.getElementById('root')).render(
  <AvatarCanvas player={player} playing={false} view={motion.view} mirrored={false} visible label="" />,
)
setTimeout(() => (window.__stillReady = true), 1500)
