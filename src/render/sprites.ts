import { mulberry32 } from '../core/rng'
import { ROLE, type BType, type Res, type Role } from '../data/buildings'
import { ART } from './art'
import { canvas, El, Ln, Pl, Rc, roundRect, type Ctx } from './draw'

export interface Sprite {
	c: HTMLCanvasElement
	/** world-space offset of the canvas top-left from the anchor */
	ox: number
	oy: number
	w: number
	h: number
}

function makeSprite(R: number, x0: number, y0: number, x1: number, y1: number, draw: (g: Ctx) => void): Sprite {
	const [c, g] = canvas((x1 - x0) * R, (y1 - y0) * R)
	g.setTransform(R, 0, 0, R, -x0 * R, -y0 * R)
	draw(g)
	return { c, ox: x0, oy: y0, w: c.width / R, h: c.height / R }
}

export function drawSprite(ctx: Ctx, s: Sprite, x: number, y: number, scale = 1) {
	ctx.drawImage(s.c, x + s.ox * scale, y + s.oy * scale, s.w * scale, s.h * scale)
}

// ---------------------------------------------------------------------
// Buildings (anchor = footprint top-left)
// ---------------------------------------------------------------------
const SR = 80
const buildingCache = new Map<string, Sprite & { smoke: [number, number] | null }>()
export function buildingSprite(type: BType, v: number) {
	const key = type + ':' + v
	let sp = buildingCache.get(key)
	if (sp) return sp
	let smoke: [number, number] | null = null
	const s = makeSprite(SR, -0.5, -2.4, 2.5, 2.25, (g) => {
		if (type !== 'graveyard') El(g, 1.12, 1.9, 1.0, 0.16, 'rgba(0,0,0,0.2)')
		smoke = ART[type](g, v)
	})
	sp = Object.assign(s, { smoke })
	buildingCache.set(key, sp)
	return sp
}
export function clearSpriteCaches() {
	buildingCache.clear()
}

// ---------------------------------------------------------------------
// Trees (anchor = trunk base)
// ---------------------------------------------------------------------
const DECID = [['#3f7d32', '#5a9a3f', '#2f6427'], ['#4b8a36', '#6aa846', '#376b2a'], ['#56813a', '#79a24c', '#3e6230'],
	['#6b8f2f', '#8fb045', '#4f6e25'], ['#3c7440', '#5b9555', '#2b5a31']]
const PINES = [['#2f5e3a', '#3f7449', '#224a2c'], ['#2c5640', '#3a6b50', '#1f4230'], ['#35603a', '#467a4a', '#264a2b']]
export let treeSprites: Sprite[][] = []
export let stumpSprite: Sprite

export function makeStaticSprites() {
	const R = 80
	const tree = (pine: boolean, col: string[]) =>
		makeSprite(R, -0.65, -1.42, 0.65, 0.18, (g) => {
			El(g, 0.1, 0.02, 0.34, 0.1, 'rgba(0,0,0,0.22)')
			Rc(g, -0.055, -0.36, 0.11, 0.38, '#6b4a2e')
			g.lineWidth = 0.025
			if (pine) {
				for (let i = 0; i < 3; i++) {
					const yb = -0.2 - i * 0.32, wd = 0.42 - i * 0.1
					Pl(g, [-wd, yb, wd, yb, 0, yb - 0.55], col[0], 'rgba(20,40,20,0.5)')
					Pl(g, [-wd * 0.2, yb - 0.05, -wd * 0.85, yb - 0.02, -0.02, yb - 0.5], col[1])
				}
			} else {
				const blobs = [[0, -0.66, 0.36], [-0.22, -0.52, 0.25], [0.22, -0.52, 0.25], [0.06, -0.86, 0.26]]
				for (const [x, y, r] of blobs) El(g, x, y, r, r * 0.95, col[0], 'rgba(20,40,20,0.45)')
				for (const [x, y, r] of blobs) El(g, x - r * 0.25, y - r * 0.25, r * 0.55, r * 0.5, col[1])
				El(g, 0.12, -0.5, 0.2, 0.12, col[2])
			}
		})
	treeSprites = [DECID.map((c) => tree(false, c)), PINES.map((c) => tree(true, c))]
	stumpSprite = makeSprite(64, -0.12, -0.13, 0.12, 0.02, (g) => {
		El(g, 0, -0.04, 0.1, 0.05, '#6b4a2e')
		El(g, 0, -0.07, 0.085, 0.04, '#cfa66e')
	})
}

// ---------------------------------------------------------------------
// Rocks & bushes (anchor = base)
// ---------------------------------------------------------------------
const rockCache = new Map<string, Sprite>()
export function rockSprite(seed: number, level: number) {
	const key = seed + ':' + level
	let sp = rockCache.get(key)
	if (sp) return sp
	sp = makeSprite(72, -0.6, -0.8, 0.65, 0.2, (g) => {
		g.lineWidth = 0.03
		if (level <= 0) {
			for (let i = 0; i < 3; i++) El(g, -0.15 + i * 0.15, -0.03, 0.06, 0.035, '#8d8b84')
			return
		}
		const sz = 0.2 + 0.26 * (level / 4)
		const r = mulberry32(seed)
		El(g, 0.06, 0, sz * 1.15, sz * 0.38, 'rgba(0,0,0,0.2)')
		const pts: number[] = [], pts2: number[] = []
		for (let i = 0; i < 8; i++) {
			const a = (i / 8) * Math.PI * 2, rad = sz * (0.75 + r() * 0.35)
			pts.push(Math.cos(a) * rad * 1.1, -sz * 0.5 + Math.sin(a) * rad * 0.72)
			pts2.push(-sz * 0.15 + Math.cos(a) * rad * 0.6, -sz * 0.72 + Math.sin(a) * rad * 0.38)
		}
		Pl(g, pts, '#9f9d95', 'rgba(40,38,34,0.6)')
		Pl(g, pts2, '#bebcb4')
	})
	rockCache.set(key, sp)
	return sp
}

const bushCache = new Map<string, Sprite>()
export function bushSprite(variant: number, berries: boolean) {
	const key = variant + ':' + berries
	let sp = bushCache.get(key)
	if (sp) return sp
	sp = makeSprite(72, -0.35, -0.45, 0.35, 0.12, (g) => {
		El(g, 0.04, 0, 0.26, 0.08, 'rgba(0,0,0,0.2)')
		g.lineWidth = 0.025
		for (const [dx, dy, r] of [[-0.12, -0.14, 0.15], [0.12, -0.14, 0.15], [0, -0.24, 0.17]]) El(g, dx, dy, r, r * 0.9, '#3d7a35', 'rgba(20,40,20,0.4)')
		El(g, -0.05, -0.28, 0.08, 0.06, '#5a9a45')
		if (berries) {
			g.fillStyle = '#d23b4a'
			for (let i = 0; i < 6; i++) {
				const a = variant * 2.3 + i * 1.7
				g.beginPath()
				g.arc(Math.cos(a) * 0.17, -0.18 + Math.sin(a) * 0.09, 0.03, 0, 7)
				g.fill()
			}
		}
	})
	bushCache.set(key, sp)
	return sp
}

// ---------------------------------------------------------------------
// Field patches (anchor = tile top-left). stage: 0 empty, 1..5 growing, 6 ripe
// ---------------------------------------------------------------------
const patchCache: Sprite[] = []
export function patchSprite(stage: number) {
	if (patchCache[stage]) return patchCache[stage]
	const sp = makeSprite(64, 0, 0, 1, 1, (g) => {
		g.lineWidth = 0.03
		Rc(g, 0.07, 0.1, 0.86, 0.84, '#7d5c3a', 'rgba(60,40,20,0.5)')
		for (let r = 0; r < 3; r++) Ln(g, 0.12, 0.3 + r * 0.25, 0.88, 0.3 + r * 0.25, 'rgba(50,32,15,0.45)', 0.035)
		if (stage === 0) return
		g.lineCap = 'round'
		const grown = stage === 6 ? 1 : stage / 5
		const col = stage === 6 ? '#e3c255' : grown > 0.6 ? '#9cbf4a' : '#6fae45'
		for (let r = 0; r < 3; r++)
			for (let i = 0; i < 5; i++) {
				const x = 0.17 + i * 0.165, y = 0.28 + r * 0.25, hgt = 0.05 + grown * 0.2
				Ln(g, x, y, x, y - hgt, col, 0.045)
				if (stage === 6) El(g, x, y - hgt, 0.035, 0.05, '#f0d77a')
			}
	})
	patchCache[stage] = sp
	return sp
}

// ---------------------------------------------------------------------
// Villagers (anchor = feet)
// ---------------------------------------------------------------------
const villagerCache = new Map<string, Sprite>()
const SICK_SKIN = '#a9c58a'

/** frame: 0..3 walk cycle, 4 standing */
export function villagerSprite(role: Role, skin: string, carry: Res | null, frame: number, face: 1 | -1, sick: boolean) {
	const key = `${role}|${skin}|${carry}|${frame}|${face}|${sick}`
	let sp = villagerCache.get(key)
	if (sp) return sp
	const R = ROLE[role]
	sp = makeSprite(80, -0.27, -0.7, 0.27, 0.07, (g) => {
		const f = face
		const walking = frame < 4
		const ph = Math.PI / 4 + (frame * Math.PI) / 2
		const bob = walking ? Math.abs(Math.sin(ph)) * 0.025 : 0
		const sw = walking ? Math.sin(ph) * 0.05 : 0
		const sk = sick ? SICK_SKIN : skin
		El(g, 0, 0, 0.13, 0.045, 'rgba(0,0,0,0.25)')
		g.lineCap = 'round'
		Ln(g, -0.035, -0.13, -0.035 + sw, -0.01, '#4a3424', 0.045)
		Ln(g, 0.035, -0.13, 0.035 - sw, -0.01, '#4a3424', 0.045)
		g.fillStyle = R.color
		roundRect(g, -0.08, -0.29 - bob, 0.16, 0.19, 0.045)
		g.fill()
		g.strokeStyle = 'rgba(40,25,10,0.5)'
		g.lineWidth = 0.02
		g.stroke()
		El(g, 0, -0.35 - bob, 0.065, 0.065, sk)
		El(g, f * 0.035, -0.355 - bob, 0.012, 0.012, '#2a1a10')
		const hy = -0.375 - bob
		g.fillStyle = R.hat
		switch (role) {
			case 'builder':
				g.beginPath(); g.arc(0, hy, 0.07, Math.PI, 0); g.fill()
				Ln(g, -0.08, hy, 0.1 * f, hy, R.hat, 0.025)
				break
			case 'farmer':
				El(g, 0, hy + 0.005, 0.12, 0.03, R.hat)
				El(g, 0, hy - 0.02, 0.06, 0.04, R.hat)
				break
			case 'woodcutter':
				g.beginPath(); g.arc(0, hy + 0.01, 0.072, Math.PI, 0); g.fill()
				Ln(g, -0.06 * f, hy - 0.01, -0.13 * f, hy + 0.06, R.hat, 0.03)
				break
			case 'mason':
				g.beginPath(); g.arc(0, hy + 0.005, 0.068, Math.PI, 0); g.fill()
				break
		}
		if (carry === 'wood') {
			g.fillStyle = '#8a5a2b'
			roundRect(g, -0.17, -0.33 - bob, 0.34, 0.075, 0.035)
			g.fill()
			El(g, 0.17 * f, -0.292 - bob, 0.03, 0.035, '#d8b27c')
		} else if (carry === 'stone') {
			Rc(g, -0.085, -0.53 - bob, 0.17, 0.12, '#b3b0a8', 'rgba(40,38,34,0.6)')
		} else if (carry === 'food') {
			El(g, -f * 0.09, -0.24 - bob, 0.08, 0.09, '#dcc48e', 'rgba(80,60,20,0.6)')
		}
	})
	villagerCache.set(key, sp)
	return sp
}

// ---------------------------------------------------------------------
// Sheep (anchor = feet)
// ---------------------------------------------------------------------
const sheepCache = new Map<string, Sprite>()
export function sheepSprite(frame: number, face: 1 | -1) {
	const key = frame + ':' + face
	let sp = sheepCache.get(key)
	if (sp) return sp
	sp = makeSprite(80, -0.3, -0.38, 0.3, 0.06, (g) => {
		const f = face
		El(g, 0, 0, 0.18, 0.05, 'rgba(0,0,0,0.22)')
		const l = frame ? 0.03 : -0.03
		for (const [lx, d] of [[-0.1, l], [0.1, -l]]) Ln(g, lx, -0.08, lx + d, 0, '#3a2e24', 0.035)
		g.lineWidth = 0.02
		for (const [x, y, r] of [[-0.08, -0.16, 0.1], [0.06, -0.17, 0.11], [-0.01, -0.22, 0.1]]) El(g, x, y, r, r * 0.85, '#f3efe6', 'rgba(60,50,40,0.4)')
		El(g, 0.17 * f, -0.2, 0.06, 0.05, '#3a2e24')
	})
	sheepCache.set(key, sp)
	return sp
}

// ---------------------------------------------------------------------
// Soft cloud shadow
// ---------------------------------------------------------------------
let cloudSprite: HTMLCanvasElement | null = null
export function getCloudSprite() {
	if (cloudSprite) return cloudSprite
	const [c, g] = canvas(256, 160)
	for (const [x, y, r] of [[128, 85, 70], [70, 95, 50], [185, 90, 55], [110, 60, 45]]) {
		const gr = g.createRadialGradient(x, y, 0, x, y, r)
		gr.addColorStop(0, 'rgba(10,20,30,0.2)')
		gr.addColorStop(1, 'rgba(10,20,30,0)')
		g.fillStyle = gr
		g.fillRect(0, 0, 256, 160)
	}
	cloudSprite = c
	return c
}
