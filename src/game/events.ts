import { B } from '../data/buildings'
import { settings } from '../core/settings'
import { clamp, dist2, pick, rand, shuffle, weightedPick } from '../core/util'
import { emit } from '../render/particles'
import { banner, ticker } from '../ui/notify'
import { removeAgents, spawnAgent, type Agent } from './agents'
import { countType, damageBuilding, destroyBuilding, ignite, villageBounds } from './buildings'
import { isNight, nightAmount } from './daynight'
import { currentEra, invent } from './history'
import { getRival, raidEnd, raidFocus, raidStart, raidUpdate, RIVAL_INFO } from './rivals'
import { CX, CY, G, H, has, popCount, W, type ActiveEvent, type Building } from './state'
import { pauseTraffic } from './traffic'
import { flee, interrupt, killVillager, spawnVillager, TREE_REGROW } from './villagers'
import { forEachTreeNear } from './worldgen'

/** Visual state read by the renderer. *T fields are targets set every frame by the running event. */
export const fx = {
	dark: 0, darkT: 0,
	rain: 0, rainT: 0,
	tint: 0, tintT: 0,
	snow: 0, snowT: 0,
	eclipse: 0, eclipseT: 0,
	flare: 0, flareT: 0,
	flash: 0,
	shake: 0, shakeT: 0,
	/** force-field dome visibility */
	shield: 0,
	blackout: false,
	bolts: [] as { pts: number[]; life: number }[],
}

interface EventDef {
	name: string
	icon: string
	sub: string
	good?: boolean
	dur: number
	weight: () => number
	start(e: ActiveEvent): void
	update?(e: ActiveEvent, dt: number): void
	end?(e: ActiveEvent): void
	focus?(e: ActiveEvent): { x: number; y: number; s: number } | null
}

const full = () => settings.events === 'full'
const env = (e: ActiveEvent, inT: number, outT: number) => clamp(Math.min(e.t / inT, (e.dur - e.t) / outT), 0, 1)
const doneBuildings = () => G.S.buildings.filter((b) => b.done && b.type !== 'graveyard')
const hasFields = () => G.S.buildings.some((b) => b.done && b.field)
const center = (b: Building) => ({ x: b.ox + 1, y: b.oy + 1.2 })
const era = () => currentEra()
const calmWeather = () => has('weatherControl')

function bolt(x: number, y: number) {
	const pts: number[] = []
	const bx = x + rand(-2.5, 2.5), by = y - 16
	for (let i = 0; i <= 10; i++) {
		const f = i / 10
		const jx = i === 10 ? 0 : rand(-0.7, 0.7) * (1 - f)
		pts.push(bx + (x - bx) * f + jx, by + (y - by) * f)
	}
	fx.bolts.push({ pts, life: 0.45 })
	fx.flash = Math.max(fx.flash, 0.75)
}

/** A path across the village from one side to the other */
function crossingPath() {
	const b = villageBounds()
	const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2
	const R = Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 + 6
	const a = Math.random() * Math.PI * 2
	const off = rand(-3, 3)
	return {
		sx: cx + Math.cos(a) * R, sy: cy + Math.sin(a) * R * 0.8,
		ex: cx - Math.cos(a) * R - Math.sin(a) * off, ey: cy - Math.sin(a) * R * 0.8 + Math.cos(a) * off,
	}
}

/** a point on the edge of the village, facing the forest */
function edgePoint(margin = 6) {
	const b = villageBounds()
	const side = Math.floor(Math.random() * 4)
	const x = side === 0 ? b.x0 - margin : side === 1 ? b.x1 + margin : rand(b.x0, b.x1)
	const y = side === 2 ? b.y0 - margin : side === 3 ? b.y1 + margin : rand(b.y0, b.y1)
	return { x: clamp(x, 3, W - 3), y: clamp(y, 7, H - 3) }
}

function shieldBlock(x: number, y: number) {
	fx.shield = 1
	emit(x, y, 'spark', 30)
	ticker('The force field held!', '🛡️', '#7ff6ff')
}

/** Average position of a group of agents */
function centroid(list: Agent[]) {
	if (!list.length) return null
	let x = 0, y = 0
	for (const a of list) {
		x += a.x
		y += a.y
	}
	return { x: x / list.length, y: y / list.length }
}

export const EVENTS: Record<string, EventDef> = {
	storm: {
		name: 'Thunderstorm', icon: '⛈️', sub: 'Dark clouds roll over the village', dur: 32, weight: () => (calmWeather() ? 0 : 3),
		start(e) {
			e.d.next = 2.5
		},
		update(e, dt) {
			const k = env(e, 3, 4)
			fx.darkT = 0.38 * k
			fx.rainT = k
			e.d.next -= dt
			if (e.d.next > 0 || e.t < 2 || e.t > e.dur - 3) return
			e.d.next = rand(2, 4.5)
			const list = doneBuildings().filter((b) => !b.fire && b.type !== 'well' && b.type !== 'fountain')
			if (list.length && Math.random() < 0.5) {
				const b = pick(list)
				const c = center(b)
				bolt(c.x, c.y - 1)
				const rods = has('lightningRods') || has('satellites')
				if ((!rods || Math.random() < 0.3) && ignite(b)) ticker(`Lightning set the ${B[b.type].name} on fire!`, '🔥', '#ff9a2e')
			} else {
				const vb = villageBounds()
				const tx = rand(vb.x0 - 6, vb.x1 + 6), ty = rand(vb.y0 - 6, vb.y1 + 6)
				let hit = false
				forEachTreeNear(G.world, tx, ty, 3, (t) => {
					if (hit || t.cut || t.park) return
					hit = true
					t.cut = 1
					t.rt = TREE_REGROW
					t.g = 0
					bolt(t.x, t.y - 1)
					emit(t.x, t.y - 0.5, 'flame', 10)
					emit(t.x, t.y - 0.6, 'smoke', 4)
				})
				if (!hit) bolt(tx, ty)
			}
		},
	},

	tornado: {
		name: 'Tornado', icon: '🌪️', sub: 'A twister is tearing through the land', dur: 24, weight: () => (calmWeather() ? 0 : 1.4),
		start(e) {
			Object.assign(e.d, crossingPath(), { hit: new Set<number>(), wrecked: 0 })
			e.d.x = e.d.sx
			e.d.y = e.d.sy
		},
		update(e, dt) {
			const d = e.d, f = e.t / e.dur
			const px = -(d.ey - d.sy), py = d.ex - d.sx, pl = Math.hypot(px, py) || 1
			const wob = Math.sin(e.t * 1.3) * 1.4
			d.x = d.sx + (d.ex - d.sx) * f + (px / pl) * wob
			d.y = d.sy + (d.ey - d.sy) * f + (py / pl) * wob
			fx.darkT = 0.24 * env(e, 2, 3)
			fx.shakeT = 0.08
			if (Math.random() < dt * 30) emit(d.x + rand(-1, 1), d.y - rand(0, 2.5), 'debris', 1)
			if (Math.random() < dt * 10) emit(d.x, d.y, 'dust', 1)
			if (has('forceFields')) {
				const vb = villageBounds()
				if (d.x > vb.x0 && d.x < vb.x1 && d.y > vb.y0 && d.y < vb.y1 && !d.blocked) {
					d.blocked = true
					shieldBlock(d.x, d.y)
					e.t = Math.max(e.t, e.dur - 2)
				}
				return
			}
			for (const b of G.S.buildings) {
				if (d.hit.has(b.id) || b.type === 'graveyard') continue
				const c = center(b)
				if (dist2(c.x, c.y, d.x, d.y) < 1.9 * 1.9) {
					d.hit.add(b.id)
					damageBuilding(b, full() ? 0.75 : 0.45)
					d.wrecked++
					ticker(`The tornado wrecked the ${B[b.type].name}`, '🌪️', '#c9b6a0')
				}
			}
			forEachTreeNear(G.world, d.x, d.y, 1.3, (t) => {
				if (t.cut) return
				t.cut = 1
				t.rt = TREE_REGROW * 2
				t.g = 0
				emit(t.x, t.y - 0.5, 'leaf', 6)
			})
			for (const v of G.S.villagers) {
				if (v.fly || v.inside || dist2(v.x, v.y, d.x, d.y) > 1.5 * 1.5) continue
				interrupt(v)
				v.fly = { vx: rand(-4, 4), vy: rand(-3, 3), vz: rand(5, 8), z: 0 }
				v.doomed = full() && !has('stormCellars') && Math.random() < 0.3
			}
		},
		end(e) {
			if (e.d.wrecked) ticker(`The tornado has passed. ${e.d.wrecked} buildings need repairs.`, '🌪️')
		},
		focus: (e) => ({ x: e.d.x, y: e.d.y - 1.5, s: 34 }),
	},

	meteor: {
		name: 'Meteor Strike', icon: '☄️', sub: 'Something is falling from the sky…', dur: 7, weight: () => 0.9,
		start(e) {
			const list = doneBuildings()
			let tx: number, ty: number
			if (list.length && Math.random() < 0.55) {
				const c = center(pick(list))
				tx = c.x
				ty = c.y
			} else {
				const b = villageBounds()
				tx = rand(b.x0, b.x1)
				ty = rand(b.y0, b.y1)
			}
			Object.assign(e.d, { tx, ty, sx: tx + 10, sy: ty - 18, hit: false, ringT: -1 })
			if (has('astronomy') || has('satellites')) {
				ticker(`${has('satellites') ? 'Satellites' : 'Astronomers'} spotted the meteor — everyone runs for cover!`, '🔭', '#9fd3ff')
				for (const v of G.S.villagers) if (dist2(v.x, v.y, tx, ty) < 20) flee(v, tx, ty, 5)
			}
		},
		update(e, dt) {
			const d = e.d
			if (d.ringT >= 0) d.ringT += dt
			if (!d.hit) {
				const f = Math.min(1, e.t / 2.2) ** 2
				const x = d.sx + (d.tx - d.sx) * f, y = d.sy + (d.ty - d.sy) * f
				emit(x, y, 'flame', 2)
				emit(x, y, 'smoke', 1)
				fx.darkT = 0.12
			}
			if (d.hit || e.t < 2.2) return
			d.hit = true
			d.ringT = 0
			const S = G.S
			fx.flash = 1
			if (has('forceFields')) {
				d.ty -= 3
				emit(d.tx, d.ty, 'flame', 30)
				emit(d.tx, d.ty, 'rock', 20)
				shieldBlock(d.tx, d.ty)
				return
			}
			fx.shake = 1.5
			emit(d.tx, d.ty, 'rock', 40)
			emit(d.tx, d.ty - 0.3, 'flame', 30)
			emit(d.tx, d.ty, 'dust', 30)
			emit(d.tx, d.ty - 0.5, 'spark', 20)
			S.craters.push({ x: d.tx, y: d.ty, r: 2, until: S.year + 25 })
			forEachTreeNear(G.world, d.tx, d.ty, 2.4, (t) => (t.gone = 1))
			for (const k of G.world.rocks) if (dist2(k.x, k.y, d.tx, d.ty) < 5.5) k.gone = 1
			for (const bu of G.world.bushes) if (dist2(bu.x, bu.y, d.tx, d.ty) < 5.5) bu.gone = 1
			for (const b of [...S.buildings]) {
				const c = center(b)
				if (dist2(c.x, c.y, d.tx, d.ty) > 2.4 * 2.4) continue
				if (full() && b.type !== 'graveyard') {
					destroyBuilding(b)
					ticker(`The meteor obliterated the ${B[b.type].name}`, '☄️', '#ff9a2e')
				} else damageBuilding(b, 0.9)
			}
			for (const v of [...S.villagers]) {
				if (dist2(v.x, v.y, d.tx, d.ty) > 2.2 * 2.2) continue
				if (full() && !has('astronomy') && !has('satellites')) killVillager(v, 'was struck by the meteor')
				else {
					interrupt(v)
					v.inside = false
					v.fly = { vx: (v.x - d.tx) * 2, vy: (v.y - d.ty) * 2, vz: 5, z: 0 }
				}
			}
			S.stock.stone += 25
			ticker('Meteorite iron recovered: +25 stone', '🪨')
		},
		focus: (e) => (e.t < 5 ? { x: e.d.tx, y: e.d.ty - 1, s: 30 } : null),
	},

	plague: {
		name: 'Plague', icon: '☠️', sub: 'A sickness spreads through the houses', dur: 45,
		weight: () => (popCount() >= 8 ? (has('vaccination') ? 0.4 : 1.2) : 0),
		start(e) {
			const S = G.S
			const n = Math.max(1, Math.round(S.villagers.length * rand(0.15, 0.3)))
			const deadly = full() ? (has('vaccination') ? 0.08 : has('medicine') ? 0.25 : 0.5) : 0
			for (const v of shuffle([...S.villagers]).slice(0, n)) {
				v.sick = 1
				v.dieAt = Math.random() < deadly && !v.android ? rand(6, e.dur - 4) : -1
			}
			e.d.dead = 0
		},
		update(e) {
			fx.tintT = 0.14 * env(e, 3, 5)
			for (const v of [...G.S.villagers]) {
				if (v.sick && v.dieAt !== undefined && v.dieAt > 0 && e.t >= v.dieAt) {
					killVillager(v, 'died of the plague')
					e.d.dead++
				}
			}
			if (Math.random() < 0.15) {
				const houses = G.S.buildings.filter((b) => b.done && B[b.type].cap)
				if (houses.length) {
					const b = pick(houses)
					emit(b.ox + 1, b.oy + 0.8, 'miasma', 1)
				}
			}
		},
		end(e) {
			for (const v of G.S.villagers) {
				v.sick = undefined
				v.dieAt = undefined
			}
			ticker(e.d.dead ? `The plague has passed. ${e.d.dead} villagers were lost.` : `The plague has passed. Everyone recovered.`, '☠️', '#8fc24a')
		},
	},

	earthquake: {
		name: 'Earthquake', icon: '🌋', sub: 'The ground shakes!', dur: 7, weight: () => (doneBuildings().length >= 5 ? 1.1 : 0),
		start(e) {
			e.d.next = 1.2
		},
		update(e) {
			fx.shakeT = 0.75 * env(e, 0.5, 1.5)
			if (Math.random() < 0.3) {
				const b = pick(G.S.buildings)
				if (b) emit(b.ox + 1, b.oy + 1.8, 'dust', 1)
			}
			if (e.t < e.d.next) return
			e.d.next += 2
			const list = doneBuildings()
			if (!list.length) return
			const b = pick(list)
			damageBuilding(b, full() ? 0.5 : 0.3)
			ticker(`The earthquake cracked the ${B[b.type].name}`, '🌋', '#c9b6a0')
		},
	},

	fire: {
		name: 'Fire!', icon: '🔥', sub: 'A building has caught fire', dur: 2, weight: () => (doneBuildings().length >= 3 ? 1.4 : 0),
		start() {
			const list = doneBuildings().filter((b) => b.type !== 'well' && b.type !== 'fountain')
			const b = list.length ? pick(list) : null
			if (b && ignite(b)) ticker(`The ${B[b.type].name} is on fire!`, '🔥', '#ff9a2e')
		},
	},

	locusts: {
		name: 'Locust Swarm', icon: '🦗', sub: 'Locusts descend on the fields', dur: 16, weight: () => (hasFields() && era() < 3 ? 1 : 0),
		start(e) {
			Object.assign(e.d, crossingPath())
			e.d.x = e.d.sx
			e.d.y = e.d.sy
			const S = G.S
			const lost = Math.floor(S.stock.food * (has('irrigation') ? 0.2 : 0.4))
			S.stock.food -= lost
			if (lost) ticker(`Locusts devoured ${lost} food from the stores`, '🦗', '#c9b6a0')
		},
		update(e) {
			const d = e.d, f = e.t / e.dur
			d.x = d.sx + (d.ex - d.sx) * f
			d.y = d.sy + (d.ey - d.sy) * f
			for (const b of G.S.buildings)
				if (b.field)
					for (const p of b.field.patches)
						if (p.s && dist2(p.x + 0.5, p.y + 0.5, d.x, d.y) < 9 && (!has('irrigation') || Math.random() < 0.5)) {
							p.s = 0
							p.t = 0
							emit(p.x + 0.5, p.y + 0.5, 'chaff', 4)
						}
		},
		focus: (e) => ({ x: e.d.x, y: e.d.y, s: 30 }),
	},

	festival: {
		name: 'Village Festival', icon: '🎉', sub: 'Music, dancing and far too much ale', good: true, dur: 30,
		weight: () => (popCount() >= 4 ? (has('festivals') || has('radio') ? 6 : 2) : 0),
		start() {
			for (const v of G.S.villagers) if (!v.sick && !v.fly) {
				interrupt(v)
				v.inside = false
			}
		},
		update() {
			if (Math.random() < 0.6) emit(CX, CY, 'confetti', 1)
		},
		end() {
			G.S.boost = 60
			ticker('The festival inspired everyone — work is faster for a while', '🎉', '#f2c75c')
		},
		focus: () => ({ x: CX, y: CY - 0.5, s: 46 }),
	},

	harvest: {
		name: 'Bountiful Harvest', icon: '🌾', sub: 'The fields ripen all at once', good: true, dur: 1, weight: () => (hasFields() ? 1.3 : 0),
		start() {
			const S = G.S
			for (const b of S.buildings) if (b.field) for (const p of b.field.patches) p.s = 2
			const bonus = 20 + Math.round(popCount() / 3)
			S.stock.food += bonus
			ticker(`A bountiful harvest: +${bonus} food`, '🌾', '#f2c75c')
		},
	},

	merchant: {
		name: 'Travelling Merchant', icon: '🐴', sub: 'A trader arrives with a cart full of goods', good: true, dur: 26, weight: () => (era() < 2 ? 1.4 : 0.6),
		start(e) {
			e.d.x = CX + 2.6
			e.d.y = Math.min(H - 2, CY + 22)
			e.d.paid = false
		},
		update(e) {
			const d = e.d
			const stopY = CY + 2.4, startY = Math.min(H - 2, CY + 22)
			if (e.t < 7) d.y = startY + (stopY - startY) * (e.t / 7)
			else if (e.t > e.dur - 7) d.y = stopY + (startY - stopY) * ((e.t - (e.dur - 7)) / 7)
			else d.y = stopY
			d.moving = e.t < 7 || e.t > e.dur - 7
			if (!d.paid && e.t >= 7) {
				d.paid = true
				const S = G.S
				const w = 15 + Math.round(popCount() / 4), s = 10 + Math.round(popCount() / 5)
				S.stock.wood += w
				S.stock.stone += s
				ticker(`The merchant traded goods: +${w} wood, +${s} stone`, '🐴', '#f2c75c')
			}
		},
		focus: (e) => (e.t < e.dur - 7 ? { x: e.d.x - 0.3, y: e.d.y - 0.6, s: 46 } : null),
	},

	// ------------------------------------------------------------- new encounters
	wolves: {
		name: 'Wolf Pack', icon: '🐺', sub: 'Howling from the forest edge…', dur: 22, weight: () => (era() <= 1 && popCount() >= 5 ? 1.2 : 0),
		start(e) {
			const p = edgePoint(8)
			const sheep = G.S.sheep.filter((s) => !s.gone)
			const prey = sheep.length ? pick(sheep) : null
			const villagers = G.S.villagers.filter((v) => !v.inside)
			const victim = !prey && villagers.length ? pick(villagers) : null
			const tgt = prey || victim || { x: CX, y: CY }
			e.d.pack = Array.from({ length: 3 + Math.floor(Math.random() * 3) }, (_, i) => {
				const a = spawnAgent('wolf', 'none', p.x + rand(-1.5, 1.5), p.y + rand(-1.5, 1.5), rand(3.2, 3.8))
				a.path = [[tgt.x + rand(-0.6, 0.6) + i * 0.1, tgt.y + rand(-0.4, 0.4)]]
				return a
			})
			Object.assign(e.d, { home: p, prey, victim, struck: false, guarded: countType('tower') > 0 })
		},
		update(e) {
			const d = e.d
			const pack: Agent[] = d.pack
			for (const v of G.S.villagers) {
				if (v.inside || v.fly) continue
				for (const w of pack) if (dist2(v.x, v.y, w.x, w.y) < 9 && v.anim !== 'walk') flee(v, w.x, w.y, 5)
			}
			if (!d.struck && pack.every((w) => !w.path.length)) {
				d.struck = true
				if (d.guarded) ticker('Arrows from the watchtower drove the wolves away!', '🏹', '#f2c75c')
				else if (d.prey) {
					d.prey.gone = true
					ticker('The wolves carried off a sheep', '🐺', '#c9b6a0')
				} else if (d.victim && full() && Math.random() < 0.5 && G.S.villagers.includes(d.victim)) killVillager(d.victim, 'was taken by wolves')
				else ticker('The wolves snapped at the villagers and ran off', '🐺', '#c9b6a0')
				for (const w of pack) {
					w.path = [[d.home.x + rand(-2, 2), d.home.y + rand(-2, 2)], [d.home.x < CX ? -5 : W + 5, d.home.y]]
					w.vanish = true
				}
			}
		},
		end(e) {
			const ids = new Set((e.d.pack as Agent[]).map((a) => a.id))
			removeAgents((a) => ids.has(a.id))
		},
		focus: (e) => {
			const c = centroid(e.d.pack)
			return c ? { x: c.x, y: c.y - 0.5, s: 38 } : null
		},
	},

	dragon: {
		name: 'Dragon!', icon: '🐉', sub: 'A dragon circles above the rooftops', dur: 18, weight: () => (era() === 0 && G.S.year > 20 ? 0.35 : 0),
		start(e) {
			Object.assign(e.d, crossingPath(), { burned: 0 })
			e.d.x = e.d.sx
			e.d.y = e.d.sy
		},
		update(e, dt) {
			const d = e.d, f = e.t / e.dur
			d.x = d.sx + (d.ex - d.sx) * f
			d.y = d.sy + (d.ey - d.sy) * f + Math.sin(e.t * 1.5) * 1.5
			d.dir = d.ex > d.sx ? 1 : -1
			d.breath = Math.sin(e.t * 0.9) > 0.55
			if (d.breath) {
				for (let i = 0; i < 3; i++) emit(d.x + d.dir * rand(0.8, 2.5), d.y + rand(1, 3.4), 'flame', 1)
				for (const b of G.S.buildings) {
					if (!b.done || b.fire || d.burned >= 2) continue
					const c = center(b)
					if (dist2(c.x, c.y, d.x + d.dir * 1.5, d.y + 3) < 3 && ignite(b)) {
						d.burned++
						ticker(`The dragon set the ${B[b.type].name} ablaze!`, '🐉', '#ff9a2e')
					}
				}
			}
			void dt
		},
		end: () => ticker('The dragon flew back to the mountains', '🐉'),
		focus: (e) => ({ x: e.d.x, y: e.d.y + 1.5, s: 30 }),
	},

	bandits: {
		name: 'Bandits', icon: '🥷', sub: 'Shady figures sneak towards the stores', dur: 24, weight: () => (era() <= 2 && G.S.stock.wood + G.S.stock.stone > 40 ? 1.2 : 0),
		start(e) {
			const p = edgePoint(7)
			e.d.gang = Array.from({ length: 3 }, () => {
				const a = spawnAgent('bandit', 'none', p.x + rand(-1, 1), p.y + rand(-1, 1), rand(2.6, 3))
				a.path = [[CX + 1.2 + rand(-0.6, 0.6), CY + 1.2 + rand(-0.3, 0.3)]]
				return a
			})
			Object.assign(e.d, { home: p, robbed: false })
		},
		update(e) {
			const d = e.d
			const gang: Agent[] = d.gang
			if (!d.robbed && gang.every((a) => !a.path.length)) {
				d.robbed = true
				const S = G.S
				const guard = countType('tower') + countType('keep')
				const share = guard ? 0.08 : 0.2
				const w = Math.floor(S.stock.wood * share), s = Math.floor(S.stock.stone * share), f = Math.floor(S.stock.food * share)
				S.stock.wood -= w
				S.stock.stone -= s
				S.stock.food -= f
				ticker(guard ? `The guards chased the bandits — they only got ${w + s + f} goods` : `Bandits stole ${w} wood, ${s} stone and ${f} food!`, '🥷', '#ff9a85')
				for (const a of gang) {
					a.carry = true
					a.spd = 3.4
					a.path = [[d.home.x, d.home.y], [d.home.x < CX ? -5 : W + 5, d.home.y]]
					a.vanish = true
				}
			}
		},
		end(e) {
			const ids = new Set((e.d.gang as Agent[]).map((a) => a.id))
			removeAgents((a) => ids.has(a.id))
		},
		focus: (e) => {
			const c = centroid(e.d.gang)
			return c ? { x: c.x, y: c.y - 0.5, s: 40 } : null
		},
	},

	wedding: {
		name: 'A Wedding!', icon: '💒', sub: 'Two villagers tie the knot on the square', good: true, dur: 26, weight: () => (popCount() >= 10 ? 1.3 : 0),
		start(e) {
			const S = G.S
			const pair = shuffle(S.villagers.filter((v) => !v.android)).slice(0, 2)
			e.d.names = pair.map((v) => v.name)
			e.d.party = true
			e.d.bride = spawnAgent('bride', 'none', CX - 0.35, CY - 1.0, 1)
			e.d.groom = spawnAgent('groom', 'none', CX + 0.35, CY - 1.0, 1)
			for (const v of S.villagers) if (!v.sick && !v.fly) {
				interrupt(v)
				v.inside = false
			}
			if (pair.length === 2) ticker(`${pair[0].name} and ${pair[1].name} are getting married!`, '💒', '#ffb3d0')
		},
		update() {
			if (Math.random() < 0.3) emit(CX + rand(-0.5, 0.5), CY - 1.6, 'heart', 1)
			if (Math.random() < 0.5) emit(CX, CY, 'confetti', 1)
		},
		end(e) {
			removeAgents((a) => a === e.d.bride || a === e.d.groom)
			const entryY = Math.min(H - 2, CY + 18)
			spawnVillager(entryY)
			spawnVillager(entryY)
			ticker('Relatives from afar decided to stay: +2 settlers', '💒', '#ffb3d0')
		},
		focus: () => ({ x: CX, y: CY - 0.8, s: 52 }),
	},

	treasure: {
		name: 'Buried Treasure', icon: '💰', sub: 'A digger hit something hard…', good: true, dur: 8, weight: () => 0.9,
		start(e) {
			const p = edgePoint(-2)
			const gold = 25 + Math.round(popCount() / 3)
			Object.assign(e.d, { x: p.x, y: p.y })
			G.S.stock.stone += gold
			G.S.stock.wood += Math.round(gold / 2)
			ticker(`Buried treasure! +${gold} stone and +${Math.round(gold / 2)} wood`, '💰', '#f2c75c')
		},
		update(e) {
			if (Math.random() < 0.5) emit(e.d.x, e.d.y - 0.3, 'spark', 1)
		},
		focus: (e) => ({ x: e.d.x, y: e.d.y - 0.5, s: 48 }),
	},

	comet: {
		name: 'Great Comet', icon: '🌠', sub: 'A blazing comet crosses the night sky', good: true, dur: 16, weight: () => (isNight() ? 0.8 : 0),
		start() {},
		end() {
			ticker('The comet inspired the scholars…', '🌠', '#9fd3ff')
			invent()
		},
	},

	aurora: {
		name: 'Northern Lights', icon: '🌌', sub: 'Ribbons of green and violet light the sky', good: true, dur: 32, weight: () => (isNight() ? 1.2 : 0),
		start() {},
	},

	blizzard: {
		name: 'Blizzard', icon: '🌨️', sub: 'Snow piles up and work slows down', dur: 36, weight: () => (calmWeather() ? 0 : 1),
		start(e) {
			G.S.chill = e.dur
		},
		update(e) {
			const k = env(e, 4, 6)
			fx.snowT = k
			fx.darkT = 0.12 * k
		},
	},

	eclipse: {
		name: 'Solar Eclipse', icon: '🌑', sub: 'The sun goes dark in the middle of the day', dur: 24, weight: () => (nightAmount() < 0.1 ? 0.7 : 0),
		start() {},
		update(e) {
			fx.eclipseT = 0.85 * env(e, 4, 4)
		},
	},

	ufo: {
		name: 'UFO Sighting', icon: '🛸', sub: 'A strange craft hovers over the fields', dur: 24, weight: () => (era() >= 1 ? 0.7 : 0.2),
		start(e) {
			const sheep = G.S.sheep.filter((s) => !s.gone)
			const people = G.S.villagers.filter((v) => !v.inside && !v.fly)
			let tgt: { x: number; y: number }
			if (sheep.length && Math.random() < 0.6) {
				e.d.sheep = pick(sheep)
				tgt = e.d.sheep
			} else if (people.length) {
				e.d.villager = pick(people)
				interrupt(e.d.villager)
				tgt = e.d.villager
			} else tgt = edgePoint(0)
			Object.assign(e.d, { tx: tgt.x, ty: tgt.y, x: tgt.x - 20, y: tgt.y - 8, lift: 0 })
		},
		update(e, dt) {
			const d = e.d
			if (e.t < 6) {
				const f = e.t / 6
				d.x = d.tx - 20 * (1 - f) ** 2
				d.y = d.ty - 3.5 - 4.5 * (1 - f) ** 2
			} else if (e.t < 16) {
				d.beam = true
				d.lift = Math.min(1, (e.t - 7) / 6)
				if (d.villager) {
					d.villager.abducted = true
					d.villager.x = d.tx
					d.villager.y = d.ty
				}
				if (d.sheep && d.lift >= 1) d.sheep.gone = true
			} else {
				d.beam = false
				const f = (e.t - 16) / 8
				d.x = d.tx + 30 * f * f
				d.y = d.ty - 3.5 - 8 * f * f
			}
			void dt
		},
		end(e) {
			const v = e.d.villager
			if (v) {
				v.abducted = false
				v.x = CX + rand(-1, 1)
				v.y = CY + 1.5
				emit(v.x, v.y - 0.3, 'spark', 12)
				ticker(`${v.name} was returned on the town square, babbling about the stars`, '🛸', '#9fd3ff')
			} else if (e.d.sheep) ticker('A sheep was beamed up and never seen again', '🛸', '#9fd3ff')
		},
		focus: (e) => ({ x: e.d.x, y: e.d.y + 2, s: 36 }),
	},

	blackout: {
		name: 'Blackout', icon: '🔌', sub: 'The power grid has failed!', dur: 26, weight: () => (era() >= 2 && isNight() ? 1.2 : 0),
		start() {
			pauseTraffic(26)
		},
		update() {
			fx.blackout = true
		},
		end: () => ticker('Power restored — the lights come back on', '💡', '#fff1c9'),
	},

	robots: {
		name: 'Robot Rampage', icon: '🤖', sub: 'Three androids have gone haywire!', dur: 24, weight: () => (has('androids') ? 0.9 : 0),
		start(e) {
			const p = edgePoint(-1)
			const targets = shuffle(doneBuildings()).slice(0, 2)
			e.d.bots = Array.from({ length: 3 }, () => {
				const a = spawnAgent('robot', 'none', p.x + rand(-1, 1), p.y + rand(-1, 1), 1.6)
				a.path = targets.map((b) => [b.ox + 1 + rand(-0.5, 0.5), b.oy + 2.3] as [number, number])
				return a
			})
			e.d.targets = targets
			e.d.smashed = 0
		},
		update(e) {
			const d = e.d
			const bots: Agent[] = d.bots
			for (const b of d.targets as Building[]) {
				if (b.repair || !G.S.buildings.includes(b)) continue
				if (bots.some((a) => dist2(a.x, a.y, b.ox + 1, b.oy + 2.3) < 1)) {
					damageBuilding(b, full() ? 0.5 : 0.25)
					d.smashed++
					ticker(`Rogue robots smashed the ${B[b.type].name}`, '🤖', '#ff9a85')
				}
			}
			if (e.t > e.dur - 3 && !d.rebooted) {
				d.rebooted = true
				for (const a of bots) emit(a.x, a.y - 0.4, 'spark', 10)
				ticker('The robots were rebooted and are friendly again', '🤖', '#7ff6ff')
			}
		},
		end(e) {
			const ids = new Set((e.d.bots as Agent[]).map((a) => a.id))
			removeAgents((a) => ids.has(a.id))
		},
		focus: (e) => {
			const c = centroid(e.d.bots)
			return c ? { x: c.x, y: c.y - 0.5, s: 40 } : null
		},
	},

	timeTraveler: {
		name: 'Time Traveller', icon: '⏱️', sub: 'A blue box materialises on the square', good: true, dur: 12, weight: () => (era() >= 3 ? 0.6 : 0),
		start(e) {
			fx.flash = 0.8
			e.d.box = spawnAgent('traveler', 'none', CX + 2.5, CY - 1.5, 0)
			emit(CX + 2.5, CY - 1.8, 'spark', 30)
		},
		end(e) {
			emit(CX + 2.5, CY - 1.8, 'spark', 30)
			removeAgents((a) => a === e.d.box)
			ticker('The traveller left a gift from the future…', '⏱️', '#9fd3ff')
			invent()
		},
		focus: () => ({ x: CX + 2, y: CY - 1.8, s: 52 }),
	},

	solarFlare: {
		name: 'Solar Flare', icon: '☀️', sub: 'Electronics glitch as the sun erupts', dur: 16, weight: () => (era() >= 3 ? 0.8 : 0),
		start() {
			pauseTraffic(16)
		},
		update(e) {
			fx.flareT = 0.3 * env(e, 1, 3) * (0.6 + 0.4 * Math.sin(e.t * 13))
		},
	},

	// ------------------------------------------------------------- rivals
	raid: {
		name: 'Rival Raid', icon: '⚔️', sub: 'The Sound and Lights crews are at it again', dur: 120, weight: () => 0,
		start: (e) => raidStart(e),
		update: (e, dt) => raidUpdate(e, dt),
		end: (e) => raidEnd(e),
		focus: (e) => raidFocus(e),
	},

	concert: {
		name: 'Festival of Sound & Light', icon: '🎶', sub: 'Soundhaven and Lumenfort put on a show together', good: true, dur: 36,
		weight: () => (G.S.rivals.length && G.S.year > 15 ? 0.9 : 0),
		start(e) {
			e.d.party = true
			for (const v of G.S.villagers) if (!v.sick && !v.fly) {
				interrupt(v)
				v.inside = false
			}
			// a few crew members from each village come to run the show
			const crew: Agent[] = []
			for (const id of ['sound', 'lights'] as const) {
				const r = getRival(id)
				for (let i = 0; i < 3; i++) {
					const a = spawnAgent('crew', id, r.x + rand(-1, 1), r.y + rand(-1, 1), 2.6)
					const side = id === 'sound' ? -1 : 1
					a.path = [[CX + side * rand(2.6, 3.4), CY - 2.2 + rand(-0.3, 0.3)]]
					crew.push(a)
				}
			}
			e.d.crew = crew
		},
		update() {
			if (Math.random() < 0.4) emit(CX, CY, 'confetti', 1)
		},
		end(e) {
			for (const a of e.d.crew as Agent[]) {
				const r = getRival(a.team as 'sound' | 'lights')
				a.path = [[r.x + rand(-2, 2), r.y + rand(-2, 2)]]
				a.vanish = true
			}
			G.S.boost = 60
			ticker(`${RIVAL_INFO.sound.name} and ${RIVAL_INFO.lights.name} shook hands — for now`, '🎶', '#f2c75c')
		},
		focus: () => ({ x: CX, y: CY - 1.2, s: 40 }),
	},
}

export function startEvent(type: string) {
	const S = G.S
	const def = EVENTS[type]
	if (!def) return
	if (S.event) endEvent()
	const e: ActiveEvent = { type, t: 0, dur: def.dur, d: {} }
	S.event = e
	S.lastEventYear = S.year
	def.start(e)
	banner(`${def.icon} ${def.name}`, def.sub, def.good ? 'good' : 'disaster')
	S.history.push({ year: S.year, icon: def.icon, text: def.name })
}

function endEvent() {
	const S = G.S
	if (!S.event) return
	const e = S.event
	S.event = null
	EVENTS[e.type]?.end?.(e)
}

/** Called once per year: maybe something happens */
export function maybeEvent() {
	const S = G.S
	if (settings.events === 'off' || S.event) return
	if (S.year < 6 || S.year - S.lastEventYear < 4) return
	if (Math.random() > 0.1) return
	const type = weightedPick(Object.keys(EVENTS), (k) => EVENTS[k].weight())
	if (type) startEvent(type)
}

export function eventFocus(): { x: number; y: number; s: number } | null {
	const e = G.S.event
	if (!e) return null
	return EVENTS[e.type]?.focus?.(e) ?? null
}

export function updateEvents(dt: number, rdt: number) {
	fx.darkT = fx.rainT = fx.tintT = fx.shakeT = fx.snowT = fx.eclipseT = fx.flareT = 0
	fx.blackout = false
	const e = G.S.event
	if (e) {
		e.t += dt
		const def = EVENTS[e.type]
		if (!def) G.S.event = null
		else {
			def.update?.(e, dt)
			if (e.t >= e.dur) endEvent()
		}
	}
	if (G.S.chill > 0) G.S.chill -= dt
	const k = Math.min(1, rdt * 2)
	fx.dark += (fx.darkT - fx.dark) * k
	fx.rain += (fx.rainT - fx.rain) * k
	fx.tint += (fx.tintT - fx.tint) * k
	fx.snow += (fx.snowT - fx.snow) * Math.min(1, rdt * 0.5)
	fx.eclipse += (fx.eclipseT - fx.eclipse) * Math.min(1, rdt * 1.2)
	fx.flare += (fx.flareT - fx.flare) * k
	fx.shake = Math.max(fx.shakeT, fx.shake - rdt * 1.2)
	fx.flash = Math.max(0, fx.flash - rdt * 3)
	fx.shield = Math.max(0, fx.shield - rdt * 0.5)
	for (let i = fx.bolts.length - 1; i >= 0; i--) {
		fx.bolts[i].life -= rdt
		if (fx.bolts[i].life <= 0) fx.bolts.splice(i, 1)
	}
}
