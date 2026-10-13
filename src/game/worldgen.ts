import { makeNoise, mulberry32 } from '../core/rng'
import { dist2 } from '../core/util'
import { CELL, CX, CY, H, W, idx, type Bush, type Cell, type Rock, type Tree, type World } from './state'

export function genWorld(seed: number): World {
	const r = mulberry32(seed)
	const nF = makeNoise(seed * 7 + 1), nS = makeNoise(seed * 13 + 5), nL = makeNoise(seed * 29 + 3)
	const water = new Uint8Array(W * H), sand = new Uint8Array(W * H), shade = new Float32Array(W * H)

	const la = r() * Math.PI * 2, ld = 28 + r() * 5
	const lx = CX + Math.cos(la) * ld * 1.2, ly = CY + Math.sin(la) * ld * 0.85, lr = 6 + r() * 3
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++) {
			const d = Math.hypot((x + 0.5 - lx) / 1.35, y + 0.5 - ly)
			if (d < lr + (nL(x * 0.12, y * 0.12) - 0.5) * 7) water[idx(x, y)] = 1
			shade[idx(x, y)] = nS(x * 0.09, y * 0.09)
		}
	for (let y = 1; y < H - 1; y++)
		for (let x = 1; x < W - 1; x++) {
			if (water[idx(x, y)]) continue
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (water[idx(x + dx, y + dy)]) sand[idx(x, y)] = 1
		}

	const trees: Tree[] = []
	for (let y = 2; y < H - 1; y++)
		for (let x = 1; x < W - 1; x++) {
			if (water[idx(x, y)] || sand[idx(x, y)]) continue
			const d = Math.hypot(x + 0.5 - CX, (y + 0.5 - CY) * 1.25)
			const f = nF(x * 0.065, y * 0.065)
			let p = (f - 0.5) * 3.6
			if (d < 9) p = -1
			else if (d < 17) p -= (17 - d) * 0.09
			const chance = p > 0 ? Math.min(0.8, p + 0.18) : d > 7 ? 0.018 : 0
			if (r() < chance)
				trees.push({ k: 0, x: x + 0.2 + r() * 0.6, y: y + 0.3 + r() * 0.6, pine: r() < (f > 0.6 ? 0.75 : 0.15),
					v: r(), sc: 0.85 + r() * 0.35, g: 1, cut: 0, rt: 0, res: 0, gone: 0 })
		}

	const rocks: Rock[] = []
	const nC = 3 + Math.floor(r() * 2)
	for (let c = 0; c < nC; c++) {
		const a = la + Math.PI * 0.55 + c * ((Math.PI * 0.9) / (nC - 1)) + r() * 0.3
		const dd = c === 0 ? 11 + r() * 2 : 13 + r() * 9
		addRockCluster(rocks, CX + Math.cos(a) * dd * 1.2, CY + Math.sin(a) * dd * 0.85, 6 + Math.floor(r() * 5), r, water)
	}

	const bushes: Bush[] = []
	for (let i = 0; i < 600 && bushes.length < 45; i++) {
		const x = 2 + r() * (W - 4), y = 3 + r() * (H - 5)
		const d = Math.hypot(x - CX, (y - CY) * 1.25)
		if (d < 8 || d > 30 || water[idx(x | 0, y | 0)] || sand[idx(x | 0, y | 0)]) continue
		const f = nF(x * 0.065, y * 0.065)
		if (f < 0.45 || f > 0.56) continue
		bushes.push({ k: 2, x, y, ber: 1, rt: 0, res: 0, gone: 0, v: r() })
	}
	for (const t of trees) {
		if (rocks.some((k) => dist2(k.x, k.y, t.x, t.y) < 1.2)) t.gone = 1
		if (bushes.some((b) => dist2(b.x, b.y, t.x, t.y) < 0.45)) t.gone = 1
	}

	const cells: Cell[] = []
	const cellMap = new Map<string, Cell>()
	for (let j = -15; j <= 15; j++)
		for (let i = -21; i <= 21; i++) {
			if (!i && !j) continue
			const ox = CX - 1 + i * CELL, oy = CY - 1 + j * CELL
			if (ox - 1 < 1 || oy - 1 < 2 || ox + 3 > W - 1 || oy + 3 > H - 1) continue
			let bad = false
			for (let y = oy - 1; y < oy + 3 && !bad; y++)
				for (let x = ox - 1; x < ox + 3; x++) if (water[idx(x, y)] || sand[idx(x, y)]) { bad = true; break }
			if (bad) continue
			const cell: Cell = { i, j, ox, oy, key: i + ',' + j, d: Math.hypot(i, j * 1.2) + r() * 0.9 }
			cells.push(cell)
			cellMap.set(cell.key, cell)
		}
	cells.sort((a, b) => a.d - b.d)
	// Some cells stay green: little parks with protected trees
	for (const cell of cells) {
		if (cell.d < 2.4 || r() > 0.17) continue
		cell.park = true
		const n = 1 + Math.floor(r() * 3)
		for (let k = 0; k < n; k++)
			trees.push({ k: 0, x: cell.ox + 0.3 + r() * 1.4, y: cell.oy + 0.5 + r() * 1.3, pine: r() < 0.25, v: r(), sc: 0.8 + r() * 0.3,
				g: 1, cut: 0, rt: 0, res: 0, gone: 0, park: 1 })
		if (r() < 0.5) bushes.push({ k: 2, x: cell.ox + 0.4 + r() * 1.2, y: cell.oy + 1.6 + r() * 0.3, ber: 1, rt: 0, res: 0, gone: 0, v: r(), park: 1 })
	}

	const sparkles: World['sparkles'] = []
	for (let i = 0; i < 4000 && sparkles.length < 60; i++) {
		const x = Math.floor(r() * W), y = Math.floor(r() * H)
		if (water[idx(x, y)]) sparkles.push({ x: x + r(), y: y + r(), p: r() * 6.28 })
	}
	const clouds: World['clouds'] = []
	for (let i = 0; i < 6; i++) clouds.push({ x: r() * W, y: r() * H, r: 5 + r() * 6, sp: 0.25 + r() * 0.3 })

	const treeOrder = trees.map((_, i) => i).sort((a, b) => trees[a].y - trees[b].y)
	return { seed, water, sand, shade, trees, treeOrder, rocks, bushes, cells, cellMap, sparkles, clouds }
}

export function addRockCluster(rocks: Rock[], cx: number, cy: number, n: number, r: () => number, water: Uint8Array) {
	for (let k = 0; k < n; k++) {
		const a = r() * Math.PI * 2, rr = 0.4 + r() * 2.2
		const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.8
		if (x < 2 || y < 3 || x > W - 2 || y > H - 2 || water[idx(x | 0, y | 0)]) continue
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
export function nearestTree(world: World, x: number, y: number, ok: (t: Tree) => boolean): Tree | null {
	const gx = Math.floor(x / GS), gy = Math.floor(y / GS), gh = Math.ceil(H / GS)
	let best: Tree | null = null, bd = Infinity
	for (let ring = 0; ring < Math.max(gridW, gh); ring++) {
		// any tree in this ring is at least (ring-1)*GS away
		if (best && (ring - 1) * GS * ((ring - 1) * GS) > bd) break
		for (let cy = gy - ring; cy <= gy + ring; cy++)
			for (let cx = gx - ring; cx <= gx + ring; cx++) {
				if (Math.max(Math.abs(cx - gx), Math.abs(cy - gy)) !== ring) continue
				if (cx < 0 || cy < 0 || cx >= gridW || cy >= gh) continue
				for (const i of treeGrid[cy * gridW + cx]) {
					const t = world.trees[i]
					if (!ok(t)) continue
					const d = dist2(t.x, t.y, x, y)
					if (d < bd) { bd = d; best = t }
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
