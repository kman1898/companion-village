import { pick, rand } from '../core/util'

export type PType = 'chip' | 'grit' | 'leaf' | 'chaff' | 'dust' | 'smoke' | 'spark' | 'flame' | 'ember' | 'debris' | 'ghost' | 'confetti' | 'miasma' | 'rock' | 'heart'

export interface Particle {
	x: number; y: number; vx: number; vy: number
	life: number; max: number; size: number
	col: string; type: PType
	/** gravity */
	g: number
	/** growth per second */
	grow: number
	/** peak alpha */
	a: number
}

export const parts: Particle[] = []
export const floats: { x: number; y: number; text: string; life: number }[] = []
let maxParts = 1200
export function setParticleBudget(n: number) {
	maxParts = n
}

const CONFETTI = ['#f2c75c', '#e0564a', '#5aa6e0', '#7cc457', '#d77be0', '#ffffff']

export function emit(x: number, y: number, type: PType, n = 1) {
	for (let i = 0; i < n; i++) {
		if (parts.length >= maxParts) return
		const p: Particle = { x, y, type, vx: 0, vy: 0, life: 1, max: 1, size: 0.05, col: '#fff', g: 0, grow: 0, a: 1 }
		switch (type) {
			case 'chip': Object.assign(p, { vx: rand(-1, 1), vy: rand(-2, -1), max: 0.5, size: 0.04, col: '#c79a5c', g: 5 }); break
			case 'grit': Object.assign(p, { vx: rand(-1, 1), vy: rand(-2, -1), max: 0.5, size: 0.04, col: '#c8c5bd', g: 5 }); break
			case 'leaf': Object.assign(p, { x: x + rand(-0.3, 0.3), y: y + rand(-0.3, 0.2), vx: rand(-0.4, 0.4), vy: rand(0.1, 0.5), max: 1.2, size: 0.05, col: pick(['#5a9a3f', '#79a24c', '#3f7d32']) }); break
			case 'chaff': Object.assign(p, { x: x + rand(-0.4, 0.4), vx: rand(-0.5, 0.5), vy: rand(-1.2, -0.5), max: 0.8, size: 0.04, col: '#e6c85a', g: 5 }); break
			case 'dust': Object.assign(p, { x: x + rand(-0.15, 0.15), vx: rand(-0.3, 0.3), vy: rand(-0.4, -0.1), max: 0.7, size: 0.08, col: '#d6c4a0', grow: 0.12, a: 0.6 }); break
			case 'smoke': Object.assign(p, { vx: rand(0.05, 0.2), vy: rand(-0.45, -0.3), max: 3.2, size: 0.07, col: '#dcdcdc', grow: 0.12, a: 0.45 }); break
			case 'spark': Object.assign(p, { x: x + rand(-1, 1), y: y + rand(-0.8, 0.6), vx: rand(-0.3, 0.3), vy: rand(-1.2, -0.4), max: rand(0.8, 1.6), size: 0.06, col: '#ffe58a' }); break
			case 'flame': Object.assign(p, { x: x + rand(-0.5, 0.5), y: y + rand(-0.2, 0.2), vx: rand(-0.1, 0.1), vy: rand(-1.4, -0.7), max: rand(0.4, 0.8), size: rand(0.08, 0.16), col: pick(['#ff9a2e', '#ffcf4a', '#f2602a']), grow: -0.12, a: 0.9 }); break
			case 'ember': Object.assign(p, { x: x + rand(-0.4, 0.4), vx: rand(-0.4, 0.4), vy: rand(-1.6, -0.6), max: rand(0.8, 1.6), size: 0.035, col: '#ffb347' }); break
			case 'debris': Object.assign(p, { vx: rand(-3, 3), vy: rand(-3, 1), max: rand(0.8, 1.6), size: rand(0.04, 0.09), col: pick(['#7a5434', '#5a3b22', '#8d8b84', '#4e7f39']), g: 2 }); break
			case 'rock': Object.assign(p, { vx: rand(-4, 4), vy: rand(-5, -1), max: rand(0.8, 1.4), size: rand(0.06, 0.14), col: pick(['#5a4a3a', '#8d8b84', '#3a2e24']), g: 7 }); break
			case 'ghost': Object.assign(p, { vx: rand(-0.1, 0.1), vy: -0.5, max: 2.5, size: 0.12, col: '#ffffff', a: 0.7 }); break
			case 'confetti': Object.assign(p, { x: x + rand(-2.5, 2.5), y: y + rand(-3, -1.5), vx: rand(-0.4, 0.4), vy: rand(0.4, 1.0), max: rand(1.5, 3), size: 0.05, col: pick(CONFETTI) }); break
			case 'heart': Object.assign(p, { vx: rand(-0.2, 0.2), vy: rand(-0.7, -0.4), max: 2, size: 0.1, col: pick(['#ff6fa8', '#ff3d7f', '#ffb3d0']) }); break
			case 'miasma': Object.assign(p, { x: x + rand(-0.6, 0.6), y: y + rand(-0.4, 0.2), vx: rand(-0.15, 0.15), vy: rand(-0.3, -0.1), max: rand(2, 3.5), size: 0.15, col: '#8fc24a', grow: 0.15, a: 0.35 }); break
		}
		p.life = p.max
		parts.push(p)
	}
}

export function floatText(x: number, y: number, text: string) {
	floats.push({ x, y, text, life: 2.2 })
}

export function updateParticles(dt: number) {
	for (let i = parts.length - 1; i >= 0; i--) {
		const p = parts[i]
		p.life -= dt
		if (p.life <= 0 || p.size <= 0) {
			parts[i] = parts[parts.length - 1]
			parts.pop()
			continue
		}
		p.x += p.vx * dt
		p.y += p.vy * dt
		p.vy += p.g * dt
		p.size += p.grow * dt
	}
	for (let i = floats.length - 1; i >= 0; i--) {
		floats[i].life -= dt
		floats[i].y -= dt * 0.5
		if (floats[i].life <= 0) floats.splice(i, 1)
	}
}
