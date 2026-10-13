import { pick, rand } from '../core/util'
import { TRIBES, type TribeId } from '../data/tribes'
import { emit } from '../render/particles'
import { banner, ticker } from '../ui/notify'
import { isPlayer } from './buildings'
import { anyHas, G, H, has, RAIL_Y, tribeOf, W } from './state'

/** Cars and hovercars wander along each tribe's own roads (not saved) */
export interface Car { k: 11; x: number; y: number; tx: number; ty: number; dx: number; dy: number; col: string; spd: number; tribe: TribeId; hover: boolean }
export const cars: Car[] = []
export const train = { active: false, x: 6, dir: 1, wait: 0, k: 12 as const, y: RAIL_Y }
export const planes: { x: number; y: number; dir: number; alt: number; spd: number }[] = []
export const rockets: { x: number; y: number; alt: number; vy: number; big: boolean }[] = []
let planeTimer = 20
let trafficPaused = 0

const CAR_COLS = ['#d9433a', '#3d6fa8', '#f2c230', '#e8e2d6', '#2f2f35', '#4caf73', '#8a5ad6']

export function pauseTraffic(s: number) {
	trafficPaused = Math.max(trafficPaused, s)
}

function roadOf(x: number, y: number, tribe: TribeId) {
	return x >= 0 && y >= 0 && x < W && y < H && G.roadOwner.get(y * W + x) === tribe
}

function spawnCar(tribe: TribeId) {
	const T = tribeOf(tribe)
	// start near the plaza
	for (let t = 0; t < 30; t++) {
		const x = Math.round(T.cx + rand(-12, 12)), y = Math.round(T.cy + rand(-10, 10))
		if (!roadOf(x, y, tribe)) continue
		cars.push({ k: 11, x: x + 0.5, y: y + 0.5, tx: x, ty: y, dx: 1, dy: 0, col: pick(CAR_COLS), spd: rand(2.2, 3.2), tribe, hover: has(T, 'hovercars') })
		return
	}
}

function nextTile(c: Car) {
	const opts: [number, number][] = []
	for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
		if (dx === -c.dx && dy === -c.dy) continue
		if (roadOf(c.tx + dx, c.ty + dy, c.tribe)) opts.push([dx, dy])
	}
	let dir: [number, number]
	if (!opts.length) dir = [-c.dx, -c.dy]
	else if (opts.some(([dx, dy]) => dx === c.dx && dy === c.dy) && Math.random() < 0.6) dir = [c.dx, c.dy]
	else dir = pick(opts)
	if (!roadOf(c.tx + dir[0], c.ty + dir[1], c.tribe)) return false
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
	for (const T of G.S.tribes) {
		const mine = cars.filter((c) => c.tribe === T.id)
		const want = has(T, 'automobile') ? Math.min(28, 3 + Math.floor(T.buildings.length / 4)) : 0
		if (mine.length < want && Math.random() < dt * 2) spawnCar(T.id)
		if (mine.length > want) cars.splice(cars.indexOf(mine[0]), 1)
		const hover = has(T, 'hovercars')
		for (const c of mine) c.hover = hover
	}
	for (const c of cars) {
		const gx = c.tx + 0.5, gy = c.ty + 0.5
		const ddx = gx - c.x, ddy = gy - c.y, d = Math.hypot(ddx, ddy)
		const sp = c.spd * dt * (c.hover ? 1.4 : 1)
		if (d <= sp) {
			c.x = gx
			c.y = gy
			if (!nextTile(c)) c.x = -99
		} else {
			c.x += (ddx / d) * sp
			c.y += (ddy / d) * sp
		}
	}
	for (let i = cars.length - 1; i >= 0; i--) if (cars[i].x < 0) cars.splice(i, 1)

	train.active = anyHas('railway')
	if (train.active) {
		if (train.wait > 0) train.wait -= dt
		else {
			train.x += train.dir * dt * (anyHas('hovercars') ? 12 : anyHas('electricity') ? 9 : 6)
			if (train.x > W - 4 || train.x < 4) {
				train.x = Math.max(4, Math.min(W - 4, train.x))
				train.dir *= -1
				train.wait = 4
			}
			if (!anyHas('electricity') && Math.random() < dt * 8) emit(train.x + (train.dir > 0 ? 1.2 : -1.2), RAIL_Y - 1.2, 'smoke', 1)
		}
	}

	if (anyHas('airplanes')) {
		planeTimer -= dt
		if (planeTimer <= 0) {
			planeTimer = rand(18, 45)
			const dir = Math.random() < 0.5 ? 1 : -1
			planes.push({ x: dir > 0 ? -10 : W + 10, y: rand(12, H - 10), dir, alt: rand(5, 8), spd: rand(9, 14) })
		}
	}
	for (let i = planes.length - 1; i >= 0; i--) {
		const p = planes[i]
		p.x += p.dir * p.spd * dt
		if (p.x < -15 || p.x > W + 15) planes.splice(i, 1)
	}

	for (const T of G.S.tribes)
		for (const b of T.buildings) {
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
					T.prestige += 20
					const msg = `${TRIBES[T.id].name} launched a colony starship for the stars!`
					if (isPlayer(T)) banner('🌌 The colony starship lifts off!', `Year ${T.year} — your settlers head for the stars`, 'invention')
					else ticker(msg, '🌌', '#9fd3ff')
					G.S.history.push({ year: T.year, icon: '🌌', text: msg, tribe: T.id })
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
