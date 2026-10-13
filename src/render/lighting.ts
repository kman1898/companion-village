import { B } from '../data/buildings'
import { agents } from '../game/agents'
import { nightAmount } from '../game/daynight'
import { fx } from '../game/events'
import { RIVAL_INFO } from '../game/rivals'
import { CX, CY, G, has, RAIL_Y, W } from '../game/state'
import { cars, rockets, train } from '../game/traffic'
import { cam } from '../view/camera'
import { canvas, type Ctx } from './draw'

/** Darkness at the moment: night, or an eclipse */
export const darkness = () => Math.max(nightAmount() * 0.92, fx.eclipse)

/** 0 none · 1 gas lamps · 2 electric · 3 neon */
export function lampStyle() {
	if (has('hovercars') || has('antigravity')) return 3
	if (has('electricity')) return 2
	if (has('gasLighting')) return 1
	return 0
}

/** Street lamps stand on the road corners around buildings */
let lampKey = ''
let lampList: { x: number; y: number }[] = []
export function lamps() {
	const key = G.roads.size + ':' + G.S.buildings.length
	if (key !== lampKey) {
		lampKey = key
		const seen = new Set<number>()
		lampList = []
		for (const b of G.S.buildings) {
			for (const [x, y] of [[b.ox - 1, b.oy - 1], [b.ox + 2, b.oy + 2]]) {
				const i = y * W + x
				if (seen.has(i) || !G.roads.has(i)) continue
				seen.add(i)
				lampList.push({ x: x + 0.82, y: y + 0.85 })
			}
		}
	}
	return lampList
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

function collectLights(time: number): Light[] {
	const S = G.S
	const L: Light[] = []
	const flick = (k: number) => 0.9 + Math.sin(time * 9 + k) * 0.06 + Math.sin(time * 23 + k * 3) * 0.04
	L.push({ x: CX, y: CY - 0.2, r: 4.6, a: flick(1), col: '#ff9a3d' })
	const style = lampStyle()
	const electric = !fx.blackout
	if (style < 2) for (const [dx, dy] of [[-2.1, -2.1], [2.1, -2.1], [-2.1, 2.1], [2.1, 2.1]]) L.push({ x: CX + dx, y: CY + dy, r: 1.8, a: flick(dx + dy), col: '#ffb347' })
	// late at night fewer windows are lit
	const lateness = S.dayTime > 0.6 || S.dayTime < 0.04 ? 0.85 : 0.45
	for (const b of S.buildings) {
		if (b.fire) L.push({ x: b.ox + 1, y: b.oy + 1, r: 4.5, a: flick(b.id), col: '#ff7a2a' })
		const def = B[b.type]
		if (!b.done || !def.light) continue
		const powered = (def.era || 0) < 2 || electric
		if (!powered) continue
		if (def.cap && ((b.id * 37) % 100) / 100 > lateness) continue
		const tall = b.type === 'skyscraper' || b.type === 'arcology'
		L.push({ x: b.ox + 1, y: b.oy + (tall ? 0.2 : 1.3), r: tall ? 4.5 : 2.3, a: 0.9, col: def.light })
	}
	if (style && electric) {
		const r = style === 1 ? 2.4 : 3.2, col = style === 1 ? '#ffcf7a' : style === 2 ? '#fff1c9' : '#7ff6ff'
		lamps().forEach((l, i) => L.push({ x: l.x, y: l.y - 0.6, r, a: 0.95, col: style === 3 && i % 3 === 0 ? '#ff7ff0' : col }))
	}
	// lanterns carried by villagers out at night (medieval & industrial)
	if (style < 2) {
		let n = 0
		for (const v of S.villagers) {
			if (v.inside || n > 60) continue
			n++
			L.push({ x: v.x, y: v.y - 0.3, r: 1.2, a: 0.7, col: '#ffcf7a' })
		}
	}
	for (const c of cars) L.push({ x: c.x, y: c.y, r: 1.5, a: 0.6, col: has('hovercars') ? '#7ff6ff' : '#fff7dc' })
	if (train.active) L.push({ x: train.x, y: RAIL_Y - 0.3, r: 2.4, a: 0.8, col: '#fff1c9' })
	for (const r of rockets) L.push({ x: r.x, y: r.y - r.alt + 0.4, r: r.big ? 9 : 6, a: 1, col: '#ffb347' })
	// rival villages
	for (const rv of S.rivals) {
		const col = RIVAL_INFO[rv.id].accent
		for (const b of rv.buildings) L.push({ x: b.x, y: b.y - (b.tower ? 2 : 0.6), r: b.tower ? 4 : 1.8, a: b.hp < 0.6 ? 0.35 : 0.85, col })
	}
	for (const a of agents) {
		if (a.kind === 'crew') L.push({ x: a.x, y: a.y - 0.4, r: 1.0, a: 0.65, col: a.team === 'lights' ? '#fff3c8' : '#a99bff' })
		else if (a.kind === 'militia') L.push({ x: a.x, y: a.y - 0.4, r: 1.0, a: 0.6, col: '#ffcf7a' })
	}
	const e = S.event
	if (e?.type === 'meteor' && !e.d.hit) {
		const f = Math.min(1, e.t / 2.2) ** 2
		L.push({ x: e.d.sx + (e.d.tx - e.d.sx) * f, y: e.d.sy + (e.d.ty - e.d.sy) * f, r: 6, a: 1, col: '#ffcf7a' })
	}
	if (e?.type === 'ufo') L.push({ x: e.d.x, y: e.d.y, r: 3, a: 0.9, col: '#9dff7f' })
	if (e?.type === 'ufo' && e.d.beam) L.push({ x: e.d.tx, y: e.d.ty, r: 3, a: 0.9, col: '#9dff7f' })
	if (e?.type === 'dragon' && e.d.breath) L.push({ x: e.d.x + e.d.dir * 1.8, y: e.d.y + 2.5, r: 4, a: 1, col: '#ff7a2a' })
	if (e?.type === 'concert' || e?.type === 'festival' || e?.type === 'wedding') L.push({ x: CX, y: CY - 1, r: 6, a: 0.8, col: '#ffcf7a' })
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
	const lights = collectLights(time)
	const s = cam.s
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
	// coloured glow
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
