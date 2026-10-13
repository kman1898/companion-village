#!/usr/bin/env node
// Installs the "Village: count button presses" trigger into a running Companion (v4/v5)
// by driving the same import flow the web UI uses (tRPC over websocket).
//
// Usage: node tools/install-trigger.mjs [host:port]      (default localhost:8888)
//
// Alternative without this script: Companion web UI -> Import / Export -> Import
// and pick village-trigger.companionconfig, then import the trigger.

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const host = process.argv[2] || 'localhost:8888'
const here = path.dirname(fileURLToPath(import.meta.url))
const file = readFileSync(path.join(here, 'village-trigger.companionconfig'))
const config = JSON.parse(file.toString('utf8'))
const triggerIds = Object.keys(config.triggers)

if (typeof WebSocket === 'undefined') {
	console.error('This script needs Node.js 22 or newer (global WebSocket).')
	process.exit(1)
}

const ws = new WebSocket(`ws://${host}/trpc`)
let nextId = 1
const pending = new Map()

ws.addEventListener('message', (ev) => {
	const msg = JSON.parse(ev.data)
	const p = pending.get(msg.id)
	if (!p) return
	pending.delete(msg.id)
	if (msg.error) p.reject(new Error(process.env.DEBUG ? JSON.stringify(msg.error) : msg.error.message))
	else p.resolve(msg.result?.data)
})

function call(path, input) {
	const id = nextId++
	ws.send(JSON.stringify({ id, method: 'mutation', params: { path, input } }))
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject })
		setTimeout(() => {
			if (pending.delete(id)) reject(new Error(`Timeout calling ${path}`))
		}, 10000)
	})
}

async function triggerAlreadyInstalled() {
	try {
		const res = await fetch(`http://${host}/int/export/triggers/all?format=json`)
		const all = await res.json()
		return Object.values(all.triggers || {}).some((t) => t?.options?.name === config.triggers[triggerIds[0]].options.name)
	} catch {
		return false
	}
}

ws.addEventListener('error', () => {
	console.error(`Could not connect to Companion at ws://${host}/trpc`)
	process.exit(1)
})

ws.addEventListener('open', async () => {
	try {
		if (await triggerAlreadyInstalled()) {
			console.log('Trigger "Village: count button presses" already exists, nothing to do.')
			process.exit(0)
		}

		const sessionId = await call('importExport.prepareImport.start', {
			name: 'village-trigger.companionconfig',
			size: file.length,
		})
		await call('importExport.prepareImport.uploadChunk', { sessionId, offset: 0, data: file.toString('base64') })
		const checksum = createHash('sha1').update(file).digest('hex')
		const prepared = await call('importExport.prepareImport.complete', { sessionId, expectedChecksum: checksum, userData: null })
		if (Array.isArray(prepared) && prepared[0]) throw new Error(`Import rejected: ${prepared[0]}`)

		await call('importExport.importTriggers', {
			selectedTriggerIds: triggerIds,
			connectionIdRemapping: {},
			replaceExisting: false,
		})
		console.log('Installed trigger "Village: count button presses".')
		console.log('Every button press now increments $(custom:village_presses).')
		process.exit(0)
	} catch (e) {
		console.error('Install failed:', e.message)
		process.exit(1)
	}
})
