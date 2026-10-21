import { contextBridge, ipcRenderer } from 'electron'

// The launcher window's only way to talk to the app (window.launcher in ui/launcher.html)
contextBridge.exposeInMainWorld('launcher', {
	state: () => ipcRenderer.invoke('state'),
	set: (patch: Record<string, unknown>) => ipcRenderer.invoke('set', patch),
	restart: () => ipcRenderer.invoke('restart'),
	open: (mode: 'village' | 'demo' | 'clean') => ipcRenderer.invoke('open', mode),
	openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
	copy: (text: string) => ipcRenderer.invoke('copy', text),
	hide: () => ipcRenderer.invoke('hide'),
	quit: () => ipcRenderer.invoke('quit'),
	onState: (cb: (state: unknown) => void) => {
		ipcRenderer.on('state', (_e, s) => cb(s))
	},
})
