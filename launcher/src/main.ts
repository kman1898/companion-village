import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, Tray } from 'electron'
import path from 'node:path'
import { availableBrowsers, openUrl } from './browsers'
import { setRunAtLogin, startedAtLogin } from './login'
import { VillageServer } from './server'
import { listInterfaces, loadSettings, sanitize, saveSettings, villageUrls, type LauncherSettings } from './settings'

/** What the village is opened as from the launcher buttons and the tray */
type OpenMode = 'village' | 'demo' | 'clean'
const MODE_QUERY: Record<OpenMode, string> = { village: '', demo: 'demo=10', clean: 'hud=0' }

const ASSETS = path.join(__dirname, '..', 'assets')
const server = new VillageServer()
let settings: LauncherSettings
let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

if (!app.requestSingleInstanceLock()) {
	app.quit()
} else {
	app.on('second-instance', () => showWindow())
	app.whenReady().then(boot)
}

/** The address this computer opens the village at. Saves are kept per address, so it stays the same between runs. */
function localUrl(mode: OpenMode = 'village'): string {
	const host = settings.bind === '0.0.0.0' || settings.bind === '127.0.0.1' ? 'localhost' : settings.bind
	const query = [settings.query, MODE_QUERY[mode]].filter(Boolean).join('&')
	return `http://${host}:${settings.port}/${query ? `?${query}` : ''}`
}

function state() {
	return {
		version: app.getVersion(),
		platform: process.platform,
		settings,
		server: { state: server.state, error: server.error, hasVillage: server.hasVillage },
		urls: villageUrls(settings),
		localUrl: localUrl(),
		interfaces: listInterfaces(),
		browsers: availableBrowsers(),
	}
}

function pushState() {
	win?.webContents.send('state', state())
	updateTray()
}

async function startServer(): Promise<void> {
	try {
		await server.start(settings.port, settings.bind)
	} catch {
		// the error is shown in the launcher window
	}
	pushState()
}

function open(mode: OpenMode) {
	if (server.state !== 'running') {
		showWindow()
		return
	}
	openUrl(localUrl(mode), settings.browser)
}

async function boot() {
	settings = loadSettings()
	const atLogin = startedAtLogin()
	await startServer()
	createTray()
	if (!settings.startMinimized && !atLogin) showWindow()
	else if (process.platform === 'darwin') app.dock?.hide()
	if (settings.openOnLaunch && server.state === 'running') open('village')
}

function showWindow() {
	if (process.platform === 'darwin') void app.dock?.show()
	if (win) {
		if (win.isMinimized()) win.restore()
		win.show()
		win.focus()
		return
	}
	win = new BrowserWindow({
		width: 460,
		height: 830,
		minWidth: 420,
		minHeight: 560,
		title: 'Companion Village',
		backgroundColor: '#1e160e',
		show: false,
		icon: path.join(ASSETS, 'icon.png'),
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
		},
	})
	win.once('ready-to-show', () => win?.show())
	win.on('close', (e) => {
		// closing the window keeps the village running, like Companion; quit from the tray or the Quit button
		if (quitting) return
		e.preventDefault()
		hideWindow()
	})
	win.on('closed', () => (win = null))
	// links in the launcher open in the browser, never inside the launcher window
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith('http')) openUrl(url, settings.browser)
		return { action: 'deny' }
	})
	win.webContents.on('will-navigate', (e) => e.preventDefault())
	void win.loadFile(path.join(__dirname, '..', 'ui', 'launcher.html'))
}

function hideWindow() {
	win?.hide()
	if (process.platform === 'darwin') app.dock?.hide()
}

function quit() {
	quitting = true
	app.quit()
}

function createTray() {
	const file = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'
	const img = nativeImage.createFromPath(path.join(ASSETS, file))
	if (process.platform === 'darwin') img.setTemplateImage(true)
	tray = new Tray(img)
	tray.setToolTip('Companion Village')
	// Windows / Linux: a click on the tray icon shows the launcher, like Companion
	if (process.platform !== 'darwin') tray.on('click', () => showWindow())
	updateTray()
}

function updateTray() {
	if (!tray) return
	const running = server.state === 'running'
	tray.setContextMenu(
		Menu.buildFromTemplate([
			{ label: running ? `Running on port ${settings.port}` : 'Not running', enabled: false },
			{ type: 'separator' },
			{ label: 'Open the village', enabled: running, click: () => open('village') },
			{ label: 'Open clean output (no overlay)', enabled: running, click: () => open('clean') },
			{ label: 'Open demo', enabled: running, click: () => open('demo') },
			{ type: 'separator' },
			{ label: 'Show launcher', click: () => showWindow() },
			{ label: 'Quit Companion Village', click: () => quit() },
		]),
	)
}

app.on('activate', () => showWindow())
app.on('before-quit', () => {
	quitting = true
})
app.on('will-quit', () => void server.stop())
// the launcher lives in the tray: closing every window does not quit
app.on('window-all-closed', () => {})

ipcMain.handle('state', () => state())

ipcMain.handle('set', async (_e, patch: Partial<LauncherSettings>) => {
	const prev = settings
	settings = sanitize({ ...settings, ...patch })
	saveSettings(settings)
	if (settings.runAtLogin !== prev.runAtLogin) setRunAtLogin(settings.runAtLogin)
	if (settings.port !== prev.port || settings.bind !== prev.bind) await startServer()
	else pushState()
	return state()
})

ipcMain.handle('restart', async () => {
	await startServer()
	return state()
})

ipcMain.handle('open', (_e, mode: OpenMode) => open(MODE_QUERY[mode] !== undefined ? mode : 'village'))
ipcMain.handle('open-url', (_e, url: string) => {
	if (typeof url === 'string' && /^https?:\/\//.test(url)) openUrl(url, settings.browser)
})
ipcMain.handle('copy', (_e, text: string) => clipboard.writeText(String(text)))
ipcMain.handle('hide', () => hideWindow())
ipcMain.handle('quit', () => quit())
