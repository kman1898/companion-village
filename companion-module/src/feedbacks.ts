import { combineRgb, type DropdownChoice } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { ERA_NAMES, EVENTS, TRIBES } from './protocol.js'
import { TRIBE_CHOICES } from './actions.js'

type TribeOpt = { tribe: string }

export type FeedbacksSchema = {
	connected: { type: 'boolean'; options: Record<string, never> }
	at_war: { type: 'boolean'; options: TribeOpt & { against: string } }
	under_attack: { type: 'boolean'; options: TribeOpt }
	attacking: { type: 'boolean'; options: TribeOpt }
	allied: { type: 'boolean'; options: TribeOpt & { with: string } }
	stance: { type: 'boolean'; options: TribeOpt & { other: string; stance: string } }
	event_active: { type: 'boolean'; options: TribeOpt & { event: string } }
	era_reached: { type: 'boolean'; options: TribeOpt & { era: number } }
	is_leader: { type: 'boolean'; options: TribeOpt }
	is_viewed: { type: 'boolean'; options: TribeOpt }
	night: { type: 'boolean'; options: Record<string, never> }
	paused: { type: 'boolean'; options: Record<string, never> }
	tribe_color: { type: 'value'; options: TribeOpt }
}

const ANY: DropdownChoice<string> = { id: 'any', label: 'Anyone' }
const OTHER_CHOICES: DropdownChoice<string>[] = TRIBES.map((t) => ({ id: t.id, label: `${t.icon} ${t.name}` }))
const tribeField = {
	type: 'dropdown' as const,
	id: 'tribe' as const,
	label: 'Tribe',
	default: 'self',
	choices: TRIBE_CHOICES,
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const red = { bgcolor: combineRgb(200, 30, 30), color: combineRgb(255, 255, 255) }
	self.setFeedbackDefinitions({
		connected: {
			name: 'Village page is connected',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(0, 140, 60), color: combineRgb(255, 255, 255) },
			options: [],
			callback: () => self.isConnected(),
		},
		at_war: {
			name: 'Tribe is at war',
			type: 'boolean',
			defaultStyle: red,
			options: [
				tribeField,
				{ type: 'dropdown', id: 'against', label: 'Against', default: 'any', choices: [ANY, ...OTHER_CHOICES] },
			],
			callback: (f) => {
				const t = self.tribeState(f.options.tribe)
				if (!t) return false
				return f.options.against === 'any' ? t.wars.length > 0 : t.wars.includes(f.options.against as never)
			},
		},
		under_attack: {
			name: 'Tribe is being raided right now',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(255, 0, 0), color: combineRgb(255, 255, 0) },
			options: [tribeField],
			callback: (f) => self.tribeState(f.options.tribe)?.raid === 'defending',
		},
		attacking: {
			name: 'Tribe’s army is on the march',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(255, 120, 0), color: combineRgb(0, 0, 0) },
			options: [tribeField],
			callback: (f) => self.tribeState(f.options.tribe)?.raid === 'attacking',
		},
		allied: {
			name: 'Tribes are allies',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(30, 140, 70), color: combineRgb(255, 255, 255) },
			options: [
				tribeField,
				{ type: 'dropdown', id: 'with', label: 'With', default: 'any', choices: [ANY, ...OTHER_CHOICES] },
			],
			callback: (f) => {
				const t = self.tribeState(f.options.tribe)
				if (!t) return false
				return f.options.with === 'any' ? t.allies.length > 0 : t.allies.includes(f.options.with as never)
			},
		},
		stance: {
			name: 'Relation between two tribes',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(120, 60, 0), color: combineRgb(255, 255, 255) },
			options: [
				tribeField,
				{ type: 'dropdown', id: 'other', label: 'Other tribe', default: 'noises', choices: OTHER_CHOICES },
				{
					type: 'dropdown',
					id: 'stance',
					label: 'Is',
					default: 'war',
					choices: ['war', 'hostile', 'tense', 'neutral', 'friendly', 'allied'].map((s) => ({ id: s, label: s })),
				},
			],
			callback: (f) => {
				const a = self.resolveTribe(f.options.tribe),
					b = f.options.other
				const r = self.state?.relations.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))
				return r?.stance === f.options.stance
			},
		},
		event_active: {
			name: 'Event is happening',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(160, 100, 0), color: combineRgb(255, 255, 255) },
			options: [
				{
					type: 'dropdown',
					id: 'event',
					label: 'Event',
					default: 'any',
					choices: [
						{ id: 'any', label: 'Any event' },
						{ id: 'raid', label: '⚔️ Raid' },
						...EVENTS.map((e) => ({ id: e.id, label: e.label })),
					],
				},
				{ ...tribeField, choices: [{ id: 'all', label: 'Anywhere' }, ...TRIBE_CHOICES], default: 'all' },
			],
			callback: (f) => {
				const st = self.state
				if (!st) return false
				const tribe = f.options.tribe === 'all' ? null : self.resolveTribe(f.options.tribe)
				return st.events.some(
					(e) => (f.options.event === 'any' || e.type === f.options.event) && (!tribe || !e.tribe || e.tribe === tribe),
				)
			},
		},
		era_reached: {
			name: 'Tribe has reached an era',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(40, 90, 160), color: combineRgb(255, 255, 255) },
			options: [
				tribeField,
				{
					type: 'dropdown',
					id: 'era',
					label: 'Era',
					default: 1,
					choices: ERA_NAMES.map((n, i) => ({ id: i, label: n })),
				},
			],
			callback: (f) => (self.tribeState(f.options.tribe)?.era ?? -1) >= Number(f.options.era),
		},
		is_leader: {
			name: 'Tribe is in the lead',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(200, 160, 30), color: combineRgb(0, 0, 0) },
			options: [tribeField],
			callback: (f) => self.state?.leader === self.resolveTribe(f.options.tribe),
		},
		is_viewed: {
			name: 'Screen is following this tribe',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(255, 255, 255), color: combineRgb(0, 0, 0) },
			options: [tribeField],
			callback: (f) => self.state?.player === self.resolveTribe(f.options.tribe),
		},
		night: {
			name: 'It is night in the village',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(20, 30, 70), color: combineRgb(255, 255, 255) },
			options: [],
			callback: () => self.state?.phase === 'night',
		},
		paused: {
			name: 'Village is paused',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(90, 90, 90), color: combineRgb(255, 255, 255) },
			options: [],
			callback: () => !!self.state?.paused,
		},
		tribe_color: {
			name: 'Tribe colour (value, for button background)',
			type: 'value',
			options: [tribeField],
			callback: (f) => TRIBES.find((t) => t.id === self.resolveTribe(f.options.tribe))?.color ?? 0,
		},
	})
}
