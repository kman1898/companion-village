import { shade } from '../core/util'
import type { BType } from '../data/buildings'
import { El, Ln, OUT, Pl, Rc, type Ctx } from './draw'
import { arcology, factory, fusion, habdome, launchpad, modernhouse, skypod, skyscraper, starship, teleporter, townhouse, windfarm } from './art-future'
import { landmarkArt } from './landmarks'
import { TRIBES, type TribeId } from '../data/tribes'

/** Which tribe the art is being drawn for (roof colours, banners) */
export const artCtx = { tribe: 'pixels' as TribeId }
const roofs = () => TRIBES[artCtx.tribe].roofs

/*
 * Building art. Local units: 1 = one tile, the 2×2 footprint spans (0,0)–(2,2),
 * the front edge sits at y≈1.9 and art grows upwards into negative y.
 * Each function returns the chimney top (for smoke) or null.
 */

interface GableOpts {
	x?: number; w?: number; yb?: number; wh?: number; rh?: number
	wall: string; roof: string
	frame?: string; stone?: boolean; logs?: boolean; planks?: boolean
	door?: 'normal' | 'barn' | 'big' | false; doorX?: number
	win?: number; rows?: number; ins?: number; chim?: boolean
}

/** Generic house: front wall + hipped roof seen from above-front */
export function gable(c: Ctx, o: GableOpts): [number, number] | null {
	const x = o.x ?? 0.15, w = o.w ?? 1.7, yb = o.yb ?? 1.88, wh = o.wh ?? 0.72, rh = o.rh ?? 0.95
	const yt = yb - wh, dep = 0.14
	c.lineWidth = 0.035
	c.lineJoin = 'round'
	Pl(c, [x + w, yb, x + w + dep, yb - 0.12, x + w + dep, yt - 0.1, x + w, yt], shade(o.wall, -0.3), OUT)
	Rc(c, x, yt, w, wh, o.wall, OUT)
	if (o.stone) {
		let row = 0
		for (let yy = yt + 0.14; yy < yb; yy += 0.14, row++) {
			Ln(c, x, yy, x + w, yy, 'rgba(60,55,48,0.35)', 0.02)
			for (let xx = x + (row % 2 ? 0.12 : 0.24); xx < x + w; xx += 0.24) Ln(c, xx, yy - 0.14, xx, yy, 'rgba(60,55,48,0.3)', 0.02)
		}
	}
	if (o.logs) for (let yy = yt + 0.11; yy < yb; yy += 0.11) Ln(c, x, yy, x + w, yy, 'rgba(50,30,15,0.5)', 0.022)
	if (o.planks) for (let xx = x + 0.12; xx < x + w; xx += 0.12) Ln(c, xx, yt, xx, yb, 'rgba(50,30,15,0.28)', 0.018)
	if (o.frame) {
		c.strokeStyle = o.frame
		c.lineWidth = 0.05
		c.strokeRect(x + 0.03, yt + 0.03, w - 0.06, wh - 0.06)
		Ln(c, x, yt + wh * 0.45, x + w, yt + wh * 0.45, o.frame, 0.045)
		Ln(c, x + 0.03, yt + 0.03, x + 0.3, yt + wh * 0.45, o.frame, 0.035)
		Ln(c, x + w - 0.03, yt + 0.03, x + w - 0.3, yt + wh * 0.45, o.frame, 0.035)
	}
	const door = o.door ?? 'normal'
	const nw = o.win ?? 2, rows = o.rows ?? 1
	const dx = o.doorX ?? (nw === 1 ? x + w * 0.66 : x + w / 2)
	for (let rr = 0; rr < rows; rr++) {
		const wy = rows === 1 ? yt + wh * 0.22 : rr === 0 ? yt + wh * 0.12 : yt + wh * 0.55
		const bottom = rr === rows - 1
		for (let k = 0; k < nw; k++) {
			const wx = nw === 1 ? x + w * 0.22 : x + (w * (k + 1)) / (nw + 1) - 0.1
			if (bottom && door && Math.abs(wx + 0.1 - dx) < 0.25) continue
			c.lineWidth = 0.035
			Rc(c, wx, wy, 0.2, 0.2, '#f3d27a', OUT)
			Ln(c, wx + 0.1, wy, wx + 0.1, wy + 0.2, '#7a5434', 0.02)
			Ln(c, wx, wy + 0.1, wx + 0.2, wy + 0.1, '#7a5434', 0.02)
		}
	}
	c.lineWidth = 0.035
	if (door === 'normal') Rc(c, dx - 0.12, yb - 0.38, 0.24, 0.38, '#5a3b22', OUT)
	else if (door === 'barn' || door === 'big') {
		const bw = door === 'barn' ? 0.5 : 0.6, bh = 0.5
		Rc(c, dx - bw / 2, yb - bh, bw, bh, door === 'barn' ? '#7a2621' : '#6b4a2e', OUT)
		Ln(c, dx - bw / 2, yb - bh, dx + bw / 2, yb, '#f1e6d0', 0.035)
		Ln(c, dx + bw / 2, yb - bh, dx - bw / 2, yb, '#f1e6d0', 0.035)
	}
	const ov = 0.1, ins = o.ins ?? 0.3, ye = yt + 0.06, yr = yt - rh
	const x0 = x - ov, x1 = x + w + ov + dep, x2 = x + w - ins + dep, x3 = x + ins
	c.lineWidth = 0.035
	Pl(c, [x0, ye, x1, ye, x2, yr, x3, yr], o.roof, OUT)
	Pl(c, [(x0 + x1) / 2 + 0.25, ye, x1, ye, x2, yr, (x3 + x2) / 2 + 0.2, yr], 'rgba(0,0,0,0.12)')
	for (let k = 1; k <= 3; k++) {
		const f = k / 4, yy = ye + (yr - ye) * f
		Ln(c, x0 + (x3 - x0) * f, yy, x1 + (x2 - x1) * f, yy, 'rgba(0,0,0,0.16)', 0.02)
	}
	Ln(c, x3, yr, x2, yr, 'rgba(255,255,255,0.28)', 0.04)
	c.lineWidth = 0.035
	if (o.chim) {
		const cx = x + w * 0.72, cy = yr + rh * 0.4
		Rc(c, cx, cy - 0.28, 0.13, 0.3, '#8b6a55', OUT)
		Rc(c, cx - 0.02, cy - 0.31, 0.17, 0.05, '#6d5242', OUT)
		return [cx + 0.065, cy - 0.34]
	}
	return null
}

export function logPile(c: Ctx, x: number, y: number, n = 6) {
	c.lineWidth = 0.025
	const pos = [[0, 0], [0.16, 0], [0.32, 0], [0.08, -0.13], [0.24, -0.13], [0.16, -0.26]]
	for (let i = 0; i < Math.min(n, 6); i++) {
		El(c, x + pos[i][0], y + pos[i][1] - 0.07, 0.08, 0.075, '#8a5a2b', OUT)
		El(c, x + pos[i][0], y + pos[i][1] - 0.07, 0.045, 0.04, '#d8b27c')
	}
}
export function stonePile(c: Ctx, x: number, y: number, n = 5) {
	c.lineWidth = 0.025
	const pos = [[0, 0], [0.17, 0.01], [0.33, 0], [0.09, -0.13], [0.25, -0.13], [0.17, -0.25]]
	for (let i = 0; i < Math.min(n, 6); i++) Rc(c, x + pos[i][0] - 0.08, y + pos[i][1] - 0.14, 0.16, 0.13, i % 2 ? '#a9a59c' : '#bdb9b0', OUT)
}
export function sackPile(c: Ctx, x: number, y: number, n = 3) {
	c.lineWidth = 0.025
	for (let i = 0; i < Math.min(n, 4); i++) El(c, x + i * 0.15, y - 0.1 - (i === 3 ? 0.12 : 0), 0.085, 0.1, '#dcc48e', OUT)
}

function stall(c: Ctx, x: number, col: string) {
	c.lineWidth = 0.035
	Rc(c, x + 0.08, 1.45, 0.8, 0.42, '#9a6b3c', OUT)
	const cols = ['#d9433a', '#f0a43a', '#7cb342', '#e8d25a']
	for (let k = 0; k < 6; k++) El(c, x + 0.2 + k * 0.11, 1.42, 0.055, 0.045, cols[k % 4])
	Rc(c, x + 0.08, 0.95, 0.05, 0.92, '#6b4a2e')
	Rc(c, x + 0.83, 0.95, 0.05, 0.92, '#6b4a2e')
	const y0 = 0.82, y1 = 1.12
	for (let k = 0; k < 5; k++)
		Pl(c, [x + k * 0.192, y1, x + (k + 1) * 0.192, y1, x + 0.04 + (k + 1) * 0.176, y0, x + 0.04 + k * 0.176, y0], k % 2 ? '#f4ecdc' : col)
	Pl(c, [x, y1, x + 0.96, y1, x + 0.92, y0, x + 0.04, y0], null, OUT)
}

function stoneBlocks(c: Ctx, x0: number, x1: number, y0: number, y1: number, step = 0.17) {
	let row = 0
	for (let yy = y0 + step; yy < y1; yy += step, row++) {
		Ln(c, x0, yy, x1, yy, 'rgba(60,55,48,0.28)', 0.02)
		for (let xx = x0 + (row % 2 ? step * 0.8 : step * 1.6); xx < x1; xx += step * 1.6) Ln(c, xx, yy - step, xx, yy, 'rgba(60,55,48,0.22)', 0.02)
	}
}

function arch(c: Ctx, x0: number, x1: number, yb: number, ys: number, fill: string) {
	const r = (x1 - x0) / 2
	c.beginPath()
	c.moveTo(x0, yb)
	c.lineTo(x0, ys)
	c.arc(x0 + r, ys, r, Math.PI, 0)
	c.lineTo(x1, yb)
	c.fillStyle = fill
	c.fill()
	c.strokeStyle = OUT
	c.stroke()
}

const ROOFS = ['#b4553c', '#9c4632', '#8c5a3a', '#6e7d44', '#a8633a', '#7b4a5e']
const WALLS = ['#ecdab2', '#e5cfa0', '#f1e3c4', '#e8d2b8']

export const ART: Record<BType, (c: Ctx, v: number) => [number, number] | null> = {
	townhouse, modernhouse, habdome, skypod, factory, skyscraper, windfarm, launchpad, fusion, arcology, teleporter, starship,
	house: (c, v) => gable(c, { wall: WALLS[v % 4], roof: v % 4 === 3 ? ROOFS[v % 6] : roofs()[v % 6], frame: '#7a5434', chim: v % 3 !== 0 }),
	landmark(c, style) {
		c.save()
		c.translate(1, 1.9)
		landmarkArt(c, artCtx.tribe, style)
		c.restore()
		return null
	},
	barracks(c, v) {
		const col = TRIBES[artCtx.tribe].color
		c.lineWidth = 0.035
		Rc(c, 0.05, 0.4, 1.9, 1.5, 'rgba(150,120,80,0.45)')
		// palisade
		for (let x = 0.05; x <= 1.96; x += 0.13) {
			Pl(c, [x - 0.05, 0.55, x + 0.05, 0.55, x + 0.05, 0.25, x, 0.15, x - 0.05, 0.25], '#8a5a2b', OUT)
		}
		// tents in the tribe colour
		for (const [tx, ty] of [[0.5, 1.3], [1.4, 1.25]]) {
			Pl(c, [tx - 0.38, ty + 0.4, tx + 0.38, ty + 0.4, tx, ty - 0.25], col, OUT)
			Pl(c, [tx - 0.08, ty + 0.4, tx + 0.08, ty + 0.4, tx, ty + 0.05], '#2a1a10')
		}
		// training dummy and banner
		Ln(c, 1.0, 1.9, 1.0, 1.55, '#6b4a2e', 0.04)
		El(c, 1.0, 1.5, 0.08, 0.08, '#d8c79a', OUT)
		Ln(c, 1.75, 1.85, 1.75, 0.6, '#5a3b22', 0.04)
		Pl(c, [1.77, 0.62, 2.15, 0.72, 1.77, 0.86], col, OUT)
		void v
		return null
	},
	stonehouse: (c, v) => gable(c, { x: 0.1, w: 1.72, wh: 0.85, rh: 1.0, wall: '#bcb5a6', stone: true, roof: v % 2 ? roofs()[(v + 2) % 6] : ['#56657a', '#5e4f6e', '#4d6b5f', '#6a5848'][v % 4], chim: true }),
	woodhut(c) {
		const s = gable(c, { x: 0.12, w: 1.25, wh: 0.62, rh: 0.72, wall: '#8d5f33', logs: true, roof: '#5f7a3c', win: 1, ins: 0.25 })
		logPile(c, 1.55, 1.92)
		return s
	},
	quarry(c) {
		const s = gable(c, { x: 0.1, w: 1.3, wh: 0.62, rh: 0.68, wall: '#a8a194', stone: true, roof: '#7a5d44', win: 1 })
		stonePile(c, 1.6, 1.95)
		return s
	},
	farm(c) {
		gable(c, { x: 0.08, w: 1.45, wh: 0.85, rh: 0.95, wall: '#a8392f', roof: '#5b4131', door: 'barn', win: 0, planks: true })
		El(c, 1.8, 1.78, 0.17, 0.15, '#e2c35a', OUT)
		Ln(c, 1.66, 1.74, 1.94, 1.74, 'rgba(120,90,20,0.6)', 0.02)
		return null
	},
	well(c) {
		c.lineWidth = 0.035
		El(c, 1, 1.72, 0.5, 0.24, '#857f73', OUT)
		Rc(c, 0.5, 1.48, 1, 0.24, '#8f897d')
		Ln(c, 0.5, 1.48, 0.5, 1.72, OUT, 0.035)
		Ln(c, 1.5, 1.48, 1.5, 1.72, OUT, 0.035)
		El(c, 1, 1.48, 0.5, 0.24, '#a7a195', OUT)
		El(c, 1, 1.47, 0.36, 0.15, '#2f4d66')
		c.lineWidth = 0.035
		Rc(c, 0.56, 0.78, 0.07, 0.72, '#7a5434', OUT)
		Rc(c, 1.37, 0.78, 0.07, 0.72, '#7a5434', OUT)
		Ln(c, 0.6, 0.95, 1.4, 0.95, '#5a3b22', 0.05)
		Ln(c, 1, 0.95, 1, 1.24, '#d8c79a', 0.02)
		c.lineWidth = 0.035
		Rc(c, 0.93, 1.22, 0.14, 0.12, '#6b4a2e', OUT)
		Pl(c, [0.4, 0.86, 1.6, 0.86, 1.38, 0.48, 0.62, 0.48], '#9c4632', OUT)
		return null
	},
	storehouse(c) {
		gable(c, { x: 0.06, w: 1.74, wh: 0.92, rh: 1.05, wall: '#c49a5e', planks: true, roof: '#7b4b2a', door: 'big', win: 0, ins: 0.35 })
		El(c, 1.86, 1.78, 0.12, 0.15, '#7a5434', OUT)
		Ln(c, 1.74, 1.72, 1.98, 1.72, '#4a3424', 0.025)
		return null
	},
	bakery(c) {
		const s = gable(c, { wall: '#f0dcc0', roof: '#c4692f', frame: '#8a5a33', chim: true })
		El(c, 1.86, 1.76, 0.2, 0.16, '#b05a3a', OUT)
		El(c, 1.86, 1.8, 0.09, 0.07, '#2e1c12')
		return s
	},
	sawmill(c) {
		c.lineWidth = 0.035
		Rc(c, 0.1, 1.0, 1.8, 0.4, '#9a6b3c', OUT)
		Rc(c, 0.05, 1.65, 1.9, 0.25, '#a57b4c', OUT)
		Rc(c, 0.3, 1.48, 1.3, 0.12, '#6b4a2e', OUT)
		Rc(c, 0.25, 1.32, 1.4, 0.16, '#8a5a2b', OUT)
		El(c, 0.25, 1.4, 0.05, 0.08, '#d8b27c', OUT)
		El(c, 1.0, 1.42, 0.17, 0.17, '#c9ced6', OUT)
		Rc(c, 0.1, 0.95, 0.08, 0.95, '#6b4a2e', OUT)
		Rc(c, 1.82, 0.95, 0.08, 0.95, '#6b4a2e', OUT)
		Pl(c, [-0.04, 1.04, 2.06, 1.04, 1.86, 0.45, 0.16, 0.45], '#7a5a3a', OUT)
		for (let k = 1; k <= 3; k++) Ln(c, -0.04 + 0.2 * (k / 4), 1.04 - 0.59 * (k / 4), 2.06 - 0.2 * (k / 4), 1.04 - 0.59 * (k / 4), 'rgba(0,0,0,0.16)', 0.02)
		return null
	},
	market(c) {
		stall(c, 0.02, '#c8432f')
		stall(c, 1.02, '#3d6fa8')
		return null
	},
	tavern(c) {
		const s = gable(c, { x: 0.05, w: 1.75, wh: 1.15, rh: 1.0, wall: '#dcc394', frame: '#6e4a2c', win: 3, rows: 2, roof: '#7d3a2c', chim: true })
		Ln(c, 1.8, 1.0, 2.15, 1.0, '#3a2a1e', 0.035)
		c.lineWidth = 0.035
		Rc(c, 1.97, 1.03, 0.22, 0.2, '#7a5434', OUT)
		Rc(c, 2.03, 1.08, 0.08, 0.1, '#f2c230')
		return s
	},
	windmill(c) {
		c.lineWidth = 0.035
		Pl(c, [0.5, 1.9, 1.5, 1.9, 1.32, 0.55, 0.68, 0.55], '#e6dcc8', OUT)
		Pl(c, [1.18, 1.9, 1.5, 1.9, 1.32, 0.55, 1.12, 0.55], 'rgba(0,0,0,0.1)')
		Pl(c, [0.48, 1.9, 1.52, 1.9, 1.48, 1.6, 0.52, 1.6], '#a39b8c', OUT)
		Rc(c, 0.88, 1.45, 0.24, 0.45, '#5a3b22', OUT)
		Rc(c, 0.92, 0.95, 0.16, 0.16, '#f3d27a', OUT)
		Pl(c, [0.6, 0.6, 1.4, 0.6, 1.22, 0.24, 0.78, 0.24], '#7a4a2e', OUT)
		El(c, 1, 0.24, 0.22, 0.08, '#7a4a2e', OUT)
		return null
	},
	church(c) {
		gable(c, { x: 0.62, w: 1.25, wh: 0.82, rh: 0.85, wall: '#efe9df', roof: '#4f5f73', win: 2, door: false, ins: 0.25 })
		c.lineWidth = 0.035
		Rc(c, 0.08, -0.25, 0.56, 2.13, '#e7e0d4', OUT)
		Rc(c, 0.5, -0.25, 0.14, 2.13, 'rgba(0,0,0,0.08)')
		arch(c, 0.2, 0.52, 1.88, 1.55, '#5a3b22')
		arch(c, 0.24, 0.48, 0.35, 0.17, '#3b3b46')
		Rc(c, 0.28, 0.75, 0.16, 0.22, '#f3d27a', OUT)
		Pl(c, [0.02, -0.25, 0.7, -0.25, 0.36, -1.25], '#4f5f73', OUT)
		Pl(c, [0.36, -1.25, 0.7, -0.25, 0.48, -0.25], 'rgba(0,0,0,0.15)')
		Ln(c, 0.36, -1.25, 0.36, -1.55, '#e9c45a', 0.05)
		Ln(c, 0.26, -1.45, 0.46, -1.45, '#e9c45a', 0.05)
		return null
	},
	library(c) {
		c.lineWidth = 0.035
		// stone hall with columns and a pediment
		Pl(c, [1.85, 1.9, 1.99, 1.78, 1.99, 0.6, 1.85, 0.68], '#9d9585', OUT)
		Rc(c, 0.15, 0.68, 1.7, 1.22, '#d8d0bf', OUT)
		stoneBlocks(c, 0.15, 1.85, 0.68, 1.9, 0.15)
		Rc(c, 0.05, 1.78, 1.9, 0.12, '#bfb6a3', OUT)
		for (let k = 0; k < 5; k++) {
			const x = 0.24 + k * 0.36
			Rc(c, x, 0.82, 0.12, 0.96, '#f1ece0', OUT)
		}
		arch(c, 0.82, 1.18, 1.78, 1.38, '#5a3b22')
		Rc(c, 0.05, 0.6, 1.9, 0.12, '#bfb6a3', OUT)
		Pl(c, [0.0, 0.62, 2.0, 0.62, 1.0, 0.05], '#a63f2f', OUT)
		Pl(c, [0.35, 0.52, 1.65, 0.52, 1.0, 0.2], '#d8d0bf', OUT)
		El(c, 1.0, 0.4, 0.1, 0.08, '#e9c45a', OUT)
		return null
	},
	clocktower(c) {
		c.lineWidth = 0.035
		Pl(c, [1.4, 1.9, 1.52, 1.8, 1.52, -1.0, 1.4, -0.95], '#8e8779', OUT)
		Rc(c, 0.6, -0.95, 0.8, 2.85, '#cbbfa8', OUT)
		stoneBlocks(c, 0.6, 1.4, -0.95, 1.9, 0.17)
		arch(c, 0.82, 1.18, 1.9, 1.62, '#5a3b22')
		Rc(c, 0.94, 0.5, 0.12, 0.3, '#2b2b33')
		// clock face
		El(c, 1.0, -0.45, 0.3, 0.3, '#f6efdc', OUT)
		Ln(c, 1.0, -0.45, 1.0, -0.66, '#2a1a10', 0.04)
		Ln(c, 1.0, -0.45, 1.15, -0.4, '#2a1a10', 0.04)
		El(c, 1.0, -0.45, 0.03, 0.03, '#2a1a10')
		Rc(c, 0.5, -1.1, 1.0, 0.18, '#a59e90', OUT)
		Pl(c, [0.5, -1.1, 1.5, -1.1, 1.0, -1.95], '#3f5a6e', OUT)
		Pl(c, [1.0, -1.95, 1.5, -1.1, 1.18, -1.1], 'rgba(0,0,0,0.15)')
		Ln(c, 1.0, -1.95, 1.0, -2.2, '#e9c45a', 0.04)
		El(c, 1.0, -2.22, 0.05, 0.05, '#e9c45a')
		return null
	},
	tower(c) {
		c.lineWidth = 0.035
		Pl(c, [1.5, 1.9, 1.62, 1.8, 1.62, -0.95, 1.5, -0.9], '#8e8779', OUT)
		Rc(c, 0.5, -0.9, 1.0, 2.8, '#b4ad9f', OUT)
		stoneBlocks(c, 0.5, 1.5, -0.9, 1.9, 0.17)
		c.lineWidth = 0.035
		Rc(c, 0.4, -1.15, 1.32, 0.28, '#a59e90', OUT)
		for (let k = 0; k < 4; k++) Rc(c, 0.4 + k * 0.37, -1.33, 0.2, 0.18, '#a59e90', OUT)
		Rc(c, 0.95, -0.45, 0.1, 0.3, '#2b2b33')
		Rc(c, 0.95, 0.4, 0.1, 0.3, '#2b2b33')
		arch(c, 0.82, 1.18, 1.9, 1.6, '#5a3b22')
		Ln(c, 1.06, -1.33, 1.06, -2.05, '#5a3b22', 0.04)
		c.lineWidth = 0.03
		Pl(c, [1.08, -2.03, 1.52, -1.9, 1.08, -1.77], '#c8432f', OUT)
		return null
	},
	fountain(c) {
		c.lineWidth = 0.035
		El(c, 1, 1.64, 0.82, 0.36, '#8f897d', OUT)
		Rc(c, 0.18, 1.46, 1.64, 0.18, '#8f897d')
		Ln(c, 0.18, 1.46, 0.18, 1.64, OUT, 0.035)
		Ln(c, 1.82, 1.46, 1.82, 1.64, OUT, 0.035)
		El(c, 1, 1.46, 0.82, 0.36, '#b1ab9f', OUT)
		El(c, 1, 1.46, 0.68, 0.27, '#5d9fca')
		c.lineWidth = 0.035
		Rc(c, 0.93, 0.95, 0.14, 0.52, '#b1ab9f', OUT)
		El(c, 1, 0.95, 0.3, 0.1, '#b1ab9f', OUT)
		El(c, 1, 0.93, 0.22, 0.06, '#5d9fca')
		return null
	},
	keep(c) {
		c.lineWidth = 0.035
		Rc(c, 0.28, 0.2, 1.44, 1.7, '#b8b1a3', OUT)
		stoneBlocks(c, 0.28, 1.72, 0.2, 1.9, 0.17)
		c.lineWidth = 0.035
		for (let k = 0; k < 5; k++) Rc(c, 0.36 + k * 0.27, 0.04, 0.16, 0.17, '#b8b1a3', OUT)
		for (const tx of [0, 1.5]) {
			Rc(c, tx, -0.35, 0.5, 2.25, '#aaa395', OUT)
			Rc(c, tx + 0.2, 0.2, 0.09, 0.26, '#2b2b33')
			Rc(c, tx + 0.2, 0.95, 0.09, 0.26, '#2b2b33')
			Pl(c, [tx - 0.07, -0.35, tx + 0.57, -0.35, tx + 0.25, -1.05], '#4a5d80', OUT)
			Pl(c, [tx + 0.25, -1.05, tx + 0.57, -0.35, tx + 0.36, -0.35], 'rgba(0,0,0,0.15)')
		}
		arch(c, 0.75, 1.25, 1.9, 1.45, '#3a2a1e')
		for (let xx = 0.82; xx < 1.2; xx += 0.1) Ln(c, xx, 1.32, xx, 1.9, 'rgba(160,150,130,0.6)', 0.02)
		for (const bx of [0.5, 1.34]) Pl(c, [bx, 0.45, bx + 0.16, 0.45, bx + 0.16, 0.88, bx + 0.08, 0.8, bx, 0.88], '#c8432f', OUT)
		Ln(c, 1.75, -1.05, 1.75, -1.5, '#5a3b22', 0.035)
		c.lineWidth = 0.03
		Pl(c, [1.77, -1.5, 2.1, -1.41, 1.77, -1.32], '#e9c45a', OUT)
		return null
	},
	graveyard(c, graves) {
		c.lineWidth = 0.03
		Rc(c, 0.05, 0.25, 1.9, 1.65, 'rgba(70,90,50,0.35)')
		// fence
		for (let x = 0.05; x <= 1.96; x += 0.19) {
			Ln(c, x, 0.25, x, 0.05, '#6b4a2e', 0.04)
			Ln(c, x, 1.9, x, 1.68, '#6b4a2e', 0.04)
		}
		for (let y = 0.25; y <= 1.9; y += 0.21) {
			Ln(c, 0.05, y, 0.05, y - 0.2, '#6b4a2e', 0.04)
			Ln(c, 1.95, y, 1.95, y - 0.2, '#6b4a2e', 0.04)
		}
		Ln(c, 0.05, 0.15, 1.95, 0.15, '#6b4a2e', 0.03)
		Ln(c, 0.05, 1.78, 1.95, 1.78, '#6b4a2e', 0.03)
		for (let i = 0; i < Math.min(12, graves); i++) {
			const gx = 0.35 + (i % 4) * 0.43, gy = 0.65 + Math.floor(i / 4) * 0.45
			El(c, gx, gy + 0.05, 0.13, 0.04, 'rgba(70,50,30,0.4)')
			if (i % 3 === 2) {
				Ln(c, gx, gy + 0.04, gx, gy - 0.26, '#d7d2c8', 0.05)
				Ln(c, gx - 0.08, gy - 0.17, gx + 0.08, gy - 0.17, '#d7d2c8', 0.05)
			} else {
				c.beginPath()
				c.moveTo(gx - 0.08, gy + 0.04)
				c.lineTo(gx - 0.08, gy - 0.14)
				c.arc(gx, gy - 0.14, 0.08, Math.PI, 0)
				c.lineTo(gx + 0.08, gy + 0.04)
				c.closePath()
				c.fillStyle = '#b9b4aa'
				c.fill()
				c.strokeStyle = OUT
				c.stroke()
			}
		}
		return null
	},
}
