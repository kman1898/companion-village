import { B } from '../data/buildings'
import { TRIBES } from '../data/tribes'
import { agents } from '../game/agents'
import { nightAmount } from '../game/daynight'
import { fx } from '../game/events'
import { G, has, RAIL_Y, W, type Tribe } from '../game/state'
import { cars, rockets, train } from '../game/traffic'
import { cam } from '../view/camera'
import { canvas, type Ctx } from './draw'

/** Darkness at the moment: night, or an eclipse */
export const darkness = () => Math.max(nightAmount() * 0.92, fx.eclipse)

/** 0 none · 1 gas lamps / lanterns · 2 electric · 3 neon */
export function lampStyle(T: Tribe) {
	if (has(T, 'hovercars') || has(T, 'antigravity')) return 3
	if (has(T, 'electricity')) return 2
	if (has(T, 'gasLighting') || has(T, 'lanterns')) return 1
	return 0
}

/** Street lamps stand on road corners around each tribe's buildings */
const lampCache = new Map<string, { key: string; list: { x: number; y: number }[] }>()
export function lamps(T: Tribe) {
	const key = G.roadsVersion + ':' + T.buildings.length
	const hit = lampCache.get(T.id)
	if (hit && hit.key === key) return hit.list
	const seen = new Set<number>()
	const list: { x: number; y: number }[] = []
	for (const b of T.buildings) {
		for (const [x, y] of [[b.ox - 1, b.oy - 1], [b.ox + 2, b.oy + 2]]) {
			const i = y * W + x
			if (seen.has(i) || !G.roads.has(i)) continue
			seen.add(i)
			list.push({ x: x + 0.82, y: y + 0.85 })
		}
	}
	lampCache.set(T.id, { key, list })
	return list
}

interface Light { x: number; y: number; r: number; a: number; col?: string }

let lm: HTMLCanvasElement | null = null
let lmg: Ctx | null = null
let lightSprite: HTMLCanvasElement | null = null
const glowCache = new Map<string, HTMLCanvasElement>()
const LM_SCALE = 0.25

function radial(col: string) {
	const [c, g] = canvas(64, 64)
	const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
	gr.addColorStop(0, col)
	gr.addColorStop(0.35, col.replace(/[\d.]+\)$/, '0.55)'))
	gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'))
	g.fillStyle = gr
	g.fillRect(0, 0, 64, 64)
	return c
}
function glow(hex: string) {
	let c = glowCache.get(hex)
	if (!c) {
		const n = parseInt(hex.slice(1), 16)
		c = radial(`rgba(${n >> 16},${(n >> 8) & 255},${n & 255},1)`)
		glowCache.set(hex, c)
	}
	return c
}

function collectLights(time: number, vx0: number, vx1: number, vy0: number, vy1: number): Light[] {
	const S = G.S
	const L: Light[] = []
	const flick = (k: number) => 0.9 + Math.sin(time * 9 + k) * 0.06 + Math.sin(time * 23 + k * 3) * 0.04
	const near = (x: number, y: number, m = 8) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m
	const lateness = S.dayTime > 0.6 || S.dayTime < 0.04 ? 0.85 : 0.45
	for (const T of S.tribes) {
		const vb = { x: T.cx, y: T.cy }
		if (!near(vb.x, vb.y, 60)) continue
		const electric = !fx.blackout.has(T.id)
		const style = lampStyle(T)
		L.push({ x: T.cx, y: T.cy - 0.2, r: 4.6, a: flick(1), col: '#ff9a3d' })
		if (style < 2) for (const [dx, dy] of [[-2.1, -2.1], [2.1, -2.1], [-2.1, 2.1], [2.1, 2.1]]) L.push({ x: T.cx + dx, y: T.cy + dy, r: 1.8, a: flick(dx + dy), col: '#ffb347' })
		for (const b of T.buildings) {
			if (!near(b.ox, b.oy)) continue
			if (b.fire) L.push({ x: b.ox + 1, y: b.oy + 1, r: 4.5, a: flick(b.id), col: '#ff7a2a' })
			const def = B[b.type]
			if (!b.done || !def.light) continue
			if ((def.era || 0) >= 2 && !electric) continue
			if (def.cap && ((b.id * 37) % 100) / 100 > lateness) continue
			const tall = b.type === 'skyscraper' || b.type === 'arcology' || b.type === 'landmark'
			L.push({ x: b.ox + 1, y: b.oy + (tall ? 0.2 : 1.3), r: tall ? 4.5 : 2.3, a: 0.9, col: b.type === 'landmark' ? TRIBES[T.id].color : def.light })
		}
		if (style && electric) {
			const r = style === 1 ? 2.4 : 3.2, col = style === 1 ? '#ffcf7a' : style === 2 ? '#fff1c9' : TRIBES[T.id].color
			lamps(T).forEach((l, i) => {
				if (near(l.x, l.y)) L.push({ x: l.x, y: l.y - 0.6, r, a: 0.95, col: style === 3 && i % 3 === 0 ? TRIBES[T.id].accent : col })
			})
		}
		if (style < 2) {
			let n = 0
			for (const v of T.villagers) {
				if (v.inside || v.away || n > 40 || !near(v.x, v.y, 2)) continue
				n++
				L.push({ x: v.x, y: v.y - 0.3, r: 1.2, a: 0.7, col: '#ffcf7a' })
			}
		}
	}
	for (const c of cars) if (near(c.x, c.y)) L.push({ x: c.x, y: c.y, r: 1.5, a: 0.6, col: c.hover ? '#7ff6ff' : '#fff7dc' })
	if (train.active) L.push({ x: train.x, y: RAIL_Y - 0.3, r: 2.4, a: 0.8, col: '#fff1c9' })
	for (const r of rockets) L.push({ x: r.x, y: r.y - r.alt + 0.4, r: r.big ? 9 : 6, a: 1, col: '#ffb347' })
	for (const a of agents) {
		if (!near(a.x, a.y, 2)) continue
		if (a.kind === 'soldier' || a.kind === 'caravan') L.push({ x: a.x, y: a.y - 0.4, r: 1.1, a: 0.65, col: a.team !== 'none' ? TRIBES[a.team].color : '#ffcf7a' })
		else if (a.kind === 'siege' && (a.level ?? 0) >= 3) L.push({ x: a.x, y: a.y - 0.8, r: 2, a: 0.8, col: '#7ff6ff' })
	}
	for (const e of S.events) {
		if (e.type === 'meteor' && !e.d.hit) {
			const f = Math.min(1, e.t / 2.2) ** 2
			L.push({ x: e.d.sx + (e.d.tx - e.d.sx) * f, y: e.d.sy + (e.d.ty - e.d.sy) * f, r: 6, a: 1, col: '#ffcf7a' })
		}
		if (e.type === 'ufo') L.push({ x: e.d.x, y: e.d.y, r: 3, a: 0.9, col: '#9dff7f' })
		if (e.type === 'dragon' && e.d.breath) L.push({ x: e.d.x + e.d.dir * 1.8, y: e.d.y + 2.5, r: 4, a: 1, col: '#ff7a2a' })
		if (e.type === 'forestFire') for (const b of e.d.burning || []) L.push({ x: b.t.x, y: b.t.y - 0.6, r: 3.2, a: flick(b.t.x), col: '#ff7a2a' })
		if ((e.type === 'festival' || e.type === 'wedding') && e.tribe) {
			const T = S.tribes.find((t) => t.id === e.tribe)!
			L.push({ x: T.cx, y: T.cy - 1, r: 6, a: 0.8, col: '#ffcf7a' })
		}
	}
	return L
}

/** Darken the scene, cutting holes for every light, then add a coloured glow on top */
export function renderLighting(ctx: Ctx, rs: number, cw: number, ch: number, time: number) {
	const dk = darkness()
	if (dk < 0.02) return
	const w = Math.ceil(cw * LM_SCALE), h = Math.ceil(ch * LM_SCALE)
	if (!lm || lm.width !== w || lm.height !== h) {
		;[lm, lmg] = canvas(w, h)
		lightSprite = radial('rgba(255,255,255,1)')
	}
	const g = lmg!
	g.globalCompositeOperation = 'source-over'
	g.clearRect(0, 0, w, h)
	g.fillStyle = `rgba(6,10,32,${(dk * 0.84).toFixed(3)})`
	g.fillRect(0, 0, w, h)
	g.globalCompositeOperation = 'destination-out'
	const s = cam.s
	const vx0 = cam.x - cw / 2 / s, vx1 = cam.x + cw / 2 / s, vy0 = cam.y - ch / 2 / s, vy1 = cam.y + ch / 2 / s
	const lights = collectLights(time, vx0, vx1, vy0, vy1)
	const toX = (x: number) => (x - cam.x) * s + cw / 2, toY = (y: number) => (y - cam.y) * s + ch / 2
	for (const l of lights) {
		const R = l.r * s
		const X = toX(l.x), Y = toY(l.y)
		if (X + R < 0 || Y + R < 0 || X - R > cw || Y - R > ch) continue
		g.globalAlpha = l.a
		g.drawImage(lightSprite!, (X - R) * LM_SCALE, (Y - R) * LM_SCALE, 2 * R * LM_SCALE, 2 * R * LM_SCALE)
	}
	g.globalAlpha = 1
	g.globalCompositeOperation = 'source-over'
	ctx.setTransform(rs, 0, 0, rs, 0, 0)
	ctx.imageSmoothingEnabled = true
	ctx.drawImage(lm!, 0, 0, cw, ch)
	ctx.globalCompositeOperation = 'lighter'
	for (const l of lights) {
		if (!l.col) continue
		const R = l.r * s * 0.55
		const X = toX(l.x), Y = toY(l.y)
		if (X + R < 0 || Y + R < 0 || X - R > cw || Y - R > ch) continue
		ctx.globalAlpha = l.a * 0.3 * dk
		ctx.drawImage(glow(l.col), X - R, Y - R, 2 * R, 2 * R)
	}
	ctx.globalAlpha = 1
	ctx.globalCompositeOperation = 'source-over'
}

