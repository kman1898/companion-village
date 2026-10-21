import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type ServerState = 'stopped' | 'starting' | 'running' | 'error'

/** The village app is one self-contained HTML file, packaged in app/ (or the repo's dist/ while developing) */
function findVillageHtml(): string | null {
	const roots = [
		path.join(__dirname, '..', 'app', 'village.html'),
		path.join(process.resourcesPath || '', 'app', 'village.html'),
		path.join(__dirname, '..', '..', 'dist', 'index.html'),
	]
	for (const p of roots) if (existsSync(p)) return p
	return null
}

const MISSING_HTML = `<!doctype html><meta charset="utf-8"><title>Companion Village</title>
<body style="font:16px system-ui;background:#1e160e;color:#f6ead2;padding:2em">
<h1>Companion Village</h1><p>This launcher build does not include the village page.
In the repo root run <code>npm run build</code>, then <code>npm run village</code> in <code>launcher/</code>.</p>`

/**
 * Serves the village over plain http, so the page can reach Companion's HTTP API on the local network
 * (an https page like GitHub Pages often can't).
 */
export class VillageServer {
	#server: Server | null = null
	#file = findVillageHtml()
	#html: string | null = null
	state: ServerState = 'stopped'
	error = ''

	get hasVillage(): boolean {
		return !!this.#file
	}

	/** Reads the page fresh when it changes on disk, so a rebuilt village shows up on reload */
	#page(): string {
		if (!this.#file) return MISSING_HTML
		try {
			this.#html = readFileSync(this.#file, 'utf8')
		} catch {
			// keep serving the last good copy
		}
		return this.#html ?? MISSING_HTML
	}

	async start(port: number, bind: string): Promise<void> {
		await this.stop()
		this.state = 'starting'
		this.error = ''
		const server = createServer((req, res) => this.#handle(req, res))
		try {
			await new Promise<void>((resolve, reject) => {
				server.once('error', reject)
				server.listen(port, bind, () => {
					server.off('error', reject)
					resolve()
				})
			})
		} catch (e) {
			this.state = 'error'
			const err = e as NodeJS.ErrnoException
			this.error =
				err.code === 'EADDRINUSE'
					? `Port ${port} is already in use. Pick another port, or close whatever is using it.`
					: err.code === 'EADDRNOTAVAIL'
						? `${bind} is not an address of this computer any more. Pick another interface.`
						: err.code === 'EACCES'
							? `Not allowed to use port ${port}. Pick a port above 1024.`
							: err.message
			throw new Error(this.error)
		}
		server.on('error', (e) => {
			this.state = 'error'
			this.error = e.message
		})
		this.#server = server
		this.state = 'running'
	}

	async stop(): Promise<void> {
		const s = this.#server
		this.#server = null
		this.state = 'stopped'
		if (s) {
			s.closeAllConnections()
			await new Promise<void>((resolve) => s.close(() => resolve()))
		}
	}

	#handle(req: IncomingMessage, res: ServerResponse) {
		const url = new URL(req.url || '/', 'http://village')
		if ((req.method === 'GET' || req.method === 'HEAD') && (url.pathname === '/' || url.pathname === '/index.html')) {
			const body = this.#page()
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
			res.end(req.method === 'HEAD' ? undefined : body)
			return
		}
		if (req.method === 'GET' && url.pathname === '/launcher/status') {
			res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' })
			res.end(JSON.stringify({ app: 'companion-village-launcher', village: this.hasVillage }))
			return
		}
		if (url.pathname === '/favicon.ico') {
			res.writeHead(204)
			res.end()
			return
		}
		res.writeHead(404, { 'Content-Type': 'text/plain' })
		res.end('Not found')
	}
}
