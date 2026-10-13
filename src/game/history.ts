import { weightedPick } from '../core/util'
import { B, SPECIAL_ORDER } from '../data/buildings'
import { ERAS, INVENTIONS, INV_BY_ID, type Invention } from '../data/inventions'
import { TRIBES } from '../data/tribes'
import { banner, ticker } from '../ui/notify'
import { isPlayer, news } from './buildings'
import { yearlyDiplomacy } from './diplomacy'
import { maybeEvent } from './events'
import { G, has, type Tribe } from './state'
import { inventionPace } from './tribes'
import { addSheep } from './villagers'
import { maybeWar } from './war'

const countInEra = (T: Tribe, era: number) => T.inventions.filter((id) => INV_BY_ID.get(id)?.era === era && !INV_BY_ID.get(id)?.tribe).length

/** Can inventions of this era appear yet? */
export function eraOpen(T: Tribe, era: number): boolean {
	if (era === 0) return true
	return eraOpen(T, era - 1) && countInEra(T, era - 1) >= ERAS[era].gate
}

/** The latest era the tribe has reached */
export function eraOf(T: Tribe): number {
	let e = 0
	for (const id of T.inventions) {
		const inv = INV_BY_ID.get(id)
		if (inv && inv.era > e) e = inv.era
	}
	return e
}

const totalFor = (T: Tribe) => INVENTIONS.filter((i) => !i.tribe || i.tribe === T.id).length

export function eraName(T: Tribe): string {
	if (T.inventions.length >= totalFor(T)) return 'Golden Age'
	return ERAS[eraOf(T)].name
}

export const inventionsFor = (T: Tribe) => INVENTIONS.filter((i) => !i.tribe || i.tribe === T.id)

export function availableInventions(T: Tribe): Invention[] {
	return inventionsFor(T).filter((i) => !has(T, i.id) && eraOpen(T, i.era) && (i.req || []).every((r) => has(T, r)))
}

/** Learn a specific invention (from a friend, a spy, a time traveller…) */
export function learn(T: Tribe, inv: Invention, how: string) {
	if (has(T, inv.id)) return
	const before = eraOf(T)
	T.inventions.push(inv.id)
	G.S.history.push({ year: T.year, icon: inv.icon, text: `${TRIBES[T.id].name} ${how} ${inv.name}`, tribe: T.id })
	if (inv.id === 'husbandry') addSheep(T, 6)
	if (eraOf(T) > before) {
		const e = ERAS[eraOf(T)]
		G.S.history.push({ year: T.year, icon: '⏳', text: `${TRIBES[T.id].name} enter the ${e.name}`, tribe: T.id })
		if (isPlayer(T)) banner(`⏳ The ${e.name} begins`, e.banner, 'invention')
		else news(T, `entered the ${e.name}`, '⏳', '#9fd3ff')
	}
}

export function invent(T: Tribe, silent = false) {
	const pool = availableInventions(T)
	const era = eraOf(T)
	const inv = weightedPick(pool, (i) => {
		let w = SPECIAL_ORDER.some((t) => B[t].inv === i.id) ? 1.5 : 1
		if (i.era > era) w *= 2.5
		else if (i.era === era && era > 0) w *= 2
		if (i.tribe) w *= 2.5
		return w
	})
	if (!inv) return null
	T.lastInventionYear = T.year
	learn(T, inv, 'invented')
	if (silent) return inv
	if (isPlayer(T)) {
		banner(`${inv.icon} ${inv.name}`, `Invented in year ${T.year} — ${inv.desc}`, 'invention')
		ticker(`Year ${T.year}: villagers invented ${inv.name}`, inv.icon, '#9fd3ff')
	} else news(T, `invented ${inv.name}`, inv.icon)
	if (pool.length === 1 && isPlayer(T)) banner('🏆 The Golden Age', 'Every invention has been discovered')
	return inv
}

/** One year passes for a tribe with every press. Inventions, events, diplomacy and war follow the calendar. */
export function advanceYear(T: Tribe, catchingUp: boolean) {
	T.year++
	if (T.year - T.lastInventionYear >= inventionPace(T)) invent(T)
	if (catchingUp) return
	yearlyDiplomacy(T)
	if (!maybeWar(T)) maybeEvent(T)
}
