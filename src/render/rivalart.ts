import type { RivalId } from '../game/state'
import { El, Ln, OUT, Pl, Rc, type Ctx } from './draw'

/*
 * Rival village art. Anchor = base centre of the building. Style: 0 medieval, 1 industrial, 2 modern, 3 sci-fi.
 */

const SOUND = { wall: '#5b4a8a', roof: '#3d2f66', accent: '#a99bff', dark: '#1f1a2e' }
const LIGHT = { wall: '#b07a2a', roof: '#d99a2a', accent: '#ffe07a', dark: '#2a2218' }

function roundHut(c: Ctx, wall: string, roof: string) {
	c.lineWidth = 0.03
	El(c, 0.05, 0, 0.72, 0.18, 'rgba(0,0,0,0.2)')
	Rc(c, -0.55, -0.6, 1.1, 0.6, wall, OUT)
	Rc(c, -0.13, -0.38, 0.26, 0.38, '#3a2a1e', OUT)
	Pl(c, [-0.7, -0.55, 0.7, -0.55, 0, -1.35], roof, OUT)
	Pl(c, [0, -1.35, 0.7, -0.55, 0.25, -0.55], 'rgba(0,0,0,0.15)')
}

function boxHouse(c: Ctx, wall: string, top: string) {
	c.lineWidth = 0.03
	El(c, 0.05, 0, 0.75, 0.18, 'rgba(0,0,0,0.2)')
	Rc(c, -0.62, -0.85, 1.24, 0.85, wall, OUT)
	Rc(c, -0.66, -0.95, 1.32, 0.12, top, OUT)
	Rc(c, -0.12, -0.42, 0.24, 0.42, '#202226', OUT)
}

function dome(c: Ctx, wall: string, glow: string) {
	c.lineWidth = 0.03
	El(c, 0.05, 0, 0.75, 0.18, 'rgba(0,0,0,0.2)')
	c.beginPath()
	c.ellipse(0, -0.02, 0.7, 0.85, 0, Math.PI, 0)
	c.closePath()
	c.fillStyle = wall
	c.fill()
	c.strokeStyle = OUT
	c.stroke()
	Ln(c, -0.66, -0.3, 0.66, -0.3, glow, 0.06)
}

function speakerBox(c: Ctx, x: number, y: number, w: number, h: number) {
	Rc(c, x, y, w, h, '#18181c', OUT)
	El(c, x + w / 2, y + h * 0.62, w * 0.32, w * 0.32, '#3a3a44')
	El(c, x + w / 2, y + h * 0.62, w * 0.12, w * 0.12, '#55556a')
	El(c, x + w / 2, y + h * 0.2, w * 0.12, w * 0.1, '#3a3a44')
}

export function rivalHut(c: Ctx, team: RivalId, style: number, v: number) {
	if (team === 'sound') {
		if (style === 0) {
			roundHut(c, ['#7a5a3a', '#6b4e33'][v % 2], SOUND.roof)
			// war drum
			Rc(c, 0.38, -0.32, 0.36, 0.3, '#b4553c', OUT)
			El(c, 0.56, -0.32, 0.18, 0.06, '#efe0c0', OUT)
		} else if (style === 1) {
			boxHouse(c, '#6a4a5a', SOUND.roof)
			// gramophone horn on the roof
			Ln(c, 0.25, -0.95, 0.3, -1.2, '#5a4a2a', 0.04)
			Pl(c, [0.3, -1.2, 0.75, -1.55, 0.78, -1.15], '#d9b44a', OUT)
		} else if (style === 2) {
			boxHouse(c, SOUND.dark, SOUND.wall)
			speakerBox(c, -0.55, -0.78, 0.3, 0.6)
			speakerBox(c, 0.25, -0.78, 0.3, 0.6)
			Ln(c, -0.62, -0.88, 0.62, -0.88, SOUND.accent, 0.04)
		} else {
			dome(c, '#2a2440', SOUND.accent)
			for (const r of [0.15, 0.28]) El(c, 0, -0.55, r, r * 0.6, null, SOUND.accent)
		}
	} else {
		if (style === 0) {
			roundHut(c, ['#a07a42', '#8f6a3a'][v % 2], LIGHT.roof)
			// torch
			Ln(c, 0.55, 0, 0.55, -0.7, '#5a3b22', 0.05)
			Pl(c, [0.48, -0.7, 0.62, -0.7, 0.55, -0.95], '#ffb347')
		} else if (style === 1) {
			boxHouse(c, '#8a5a3a', LIGHT.roof)
			// lantern on the roof
			Rc(c, -0.12, -1.3, 0.24, 0.32, '#ffe07a', OUT)
			Pl(c, [-0.16, -1.3, 0.16, -1.3, 0, -1.45], '#3a3a3a', OUT)
		} else if (style === 2) {
			boxHouse(c, LIGHT.dark, LIGHT.wall)
			// a little truss with fixtures
			Ln(c, -0.55, -1.25, 0.55, -1.25, '#c8ccd2', 0.05)
			for (const x of [-0.4, 0, 0.4]) {
				Rc(c, x - 0.09, -1.22, 0.18, 0.2, '#222', OUT)
				El(c, x, -1.04, 0.07, 0.04, '#ffe07a')
			}
			Ln(c, -0.62, -0.88, 0.62, -0.88, LIGHT.accent, 0.04)
		} else {
			dome(c, '#3a2e1a', LIGHT.accent)
			Ln(c, 0, -0.85, 0, -1.25, '#c8ccd2', 0.04)
			El(c, 0, -1.27, 0.07, 0.07, '#ff4fd8')
		}
	}
}

/** Landmark towers: Soundhaven's PA, Lumenfort's lighting rig. Beams/rings are drawn live. */
export function rivalTower(c: Ctx, team: RivalId, style: number) {
	c.lineWidth = 0.035
	El(c, 0.1, 0, 1.2, 0.3, 'rgba(0,0,0,0.22)')
	if (team === 'sound') {
		if (style === 0) {
			Rc(c, -0.9, -0.6, 1.8, 0.6, '#7a5a3a', OUT)
			// giant war drum
			Rc(c, -0.6, -1.7, 1.2, 1.1, '#b4553c', OUT)
			for (let k = 0; k < 6; k++) Ln(c, -0.6 + k * 0.24, -1.7, -0.48 + k * 0.24, -0.6, '#efe0c0', 0.03)
			El(c, 0, -1.7, 0.6, 0.18, '#efe0c0', OUT)
			for (const s of [-1, 1]) Pl(c, [s * 0.75, -0.7, s * 1.35, -1.6, s * 1.15, -1.75, s * 0.7, -0.95], '#d9b44a', OUT)
		} else if (style === 1) {
			Rc(c, -0.2, -2.0, 0.4, 2.0, '#5a4a3a', OUT)
			Pl(c, [0, -2.0, -1.2, -3.0, 1.2, -3.0], '#d9b44a', OUT)
			El(c, 0, -3.0, 1.2, 0.3, '#b48a2a', OUT)
			El(c, 0, -3.0, 0.9, 0.2, '#3a2a1a')
		} else {
			// truss with a hanging line array and a sub stack
			for (const x of [-0.85, 0.85]) Ln(c, x, 0, x, -3.4, '#c8ccd2', 0.07)
			Ln(c, -0.85, -3.4, 0.85, -3.4, '#c8ccd2', 0.07)
			for (let k = 0; k < 6; k++) {
				const y = -3.25 + k * 0.32, w = 0.75 - k * 0.03
				Pl(c, [-w, y, w, y, w - 0.05, y + 0.3, -w + 0.05, y + 0.3], '#18181c', OUT)
				Ln(c, -w + 0.1, y + 0.15, w - 0.1, y + 0.15, style === 3 ? SOUND.accent : '#3a3a44', 0.04)
			}
			for (const x of [-0.75, 0.05]) speakerBox(c, x, -0.75, 0.7, 0.75)
		}
	} else {
		if (style === 0) {
			// stone beacon tower with a fire basket
			Pl(c, [-0.55, 0, 0.55, 0, 0.4, -2.6, -0.4, -2.6], '#9a948a', OUT)
			for (let y = -0.3; y > -2.6; y -= 0.3) Ln(c, -0.5, y, 0.5, y, 'rgba(60,55,48,0.3)', 0.02)
			Pl(c, [-0.55, -2.6, 0.55, -2.6, 0.4, -2.9, -0.4, -2.9], '#4a3a2a', OUT)
		} else if (style === 1) {
			// searchlight tower
			Pl(c, [-0.5, 0, 0.5, 0, 0.3, -2.8, -0.3, -2.8], '#e8e2d6', OUT)
			for (const y of [-0.8, -1.8]) Rc(c, -0.42, y, 0.84, 0.15, '#c8442f')
			Rc(c, -0.45, -3.2, 0.9, 0.4, '#3a3a3a', OUT)
			El(c, 0, -3.0, 0.22, 0.16, '#fff3c8')
		} else {
			// square truss tower with moving heads
			for (const x of [-0.7, 0.7]) Ln(c, x, 0, x, -3.6, '#c8ccd2', 0.07)
			for (let y = -0.4; y > -3.6; y -= 0.4) {
				Ln(c, -0.7, y, 0.7, y - 0.4, '#a8acb2', 0.03)
				Ln(c, -0.7, y, 0.7, y, '#a8acb2', 0.03)
			}
			Ln(c, -0.95, -3.6, 0.95, -3.6, '#c8ccd2', 0.08)
			for (const x of [-0.75, -0.25, 0.25, 0.75]) {
				Rc(c, x - 0.12, -3.55, 0.24, 0.22, '#1a1a1e', OUT)
				El(c, x, -3.28, 0.1, 0.07, style === 3 ? '#ff4fd8' : '#fff3c8')
			}
		}
	}
}

/** Where beams / rings come from (relative to the tower anchor) */
export function towerEmitters(team: RivalId, style: number): [number, number][] {
	if (team === 'lights') {
		if (style === 0) return [[0, -3.0]]
		if (style === 1) return [[0, -3.0]]
		return [[-0.75, -3.28], [-0.25, -3.28], [0.25, -3.28], [0.75, -3.28]]
	}
	if (style === 0) return [[0, -1.7]]
	if (style === 1) return [[0, -3.0]]
	return [[0, -2.4]]
}

export const RIVAL_COLORS = { sound: SOUND, lights: LIGHT }
