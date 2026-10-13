import { settings } from '../core/settings'
import { clamp, dist2, fmt, pick, rand, shuffle } from '../core/util'
import { SIEGE_NAMES, TRIBES, type TribeId } from '../data/tribes'
import { emit } from '../render/particles'
import { banner, ticker } from '../ui/notify'
import { agents, fireAt, removeAgents, spawnAgent, type Agent, type ShotKind } from './agents'
import { countType, damageBuilding, isPlayer, villageBounds } from './buildings'
import { adjust, line } from './diplomacy'
import { startEvent } from './events'
import { eraOf } from './history'
import { G, has, popOf, relation, tribeOf, type ActiveEvent, type Tribe } from './state'
import { killVillager } from './villagers'

const name = (t: TribeId) => TRIBES[t].name

/** Signature inventions make each tribe's fighters stronger */
const SIG: Record<TribeId, string[]> = {
	pixels: ['mosaics', 'photography', 'ledWalls', 'holograms'],
	noises: ['warDrums', 'loudspeakers', 'subwoofers', 'sonicCannon'],
	lampys: ['limelight', 'movingHeads', 'lasers', 'photonLances'],
}
export const power = (T: Tribe) => 1 + Math.floor(SIG[T.id].filter((i) => has(T, i)).length / 2)

/** best siege engine the tribe can field: -1 none, 0 catapult … 4 mech */
export function siegeLevel(T: Tribe) {
	if (has(T, 'antigravity')) return 4
	if (has(T, 'robotics')) return 3
	if (has(T, 'automobile')) return 2
	if (has(T, 'artillery')) return 1
	if (has(T, 'siegecraft')) return 0
	return -1
}

/** Is this pair allowed to fight under the current setting? */
function mayFight(a: TribeId, b: TribeId) {
	if (settings.war === 'off') return false
	if (settings.war === 'feud' && (a === G.S.player || b === G.S.player)) return false
	return true
}

const raids = () => G.S.events.filter((e) => e.type === 'raid')
const inRaid = (id: TribeId) => raids().some((e) => e.d.att === id || e.d.def === id)

export function declareWar(A: Tribe, D: Tribe, reason?: string) {
	const rel = relation(A.id, D.id)
	if (rel.war) return
	rel.war = true
	rel.allied = false
	rel.since = G.S.time
	rel.score = 0
	rel.value = Math.min(rel.value, -55)
	const msg = reason || line('war', A.id, D.id)
	G.S.history.push({ year: A.year, icon: '⚔️', text: msg })
	if (isPlayer(A) || isPlayer(D)) banner(`⚔️ War: ${name(A.id)} vs ${name(D.id)}`, msg, 'disaster')
	else ticker(msg, '⚔️', TRIBES[A.id].color)
	// allies honour their alliance
	for (const C of G.S.tribes) {
		if (C === A || C === D) continue
		if (relation(C.id, D.id).allied && !relation(C.id, A.id).war && mayFight(C.id, A.id) && Math.random() < 0.6) {
			const r2 = relation(C.id, A.id)
			r2.war = true
			r2.since = G.S.time
			ticker(`${name(C.id)} stand by their allies ${name(D.id)} and join the war against ${name(A.id)}!`, '🛡️', TRIBES[C.id].color)
		}
	}
}

export function makePeace(A: Tribe, D: Tribe, why = '') {
	const rel = relation(A.id, D.id)
	if (!rel.war) return
	rel.war = false
	rel.value = Math.max(rel.value, -15)
	// the side that did worse pays tribute
	const winner = rel.score === 0 ? null : (rel.score > 0) === (rel.a === A.id) ? A : D
	const loser = winner === A ? D : winner === D ? A : null
	let tribute = ''
	if (winner && loser) {
		const w = Math.floor(loser.stock.wood * 0.2), s = Math.floor(loser.stock.stone * 0.2), f = Math.floor(loser.stock.food * 0.2)
		loser.stock.wood -= w; loser.stock.stone -= s; loser.stock.food -= f
		winner.stock.wood += w; winner.stock.stone += s; winner.stock.food += f
		winner.prestige += 5
		tribute = ` ${name(loser.id)} pay ${fmt(w + s + f)} goods in tribute.`
	}
	const msg = (why || line('peace', A.id, D.id)) + tribute
	G.S.history.push({ year: A.year, icon: '🕊️', text: msg })
	if (isPlayer(A) || isPlayer(D)) banner(`🕊️ Peace between ${name(A.id)} and ${name(D.id)}`, msg, 'good')
	else ticker(msg, '🕊️', '#a8e88f')
}

/** Called once per tribe-year. Returns true if a raid started. */
export function maybeWar(T: Tribe): boolean {
	if (T.year < 10 || popOf(T) < 6) return false
	for (const O of G.S.tribes) {
		if (O === T || !mayFight(T.id, O.id)) continue
		const rel = relation(T.id, O.id)
		if (rel.war) {
			// war weariness: tempers cool over time
			rel.value = Math.min(100, rel.value + 0.8)
			const long = G.S.time - rel.since > 900
			if (rel.value > -20 || (long && Math.random() < 0.05)) {
				makePeace(T, O)
				continue
			}
			if (!inRaid(T.id) && !inRaid(O.id) && raids().length < 2 && Math.random() < 0.08 + 0.12 * T.personality.aggression) {
				startRaid(T, O)
				return true
			}
		} else if (rel.value < -50 && Math.random() < 0.15 * T.personality.aggression) {
			declareWar(T, O)
			return false
		} else if (rel.value < -30 && !inRaid(T.id) && raids().length < 2 && Math.random() < 0.02 * T.personality.aggression) {
			// border skirmish without a formal war
			startRaid(T, O)
			return true
		}
	}
	return false
}

export function startRaid(A: Tribe, D: Tribe) {
	pendingRaid = { att: A.id, def: D.id }
	startEvent('raid', A.id)
}
let pendingRaid: { att: TribeId; def: TribeId } | null = null

/** Pull villagers out of the village to fight. They come back afterwards (if they survive). */
function muster(T: Tribe, n: number, x: number, y: number, spd: number): Agent[] {
	const pool = shuffle(T.villagers.filter((v) => !v.away && !v.inside && !v.sick && !v.fly && v.role !== 'builder'))
	const out: Agent[] = []
	for (const v of pool.slice(0, n)) {
		v.away = true
		v.plan = []
		v.step = null
		const u = spawnAgent('soldier', T.id, x + rand(-1.2, 1.2), y + rand(-1, 1), spd * (has(T, 'warDrums') ? 1.15 : 1), eraOf(T))
		u.vid = v.id
		u.hp = 3 + (has(T, 'fortification') && T.id === pendingRaid?.def ? 1 : 0)
		out.push(u)
	}
	return out
}

export function raidStart(e: ActiveEvent) {
	if (!pendingRaid) {
		// started by hand: pick a random pair
		const [a, b] = shuffle([...G.S.tribes])
		pendingRaid = { att: a.id, def: b.id }
	}
	const { att, def } = pendingRaid
	pendingRaid = null
	const A = tribeOf(att), D = tribeOf(def)
	e.tribe = att
	const route = G.world.routes.get(`${att}>${def}`) || []
	const last = route[route.length - 1] || [D.cx, D.cy]
	const before = route[route.length - 2] || [A.cx, A.cy]
	// meet just outside the defenders' village, on the side the attackers come from
	const vb = villageBounds(D)
	const dirx = Math.sign(before[0] - last[0]), diry = Math.sign(before[1] - last[1])
	const meet = {
		x: clamp(dirx ? (dirx > 0 ? vb.x1 + 3 : vb.x0 - 3) : D.cx, 4, 256),
		y: clamp(diry ? (diry > 0 ? vb.y1 + 3 : vb.y0 - 3) : D.cy, 9, 166),
	}
	const units: Agent[] = []
	const nA = clamp(2 + Math.floor(popOf(A) / 9) + countType(A, 'barracks') * 2, 2, 16)
	const attackers = muster(A, nA, A.cx, A.cy + 2, rand(8, 8.8))
	const waypoints = route.slice(0, -1)
	for (const u of attackers) u.path = [...waypoints.map(([x, y]) => [x + rand(-1, 1), y + rand(-1, 1)] as [number, number]), [meet.x + dirx * rand(2.5, 4) + rand(-1, 1), meet.y + diry * rand(2.5, 4) + rand(-2, 2)]]
	units.push(...attackers)
	const sl = siegeLevel(A)
	let siege: Agent | null = null
	if (sl >= 0) {
		siege = spawnAgent('siege', att, A.cx, A.cy + 3, sl >= 3 ? 8 : 6, eraOf(A))
		siege.level = sl
		siege.hp = 6
		siege.path = [...waypoints, [meet.x + dirx * 6, meet.y + diry * 6]]
	}
	const nD = clamp(1 + Math.floor(popOf(D) / 10) + countType(D, 'barracks') * 2 + countType(D, 'tower') + countType(D, 'keep') * 2 + (has(D, 'telegraph') ? 2 : 0), 1, 16)
	const defenders = muster(D, nD, D.cx, D.cy + 1, rand(4.5, 5))
	for (const u of defenders) u.path = [[meet.x - dirx * rand(0.5, 2) + rand(-1, 1), meet.y - diry * rand(0.5, 2) + rand(-2, 2)]]
	units.push(...defenders)
	if (has(D, 'holograms'))
		for (let i = 0; i < 4; i++) {
			const h = spawnAgent('decoy', def, meet.x - dirx * rand(0.5, 2), meet.y - diry * rand(0.5, 2) + rand(-2, 2), 0, eraOf(D))
			h.hp = 1
			units.push(h)
		}
	Object.assign(e.d, { att, def, units, siege, meet, phase: 'march', pt: 0, shield: has(D, 'forceFields') && !has(A, 'forceFields'), fallen: 0 })
	const rel = relation(att, def)
	adjust(att, def, -6)
	const msg = rel.war ? `${name(att)} march on ${name(def)}!` : `Border skirmish: ${name(att)} raid ${name(def)}!`
	if (isPlayer(A) || isPlayer(D)) banner(`⚔️ ${msg}`, `${attackers.length} fighters${siege ? ` and a ${SIEGE_NAMES[sl]}` : ''} against ${defenders.length} defenders`, 'disaster')
	ticker(msg, '⚔️', TRIBES[att].color)
}

function weaponOf(t: TribeId): ShotKind {
	return TRIBES[t].weapon
}
const RAINBOW = ['#ff4fd8', '#4fd8ff', '#fff36b', '#7dff6b', '#ff7a3d', '#ffffff']
function shotColor(t: TribeId) {
	if (t === 'noises') return pick(['#a99bff', '#7b6bff', '#c6b8ff'])
	if (t === 'lampys') return pick(RAINBOW)
	return pick(['#ff3d9a', '#3ad1ff', '#7dff6b'])
}

const standing = (units: Agent[], team: TribeId) => units.filter((u) => u.team === team && u.hp > 0 && u.kind !== 'decoy')

function hitUnit(target: Agent, dmg: number) {
	if (target.hp <= 0) return
	target.hp -= dmg
	emit(target.x, target.y - 0.3, 'spark', 4)
	if (target.hp <= 0) {
		target.down = 999
		emit(target.x, target.y - 0.3, 'dust', 6)
	}
}

export function raidUpdate(e: ActiveEvent, dt: number) {
	const d = e.d
	const units: Agent[] = d.units
	const A = tribeOf(d.att), D = tribeOf(d.def)
	d.pt += dt
	if (d.phase === 'march') {
		const attArrived = standing(units, d.att).every((u) => !u.path.length)
		if (attArrived && (d.shield || units.every((u) => !u.path.length) || d.pt > 10)) {
			d.phase = 'battle'
			d.pt = 0
			if (d.shield) news2(`${name(d.att)} hit ${name(d.def)}’s force field and bounced right off!`, '🛡️')
		}
		if (d.pt > 60) e.t = e.dur
		return
	}
	if (d.phase === 'battle') {
		if (d.shield) {
			for (const u of standing(units, d.att)) {
				u.fireT -= dt
				if (u.fireT > 0) continue
				u.fireT = rand(0.6, 1.2)
				const tx = u.x + (d.meet.x - u.x) * 0.8
				fireAt(weaponOf(d.att), u.x, u.y - 0.35, tx, u.y - 0.3, shotColor(d.att), () => emit(tx, u.y - 0.4, 'spark', 3))
			}
			if (d.pt > 6) finish(e, d.def)
			return
		}
		const pA = power(A), pD = power(D)
		for (const u of units) {
			if (u.hp <= 0 || u.path.length || u.kind === 'decoy') continue
			u.fireT -= dt
			if (u.fireT > 0) continue
			u.fireT = rand(0.7, 1.5)
			// decoys soak up fire aimed at the defenders
			const foes = units.filter((o) => o.team !== u.team && o.hp > 0)
			if (!foes.length) break
			const target = pick(foes)
			u.face = target.x > u.x ? 1 : -1
			const dmg = u.team === d.att ? pA : pD
			fireAt(weaponOf(u.team as TribeId), u.x, u.y - 0.35, target.x, target.y - 0.3, shotColor(u.team as TribeId), () => hitUnit(target, dmg))
			if (Math.random() < 0.3) u.path.push([u.x + rand(-0.8, 0.8), u.y + rand(-0.6, 0.6)])
		}
		towersFire(e, dt)
		siegeFire(e, dt)
		const a = standing(units, d.att).length, df = standing(units, d.def).length
		if (!a || !df || d.pt > 18) finish(e, a > df ? d.att : d.def)
		return
	}
	if (d.phase === 'loot') {
		siegeFire(e, dt)
		if (d.pt < 1) return
		const busy = units.some((u) => u.team === d.winner && u.hp > 0 && u.path.length)
		if (!busy || d.pt > 12) {
			loot(e)
			sendHome(e)
			d.phase = 'home'
			d.pt = 0
		}
		return
	}
	if (d.phase === 'home') {
		for (const u of units) if (u.kind === 'soldier' && !u.path.length && !u.dead && u.down <= 0) returnSoldier(u)
		if (units.every((u) => u.dead || (!u.path.length && u.down <= 0)) || d.pt > 40) e.t = e.dur
	}
}

/** Watchtowers, keeps and barracks near the fight shoot at attackers */
function towersFire(e: ActiveEvent, dt: number) {
	const d = e.d
	const D = tribeOf(d.def)
	const foes = standing(d.units, d.att)
	if (!foes.length) return
	const era = eraOf(D)
	const kind: ShotKind = era >= 3 ? 'laser' : era >= 2 ? 'bullet' : 'arrow'
	for (const b of D.buildings) {
		if (!b.done || !(b.type === 'tower' || b.type === 'keep' || b.type === 'barracks')) continue
		if (dist2(b.ox + 1, b.oy, d.meet.x, d.meet.y) > 16 * 16) continue
		b.cool = (b.cool ?? rand(0, 1)) - dt
		if (b.cool > 0) continue
		b.cool = b.type === 'keep' ? 1 : 1.6
		const t = pick(foes)
		fireAt(kind, b.ox + 1, b.oy - (b.type === 'tower' ? 1.2 : 0.3), t.x, t.y - 0.3, era >= 3 ? '#ff3b3b' : '#ffe58a', () => hitUnit(t, 1))
	}
}

/** The siege engine pounds the nearest defending building */
function siegeFire(e: ActiveEvent, dt: number) {
	const d = e.d
	const s: Agent | null = d.siege
	if (!s || s.hp <= 0 || s.path.length) return
	s.fireT -= dt
	if (s.fireT > 0) return
	s.fireT = rand(2, 3)
	const D = tribeOf(d.def)
	let best: (typeof D.buildings)[number] | null = null, bd = 18 * 18
	for (const b of D.buildings) {
		if (!b.done || b.type === 'landmark' || b.type === 'graveyard') continue
		const dd = dist2(b.ox + 1, b.oy + 1, s.x, s.y)
		if (dd < bd) {
			bd = dd
			best = b
		}
	}
	if (!best) return
	const b = best
	const kind: ShotKind = ['boulder', 'shell', 'shell', 'missile', 'plasma'][s.level ?? 0] as ShotKind
	s.face = b.ox + 1 > s.x ? 1 : -1
	fireAt(kind, s.x, s.y - 0.6, b.ox + 1, b.oy + 1, '#ffb347', () => {
		emit(b.ox + 1, b.oy + 1, 'flame', 10)
		emit(b.ox + 1, b.oy + 1, 'debris', 10)
		if (D.buildings.includes(b)) damageBuilding(b, settings.events === 'full' ? 0.3 : 0.15)
	})
}

function news2(msg: string, ic: string) {
	ticker(msg, ic, '#7ff6ff')
}

function finish(e: ActiveEvent, winner: TribeId) {
	const d = e.d
	d.winner = winner
	d.phase = 'loot'
	d.pt = 0
	const A = tribeOf(d.att), D = tribeOf(d.def)
	const W = tribeOf(winner), L = winner === d.att ? D : A
	W.wins++
	L.losses++
	W.prestige += 3
	const rel = relation(d.att, d.def)
	rel.score += (rel.a === winner ? 1 : -1)
	adjust(d.att, d.def, -4)
	const taunts: Record<TribeId, string[]> = {
		pixels: ['{a} blinded {b} with a wall of glitching pixels', '{a} cut to black — {b} never saw it coming', '{a} won in glorious 8K'],
		noises: ['{a}’s subs shook {b} apart', '{a} won with a perfectly timed drop', 'Feedback squeal! {a} rout {b}'],
		lampys: ['{a} dazzled {b} with a full-white strobe', '{a} won with a flawless fade to black', 'A wall of beams — {a} beat {b}'],
	}
	const msg = pick(taunts[winner]).replace('{a}', name(winner)).replace('{b}', name(L.id))
	G.S.history.push({ year: A.year, icon: '🏆', text: msg })
	if (isPlayer(W) || isPlayer(L)) banner(isPlayer(W) ? `🏆 Victory!` : `💔 Defeat`, msg, isPlayer(W) ? 'good' : 'disaster')
	else ticker(msg, '🏆', TRIBES[winner].color)
	if (winner === d.att) {
		const goal = { x: D.cx, y: D.cy + 3 }
		for (const u of standing(d.units, d.att)) u.path.push([goal.x + rand(-3, 3), goal.y + rand(-2, 2)])
	}
}

function loot(e: ActiveEvent) {
	const d = e.d
	const A = tribeOf(d.att), D = tribeOf(d.def)
	if (d.winner === d.att) {
		const full = settings.events === 'full'
		const targets = shuffle(D.buildings.filter((b) => b.done && b.type !== 'graveyard' && b.type !== 'landmark')).slice(0, full ? 1 + Math.floor(Math.random() * 3) : 1)
		for (const b of targets) damageBuilding(b, full ? 0.45 : 0.2)
		const take = (r: 'wood' | 'stone' | 'food') => {
			const n = Math.floor(D.stock[r] * 0.18)
			D.stock[r] -= n
			A.stock[r] += n
			return n
		}
		const total = take('wood') + take('stone') + take('food')
		if (total) ticker(`${name(A.id)} carried off ${fmt(total)} goods from ${name(D.id)}${targets.length ? ` and wrecked ${targets.length} building${targets.length > 1 ? 's' : ''}` : ''}`, '💰', TRIBES[A.id].color)
	} else {
		A.stock.wood = Math.max(0, A.stock.wood - 8)
		D.stock.wood += 8
		D.stock.stone += 8
		if (isPlayer(D)) ticker('The raiders left their gear behind: +8 wood, +8 stone', '💰', '#f2c75c')
	}
}

/** Fallen soldiers either die (full mode, sometimes) or limp home; everyone else walks home */
function sendHome(e: ActiveEvent) {
	const d = e.d
	for (const u of d.units as Agent[]) {
		if (u.kind === 'decoy') {
			u.dead = true
			u.vanish = true
			continue
		}
		const T = tribeOf(u.team as TribeId)
		if (u.hp <= 0 && u.kind === 'soldier') {
			if (settings.events === 'full' && Math.random() < 0.45) {
				const v = T.villagers.find((x) => x.id === u.vid)
				if (v) killVillager(v, 'fell in battle', true)
				d.fallen++
				u.dead = true
				u.vanish = true
				emit(u.x, u.y - 0.3, 'ghost', 1)
				continue
			}
			u.down = 1.5
			u.hp = 1
		}
		u.spd = u.team === d.winner ? 5 : 3.5
		const route = G.world.routes.get(`${T.id}>${T.id === d.att ? d.def : d.att}`) || []
		const back = [...route].reverse().slice(1)
		u.path = T.id === d.def ? [[T.cx + rand(-1, 1), T.cy + rand(1, 2)]] : [...back.map(([x, y]) => [x, y] as [number, number]), [T.cx + rand(-1, 1), T.cy + rand(1, 2)]]
	}
	if (d.siege) {
		const s: Agent = d.siege
		s.vanish = true
		s.path = [[tribeOf(d.att).cx, tribeOf(d.att).cy + 3]]
	}
	if (d.fallen) ticker(`${d.fallen} fighter${d.fallen > 1 ? 's' : ''} did not come home`, '✝', '#b9b2a6')
}

function returnSoldier(u: Agent) {
	u.dead = true
	u.vanish = true
	const T = tribeOf(u.team as TribeId)
	const v = T.villagers.find((x) => x.id === u.vid)
	if (v) {
		v.away = false
		v.x = u.x
		v.y = u.y
		v.plan = []
		v.step = null
	}
}

export function raidEnd(e: ActiveEvent) {
	const units: Agent[] = e.d.units || []
	for (const u of units) if (u.kind === 'soldier' && !u.dead) returnSoldier(u)
	const ids = new Set(units.map((u) => u.id))
	if (e.d.siege) ids.add(e.d.siege.id)
	removeAgents((a) => ids.has(a.id))
	// safety: nobody stays "away" forever
	for (const T of G.S.tribes) for (const v of T.villagers) if (v.away && !agents.some((a) => a.vid === v.id)) v.away = false
}

export function raidFocus(e: ActiveEvent) {
	const d = e.d
	const units: Agent[] = d.units || []
	if (d.phase === 'home') return null
	if (d.phase === 'battle' || d.phase === 'loot') return { x: d.meet.x, y: d.meet.y - 0.5, s: 40 }
	const live = units.filter((u) => u.team === d.att && u.kind === 'soldier')
	if (!live.length) return null
	let x = 0, y = 0
	for (const u of live) {
		x += u.x
		y += u.y
	}
	return { x: x / live.length, y: y / live.length - 0.5, s: 30 }
}

export function warSummary(T: Tribe) {
	return G.S.tribes.filter((o) => o !== T && relation(T.id, o.id).war).map((o) => o.id)
}

