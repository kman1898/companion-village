import type { SomeCompanionConfigField } from '@companion-module/base'
import { TRIBES, type TribeId } from './protocol.js'

export type ModuleConfig = {
	port: number
	bind: string
	tribe: TribeId
	timeout: number
	deskGap: number
	deskTogether: number
	deskRecall: number
	deskRepeat: number
	deskPerMinute: number
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
				'This module runs the village itself. Open <code>http://&lt;this computer&gt;:&lt;port&gt;/</code> in any browser ' +
				'or as an OBS browser source, e.g. <code>http://localhost:17890/</code> here or <code>http://192.168.1.20:17890/</code> ' +
				'from another machine. It links up by itself and plays as the tribe chosen below. ' +
				'The address is also in the variable <code>$(village:url)</code>.',
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
		{
			type: 'static-text',
			id: 'deskInfo',
			label: 'Desk competitions',
			width: 12,
			value:
				'Mixing and lighting desks score through the action <b>Desk activity (fair count)</b>, run by a trigger that watches ' +
				'the desk module’s variables (see the help and <code>tools/desk-triggers.mjs</code>). ' +
				'These rules make every fader move or key press count as one action (three faders at once = 3) and a scene recall count once, the same for every desk.',
		},
		{
			type: 'number',
			id: 'deskGap',
			label: 'One gesture until the control is still for (ms)',
			width: 6,
			min: 100,
			max: 10000,
			default: 800,
		},
		{
			type: 'number',
			id: 'deskTogether',
			label: 'Changes within (ms) are judged together',
			width: 6,
			min: 50,
			max: 5000,
			default: 300,
		},
		{
			type: 'number',
			id: 'deskRecall',
			label: 'More controls than this changing together is a scene recall (scores once)',
			width: 6,
			min: 2,
			max: 500,
			default: 8,
		},
		{
			type: 'number',
			id: 'deskRepeat',
			label: 'Same control scores at most every (seconds)',
			width: 6,
			min: 0,
			max: 600,
			default: 2,
		},
		{
			type: 'number',
			id: 'deskPerMinute',
			label: 'Max actions per desk per minute (0 = no limit)',
			width: 6,
			min: 0,
			max: 1000,
			default: 30,
		},
	]
}
