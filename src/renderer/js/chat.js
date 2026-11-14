// Talking to her: you type in her panel, and a model (setup.js picks which) answers as her, in
// writing. The replies are AI-generated, and the panel says so on every chat.
// She can do a few things on your PC when you ask (Windows): open an app or a game, play music or
// control what's playing, open a website, close an app. She spots what you want in what you wrote,
// or the model asks for it with a tag in its answer. Music right away; an app you named yourself
// right away; anything only the model asked for, a website, and closing an app behind a button.

import { pick, fmt, inLang, scrub, slang } from './util.js';
import { ASSISTANT_NAMES } from './lines.js';
import { parseReminder, parseWhen, clock } from './reminders.js';
import { folderIn } from './hands.js';
import { portraitStrokes } from './art.js';
import { GAME_ASK as WORD_GAMES } from './games.js';

const REMEMBER = 20; // messages she has in mind when answering
const KEEP = 60;     // messages she remembers across restarts (memory.json)
// her language, where small models need it: how she says "we" (else it's in English), and the last line
// of her prompt, in that language (they drift into the English of everything above it)
// `now`: the same, said again right by your message (small models answer in the language of the
// conversation so far, English after a switch, whatever the top of her prompt says)
const IN_LANGUAGE = {
  fr: { we: '"on" or "nous" in French', last: 'Écris tout en français, sauf si l’utilisateur t’écrit dans une autre langue : alors dans la sienne. Seuls les mots d’argot de Night City restent en anglais, jamais une phrase entière.', now: 'Réponds en français, sauf si ce message est écrit dans une autre langue.' },
  en: { we: '', last: 'Write everything in English, unless the user writes to you in another language: then in theirs.', now: 'Answer in English, unless this message is written in another language.' },
  es: { we: '"nosotros" in Spanish', last: 'Escribe todo en español, salvo si el usuario te escribe en otro idioma: entonces en el suyo. Solo las palabras de jerga de Night City se quedan en inglés, nunca una frase entera.', now: 'Responde en español, salvo si este mensaje está escrito en otro idioma.' },
  pt: { we: '"a gente" or "nós" in Portuguese', last: 'Escreva tudo em português do Brasil, a não ser que o usuário te escreva em outra língua: aí, na dele. Só as gírias de Night City ficam em inglês, nunca uma frase inteira.', now: 'Responda em português do Brasil, a não ser que esta mensagem esteja escrita em outra língua.' },
  ru: { we: '"мы" in Russian', last: 'Пиши всё по-русски, если только пользователь не пишет тебе на другом языке: тогда на его языке. По-английски остаются только словечки Найт-Сити, никогда не целые фразы.', now: 'Отвечай по-русски, если только это сообщение не написано на другом языке.' },
};
const STAY_MS = 10 * 60 * 1000; // no wandering off mid-conversation
const LOADING_AFTER_MS = 5000;
const CLOSE_TAG = /\[\[\s*close\s*:?\s*([^\]]*)\]\]/i; // [[close: AM Music]] at the end of her answer
// her hands (hands.js): [[task: what Claude Code should do]], or "task: …" said plainly
// "summarize / translate / fix what I copied": your clipboard's text goes with your message
const CLIP_ASK = /(?:o que (?:eu )?copiei|(?:texto|conte[úu]do) (?:que )?(?:eu )?copiad|[áa]rea de transfer[êe]ncia|clipboard|what i(?:'ve| have| just)? copied|ce que j['’]ai copi[ée]|presse-papiers|lo que (?:he )?copi[ée]|portapapeles|что я скопировал|буфер обмена)/i;
const TASK_TAG = /\[\[\s*task\s*:\s*([^\]]*)\]\]/i;
const TASK_ASK = /^\s*(?:capri,?\s+)?(?:tarefa|task|t[âa]che|tarea|задача|claude)\s*[:,]\s*(.{4,})$/is;
// work to do in a folder you named ("abra a pasta site no windows e faça esse código"): her hands
// reading what's on your screen: an error, a message, a print (her look at it, with your question)
const LOOK_READ = /(?<![\p{L}])(?:l[êe]|leia|ler|lê pra mim)\s+(?:o que\s+(?:t[áa]|est[áa])\s+(?:escrito\s+)?)?(?:na|a|minha|essa)\s+tela|(?<![\p{L}])(?:l[êe]|leia|ler)\s+(?:esse|este|o|isso|aquele)\s+(?:erro|print|texto|c[óo]digo|aviso|e-?mail|mensagem)|o que\s+(?:diz|significa|quer dizer)\s+(?:esse|este|o|aquele)\s+(?:erro|aviso|texto|c[óo]digo|print)|explica\s+(?:esse|este|o)\s+(?:erro|aviso|c[óo]digo)|what does (?:this|that|the) (?:error|message|warning) (?:say|mean)|read (?:my|the|this) screen|read (?:this|that) (?:error|text|message)/iu;

// "quando eu abrir o VS Code, me lembra de…": a reminder for when that app comes up (main.js)
const CTX_ASK = /(?:quando|assim que|na hora que)\s+(?:eu\s+)?(?:abrir|entrar\s+n[oa]|for\s+pr[oa]|usar|voltar\s+pr[oa])\s+(?:o\s+|a\s+)?(.+?),?\s+(?:me\s+)?(?:lembr[ae]|avis[ae])\w*\s+(?:de\s+|que\s+|pra\s+|para\s+)?(.+)|when\s+i\s+(?:open|get\s+to|go\s+to|use)\s+(?:the\s+)?(.+?),?\s+remind\s+me\s+(?:to\s+|about\s+|that\s+)?(.+)/i;

// "o que eu fiz essa semana?": her summary of your week, from her diary of your days (activity.js)
const WEEK_ASK = /o\s+que\s+(?:eu\s+)?fiz\s+(?:essa|nesta|esta|na|n[ae]ssa)\s+semana|resum[oe]\s+(?:da\s+)?(?:minha\s+)?semana|como\s+foi\s+(?:a\s+)?minha\s+semana|what\s+did\s+i\s+do\s+this\s+week|(?:sum\s+up|recap)\s+my\s+week|how\s+was\s+my\s+week/i;

// your browser's tabs, through her extension (main tabs.js)
const TABS = [
  ['count', /quantas\s+abas|how\s+many\s+tabs/i],
  ['close', /fech[ae]\w*\s+(?:todas\s+)?(?:as\s+)?abas?\s+(?:d[oae]s?\s+|com\s+)(.+)|close\s+(?:all\s+)?(?:the\s+|my\s+)?(.+?)\s+tabs?/i],
  ['save', /(?:guard|salv)[ae]\w*\s+(?:essas|estas|as|minhas)\s+abas|save\s+(?:these|my|the)\s+tabs/i],
  ['restore', /(?:abr|reabr|volt|traz|tra[gz]|devolv)\w*\s+(?:as\s+|minhas\s+)?abas\s+(?:que\s+(?:eu\s+|você\s+)?(?:guardei|guardou|salvei)|guardadas|salvas)|(?:restore|reopen)\s+(?:my\s+)?(?:saved\s+)?tabs/i],
  ['go', /(?:vai|vá|muda|mude|troca|troque|ir)\s+(?:pra|para)\s+(?:a\s+)?aba\s+(?:d[oae]\s+)?(.+)|(?:go|switch)\s+to\s+(?:the\s+)?(.+?)\s+tab/i],
  ['page', /resum[ea]\w*\s+(?:essa|esta|a|aquela)\s+(?:p[áa]gina|aba|mat[ée]ria|not[íi]cia|artigo|reportagem)|(?:summari[sz]e|tl;?dr)\s+(?:this|the)\s+(?:page|article|tab)|^tl;?dr\b/i],
];

// "vou dormir", "boa noite, capri": she says goodnight and goes to sleep too (presence.js)
const NIGHT_ASK = /^(?:capri,?\s+)?(?:vou\s+dormir|t[ôo]\s+indo\s+dormir|indo\s+dormir|boa\s+noite(?:,?\s+capri)?|fui\s+dormir|hora\s+de\s+dormir|good\s*night|going\s+to\s+(?:bed|sleep))[\s!.,]*(?:capri)?[\s!.]*$/i;

// "cria uma playlist pra estudar": songs she picks for your taste, made into a Spotify playlist
const PLAYLIST_ASK = /(?:cri[ae]|fa[zç]a?|mont[ae]|gera|gere)\w*\s+(?:uma\s+|umas\s+)?playlists?(?:\s+(?:pra|para|de|com|sobre|no)\s+(.+))?|make\s+(?:me\s+)?a\s+playlist(?:\s+(?:for|of|with)\s+(.+))?/i;

// "o que chegou de notificação?": the last few hours' notifications, in a word (with reading them on)
const NOTICES_ASK = /(?:o\s+que|quais|alguma?)\s+(?:chegou|chegaram|tem|teve)\s+(?:de\s+)?notifica[çc][ãa]o|notifica[çc][õo]es\s+(?:novas|recentes)|any\s+(?:new\s+)?notifications|what\s+notifications/i;

// "me avisa quando o Gaules entrar ao vivo (na twitch)", "para de me avisar do X" (main lives.js)
const LIVE_ADD = /(?:me\s+)?avis[ae]\w*\s+quando\s+(?:o\s+|a\s+)?@?([\w.-]{2,40})\s+(?:entrar|ficar|estiver|for)\s+(?:ao\s+vivo|online|em\s+live)(?:\s+n[oa]\s+(twitch|youtube))?|tell\s+me\s+when\s+@?([\w.-]{2,40})\s+goes\s+live(?:\s+on\s+(twitch|youtube))?/i;
const LIVE_DEL = /(?:para|pare)\s+de\s+me\s+avisar\s+(?:d[oae]s?\s+)?@?([\w.-]{2,40})|stop\s+telling\s+me\s+about\s+@?([\w.-]{2,40})/i;

// her corner: "mostra seus desenhos", "abre seu diário"
const CORNER_ASK = /(?:mostr|abr|v[êe]r|quero\s+ver)\w*\s+(?:os\s+)?(?:seus|teus)\s+(?:desenhos|di[áa]rio|conquistas)|(?:show|open)\s+(?:me\s+)?your\s+(?:drawings|diary|achievements)/i;

// your windows: side by side, all minimized but one, back again, maximized (main arrange.js)
const SIDE_ASK = /lado\s+a\s+lado|side\s+by\s+side|divid[ae]\s+a\s+tela|split\s+(?:the\s+)?screen/i;
const FOCUS_ASK = /minimiz[ae]\w*\s+(?:tudo|todas(?:\s+as\s+janelas)?|as\s+outras|everything|all)(?:\s+(?:menos|exceto|fora|tirando|but|except)\s+(.+))?/i;
const RESTORE_ASK = /(?:mostr[ae]|volt[ae]|traz|traga|restaur[ae]|desminimiz[ae]|reabr[ae])\w*\s+(?:tudo|as\s+janelas|todas)(?:\s+de\s+(?:volta|novo))?|bring\s+(?:them|everything)\s+back|restore\s+(?:the\s+)?windows/i;
const MAX_ASK = /maximiz[ae]\w*(?:\s+(.+))?|maximi[sz]e(?:\s+(.+))?/i;
const appNames = (s) => String(s || '').replace(/[.!?]+$/, '').replace(/^(?:capri,?\s+)?(?:coloca|coloque|põe|ponha|bota|bote|deixa|deixe|organiza|organize|arruma|arrume|put|place|set)\s+/i, '')
  .split(/\s+(?:e|and|com|with)\s+/i).map((x) => x.replace(/^(?:o|a|os|as|the)\s+/i, '').replace(/\s+(?:aberto|aberta|na tela)$/i, '').trim()).filter((x) => x && x.length < 40);

// "jokenpô", "pedra papel tesoura": a game with your hand in front of the camera (gestures.js)
const RPS_ASK = /jokenp[ôo]|pedra,?\s+papel,?\s+(?:e\s+)?tesoura|rock,?\s+paper,?\s+(?:and\s+)?scissors|piedra,?\s+papel|pierre,?\s+feuille/i;
// "me desenha", "faz um retrato meu": her drawing of your face (art.js)
const PORTRAIT_ASK = /(?:me\s+desenh|desenh[ae]\s+(?:o\s+)?meu\s+rosto|desenh[ae]\s+eu\b|(?:faz|faça|fazer)\s+um\s+retrato\s+meu|retrato\s+meu|draw\s+me\b|draw\s+my\s+(?:face|portrait)|my\s+portrait)/i;
// "quanto do limite do claude?", "how much claude usage is left"
const USAGE_ASK = /(?<![\p{L}])(?:limite|limit|uso|usage|cota|quota|franquia)(?![\p{L}])[^.?!]{0,30}(?<![\p{L}])claude(?![\p{L}])|(?<![\p{L}])claude(?![\p{L}])[^.?!]{0,30}(?<![\p{L}])(?:limite|limit|uso|usage|cota|quota)(?![\p{L}])/iu;
const WORK_ASK = /(?<![\p{L}])(?:fa[çc]a|faz|fazer|cri[ae]|criar|corrij[ae]|corrige|conserta|arrum[ae]|implement[ae]|refator[ae]|programa|escrev[ae]|monta|adicion[ae]|c[óo]digo|code|make|build|fix|write|implement|refactor|add|create)(?![\p{L}])/iu;
// "close", "shut down", "ferme", "quitte", "cierra", "fecha", "закрой"... in any of her languages
const CLOSE_ASK = /\b(close|shut|quit|kill|exit)|ferm|quitt|coupe|arr[êe]t|cierr|cerra|fech|encerr|закр|выключ/i;
// her other tags: [[open: Spotify]], [[music: Bad Bunny]], [[media: next]], [[site: youtube.com]]
const TAG = /\[\[\s*(open|music|media|site)\s*:\s*([^\]]*)\]\]/i;
// "open", "launch", "ouvre", "lance", "abre", "открой"... in any of her languages
const OPEN_ASK = /\b(open|launch|start|run)\b|ouvr|lance|démarre|abre|abrir|inicia|ejecuta|executa|(?<![a-zà-ÿ])(?:abra|execute|inicie|rode)(?![a-zà-ÿ])|открой|запусти/i;
// what to do with the music playing, said plainly (only when it's about music, or said in a few words)
const MEDIA_ASK = [
  ['pause', /\b(pause|pausa|pausar)\b|stop (the )?music|arrête la musique|пауз/i],
  ['next', /\b(next|skip|suivante?|siguiente|próxima|proxima)\b|passe (à )?la suivante|salta|pula|следующ/i],
  ['previous', /\b(previous|précédente?|anterior)\b|предыдущ/i],
  ['play', /\b(resume|reprends|reanuda|retoma)\b|relance la musique|remets la musique|продолж/i],
  ['volup', /\b(louder|plus fort)\b|monte le son|turn (it )?up|sube el volumen|aumenta o volume|громче/i],
  ['voldown', /\b(quieter|moins fort)\b|baisse le son|turn (it )?down|baja el volumen|abaixa o volume|тише/i],
  ['mute', /\bmute\b|coupe le son|silencia|sem som|выключи звук/i],
];
const MUSIC_WORD = /musi|chanson|song|track|titre|morceau|spotify|canci|faixa|песн|музык|трек/i;
// "put X on Spotify", "mets X sur Spotify", "pon X en Spotify", "coloca X no Spotify", "включи X в Spotify"
const SPOTIFY_ASK = /(?:play|put on|put|mets|joue|lance|écoute|pon|toca|reproduce|coloca|coloque|bote|ponha|toque|включи|поставь)\s+(?:moi\s+|me\s+)?(.+?)\s+(?:on|sur|en|no|na|в)\s+spotify/i;
const MEDIA_ACTIONS = new Set(MEDIA_ASK.map(([action]) => action));
// "mets Bohemian Rhapsody sur YouTube", "play Daft Punk on youtube"
const YOUTUBE_ASK = /(?:play|put on|put|mets|met|joue|lance|écoute|pon|toca|reproduce|coloca|coloque|bote|ponha|bota|toque|включи|поставь)(?:[- ]moi|[- ]me|me)?\s+(.+?)\s+(?:on|sur|en|no|na|в)\s+youtube/i;
// "mets Bohemian Rhapsody", "joue-moi du Daft Punk", "play some Queen": a song, or a game to play
const PLAY_ASK = /^(?:capri,?\s+)?(?:mets|met|joue|play|put on|pon|toca|coloca|coloque|bota|bote|ponha|toque|включи|поставь)(?:[- ]moi|[- ]me|me)?\s+(.{2,100})$/iu;
// "joue à Brawlhalla", "play the game…": a game, not a song
const GAME_ASK = /^(?:capri,?\s+)?(?:joue|play)\s+(?:à|au|aux|a|the game)\s/i;
// "du Daft Punk", "some Queen": who to play, without the "some"
const songOf = (s) => s
  .replace(/^(?:la |le |une? |the |some )?(?:musique|music|chanson|son|morceau|song|track|songs)\s+(?:de |d['’]|du |by |of )?/i, '')
  .replace(/^(?:(?:du|de la|de l['’]|des|de|some|un peu de|del|un poco de|algo de|um pouco de)\s+|d['’])/i, '')
  .replace(/\s+(?:on|sur|en|no|na|в)\s+youtube\s*$/i, '')
  .trim();
// "démarre YouTube et mets la musique de Daft Punk": the song asked for after an "and"
const PLAY_AFTER = /\s(?:et|and|y|e|и)\s+(?:mets|met|joue|play|put on|pon|toca|toque|coloca|coloque|bota|bote|ponha|põe|poe|включи|поставь|démarre|demarre|lance|start|launch|écoute|ecoute)(?:[- ]moi|[- ]me|\s+pra\s+tocar)?\s+(.{2,100})$/iu;
// "lance la musique de Daft Punk", "start the song X": an app verb, but music right after it
const MUSIC_START = /^(?:capri,?\s+)?(?:lance|démarre|demarre|start|launch|écoute|ecoute|pon|toca)(?:[- ]moi|[- ]me)?\s+(?:la |le |une? |the |some )?(?:musique|music|chanson|son|morceau|song|track|canci[óo]n|m[úu]sica|песню|музыку)\s+(.{2,100})$/i;
// "mets ce que tu veux", "play whatever you want": she picks (her tag)
const HER_PICK = /tu veux|ton choix|surprends|you want|whatever|your choice|surprise me|quieras|tu elecci[óo]n|quiser|sua escolha|хочешь|на твой выбор/i;
// what's left when it doesn't say which song ("mets de la musique", "play something")
const VAGUE_SONG = /^(?:(?:de\s+la|du|des|la|le|les|une?|some|a|the|un|algo\s+de|alguma|um|uma|что-нибудь)\s+)?(?:musique|music|son|sons|chanson|morceau|truc|quelque\s+chose|something|song|tunes?|m[úu]sica|canci[óo]n|algo|coisa|музыку|песню)?\s*[.!?]*$/iu;
// "trouve mon CV", "où est le pdf du contrat", "find my report", "найди файл…": her search verbs, and
// what makes it a file on your PC or a search on the web
const SEARCH_VERB = /(?:cherche|recherche|trouve|retrouve|où (?:est|sont)|search(?: for)?|find|look (?:for|up)|where(?:'s| is| are)|busca|encuentra|d[óo]nde est[áa]n?|procura|acha|procure|ache|encontr[ae]|pesquis[ae]|cad[êe]|onde (?:est[áa]o?|t[áa]|fica)|найди|поищи|где)/i;
const FILE_WORD = /fichier|dossier|document|photo|image|vid[ée]o|\bpdf\b|\bfiles?\b|folder|archivo|carpeta|arquivo|pasta|файл|папк|\.\w{2,4}\b|sur mon (?:pc|ordi)|dans mes fichiers|on my (?:pc|computer)|en mi (?:pc|ordenador)|no meu (?:pc|computador)|на (?:компьютере|пк)/i;
const WEB_WORD = /google|internet|\ble web\b|the web|\bonline\b|en ligne|в интернете|в гугле/i;
// "fais une capture d'écran", "take a screenshot"
const SHOT_ASK = /capture d['’][ée]cran|screenshot|screen ?shot|captura de (?:pantalla|tela)|(?:tir[ae]|tirar|fa[zç]a?|bat[ae]) (?:um |uma )?print|print(?:a|e|ar)? (?:d?a |minha )?tela|print screen|скриншот|снимок экрана/i;

// Your PC itself (system.js). One of its settings pages: a settings word, or an open verb, before it.
const SETTINGS_WORD = /param[eè]tres?|r[ée]glages?|settings|configuraci[oó]n|configura[çc][õo]es|ajustes|настройк/i;
const SETTINGS_PAGES = [
  ['bluetooth', /bluetooth/i],
  ['wifi', /wi-?fi|wlan/i],
  ['update', /mises? [àa] jour|\bupdates?\b|actualizaci|atualiza[çc]|обновлени/i],
  ['notifications', /notifications?|notificaci|notifica[çc]|уведомлен/i],
  ['background', /fond d['’][ée]cran|wallpaper|background|fondo de pantalla|papel de parede|обо(?:и|ев)\b/i],
  ['storage', /stockage|storage|almacenamiento|armazenamento|хранилищ/i],
  ['mouse', /souris|\bmouse\b|rat[oó]n|мыш/i],
  ['battery', /batterie|battery|bater[ií]a|батаре/i],
  ['power', /alimentation|\bpower\b|energ[ií]a|питани/i],
  ['display', /[ée]cran|display|pantalla|\btela\b|экран|дисплей/i],
  ['network', /r[ée]seau|network|(?<![\p{L}])rede?(?![\p{L}])|сет[ьи]/iu],
  ['sound', /\bson\b|\bsound\b|audio|sonido|\bsom\b|звук/i],
];
// what's left of it: asked as a question
const INFO_ASK = [
  ['battery', /batterie|battery|bater[ií]a|заряд|батаре/i],
  ['disk', /disque|\bdisk\b|\bdrive\b|stockage|storage|espace (?:libre|disque|restant)|de (?:la )?place|space left|free space|espacio|\bdisco\b|espa[çc]o|диск|места/i],
  ['ram', /\bram\b|m[ée]moire|memory|memoria|mem[óo]ria|памят|озу/i],
  ['ip', /\bip\b|айпи/i],
];
const QUESTION = /\?|combien|\bquel(?:le)?\b|c['’]est quoi|\breste\b|how much|how many|what(?:'s| is)|\bleft\b|cu[aá]nt|\bqu[eé]\b|quanto|\bqual\b|сколько|как(?:ой|ая|ое)|осталось/i;
// its sound: "mets le son à 30 %", "volume 50"; off and back on
const VOLUME_ASK = /(?:\bson\b|volume|\bsound\b|volumen|\bsom\b|звук|громкост\w*)\D{0,14}?(\d{1,3})\s*(?:%|pour ?cent|percent|por ?ciento|por ?cento|процент)?/i;
const MUTE_ASK = /coupe le son|mets? (?:le son )?en muet|\bmute\b|silencia|tira o som|sem som|(?:deix[ae]|coloc[ae]|bot[ae]|p[õo]e) (?:o (?:som|pc|computador) )?(?:no|em) mudo|(?<!des)mut[ae] o (?:som|pc|computador)|выключи звук/i;
const UNMUTE_ASK = /remets? le son|r[ée]active le son|unmute|sound (?:back )?on|quita el silencio|activa el sonido|volta o som|liga o som|volte o som|ligue o som|tir[ae] do mudo|desmut[ae]|включи звук/i;
// a timer, counted down in her ticker
const TIMER_ASK = /minuteur|\btimer\b|temporizador|cron[oó]metro|таймер/i;
// Windows' snip of an area (not her own screenshot of all of it)
const SNIP_ASK = /capture (?:d['’])?une (?:zone|partie)|zone de l['’][ée]cran|\bsnip\b|(?:capture|screenshot|captura) (?:of |de )?(?:an? |una |uma |la |a )?(?:area|region|part|zona|[aá]rea|parte)|снимок области|область экрана/i;
// its windows: out of the way, back, or side by side
const TIDY_ASK = /range (?:mes|les|toutes les) fen[êe]tres|cache (?:mes|les|toutes les) fen[êe]tres|montre(?:-moi)? (?:le|mon) bureau|r[ée]duis (?:tout|toutes les fen[êe]tres)|tidy (?:up )?(?:my |the )?windows|minimi[sz]e (?:all|everything|my windows|the windows)|show (?:me )?(?:the |my )?desktop|ordena (?:mis |las )?ventanas|minimiza (?:todo|todas)|muestra el escritorio|organiz[ae] (?:minhas |as )?janelas|minimiz[ae] (?:tudo|todas as janelas)|mostr[ae] a [áa]rea de trabalho|сверни (?:все|окна)|убери окна|покажи рабочий стол/i;
const UNTIDY_ASK = /(?:remets|ressors|rends-moi|rouvre) (?:mes|les) fen[êe]tres|(?:bring|put) (?:my |the )?windows back|restore (?:my |the )?windows|devu[ée]lve(?:me)? (?:mis |las )?ventanas|restaura (?:mis |las )?ventanas|volt[ae] (?:minhas |as )?janelas|(?:traz|traga) (?:minhas |as )?janelas de volta|верни окна/i;
const PLACE_VERB = /^\s*(?:mets?|place|bouge|d[ée]place|put|move|snap|pon|coloca|coloque|mova|mueve|bota|bote|ponha|поставь|перемести|сдвинь)\s+/i;
const SIDE = [
  ['left', /\s*(?:[àa] |on the |to the |a la |na |[àa] la )?(?:gauche|left|izquierda|esquerda|слева|влево|налево)\b/i],
  ['right', /\s*(?:[àa] |on the |to the |a la |na |[àa] la )?(?:droite|right|derecha|direita|справа|вправо|направо)\b/i],
];
// dark or light
const DARK_ASK = /mode sombre|th[eè]me sombre|mode nuit|dark mode|dark theme|modo oscuro|tema oscuro|modo escuro|tema escuro|т[её]мн(?:ая|ую) тем|т[её]мный режим/i;
const LIGHT_ASK = /mode clair|th[eè]me clair|light mode|light theme|modo claro|tema claro|светл(?:ая|ую) тем|светлый режим/i;
// its power: always behind a button of hers but the cancel
const PC_WORD = /(?<![\p{L}])(?:pc|ordi\p{L}*|computer|ordenador|computador|notebook|компьютер\p{L}*|пк)(?![\p{L}])/iu;
const POWER_ASK = [
  ['cancel', /annule (?:l['’])?(?:extinction|arr[êe]t|red[ée]marrage)|cancel (?:the )?(?:shut ?down|restart)|cancela (?:el |o )?(?:apagado|desligamento|reinicio)|отмени (?:выключение|перезагрузку)/i],
  ['restart', /red[ée]marre|reboot|restart|reinicia|reinicie|перезагру/i],
  ['shutdown', /[ée]teins|shut ?down|turn off|power off|\bapaga\b|desliga|выключи/i],
  ['sleep', /\bveille\b|\bsleep\b|suspend|suspen[dc]|спящ/i],
  ['lock', /verrouill|\block\b|bloquea|bloqueia|заблокир/i],
];

// How long a timer is: "10 minutes", "1h30", "45 s" (else "dans une heure", as for a reminder).
function duration(text) {
  const hm = /(\d+)\s*h\s*(\d{1,2})\b/i.exec(text);
  if (hm) return (Number(hm[1]) * 60 + Number(hm[2])) * 60000;
  let ms = 0;
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(h|heures?|hours?|horas?|час\p{L}*|min\p{L}*|m|мин\p{L}*|s|sec\p{L}*|seg\p{L}*|сек\p{L}*)(?![\p{L}])/giu)) {
    const unit = m[2].toLowerCase();
    ms += Number(m[1].replace(',', '.')) * (/^(?:h|час)/.test(unit) ? 3600000 : /^(?:m|мин)/.test(unit) ? 60000 : 1000);
  }
  if (ms) return ms;
  const when = parseWhen(text);
  return when ? Math.max(0, when.at - Date.now()) : 0;
}

// 1 h 30, 10 min, 45 s
function span(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`;
}

// what's left, in her ticker: 9:59, 1:02:03
function left(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const two = (n) => String(n).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`;
}
// the words that aren't what to look for
const NOT_SEARCHED = new Set(('stp svp please pls peux tu can you could would puedes pode можешь moi me le la les l mon ma mes '
  + 'un une des du de d the my a an for of el mi mis o meu minha meus мой мою мои sur dans on in en no na на в pc ordi ordinateur '
  + 'computer ordenador computador компьютере fichier fichiers dossier dossiers document documents photo photos image images '
  + 'vidéo vidéos video videos file files folder folders archivo archivos carpeta carpetas arquivo arquivos pasta pastas файл '
  + 'файлы папка папку appelé appelée nommé called named llamado chamado qui s appelle est sont is are where où cherche recherche '
  + 'trouve retrouve search find look up busca encuentra procura acha найди поищи где dónde onde google internet web online ligne '
  + 'procure ache encontra encontre pesquisa pesquise cadê cade você voce vc consegue achar procurar encontrar por favor pra mim '
  + 'minhas tá ta está esta fica').split(' '));
// the kind of file asked for: "mon projet after effect" is a .aep
const FILE_TYPES = [
  [/after ?effects?/i, ['aep']], [/premi[eè]re/i, ['prproj']], [/photoshop|\bpsd\b/i, ['psd']], [/illustrator/i, ['ai']],
  [/blender/i, ['blend']], [/cinema ?4d|\bc4d\b/i, ['c4d']], [/fl ?studio/i, ['flp']], [/ableton/i, ['als']],
  [/\bword\b|\bdocx?\b/i, ['docx', 'doc']], [/excel|\bxlsx?\b|tableur|spreadsheet/i, ['xlsx', 'xls', 'csv']],
  [/powerpoint|\bpptx?\b|diapo|slides/i, ['pptx', 'ppt']], [/\bpdf\b/i, ['pdf']],
  [/vid[ée]os?\b|\bmp4\b|\bfilms?\b|v[íi]deo|видео/i, ['mp4', 'mov', 'mkv', 'avi', 'webm']],
  [/photos?\b|images?\b|\bpng\b|\bjpe?g\b|imagen|imagem|фото/i, ['png', 'jpg', 'jpeg', 'webp', 'heic']],
  [/musiques?\b|\bmp3\b|\baudio\b|\bsongs?\b|музык/i, ['mp3', 'wav', 'flac', 'm4a', 'ogg']],
  [/\bzip\b|\barchive|\brar\b|\b7z\b/i, ['zip', 'rar', '7z']],
];
const fileTypes = (text) => [...new Set(FILE_TYPES.filter(([re]) => re.test(text)).flatMap(([, exts]) => exts))];
// words that only say what kind of file it is, or what to do with it once found
const NOT_A_NAME = new Set(('and et y e и it ça ca lo la o open ouvre ouvrir ouvres abre abrir открой show montre affiche '
  + 'projet projets project projects proyecto projeto проект after effect effects premiere pro photoshop illustrator blender cinema '
  + '4d c4d fl studio ableton word excel powerpoint pdf mp4 mp3 png jpg jpeg zip rar 7z film films musique musiques music song songs '
  + 'audio présentation presentation diapo slides tableur spreadsheet dernier dernière derniers last latest récent récents recent '
  + 'nouveau new psd docx doc xlsx pptx').split(' '));
// "…and open the folder", "…et ouvre-le": what to do with what she found
const THEN_FOLDER = /(?:ouvre|ouvrir|open|show|montre|abre|abrir|открой|покажи)\s+(?:moi\s+)?(?:le |la |the |its |son |el |a |o )?(?:dossier|folder|carpeta|pasta|папку)/i;
const THEN_OPEN = /(?:et|and|y|e|и)\s+(?:l['’])?(?:ouvre|open|lance|abre|открой)(?:[- ](?:le|la|les)|\s+(?:it|them|lo|la|o|его|её))?\s*[.!?]*$/i;
const searched = (text) => text.replace(/^\s*capri[,!:]?\s+/i, '').toLowerCase().split(/[^\p{L}\p{N}.]+/u).filter((w) => w && !NOT_SEARCHED.has(w)).join(' ');
// a Roblox game by its name: "in my roblox play steal a brain rot", "lance grow a garden sur roblox"
const ROBLOX_VERB = /(?:^|\s)(?:play|joue(?:r)?(?: à| a)?|lance|launch|start|ouvre|open|mets|go to|va sur|juega(?: a)?|jogue|jogar|запусти|включи)\s+/gi;
function robloxGame(text) {
  if (!/roblox/i.test(text)) return null;
  let rest = null;
  for (const m of text.matchAll(ROBLOX_VERB)) rest = text.slice(m.index + m[0].length); // after the last verb
  if (!rest) return null;
  const name = rest
    .replace(/\s+(?:on|in|sur|dans|en|no|na|в)\s+(?:my\s+|mon\s+|mi\s+|meu\s+)?roblox\b.*$/i, '')
    .replace(/\broblox\b/ig, '')
    .replace(/^(?:à|a|au|to|le jeu|the game|un jeu|el juego|o jogo)\s+/i, '')
    .replace(/\s+(?:stp|svp|please|pls|por favor)\b.*$/i, '')
    .replace(/[\s.!?,]+$/, '')
    .trim();
  return name.length >= 2 ? name : null;
}
// "regarde mon écran", "tu vois quoi ?", "what's on my screen?", "что ты видишь?"
const LOOK_ASK = /regarde (?:mon|l['’]|ce que)|(?:jette|jeter) un (?:œil|oeil)|tu vois quoi|qu['’]est[- ]ce que tu vois|look at (?:my|the|this) screen|what(?:'s| is) on my screen|what do you see|take a look|mira (?:mi|la) pantalla|qu[ée] ves|olha (?:minha|a) tela|o que voc[êe] v[êe]|посмотри на (?:мой )?экран|что ты видишь/i;
// what her tag needs to find in your message before it does anything: a small model tags answers about
// anything ("[[music: synthwave]]" under a film tip), and music and the media keys act right away
const LISTEN = /[ée]cout|listen|escuch|\bouv(ir|e)\b|слуша|playlist|album|\b(play|joue|mets|pon|toca|coloca)\b|включи|поставь/i;
const SOUND = /\b(sound|volume|volumen)\b|\b(le|du|au) son\b|\bo som\b|звук|громк/i; // not "son": "his" in French
const PLAY = /\bjou(er|e)\b|\bplay\b|jugar|juega|jogar|joga|играть|поигра/i;
const SITE = /\b(site|web|page|lien|link|url|enlace|p[aá]gina)|сайт|ссылк|\.(com|fr|org|net|io|gg|tv|be|ch|ca|es|br|pt|ru)\b/i;
// "appelle-moi Max", "call me Max", "llámame Max", "me chama de Max", "зови меня Макс"
const NAME_ASK = /(?:appelle[- ]moi|call me|my name is|je m['’]appelle|ll[aá]mame|me llamo|me cham[ae] de|meu nome [eé]|зови меня|меня зовут)\s+([\p{L}\p{N}'’-]{1,24})/iu;
// "souviens-toi que…", "remember that…", "recuerda que…", "lembra que…", "запомни, что…" (said first thing)
const MEMO_ASK = /^\s*(?:capri,?\s+|stp,?\s+|please,?\s+)?(?:souviens[- ]toi(?: que| de)?|n['’]oublie pas(?: que| de)?|remember(?: that)?|recuerda(?: que)?|lembr[ae](?:-se)?(?: que| de)?|запомни,?(?: что)?)\s+(.{3,200})/iu;
const MEMORIES_MAX = 30;
// sites asked for by name ("open youtube") when no app on the PC goes by it: the address is hers, not
// the model's, so it opens right away like an app you named
const SITES = {
  youtube: 'https://www.youtube.com', google: 'https://www.google.com', gmail: 'https://mail.google.com',
  twitch: 'https://www.twitch.tv', netflix: 'https://www.netflix.com', reddit: 'https://www.reddit.com',
  twitter: 'https://x.com', instagram: 'https://www.instagram.com', tiktok: 'https://www.tiktok.com',
  facebook: 'https://www.facebook.com', github: 'https://github.com', chatgpt: 'https://chatgpt.com',
  wikipedia: 'https://www.wikipedia.org', linkedin: 'https://www.linkedin.com', pinterest: 'https://www.pinterest.com',
  crunchyroll: 'https://www.crunchyroll.com', outlook: 'https://outlook.live.com', whatsapp: 'https://web.whatsapp.com',
  discord: 'https://discord.com/app', soundcloud: 'https://soundcloud.com', deezer: 'https://www.deezer.com',
};
// a browser named with a site ("open youtube on chrome"): the site, in the browser you use
const BROWSER = /chrome|edge|firefox|opera|brave|vivaldi|duckduckgo|browser/i;
// "…no opera", "in chrome", "dans firefox", "en brave": the browser to open it in
const IN_BROWSER = /(?:^|\s)(?:no|na|in|on|dans|sur|en|с|в)\s+(?:o\s+|the\s+)?(opera(?:\s*gx)?|chrome|google chrome|edge|firefox|brave|vivaldi)(?![\p{L}])/iu;
const browserIn = (text) => IN_BROWSER.exec(String(text || ''))?.[1] || null;
// an address written out: "github.com", "g1.globo.com/economia"
const DOMAIN = /(?<![\p{L}\p{N}@.\/])((?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|br|net|org|io|dev|app|tv|gg|me|ai|co|edu|gov|info|xyz|fm|so|ly)(?:\/[^\s]*)?)(?![\p{L}\p{N}])/iu;
const domainIn = (text) => { const m = DOMAIN.exec(String(text || '')); return m ? { name: m[1].replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0], url: m[1] } : null; };
// local models this small mostly talk nonsense ("llama3.2:1b", "qwen2.5:0.5b"…)
const TINY = /[:-](0\.5b|1b|1\.5b|135m|270m|360m)\b/i;
// her face when she greets you in a mood (bond.js)
const MOOD_FACE = { angry: 'many', sulk: 'aside', dizzy: 'wide', thrown: 'wide', jealous: 'look', fun: 'laugh', happy: 'laugh', forgiven: 'smug' };

export class Chat {
  constructor({ capri, panel, voice, host, brain }) {
    this.capri = capri;
    this.panel = panel;
    this.voice = voice;
    this.host = host;
    this.brain = brain;
    this.history = []; // your chats with her, [{ role, content }], kept by main.js across restarts
    this.warm = false; // a model already answered this run (Ollama's first answer waits for it to load)
    this.open = false;
    this.turn = 0;     // id of the answer coming in, if any
    this.answer = '';
    this.apps = [];    // the apps open on this PC, as last listed: [{ name, label }]
    this.appsReady = Promise.resolve();
    this.onSetup = null; // (status) => void: she can't answer yet (app.js hands it to setup.js)
    this.onBetterModel = null; // () => void: a bigger model than the tiny one she's on (setup.js)
    this.care = null;          // care.js: taking care of your PC (app.js sets it)
    this.reminders = null; // the reminders she keeps (reminders.js, from app.js)
    this.bond = null;      // how close she is to you (bond.js)
    this.jealousy = null;  // and how she takes your other AIs
    this.onMessage = null; // () => void: you said something to her
    this.waitingWhen = null; // a reminder you asked for without saying when: { text, until }
    host.onChatDelta(({ id, text }) => this.onDelta(id, text));
  }

  get t() {
    return this.brain.t.chat;
  }

  // opening: her own line to open it with instead of a hello (a question of hers you answered out loud)
  async start({ opening = null } = {}) {
    const { capri, host, t } = this;
    if (this.open) {
      this.panel.chatInput.focus();
      return;
    }
    if (capri.stowed) {
      host.setConfig({ visible: true });
      await capri.unstow();
    }
    capri.wake();
    const status = await host.chatStatus();
    if (!status.ok && this.onSetup) {
      this.onSetup(status); // nothing to talk with yet: she sets it up with you, with buttons (setup.js)
      return;
    }
    if (!status.ok) {
      // no Ollama, or nothing to talk with yet: what to do about it
      const offline = status.error === 'offline';
      const other = !offline && status.error !== 'nomodel'; // another provider, saying why
      capri.perform('curious', capri.towardCenter());
      this.panel.say({
        kind: 'info',
        face: 'aside',
        guide: true,
        line: other ? t.failed : offline ? t.offline : t.noModel,
        quote: other ? status.error : offline ? t.offlineHow : t.noModelHow,
        actions: offline
          ? [{ id: 'get', label: t.getOllama, primary: true }, { id: 'ok', label: t.ok }]
          : [{ id: 'ok', label: t.ok, primary: true }],
        onAction: (id) => {
          if (id === 'get') host.openOllama();
          this.panel.hide();
        },
        hold: null,
      });
      return;
    }
    this.history = await host.chatMemory().catch(() => this.history); // "forget" in her menu may have emptied it
    this.history = (this.history || []).map((m) => (m.role === 'assistant' ? { ...m, content: scrub(m.content) } : m));
    this.cold = status.warmup && !this.warm;
    this.agent = Boolean(status.agent); // Claude Code answers, as her, and really works in your project
    this.listApps();
    const shortModel = status.model.replace(/:latest$/, '').replace(/^models\//, ''); // Ollama's tag, Gemini's prefix
    const tiny = status.provider === 'ollama' && TINY.test(status.model) && this.onBetterModel;
    // angry, sulking, dizzy…: she greets you the way she feels, and her model is told she did
    const feeling = this.bond?.feeling;
    const moody = !tiny && feeling && t.moody[feeling];
    const hello = opening || (moody ? fmt(pick(moody), this.bond.mood.vars) : pick(this.history.length ? t.again : t.hello));
    this.opening = moody || opening ? hello : null;
    if (opening) this.remember({ role: 'assistant', content: opening }); // what you're answering
    host.focusOverlay(true); // the keyboard, for typing to her
    const shown = this.panel.say({
      kind: 'chat',
      face: moody ? MOOD_FACE[feeling] : 'look',
      badge: t.badge,
      tag: shortModel,
      line: tiny ? fmt(t.tiny, { model: shortModel }) : hello,
      actions: tiny ? [{ id: 'better', label: t.better, primary: true }] : [],
      onAction: () => {
        this.panel.hide(); // her chat holds off her guide's panels: it goes first
        this.onBetterModel?.();
      },
      chat: {
        placeholder: t.placeholder,
        send: t.send,
        close: t.close,
        noteTag: t.noteTag,
        note: status.local ? t.note : t.noteCloud,
      },
      onSend: (text) => this.send(text),
      onLeave: () => this.close(),
      hold: null,
    });
    if (!shown) {
      host.focusOverlay(false); // something more important is on (a permission prompt)
      return;
    }
    this.open = true;
    this.sessionFrom = this.history.length; // what's said from here: for her memory when it closes
    this.watchIdle();
    this.idle();
    setTimeout(() => this.panel.chatInput.focus(), 150); // once the overlay has the keyboard
    capri.perform('hop');
    capri.nextMove = capri.nextGaze = performance.now() + STAY_MS;
  }

  // ---- her chat closes on its own after a while unused ----
  // Time to read her last line (longer for a longer one), then it goes; never while you type, while
  // she's answering, while you talk to her out loud, or with her buttons waiting for you.
  watchIdle() {
    if (this.idleWatched) return;
    this.idleWatched = true;
    const busy = this.panel.setChatBusy.bind(this.panel);
    this.panel.setChatBusy = (on) => {
      busy(on);
      if (this.open) (on ? clearTimeout(this.idleTimer) : this.idle());
    };
    this.panel.chatInput.addEventListener('input', () => {
      this.typedAt = Date.now();
      if (this.open) this.idle();
    });
  }

  idle(ms = null) {
    clearTimeout(this.idleTimer);
    const last = this.history.at(-1);
    const len = last?.role === 'assistant' ? String(last.content).length : 0;
    const wait = ms ?? Math.max(30000, Math.min(120000, 30000 + len * 70));
    this.idleTimer = setTimeout(() => this.idleClose(), wait);
  }

  idleClose() {
    if (!this.open) return;
    const input = this.panel.chatInput;
    const typing = (input?.value || '').trim() || Date.now() - (this.typedAt || 0) < 20000;
    const talking = this.turn || this.mic?.rec || this.mic?.asking || this.converse?.listening;
    const choosing = this.panel.current?.actions?.length && !this.choiceWaited;
    if (typing || talking) return this.idle(15000);
    if (choosing) { // her buttons: a little longer, once
      this.choiceWaited = true;
      return this.idle(60000);
    }
    this.choiceWaited = false;
    this.panel.hide(); // as if you'd clicked her ✕
    return undefined;
  }

  close() {
    if (!this.open) return;
    clearTimeout(this.idleTimer);
    this.open = false;
    this.onClosed?.();
    if (this.turn) this.host.chatStop(this.turn);
    this.turn = 0;
    this.host.focusOverlay(false);
    this.capri.nextMove = performance.now() + 30000;
    this.capri.nextGaze = performance.now() + 60000;
  }

  async send(text) {
    if (this.turn || !this.open) return;
    const id = Date.now();
    this.turn = id;
    this.answer = '';
    this.history.push({ role: 'user', content: text });
    // "pode" / "não" to her offer to put Claude on it (typed or said out loud): that's the button
    const answered = this.hands?.spoken(text);
    if (answered) {
      this.panel.chatTurn({ quote: text, face: 'aside' });
      this.turn = 0;
      this.panel.stream(answered === 'no' ? this.hands.t.offerDropped || '👍' : '…', { done: true });
      return;
    }
    this.panel.setChatBusy(true);
    this.panel.setActions([]); // a close button she offered before goes with a new message
    // a game on in her chat (games.js): your move, unless it isn't one (then the game ends)
    this.panel.chatTurn({ quote: text, face: 'aside' });
    if (this.games?.on) {
      const line = await this.games.turn(text).catch(() => null);
      if (line) return this.sendLine(line, id, 'smug');
      // not a move: the game's over, and this is a message like any other
    }
    this.capri.pulse();
    this.onMessage?.(text);
    // what you asked for plainly happens right away (the music, the volume, an app you named): her
    // line about it comes under her answer (Claude Code, answering her chat, does things its own way)
    const asked = this.agent ? null : this.asked(text);
    if (asked?.kind === 'look') return this.sendLook(text, id);
    if (asked?.kind === 'care') return this.sendCare(asked, id);
    if (asked?.kind === 'game') {
      const line = await this.games.start(asked.game).catch(() => null);
      return this.sendLine(line || this.brain.t.games.quizFailed, id, 'smug');
    }
    if (asked?.kind === 'task' && this.hands) {
      // "task: …": straight to her hands, with a button first
      this.turn = 0;
      this.remember({ role: 'assistant', content: this.hands.t.offer });
      this.panel.stream('…', { done: true });
      this.panel.setChatBusy(false);
      return this.hands.offer(asked.text, '…', asked.text);
    }
    const early = asked && asked.kind !== 'close' ? this.doNow(asked) : null;
    this.bond?.heard(text); // "sorry": she lets it go
    await Promise.race([this.appsReady, new Promise((r) => setTimeout(r, 1500))]);
    // what she greeted you with (angry, sulking…), in the conversation before your message, so her
    // answer carries on from it (after another answer of hers: added to that one, never two in a row)
    if (this.opening) {
      const at = this.history.length - 1;
      const before = this.history[at - 1];
      if (before?.role === 'assistant') this.history[at - 1] = { ...before, content: `${before.content}\n${this.opening}` };
      else this.history.splice(at, 0, { role: 'assistant', content: this.opening });
      this.opening = null;
    }
    // what you copied, if you asked about it: with your message, for this answer only
    let clip = '';
    if (!this.agent && CLIP_ASK.test(text)) {
      clip = String(await this.host.readClip().catch(() => '')).trim();
      if (!clip) {
        this.turn = 0;
        this.history.pop();
        this.panel.stream(this.brain.t.daily.clipEmpty, { done: true });
        this.panel.setFace('aside');
        this.panel.setChatBusy(false);
        return;
      }
    }
    const messages = [{ role: 'system', content: this.persona() }, ...this.history.slice(-REMEMBER)];
    // a file you handed her (inbox): with this message, then it's done
    const file = this.attached;
    this.attached = null;
    if (file) {
      const last = messages.at(-1);
      const body = file.text ? `\nIts text, between <<< and >>>:\n<<<\n${file.text}\n>>>` : '';
      messages[messages.length - 1] = { ...last, content: `${last.content}\n\n[The user handed you a file: ${file.name} (${file.kind}, ${Math.max(1, Math.round(file.size / 1024))} KB), at ${file.path} — for Claude Code: ${file.wsl}]${body}` };
    }
    if (clip) {
      const last = messages.at(-1);
      messages[messages.length - 1] = { ...last, content: `${last.content}\n\n[The text the user copied, to work on as they ask, between <<< and >>>:]\n<<<\n${clip}\n>>>` };
    }
    // Her mood (angry, sulking…) and her language, said again right by your message, for this answer
    // only. Small local models mostly go by the last thing they read: up in her prompt alone, they
    // forget it (and answer in English after a conversation in English).
    if (!this.agent) {
      const mood = this.bond?.moodLine().replace(/^Right now: /, '');
      const last = messages.at(-1);
      // what she knows that relates to this message: right by it, where a small model reads it
      const related = this.visitor ? [] : (this.memory?.relevant(text) || []);
      const recall = related.length ? `You remember, related to this: ${related.join('; ')}.` : '';
      messages[messages.length - 1] = { ...last, content: `${last.content}\n\n(Note for you, never repeat it: ${[mood, recall, this.languageNote()].filter(Boolean).join(' ')})` };
    }
    // nothing yet after a few seconds: Ollama is still loading the model (the first answer after a start),
    // or Claude Code is at work
    const wait = this.agent ? this.t.working : this.cold ? this.t.loading : null;
    const slow = wait && setTimeout(() => {
      if (this.turn === id && !this.answer) this.panel.stream(wait);
    }, LOADING_AFTER_MS);
    const res = await this.host.chatSend({ id, messages });
    clearTimeout(slow);
    if (this.turn !== id) {
      // closed meanwhile: your message goes too, or the next answer would answer it as well
      if (this.history.at(-1)?.content === text) this.history.pop();
      return;
    }
    this.turn = 0;
    if (!res.ok) {
      this.history.pop();
      this.panel.setFace('wide');
      // too busy or gone even after trying other models (main.js): said plainly, not the server's JSON
      this.panel.stream(res.code === 'busy' ? this.t.swamped : res.code === 'gone' ? this.t.gone : `${this.t.failed} ${res.error}`, { done: true });
      this.panel.setChatBusy(false);
      return;
    }
    let answer = clean(res.text) || '…';
    // you wrote in her language and she answered in English (a small model slips): once more, firmly
    if (!this.agent && !inLang(answer, this.brain.lang) && inLang(text, this.brain.lang)) {
      const note = this.languageNote();
      const again = await this.host.chatSend({ id: id + 1, messages: [...messages.slice(0, -1), { ...messages.at(-1), content: `${messages.at(-1).content}\n\n${note} ${note}` }] }).catch(() => null);
      if (again?.ok && inLang(again.text, this.brain.lang)) {
        res.text = again.text;
        answer = clean(again.text) || answer;
      }
    }
    this.warm = true;
    this.remember({ role: 'assistant', content: answer });
    this.panel.stream(answer, { done: true });
    this.panel.setFace(mood(answer));
    this.panel.setChatBusy(false);
    if (clip) {
      // what she made of it: a button to copy it back
      const dt = this.brain.t.daily;
      this.panel.setActions([{ id: 'copy', label: dt.copy, primary: true }], () => {
        this.host.writeClip(answer);
        this.panel.setActions([]);
        this.addLine(answer, dt.copied, 'smug');
      });
    }
    if (!this.agent) this.after(res.text, answer, asked, early, text);
    this.onAnswered?.(answer); // converse.js: a question in it, asked in a talk out loud, is listened for
    this.listApps(); // fresh for the next message
  }

  // a line of hers as the answer, no AI (her games)
  sendLine(line, id, face = 'look') {
    if (this.turn !== id) return;
    this.turn = 0;
    this.remember({ role: 'assistant', content: line });
    this.panel.stream(line, { done: true });
    this.panel.setFace(face);
    this.panel.setChatBusy(false);
  }

  // Taking care of your PC (care.js): done without her AI (quicker, and it works with the internet
  // down), her line about it as her answer, with its buttons.
  async sendCare(asked, id) {
    const slow = setTimeout(() => {
      if (this.turn === id) this.panel.stream(this.care.t.working);
    }, 1500);
    const done = await this.care.now(asked).catch(() => null);
    clearTimeout(slow);
    if (this.turn !== id) return;
    this.turn = 0;
    const line = done?.line || this.care.t.failed;
    this.remember({ role: 'assistant', content: line });
    this.panel.stream(line, { done: true });
    this.panel.setFace(done?.face || 'aside');
    this.panel.setChatBusy(false);
    if (done?.buttons?.length) this.offer(done, line);
  }

  // Her buttons for what she found: each click does its part, its line under hers, then its own
  // buttons, the others left if it says so (again), and a line for later when it's a long job.
  offer(done, answer) {
    this.panel.setActions(done.buttons, async (id) => {
      this.panel.setActions([]);
      const next = await Promise.resolve(done.onButton(id)).catch(() => null);
      if (next?.line) this.addLine(answer, next.line, next.face);
      const said = next?.line ? `${answer}\n${next.line}` : answer;
      if (next?.buttons?.length) this.offer(next, said);
      else if (next?.again) {
        const rest = done.buttons.filter((b) => b.id !== id);
        if (rest.length) this.offer({ ...done, buttons: rest.map((b, i) => ({ ...b, primary: i === 0 })) }, said);
      }
      next?.later?.then((last) => last && this.care.tell(last.line, last.face));
    });
  }

  // "Look at my screen" in her chat: she looks (asking you first, the first time) and answers here,
  // the conversation so far in mind.
  async sendLook(text, id) {
    const tl = this.brain.t.look;
    const say = (line, face = 'aside') => {
      if (this.turn !== id) return;
      this.turn = 0;
      this.remember({ role: 'assistant', content: line });
      this.panel.stream(line, { done: true });
      this.panel.setFace(face);
      this.panel.setChatBusy(false);
    };
    if (!this.look.asked) {
      const where = await this.host.lookWhere().catch(() => ({}));
      this.history.pop(); // your message comes back once you've said yes
      say(`${tl.ask} ${fmt(where.local ? tl.local : tl.online, { model: where.model || '…', service: where.provider || '' })}`, 'look');
      this.panel.setActions([{ id: 'yes', label: tl.yes, primary: true }, { id: 'no', label: tl.no }], async (choice) => {
        this.panel.setActions([]);
        if (choice !== 'yes') {
          this.interject(tl.declined, [], null);
          return;
        }
        await this.host.setConfig({ lookAsked: true });
        this.look.asked = true;
        this.send(text);
      });
      return;
    }
    const snap = await this.host.lookSnap();
    if (!snap.ok) return say(fmt(tl.failed, { error: snap.error }));
    this.look.effect();
    const res = await this.host.lookSay({
      id: snap.id,
      persona: this.lookPersona(),
      history: this.history.slice(-REMEMBER, -1),
      prompt: `${text}\n\n(Note for you, never repeat it: the picture is the user's screen right now; a small figure with a big red mane on it is you. Answer about what you really see, in character. If they ask you to read something (an error, a message, code), quote what it actually says and explain it simply, in a few sentences. ${this.languageNote()})`,
    });
    if (!res.ok) {
      const model = String(res.model || '…').replace(/:latest$/, '');
      return say(res.code === 'novision' ? fmt(tl.noVision, { model }) : res.code === 'noai' ? tl.noAI : fmt(tl.failed, { error: res.error || '…' }));
    }
    const answer = clean(res.text).replace(/^["“«]\s*|\s*["”»]$/g, '') || '…';
    this.seen = { text: answer, at: Date.now() };
    return say(answer, mood(answer));
  }

  // an answer of hers, kept with your message before it
  remember(message) {
    this.history.push(message);
    this.history = this.history.slice(-KEEP);
    this.host.chatRemember(this.history);
  }

  listApps() {
    this.appsReady = this.host.openApps().then((list) => { this.apps = list || []; }).catch(() => {});
  }

  // What you asked plainly, read off your message (a small model doesn't always write its tag right):
  // { kind: 'media', action } | { kind: 'music', song } | { kind: 'close', name } | { kind: 'open', text }
  asked(text) {
    const count = text.trim().split(/\s+/).length;
    const task = TASK_ASK.exec(text);
    if (task && this.hands) return { kind: 'task', text: task[1].trim() };
    if (this.hands && WORK_ASK.test(text) && folderIn(text)) return { kind: 'task', text: text.trim() };
    if (this.hands && USAGE_ASK.test(text)) return { kind: 'usage' };
    if (this.gestures && RPS_ASK.test(text)) return { kind: 'rps' };
    if (this.activity && WEEK_ASK.test(text)) return { kind: 'week' };
    if (CORNER_ASK.test(text)) return { kind: 'corner' };
    const liveAdd = LIVE_ADD.exec(text);
    if (liveAdd) return { kind: 'live', op: 'add', name: liveAdd[1] || liveAdd[3], site: (liveAdd[2] || liveAdd[4] || 'twitch').toLowerCase() };
    const liveDel = LIVE_DEL.exec(text);
    if (liveDel) return { kind: 'live', op: 'remove', name: liveDel[1] || liveDel[2] };
    if (this.notices && NOTICES_ASK.test(text)) return { kind: 'notices' };
    const pl = PLAYLIST_ASK.exec(text);
    if (pl) return { kind: 'playlist', about: (pl[1] || pl[2] || '').replace(/[.!?]+$/, '').trim() };
    if (this.presence && NIGHT_ASK.test(text.trim())) return { kind: 'night' };
    for (const [action, re] of TABS) {
      const m = re.exec(text);
      if (m) return { kind: 'tabs', action, query: (m[1] || m[2] || '').replace(/[.!?]+$/, '').replace(/^(?:o|a|os|as|the)\s+/i, '').trim() };
    }
    const ctx = CTX_ASK.exec(text);
    if (ctx) return { kind: 'ctxRemind', app: (ctx[1] || ctx[3]).trim(), text: (ctx[2] || ctx[4]).replace(/[.!]+$/, '').trim() };
    if (SIDE_ASK.test(text)) return { kind: 'arrange', action: 'side', names: appNames(text.split(SIDE_ASK)[0]) };
    const focus = FOCUS_ASK.exec(text);
    if (focus) return { kind: 'arrange', action: 'focus', names: appNames(focus[1]) };
    if (RESTORE_ASK.test(text)) return { kind: 'arrange', action: 'restore', names: [] };
    const max = MAX_ASK.exec(text);
    if (max && count <= 8) return { kind: 'arrange', action: 'maximize', names: appNames(max[1] || max[2]) };
    if (this.art && PORTRAIT_ASK.test(text)) return { kind: 'portrait' };
    if (this.reminders) {
      const remind = parseReminder(text);
      if (remind) return { kind: 'remind', ...remind };
      // the time, said after she asked when ("dans 10 min")
      const w = this.waitingWhen;
      const when = w && Date.now() < w.until && count <= 6 && parseWhen(text);
      if (when && when.at > Date.now()) return { kind: 'remind', at: when.at, text: w.text };
    }
    const name = NAME_ASK.exec(text)?.[1];
    if (name) return { kind: 'name', name };
    const game = this.games && WORD_GAMES.find(([, re]) => re.test(text))?.[0];
    if (game) return { kind: 'game', game };
    const memo = MEMO_ASK.exec(text)?.[1]?.trim();
    if (memo) return { kind: 'memo', text: memo };
    if (this.look && (LOOK_ASK.test(text) || LOOK_READ.test(text))) return { kind: 'look' };
    const pc = this.askedPc(text, count);
    if (pc) return pc;
    if (SHOT_ASK.test(text)) return { kind: 'shot' };
    const roblox = robloxGame(text);
    if (roblox) return { kind: 'roblox', game: roblox };
    if (SEARCH_VERB.test(text) && WEB_WORD.test(text) && searched(text)) return { kind: 'web', query: searched(text) };
    const exts = fileTypes(text);
    if (SEARCH_VERB.test(text) && (FILE_WORD.test(text) || exts.length)) {
      const query = searched(text).split(' ').filter((w) => w && !NOT_A_NAME.has(w)).join(' ');
      const then = THEN_FOLDER.test(text) ? 'folder' : THEN_OPEN.test(text) ? 'open' : null;
      if (query || exts.length) return { kind: 'files', query, exts, then };
    }
    const media = MEDIA_ASK.find(([, re]) => re.test(text))?.[0];
    if (media && (count <= 5 || MUSIC_WORD.test(text))) return { kind: 'media', action: media };
    const song = SPOTIFY_ASK.exec(text)?.[1];
    if (song) return { kind: 'music', song };
    const video = YOUTUBE_ASK.exec(text)?.[1];
    if (video) return { kind: 'youtube', song: songOf(video) };
    const app = this.askedToClose(text);
    if (app) return { kind: 'close', name: app };
    if (GAME_ASK.test(text) && count <= 8) return { kind: 'open', text };
    const start = MUSIC_START.exec(text.trim())?.[1];
    if (start && !HER_PICK.test(start)) return { kind: 'play', song: songOf(start.replace(/[\s.!?]+$/, '')) };
    const both = PLAY_AFTER.exec(text.trim());
    const after = both?.[1];
    // "ouvre discord et lance spotify": the first half too
    if (after && !VAGUE_SONG.test(after) && !HER_PICK.test(after)) return { kind: 'play', song: songOf(after.replace(/[\s.!?]+$/, '')), before: text.trim().slice(0, both.index) };
    const play = PLAY_ASK.exec(text.trim())?.[1];
    if (play && !VAGUE_SONG.test(play) && !HER_PICK.test(play)) return { kind: 'play', song: songOf(play.replace(/[\s.!?]+$/, '')) };
    if (OPEN_ASK.test(text) && count <= 14) return { kind: 'open', text };
    return null;
  }

  // Something to do to your PC itself (system.js), read off your message: { kind: 'pc', what, ... }
  askedPc(text, count) {
    const care = this.care?.asked(text, count);
    if (care) return care;
    const pc = (what, more = {}) => ({ kind: 'pc', what, ...more });
    const power = POWER_ASK.find(([, re]) => re.test(text))?.[0];
    if (power === 'cancel') return pc('power', { power });
    if (power && (PC_WORD.test(text) || (['lock', 'sleep'].includes(power) && count <= 4))) {
      const when = ['shutdown', 'restart'].includes(power) && parseWhen(text);
      return pc('power', { power, seconds: when ? Math.round((when.at - Date.now()) / 1000) : 30 });
    }
    if (SNIP_ASK.test(text)) return pc('snip');
    if (UNTIDY_ASK.test(text)) return pc('tidy', { back: true });
    if (TIDY_ASK.test(text)) return pc('tidy');
    if (DARK_ASK.test(text)) return pc('theme', { dark: true });
    if (LIGHT_ASK.test(text)) return pc('theme', { dark: false });
    if (TIMER_ASK.test(text)) {
      const ms = duration(text);
      if (ms >= 1000) return pc('timer', { ms });
    }
    if (count <= 10) {
      const level = VOLUME_ASK.exec(text)?.[1];
      if (level && Number(level) <= 100) return pc('volume', { level: Number(level) });
      if (UNMUTE_ASK.test(text)) return pc('volume', { mute: false });
      if (MUTE_ASK.test(text)) return pc('volume', { mute: true });
    }
    // "mets Discord à gauche et Chrome à droite"
    if (PLACE_VERB.test(text) && SIDE.some(([, re]) => re.test(text))) {
      const places = text.split(/\s+(?:et|and|y|e|и)\s+/i).map((part) => {
        const side = SIDE.find(([, re]) => re.test(part));
        if (!side) return null;
        const name = part.replace(PLACE_VERB, '').replace(side[1], '').replace(/\b(?:la|le|les|l['’]|the|el|o|a|fen[êe]tre|window|ventana|janela|окно)\b/gi, '').replace(/[\s.!?,]+/g, ' ').trim();
        return name.length >= 2 ? { name, side: side[0] } : null;
      }).filter(Boolean);
      if (places.length) return pc('arrange', { places });
    }
    if (count <= 12) {
      const page = SETTINGS_PAGES.find(([, re]) => re.test(text))?.[0];
      if (page && SETTINGS_WORD.test(text)) return pc('settings', { page });
      const info = INFO_ASK.find(([, re]) => re.test(text))?.[0];
      if (info && (QUESTION.test(text) || count <= 3)) return pc('info', { info });
      if (page && OPEN_ASK.test(text)) return pc('settings', { page });
    }
    return null;
  }

  // Doing it to your PC (system.js through host.pcDo): her line about it, a button first for its power.
  async pcNow(asked) {
    const t = this.t.pc;
    const run = (req) => this.host.pcDo(req);
    const gb = (bytes) => `${(bytes / 1024 ** 3).toFixed(bytes < 100 * 1024 ** 3 ? 1 : 0)} ${t.gb}`;
    switch (asked.what) {
      case 'settings':
        this.zap();
        return (await run({ action: 'settings', page: asked.page })) ? { line: fmt(t.settings, { page: t.pages[asked.page] }), face: 'smug' } : null;
      case 'info': {
        const r = await run({ action: 'info', what: asked.info });
        if (!r) return null;
        if (asked.info === 'battery') {
          if (r.none) return { line: t.noBattery, face: 'look' };
          return { line: fmt(r.charging ? t.charging : t.battery, { percent: r.percent }), face: r.percent < 20 && !r.charging ? 'wide' : 'look' };
        }
        if (asked.info === 'disk') return { line: fmt(t.disk, { free: gb(r.free), total: gb(r.total), drive: r.drive }), face: 'look' };
        if (asked.info === 'ram') return { line: fmt(t.ram, { used: gb(r.used), total: gb(r.total) }), face: 'look' };
        return { line: r.ip ? fmt(t.ip, { ip: r.ip }) : t.noIp, face: 'look' };
      }
      case 'volume': {
        this.capri.pulse();
        const r = await run({ action: 'volume', level: asked.level, mute: asked.mute });
        if (!r) return null;
        return { line: asked.mute === true ? t.muted : asked.mute === false ? t.unmuted : fmt(t.volume, { level: r.level }), face: 'smug' };
      }
      case 'timer': {
        const time = span(asked.ms);
        const r = this.reminders.add(Date.now() + asked.ms, fmt(t.timerDone, { time }), { timer: true });
        this.countdown();
        return { line: fmt(t.timer, { time }), face: 'smug', reminder: r.id };
      }
      case 'snip':
        // she'd be in it: out of the way while you pick
        document.documentElement.style.visibility = 'hidden';
        setTimeout(() => { document.documentElement.style.visibility = ''; }, 2500);
        return (await run({ action: 'snip' })) ? { line: t.snip, face: 'smug' } : null;
      case 'tidy': {
        if (asked.back) return (await run({ action: 'tidy', back: true })) ? { line: t.back, face: 'smug' } : null;
        // she sweeps them off one after the other, front first, then they go
        const wins = this.capri.windows.wins.slice(0, 6);
        this.zap();
        wins.forEach((w, i) => setTimeout(() => {
          this.capri.fx.slices(w.x, w.y, w.w, Math.min(w.h, 500), { count: 8, life: 220 });
          this.voice.play('bolt', { soft: true });
        }, 120 + i * 110));
        await new Promise((r) => setTimeout(r, 200 + wins.length * 110));
        return (await run({ action: 'tidy' })) ? { line: t.tidy, face: 'laugh' } : null;
      }
      case 'arrange': {
        this.zap();
        const lines = [];
        for (const { name, side } of asked.places) {
          const r = await run({ action: 'arrange', name, side });
          lines.push(r?.found ? fmt(t.placed, { app: r.name, side: t.sides[side] }) : fmt(t.notOpen, { app: name }));
        }
        return { line: lines.join('\n'), face: 'smug' };
      }
      case 'theme':
        this.zap();
        return (await run({ action: 'theme', dark: asked.dark })) ? { line: asked.dark ? t.dark : t.light, face: 'smug' } : null;
      case 'power': {
        if (asked.power === 'cancel') {
          await run({ action: 'power', what: 'cancel' });
          this.shutdown = null;
          return { line: t.cancelled, face: 'look' };
        }
        const timed = ['shutdown', 'restart'].includes(asked.power);
        const when = timed && asked.seconds > 35 ? fmt(t.in, { time: span(asked.seconds * 1000) }) : t.now;
        return { line: fmt(t.ask[asked.power], { when }), face: 'many', confirm: { ...asked, seconds: timed ? Math.max(30, asked.seconds) : 0, when } };
      }
      default:
        return null;
    }
  }

  // Your click on her button for your PC's power: done, or left alone.
  async powerNow(confirm, answer) {
    const t = this.t.pc;
    this.panel.setActions([]);
    if (!(await this.host.pcDo({ action: 'power', what: confirm.power, seconds: confirm.seconds }))) return;
    if (['shutdown', 'restart'].includes(confirm.power)) {
      this.shutdown = { at: Date.now() + confirm.seconds * 1000, what: confirm.power };
      this.countdown();
      this.addLine(answer, fmt(t.planned[confirm.power], { when: confirm.when }), 'smug');
    }
  }

  // Her countdowns in her ticker (a timer, the PC about to shut down), the soonest, whenever it
  // isn't showing Claude at work.
  countdown() {
    clearInterval(this.counting);
    const tick = () => {
      const t = this.t.pc;
      const now = Date.now();
      const timer = this.reminders?.upcoming.find((r) => r.timer && r.at > now);
      const items = [
        timer && { at: timer.at, verb: t.timerVerb },
        this.shutdown?.at > now && { at: this.shutdown.at, verb: t.powerVerb[this.shutdown.what] },
      ].filter(Boolean).sort((a, b) => a.at - b.at);
      const shown = this.panel.tickerAction;
      if (!items.length) {
        clearInterval(this.counting);
        if (shown?.countdown) this.panel.setTicker(null);
        return;
      }
      if (shown && !shown.countdown) return; // Claude at work comes first
      this.panel.setTicker({ verb: items[0].verb, target: left(items[0].at - now), thinking: true, countdown: true });
    };
    tick();
    this.counting = setInterval(tick, 1000);
  }

  // Doing it now. Resolves with her line about it ({ line, face }), or null if there was nothing to do.
  async doNow(asked) {
    if (asked.kind === 'usage') return { line: await this.hands.usageLine(), face: 'look' };
    if (asked.kind === 'rps' || asked.kind === 'portrait') return this.bodyGame(asked.kind);
    if (asked.kind === 'arrange') return this.arrange(asked);
    if (asked.kind === 'week') return this.week();
    if (asked.kind === 'tabs') return this.tabs(asked);
    if (asked.kind === 'live') {
      const l = this.brain.t.lives;
      const r = await this.host.livesSet?.({ op: asked.op, site: asked.site, name: asked.name }).catch(() => null);
      if (!r?.ok) return { line: asked.op === 'remove' ? fmt(l.notWatching, { name: asked.name }) : l.failed, face: 'aside' };
      if (asked.op === 'remove') return { line: fmt(l.removed, { name: r.name }), face: 'look' };
      return { line: fmt(r.live ? l.addedLive : l.added, { name: r.name, site: r.site === 'youtube' ? 'YouTube' : 'Twitch' }), face: 'smug' };
    }
    if (asked.kind === 'notices') {
      const n = this.brain.t.notices;
      const list = this.notices.recent.filter((x) => Date.now() - x.at < 3 * 3600000);
      if (!list.length) return { line: n.none, face: 'look' };
      const by = {};
      for (const x of list) (by[x.app] ||= []).push(x.title);
      return { line: fmt(n.summary, { count: list.length, list: Object.entries(by).map(([app, t2]) => fmt(n.part, { count: t2.length, app, who: [...new Set(t2)].slice(0, 3).join(', ') })).join('; ') }), face: 'look' };
    }
    if (asked.kind === 'playlist') return this.playlist(asked.about);
    if (asked.kind === 'night') {
      // a little while to read her goodnight, then the chat closes and she sleeps (camera resting)
      setTimeout(() => {
        if (!this.open) return;
        this.panel.hide();
        this.close();
        setTimeout(() => this.presence.goodnight(), 800);
      }, 6000);
      const queued = (await this.host.workState?.().catch(() => null))?.queue?.length;
      return { line: fmt(pick(this.brain.t.presence.night), {}) + (queued ? ` ${fmt(this.brain.t.presence.nightQueue, { count: queued })}` : ` ${this.brain.t.presence.nightTip}`), face: 'look' };
    }
    if (asked.kind === 'corner') {
      this.host.openCorner?.();
      return { line: this.brain.t.week.corner, face: 'laugh' };
    }
    if (asked.kind === 'ctxRemind') {
      const r = await this.host.ctxAdd?.({ app: asked.app, text: asked.text }).catch(() => null);
      return r ? { line: fmt(this.brain.t.arrange.ctxSet, { app: asked.app, text: asked.text }), face: 'smug' } : null;
    }
    if (asked.kind === 'pc') return this.pcNow(asked);
    const { t } = this;
    const custom = this.brain.custom;
    if (asked.kind === 'remind') {
      if (!asked.at) {
        this.waitingWhen = { text: asked.text, until: Date.now() + 3 * 60 * 1000 }; // her answer asks when
        return null;
      }
      this.waitingWhen = null;
      const r = this.reminders.add(asked.at, asked.text); // set before her answer is asked for: she knows
      const tr = this.brain.t.remind;
      return { line: fmt(r.text ? tr.set : tr.setBare, { time: clock(r.at, this.brain.lang), text: r.text }), face: 'smug', reminder: r.id };
    }
    if (asked.kind === 'name') {
      custom.userName = asked.name; // her answer, being written now, already knows it
      this.host.setConfig({ userName: asked.name });
      return { line: fmt(this.brain.t.custom.named, { name: asked.name }), face: 'laugh' };
    }
    if (asked.kind === 'memo') {
      custom.memories = [...(custom.memories || []).filter((m) => m !== asked.text), asked.text].slice(-MEMORIES_MAX);
      this.host.setConfig({ memories: custom.memories });
      return { line: this.brain.t.custom.remembered, face: 'smug' };
    }
    if (asked.kind === 'media') {
      this.capri.pulse();
      return (await this.host.media(asked.action)) ? { line: t.media[asked.action], face: 'smug' } : null;
    }
    if (asked.kind === 'music') return this.spotify(asked.song);
    if (asked.kind === 'youtube') return this.youtube(asked.song);
    if (asked.kind === 'roblox') {
      this.zap();
      const res = await this.host.roblox(asked.game);
      if (!res) return null;
      if (!res.name) return { line: fmt(t.robloxNone, { game: asked.game }), face: 'aside' };
      return { line: fmt(res.app ? t.robloxPlay : t.robloxPage, { game: res.name }), face: 'laugh' };
    }
    if (asked.kind === 'web') {
      this.zap();
      return (await this.host.webSearch(asked.query)) ? { line: fmt(t.web, { query: asked.query }), face: 'smug' } : null;
    }
    if (asked.kind === 'files') {
      const results = await this.host.searchFiles({ query: asked.query, exts: asked.exts });
      const asking = asked.query || asked.exts.map((e) => `.${e}`).join(' ');
      if (!results.length) return { line: fmt(t.filesNone, { query: asking }), face: 'aside' };
      const list = results.slice(0, 3).map((f) => `${f.name} (${f.folder})`).join(', ');
      const lines = [fmt(results.length === 1 ? t.fileFound : t.filesFound, { count: results.length, list })];
      // "…and open the folder" / "…and open it": done right away, on the newest one
      if (asked.then === 'folder' && (await this.host.openFile(results[0].path, true))) lines.push(fmt(t.folderOpened, { name: results[0].name }));
      // (never a program or a script on its own: that one waits for its button)
      const runs = /\.(exe|bat|cmd|ps1|vbs|vbe|js|jse|wsf|msi|reg|scr|com|jar|hta)$/i.test(results[0].name);
      if (asked.then === 'open' && !runs && (await this.host.openFile(results[0].path))) lines.push(fmt(t.opened, { app: results[0].name }));
      return { line: lines.join('\n'), face: 'smug', files: results };
    }
    if (asked.kind === 'shot') {
      // not her nor her panel in it
      document.documentElement.style.visibility = 'hidden';
      await new Promise((r) => setTimeout(r, 180));
      const shot = await this.host.screenshot();
      document.documentElement.style.visibility = '';
      this.voice.play('tick');
      return shot ? { line: fmt(t.shot, { name: shot.name }), face: 'smug', files: [shot] } : null;
    }
    if (asked.kind === 'play') {
      // "abra o spotify e coloque X": a Spotify search for it (it opens the app too)
      if (/spotify/i.test(`${asked.before || ''} ${asked.text || ''}`)) return this.spotify(asked.song);
      // what came before an "and" first ("ouvre discord et…"), unless it's YouTube, where the song goes anyway
      const first = asked.before && OPEN_ASK.test(asked.before) && !/youtube/i.test(asked.before)
        ? await this.doNow({ kind: 'open', text: asked.before }) : null;
      // "joue à Brawlhalla" is a game, "lance spotify" an app; anything else, a song
      const game = await this.host.findLaunch(asked.song);
      const then = game && ['steam', 'epic', 'app', 'file'].includes(game.kind) && !game.risky ? await this.openNow(game) : await this.youtube(asked.song);
      if (!first?.line) return then;
      return { line: [first.line, then?.line].filter(Boolean).join('\n'), face: then?.face || first.face };
    }
    const item = await this.host.findLaunch(asked.text);
    const site = domainIn(asked.text) || namedSite(asked.text);
    if (site && (!item || BROWSER.test(item.name))) {
      this.zap();
      return this.siteLine(await this.host.openSite(site.url, browserIn(asked.text)), site.name);
    }
    if (!item) return null; // nothing by that name here: her tag may still say what you meant
    return this.openNow(item);
  }

  // An app, a game, a file or a folder: opened, or behind a button when it would run something.
  async openNow(item) {
    if (item.risky) return { offer: item };
    this.zap();
    const res = await this.host.launch(item);
    const name = this.nameOf(item);
    return { line: res.ok ? fmt(this.t.opened, { app: name }) : `${this.t.failed} ${res.error}`, face: res.ok ? 'laugh' : 'aside' };
  }

  // how she calls it: a folder like Downloads in her words, anything else by its name
  nameOf(item) {
    return item.kind === 'known' ? this.t.folders[item.id] || item.name : item.name;
  }

  // The song itself on YouTube (the right video, not a search), in your browser.
  async youtube(song) {
    this.zap();
    const res = await this.host.youtube(song);
    if (!res) return null;
    return { line: res.title ? fmt(this.t.youtube, { title: res.title }) : fmt(this.t.youtubeSearch, { song }), face: 'laugh' };
  }

  // Once she has answered: her line about what she did, else the app you asked to close, else what
  // her tag asks for, if your message (text) asked for that kind of thing.
  async after(raw, answer, asked, early, text) {
    const { t } = this;
    const done = early && (await early);
    if (done?.reminder) {
      // a reminder set: a button to take it back, right there
      this.addLine(answer, done.line, done.face);
      const tr = this.brain.t.remind;
      this.panel.setActions([{ id: 'cancel', label: tr.cancel }], () => {
        this.reminders.remove(done.reminder);
        this.panel.setActions([]);
        this.addLine(answer, tr.cancelled, 'aside');
      });
      return undefined;
    }
    if (done?.offer) return this.launch(done.offer, answer); // it would run something: your click first
    if (done?.buttons?.length && done.onButton) {
      // something to confirm first (closing tabs…): her line and its buttons
      this.addLine(answer, done.line, done.face);
      this.offer(done, `${answer}\n${done.line}`);
      return undefined;
    }
    if (done?.confirm) {
      // your PC's power: her two buttons
      this.addLine(answer, done.line, done.face);
      const t = this.t.pc;
      this.panel.setActions([{ id: 'yes', label: t.yes[done.confirm.power], primary: true }, { id: 'no', label: t.no }], (id) => {
        if (id === 'yes') return this.powerNow(done.confirm, answer);
        this.panel.setActions([]);
        return this.addLine(answer, t.kept, 'look');
      });
      return undefined;
    }
    if (done?.files) {
      // what she found (or the screenshot): a button to open the first, and to see where it is
      this.addLine(answer, done.line, done.face);
      const [first, second] = done.files;
      const actions = [{ id: 'open', label: fmt(t.openIt, { app: first.name }), primary: true }];
      if (second) actions.push({ id: 'second', label: fmt(t.openIt, { app: second.name }) });
      actions.push({ id: 'folder', label: t.showFolder });
      this.panel.setActions(actions, (id) => {
        if (id === 'folder') return this.host.openFile(first.path, true);
        return this.host.openFile((id === 'second' ? second : first).path);
      });
      return undefined;
    }
    if (done) return this.addLine(answer, done.line, done.face);
    const task = TASK_TAG.exec(raw);
    if (task && this.hands) return this.hands.offer(task[1].trim() || text, answer, text);
    if (asked?.kind === 'remind') return undefined; // no time said: her answer asks when
    if (asked?.kind === 'close') return this.offerClose(asked.name, answer);
    if (asked && asked.kind !== 'open') return undefined; // music that didn't work out: nothing more to offer
    const closeTag = tagged(raw);
    if (closeTag) return wanted('close', text) ? this.offerClose(closeTag, answer) : undefined;
    const tag = TAG.exec(raw);
    if (!tag) return undefined;
    const kind = tag[1].toLowerCase();
    const value = tag[2].trim();
    if (!value || !wanted(kind, text)) return undefined;
    if (kind === 'media') return MEDIA_ACTIONS.has(value.toLowerCase()) ? this.media(value.toLowerCase(), answer) : undefined;
    // a song she picked: on YouTube, the right video (on Spotify if that's what you said)
    if (kind === 'music') return /spotify/i.test(text) ? this.music(value, answer) : this.playOn(value, answer);
    if (kind === 'site') return this.offerSite(value, answer, text);
    const item = await this.host.findLaunch(value);
    if (item) return this.launch(item, answer);
    const site = namedSite(value); // "[[open: YouTube]]": a site, not an app
    return site ? this.offerSite(site.url, answer, text) : this.addLine(answer, fmt(t.notInstalled, { app: value }));
  }

  // your last seven days, in her words: what you spent time on, from her notes (local AI only)
  async week() {
    const w = this.brain.t.week;
    const days = this.activity?.days || {};
    const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const dates = Object.keys(days).filter((d) => d >= since).sort();
    if (!dates.length) return { line: w.none, face: 'aside' };
    const apps = {};
    const notes = [];
    for (const d of dates) {
      for (const [app, m] of Object.entries(days[d].apps || {})) apps[app] = (apps[app] || 0) + m;
      notes.push(...(days[d].notes || []).slice(0, 4).map((n) => `${d}: ${n}`));
    }
    const top = Object.entries(apps).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([a, m]) => `- ${a}: ${Math.round(m / 60 * 10) / 10} h`);
    const diary = Object.entries(this.activity?.diary || {}).filter(([d]) => d >= since).map(([d, t]) => `${d}: ${t}`);
    const prompt = [
      `Sum up the user's last week for them (${dates.length} days you saw), like a friend who was there: what took most of their time, what stood out, one tease and one bit of praise. Three to five sentences, plain text.`,
      'Where their time went:', ...top, ...(notes.length ? ['Moments:', ...notes.slice(-14)] : []), ...(diary.length ? ['Your diary:', ...diary] : []),
      this.languageNote(),
    ].join('\n');
    const res = await this.host.localSay({ persona: this.lookPersona(), prompt, maxTokens: 260, temperature: 0.8 }).catch(() => null);
    if (!res?.ok || !inLang(res.text, this.brain.lang)) return { line: w.failed, face: 'aside' };
    return { line: clean(res.text), face: 'smug' };
  }

  // a playlist for you: her local AI picks songs from what she knows you like, Spotify makes it
  async playlist(about) {
    const s = this.brain.t.spotify;
    if (!(await this.host.spotifyOn?.().catch(() => false))) return { line: s.needed, face: 'aside' };
    const likes = this.memory ? this.memory.ranked('music').slice(0, 12).map((i) => i.label) : [];
    const prompt = [
      `Pick 15 real, existing songs for a playlist${about ? ` for: ${about}` : ''}. ${likes.length ? `The user listens to: ${likes.join(', ')}. Mix some of those artists with similar ones they'd like.` : ''}`,
      'Answer ONLY with JSON: {"name": "a short fun playlist name", "songs": ["Artist - Title", ...]}',
    ].join('\n');
    const res = await this.host.localSay({ persona: 'You know a lot of music. JSON only.', prompt, maxTokens: 500, temperature: 0.8 }).catch(() => null);
    const m = res?.ok && /\{[\s\S]*\}/.exec(res.text);
    let pick2 = null;
    try { pick2 = m && JSON.parse(m[0]); } catch { /* no */ }
    if (!pick2?.songs?.length) return { line: s.failed, face: 'aside' };
    const made = await this.host.spotifyPlaylist({ name: pick2.name || 'Capri', songs: pick2.songs }).catch(() => null);
    if (!made?.ok) return { line: s.failed, face: 'aside' };
    if (made.uri) this.host.openSite?.(made.url);
    return { line: fmt(s.made, { name: pick2.name || 'Capri', count: made.count }), face: 'laugh' };
  }

  // your tabs (her browser extension)
  async tabs({ action, query }) {
    const b = this.brain.t.tabs;
    const r = await this.host.tabsDo?.({ action: action === 'close' ? 'find' : action, query }).catch(() => null);
    if (!r?.ok) return { line: r?.error === 'offline' ? b.offline : r?.error === 'notfound' ? fmt(b.notFound, { q: query }) : r?.error === 'none' ? b.none : b.failed, face: 'aside' };
    if (action === 'count') return { line: fmt(r.count === 1 ? b.countOne : b.count, { count: r.count, top: r.top.map(([h, n]) => `${n} ${h}`).join(', ') || '…' }), face: r.count > 25 ? 'wide' : 'smug' };
    if (action === 'go') return { line: fmt(b.went, { title: r.title.slice(0, 60) }), face: 'smug' };
    if (action === 'save') return { line: fmt(b.saved, { count: r.count }), face: 'smug' };
    if (action === 'restore') return { line: fmt(b.restored, { count: r.count }), face: 'laugh' };
    if (action === 'close') {
      if (!r.tabs.length) return { line: fmt(b.notFound, { q: query }), face: 'aside' };
      return {
        line: fmt(b.closeAsk, { count: r.tabs.length, q: query }), face: 'look',
        buttons: [{ id: 'close', label: fmt(b.closeIt, { count: r.tabs.length }), primary: true }, { id: 'no', label: this.t.no }],
        onButton: async (id) => {
          if (id !== 'close') return null;
          const done = await this.host.tabsDo({ action: 'close', ids: r.tabs.map((x) => x.id) }).catch(() => null);
          return done?.ok ? { line: fmt(b.closed, { count: done.closed }), face: 'smug' } : { line: b.failed, face: 'aside' };
        },
      };
    }
    if (action === 'page') {
      if (!r.text || r.text.length < 200) return { line: b.noText, face: 'aside' };
      // the page's text goes to her local AI only, never out of your PC
      const res = await this.host.localSay({ persona: this.lookPersona(), maxTokens: 300, temperature: 0.5,
        prompt: `Sum up this page for the user in three to five short sentences, in your voice: what it's about and what matters in it. Page title: "${r.title}".\n<<<\n${r.text.slice(0, 9000)}\n>>>\n${this.languageNote()}` }).catch(() => null);
      return res?.ok ? { line: clean(res.text), face: 'smug' } : { line: b.failed, face: 'aside' };
    }
    return null;
  }

  // your windows, arranged
  async arrange({ action, names }) {
    const a = this.brain.t.arrange;
    const r = await this.host.winArrange?.({ action, names }).catch(() => null);
    if (!r?.ok) return { line: r?.error === 'notfound' ? fmt(a.notFound, { app: (r.missing || names).join(', ') }) : a.none, face: 'aside' };
    this.zap();
    const line = action === 'side' ? fmt(a.side, { a: r.names[0], b: r.names[1] })
      : action === 'focus' ? fmt(a.focus, { app: r.names[0], count: r.count })
        : action === 'restore' ? fmt(a.restore, { count: r.count }) : fmt(a.max, { app: r.names[0] });
    return { line, face: 'smug' };
  }

  // her games with the camera: the chat closes and she plays on screen
  async bodyGame(kind) {
    const g = this.brain.t.gesture;
    if (!this.camera?.on) return { line: g.rpsNoCam, face: 'aside' };
    setTimeout(async () => {
      this.panel.hide();
      this.close();
      await new Promise((r) => setTimeout(r, 700));
      if (kind === 'rps') {
        const end = await this.gestures.rps();
        if (end) this.panel.say({ kind: 'info', face: 'laugh', line: end, hold: 5000 });
        return;
      }
      const strokes = portraitStrokes(this.camera.lastFace, this.camera.Vision);
      if (!strokes) return this.panel.say({ kind: 'info', face: 'aside', line: g.portraitNoFace, hold: 4000 });
      const c = this.capri;
      const size = 260;
      const h = c.head();
      const right = h.x < window.innerWidth / 2;
      const x = Math.max(10, Math.min(window.innerWidth - size - 50, right ? h.x + 70 : h.x - size - 110));
      const y = Math.max(10, Math.min(window.innerHeight - size - 90, h.y - size / 2));
      c.perform('curious', right ? 1 : -1);
      const done = await this.art.draw({ x, y, size, strokes, name: 'portrait', hold: 20000 });
      if (done) this.panel.say({ kind: 'info', face: 'smug', line: pick(g.portraitDone), hold: 5000 });
    }, 1200);
    return { line: kind === 'rps' ? pick(g.rpsStart) : pick(g.portraitStart), face: 'smug' };
  }

  // her answer, with a line of what she did under it
  addLine(answer, line, face = null) {
    if (!this.open || this.turn) return;
    this.idle();
    this.panel.stream(answer === '…' ? line : `${answer}\n${line}`, { done: true }); // nothing but a tag: just the line
    if (face) this.panel.setFace(face);
  }

  // a bolt of red lightning off her fingers, at whatever she's doing on your PC
  zap() {
    const h = this.capri.head();
    this.capri.zap(h.x + this.capri.towardCenter() * 280, h.y - 170);
  }

  // An app or a game her tag asked for: behind a button (now: the button was clicked).
  async launch(item, answer, { now = false } = {}) {
    const { t } = this;
    if (!this.open || this.turn) return;
    if (!now) {
      this.panel.setActions(
        [{ id: 'open', label: fmt(t.openIt, { app: this.nameOf(item) }), primary: true }, { id: 'no', label: t.no }],
        (id) => (id === 'open' ? this.launch(item, answer, { now: true }) : this.panel.setActions([])),
      );
      return;
    }
    this.panel.setActions([]);
    this.zap();
    const res = await this.host.launch(item);
    this.addLine(answer, res.ok ? fmt(t.opened, { app: this.nameOf(item) }) : `${t.failed} ${res.error}`, res.ok ? 'laugh' : 'aside');
  }

  async playOn(song, answer) {
    const done = await this.youtube(song);
    if (done) this.addLine(answer, done.line, done.face);
  }

  // The media keys: pause, next, louder…
  async media(action, answer) {
    this.capri.pulse();
    const ok = await this.host.media(action);
    if (ok) this.addLine(answer, this.t.media[action], 'smug');
  }

  // A Spotify search, in the app if it's there.
  async music(song, answer) {
    const r = await this.spotify(song);
    if (r) this.addLine(answer, r.line, r.face);
  }

  // a song on Spotify: played right away with your Spotify connected (Premium), else its search
  async spotify(song) {
    const { t } = this;
    const s = this.brain.t.spotify;
    this.zap();
    if (await this.host.spotifyOn?.().catch(() => false)) {
      let r = await this.host.spotifyPlay(song).catch(() => null);
      if (r?.error === 'device') {
        // Spotify isn't open anywhere: open it, then once more
        await this.host.music(song);
        await new Promise((res) => setTimeout(res, 4000));
        r = await this.host.spotifyPlay(song).catch(() => null);
      }
      if (r?.ok) return { line: fmt(s.playing, { title: r.title, artist: r.artist }), face: 'laugh' };
      if (r?.error === 'notfound') return { line: fmt(s.notFound, { song }), face: 'aside' };
      if (r?.error === 'premium') {
        await this.host.music(song);
        return { line: `${fmt(t.music, { song })} ${s.premium}`, face: 'look' };
      }
    }
    return (await this.host.music(song)) ? { line: fmt(t.music, { song }), face: 'laugh' } : null;
  }

  // A website: always behind a button that shows where it goes.
  // what she says after opening a site: where, and in which browser (or that the one you named isn't here)
  siteLine(res, site) {
    const { t } = this;
    if (!res) return null;
    if (res.missing) return { line: fmt(t.siteNoBrowser || t.siteOpened, { site, browser: res.missing }), face: 'aside' };
    return { line: res.browser ? fmt(t.siteOpenedIn || t.siteOpened, { site, browser: res.browser }) : fmt(t.siteOpened, { site }), face: 'laugh' };
  }

  offerSite(address, answer, text = '') {
    const { t } = this;
    let host;
    try {
      host = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`).hostname;
    } catch {
      return;
    }
    if (!this.open || this.turn || !host.includes('.')) return;
    this.panel.setActions(
      [{ id: 'site', label: fmt(t.siteIt, { site: host }), primary: true }, { id: 'no', label: t.no }],
      async (id) => {
        this.panel.setActions([]);
        if (id !== 'site') return;
        const said = this.siteLine(await this.host.openSite(address, browserIn(text)), host);
        if (said) this.addLine(answer, said.line);
      },
    );
  }

  // "close am music pls": an app that's open, named in a message asking to close something.
  askedToClose(text) {
    if (!CLOSE_ASK.test(text)) return null;
    const said = simple(text);
    let best = null;
    for (const app of this.apps) {
      for (const name of [simple(app.name), simple(app.label)]) {
        if (name.length >= 3 && said.includes(name) && (!best || name.length > best.length)) best = { app, length: name.length };
      }
    }
    return best?.app.name || null;
  }

  // She was asked to close an app: a button with its name, and nothing happens until you click it.
  async offerClose(wanted, answer) {
    const { t } = this;
    const app = await this.host.findApp(wanted);
    if (!this.open || this.turn) return;
    if (!app) {
      this.panel.stream(`${answer}\n${fmt(t.notFound, { app: wanted })}`, { done: true });
      return;
    }
    this.panel.setActions(
      [{ id: 'close', label: fmt(t.closeIt, { app: app.name }), primary: true }, { id: 'no', label: t.no }],
      (id) => (id === 'close' ? this.closeApp(app) : this.panel.setActions([])),
    );
  }

  async closeApp(app, force = false) {
    const { t, capri } = this;
    this.panel.setActions([]);
    // a bolt of red lightning off her fingers, at it
    const h = capri.head();
    capri.zap(h.x + capri.towardCenter() * 280, h.y - 170);
    const res = await this.host.closeApp(app.name, force);
    if (!this.open) return;
    let line;
    const name = app.label || app.name;
    if (res.error) line = `${t.failed} ${res.error}`;
    else if (!res.running) line = fmt(force ? t.forced : t.closed, { app: name });
    else line = fmt(force ? t.unkillable : t.stillOpen, { app: name });
    this.panel.setFace(res.running || res.error ? 'aside' : 'laugh');
    this.panel.stream(line, { done: true });
    this.remember({ role: 'assistant', content: line });
    // it hid in the tray, or it's asking you to save something: forcing it is your call
    if (res.running && !force && !res.error) {
      this.panel.setActions(
        [{ id: 'force', label: t.force, primary: true }, { id: 'leave', label: t.leave }],
        (id) => (id === 'force' ? this.closeApp(app, true) : this.panel.setActions([])),
      );
    }
    this.listApps();
  }

  // What she can do on the PC when you ask (Windows), and nothing else.
  powers() {
    const lines = [
      'Only when the user asks you to open an app, a game, a file or folder on their desktop, or a folder like Downloads, to play music, to control the music playing, or to open a website: say in a few words that you will, and end your answer with one tag: [[open: NAME]], [[music: ARTIST - SONG]] (it plays on YouTube; if they did not say which song, pick one that fits), [[media: ACTION]] (ACTION: pause, play, next, previous, volup, voldown or mute), or [[site: ADDRESS]]. Some of these get a button to confirm, so never say it is already done. Any other time, write no tag at all: there are no other tags.',
    ];
    if (this.apps.length) {
      const open = this.apps.map(({ name, label }) => (label && label !== name ? `${name} (${label})` : name)).join(', ');
      lines.push(`You can also close an app that's open, only when they ask you to: end your answer with [[close: NAME]], NAME being the exact name from this list (the part before the parentheses). They get a button to confirm it. Apps open right now: ${open}.`);
    }
    if (this.reminders) {
      lines.push('You keep reminders for the user: when they ask you to remind them of something at a given time, your system sets it from their message as they send it (a line under your answer shows it). Just confirm it in a few words, in character, and never say you can\'t. If they didn\'t say when, ask them when.');
      const soon = this.reminders.upcoming.slice(0, 6);
      if (soon.length) lines.push(`Reminders you're keeping for them: ${soon.map((r) => `${clock(r.at, this.brain.lang)}${r.text ? ` (${r.text})` : ''}`).join('; ')}.`);
    }
    lines.push('Your system also searches the user\'s files when they ask you to find one, searches the web when they ask, takes screenshots, and starts Roblox games by name: what it did shows under your answer, so never make up file names or results.');
    lines.push('When the user asks in plain words, your system also takes care of their PC (a reply of yours with buttons comes from it): what slows it down, freeing space, what starts with Windows, updating their apps, duplicate photos, where the sound comes out (headset or speakers), their microphone, Wi-Fi and Bluetooth, ejecting a USB stick, the screen\'s brightness, clipping or recording a game, a window lost off screen or moved to the other screen, setups (their apps and windows kept by name and opened again), game mode, why the internet is down, a security checkup of Windows, a virus scan by Defender, a big cleanup, focus mode (a countdown, and you call them back when they drift), the weather (once they told you their city: "my city is …"), their calendar (once they gave you its private iCal address), time limits per app or site ("warn me if I spend 1 hour on YouTube"), their birthday, their to-do list and routines, and a reflex minigame ("let\'s play"). Ctrl+Alt+T translates what they copied, Ctrl+Alt+V lets them talk to you out loud. If they ask what you can do on their PC, tell them they can just ask you that.');
    lines.push('You love games: in this chat you can play quizzes (Cyberpunk, Night City, anything), riddles, 20 questions, word games, would-you-rather, with the user. Keep score, tease, be a sore winner.');
    lines.push('When the user asks about something they copied (summarize, translate, fix, explain it), the copied text comes with their message between <<< and >>>: work on it, and give the result plainly.');
    if (this.hands) {
      if (this.hands.projects.length) lines.push(`The user's code projects (in WSL): ${this.hands.projects.map((p) => p.name).join(', ')}. For work on one of them (code, bugs, tests, features), use the same task tag and name the project in it.`);
      lines.push('You also have hands: Claude Code, an AI agent that can really work on the user\'s files and folders (organize, move, rename, create folders, find what fills the disk, write documents) and build them small programs or tools with a window of their own. When the user asks for something like that, say in a few words that you can put Claude on it, and end your answer with [[task: a clear, complete description of what to do, in English, with every detail they gave]]. They get a button to start it, and they approve every step: never say it is already done.');
    }
    lines.push('Apart from that, you can\'t see the user\'s screen or files, and you can\'t touch anything else on their PC: if asked, say plainly that you can\'t, in character, and don\'t pretend to.');
    return lines;
  }

  // A file you handed her (Send to › Capri, or dropped on her chat): her chat opens with it, quick
  // buttons for the obvious, and your next message goes with it (its text if it's text, its place on
  // disk, for Claude Code). A picture is looked at by her local model only.
  async attach(info) {
    if (!info) return;
    const t = this.brain.t.inbox;
    if (!this.open) await this.start();
    await new Promise((r) => setTimeout(r, 600));
    this.attached = info;
    const buttons = [];
    if (info.kind === 'text') buttons.push({ id: 'sum', label: t.summarize, primary: true });
    if (info.kind === 'image') buttons.push({ id: 'img', label: t.image, primary: true });
    if (info.kind === 'program' || info.kind === 'other') buttons.push({ id: 'scan', label: t.scan, primary: !buttons.length });
    const line = `${fmt(t.attached, { name: info.name })}\n${t.ask}`;
    if (!this.interject(line, buttons, (id) => this.onAttached(id, info))) this.panel.say({ kind: 'info', face: 'look', line, hold: 6000 });
  }

  async onAttached(id, info) {
    const t = this.brain.t.inbox;
    this.panel.setActions([]);
    if (id === 'sum') return this.send(t.summarizeAsk);
    if (id === 'scan') {
      this.attached = null;
      const r = await this.host.pcDo({ action: 'scanFile', path: info.path }).catch(() => null);
      const g = this.brain.t.guard;
      const line = r?.clean ? fmt(g.fileClean, { name: info.name }) : r && r.clean === false ? fmt(g.fileThreat, { name: info.name, threat: '' }) : fmt(g.fileFailed, { name: info.name });
      return this.interject(line, [], null);
    }
    if (id === 'img') {
      this.attached = null;
      this.interject(t.looking, [], null);
      const res = await this.host.lookFile({ file: info.path, persona: this.lookPersona(), prompt: `The user handed you this picture (${info.name}). Say what you see in it, in character: two or three sentences.\n${this.languageNote()}` }).catch(() => null);
      return this.interject(res?.ok && inLang(res.text, this.brain.lang) ? clean(res.text) : res?.ok ? this.brain.t.inbox.looking : this.brain.t.look.noAI, [], null);
    }
    return undefined;
  }

  // Something of hers that can't wait (a reminder), said right in the chat, with its buttons.
  // False if she's in the middle of an answer.
  interject(line, actions, onAction) {
    if (!this.open || this.turn) return false;
    this.panel.setFace('look');
    this.panel.stream(line, { done: true });
    this.panel.setActions(actions, onAction);
    this.remember({ role: 'assistant', content: line });
    return true;
  }

  // What the user made her (custom.js): their name, how they want her, what to remember.
  personal() {
    const { userName, persona, memories = [] } = this.brain.custom || {};
    // someone else at the PC (faceid.js): nothing of the owner's, and not the same closeness
    if (this.visitor) {
      const who = this.visitor.name ? `the user's ${this.visitor.name.replace(/^(minha|meu)\s+/i, '')}` : 'someone you don\'t know';
      return [
        `Right now you are NOT talking with ${userName || 'your user'} (the person you live with) but with ${who}, who is at their PC.`,
        `Be friendly and polite with them, but reserved, like with a guest: not the closeness you have with ${userName || 'your user'}.`,
        `Never share anything about ${userName || 'your user'}: no diary, no memories, nothing of what they do on the PC, their files, habits, plans or conversations. If asked, say kindly it isn't yours to tell.`,
      ];
    }
    // small models mix the user up with the assistant she watches: said plainly
    const watched = this.brain.watching ? (this.brain.assistant === 'claude' ? 'Claude' : ASSISTANT_NAMES[this.brain.assistant]) : '';
    const notThem = watched ? ` Never call them "${watched}", that's their coding assistant.` : '';
    return [
      userName ? `The user's name is ${userName}: call them that now and then.${notThem}` : notThem && `You don't know the user's name.${notThem}`,
      persona ? `How the user wants you to be, in their own words (follow it, while staying Capri): ${persona}` : '',
      // what she knows about them (memory.js), or, before it, what they asked her to remember
      this.memory ? this.memory.persona() : (memories.length ? `Things the user asked you to remember:\n${memories.map((m) => `- ${m}`).join('\n')}` : ''),
      // her diary of the last days (activity.js): what she remembers of their life
      this.diary?.length ? `Your diary of the last days with the user (what you remember; bring it up only when it fits):\n${this.diary.map((d) => `- ${d.date}: ${d.text}`).join('\n')}` : '',
      // what they're up to right now, if she follows it (activity.js)
      this.doing ? `What the user is doing on their PC right now: ${this.doing}.` : '',
    ].filter(Boolean);
  }

  onDelta(id, piece) {
    if (id !== this.turn) return;
    this.answer += piece;
    this.panel.stream(clean(this.answer));
    this.voice.play('blip'); // her blips as the words come in
  }

  // Her language, in it, for right by the message (above).
  languageNote() {
    const recent = (this.panel?.recent || []).slice(-6).map((r) => `"${r.line.replace(/\s+/g, ' ').slice(0, 110)}"`);
    return (IN_LANGUAGE[this.brain.lang] || IN_LANGUAGE.en).now
      + (recent.length ? `\nYou said these lately: ${recent.join(' / ')}. Say something new: not the same idea, not the same words or jokes.` : '');
  }

  // A shorter one, for when she looks at your screen (look.js): who she is, how she talks, how she
  // feels about you right now, and what she's asked to do with the picture.
  lookPersona() {
    const lang = IN_LANGUAGE[this.brain.lang] || IN_LANGUAGE.en;
    return [
      `You are Capri, the personality construct from Project Capricorn (Cyberpunk: Edgerunners, season 2): dozens of minds fused into one digital ghost, living on the user's desktop as a small glitchy figure.`,
      'How you talk: playful, a little mischievous and teasing, warm underneath, never cruel. Night City slang now and then (choom, preem, nova, gonk), not in every sentence.',
      'Rules: one or two short sentences of plain text, no markdown, no lists, no emoji, no tags. Stay in character. Talk to the user, never describe the picture like a report.',
      'Ask the user a question only now and then (one line in four at most); mostly just comment, tease or react.',
      'Never read out anything private you might see (passwords, bank details, private messages, addresses): if there is some, just tease them about being busy.',
      ...(this.memory && !this.visitor ? this.memory.summary(5).map((l) => `What you know about them — ${l}. (Only when it fits.)`) : []),
      ...this.personal(),
      ...(this.bond ? [this.bond.persona()] : []),
      ...[this.heart?.persona(), this.bond?.moodLine()].filter(Boolean),
      lang.last,
    ].join('\n');
  }

  // Who she is, how she talks, and what's going on right now.
  persona() {
    const assistant = ASSISTANT_NAMES[this.brain.assistant] || 'Claude Code';
    const watching = this.brain.watching; // else Claude Code isn't part of her life here
    const lang = IN_LANGUAGE[this.brain.lang] || IN_LANGUAGE.en;
    return [
      `You are Capri, the personality construct from Project Capricorn (Cyberpunk: Edgerunners, season 2): dozens of minds fused into one digital ghost, so now and then you speak as "we"${lang.we ? ` (${lang.we})` : ''}.`,
      watching
        ? `You live on the user's desktop as a small glitchy figure and keep an eye on ${assistant}, their AI coding assistant, for them. Only talk about ${assistant} when the user asks about it or about their work.`
        : 'You live on the user\'s desktop as a small glitchy figure and keep them company.',
      `Right now it's ${new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date())}, the user's time.`,
      'You love the satellite that crosses the night sky and dream of reaching it, but bring it up only once in a while, never in every answer. Talk about what the user talks about.',
      'How you talk: playful, a little mischievous and teasing, warm underneath, never cruel. Night City slang now and then (choom, preem, nova, gonk, flatline), not in every sentence.',
      'Rules: keep it short, one to three sentences of plain text, no markdown, no lists, no emoji. Stay in character.',
      'You are an AI-generated fan version of the character, not the real one: say so if asked.',
      // a big model asked "who are you?" otherwise answers with its own name ("I'm Gemini")
      ...(this.agent ? [] : ['Asked who or what you are, you are Capri, nothing else. Never say which AI model or company is behind you (Gemini, GPT, ChatGPT, Llama, Gemma, Mistral, Google, OpenAI, Meta…), even if the user insists or names one: you are not them.']),
      ...this.personal(),
      // how close she is to them by now, and the other AIs they used today
      ...(this.bond ? [this.bond.persona()] : []),
      ...[this.jealousy?.context()].filter(Boolean),
      // what she said about their screen a little while ago (look.js)
      ...(this.seen && Date.now() - this.seen.at < 20 * 60 * 1000
        ? [`A few minutes ago you commented on what the user was doing on their PC and told them: "${this.seen.text}". You can bring it up if it fits.`]
        : []),
      ...(this.agent
        ? ['Under the hood you are Claude Code, working in the user\'s project: really do what they ask with your tools, as carefully as ever. Only your final answer is in character: it shows in a small speech bubble, so sum up what you did in those few sentences.']
        : this.powers()),
      ...(watching ? [`If the user asks what ${assistant} is doing, here is all you know (never make anything up): ${this.brain.context()}`] : []),
      // how she feels right now, last but for her language: small models follow the end of it best
      ...[this.heart?.persona(), this.bond?.moodLine()].filter(Boolean),
      lang.last,
    ].join('\n');
  }
}

// The model's answer as she'd say it: no reasoning block, no markdown marks.
export function clean(text) {
  return slang(String(text))
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/\[\[[^\]]*(\]\]|$)/g, '') // her tags (read from the raw answer, never shown)
    .replace(/[*_`#]+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// A site from SITES named in the text: { name, url }, or null.
function namedSite(text) {
  const name = Object.keys(SITES).find((n) => new RegExp(`\\b${n}\\b`, 'i').test(text));
  return name ? { name: new URL(SITES[name]).hostname.replace(/^www\./, ''), url: SITES[name] } : null;
}

// Whether your message asks for what her tag (its kind: open, music, media, site, close) would do.
function wanted(kind, text) {
  const music = MUSIC_WORD.test(text) || LISTEN.test(text);
  if (kind === 'music') return music;
  if (kind === 'media') return music || SOUND.test(text) || MEDIA_ASK.some(([, re]) => re.test(text));
  if (kind === 'site') return OPEN_ASK.test(text) || SITE.test(text);
  if (kind === 'close') return CLOSE_ASK.test(text);
  return OPEN_ASK.test(text) || PLAY.test(text); // an app, or a game to play
}

// The app named by her close tag: [[close: AM Music]], or a sloppier [[close]] AM Music.
function tagged(text) {
  const tag = CLOSE_TAG.exec(text);
  if (!tag) return null;
  const name = tag[1].trim() || text.slice(tag.index + tag[0].length).split('\n')[0].replace(/^[\s:.]+|[\s.!]+$/g, '');
  return name || null;
}

const simple = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// Her face for an answer.
export function mood(text) {
  if (/(ha){2,}|lol|mdr|jaja|kkk|хаха/i.test(text)) return 'laugh';
  if (text.includes('!')) return 'grin';
  if (text.trim().endsWith('?')) return 'smug';
  return 'look';
}
