import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	PROTOCOL_VERSION,
	type SyncRequest,
	type SyncResponse,
	type TribeId,
	type VillageAction,
	type VillageState,
} from './protocol.js'

const MAX_QUEUE = 300
const MAX_BODY = 512 * 1024

/** The village app (one self-contained HTML file) is packaged next to main.js */
function loadVillageHtml(): string | null {
	const here = path.dirname(fileURLToPath(import.meta.url))
	for (const p of [path.join(here, 'village.html'), path.join(here, '..', 'village.html')]) {
		if (existsSync(p)) return readFileSync(p, 'utf8')
	}
	return null
}

const FALLBACK_HTML = `<!doctype html><meta charset="utf-8"><title>Companion Village</title>
<body style="font:16px system-ui;background:#111;color:#eee;padding:2em">
<h1>Companion Village</h1><p>This module build does not include the village page.
Open <a style="color:#9cf" href="https://mko1989.github.io/companion-village/">the web version</a> and enter this address under Settings → Companion module.</p>`

const escapeJs = (s: string) => JSON.stringify(s).replace(/</g, '\\u003c')

export interface ServerEvents {
	onState: (state: VillageState, page: string) => void
	log: (level: 'debug' | 'info' | 'warn' | 'error', msg: string) => void
	tribe: () => TribeId
	label: () => string
}

/**
 * A tiny HTTP server the village page syncs with.
 * Pages POST their state and receive any actions queued by Companion buttons since their last sync.
 */
export class VillageServer {
	#server: Server | null = null
	#queue: (VillageAction & { seq: number })[] = []
	#seq = 0
	readonly boot = randomBytes(4).toString('hex')
	readonly pages = new Map<string, number>()
	readonly html = loadVillageHtml()

	constructor(private readonly ev: ServerEvents) {}

	get running(): boolean {
		return !!this.#server
	}

	async start(port: number, bind: string): Promise<void> {
		await this.stop()
		const server = createServer((req, res) => this.#handle(req, res))
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject)
			server.listen(port, bind || undefined, () => {
				server.off('error', reject)
				resolve()
			})
		})
		server.on('error', (e) => this.ev.log('error', `Village server error: ${e.message}`))
		this.#server = server
	}

	async stop(): Promise<void> {
		const s = this.#server
		this.#server = null
		if (s) await new Promise<void>((resolve) => s.close(() => resolve()))
	}

	/** Queue an action for every connected page */
	push(action: VillageAction): void {
		this.#seq++
		this.#queue.push({ ...action, seq: this.#seq })
		if (this.#queue.length > MAX_QUEUE) this.#queue.splice(0, this.#queue.length - MAX_QUEUE)
	}

	/** Pages seen in the last few seconds */
	livePages(maxAgeMs = 4000): number {
		const now = Date.now()
		let n = 0
		for (const t of this.pages.values()) if (now - t < maxAgeMs) n++
		return n
	}

	#cors(res: ServerResponse) {
		res.setHeader('Access-Control-Allow-Origin', '*')
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
		// older Chrome "Private Network Access" preflights
		res.setHeader('Access-Control-Allow-Private-Network', 'true')
		res.setHeader('Cache-Control', 'no-store')
	}

	#json(res: ServerResponse, code: number, body: unknown) {
		this.#cors(res)
		res.writeHead(code, { 'Content-Type': 'application/json' })
		res.end(JSON.stringify(body))
	}

	/** The village page, told which module served it so it links up by itself */
	#page(req: IncomingMessage, res: ServerResponse) {
		const marker = `<script>window.__VILLAGE_MODULE__={host:${escapeJs(req.headers.host || '')},tribe:${escapeJs(this.ev.tribe())},label:${escapeJs(this.ev.label())}}</script>`
		const body = this.html ? this.html.replace('<head>', () => `<head>${marker}`) : FALLBACK_HTML
		res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
		res.end(req.method === 'HEAD' ? undefined : body)
	}

	#handle(req: IncomingMessage, res: ServerResponse) {
		const url = new URL(req.url || '/', 'http://village')
		if (req.method === 'OPTIONS') {
			this.#cors(res)
			res.writeHead(204)
			res.end()
			return
		}
		if ((req.method === 'GET' || req.method === 'HEAD') && (url.pathname === '/' || url.pathname === '/index.html')) {
			this.#page(req, res)
			return
		}
		if (req.method === 'GET' && url.pathname === '/status') {
			this.#json(res, 200, {
				app: 'companion-village',
				v: PROTOCOL_VERSION,
				boot: this.boot,
				tribe: this.ev.tribe(),
				pages: this.livePages(),
				queued: this.#queue.length,
			})
			return
		}
		if (req.method === 'POST' && url.pathname === '/sync') {
			let size = 0
			const chunks: Buffer[] = []
			req.on('data', (c: Buffer) => {
				size += c.length
				if (size > MAX_BODY) req.destroy()
				else chunks.push(c)
			})
			req.on('end', () => {
				let body: SyncRequest
				try {
					body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as SyncRequest
				} catch {
					this.#json(res, 400, { error: 'bad json' })
					return
				}
				const page = String(body.page || 'unknown').slice(0, 40)
				this.pages.set(page, Date.now())
				if (body.state) {
					try {
						this.ev.onState(body.state, page)
					} catch (e) {
						this.ev.log('warn', `Bad state from village: ${(e as Error).message}`)
					}
				}
				// a new page starts from "now"; a known page gets everything after its cursor
				const since = typeof body.since === 'number' ? body.since : this.#seq
				const actions = since > this.#seq ? [] : this.#queue.filter((a) => a.seq > since)
				const out: SyncResponse = {
					v: PROTOCOL_VERSION,
					boot: this.boot,
					seq: this.#seq,
					tribe: this.ev.tribe(),
					label: this.ev.label(),
					actions,
				}
				this.#json(res, 200, out)
			})
			return
		}
		this.#json(res, 404, { error: 'not found' })
	}
}
