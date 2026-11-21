// ISO 3166-1 codes for the passport stamps: the two-letter flag a place carries to the three-letter
// code a stamp prints. The whole standard list (249 entries, taken from the Debian iso-codes
// package), so every country in the destination catalogue and in the wider city list has one.
// Pure: no DOM, no network, no storage.

// Each entry is the two-letter code in lower case followed by its three-letter code.
const TABLE =
  'adAND aeARE afAFG agATG aiAIA alALB amARM aoAGO aqATA arARG asASM atAUT auAUS awABW axALA azAZE ' +
  'baBIH bbBRB bdBGD beBEL bfBFA bgBGR bhBHR biBDI bjBEN blBLM bmBMU bnBRN boBOL bqBES brBRA bsBHS ' +
  'btBTN bvBVT bwBWA byBLR bzBLZ caCAN ccCCK cdCOD cfCAF cgCOG chCHE ciCIV ckCOK clCHL cmCMR cnCHN ' +
  'coCOL crCRI cuCUB cvCPV cwCUW cxCXR cyCYP czCZE deDEU djDJI dkDNK dmDMA doDOM dzDZA ecECU eeEST ' +
  'egEGY ehESH erERI esESP etETH fiFIN fjFJI fkFLK fmFSM foFRO frFRA gaGAB gbGBR gdGRD geGEO gfGUF ' +
  'ggGGY ghGHA giGIB glGRL gmGMB gnGIN gpGLP gqGNQ grGRC gsSGS gtGTM guGUM gwGNB gyGUY hkHKG hmHMD ' +
  'hnHND hrHRV htHTI huHUN idIDN ieIRL ilISR imIMN inIND ioIOT iqIRQ irIRN isISL itITA jeJEY jmJAM ' +
  'joJOR jpJPN keKEN kgKGZ khKHM kiKIR kmCOM knKNA kpPRK krKOR kwKWT kyCYM kzKAZ laLAO lbLBN lcLCA ' +
  'liLIE lkLKA lrLBR lsLSO ltLTU luLUX lvLVA lyLBY maMAR mcMCO mdMDA meMNE mfMAF mgMDG mhMHL mkMKD ' +
  'mlMLI mmMMR mnMNG moMAC mpMNP mqMTQ mrMRT msMSR mtMLT muMUS mvMDV mwMWI mxMEX myMYS mzMOZ naNAM ' +
  'ncNCL neNER nfNFK ngNGA niNIC nlNLD noNOR npNPL nrNRU nuNIU nzNZL omOMN paPAN pePER pfPYF pgPNG ' +
  'phPHL pkPAK plPOL pmSPM pnPCN prPRI psPSE ptPRT pwPLW pyPRY qaQAT reREU roROU rsSRB ruRUS rwRWA ' +
  'saSAU sbSLB scSYC sdSDN seSWE sgSGP shSHN siSVN sjSJM skSVK slSLE smSMR snSEN soSOM srSUR ssSSD ' +
  'stSTP svSLV sxSXM sySYR szSWZ tcTCA tdTCD tfATF tgTGO thTHA tjTJK tkTKL tlTLS tmTKM tnTUN toTON ' +
  'trTUR ttTTO tvTUV twTWN tzTZA uaUKR ugUGA umUMI usUSA uyURY uzUZB vaVAT vcVCT veVEN vgVGB viVIR ' +
  'vnVNM vuVUT wfWLF wsWSM yeYEM ytMYT zaZAF zmZMB zwZWE';

const CODES = new Map(TABLE.split(' ').map((entry) => [entry.slice(0, 2), entry.slice(2)]));

/**
 * The three-letter country code for a two-letter flag, in either case.
 * @param {string} flag  for example 'sg'
 * @returns {string|null} 'SGP'; null for an unknown flag and for anything that is not two letters
 */
export function alpha3(flag) {
  if (typeof flag !== 'string') return null;
  return CODES.get(flag.trim().toLowerCase()) ?? null;
}
