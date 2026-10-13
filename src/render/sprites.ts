import { mulberry32 } from '../core/rng'
import { B, ROLE, type BType, type Res, type Role } from '../data/buildings'
import { TRIBES, type TribeId } from '../data/tribes'
import type { AgentKind, Team } from '../game/agents'
import { ART, artCtx } from './art'
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
export function buildingSprite(type: BType, v: number, tribe: TribeId) {
	const key = type + ':' + v + ':' + tribe
	let sp = buildingCache.get(key)
	if (sp) return sp
	let smoke: [number, number] | null = null
	artCtx.tribe = tribe
	const top = Math.min(-2.4, 1.95 - B[type].h - 0.45)
	const s = makeSprite(SR, -0.5, top, 2.5, 2.25, (g) => {
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
/** sprites per species (see Sp in state.ts): oak, pine, snow pine, palm, cactus, dead tree, mountain peak */
export let treeSprites: Sprite[][] = []
export let stumpSprite: Sprite

export function makeStaticSprites() {
	const R = 80
	const box = (draw: (g: Ctx) => void, x0 = -0.65, y0 = -1.42, x1 = 0.65, y1 = 0.18) => makeSprite(R, x0, y0, x1, y1, draw)
	const shadow = (g: Ctx, w = 0.34) => El(g, 0.1, 0.02, w, 0.1, 'rgba(0,0,0,0.22)')
	const trunk = (g: Ctx, col = '#6b4a2e') => Rc(g, -0.055, -0.36, 0.11, 0.38, col)
	const pine = (g: Ctx, col: string[], snow = false) => {
		g.lineWidth = 0.025
		for (let i = 0; i < 3; i++) {
			const yb = -0.2 - i * 0.32, wd = 0.42 - i * 0.1
			Pl(g, [-wd, yb, wd, yb, 0, yb - 0.55], col[0], 'rgba(20,40,20,0.5)')
			Pl(g, [-wd * 0.2, yb - 0.05, -wd * 0.85, yb - 0.02, -0.02, yb - 0.5], col[1])
			if (snow) Pl(g, [-wd * 0.55, yb - 0.25, wd * 0.55, yb - 0.25, 0, yb - 0.55], '#f4f8fb')
		}
	}
	const oak = (col: string[]) => box((g) => {
		shadow(g)
		trunk(g)
		g.lineWidth = 0.025
		const blobs = [[0, -0.66, 0.36], [-0.22, -0.52, 0.25], [0.22, -0.52, 0.25], [0.06, -0.86, 0.26]]
		for (const [x, y, r] of blobs) El(g, x, y, r, r * 0.95, col[0], 'rgba(20,40,20,0.45)')
		for (const [x, y, r] of blobs) El(g, x - r * 0.25, y - r * 0.25, r * 0.55, r * 0.5, col[1])
		El(g, 0.12, -0.5, 0.2, 0.12, col[2])
	})
	const palm = (lean: number) => box((g) => {
		shadow(g, 0.3)
		g.lineCap = 'round'
		g.strokeStyle = '#8a6a45'
		g.lineWidth = 0.08
		g.beginPath()
		g.moveTo(0, 0)
		g.quadraticCurveTo(lean * 0.3, -0.6, lean * 0.15, -1.15)
		g.stroke()
		for (let k = 0; k < 6; k++) {
			const a = -Math.PI / 2 + (k - 2.5) * 0.55
			g.strokeStyle = k % 2 ? '#3f8a3a' : '#4fa046'
			g.lineWidth = 0.07
			g.beginPath()
			g.moveTo(lean * 0.15, -1.15)
			g.quadraticCurveTo(lean * 0.15 + Math.cos(a) * 0.35, -1.25 + Math.sin(a) * 0.2, lean * 0.15 + Math.cos(a) * 0.55, -1.0 + Math.sin(a) * 0.1 + 0.15)
			g.stroke()
		}
		El(g, lean * 0.15, -1.12, 0.06, 0.06, '#7a5a2a')
	})
	const cactus = (arms: number) => box((g) => {
		shadow(g, 0.2)
		g.lineCap = 'round'
		const col = '#4f8a46'
		Ln(g, 0, 0, 0, -0.75, col, 0.16)
		if (arms > 0) {
			Ln(g, 0, -0.35, -0.2, -0.35, col, 0.1)
			Ln(g, -0.2, -0.35, -0.2, -0.6, col, 0.1)
		}
		if (arms > 1) {
			Ln(g, 0, -0.45, 0.2, -0.45, col, 0.1)
			Ln(g, 0.2, -0.45, 0.2, -0.65, col, 0.1)
		}
		Ln(g, -0.03, -0.1, -0.03, -0.7, 'rgba(255,255,255,0.25)', 0.03)
	})
	const dead = (v: number) => box((g) => {
		shadow(g, 0.25)
		g.lineCap = 'round'
		const c = '#5a4a3a'
		Ln(g, 0, 0, 0.02, -0.85, c, 0.08)
		Ln(g, 0.01, -0.45, -0.25, -0.75, c, 0.04)
		Ln(g, 0.02, -0.6, 0.25 + v * 0.05, -0.9, c, 0.04)
		Ln(g, -0.12, -0.6, -0.18, -0.9, c, 0.03)
	})
	const peak = (v: number) => makeSprite(R, -1.6, -2.6, 1.6, 0.35, (g) => {
		El(g, 0.2, 0.05, 1.5, 0.3, 'rgba(0,0,0,0.25)')
		g.lineWidth = 0.04
		const h = 2.2 + v * 0.3
		Pl(g, [-1.5, 0.1, 1.5, 0.1, 0.15, -h], '#8a8478', 'rgba(40,36,30,0.6)')
		Pl(g, [0.15, -h, 1.5, 0.1, 0.4, 0.1], 'rgba(0,0,0,0.18)')
		Pl(g, [0.15, -h, -0.35, -h + 0.75, -0.05, -h + 0.6, 0.15, -h + 0.85, 0.45, -h + 0.62, 0.62, -h + 0.75], '#f4f8fb')
	})
	treeSprites = [
		DECID.map((c) => oak(c)),
		PINES.map((c) => box((g) => { shadow(g); trunk(g); pine(g, c) })),
		PINES.slice(0, 2).map((c) => box((g) => { shadow(g); trunk(g, '#5a4030'); pine(g, c, true) })),
		[palm(1), palm(-1)],
		[cactus(1), cactus(2)],
		[dead(0), dead(1)],
		[peak(0), peak(1)],
	]
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

/**
 * frame: 0..3 walk cycle, 4 standing.
 * style: 0 medieval, 1 modern clothes, 2 space-age jumpsuit, 3 sci-fi suit.
 */
export function villagerSprite(role: Role, skin: string, carry: Res | null, frame: number, face: 1 | -1, sick: boolean, style: number, android: boolean, tribe: TribeId) {
	const key = `${role}|${skin}|${carry}|${frame}|${face}|${sick}|${style}|${android}|${tribe}`
	let sp = villagerCache.get(key)
	if (sp) return sp
	const R = ROLE[role]
	sp = makeSprite(80, -0.27, -0.7, 0.27, 0.07, (g) => {
		const f = face
		const walking = frame < 4
		const ph = Math.PI / 4 + (frame * Math.PI) / 2
		const bob = walking ? Math.abs(Math.sin(ph)) * 0.025 : 0
		const sw = walking ? Math.sin(ph) * 0.05 : 0
		const sk = android ? '#c9d1da' : sick ? SICK_SKIN : skin
		const body = android ? '#b9c2cc' : style === 3 ? '#eef2f6' : R.color
		const legs = android ? '#9aa3ad' : style === 3 ? '#dfe5ea' : style === 2 ? R.color : style === 1 ? '#3d5a8a' : '#4a3424'
		El(g, 0, 0, 0.13, 0.045, 'rgba(0,0,0,0.25)')
		g.lineCap = 'round'
		Ln(g, -0.035, -0.13, -0.035 + sw, -0.01, legs, 0.045)
		Ln(g, 0.035, -0.13, 0.035 - sw, -0.01, legs, 0.045)
		g.fillStyle = body
		roundRect(g, -0.08, -0.29 - bob, 0.16, 0.19, 0.045)
		g.fill()
		g.strokeStyle = 'rgba(40,25,10,0.5)'
		g.lineWidth = 0.02
		g.stroke()
		if (style === 3 && !android) Rc(g, -0.08, -0.23 - bob, 0.16, 0.035, R.color)
		// tribe scarf
		Rc(g, -0.075, -0.29 - bob, 0.15, 0.045, TRIBES[tribe].color)
		if (style === 2 && !android) Ln(g, -0.05, -0.28 - bob, 0.05, -0.28 - bob, '#ffffff', 0.02)
		El(g, 0, -0.35 - bob, 0.065, 0.065, sk)
		const hy = -0.375 - bob
		if (android) {
			Ln(g, -0.04, -0.355 - bob, 0.05 * f, -0.355 - bob, '#7ff6ff', 0.025)
			Ln(g, 0, -0.41 - bob, 0.02, -0.47 - bob, '#9aa3ad', 0.015)
			El(g, 0.02, -0.475 - bob, 0.015, 0.015, '#ff4fd8')
		} else if (style === 3) {
			Ln(g, -0.05, -0.355 - bob, 0.06 * f, -0.355 - bob, '#7ff6ff', 0.03)
		} else {
			El(g, f * 0.035, -0.355 - bob, 0.012, 0.012, '#2a1a10')
		}
		if (!android && style < 3) {
			g.fillStyle = R.hat
			if (style === 0) {
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
			} else if (role === 'builder') {
				g.fillStyle = '#f2c230'
				g.beginPath(); g.arc(0, hy, 0.072, Math.PI, 0); g.fill()
				Ln(g, -0.09, hy, 0.09, hy, '#f2c230', 0.025)
			} else {
				g.fillStyle = ['#3a2a1e', '#6b4a2e', '#c9a46b', '#1e1e1e'][(skin.charCodeAt(2) + role.length) % 4]
				g.beginPath(); g.arc(0, hy + 0.01, 0.068, Math.PI, 0); g.fill()
				if (style === 2) Ln(g, -0.07, hy + 0.02, -0.07, hy + 0.06, '#9aa3ad', 0.02)
			}
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
// Other characters: soldiers, siege engines, caravans, wolves, bandits, robots, the wedding couple, the time traveller's box
// ---------------------------------------------------------------------
const agentCache = new Map<string, Sprite>()
const CREW_SKINS = ['#f1c9a5', '#c68b62', '#e0ac85', '#8d5a3b']
export function agentSprite(kind: AgentKind, team: Team, frame: number, face: 1 | -1, style: number, variant: number, carry = false, level = 0) {
	const key = `${kind}|${team}|${frame}|${face}|${style}|${variant % 4}|${carry}|${level}`
	let sp = agentCache.get(key)
	if (sp) return sp
	const big = kind === 'traveler' || kind === 'siege' || kind === 'caravan'
	sp = makeSprite(80, big ? -0.9 : -0.45, big ? -1.6 : -0.75, big ? 0.9 : 0.45, 0.12, (g) => {
		const f = face
		const walking = frame < 4
		const ph = Math.PI / 4 + (frame * Math.PI) / 2
		const bob = walking ? Math.abs(Math.sin(ph)) * 0.025 : 0
		const sw = walking ? Math.sin(ph) * 0.05 : 0
		const tc = team !== 'none' ? TRIBES[team].color : '#888'
		g.lineCap = 'round'
		g.lineWidth = 0.025
		const O = 'rgba(30,20,10,0.6)'
		if (kind === 'wolf') {
			El(g, 0, 0, 0.22, 0.05, 'rgba(0,0,0,0.25)')
			for (const [lx, d] of [[-0.12, sw], [0.12, -sw]]) Ln(g, lx, -0.12, lx + d, 0, '#4a4a4e', 0.04)
			El(g, 0, -0.17 - bob, 0.2, 0.08, '#7a7a80')
			Ln(g, -0.18 * f, -0.18 - bob, -0.3 * f, -0.25 - bob, '#7a7a80', 0.05)
			El(g, 0.2 * f, -0.23 - bob, 0.08, 0.06, '#8a8a90')
			Pl(g, [0.18 * f, -0.28 - bob, 0.22 * f, -0.35 - bob, 0.25 * f, -0.27 - bob], '#6a6a70')
			El(g, 0.26 * f, -0.235 - bob, 0.012, 0.012, '#ffd24a')
			return
		}
		if (kind === 'traveler') {
			El(g, 0, 0, 0.35, 0.08, 'rgba(0,0,0,0.25)')
			Rc(g, -0.3, -1.2, 0.6, 1.2, '#1f4a8a', 'rgba(10,20,40,0.7)')
			for (let r = 0; r < 4; r++) for (const x of [-0.24, 0.04]) Rc(g, x, -1.08 + r * 0.26, 0.2, 0.18, r === 0 ? '#e8f0ff' : '#2a5aa0', 'rgba(10,20,40,0.5)')
			Rc(g, -0.34, -1.3, 0.68, 0.12, '#1f4a8a', 'rgba(10,20,40,0.7)')
			El(g, 0, -1.36, 0.05, 0.06, '#e8f0ff')
			return
		}
		if (kind === 'siege') {
			El(g, 0, 0.02, 0.6, 0.12, 'rgba(0,0,0,0.25)')
			if (level === 0) {
				// catapult
				Rc(g, -0.45, -0.25, 0.9, 0.12, '#8a5a2b', O)
				for (const x of [-0.32, 0.32]) El(g, x, -0.08, 0.1, 0.1, '#5a3b22', O)
				Ln(g, -0.2 * f, -0.25, 0.35 * f, -0.75, '#6b4a2e', 0.06)
				El(g, 0.38 * f, -0.78, 0.1, 0.07, '#5a4a3a', O)
				Ln(g, 0, -0.25, 0, -0.5, '#6b4a2e', 0.05)
			} else if (level === 1) {
				// cannon
				for (const x of [-0.2, 0.2]) El(g, x, -0.12, 0.15, 0.15, '#5a3b22', O)
				g.lineWidth = 0.14
				Ln(g, -0.3 * f, -0.2, 0.45 * f, -0.38, '#2a2a2e', 0.16)
				El(g, 0.47 * f, -0.39, 0.06, 0.08, '#111')
			} else if (level === 2) {
				// tank
				Rc(g, -0.55, -0.3, 1.1, 0.28, '#4a5a3a', O)
				for (let k = 0; k < 5; k++) El(g, -0.44 + k * 0.22, -0.08, 0.08, 0.08, '#2a2a2e')
				Rc(g, -0.28, -0.52, 0.56, 0.24, '#5a6a4a', O)
				Ln(g, 0.2 * f, -0.42, 0.75 * f, -0.46, '#3a4a2a', 0.07)
				Rc(g, -0.06, -0.4, 0.12, 0.08, tc)
			} else if (level === 3) {
				// drone swarm carrier
				for (const [dx, dy] of [[-0.35, -0.9], [0.3, -1.1], [0, -0.7], [0.45, -0.6]]) {
					Rc(g, dx - 0.12, dy - 0.04, 0.24, 0.08, '#3a3f4a', O)
					for (const s of [-1, 1]) Ln(g, dx + s * 0.16, dy - 0.07, dx + s * 0.24, dy - 0.07, '#9aa3ad', 0.02)
					El(g, dx, dy + 0.02, 0.03, 0.03, tc)
				}
			} else {
				// battle mech
				for (const s of [-1, 1]) Ln(g, s * 0.18, -0.55, s * 0.25 + sw * s, 0, '#7a838d', 0.1)
				Rc(g, -0.32, -1.15, 0.64, 0.6, '#9aa3ad', O)
				Rc(g, -0.2, -1.05, 0.4, 0.14, tc)
				Rc(g, 0.25 * f, -1.0, 0.45 * f, 0.12, '#5a6170', O)
				El(g, 0.72 * f, -0.94, 0.06, 0.06, '#7ff6ff')
			}
			return
		}
		if (kind === 'caravan') {
			El(g, 0, 0.02, 0.7, 0.13, 'rgba(0,0,0,0.25)')
			if (style <= 1) {
				// ox cart with a cover in the tribe colour
				Rc(g, 0.35 * f - 0.18, -0.42, 0.36, 0.22, '#7a4f2a', O)
				Rc(g, 0.55 * f - 0.08, -0.55, 0.16, 0.18, '#7a4f2a', O)
				Rc(g, -0.5, -0.4, 0.7, 0.26, '#8a5a2b', O)
				Pl(g, [-0.5, -0.4, 0.2, -0.4, 0.15, -0.72, -0.45, -0.72], tc, O)
				El(g, -0.3, -0.1, 0.1, 0.1, '#5a3b22', O)
				El(g, 0.05, -0.1, 0.1, 0.1, '#5a3b22', O)
			} else if (style === 2) {
				// truck
				Rc(g, -0.55, -0.6, 0.75, 0.45, tc, O)
				Rc(g, 0.2 * f - (f < 0 ? 0.32 : 0), -0.48, 0.32, 0.33, '#e8e2d6', O)
				Rc(g, 0.26 * f - (f < 0 ? 0.2 : 0), -0.44, 0.2, 0.12, '#bfe3f2')
				for (const x of [-0.4, 0.0, 0.35]) El(g, x, -0.1, 0.08, 0.08, '#1e1e1e')
			} else {
				// hover freighter
				Rc(g, -0.6, -0.75, 1.2, 0.4, '#e8eef4', O)
				Rc(g, -0.6, -0.6, 1.2, 0.08, tc)
				El(g, 0, -0.28, 0.5, 0.06, 'rgba(127,246,255,0.6)')
			}
			return
		}
		El(g, 0, 0, 0.13, 0.045, 'rgba(0,0,0,0.25)')
		let body = '#202024', legs = '#2a2a30'
		const head = CREW_SKINS[variant % 4]
		if (kind === 'bandit') { body = '#3a3440'; legs = '#2a2630' }
		if (kind === 'robot') { body = '#9aa3ad'; legs = '#7a838d' }
		if (kind === 'groom') { body = '#1e1e24'; legs = '#1e1e24' }
		if (kind === 'bride') {
			Pl(g, [-0.15, 0, 0.15, 0, 0.06, -0.28, -0.06, -0.28], '#fbf8f2', 'rgba(120,110,100,0.5)')
			El(g, 0, -0.34, 0.06, 0.06, head)
			Pl(g, [-0.07, -0.38, 0.07, -0.38, 0.12, -0.15, -0.12, -0.15], 'rgba(255,255,255,0.75)')
			El(g, 0.08 * f, -0.2, 0.04, 0.04, '#ff6fa8')
			return
		}
		Ln(g, -0.035, -0.13, -0.035 + sw, -0.01, legs, 0.045)
		Ln(g, 0.035, -0.13, 0.035 - sw, -0.01, legs, 0.045)
		if (kind === 'robot') {
			Rc(g, -0.09, -0.3 - bob, 0.18, 0.2, body, 'rgba(30,30,40,0.6)')
			Rc(g, -0.07, -0.44 - bob, 0.14, 0.12, '#b9c2cc', 'rgba(30,30,40,0.6)')
			Ln(g, -0.04, -0.39 - bob, 0.05 * f, -0.39 - bob, '#ff3b3b', 0.025)
			return
		}
		g.fillStyle = body
		roundRect(g, -0.08, -0.29 - bob, 0.16, 0.19, 0.045)
		g.fill()
		if (kind === 'soldier' || kind === 'decoy') {
			// tabard in the tribe colour, era-dependent trim
			Rc(g, -0.06, -0.27 - bob, 0.12, 0.16, tc)
			if (style >= 3) Rc(g, -0.08, -0.2 - bob, 0.16, 0.025, '#7ff6ff')
		}
		El(g, 0, -0.35 - bob, 0.065, 0.065, head)
		const hy = -0.375 - bob
		if (kind === 'bandit') {
			g.fillStyle = '#2a2630'
			g.beginPath(); g.arc(0, hy + 0.02, 0.08, Math.PI, 0); g.fill()
			Ln(g, -0.05, -0.34 - bob, 0.06 * f, -0.34 - bob, '#1a1a1a', 0.035)
			if (carry) El(g, -f * 0.1, -0.3 - bob, 0.1, 0.11, '#b9a27a', 'rgba(60,40,20,0.6)')
			return
		}
		El(g, f * 0.035, -0.355 - bob, 0.012, 0.012, '#2a1a10')
		if (kind === 'groom') {
			Rc(g, -0.05, hy - 0.09, 0.1, 0.08, '#1e1e24')
			Ln(g, -0.08, hy - 0.01, 0.08, hy - 0.01, '#1e1e24', 0.02)
		} else if (team === 'noises') {
			g.strokeStyle = '#8f7cff'
			g.lineWidth = 0.025
			g.beginPath(); g.arc(0, hy + 0.02, 0.075, Math.PI, 0); g.stroke()
			El(g, -0.07, hy + 0.035, 0.025, 0.035, '#2a2440')
			El(g, 0.07, hy + 0.035, 0.025, 0.035, '#2a2440')
		} else if (team === 'lampys') {
			g.fillStyle = '#e0a030'
			g.beginPath(); g.arc(0, hy, 0.072, Math.PI, 0); g.fill()
			El(g, 0.05 * f, hy - 0.02, 0.02, 0.02, '#fff3c8')
		} else if (team === 'pixels') {
			// visor and a shoulder camera
			Ln(g, -0.05, hy + 0.03, 0.06 * f, hy + 0.03, '#3ad1ff', 0.03)
			Rc(g, -f * 0.05 - 0.06, -0.33 - bob, 0.12, 0.07, '#2a2a2e')
			El(g, -f * 0.05 + f * 0.07, -0.3 - bob, 0.02, 0.02, '#ff3d9a')
		}
	})
	agentCache.set(key, sp)
	return sp
}

// ---------------------------------------------------------------------
// Vehicles and street lamps
// ---------------------------------------------------------------------
const carCache = new Map<string, Sprite>()
/** axis h: driving left/right, v: up/down. Anchor = car centre on the ground. */
export function carSprite(col: string, axis: 'h' | 'v', hover: boolean) {
	const key = col + axis + hover
	let sp = carCache.get(key)
	if (sp) return sp
	sp = makeSprite(80, -0.36, -0.42, 0.36, 0.16, (g) => {
		g.lineWidth = 0.02
		const lift = hover ? 0.16 : 0
		El(g, 0, 0.02, axis === 'h' ? 0.3 : 0.17, 0.08, hover ? 'rgba(127,246,255,0.35)' : 'rgba(0,0,0,0.25)')
		if (axis === 'h') {
			if (!hover) for (const x of [-0.17, 0.17]) El(g, x, -0.03, 0.055, 0.055, '#1e1e1e')
			roundRect(g, -0.3, -0.2 - lift, 0.6, 0.15, 0.05)
			g.fillStyle = col
			g.fill()
			g.strokeStyle = 'rgba(0,0,0,0.5)'
			g.stroke()
			roundRect(g, -0.16, -0.3 - lift, 0.3, 0.12, 0.04)
			g.fillStyle = col
			g.fill()
			g.stroke()
			Rc(g, -0.12, -0.28 - lift, 0.24, 0.07, '#bfe3f2')
			if (hover) Ln(g, -0.28, -0.05 - lift, 0.28, -0.05 - lift, '#7ff6ff', 0.025)
		} else {
			roundRect(g, -0.14, -0.38 - lift, 0.28, 0.42, 0.07)
			g.fillStyle = col
			g.fill()
			g.strokeStyle = 'rgba(0,0,0,0.5)'
			g.stroke()
			Rc(g, -0.1, -0.3 - lift, 0.2, 0.09, '#bfe3f2')
			Rc(g, -0.1, -0.08 - lift, 0.2, 0.06, '#9fc3d2')
			if (hover) Ln(g, -0.12, 0.0 - lift, 0.12, 0.0 - lift, '#7ff6ff', 0.025)
		}
	})
	carCache.set(key, sp)
	return sp
}

const lampCache: Sprite[] = []
/** style 1 gas lamp, 2 electric, 3 neon. Anchor = foot of the post. */
export function lampSprite(style: number) {
	if (lampCache[style]) return lampCache[style]
	const sp = makeSprite(80, -0.25, -1.05, 0.25, 0.06, (g) => {
		g.lineWidth = 0.02
		El(g, 0.03, 0, 0.07, 0.025, 'rgba(0,0,0,0.25)')
		if (style === 1) {
			Ln(g, 0, 0, 0, -0.75, '#2a2a2e', 0.035)
			Rc(g, -0.06, -0.92, 0.12, 0.16, '#ffe9a8', 'rgba(30,30,30,0.8)')
			Pl(g, [-0.08, -0.92, 0.08, -0.92, 0, -0.99], '#2a2a2e')
		} else if (style === 2) {
			Ln(g, 0, 0, 0, -0.9, '#6f757b', 0.03)
			Ln(g, 0, -0.9, 0.14, -0.94, '#6f757b', 0.03)
			El(g, 0.16, -0.92, 0.06, 0.025, '#fff7dc')
		} else {
			Ln(g, 0, 0, 0, -0.85, '#e8eef4', 0.025)
			El(g, 0, -0.9, 0.06, 0.06, '#7ff6ff')
		}
	})
	lampCache[style] = sp
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
