import type { CompanionVariableValue, CompanionVariableDefinitions } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { PAIRS, TRIBES, tribeName, type VillageState, type VillageTribeState } from './protocol.js'

export type VariablesSchema = Record<string, CompanionVariableValue>

const TRIBE_FIELDS: [string, string][] = [
	['name', 'name'],
	['year', 'year'],
	['pop', 'population (villagers)'],
	['era', 'era number (0 medieval … 4 sci-fi)'],
	['era_name', 'era name'],
	['inventions', 'inventions discovered'],
	['last_invention', 'latest invention'],
	['next_invention', 'years until the next invention'],
	['wood', 'wood in stock'],
	['stone', 'stone in stock'],
	['food', 'food in stock'],
	['buildings', 'buildings'],
	['construction', 'buildings under construction'],
	['wins', 'battles won'],
	['losses', 'battles lost'],
	['prestige', 'prestige'],
	['status', 'war / peace status'],
	['event', 'current event'],
	['raid', 'raid: attacking / defending / empty'],
	['control', 'who drives it (companion / module / ai)'],
	['deaths', 'villagers lost so far'],
]

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const defs: CompanionVariableDefinitions<VariablesSchema> = {
		connected: { name: 'Village page connected (yes/no)' },
		pages: { name: 'Number of village pages syncing' },
		my_tribe: { name: 'This Companion’s tribe id' },
		my_name: { name: 'This Companion’s tribe name' },
		player: { name: 'Tribe the screen is following' },
		player_name: { name: 'Name of the tribe the screen is following' },
		leader: { name: 'Leading tribe id' },
		leader_name: { name: 'Leading tribe name' },
		clock: { name: 'Time of day in the village (with icon)' },
		phase: { name: 'Day phase: day / dawn / dusk / night' },
		paused: { name: 'Paused (yes/no)' },
		speed: { name: 'Game speed' },
		news: { name: 'Latest headline from the village' },
		events: { name: 'Events happening right now' },
		event_count: { name: 'Number of events happening right now' },
		camera: { name: 'Camera mode' },
	}
	for (const t of TRIBES) for (const [k, label] of TRIBE_FIELDS) defs[`${t.id}_${k}`] = { name: `${t.name}: ${label}` }
	for (const [k, label] of TRIBE_FIELDS) defs[`my_${k}`] = { name: `This Companion’s tribe: ${label}` }
	for (const [a, b] of PAIRS) {
		defs[`rel_${a}_${b}`] = { name: `Relation ${tribeName(a)} ↔ ${tribeName(b)} (-100…100)` }
		defs[`stance_${a}_${b}`] = { name: `Stance ${tribeName(a)} ↔ ${tribeName(b)}` }
	}
	self.setVariableDefinitions(defs)
}

function tribeValues(t: VillageTribeState): Record<string, CompanionVariableValue> {
	const status = t.wars.length
		? `⚔️ war with ${t.wars.map(tribeName).join(' & ')}`
		: t.allies.length
			? `🤝 allied with ${t.allies.map(tribeName).join(' & ')}`
			: 'at peace'
	return {
		name: tribeName(t.id),
		year: t.year,
		pop: t.pop,
		era: t.era,
		era_name: t.eraName,
		inventions: t.inventions,
		last_invention: t.lastInvention,
		next_invention: t.nextInvention,
		wood: t.wood,
		stone: t.stone,
		food: t.food,
		buildings: t.buildings,
		construction: t.sites,
		wins: t.wins,
		losses: t.losses,
		prestige: t.prestige,
		status,
		event: t.event,
		raid: t.raid,
		control: t.control,
		deaths: t.deaths,
	}
}

export function UpdateVariableValues(self: ModuleInstance, st: VillageState | null): void {
	const vals: Record<string, CompanionVariableValue> = {
		connected: self.isConnected() ? 'yes' : 'no',
		pages: self.server.livePages(self.config.timeout * 1000),
		my_tribe: self.config.tribe,
		my_name: tribeName(self.config.tribe),
	}
	if (st) {
		Object.assign(vals, {
			player: st.player,
			player_name: tribeName(st.player),
			leader: st.leader,
			leader_name: tribeName(st.leader),
			clock: st.clock,
			phase: st.phase,
			paused: st.paused ? 'yes' : 'no',
			speed: st.speed,
			news: st.news,
			events: st.events.map((e) => `${e.icon} ${e.name}`).join(', '),
			event_count: st.events.length,
			camera: st.camera,
		})
		for (const t of st.tribes) {
			const tv = tribeValues(t)
			for (const [k, v] of Object.entries(tv)) vals[`${t.id}_${k}`] = v
			if (t.id === self.config.tribe) for (const [k, v] of Object.entries(tv)) vals[`my_${k}`] = v
		}
		for (const r of st.relations) {
			const [a, b] = PAIRS.find(([x, y]) => (x === r.a && y === r.b) || (x === r.b && y === r.a)) || [r.a, r.b]
			vals[`rel_${a}_${b}`] = Math.round(r.value)
			vals[`stance_${a}_${b}`] = r.stance
		}
	}
	self.setVariableValues(vals)
}
