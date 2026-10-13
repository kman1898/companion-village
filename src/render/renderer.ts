import { settings } from '../core/settings'
import { clamp } from '../core/util'
import { B } from '../data/buildings'
import { fx } from '../game/events'
import { CX, CY, G, H, W, type Building, type Bush, type Rock, type Sheep, type Tree, type Villager } from '../game/state'
import { cam, setViewport } from '../view/camera'
import { hover } from '../view/input'
import { logPile, sackPile, stonePile, ART } from './art'
import { El, Ln, Pl, Rc, type Ctx } from './draw'
import { emit, floats, parts, setParticleBudget } from './particles'
import {
	bushSprite, buildingSprite, drawSprite, getCloudSprite, makeStaticSprites, patchSprite, rockSprite, sheepSprite, stumpSprite, treeSprites,
	villagerSprite,
} from './sprites'
import { renderTerrain, terrain, TP } from './terrain'

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
	setParticleBudget(settings.quality === 'low' ? 400 : 1200)
}

export function applyQuality() {
	rs = targetMaxScale()
	resize()
}

// ---- adaptive resolution: drop the render scale when frames take too long ----
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

// ---- rain drops live in screen space ----
const drops: { x: number; y: number; l: number }[] = []

let smokeTimer = 0

const sortKey = (o: { k: number; y?: number; oy?: number }) =>
	o.k === 3 ? (o as Building).oy + 1.95 : o.k === 5 ? CY + 0.1 : o.k === 6 ? CY + 1.0 : o.k === 8 ? (o as unknown as { y: number }).y : (o as { y: number }).y
const fireObj = { k: 5 }, pileObj = { k: 6 }
const cartObj = { k: 8, x: 0, y: 0 }

function lowerBound(order: number[], trees: Tree[], y: number) {
	let lo = 0, hi = order.length
	while (lo < hi) {
		const mid = (lo + hi) >> 1
		if (trees[order[mid]].y < y) lo = mid + 1
		else hi = mid
	}
	return lo
}

export function render(rdt: number) {
	const t0 = performance.now()
	adapt(rdt)
	if (G.terrainDirty) renderTerrain()
	const S = G.S, w = G.world, time = S.time, s = cam.s
	const low = settings.quality === 'low'

	let shx = 0, shy = 0
	if (fx.shake > 0.01) {
		shx = (Math.random() - 0.5) * fx.shake * 14
		shy = (Math.random() - 0.5) * fx.shake * 14
	}
	ctx.setTransform(rs * s, 0, 0, rs * s, rs * (cw / 2 - cam.x * s + shx), rs * (ch / 2 - cam.y * s + shy))
	const vx0 = cam.x - cw / 2 / s, vx1 = cam.x + cw / 2 / s, vy0 = cam.y - ch / 2 / s, vy1 = cam.y + ch / 2 / s

	if (vx0 < 0.5 || vy0 < 0.5 || vx1 > W - 0.5 || vy1 > H - 0.5) {
		ctx.fillStyle = '#24391b'
		ctx.fillRect(vx0 - 1, vy0 - 1, vx1 - vx0 + 2, vy1 - vy0 + 2)
	}
	const sx0 = clamp(Math.floor(vx0) - 1, 0, W), sy0 = clamp(Math.floor(vy0) - 1, 0, H)
	const sx1 = clamp(Math.ceil(vx1) + 1, 0, W), sy1 = clamp(Math.ceil(vy1) + 1, 0, H)
	ctx.imageSmoothingEnabled = true
	if (terrain && sx1 > sx0 && sy1 > sy0) ctx.drawImage(terrain, sx0 * TP, sy0 * TP, (sx1 - sx0) * TP, (sy1 - sy0) * TP, sx0, sy0, sx1 - sx0, sy1 - sy0)

	// water glints
	ctx.lineCap = 'round'
	for (const sp of w.sparkles) {
		const a = Math.sin(time * 1.3 + sp.p)
		if (a <= 0.3 || sp.x < vx0 || sp.x > vx1 || sp.y < vy0 || sp.y > vy1) continue
		Ln(ctx, sp.x - 0.15, sp.y, sp.x + 0.15, sp.y, `rgba(255,255,255,${((a - 0.3) * 0.5).toFixed(2)})`, 0.04)
	}

	// craters
	for (const c of S.craters) {
		const fade = clamp((c.until - S.year) / 8, 0.25, 1)
		ctx.globalAlpha = fade
		El(ctx, c.x, c.y, c.r * 1.25, c.r * 0.8, '#6e5a3e')
		El(ctx, c.x, c.y + 0.05, c.r, c.r * 0.62, '#4a3a28')
		El(ctx, c.x + 0.1, c.y + 0.12, c.r * 0.6, c.r * 0.36, '#2f251a')
		ctx.globalAlpha = 1
	}

	// fields
	for (const b of S.buildings) {
		if (!b.field) continue
		const f = b.field
		if (f.ox > vx1 || f.ox + 2 < vx0 || f.oy > vy1 || f.oy + 2 < vy0) continue
		for (const p of f.patches) {
			const stage = !b.done || p.s === 0 ? 0 : p.s === 2 ? 6 : 1 + Math.min(4, Math.floor((p.t / 35) * 5))
			drawSprite(ctx, patchSprite(stage), p.x, p.y)
		}
	}

	// dynamic objects, depth sorted, merged with the pre-sorted trees
	const dyn: { k: number }[] = []
	const inView = (x: number, y: number) => x > vx0 - 1 && x < vx1 + 1 && y > vy0 - 0.3 && y < vy1 + 2.5
	for (const r of w.rocks) if (!r.gone && inView(r.x, r.y)) dyn.push(r)
	for (const b of w.bushes) if (!b.gone && inView(b.x, b.y)) dyn.push(b)
	for (const b of S.buildings) if (b.ox + 2.6 > vx0 && b.ox - 0.6 < vx1 && b.oy + 2.4 > vy0 && b.oy - 4.2 < vy1) dyn.push(b)
	for (const v of S.villagers) if (inView(v.x, v.y)) dyn.push(v)
	for (const sh of S.sheep) if (inView(sh.x, sh.y)) dyn.push(sh)
	dyn.push(fireObj, pileObj)
	if (S.event?.type === 'merchant') {
		cartObj.x = S.event.d.x
		cartObj.y = S.event.d.y
		dyn.push(cartObj)
	}
	dyn.sort((a, b) => sortKey(a) - sortKey(b))

	const detail = s >= 11
	let j = 0, drawn = dyn.length
	const order = w.treeOrder, trees = w.trees
	const yEnd = vy1 + 1.6
	for (let i = lowerBound(order, trees, vy0 - 0.3); i < order.length; i++) {
		const t = trees[order[i]]
		if (t.y > yEnd) break
		if (t.gone || t.x < vx0 - 1 || t.x > vx1 + 1) continue
		while (j < dyn.length && sortKey(dyn[j]) <= t.y) drawObj(dyn[j++], time, detail)
		drawTree(t)
		drawn++
	}
	while (j < dyn.length) drawObj(dyn[j++], time, detail)
	perf.drawn = drawn

	// chimney smoke
	smokeTimer -= rdt
	if (smokeTimer <= 0) {
		smokeTimer = 0.35
		for (const b of S.buildings) {
			if (!b.done || Math.random() > 0.22) continue
			const sp = buildingSprite(b.type, b.v)
			if (sp.smoke) emit(b.ox + jitter(b) + sp.smoke[0], b.oy + sp.smoke[1], 'smoke', 1)
		}
	}

	drawParticles(time)
	drawEventWorld(time)

	if (!low) {
		const cloud = getCloudSprite()
		for (const c of w.clouds) {
			c.x += c.sp * rdt
			if (c.x - c.r * 2 > W) c.x = -c.r * 2
			ctx.drawImage(cloud, c.x - c.r * 1.6, c.y - c.r, c.r * 3.2, c.r * 2)
		}
	}

	// ---- screen space ----
	ctx.setTransform(rs, 0, 0, rs, 0, 0)
	if (fx.dark > 0.005) {
		ctx.fillStyle = `rgba(18,24,40,${fx.dark.toFixed(3)})`
		ctx.fillRect(0, 0, cw, ch)
	}
	if (fx.tint > 0.005) {
		ctx.fillStyle = `rgba(100,150,40,${fx.tint.toFixed(3)})`
		ctx.fillRect(0, 0, cw, ch)
	}
	if (fx.rain > 0.02) drawRain(rdt)
	if (fx.flash > 0.01) {
		ctx.fillStyle = `rgba(235,240,255,${(fx.flash * 0.55).toFixed(3)})`
		ctx.fillRect(0, 0, cw, ch)
	}
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
	perf.renderMs = performance.now() - t0
}

function drawObj(o: { k: number }, time: number, detail: boolean) {
	switch (o.k) {
		case 1: drawRock(o as Rock); break
		case 2: drawBush(o as Bush); break
		case 3: drawBuilding(o as Building, time); break
		case 4: drawVillager(o as Villager, time, detail); break
		case 5: drawFire(time); break
		case 6: drawPile(); break
		case 7: drawSheep(o as Sheep); break
		case 8: drawCart(time); break
	}
}

function drawTree(t: Tree) {
	if (t.cut) {
		drawSprite(ctx, stumpSprite, t.x, t.y)
		return
	}
	const set = treeSprites[t.pine ? 1 : 0]
	const sp = set[Math.floor(t.v * set.length)]
	drawSprite(ctx, sp, t.x, t.y, t.sc * (t.g < 1 ? 0.25 + 0.75 * t.g : 1))
}

function drawRock(k: Rock) {
	drawSprite(ctx, rockSprite(k.seed, k.amt <= 0 ? 0 : Math.ceil((4 * k.amt) / k.max)), k.x, k.y)
}

function drawBush(b: Bush) {
	drawSprite(ctx, bushSprite(Math.floor(b.v * 3), !!b.ber), b.x, b.y)
}

function drawSheep(sh: Sheep) {
	drawSprite(ctx, sheepSprite(Math.sin(sh.ph) > 0 ? 1 : 0, sh.face), sh.x, sh.y)
}

export function jitter(b: Building) {
	return (((b.v * 7) % 5) - 2) * 0.07
}

function drawBuilding(b: Building, time: number) {
	const jx = jitter(b)
	if (b.done) {
		const key = b.type === 'graveyard' ? b.graves || 0 : b.v
		drawSprite(ctx, buildingSprite(b.type, key), b.ox + jx, b.oy)
		if (b.type === 'windmill') drawBlades(b.ox + jx + 1, b.oy + 0.42, time)
		if (b.type === 'fountain') drawJets(b.ox + jx + 1, b.oy + 0.9, time)
		if (b.fire) {
			ctx.globalCompositeOperation = 'lighter'
			El(ctx, b.ox + 1, b.oy + 1.2, 1.4, 0.9, `rgba(255,120,30,${(0.18 + Math.sin(time * 12) * 0.05).toFixed(3)})`)
			ctx.globalCompositeOperation = 'source-over'
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
		ctx.rect(-0.6, top, 3.2, 3)
		ctx.clip()
		ART[b.type](ctx, b.v)
		ctx.restore()
		if (p < 1) {
			const st = Math.max(top - 0.1, 1.95 - def.h - 0.1)
			for (const x of [0.02, 1.0, 1.98]) Ln(ctx, x, 1.98, x, st, '#8a6a45', 0.05)
			for (let y = 1.6; y > st; y -= 0.45) Ln(ctx, 0.0, y, 2.0, y, '#9b7a52', 0.04)
		}
	}
	const left = 1 - p
	const woodN = Math.ceil(b.delivered.wood * left), stoneN = Math.ceil(b.delivered.stone * left), foodN = Math.ceil(b.delivered.food * left)
	if (woodN) logPile(ctx, 2.05, 2.25, woodN)
	if (stoneN) stonePile(ctx, -0.45, 2.25, stoneN)
	if (foodN) sackPile(ctx, 0.8, 2.3, foodN)
	const by = 1.95 - (def.h + 0.15) * Math.max(p, 0.35) - 0.35
	Rc(ctx, 0.4, by, 1.2, 0.12, 'rgba(30,20,10,0.65)')
	Rc(ctx, 0.42, by + 0.02, 1.16 * p, 0.08, b.repair ? '#e0864a' : '#f2c75c')
	ctx.restore()
}

function drawBlades(x: number, y: number, t: number) {
	const a0 = t * 0.9
	ctx.lineWidth = 0.03
	for (let i = 0; i < 4; i++) {
		const a = a0 + (i * Math.PI) / 2, ca = Math.cos(a), sa = Math.sin(a)
		Ln(ctx, x, y, x + ca * 1.05, y + sa * 1.05, '#5a3b22', 0.045)
		const px = -sa, py = ca
		ctx.lineWidth = 0.03
		Pl(ctx, [x + ca * 0.3, y + sa * 0.3, x + ca, y + sa, x + ca + px * 0.2, y + sa + py * 0.2, x + ca * 0.3 + px * 0.2, y + sa * 0.3 + py * 0.2], 'rgba(240,232,214,0.92)', 'rgba(45,28,16,0.62)')
	}
	El(ctx, x, y, 0.07, 0.07, '#5a3b22')
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

function drawFire(t: number) {
	const x = CX, y = CY + 0.1
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
	if (Math.random() < 0.08) emit(x, y - 0.5, 'smoke', 1)
}

function drawPile() {
	const S = G.S
	const x = CX + 1.0, y = CY + 1.15
	logPile(ctx, x - 0.05, y, Math.ceil(Math.min(6, S.stock.wood / 3)))
	stonePile(ctx, x + 0.45, y + 0.08, Math.ceil(Math.min(6, S.stock.stone / 3)))
	if (S.stock.food > 0) sackPile(ctx, x - 0.05, y + 0.3, Math.ceil(Math.min(4, S.stock.food / 3)))
}

function drawCart(t: number) {
	const e = G.S.event
	if (!e) return
	const { x, y, moving } = e.d
	const bob = moving ? Math.abs(Math.sin(t * 8)) * 0.03 : 0
	ctx.lineWidth = 0.03
	El(ctx, x + 0.1, y, 0.9, 0.15, 'rgba(0,0,0,0.22)')
	// horse
	Rc(ctx, x - 0.95, y - 0.55 - bob, 0.5, 0.26, '#7a4f2a', 'rgba(45,28,16,0.62)')
	Rc(ctx, x - 1.05, y - 0.78 - bob, 0.16, 0.3, '#7a4f2a', 'rgba(45,28,16,0.62)')
	for (const lx of [-0.9, -0.55]) Ln(ctx, lx, y - 0.3, lx + (moving ? Math.sin(t * 10 + lx) * 0.05 : 0), y, '#4a3020', 0.05)
	// cart and canvas cover
	Rc(ctx, x - 0.4, y - 0.55, 1.1, 0.35, '#8a5a2b', 'rgba(45,28,16,0.62)')
	Pl(ctx, [x - 0.4, y - 0.55, x + 0.7, y - 0.55, x + 0.6, y - 1.0, x - 0.3, y - 1.0], '#efe3c6', 'rgba(45,28,16,0.62)')
	for (const wx of [-0.2, 0.5]) {
		El(ctx, wx + x, y - 0.12, 0.13, 0.13, '#5a3b22', 'rgba(45,28,16,0.62)')
		El(ctx, wx + x, y - 0.12, 0.04, 0.04, '#c9a46b')
	}
	if (!moving) {
		sackPile(ctx, x + 0.85, y + 0.1, 3)
		logPile(ctx, x - 0.4, y + 0.25, 3)
	}
}

const TOOLS: Record<string, string> = { chop: 'axe', mine: 'pick', hammer: 'hammer', farm: 'hoe' }
function drawVillager(v: Villager, time: number, detail: boolean) {
	const isHover = hover.obj === v
	let y = v.y
	if (v.fly) y -= v.fly.z
	if (v.anim === 'dance') y -= Math.abs(Math.sin(time * 6 + v.ph)) * 0.15
	if (time - v.born < 4 && v.born > 0) El(ctx, v.x, y - 0.25, 0.32, 0.36, null, `rgba(255,229,138,${((1 - (time - v.born) / 4) * 0.9).toFixed(2)})`)
	if (isHover) {
		ctx.lineWidth = 0.04
		El(ctx, v.x, v.y, 0.25, 0.09, null, '#ffe58a')
	}
	if (!detail) {
		Rc(ctx, v.x - 0.08, y - 0.3, 0.16, 0.3, v.sick ? '#8fa86a' : roleColor(v))
		El(ctx, v.x, y - 0.35, 0.07, 0.07, v.skin)
		if (v.carry) Rc(ctx, v.x - 0.1, y - 0.5, 0.2, 0.08, v.carry === 'wood' ? '#8a5a2b' : v.carry === 'stone' ? '#b3b0a8' : '#dcc48e')
		return
	}
	const walking = v.anim === 'walk'
	const frame = walking ? Math.floor((((v.ph % 6.2832) + 6.2832) % 6.2832) / (Math.PI / 2)) % 4 : 4
	drawSprite(ctx, villagerSprite(v.role, v.skin, v.carry, frame, v.face, !!v.sick), v.x, y)
	const tool = TOOLS[v.anim]
	if (tool) {
		const f = v.face
		const sx = v.x + f * 0.07, sy = y - 0.24
		const a = 0.15 + Math.sin(time * (tool === 'hoe' ? 5 : 9) + v.ph) * 1.0
		const ex = sx + f * Math.cos(a) * 0.24, ey = sy - Math.sin(a) * 0.24
		ctx.lineCap = 'round'
		Ln(ctx, sx, sy, ex, ey, '#7a5434', 0.03)
		if (tool === 'hammer') Rc(ctx, ex - 0.04, ey - 0.03, 0.08, 0.06, '#8a8f99')
		else El(ctx, ex, ey, 0.05, 0.035, tool === 'hoe' ? '#9aa0a8' : '#aeb4bc')
	} else if (v.anim === 'wave' || v.anim === 'dance') {
		const up = Math.sin(time * 10 + v.ph) * 0.03
		ctx.lineCap = 'round'
		Ln(ctx, v.x + 0.07, y - 0.25, v.x + 0.15, y - 0.42 + up, v.skin, 0.035)
		if (v.anim === 'dance') Ln(ctx, v.x - 0.07, y - 0.25, v.x - 0.15, y - 0.42 - up, v.skin, 0.035)
	}
}

const roleColor = (v: Villager) => ({ builder: '#e0862f', woodcutter: '#4e7f39', mason: '#7d8794', farmer: '#c79f38' })[v.role]

function drawParticles(time: number) {
	for (const p of parts) {
		const f = p.life / p.max
		switch (p.type) {
			case 'smoke': case 'dust': case 'miasma':
				ctx.globalAlpha = f * p.a
				ctx.fillStyle = p.col
				ctx.beginPath()
				ctx.arc(p.x, p.y, p.size, 0, 7)
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

function drawEventWorld(time: number) {
	const e = G.S.event
	// lightning
	for (const b of fx.bolts) {
		ctx.globalAlpha = Math.min(1, b.life * 3)
		ctx.lineJoin = 'round'
		for (const [col, lw] of [['rgba(170,190,255,0.5)', 0.22], ['#ffffff', 0.07]] as const) {
			ctx.beginPath()
			ctx.moveTo(b.pts[0], b.pts[1])
			for (let i = 2; i < b.pts.length; i += 2) ctx.lineTo(b.pts[i], b.pts[i + 1])
			ctx.strokeStyle = col
			ctx.lineWidth = lw
			ctx.stroke()
		}
		ctx.globalAlpha = 1
	}
	if (!e) return
	if (e.type === 'tornado') drawTornado(e.d.x, e.d.y, time, Math.min(1, e.t / 2, (e.dur - e.t) / 2))
	if (e.type === 'meteor') drawMeteor(e, time)
	if (e.type === 'locusts') drawSwarm(e.d.x, e.d.y, time)
	if (e.type === 'festival') drawBunting(time)
}

function drawTornado(x: number, y: number, t: number, k: number) {
	const HGT = 6
	const off = (f: number) => Math.sin(t * 2.2 + f * 3) * (0.15 + f * 0.9)
	const wid = (f: number) => 0.16 + f ** 1.6 * 1.9
	ctx.globalAlpha = k
	El(ctx, x, y, 1.6, 0.5, 'rgba(110,95,75,0.45)')
	for (let i = 0; i < 6; i++) {
		const a = t * 4 + i
		El(ctx, x + Math.cos(a) * 1.1, y + Math.sin(a) * 0.3, 0.35, 0.18, 'rgba(140,125,100,0.4)')
	}
	// funnel body
	const L: number[] = [], R: number[] = []
	for (let i = 0; i <= 20; i++) {
		const f = i / 20, yy = y - f * HGT, o = off(f), w = wid(f)
		L.push(x + o - w, yy)
		R.push(x + o + w, yy)
	}
	ctx.beginPath()
	ctx.moveTo(L[0], L[1])
	for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i], L[i + 1])
	for (let i = R.length - 2; i >= 0; i -= 2) ctx.lineTo(R[i], R[i + 1])
	ctx.closePath()
	const g = ctx.createLinearGradient(0, y, 0, y - HGT)
	g.addColorStop(0, 'rgba(80,72,62,0.92)')
	g.addColorStop(1, 'rgba(120,118,115,0.75)')
	ctx.fillStyle = g
	ctx.fill()
	// swirling bands
	ctx.lineWidth = 0.05
	for (let j = 0; j < 9; j++) {
		const f = (j / 9 + t * 0.7) % 1, w = wid(f)
		ctx.globalAlpha = k * 0.5 * Math.sin(f * Math.PI)
		El(ctx, x + off(f), y - f * HGT, w * 0.95, w * 0.2, null, '#e8e2d6')
	}
	// storm cloud the funnel hangs from
	ctx.globalAlpha = k * 0.75
	El(ctx, x + off(1), y - HGT, 3.2, 1.0, '#5c5f68')
	El(ctx, x + off(1) - 1.4, y - HGT + 0.2, 1.8, 0.7, '#6a6d75')
	El(ctx, x + off(1) + 1.5, y - HGT + 0.1, 1.9, 0.75, '#666972')
	// debris
	ctx.globalAlpha = k
	ctx.fillStyle = '#4a3a2a'
	for (let i = 0; i < 16; i++) {
		const f = ((i * 0.37) % 1) * 0.7, a = t * 6 + i * 0.52, w = wid(f) + 0.3
		ctx.fillRect(x + off(f) + Math.cos(a) * w, y - f * HGT + Math.sin(a) * w * 0.25, 0.08, 0.08)
	}
	ctx.globalAlpha = 1
}

function drawMeteor(e: NonNullable<typeof G.S.event>, time: number) {
	const d = e.d
	if (!d.hit) {
		const f = Math.min(1, e.t / 2.2) ** 2
		const x = d.sx + (d.tx - d.sx) * f, y = d.sy + (d.ty - d.sy) * f
		const tx = x + (d.sx - d.tx) * 0.12, ty = y + (d.sy - d.ty) * 0.12
		const g = ctx.createLinearGradient(x, y, tx, ty)
		g.addColorStop(0, 'rgba(255,240,200,0.95)')
		g.addColorStop(1, 'rgba(255,120,40,0)')
		ctx.strokeStyle = g
		ctx.lineWidth = 0.35
		ctx.lineCap = 'round'
		ctx.beginPath()
		ctx.moveTo(x, y)
		ctx.lineTo(tx, ty)
		ctx.stroke()
		El(ctx, x, y, 0.28, 0.28, '#fff3c8')
		// target shadow grows as it approaches
		ctx.globalAlpha = 0.25 + f * 0.4
		El(ctx, d.tx, d.ty, 0.6 + f * 1.6, (0.6 + f * 1.6) * 0.5, 'rgba(0,0,0,0.35)')
		ctx.globalAlpha = 1
	} else if (d.ringT >= 0 && d.ringT < 1.2) {
		const r = 0.5 + d.ringT * 6
		ctx.globalAlpha = 1 - d.ringT / 1.2
		ctx.lineWidth = 0.2
		El(ctx, d.tx, d.ty, r, r * 0.55, null, '#fff0c0')
		ctx.globalAlpha = 1
	}
	void time
}

function drawSwarm(x: number, y: number, t: number) {
	ctx.fillStyle = 'rgba(40,35,20,0.85)'
	for (let i = 0; i < 140; i++) {
		const a = i * 2.39996 + t * (1 + (i % 5) * 0.3)
		const r = 0.4 + ((i * 0.618) % 1) * 2.6
		ctx.fillRect(x + Math.cos(a) * r, y - 1 + Math.sin(a * 1.3) * r * 0.5, 0.05, 0.035)
	}
}

function drawBunting(t: number) {
	const cols = ['#e0564a', '#f2c75c', '#5aa6e0', '#7cc457']
	const corners = [[CX - 2.2, CY - 2.6], [CX + 2.2, CY - 2.6], [CX + 2.2, CY + 1.6], [CX - 2.2, CY + 1.6]]
	for (const [px, py] of corners) Ln(ctx, px, py + 1.1, px, py - 0.5, '#6b4a2e', 0.06)
	for (let s = 0; s < 4; s++) {
		const [ax, ay] = corners[s], [bx, by] = corners[(s + 1) % 4]
		for (let i = 0; i < 8; i++) {
			const f = (i + 0.5) / 8
			const x = ax + (bx - ax) * f, y = ay - 0.5 + (by - ay) * f + Math.sin(f * Math.PI) * 0.35 + Math.sin(t * 3 + i) * 0.02
			Pl(ctx, [x - 0.1, y, x + 0.1, y, x, y + 0.2], cols[(i + s) % 4])
		}
	}
}

function drawRain(rdt: number) {
	const target = Math.floor(260 * fx.rain)
	while (drops.length < target) drops.push({ x: Math.random() * (cw + 200) - 100, y: Math.random() * ch, l: 10 + Math.random() * 14 })
	drops.length = Math.min(drops.length, target)
	ctx.strokeStyle = 'rgba(190,210,235,0.45)'
	ctx.lineWidth = 1.2
	ctx.beginPath()
	for (const d of drops) {
		d.y += rdt * 900
		d.x -= rdt * 180
		if (d.y > ch) {
			d.y = -20
			d.x = Math.random() * (cw + 200)
		}
		ctx.moveTo(d.x, d.y)
		ctx.lineTo(d.x - d.l * 0.2, d.y + d.l)
	}
	ctx.stroke()
}
