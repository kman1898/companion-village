import { clamp, fmt, pick, rand } from '../core/util'
import { RES, type Res } from '../data/buildings'
import { LINES, TRIBES, TRIBE_IDS, type TribeId } from '../data/tribes'
import { emit, floatText } from '../render/particles'
import { banner, ticker } from '../ui/notify'
import { agents, spawnAgent, type Agent } from './agents'
import { isPlayer } from './buildings'
import { startEvent } from './events'
import { availableInventions, eraOf, learn } from './history'
import { G, has, relation, tribeOf, type Relation, type Tribe } from './state'
import { battlePace, canOpenFront, declareWar, makePeace, mayFight, startRaid } from './war'

const name = (t: TribeId) => TRIBES[t].name

export function line(kind: keyof typeof LINES, a: TribeId, b: TribeId, t = '') {
	return pick(LINES[kind]).replace(/\{a\}/g, name(a)).replace(/\{b\}/g, name(b)).replace(/\{t\}/g, t)
}

export function initRelations() {
	const rel: Relation[] = []
	for (let i = 0; i < 3; i++)
		for (let j = i + 1; j < 3; j++)
			rel.push({ a: TRIBE_IDS[i], b: TRIBE_IDS[j], value: Math.round(rand(-10, 25)), war: false, allied: false, since: 0, score: 0, trades: 0 })
	return rel
}

export type Stance = 'war' | 'hostile' | 'tense' | 'neutral' | 'friendly' | 'allied'
export function stance(r: Relation): Stance {
	if (r.war) return 'war'
	if (r.allied) return 'allied'
	if (r.value < -40) return 'hostile'
	if (r.value < -10) return 'tense'
	if (r.value > 25) return 'friendly'
	return 'neutral'
}
export const STANCE_ICON: Record<Stance, string> = { war: '⚔️', hostile: '😠', tense: '😒', neutral: '😐', friendly: '🙂', allied: '🤝' }

export function adjust(a: TribeId, b: TribeId, delta: number) {
	const r = relation(a, b)
	r.value = clamp(r.value + delta, -100, 100)
	if (r.allied && r.value < 30) {
		r.allied = false
		ticker(`The alliance between ${name(a)} and ${name(b)} has ended`, '💔', '#c9b6a0')
	}
}

/** Called once per tribe-year: incidents, alliances, trade, gifts, knowledge and espionage */
export function yearlyDiplomacy(T: Tribe) {
	for (const O of G.S.tribes) {
		if (O === T) continue
		const r = relation(T.id, O.id)
		// personalities pull relations up or down a little every year
		let drift = (0.45 - T.personality.aggression) * 0.8
		if (has(T, 'diplomats')) drift += 0.6
		if (has(T, 'television') || has(T, 'movingHeads')) drift += 0.4
		// the Battles setting: tempers fray faster (or cool) between tribes that may fight
		if (mayFight(T.id, O.id)) drift += battlePace().temper
		adjust(T.id, O.id, drift)
		if (Math.random() < 0.05) {
			const good = Math.random() > T.personality.aggression * 0.9
			const msg = line(good ? 'incidentGood' : 'incidentBad', good ? T.id : O.id, good ? O.id : T.id)
			adjust(T.id, O.id, good ? rand(5, 11) : -rand(6, 14))
			if (isPlayer(T) || isPlayer(O) || Math.random() < 0.5) ticker(msg, good ? '🤝' : '💢', good ? '#a8e88f' : '#ff9a85')
		}
		if (!r.war && !r.allied && r.value > 55 && Math.random() < 0.3) {
			r.allied = true
			const msg = line('alliance', T.id, O.id)
			G.S.history.push({ year: T.year, icon: '🤝', text: msg })
			if (isPlayer(T) || isPlayer(O)) banner(`🤝 Alliance`, msg, 'good')
			else ticker(msg, '🤝', '#a8e88f')
		}
		if (r.war) continue
		const tradeRate = 0.06 * T.personality.trade * (has(T, 'tradeRoutes') ? 2 : 1)
		if (r.value > -25 && Math.random() < tradeRate && !caravanBetween(T.id, O.id)) sendCaravan(T, O)
		if (r.value > -40 && r.value < 30 && T.personality.trade > 0.6 && Math.random() < 0.015) sendGift(T, O)
		if (r.allied && Math.random() < 0.08) shareTech(T, O)
		if (r.value < -10 && Math.random() < 0.025 * T.personality.aggression) spy(T, O)
	}
}

/** The resource a tribe has most of, and the one it needs most */
function surplus(T: Tribe): Res {
	return RES.reduce((a, b) => (T.stock[a] >= T.stock[b] ? a : b))
}
function deficit(T: Tribe): Res {
	return RES.reduce((a, b) => (T.stock[a] <= T.stock[b] ? a : b))
}

interface Caravan { agent: Agent; from: TribeId; to: TribeId; give: Res; giveN: number; get: Res; arrived: boolean }
const caravans: Caravan[] = []
const caravanBetween = (a: TribeId, b: TribeId) => caravans.some((c) => (c.from === a && c.to === b) || (c.from === b && c.to === a))

export function sendCaravan(T: Tribe, O: Tribe) {
	const give = surplus(T), get = deficit(T)
	const giveN = Math.min(Math.floor(T.stock[give] * 0.25), has(T, 'tradeRoutes') ? 60 : 30)
	if (giveN < 5 || give === get) return false
	T.stock[give] -= giveN
	const route = G.world.routes.get(`${T.id}>${O.id}`) || [[O.cx, O.cy]]
	const a = spawnAgent('caravan', T.id, T.cx + 1, T.cy + 2, 3.2, eraOf(T))
	a.path = [...route.map(([x, y]) => [x, y] as [number, number]), [O.cx + 1.5, O.cy + 2.2]]
	caravans.push({ agent: a, from: T.id, to: O.id, give, giveN, get, arrived: false })
	if (isPlayer(T)) ticker(`A caravan with ${giveN} ${give} sets off for ${name(O.id)}`, '🐫', TRIBES[O.id].color)
	return true
}

function sendGift(T: Tribe, O: Tribe) {
	const r = surplus(T)
	const n = Math.floor(T.stock[r] * 0.1)
	if (n < 5) return
	T.stock[r] -= n
	O.stock[r] += n
	adjust(T.id, O.id, 10)
	const msg = `${line('gift', T.id, O.id)} (${n} ${r})`
	if (isPlayer(T) || isPlayer(O)) ticker(msg, '🎁', '#a8e88f')
}

function shareTech(T: Tribe, O: Tribe) {
	const can = availableInventions(O).filter((i) => !i.tribe && has(T, i.id))
	if (!can.length) return
	const inv = pick(can)
	learn(O, inv, 'learned')
	const msg = line('tech', T.id, O.id, inv.name)
	if (isPlayer(T) || isPlayer(O)) banner(`${inv.icon} ${inv.name}`, msg, 'invention')
	else ticker(msg, '📚', '#9fd3ff')
}

function spy(T: Tribe, O: Tribe) {
	const can = availableInventions(T).filter((i) => !i.tribe && has(O, i.id))
	if (!can.length) return
	const inv = pick(can)
	learn(T, inv, 'stole')
	adjust(T.id, O.id, -12)
	const msg = line('spy', T.id, O.id, inv.name)
	ticker(msg, '🕵️', '#ff9a85')
}

export function updateDiplomacy() {
	for (let i = caravans.length - 1; i >= 0; i--) {
		const c = caravans[i]
		if (!agents.includes(c.agent)) {
			caravans.splice(i, 1)
			continue
		}
		if (!c.arrived && !c.agent.path.length) {
			c.arrived = true
			const T = tribeOf(c.from), O = tribeOf(c.to)
			// payment in the receiver's own surplus
			const pay = O.stock[c.get] > 10 ? c.get : surplus(O)
			const payN = Math.min(Math.floor(c.giveN * 0.9), Math.floor(O.stock[pay] * 0.3))
			O.stock[c.give] += c.giveN
			O.stock[pay] -= payN
			T.stock[pay] += payN
			const r = relation(T.id, O.id)
			r.trades++
			adjust(T.id, O.id, 6)
			emit(c.agent.x, c.agent.y - 0.5, 'spark', 10)
			floatText(c.agent.x, c.agent.y - 1, '🤝')
			if (isPlayer(T) || isPlayer(O)) ticker(`${name(T.id)} traded ${c.giveN} ${c.give} for ${fmt(payN)} ${pay} with ${name(O.id)}`, '🐫', '#f2c75c')
			const back = [...(G.world.routes.get(`${O.id}>${T.id}`) || [])]
			c.agent.path = [...back.map(([x, y]) => [x, y] as [number, number]), [T.cx + 1, T.cy + 2]]
			c.agent.vanish = true
		}
	}
}

export function resetDiplomacy() {
	caravans.length = 0
}

// ---------------------------------------------------------------------
// Commands from Companion: attack:noises · gift:lampys · trade:pixels · peace:noises · ally:lampys · festival
// ---------------------------------------------------------------------
export function command(T: Tribe, raw: string): string {
	const [verb, arg] = raw.trim().toLowerCase().split(/[:\s]+/)
	const target = TRIBE_IDS.find((id) => id === arg || TRIBES[id].name.toLowerCase() === arg || TRIBES[id].dept.toLowerCase() === arg)
	const O = target && target !== T.id ? tribeOf(target) : null
	switch (verb) {
		case 'attack':
		case 'raid':
		case 'war':
			if (!O) return 'no target'
			if (!relation(T.id, O.id).war) declareWar(T, O, `${name(T.id)} declare war on ${name(O.id)} — orders from the Stream Deck!`)
			if (canOpenFront(T, O)) startRaid(T, O)
			return 'attacking'
		case 'peace':
			if (!O) return 'no target'
			makePeace(T, O, `${name(T.id)} offer peace to ${name(O.id)}`)
			adjust(T.id, O.id, 25)
			return 'peace'
		case 'gift':
			if (!O) return 'no target'
			sendGift(T, O)
			adjust(T.id, O.id, 8)
			return 'gift sent'
		case 'trade':
			if (!O) return 'no target'
			return sendCaravan(T, O) ? 'caravan sent' : 'nothing to trade'
		case 'ally':
			if (!O) return 'no target'
			adjust(T.id, O.id, 30)
			return 'friendship offered'
		case 'festival':
		case 'party':
			startEvent('festival', T.id)
			return 'festival!'
		default:
			return 'unknown command'
	}
}
