export interface Invention {
	id: string
	name: string
	icon: string
	desc: string
	req?: string[]
}

/** One random invention arrives every 10 years (from those whose requirements are met). */
export const INVENTIONS: Invention[] = [
	{ id: 'wheelbarrow', name: 'Wheelbarrow', icon: '🛒', desc: 'Builders haul two loads per trip.' },
	{ id: 'smelting', name: 'Smelting', icon: '🔥', desc: 'Stonemasons sometimes bring back double.' },
	{ id: 'ironTools', name: 'Iron Tools', icon: '⚒️', desc: 'Chopping and quarrying are 35% faster.', req: ['smelting'] },
	{ id: 'cropRotation', name: 'Crop Rotation', icon: '🌱', desc: 'Crops grow 35% faster.' },
	{ id: 'irrigation', name: 'Irrigation', icon: '💧', desc: 'Crops grow faster; locusts do less harm.', req: ['cropRotation'] },
	{ id: 'plough', name: 'Ox Plough', icon: '🐂', desc: 'Every harvest yields an extra sack of grain.' },
	{ id: 'masonry', name: 'Masonry', icon: '🧱', desc: 'Unlocks Stone Houses and Wells.' },
	{ id: 'carpentry', name: 'Carpentry', icon: '🪚', desc: 'Building goes 25% faster. Unlocks the Sawmill.' },
	{ id: 'granaries', name: 'Granaries', icon: '📦', desc: 'Unlocks the Granary storehouse.' },
	{ id: 'milling', name: 'Milling', icon: '🌬️', desc: 'Unlocks the Windmill.', req: ['cropRotation'] },
	{ id: 'baking', name: 'Baking', icon: '🍞', desc: 'Unlocks the Bakery.' },
	{ id: 'brewing', name: 'Brewing', icon: '🍺', desc: 'Unlocks the Tavern.' },
	{ id: 'coinage', name: 'Coinage', icon: '🪙', desc: 'Unlocks the Market.', req: ['smelting'] },
	{ id: 'bellCasting', name: 'Bell Casting', icon: '🔔', desc: 'Unlocks the Chapel.', req: ['smelting'] },
	{ id: 'printing', name: 'Printing Press', icon: '📜', desc: 'Unlocks the Library.', req: ['carpentry'] },
	{ id: 'clockmaking', name: 'Clockmaking', icon: '🕰️', desc: 'Unlocks the Clock Tower.', req: ['smelting', 'masonry'] },
	{ id: 'fortification', name: 'Fortification', icon: '🛡️', desc: 'Unlocks the Watchtower.', req: ['masonry'] },
	{ id: 'castleBuilding', name: 'Castle Building', icon: '👑', desc: 'Unlocks the Castle Keep.', req: ['fortification', 'carpentry'] },
	{ id: 'plumbing', name: 'Plumbing', icon: '⛲', desc: 'Unlocks the Fountain.', req: ['masonry'] },
	{ id: 'pavedRoads', name: 'Paved Roads', icon: '🛣️', desc: 'Cobbled streets — villagers walk 20% faster.', req: ['masonry'] },
	{ id: 'cartography', name: 'Forestry', icon: '🌲', desc: 'Felled forests regrow twice as fast.' },
	{ id: 'medicine', name: 'Herbal Medicine', icon: '🌿', desc: 'The plague is half as deadly.' },
	{ id: 'lightningRods', name: 'Lightning Rods', icon: '⚡', desc: 'Lightning rarely sets buildings alight.', req: ['smelting'] },
	{ id: 'stormCellars', name: 'Storm Cellars', icon: '🕳️', desc: 'Nobody dies in tornadoes any more.' },
	{ id: 'astronomy', name: 'Astronomy', icon: '🔭', desc: 'Meteors are spotted early and villagers flee.', req: ['printing'] },
	{ id: 'fireBrigade', name: 'Bucket Brigade', icon: '🪣', desc: 'Fires burn out twice as fast and never spread.', req: ['masonry'] },
	{ id: 'husbandry', name: 'Animal Husbandry', icon: '🐑', desc: 'Sheep graze around the farms and add food.' },
	{ id: 'festivals', name: 'Folk Festivals', icon: '🎉', desc: 'Festivals happen far more often.' },
]

export const INV_BY_ID = new Map(INVENTIONS.map((i) => [i.id, i]))

export function eraName(inventions: number): string {
	if (inventions < 3) return 'Founding Era'
	if (inventions < 7) return 'Village Era'
	if (inventions < 12) return 'Market Town'
	if (inventions < 18) return 'Age of Guilds'
	if (inventions < INVENTIONS.length) return 'Age of Wonders'
	return 'Golden Age'
}
