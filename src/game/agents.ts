import { rand } from '../core/util'
import type { RivalId } from './state'

/** Temporary characters that are not villagers: rival crews, wolves, bandits, robots, wedding couple… (not saved) */
export type AgentKind = 'crew' | 'militia' | 'wolf' | 'bandit' | 'robot' | 'bride' | 'groom' | 'traveler'
export type Team = RivalId | 'us' | 'none'

export interface Agent {
	k: 9
	id: number
	kind: AgentKind
	team: Team
	x: number; y: number
	path: [number, number][]
	spd: number
	face: 1 | -1
	ph: number
	hp: number
	/** seconds knocked out (shows dizzy stars) */
	down: number
	fireT: number
	carry?: boolean
	/** idle wandering for rival residents */
	home?: { x: number; y: number }
	idleT: number
	/** remove when the path is finished */
	vanish?: boolean
	dead?: boolean
}

let nextId = 1
export const agents: Agent[] = []

export function spawnAgent(kind: AgentKind, team: Team, x: number, y: number, spd = 2): Agent {
	const a: Agent = { k: 9, id: nextId++, kind, team, x, y, path: [], spd, face: 1, ph: Math.random() * 6, hp: 3, down: 0, fireT: rand(0.3, 1.2), idleT: rand(0, 3) }
	agents.push(a)
	return a
}

export function removeAgents(pred: (a: Agent) => boolean) {
	for (let i = agents.length - 1; i >= 0; i--) if (pred(agents[i])) agents.splice(i, 1)
}

export const walking = (a: Agent) => a.path.length > 0 && a.down <= 0

export function updateAgents(dt: number) {
	for (let i = agents.length - 1; i >= 0; i--) {
		const a = agents[i]
		if (a.down > 0) {
			a.down -= dt
			continue
		}
		if (!a.path.length) {
			if (a.vanish || a.dead) {
				agents.splice(i, 1)
				continue
			}
			if (a.home) {
				a.idleT -= dt
				if (a.idleT <= 0) {
					a.idleT = rand(2, 7)
					a.path.push([a.home.x + rand(-6, 6), a.home.y + rand(-4.5, 4.5)])
				}
			}
			continue
		}
		const [tx, ty] = a.path[0]
		const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy)
		const sp = a.spd * dt
		if (Math.abs(dx) > 0.01) a.face = dx > 0 ? 1 : -1
		a.ph += dt * 11
		if (d <= sp) {
			a.x = tx
			a.y = ty
			a.path.shift()
		} else {
			a.x += (dx / d) * sp
			a.y += (dy / d) * sp
		}
	}
}

/** Things flying between fighters (drawn by the renderer) */
export interface Shot {
	kind: 'ring' | 'beam' | 'button' | 'arrow'
	x: number; y: number; tx: number; ty: number
	t: number
	dur: number
	col: string
	hit?: () => void
}
export const shots: Shot[] = []

export function fire(kind: Shot['kind'], from: Agent, to: Agent, col: string, onHit: () => void) {
	const dur = kind === 'beam' ? 0.25 : kind === 'ring' ? 0.7 : 0.55
	shots.push({ kind, x: from.x, y: from.y - 0.35, tx: to.x, ty: to.y - 0.3, t: 0, dur, col, hit: onHit })
}

export function updateShots(dt: number) {
	for (let i = shots.length - 1; i >= 0; i--) {
		const s = shots[i]
		s.t += dt
		if (s.t >= s.dur) {
			s.hit?.()
			shots.splice(i, 1)
		}
	}
}
