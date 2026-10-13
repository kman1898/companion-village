export type TribeId = 'pixels' | 'noises' | 'lampys'
export const TRIBE_IDS: TribeId[] = ['pixels', 'noises', 'lampys']

export interface TribeInfo {
	name: string
	icon: string
	dept: string
	blurb: string
	color: string
	accent: string
	dark: string
	roofs: string[]
	/** how their fighters attack */
	weapon: 'pixel' | 'ring' | 'beam'
	defaultVar: string
	defaultCmd: string
}

export const TRIBES: Record<TribeId, TribeInfo> = {
	pixels: {
		name: 'Pixels', icon: '🎥', dept: 'Video',
		blurb: 'Camera crews and screen wizards. They build towering LED walls and fight with blinding glitches.',
		color: '#3ad1ff', accent: '#ff3d9a', dark: '#12384a',
		roofs: ['#2f7fbf', '#3a9ad1', '#5a5fd6', '#2fa89a', '#c0408a', '#4a6a8a'],
		weapon: 'pixel', defaultVar: 'village_pixels', defaultCmd: 'village_pixels_cmd',
	},
	noises: {
		name: 'Noises', icon: '🔊', dept: 'Sound',
		blurb: 'Drummers, sound engineers and bass enthusiasts. Their PA towers shake the ground.',
		color: '#8f7cff', accent: '#c6b8ff', dark: '#251d40',
		roofs: ['#5b4a8a', '#6f5bd6', '#4a3f6a', '#7a4a8a', '#3d2f66', '#5a5f7a'],
		weapon: 'ring', defaultVar: 'village_noises', defaultCmd: 'village_noises_cmd',
	},
	lampys: {
		name: 'Lampys', icon: '💡', dept: 'Lights',
		blurb: 'Torch-bearers and beam-slingers. Their towers paint the night sky with colour.',
		color: '#ffb43a', accent: '#ffe07a', dark: '#3a2a14',
		roofs: ['#c9762a', '#d99a2a', '#b4553c', '#e0a030', '#a8633a', '#c8442f'],
		weapon: 'beam', defaultVar: 'village_lampys', defaultCmd: 'village_lampys_cmd',
	},
}

/** Flavour text. {a} = acting tribe, {b} = other tribe. */
export const LINES = {
	incidentBad: [
		'{a} say {b} left a light on in the middle of their broadcast',
		'{b} unplugged {a}’s amp to charge a phone',
		'{a} caught {b} using their gaffer tape without asking',
		'{b} mixed {a}’s band so loud the windows cracked',
		'{a} say {b}’s strobe ruined a whole day of filming',
		'{b} parked a truss right in {a}’s sightline',
		'{a} found {b}’s cables coiled the wrong way. Unforgivable.',
		'{b} called {a}’s favourite colour temperature “ugly”',
		'{a} hear a mysterious hum coming from {b}’s side of the border',
	],
	incidentGood: [
		'{a} lent {b} a spare power distro',
		'{a} and {b} shared a pizza at load-in',
		'{b} helped {a} untangle a 50-metre cable',
		'{a} fixed {b}’s flickering fixture for free',
		'{a} and {b} agree: the show must go on',
	],
	war: [
		'{a} declare war on {b}! “That was the last missed cue!”',
		'{a} have had enough of {b}. War!',
		'Talks have broken down — {a} march against {b}!',
	],
	peace: [
		'{a} and {b} sign a peace treaty over coffee at catering',
		'{a} and {b} call a truce — there’s a show to put on',
	],
	alliance: ['{a} and {b} form an alliance', '{a} and {b} agree to share a truck from now on'],
	trade: ['{a} traded with {b}', 'A caravan from {a} reached {b}'],
	gift: ['{a} sent {b} a gift', '{a} sent {b} a box of spare lamps and batteries'],
	tech: ['{a} taught {b} the secret of {t}', '{b} learned {t} from their friends in {a}'],
	spy: ['A spy from {a} stole the secret of {t} from {b}!', '{a} peeked at {b}’s notes and learned {t}'],
}

/** Siege engine for each era: catapult, cannon, tank, drone, mech */
export const SIEGE_NAMES = ['catapult', 'cannon', 'tank', 'drone swarm', 'battle mech']
