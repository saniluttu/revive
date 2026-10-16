// Avatar step events, for anything that wants to stay in sync with the
// demonstration (e.g. speaking each instruction step as the avatar reaches it)
// without being wired to the avatar component:
//
//   const off = onAvatarStep(({ exerciseId, phase, step, rep, source }) => { … })
//   off() // unsubscribe
//
// `step` is the index into exercises.<id>.steps (−1 = the setup line).

const listeners = new Set()

export function onAvatarStep(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitAvatarStep(event) {
  for (const l of listeners) l(event)
}
