import { makeNoise, mulberry32 } from '../core/rng'
import { clamp, dist2 } from '../core/util'
import { TRIBE_IDS, type TribeId } from '../data/tribes'
import { Biome, CELL, H, Sp, W, idx, type Bush, type Cell, type Rock, type Tree, type World } from './state'

const SITE_CLEAR = 9

export function genWorld(seed: number): World {
	const r = mulberry32(seed)
	const nE = makeNoise(seed * 3 + 11), nM = makeNoise(seed * 5 + 7), nT = makeNoise(seed * 17 + 2)
	const nF = makeNoise(seed * 7 + 1), nS = makeNoise(seed * 13 + 5), nR = makeNoise(seed * 31 + 9)
	const water = new Uint8Array(W * H), sand = new Uint8Array(W * H), biome = new Uint8Array(W * H), shade = new Float32Array(W * H)
	const elev = new Float32Array(W * H), ridgeMap = new Float32Array(W * H)

	// ---- terrain fields ----
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++) {
			const i = idx(x, y)
			const e = nE(x * 0.018, y * 0.018)
			const ridge = 1 - Math.abs(nR(x * 0.03, y * 0.03) * 2 - 1)
			elev[i] = e
			ridgeMap[i] = ridge
			shade[i] = nS(x * 0.09, y * 0.09)
			const temp = clamp(y / H + (nT(x * 0.02, y * 0.02) - 0.5) * 0.55, 0, 1)
			const moist = nM(x * 0.022, y * 0.022)
			let b: number = Biome.Grass
			if (ridge > 0.87 && e > 0.52) b = Biome.Mountain
			else if (temp < 0.2) b = Biome.Tundra
			else if (temp > 0.74 && moist < 0.5) b = Biome.Desert
			else if (moist > 0.64 && e < 0.45) b = Biome.Swamp
			biome[i] = b
			if (e < 0.3) water[i] = 1
		}

	// ---- rivers flow downhill from the high ground ----
	const rivers = 2 + Math.floor(r() * 2)
	for (let k = 0; k < rivers; k++) {
		let best = { x: 0, y: 0, e: -1 }
		for (let t = 0; t < 300; t++) {
			const x = 10 + Math.floor(r() * (W - 20)), y = 12 + Math.floor(r() * (H - 24))
			if (elev[idx(x, y)] > best.e) best = { x, y, e: elev[idx(x, y)] }
		}
		let x = best.x, y = best.y, dir = r() * Math.PI * 2
		for (let step = 0; step < 600; step++) {
			const wide = step > 40 && r() < 0.6
			for (let dy = 0; dy <= (wide ? 1 : 0); dy++)
				for (let dx = 0; dx <= (wide ? 1 : 0); dx++) if (x + dx < W && y + dy < H) water[idx(x + dx, y + dy)] = 1
			// steer towards lower ground with some wobble
			let bestA = dir, bestE = Infinity
			for (const da of [-0.6, -0.3, 0, 0.3, 0.6]) {
				const a = dir + da
				const nx = Math.round(x + Math.cos(a) * 2), ny = Math.round(y + Math.sin(a) * 2)
				if (nx < 1 || ny < 6 || nx >= W - 1 || ny >= H - 1) continue
				const ev = elev[idx(nx, ny)] + r() * 0.04
				if (ev < bestE) {
					bestE = ev
					bestA = a
				}
			}
			dir = bestA
			x = Math.round(x + Math.cos(dir))
			y = Math.round(y + Math.sin(dir))
			if (x < 1 || y < 6 || x >= W - 1 || y >= H - 1) break
			if (step > 30 && elev[idx(x, y)] < 0.3) break // reached a lake
		}
	}

	// ---- tribe sites: far apart, on dry land ----
	const okSite = (x: number, y: number) => {
		for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) if (water[idx(clamp(x + dx, 0, W - 1), clamp(y + dy, 0, H - 1))]) return false
		return true
	}
	let bestSet: { x: number; y: number }[] = []
	let bestScore = -1
	for (let attempt = 0; attempt < 400; attempt++) {
		const set: { x: number; y: number }[] = []
		for (let n = 0; n < 3; n++) {
			for (let t = 0; t < 60; t++) {
				const x = 40 + Math.floor(r() * (W - 80)), y = 32 + Math.floor(r() * (H - 60))
				if (okSite(x, y)) {
					set.push({ x, y })
					break
				}
			}
		}
		if (set.length < 3) continue
		let minD = Infinity
		for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) minD = Math.min(minD, Math.hypot(set[a].x - set[b].x, (set[a].y - set[b].y) * 1.2))
		const biomes = new Set(set.map((s) => biome[idx(s.x, s.y)])).size
		const score = minD + biomes * 12
		if (score > bestScore) {
			bestScore = score
			bestSet = set
		}
	}
	if (bestSet.length < 3) bestSet = [{ x: 60, y: 60 }, { x: W - 60, y: 60 }, { x: W / 2, y: H - 45 }]
	const order = [...TRIBE_IDS].sort(() => r() - 0.5)
	const sites = {} as Record<TribeId, { x: number; y: number }>
	order.forEach((id, i) => (sites[id] = { x: bestSet[i].x, y: bestSet[i].y }))
	const siteList = TRIBE_IDS.map((id) => ({ id, ...sites[id] }))
	for (const s of siteList)
		for (let dy = -SITE_CLEAR; dy <= SITE_CLEAR; dy++)
			for (let dx = -SITE_CLEAR; dx <= SITE_CLEAR; dx++) {
				const x = s.x + dx, y = s.y + dy
				if (x < 0 || y < 0 || x >= W || y >= H) continue
				water[idx(x, y)] = 0
				if (biome[idx(x, y)] === Biome.Mountain) biome[idx(x, y)] = Biome.Grass
			}
	for (let y = 1; y < H - 1; y++)
		for (let x = 1; x < W - 1; x++) {
			if (water[idx(x, y)]) continue
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (water[idx(x + dx, y + dy)]) sand[idx(x, y)] = 1
		}
	const siteDist = (x: number, y: number) => Math.min(...siteList.map((s) => Math.hypot(x - s.x, (y - s.y) * 1.25)))

	// ---- highways: L-shaped roads between every pair of tribes, aligned with each village's street grid ----
	const highway = new Set<number>()
	const routes = new Map<string, [number, number][]>()
	for (let a = 0; a < 3; a++)
		for (let b = a + 1; b < 3; b++) {
			// two possible L-shapes (go across first from either end); take the one that crosses less water
			const plan = (P: typeof siteList[0], Q: typeof siteList[0]) => {
				const hy = P.y + 1, vx = Q.x + 1
				const tiles: number[] = []
				for (let x = Math.min(P.x, vx); x <= Math.max(P.x, vx); x++) tiles.push(idx(x, hy))
				for (let y = Math.min(hy, Q.y); y <= Math.max(hy, Q.y); y++) tiles.push(idx(vx, y))
				const wet = tiles.filter((i) => water[i]).length
				const pts: [number, number][] = [[P.x + 0.5, hy + 0.5], [vx + 0.5, hy + 0.5], [vx + 0.5, Q.y + 0.5]]
				return { tiles, wet, pts }
			}
			const A = siteList[a], B = siteList[b]
			const p1 = plan(A, B), p2 = plan(B, A)
			const best = p1.wet <= p2.wet ? p1 : { ...p2, pts: [...p2.pts].reverse() as [number, number][] }
			for (const i of best.tiles) highway.add(i)
			routes.set(`${A.id}>${B.id}`, best.pts)
			routes.set(`${B.id}>${A.id}`, [...best.pts].reverse())
		}

	// ---- vegetation ----
	const trees: Tree[] = []
	const tree = (x: number, y: number, sp: Sp, park?: 1) => {
		const t: Tree = { k: 0, x, y, sp, v: r(), sc: 0.85 + r() * 0.35, g: 1, cut: 0, rt: 0, res: 0, gone: 0 }
		if (park) t.park = park
		trees.push(t)
	}
	for (let y = 7; y < H - 1; y++)
		for (let x = 1; x < W - 1; x++) {
			const i = idx(x, y)
			if (water[i] || highway.has(i)) continue
			const d = siteDist(x + 0.5, y + 0.5)
			if (d < 9) continue
			const near = d < 17 ? (17 - d) * 0.09 : 0
			const f = nF(x * 0.065, y * 0.065)
			const jx = x + 0.2 + r() * 0.6, jy = y + 0.3 + r() * 0.6
			switch (biome[i]) {
				case Biome.Grass: {
					if (sand[i]) {
						if (r() < 0.04) tree(jx, jy, Sp.Palm)
						break
					}
					const p = (f - 0.5) * 3.6 - near
					const ch = p > 0 ? Math.min(0.8, p + 0.18) : 0.018
					if (r() < ch) tree(jx, jy, r() < (f > 0.6 ? 0.75 : 0.15) ? Sp.Pine : Sp.Oak)
					break
				}
				case Biome.Tundra: {
					const p = (f - 0.45) * 3 - near
					if (r() < (p > 0 ? Math.min(0.7, p + 0.15) : 0.02)) tree(jx, jy, Sp.SnowPine)
					break
				}
				case Biome.Desert:
					if (sand[i] && r() < 0.18) tree(jx, jy, Sp.Palm)
					else if (r() < 0.025) tree(jx, jy, Sp.Cactus)
					break
				case Biome.Swamp:
					if (r() < 0.06) tree(jx, jy, Sp.Dead)
					else if (r() < 0.12 - near) tree(jx, jy, Sp.Oak)
					break
				case Biome.Mountain:
					if (ridgeMap[i] > 0.93 && r() < 0.05) tree(jx, jy, Sp.Peak, 1)
					else if (r() < 0.08) tree(jx, jy, Sp.Pine)
					break
			}
		}

	// ---- stone: lots in the mountains, a few clusters near every tribe ----
	const rocks: Rock[] = []
	for (let t = 0; t < 900; t++) {
		const x = 4 + r() * (W - 8), y = 8 + r() * (H - 12)
		if (biome[idx(x | 0, y | 0)] !== Biome.Mountain || siteDist(x, y) < 12) continue
		if (r() < 0.25) addRockCluster(rocks, x, y, 4 + Math.floor(r() * 4), r, water)
	}
	for (const s of siteList)
		for (let c = 0; c < 3; c++) {
			for (let t = 0; t < 30; t++) {
				const a = r() * Math.PI * 2, d = 12 + r() * 9
				const x = s.x + Math.cos(a) * d * 1.2, y = s.y + Math.sin(a) * d * 0.85
				if (x < 4 || y < 8 || x > W - 4 || y > H - 4 || water[idx(x | 0, y | 0)]) continue
				addRockCluster(rocks, x, y, 6 + Math.floor(r() * 4), r, water)
				break
			}
		}
	for (let i = rocks.length - 1; i >= 0; i--) if (highway.has(idx(rocks[i].x | 0, rocks[i].y | 0))) rocks.splice(i, 1)

	const bushes: Bush[] = []
	for (let i = 0; i < 4000 && bushes.length < 140; i++) {
		const x = 2 + r() * (W - 4), y = 8 + r() * (H - 10)
		const bi = biome[idx(x | 0, y | 0)]
		if (bi === Biome.Desert || bi === Biome.Mountain || water[idx(x | 0, y | 0)] || sand[idx(x | 0, y | 0)]) continue
		const d = siteDist(x, y)
		if (d < 8 || d > 34) continue
		const f = nF(x * 0.065, y * 0.065)
		if (f < 0.45 || f > 0.56) continue
		bushes.push({ k: 2, x, y, ber: 1, rt: 0, res: 0, gone: 0, v: r() })
	}
	for (const t of trees) {
		if (t.sp === Sp.Peak) continue
		if (rocks.some((k) => dist2(k.x, k.y, t.x, t.y) < 1.2)) t.gone = 1
		if (bushes.some((b) => dist2(b.x, b.y, t.x, t.y) < 0.45)) t.gone = 1
	}

	// ---- building plots: each tribe gets the cells clearly closer to it than to anyone else ----
	const cells = { pixels: [], noises: [], lampys: [] } as Record<TribeId, Cell[]>
	const cellMap = new Map<string, Cell>()
	for (const s of siteList) {
		for (let j = -16; j <= 16; j++)
			for (let i = -18; i <= 18; i++) {
				if (!i && !j) continue
				const ox = s.x - 1 + i * CELL, oy = s.y - 1 + j * CELL
				if (ox - 1 < 1 || oy - 1 < 6 || ox + 3 > W - 1 || oy + 3 > H - 1) continue
				const mx = ox + 1, my = oy + 1
				const dMe = Math.hypot(mx - s.x, (my - s.y) * 1.2)
				if (siteList.some((o) => o.id !== s.id && Math.hypot(mx - o.x, (my - o.y) * 1.2) < dMe + 7)) continue
				let bad = false
				for (let y = oy - 1; y < oy + 3 && !bad; y++)
					for (let x = ox - 1; x < ox + 3; x++) {
						const k = idx(x, y)
						if (water[k] || sand[k] || biome[k] === Biome.Mountain) { bad = true; break }
						// the footprint must stay off the highway
						if (x >= ox && x < ox + 2 && y >= oy && y < oy + 2 && highway.has(k)) { bad = true; break }
					}
				if (bad) continue
				const cell: Cell = { i, j, ox, oy, key: ox + ',' + oy, d: Math.hypot(i, j * 1.2) + r() * 0.9, tribe: s.id }
				cells[s.id].push(cell)
				cellMap.set(cell.key, cell)
			}
		cells[s.id].sort((a, b) => a.d - b.d)
		for (const cell of cells[s.id]) {
			if (cell.d < 2.4 || r() > 0.15) continue
			cell.park = true
			const n = 1 + Math.floor(r() * 3)
			const bi = biome[idx(cell.ox, cell.oy)]
			const sp = bi === Biome.Tundra ? Sp.SnowPine : bi === Biome.Desert ? Sp.Palm : Sp.Oak
			for (let k = 0; k < n; k++) tree(cell.ox + 0.3 + r() * 1.4, cell.oy + 0.5 + r() * 1.3, sp, 1)
		}
	}

	const sparkles: World['sparkles'] = []
	for (let i = 0; i < 9000 && sparkles.length < 160; i++) {
		const x = Math.floor(r() * W), y = Math.floor(r() * H)
		if (water[idx(x, y)]) sparkles.push({ x: x + r(), y: y + r(), p: r() * 6.28 })
	}
	const clouds: World['clouds'] = []
	for (let i = 0; i < 18; i++) clouds.push({ x: r() * W, y: r() * H, r: 5 + r() * 7, sp: 0.25 + r() * 0.3 })

	const treeOrder = trees.map((_, i) => i).sort((a, b) => trees[a].y - trees[b].y)
	return { seed, water, sand, biome, shade, trees, treeOrder, rocks, bushes, cells, cellMap, highway, routes, sites, sparkles, clouds }
}

export function addRockCluster(rocks: Rock[], cx: number, cy: number, n: number, r: () => number, water: Uint8Array) {
	for (let k = 0; k < n; k++) {
		const a = r() * Math.PI * 2, rr = 0.4 + r() * 2.2
		const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.8
		if (x < 2 || y < 7 || x > W - 2 || y > H - 2 || water[idx(x | 0, y | 0)]) continue
		const max = 8 + Math.floor(r() * 8)
		rocks.push({ k: 1, x, y, max, amt: max, rt: 0, res: 0, gone: 0, seed: Math.floor(r() * 100000) })
	}
}

/** Uniform grid over trees for fast nearest-tree queries */
const GS = 8
let treeGrid: number[][] = []
let gridW = 0
export function buildTreeGrid(world: World) {
	gridW = Math.ceil(W / GS)
	const gh = Math.ceil(H / GS)
	treeGrid = Array.from({ length: gridW * gh }, () => [])
	world.trees.forEach((t, i) => treeGrid[Math.floor(t.y / GS) * gridW + Math.floor(t.x / GS)].push(i))
}
export function nearestTree(world: World, x: number, y: number, ok: (t: Tree) => boolean, maxRing = 8): Tree | null {
	const gx = Math.floor(x / GS), gy = Math.floor(y / GS), gh = Math.ceil(H / GS)
	let best: Tree | null = null, bd = Infinity
	for (let ring = 0; ring < maxRing; ring++) {
		if (best && (ring - 1) * GS * ((ring - 1) * GS) > bd) break
		for (let cy = gy - ring; cy <= gy + ring; cy++)
			for (let cx = gx - ring; cx <= gx + ring; cx++) {
				if (Math.max(Math.abs(cx - gx), Math.abs(cy - gy)) !== ring) continue
				if (cx < 0 || cy < 0 || cx >= gridW || cy >= gh) continue
				for (const i of treeGrid[cy * gridW + cx]) {
					const t = world.trees[i]
					if (!ok(t)) continue
					const d = dist2(t.x, t.y, x, y)
					if (d < bd) {
						bd = d
						best = t
					}
				}
			}
	}
	return best
}

export function forEachTreeNear(world: World, x: number, y: number, r: number, fn: (t: Tree) => void) {
	const gh = Math.ceil(H / GS), r2 = r * r
	for (let cy = Math.floor((y - r) / GS); cy <= Math.floor((y + r) / GS); cy++)
		for (let cx = Math.floor((x - r) / GS); cx <= Math.floor((x + r) / GS); cx++) {
			if (cx < 0 || cy < 0 || cx >= gridW || cy >= gh) continue
			for (const i of treeGrid[cy * gridW + cx]) {
				const t = world.trees[i]
				if (!t.gone && dist2(t.x, t.y, x, y) < r2) fn(t)
			}
		}
}
