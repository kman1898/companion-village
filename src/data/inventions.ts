import type { TribeId } from './tribes'

export interface Invention {
	id: string
	name: string
	icon: string
	desc: string
	era: number
	req?: string[]
	/** signature invention only this tribe can make */
	tribe?: TribeId
}

export interface Era {
	name: string
	/** inventions needed from the previous era before this era's inventions can appear */
	gate: number
	banner: string
}

export const ERAS: Era[] = [
	{ name: 'Medieval', gate: 0, banner: '' },
	{ name: 'Industrial Age', gate: 12, banner: 'Smokestacks rise and brick replaces timber' },
	{ name: 'Modern Age', gate: 5, banner: 'Electric light, motor cars and glass towers' },
	{ name: 'Space Age', gate: 5, banner: 'Rockets roar on the launch pads' },
	{ name: 'Sci-Fi Future', gate: 4, banner: 'Hovercars, force fields and androids' },
]

/** One random invention every few years (from those whose requirements are met). */
export const INVENTIONS: Invention[] = [
	// ---------------- Medieval ----------------
	{ era: 0, id: 'wheelbarrow', name: 'Wheelbarrow', icon: '🛒', desc: 'Builders haul two loads per trip.' },
	{ era: 0, id: 'smelting', name: 'Smelting', icon: '🔥', desc: 'Stonemasons sometimes bring back double.' },
	{ era: 0, id: 'ironTools', name: 'Iron Tools', icon: '⚒️', desc: 'Chopping and quarrying are 35% faster.', req: ['smelting'] },
	{ era: 0, id: 'cropRotation', name: 'Crop Rotation', icon: '🌱', desc: 'Crops grow 35% faster.' },
	{ era: 0, id: 'irrigation', name: 'Irrigation', icon: '💧', desc: 'Crops grow faster; locusts do less harm.', req: ['cropRotation'] },
	{ era: 0, id: 'plough', name: 'Ox Plough', icon: '🐂', desc: 'Every harvest yields an extra sack of grain.' },
	{ era: 0, id: 'masonry', name: 'Masonry', icon: '🧱', desc: 'Unlocks Stone Houses and Wells.' },
	{ era: 0, id: 'carpentry', name: 'Carpentry', icon: '🪚', desc: 'Building goes 25% faster. Unlocks the Sawmill.' },
	{ era: 0, id: 'granaries', name: 'Granaries', icon: '📦', desc: 'Unlocks the Granary storehouse.' },
	{ era: 0, id: 'milling', name: 'Milling', icon: '🌬️', desc: 'Unlocks the Windmill.', req: ['cropRotation'] },
	{ era: 0, id: 'baking', name: 'Baking', icon: '🍞', desc: 'Unlocks the Bakery.' },
	{ era: 0, id: 'brewing', name: 'Brewing', icon: '🍺', desc: 'Unlocks the Tavern.' },
	{ era: 0, id: 'coinage', name: 'Coinage', icon: '🪙', desc: 'Unlocks the Market.', req: ['smelting'] },
	{ era: 0, id: 'bellCasting', name: 'Bell Casting', icon: '🔔', desc: 'Unlocks the Chapel.', req: ['smelting'] },
	{ era: 0, id: 'printing', name: 'Printing Press', icon: '📜', desc: 'Unlocks the Library.', req: ['carpentry'] },
	{ era: 0, id: 'clockmaking', name: 'Clockmaking', icon: '🕰️', desc: 'Unlocks the Clock Tower.', req: ['smelting', 'masonry'] },
	{ era: 0, id: 'fortification', name: 'Fortification', icon: '🛡️', desc: 'Unlocks the Watchtower. Raiders face stiffer defence.', req: ['masonry'] },
	{ era: 0, id: 'castleBuilding', name: 'Castle Building', icon: '👑', desc: 'Unlocks the Castle Keep.', req: ['fortification', 'carpentry'] },
	{ era: 0, id: 'plumbing', name: 'Plumbing', icon: '⛲', desc: 'Unlocks the Fountain. Clean water keeps dysentery and cholera away.', req: ['masonry'] },
	{ era: 0, id: 'pavedRoads', name: 'Paved Roads', icon: '🛣️', desc: 'Cobbled streets — villagers walk 20% faster.', req: ['masonry'] },
	{ era: 0, id: 'cartography', name: 'Forestry', icon: '🌲', desc: 'Felled forests regrow twice as fast.' },
	{ era: 0, id: 'medicine', name: 'Herbal Medicine', icon: '🌿', desc: 'Plague and everyday sickness are less deadly.' },
	{ era: 0, id: 'lightningRods', name: 'Lightning Rods', icon: '⚡', desc: 'Lightning rarely sets buildings alight.', req: ['smelting'] },
	{ era: 0, id: 'stormCellars', name: 'Storm Cellars', icon: '🕳️', desc: 'Nobody dies in tornadoes any more.' },
	{ era: 0, id: 'astronomy', name: 'Astronomy', icon: '🔭', desc: 'Meteors are spotted early and villagers flee.', req: ['printing'] },
	{ era: 0, id: 'fireBrigade', name: 'Bucket Brigade', icon: '🪣', desc: 'Fires burn out twice as fast and never spread.', req: ['masonry'] },
	{ era: 0, id: 'husbandry', name: 'Animal Husbandry', icon: '🐑', desc: 'Sheep graze around the farms and add food.' },
	{ era: 0, id: 'festivals', name: 'Folk Festivals', icon: '🎉', desc: 'Festivals happen far more often.' },
	{ era: 0, id: 'siegecraft', name: 'Siegecraft', icon: '🪨', desc: 'Catapults join the army.', req: ['carpentry'] },
	{ era: 0, id: 'tradeRoutes', name: 'Trade Routes', icon: '🐫', desc: 'Caravans travel more often and carry more.' },
	{ era: 1, id: 'diplomats', name: 'Embassies', icon: '🕊️', desc: 'Relations with the other tribes slowly improve.' },
	{ era: 1, id: 'artillery', name: 'Artillery', icon: '💣', desc: 'Cannons join the army.', req: ['steamEngine'] },
	// ---------------- signature inventions (one per era for each tribe) ----------------
	{ era: 0, tribe: 'pixels', id: 'mosaics', name: 'Mosaics', icon: '🟦', desc: 'Pixel art everywhere. Pixel fighters hit harder.' },
	{ era: 1, tribe: 'pixels', id: 'photography', name: 'Photography', icon: '📷', desc: 'Flash bombs! Pixel fighters hit harder.' },
	{ era: 2, tribe: 'pixels', id: 'television', name: 'Television', icon: '📺', desc: 'Everyone watches the Pixels — relations improve.' },
	{ era: 3, tribe: 'pixels', id: 'ledWalls', name: 'LED Walls', icon: '🟩', desc: 'Giant screens; Pixel fighters hit harder.' },
	{ era: 4, tribe: 'pixels', id: 'holograms', name: 'Holograms', icon: '👤', desc: 'Hologram decoys confuse every attacker.' },
	{ era: 0, tribe: 'noises', id: 'warDrums', name: 'War Drums', icon: '🥁', desc: 'Noise fighters march faster and hit harder.' },
	{ era: 1, tribe: 'noises', id: 'phonograph', name: 'Phonograph', icon: '📯', desc: 'Recorded music — festivals more often.' },
	{ era: 2, tribe: 'noises', id: 'loudspeakers', name: 'Loudspeakers', icon: '📢', desc: 'Sonic blasts reach further.' },
	{ era: 3, tribe: 'noises', id: 'subwoofers', name: 'Subwoofers', icon: '🔈', desc: 'Bass so deep it cracks enemy walls.' },
	{ era: 4, tribe: 'noises', id: 'sonicCannon', name: 'Sonic Cannon', icon: '💥', desc: 'The loudest weapon ever built.' },
	{ era: 0, tribe: 'lampys', id: 'lanterns', name: 'Lanterns', icon: '🏮', desc: 'Street lanterns light the village at night.' },
	{ era: 1, tribe: 'lampys', id: 'limelight', name: 'Limelight', icon: '🔦', desc: 'Blinding beams — Lampy fighters hit harder.' },
	{ era: 2, tribe: 'lampys', id: 'movingHeads', name: 'Moving Heads', icon: '🎇', desc: 'Light shows that impress everyone — relations improve.' },
	{ era: 3, tribe: 'lampys', id: 'lasers', name: 'Lasers', icon: '🔴', desc: 'Lampy fighters hit much harder.' },
	{ era: 4, tribe: 'lampys', id: 'photonLances', name: 'Photon Lances', icon: '✴️', desc: 'Pure light weaponry.' },
	// ---------------- Industrial ----------------
	{ era: 1, id: 'brickworks', name: 'Brickworks', icon: '🏭', desc: 'Brick townhouses — builders start modernising old homes.' },
	{ era: 1, id: 'steamEngine', name: 'Steam Engine', icon: '♨️', desc: 'Unlocks the Factory. Gatherers work 25% faster.' },
	{ era: 1, id: 'gasLighting', name: 'Gas Lighting', icon: '🏮', desc: 'Gas street lamps light the village at night.' },
	{ era: 1, id: 'railway', name: 'Railway', icon: '🚂', desc: 'A steam train runs between the three villages.', req: ['steamEngine'] },
	{ era: 1, id: 'vaccination', name: 'Vaccination', icon: '💉', desc: 'The plague barely takes anyone, and the pox is beaten.' },
	{ era: 1, id: 'telegraph', name: 'Telegraph', icon: '📠', desc: 'Raids are reported early — the militia is ready.' },
	{ era: 1, id: 'canning', name: 'Canning', icon: '🥫', desc: 'Harvests keep longer: +1 food per harvest.' },
	// ---------------- Modern ----------------
	{ era: 2, id: 'electricity', name: 'Electricity', icon: '💡', desc: 'Electric lights and modern homes.' },
	{ era: 2, id: 'automobile', name: 'Automobile', icon: '🚗', desc: 'Cars drive around the streets.', req: ['electricity'] },
	{ era: 2, id: 'asphalt', name: 'Asphalt', icon: '🛤️', desc: 'Tarmac roads with painted lines.' },
	{ era: 2, id: 'radio', name: 'Radio', icon: '📻', desc: 'Music everywhere — more festivals.', req: ['electricity'] },
	{ era: 2, id: 'skyscrapers', name: 'Skyscrapers', icon: '🏙️', desc: 'Unlocks glass towers that house many villagers.', req: ['electricity'] },
	{ era: 2, id: 'airplanes', name: 'Aviation', icon: '✈️', desc: 'Aeroplanes cross the sky.' },
	{ era: 2, id: 'computers', name: 'Computers', icon: '💻', desc: 'Everyone works 15% faster.', req: ['electricity'] },
	{ era: 2, id: 'antibiotics', name: 'Antibiotics', icon: '💊', desc: 'Fever, dysentery and cholera pass quickly and rarely kill.', req: ['vaccination'] },
	{ era: 2, id: 'windTurbines', name: 'Wind Turbines', icon: '🌀', desc: 'Unlocks the Wind Farm.', req: ['electricity'] },
	// ---------------- Space Age ----------------
	{ era: 3, id: 'rocketry', name: 'Rocketry', icon: '🚀', desc: 'Unlocks the Launch Pad.' },
	{ era: 3, id: 'satellites', name: 'Satellites', icon: '🛰️', desc: 'Early warning for meteors and storms.', req: ['rocketry'] },
	{ era: 3, id: 'robotics', name: 'Robotics', icon: '🦾', desc: 'Robot arms help builders — construction 30% faster.' },
	{ era: 3, id: 'fusionPower', name: 'Fusion Power', icon: '⚛️', desc: 'Unlocks the Fusion Reactor.' },
	{ era: 3, id: 'spaceHabitats', name: 'Space Habitats', icon: '🛸', desc: 'Domed habitat homes.', req: ['rocketry'] },
	{ era: 3, id: 'geneticCrops', name: 'Genetic Crops', icon: '🧬', desc: 'Crops grow twice as fast.' },
	// ---------------- Sci-fi ----------------
	{ era: 4, id: 'hovercars', name: 'Hovercars', icon: '🚘', desc: 'Cars float above glowing light-lanes.' },
	{ era: 4, id: 'antigravity', name: 'Antigravity', icon: '🪐', desc: 'Floating sky-pods and the Arcology.' },
	{ era: 4, id: 'forceFields', name: 'Force Fields', icon: '🛡️', desc: 'A shield dome stops meteors, tornadoes and raiders.' },
	{ era: 4, id: 'teleporters', name: 'Teleporters', icon: '🌀', desc: 'Villagers teleport across town.' },
	{ era: 4, id: 'androids', name: 'Androids', icon: '🤖', desc: 'Some new arrivals are androids. They never sleep.' },
	{ era: 4, id: 'weatherControl', name: 'Weather Control', icon: '🌤️', desc: 'No more storms, tornadoes or blizzards.', req: ['forceFields'] },
	{ era: 4, id: 'nanomedicine', name: 'Nanomedicine', icon: '🧫', desc: 'Nanobots stop almost any illness from spreading or killing.' },
	{ era: 4, id: 'replicators', name: 'Replicators', icon: '✨', desc: 'Materials and food appear out of thin air.' },
	{ era: 4, id: 'starship', name: 'Colony Starship', icon: '🌌', desc: 'Build a starship and send settlers to the stars.', req: ['antigravity'] },
]

export const INV_BY_ID = new Map(INVENTIONS.map((i) => [i.id, i]))
