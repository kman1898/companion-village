import { mulberry32 } from '../core/rng'
import { clamp } from '../core/util'
import { CX, CY, G, H, W, has, idx } from '../game/state'
import { canvas, roundRect } from './draw'

export const TP = 20 // terrain pixels per tile

let baseTerrain: HTMLCanvasElement | null = null
export let terrain: HTMLCanvasElement | null = null

/** Smooth blobby tile masks: paint 1px per tile, blur a little, upscale with smoothing, threshold with a soft edge */
function maskLayer(test: (i: number) => boolean | number, rgb: [number, number, number]) {
	const [small, sg] = canvas(W, H)
	const img = sg.createImageData(W, H)
	const m = new Uint8Array(W * H)
	for (let i = 0; i < W * H; i++) m[i] = test(i) ? 1 : 0
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++) {
			let n = 0
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++) n += m[idx(clamp(x + dx, 0, W - 1), clamp(y + dy, 0, H - 1))] * (dx && dy ? 1 : 2)
			img.data[idx(x, y) * 4 + 3] = Math.round((n / 14) * 255)
		}
	sg.putImageData(img, 0, 0)
	const [c, g] = canvas(W * TP, H * TP)
	g.imageSmoothingEnabled = true
	g.drawImage(small, 0, 0, W * TP, H * TP)
	const big = g.getImageData(0, 0, c.width, c.height), d = big.data
	for (let i = 0; i < d.length; i += 4) {
		const a = d[i + 3]
		d[i] = rgb[0]
		d[i + 1] = rgb[1]
		d[i + 2] = rgb[2]
		d[i + 3] = a < 112 ? 0 : a > 144 ? 255 : ((a - 112) / 32) * 255
	}
	g.putImageData(big, 0, 0)
	return c
}

export function renderBaseTerrain() {
	const w = G.world
	const [c, g] = canvas(W * TP, H * TP)
	const [small, sg] = canvas(W, H)
	const img = sg.createImageData(W, H)
	for (let i = 0; i < W * H; i++) {
		const s = w.shade[i]
		img.data[i * 4] = 70 + s * 40
		img.data[i * 4 + 1] = 112 + s * 46
		img.data[i * 4 + 2] = 46 + s * 18
		img.data[i * 4 + 3] = 255
	}
	sg.putImageData(img, 0, 0)
	g.imageSmoothingEnabled = true
	g.drawImage(small, 0, 0, W * TP, H * TP)
	const r = mulberry32(w.seed ^ 0x5eed)
	for (let k = 0; k < W * H * 3; k++) {
		const x = r() * W, y = r() * H
		g.fillStyle = r() < 0.55 ? 'rgba(25,60,12,0.22)' : 'rgba(225,250,170,0.13)'
		g.fillRect(x * TP, y * TP, 2, 4)
	}
	const flowers = ['#f4f1e6', '#f2d24b', '#e98bb0', '#b9a3f0']
	for (let k = 0; k < 500; k++) {
		const x = r() * W, y = r() * H
		g.fillStyle = flowers[Math.floor(r() * flowers.length)]
		g.beginPath()
		g.arc(x * TP, y * TP, 1.6, 0, 7)
		g.fill()
	}
	const deep = (x: number, y: number) => {
		for (let dy = -1; dy <= 1; dy++)
			for (let dx = -1; dx <= 1; dx++) if (!w.water[idx(clamp(x + dx, 0, W - 1), clamp(y + dy, 0, H - 1))]) return 0
		return 1
	}
	g.drawImage(maskLayer((i) => w.water[i] || w.sand[i], [207, 189, 134]), 0, 0)
	g.drawImage(maskLayer((i) => w.water[i], [61, 122, 161]), 0, 0)
	g.drawImage(maskLayer((i) => deep(i % W, (i / W) | 0), [52, 109, 147]), 0, 0)
	baseTerrain = c
	terrain = canvas(c.width, c.height)[0]
	G.terrainDirty = true
}

export function renderTerrain() {
	if (!terrain || !baseTerrain) return
	const g = terrain.getContext('2d')!
	g.drawImage(baseTerrain, 0, 0)
	const paved = has('pavedRoads')
	const r = mulberry32(7)
	g.lineCap = 'round'
	g.lineJoin = 'round'
	const layers: [string, number][] = paved ? [['#8d8476', 0.66], ['#b3aa98', 0.48]] : [['#a08460', 0.62], ['#bc9d70', 0.4]]
	for (const [col, wd] of layers) {
		g.strokeStyle = col
		g.lineWidth = TP * wd
		g.beginPath()
		for (const i of G.roads) {
			const x = i % W, y = (i / W) | 0, X = (x + 0.5) * TP, Y = (y + 0.5) * TP
			g.moveTo(X, Y)
			g.lineTo(X + 0.01, Y)
			if (G.roads.has(i + 1) && x < W - 1) {
				g.moveTo(X, Y)
				g.lineTo(X + TP, Y)
			}
			if (G.roads.has(i + W)) {
				g.moveTo(X, Y)
				g.lineTo(X, Y + TP)
			}
		}
		g.stroke()
	}
	for (const i of G.roads) {
		const x = i % W, y = (i / W) | 0
		if (paved) {
			g.fillStyle = 'rgba(90,82,70,0.45)'
			for (let k = 0; k < 4; k++) {
				g.beginPath()
				g.arc((x + 0.2 + r() * 0.6) * TP, (y + 0.2 + r() * 0.6) * TP, 2.2, 0, 7)
				g.fill()
			}
		} else {
			g.fillStyle = 'rgba(80,60,35,0.35)'
			for (let k = 0; k < 3; k++) g.fillRect((x + r()) * TP, (y + r()) * TP, 2, 2)
		}
	}
	// town square
	const px = (CX - 2) * TP, py = (CY - 2) * TP
	g.fillStyle = '#a99a80'
	roundRect(g, px - 4, py - 4, 4 * TP + 8, 4 * TP + 8, 14)
	g.fill()
	for (let y = 0; y < 8; y++)
		for (let x = 0; x < 8; x++) {
			g.fillStyle = (x + y) % 2 ? '#bcae93' : '#b3a487'
			roundRect(g, px + x * TP * 0.5 + 1, py + y * TP * 0.5 + 1, TP * 0.5 - 2, TP * 0.5 - 2, 3)
			g.fill()
		}
	G.terrainDirty = false
}
