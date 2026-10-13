import { rand } from '../core/util'
import type { TribeId } from './state'

/** Temporary characters that are not villagers: soldiers, siege engines, caravans, wolves, bandits… (not saved) */
export type AgentKind = 'soldier' | 'siege' | 'caravan' | 'decoy' | 'wolf' | 'bandit' | 'robot' | 'bride' | 'groom' | 'traveler' | 'performer'
export type Team = TribeId | 'none'

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
	/** era style the agent is drawn in */
	style: number
	/** soldier: the villager who went to war */
	vid?: number
	/** siege engine level 0..4 */
	level?: number
	vanish?: boolean
	dead?: boolean
	/** wandering anchor (performers at a contest) */
	home?: { x: number; y: number }
	idleT: number
}

let nextId = 1
export const agents: Agent[] = []

export function spawnAgent(kind: AgentKind, team: Team, x: number, y: number, spd = 2, style = 0): Agent {
	const a: Agent = { k: 9, id: nextId++, kind, team, x, y, path: [], spd, face: 1, ph: Math.random() * 6, hp: 3, down: 0, fireT: rand(0.3, 1.2), style, idleT: rand(0, 3) }
	agents.push(a)
	return a
}

export function removeAgents(pred: (a: Agent) => boolean) {
	for (let i = agents.length - 1; i >= 0; i--) if (pred(agents[i])) agents.splice(i, 1)
}

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
					a.idleT = rand(1, 3)
					a.path.push([a.home.x + rand(-1.2, 1.2), a.home.y + rand(-0.8, 0.8)])
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

/** Things flying through the air (drawn by the renderer) */
export type ShotKind = 'ring' | 'beam' | 'pixel' | 'arrow' | 'bullet' | 'laser' | 'boulder' | 'shell' | 'missile' | 'plasma'
export interface Shot {
	kind: ShotKind
	x: number; y: number; tx: number; ty: number
	t: number
	dur: number
	col: string
	hit?: () => void
}
export const shots: Shot[] = []

const DUR: Partial<Record<ShotKind, number>> = { beam: 0.25, laser: 0.2, ring: 0.7, bullet: 0.3, boulder: 1.2, shell: 0.9, missile: 1.0, plasma: 0.7 }
export function fireAt(kind: ShotKind, x: number, y: number, tx: number, ty: number, col: string, onHit?: () => void) {
	shots.push({ kind, x, y, tx, ty, t: 0, dur: DUR[kind] ?? 0.55, col, hit: onHit })
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
