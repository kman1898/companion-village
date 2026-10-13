import { settings } from '../core/settings'
import { clamp, pick, rand } from '../core/util'
import { B } from '../data/buildings'
import { emit } from '../render/particles'
import { ticker } from '../ui/notify'
import { agents, fire, removeAgents, spawnAgent, type Agent, type Team } from './agents'
import { countType, damageBuilding, villageBounds } from './buildings'
import { startEvent } from './events'
import { CX, CY, G, H, has, popCount, type ActiveEvent, type Rival, type RivalId } from './state'

export const RIVAL_INFO: Record<RivalId, { name: string; icon: string; color: string; accent: string }> = {
	sound: { name: 'Soundhaven', icon: '🔊', color: '#6f5bd6', accent: '#a99bff' },
	lights: { name: 'Lumenfort', icon: '💡', color: '#e0a030', accent: '#ffe07a' },
}

const BEAM_COLS = ['#ff4fd8', '#4fd8ff', '#fff36b', '#7dff6b', '#ff7a3d', '#ffffff']
export const beamColor = () => pick(BEAM_COLS)
const BUTTON_COLS = ['#e84d4d', '#4dd16b', '#4d8fe8', '#f2c75c', '#c64de8', '#ffffff']

export function initRivals() {
	const S = G.S, w = G.world
	if (S.rivals.length) return
	S.rivals = (['sound', 'lights'] as RivalId[]).map((id) => ({
		id, name: RIVAL_INFO[id].name, x: w.rivalSites[id].x, y: w.rivalSites[id].y, buildings: [], wins: 0, losses: 0,
	}))
	for (const r of S.rivals) growRival(r, true)
}

/** Building slots on a jittered spiral around the centre (tower first) */
function slot(r: Rival, k: number): [number, number] {
	if (k === 0) return [r.x, r.y]
	const a = k * 2.39996 + (r.id === 'sound' ? 0.4 : 1.7)
	const d = 1.9 + 1.2 * Math.sqrt(k)
	return [r.x + Math.cos(a) * d * 1.15, r.y + Math.sin(a) * d * 0.85]
}

export const rivalTarget = () => clamp(3 + Math.floor(G.S.year / 4), 3, 32)

function growRival(r: Rival, instant = false) {
	const target = rivalTarget()
	while (r.buildings.length < target) {
		const k = r.buildings.length
		const [x, y] = slot(r, k)
		r.buildings.push({ x, y, v: Math.floor(Math.random() * 6), hp: 1, tower: k === 0 })
		if (!instant) {
			emit(x, y - 0.5, 'spark', 8)
			return
		}
	}
}

export function getRival(id: RivalId) {
	return G.S.rivals.find((r) => r.id === id)!
}

/** Slow upkeep: rivals grow with the years, repair damage, keep a few residents walking about */
export function updateRivals(dt: number) {
	for (const r of G.S.rivals) {
		growRival(r)
		for (const b of r.buildings) {
			if (b.hp < 1) {
				b.hp = Math.min(1, b.hp + dt / 90)
				if (b.hp < 0.6 && Math.random() < dt * 0.6) emit(b.x, b.y - 0.8, 'smoke', 1)
			}
		}
		const want = Math.min(4 + Math.floor(r.buildings.length / 2), 18)
		let have = 0
		for (const a of agents) if (a.kind === 'crew' && a.team === r.id && a.home) have++
		if (have < want) {
			const a = spawnAgent('crew', r.id, r.x + rand(-3, 3), r.y + rand(-2, 2), rand(1.2, 1.7))
			a.home = { x: r.x, y: r.y }
		}
	}
}

// ---------------------------------------------------------------------
// Raids
// ---------------------------------------------------------------------
const LINES: Record<string, string[]> = {
	'sound>lights': ['Soundhaven says Lumenfort’s dimmers are buzzing through their mix — they march!', 'Soundhaven’s bass brigade marches on Lumenfort!', 'Lumenfort parked a truss in front of Soundhaven’s PA. War!'],
	'lights>sound': ['Lumenfort sends a strobe squad against Soundhaven!', 'Lumenfort claims the PA blocks every beam — they march!', 'Soundhaven turned the house lights on mid-show. Lumenfort wants revenge!'],
	'sound>us': ['Soundhaven blames Companion for a missed cue — raiders incoming!', 'Soundhaven heard a click on the talkback. They’re coming for Companion!'],
	'lights>us': ['Lumenfort blames Companion for a late GO button — raiders incoming!', 'A Companion button fired the wrong scene in Lumenfort. Raid!'],
}
const WIN: Record<string, string[]> = {
	sound: ['Soundhaven’s subs shook the opposition apart', 'Soundhaven won with a perfectly timed drop', 'Feedback squeal! Soundhaven wins the day'],
	lights: ['Lumenfort blinded the enemy with a full-white strobe', 'Lumenfort won with a flawless fade to black', 'A wall of beams — Lumenfort wins'],
	us: ['The militia pressed every button at once — the raiders fled!', 'Companion fired the right cue at the right time. Raiders routed!'],
}

const teamName = (t: Team) => (t === 'us' ? 'the village' : RIVAL_INFO[t as RivalId].name)

/** Called once per year: maybe a raid starts. Returns true if it did. */
export function maybeRaid(): boolean {
	const S = G.S
	if (settings.rivals === 'off' || S.event || S.year < 12 || S.year - S.lastRaidYear < 7) return false
	if (Math.random() > 0.09) return false
	startEvent('raid')
	return true
}

function standing(units: Agent[], team: Team) {
	return units.filter((u) => u.team === team && u.hp > 0 && !u.dead)
}

/** testing: make the next raid target this side */
let forcedTarget: Team | null = null
export function forceNextRaid(t: Team) {
	forcedTarget = t
}

export function raidStart(e: ActiveEvent) {
	const S = G.S
	S.lastRaidYear = S.year
	const att: RivalId = Math.random() < 0.5 ? 'sound' : 'lights'
	let def: Team = settings.rivals === 'on' && popCount() >= 6 && Math.random() < 0.3 ? 'us' : att === 'sound' ? 'lights' : 'sound'
	if (forcedTarget) def = forcedTarget === att ? (att === 'sound' ? 'lights' : 'sound') : forcedTarget
	forcedTarget = null
	const A = getRival(att)
	const vb = villageBounds()
	const units: Agent[] = []
	const nA = clamp(3 + Math.floor(A.buildings.length / 4), 3, 10)
	let meet: { x: number; y: number }
	if (def === 'us') {
		const dir = A.x < CX ? -1 : 1
		meet = { x: dir < 0 ? vb.x0 - 3 : vb.x1 + 3, y: CY }
		for (let i = 0; i < nA; i++) {
			const u = spawnAgent('crew', att, A.x + rand(-1, 1), A.y + rand(-1, 1), rand(5, 5.6))
			u.path = [[meet.x + dir * rand(2.5, 4), meet.y + rand(-2.5, 2.5)]]
			units.push(u)
		}
		const nD = clamp(2 + countType('tower') * 2 + countType('keep') * 3 + Math.floor(popCount() / 15) + (has('telegraph') ? 2 : 0), 2, 12)
		for (let i = 0; i < nD; i++) {
			const u = spawnAgent('militia', 'us', CX + rand(-1, 1), CY + rand(0.5, 1.5), rand(4.6, 5))
			u.path = [[meet.x - dir * rand(0.5, 2), meet.y + rand(-2.5, 2.5)]]
			if (has('fortification')) u.hp = 4
			units.push(u)
		}
	} else {
		const D = getRival(def as RivalId)
		const dir = D.x > A.x ? 1 : -1
		// fight in the fields north or south of the village, never in the middle of it
		const yN = vb.y0 - 5, yS = vb.y1 + 5
		const my = yN >= 9 ? yN : yS <= H - 5 ? yS : 9
		meet = { x: (A.x + D.x) / 2 + rand(-6, 6), y: my }
		for (let i = 0; i < nA; i++) {
			const u = spawnAgent('crew', att, A.x + rand(-1, 1), A.y + rand(-1, 1), rand(6.2, 6.8))
			u.path = [[A.x + dir * 2, my + rand(-2, 2)], [meet.x - dir * rand(2.5, 4), my + rand(-2.2, 2.2)]]
			units.push(u)
		}
		const nD = clamp(3 + Math.floor(D.buildings.length / 4), 3, 10)
		for (let i = 0; i < nD; i++) {
			const u = spawnAgent('crew', def, D.x + rand(-1, 1), D.y + rand(-1, 1), rand(6.2, 6.8))
			u.path = [[D.x - dir * 2, my + rand(-2, 2)], [meet.x + dir * rand(0.5, 2), my + rand(-2.2, 2.2)]]
			units.push(u)
		}
	}
	Object.assign(e.d, { att, def, units, meet, phase: 'march', pt: 0, shield: def === 'us' && has('forceFields') })
	ticker(pick(LINES[`${att}>${def}`]), '⚔️', RIVAL_INFO[att].accent)
}

function shotKind(t: Team) {
	return t === 'sound' ? 'ring' : t === 'lights' ? 'beam' : 'button'
}
function shotColor(t: Team) {
	if (t === 'sound') return pick(['#a99bff', '#7b6bff', '#c6b8ff'])
	if (t === 'lights') return beamColor()
	return pick(BUTTON_COLS)
}

export function raidUpdate(e: ActiveEvent, dt: number) {
	const d = e.d
	const units: Agent[] = d.units
	d.pt += dt
	if (d.phase === 'march') {
		const attArrived = standing(units, d.att).every((u) => !u.path.length)
		if (attArrived && (d.shield || units.every((u) => !u.path.length) || d.pt > 12)) {
			d.phase = 'battle'
			d.pt = 0
			if (d.shield) ticker('The raiders hit the force field and bounced right off!', '🛡️', '#7ff6ff')
		}
		return
	}
	if (d.phase === 'battle') {
		if (d.shield) {
			// raiders throw everything at the dome, then give up
			for (const u of standing(units, d.att)) {
				u.fireT -= dt
				if (u.fireT > 0) continue
				u.fireT = rand(0.6, 1.2)
				const tx = u.x + (d.meet.x - u.x) * 0.9
				shotsAt(u, tx, u.y, shotColor(d.att), shotKind(d.att))
				d.flash = 1
			}
			if (d.pt > 6) finish(e, d.def)
			return
		}
		for (const u of units) {
			if (u.hp <= 0 || u.path.length) continue
			u.fireT -= dt
			if (u.fireT > 0) continue
			u.fireT = rand(0.7, 1.5)
			const foes = units.filter((o) => o.team !== u.team && o.hp > 0)
			if (!foes.length) break
			const target = pick(foes)
			u.face = target.x > u.x ? 1 : -1
			fire(shotKind(u.team), u, target, shotColor(u.team), () => {
				if (target.hp <= 0) return
				target.hp--
				emit(target.x, target.y - 0.3, 'spark', 4)
				if (target.hp <= 0) {
					target.down = 3.5
					emit(target.x, target.y - 0.3, 'dust', 6)
				}
			})
			// small shuffles keep the battle lively
			if (Math.random() < 0.3) u.path.push([u.x + rand(-0.8, 0.8), u.y + rand(-0.6, 0.6)])
		}
		const a = standing(units, d.att).length, df = standing(units, d.def).length
		if (!a || !df || d.pt > 16) finish(e, a > df ? d.att : d.def)
		return
	}
	if (d.phase === 'loot' && d.pt > 1) {
		const busy = units.some((u) => u.team === d.winner && u.hp > 0 && u.path.length)
		if (!busy && !d.looted) {
			d.looted = true
			loot(e)
			sendHome(e)
			d.phase = 'home'
			d.pt = 0
		}
		return
	}
	if (d.phase === 'home') {
		if (units.every((u) => !u.path.length && u.down <= 0) || d.pt > 30) e.t = e.dur
	}
}

function shotsAt(u: Agent, tx: number, ty: number, col: string, kind: 'ring' | 'beam' | 'button') {
	const ghost = { ...u, x: tx, y: ty + 0.35 } as Agent
	fire(kind, u, ghost, col, () => emit(tx, ty - 0.4, 'spark', 3))
}

function finish(e: ActiveEvent, winner: Team) {
	const d = e.d
	d.winner = winner
	d.phase = 'loot'
	d.pt = 0
	const units: Agent[] = d.units
	// wake the knocked-out so they can limp home later
	for (const u of units) if (u.hp <= 0) u.down = Math.max(u.down, 2)
	ticker(pick(WIN[winner as string]), '🏆', winner === 'us' ? '#f2c75c' : RIVAL_INFO[winner as RivalId].accent)
	if (winner === d.att) {
		// winners march on
		const goal = d.def === 'us' ? { x: CX, y: CY } : getRival(d.def)
		for (const u of standing(units, d.att)) u.path.push([goal.x + rand(-3, 3), goal.y + rand(-2, 2) + (d.def === 'us' ? 3 : 0)])
	}
	if (d.def !== 'us' && d.att !== 'us') {
		getRival(winner as RivalId).wins++
		getRival((winner === d.att ? d.def : d.att) as RivalId).losses++
	}
}

function loot(e: ActiveEvent) {
	const d = e.d
	const S = G.S
	if (d.winner === d.att) {
		if (d.def === 'us') {
			const full = settings.events === 'full'
			const targets = S.buildings.filter((b) => b.done && b.type !== 'graveyard').sort(() => Math.random() - 0.5).slice(0, full ? 2 : 1)
			for (const b of targets) {
				damageBuilding(b, full ? 0.4 : 0.2)
				ticker(`${RIVAL_INFO[d.att as RivalId].name} trashed the ${B[b.type].name}`, '💥', '#ff9a85')
			}
			const take = (r: 'wood' | 'stone' | 'food') => {
				const n = Math.floor(S.stock[r] * 0.15)
				S.stock[r] -= n
				return n
			}
			const w = take('wood'), s = take('stone'), f = take('food')
			if (w + s + f) ticker(`They carried off ${w} wood, ${s} stone and ${f} food`, '💰', '#ff9a85')
		} else {
			const D = getRival(d.def)
			const hit = D.buildings.filter((b) => b.hp > 0.5).sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3))
			for (const b of hit) {
				b.hp = 0.2
				emit(b.x, b.y - 0.6, 'debris', 10)
				emit(b.x, b.y - 0.6, 'dust', 10)
			}
		}
	} else if (d.def === 'us') {
		S.stock.wood += 10
		S.stock.stone += 10
		ticker('The raiders left their gear behind: +10 wood, +10 stone', '💰', '#f2c75c')
	}
}

function sendHome(e: ActiveEvent) {
	const d = e.d
	for (const u of d.units as Agent[]) {
		u.down = Math.min(u.down, 1.5)
		u.hp = Math.max(u.hp, 1)
		u.vanish = true
		u.spd = u.team === d.winner ? 3.5 : 2.6
		if (u.team === 'us') u.path = [[CX + rand(-1, 1), CY + rand(0.5, 1.5)]]
		else {
			const r = getRival(u.team as RivalId)
			if (d.def !== 'us' && d.att !== 'us') u.path = [[u.x, d.meet.y + rand(-1, 1)], [r.x + rand(-2, 2), d.meet.y], [r.x + rand(-2, 2), r.y + rand(-2, 2)]]
			else u.path = [[r.x + rand(-2, 2), r.y + rand(-2, 2)]]
		}
	}
}

export function raidEnd(e: ActiveEvent) {
	const ids = new Set((e.d.units as Agent[]).map((u) => u.id))
	removeAgents((a) => ids.has(a.id))
}

export function raidFocus(e: ActiveEvent) {
	const d = e.d
	const units: Agent[] = d.units
	if (d.phase === 'home') return null
	const live = units.filter((u) => u.team === d.att)
	if (!live.length) return null
	let x = 0, y = 0
	for (const u of live) {
		x += u.x
		y += u.y
	}
	return { x: x / live.length, y: y / live.length - 0.5, s: d.phase === 'battle' ? 44 : 30 }
}

export { teamName }
