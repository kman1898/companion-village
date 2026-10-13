import { clamp } from '../core/util'
import { eventFocus } from '../game/events'
import { CX, CY, G, H, W } from '../game/state'

export const FOLLOW_TIMEOUT = 60_000
export const MIN_SCALE = 6
export const MAX_SCALE = 110

/** x, y = view centre in tiles; s = pixels per tile. t* = where the camera is heading. */
export const cam = {
	x: CX, y: CY, s: 40,
	tx: CX, ty: CY, ts: 40,
	follow: true,
	lastInput: 0,
	vw: 1, vh: 1,
}

export function setViewport(w: number, h: number) {
	cam.vw = w
	cam.vh = h
}

export function screenToWorld(px: number, py: number) {
	return { x: cam.x + (px - cam.vw / 2) / cam.s, y: cam.y + (py - cam.vh / 2) / cam.s }
}
export function worldToScreen(x: number, y: number) {
	return { x: (x - cam.x) * cam.s + cam.vw / 2, y: (y - cam.y) * cam.s + cam.vh / 2 }
}

/** Switch to free camera (keeps the current view as the starting point) */
export function touch() {
	if (cam.follow) {
		cam.follow = false
		cam.tx = cam.x
		cam.ty = cam.y
		cam.ts = cam.s
	}
	cam.lastInput = performance.now()
}

export function followNow() {
	cam.follow = true
}

export function panBy(dxPx: number, dyPx: number) {
	touch()
	cam.tx -= dxPx / cam.ts
	cam.ty -= dyPx / cam.ts
	clampTarget()
}

/** Zoom by factor f keeping the world point under (px, py) fixed */
export function zoomAt(px: number, py: number, f: number) {
	touch()
	const wx = cam.tx + (px - cam.vw / 2) / cam.ts, wy = cam.ty + (py - cam.vh / 2) / cam.ts
	cam.ts = clamp(cam.ts * f, MIN_SCALE, MAX_SCALE)
	cam.tx = wx - (px - cam.vw / 2) / cam.ts
	cam.ty = wy - (py - cam.vh / 2) / cam.ts
	clampTarget()
}

function clampTarget() {
	cam.tx = clamp(cam.tx, 0, W)
	cam.ty = clamp(cam.ty, 0, H)
}

/** Frame the built-up area plus villagers working nearby */
function followTarget() {
	let x0 = CX - 9, x1 = CX + 9, y0 = CY - 6, y1 = CY + 6
	for (const b of G.S.buildings) {
		x0 = Math.min(x0, b.ox - 3); x1 = Math.max(x1, b.ox + 5)
		y0 = Math.min(y0, b.oy - 4); y1 = Math.max(y1, b.oy + 4)
		if (b.field) {
			x0 = Math.min(x0, b.field.ox - 3); x1 = Math.max(x1, b.field.ox + 5)
			y0 = Math.min(y0, b.field.oy - 3); y1 = Math.max(y1, b.field.oy + 4)
		}
	}
	const bx0 = x0 - 5, bx1 = x1 + 5, by0 = y0 - 4, by1 = y1 + 4
	for (const v of G.S.villagers) {
		if (v.x < bx0 || v.x > bx1 || v.y < by0 || v.y > by1) continue
		x0 = Math.min(x0, v.x - 1.5); x1 = Math.max(x1, v.x + 1.5)
		y0 = Math.min(y0, v.y - 2); y1 = Math.max(y1, v.y + 1)
	}
	x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1)
	const padTop = 80 / Math.max(cam.s, 8)
	return {
		x: (x0 + x1) / 2,
		y: (y0 + y1) / 2 - padTop * 0.3,
		s: clamp(Math.min(cam.vw / (x1 - x0), cam.vh / (y1 - y0 + padTop)), 7, 62),
	}
}

export function updateCamera(dt: number) {
	if (!cam.follow && performance.now() - cam.lastInput > FOLLOW_TIMEOUT) cam.follow = true
	let tx: number, ty: number, ts: number, k: number
	if (cam.follow) {
		const t = eventFocus() || followTarget()
		tx = t.x
		ty = t.y
		ts = t.s
		k = 1 - Math.exp(-dt * 0.9)
	} else {
		tx = cam.tx
		ty = cam.ty
		ts = cam.ts
		k = 1 - Math.exp(-dt * 14)
	}
	cam.x += (tx - cam.x) * k
	cam.y += (ty - cam.y) * k
	cam.s = Math.exp(Math.log(cam.s) + (Math.log(ts) - Math.log(cam.s)) * k)
}

export function followSecondsLeft() {
	return Math.max(0, Math.ceil((FOLLOW_TIMEOUT - (performance.now() - cam.lastInput)) / 1000))
}
