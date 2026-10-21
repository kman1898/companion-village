import type { DropdownChoice, SomeCompanionActionInputField } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { EVENTS, TRIBES, type TribeId } from './protocol.js'
import { ignorePattern } from './desks.js'

type TribeOpt = { tribe: string }
type PairOpt = { from: string; target: string }

export type ActionsSchema = {
	add_years: { options: TribeOpt & { amount: number } }
	attack: { options: PairOpt }
	make_peace: { options: PairOpt }
	send_gift: { options: PairOpt }
	send_caravan: { options: PairOpt }
	offer_alliance: { options: PairOpt }
	festival: { options: TribeOpt }
	trigger_event: { options: TribeOpt & { event: string } }
	inspire: { options: TribeOpt }
	give_resources: { options: TribeOpt & { wood: number; stone: number; food: number } }
	camera: { options: { mode: string; tribe: string } }
	overlay: { options: { mode: string } }
	speed: { options: { value: string } }
	time_of_day: { options: { time: string } }
	war_mode: { options: { value: string } }
	events_mode: { options: { value: string } }
	disease_mode: { options: { value: string } }
	ai_pace: { options: { value: string } }
	day_length: { options: { value: string } }
	view_as: { options: TribeOpt }
	message: { options: { text: string; sub: string } }
	desk_activity: {
		options: { tribe: string; desk: string; mode: string; values: string; control: string; ignore: string }
	}
	desk_scoring: { options: { value: string } }
	desk_reset: { options: Record<string, never> }
}

/** "This Companion's tribe" or a specific one */
export const TRIBE_CHOICES: DropdownChoice<string>[] = [
	{ id: 'self', label: '⭐ This Companion’s tribe' },
	...TRIBES.map((t) => ({ id: t.id, label: `${t.icon} ${t.name}` })),
]
function tribeField<K extends string>(id: K, label = 'Tribe', def = 'self'): SomeCompanionActionInputField<K> {
	return { type: 'dropdown', id, label, default: def, choices: TRIBE_CHOICES }
}
const targetField: SomeCompanionActionInputField<'target'> = {
	type: 'dropdown',
	id: 'target',
	label: 'Target tribe',
	default: 'noises',
	choices: TRIBES.map((t) => ({ id: t.id, label: `${t.icon} ${t.name}` })),
}

export function UpdateActions(self: ModuleInstance): void {
	const T = (t: string): TribeId => self.resolveTribe(t)
	const order = (verb: string) => (e: { options: PairOpt }) => {
		const from = T(e.options.from),
			target = T(e.options.target)
		if (from === target) return self.log('warn', `${verb}: a tribe can't target itself`)
		self.send({ type: 'command', tribe: from, cmd: `${verb}:${target}` })
	}
	self.setActionDefinitions({
		add_years: {
			name: 'Add years (and settlers) to a tribe',
			description:
				'Each year brings one new settler. Put this on a trigger "On any button press" to count every press.',
			options: [tribeField('tribe'), { type: 'number', id: 'amount', label: 'Years', default: 1, min: 1, max: 100 }],
			callback: (e) =>
				self.send({ type: 'press', tribe: T(e.options.tribe), n: Math.max(1, Math.round(e.options.amount)) }),
		},
		attack: {
			name: 'War: attack another tribe',
			description: 'Declares war (if needed) and sends an army.',
			options: [tribeField('from', 'Attacking tribe'), targetField],
			callback: order('attack'),
		},
		make_peace: { name: 'Diplomacy: make peace', options: [tribeField('from'), targetField], callback: order('peace') },
		send_gift: { name: 'Diplomacy: send a gift', options: [tribeField('from'), targetField], callback: order('gift') },
		send_caravan: {
			name: 'Diplomacy: send a trade caravan',
			options: [tribeField('from'), targetField],
			callback: order('trade'),
		},
		offer_alliance: {
			name: 'Diplomacy: offer friendship / alliance',
			options: [tribeField('from'), targetField],
			callback: order('ally'),
		},
		festival: {
			name: 'Throw a festival',
			options: [tribeField('tribe')],
			callback: (e) => self.send({ type: 'command', tribe: T(e.options.tribe), cmd: 'festival' }),
		},
		trigger_event: {
			name: 'Make something happen (event)',
			description: 'Weather and sky events affect the whole map; the others hit the chosen tribe.',
			options: [
				{
					type: 'dropdown',
					id: 'event',
					label: 'Event',
					default: 'festival',
					choices: EVENTS.map((ev) => ({ id: ev.id, label: ev.label })),
					minChoicesForSearch: 5,
				},
				tribeField('tribe'),
			],
			callback: (e) => self.send({ type: 'event', event: e.options.event, tribe: T(e.options.tribe) }),
		},
		inspire: {
			name: 'Inspire: invent something right now',
			options: [tribeField('tribe')],
			callback: (e) => self.send({ type: 'inspire', tribe: T(e.options.tribe) }),
		},
		give_resources: {
			name: 'Give resources to a tribe',
			options: [
				tribeField('tribe'),
				{ type: 'number', id: 'wood', label: 'Wood', default: 20, min: 0, max: 10000 },
				{ type: 'number', id: 'stone', label: 'Stone', default: 20, min: 0, max: 10000 },
				{ type: 'number', id: 'food', label: 'Food', default: 20, min: 0, max: 10000 },
			],
			callback: (e) =>
				self.send({
					type: 'resources',
					tribe: T(e.options.tribe),
					wood: e.options.wood,
					stone: e.options.stone,
					food: e.options.food,
				}),
		},
		camera: {
			name: 'Screen: camera',
			options: [
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Camera',
					default: 'follow',
					choices: [
						{ id: 'follow', label: 'Auto-follow' },
						{ id: 'map', label: 'Whole map' },
						{ id: 'tribe', label: 'Look at a tribe' },
						{ id: 'zoomIn', label: 'Zoom in' },
						{ id: 'zoomOut', label: 'Zoom out' },
					],
				},
				{ ...tribeField('tribe'), isVisibleExpression: '$(options:mode) == "tribe"' },
			],
			callback: (e) => {
				const mode = e.options.mode as 'follow' | 'map' | 'tribe' | 'zoomIn' | 'zoomOut'
				self.send({ type: 'camera', mode, tribe: mode === 'tribe' ? T(e.options.tribe) : undefined })
			},
		},
		overlay: {
			name: 'Screen: show / hide the overlay',
			options: [
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Overlay',
					default: 'toggle',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'show', label: 'Show' },
						{ id: 'hide', label: 'Hide (clean picture)' },
					],
				},
			],
			callback: (e) => self.send({ type: 'hud', mode: e.options.mode as 'toggle' | 'show' | 'hide' }),
		},
		speed: {
			name: 'Game speed / pause',
			options: [
				{
					type: 'dropdown',
					id: 'value',
					label: 'Speed',
					default: 'toggle',
					choices: [
						{ id: 'toggle', label: 'Pause / resume' },
						{ id: 'pause', label: 'Pause' },
						{ id: 'resume', label: 'Resume' },
						{ id: '1', label: '1×' },
						{ id: '2', label: '2×' },
						{ id: '4', label: '4×' },
						{ id: '8', label: '8×' },
					],
				},
			],
			callback: (e) => {
				const v = e.options.value
				self.send({ type: 'speed', value: v === 'toggle' || v === 'pause' || v === 'resume' ? v : Number(v) })
			},
		},
		time_of_day: {
			name: 'Set the time of day',
			options: [
				{
					type: 'dropdown',
					id: 'time',
					label: 'Time',
					default: '0.5',
					choices: [
						{ id: '0.25', label: '🌅 Dawn' },
						{ id: '0.5', label: '☀️ Noon' },
						{ id: '0.74', label: '🌇 Dusk' },
						{ id: '0', label: '🌙 Midnight' },
					],
				},
			],
			callback: (e) => self.send({ type: 'time', t: Number(e.options.time) }),
		},
		war_mode: {
			name: 'Setting: war between tribes',
			options: [
				{
					type: 'dropdown',
					id: 'value',
					label: 'War',
					default: 'on',
					choices: [
						{ id: 'on', label: 'Anyone may go to war' },
						{ id: 'feud', label: 'Only the other two fight' },
						{ id: 'off', label: 'Peaceful' },
					],
				},
			],
			callback: (e) => self.send({ type: 'setting', key: 'war', value: e.options.value }),
		},
		events_mode: {
			name: 'Setting: random events',
			options: [
				{
					type: 'dropdown',
					id: 'value',
					label: 'Events',
					default: 'full',
					choices: [
						{ id: 'full', label: 'On' },
						{ id: 'gentle', label: 'Gentle (nobody dies)' },
						{ id: 'off', label: 'Off' },
					],
				},
			],
			callback: (e) => self.send({ type: 'setting', key: 'events', value: e.options.value }),
		},
		disease_mode: {
			name: 'Setting: disease',
			options: [
				{
					type: 'dropdown',
					id: 'value',
					label: 'Disease',
					default: 'on',
					choices: [
						{ id: 'on', label: 'On (sickness spreads between villagers)' },
						{ id: 'off', label: 'Off' },
					],
				},
			],
			callback: (e) => self.send({ type: 'setting', key: 'disease', value: e.options.value }),
		},
		ai_pace: {
			name: 'Setting: how AI tribes grow',
			options: [
				{
					type: 'dropdown',
					id: 'value',
					label: 'AI pace',
					default: 'match',
					choices: [
						{ id: 'match', label: 'In step with the Companion tribes' },
						{ id: 'steady', label: 'Steadily' },
						{ id: 'fast', label: 'Fast' },
						{ id: 'slow', label: 'Slowly' },
						{ id: 'frozen', label: 'Not at all' },
					],
				},
			],
			callback: (e) => self.send({ type: 'setting', key: 'aiPace', value: e.options.value }),
		},
		day_length: {
			name: 'Setting: day length',
			options: [
				{
					type: 'dropdown',
					id: 'value',
					label: 'Day length',
					default: 'normal',
					choices: [
						{ id: 'short', label: 'Short (2 min)' },
						{ id: 'normal', label: 'Normal (4 min)' },
						{ id: 'long', label: 'Long (10 min)' },
						{ id: 'off', label: 'Always daytime' },
					],
				},
			],
			callback: (e) => self.send({ type: 'setting', key: 'dayLength', value: e.options.value }),
		},
		view_as: {
			name: 'Screen: view as tribe (switch whose village the screen follows)',
			options: [tribeField('tribe')],
			callback: (e) => self.send({ type: 'player', tribe: T(e.options.tribe) }),
		},
		message: {
			name: 'Screen: show a message banner',
			options: [
				{
					type: 'textinput',
					id: 'text',
					label: 'Headline',
					default: 'Hello from the Stream Deck!',
					useVariables: true,
				},
				{ type: 'textinput', id: 'sub', label: 'Sub line', default: '', useVariables: true },
			],
			callback: (e) =>
				self.send({
					type: 'message',
					text: String(e.options.text).slice(0, 120),
					sub: String(e.options.sub).slice(0, 200),
				}),
		},
		desk_activity: {
			name: 'Desk activity (fair count) — for desk triggers',
			description:
				'Run this from a trigger that watches a mixing or lighting desk module. A fader move, a key press or a scene ' +
				'recall counts as one action (+1 year and settler), however many values it changes. ' +
				'tools/desk-triggers.mjs builds these triggers for X32, WING, Yamaha, MagicQ and grandMA3.',
			options: [
				tribeField('tribe', 'Department (tribe)', 'noises'),
				{
					type: 'textinput',
					id: 'desk',
					label: 'Desk name (each desk is counted and limited on its own)',
					default: 'FOH',
				},
				{
					type: 'dropdown',
					id: 'mode',
					label: 'What the trigger passes',
					default: 'values',
					choices: [
						{ id: 'values', label: 'Values of the desk’s controls (count the ones that change)' },
						{ id: 'event', label: 'One control that was just used (e.g. the latest OSC path)' },
					],
				},
				{
					type: 'textinput',
					id: 'values',
					label: 'Controls, one per line or separated by | as name=$(desk:variable)',
					default: 'ch1=$(x32:fader_ch_01)\nch2=$(x32:fader_ch_02)',
					multiline: true,
					useVariables: true,
					isVisibleExpression: '$(options:mode) == "values"',
				},
				{
					type: 'textinput',
					id: 'control',
					label: 'Control that was used',
					default: '$(osc:latest_received_path)',
					useVariables: true,
					isVisibleExpression: '$(options:mode) == "event"',
				},
				{
					type: 'textinput',
					id: 'ignore',
					label: 'Ignore controls matching (regular expression, optional)',
					default: '',
				},
			],
			callback: (e) => {
				const tribe = T(e.options.tribe)
				const desk = String(e.options.desk || 'Desk').slice(0, 40)
				const ignore = ignorePattern(String(e.options.ignore ?? ''))
				if (e.options.mode === 'event') self.desks.touch(desk, tribe, String(e.options.control ?? ''), ignore)
				else self.desks.observe(desk, tribe, String(e.options.values ?? ''), ignore)
				self.deskChanged()
			},
		},
		desk_scoring: {
			name: 'Desk activity: scoring on / off',
			description:
				'Turn desk scoring off during soundcheck or programming. Desks are still watched, they just don’t score.',
			options: [
				{
					type: 'dropdown',
					id: 'value',
					label: 'Scoring',
					default: 'toggle',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'on', label: 'On' },
						{ id: 'off', label: 'Off' },
					],
				},
			],
			callback: (e) => {
				const v = e.options.value
				self.desks.enabled = v === 'toggle' ? !self.desks.enabled : v === 'on'
				self.log('info', `Desk scoring ${self.desks.enabled ? 'on' : 'off'}`)
				self.deskChanged()
			},
		},
		desk_reset: {
			name: 'Desk activity: reset the desk counters',
			description: 'Zeroes the desk_* variables. Years already given to the village stay.',
			options: [],
			callback: () => {
				self.desks.reset()
				self.deskChanged()
			},
		},
	})
}
