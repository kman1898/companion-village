import { pick, rand } from '../core/util'
import { emit } from '../render/particles'
import { banner, ticker } from '../ui/notify'
import { G, H, has, RAIL_Y, W } from './state'

/** Cars and hovercars wander along the road network (not saved) */
export interface Car { k: 11; x: number; y: number; tx: number; ty: number; dx: number; dy: number; col: string; spd: number }
export const cars: Car[] = []
export const train = { active: false, x: 6, dir: 1, wait: 0, k: 12 as const, y: RAIL_Y }
export const planes: { x: number; y: number; dir: number; alt: number; spd: number }[] = []
export const rockets: { x: number; y: number; alt: number; vy: number; big: boolean }[] = []
let planeTimer = 20
export let trafficPaused = 0

const CAR_COLS = ['#d9433a', '#3d6fa8', '#f2c230', '#e8e2d6', '#2f2f35', '#4caf73', '#8a5ad6']

export function pauseTraffic(s: number) {
	trafficPaused = Math.max(trafficPaused, s)
}

function roadAt(x: number, y: number) {
	return x >= 0 && y >= 0 && x < W && y < H && G.roads.has(y * W + x)
}

function spawnCar() {
	const list = [...G.roads]
	if (!list.length) return
	const i = pick(list)
	const x = i % W, y = (i / W) | 0
	cars.push({ k: 11, x: x + 0.5, y: y + 0.5, tx: x, ty: y, dx: 1, dy: 0, col: pick(CAR_COLS), spd: rand(2.2, 3.2) })
}

function nextTile(c: Car) {
	const opts: [number, number][] = []
	for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
		if (dx === -c.dx && dy === -c.dy) continue
		if (roadAt(c.tx + dx, c.ty + dy)) opts.push([dx, dy])
	}
	let dir: [number, number]
	if (!opts.length) dir = [-c.dx, -c.dy]
	else if (opts.some(([dx, dy]) => dx === c.dx && dy === c.dy) && Math.random() < 0.6) dir = [c.dx, c.dy]
	else dir = pick(opts)
	if (!roadAt(c.tx + dir[0], c.ty + dir[1])) return false
	c.dx = dir[0]
	c.dy = dir[1]
	c.tx += dir[0]
	c.ty += dir[1]
	return true
}

export function updateTraffic(dt: number) {
	if (trafficPaused > 0) {
		trafficPaused -= dt
		return
	}
	// cars
	const want = has('automobile') ? Math.min(32, 3 + Math.floor(G.roads.size / 35)) : 0
	if (cars.length < want && Math.random() < dt * 2) spawnCar()
	while (cars.length > want) cars.pop()
	for (const c of cars) {
		const gx = c.tx + 0.5, gy = c.ty + 0.5
		const ddx = gx - c.x, ddy = gy - c.y, d = Math.hypot(ddx, ddy)
		const sp = c.spd * dt * (has('hovercars') ? 1.4 : 1)
		if (d <= sp) {
			c.x = gx
			c.y = gy
			if (!nextTile(c)) {
				c.x = -99 // stranded (road removed) — respawn
			}
		} else {
			c.x += (ddx / d) * sp
			c.y += (ddy / d) * sp
		}
	}
	for (let i = cars.length - 1; i >= 0; i--) if (cars[i].x < 0) cars.splice(i, 1)

	// train
	train.active = has('railway')
	if (train.active) {
		if (train.wait > 0) train.wait -= dt
		else {
			train.x += train.dir * dt * (has('hovercars') ? 12 : has('electricity') ? 9 : 6)
			if (train.x > W - 4 || train.x < 4) {
				train.x = Math.max(4, Math.min(W - 4, train.x))
				train.dir *= -1
				train.wait = 4
			}
			if (!has('electricity') && Math.random() < dt * 8) emit(train.x + (train.dir > 0 ? 1.2 : -1.2), RAIL_Y - 1.2, 'smoke', 1)
		}
	}

	// aeroplanes
	if (has('airplanes')) {
		planeTimer -= dt
		if (planeTimer <= 0) {
			planeTimer = rand(25, 60)
			const dir = Math.random() < 0.5 ? 1 : -1
			planes.push({ x: dir > 0 ? -10 : W + 10, y: rand(10, H - 10), dir, alt: rand(5, 8), spd: rand(9, 14) })
		}
	}
	for (let i = planes.length - 1; i >= 0; i--) {
		const p = planes[i]
		p.x += p.dir * p.spd * dt
		if (p.x < -15 || p.x > W + 15) planes.splice(i, 1)
	}

	// rockets from launch pads, and the colony starship
	for (const b of G.S.buildings) {
		if (!b.done) continue
		if (b.type === 'launchpad') {
			b.timer = (b.timer ?? 30) - dt
			if (b.timer <= 0) {
				b.timer = rand(70, 130)
				rockets.push({ x: b.ox + 1.0, y: b.oy + 1.0, alt: 0, vy: 0.5, big: false })
			}
		}
		if (b.type === 'starship' && !b.launched) {
			b.timer = (b.timer ?? 20) - dt
			if (b.timer <= 0) {
				b.launched = true
				rockets.push({ x: b.ox + 1.0, y: b.oy + 1.4, alt: 0, vy: 0.3, big: true })
				banner('🌌 The colony starship lifts off!', `Year ${G.S.year} — settlers from Companion Village head for the stars`, 'invention')
				ticker('The colony starship has launched!', '🌌', '#9fd3ff')
				G.S.history.push({ year: G.S.year, icon: '🌌', text: 'The colony starship launched for the stars' })
			}
		}
	}
	for (let i = rockets.length - 1; i >= 0; i--) {
		const r = rockets[i]
		r.vy += dt * (r.big ? 1.6 : 3)
		r.alt += r.vy * dt
		emit(r.x + rand(-0.15, 0.15), r.y - r.alt + (r.big ? 0.4 : 0.1), 'flame', r.big ? 4 : 2)
		if (Math.random() < 0.6) emit(r.x + rand(-0.3, 0.3), r.y - r.alt + 0.6, 'smoke', 1)
		if (r.alt > 45) rockets.splice(i, 1)
	}
}

export function resetTraffic() {
	cars.length = 0
	planes.length = 0
	rockets.length = 0
}
