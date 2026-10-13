export function mulberry32(seed: number): () => number {
	let a = seed
	return () => {
		a |= 0
		a = (a + 0x6d2b79f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/** Smooth fractal value noise in roughly [0, 1] */
export function makeNoise(seed: number): (x: number, y: number) => number {
	const N = 64
	const g = new Float32Array(N * N)
	const r = mulberry32(seed)
	for (let i = 0; i < N * N; i++) g[i] = r()
	const at = (x: number, y: number) => g[(((y % N) + N) % N) * N + (((x % N) + N) % N)]
	const n = (x: number, y: number) => {
		const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
		const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
		const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1)
		return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
	}
	return (x, y) => n(x, y) * 0.6 + n(x * 2.1 + 17, y * 2.1 + 9) * 0.3 + n(x * 4.3 + 3, y * 4.3 + 41) * 0.1
}
