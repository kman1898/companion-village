import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import path from 'node:path'

export interface LauncherSettings {
	/** HTTP port the village is served on. Keep it the same between runs: saves live per address. */
	port: number
	/** '0.0.0.0' = every network, '127.0.0.1' = this computer only, or one interface's IP */
	bind: string
	/** 'default' or a key from browsers.ts */
	browser: string
	openOnLaunch: boolean
	startMinimized: boolean
	runAtLogin: boolean
	/** extra URL options added when opening the village, e.g. `hud=0&quality=low` */
	query: string
}

export const DEFAULTS: LauncherSettings = {
	port: 17880,
	bind: '0.0.0.0',
	browser: 'default',
	openOnLaunch: true,
	startMinimized: false,
	runAtLogin: false,
	query: '',
}

const file = () => path.join(app.getPath('userData'), 'launcher-settings.json')

export function loadSettings(): LauncherSettings {
	try {
		if (existsSync(file())) return sanitize({ ...DEFAULTS, ...JSON.parse(readFileSync(file(), 'utf8')) })
	} catch {
		// a broken settings file starts over with the defaults
	}
	return { ...DEFAULTS }
}

export function saveSettings(s: LauncherSettings): void {
	mkdirSync(path.dirname(file()), { recursive: true })
	// write then rename, so a crash mid-write never leaves half a file
	const tmp = `${file()}.tmp`
	writeFileSync(tmp, JSON.stringify(s, null, '\t'))
	renameSync(tmp, file())
}

export function sanitize(s: LauncherSettings): LauncherSettings {
	const port = Math.round(Number(s.port))
	return {
		port: port >= 1024 && port <= 65535 ? port : DEFAULTS.port,
		bind: typeof s.bind === 'string' && s.bind ? s.bind : DEFAULTS.bind,
		browser: typeof s.browser === 'string' && s.browser ? s.browser : 'default',
		openOnLaunch: !!s.openOnLaunch,
		startMinimized: !!s.startMinimized,
		runAtLogin: !!s.runAtLogin,
		query: typeof s.query === 'string' ? s.query.replace(/^[?&]+/, '').trim() : '',
	}
}

export interface NetInterface {
	name: string
	address: string
}

/** IPv4 addresses of this computer's network interfaces, loopback first */
export function listInterfaces(): NetInterface[] {
	const out: NetInterface[] = []
	for (const [name, addrs] of Object.entries(networkInterfaces())) {
		for (const a of addrs || []) {
			if (a.family !== 'IPv4' || a.internal) continue
			out.push({ name, address: a.address })
		}
	}
	return [{ name: 'This computer only', address: '127.0.0.1' }, ...out]
}

/** Addresses other machines (and this one) can open the village at */
export function villageUrls(s: LauncherSettings): { label: string; url: string }[] {
	const at = (host: string) => `http://${host}:${s.port}/`
	if (s.bind === '127.0.0.1') return [{ label: 'This computer', url: at('localhost') }]
	if (s.bind !== '0.0.0.0') return [{ label: 'Network', url: at(s.bind) }]
	return [
		{ label: 'This computer', url: at('localhost') },
		...listInterfaces()
			.filter((i) => i.address !== '127.0.0.1')
			.map((i) => ({ label: i.name, url: at(i.address) })),
	]
}
