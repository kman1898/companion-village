import { dist2, rand } from '../core/util'
import { updateParticles } from '../render/particles'
import { updateAgents, updateShots } from './agents'
import { planner, updateFires } from './buildings'
import { updateDay } from './daynight'
import { updateDiplomacy } from './diplomacy'
import { updateDisease } from './disease'
import { updateEvents } from './events'
import { advanceYear } from './history'
import { save } from './save'
import { G, H, W, has, idx, type Tribe } from './state'
import { updateAI } from './tribes'
import { updateTraffic } from './traffic'
import { spawnVillager, updateSheep, updateVillager, growTime } from './villagers'
import { addRockCluster } from './worldgen'

const spawnTimer = new Map<string, number>()
let plannerTimer = 0, slowTimer = 0, saveTimer = 0, sheepFoodTimer = 0, replicatorTimer = 0

/** sdt = simulated seconds (scaled by game speed), rdt = real seconds */
export function update(sdt: number, rdt: number) {
	const S = G.S
	S.time += sdt
	updateDay(sdt)
	updateAI(sdt)
	for (const T of S.tribes) {
		const t = (spawnTimer.get(T.id) ?? 0) - rdt
		spawnTimer.set(T.id, t)
		if (T.queue > 0 && t <= 0) {
			const catchingUp = T.queue > 20
			T.queue--
			spawnVillager(T)
			advanceYear(T, catchingUp)
			spawnTimer.set(T.id, T.queue > 30 ? 0.04 : T.queue > 5 ? 0.12 : 0.3)
		}
		if (T.boost > 0) T.boost -= sdt
	}
	plannerTimer -= sdt
	if (plannerTimer <= 0) {
		plannerTimer = 1.2
		for (const T of S.tribes) planner(T)
	}

	slowTimer -= sdt
	if (slowTimer <= 0) {
		const st = 0.5 - slowTimer
		slowTimer = 0.5
		slowTick(st)
	}

	for (const T of S.tribes)
		for (let i = T.villagers.length - 1; i >= 0; i--) {
			const v = T.villagers[i]
			if (v) updateVillager(T, v, sdt)
		}
	updateSheep(sdt)
	updateAgents(sdt)
	updateShots(sdt)
	updateFires(sdt)
	updateTraffic(sdt)
	updateDiplomacy()
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
	for (const t of w.trees) {
		if (t.gone) continue
		if (t.cut) {
			t.rt -= st
			if (t.rt <= 0) {
				t.cut = 0
				t.g = 0.05
			}
		} else if (t.g < 1) t.g = Math.min(1, t.g + st / 45)
	}
	for (const k of w.rocks) {
		if (k.gone || k.amt > 0) continue
		k.rt -= st
		if (k.rt <= 0) k.amt = k.max
	}
	for (const b of w.bushes) if (!b.gone && !b.ber) {
		b.rt -= st
		if (b.rt <= 0) b.ber = 1
	}
	const storm = S.events.some((e) => e.type === 'storm')
	for (const T of S.tribes) {
		const grow = growTime(T) / (storm ? 1.5 : 1)
		if (S.chill <= 0)
			for (const b of T.buildings)
				if (b.field && b.done)
					for (const p of b.field.patches)
						if (p.s === 1) {
							p.t += st * (35 / grow)
							if (p.t >= 35) p.s = 2
						}
		ensureRocks(T)
	}
	S.craters = S.craters.filter((c) => c.until > S.time)
	sheepFoodTimer += st
	replicatorTimer += st
	for (const T of S.tribes) {
		if (sheepFoodTimer >= 30) T.stock.food += Math.floor(T.sheep.filter((s) => !s.gone).length / 2)
		if (replicatorTimer >= 5 && has(T, 'replicators')) {
			T.stock.wood++
			T.stock.stone++
			T.stock.food++
		}
	}
	if (sheepFoodTimer >= 30) sheepFoodTimer = 0
	updateDisease(st)
	if (replicatorTimer >= 5) replicatorTimer = 0
}

/** Make sure every tribe has some stone within reach */
function ensureRocks(T: Tribe) {
	const w = G.world
	let live = 0
	for (const k of w.rocks) if (!k.gone && k.amt > 0 && dist2(k.x, k.y, T.cx, T.cy) < 40 * 40) live++
	if (live >= 4) return
	for (let tries = 0; tries < 40; tries++) {
		const a = Math.random() * Math.PI * 2, d = rand(16, 30)
		const x = T.cx + Math.cos(a) * d * 1.2, y = T.cy + Math.sin(a) * d * 0.85
		if (x < 4 || y < 8 || x > W - 4 || y > H - 4 || w.water[idx(x | 0, y | 0)]) continue
		if (G.S.tribes.some((o) => o.buildings.some((b) => dist2(b.ox + 1, b.oy + 1, x, y) < 16))) continue
		const before = w.rocks.length
		addRockCluster(w.rocks, x, y, 7, Math.random, w.water)
		for (const k of w.rocks.slice(before)) for (const t of w.trees) if (!t.gone && t.sp !== 6 && dist2(k.x, k.y, t.x, t.y) < 1.2) t.gone = 1
		return
	}
}
