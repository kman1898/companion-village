import type { SomeCompanionConfigField } from '@companion-module/base'
import { TRIBES, type TribeId } from './protocol.js'

export type ModuleConfig = {
	port: number
	bind: string
	tribe: TribeId
	timeout: number
}

export const DEFAULT_PORT = 17890

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'How it works',
			width: 12,
			value:
				'This module runs a small server inside Companion. Open Companion Village ' +
				'(https://mko1989.github.io/companion-village/ or the offline copy), go to Settings → Companion module ' +
				'and enter this computer’s address and the port below, e.g. <code>localhost:17890</code> or <code>192.168.1.20:17890</code>.',
		},
		{
			type: 'number',
			id: 'port',
			label: 'Listen port',
			width: 4,
			min: 1024,
			max: 65535,
			default: DEFAULT_PORT,
		},
		{
			type: 'textinput',
			id: 'bind',
			label: 'Listen address (empty = all interfaces)',
			width: 8,
			default: '',
		},
		{
			type: 'dropdown',
			id: 'tribe',
			label: 'This Companion plays as',
			width: 6,
			default: 'pixels',
			choices: TRIBES.map((t) => ({ id: t.id, label: `${t.icon} ${t.name} (${t.dept})` })),
		},
		{
			type: 'number',
			id: 'timeout',
			label: 'Village counts as disconnected after (seconds)',
			width: 6,
			min: 2,
			max: 120,
			default: 5,
		},
	]
}
