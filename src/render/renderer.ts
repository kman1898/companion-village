import { settings } from '../core/settings'
import { clamp } from '../core/util'
import { B } from '../data/buildings'
import { TRIBES, type TribeId } from '../data/tribes'
import { agents, type Agent } from '../game/agents'
import { nightAmount } from '../game/daynight'
import { fx } from '../game/events'
import { eraOf } from '../game/history'
import { G, H, RAIL_Y, W, has, type Building, type Bush, type Rock, type Sheep, type Tree, type Tribe, type Villager } from '../game/state'
import { cars, train, type Car } from '../game/traffic'
import { cam, setViewport } from '../view/camera'
import { hover } from '../view/input'
import { ART, artCtx, logPile, sackPile, stonePile } from './art'
import { rocketShape, TURBINES } from './art-future'
import { El, Ln, Pl, Rc, roundRect, type Ctx } from './draw'
import { drawGlowFX, drawScreenFX, drawWorldFX, tribeStyle } from './effects'
import { darkness, lamps, lampStyle, renderLighting } from './lighting'
import { emit, floats, parts, setParticleBudget } from './particles'
import {
	agentSprite, bushSprite, buildingSprite, carSprite, drawSprite, getCloudSprite, lampSprite, makeStaticSprites, patchSprite, rockSprite, sheepSprite,
	stumpSprite, treeSprites, villagerSprite,
} from './sprites'
import { terrain, TP } from './terrain'

let cv: HTMLCanvasElement
let ctx: Ctx
let cw = 0, ch = 0
/** render scale: canvas pixels per CSS pixel */
let rs = 1

export const perf = { rs: 1, fps: 0, frameMs: 0, renderMs: 0, drawn: 0 }

export function initRenderer(canvasEl: HTMLCanvasElement) {
	cv = canvasEl
	ctx = cv.getContext('2d', { alpha: false })!
	makeStaticSprites()
	rs = targetMaxScale()
	resize()
	window.addEventListener('resize', resize)
}

function targetMaxScale() {
	const dpr = window.devicePixelRatio || 1
	if (settings.quality === 'low') return Math.min(dpr, 1)
	return Math.min(dpr, 2)
}

export function resize() {
	cw = window.innerWidth
	ch = window.innerHeight
	cv.width = Math.round(cw * rs)
	cv.height = Math.round(ch * rs)
	setViewport(cw, ch)
	perf.rs = rs
	setParticleBudget(settings.quality === 'low' ? 400 : 1400)
}

export function applyQuality() {
	rs = targetMaxScale()
	resize()
}

// ---- adaptive resolution ----
let accT = 0, accN = 0, lastChange = 0, lastDrop = -1e9
function adapt(rdt: number) {
	accT += rdt
	accN++
	if (accT < 1) return
	const avg = accT / accN
	perf.fps = accN / accT
	perf.frameMs = avg * 1000
	accT = accN = 0
	if (settings.quality !== 'auto') return
	const now = performance.now()
	if (avg > 0.021 && rs > 0.75 && now - lastChange > 2000) {
		rs = Math.max(0.75, rs - 0.25)
		lastChange = lastDrop = now
		resize()
	} else if (avg < 0.0175 && rs < targetMaxScale() && now - lastDrop > 45000 && now - lastChange > 10000) {
		rs = Math.min(targetMaxScale(), rs + 0.25)
		lastChange = now
		resize()
	}
}

// ---- roads: cached vector paths per style (0 dirt · 1 cobble · 2 asphalt · 3 light-lanes) ----
const roadStyle = (T: Tribe) => (has(T, 'hovercars') ? 3 : has(T, 'asphalt') ? 2 : has(T, 'pavedRoads') ? 1 : 0)
const ROAD_LAYERS: [string, number][][] = [
	[['#a08460', 0.62], ['#bc9d70', 0.4]],
	[['#8d8476', 0.66], ['#b3aa98', 0.48]],
	[['#33363a', 0.74], ['#45484d', 0.6]],
	[['#1e222b', 0.74], ['#2a2f3a', 0.6]],
]
let roadKey = ''
let roadPaths: { style: number; path: Path2D; marks: Path2D }[] = []
let bridgePath = new Path2D()
function buildRoads() {
	const styles = G.S.tribes.map(roadStyle)
	const key = G.roadsVersion + ':' + styles.join('')
	if (key === roadKey) return
	roadKey = key
	const byStyle = new Map<number, { path: Path2D; marks: Path2D }>()
	const styleOf = new Map<TribeId, number>(G.S.tribes.map((T, i) => [T.id, styles[i]]))
	bridgePath = new Path2D()
	for (const i of G.roads) {
		const st = styleOf.get(G.roadOwner.get(i)!) ?? 0
		let p = byStyle.get(st)
		if (!p) byStyle.set(st, (p = { path: new Path2D(), marks: new Path2D() }))
		const x = i % W, y = (i / W) | 0, X = x + 0.5, Y = y + 0.5
		p.path.moveTo(X, Y)
		p.path.lineTo(X + 0.01, Y)
		if (G.roads.has(i + 1) && x < W - 1) {
			p.path.moveTo(X, Y)
			p.path.lineTo(X + 1, Y)
		}
		if (G.roads.has(i + W)) {
			p.path.moveTo(X, Y)
			p.path.lineTo(X, Y + 1)
		}
		if (st >= 2) {
			const hz = G.roads.has(i + 1) && G.roads.has(i - 1), vt = G.roads.has(i + W) && G.roads.has(i - W)
			if (hz && !vt) {
				p.marks.moveTo(X - 0.25, Y)
				p.marks.lineTo(X + 0.25, Y)
			} else if (vt && !hz) {
				p.marks.moveTo(X, Y - 0.25)
				p.marks.lineTo(X, Y + 0.25)
			}
		}
		if (G.world.water[i]) bridgePath.rect(x - 0.05, y + 0.1, 1.1, 0.8)
	}
	roadPaths = [...byStyle.entries()].map(([style, p]) => ({ style, ...p }))
}

function drawRoads() {
	buildRoads()
	ctx.lineCap = 'round'
	ctx.lineJoin = 'round'
	ctx.fillStyle = '#7a5434'
	ctx.fill(bridgePath)
	for (const { style, path, marks } of roadPaths) {
		for (const [col, wd] of ROAD_LAYERS[style]) {
			ctx.strokeStyle = col
			ctx.lineWidth = wd
			ctx.stroke(path)
		}
		if (style >= 2) {
			ctx.lineCap = 'butt'
			ctx.strokeStyle = style === 3 ? 'rgba(127,246,255,0.6)' : 'rgba(240,240,230,0.6)'
			ctx.lineWidth = 0.08
			ctx.stroke(marks)
			ctx.lineCap = 'round'
		}
	}
	// bridge planks
	ctx.strokeStyle = 'rgba(60,40,20,0.6)'
	ctx.lineWidth = 0.04
	ctx.stroke(bridgePath)
	// town squares
	for (const T of G.S.tribes) {
		const st = roadStyle(T)
		ctx.fillStyle = st >= 2 ? '#8a8d92' : '#a99a80'
		roundRect(ctx, T.cx - 2.2, T.cy - 2.2, 4.4, 4.4, 0.7)
		ctx.fill()
		for (let y = 0; y < 8; y++)
			for (let x = 0; x < 8; x++) {
				ctx.fillStyle = (x + y) % 2 ? (st >= 2 ? '#9a9da2' : '#bcae93') : st >= 2 ? '#93969b' : '#b3a487'
				ctx.fillRect(T.cx - 2 + x * 0.5 + 0.04, T.cy - 2 + y * 0.5 + 0.04, 0.42, 0.42)
			}
		ctx.strokeStyle = TRIBES[T.id].color
		ctx.lineWidth = 0.08
		roundRect(ctx, T.cx - 2.2, T.cy - 2.2, 4.4, 4.4, 0.7)
		ctx.stroke()
	}
}

function drawRail(vx0: number, vx1: number) {
	const maglev = G.S.tribes.some((t) => has(t, 'hovercars'))
	ctx.fillStyle = 'rgba(120,100,80,0.7)'
	ctx.fillRect(vx0, RAIL_Y - 0.45, vx1 - vx0, 0.9)
	ctx.fillStyle = maglev ? '#3a4250' : '#5a3b22'
	for (let x = Math.floor(vx0 * 2) / 2; x < vx1; x += 0.5) ctx.fillRect(x, RAIL_Y - 0.36, 0.18, 0.72)
	ctx.fillStyle = maglev ? '#7ff6ff' : '#9aa0a6'
	ctx.fillRect(vx0, RAIL_Y - 0.25, vx1 - vx0, 0.06)
	ctx.fillRect(vx0, RAIL_Y + 0.19, vx1 - vx0, 0.06)
}

// ---- zoomed far out: all trees baked into one image, refreshed every few seconds ----
const LOD_SCALE = 13
const LOD_TP = 6
let treeLayer: HTMLCanvasElement | null = null
let treeLayerAge = Infinity
function updateTreeLayer(rdt: number) {
	treeLayerAge += rdt
	if (treeLayer && treeLayerAge < 3) return
	treeLayerAge = 0
	const w = G.world
	if (!treeLayer) {
		treeLayer = document.createElement('canvas')
		treeLayer.width = W * LOD_TP
		treeLayer.height = H * LOD_TP
	}
	const g = treeLayer.getContext('2d')!
	g.setTransform(1, 0, 0, 1, 0, 0)
	// ground and trees in one small image: one cheap draw per frame when zoomed out
	g.imageSmoothingEnabled = true
	if (terrain) g.drawImage(terrain, 0, 0, treeLayer.width, treeLayer.height)
	g.setTransform(LOD_TP, 0, 0, LOD_TP, 0, 0)
	for (const i of w.treeOrder) {
		const t = w.trees[i]
		if (t.gone || t.cut) continue
		const set = treeSprites[t.sp]
		drawSprite(g, set[Math.floor(t.v * set.length)], t.x, t.y, t.sc * (t.g < 1 ? 0.25 + 0.75 * t.g : 1))
	}
}
export function invalidateTreeLayer() {
	treeLayerAge = Infinity
}

// ---- depth sorting ----
type Drawable = { k: number }
interface LampDraw { k: 13; x: number; y: number; style: number }
interface PlazaDraw { k: 5 | 6; T: Tribe; y: number }
const trainObj = { k: 12, y: RAIL_Y }
function sortKey(o: Drawable): number {
	if (o.k === 3) return (o as Building).oy + 1.95
	return (o as unknown as { y: number }).y
}

function lowerBound(order: number[], trees: Tree[], y: number) {
	let lo = 0, hi = order.length
	while (lo < hi) {
		const mid = (lo + hi) >> 1
		if (trees[order[mid]].y < y) lo = mid + 1
		else hi = mid
	}
	return lo
}

/** villager clothes: 0 medieval, 1 modern, 2 jumpsuit, 3 sci-fi */
const vstyleOf = new Map<TribeId, number>()
const tstyleOf = new Map<TribeId, number>()
let smokeTimer = 0

export function render(rdt: number) {
	const t0 = performance.now()
	adapt(rdt)
	const S = G.S, w = G.world, time = S.time, s = cam.s
	const low = settings.quality === 'low'
	for (const T of S.tribes) {
		const era = eraOf(T)
		vstyleOf.set(T.id, era >= 4 ? 3 : era === 3 ? 2 : era === 2 ? 1 : 0)
		tstyleOf.set(T.id, tribeStyle(T))
	}

	let shx = 0, shy = 0
	if (fx.shake > 0.01) {
		shx = (Math.random() - 0.5) * fx.shake * 14
		shy = (Math.random() - 0.5) * fx.shake * 14
	}
	const worldTransform = () => ctx.setTransform(rs * s, 0, 0, rs * s, rs * (cw / 2 - cam.x * s + shx), rs * (ch / 2 - cam.y * s + shy))
	worldTransform()
	const vx0 = cam.x - cw / 2 / s, vx1 = cam.x + cw / 2 / s, vy0 = cam.y - ch / 2 / s, vy1 = cam.y + ch / 2 / s

	if (vx0 < 0.5 || vy0 < 0.5 || vx1 > W - 0.5 || vy1 > H - 0.5) {
		ctx.fillStyle = '#24391b'
		ctx.fillRect(vx0 - 1, vy0 - 1, vx1 - vx0 + 2, vy1 - vy0 + 2)
	}
	const sx0 = clamp(Math.floor(vx0) - 1, 0, W), sy0 = clamp(Math.floor(vy0) - 1, 0, H)
	const sx1 = clamp(Math.ceil(vx1) + 1, 0, W), sy1 = clamp(Math.ceil(vy1) + 1, 0, H)
	ctx.imageSmoothingEnabled = true
	const lod = s < LOD_SCALE
	if (lod) {
		updateTreeLayer(rdt)
		if (sx1 > sx0 && sy1 > sy0) ctx.drawImage(treeLayer!, sx0 * LOD_TP, sy0 * LOD_TP, (sx1 - sx0) * LOD_TP, (sy1 - sy0) * LOD_TP, sx0, sy0, sx1 - sx0, sy1 - sy0)
	} else {
		treeLayerAge = Infinity
		if (terrain && sx1 > sx0 && sy1 > sy0) ctx.drawImage(terrain, sx0 * TP, sy0 * TP, (sx1 - sx0) * TP, (sy1 - sy0) * TP, sx0, sy0, sx1 - sx0, sy1 - sy0)
	}

	ctx.lineCap = 'round'
	for (const sp of w.sparkles) {
		const a = Math.sin(time * 1.3 + sp.p)
		if (a <= 0.3 || sp.x < vx0 || sp.x > vx1 || sp.y < vy0 || sp.y > vy1) continue
		Ln(ctx, sp.x - 0.15, sp.y, sp.x + 0.15, sp.y, `rgba(255,255,255,${((a - 0.3) * 0.5).toFixed(2)})`, 0.04)
	}
	if (train.active && RAIL_Y > vy0 - 1) drawRail(Math.max(0, vx0), Math.min(W, vx1))
	drawRoads()

	for (const c of S.craters) {
		ctx.globalAlpha = clamp((c.until - S.time) / 200, 0.25, 1)
		El(ctx, c.x, c.y, c.r * 1.25, c.r * 0.8, '#6e5a3e')
		El(ctx, c.x, c.y + 0.05, c.r, c.r * 0.62, '#4a3a28')
		El(ctx, c.x + 0.1, c.y + 0.12, c.r * 0.6, c.r * 0.36, '#2f251a')
		ctx.globalAlpha = 1
	}

	for (const T of S.tribes)
		for (const b of T.buildings) {
			if (!b.field) continue
			const f = b.field
			if (f.ox > vx1 || f.ox + 2 < vx0 || f.oy > vy1 || f.oy + 2 < vy0) continue
			for (const p of f.patches) {
				const stage = !b.done || p.s === 0 ? 0 : p.s === 2 ? 6 : 1 + Math.min(4, Math.floor((p.t / 35) * 5))
				drawSprite(ctx, patchSprite(stage), p.x, p.y)
			}
		}

	// ---- dynamic objects, merged with the pre-sorted trees ----
	const dyn: Drawable[] = []
	const inView = (x: number, y: number, up = 2.5) => x > vx0 - 1.5 && x < vx1 + 1.5 && y > vy0 - 0.3 && y < vy1 + up
	for (const r of w.rocks) if (!r.gone && inView(r.x, r.y)) dyn.push(r)
	for (const b of w.bushes) if (!b.gone && inView(b.x, b.y)) dyn.push(b)
	for (const T of S.tribes) {
		if (!inView(T.cx, T.cy, 60) && (T.cx < vx0 - 60 || T.cx > vx1 + 60)) continue
		for (const b of T.buildings) if (b.ox + 2.6 > vx0 && b.ox - 0.6 < vx1 && b.oy + 2.4 > vy0 && b.oy - 6.5 < vy1) dyn.push(b)
		for (const v of T.villagers) if (!v.inside && !v.abducted && !v.away && inView(v.x, v.y)) dyn.push(v)
		for (const sh of T.sheep) if (!sh.gone && inView(sh.x, sh.y)) dyn.push(sh)
		if (inView(T.cx, T.cy)) dyn.push({ k: 5, T, y: T.cy + 0.1 } as PlazaDraw, { k: 6, T, y: T.cy + 1.0 } as PlazaDraw)
		const ls = lampStyle(T)
		if (ls) for (const l of lamps(T)) if (inView(l.x, l.y)) dyn.push({ k: 13, x: l.x, y: l.y, style: ls } as LampDraw)
	}
	for (const a of agents) if (inView(a.x, a.y)) dyn.push(a)
	for (const c of cars) if (inView(c.x, c.y)) dyn.push(c)
	if (train.active && RAIL_Y > vy0 - 2 && RAIL_Y < vy1 + 2) dyn.push(trainObj)
	for (const e of S.events) if (e.type === 'merchant' && inView(e.d.x, e.d.y)) dyn.push({ k: 8, y: e.d.y, e } as unknown as Drawable)
	dyn.sort((a, b) => sortKey(a) - sortKey(b))

	if (fx.snow > 0.02) {
		ctx.fillStyle = `rgba(240,245,255,${(fx.snow * 0.45).toFixed(3)})`
		ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0)
	}

	const detail = s >= 11
	let j = 0, drawn = dyn.length
	const order = w.treeOrder, trees = w.trees
	const yEnd = vy1 + 2.8
	for (let i = lod ? order.length : lowerBound(order, trees, vy0 - 0.3); i < order.length; i++) {
		const t = trees[order[i]]
		if (t.y > yEnd) break
		if (t.gone || t.x < vx0 - 2 || t.x > vx1 + 2) continue
		while (j < dyn.length && sortKey(dyn[j]) <= t.y) drawObj(dyn[j++], time, detail)
		drawTree(t)
		drawn++
	}
	while (j < dyn.length) drawObj(dyn[j++], time, detail)
	perf.drawn = drawn

	smokeTimer -= rdt
	if (smokeTimer <= 0) {
		smokeTimer = 0.35
		for (const T of S.tribes)
			for (const b of T.buildings) {
				if (!b.done || Math.random() > (b.type === 'factory' ? 0.9 : 0.22)) continue
				if (b.ox < vx0 - 4 || b.ox > vx1 + 4 || b.oy < vy0 - 4 || b.oy > vy1 + 4) continue
				const sp = buildingSprite(b.type, b.v, b.tribe)
				if (sp.smoke) emit(b.ox + jitter(b) + sp.smoke[0], b.oy + sp.smoke[1], 'smoke', 1)
			}
	}

	drawParticles(time)
	drawWorldFX(ctx, time)

	if (!low && nightAmount() < 0.6) {
		const cloud = getCloudSprite()
		ctx.globalAlpha = 1 - nightAmount()
		for (const c of w.clouds) {
			c.x += c.sp * rdt
			if (c.x - c.r * 2 > W) c.x = -c.r * 2
			if (c.x + c.r * 2 < vx0 || c.x - c.r * 2 > vx1) continue
			ctx.drawImage(cloud, c.x - c.r * 1.6, c.y - c.r, c.r * 3.2, c.r * 2)
		}
		ctx.globalAlpha = 1
	}

	renderLighting(ctx, rs, cw, ch, time)
	worldTransform()
	drawGlowFX(ctx, time)
	if (darkness() > 0.2) drawNightWindows(time, vx0, vx1, vy0, vy1)

	ctx.setTransform(rs, 0, 0, rs, 0, 0)
	drawScreenFX(ctx, cw, ch, rdt, time)
	ctx.textAlign = 'center'
	ctx.font = `700 ${Math.round(clamp(s * 0.55, 14, 26))}px Georgia, serif`
	for (const f of floats) {
		const X = (f.x - cam.x) * s + cw / 2, Y = (f.y - cam.y) * s + ch / 2
		ctx.globalAlpha = Math.min(1, f.life)
		ctx.lineWidth = 4
		ctx.strokeStyle = 'rgba(40,25,10,0.8)'
		ctx.strokeText(f.text, X, Y)
		ctx.fillStyle = '#ffe58a'
		ctx.fillText(f.text, X, Y)
		ctx.globalAlpha = 1
	}
	if (s < 9) drawTribeLabels()
	perf.renderMs = performance.now() - t0
}

/** When zoomed far out, name the three villages */
function drawTribeLabels() {
	ctx.textAlign = 'center'
	ctx.font = '700 15px Georgia, serif'
	for (const T of G.S.tribes) {
		const X = (T.cx - cam.x) * cam.s + cw / 2, Y = (T.cy - cam.y) * cam.s + ch / 2 - 30
		const label = `${TRIBES[T.id].icon} ${TRIBES[T.id].name}${T.id === G.S.player ? ' (you)' : ''}`
		ctx.lineWidth = 4
		ctx.strokeStyle = 'rgba(20,12,4,0.85)'
		ctx.strokeText(label, X, Y)
		ctx.fillStyle = TRIBES[T.id].color
		ctx.fillText(label, X, Y)
	}
}

function drawObj(o: Drawable, time: number, detail: boolean) {
	switch (o.k) {
		case 1: {
			const r = o as Rock
			drawSprite(ctx, rockSprite(r.seed, r.amt <= 0 ? 0 : Math.ceil((4 * r.amt) / r.max)), r.x, r.y)
			break
		}
		case 2: drawSprite(ctx, bushSprite(Math.floor((o as Bush).v * 3), !!(o as Bush).ber), (o as Bush).x, (o as Bush).y); break
		case 3: drawBuilding(o as Building, time); break
		case 4: drawVillager(o as Villager, time, detail); break
		case 5: drawFire((o as PlazaDraw).T, time); break
		case 6: drawPile((o as PlazaDraw).T); break
		case 7: drawSprite(ctx, sheepSprite(Math.sin((o as Sheep).ph) > 0 ? 1 : 0, (o as Sheep).face), (o as Sheep).x, (o as Sheep).y); break
		case 8: drawCart((o as unknown as { e: { d: { x: number; y: number; moving: boolean } } }).e.d, time); break
		case 9: drawAgent(o as Agent, time); break
		case 11: {
			const c = o as Car
			drawSprite(ctx, carSprite(c.col, c.dx !== 0 ? 'h' : 'v', c.hover), c.x - c.dy * 0.18, c.y + c.dx * 0.18 + (c.hover ? Math.sin(time * 3 + c.x) * 0.03 : 0))
			break
		}
		case 12: drawTrain(time); break
		case 13: drawSprite(ctx, lampSprite((o as LampDraw).style), (o as LampDraw).x, (o as LampDraw).y); break
	}
}

function drawTree(t: Tree) {
	if (t.cut) {
		drawSprite(ctx, stumpSprite, t.x, t.y)
		return
	}
	const set = treeSprites[t.sp]
	drawSprite(ctx, set[Math.floor(t.v * set.length)], t.x, t.y, t.sc * (t.g < 1 ? 0.25 + 0.75 * t.g : 1))
}

export function jitter(b: Building) {
	return b.type === 'landmark' ? 0 : (((b.v * 7) % 5) - 2) * 0.07
}

function drawBuilding(b: Building, time: number) {
	const jx = jitter(b)
	if (b.done) {
		const key = b.type === 'graveyard' ? b.graves || 0 : b.type === 'starship' ? (b.launched ? 1 : 0) : b.type === 'landmark' ? tstyleOf.get(b.tribe)! : b.v
		drawSprite(ctx, buildingSprite(b.type, key, b.tribe), b.ox + jx, b.oy)
		const x = b.ox + jx
		switch (b.type) {
			case 'windmill': drawBlades(x + 1, b.oy + 0.42, time, 1.05, true); break
			case 'windfarm': for (const [tx, ty] of TURBINES) drawBlades(x + tx, b.oy + ty - 0.04, time * 1.6 + tx, 0.72, false); break
			case 'fountain': drawJets(x + 1, b.oy + 0.9, time); break
			case 'launchpad': if ((b.timer ?? 30) > 18) rocketShape(ctx, x + 1.0, b.oy + 1.45); break
		}
		if (b.fire) {
			ctx.globalCompositeOperation = 'lighter'
			El(ctx, b.ox + 1, b.oy + 1.2, 1.4, 0.9, `rgba(255,120,30,${(0.18 + Math.sin(time * 12) * 0.05).toFixed(3)})`)
			ctx.globalCompositeOperation = 'source-over'
		}
		if (hover.obj === b) {
			ctx.lineWidth = 0.05
			El(ctx, b.ox + 1, b.oy + 1.9, 1.1, 0.25, null, '#ffe58a')
		}
		return
	}
	const def = B[b.type], p = b.progress / def.work
	ctx.save()
	ctx.translate(b.ox + jx, b.oy)
	ctx.lineWidth = 0.04
	Rc(ctx, 0.05, 0.9, 1.9, 1.05, b.repair ? '#8f7b62' : '#a88b62', 'rgba(70,50,30,0.6)')
	for (const [x, y] of [[0.05, 0.9], [1.95, 0.9], [0.05, 1.95], [1.95, 1.95]]) Rc(ctx, x - 0.04, y - 0.12, 0.08, 0.14, '#6b4a2e')
	if (p > 0) {
		const top = 1.95 - (def.h + 0.15) * p
		ctx.save()
		ctx.beginPath()
		ctx.rect(-0.6, top, 3.2, 8)
		ctx.clip()
		artCtx.tribe = b.tribe
		ART[b.type](ctx, b.v)
		ctx.restore()
		if (p < 1) {
			const st = Math.max(top - 0.1, 1.95 - def.h - 0.1)
			const crane = (def.era || 0) >= 2
			for (const x of [0.02, 1.0, 1.98]) Ln(ctx, x, 1.98, x, st, crane ? '#d8a020' : '#8a6a45', 0.05)
			for (let y = 1.6; y > st; y -= 0.45) Ln(ctx, 0.0, y, 2.0, y, crane ? '#e0b030' : '#9b7a52', 0.04)
		}
	}
	const left = 1 - p
	const woodN = Math.ceil(b.delivered.wood * left), stoneN = Math.ceil(b.delivered.stone * left), foodN = Math.ceil(b.delivered.food * left)
	if (woodN) logPile(ctx, 2.05, 2.25, woodN)
	if (stoneN) stonePile(ctx, -0.45, 2.25, stoneN)
	if (foodN) sackPile(ctx, 0.8, 2.3, foodN)
	const by = 1.95 - (def.h + 0.15) * Math.max(p, 0.35) - 0.35
	Rc(ctx, 0.4, by, 1.2, 0.12, 'rgba(30,20,10,0.65)')
	Rc(ctx, 0.42, by + 0.02, 1.16 * p, 0.08, b.repair ? '#e0864a' : b.renovate ? '#9fd3ff' : TRIBES[b.tribe].color)
	ctx.restore()
}

function drawNightWindows(time: number, vx0: number, vx1: number, vy0: number, vy1: number) {
	const dk = darkness()
	ctx.globalCompositeOperation = 'lighter'
	for (const T of G.S.tribes) {
		if (fx.blackout.has(T.id)) continue
		for (const b of T.buildings) {
			if (!b.done || (b.type !== 'skyscraper' && b.type !== 'arcology')) continue
			if (b.ox + 2 < vx0 || b.ox > vx1 || b.oy + 2 < vy0 || b.oy - 5 > vy1) continue
			const x = b.ox + jitter(b)
			ctx.fillStyle = b.type === 'skyscraper' ? '#ffe9a8' : TRIBES[T.id].color
			ctx.globalAlpha = 0.75 * dk
			if (b.type === 'skyscraper') {
				for (let r = 0; r < 23; r++)
					for (let c = 0; c < 7; c++) {
						const seed = (b.id * 131 + r * 17 + c * 7 + Math.floor(time / 9)) % 10
						if (seed < 4) ctx.fillRect(x + 0.38 + c * 0.18, b.oy - 3.35 + r * 0.22, 0.12, 0.12)
					}
			} else {
				for (let k = 0; k < 6; k++) {
					const w = 1.9 - k * 0.27, y = b.oy + 1.9 - k * 0.62
					ctx.fillRect(x + 1 - w / 2 + 0.12, y - 0.33, w - 0.24, 0.06)
				}
			}
		}
	}
	ctx.globalAlpha = 1
	ctx.globalCompositeOperation = 'source-over'
}

function drawBlades(x: number, y: number, t: number, len: number, sails: boolean) {
	const a0 = t * (sails ? 0.9 : 1.8)
	ctx.lineWidth = 0.03
	for (let i = 0; i < (sails ? 4 : 3); i++) {
		const a = a0 + (i * Math.PI * 2) / (sails ? 4 : 3), ca = Math.cos(a), sa = Math.sin(a)
		Ln(ctx, x, y, x + ca * len, y + sa * len, sails ? '#5a3b22' : '#f4f6f8', sails ? 0.045 : 0.06)
		if (sails) {
			const px = -sa, py = ca
			ctx.lineWidth = 0.03
			Pl(ctx, [x + ca * 0.3, y + sa * 0.3, x + ca, y + sa, x + ca + px * 0.2, y + sa + py * 0.2, x + ca * 0.3 + px * 0.2, y + sa * 0.3 + py * 0.2], 'rgba(240,232,214,0.92)', 'rgba(45,28,16,0.62)')
		}
	}
	El(ctx, x, y, 0.06, 0.06, sails ? '#5a3b22' : '#dfe4e8')
}

function drawJets(x: number, y: number, t: number) {
	ctx.fillStyle = 'rgba(170,215,245,0.9)'
	for (let i = 0; i < 10; i++) {
		const ph = (t * 0.9 + i / 10) % 1, side = i % 2 ? 1 : -1
		ctx.beginPath()
		ctx.arc(x + side * ph * 0.55, y - Math.sin(ph * Math.PI) * 0.3 + ph * 0.5, 0.035, 0, 7)
		ctx.fill()
	}
}

function drawFire(T: Tribe, t: number) {
	const x = T.cx, y = T.cy + 0.1
	const g = ctx.createRadialGradient(x, y - 0.2, 0.05, x, y - 0.2, 1.6)
	g.addColorStop(0, `rgba(255,190,90,${(0.3 + Math.sin(t * 7) * 0.04).toFixed(3)})`)
	g.addColorStop(1, 'rgba(255,190,90,0)')
	ctx.fillStyle = g
	ctx.beginPath()
	ctx.arc(x, y - 0.2, 1.6, 0, 7)
	ctx.fill()
	ctx.lineWidth = 0.03
	for (let i = 0; i < 9; i++) {
		const a = (i / 9) * Math.PI * 2
		El(ctx, x + Math.cos(a) * 0.36, y + Math.sin(a) * 0.16, 0.08, 0.06, '#8f8b82', 'rgba(40,38,34,0.5)')
	}
	Ln(ctx, x - 0.25, y + 0.02, x + 0.25, y - 0.08, '#5a3b22', 0.09)
	Ln(ctx, x - 0.25, y - 0.08, x + 0.25, y + 0.02, '#6b4a2e', 0.09)
	const f1 = Math.sin(t * 9) * 0.04, f2 = Math.sin(t * 13 + 1) * 0.05
	Pl(ctx, [x - 0.2, y - 0.02, x + 0.2, y - 0.02, x + 0.02 + f1, y - 0.55 - f2], '#e8692a')
	Pl(ctx, [x - 0.12, y - 0.03, x + 0.13, y - 0.03, x - 0.01 - f1, y - 0.38 + f2], '#f6b136')
	Pl(ctx, [x - 0.06, y - 0.04, x + 0.07, y - 0.04, x + f1 * 0.5, y - 0.22], '#fff0a0')
	// tribe banner on the square
	Ln(ctx, x - 1.6, y - 0.1, x - 1.6, y - 1.6, '#5a3b22', 0.05)
	const wave = Math.sin(t * 3) * 0.05
	Pl(ctx, [x - 1.58, y - 1.6, x - 0.95, y - 1.5 + wave, x - 1.58, y - 1.25], TRIBES[T.id].color, 'rgba(30,20,10,0.5)')
	if (Math.random() < 0.08) emit(x, y - 0.5, 'smoke', 1)
}

function drawPile(T: Tribe) {
	const x = T.cx + 1.0, y = T.cy + 1.15
	logPile(ctx, x - 0.05, y, Math.ceil(Math.min(6, T.stock.wood / 3)))
	stonePile(ctx, x + 0.45, y + 0.08, Math.ceil(Math.min(6, T.stock.stone / 3)))
	if (T.stock.food > 0) sackPile(ctx, x - 0.05, y + 0.3, Math.ceil(Math.min(4, T.stock.food / 3)))
}

function drawCart(d: { x: number; y: number; moving: boolean }, t: number) {
	const { x, y, moving } = d
	const bob = moving ? Math.abs(Math.sin(t * 8)) * 0.03 : 0
	const O = 'rgba(45,28,16,0.62)'
	ctx.lineWidth = 0.03
	El(ctx, x + 0.1, y, 0.9, 0.15, 'rgba(0,0,0,0.22)')
	Rc(ctx, x - 0.95, y - 0.55 - bob, 0.5, 0.26, '#7a4f2a', O)
	Rc(ctx, x - 1.05, y - 0.78 - bob, 0.16, 0.3, '#7a4f2a', O)
	Rc(ctx, x - 0.4, y - 0.55, 1.1, 0.35, '#8a5a2b', O)
	Pl(ctx, [x - 0.4, y - 0.55, x + 0.7, y - 0.55, x + 0.6, y - 1.0, x - 0.3, y - 1.0], '#efe3c6', O)
	for (const wx of [-0.2, 0.5]) El(ctx, wx + x, y - 0.12, 0.13, 0.13, '#5a3b22', O)
	if (!moving) sackPile(ctx, x + 0.85, y + 0.1, 3)
}

function drawTrain(t: number) {
	const x = train.x, y = RAIL_Y + 0.15, d = train.dir
	const anyElectric = G.S.tribes.some((T) => has(T, 'electricity'))
	const maglev = G.S.tribes.some((T) => has(T, 'hovercars'))
	const steam = !anyElectric
	const lift = maglev ? 0.15 + Math.sin(t * 3) * 0.03 : 0
	const O = 'rgba(30,25,20,0.7)'
	ctx.lineWidth = 0.03
	for (let i = 0; i < 5; i++) {
		const cx = x - d * (i * 1.25)
		const loco = i === 0
		El(ctx, cx, y + 0.05, 0.6, 0.12, maglev ? 'rgba(127,246,255,0.4)' : 'rgba(0,0,0,0.25)')
		const col = steam ? (loco ? '#2a2a2e' : [TRIBES.pixels.color, TRIBES.noises.color, TRIBES.lampys.color][i % 3]) : maglev ? '#eef2f6' : loco ? '#c8323c' : '#e8e2d6'
		Rc(ctx, cx - 0.55, y - 0.55 - lift, 1.1, 0.5, col, O)
		if (loco && steam) {
			Rc(ctx, cx + d * 0.25 - 0.08, y - 0.85, 0.16, 0.3, '#1e1e22', O)
		} else for (let k = 0; k < 3; k++) Rc(ctx, cx - 0.42 + k * 0.32, y - 0.47 - lift, 0.2, 0.16, maglev ? '#7ff6ff' : '#bfe3f2')
		if (!maglev) for (const wx of [-0.3, 0.3]) El(ctx, cx + wx, y - 0.04, 0.09, 0.09, '#1e1e1e')
	}
}

const TOOLS: Record<string, string> = { chop: 'axe', mine: 'pick', hammer: 'hammer', farm: 'hoe' }
const ROLE_COL = { builder: '#e0862f', woodcutter: '#4e7f39', mason: '#7d8794', farmer: '#c79f38' }

function drawVillager(v: Villager, time: number, detail: boolean) {
	let y = v.y
	if (v.fly) y -= v.fly.z
	if (v.anim === 'dance') y -= Math.abs(Math.sin(time * 6 + v.ph)) * 0.15
	if (time - v.born < 4 && v.born > 0) El(ctx, v.x, y - 0.25, 0.32, 0.36, null, `rgba(255,229,138,${((1 - (time - v.born) / 4) * 0.9).toFixed(2)})`)
	if (hover.obj === v) {
		ctx.lineWidth = 0.04
		El(ctx, v.x, v.y, 0.25, 0.09, null, '#ffe58a')
	}
	if (!detail) {
		Rc(ctx, v.x - 0.08, y - 0.3, 0.16, 0.3, v.sick ? '#8fa86a' : v.android ? '#b9c2cc' : ROLE_COL[v.role])
		Rc(ctx, v.x - 0.08, y - 0.3, 0.16, 0.06, TRIBES[v.tribe].color)
		if (v.carry) Rc(ctx, v.x - 0.1, y - 0.5, 0.2, 0.08, v.carry === 'wood' ? '#8a5a2b' : v.carry === 'stone' ? '#b3b0a8' : '#dcc48e')
		return
	}
	const walking = v.anim === 'walk'
	const frame = walking ? Math.floor((((v.ph % 6.2832) + 6.2832) % 6.2832) / (Math.PI / 2)) % 4 : 4
	const vs = vstyleOf.get(v.tribe) ?? 0
	drawSprite(ctx, villagerSprite(v.role, v.skin, v.carry, frame, v.face, !!v.sick, vs, !!v.android, v.tribe), v.x, y)
	const tool = TOOLS[v.anim]
	if (tool) {
		const f = v.face
		const sx = v.x + f * 0.07, sy = y - 0.24
		const a = 0.15 + Math.sin(time * (tool === 'hoe' ? 5 : 9) + v.ph) * 1.0
		const ex = sx + f * Math.cos(a) * 0.24, ey = sy - Math.sin(a) * 0.24
		ctx.lineCap = 'round'
		const modern = vs >= 2
		Ln(ctx, sx, sy, ex, ey, modern ? '#4a4f55' : '#7a5434', 0.03)
		if (tool === 'hammer') Rc(ctx, ex - 0.04, ey - 0.03, 0.08, 0.06, modern ? '#f2c230' : '#8a8f99')
		else El(ctx, ex, ey, 0.05, 0.035, modern ? '#e0864a' : tool === 'hoe' ? '#9aa0a8' : '#aeb4bc')
	} else if (v.anim === 'wave' || v.anim === 'dance') {
		const up = Math.sin(time * 10 + v.ph) * 0.03
		ctx.lineCap = 'round'
		Ln(ctx, v.x + 0.07, y - 0.25, v.x + 0.15, y - 0.42 + up, v.skin, 0.035)
		if (v.anim === 'dance') Ln(ctx, v.x - 0.07, y - 0.25, v.x - 0.15, y - 0.42 - up, v.skin, 0.035)
	}
}

function drawAgent(a: Agent, time: number) {
	const walking = a.path.length > 0 && a.down <= 0
	const frame = walking ? Math.floor((((a.ph % 6.2832) + 6.2832) % 6.2832) / (Math.PI / 2)) % 4 : 4
	const sp = agentSprite(a.kind, a.team, frame, a.face, a.style >= 4 ? 3 : a.style, a.id, !!a.carry, a.level ?? 0)
	if (a.down > 0 || a.hp <= 0) {
		ctx.save()
		ctx.translate(a.x, a.y)
		ctx.rotate((Math.PI / 2) * a.face)
		drawSprite(ctx, sp, 0.25 * a.face, 0.1)
		ctx.restore()
		ctx.fillStyle = '#ffe58a'
		for (let i = 0; i < 3; i++) {
			const ang = time * 4 + (i * Math.PI * 2) / 3
			ctx.fillRect(a.x + Math.cos(ang) * 0.2 - 0.03, a.y - 0.45 + Math.sin(ang) * 0.06, 0.06, 0.06)
		}
		return
	}
	if (a.kind === 'decoy') {
		ctx.globalAlpha = 0.45 + Math.sin(time * 10 + a.id) * 0.15
		drawSprite(ctx, sp, a.x + (Math.random() < 0.05 ? 0.1 : 0), a.y)
		ctx.globalAlpha = 1
		return
	}
	const hoverY = a.kind === 'siege' && (a.level ?? 0) >= 3 ? Math.sin(time * 3) * 0.08 : 0
	drawSprite(ctx, sp, a.x, a.y + hoverY)
	if (a.kind === 'robot') {
		ctx.globalCompositeOperation = 'lighter'
		El(ctx, a.x, a.y - 0.39, 0.12, 0.06, 'rgba(255,60,60,0.5)')
		ctx.globalCompositeOperation = 'source-over'
	}
}

function drawParticles(time: number) {
	for (const p of parts) {
		const f = p.life / p.max
		switch (p.type) {
			case 'smoke': case 'dust': case 'miasma':
				ctx.globalAlpha = f * p.a
				ctx.fillStyle = p.col
				ctx.beginPath()
				ctx.arc(p.x, p.y, Math.max(0.001, p.size), 0, 7)
				ctx.fill()
				break
			case 'flame':
				ctx.globalCompositeOperation = 'lighter'
				ctx.globalAlpha = f * p.a
				ctx.fillStyle = p.col
				ctx.beginPath()
				ctx.arc(p.x, p.y, Math.max(0.01, p.size), 0, 7)
				ctx.fill()
				ctx.globalCompositeOperation = 'source-over'
				break
			case 'ghost':
				ctx.globalAlpha = f * p.a
				El(ctx, p.x, p.y, 0.1, 0.13, '#f4f4ff')
				El(ctx, p.x - 0.035, p.y - 0.02, 0.015, 0.02, '#334')
				El(ctx, p.x + 0.035, p.y - 0.02, 0.015, 0.02, '#334')
				break
			case 'heart': {
				ctx.globalAlpha = Math.min(1, f * 2)
				ctx.fillStyle = p.col
				const z = p.size
				ctx.beginPath()
				ctx.arc(p.x - z * 0.25, p.y, z * 0.3, Math.PI, 0)
				ctx.arc(p.x + z * 0.25, p.y, z * 0.3, Math.PI, 0)
				ctx.lineTo(p.x, p.y + z * 0.55)
				ctx.closePath()
				ctx.fill()
				break
			}
			case 'spark': {
				ctx.globalAlpha = Math.min(1, f * 1.5)
				ctx.fillStyle = p.col
				const z = p.size * (0.6 + 0.4 * Math.sin(time * 20 + p.x * 9))
				ctx.fillRect(p.x - z / 2, p.y - z / 2, z, z)
				break
			}
			default:
				ctx.globalAlpha = Math.min(1, f * 2)
				ctx.fillStyle = p.col
				ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
		}
	}
	ctx.globalAlpha = 1
}

