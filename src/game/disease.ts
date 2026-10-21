import { settings } from '../core/settings'
import { clamp, dist2, pick, rand } from '../core/util'
import { B } from '../data/buildings'
import { TRIBES, type TribeId } from '../data/tribes'
import { emit } from '../render/particles'
import { ticker } from '../ui/notify'
import { countType, isPlayer, news } from './buildings'
import { eraOf } from './history'
import { G, has, popOf, type Tribe, type Villager } from './state'
import { killVillager } from './villagers'

/**
 * Everyday illness, alongside the big Plague event: one outbreak at a time per tribe, passed between villagers
 * who are close to each other. Crowded towns, towns without clean water and early eras get sick most;
 * medicine makes it rarer, shorter and less deadly. Survivors are immune for a while.
 */
interface Disease {
	name: string
	icon: string
	/** eras it turns up in */
	eras: [number, number]
	/** caught from dirty water: wells and fountains keep it away */
	water?: boolean
	/** chance per second that a sick villager passes it to someone nearby */
	spread: number
	/** seconds a villager stays sick */
	sick: [number, number]
	/** chance it kills, before medicine */
	lethal: number
	/** bacterial: antibiotics cure it */
	bacterial?: boolean
	/** androids catch it too */
	androids?: boolean
}

const DISEASES: Record<string, Disease> = {
	fever: { name: 'Fever', icon: '🤒', eras: [0, 1], spread: 0.065, sick: [18, 30], lethal: 0.1, bacterial: true },
	dysentery: { name: 'Dysentery', icon: '🤢', eras: [0, 1], water: true, spread: 0.05, sick: [14, 24], lethal: 0.08, bacterial: true },
	pox: { name: 'Pox', icon: '🔴', eras: [0, 1], spread: 0.055, sick: [24, 36], lethal: 0.15 },
	cholera: { name: 'Cholera', icon: '💧', eras: [1, 1], water: true, spread: 0.06, sick: [12, 20], lethal: 0.14, bacterial: true },
	influenza: { name: 'Influenza', icon: '🤧', eras: [1, 3], spread: 0.13, sick: [12, 22], lethal: 0.04 },
	spaceFlu: { name: 'Space Flu', icon: '🪐', eras: [3, 4], spread: 0.12, sick: [10, 18], lethal: 0.02 },
	nanovirus: { name: 'Nanovirus', icon: '🦠', eras: [4, 4], spread: 0.13, sick: [10, 16], lethal: 0.015, androids: true },
}

/** How often an outbreak starts in each era (per second, before crowding and water) */
const ERA_RISK = [1 / 300, 1 / 340, 1 / 500, 1 / 650, 1 / 800]
/** How long survivors are immune */
const IMMUNE_SECONDS = 300
const RANGE = 2.5

interface Outbreak {
	kind: string
	cases: number
	dead: number
}
const outbreaks = new Map<TribeId, Outbreak>()

export function resetDisease() {
	outbreaks.clear()
}

export const outbreakOf = (id: TribeId) => {
	const o = outbreaks.get(id)
	return o ? { ...o, ...DISEASES[o.kind], sickNow: tribeSick(id) } : null
}

const tribeSick = (id: TribeId) => G.S.tribes.find((t) => t.id === id)!.villagers.filter((v) => v.ill).length
const enabled = () => settings.disease !== 'off' && settings.events !== 'off'
const deadly = () => settings.events === 'full'

/** People per home, against a typical town (builders keep about 40% spare room): crowded towns spread disease */
function crowding(T: Tribe) {
	let housing = 0
	for (const b of T.buildings) if (b.done) housing += B[b.type].cap || 0
	return clamp(popOf(T) / Math.max(4, housing) / 0.6, 0.5, 1.6)
}

/** 0 (no clean water) … 1 (enough wells and fountains for everyone); piped water from the Modern Age on */
function cleanWater(T: Tribe) {
	if (eraOf(T) >= 2) return 1
	const served = countType(T, 'well') * 35 + countType(T, 'fountain') * 80
	return clamp(served / Math.max(1, popOf(T)), 0, 1)
}

function contagion(T: Tribe, d: Disease, kind: string) {
	let m = 1
	if (has(T, 'vaccination')) m *= kind === 'pox' ? 0.15 : 0.6
	if (has(T, 'nanomedicine')) m *= 0.5
	if (d.water) m *= 1.4 - cleanWater(T)
	return m
}

function lethality(T: Tribe, d: Disease, kind: string) {
	if (!deadly()) return 0
	let m = d.lethal
	if (has(T, 'medicine')) m *= 0.6
	if (has(T, 'vaccination')) m *= kind === 'pox' ? 0.2 : 0.7
	if (has(T, 'antibiotics') && d.bacterial) m *= 0.25
	if (has(T, 'nanomedicine')) m *= 0.2
	return m
}

function canCatch(v: Villager, d: Disease) {
	return !v.ill && !v.sick && !v.away && !v.abducted && (!v.immune || v.immune < G.S.time) && (!v.android || !!d.androids)
}

function infect(T: Tribe, v: Villager, kind: string) {
	const d = DISEASES[kind]
	const o = outbreaks.get(T.id)!
	const days = rand(d.sick[0], d.sick[1]) * (has(T, 'antibiotics') && d.bacterial ? 0.7 : 1)
	v.ill = kind
	v.sick = 2
	v.illUntil = G.S.time + days
	v.illDie = Math.random() < lethality(T, d, kind) ? G.S.time + days * rand(0.3, 0.9) : undefined
	o.cases++
}

function startOutbreak(T: Tribe) {
	const era = eraOf(T)
	const water = cleanWater(T)
	const kinds = Object.keys(DISEASES).filter((k) => {
		const d = DISEASES[k]
		return era >= d.eras[0] && era <= d.eras[1] && !(d.water && water >= 1)
	})
	if (!kinds.length) return
	// water-borne illness is likelier the less clean water there is
	const kind = pick(kinds.flatMap((k) => (DISEASES[k].water ? Array(1 + Math.round((1 - water) * 2)).fill(k) : [k])))
	const pool = T.villagers.filter((v) => canCatch(v, DISEASES[kind]))
	if (!pool.length) return
	outbreaks.set(T.id, { kind, cases: 0, dead: 0 })
	const first = pick(pool)
	infect(T, first, kind)
	if (popOf(T) > 60) {
		const near = pool.find((v) => v !== first && dist2(v.x, v.y, first.x, first.y) < RANGE * RANGE)
		if (near) infect(T, near, kind)
	}
	const d = DISEASES[kind]
	if (isPlayer(T)) ticker(`${d.name} is going round the village`, d.icon, '#c8d98a')
}

function endOutbreak(T: Tribe, o: Outbreak) {
	outbreaks.delete(T.id)
	const d = DISEASES[o.kind]
	const who = `${o.cases} fell ill`
	const msg = o.dead ? `${d.name} has passed: ${who}, ${o.dead} died` : `${d.name} has passed: ${who}, everyone recovered`
	news(T, msg.charAt(0).toLowerCase() + msg.slice(1), d.icon, '#c8d98a')
	if (o.dead) G.S.history.push({ year: T.year, icon: d.icon, text: `${d.name} took ${o.dead} ${TRIBES[T.id].name}`, tribe: T.id })
}

/** st = simulated seconds since the last call (called from the slow tick, twice a second) */
export function updateDisease(st: number) {
	const S = G.S
	for (const T of S.tribes) {
		const o = outbreaks.get(T.id)
		if (!o) {
			if (enabled() && popOf(T) >= 8 && Math.random() < st * ERA_RISK[Math.min(4, eraOf(T))] * crowding(T)) startOutbreak(T)
			continue
		}
		const d = DISEASES[o.kind]
		const sick = T.villagers.filter((v) => v.ill)
		const spread = d.spread * contagion(T, d, o.kind) * crowding(T)
		for (const v of sick) {
			if (v.illDie !== undefined && S.time >= v.illDie && !v.away) {
				o.dead++
				killVillager(v, `died of ${d.name.toLowerCase()}`, true)
				continue
			}
			if (S.time >= (v.illUntil ?? 0)) {
				recover(v)
				continue
			}
			if (enabled() && Math.random() < st * spread) {
				const near = T.villagers.filter((u) => canCatch(u, d) && dist2(u.x, u.y, v.x, v.y) < RANGE * RANGE)
				if (near.length) infect(T, pick(near), o.kind)
			}
			if (Math.random() < st * 0.25) emit(v.x, v.y - 0.6, 'miasma', 1)
		}
		if (!T.villagers.some((v) => v.ill)) endOutbreak(T, o)
	}
}

function recover(v: Villager) {
	v.ill = v.illUntil = v.illDie = undefined
	// the Plague event marks its own sick with 1: leave those to it
	if (v.sick === 2) v.sick = undefined
	v.immune = G.S.time + IMMUNE_SECONDS
}
