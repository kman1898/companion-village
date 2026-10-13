import { B, costTotal, HOUSE_LINE, RES, SPECIAL_ORDER, type BType, type Res, type Role } from '../data/buildings'
import { TRIBES } from '../data/tribes'
import { dist2 } from '../core/util'
import { banner, ticker } from '../ui/notify'
import { emit } from '../render/particles'
import { G, has, idx, popOf, relation, W, type Building, type Cell, type Patch, type Tribe } from './state'

export function roleCounts(T: Tribe): Record<Role, number> {
	const c: Record<Role, number> = { builder: 0, woodcutter: 0, mason: 0, farmer: 0 }
	for (const v of T.villagers) c[v.role]++
	return c
}

export function countType(T: Tribe, t: BType) {
	let n = 0
	for (const b of T.buildings) if (b.type === t) n++
	return n
}

export const isPlayer = (T: Tribe) => T.id === G.S.player
export const label = (T: Tribe) => TRIBES[T.id].name

/** Announce something: the player's own news plainly, other tribes' news prefixed with their name */
export function news(T: Tribe, msg: string, ic: string, color?: string) {
	ticker(isPlayer(T) ? msg[0].toUpperCase() + msg.slice(1) : `${TRIBES[T.id].name}: ${msg}`, isPlayer(T) ? ic : TRIBES[T.id].icon, color || (isPlayer(T) ? undefined : TRIBES[T.id].color))
}

export function useCell(T: Tribe, cell: Cell, owner: number) {
	T.used.set(cell.key, owner)
	const w = G.world
	for (const list of [w.trees, w.rocks, w.bushes])
		for (const o of list as { x: number; y: number; gone: 0 | 1 }[])
			if (o.x >= cell.ox - 1 && o.x < cell.ox + 3 && o.y >= cell.oy - 1 && o.y < cell.oy + 3.3) o.gone = 1
}

function cellBlocked(T: Tribe, c: Cell) {
	if (c.park || T.used.has(c.key)) return true
	for (const cr of G.S.craters) if (cr.until > G.S.time && dist2(cr.x, cr.y, c.ox + 1, c.oy + 1) < (cr.r + 1.5) ** 2) return true
	return false
}

export function rebuildRoads() {
	const roads = new Set<number>(), owner = new Map<number, Tribe['id']>()
	const add = (i: number, t: Tribe['id']) => {
		roads.add(i)
		if (!owner.has(i)) owner.set(i, t)
	}
	for (const T of G.S.tribes) {
		const ring = (ox: number, oy: number) => {
			for (let x = ox - 1; x <= ox + 2; x++) {
				add(idx(x, oy - 1), T.id)
				add(idx(x, oy + 2), T.id)
			}
			for (let y = oy; y <= oy + 1; y++) {
				add(idx(ox - 1, y), T.id)
				add(idx(ox + 2, y), T.id)
			}
		}
		for (const b of T.buildings) {
			ring(b.ox, b.oy)
			if (b.field) ring(b.field.ox, b.field.oy)
		}
	}
	// highways belong to whichever village is nearest
	for (const i of G.world.highway) {
		if (roads.has(i)) continue
		const x = i % W, y = (i / W) | 0
		let best = G.S.tribes[0], bd = Infinity
		for (const T of G.S.tribes) {
			const d = dist2(x, y, T.cx, T.cy)
			if (d < bd) {
				bd = d
				best = T
			}
		}
		add(i, best.id)
	}
	G.roads = roads
	G.roadOwner = owner
	G.roadsVersion++
}

export function makeBuilding(T: Tribe, type: BType, cell: Cell): Building {
	return {
		k: 3, id: G.S.nextId++, tribe: T.id, type, key: cell.key, ox: cell.ox, oy: cell.oy, v: Math.floor(Math.random() * 12),
		progress: 0, delivered: { wood: 0, stone: 0, food: 0 }, incoming: { wood: 0, stone: 0, food: 0 }, done: false, field: null,
	}
}

export function placeBuilding(T: Tribe, type: BType, quiet = false): Building | null {
	const cell = G.world.cells[T.id].find((c) => !cellBlocked(T, c))
	if (!cell) return null
	const b = makeBuilding(T, type, cell)
	useCell(T, cell, b.id)
	if (type === 'farm') attachField(T, b)
	T.buildings.push(b)
	rebuildRoads()
	if (!quiet && isPlayer(T)) ticker(`Builders broke ground on a new ${B[type].name}`, '⚒')
	return b
}

export function attachField(T: Tribe, b: Building, saved?: [number, number][]) {
	const opts = [[0, 3], [3, 0], [-3, 0], [0, -3], [3, 3], [-3, 3]]
	for (const [dx, dy] of opts) {
		const c = G.world.cellMap.get(b.ox + dx + ',' + (b.oy + dy))
		if (!c || c.tribe !== T.id || cellBlocked(T, c)) continue
		useCell(T, c, b.id)
		b.field = {
			key: c.key, ox: c.ox, oy: c.oy,
			patches: [0, 1, 2, 3].map((n): Patch => ({ s: (saved ? saved[n][0] : 0) as Patch['s'], t: saved ? saved[n][1] : 0, res: 0, x: c.ox + (n % 2), y: c.oy + (n >> 1) })),
		}
		return
	}
}

export function need(site: Building, r: Res) {
	return (B[site.type].cost[r] || 0) - site.delivered[r] - site.incoming[r]
}

export function maxProgress(site: Building) {
	const total = costTotal(site.type)
	if (!total) return B[site.type].work
	const d = site.delivered.wood + site.delivered.stone + site.delivered.food
	return (B[site.type].work * d) / total
}

export function completeBuilding(T: Tribe, b: Building) {
	b.done = true
	const def = B[b.type]
	emit(b.ox + 1, b.oy + 1.2, 'spark', 26)
	if (b.repair) {
		b.repair = false
		if (isPlayer(T)) ticker(`${def.name} repaired`, '✦')
		return
	}
	if (b.renovate) b.renovate = false
	if (b.type === 'launchpad') b.timer = 20
	if (!T.firsts[b.type] && b.type !== 'house') {
		if (isPlayer(T)) banner(`The first ${def.name} is finished!`, `Year ${T.year} · ${popOf(T)} villagers`)
		else if (['skyscraper', 'launchpad', 'arcology', 'starship', 'keep', 'church'].includes(b.type)) news(T, `built their first ${def.name}`, '✦')
		T.prestige += 2
	}
	T.firsts[b.type] = 1
	if (isPlayer(T)) ticker(`${def.name} completed`, '✦')
}

/** Knock a building back to a construction site that builders will repair */
export function damageBuilding(b: Building, severity: number) {
	if (b.type === 'graveyard' || b.type === 'landmark') return
	const def = B[b.type]
	const keep = 1 - severity
	if (b.done) {
		b.done = false
		b.repair = true
	}
	b.progress = Math.min(b.progress, def.work * keep)
	for (const r of RES) b.delivered[r] = Math.min(b.delivered[r], Math.floor((def.cost[r] || 0) * keep))
	b.fire = 0
	emit(b.ox + 1, b.oy + 1.2, 'dust', 14)
	emit(b.ox + 1, b.oy + 1.2, 'debris', 10)
}

export function destroyBuilding(T: Tribe, b: Building) {
	if (b.type === 'landmark') return damageBuilding(b, 0.5)
	T.buildings.splice(T.buildings.indexOf(b), 1)
	T.used.delete(b.key)
	if (b.field) T.used.delete(b.field.key)
	rebuildRoads()
}

export function ignite(b: Building) {
	if (b.fire || ['graveyard', 'fountain', 'well', 'landmark', 'teleporter'].includes(b.type)) return false
	const T = G.S.tribes.find((t) => t.id === b.tribe)!
	b.fire = has(T, 'fireBrigade') ? 7 : 15
	return true
}

export function updateFires(dt: number) {
	for (const T of G.S.tribes)
		for (const b of T.buildings) {
			if (!b.fire) continue
			b.fire -= dt
			if (Math.random() < dt * 14) emit(b.ox + 1, b.oy + 1.0, 'flame', 1)
			if (Math.random() < dt * 4) emit(b.ox + 1, b.oy + 0.6, 'smoke', 1)
			if (Math.random() < dt * 3) emit(b.ox + 1, b.oy + 0.8, 'ember', 1)
			if (!has(T, 'fireBrigade') && Math.random() < dt * 0.05) {
				const near = T.buildings.find((o) => o !== b && !o.fire && dist2(o.ox, o.oy, b.ox, b.oy) <= 9.5 && o.done)
				if (near && ignite(near)) news(T, `the fire spread to the ${B[near.type].name}!`, '🔥', '#ff9a2e')
			}
			if (b.fire <= 0) {
				b.fire = 0
				damageBuilding(b, 0.6)
				news(T, `the ${B[b.type].name} burned down — builders will rebuild it`, '🔥', '#ff9a2e')
			}
		}
}

export function addGrave(T: Tribe) {
	let gy = T.buildings.find((b) => b.type === 'graveyard' && (b.graves || 0) < 12)
	if (!gy) {
		gy = placeBuilding(T, 'graveyard', true) || undefined
		if (!gy) return
		gy.done = true
		gy.graves = 0
		gy.progress = 1
	}
	gy.graves = (gy.graves || 0) + 1
}

/** Bounding box of a tribe's built-up area (tiles) */
export function villageBounds(T: Tribe) {
	let x0 = T.cx - 3, x1 = T.cx + 3, y0 = T.cy - 3, y1 = T.cy + 3
	for (const b of T.buildings) {
		x0 = Math.min(x0, b.ox - 1)
		x1 = Math.max(x1, b.ox + 3)
		y0 = Math.min(y0, b.oy - 1)
		y1 = Math.max(y1, b.oy + 3)
	}
	return { x0, x1, y0, y1 }
}

export const atWar = (T: Tribe) => G.S.tribes.some((o) => o !== T && relation(T.id, o.id).war)

// ---------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------
export function bestHouse(T: Tribe): BType {
	let best: BType = 'house'
	for (const t of HOUSE_LINE) {
		const inv = B[t].inv
		if (!inv || has(T, inv)) best = t
	}
	if (best === 'stonehouse' && popOf(T) < 20) return 'house'
	return best
}

export function chooseBuilding(T: Tribe): BType | null {
	const pop = popOf(T), c = roleCounts(T)
	let housing = 0
	for (const b of T.buildings) housing += B[b.type].cap || 0
	const houseType = bestHouse(T)
	if (housing < pop + 2) return houseType
	// in wartime an extra barracks comes first
	if (atWar(T) && pop >= 10 && countType(T, 'barracks') < 2 + Math.floor(pop / 30)) return 'barracks'
	for (const t of SPECIAL_ORDER) {
		const def = B[t]
		if (def.inv && !has(T, def.inv)) continue
		if (pop < (def.u || 0)) continue
		if (countType(T, t) < (def.want ? def.want(pop, c) : 0)) return t
	}
	if (housing < pop * 1.5 + 6) return houseType
	if (T.stock.wood > 40 && T.stock.stone > 25 && housing < pop * 3 + 10) return houseType
	return null
}

export function planner(T: Tribe) {
	const c = roleCounts(T)
	if (!c.builder) return
	let sites = 0
	for (const b of T.buildings) if (!b.done) sites++
	if (sites >= Math.min(6, 1 + Math.floor(c.builder / 3))) return
	const t = chooseBuilding(T)
	if (t) placeBuilding(T, t)
	else renovate(T)
}

/** Rebuild the oldest-style home in the newest style (one or two at a time) */
function renovate(T: Tribe) {
	const best = bestHouse(T)
	const rank = HOUSE_LINE.indexOf(best)
	if (rank < 2) return
	let busy = 0
	for (const b of T.buildings) if (b.renovate) busy++
	if (busy >= (roleCounts(T).builder > 20 ? 2 : 1)) return
	let target: Building | null = null
	for (const b of T.buildings) {
		if (!b.done || b.fire) continue
		const r = HOUSE_LINE.indexOf(b.type)
		if (r >= 0 && r < rank && (!target || r < HOUSE_LINE.indexOf(target.type))) target = b
	}
	if (!target) return
	target.type = best
	target.done = false
	target.renovate = true
	target.progress = 0
	target.delivered = { wood: 0, stone: 0, food: 0 }
	emit(target.ox + 1, target.oy + 1.2, 'dust', 12)
}
