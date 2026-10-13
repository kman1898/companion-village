// Small canvas helpers. Everything in the world is drawn in tile units.
export type Ctx = CanvasRenderingContext2D

export const OUT = 'rgba(45,28,16,0.62)'

export function Rc(c: Ctx, x: number, y: number, w: number, h: number, f: string, s?: string) {
	c.fillStyle = f
	c.fillRect(x, y, w, h)
	if (s) {
		c.strokeStyle = s
		c.strokeRect(x, y, w, h)
	}
}

export function Pl(c: Ctx, p: number[], f?: string | null, s?: string) {
	c.beginPath()
	c.moveTo(p[0], p[1])
	for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1])
	c.closePath()
	if (f) {
		c.fillStyle = f
		c.fill()
	}
	if (s) {
		c.strokeStyle = s
		c.stroke()
	}
}

export function El(c: Ctx, x: number, y: number, rx: number, ry: number, f?: string | null, s?: string) {
	c.beginPath()
	c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
	if (f) {
		c.fillStyle = f
		c.fill()
	}
	if (s) {
		c.strokeStyle = s
		c.stroke()
	}
}

export function Ln(c: Ctx, x1: number, y1: number, x2: number, y2: number, col: string, lw: number) {
	c.beginPath()
	c.moveTo(x1, y1)
	c.lineTo(x2, y2)
	c.strokeStyle = col
	c.lineWidth = lw
	c.stroke()
}

export function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
	g.beginPath()
	g.moveTo(x + r, y)
	g.arcTo(x + w, y, x + w, y + h, r)
	g.arcTo(x + w, y + h, x, y + h, r)
	g.arcTo(x, y + h, x, y, r)
	g.arcTo(x, y, x + w, y, r)
	g.closePath()
}

export function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
	const c = document.createElement('canvas')
	c.width = Math.max(1, Math.ceil(w))
	c.height = Math.max(1, Math.ceil(h))
	return [c, c.getContext('2d')!]
}
