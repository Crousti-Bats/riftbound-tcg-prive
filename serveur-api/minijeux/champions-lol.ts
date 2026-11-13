/**
 * Les champions de League of Legends pour « Devine le champion » (demandé le 2026-11-13 : « avec tous les champions de
 * LoL on puisse les deviner »). Ce ne sont pas des données de cartes Riftbound : c'est une table fixe, écrite à la main.
 * - Nom français, ressource et portée : Data Dragon de Riot (version VERSION_DDRAGON).
 * - Genre, postes, espèces, régions, année de sortie et emojis : écrits à la main, à corriger ici si besoin.
 *
 * Une ligne : identifiant Data Dragon | nom | genre (M, F, A = autre) | postes (H haut, J jungle, M milieu, B bas,
 * S support) | espèces | ressource | portée | régions | année de sortie | 5 emojis (mode Emoji).
 * Les listes sont séparées par des virgules.
 */

/** Version des icônes Data Dragon (contient tous les champions de la table). */
export const VERSION_DDRAGON = "16.22.1";
export const PREFIXE_ICONES = "https://ddragon.leagueoflegends.com/cdn/";

const TABLE = `
Aatrox|Aatrox|M|H|Darkin|Puits de sang|Mêlée|Runeterra|2013|⚔️🩸😈🪽👹
Ahri|Ahri|F|M|Vastaya|Mana|Distance|Ionia|2011|🦊💋🔮💖🌙
Akali|Akali|F|H,M|Humain|Énergie|Mêlée|Ionia|2010|🥷💨🌫️🔪🎤
Akshan|Akshan|M|M,H|Humain|Mana|Distance|Shurima|2021|🪝💎🧣🔫😎
Alistar|Alistar|M|S|Minotaure|Mana|Mêlée|Runeterra|2009|🐮👃💥🥛🔔
Ambessa|Ambessa|F|H|Humain|Énergie|Mêlée|Noxus|2024|🐺⚔️👑🛡️🗡️
Amumu|Amumu|M|J,S|Yordle,Mort-vivant|Mana|Mêlée|Shurima|2009|😭🩹🧟💔🌀
Anivia|Anivia|F|M|Dieu|Mana|Distance|Freljord|2009|🐦❄️🥚🧊🕊️
Annie|Annie|F|M,S|Humain,Altéré magiquement|Mana|Distance|Noxus|2009|🧸🔥👧🐻💥
Aphelios|Aphelios|M|B|Humain,Altéré magiquement|Mana|Distance|Targon|2019|🌙🔫🌑🪐🌸
Ashe|Ashe|F|B,S|Humain,Né de la glace|Mana|Distance|Freljord|2009|🏹❄️👑🦅🧊
AurelionSol|Aurelion Sol|M|M|Céleste,Dragon|Mana|Distance|Targon|2016|🐉🌌⭐🪐☄️
Aurora|Aurora|F|M,H|Vastaya|Mana|Distance|Freljord|2024|🐰✨🦌🌀❄️
Azir|Azir|M|M|Ascensionné|Mana|Distance|Shurima|2014|🦅🏜️👑🏛️🪖
Bard|Bard|M|S|Céleste|Mana|Distance|Runeterra|2015|🔔🎵🌌👾⏸️
Belveth|Bel'Veth|F|J|Être du Néant|Sans ressource|Mêlée|Néant|2022|🦋👑🌊🟣🍽️
Blitzcrank|Blitzcrank|A|S|Golem|Mana|Mêlée|Zaun|2009|🤖🦾🪝⚡🧲
Brand|Brand|M|S,M|Humain,Altéré magiquement|Mana|Distance|Freljord|2011|🔥💀🌋🪵🧑‍🚒
Braum|Braum|M|S|Humain,Né de la glace|Mana|Mêlée|Freljord|2014|🛡️🥸💪🚪❄️
Briar|Briar|F|J|Humain,Altéré magiquement|Fureur|Mêlée|Noxus|2023|🩸🦷⛓️🏃‍♀️😋
Caitlyn|Caitlyn|F|B|Humain|Mana|Distance|Piltover|2011|🎩🔫🪤🧁👮‍♀️
Camille|Camille|F|H|Humain,Cyborg|Mana|Mêlée|Piltover|2016|🦵✂️🪝🧑‍🔬💎
Cassiopeia|Cassiopeia|F|M|Humain,Altéré magiquement|Mana|Distance|Noxus,Shurima|2010|🐍💚🪨👁️💋
Chogath|Cho'Gath|M|H|Être du Néant|Mana|Mêlée|Néant|2009|🦖🍖😋🌋🐛
Corki|Corki|M|M,B|Yordle|Mana|Distance|Bandle|2009|🚁📦🚀👨‍✈️🥸
Darius|Darius|M|H|Humain|Mana|Mêlée|Noxus|2012|🪓🩸💪🗡️💀
Diana|Diana|F|J,M|Humain,Altéré magiquement|Mana|Mêlée|Targon|2012|🌙🌑⚔️🌗💜
Draven|Draven|M|B|Humain|Mana|Distance|Noxus|2012|🪓🌀😎🤑🎤
DrMundo|Dr. Mundo|M|H,J|Humain,Altéré chimiquement|Sans ressource|Mêlée|Zaun|2009|💉🧪🪓💪🤪
Ekko|Ekko|M|J,M|Humain|Mana|Mêlée|Zaun|2015|⏰🔄🏏⏳🧑‍🎤
Elise|Elise|F|J|Humain,Altéré magiquement|Mana|Mêlée,Distance|Noxus,Îles Obscures|2012|🕷️🕸️👸🖤🕯️
Evelynn|Evelynn|F|J|Démon|Mana|Mêlée|Runeterra|2009|😈💋👠🖤🫦
Ezreal|Ezreal|M|B|Humain|Mana|Distance|Piltover|2010|🧭✨🏹🗺️😁
Fiddlesticks|Fiddlesticks|A|J|Démon|Mana|Distance|Runeterra|2009|🌾👻🐦😱🎃
Fiora|Fiora|F|H|Humain|Mana|Mêlée|Demacia|2012|🤺🌹🗡️💃🏆
Fizz|Fizz|M|M|Yordle|Mana|Mêlée|Bilgewater|2011|🐟🔱🦈🌊😜
Galio|Galio|M|M,S|Golem|Mana|Mêlée|Demacia|2010|🗿🪽🛡️🏛️🦅
Gangplank|Gangplank|M|H,M|Humain|Mana|Mêlée|Bilgewater|2009|🏴‍☠️🍊💣🦜⚓
Garen|Garen|M|H|Humain|Sans ressource|Mêlée|Demacia|2010|🗡️🌀🛡️💪⚖️
Gnar|Gnar|M|H|Yordle|Rage|Mêlée,Distance|Freljord|2014|🦴🦖😡🪨🐾
Gragas|Gragas|M|J,H,S|Humain|Mana|Mêlée|Freljord|2010|🍺🛢️🤰🍻💥
Graves|Graves|M|J|Humain|Mana|Distance|Bilgewater|2011|🔫🚬🃏💨🥃
Gwen|Gwen|F|H,J|Altéré magiquement|Mana|Mêlée|Îles Obscures|2021|✂️🧵🪡🎀☁️
Hecarim|Hecarim|M|J|Mort-vivant|Mana|Mêlée|Îles Obscures|2012|🐴👻⚔️🏇🌫️
Heimerdinger|Heimerdinger|M|M,H,S|Yordle|Mana|Distance|Piltover|2009|🔧🤖🧪🎓🗼
Hwei|Hwei|M|M,S|Humain|Mana|Distance|Ionia|2023|🎨🖌️🖼️🌈😶
Illaoi|Illaoi|F|H|Humain|Mana|Mêlée|Bilgewater|2015|🐙🦑🗿🌊💪
Irelia|Irelia|F|H,M|Humain|Mana|Mêlée|Ionia|2010|🗡️💃🌸🪭⚔️
Ivern|Ivern|M|J|Humain,Altéré magiquement|Mana|Distance|Ionia|2016|🌳🦌🪨🌸🍃
Janna|Janna|F|S|Dieu|Mana|Distance|Zaun|2009|🌪️💨🕊️🌬️🩵
JarvanIV|Jarvan IV|M|J|Humain|Mana|Mêlée|Demacia|2011|👑🚩🐉🛡️⚔️
Jax|Jax|M|H,J|Inconnue|Mana|Mêlée|Icathia,Runeterra|2009|🏮🥋🪔😶💪
Jayce|Jayce|M|H,M|Humain|Mana|Mêlée,Distance|Piltover|2012|🔨🔫⚡🧑‍🔬💥
Jhin|Jhin|M|B|Humain|Mana|Distance|Ionia|2016|🎭4️⃣🌹🎻🔫
Jinx|Jinx|F|B|Humain|Mana|Distance|Zaun|2013|🔫🚀🦈💥🎀
Kaisa|Kai'Sa|F|B|Humain,Altéré par le Néant|Mana|Distance|Néant,Shurima|2018|🦋🟣🦂🚀💜
Kalista|Kalista|F|B|Mort-vivant|Mana|Distance|Îles Obscures,Camavor|2014|🔱👻💔🤝⚖️
Karma|Karma|F|S,M|Humain|Mana|Distance|Ionia|2011|🪷🔥🙏☯️🧘‍♀️
Karthus|Karthus|M|J,B|Mort-vivant|Mana|Distance|Îles Obscures|2009|💀🎶☠️🩻⚰️
Kassadin|Kassadin|M|M|Humain,Altéré par le Néant|Mana|Mêlée|Néant,Shurima|2009|🟣🌀🗡️🎭⚡
Katarina|Katarina|F|M|Humain|Sans ressource|Mêlée|Noxus|2009|🔪🌀🩸💃🗡️
Kayle|Kayle|F|H,M|Humain,Céleste|Mana|Mêlée,Distance|Demacia,Targon|2009|🪽⚔️🔥😇⚖️
Kayn|Kayn|M|J|Humain,Darkin|Mana|Mêlée|Ionia,Noxus|2017|🌑⚔️😈🧑‍🎤🪦
Kennen|Kennen|M|H|Yordle|Énergie|Distance|Ionia|2010|⚡🥷🌩️🐭💨
Khazix|Kha'Zix|M|J|Être du Néant|Mana|Mêlée|Néant|2012|🦗🪲🗡️👾🦟
Kindred|Kindred|A|J|Dieu|Mana|Distance|Runeterra|2015|🐑🐺🏹💀🌫️
Kled|Kled|M|H|Yordle|Courage|Mêlée|Noxus|2016|🦎🐴😡⚔️🪓
KogMaw|Kog'Maw|M|B|Être du Néant|Mana|Distance|Néant|2010|🤮🦠👅🐛🟢
KSante|K'Santé|M|H|Humain|Mana|Mêlée|Shurima|2022|🛡️💪🦏🪨💙
Leblanc|LeBlanc|F|M|Humain,Altéré magiquement|Mana|Distance|Noxus|2010|🎭🪞⛓️🦚💜
LeeSin|Lee Sin|M|J|Humain|Énergie|Mêlée|Ionia|2011|🥋🙈🐉🦵🩸
Leona|Leona|F|S|Humain,Céleste|Mana|Mêlée|Targon|2011|☀️🛡️⚔️🌅🌟
Lillia|Lillia|F|J|Esprit|Mana|Mêlée|Ionia|2020|🦌🌸💤😴🌼
Lissandra|Lissandra|F|M|Humain,Né de la glace|Mana|Distance|Freljord|2013|🧊👁️❄️👑🗡️
Locke|Locke|M|M|Humain|Mana|Mêlée|Runeterra|2026|🗡️🔒🗝️🌑🎩
Lucian|Lucian|M|B|Humain|Mana|Distance|Demacia|2013|🔫☀️🖤💍🏃‍♂️
Lulu|Lulu|F|S|Yordle|Mana|Distance|Bandle|2012|🧚🐿️🌀🍄🪄
Lux|Lux|F|S,M|Humain,Altéré magiquement|Mana|Distance|Demacia|2010|🌟💡🌈🪄😁
Malphite|Malphite|M|H|Golem|Mana|Mêlée|Ixtal|2009|🪨⛰️💥🗿🌋
Malzahar|Malzahar|M|M|Humain,Altéré par le Néant|Mana|Distance|Néant,Shurima|2010|🟣👁️🌀🦠🧙
Maokai|Maokai|M|S,J|Esprit|Mana|Mêlée|Îles Obscures|2011|🌳😠🌱🍂🪵
MasterYi|Maître Yi|M|J|Humain|Mana|Mêlée|Ionia|2009|🥋⚔️🕶️🍎💨
Mel|Mel|F|M,S|Humain,Altéré magiquement|Mana|Distance|Noxus,Piltover|2025|🪞✨👑💛🕊️
Milio|Milio|M|S|Humain|Mana|Distance|Ixtal|2023|🔥🧸🌞🤗🔆
MissFortune|Miss Fortune|F|B|Humain|Mana|Distance|Bilgewater|2010|🔫💋🏴‍☠️🌧️🤠
MonkeyKing|Wukong|M|H,J|Vastaya|Mana|Mêlée|Ionia|2011|🐒🦯☁️🌀👑
Mordekaiser|Mordekaiser|M|H|Mort-vivant|Bouclier|Mêlée|Noxus|2010|🔨💀⛓️👑⚫
Morgana|Morgana|F|S,M|Humain,Céleste|Mana|Distance|Demacia|2009|⛓️🖤🪽🧹🔮
Naafiri|Naafiri|F|M|Darkin|Mana|Mêlée|Shurima|2023|🐕🗡️🐺🦴🩸
Nami|Nami|F|S|Vastaya|Mana|Distance|Runeterra|2012|🧜‍♀️🌊🫧🐚🐟
Nasus|Nasus|M|H|Ascensionné|Mana|Mêlée|Shurima|2009|🐕🏺📚🦴⚱️
Nautilus|Nautilus|M|S|Mort-vivant|Mana|Mêlée|Bilgewater|2012|⚓🤿🌊🐚🛡️
Neeko|Neeko|F|M,S|Vastaya|Mana|Distance|Ixtal|2018|🦎🌸🎭🌼🫥
Nidalee|Nidalee|F|J|Humain|Mana|Mêlée,Distance|Ixtal|2009|🐆🏹🌿🦁🐾
Nilah|Nilah|F|B|Humain,Altéré magiquement|Mana|Mêlée|Bilgewater|2022|💧🌀😁🌊💙
Nocturne|Nocturne|M|J|Démon|Mana|Mêlée|Runeterra|2011|🌑😱💤👻🗡️
Nunu|Nunu et Willump|M|J|Humain,Né de la glace|Mana|Mêlée|Freljord|2009|❄️⛄🧒🐻‍❄️🎄
Olaf|Olaf|M|H,J|Humain,Né de la glace|Mana|Mêlée|Freljord|2010|🪓🧔🍺❄️😡
Orianna|Orianna|F|M|Cyborg|Mana|Distance|Piltover|2011|⚙️🔵💃🤖🎶
Ornn|Ornn|M|H|Dieu|Mana|Mêlée|Freljord|2017|🔨🐏🔥⚒️🌋
Pantheon|Pantheon|M|H,M,S|Humain,Céleste|Mana|Mêlée|Targon|2010|🛡️⚔️☄️🔱🦁
Poppy|Poppy|F|S,H,J|Yordle|Mana|Mêlée|Demacia|2010|🔨🛡️👧🦸‍♀️⭐
Pyke|Pyke|M|S|Mort-vivant|Mana|Mêlée|Bilgewater|2018|🔱💀🦈🩸⚓
Qiyana|Qiyana|F|J,M|Humain|Mana|Mêlée|Ixtal|2019|👑🌊🌿🪨💍
Quinn|Quinn|F|H|Humain|Mana|Distance|Demacia|2013|🦅🏹🪶🌌🔭
Rakan|Rakan|M|S|Vastaya|Mana|Distance|Ionia|2017|🪶💃🕺❤️✨
Rammus|Rammus|M|J|Inconnue|Mana|Mêlée|Shurima|2009|🐢🦔🌀🆗😎
RekSai|Rek'Sai|F|J|Être du Néant|Rage|Mêlée|Néant,Shurima|2014|🦈🏜️🌀🐛👅
Rell|Rell|F|S|Humain,Altéré magiquement|Mana|Mêlée|Noxus|2020|🐴🛡️🧲⚔️🏇
Renata|Renata Glasc|F|S|Humain,Cyborg|Mana|Distance|Zaun|2022|🧪💉🦾👩‍💼🧬
Renekton|Renekton|M|H|Ascensionné|Fureur|Mêlée|Shurima|2011|🐊🪓😡🏜️💀
Rengar|Rengar|M|J,H|Vastaya|Férocité|Mêlée|Ixtal|2012|🦁🏹🦴🐾👁️
Riven|Riven|F|H|Humain|Sans ressource|Mêlée|Noxus|2011|🗡️💔🌀⚔️🌸
Rumble|Rumble|M|H,M|Yordle|Chaleur|Mêlée|Bandle|2011|🤖🔥🔧🚀🐭
Ryze|Ryze|M|M,H|Humain,Altéré magiquement|Mana|Distance|Runeterra|2009|📜🔮💙🌀🧙
Samira|Samira|F|B|Humain|Mana|Distance|Noxus,Shurima|2020|🔫🗡️😎💃🌀
Sejuani|Sejuani|F|J|Humain,Né de la glace|Mana|Mêlée|Freljord|2012|🐗❄️🌨️🔨👑
Senna|Senna|F|S,B|Humain|Mana|Distance|Runeterra|2019|🔫🌫️💚🕯️👻
Seraphine|Séraphine|F|S,B,M|Humain|Mana|Distance|Piltover,Zaun|2020|🎤🎶💖🌟🎵
Sett|Sett|M|H,S|Humain,Vastaya|Agressivité|Mêlée|Ionia|2020|👊💪🦊🥊👑
Shaco|Shaco|M|J,S|Démon|Mana|Mêlée|Runeterra|2009|🃏🎭🔪🤡📦
Shen|Shen|M|H,S|Humain|Énergie|Mêlée|Ionia|2010|🥷⚖️🌀🗡️🫂
Shyvana|Shyvana|F|J,H|Humain,Dragon|Fureur|Mêlée|Demacia|2011|🐉🔥🦵👩‍🦰⚔️
Singed|Singed|M|H|Humain,Altéré chimiquement|Mana|Mêlée|Zaun|2009|☠️💨🧪🏃‍♂️🤪
Sion|Sion|M|H|Mort-vivant|Mana|Mêlée|Noxus|2009|🧟🪓💀🏃‍♂️⚔️
Sivir|Sivir|F|B|Humain|Mana|Distance|Shurima|2009|🪃💰🏜️🛡️👑
Skarner|Skarner|M|J,H|Brackern|Mana|Mêlée|Ixtal|2011|🦂💎⛓️🪨🌋
Smolder|Smolder|M|B,M|Dragon|Mana|Distance|Runeterra|2024|🐉🔥🐣🍗🌋
Sona|Sona|F|S|Humain|Mana|Distance|Demacia,Ionia|2010|🎵🎹🤫💙🎶
Soraka|Soraka|F|S|Céleste|Mana|Distance|Targon,Ionia|2009|🦄🍌⭐💚🌙
Swain|Swain|M|S,M|Humain,Altéré magiquement|Mana|Distance|Noxus|2010|🐦👁️🖤🦾💀
Sylas|Sylas|M|M,J|Humain,Altéré magiquement|Mana|Mêlée|Demacia,Freljord|2019|⛓️💥🔗🧔💜
Syndra|Syndra|F|M|Humain,Altéré magiquement|Mana|Distance|Ionia|2012|🔮⚫🌑💜👑
TahmKench|Tahm Kench|M|S,H|Démon|Mana|Mêlée|Bilgewater|2015|🐸👅🎩🎣🍽️
Taliyah|Taliyah|F|M,J|Humain,Altéré magiquement|Mana|Distance|Shurima|2016|🪨🧶🌊🏔️🧕
Talon|Talon|M|M,J|Humain|Mana|Mêlée|Noxus|2011|🗡️🧥🦅🌀🔪
Taric|Taric|M|S|Humain,Céleste|Mana|Mêlée|Demacia,Targon|2009|💎🛡️✨💖🔨
Teemo|Teemo|M|H|Yordle|Mana|Distance|Bandle|2009|🍄🐹🎯🪖😈
Thresh|Thresh|M|S|Mort-vivant|Mana|Distance|Îles Obscures|2013|⛓️🏮👻🪝💀
Tristana|Tristana|F|B,M|Yordle|Mana|Distance|Bandle|2009|🔫🐭🚀💥🎯
Trundle|Trundle|M|J,H|Troll|Mana|Mêlée|Freljord|2010|🧌🧊🦴👑🏏
Tryndamere|Tryndamere|M|H|Humain|Fureur|Mêlée|Freljord|2009|⚔️😡💀🗡️🩸
TwistedFate|Twisted Fate|M|M|Humain,Altéré magiquement|Mana|Distance|Bilgewater|2009|🃏🎩🌀🎲🤠
Twitch|Twitch|M|B,J|Rat,Altéré chimiquement|Mana|Distance|Zaun|2009|🐀🏹🧪🦠💚
Udyr|Udyr|M|J,H|Humain|Mana|Mêlée|Freljord|2009|🐻🐯🐦‍🔥🐢🦅
Urgot|Urgot|M|H|Humain,Cyborg|Mana|Distance|Zaun,Noxus|2010|🦀🔫⚙️⛓️🦵
Varus|Varus|M|B|Humain,Darkin|Mana|Distance|Ionia|2012|🏹😈🩸🟣💔
Vayne|Vayne|F|B|Humain|Mana|Distance|Demacia|2011|🏹🌙🕶️🦇🎯
Veigar|Veigar|M|M,S|Yordle|Mana|Distance|Bandle|2009|🧙🌌⭐😈🪄
Velkoz|Vel'Koz|M|S,M|Être du Néant|Mana|Distance|Néant|2014|👁️🦑🔬⚡🟣
Vex|Vex|F|M|Yordle|Mana|Distance|Îles Obscures|2021|🖤😒🌫️👤💤
Vi|Vi|F|J|Humain|Mana|Mêlée|Piltover,Zaun|2012|👊🧤💥👮‍♀️🩷
Viego|Viego|M|J|Mort-vivant|Sans ressource|Mêlée|Îles Obscures,Camavor|2021|👑💔⚔️🖤👻
Viktor|Viktor|M|M|Humain,Cyborg|Mana|Distance|Zaun,Piltover|2011|🤖⚙️☀️🔬🦾
Vladimir|Vladimir|M|M,H|Humain,Altéré magiquement|Points de vie|Distance|Noxus|2010|🩸🧛🌀💉🍷
Volibear|Volibear|M|J,H|Dieu|Mana|Mêlée|Freljord|2011|🐻⚡🌩️🐻‍❄️👑
Warwick|Warwick|M|J,H|Humain,Altéré chimiquement|Mana|Mêlée|Zaun|2009|🐺🩸🧪😡🌕
Xayah|Xayah|F|B|Vastaya|Mana|Distance|Ionia|2017|🪶💜💃🔪🐦
Xerath|Xerath|M|M,S|Ascensionné|Mana|Distance|Shurima|2011|⚡💀🏺🌀🔵
XinZhao|Xin Zhao|M|J|Humain|Mana|Mêlée|Demacia,Ionia,Noxus|2010|🔱🐉🛡️⚔️🏟️
Yasuo|Yasuo|M|M,H,B|Humain|Impulsion|Mêlée|Ionia|2013|🌪️⚔️🍃😤🍶
Yone|Yone|M|M,H|Humain,Esprit|Impulsion|Mêlée|Ionia|2020|👹⚔️🎭🌸🗡️
Yorick|Yorick|M|H|Humain|Mana|Mêlée|Îles Obscures|2011|⛏️👻⚰️🪦🌫️
Yunara|Yunara|F|B|Humain|Mana|Distance|Ionia|2025|🏹🪷🔥🙏🌸
Yuumi|Yuumi|F|S|Chat|Mana|Distance|Bandle|2019|🐱📖✨🐾💙
Zaahen|Zaahen|M|H|Darkin|Mana|Mêlée|Runeterra|2025|⚔️🪽😈🩸👹
Zac|Zac|M|J,H|Altéré chimiquement|Sans ressource|Mêlée|Zaun|2013|🟢🫧🤸💚🧪
Zed|Zed|M|M,J|Humain|Énergie|Mêlée|Ionia|2012|🥷🌑🗡️👥🌀
Zeri|Zeri|F|B|Humain,Altéré magiquement|Mana|Distance|Zaun|2022|⚡🔫🏃‍♀️🎧💚
Ziggs|Ziggs|M|M,B|Yordle|Mana|Distance|Zaun|2012|💣🐭💥😁🧨
Zilean|Zilean|M|S,M|Humain,Altéré magiquement|Mana|Distance|Runeterra|2009|⏰💣⏳🧙🕰️
Zoe|Zoé|F|M,S|Céleste|Mana|Distance|Targon|2017|🌈⭐💤🦋😜
Zyra|Zyra|F|S,M|Esprit|Mana|Distance|Ixtal|2012|🌹🌿🌱🪴🌺
`;

const GENRES: Record<string, string> = { M: "Masculin", F: "Féminin", A: "Autre" };
const POSTES: Record<string, string> = { H: "Haut", J: "Jungle", M: "Milieu", B: "Bas", S: "Support" };

export interface ChampionLol {
  /** Identifiant Data Dragon (ex. « XinZhao ») : c'est lui qui est enregistré en base. */
  id: string;
  nom: string;
  image: string;
  genre: string;
  postes: string[];
  especes: string[];
  ressource: string;
  portee: string[];
  regions: string[];
  annee: number;
  emojis: string[];
}

const liste = (texte: string) => texte.split(",").map((x) => x.trim()).filter(Boolean);
const graphemes = (texte: string) => [...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(texte)].map((s) => s.segment);

export const CHAMPIONS_LOL: readonly ChampionLol[] = TABLE.trim()
  .split("\n")
  .map((ligne) => {
    const [id = "", nom = "", genre = "", postes = "", especes = "", ressource = "", portee = "", regions = "", annee = "", emojis = ""] =
      ligne.split("|");
    return {
      id,
      nom,
      image: `${PREFIXE_ICONES}${VERSION_DDRAGON}/img/champion/${id}.png`,
      genre: GENRES[genre] ?? genre,
      postes: liste(postes).map((p) => POSTES[p] ?? p),
      especes: liste(especes),
      ressource,
      portee: liste(portee),
      regions: liste(regions),
      annee: Number(annee),
      emojis: graphemes(emojis),
    };
  })
  .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

const parId = new Map(CHAMPIONS_LOL.map((c) => [c.id, c]));
export const championLol = (id: string): ChampionLol | undefined => parId.get(id);

/** Nom anglais d'un champion dans les cartes Riftbound → identifiant Data Dragon. */
const ALIAS: Record<string, string> = { renataglasc: "Renata", nunuwillump: "Nunu", wukong: "MonkeyKing" };
const cle = (texte: string) => texte.normalize("NFD").replace(/[^a-z0-9]/gi, "").toLowerCase();
const parCle = new Map(CHAMPIONS_LOL.map((c) => [cle(c.id), c]));

export function championLolDuNom(nomAnglais: string): ChampionLol | undefined {
  const k = cle(nomAnglais);
  return parCle.get(k) ?? championLol(ALIAS[k] ?? "");
}
