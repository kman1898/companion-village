import { settings } from '../core/settings'
import { weightedPick } from '../core/util'
import { B, SPECIAL_ORDER } from '../data/buildings'
import { ERAS, INVENTIONS, type Invention } from '../data/inventions'
import { banner, ticker } from '../ui/notify'
import { maybeEvent } from './events'
import { maybeRaid } from './rivals'
import { G, has } from './state'
import { addSheep } from './villagers'

const countInEra = (era: number) => G.S.inventions.filter((id) => INVENTIONS.find((i) => i.id === id)?.era === era).length

/** Can inventions of this era appear yet? */
export function eraOpen(era: number): boolean {
	if (era === 0) return true
	return eraOpen(era - 1) && countInEra(era - 1) >= ERAS[era].gate
}

/** The latest era the village has reached (has at least one invention of) */
export function currentEra(): number {
	let e = 0
	for (const id of G.S.inventions) {
		const inv = INVENTIONS.find((i) => i.id === id)
		if (inv && inv.era > e) e = inv.era
	}
	return e
}

export function eraName(): string {
	if (G.S.inventions.length >= INVENTIONS.length) return 'Golden Age'
	return ERAS[currentEra()].name
}

export function availableInventions(): Invention[] {
	return INVENTIONS.filter((i) => !has(i.id) && eraOpen(i.era) && (i.req || []).every(has))
}

export function invent(silent = false) {
	const S = G.S
	const pool = availableInventions()
	const era = currentEra()
	const inv = weightedPick(pool, (i) => {
		let w = SPECIAL_ORDER.some((t) => B[t].inv === i.id) ? 1.5 : 1
		// lean towards the newest era so the village keeps moving forward
		if (i.era > era) w *= 2.5
		else if (i.era === era && era > 0) w *= 2
		return w
	})
	if (!inv) return
	const newEra = inv.era > era
	S.inventions.push(inv.id)
	S.lastInventionYear = S.year
	S.history.push({ year: S.year, icon: inv.icon, text: `Invented ${inv.name}` })
	if (inv.id === 'husbandry') addSheep(6)
	if (['pavedRoads', 'asphalt', 'hovercars', 'railway', 'gasLighting', 'electricity'].includes(inv.id)) G.terrainDirty = true
	if (silent) return
	if (newEra) {
		const e = ERAS[inv.era]
		S.history.push({ year: S.year, icon: '⏳', text: `The ${e.name} begins` })
		banner(`⏳ The ${e.name} begins`, e.banner, 'invention')
	}
	banner(`${inv.icon} ${inv.name}`, `Invented in year ${S.year} — ${inv.desc}`, 'invention')
	ticker(`Year ${S.year}: villagers invented ${inv.name}`, inv.icon, '#9fd3ff')
	if (pool.length === 1) {
		S.history.push({ year: S.year, icon: '🏆', text: 'Every invention discovered — the Golden Age' })
		banner('🏆 The Golden Age', 'Every invention has been discovered')
	}
}

/** One year passes with every button press. Every few years brings an invention. */
export function advanceYear(catchingUp: boolean) {
	const S = G.S
	S.year++
	if (S.year - S.lastInventionYear >= settings.inventionYears) invent()
	if (catchingUp) return
	if (!maybeRaid()) maybeEvent()
}
