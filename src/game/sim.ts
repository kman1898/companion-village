import { dist2, rand } from '../core/util'
import { updateParticles } from '../render/particles'
import { updateAgents, updateShots } from './agents'
import { planner, updateFires } from './buildings'
import { updateDay } from './daynight'
import { updateEvents } from './events'
import { advanceYear } from './history'
import { updateRivals } from './rivals'
import { save } from './save'
import { CX, CY, G, H, W, has, idx } from './state'
import { updateTraffic } from './traffic'
import { spawnVillager, updateSheep, updateVillager, growTime } from './villagers'
import { addRockCluster } from './worldgen'

let spawnTimer = 0, plannerTimer = 0, slowTimer = 0, saveTimer = 0, sheepFoodTimer = 0, replicatorTimer = 0

/** sdt = simulated seconds (scaled by game speed), rdt = real seconds */
export function update(sdt: number, rdt: number, entryY: number) {
	const S = G.S
	S.time += sdt
	updateDay(sdt)
	spawnTimer -= rdt
	if (S.queue > 0 && spawnTimer <= 0) {
		const catchingUp = S.queue > 20
		S.queue--
		spawnVillager(entryY)
		advanceYear(catchingUp)
		spawnTimer = S.queue > 30 ? 0.04 : S.queue > 5 ? 0.12 : 0.3
	}
	plannerTimer -= sdt
	if (plannerTimer <= 0) {
		plannerTimer = 1.2
		planner()
	}
	if (S.boost > 0) S.boost -= sdt

	slowTimer -= sdt
	if (slowTimer <= 0) {
		const st = 0.5 - slowTimer
		slowTimer = 0.5
		slowTick(st)
	}

	for (let i = S.villagers.length - 1; i >= 0; i--) {
		const v = S.villagers[i]
		if (v) updateVillager(v, sdt)
	}
	updateSheep(sdt)
	updateAgents(sdt)
	updateShots(sdt)
	updateFires(sdt)
	updateTraffic(sdt)
	updateEvents(sdt, rdt)
	updateParticles(sdt)

	saveTimer -= rdt
	if (saveTimer <= 0) {
		saveTimer = 5
		save()
	}
}

function slowTick(st: number) {
	const S = G.S, w = G.world
	const regrowMul = has('cartography') ? 2 : 1
	for (const t of w.trees) {
		if (t.gone) continue
		if (t.cut) {
			t.rt -= st
			if (t.rt <= 0) {
				t.cut = 0
				t.g = 0.05
			}
		} else if (t.g < 1) t.g = Math.min(1, t.g + (st * regrowMul) / 45)
	}
	let liveRocks = 0
	for (const k of w.rocks) {
		if (k.gone) continue
		if (k.amt <= 0) {
			k.rt -= st
			if (k.rt <= 0) k.amt = k.max
		} else liveRocks++
	}
	if (liveRocks < 4 && w.rocks.filter((k) => !k.gone).length < 10) spawnRockCluster()
	for (const b of w.bushes) if (!b.gone && !b.ber) {
		b.rt -= st
		if (b.rt <= 0) b.ber = 1
	}
	// fields stop growing in a blizzard and grow faster in the rain
	const grow = growTime() / (S.event?.type === 'storm' ? 1.5 : 1)
	if (S.chill <= 0)
		for (const b of S.buildings)
			if (b.field && b.done)
				for (const p of b.field.patches)
					if (p.s === 1) {
						p.t += st * (35 / grow)
						if (p.t >= 35) p.s = 2
					}
	S.craters = S.craters.filter((c) => c.until > S.year)
	sheepFoodTimer += st
	if (sheepFoodTimer >= 30) {
		sheepFoodTimer = 0
		S.stock.food += Math.floor(S.sheep.filter((s) => !s.gone).length / 2)
	}
	if (has('replicators')) {
		replicatorTimer += st
		if (replicatorTimer >= 5) {
			replicatorTimer = 0
			S.stock.wood++
			S.stock.stone++
			S.stock.food++
		}
	}
	updateRivals(st)
}

function spawnRockCluster() {
	const w = G.world
	for (let tries = 0; tries < 40; tries++) {
		const a = Math.random() * Math.PI * 2, d = rand(18, 34)
		const x = CX + Math.cos(a) * d * 1.2, y = CY + Math.sin(a) * d * 0.85
		if (x < 4 || y < 8 || x > W - 4 || y > H - 4 || w.water[idx(x | 0, y | 0)]) continue
		if (G.S.buildings.some((b) => dist2(b.ox + 1, b.oy + 1, x, y) < 16)) continue
		if (Object.values(w.rivalSites).some((r) => dist2(r.x, r.y, x, y) < 15 * 15)) continue
		const before = w.rocks.length
		addRockCluster(w.rocks, x, y, 7, Math.random, w.water)
		for (const k of w.rocks.slice(before)) for (const t of w.trees) if (!t.gone && dist2(k.x, k.y, t.x, t.y) < 1.2) t.gone = 1
		return
	}
}
