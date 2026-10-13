import { shade } from '../core/util'
import { El, Ln, OUT, Pl, Rc, type Ctx } from './draw'
import { gable } from './art'

/*
 * Industrial, modern, space-age and sci-fi buildings. Same local units as art.ts:
 * the 2×2 footprint spans (0,0)–(2,2), the front edge is y≈1.9, art grows upwards.
 */

const glassLines = (c: Ctx, x0: number, x1: number, y0: number, y1: number, dy: number, dx: number) => {
	for (let y = y0 + dy; y < y1; y += dy) Ln(c, x0, y, x1, y, 'rgba(255,255,255,0.22)', 0.018)
	for (let x = x0 + dx; x < x1; x += dx) Ln(c, x, y0, x, y1, 'rgba(0,0,0,0.18)', 0.016)
}

export function townhouse(c: Ctx, v: number) {
	const brick = ['#9c4a32', '#8a3f2c', '#a85a3c', '#7f4a3a'][v % 4]
	const s = gable(c, { x: 0.12, w: 1.74, wh: 1.3, rh: 0.75, wall: brick, roof: ['#3f4651', '#4a3f45', '#2f4a4a'][v % 3], rows: 2, win: 3, stone: true, chim: true, ins: 0.2 })
	c.lineWidth = 0.035
	Rc(c, 0.3, -0.05, 0.12, 0.3, '#6d4a3a', OUT)
	Rc(c, 0.12, 1.12, 1.74, 0.05, '#e8e0d0')
	return s
}

export function modernhouse(c: Ctx, v: number) {
	const wall = ['#ecebe6', '#dfe3e6', '#e8e0d4', '#d6dde0'][v % 4]
	const clad = ['#6b4a32', '#3f4651', '#7a6a58', '#2f5a6b'][v % 4]
	c.lineWidth = 0.035
	Pl(c, [1.86, 1.88, 2.0, 1.76, 2.0, 0.66, 1.86, 0.78], shade(wall, -0.25), OUT)
	Rc(c, 0.14, 0.78, 1.72, 1.1, wall, OUT)
	Rc(c, 0.14, 0.78, 0.9, 0.5, clad, OUT)
	Rc(c, 1.1, 1.28, 0.66, 0.52, '#9fd0e6', OUT)
	Ln(c, 1.15, 1.75, 1.4, 1.33, 'rgba(255,255,255,0.5)', 0.03)
	Rc(c, 0.24, 1.36, 0.46, 0.3, '#9fd0e6', OUT)
	Rc(c, 1.12, 0.88, 0.66, 0.28, '#9fd0e6', OUT)
	Rc(c, 0.8, 1.5, 0.22, 0.38, '#4a4f55', OUT)
	Rc(c, 0.06, 0.66, 1.94, 0.14, '#5a5f66', OUT)
	Pl(c, [0.06, 0.66, 2.0, 0.66, 1.9, 0.5, 0.14, 0.5], '#8a8f96', OUT)
	if (v % 2) for (let k = 0; k < 3; k++) Pl(c, [0.3 + k * 0.42, 0.62, 0.66 + k * 0.42, 0.62, 0.62 + k * 0.42, 0.53, 0.34 + k * 0.42, 0.53], '#2c4a7a', 'rgba(150,190,255,0.6)')
	return null
}

export function habdome(c: Ctx, v: number) {
	const band = ['#ff7a3d', '#4fb3ff', '#7dd36b', '#ff4fd8'][v % 4]
	c.lineWidth = 0.035
	El(c, 1.85, 1.8, 0.3, 0.22, '#dfe6ec', OUT)
	El(c, 1, 1.78, 0.95, 0.2, '#b8c0c8', OUT)
	c.beginPath()
	c.ellipse(1, 1.75, 0.9, 1.0, 0, Math.PI, 0)
	c.closePath()
	c.fillStyle = '#eef2f6'
	c.fill()
	c.strokeStyle = OUT
	c.stroke()
	c.beginPath()
	c.ellipse(1, 1.75, 0.9, 1.0, 0, -Math.PI / 2, 0)
	c.lineTo(1, 1.75)
	c.closePath()
	c.fillStyle = 'rgba(0,0,0,0.08)'
	c.fill()
	Ln(c, 0.14, 1.42, 1.86, 1.42, band, 0.06)
	for (const [x, y] of [[0.55, 1.2], [1, 1.05], [1.45, 1.2]]) {
		El(c, x, y, 0.1, 0.1, '#2c3e57', OUT)
		El(c, x - 0.02, y - 0.02, 0.05, 0.05, '#bfe9ff')
	}
	c.beginPath()
	c.moveTo(0.85, 1.75)
	c.lineTo(0.85, 1.55)
	c.arc(1, 1.55, 0.15, Math.PI, 0)
	c.lineTo(1.15, 1.75)
	c.fillStyle = '#5a6170'
	c.fill()
	Ln(c, 1.45, 0.95, 1.62, 0.5, '#9aa3ad', 0.03)
	El(c, 1.62, 0.5, 0.05, 0.05, band)
	return null
}

export function skypod(c: Ctx, v: number) {
	const glow = ['#7ff6ff', '#ff7ff0', '#9dff7f'][v % 3]
	c.lineWidth = 0.035
	El(c, 1, 1.8, 0.62, 0.17, '#9aa3ad', OUT)
	Rc(c, 0.9, 0.3, 0.2, 1.5, '#c8d0da', OUT)
	El(c, 1, 0.48, 0.5, 0.09, 'rgba(127,246,255,0.55)')
	El(c, 1, 1.0, 0.62, 0.24, '#e8f0f8', OUT)
	El(c, 1, 1.02, 0.5, 0.07, glow)
	El(c, 1, 0.2, 0.88, 0.33, '#f2f6fb', OUT)
	El(c, 1, 0.12, 0.72, 0.16, '#dfe7ef')
	El(c, 1, 0.26, 0.74, 0.07, glow)
	Ln(c, 1, -0.12, 1, -0.55, '#c8d0da', 0.04)
	El(c, 1, -0.57, 0.05, 0.05, '#ff4fd8')
	return null
}

export function factory(c: Ctx): [number, number] {
	c.lineWidth = 0.035
	Rc(c, 1.55, -0.6, 0.18, 1.6, '#7a3f2e', OUT)
	Rc(c, 1.2, -0.3, 0.16, 1.3, '#7a3f2e', OUT)
	for (const [x, y] of [[1.55, -0.45], [1.55, -0.1], [1.2, -0.15]]) Rc(c, x, y, x === 1.2 ? 0.16 : 0.18, 0.06, '#e8e0d0')
	Rc(c, 0.05, 0.95, 1.9, 0.95, '#8a4a36', OUT)
	for (let y = 1.1; y < 1.9; y += 0.14) Ln(c, 0.05, y, 1.95, y, 'rgba(50,25,15,0.3)', 0.02)
	for (let k = 0; k < 5; k++) Rc(c, 0.15 + k * 0.36, 1.12, 0.22, 0.28, '#f3d27a', OUT)
	Rc(c, 0.78, 1.45, 0.44, 0.45, '#4a3a2e', OUT)
	for (let k = 0; k < 4; k++) Pl(c, [0.05 + k * 0.475, 0.95, 0.05 + (k + 1) * 0.475, 0.95, 0.05 + (k + 1) * 0.475, 0.58], '#4f5660', OUT)
	return [1.64, -0.66]
}

export function skyscraper(c: Ctx, v: number) {
	const glass = ['#5d8fb0', '#4f7a99', '#6aa3b8', '#557d8c'][v % 4]
	c.lineWidth = 0.035
	Pl(c, [1.65, 1.9, 1.85, 1.72, 1.85, -3.25, 1.65, -3.4], shade(glass, -0.35), OUT)
	Rc(c, 0.35, -3.4, 1.3, 5.3, glass, OUT)
	glassLines(c, 0.35, 1.65, -3.4, 1.9, 0.22, 0.18)
	Pl(c, [0.35, -2.2, 0.35, -1.4, 1.65, -3.2, 1.65, -3.4, 1.45, -3.4], 'rgba(255,255,255,0.14)')
	Rc(c, 0.3, -3.58, 1.4, 0.2, '#3f4651', OUT)
	Ln(c, 1.0, -3.58, 1.0, -4.25, '#9aa3ad', 0.04)
	El(c, 1.0, -4.27, 0.05, 0.05, '#ff3b3b')
	Rc(c, 0.78, 1.52, 0.44, 0.38, '#2f3a44', OUT)
	return null
}

export const TURBINES: [number, number][] = [[0.42, -0.62], [1.55, -0.95], [1.0, -0.05]]
export function windfarm(c: Ctx) {
	c.lineWidth = 0.03
	El(c, 1, 1.75, 0.95, 0.2, 'rgba(60,90,40,0.25)')
	const bases: [number, number][] = [[0.42, 1.3], [1.55, 1.05], [1.0, 1.85]]
	TURBINES.forEach(([x, top], i) => {
		const yb = bases[i][1]
		Pl(c, [x - 0.055, yb, x + 0.055, yb, x + 0.025, top, x - 0.025, top], '#eef1f4', OUT)
		Rc(c, x - 0.09, top - 0.06, 0.2, 0.1, '#dfe4e8', OUT)
	})
	return null
}

export function launchpad(c: Ctx) {
	c.lineWidth = 0.035
	El(c, 1, 1.62, 0.95, 0.3, '#9aa0a6', OUT)
	El(c, 1, 1.56, 0.55, 0.18, '#5f656b')
	Rc(c, 0.85, 1.5, 0.3, 0.3, '#2f3439')
	// gantry
	const gx = 1.42
	for (const x of [gx, gx + 0.24]) Ln(c, x, 1.55, x, -1.9, '#c8442f', 0.045)
	for (let y = 1.5; y > -1.9; y -= 0.3) {
		Ln(c, gx, y, gx + 0.24, y - 0.3, '#c8442f', 0.025)
		Ln(c, gx, y, gx + 0.24, y, '#c8442f', 0.025)
	}
	Ln(c, gx, -0.9, 1.15, -0.9, '#c8442f', 0.04)
	Ln(c, gx, 0.1, 1.15, 0.1, '#c8442f', 0.04)
	return null
}

/** Rocket standing on a launch pad (drawn live so it can leave) */
export function rocketShape(c: Ctx, x: number, y: number, big = false) {
	const k = big ? 1.6 : 1
	c.lineWidth = 0.03
	Pl(c, [x - 0.28 * k, y, x - 0.16 * k, y - 0.5 * k, x - 0.16 * k, y - 0.2 * k], '#c8442f', OUT)
	Pl(c, [x + 0.28 * k, y, x + 0.16 * k, y - 0.5 * k, x + 0.16 * k, y - 0.2 * k], '#c8442f', OUT)
	Rc(c, x - 0.16 * k, y - 2.3 * k, 0.32 * k, 2.3 * k, '#f4f5f7', OUT)
	Rc(c, x + 0.04 * k, y - 2.3 * k, 0.12 * k, 2.3 * k, 'rgba(0,0,0,0.08)')
	for (const yy of [0.5, 1.4]) Rc(c, x - 0.16 * k, y - yy * k, 0.32 * k, 0.12 * k, '#2c2f35')
	Pl(c, [x - 0.16 * k, y - 2.3 * k, x + 0.16 * k, y - 2.3 * k, x, y - 2.85 * k], '#c8442f', OUT)
	if (big) {
		for (const yy of [1.0, 1.25, 1.5, 1.75]) El(c, x, y - yy * k, 0.05 * k, 0.05 * k, '#7ff6ff')
	}
}

export function fusion(c: Ctx) {
	c.lineWidth = 0.035
	Rc(c, 0.1, 1.2, 1.8, 0.7, '#c8cdd3', OUT)
	for (let k = 0; k < 4; k++) Rc(c, 0.2 + k * 0.45, 1.5, 0.25, 0.12, '#5a6170')
	c.beginPath()
	c.ellipse(1, 1.2, 0.85, 0.9, 0, Math.PI, 0)
	c.closePath()
	c.fillStyle = '#e3e9ef'
	c.fill()
	c.strokeStyle = OUT
	c.stroke()
	El(c, 1, 0.95, 0.72, 0.17, null, '#5fd8ff')
	c.lineWidth = 0.035
	El(c, 1, 0.42, 0.18, 0.08, '#8fe8ff', OUT)
	return null
}

export function arcology(c: Ctx, v: number) {
	const glow = ['#7ff6ff', '#ff7ff0', '#ffd27f'][v % 3]
	c.lineWidth = 0.035
	for (let k = 0; k < 6; k++) {
		const w = 1.9 - k * 0.27, y = 1.9 - k * 0.62, x = 1 - w / 2
		Pl(c, [x, y, x + w, y, x + w - 0.08, y - 0.6, x + 0.08, y - 0.6], k % 2 ? '#e3ebf1' : '#d5dfe7', OUT)
		Ln(c, x + 0.12, y - 0.3, x + w - 0.12, y - 0.3, glow, 0.05)
		for (let g = 0; g < 4; g++) El(c, x + 0.15 + (g * (w - 0.3)) / 3, y - 0.56, 0.06, 0.04, '#5fbf6a')
	}
	Ln(c, 1, -1.82, 1, -2.6, '#c8d0da', 0.05)
	El(c, 1, -2.62, 0.07, 0.07, glow)
	return null
}

export function teleporter(c: Ctx) {
	c.lineWidth = 0.035
	El(c, 1, 1.62, 0.85, 0.3, '#5a6170', OUT)
	El(c, 1, 1.58, 0.62, 0.22, '#2b2f3a')
	El(c, 1, 1.58, 0.5, 0.17, null, '#c48bff')
	c.lineWidth = 0.035
	Rc(c, 0.25, 0.75, 0.14, 0.9, '#8a90a0', OUT)
	Rc(c, 1.61, 0.75, 0.14, 0.9, '#8a90a0', OUT)
	c.beginPath()
	c.ellipse(1, 0.78, 0.68, 0.38, 0, Math.PI, 0)
	c.strokeStyle = '#c48bff'
	c.lineWidth = 0.08
	c.stroke()
	return null
}

/** v = 0: the ship on its pad, v = 1: the empty pad after launch */
export function starship(c: Ctx, v: number) {
	c.lineWidth = 0.035
	El(c, 1, 1.68, 1.0, 0.3, '#8a9097', OUT)
	El(c, 1, 1.66, 0.7, 0.2, v ? '#2f2a26' : '#5f656b')
	if (v) return null
	for (const s of [-1, 1]) Pl(c, [1 + s * 0.45, 1.55, 1 + s * 0.85, 1.65, 1 + s * 0.45, 0.6], '#9aa3ad', OUT)
	Pl(c, [0.55, 1.55, 1.45, 1.55, 1.4, -1.5, 1.0, -2.95, 0.6, -1.5], '#eef1f5', OUT)
	Pl(c, [1.0, 1.55, 1.45, 1.55, 1.4, -1.5, 1.0, -2.95], 'rgba(0,0,0,0.08)')
	for (let k = 0; k < 6; k++) El(c, 1, 1.1 - k * 0.42, 0.06, 0.06, '#7ff6ff')
	Ln(c, 0.6, -1.5, 1.4, -1.5, '#c8442f', 0.06)
	for (const x of [0.75, 1.0, 1.25]) El(c, x, 1.6, 0.1, 0.06, '#3f4651', OUT)
	return null
}
