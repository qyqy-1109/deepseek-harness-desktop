// Preload stub for the DSH desktop shell. The window content is the DSH Web
// GUI itself (context-isolated); nothing from the shell needs to leak into it.
// Kept as an explicit file so `sandbox: true` + `contextIsolation: true` are
// the only knobs in play.
