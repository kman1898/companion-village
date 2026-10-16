import { networkInterfaces } from 'node:os'
import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { DEFAULT_PORT, GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, UpdateVariableValues, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { VillageServer } from './server.js'
import { DeskCounter } from './desks.js'
import { TRIBES, type TribeId, type VillageAction, type VillageState, type VillageTribeState } from './protocol.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

const ALL_FEEDBACKS = [
	'connected',
	'at_war',
	'under_attack',
	'attacking',
	'allied',
	'stance',
	'event_active',
	'era_reached',
	'is_leader',
	'is_viewed',
	'night',
	'paused',
	'tribe_color',
	'desk_scoring',
] as const

/** a number from the config, where 0 is a valid value */
const num = (v: unknown, def: number): number =>
	v === '' || v === undefined || v === null || isNaN(Number(v)) ? def : Number(v)

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig
	state: VillageState | null = null
	lastSync = 0
	readonly server = new VillageServer({
		onState: (st) => this.#onState(st),
		log: (level, msg) => this.log(level, msg),
		tribe: () => this.config.tribe,
		label: () => this.label,
	})
	readonly desks = new DeskCounter(
		() => ({
			gapMs: this.config.deskGap,
			togetherMs: this.config.deskTogether,
			recallCount: this.config.deskRecall,
			repeatMs: this.config.deskRepeat * 1000,
			perMinute: this.config.deskPerMinute,
		}),
		(desk, control) => {
			this.send({ type: 'press', tribe: desk.tribe, n: 1 })
			this.log('debug', `Desk ${desk.name}: ${control} → +1 year for ${desk.tribe}`)
			this.#dirty = true
		},
	)
	#timer: NodeJS.Timeout | null = null
	#dirty = false
	#wasConnected = false

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = this.#withDefaults(config)
		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariableDefinitions()
		UpdateVariableValues(this, null)
		await this.#startServer()
		// refresh variables/feedbacks at most 4× a second, and notice when the page goes away
		this.#timer = setInterval(() => this.#tick(), 250)
	}

	async destroy(): Promise<void> {
		if (this.#timer) clearInterval(this.#timer)
		this.#timer = null
		await this.server.stop()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		const before = this.config
		this.config = this.#withDefaults(config)
		if (before.port !== this.config.port || before.bind !== this.config.bind) await this.#startServer()
		if (before.tribe !== this.config.tribe) {
			this.updatePresets()
			this.#dirty = true
		}
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	/** "self" means the tribe configured for this Companion */
	resolveTribe(t: string): TribeId {
		if (t === 'self' || !TRIBES.some((x) => x.id === t)) return this.config.tribe
		return t as TribeId
	}

	tribeState(t: string): VillageTribeState | null {
		const id = this.resolveTribe(t)
		return this.state?.tribes.find((x) => x.id === id) ?? null
	}

	/** Where to open the village: this machine's LAN address (or localhost) and the module's port */
	villageUrl(): string {
		let host = this.config.bind && this.config.bind !== '0.0.0.0' && this.config.bind !== '::' ? this.config.bind : ''
		if (!host) {
			for (const list of Object.values(networkInterfaces())) {
				const ip = list?.find((a) => a.family === 'IPv4' && !a.internal)
				if (ip) {
					host = ip.address
					break
				}
			}
		}
		return `http://${host || 'localhost'}:${this.config.port}/`
	}

	isConnected(): boolean {
		return Date.now() - this.lastSync < this.config.timeout * 1000
	}

	/** Something changed on the variables of the desk monitor (refresh them soon) */
	deskChanged(): void {
		this.#dirty = true
	}

	/** Queue an action for the village page(s) */
	send(action: VillageAction): void {
		this.server.push(action)
		if (!this.isConnected()) this.log('debug', `Queued ${action.type} — no village page connected right now`)
	}

	#withDefaults(c: Partial<ModuleConfig>): ModuleConfig {
		return {
			port: Number(c.port) || DEFAULT_PORT,
			bind: c.bind || '',
			tribe: (TRIBES.some((t) => t.id === c.tribe) ? c.tribe : 'pixels') as TribeId,
			timeout: Number(c.timeout) || 5,
			deskGap: num(c.deskGap, 800),
			deskTogether: num(c.deskTogether, 300),
			deskRecall: num(c.deskRecall, 8),
			deskRepeat: num(c.deskRepeat, 2),
			deskPerMinute: num(c.deskPerMinute, 30),
		}
	}

	async #startServer() {
		try {
			await this.server.start(this.config.port, this.config.bind)
			this.log('info', `Companion Village is at ${this.villageUrl()}${this.server.html ? '' : ' (page not bundled)'}`)
			this.updateStatus(InstanceStatus.Connecting, `Open ${this.villageUrl()} in a browser`)
			this.#dirty = true
		} catch (e) {
			const msg =
				(e as NodeJS.ErrnoException).code === 'EADDRINUSE'
					? `Port ${this.config.port} is already in use`
					: (e as Error).message
			this.log('error', msg)
			this.updateStatus(InstanceStatus.BadConfig, msg)
		}
	}

	#onState(st: VillageState) {
		this.state = st
		this.lastSync = Date.now()
		this.#dirty = true
	}

	#tick() {
		if (this.desks.flush()) this.#dirty = true
		const connected = this.isConnected()
		if (connected !== this.#wasConnected) {
			this.#wasConnected = connected
			this.#dirty = true
			if (this.server.running)
				this.updateStatus(
					connected ? InstanceStatus.Ok : InstanceStatus.Connecting,
					connected
						? `${this.server.livePages(this.config.timeout * 1000)} village page(s) connected`
						: `Waiting for the village page (port ${this.config.port})`,
				)
		}
		if (!this.#dirty) return
		this.#dirty = false
		UpdateVariableValues(this, this.state)
		this.checkFeedbacks(...ALL_FEEDBACKS)
	}
}
