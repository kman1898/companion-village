import { saveSettings, settings, type AiPace, type DayLength, type DiseaseMode, type EventsMode, type WarMode } from '../core/settings'
import { clamp } from '../core/util'
import { INV_BY_ID } from '../data/inventions'
import { TRIBES, TRIBE_IDS, type TribeId } from '../data/tribes'
import { banner, lastNews, ticker } from '../ui/notify'
import { cam, followNow, lookAt, overview, zoomAt } from '../view/camera'
import { isPlayer } from './buildings'
import { clockText, nightAmount, twilight } from './daynight'
import { command, stance } from './diplomacy'
import { EVENTS, startEvent } from './events'
import { eraName, eraOf, invent, inventionsFor } from './history'
import { G, popOf, relation, tribeOf, type Tribe } from './state'
import { addYears, inventionPace, isAI } from './tribes'

/*
 * Remote control for the Companion Village module (and anything else that speaks the same protocol).
 * Actions arrive from Companion buttons; the state snapshot goes back as variables and feedbacks.
 */

export type RemoteAction =
	| { type: 'press'; tribe: TribeId; n: number }
	| { type: 'command'; tribe: TribeId; cmd: string }
	| { type: 'event'; event: string; tribe: TribeId }
	| { type: 'inspire'; tribe: TribeId }
	| { type: 'camera'; mode: 'follow' | 'map' | 'tribe' | 'zoomIn' | 'zoomOut'; tribe?: TribeId }
	| { type: 'hud'; mode: 'toggle' | 'show' | 'hide' }
	| { type: 'speed'; value: number | 'pause' | 'resume' | 'toggle' }
	| { type: 'time'; t: number }
	| { type: 'setting'; key: 'war' | 'events' | 'disease' | 'aiPace' | 'dayLength' | 'followAction'; value: string }
	| { type: 'player'; tribe: TribeId }
	| { type: 'message'; text: string; sub: string }
	| { type: 'resources'; tribe: TribeId; wood: number; stone: number; food: number }

const valid = (t: unknown): t is TribeId => TRIBE_IDS.includes(t as TribeId)
const name = (t: TribeId) => TRIBES[t].name

/** Hook so the settings panel can update the player tribe consistently */
export const remoteHooks: { setPlayer: (id: TribeId) => void } = { setPlayer: () => {} }

export function applyRemote(a: RemoteAction, from: string) {
	switch (a.type) {
		case 'press':
			if (valid(a.tribe)) addYears(tribeOf(a.tribe), clamp(Math.round(a.n) || 1, 1, 500))
			break
		case 'command':
			if (valid(a.tribe)) {
				const res = command(tribeOf(a.tribe), String(a.cmd))
				ticker(`${name(a.tribe)} command “${a.cmd}”: ${res}`, '🎛️', TRIBES[a.tribe].color)
			}
			break
		case 'event':
			if (EVENTS[a.event]) startEvent(a.event, valid(a.tribe) ? a.tribe : undefined)
			break
		case 'inspire':
			if (valid(a.tribe)) {
				const T = tribeOf(a.tribe)
				const inv = invent(T, true)
				if (inv) {
					if (isPlayer(T)) banner(`${inv.icon} ${inv.name}`, `A flash of inspiration from the Stream Deck — ${inv.desc}`, 'invention')
					else ticker(`${name(T.id)} had a flash of inspiration: ${inv.name}`, inv.icon, '#9fd3ff')
				}
			}
			break
		case 'camera':
			if (a.mode === 'follow') followNow()
			else if (a.mode === 'map') overview()
			else if (a.mode === 'tribe' && valid(a.tribe)) lookAt(a.tribe)
			else if (a.mode === 'zoomIn') zoomAt(cam.vw / 2, cam.vh / 2, 1.4)
			else if (a.mode === 'zoomOut') zoomAt(cam.vw / 2, cam.vh / 2, 1 / 1.4)
			break
		case 'hud': {
			const cl = document.body.classList
			if (a.mode === 'toggle') cl.toggle('hidehud')
			else cl.toggle('hidehud', a.mode === 'hide')
			break
		}
		case 'speed':
			if (a.value === 'toggle') G.paused = !G.paused
			else if (a.value === 'pause') G.paused = true
			else if (a.value === 'resume') G.paused = false
			else if (typeof a.value === 'number' && a.value > 0) {
				settings.speed = clamp(a.value, 0.25, 16)
				G.paused = false
			}
			break
		case 'time':
			G.S.dayTime = ((Number(a.t) % 1) + 1) % 1
			break
		case 'setting':
			if (a.key === 'war' && ['on', 'feud', 'off'].includes(a.value)) settings.war = a.value as WarMode
			if (a.key === 'events' && ['full', 'gentle', 'off'].includes(a.value)) settings.events = a.value as EventsMode
			if (a.key === 'disease' && ['on', 'off'].includes(a.value)) settings.disease = a.value as DiseaseMode
			if (a.key === 'aiPace' && ['match', 'steady', 'fast', 'slow', 'frozen'].includes(a.value)) settings.aiPace = a.value as AiPace
			if (a.key === 'dayLength' && ['off', 'short', 'normal', 'long'].includes(a.value)) settings.dayLength = a.value as DayLength
			if (a.key === 'followAction') settings.followAction = a.value === 'true' || a.value === 'on'
			saveSettings()
			break
		case 'player':
			if (valid(a.tribe)) {
				remoteHooks.setPlayer(a.tribe)
				saveSettings()
			}
			break
		case 'message':
			if (a.text) banner(String(a.text).slice(0, 120), String(a.sub || '').slice(0, 200), 'invention')
			break
		case 'resources':
			if (valid(a.tribe)) {
				const T = tribeOf(a.tribe)
				T.stock.wood += clamp(Math.round(a.wood) || 0, 0, 1e5)
				T.stock.stone += clamp(Math.round(a.stone) || 0, 0, 1e5)
				T.stock.food += clamp(Math.round(a.food) || 0, 0, 1e5)
				ticker(`${name(T.id)} received supplies from the Stream Deck`, '📦', TRIBES[T.id].color)
			}
			break
	}
	void from
}

// ---------------------------------------------------------------------
// State snapshot for the module
// ---------------------------------------------------------------------
function tribeSnapshot(T: Tribe) {
	const last = [...T.inventions].reverse().find((id) => INV_BY_ID.get(id))
	const raid = G.S.events.find((e) => e.type === 'raid' && (e.d.att === T.id || e.d.def === T.id))
	return {
		id: T.id,
		year: T.year,
		pop: popOf(T),
		era: eraOf(T),
		eraName: eraName(T),
		inventions: T.inventions.length,
		inventionsTotal: inventionsFor(T).length,
		lastInvention: last ? INV_BY_ID.get(last)!.name : '',
		nextInvention: Math.max(1, inventionPace(T) - (T.year - T.lastInventionYear)),
		wood: Math.round(T.stock.wood),
		stone: Math.round(T.stock.stone),
		food: Math.round(T.stock.food),
		buildings: T.buildings.filter((b) => b.done && b.type !== 'graveyard' && b.type !== 'landmark').length,
		sites: T.buildings.filter((b) => !b.done).length,
		wins: T.wins,
		losses: T.losses,
		prestige: Math.round(T.prestige),
		control: isAI(T) ? 'ai' : settings.tribes[T.id].control,
		wars: G.S.tribes.filter((o) => o !== T && relation(T.id, o.id).war).map((o) => o.id),
		allies: G.S.tribes.filter((o) => o !== T && relation(T.id, o.id).allied).map((o) => o.id),
		event: (() => {
			const e = G.S.events.find((x) => x.tribe === T.id)
			return e && EVENTS[e.type] ? `${EVENTS[e.type].icon} ${EVENTS[e.type].name}` : ''
		})(),
		raid: !raid ? '' : raid.d.att === T.id ? 'attacking' : 'defending',
		soldiersAway: T.villagers.filter((v) => v.away).length,
		deaths: T.deaths,
	}
}

export function snapshot() {
	const S = G.S
	const n = nightAmount()
	const phase = n > 0.55 ? 'night' : twilight() > 0.4 ? (S.dayTime < 0.5 ? 'dawn' : 'dusk') : 'day'
	const leader = [...S.tribes].sort((a, b) => popOf(b) + b.prestige * 2 - (popOf(a) + a.prestige * 2))[0]
	return {
		v: 1,
		player: S.player,
		clock: clockText(),
		phase,
		paused: G.paused,
		speed: settings.speed,
		hud: !document.body.classList.contains('hidehud'),
		camera: cam.follow ? 'follow' : 'free',
		news: lastNews,
		leader: leader.id,
		tribes: S.tribes.map(tribeSnapshot),
		relations: S.relations.map((r) => ({ a: r.a, b: r.b, value: Math.round(r.value), stance: stance(r) })),
		events: S.events.map((e) => ({
			type: e.type,
			name: e.type === 'raid' ? `${name(e.d.att)} vs ${name(e.d.def)}` : EVENTS[e.type]?.name ?? e.type,
			icon: EVENTS[e.type]?.icon ?? '',
			tribe: (e.tribe ?? '') as TribeId | '',
		})),
	}
}

