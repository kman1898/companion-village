import {
	combineRgb,
	type CompanionPresetDefinitions,
	type CompanionPresetSection,
	type CompanionSimplePresetDefinition,
} from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'
import { EVENTS, TRIBES } from './protocol.js'

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const DARK = combineRgb(30, 24, 18)
const RED = combineRgb(200, 30, 30)
const GREEN = combineRgb(30, 130, 60)

type Preset = CompanionSimplePresetDefinition<ModuleSchema>

export function UpdatePresets(self: ModuleInstance): void {
	const v = (name: string) => `$(${self.label}:${name})`
	const me = self.config.tribe
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}
	const add = (id: string, p: Preset) => {
		presets[id] = p
		return id
	}
	const button = (
		name: string,
		text: string,
		bgcolor: number,
		color: number,
		down: Preset['steps'][number]['down'],
		feedbacks: Preset['feedbacks'] = [],
		size: Preset['style']['size'] = 'auto',
	): Preset => ({
		type: 'simple',
		name,
		style: { text, size, color, bgcolor, show_topbar: false },
		steps: [{ down, up: [] }],
		feedbacks,
	})

	// ---------------- years ----------------
	const years: string[] = []
	const mine = TRIBES.find((t) => t.id === me)!
	years.push(
		add(
			'years_self',
			button(
				'+1 year for this Companion’s tribe',
				`${mine.icon} +1 YEAR\\nY${v('my_year')}\\n👥 ${v('my_pop')}`,
				mine.color,
				mine.text,
				[{ actionId: 'add_years', options: { tribe: 'self', amount: 1 } }],
			),
		),
	)
	for (const t of TRIBES) {
		years.push(
			add(
				`years_${t.id}`,
				button(`+1 year for ${t.name}`, `${t.icon} ${t.name}\\n+1 YEAR\\nY${v(`${t.id}_year`)}`, t.color, t.text, [
					{ actionId: 'add_years', options: { tribe: t.id, amount: 1 } },
				]),
			),
		)
		years.push(
			add(
				`years10_${t.id}`,
				button(`+10 years for ${t.name}`, `${t.icon}\\n+10\\nYEARS`, t.color, t.text, [
					{ actionId: 'add_years', options: { tribe: t.id, amount: 10 } },
				]),
			),
		)
	}

	// ---------------- status tiles ----------------
	const status: string[] = []
	for (const t of TRIBES)
		status.push(
			add(
				`status_${t.id}`,
				button(
					`${t.name} status (press to look at them)`,
					`${t.icon} ${t.name}\\n👥 ${v(`${t.id}_pop`)}  Y${v(`${t.id}_year`)}\\n${v(`${t.id}_era_name`)}`,
					t.color,
					t.text,
					[{ actionId: 'camera', options: { mode: 'tribe', tribe: t.id } }],
					[
						{ feedbackId: 'at_war', options: { tribe: t.id, against: 'any' }, style: { bgcolor: RED, color: WHITE } },
						{
							feedbackId: 'under_attack',
							options: { tribe: t.id },
							style: { bgcolor: combineRgb(255, 0, 0), color: combineRgb(255, 255, 0) },
						},
					],
					14,
				),
			),
		)
	status.push(
		add(
			'status_mine',
			button(
				'This Companion’s tribe: resources',
				`🪵${v('my_wood')}\\n🪨${v('my_stone')}\\n🌾${v('my_food')}`,
				DARK,
				WHITE,
				[],
				[],
				14,
			),
		),
	)
	status.push(
		add(
			'status_inventions',
			button(
				'This Companion’s tribe: inventions',
				`💡 ${v('my_inventions')}\\nnext in ${v('my_next_invention')}y\\n${v('my_last_invention')}`,
				DARK,
				WHITE,
				[{ actionId: 'inspire', options: { tribe: 'self' } }],
				[],
				7,
			),
		),
	)
	status.push(
		add(
			'status_leader',
			button('Leading tribe', `👑\\n${v('leader_name')}`, combineRgb(200, 160, 30), BLACK, [
				{ actionId: 'camera', options: { mode: 'map', tribe: 'self' } },
			]),
		),
	)

	// ---------------- war & diplomacy (this Companion's tribe vs the others) ----------------
	const war: string[] = []
	for (const t of TRIBES) {
		if (t.id === me) continue
		war.push(
			add(
				`attack_${t.id}`,
				button(
					`Attack ${t.name}`,
					`⚔️ ATTACK\\n${t.icon} ${t.name}`,
					RED,
					WHITE,
					[{ actionId: 'attack', options: { from: 'self', target: t.id } }],
					[
						{
							feedbackId: 'at_war',
							options: { tribe: 'self', against: t.id },
							style: { bgcolor: combineRgb(255, 60, 0), color: WHITE },
						},
					],
				),
			),
		)
		war.push(
			add(
				`peace_${t.id}`,
				button(`Make peace with ${t.name}`, `🕊️ PEACE\\n${t.icon} ${t.name}`, combineRgb(60, 110, 160), WHITE, [
					{ actionId: 'make_peace', options: { from: 'self', target: t.id } },
				]),
			),
		)
		war.push(
			add(
				`gift_${t.id}`,
				button(`Send ${t.name} a gift`, `🎁 GIFT\\n${t.icon} ${t.name}`, combineRgb(150, 70, 140), WHITE, [
					{ actionId: 'send_gift', options: { from: 'self', target: t.id } },
				]),
			),
		)
		war.push(
			add(
				`trade_${t.id}`,
				button(`Trade with ${t.name}`, `🐫 TRADE\\n${t.icon} ${t.name}`, combineRgb(160, 120, 40), WHITE, [
					{ actionId: 'send_caravan', options: { from: 'self', target: t.id } },
				]),
			),
		)
		war.push(
			add(
				`ally_${t.id}`,
				button(
					`Offer ${t.name} friendship`,
					`🤝 ALLY\\n${t.icon} ${t.name}`,
					GREEN,
					WHITE,
					[{ actionId: 'offer_alliance', options: { from: 'self', target: t.id } }],
					[
						{
							feedbackId: 'allied',
							options: { tribe: 'self', with: t.id },
							style: { bgcolor: combineRgb(40, 200, 90), color: BLACK },
						},
					],
				),
			),
		)
	}
	war.push(
		add(
			'war_alert',
			button(
				'Under attack alert',
				`🛡️\\n${v('my_raid')}`,
				DARK,
				WHITE,
				[],
				[
					{
						feedbackId: 'under_attack',
						options: { tribe: 'self' },
						style: { bgcolor: combineRgb(255, 0, 0), color: combineRgb(255, 255, 0), text: '🚨 RAID!' },
					},
					{
						feedbackId: 'attacking',
						options: { tribe: 'self' },
						style: { bgcolor: combineRgb(255, 120, 0), color: BLACK, text: '⚔️ MARCHING' },
					},
				],
			),
		),
	)

	// ---------------- events ----------------
	const events = EVENTS.map((ev) => {
		const [icon, ...words] = ev.label.split(' ')
		return add(
			`event_${ev.id}`,
			button(
				ev.label,
				`${icon}\\n${words.join(' ').toUpperCase()}`,
				ev.scope === 'global' ? combineRgb(40, 50, 90) : combineRgb(90, 60, 30),
				WHITE,
				[{ actionId: 'trigger_event', options: { event: ev.id, tribe: 'self' } }],
				[
					{
						feedbackId: 'event_active',
						options: { event: ev.id, tribe: 'all' },
						style: { bgcolor: combineRgb(220, 160, 30), color: BLACK },
					},
				],
			),
		)
	})

	// ---------------- screen ----------------
	const screen: string[] = []
	screen.push(
		add(
			'cam_follow',
			button('Camera: auto-follow', '🎥\\nFOLLOW', DARK, WHITE, [
				{ actionId: 'camera', options: { mode: 'follow', tribe: 'self' } },
			]),
		),
	)
	screen.push(
		add(
			'cam_map',
			button('Camera: whole map', '🗺️\\nMAP', DARK, WHITE, [
				{ actionId: 'camera', options: { mode: 'map', tribe: 'self' } },
			]),
		),
	)
	screen.push(
		add(
			'cam_in',
			button('Camera: zoom in', '🔍\\nZOOM +', DARK, WHITE, [
				{ actionId: 'camera', options: { mode: 'zoomIn', tribe: 'self' } },
			]),
		),
	)
	screen.push(
		add(
			'cam_out',
			button('Camera: zoom out', '🔍\\nZOOM −', DARK, WHITE, [
				{ actionId: 'camera', options: { mode: 'zoomOut', tribe: 'self' } },
			]),
		),
	)
	for (const t of TRIBES)
		screen.push(
			add(
				`view_${t.id}`,
				button(
					`Follow ${t.name} on screen`,
					`👁️ VIEW\\n${t.icon} ${t.name}`,
					t.color,
					t.text,
					[{ actionId: 'view_as', options: { tribe: t.id } }],
					[{ feedbackId: 'is_viewed', options: { tribe: t.id }, style: { bgcolor: WHITE, color: BLACK } }],
				),
			),
		)
	screen.push(
		add(
			'overlay',
			button('Overlay on / off', '🖼️\\nOVERLAY', DARK, WHITE, [{ actionId: 'overlay', options: { mode: 'toggle' } }]),
		),
	)
	screen.push(
		add(
			'pause',
			button(
				'Pause / resume',
				`⏯️\\n${v('speed')}×`,
				DARK,
				WHITE,
				[{ actionId: 'speed', options: { value: 'toggle' } }],
				[
					{
						feedbackId: 'paused',
						options: {},
						style: { bgcolor: combineRgb(160, 40, 40), color: WHITE, text: '⏸️\\nPAUSED' },
					},
				],
			),
		),
	)
	for (const s of ['1', '2', '4', '8'])
		screen.push(
			add(
				`speed_${s}`,
				button(`Speed ${s}×`, `⏩\\n${s}×`, DARK, WHITE, [{ actionId: 'speed', options: { value: s } }]),
			),
		)
	screen.push(
		add(
			'message',
			button('Show a message on screen', '📣\\nMESSAGE', DARK, WHITE, [
				{ actionId: 'message', options: { text: 'Hello from the Stream Deck!', sub: '' } },
			]),
		),
	)

	// ---------------- time ----------------
	const time = [
		['0.25', '🌅\\nDAWN'],
		['0.5', '☀️\\nNOON'],
		['0.74', '🌇\\nDUSK'],
		['0', '🌙\\nNIGHT'],
	].map(([t, text]) =>
		add(
			`time_${t}`,
			button(
				`Time of day: ${text.split('\\n')[1].toLowerCase()}`,
				text,
				combineRgb(30, 40, 80),
				WHITE,
				[{ actionId: 'time_of_day', options: { time: t } }],
				[{ feedbackId: 'night', options: {}, style: { bgcolor: combineRgb(10, 15, 40) } }],
			),
		),
	)
	time.push(
		add(
			'clock',
			button(
				'Village clock',
				`${v('clock')}`,
				combineRgb(30, 40, 80),
				WHITE,
				[],
				[{ feedbackId: 'night', options: {}, style: { bgcolor: combineRgb(10, 15, 40) } }],
			),
		),
	)

	// ---------------- info ----------------
	const info = [
		add(
			'connected',
			button(
				'Village connection',
				`VILLAGE\\n${v('connected')}`,
				RED,
				WHITE,
				[],
				[{ feedbackId: 'connected', options: {}, style: { bgcolor: GREEN, color: WHITE } }],
			),
		),
		add('news', button('Latest headline', v('news'), DARK, WHITE, [], [], 7)),
		add(
			'now',
			button(
				'Events happening now',
				`${v('event_count')} EVENTS\\n${v('events')}`,
				DARK,
				WHITE,
				[],
				[
					{
						feedbackId: 'event_active',
						options: { event: 'any', tribe: 'all' },
						style: { bgcolor: combineRgb(160, 100, 0) },
					},
				],
				7,
			),
		),
	]

	const structure: CompanionPresetSection<ModuleSchema>[] = [
		{
			id: 'years',
			name: 'Years & settlers',
			description: 'Each year brings a settler; every few years an invention.',
			definitions: years,
		},
		{
			id: 'status',
			name: 'Tribe status',
			description: 'Live numbers. Red = at war, yellow on red = being raided. Press to look at the tribe.',
			definitions: status,
		},
		{
			id: 'war',
			name: 'War & diplomacy',
			description: `Orders for this Companion’s tribe against the others.`,
			definitions: war,
		},
		{
			id: 'events',
			name: 'Make something happen',
			description: 'Blue = whole map, brown = this Companion’s tribe.',
			definitions: events,
		},
		{ id: 'screen', name: 'Screen control', definitions: screen },
		{ id: 'time', name: 'Time of day', definitions: time },
		{ id: 'info', name: 'Info', definitions: info },
	]
	self.setPresetDefinitions(structure, presets)
}
