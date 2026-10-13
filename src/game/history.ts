import { B, SPECIAL_ORDER } from '../data/buildings'
import { INVENTIONS, type Invention } from '../data/inventions'
import { weightedPick } from '../core/util'
import { banner, ticker } from '../ui/notify'
import { maybeEvent } from './events'
import { G, has } from './state'
import { addSheep } from './villagers'

export function availableInventions(): Invention[] {
	return INVENTIONS.filter((i) => !has(i.id) && (i.req || []).every(has))
}

export function invent(silent = false) {
	const S = G.S
	const pool = availableInventions()
	const inv = weightedPick(pool, (i) => {
		// inventions that unlock a building the village is already big enough for come a bit sooner
		const unlocks = SPECIAL_ORDER.some((t) => B[t].inv === i.id)
		return unlocks ? 1.5 : 1
	})
	if (!inv) return
	S.inventions.push(inv.id)
	S.history.push({ year: S.year, icon: inv.icon, text: `Invented ${inv.name}` })
	if (inv.id === 'husbandry') addSheep(6)
	if (inv.id === 'pavedRoads') G.terrainDirty = true
	if (!silent) {
		banner(`${inv.icon} ${inv.name}`, `Invented in year ${S.year} — ${inv.desc}`, 'invention')
		ticker(`Year ${S.year}: villagers invented ${inv.name}`, inv.icon, '#9fd3ff')
	}
	if (pool.length === 1 && !silent) {
		S.history.push({ year: S.year, icon: '🏆', text: 'The Golden Age begins — every invention discovered' })
		banner('🏆 The Golden Age begins', 'Every invention has been discovered')
	}
}

/** One year passes with every button press. Every tenth year brings an invention. */
export function advanceYear(catchingUp: boolean) {
	const S = G.S
	S.year++
	if (S.year % 10 === 0) invent()
	if (!catchingUp) maybeEvent()
}
