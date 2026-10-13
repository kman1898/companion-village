import { B } from '../data/buildings'
import { settings } from '../core/settings'
import { clamp, dist2, pick, rand, shuffle, weightedPick } from '../core/util'
import { emit } from '../render/particles'
import { banner, ticker } from '../ui/notify'
import { damageBuilding, destroyBuilding, ignite, villageBounds } from './buildings'
import { CX, CY, G, H, has, popCount, type ActiveEvent, type Building } from './state'
import { flee, interrupt, killVillager, TREE_REGROW } from './villagers'
import { forEachTreeNear } from './worldgen'

/** Visual state read by the renderer. *T fields are targets set every frame by the running event. */
export const fx = {
	dark: 0, darkT: 0,
	rain: 0, rainT: 0,
	tint: 0, tintT: 0,
	flash: 0,
	shake: 0, shakeT: 0,
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
}

const full = () => settings.events === 'full'
const env = (e: ActiveEvent, inT: number, outT: number) => clamp(Math.min(e.t / inT, (e.dur - e.t) / outT), 0, 1)
const doneBuildings = () => G.S.buildings.filter((b) => b.done && b.type !== 'graveyard')
const hasFields = () => G.S.buildings.some((b) => b.done && b.field)
const center = (b: Building) => ({ x: b.ox + 1, y: b.oy + 1.2 })

function bolt(x: number, y: number) {
	const pts: number[] = []
	let bx = x + rand(-2.5, 2.5), by = y - 16
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

export const EVENTS: Record<string, EventDef> = {
	storm: {
		name: 'Thunderstorm', icon: '⛈️', sub: 'Dark clouds roll over the village', dur: 32, weight: () => 3,
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
				if ((!has('lightningRods') || Math.random() < 0.3) && ignite(b)) ticker(`Lightning set the ${B[b.type].name} on fire!`, '🔥', '#ff9a2e')
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
		name: 'Tornado', icon: '🌪️', sub: 'A twister is tearing through the land', dur: 24, weight: () => 1.4,
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
				if (v.fly || dist2(v.x, v.y, d.x, d.y) > 1.5 * 1.5) continue
				interrupt(v)
				v.fly = { vx: rand(-4, 4), vy: rand(-3, 3), vz: rand(5, 8), z: 0 }
				v.doomed = full() && !has('stormCellars') && Math.random() < 0.3
			}
		},
		end(e) {
			if (e.d.wrecked) ticker(`The tornado has passed. ${e.d.wrecked} buildings need repairs.`, '🌪️')
		},
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
			if (has('astronomy')) {
				ticker('Astronomers spotted the meteor — everyone runs for cover!', '🔭', '#9fd3ff')
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
			fx.shake = 1.5
			fx.flash = 1
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
				if (full() && !has('astronomy')) killVillager(v, 'was struck by the meteor')
				else {
					interrupt(v)
					v.fly = { vx: (v.x - d.tx) * 2, vy: (v.y - d.ty) * 2, vz: 5, z: 0 }
				}
			}
			S.stock.stone += 25
			ticker('Meteorite iron recovered: +25 stone', '🪨')
		},
	},

	plague: {
		name: 'Plague', icon: '☠️', sub: 'A sickness spreads through the houses', dur: 45, weight: () => (popCount() >= 8 ? 1.2 : 0),
		start(e) {
			const S = G.S
			const n = Math.max(1, Math.round(S.villagers.length * rand(0.15, 0.3)))
			const deadly = full() ? (has('medicine') ? 0.25 : 0.5) : 0
			for (const v of shuffle([...S.villagers]).slice(0, n)) {
				v.sick = 1
				v.dieAt = Math.random() < deadly ? rand(6, e.dur - 4) : -1
			}
			e.d.dead = 0
			e.d.sick = n
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
				const houses = G.S.buildings.filter((b) => b.done && (b.type === 'house' || b.type === 'stonehouse'))
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
		name: 'Locust Swarm', icon: '🦗', sub: 'Locusts descend on the fields', dur: 16, weight: () => (hasFields() ? 1 : 0),
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
	},

	festival: {
		name: 'Village Festival', icon: '🎉', sub: 'Music, dancing and far too much ale', good: true, dur: 30,
		weight: () => (popCount() >= 4 ? (has('festivals') ? 6 : 2) : 0),
		start() {
			for (const v of G.S.villagers) if (!v.sick && !v.fly) interrupt(v)
		},
		update() {
			if (Math.random() < 0.6) emit(CX, CY, 'confetti', 1)
		},
		end() {
			G.S.boost = 60
			ticker('The festival inspired everyone — work is faster for a while', '🎉', '#f2c75c')
		},
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
		name: 'Travelling Merchant', icon: '🐴', sub: 'A trader arrives with a cart full of goods', good: true, dur: 26, weight: () => 1.4,
		start(e) {
			e.d.x = CX + 2.6
			e.d.y = Math.min(H - 2, CY + 22)
			e.d.paid = false
		},
		update(e, dt) {
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
			void dt
		},
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
	EVENTS[S.event.type]?.end?.(S.event)
	S.event = null
}

/** Called once per year: maybe something happens */
export function maybeEvent() {
	const S = G.S
	if (settings.events === 'off' || S.event) return
	if (S.year < 6 || S.year - S.lastEventYear < 5) return
	if (Math.random() > 0.08) return
	const type = weightedPick(Object.keys(EVENTS), (k) => EVENTS[k].weight())
	if (type) startEvent(type)
}

export function updateEvents(dt: number, rdt: number) {
	fx.darkT = fx.rainT = fx.tintT = fx.shakeT = 0
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
	const k = Math.min(1, rdt * 2)
	fx.dark += (fx.darkT - fx.dark) * k
	fx.rain += (fx.rainT - fx.rain) * k
	fx.tint += (fx.tintT - fx.tint) * k
	fx.shake = Math.max(fx.shakeT, fx.shake - rdt * 1.2)
	fx.flash = Math.max(0, fx.flash - rdt * 3)
	for (let i = fx.bolts.length - 1; i >= 0; i--) {
		fx.bolts[i].life -= rdt
		if (fx.bolts[i].life <= 0) fx.bolts.splice(i, 1)
	}
}

/** Where an auto-following camera should look during an event (null = frame the whole village) */
export function eventFocus(): { x: number; y: number; s: number } | null {
	const e = G.S.event
	if (!e) return null
	const d = e.d
	switch (e.type) {
		case 'tornado': return { x: d.x, y: d.y - 1.5, s: 34 }
		case 'meteor': return e.t < 5 ? { x: d.tx, y: d.ty - 1, s: 30 } : null
		case 'locusts': return { x: d.x, y: d.y, s: 30 }
		case 'merchant': return e.t < e.dur - 7 ? { x: d.x - 0.3, y: d.y - 0.6, s: 46 } : null
		case 'festival': return { x: CX, y: CY - 0.5, s: 46 }
		default: return null
	}
}
