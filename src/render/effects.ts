import { clamp } from '../core/util'
import { shots } from '../game/agents'
import { villageBounds } from '../game/buildings'
import { nightAmount, twilight } from '../game/daynight'
import { fx } from '../game/events'
import { currentEra } from '../game/history'
import { CX, CY, G, has, type ActiveEvent } from '../game/state'
import { planes, rockets } from '../game/traffic'
import { El, Ln, OUT, Pl, Rc, roundRect, type Ctx } from './draw'
import { rocketShape } from './art-future'
import { towerEmitters } from './rivalart'

export const rivalStyle = () => {
	const e = currentEra()
	return e >= 4 ? 3 : e >= 2 ? 2 : e
}

// ======================================================================
// World-space visuals (drawn after the depth-sorted objects)
// ======================================================================
export function drawWorldFX(ctx: Ctx, time: number) {
	const e = G.S.event
	for (const r of rockets) {
		rocketShape(ctx, r.x, r.y - r.alt, r.big)
	}
	drawShots(ctx)
	if (has('forceFields')) drawShield(ctx, time)
	if (e) {
		if (e.type === 'tornado') drawTornado(ctx, e.d.x, e.d.y, time, Math.min(1, e.t / 2, (e.dur - e.t) / 2))
		if (e.type === 'meteor') drawMeteor(ctx, e)
		if (e.type === 'locusts') drawSwarm(ctx, e.d.x, e.d.y, time)
		if (e.type === 'festival' || e.type === 'wedding') drawBunting(ctx, time)
		if (e.type === 'concert') drawStage(ctx)
		if (e.type === 'dragon') drawDragon(ctx, e, time)
		if (e.type === 'ufo') drawUfo(ctx, e, time)
	}
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
	for (const p of planes) drawPlane(ctx, p, time)
}

function drawShots(ctx: Ctx) {
	for (const s of shots) {
		const f = s.t / s.dur
		const x = s.x + (s.tx - s.x) * f, y = s.y + (s.ty - s.y) * f
		if (s.kind === 'ring') {
			const a = Math.atan2(s.ty - s.y, s.tx - s.x)
			ctx.strokeStyle = s.col
			ctx.globalAlpha = 0.9 - f * 0.4
			for (let k = 0; k < 3; k++) {
				const r = 0.15 + k * 0.12 + f * 0.25
				ctx.lineWidth = 0.05
				ctx.beginPath()
				ctx.arc(x - Math.cos(a) * k * 0.12, y - Math.sin(a) * k * 0.12, r, a - 0.9, a + 0.9)
				ctx.stroke()
			}
			ctx.globalAlpha = 1
		} else if (s.kind === 'beam') {
			ctx.globalCompositeOperation = 'lighter'
			ctx.globalAlpha = 1 - f
			Ln(ctx, s.x, s.y, s.tx, s.ty, s.col, 0.14)
			Ln(ctx, s.x, s.y, s.tx, s.ty, '#ffffff', 0.04)
			El(ctx, s.tx, s.ty, 0.25, 0.25, s.col)
			ctx.globalAlpha = 1
			ctx.globalCompositeOperation = 'source-over'
		} else {
			// Companion militia lob glowing buttons
			const arc = Math.sin(f * Math.PI) * 0.9
			ctx.lineWidth = 0.02
			roundRect(ctx, x - 0.09, y - arc - 0.09, 0.18, 0.18, 0.04)
			ctx.fillStyle = s.col
			ctx.fill()
			ctx.strokeStyle = '#111'
			ctx.stroke()
		}
	}
}

function drawShield(ctx: Ctx, time: number) {
	const b = villageBounds()
	const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2
	const rx = (b.x1 - b.x0) / 2 + 3, ry = (b.y1 - b.y0) / 2 + 3
	const a = 0.07 + fx.shield * 0.5 + Math.sin(time * 2) * 0.02
	ctx.lineWidth = 0.15
	El(ctx, cx, cy, rx, ry, `rgba(127,246,255,${(a * 0.25).toFixed(3)})`, `rgba(127,246,255,${Math.min(1, a * 2).toFixed(3)})`)
}

function drawTornado(ctx: Ctx, x: number, y: number, t: number, k: number) {
	const HGT = 6
	const off = (f: number) => Math.sin(t * 2.2 + f * 3) * (0.15 + f * 0.9)
	const wid = (f: number) => 0.16 + f ** 1.6 * 1.9
	ctx.globalAlpha = k
	El(ctx, x, y, 1.6, 0.5, 'rgba(110,95,75,0.45)')
	for (let i = 0; i < 6; i++) {
		const a = t * 4 + i
		El(ctx, x + Math.cos(a) * 1.1, y + Math.sin(a) * 0.3, 0.35, 0.18, 'rgba(140,125,100,0.4)')
	}
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
	ctx.lineWidth = 0.05
	for (let j = 0; j < 9; j++) {
		const f = (j / 9 + t * 0.7) % 1, w = wid(f)
		ctx.globalAlpha = k * 0.5 * Math.sin(f * Math.PI)
		El(ctx, x + off(f), y - f * HGT, w * 0.95, w * 0.2, null, '#e8e2d6')
	}
	ctx.globalAlpha = k * 0.75
	El(ctx, x + off(1), y - HGT, 3.2, 1.0, '#5c5f68')
	El(ctx, x + off(1) - 1.4, y - HGT + 0.2, 1.8, 0.7, '#6a6d75')
	El(ctx, x + off(1) + 1.5, y - HGT + 0.1, 1.9, 0.75, '#666972')
	ctx.globalAlpha = k
	ctx.fillStyle = '#4a3a2a'
	for (let i = 0; i < 16; i++) {
		const f = ((i * 0.37) % 1) * 0.7, a = t * 6 + i * 0.52, w = wid(f) + 0.3
		ctx.fillRect(x + off(f) + Math.cos(a) * w, y - f * HGT + Math.sin(a) * w * 0.25, 0.08, 0.08)
	}
	ctx.globalAlpha = 1
}

function drawMeteor(ctx: Ctx, e: ActiveEvent) {
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
}

function drawSwarm(ctx: Ctx, x: number, y: number, t: number) {
	ctx.fillStyle = 'rgba(40,35,20,0.85)'
	for (let i = 0; i < 140; i++) {
		const a = i * 2.39996 + t * (1 + (i % 5) * 0.3)
		const r = 0.4 + ((i * 0.618) % 1) * 2.6
		ctx.fillRect(x + Math.cos(a) * r, y - 1 + Math.sin(a * 1.3) * r * 0.5, 0.05, 0.035)
	}
}

function drawBunting(ctx: Ctx, t: number) {
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

const STAGE_L = { x: CX - 3.2, y: CY - 2.0 }, STAGE_R = { x: CX + 3.2, y: CY - 2.0 }
function drawStage(ctx: Ctx) {
	ctx.lineWidth = 0.03
	// speaker stacks
	for (const dx of [-0.35, 0.35]) {
		for (let k = 0; k < 3; k++) {
			const y = STAGE_L.y - k * 0.55
			Rc(ctx, STAGE_L.x + dx - 0.25, y - 0.55, 0.5, 0.55, '#18181c', OUT)
			El(ctx, STAGE_L.x + dx, y - 0.25, 0.15, 0.15, '#3a3a44')
		}
	}
	// lighting truss
	for (const dx of [-0.7, 0.7]) Ln(ctx, STAGE_R.x + dx, STAGE_R.y, STAGE_R.x + dx, STAGE_R.y - 2.4, '#c8ccd2', 0.06)
	Ln(ctx, STAGE_R.x - 0.9, STAGE_R.y - 2.4, STAGE_R.x + 0.9, STAGE_R.y - 2.4, '#c8ccd2', 0.07)
	for (const dx of [-0.55, 0, 0.55]) Rc(ctx, STAGE_R.x + dx - 0.12, STAGE_R.y - 2.38, 0.24, 0.2, '#1a1a1e', OUT)
}

function drawDragon(ctx: Ctx, e: ActiveEvent, t: number) {
	const { x, y, dir } = e.d
	const flap = Math.sin(t * 6)
	ctx.globalAlpha = 0.3
	El(ctx, x, y + 3.5, 1.4, 0.35, '#000')
	ctx.globalAlpha = 1
	ctx.lineWidth = 0.04
	// wings
	for (const s of [-1, 1]) Pl(ctx, [x - 0.3 * dir, y, x + 0.3 * dir, y, x + 0.1 * dir + s * 0.2, y - 1.1 * flap * s - 0.4, x - 0.9 * dir, y - 0.7 * flap * s - 0.2], s > 0 ? '#9c2a22' : '#7a1f1a', OUT)
	// body, tail, neck, head
	El(ctx, x, y, 0.75, 0.28, '#b4342a', OUT)
	Pl(ctx, [x - 0.6 * dir, y - 0.1, x - 1.6 * dir, y + 0.25 + Math.sin(t * 3) * 0.15, x - 0.6 * dir, y + 0.1], '#b4342a', OUT)
	Pl(ctx, [x + 0.5 * dir, y - 0.15, x + 1.0 * dir, y - 0.55, x + 1.1 * dir, y - 0.35, x + 0.6 * dir, y + 0.05], '#b4342a', OUT)
	El(ctx, x + 1.15 * dir, y - 0.5, 0.22, 0.14, '#c43c30', OUT)
	El(ctx, x + 1.22 * dir, y - 0.55, 0.03, 0.03, '#ffe58a')
	Pl(ctx, [x + 1.0 * dir, y - 0.62, x + 0.9 * dir, y - 0.82, x + 1.1 * dir, y - 0.64], '#e8d2a0')
}

function drawUfo(ctx: Ctx, e: ActiveEvent, t: number) {
	const d = e.d
	ctx.globalAlpha = 0.3
	El(ctx, d.x, d.ty + 0.1, 1.0, 0.25, '#000')
	ctx.globalAlpha = 1
	if (d.villager?.abducted) {
		// the abductee floats up in the beam
		ctx.globalAlpha = 1 - d.lift * 0.6
		El(ctx, d.tx, d.ty - d.lift * 2.6 - 0.3, 0.08, 0.18, '#e0862f')
		El(ctx, d.tx, d.ty - d.lift * 2.6 - 0.55, 0.07, 0.07, '#f1c9a5')
		ctx.globalAlpha = 1
	}
	if (d.sheep && !d.sheep.gone) El(ctx, d.tx, d.ty - d.lift * 2.6 - 0.2, 0.18, 0.12, '#f3efe6')
	ctx.lineWidth = 0.03
	El(ctx, d.x, d.y, 1.1, 0.3, '#9aa3ad', OUT)
	El(ctx, d.x, d.y - 0.05, 0.9, 0.18, '#c8d0da')
	El(ctx, d.x, d.y - 0.25, 0.45, 0.3, 'rgba(160,240,255,0.85)', OUT)
	for (let i = 0; i < 6; i++) {
		const on = Math.floor(t * 6 + i) % 2 === 0
		El(ctx, d.x - 0.85 + i * 0.34, d.y + 0.08, 0.05, 0.04, on ? '#9dff7f' : '#3a5a3a')
	}
}

function drawPlane(ctx: Ctx, p: { x: number; y: number; dir: number; alt: number }, t: number) {
	const x = p.x, y = p.y - p.alt
	ctx.globalAlpha = 0.25
	El(ctx, p.x + p.alt * 0.3, p.y, 0.8, 0.18, '#000')
	ctx.globalAlpha = 1
	ctx.lineWidth = 0.03
	const scifi = has('hovercars')
	const body = scifi ? '#e8eef4' : '#f2f2f2'
	El(ctx, x, y, 0.9, 0.16, body, OUT)
	Pl(ctx, [x - 0.1, y, x + 0.25 * p.dir, y, x - 0.15 * p.dir, y + 0.75, x - 0.4 * p.dir, y + 0.75], scifi ? '#c8d0da' : '#d8dde2', OUT)
	Pl(ctx, [x - 0.75 * p.dir, y - 0.05, x - 0.95 * p.dir, y - 0.45, x - 0.85 * p.dir, y - 0.05], scifi ? '#7ff6ff' : '#c8442f', OUT)
	for (let i = 0; i < 4; i++) El(ctx, x + (0.1 + i * 0.15) * p.dir, y - 0.03, 0.03, 0.03, '#5d8fb0')
	if (Math.floor(t * 2) % 2) El(ctx, x - 0.15 * p.dir, y + 0.75, 0.04, 0.04, '#ff3b3b')
}

// ======================================================================
// Additive light shows (drawn after the lighting pass so they glow)
// ======================================================================
const BEAMS = ['#ff4fd8', '#4fd8ff', '#fff36b', '#7dff6b', '#ff7a3d', '#ffffff']

function beam(ctx: Ctx, x: number, y: number, ang: number, len: number, spread: number, col: string, a: number) {
	const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len
	const g = ctx.createLinearGradient(x, y, ex, ey)
	g.addColorStop(0, col)
	g.addColorStop(1, 'rgba(0,0,0,0)')
	ctx.globalAlpha = a
	ctx.fillStyle = g
	ctx.beginPath()
	ctx.moveTo(x, y)
	ctx.lineTo(x + Math.cos(ang - spread) * len, y + Math.sin(ang - spread) * len)
	ctx.lineTo(x + Math.cos(ang + spread) * len, y + Math.sin(ang + spread) * len)
	ctx.closePath()
	ctx.fill()
}

export function drawGlowFX(ctx: Ctx, time: number) {
	const S = G.S
	const night = nightAmount()
	const e = S.event
	const raid = e?.type === 'raid'
	const style = rivalStyle()
	ctx.globalCompositeOperation = 'lighter'
	// rival shows
	for (const r of S.rivals) {
		const tower = r.buildings.find((b) => b.tower)
		if (!tower) continue
		const k = Math.max(night, raid ? 0.45 : 0, e?.type === 'concert' ? 0.4 : 0) * (tower.hp < 0.6 ? 0.3 : 1)
		if (k < 0.05) continue
		const em = towerEmitters(r.id, style)
		if (r.id === 'lights') {
			if (style === 0) continue // a beacon fire, lit by the lighting pass
			em.forEach(([ex, ey], i) => {
				const ang = -Math.PI / 2 + Math.sin(time * 0.6 + i * 1.3) * 0.9
				const col = style === 1 ? '#fff7dc' : BEAMS[(Math.floor(time / 4) + i) % BEAMS.length]
				beam(ctx, tower.x + ex, tower.y + ey, ang, style === 1 ? 16 : 12, style === 1 ? 0.07 : 0.05, col, 0.35 * k)
			})
		} else {
			const [ex, ey] = em[0]
			ctx.lineWidth = 0.12
			for (let i = 0; i < 3; i++) {
				const f = (time * 0.7 + i / 3) % 1
				ctx.globalAlpha = (1 - f) * 0.55 * k
				El(ctx, tower.x + ex, tower.y + ey, 0.5 + f * 5, (0.5 + f * 5) * 0.55, null, '#a99bff')
			}
		}
	}
	// raid fire glows at night
	if (night > 0.1)
		for (const sh of shots) {
			const f = sh.t / sh.dur
			ctx.globalAlpha = night * (1 - f) * 0.8
			if (sh.kind === 'beam') Ln(ctx, sh.x, sh.y, sh.tx, sh.ty, sh.col, 0.22)
			else El(ctx, sh.x + (sh.tx - sh.x) * f, sh.y + (sh.ty - sh.y) * f, 0.35, 0.35, sh.col)
		}
	if (e?.type === 'concert') {
		for (let i = 0; i < 3; i++) {
			const ang = -Math.PI / 2 + Math.sin(time * 1.1 + i * 2) * 1.1
			beam(ctx, STAGE_R.x - 0.55 + i * 0.55, STAGE_R.y - 2.2, ang + Math.PI * 0.1, 9, 0.06, BEAMS[(Math.floor(time * 2) + i) % BEAMS.length], 0.45)
		}
		ctx.lineWidth = 0.1
		for (let i = 0; i < 3; i++) {
			const f = (time * 1.4 + i / 3) % 1
			ctx.globalAlpha = (1 - f) * 0.6
			El(ctx, STAGE_L.x, STAGE_L.y - 0.8, 0.5 + f * 4, (0.5 + f * 4) * 0.5, null, '#a99bff')
		}
	}
	if (e?.type === 'ufo' && e.d.beam) {
		const d = e.d
		const g = ctx.createLinearGradient(d.x, d.y, d.x, d.ty)
		g.addColorStop(0, 'rgba(157,255,127,0.55)')
		g.addColorStop(1, 'rgba(157,255,127,0.15)')
		ctx.globalAlpha = 1
		ctx.fillStyle = g
		ctx.beginPath()
		ctx.moveTo(d.x - 0.3, d.y + 0.2)
		ctx.lineTo(d.x + 0.3, d.y + 0.2)
		ctx.lineTo(d.tx + 0.9, d.ty + 0.2)
		ctx.lineTo(d.tx - 0.9, d.ty + 0.2)
		ctx.closePath()
		ctx.fill()
	}
	// teleporter and fusion glows
	for (const b of S.buildings) {
		if (!b.done) continue
		if (b.type === 'teleporter') {
			const p = 0.5 + Math.sin(time * 3 + b.id) * 0.3
			ctx.globalAlpha = p * 0.6
			const g = ctx.createLinearGradient(0, b.oy + 1.6, 0, b.oy + 0.3)
			g.addColorStop(0, 'rgba(196,139,255,0.9)')
			g.addColorStop(1, 'rgba(196,139,255,0)')
			ctx.fillStyle = g
			ctx.fillRect(b.ox + 0.45, b.oy + 0.4, 1.1, 1.2)
		} else if (b.type === 'fusion') {
			ctx.globalAlpha = 0.35 + Math.sin(time * 2.5) * 0.15
			ctx.lineWidth = 0.12
			El(ctx, b.ox + 1, b.oy + 0.95, 0.72, 0.17, null, '#8fe8ff')
		}
	}
	ctx.globalAlpha = 1
	ctx.globalCompositeOperation = 'source-over'
}

// ======================================================================
// Screen-space weather & sky
// ======================================================================
const drops: { x: number; y: number; l: number }[] = []
const flakes: { x: number; y: number; r: number; p: number }[] = []

export function drawScreenFX(ctx: Ctx, cw: number, ch: number, rdt: number, time: number) {
	const e = G.S.event
	const tw = twilight() * (1 - nightAmount())
	if (tw > 0.02) {
		ctx.fillStyle = `rgba(255,130,50,${(tw * 0.13).toFixed(3)})`
		ctx.fillRect(0, 0, cw, ch)
	}
	if (fx.dark > 0.005) {
		ctx.fillStyle = `rgba(18,24,40,${fx.dark.toFixed(3)})`
		ctx.fillRect(0, 0, cw, ch)
	}
	if (fx.tint > 0.005) {
		ctx.fillStyle = `rgba(100,150,40,${fx.tint.toFixed(3)})`
		ctx.fillRect(0, 0, cw, ch)
	}
	if (fx.flare > 0.005) {
		ctx.fillStyle = `rgba(255,150,60,${clamp(fx.flare, 0, 0.5).toFixed(3)})`
		ctx.fillRect(0, 0, cw, ch)
	}
	if (e?.type === 'aurora') drawAurora(ctx, cw, ch, time, Math.min(1, e.t / 4, (e.dur - e.t) / 4))
	if (e?.type === 'comet') drawComet(ctx, cw, ch, e.t / e.dur)
	if (fx.rain > 0.02) drawRain(ctx, cw, ch, rdt)
	if (fx.snow > 0.02) drawSnow(ctx, cw, ch, rdt, time)
	if (fx.flash > 0.01) {
		ctx.fillStyle = `rgba(235,240,255,${(fx.flash * 0.55).toFixed(3)})`
		ctx.fillRect(0, 0, cw, ch)
	}
}

function drawRain(ctx: Ctx, cw: number, ch: number, rdt: number) {
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

function drawSnow(ctx: Ctx, cw: number, ch: number, rdt: number, time: number) {
	ctx.fillStyle = `rgba(235,242,255,${(fx.snow * 0.28).toFixed(3)})`
	ctx.fillRect(0, 0, cw, ch)
	const target = Math.floor(320 * fx.snow)
	while (flakes.length < target) flakes.push({ x: Math.random() * cw, y: Math.random() * ch, r: 1 + Math.random() * 2.2, p: Math.random() * 6 })
	flakes.length = Math.min(flakes.length, target)
	ctx.fillStyle = 'rgba(255,255,255,0.9)'
	ctx.beginPath()
	for (const f of flakes) {
		f.y += rdt * (40 + f.r * 25)
		f.x += Math.sin(time + f.p) * rdt * 25 - rdt * 30
		if (f.y > ch) {
			f.y = -5
			f.x = Math.random() * cw
		}
		if (f.x < -5) f.x = cw + 5
		ctx.moveTo(f.x + f.r, f.y)
		ctx.arc(f.x, f.y, f.r, 0, 7)
	}
	ctx.fill()
}

function drawAurora(ctx: Ctx, cw: number, ch: number, t: number, k: number) {
	ctx.globalCompositeOperation = 'lighter'
	const cols = [[90, 255, 160], [140, 110, 255], [70, 220, 255]]
	cols.forEach(([r, g, b], i) => {
		const base = ch * (0.12 + i * 0.08)
		const grd = ctx.createLinearGradient(0, base - 60, 0, base + 120)
		grd.addColorStop(0, `rgba(${r},${g},${b},0)`)
		grd.addColorStop(0.4, `rgba(${r},${g},${b},${(0.22 * k).toFixed(3)})`)
		grd.addColorStop(1, `rgba(${r},${g},${b},0)`)
		ctx.fillStyle = grd
		ctx.beginPath()
		ctx.moveTo(0, base + 120)
		for (let x = 0; x <= cw; x += 30) ctx.lineTo(x, base + Math.sin(x * 0.006 + t * 0.5 + i * 2) * 40 + Math.sin(x * 0.017 - t * 0.8) * 15)
		ctx.lineTo(cw, base + 120)
		ctx.closePath()
		ctx.fill()
	})
	ctx.globalCompositeOperation = 'source-over'
}

function drawComet(ctx: Ctx, cw: number, ch: number, f: number) {
	const x = -100 + (cw + 300) * f, y = ch * 0.12 + f * ch * 0.18
	const tx = x - 260, ty = y - 60
	ctx.globalCompositeOperation = 'lighter'
	const g = ctx.createLinearGradient(x, y, tx, ty)
	g.addColorStop(0, 'rgba(220,240,255,0.95)')
	g.addColorStop(1, 'rgba(120,180,255,0)')
	ctx.strokeStyle = g
	ctx.lineWidth = 10
	ctx.lineCap = 'round'
	ctx.beginPath()
	ctx.moveTo(x, y)
	ctx.lineTo(tx, ty)
	ctx.stroke()
	ctx.fillStyle = '#ffffff'
	ctx.beginPath()
	ctx.arc(x, y, 6, 0, 7)
	ctx.fill()
	ctx.globalCompositeOperation = 'source-over'
}

