import { B } from '../data/buildings'
import { TRIBES, type TribeId } from '../data/tribes'
import { settings } from '../core/settings'
import { clamp, dist2, pick, rand, shuffle, weightedPick } from '../core/util'
import { emit } from '../render/particles'
import { banner, ticker } from '../ui/notify'
import { removeAgents, spawnAgent, type Agent } from './agents'
import { countType, damageBuilding, destroyBuilding, ignite, isPlayer, news, villageBounds } from './buildings'
import { isNight, nightAmount } from './daynight'
import { adjust } from './diplomacy'
import { eraOf, invent } from './history'
import { Biome, G, H, has, idx, popOf, tribeOf, W, type ActiveEvent, type Building, type Tree, type Tribe } from './state'
import { pauseTraffic } from './traffic'
import { flee, interrupt, killVillager, release, spawnVillager, TREE_REGROW } from './villagers'
import { raidEnd, raidFocus, raidStart, raidUpdate } from './war'
import { forEachTreeNear } from './worldgen'

/** Visual state read by the renderer. *T fields are targets set every frame by the running events. */
export const fx = {
	dark: 0, darkT: 0,
	rain: 0, rainT: 0,
	snow: 0, snowT: 0,
	sand: 0, sandT: 0,
	eclipse: 0, eclipseT: 0,
	flare: 0, flareT: 0,
	flash: 0,
	shake: 0, shakeT: 0,
	shield: 0,
	blackout: new Set<TribeId>(),
	bolts: [] as { pts: number[]; life: number }[],
}

type Scope = 'tribe' | 'global' | 'war'
interface EventDef {
	name: string
	icon: string
	sub: string
	good?: boolean
	dur: number
	scope: Scope
	/** how likely, for this tribe (tribe events) or overall (global events) */
	weight: (T: Tribe) => number
	start(e: ActiveEvent, T: Tribe): void
	update?(e: ActiveEvent, dt: number, T: Tribe): void
	end?(e: ActiveEvent, T: Tribe): void
	focus?(e: ActiveEvent, T: Tribe): { x: number; y: number; s: number } | null
}

const full = () => settings.events === 'full'
const env = (e: ActiveEvent, inT: number, outT: number) => clamp(Math.min(e.t / inT, (e.dur - e.t) / outT), 0, 1)
const doneBuildings = (T: Tribe) => T.buildings.filter((b) => b.done && b.type !== 'graveyard' && b.type !== 'landmark')
const hasFields = (T: Tribe) => T.buildings.some((b) => b.done && b.field)
const center = (b: Building) => ({ x: b.ox + 1, y: b.oy + 1.2 })
const calmWeather = () => G.S.tribes.some((t) => has(t, 'weatherControl'))
const plaza = (T: Tribe) => ({ x: T.cx, y: T.cy - 0.6, s: 46 })

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

function crossingPath(T: Tribe) {
	const b = villageBounds(T)
	const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2
	const R = Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 + 6
	const a = Math.random() * Math.PI * 2
	const off = rand(-3, 3)
	return {
		sx: cx + Math.cos(a) * R, sy: cy + Math.sin(a) * R * 0.8,
		ex: cx - Math.cos(a) * R - Math.sin(a) * off, ey: cy - Math.sin(a) * R * 0.8 + Math.cos(a) * off,
	}
}

function edgePoint(T: Tribe, margin = 6) {
	const b = villageBounds(T)
	const side = Math.floor(Math.random() * 4)
	const x = side === 0 ? b.x0 - margin : side === 1 ? b.x1 + margin : rand(b.x0, b.x1)
	const y = side === 2 ? b.y0 - margin : side === 3 ? b.y1 + margin : rand(b.y0, b.y1)
	return { x: clamp(x, 3, W - 3), y: clamp(y, 8, H - 3) }
}

function shieldBlock(x: number, y: number) {
	fx.shield = 1
	emit(x, y, 'spark', 30)
	ticker('The force field held!', '🛡️', '#7ff6ff')
}

function centroid(list: Agent[]) {
	if (!list.length) return null
	let x = 0, y = 0
	for (const a of list) {
		x += a.x
		y += a.y
	}
	return { x: x / list.length, y: y / list.length }
}

const freeVillagers = (T: Tribe) => T.villagers.filter((v) => !v.inside && !v.away && !v.fly && !v.abducted)
const everyoneParty = (T: Tribe) => {
	for (const v of T.villagers)
		if (!v.sick && !v.fly && !v.away) {
			interrupt(v)
			v.inside = false
		}
}
/** a random tribe for global effects, favouring the one being watched */
const someTribe = () => (Math.random() < 0.5 ? tribeOf(G.S.player) : pick(G.S.tribes))

export const EVENTS: Record<string, EventDef> = {
	// =================================================================== weather (whole map)
	storm: {
		name: 'Thunderstorm', icon: '⛈️', sub: 'Dark clouds roll across the land', dur: 32, scope: 'global', weight: () => (calmWeather() ? 0 : 3),
		start(e) {
			e.d.next = 2.5
		},
		update(e, dt) {
			const k = env(e, 3, 4)
			fx.darkT = 0.38 * k
			fx.rainT = k
			e.d.next -= dt
			if (e.d.next > 0 || e.t < 2 || e.t > e.dur - 3) return
			e.d.next = rand(1.5, 3.5)
			const T = someTribe()
			const list = doneBuildings(T).filter((b) => !b.fire && b.type !== 'well' && b.type !== 'fountain')
			if (list.length && Math.random() < 0.45) {
				const b = pick(list)
				const c = center(b)
				bolt(c.x, c.y - 1)
				const rods = has(T, 'lightningRods') || has(T, 'satellites')
				if ((!rods || Math.random() < 0.3) && ignite(b)) news(T, `lightning set the ${B[b.type].name} on fire!`, '🔥', '#ff9a2e')
			} else {
				const vb = villageBounds(T)
				const tx = rand(vb.x0 - 8, vb.x1 + 8), ty = rand(vb.y0 - 8, vb.y1 + 8)
				let hit = false
				forEachTreeNear(G.world, tx, ty, 3, (t) => {
					if (hit || t.cut || t.park) return
					hit = true
					t.cut = 1
					t.rt = TREE_REGROW
					t.g = 0
					bolt(t.x, t.y - 1)
					emit(t.x, t.y - 0.5, 'flame', 10)
				})
				if (!hit) bolt(tx, ty)
			}
		},
	},
	blizzard: {
		name: 'Blizzard', icon: '🌨️', sub: 'Snow piles up and work slows down', dur: 36, scope: 'global', weight: () => (calmWeather() ? 0 : 1),
		start(e) {
			G.S.chill = e.dur
		},
		update(e) {
			const k = env(e, 4, 6)
			fx.snowT = k
			fx.darkT = 0.12 * k
		},
	},
	sandstorm: {
		name: 'Sandstorm', icon: '🏜️', sub: 'A wall of sand sweeps in from the desert', dur: 28, scope: 'global',
		weight: () => (calmWeather() ? 0 : G.S.tribes.some((t) => G.world.biome[idx(t.cx, t.cy)] === Biome.Desert) ? 1.5 : 0.3),
		start(e) {
			G.S.chill = e.dur
		},
		update(e) {
			fx.sandT = env(e, 3, 5)
		},
	},
	eclipse: {
		name: 'Solar Eclipse', icon: '🌑', sub: 'The sun goes dark in the middle of the day', dur: 24, scope: 'global', weight: () => (nightAmount() < 0.1 ? 0.7 : 0),
		start() {},
		update(e) {
			fx.eclipseT = 0.85 * env(e, 4, 4)
		},
	},
	solarFlare: {
		name: 'Solar Flare', icon: '☀️', sub: 'Electronics glitch as the sun erupts', dur: 16, scope: 'global',
		weight: () => (G.S.tribes.some((t) => eraOf(t) >= 3) ? 0.8 : 0),
		start() {
			pauseTraffic(16)
		},
		update(e) {
			fx.flareT = 0.3 * env(e, 1, 3) * (0.6 + 0.4 * Math.sin(e.t * 13))
		},
	},
	aurora: {
		name: 'Northern Lights', icon: '🌌', sub: 'Ribbons of green and violet light the sky', good: true, dur: 32, scope: 'global', weight: () => (isNight() ? 1.2 : 0),
		start() {},
	},
	comet: {
		name: 'Great Comet', icon: '🌠', sub: 'A blazing comet crosses the night sky', good: true, dur: 16, scope: 'global', weight: () => (isNight() ? 0.7 : 0),
		start() {},
		end() {
			const T = pick(G.S.tribes)
			const inv = invent(T, true)
			if (inv) news(T, `the comet inspired the scholars: ${inv.name}!`, '🌠', '#9fd3ff')
		},
	},
	meteorShower: {
		name: 'Meteor Shower', icon: '✨', sub: 'Shooting stars rain down all night', good: true, dur: 30, scope: 'global', weight: () => (isNight() ? 1 : 0),
		start(e) {
			e.d.next = 2
		},
		update(e, dt) {
			e.d.next -= dt
			if (e.d.next > 0) return
			e.d.next = rand(3, 6)
			const T = pick(G.S.tribes)
			const p = edgePoint(T, 4)
			emit(p.x, p.y, 'flame', 12)
			emit(p.x, p.y, 'spark', 12)
			T.stock.stone += 5
		},
		end: () => ticker('Meteorite fragments collected: every tribe got some stone', '✨'),
	},
	contest: {
		name: 'Battle of the Bands', icon: '🎸', sub: 'Pixels vs Noises vs Lampys — who puts on the best show?', good: true, dur: 40, scope: 'global',
		weight: () => (G.S.tribes.every((t) => popOf(t) >= 8) ? 1 : 0),
		start(e) {
			e.d.party = true
			e.d.scores = { pixels: 0, noises: 0, lampys: 0 }
			for (const T of G.S.tribes) everyoneParty(T)
		},
		update(e, dt) {
			for (const T of G.S.tribes) {
				const sig = T.inventions.filter((i) => ['mosaics', 'photography', 'television', 'ledWalls', 'holograms', 'warDrums', 'phonograph', 'loudspeakers', 'subwoofers', 'sonicCannon', 'lanterns', 'limelight', 'movingHeads', 'lasers', 'photonLances'].includes(i)).length
				e.d.scores[T.id] += dt * rand(0, 2 + sig * 0.5 + eraOf(T) * 0.3 + T.prestige * 0.01)
				if (Math.random() < 0.3) emit(T.cx, T.cy, 'confetti', 1)
			}
		},
		end(e) {
			const sc = e.d.scores as Record<TribeId, number>
			const ranking = (Object.keys(sc) as TribeId[]).sort((a, b) => sc[b] - sc[a])
			const win = tribeOf(ranking[0])
			win.prestige += 6
			win.boost = 60
			for (const o of ranking.slice(1)) adjust(o, win.id, -3)
			const table = ranking.map((id) => `${TRIBES[id].name} ${Math.round(sc[id])}`).join(' · ')
			banner(`🏆 ${TRIBES[win.id].name} win the Battle of the Bands!`, table, 'good')
			G.S.history.push({ year: win.year, icon: '🎸', text: `${TRIBES[win.id].name} won the Battle of the Bands` })
		},
		focus: () => plaza(tribeOf(G.S.player)),
	},

	// =================================================================== one tribe
	tornado: {
		name: 'Tornado', icon: '🌪️', sub: 'A twister is tearing through the land', dur: 24, scope: 'tribe', weight: () => (calmWeather() ? 0 : 1.3),
		start(e, T) {
			Object.assign(e.d, crossingPath(T), { hit: new Set<number>(), wrecked: 0 })
			e.d.x = e.d.sx
			e.d.y = e.d.sy
		},
		update(e, dt, T) {
			const d = e.d, f = e.t / e.dur
			const px = -(d.ey - d.sy), py = d.ex - d.sx, pl = Math.hypot(px, py) || 1
			const wob = Math.sin(e.t * 1.3) * 1.4
			d.x = d.sx + (d.ex - d.sx) * f + (px / pl) * wob
			d.y = d.sy + (d.ey - d.sy) * f + (py / pl) * wob
			fx.shakeT = Math.max(fx.shakeT, 0.08)
			if (Math.random() < dt * 30) emit(d.x + rand(-1, 1), d.y - rand(0, 2.5), 'debris', 1)
			if (Math.random() < dt * 10) emit(d.x, d.y, 'dust', 1)
			if (has(T, 'forceFields')) {
				const vb = villageBounds(T)
				if (d.x > vb.x0 && d.x < vb.x1 && d.y > vb.y0 && d.y < vb.y1 && !d.blocked) {
					d.blocked = true
					shieldBlock(d.x, d.y)
					e.t = Math.max(e.t, e.dur - 2)
				}
				return
			}
			for (const b of T.buildings) {
				if (d.hit.has(b.id) || b.type === 'graveyard' || b.type === 'landmark') continue
				const c = center(b)
				if (dist2(c.x, c.y, d.x, d.y) < 1.9 * 1.9) {
					d.hit.add(b.id)
					damageBuilding(b, full() ? 0.75 : 0.45)
					d.wrecked++
				}
			}
			forEachTreeNear(G.world, d.x, d.y, 1.3, (t) => {
				if (t.cut || t.park) return
				t.cut = 1
				t.rt = TREE_REGROW * 2
				t.g = 0
				emit(t.x, t.y - 0.5, 'leaf', 6)
			})
			for (const v of T.villagers) {
				if (v.fly || v.inside || v.away || dist2(v.x, v.y, d.x, d.y) > 1.5 * 1.5) continue
				interrupt(v)
				v.fly = { vx: rand(-4, 4), vy: rand(-3, 3), vz: rand(5, 8), z: 0 }
				v.doomed = full() && !has(T, 'stormCellars') && Math.random() < 0.3
			}
		},
		end(e, T) {
			if (e.d.wrecked) news(T, `the tornado wrecked ${e.d.wrecked} buildings`, '🌪️', '#c9b6a0')
		},
		focus: (e) => ({ x: e.d.x, y: e.d.y - 1.5, s: 34 }),
	},

	meteor: {
		name: 'Meteor Strike', icon: '☄️', sub: 'Something is falling from the sky…', dur: 7, scope: 'tribe', weight: () => 0.8,
		start(e, T) {
			const list = doneBuildings(T)
			let tx: number, ty: number
			if (list.length && Math.random() < 0.55) {
				const c = center(pick(list))
				tx = c.x
				ty = c.y
			} else {
				const b = villageBounds(T)
				tx = rand(b.x0, b.x1)
				ty = rand(b.y0, b.y1)
			}
			Object.assign(e.d, { tx, ty, sx: tx + 10, sy: ty - 18, hit: false, ringT: -1 })
			if (has(T, 'astronomy') || has(T, 'satellites')) {
				news(T, `${has(T, 'satellites') ? 'satellites' : 'astronomers'} spotted the meteor — everyone runs for cover!`, '🔭', '#9fd3ff')
				for (const v of T.villagers) if (!v.away && dist2(v.x, v.y, tx, ty) < 20) flee(v, tx, ty, 5)
			}
		},
		update(e, dt, T) {
			const d = e.d
			if (d.ringT >= 0) d.ringT += dt
			if (!d.hit) {
				const f = Math.min(1, e.t / 2.2) ** 2
				emit(d.sx + (d.tx - d.sx) * f, d.sy + (d.ty - d.sy) * f, 'flame', 2)
			}
			if (d.hit || e.t < 2.2) return
			d.hit = true
			d.ringT = 0
			fx.flash = 1
			if (has(T, 'forceFields')) {
				d.ty -= 3
				emit(d.tx, d.ty, 'flame', 30)
				shieldBlock(d.tx, d.ty)
				return
			}
			fx.shake = 1.5
			emit(d.tx, d.ty, 'rock', 40)
			emit(d.tx, d.ty - 0.3, 'flame', 30)
			emit(d.tx, d.ty, 'dust', 30)
			G.S.craters.push({ x: d.tx, y: d.ty, r: 2, until: G.S.time + 900 })
			forEachTreeNear(G.world, d.tx, d.ty, 2.4, (t) => {
				if (t.sp !== 6) t.gone = 1
			})
			for (const k of G.world.rocks) if (dist2(k.x, k.y, d.tx, d.ty) < 5.5) k.gone = 1
			for (const b of [...T.buildings]) {
				const c = center(b)
				if (dist2(c.x, c.y, d.tx, d.ty) > 2.4 * 2.4) continue
				if (full() && b.type !== 'graveyard') destroyBuilding(T, b)
				else damageBuilding(b, 0.9)
			}
			for (const v of [...T.villagers]) {
				if (v.away || dist2(v.x, v.y, d.tx, d.ty) > 2.2 * 2.2) continue
				if (full() && !has(T, 'astronomy') && !has(T, 'satellites')) killVillager(v, 'was struck by the meteor')
				else {
					interrupt(v)
					v.inside = false
					v.fly = { vx: (v.x - d.tx) * 2, vy: (v.y - d.ty) * 2, vz: 5, z: 0 }
				}
			}
			T.stock.stone += 25
		},
		focus: (e) => (e.t < 5 ? { x: e.d.tx, y: e.d.ty - 1, s: 30 } : null),
	},

	plague: {
		name: 'Plague', icon: '☠️', sub: 'A sickness spreads through the houses', dur: 45, scope: 'tribe',
		weight: (T) => (popOf(T) >= 8 ? (has(T, 'vaccination') ? 0.4 : 1.1) : 0),
		start(e, T) {
			const n = Math.max(1, Math.round(T.villagers.length * rand(0.15, 0.3)))
			const deadly = full() ? (has(T, 'vaccination') ? 0.08 : has(T, 'medicine') ? 0.25 : 0.5) : 0
			for (const v of shuffle([...T.villagers]).slice(0, n)) {
				v.sick = 1
				v.dieAt = Math.random() < deadly && !v.android ? rand(6, e.dur - 4) : -1
			}
			e.d.dead = 0
		},
		update(e, dt, T) {
			for (const v of [...T.villagers]) {
				if (v.sick && v.dieAt !== undefined && v.dieAt > 0 && e.t >= v.dieAt) {
					killVillager(v, 'died of the plague', true)
					e.d.dead++
				}
			}
			if (Math.random() < 0.15) {
				const houses = T.buildings.filter((b) => b.done && B[b.type].cap)
				if (houses.length) {
					const b = pick(houses)
					emit(b.ox + 1, b.oy + 0.8, 'miasma', 1)
				}
			}
			void dt
		},
		end(e, T) {
			for (const v of T.villagers) {
				v.sick = undefined
				v.dieAt = undefined
			}
			news(T, e.d.dead ? `the plague has passed — ${e.d.dead} villagers were lost` : `the plague has passed. Everyone recovered.`, '☠️', '#8fc24a')
		},
	},

	earthquake: {
		name: 'Earthquake', icon: '🌋', sub: 'The ground shakes!', dur: 7, scope: 'tribe', weight: (T) => (doneBuildings(T).length >= 5 ? 1 : 0),
		start(e) {
			e.d.next = 1.2
		},
		update(e, dt, T) {
			fx.shakeT = Math.max(fx.shakeT, isPlayer(T) ? 0.75 * env(e, 0.5, 1.5) : 0.2)
			if (e.t < e.d.next) return
			e.d.next += 2
			const list = doneBuildings(T)
			if (!list.length) return
			damageBuilding(pick(list), full() ? 0.5 : 0.3)
			void dt
		},
		end: (e, T) => news(T, 'the earthquake cracked several buildings', '🌋', '#c9b6a0'),
	},

	fire: {
		name: 'Fire!', icon: '🔥', sub: 'A building has caught fire', dur: 2, scope: 'tribe', weight: (T) => (doneBuildings(T).length >= 3 ? 1.3 : 0),
		start(e, T) {
			const list = doneBuildings(T).filter((b) => b.type !== 'well' && b.type !== 'fountain')
			const b = list.length ? pick(list) : null
			if (b && ignite(b)) news(T, `the ${B[b.type].name} is on fire!`, '🔥', '#ff9a2e')
		},
	},

	forestFire: {
		name: 'Forest Fire', icon: '🔥', sub: 'The woods outside the village are ablaze', dur: 30, scope: 'tribe', weight: () => (calmWeather() ? 0 : 0.9),
		start(e, T) {
			const p = edgePoint(T, 8)
			const burning: Tree[] = []
			forEachTreeNear(G.world, p.x, p.y, 6, (t) => {
				if (!burning.length && !t.cut && !t.park) burning.push(t)
			})
			Object.assign(e.d, { burning: burning.map((t) => ({ t, life: 2.5 })), burned: 0, x: p.x, y: p.y })
		},
		update(e, dt, T) {
			const d = e.d
			const next: { t: Tree; life: number }[] = []
			for (const b of d.burning as { t: Tree; life: number }[]) {
				b.life -= dt
				if (Math.random() < dt * 8) emit(b.t.x, b.t.y - 0.6, 'flame', 1)
				if (Math.random() < dt * 2) emit(b.t.x, b.t.y - 1, 'smoke', 1)
				if (b.life > 0) {
					next.push(b)
					continue
				}
				b.t.cut = 1
				b.t.rt = TREE_REGROW * 3
				b.t.g = 0
				d.burned++
				if (e.t < e.dur - 6 && d.burned < 90)
					forEachTreeNear(G.world, b.t.x, b.t.y, 1.7, (n) => {
						if (!n.cut && !n.park && Math.random() < 0.55 && !next.some((x) => x.t === n)) next.push({ t: n, life: rand(1.5, 3) })
					})
			}
			d.burning = next
			for (const v of T.villagers) if (!v.away && next.some((b) => dist2(b.t.x, b.t.y, v.x, v.y) < 6) && v.anim !== 'walk') flee(v, v.x + rand(-1, 1), v.y + 1, 4)
			const c = centroid(next.map((b) => ({ x: b.t.x, y: b.t.y }) as Agent))
			if (c) {
				d.x = c.x
				d.y = c.y
			}
		},
		end: (e, T) => news(T, `the forest fire burned ${e.d.burned} trees`, '🔥', '#ff9a2e'),
		focus: (e) => ({ x: e.d.x, y: e.d.y - 0.5, s: 30 }),
	},

	flood: {
		name: 'Flood', icon: '🌊', sub: 'The water is rising!', dur: 22, scope: 'tribe',
		weight: (T) => {
			for (let r = 0; r < 18; r++) if (G.world.water[idx(clamp(T.cx + r, 0, W - 1), T.cy)] || G.world.water[idx(clamp(T.cx - r, 0, W - 1), T.cy)]) return calmWeather() ? 0 : 1
			return 0
		},
		start(e, T) {
			const tiles: number[] = []
			for (let y = T.cy - 22; y <= T.cy + 22; y++)
				for (let x = T.cx - 26; x <= T.cx + 26; x++) {
					if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue
					const i = idx(x, y)
					if (G.world.water[i]) continue
					let near = false
					for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (G.world.water[idx(x + dx, y + dy)]) { near = true; break }
					if (near) tiles.push(i)
				}
			e.d.tiles = tiles.slice(0, 500)
			const set = new Set(e.d.tiles)
			let hit = 0
			for (const b of T.buildings) {
				if (b.field) for (const p of b.field.patches) if (set.has(idx(p.x, p.y))) p.s = 0
				if (set.has(idx(b.ox, b.oy + 1)) || set.has(idx(b.ox + 1, b.oy + 1))) {
					damageBuilding(b, full() ? 0.4 : 0.2)
					hit++
				}
			}
			e.d.hit = hit
		},
		end: (e, T) => news(T, `the floodwater receded${e.d.hit ? ` — ${e.d.hit} buildings need repairs` : ''}`, '🌊', '#9fd3ff'),
		focus: (e, T) => ({ x: T.cx, y: T.cy, s: 22 }),
	},

	locusts: {
		name: 'Locust Swarm', icon: '🦗', sub: 'Locusts descend on the fields', dur: 16, scope: 'tribe', weight: (T) => (hasFields(T) && eraOf(T) < 3 ? 1 : 0),
		start(e, T) {
			Object.assign(e.d, crossingPath(T))
			e.d.x = e.d.sx
			e.d.y = e.d.sy
			const lost = Math.floor(T.stock.food * (has(T, 'irrigation') ? 0.2 : 0.4))
			T.stock.food -= lost
		},
		update(e, dt, T) {
			const d = e.d, f = e.t / e.dur
			d.x = d.sx + (d.ex - d.sx) * f
			d.y = d.sy + (d.ey - d.sy) * f
			for (const b of T.buildings)
				if (b.field)
					for (const p of b.field.patches)
						if (p.s && dist2(p.x + 0.5, p.y + 0.5, d.x, d.y) < 9 && (!has(T, 'irrigation') || Math.random() < 0.5)) {
							p.s = 0
							p.t = 0
							emit(p.x + 0.5, p.y + 0.5, 'chaff', 4)
						}
			void dt
		},
		focus: (e) => ({ x: e.d.x, y: e.d.y, s: 30 }),
	},

	wolves: {
		name: 'Wolf Pack', icon: '🐺', sub: 'Howling from the forest edge…', dur: 22, scope: 'tribe', weight: (T) => (eraOf(T) <= 1 && popOf(T) >= 5 ? 1.1 : 0),
		start(e, T) {
			const p = edgePoint(T, 8)
			const sheep = T.sheep.filter((s) => !s.gone)
			const prey = sheep.length ? pick(sheep) : null
			const vs = freeVillagers(T)
			const victim = !prey && vs.length ? pick(vs) : null
			const tgt = prey || victim || { x: T.cx, y: T.cy }
			e.d.pack = Array.from({ length: 3 + Math.floor(Math.random() * 3) }, (_, i) => {
				const a = spawnAgent('wolf', 'none', p.x + rand(-1.5, 1.5), p.y + rand(-1.5, 1.5), rand(3.2, 3.8))
				a.path = [[tgt.x + rand(-0.6, 0.6) + i * 0.1, tgt.y + rand(-0.4, 0.4)]]
				return a
			})
			Object.assign(e.d, { home: p, prey, victim, struck: false, guarded: countType(T, 'tower') + countType(T, 'barracks') > 0 })
		},
		update(e, dt, T) {
			const d = e.d
			const pack: Agent[] = d.pack
			for (const v of T.villagers) {
				if (v.inside || v.fly || v.away) continue
				for (const w of pack) if (dist2(v.x, v.y, w.x, w.y) < 9 && v.anim !== 'walk') flee(v, w.x, w.y, 5)
			}
			if (!d.struck && pack.every((w) => !w.path.length)) {
				d.struck = true
				if (d.guarded) news(T, 'guards drove the wolves away!', '🏹', '#f2c75c')
				else if (d.prey) {
					d.prey.gone = true
					news(T, 'the wolves carried off a sheep', '🐺', '#c9b6a0')
				} else if (d.victim && full() && Math.random() < 0.5 && T.villagers.includes(d.victim)) killVillager(d.victim, 'was taken by wolves')
				for (const w of pack) {
					w.path = [[d.home.x + rand(-2, 2), d.home.y + rand(-2, 2)], [d.home.x < T.cx ? d.home.x - 15 : d.home.x + 15, d.home.y]]
					w.vanish = true
				}
			}
			void dt
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
		name: 'Dragon!', icon: '🐉', sub: 'A dragon circles above the rooftops', dur: 18, scope: 'tribe', weight: (T) => (eraOf(T) === 0 && T.year > 20 ? 0.35 : 0),
		start(e, T) {
			Object.assign(e.d, crossingPath(T), { burned: 0 })
			e.d.x = e.d.sx
			e.d.y = e.d.sy
		},
		update(e, dt, T) {
			const d = e.d, f = e.t / e.dur
			d.x = d.sx + (d.ex - d.sx) * f
			d.y = d.sy + (d.ey - d.sy) * f + Math.sin(e.t * 1.5) * 1.5
			d.dir = d.ex > d.sx ? 1 : -1
			d.breath = Math.sin(e.t * 0.9) > 0.55
			if (d.breath) {
				for (let i = 0; i < 3; i++) emit(d.x + d.dir * rand(0.8, 2.5), d.y + rand(1, 3.4), 'flame', 1)
				for (const b of T.buildings) {
					if (!b.done || b.fire || d.burned >= 2) continue
					const c = center(b)
					if (dist2(c.x, c.y, d.x + d.dir * 1.5, d.y + 3) < 3 && ignite(b)) d.burned++
				}
			}
			void dt
		},
		focus: (e) => ({ x: e.d.x, y: e.d.y + 1.5, s: 30 }),
	},

	bandits: {
		name: 'Bandits', icon: '🥷', sub: 'Shady figures sneak towards the stores', dur: 24, scope: 'tribe',
		weight: (T) => (eraOf(T) <= 2 && T.stock.wood + T.stock.stone > 40 ? 1.1 : 0),
		start(e, T) {
			const p = edgePoint(T, 7)
			e.d.gang = Array.from({ length: 3 }, () => {
				const a = spawnAgent('bandit', 'none', p.x + rand(-1, 1), p.y + rand(-1, 1), rand(2.6, 3))
				a.path = [[T.cx + 1.2 + rand(-0.6, 0.6), T.cy + 1.2 + rand(-0.3, 0.3)]]
				return a
			})
			Object.assign(e.d, { home: p, robbed: false })
		},
		update(e, dt, T) {
			const d = e.d
			const gang: Agent[] = d.gang
			if (!d.robbed && gang.every((a) => !a.path.length)) {
				d.robbed = true
				const guard = countType(T, 'tower') + countType(T, 'keep') + countType(T, 'barracks')
				const share = guard ? 0.06 : 0.2
				let total = 0
				for (const r of ['wood', 'stone', 'food'] as const) {
					const n = Math.floor(T.stock[r] * share)
					T.stock[r] -= n
					total += n
				}
				news(T, guard ? `the guards chased the bandits — they only got ${total} goods` : `bandits stole ${total} goods!`, '🥷', '#ff9a85')
				for (const a of gang) {
					a.carry = true
					a.spd = 3.4
					a.path = [[d.home.x, d.home.y], [d.home.x < T.cx ? d.home.x - 15 : d.home.x + 15, d.home.y]]
					a.vanish = true
				}
			}
			void dt
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

	robots: {
		name: 'Robot Rampage', icon: '🤖', sub: 'Androids have gone haywire!', dur: 24, scope: 'tribe', weight: (T) => (has(T, 'androids') ? 0.8 : 0),
		start(e, T) {
			const p = edgePoint(T, -1)
			const targets = shuffle(doneBuildings(T)).slice(0, 2)
			e.d.bots = Array.from({ length: 3 }, () => {
				const a = spawnAgent('robot', 'none', p.x + rand(-1, 1), p.y + rand(-1, 1), 1.6)
				a.path = targets.map((b) => [b.ox + 1 + rand(-0.5, 0.5), b.oy + 2.3] as [number, number])
				return a
			})
			e.d.targets = targets
		},
		update(e, dt, T) {
			for (const b of e.d.targets as Building[]) {
				if (b.repair || !T.buildings.includes(b)) continue
				if ((e.d.bots as Agent[]).some((a) => dist2(a.x, a.y, b.ox + 1, b.oy + 2.3) < 1)) damageBuilding(b, full() ? 0.5 : 0.25)
			}
			if (e.t > e.dur - 3 && !e.d.rebooted) {
				e.d.rebooted = true
				for (const a of e.d.bots as Agent[]) emit(a.x, a.y - 0.4, 'spark', 10)
			}
			void dt
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

	blackout: {
		name: 'Blackout', icon: '🔌', sub: 'The power grid has failed!', dur: 26, scope: 'tribe', weight: (T) => (eraOf(T) >= 2 && isNight() ? 1.1 : 0),
		start() {
			pauseTraffic(10)
		},
		update(e, dt, T) {
			fx.blackout.add(T.id)
			void dt
		},
	},

	ufo: {
		name: 'UFO Sighting', icon: '🛸', sub: 'A strange craft hovers over the fields', dur: 24, scope: 'tribe', weight: (T) => (eraOf(T) >= 1 ? 0.6 : 0.2),
		start(e, T) {
			const sheep = T.sheep.filter((s) => !s.gone)
			const people = freeVillagers(T)
			let tgt: { x: number; y: number }
			if (sheep.length && Math.random() < 0.6) {
				e.d.sheep = pick(sheep)
				tgt = e.d.sheep
			} else if (people.length) {
				e.d.villager = pick(people)
				interrupt(e.d.villager)
				tgt = e.d.villager
			} else tgt = edgePoint(T, 0)
			Object.assign(e.d, { tx: tgt.x, ty: tgt.y, x: tgt.x - 20, y: tgt.y - 8, lift: 0 })
		},
		update(e) {
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
		},
		end(e, T) {
			const v = e.d.villager
			if (v) {
				v.abducted = false
				v.x = T.cx + rand(-1, 1)
				v.y = T.cy + 1.5
				emit(v.x, v.y - 0.3, 'spark', 12)
				news(T, `${v.name} was returned on the town square, babbling about the stars`, '🛸', '#9fd3ff')
			}
		},
		focus: (e) => ({ x: e.d.x, y: e.d.y + 2, s: 36 }),
	},

	// =================================================================== good times
	festival: {
		name: 'Village Festival', icon: '🎉', sub: 'Music, dancing and far too much ale', good: true, dur: 30, scope: 'tribe',
		weight: (T) => (popOf(T) >= 4 ? (has(T, 'festivals') || has(T, 'radio') || has(T, 'phonograph') ? 5 : 2) : 0),
		start(e, T) {
			e.d.party = true
			everyoneParty(T)
		},
		update(e, dt, T) {
			if (Math.random() < 0.6) emit(T.cx, T.cy, 'confetti', 1)
			void dt
		},
		end(e, T) {
			T.boost = 60
			news(T, 'the festival inspired everyone — work is faster for a while', '🎉', '#f2c75c')
		},
		focus: (e, T) => plaza(T),
	},

	wedding: {
		name: 'A Wedding!', icon: '💒', sub: 'Two villagers tie the knot on the square', good: true, dur: 26, scope: 'tribe', weight: (T) => (popOf(T) >= 10 ? 1.2 : 0),
		start(e, T) {
			// sometimes the couple comes from two different tribes
			const others = G.S.tribes.filter((o) => o !== T && o.villagers.length > 0)
			e.d.party = true
			e.d.cross = others.length && Math.random() < 0.35 ? pick(others).id : null
			e.d.bride = spawnAgent('bride', 'none', T.cx - 0.35, T.cy - 1.0, 1)
			e.d.groom = spawnAgent('groom', 'none', T.cx + 0.35, T.cy - 1.0, 1)
			everyoneParty(T)
			if (e.d.cross) {
				adjust(T.id, e.d.cross, 15)
				news(T, `a wedding with a sweetheart from ${TRIBES[e.d.cross as TribeId].name}! Relations warm up.`, '💒', '#ffb3d0')
			}
		},
		update(e, dt, T) {
			if (Math.random() < 0.3) emit(T.cx + rand(-0.5, 0.5), T.cy - 1.6, 'heart', 1)
			if (Math.random() < 0.5) emit(T.cx, T.cy, 'confetti', 1)
			void dt
		},
		end(e, T) {
			removeAgents((a) => a === e.d.bride || a === e.d.groom)
			spawnVillager(T)
			spawnVillager(T)
		},
		focus: (e, T) => ({ x: T.cx, y: T.cy - 0.8, s: 52 }),
	},

	babyBoom: {
		name: 'Baby Boom', icon: '👶', sub: 'Cradles everywhere!', good: true, dur: 3, scope: 'tribe', weight: (T) => (popOf(T) >= 12 ? 0.8 : 0),
		start(e, T) {
			const n = 3 + Math.floor(Math.random() * 4)
			for (let i = 0; i < n; i++) spawnVillager(T, true)
			news(T, `a baby boom: ${n} new villagers`, '👶', '#ffb3d0')
		},
	},

	migrants: {
		name: 'Migrants', icon: '🧳', sub: 'Families arrive from another tribe', good: true, dur: 3, scope: 'tribe', weight: (T) => (T.prestige > 4 ? 0.7 : 0.2),
		start(e, T) {
			const from = pick(G.S.tribes.filter((o) => o !== T && o.villagers.length > 12))
			if (!from) return
			const n = Math.min(2 + Math.floor(Math.random() * 4), Math.floor(from.villagers.length / 10))
			const movers = shuffle(from.villagers.filter((v) => !v.away && !v.abducted && !v.fly)).slice(0, n)
			for (const v of movers) {
				release(v)
				from.villagers.splice(from.villagers.indexOf(v), 1)
				v.tribe = T.id
				v.inside = false
				v.plan = [{ k: 'walk', x: T.cx + rand(-2, 2), y: T.cy + rand(1, 2) }]
				v.step = null
				T.villagers.push(v)
			}
			adjust(T.id, from.id, -6)
			news(T, `${movers.length} villagers left ${TRIBES[from.id].name} to live here`, '🧳', '#9fd3ff')
		},
	},

	harvest: {
		name: 'Bountiful Harvest', icon: '🌾', sub: 'The fields ripen all at once', good: true, dur: 1, scope: 'tribe', weight: (T) => (hasFields(T) ? 1.2 : 0),
		start(e, T) {
			for (const b of T.buildings) if (b.field) for (const p of b.field.patches) p.s = 2
			T.stock.food += 20 + Math.round(popOf(T) / 3)
		},
	},

	treasure: {
		name: 'Buried Treasure', icon: '💰', sub: 'A digger hit something hard…', good: true, dur: 8, scope: 'tribe', weight: () => 0.8,
		start(e, T) {
			const p = edgePoint(T, -2)
			const gold = 25 + Math.round(popOf(T) / 3)
			Object.assign(e.d, { x: p.x, y: p.y })
			T.stock.stone += gold
			T.stock.wood += Math.round(gold / 2)
		},
		update(e) {
			if (Math.random() < 0.5) emit(e.d.x, e.d.y - 0.3, 'spark', 1)
		},
		focus: (e) => ({ x: e.d.x, y: e.d.y - 0.5, s: 48 }),
	},

	merchant: {
		name: 'Travelling Merchant', icon: '🐴', sub: 'A trader arrives with a cart full of goods', good: true, dur: 26, scope: 'tribe', weight: (T) => (eraOf(T) < 2 ? 1.3 : 0.5),
		start(e, T) {
			e.d.x = T.cx + 2.6
			e.d.y = Math.min(H - 2, T.cy + 22)
		},
		update(e, dt, T) {
			const d = e.d
			const stopY = T.cy + 2.4, startY = Math.min(H - 2, T.cy + 22)
			if (e.t < 7) d.y = startY + (stopY - startY) * (e.t / 7)
			else if (e.t > e.dur - 7) d.y = stopY + (startY - stopY) * ((e.t - (e.dur - 7)) / 7)
			else d.y = stopY
			d.moving = e.t < 7 || e.t > e.dur - 7
			if (!d.paid && e.t >= 7) {
				d.paid = true
				T.stock.wood += 15 + Math.round(popOf(T) / 4)
				T.stock.stone += 10 + Math.round(popOf(T) / 5)
			}
			void dt
		},
		focus: (e) => (e.t < e.dur - 7 ? { x: e.d.x - 0.3, y: e.d.y - 0.6, s: 46 } : null),
	},

	timeTraveler: {
		name: 'Time Traveller', icon: '⏱️', sub: 'A blue box materialises on the square', good: true, dur: 12, scope: 'tribe', weight: (T) => (eraOf(T) >= 3 ? 0.5 : 0),
		start(e, T) {
			fx.flash = 0.8
			e.d.box = spawnAgent('traveler', 'none', T.cx + 2.5, T.cy - 1.5, 0)
			emit(T.cx + 2.5, T.cy - 1.8, 'spark', 30)
		},
		end(e, T) {
			removeAgents((a) => a === e.d.box)
			const inv = invent(T, true)
			if (inv) news(T, `the time traveller left a gift from the future: ${inv.name}`, '⏱️', '#9fd3ff')
		},
		focus: (e, T) => ({ x: T.cx + 2, y: T.cy - 1.8, s: 52 }),
	},

	// =================================================================== war (started by war.ts)
	raid: {
		name: 'Raid', icon: '⚔️', sub: 'An army is on the march', dur: 140, scope: 'war', weight: () => 0,
		start: (e) => raidStart(e),
		update: (e, dt) => raidUpdate(e, dt),
		end: (e) => raidEnd(e),
		focus: (e) => raidFocus(e),
	},
}

export function startEvent(type: string, tribe?: TribeId) {
	const S = G.S
	const def = EVENTS[type]
	if (!def) return
	if (def.scope === 'global') {
		const g = S.events.find((e) => EVENTS[e.type]?.scope === 'global')
		if (g) endEvent(g)
	}
	let T = tribe ? tribeOf(tribe) : null
	if (def.scope === 'tribe') {
		T = T || pick(S.tribes)
		const busy = S.events.find((e) => e.tribe === T!.id && EVENTS[e.type]?.scope === 'tribe')
		if (busy) endEvent(busy)
		T.lastEventYear = T.year
	}
	const e: ActiveEvent = { type, t: 0, dur: def.dur, d: {}, tribe: def.scope === 'tribe' ? T!.id : undefined }
	S.events.push(e)
	if (def.scope === 'global') S.lastGlobalEvent = S.time
	def.start(e, T || tribeOf(S.player))
	if (def.scope === 'war') return
	const who = def.scope === 'tribe' && T && !isPlayer(T) ? `${TRIBES[T.id].icon} ${TRIBES[T.id].name}: ` : ''
	if (def.scope === 'global' || (T && isPlayer(T))) banner(`${def.icon} ${def.name}`, def.sub, def.good ? 'good' : 'disaster')
	else ticker(`${who}${def.name}`, def.icon, def.good ? '#a8e88f' : '#ff9a85')
	S.history.push({ year: (T || tribeOf(S.player)).year, icon: def.icon, text: who + def.name, tribe: T?.id })
}

function endEvent(e: ActiveEvent) {
	const S = G.S
	const i = S.events.indexOf(e)
	if (i < 0) return
	S.events.splice(i, 1)
	e.d.over = true
	EVENTS[e.type]?.end?.(e, e.tribe ? tribeOf(e.tribe) : tribeOf(S.player))
}

/** Called once per tribe-year: maybe something happens to this tribe (or to everyone) */
export function maybeEvent(T: Tribe) {
	const S = G.S
	if (settings.events === 'off') return
	if (T.year < 6 || T.year - T.lastEventYear < 4) return
	if (Math.random() > 0.1) return
	const globalFree = !S.events.some((e) => EVENTS[e.type]?.scope === 'global') && S.time - S.lastGlobalEvent > 90
	const tribeFree = !S.events.some((e) => e.tribe === T.id && EVENTS[e.type]?.scope === 'tribe')
	const keys = Object.keys(EVENTS).filter((k) => {
		const s = EVENTS[k].scope
		return (s === 'tribe' && tribeFree) || (s === 'global' && globalFree)
	})
	const type = weightedPick(keys, (k) => EVENTS[k].weight(T) * (EVENTS[k].scope === 'global' ? 0.45 : 1))
	if (type) startEvent(type, EVENTS[type].scope === 'tribe' ? T.id : undefined)
}

/** Where an auto-following camera should look (the player's own events first, then anything spectacular) */
export function eventFocus(): { x: number; y: number; s: number } | null {
	const S = G.S
	const list = [...S.events].sort((a, b) => score(b) - score(a))
	for (const e of list) {
		const mine = e.tribe === S.player || (e.type === 'raid' && (e.d.att === S.player || e.d.def === S.player)) || !e.tribe
		if (!mine && !settings.followAction) continue
		const f = EVENTS[e.type]?.focus?.(e, e.tribe ? tribeOf(e.tribe) : tribeOf(S.player))
		if (f) return f
	}
	return null
}
function score(e: ActiveEvent) {
	const S = G.S
	let s = e.type === 'raid' ? 3 : 1
	if (e.tribe === S.player || e.d?.att === S.player || e.d?.def === S.player) s += 5
	return s
}

export function updateEvents(dt: number, rdt: number) {
	fx.darkT = fx.rainT = fx.shakeT = fx.snowT = fx.sandT = fx.eclipseT = fx.flareT = 0
	fx.blackout.clear()
	for (const e of [...G.S.events]) {
		e.t += dt
		const def = EVENTS[e.type]
		if (!def) {
			G.S.events.splice(G.S.events.indexOf(e), 1)
			continue
		}
		def.update?.(e, dt, e.tribe ? tribeOf(e.tribe) : tribeOf(G.S.player))
		if (e.t >= e.dur) endEvent(e)
	}
	if (G.S.chill > 0) G.S.chill -= dt
	const k = Math.min(1, rdt * 2)
	fx.dark += (fx.darkT - fx.dark) * k
	fx.rain += (fx.rainT - fx.rain) * k
	fx.snow += (fx.snowT - fx.snow) * Math.min(1, rdt * 0.5)
	fx.sand += (fx.sandT - fx.sand) * Math.min(1, rdt * 0.8)
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

export const eventsOf = (id: TribeId) => G.S.events.filter((e) => e.tribe === id || (e.type === 'raid' && (e.d.att === id || e.d.def === id)))
