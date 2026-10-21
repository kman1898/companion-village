import { shell } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

interface Browser {
	label: string
	/** macOS app name in /Applications */
	mac: string
	/** Windows exe path below Program Files / LocalAppData */
	win: string[]
	/** Linux commands on PATH */
	linux: string[]
}

const BROWSERS: Record<string, Browser> = {
	chrome: {
		label: 'Google Chrome',
		mac: 'Google Chrome',
		win: ['Google\\Chrome\\Application\\chrome.exe'],
		linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'],
	},
	edge: { label: 'Microsoft Edge', mac: 'Microsoft Edge', win: ['Microsoft\\Edge\\Application\\msedge.exe'], linux: ['microsoft-edge'] },
	firefox: { label: 'Firefox', mac: 'Firefox', win: ['Mozilla Firefox\\firefox.exe'], linux: ['firefox'] },
	brave: {
		label: 'Brave',
		mac: 'Brave Browser',
		win: ['BraveSoftware\\Brave-Browser\\Application\\brave.exe'],
		linux: ['brave-browser', 'brave'],
	},
	safari: { label: 'Safari', mac: 'Safari', win: [], linux: [] },
}

function winPath(key: string): string | null {
	const roots = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env['LOCALAPPDATA']].filter(Boolean) as string[]
	for (const rel of BROWSERS[key].win) for (const r of roots) if (existsSync(path.join(r, rel))) return path.join(r, rel)
	return null
}

function linuxCmd(key: string): string | null {
	const dirs = (process.env['PATH'] || '').split(':')
	for (const c of BROWSERS[key].linux) for (const d of dirs) if (existsSync(path.join(d, c))) return path.join(d, c)
	return null
}

function macApp(key: string): string | null {
	const name = `${BROWSERS[key].mac}.app`
	for (const dir of ['/Applications', '/System/Applications', '/System/Volumes/Preboot/Cryptexes/App/System/Applications', path.join(process.env['HOME'] || '', 'Applications')]) {
		if (existsSync(path.join(dir, name))) return BROWSERS[key].mac
	}
	return null
}

function installed(key: string): boolean {
	if (process.platform === 'darwin') return !!macApp(key)
	if (process.platform === 'win32') return !!winPath(key)
	return !!linuxCmd(key)
}

/** Browsers found on this computer, for the launcher's picker */
export function availableBrowsers(): { key: string; label: string }[] {
	return [
		{ key: 'default', label: 'System default' },
		...Object.entries(BROWSERS)
			.filter(([key]) => installed(key))
			.map(([key, b]) => ({ key, label: b.label })),
	]
}

/** Opens the URL in the chosen browser, falling back to the system default */
export function openUrl(url: string, browser: string): void {
	const fallback = () => void shell.openExternal(url)
	if (!browser || browser === 'default' || !BROWSERS[browser]) return fallback()
	let cmd: string | null = null
	let args: string[] = []
	if (process.platform === 'darwin') {
		const appName = macApp(browser)
		if (appName) [cmd, args] = ['open', ['-a', appName, url]]
	} else if (process.platform === 'win32') {
		cmd = winPath(browser)
		args = [url]
	} else {
		cmd = linuxCmd(browser)
		args = [url]
	}
	if (!cmd) return fallback()
	const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
	child.on('error', fallback)
	child.unref()
}
