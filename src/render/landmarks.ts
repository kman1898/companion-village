import type { TribeId } from '../data/tribes'
import { El, Ln, OUT, Pl, Rc, type Ctx } from './draw'

/*
 * Tribe landmarks. Anchor = base centre. Style: 0 medieval, 1 industrial, 2 modern/space, 3 sci-fi.
 * Pixels: mosaic stele → camera obscura → TV mast → LED wall.  Noises: war drum → gramophone → line array.
 * Lampys: beacon fire → searchlight → moving-head truss. Beams, rings and screen content are drawn live.
 */

const NOISE_ACCENT = '#a99bff'
const PIXEL_COLS = ['#ff3d9a', '#3ad1ff', '#7dff6b', '#fff36b', '#ff7a3d', '#8f7cff']

function speakerBox(c: Ctx, x: number, y: number, w: number, h: number) {
	Rc(c, x, y, w, h, '#18181c', OUT)
	El(c, x + w / 2, y + h * 0.62, w * 0.32, w * 0.32, '#3a3a44')
	El(c, x + w / 2, y + h * 0.62, w * 0.12, w * 0.12, '#55556a')
	El(c, x + w / 2, y + h * 0.2, w * 0.12, w * 0.1, '#3a3a44')
}

/** Screen rectangle (relative to the anchor) for the Pixels' live picture, per style */
export function pixelScreen(style: number): [number, number, number, number] | null {
	if (style === 0) return [-0.55, -2.05, 1.1, 0.9]
	if (style === 2) return [-0.85, -1.15, 1.7, 0.95]
	if (style === 3) return [-1.0, -3.3, 2.0, 2.2]
	return null
}

export function landmarkArt(c: Ctx, team: TribeId, style: number) {
	c.lineWidth = 0.035
	El(c, 0.1, 0, 1.2, 0.3, 'rgba(0,0,0,0.22)')
	if (team === 'pixels') {
		if (style === 0) {
			// stone stele covered in a pixel mosaic
			Rc(c, -0.75, -0.25, 1.5, 0.25, '#8f8a7e', OUT)
			Rc(c, -0.65, -2.2, 1.3, 1.95, '#b4ad9f', OUT)
			for (let r = 0; r < 6; r++) for (let k = 0; k < 7; k++) Rc(c, -0.55 + k * 0.157, -2.05 + r * 0.15, 0.14, 0.13, PIXEL_COLS[(r * 3 + k * 5) % 6])
			for (const s of [-1, 1]) {
				Ln(c, s * 0.95, 0, s * 0.95, -1.2, '#5a3b22', 0.05)
				Pl(c, [s * 0.95 - 0.08, -1.2, s * 0.95 + 0.08, -1.2, s * 0.95, -1.45], '#ffb347')
			}
		} else if (style === 1) {
			// camera obscura tower
			Pl(c, [-0.45, 0, 0.45, 0, 0.32, -2.2, -0.32, -2.2], '#7a5a3a', OUT)
			for (let y = -0.4; y > -2.2; y -= 0.4) Ln(c, -0.4, y, 0.4, y, 'rgba(40,25,10,0.4)', 0.02)
			Rc(c, -0.7, -3.1, 1.1, 0.9, '#2a2a2e', OUT)
			for (let k = 0; k < 4; k++) Pl(c, [0.4 + k * 0.12, -3.05 + k * 0.04, 0.52 + k * 0.12, -3.02 + k * 0.04, 0.52 + k * 0.12, -2.28 - k * 0.04, 0.4 + k * 0.12, -2.25 - k * 0.04], '#3a3a40', OUT)
			El(c, 0.95, -2.65, 0.14, 0.2, '#9fd0e6', OUT)
			Rc(c, -0.5, -3.3, 0.2, 0.2, '#c8442f')
		} else if (style === 2) {
			// broadcast mast with a dish and a big screen at its foot
			for (const x of [-0.25, 0.25]) Ln(c, x, -1.15, x * 0.3, -4.0, '#c8442f', 0.05)
			for (let y = -1.3; y > -3.9; y -= 0.35) Ln(c, -0.22 + (y + 1.15) * -0.05, y, 0.22 - (y + 1.15) * -0.05, y - 0.35, '#e8e2d6', 0.025)
			El(c, 0.35, -3.1, 0.3, 0.22, '#e8eef4', OUT)
			Ln(c, 0, -4.0, 0, -4.4, '#c8442f', 0.03)
			El(c, 0, -4.42, 0.05, 0.05, '#ff3b3b')
			Rc(c, -0.95, -1.25, 1.9, 1.15, '#1a1a1e', OUT)
			Rc(c, -0.25, -0.12, 0.5, 0.12, '#3a3a40')
		} else {
			// giant LED wall on a truss with a hologram pylon
			for (const x of [-1.05, 1.05]) Ln(c, x, 0, x, -3.45, '#c8ccd2', 0.07)
			Ln(c, -1.15, -3.45, 1.15, -3.45, '#c8ccd2', 0.08)
			Rc(c, -1.05, -3.35, 2.1, 2.4, '#0e0e12', OUT)
			Rc(c, -0.25, -0.95, 0.5, 0.95, '#3a3f4a', OUT)
			El(c, 0, -0.95, 0.35, 0.1, '#7ff6ff')
		}
		return
	}
	if (team === 'noises') {
		if (style === 0) {
			Rc(c, -0.9, -0.6, 1.8, 0.6, '#7a5a3a', OUT)
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
			for (const x of [-0.85, 0.85]) Ln(c, x, 0, x, -3.4, '#c8ccd2', 0.07)
			Ln(c, -0.85, -3.4, 0.85, -3.4, '#c8ccd2', 0.07)
			for (let k = 0; k < 6; k++) {
				const y = -3.25 + k * 0.32, w = 0.75 - k * 0.03
				Pl(c, [-w, y, w, y, w - 0.05, y + 0.3, -w + 0.05, y + 0.3], '#18181c', OUT)
				Ln(c, -w + 0.1, y + 0.15, w - 0.1, y + 0.15, style === 3 ? NOISE_ACCENT : '#3a3a44', 0.04)
			}
			for (const x of [-0.75, 0.05]) speakerBox(c, x, -0.75, 0.7, 0.75)
		}
		return
	}
	if (style === 0) {
		Pl(c, [-0.55, 0, 0.55, 0, 0.4, -2.6, -0.4, -2.6], '#9a948a', OUT)
		for (let y = -0.3; y > -2.6; y -= 0.3) Ln(c, -0.5, y, 0.5, y, 'rgba(60,55,48,0.3)', 0.02)
		Pl(c, [-0.55, -2.6, 0.55, -2.6, 0.4, -2.9, -0.4, -2.9], '#4a3a2a', OUT)
	} else if (style === 1) {
		Pl(c, [-0.5, 0, 0.5, 0, 0.3, -2.8, -0.3, -2.8], '#e8e2d6', OUT)
		for (const y of [-0.8, -1.8]) Rc(c, -0.42, y, 0.84, 0.15, '#c8442f')
		Rc(c, -0.45, -3.2, 0.9, 0.4, '#3a3a3a', OUT)
		El(c, 0, -3.0, 0.22, 0.16, '#fff3c8')
	} else {
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

/** Where beams / rings come from (relative to the landmark anchor) */
export function landmarkEmitters(team: TribeId, style: number): [number, number][] {
	if (team === 'lampys') {
		if (style <= 1) return [[0, -3.0]]
		return [[-0.75, -3.28], [-0.25, -3.28], [0.25, -3.28], [0.75, -3.28]]
	}
	if (team === 'noises') {
		if (style === 0) return [[0, -1.7]]
		if (style === 1) return [[0, -3.0]]
		return [[0, -2.4]]
	}
	if (style === 1) return [[0.95, -2.65]]
	if (style === 2) return [[0, -4.4]]
	return [[0, -1.0]]
}

/** landmark height above the anchor (tiles) */
export const LANDMARK_TOP = 4.6
