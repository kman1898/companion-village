#!/usr/bin/env node
// Installs the Companion Village module into a running Companion (v4.2+/v5) on THIS computer,
// adds a "Companion Village" connection and (optionally) a trigger that counts every button press.
//
// Usage:
//   node tools/install-module.mjs [host:port] [--tribe pixels|noises|lampys] [--port 17890] [--label village] [--trigger] [--pkg file.tgz]
//
// Companion only accepts module packages from the local machine. The same can be done by hand:
// Companion → Modules → Import module package → companion-village-x.y.z.tgz, then Connections → Add → Companion Village.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (k, d) => {
	const i = args.indexOf(k)
	return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d
}
const valueFlags = new Set(['--tribe', '--port', '--label', '--pkg'])
const host = args.find((a, i) => !a.startsWith('--') && !valueFlags.has(args[i - 1])) || 'localhost:8888'
const tribe = flag('--tribe', 'pixels')
const port = Number(flag('--port', '17890'))
const label = flag('--label', 'village')
const withTrigger = args.includes('--trigger')

const here = path.dirname(fileURLToPath(import.meta.url))
let pkg = flag('--pkg')
if (!pkg) {
	const dir = path.join(here, '..', 'companion-module')
	const found = existsSync(dir) ? readdirSync(dir).filter((f) => /^companion-village-.*\.tgz$/.test(f)).sort() : []
	if (!found.length) {
		console.error('No module package found. Build it first:  cd companion-module && corepack yarn install && corepack yarn package')
		process.exit(1)
	}
	pkg = path.join(dir, found[found.length - 1])
}
const tar = readFileSync(pkg)
const version = path.basename(pkg).replace(/^companion-village-|\.tgz$/g, '')

if (typeof WebSocket === 'undefined') {
	console.error('This script needs Node.js 22 or newer (global WebSocket).')
	process.exit(1)
}

const ws = new WebSocket(`ws://${host}/trpc`)
let nextId = 1
const pending = new Map()
const subs = new Map()
ws.addEventListener('message', (ev) => {
	const msg = JSON.parse(ev.data)
	if (subs.has(msg.id) && msg.result?.type === 'data') return subs.get(msg.id)(msg.result.data)
	const p = pending.get(msg.id)
	if (!p) return
	pending.delete(msg.id)
	if (msg.error) p.reject(new Error(msg.error.message))
	else p.resolve(msg.result?.data)
})
function call(path, input) {
	const id = nextId++
	ws.send(JSON.stringify({ id, method: 'mutation', params: { path, input } }))
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject })
		setTimeout(() => pending.delete(id) && reject(new Error(`Timeout calling ${path}`)), 20000)
	})
}
/** first message of a subscription */
function first(path, input) {
	const id = nextId++
	return new Promise((resolve, reject) => {
		subs.set(id, (data) => {
			subs.delete(id)
			ws.send(JSON.stringify({ id, method: 'subscription.stop' }))
			resolve(data)
		})
		ws.send(JSON.stringify({ id, method: 'subscription', params: { path, input } }))
		setTimeout(() => subs.has(id) && reject(new Error(`Timeout watching ${path}`)), 10000)
	})
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findConnection() {
	const init = await first('instances.connections.watch', undefined)
	const list = Array.isArray(init) ? init.find((u) => u.type === 'init')?.info : init?.info
	for (const [id, c] of Object.entries(list || {})) if (c && c.label === label) return { id, ...c }
	return null
}

ws.addEventListener('error', () => {
	console.error(`Could not connect to Companion at ws://${host}/trpc`)
	process.exit(1)
})

ws.addEventListener('open', async () => {
	try {
		const err = await call('instances.modulesManager.installModuleTar', { tarBuffer: tar.toString('base64') })
		if (err && !/already/i.test(String(err))) throw new Error(String(err))
		console.log(`Module package ${path.basename(pkg)} installed${err ? ' (already present)' : ''}.`)
		await sleep(500)

		let conn = await findConnection()
		if (!conn) {
			const id = await call('instances.connections.add', { module: { type: 'companion-village' }, label, versionId: version })
			conn = { id }
			console.log(`Added connection "${label}".`)
		} else console.log(`Connection "${label}" already exists — updating its config.`)
		const res = await call('instances.connections.setConfig', { connectionId: conn.id, label, enabled: true, config: { port, bind: '', tribe, timeout: 5 } })
		if (res) throw new Error(String(res))
		console.log(`Configured: plays as ${tribe}, listening on port ${port}.`)

		if (withTrigger) {
			const trigger = {
				type: 'trigger_list', version: 12, companionBuild: '5.0.6',
				instances: { villageconn: { label, moduleId: 'companion-village', moduleVersionId: version, lastUpgradeIndex: -1, enabled: true } },
				triggers: {
					villageModuleTrigger01: {
						type: 'trigger',
						options: { name: `Village: every press = +1 year (${label})`, enabled: true, sortOrder: 0 },
						actions: [{
							id: 'villageModuleAction01', definitionId: 'add_years', connectionId: 'villageconn', type: 'action', children: {},
							options: { tribe: { isExpression: false, value: 'self' }, amount: { isExpression: false, value: 1 } },
						}],
						condition: [],
						events: [{ id: 'villageModuleEvent01', type: 'button_press', enabled: true, options: {} }],
						localVariables: [],
					},
				},
			}
			const file = Buffer.from(JSON.stringify(trigger))
			const sessionId = await call('importExport.prepareImport.start', { name: 'village-module-trigger.companionconfig', size: file.length })
			await call('importExport.prepareImport.uploadChunk', { sessionId, offset: 0, data: file.toString('base64') })
			const prepared = await call('importExport.prepareImport.complete', { sessionId, expectedChecksum: createHash('sha1').update(file).digest('hex'), userData: null })
			if (Array.isArray(prepared) && prepared[0]) throw new Error(`Import rejected: ${prepared[0]}`)
			await call('importExport.importTriggers', { selectedTriggerIds: ['villageModuleTrigger01'], connectionIdRemapping: { villageconn: conn.id }, replaceExisting: false })
			console.log('Added a trigger: every button press on this Companion adds a year to its tribe.')
		}
		console.log(`\nNow open Companion Village → Settings → Companion module and enter: ${host.split(':')[0]}:${port}`)
		process.exit(0)
	} catch (e) {
		console.error('Install failed:', e.message)
		process.exit(1)
	}
})
