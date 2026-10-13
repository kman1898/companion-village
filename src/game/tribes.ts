import { anyCompanion, settings } from '../core/settings'
import { clamp, rand } from '../core/util'
import { TRIBE_IDS, type TribeId } from '../data/tribes'
import { makeBuilding, useCell } from './buildings'
import { G, type Tribe } from './state'

export function createTribe(id: TribeId): Tribe {
	const site = G.world.sites[id]
	return {
		id, cx: site.x, cy: site.y, year: 0, stock: { wood: 10, stone: 5, food: 0 }, villagers: [], buildings: [], sheep: [], inventions: [],
		lastInventionYear: 0, invPace: 1, firsts: {}, used: new Map(), queue: 0, arrivals: 0, deaths: 0, extraPop: 0, boost: 0,
		lastCounter: null, aiRate: rand(0.6, 1.4), aiAcc: Math.random(),
		personality: { aggression: rand(0.1, 0.9), trade: rand(0.2, 1), curiosity: rand(0.75, 1.3) },
		wins: 0, losses: 0, prestige: 0, lastEventYear: 0,
	}
}

/** Each tribe's landmark stands on the plot right next to its town square */
export function placeLandmark(T: Tribe) {
	if (T.buildings.some((b) => b.type === 'landmark')) return
	const cell = G.world.cells[T.id].find((c) => !c.park && !T.used.has(c.key) && Math.abs(c.i) <= 1 && c.j === -1) || G.world.cells[T.id].find((c) => !c.park && !T.used.has(c.key))
	if (!cell) return
	const b = makeBuilding(T, 'landmark', cell)
	b.done = true
	b.progress = 1
	useCell(T, cell, b.id)
	T.buildings.push(b)
}

export const isAI = (T: Tribe) => settings.tribes[T.id].control === 'ai' || !anyCompanion()

/** Years between inventions: the setting for Companion-driven tribes, a personal pace for AI tribes */
export function inventionPace(T: Tribe) {
	return isAI(T) ? Math.max(3, Math.round(settings.inventionYears / T.personality.curiosity)) : settings.inventionYears
}

const PACE_SECONDS: Record<string, number> = { steady: 14, fast: 6, slow: 28 }

/** Drive AI tribes forward on their own clock (steady/fast/slow, or "match" when nobody is on Companion) */
export function updateAI(dt: number) {
	if (settings.aiPace === 'frozen') return
	const matching = settings.aiPace === 'match' && anyCompanion()
	if (matching) return
	const base = PACE_SECONDS[settings.aiPace] ?? 14
	for (const T of G.S.tribes) {
		if (!isAI(T)) continue
		T.aiAcc += dt / (base / T.aiRate)
		while (T.aiAcc >= 1) {
			T.aiAcc -= 1
			T.queue++
			wobble(T)
		}
	}
}

/** "match": every press on a Companion-driven tribe nudges the AI tribes forward at their own tempo */
export function companionPressed(n: number) {
	if (settings.aiPace !== 'match') return
	for (const T of G.S.tribes) {
		if (!isAI(T)) continue
		T.aiAcc += (n * T.aiRate) / Math.max(1, TRIBE_IDS.filter((id) => settings.tribes[id].control === 'companion').length)
		while (T.aiAcc >= 1) {
			T.aiAcc -= 1
			T.queue++
			wobble(T)
		}
	}
}

/** AI tempo drifts over time, with the occasional burst or lull */
function wobble(T: Tribe) {
	T.aiRate = clamp(T.aiRate * rand(0.94, 1.07), 0.45, 1.6)
	if (Math.random() < 0.01) T.aiRate = clamp(T.aiRate * rand(0.6, 1.6), 0.45, 1.6)
}
