import { app } from 'electron'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const HIDDEN_ARG = '--hidden'

/** True when the launcher was started by "start when I log in": it then starts quietly in the tray / menu bar */
export function startedAtLogin(): boolean {
	return process.argv.includes(HIDDEN_ARG) || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin)
}

/** Linux has no login item API: desktops start what's in ~/.config/autostart */
const autostartFile = () => path.join(process.env['XDG_CONFIG_HOME'] || path.join(homedir(), '.config'), 'autostart', 'companion-village.desktop')

export function setRunAtLogin(enabled: boolean): void {
	if (process.platform === 'linux') {
		const file = autostartFile()
		if (!enabled) {
			if (existsSync(file)) rmSync(file)
			return
		}
		// an AppImage runs from a temporary mount: start the .AppImage file itself
		const exe = process.env['APPIMAGE'] || process.execPath
		mkdirSync(path.dirname(file), { recursive: true })
		writeFileSync(
			file,
			['[Desktop Entry]', 'Type=Application', 'Name=Companion Village', `Exec="${exe}" ${HIDDEN_ARG}`, 'X-GNOME-Autostart-enabled=true', ''].join('\n'),
		)
		return
	}
	// the Windows portable build unpacks to a temporary folder: start the portable .exe itself
	const exe = process.env['PORTABLE_EXECUTABLE_FILE']
	app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_ARG], ...(exe ? { path: exe } : {}) })
}
