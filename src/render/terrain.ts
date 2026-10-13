import { mulberry32 } from '../core/rng'
import { clamp } from '../core/util'
import { Biome, G, H, W, idx } from '../game/state'
import { canvas } from './draw'

export const TP = 12 // terrain pixels per tile

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

/** Ground colour per biome; s = 0..1 variation */
function groundColor(b: number, s: number): [number, number, number] {
	switch (b) {
		case Biome.Tundra: return [214 + s * 22, 222 + s * 20, 226 + s * 18]
		case Biome.Desert: return [206 + s * 24, 178 + s * 22, 118 + s * 18]
		case Biome.Swamp: return [78 + s * 26, 92 + s * 26, 52 + s * 14]
		case Biome.Mountain: return [124 + s * 30, 118 + s * 26, 106 + s * 22]
		default: return [70 + s * 40, 112 + s * 46, 46 + s * 18]
	}
}

export function renderBaseTerrain() {
	const w = G.world
	const [c, g] = canvas(W * TP, H * TP)
	const [small, sg] = canvas(W, H)
	const img = sg.createImageData(W, H)
	for (let i = 0; i < W * H; i++) {
		const [r, gg, b] = groundColor(w.biome[i], w.shade[i])
		img.data[i * 4] = r
		img.data[i * 4 + 1] = gg
		img.data[i * 4 + 2] = b
		img.data[i * 4 + 3] = 255
	}
	sg.putImageData(img, 0, 0)
	g.imageSmoothingEnabled = true
	g.drawImage(small, 0, 0, W * TP, H * TP)
	const r = mulberry32(w.seed ^ 0x5eed)
	for (let k = 0; k < W * H * 2.5; k++) {
		const x = r() * W, y = r() * H
		const b = w.biome[idx(x | 0, y | 0)]
		if (b === Biome.Tundra) g.fillStyle = r() < 0.5 ? 'rgba(160,180,200,0.25)' : 'rgba(255,255,255,0.35)'
		else if (b === Biome.Desert) g.fillStyle = r() < 0.5 ? 'rgba(150,110,60,0.22)' : 'rgba(255,240,200,0.2)'
		else if (b === Biome.Mountain) g.fillStyle = r() < 0.5 ? 'rgba(60,55,50,0.3)' : 'rgba(220,215,205,0.2)'
		else if (b === Biome.Swamp) g.fillStyle = r() < 0.5 ? 'rgba(30,50,20,0.3)' : 'rgba(150,170,90,0.18)'
		else g.fillStyle = r() < 0.55 ? 'rgba(25,60,12,0.22)' : 'rgba(225,250,170,0.13)'
		g.fillRect(x * TP, y * TP, 1.6, 3)
	}
	// flowers in the meadows, reeds in the swamps
	const flowers = ['#f4f1e6', '#f2d24b', '#e98bb0', '#b9a3f0']
	for (let k = 0; k < 1600; k++) {
		const x = r() * W, y = r() * H
		const b = w.biome[idx(x | 0, y | 0)]
		if (b === Biome.Grass) {
			g.fillStyle = flowers[Math.floor(r() * flowers.length)]
			g.beginPath()
			g.arc(x * TP, y * TP, 1.3, 0, 7)
			g.fill()
		} else if (b === Biome.Swamp) {
			g.strokeStyle = 'rgba(60,80,30,0.8)'
			g.lineWidth = 1
			g.beginPath()
			g.moveTo(x * TP, y * TP)
			g.lineTo(x * TP + 1, y * TP - 5)
			g.stroke()
		}
	}
	const deep = (x: number, y: number) => {
		for (let dy = -1; dy <= 1; dy++)
			for (let dx = -1; dx <= 1; dx++) if (!w.water[idx(clamp(x + dx, 0, W - 1), clamp(y + dy, 0, H - 1))]) return 0
		return 1
	}
	g.drawImage(maskLayer((i) => w.water[i] || w.sand[i], [207, 189, 134]), 0, 0)
	g.drawImage(maskLayer((i) => w.water[i], [61, 122, 161]), 0, 0)
	g.drawImage(maskLayer((i) => deep(i % W, (i / W) | 0), [52, 109, 147]), 0, 0)
	terrain = c
}
