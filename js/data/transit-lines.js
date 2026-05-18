const TRANSIT_ABBR = {
  // ─── Singapore MRT / LRT ───
  'north-south line': 'NSL',
  'east-west line': 'EWL',
  'north east line': 'NEL',
  'circle line': 'CCL',
  'downtown line': 'DTL',
  'thomson-east coast line': 'TEL',
  'jurong region line': 'JRL',
  'cross island line': 'CRL',
  'bukit panjang lrt': 'BP LRT',
  'sengkang lrt': 'SK LRT',
  'punggol lrt': 'PG LRT',

  // ─── Hong Kong MTR ───
  'tsuen wan line': 'TWL',
  'island line': 'ISL',
  'kwun tong line': 'KTL',
  'tseung kwan o line': 'TKO',
  'tung chung line': 'TCL',
  'airport express': 'AEL',
  'east rail line': 'EAL',
  'tuen ma line': 'TML',
  'south island line': 'SIL',
  'disneyland resort line': 'DRL',

  // ─── Tokyo Metro ───
  'ginza line': 'G',
  'marunouchi line': 'M',
  'hibiya line': 'H',
  'tozai line': 'T',
  'chiyoda line': 'C',
  'yurakucho line': 'Y',
  'hanzomon line': 'Z',
  'namboku line': 'N',
  'fukutoshin line': 'F',

  // ─── Tokyo Toei ───
  'asakusa line': 'A',
  'mita line': 'I',
  'shinjuku line': 'S',
  'oedo line': 'E',

  // ─── Tokyo JR ───
  'yamanote line': 'JY',
  'chuo line': 'JC',
  'chuo-sobu line': 'JB',
  'keihin-tohoku line': 'JK',
  'sobu line': 'JB',
  'saikyo line': 'JA',
  'shonan-shinjuku line': 'JS',
  'joban line': 'JJ',
  'musashino line': 'JM',
  'rinkai line': 'R',

  // ─── Osaka Metro ───
  'midosuji line': 'M',
  'tanimachi line': 'T',
  'yotsubashi line': 'Y',
  'sennichimae line': 'S',
  'sakaisuji line': 'K',
  'nagahori tsurumi-ryokuchi line': 'N',
  'imazatosuji line': 'I',

  // ─── Seoul Metro ───
  'gyeongui-jungang line': 'GJ',
  'shinbundang line': 'SBD',
  'airport railroad': 'AREX',
  'suin-bundang line': 'SB',
  'gyeongchun line': 'GC',
  'uisinseol line': 'UI',
  'gimpo goldline': 'GP',
  'everline': 'EVR',
  'seohae line': 'SH',

  // ─── Taipei MRT ───
  'tamsui-xinyi line': 'R',
  'bannan line': 'BL',
  'songshan-xindian line': 'G',
  'zhonghe-xinlu line': 'O',
  'circular line (taipei)': 'Y',
  'taoyuan airport mrt': 'A',

  // ─── Bangkok ───
  'sukhumvit line': 'BTS-S',
  'silom line': 'BTS-SL',
  'gold line': 'BTS-G',
  'blue line': 'MRT-BL',
  'purple line': 'MRT-PP',
  'yellow line': 'MRT-YL',
  'pink line': 'MRT-PK',
  'airport rail link': 'ARL',

  // ─── Kuala Lumpur ───
  'kelana jaya line': 'KJL',
  'ampang line': 'AGL',
  'sri petaling line': 'SPL',
  'kajang line': 'KGL',
  'putrajaya line': 'PYL',
  'kl monorail': 'MRL',
  'ktm komuter': 'KTM',

  // ─── Jakarta ───
  'jabodebek lrt': 'LRT-JBK',

  // ─── London Underground ───
  'hammersmith & city line': 'H&C',
  'hammersmith and city line': 'H&C',
  'waterloo & city line': 'W&C',
  'waterloo and city line': 'W&C',
  'elizabeth line': 'Elizabeth',
  'docklands light railway': 'DLR',
  'london overground': 'Overground',

  // ─── Paris RER ───
  'rer a': 'RER A',
  'rer b': 'RER B',
  'rer c': 'RER C',
  'rer d': 'RER D',
  'rer e': 'RER E',

  // ─── Berlin ───
  'ringbahn': 'S41/42',

  // ─── Amsterdam ───
  'noord-zuidlijn': 'M52',

  // ─── New York ───
  'staten island railway': 'SIR',
  'airtrain jfk': 'AirTrain',
  'path train': 'PATH',

  // ─── San Francisco ───
  'bay area rapid transit': 'BART',

  // ─── Toronto ───
  'yonge-university line': 'Line 1',
  'bloor-danforth line': 'Line 2',
  'scarborough line': 'Line 3',
  'sheppard line': 'Line 4',
  'eglinton line': 'Line 5',

  // ─── Dubai ───
  'red line (dubai)': 'Red',
  'green line (dubai)': 'Green',

  // ─── Sydney ───
  'metro northwest': 'M NW',
  'metro city & southwest': 'M CS',
  'metro west': 'M West',
};

const MAX_PILL_LEN = 18;

export function shortenTransitName(service) {
  if (!service) return { short: service, full: service };
  if (service === 'Walk') return { short: service, full: service };

  const parenMatch = service.match(/^(.+?)\s*\(([A-Z0-9&\-]{1,8})\)\s*$/);
  if (parenMatch) {
    return { short: parenMatch[2], full: parenMatch[1].trim() };
  }

  if (service.length <= MAX_PILL_LEN) return { short: service, full: service };

  const stripped = service.replace(/^(MRT|Metro|LRT|Train|Subway)\s+/i, '');
  const key = stripped.toLowerCase().trim();
  if (TRANSIT_ABBR[key]) {
    return { short: TRANSIT_ABBR[key], full: service };
  }

  const fullKey = service.toLowerCase().trim();
  if (TRANSIT_ABBR[fullKey]) {
    return { short: TRANSIT_ABBR[fullKey], full: service };
  }

  return { short: service, full: service };
}
