import { B, RES, ROLE, ROLE_TARGET, type Res, type Role } from '../data/buildings'
import { NAMES, SKINS } from '../data/names'
import { dist2, pick, rand } from '../core/util'
import { emit, floatText } from '../render/particles'
import { addGrave, completeBuilding, isPlayer, maxProgress, need, news, roleCounts, villageBounds } from './buildings'
import { isNight } from './daynight'
import { nearestTree } from './worldgen'
import { G, H, has, MAX_AGENTS, popOf, tribeOf, W, type Building, type Patch, type Step, type Tribe, type Villager } from './state'
import { ticker } from '../ui/notify'

export const TREE_REGROW = 80
export const ROCK_RESPAWN = 240
export const growTime = (T: Tribe) => 35 * (has(T, 'cropRotation') ? 0.65 : 1) * (has(T, 'irrigation') ? 0.8 : 1) * (has(T, 'geneticCrops') ? 0.5 : 1)

const walk = (x: number, y: number): Step => ({ k: 'walk', x, y })
const work = (d: number, a: string, fn?: (v: Villager) => boolean | void, fx?: number): Step => ({ k: 'work', d, a, fn, fx })
/** work-duration multiplier from festivals, computers and the cold */
const boostMul = (T: Tribe) => (T.boost > 0 ? 0.8 : 1) * (has(T, 'computers') ? 0.87 : 1) * (G.S.chill > 0 ? 1.4 : 1)
const gatherMul = (T: Tribe) => (has(T, 'ironTools') ? 0.65 : 1) * (has(T, 'steamEngine') ? 0.8 : 1) * boostMul(T)

/** Is there a party (festival, wedding, concert) going on for this tribe? */
export const partyFor = (T: Tribe) => G.S.events.some((e) => (e.type === 'festival' || e.d?.party) && (!e.tribe || e.tribe === T.id) && !e.d?.over)

export function chooseRole(T: Tribe): Role {
	const n = T.villagers.length
	const first: Role[] = ['builder', 'woodcutter', 'mason', 'farmer']
	if (n < 4) return first[n]
	const c = roleCounts(T)
	let best: Role = 'builder', bd = -1e9
	for (const r of Object.keys(ROLE_TARGET) as Role[]) {
		const d = ROLE_TARGET[r] * (n + 1) - c[r]
		if (d > bd) {
			bd = d
			best = r
		}
	}
	return best
}

export function makeVillager(T: Tribe, name: string, role: Role, x: number, y: number, skin?: string): Villager {
	return {
		k: 4, id: G.S.nextId++, tribe: T.id, name, role, x, y, plan: [], step: null, t: 0, carry: null, carryN: 1, anim: 'idle', face: 1,
		ph: Math.random() * 6, spd: rand(1.45, 1.85), skin: skin || pick(SKINS), born: G.S.time, res: null, claim: null, hammer: 0,
	}
}

/** A new settler walks in from beyond the edge of the village */
export function spawnVillager(T: Tribe, silent = false) {
	T.arrivals++
	if (T.villagers.length >= MAX_AGENTS) {
		T.extraPop++
		return
	}
	const role = chooseRole(T)
	const vb = villageBounds(T)
	const v = makeVillager(T, pick(NAMES), role, T.cx + rand(-0.6, 0.6), Math.min(H - 2, vb.y1 + 4))
	if (has(T, 'androids') && Math.random() < 0.4) {
		v.android = true
		v.name = `${pick(['XR', 'K', 'T', 'Unit', 'Ada', 'Q'])}-${Math.floor(rand(10, 999))}`
	}
	v.plan = [walk(T.cx + rand(-1.4, 1.4), T.cy + rand(1.4, 2.0)), work(1.4, 'wave')]
	T.villagers.push(v)
	if (isPlayer(T) && !silent) {
		ticker(`${v.name} the ${v.android ? 'android ' : ''}${ROLE[role].label} arrived`, '+1', ROLE[role].color)
		floatText(v.x, v.y - 0.6, '+1')
	}
	return v
}

export function release(v: Villager) {
	v.hammer = 0
	if (v.res) {
		v.res.res = 0
		v.res = null
	}
	if (v.claim) {
		const c = v.claim
		const T = tribeOf(v.tribe)
		const site = T.buildings.find((b) => b.id === c.site)
		if (site) site.incoming[c.r] -= c.n
		T.stock[c.r] += c.n
		v.claim = null
		v.carry = null
	}
}

export function interrupt(v: Villager) {
	release(v)
	v.plan = []
	v.step = null
	v.carry = null
}

export function killVillager(v: Villager, cause: string, quiet = false) {
	const T = tribeOf(v.tribe)
	const i = T.villagers.indexOf(v)
	if (i < 0) return
	release(v)
	T.villagers.splice(i, 1)
	T.deaths++
	if (!v.away) emit(v.x, v.y - 0.3, 'ghost', 1)
	addGrave(T)
	if (!quiet) news(T, `${v.name} the ${ROLE[v.role].label} ${cause}`, '✝', '#b9b2a6')
}

export function flee(v: Villager, fromX: number, fromY: number, radius: number) {
	interrupt(v)
	const a = Math.atan2(v.y - fromY, v.x - fromX)
	v.plan = [walk(v.x + Math.cos(a) * radius, v.y + Math.sin(a) * radius), work(3, 'idle')]
}

function dropoffs(T: Tribe, r: Res) {
	const list = [{ x: T.cx + 1.15, y: T.cy + 0.95 }]
	for (const b of T.buildings) if (b.done && B[b.type].drop?.includes(r)) list.push({ x: b.ox + 1, y: b.oy + 2.2 })
	return list
}
function nearest<T extends { x: number; y: number }>(list: T[], x: number, y: number, ok?: (o: T) => boolean): T | null {
	let best: T | null = null, bd = Infinity
	for (const o of list) {
		if (ok && !ok(o)) continue
		const d = dist2(o.x, o.y, x, y)
		if (d < bd) {
			bd = d
			best = o
		}
	}
	return best
}

function deliverPlan(T: Tribe, v: Villager, r: Res, x: number, y: number) {
	const d = nearest(dropoffs(T, r), x, y)!
	v.plan.push(walk(d.x + rand(-0.3, 0.3), d.y + rand(-0.1, 0.15)))
	v.plan.push(work(0.35, 'drop', (v) => {
		T.stock[r] += v.carryN
		v.carry = null
		emit(v.x, v.y - 0.2, 'dust', 3)
	}))
}

function gatherWood(T: Tribe, v: Villager) {
	const t = nearestTree(G.world, v.x, v.y, (t) => !t.gone && !t.cut && !t.res && !t.park && t.g >= 1)
	if (!t) return false
	t.res = v.id
	v.res = t
	const side = v.x < t.x ? -1 : 1
	v.plan = [walk(t.x + side * 0.42, t.y + 0.04),
		work(3.5 * gatherMul(T), 'chop', (v) => {
			t.res = 0
			v.res = null
			if (t.gone || t.cut) return false
			t.cut = 1
			t.rt = TREE_REGROW * (has(T, 'cartography') ? 0.5 : 1)
			t.g = 0
			emit(t.x, t.y - 0.4, 'leaf', 10)
			v.carry = 'wood'
			v.carryN = 1
		}, t.x)]
	deliverPlan(T, v, 'wood', t.x, t.y)
	return true
}

function gatherStone(T: Tribe, v: Villager) {
	const k = nearest(G.world.rocks, v.x, v.y, (k) => !k.gone && k.amt > 0 && !k.res)
	if (!k || dist2(k.x, k.y, v.x, v.y) > 45 * 45) return false
	k.res = v.id
	v.res = k
	const side = v.x < k.x ? -1 : 1
	v.plan = [walk(k.x + side * 0.55, k.y + 0.06),
		work(4.5 * gatherMul(T), 'mine', (v) => {
			k.res = 0
			v.res = null
			if (k.gone || k.amt <= 0) return false
			k.amt--
			if (k.amt <= 0) k.rt = ROCK_RESPAWN
			v.carry = 'stone'
			v.carryN = has(T, 'smelting') && Math.random() < 0.5 ? 2 : 1
		}, k.x)]
	deliverPlan(T, v, 'stone', k.x, k.y)
	return true
}

function gatherFood(T: Tribe, v: Villager) {
	let best: Patch | null = null, bd = Infinity
	for (const b of T.buildings) {
		if (!b.done || !b.field) continue
		for (const p of b.field.patches) {
			if (p.res || p.s === 1) continue
			const d = dist2(p.x + 0.5, p.y + 0.5, v.x, v.y) - (p.s === 2 ? 50 : 0)
			if (d < bd) {
				bd = d
				best = p
			}
		}
	}
	if (best) {
		const p = best
		p.res = v.id
		v.res = p
		v.plan = [walk(p.x + 0.5, p.y + 0.85)]
		if (p.s === 2) {
			v.plan.push(work(2.6 * boostMul(T), 'farm', (v) => {
				p.res = 0
				v.res = null
				if (p.s !== 2) return false
				p.s = 0
				p.t = 0
				emit(p.x + 0.5, p.y + 0.5, 'chaff', 8)
				v.carry = 'food'
				v.carryN = 2 + (has(T, 'plough') ? 1 : 0) + (has(T, 'canning') ? 1 : 0)
			}))
			deliverPlan(T, v, 'food', p.x, p.y)
		} else {
			v.plan.push(work(2.0 * boostMul(T), 'farm', (v) => {
				p.res = 0
				v.res = null
				if (p.s === 0) {
					p.s = 1
					p.t = 0
				}
			}))
		}
		return true
	}
	const bush = nearest(G.world.bushes, v.x, v.y, (b) => !b.gone && !!b.ber && !b.res && !b.park)
	if (!bush || dist2(bush.x, bush.y, v.x, v.y) > 40 * 40) return false
	bush.res = v.id
	v.res = bush
	v.plan = [walk(bush.x - 0.35, bush.y + 0.08),
		work(2.5, 'farm', (v) => {
			bush.res = 0
			v.res = null
			if (bush.gone || !bush.ber) return false
			bush.ber = 0
			bush.rt = 60
			v.carry = 'food'
			v.carryN = 1
		}, bush.x)]
	deliverPlan(T, v, 'food', bush.x, bush.y)
	return true
}

function hammerPlan(T: Tribe, v: Villager, site: Building) {
	const spots = [[rand(0.2, 1.8), 2.2], [-0.25, rand(1.2, 1.9)], [2.25, rand(1.2, 1.9)]]
	const [px, py] = pick(spots)
	v.hammer = site.id
	v.plan = [walk(site.ox + px, site.oy + py),
		work(2.2 * (has(T, 'carpentry') ? 0.75 : 1) * (has(T, 'robotics') ? 0.7 : 1) * boostMul(T), 'hammer', (v) => {
			v.hammer = 0
			if (!T.buildings.includes(site)) return false
			const def = B[site.type]
			site.progress = Math.min(def.work, maxProgress(site), site.progress + 1)
			emit(site.ox + 1 + rand(-0.6, 0.6), site.oy + 1.6, 'dust', 3)
			if (!site.done && site.progress >= def.work - 1e-6) completeBuilding(T, site)
		}, site.ox + 1)]
}

function builderThink(T: Tribe, v: Villager) {
	const sites = T.buildings.filter((b) => !b.done && !b.fire)
	for (const site of sites) {
		if (site.progress < maxProgress(site) - 0.01) {
			let hammering = 0
			for (const o of T.villagers) if (o.hammer === site.id) hammering++
			if (hammering < 3) {
				hammerPlan(T, v, site)
				return true
			}
		}
		for (const r of RES) {
			const needed = need(site, r)
			if (needed > 0 && T.stock[r] >= 1) {
				const n = has(T, 'wheelbarrow') ? Math.min(2, needed, T.stock[r]) : 1
				T.stock[r] -= n
				site.incoming[r] += n
				v.claim = { site: site.id, r, n }
				const d = nearest(dropoffs(T, r), v.x, v.y)!
				const sx = site.ox + 1 + rand(-0.7, 0.7), sy = site.oy + 2.25 + rand(0, 0.15)
				v.plan = [walk(d.x + rand(-0.3, 0.3), d.y + rand(-0.1, 0.15)),
					work(0.4, 'drop', (v) => {
						v.carry = r
						v.carryN = n
					}),
					walk(sx, sy),
					work(0.4, 'drop', (v) => {
						v.carry = null
						v.claim = null
						if (!T.buildings.includes(site)) {
							T.stock[r] += n
							return
						}
						site.delivered[r] += n
						site.incoming[r] -= n
						emit(v.x, v.y - 0.1, 'dust', 4)
					})]
				return true
			}
		}
	}
	for (const site of sites)
		for (const r of RES)
			if (need(site, r) > 0) {
				if (r === 'wood' && gatherWood(T, v)) return true
				if (r === 'stone' && gatherStone(T, v)) return true
				if (r === 'food' && gatherFood(T, v)) return true
			}
	return false
}

function idle(T: Tribe, v: Villager) {
	const a = Math.random() * Math.PI * 2, d = rand(1.4, 2.4)
	v.plan = [walk(T.cx + Math.cos(a) * d, T.cy + Math.sin(a) * d * 0.7 + 0.2), work(rand(2, 5), 'idle')]
}

function dance(T: Tribe, v: Villager) {
	const a = Math.random() * Math.PI * 2, d = rand(1.2, 3.2)
	v.plan = [walk(T.cx + Math.cos(a) * d, T.cy + Math.sin(a) * d * 0.75 + 0.2), work(rand(3, 6), 'dance')]
}

/** About a third of the village (and every android) stays up at night */
const nightOwl = (v: Villager) => v.android || v.id % 3 === 0

function goToBed(T: Tribe, v: Villager) {
	let home: Building | null = null, bd = Infinity
	for (const b of T.buildings) {
		if (!b.done || !B[b.type].cap) continue
		const d = dist2(b.ox + 1, b.oy + 2.1, v.x, v.y)
		if (d < bd) {
			bd = d
			home = b
		}
	}
	if (!home) return false
	v.plan = [walk(home.ox + 1 + rand(-0.2, 0.2), home.oy + 2.1), work(0.2, 'drop', (v) => {
		v.inside = true
	})]
	return true
}

function nightOut(T: Tribe, v: Villager) {
	const tav = T.buildings.find((b) => b.done && b.type === 'tavern')
	if (tav && Math.random() < 0.5) {
		v.plan = [walk(tav.ox + rand(0.3, 1.7), tav.oy + 2.3), work(rand(4, 9), 'idle')]
		return
	}
	idle(T, v)
}

function think(T: Tribe, v: Villager) {
	release(v)
	const party = partyFor(T)
	if (party && !v.sick) return dance(T, v)
	if (isNight() && !party) {
		if (!nightOwl(v)) {
			if (goToBed(T, v)) return
		} else if (v.role !== 'builder' && Math.random() < 0.6) return nightOut(T, v)
	}
	let ok = false
	switch (v.role) {
		case 'builder': ok = builderThink(T, v); break
		case 'woodcutter': ok = gatherWood(T, v); break
		case 'mason': ok = gatherStone(T, v) || gatherWood(T, v); break
		case 'farmer': ok = gatherFood(T, v); break
	}
	if (!ok) idle(T, v)
}

export function updateVillager(T: Tribe, v: Villager, dt: number) {
	if (v.abducted || v.away) return
	if (v.inside) {
		if (isNight() && !partyFor(T)) return
		v.inside = false
		v.step = null
		v.plan = []
	}
	if (v.fly) {
		const f = v.fly
		v.x += f.vx * dt
		v.y += f.vy * dt
		f.z += f.vz * dt
		f.vz -= 12 * dt
		v.anim = 'fly'
		if (f.z <= 0) {
			v.fly = undefined
			v.x = Math.max(1, Math.min(v.x, W - 2))
			v.y = Math.max(7, Math.min(v.y, H - 2))
			interrupt(v)
			emit(v.x, v.y, 'dust', 6)
			if (v.doomed) killVillager(v, 'was swept away by the tornado')
		}
		return
	}
	if (!v.step) {
		v.step = v.plan.shift() || null
		if (!v.step) {
			think(T, v)
			v.step = v.plan.shift() || work(1, 'idle')
		}
		v.t = 0
	}
	const st = v.step
	if (st.k === 'walk') {
		const dx = st.x - v.x, dy = st.y - v.y, d = Math.hypot(dx, dy)
		if (d > 12 && has(T, 'teleporters') && T.buildings.some((b) => b.done && b.type === 'teleporter')) {
			emit(v.x, v.y - 0.3, 'spark', 8)
			v.x = st.x
			v.y = st.y
			v.step = null
			emit(v.x, v.y - 0.3, 'spark', 8)
			return
		}
		const mul = (v.carry ? 0.85 : 1) * (has(T, 'pavedRoads') ? 1.2 : 1) * (has(T, 'asphalt') ? 1.1 : 1) * (v.sick ? 0.5 : 1) *
			(T.boost > 0 ? 1.15 : 1) * (G.S.chill > 0 ? 0.7 : 1)
		const sp = v.spd * mul * dt
		v.anim = 'walk'
		if (Math.abs(dx) > 0.01) v.face = dx > 0 ? 1 : -1
		if (d <= sp) {
			v.x = st.x
			v.y = st.y
			v.step = null
		} else {
			v.x += (dx / d) * sp
			v.y += (dy / d) * sp
			v.ph += dt * 11 * (v.sick ? 0.5 : 1)
		}
	} else {
		v.anim = st.a
		if (st.fx !== undefined) v.face = st.fx >= v.x ? 1 : -1
		v.t += dt
		if (st.a === 'chop' && Math.random() < dt * 2.5) emit(v.x + v.face * 0.3, v.y - 0.3, 'chip', 2)
		if (st.a === 'mine' && Math.random() < dt * 2.5) emit(v.x + v.face * 0.35, v.y - 0.15, 'grit', 2)
		if (v.t >= st.d) {
			v.step = null
			if (st.fn && st.fn(v) === false) {
				v.plan.length = 0
				release(v)
			}
		}
	}
}

// ---------------------------------------------------------------------
// Sheep (Animal Husbandry)
// ---------------------------------------------------------------------
export function addSheep(T: Tribe, n: number) {
	for (let i = 0; i < n; i++) {
		const farms = T.buildings.filter((b) => b.type === 'farm')
		const farm = farms.length ? pick(farms) : null
		const x = farm ? farm.ox + rand(-2, 4) : T.cx + rand(-6, 6), y = farm ? farm.oy + rand(-2, 4) : T.cy + rand(4, 8)
		T.sheep.push({ k: 7, x, y, tx: x, ty: y, t: rand(0, 4), face: 1, ph: Math.random() * 6, tribe: T.id })
	}
}

export function updateSheep(dt: number) {
	for (const T of G.S.tribes)
		for (const s of T.sheep) {
			if (s.gone) continue
			const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy)
			if (d > 0.05) {
				const sp = 0.5 * dt
				s.x += (dx / d) * Math.min(sp, d)
				s.y += (dy / d) * Math.min(sp, d)
				s.face = dx > 0 ? 1 : -1
				s.ph += dt * 8
			} else {
				s.t -= dt
				if (s.t <= 0) {
					s.t = rand(3, 9)
					s.tx = Math.max(2, Math.min(W - 3, s.x + rand(-2.5, 2.5)))
					s.ty = Math.max(8, Math.min(H - 3, s.y + rand(-2, 2)))
				}
			}
		}
}

export { popOf }
