'use client';

import { useState, useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { ESTADOS_BRASIL } from '@/lib/types';
import { hasBairrosPoligonos } from '@/lib/geojson-manifest';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import {
  Map,
  Target,
  Save,
  Search,
  BarChart3,
  MapPin,
  Plus,
  Trash2,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  Loader2,
  Gauge,
  Rocket,
  Shield,
  Handshake,
  Users,
  UserCheck,
  Vote,
  Home,
  Building2,
  TrendingUp,
  Percent,
  Pencil,
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  Minimize2,
  ArrowLeft,
} from 'lucide-react';

const StateMap = dynamic(() => import('@/components/maps/state-map'), { ssr: false });
const MunicipioMap = dynamic(() => import('@/components/maps/municipio-map'), { ssr: false });
const ZonaPinsMap = dynamic(() => import('@/components/maps/zona-pins-map'), { ssr: false });
const DfRegioesMap   = dynamic(() => import('@/components/maps/df-regioes-map'),   { ssr: false });
const SpDistritosMap = dynamic(() => import('@/components/maps/sp-distritos-map'), { ssr: false });
const RjBairrosMap   = dynamic(() => import('@/components/maps/rj-bairros-map'),   { ssr: false });
const CeBairrosMap   = dynamic(() => import('@/components/maps/ce-bairros-map'),   { ssr: false });
const MgBairrosMap          = dynamic(() => import('@/components/maps/mg-bairros-map'),          { ssr: false });
const BairrosPoligonosMap   = dynamic(() => import('@/components/maps/bairros-poligonos-map'),   { ssr: false });

// Helpers para zonas do DF
const DF_ZONA_PREFIX = 'DF_ZONA_';
const dfZonaMunicipioKey = (zona: number) => `${DF_ZONA_PREFIX}${String(zona).padStart(2, '0')}`;
const isDfZona = (municipio: string) => municipio.startsWith(DF_ZONA_PREFIX);
const getZonaNumber = (municipio: string) => parseInt(municipio.replace(DF_ZONA_PREFIX, ''), 10);

// Helpers para regiões administrativas do DF
const DF_REGIAO_PREFIX = 'DF_REGIAO_';
const dfRegiaoKey = (nome: string) => `${DF_REGIAO_PREFIX}${nome}`;
const isDfRegiao = (municipio: string) => municipio.startsWith(DF_REGIAO_PREFIX);
const getRegiaoNome = (municipio: string) => municipio.replace(DF_REGIAO_PREFIX, '');

// Helpers para distritos municipais de São Paulo
const SP_DISTRITO_PREFIX = 'SP_DISTRITO_';
const spDistritoKey = (nome: string) => `${SP_DISTRITO_PREFIX}${nome}`;
const isSpDistrito = (municipio: string) => municipio.startsWith(SP_DISTRITO_PREFIX);
const getDistritoNome = (municipio: string) => municipio.replace(SP_DISTRITO_PREFIX, '');

// Helpers para bairros do Rio de Janeiro
const RJ_BAIRRO_PREFIX = 'RJ_BAIRRO_';
const rjBairroKey = (nome: string) => `${RJ_BAIRRO_PREFIX}${nome}`;
const isRjBairro = (municipio: string) => municipio.startsWith(RJ_BAIRRO_PREFIX);
const getRjBairroNome = (municipio: string) => municipio.replace(RJ_BAIRRO_PREFIX, '');

// Helpers para bairros de Fortaleza (CE)
const CE_BAIRRO_PREFIX = 'CE_BAIRRO_';
const ceBairroKey = (nome: string) => `${CE_BAIRRO_PREFIX}${nome}`;
const isCeBairro = (municipio: string) => municipio.startsWith(CE_BAIRRO_PREFIX);
const getCeBairroNome = (municipio: string) => municipio.replace(CE_BAIRRO_PREFIX, '');

// Helpers para bairros de municípios de MG (IBGE CD2022)
const MG_BAIRRO_PREFIX = 'MG_BAIRRO_';
const mgBairroKey = (nome: string) => `${MG_BAIRRO_PREFIX}${nome}`;
const isMgBairro = (municipio: string) => municipio.startsWith(MG_BAIRRO_PREFIX);
const getMgBairroNome = (municipio: string) => municipio.replace(MG_BAIRRO_PREFIX, '');

const MG_MUNICIPIOS_COM_BAIRROS = new Set([
  'ABAETE','ARAXA','AUGUSTO DE LIMA','BARBACENA','BELO HORIZONTE','BETIM','BICAS',
  'CAMPINA VERDE','CANAPOLIS','CARANGOLA','CARATINGA','CARMO DO PARANAIBA',
  'CONCEICAO DAS ALAGOAS','COQUEIRAL','COROMANDEL','CORONEL FABRICIANO','CRUCILANDIA',
  'GOVERNADOR VALADARES','IBIA','IPATINGA','ITABIRITO','ITAUNA','ITUIUTABA',
  'JUIZ DE FORA','MATUTINA','MONTE ALEGRE DE MINAS','NANUQUE','NATERCIA','NOVA ERA',
  'NOVA PONTE','PAINS','PASSOS','PATOS DE MINAS','PATROCINIO','PECANHA','PIRAPORA',
  'POMPEU','PONTE NOVA','POCOS DE CALDAS','RIO CASCA','SACRAMENTO','SANTA JULIANA',
  'SOBRALIA','SAO GERALDO DO BAIXIO','SAO GOTARDO','SAO JOAO DEL REI','SAO ROMAO',
  'TEOFILO OTONI','TIMOTEO','TRES CORACOES','TUPACIGUARA','UBERABA','UBERLANDIA',
  'URUANA DE MINAS','VARGINHA',
]);

// Helpers para bairros de municípios genéricos (vereadores/prefeitos fora das capitais especiais)
const MUN_BAIRRO_PREFIX = 'MUN_BAIRRO_';
const munBairroKey = (nome: string) => `${MUN_BAIRRO_PREFIX}${nome}`;
const isMunBairro = (municipio: string) => municipio.startsWith(MUN_BAIRRO_PREFIX);
const getMunBairroNome = (municipio: string) => municipio.replace(MUN_BAIRRO_PREFIX, '');

// Fração de votos por zona eleitoral → Distrito Municipal de SP
// Gerado via join espacial entre locais de votação TSE e GeoSampa distritos
const SP_ZONA_DISTRITO_MAP: Record<number, Record<string, number>> = {
  1: { 'SE': 0.1353, 'BELA VISTA': 0.2005, 'LIBERDADE': 0.2899, 'CONSOLACAO': 0.2802, 'VILA MARIANA': 0.058, 'REPUBLICA': 0.0362 },
  2: { 'CONSOLACAO': 0.2374, 'PERDIZES': 0.5161, 'BARRA FUNDA': 0.1849, 'SANTA CECILIA': 0.0616 },
  3: { 'BRAS': 0.1425, 'SANTA CECILIA': 0.2778, 'SE': 0.0725, 'PARI': 0.1111, 'BELEM': 0.2005, 'BOM RETIRO': 0.157, 'REPUBLICA': 0.0386 },
  4: { 'AGUA RASA': 0.4234, 'MOOCA': 0.4373, 'BELEM': 0.0752, 'BRAS': 0.0641 },
  5: { 'PINHEIROS': 0.0645, 'ITAIM BIBI': 0.4018, 'CONSOLACAO': 0.1935, 'JARDIM PAULISTA': 0.2434, 'MOEMA': 0.0968 },
  6: { 'IPIRANGA': 0.0563, 'BELA VISTA': 0.045, 'CAMBUCI': 0.1509, 'VILA MARIANA': 0.4887, 'LIBERDADE': 0.259 },
  20: { 'JARDIM ANGELA': 0.2671, 'CAPAO REDONDO': 0.7329 },
  246: { 'SANTO AMARO': 0.5458, 'CAMPO GRANDE': 0.2031, 'SOCORRO': 0.2511 },
  247: { 'VILA CURUCA': 0.2285, 'VILA JACUI': 0.3457, 'SAO MIGUEL': 0.3945, 'LAJEADO': 0.0312 },
  248: { 'ITAQUERA': 0.8156, 'SAO MIGUEL': 0.1182, 'PARQUE DO CARMO': 0.0402, 'JOSE BONIFACIO': 0.026 },
  249: { 'SANTANA': 0.9149, 'MANDAQUI': 0.0587, 'CASA VERDE': 0.0264 },
  250: { 'LAPA': 0.6141, 'VILA LEOPOLDINA': 0.2061, 'JAGUARA': 0.1798 },
  251: { 'PINHEIROS': 0.6503, 'ALTO DE PINHEIROS': 0.1963, 'JARDIM PAULISTA': 0.1534 },
  252: { 'PENHA': 0.9822, 'ARTUR ALVIM': 0.0178 },
  253: { 'TATUAPE': 0.6263, 'CARRAO': 0.3434, 'VILA FORMOSA': 0.0303 },
  254: { 'VILA GUILHERME': 0.3298, 'VILA MARIA': 0.6574, 'SANTANA': 0.0128 },
  255: { 'CACHOEIRINHA': 0.215, 'CASA VERDE': 0.4187, 'LIMAO': 0.3533, 'BRASILANDIA': 0.0131 },
  256: { 'TUCURUVI': 0.2722, 'TREMEMBE': 0.6969, 'SANTANA': 0.0309 },
  257: { 'VILA PRUDENTE': 0.5672, 'SAO LUCAS': 0.2806, 'AGUA RASA': 0.1324, 'MOOCA': 0.0198 },
  258: { 'MOEMA': 0.3291, 'ITAIM BIBI': 0.2545, 'CAMPO BELO': 0.24, 'SAUDE': 0.1309, 'JABAQUARA': 0.0455 },
  259: { 'SAUDE': 0.4653, 'CURSINO': 0.2595, 'VILA MARIANA': 0.2752 },
  260: { 'IPIRANGA': 0.4971, 'SACOMA': 0.5029 },
  280: { 'CIDADE DUTRA': 1.0 },
  320: { 'JABAQUARA': 0.9, 'CIDADE ADEMAR': 0.1 },
  325: { 'SAO DOMINGOS': 0.3144, 'PIRITUBA': 0.6856 },
  326: { 'VILA JACUI': 0.3487, 'ERMELINO MATARAZZO': 0.5925, 'PONTE RASA': 0.0294, 'CANGAIBA': 0.0294 },
  327: { 'FREGUESIA DO O': 0.8684, 'PIRITUBA': 0.1316 },
  328: { 'CAMPO LIMPO': 0.9632, 'CAPAO REDONDO': 0.0368 },
  346: { 'MORUMBI': 0.1937, 'BUTANTA': 0.3757, 'VILA SONIA': 0.3875, 'VILA ANDRADE': 0.0431 },
  347: { 'CIDADE LIDER': 0.2225, 'ARTUR ALVIM': 0.1351, 'VILA MATILDE': 0.6424 },
  348: { 'ARICANDUVA': 0.4259, 'SAO MATEUS': 0.1111, 'VILA FORMOSA': 0.3992, 'CARRAO': 0.0638 },
  349: { 'TUCURUVI': 0.3033, 'JACANA': 0.5682, 'VILA MEDEIROS': 0.0874, 'TREMEMBE': 0.0411 },
  350: { 'SAPOPEMBA': 0.7171, 'SAO LUCAS': 0.2829 },
  351: { 'CIDADE ADEMAR': 1.0 },
  352: { 'ITAIM PAULISTA': 1.0 },
  353: { 'LAJEADO': 0.6234, 'GUAIANASES': 0.3766 },
  371: { 'GRAJAU': 0.9837, 'CIDADE DUTRA': 0.0163 },
  372: { 'JARDIM ANGELA': 0.7565, 'JARDIM SAO LUIS': 0.2435 },
  373: { 'JARDIM SAO LUIS': 0.3106, 'CAPAO REDONDO': 0.6573, 'JARDIM ANGELA': 0.0321 },
  374: { 'RAPOSO TAVARES': 0.3328, 'RIO PEQUENO': 0.4789, 'JAGUARE': 0.1883 },
  375: { 'SAO RAFAEL': 0.5593, 'SAO MATEUS': 0.1996, 'IGUATEMI': 0.2411 },
  376: { 'BRASILANDIA': 0.981, 'CACHOEIRINHA': 0.019 },
  381: { 'PARELHEIROS': 0.5577, 'GRAJAU': 0.4175, 'MARSILAC': 0.0248 },
  389: { 'PERUS': 0.4429, 'JARAGUA': 0.2214, 'ANHANGUERA': 0.3048, 'BRASILANDIA': 0.031 },
  390: { 'CANGAIBA': 1.0 },
  392: { 'PONTE RASA': 0.5655, 'ARTUR ALVIM': 0.2864, 'ITAQUERA': 0.1481 },
  397: { 'JARDIM HELENA': 0.639, 'VILA CURUCA': 0.361 },
  403: { 'JARAGUA': 0.8884, 'SAO DOMINGOS': 0.0784, 'PIRITUBA': 0.0332 },
  404: { 'CIDADE TIRADENTES': 0.6913, 'IGUATEMI': 0.254, 'GUAIANASES': 0.0547 },
  405: { 'JOSE BONIFACIO': 0.8366, 'CIDADE TIRADENTES': 0.0915, 'ITAQUERA': 0.0719 },
  408: { 'JARDIM SAO LUIS': 0.5948, 'CAPAO REDONDO': 0.0196, 'VILA ANDRADE': 0.3682, 'VILA SONIA': 0.0174 },
  413: { 'SACOMA': 0.6271, 'CURSINO': 0.3729 },
  417: { 'ARTUR ALVIM': 0.2828, 'PARQUE DO CARMO': 0.3703, 'CIDADE LIDER': 0.3469 },
  418: { 'PEDREIRA': 0.5748, 'CIDADE ADEMAR': 0.2165, 'CAMPO GRANDE': 0.2087 },
  420: { 'JACANA': 0.1612, 'VILA MEDEIROS': 0.8388 },
  421: { 'SAO MATEUS': 0.515, 'SAPOPEMBA': 0.485 },
  422: { 'MANDAQUI': 0.5459, 'CACHOEIRINHA': 0.4541 },
};

// Fração de votos por zona → Região Administrativa do DF
const DF_ZONA_RA_MAP: Record<number, Record<string, number>> = {
  1:  { 'Plano Piloto': 1 },
  2:  { 'Paranoá': 0.5484, 'Lago Norte': 0.2581, 'Itapoã': 0.1290, 'Varjão': 0.0323, 'Plano Piloto': 0.0323 },
  3:  { 'Taguatinga': 1 },
  4:  { 'Santa Maria': 0.9524, 'Gama': 0.0476 },
  5:  { 'Sobradinho': 0.6383, 'Sobradinho II': 0.2766, 'Fercal': 0.0638, 'Planaltina': 0.0213 },
  6:  { 'Planaltina': 1 },
  8:  { 'Ceilândia': 1 },
  9:  { 'Guará': 0.8485, 'SCIA': 0.1515 },
  10: { 'Riacho Fundo': 0.2647, 'Riacho Fundo II': 0.2941, 'Núcleo Bandeirante': 0.2647, 'Candangolândia': 0.1471, 'Park Way': 0.0294 },
  11: { 'Cruzeiro': 0.5000, 'Sudoeste e Octogonal': 0.3125, 'Plano Piloto': 0.1250, 'SCIA': 0.0625 },
  13: { 'Samambaia': 0.9643, 'Água Quente': 0.0357 },
  14: { 'Plano Piloto': 1 },
  15: { 'Taguatinga': 0.4688, 'Águas Claras': 0.4375, 'Arniqueira': 0.0938 },
  16: { 'Brazlândia': 0.5357, 'Ceilândia': 0.4107, 'Sol Nascente/Pôr do Sol': 0.0536 },
  17: { 'Gama': 1 },
  18: { 'São Sebastião': 0.5556, 'Lago Sul': 0.3056, 'Paranoá': 0.0833, 'Jardim Botânico': 0.0556 },
  19: { 'Taguatinga': 0.6667, 'Vicente Pires': 0.3333 },
  20: { 'Ceilândia': 0.9444, 'Sol Nascente/Pôr do Sol': 0.0556 },
  21: { 'Recanto das Emas': 0.6897, 'Samambaia': 0.2759 },
};

// Fração de votos por zona eleitoral → Bairro do Rio de Janeiro
const RJ_ZONA_BAIRRO_MAP: Record<number, Record<string, number>> = {
  4:   { 'BOTAFOGO': 0.5344, 'FLAMENGO': 0.2844, 'HUMAITA': 0.1031, 'URCA': 0.0781 },
  5:   { 'COPACABANA': 0.9096, 'LEME': 0.0904 },
  7:   { 'TIJUCA': 1 },
  8:   { 'ROCHA': 0.2982, 'CACHAMBI': 0.2064, 'JACARE': 0.1147, 'MEIER': 0.1055, 'MARIA DA GRACA': 0.0963, 'DEL CASTILHO': 0.0826, 'ENGENHO NOVO': 0.0642, 'RIACHUELO': 0.0321 },
  9:   { 'RECREIO DOS BANDEIRANTES': 0.4054, 'BARRA DA TIJUCA': 0.3033, 'CAMORIM': 0.1141, 'VARGEM GRANDE': 0.0901, 'VARGEM PEQUENA': 0.0871 },
  10:  { 'CASCADURA': 0.1889, 'OSVALDO CRUZ': 0.1705, 'QUINTINO BOCAIUVA': 0.1613, 'ENCANTADO': 0.1567, 'MADUREIRA': 0.1198, 'PIEDADE': 0.1198, 'AGUA SANTA': 0.0829 },
  14:  { 'PILARES': 0.3047, 'PIEDADE': 0.2189, 'QUINTINO BOCAIUVA': 0.1717, 'ENGENHO DE DENTRO': 0.1202, 'CASCADURA': 0.0987, 'CAVALCANTI': 0.0558, 'TOMAS COELHO': 0.03 },
  16:  { 'LARANJEIRAS': 0.3584, 'CATETE': 0.3174, 'SANTA TERESA': 0.1195, 'GLORIA': 0.0956, 'COSME VELHO': 0.0614, 'LAPA': 0.0478 },
  17:  { 'LEBLON': 0.3618, 'IPANEMA': 0.3618, 'COPACABANA': 0.1776, 'GAVEA': 0.0592, 'LAGOA': 0.0395 },
  21:  { 'RAMOS': 0.3908, 'OLARIA': 0.3403, 'ENGENHO DA RAINHA': 0.0882, 'INHAUMA': 0.0798, 'BONSUCESSO': 0.0756, 'TOMAS COELHO': 0.0252 },
  22:  { 'IRAJA': 0.5748, 'PAVUNA': 0.186, 'PARQUE COLUMBIA': 0.0797, 'COLEGIO': 0.0731, 'ACARI': 0.0598, 'VILA DA PENHA': 0.0266 },
  23:  { 'GUADALUPE': 0.4622, 'MARECHAL HERMES': 0.2089, 'BENTO RIBEIRO': 0.1689, 'DEODORO': 0.1378, 'VILA MILITAR': 0.0222 },
  24:  { 'BANGU': 0.6368, 'PADRE MIGUEL': 0.1496, 'REALENGO': 0.1111, 'SENADOR CAMARA': 0.1026 },
  25:  { 'SEPETIBA': 0.4208, 'SANTA CRUZ': 0.3756, 'GUARATIBA': 0.1493, 'PEDRA DE GUARATIBA': 0.0543 },
  118: { 'MADUREIRA': 0.321, 'VICENTE DE CARVALHO': 0.1975, 'CAVALCANTI': 0.1358, 'CASCADURA': 0.1111, 'VAZ LOBO': 0.0926, 'ENGENHEIRO LEAL': 0.0494, 'TOMAS COELHO': 0.0494, 'OSVALDO CRUZ': 0.0432 },
  119: { 'FREGUESIA JACAREPAGUA': 0.4358, 'BARRA DA TIJUCA': 0.4078, 'ITANHANGA': 0.1061, 'ALTO DA BOA VISTA': 0.0503 },
  120: { 'CAMPO GRANDE': 0.8985, 'SENADOR VASCONCELOS': 0.1015 },
  122: { 'CAMPO GRANDE': 0.6344, 'SANTISSIMO': 0.2742, 'SENADOR VASCONCELOS': 0.0914 },
  123: { 'REALENGO': 0.3795, 'ANCHIETA': 0.3393, 'RICARDO DE ALBUQUERQUE': 0.1652, 'DEODORO': 0.0491, 'MAGALHAES BASTOS': 0.0402, 'PARQUE ANCHIETA': 0.0268 },
  125: { 'SANTA CRUZ': 1 },
  161: { 'BONSUCESSO': 0.9, 'RAMOS': 0.1 },
  162: { 'RAMOS': 0.2199, 'BRAS DE PINA': 0.1789, 'CORDOVIL': 0.1701, 'PENHA': 0.1672, 'OLARIA': 0.1613, 'PENHA CIRCULAR': 0.0821, 'PARADA DE LUCAS': 0.0205 },
  167: { 'ANCHIETA': 0.3716, 'PAVUNA': 0.3716, 'RICARDO DE ALBUQUERQUE': 0.1421, 'COSTA BARROS': 0.1148 },
  169: { 'BENFICA': 0.3035, 'HIGIENOPOLIS': 0.2836, 'INHAUMA': 0.1343, 'DEL CASTILHO': 0.1194, 'MANGUEIRA': 0.0597, 'BONSUCESSO': 0.0398, 'MANGUINHOS': 0.0299, 'MARIA DA GRACA': 0.0299 },
  170: { 'VILA ISABEL': 0.3661, 'ANDARAI': 0.247, 'GRAJAU': 0.2202, 'MARACANA': 0.1101, 'TIJUCA': 0.0565 },
  176: { 'JARDIM AMERICA': 0.2967, 'CORDOVIL': 0.1829, 'PARADA DE LUCAS': 0.1382, 'VISTA ALEGRE': 0.126, 'VIGARIO GERAL': 0.1179, 'VILA DA PENHA': 0.0813, 'BRAS DE PINA': 0.0569 },
  179: { 'PECHINCHA': 0.462, 'CIDADE DE DEUS': 0.2553, 'ANIL': 0.1581, 'GARDENIA AZUL': 0.1246 },
  180: { 'TAQUARA': 0.6311, 'TANQUE': 0.3689 },
  182: { 'TAQUARA': 0.5296, 'CURICICA': 0.4585, 'JACAREPAGUA': 0.0119 },
  185: { 'PRACA SECA': 0.4502, 'VILA VALQUEIRE': 0.2829, 'CAMPINHO': 0.1275, 'JARDIM SULACAP': 0.1076, 'BENTO RIBEIRO': 0.0319 },
  188: { 'PENHA': 0.3628, 'VILA DA PENHA': 0.2507, 'PENHA CIRCULAR': 0.1976, 'BRAS DE PINA': 0.0737, 'VILA KOSMOS': 0.0678, 'IRAJA': 0.0472 },
  191: { 'COCOTA': 0.2512, 'BANCARIOS': 0.1932, 'MONERO': 0.1739, 'CACUIA': 0.1159, 'ZUMBI': 0.0918, 'TAUA': 0.0725, 'RIBEIRA': 0.058, 'PITANGUEIRAS': 0.0435 },
  192: { 'GALEAO': 0.3933, 'JARDIM GUANABARA': 0.3067, 'PORTUGUESA': 0.2667, 'CIDADE UNIVERSITARIA': 0.0333 },
  204: { 'CENTRO': 0.4669, 'IMPERIAL DE SAO CRISTOVAO': 0.2882, 'CAJU': 0.1066, 'SANTO CRISTO': 0.0375, 'SAUDE': 0.0346, 'GAMBOA': 0.0231, 'PAQUETA': 0.0231, 'CIDADE NOVA': 0.0202 },
  211: { 'SAO CONRADO': 0.3852, 'GAVEA': 0.2451, 'JARDIM BOTANICO': 0.1518, 'VIDIGAL': 0.1051, 'LAGOA': 0.0934, 'ROCINHA': 0.0195 },
  214: { 'MEIER': 0.3176, 'ENGENHO NOVO': 0.2294, 'ENGENHO DE DENTRO': 0.1912, 'LINS DE VASCONCELOS': 0.1059, 'RIACHUELO': 0.0588, 'TODOS OS SANTOS': 0.05, 'ROCHA': 0.0265, 'SAO FRANCISCO XAVIER': 0.0206 },
  216: { 'ENGENHO DA RAINHA': 0.2661, 'INHAUMA': 0.2294, 'CACHAMBI': 0.2156, 'ENGENHO DE DENTRO': 0.1055, 'TODOS OS SANTOS': 0.1009, 'MEIER': 0.0826 },
  218: { 'VAZ LOBO': 0.22, 'MARECHAL HERMES': 0.208, 'MADUREIRA': 0.128, 'BENTO RIBEIRO': 0.092, 'TURIACU': 0.092, 'OSVALDO CRUZ': 0.088, 'HONORIO GURGEL': 0.084, 'ROCHA MIRANDA': 0.052, 'IRAJA': 0.036 },
  219: { 'ROCHA MIRANDA': 0.3282, 'COELHO NETO': 0.2061, 'HONORIO GURGEL': 0.126, 'PAVUNA': 0.1107, 'COLEGIO': 0.0954, 'COSTA BARROS': 0.084, 'BARROS FILHO': 0.0496 },
  229: { 'TIJUCA': 0.3555, 'RIO COMPRIDO': 0.2824, 'MARACANA': 0.1429, 'PRACA DA BANDEIRA': 0.1362, 'ESTACIO': 0.0831 },
  230: { 'VILA KENNEDY': 0.6923, 'BANGU': 0.3077 },
  233: { 'PADRE MIGUEL': 0.486, 'REALENGO': 0.3007, 'BANGU': 0.2133 },
  234: { 'REALENGO': 0.7136, 'MAGALHAES BASTOS': 0.2864 },
  238: { 'SENADOR CAMARA': 0.4427, 'BANGU': 0.4389, 'SANTISSIMO': 0.1183 },
  241: { 'PACIENCIA': 0.586, 'SANTA CRUZ': 0.2739, 'COSMOS': 0.1401 },
  242: { 'CAMPO GRANDE': 0.7513, 'INHOAIBA': 0.2487 },
  243: { 'GUARATIBA': 0.4706, 'PEDRA DE GUARATIBA': 0.3102, 'ILHA DE GUARATIBA': 0.1497, 'BARRA DE GUARATIBA': 0.0695 },
  245: { 'CAMPO GRANDE': 0.9176, 'INHOAIBA': 0.0824 },
  246: { 'PACIENCIA': 0.4458, 'COSMOS': 0.3173, 'CAMPO GRANDE': 0.1647, 'INHOAIBA': 0.0602, 'SANTA CRUZ': 0.012 },
};

const CE_ZONA_BAIRRO_MAP: Record<number, Record<string, number>> = {
  1:   { 'VICENTE PINZON': 0.1705, 'CAIS DO PORTO': 0.1532, 'MUCURIPE': 0.1387, 'VARJOTA': 0.1358, 'PAPICU': 0.0954, 'CIDADE 2000': 0.0723, 'DE LOURDES': 0.0723, 'COCO': 0.0636, 'ALDEOTA': 0.0636, 'PRAIA DO FUTURO II': 0.0202, 'MEIRELES': 0.0145 },
  2:   { 'MESSEJANA': 0.5645, 'LAGOA REDONDA': 0.1839, 'PAUPINA': 0.071, 'JOSE DE ALENCAR': 0.0645, 'GUAJERU': 0.0548, 'CAMBEBA': 0.0323, 'COACU': 0.029 },
  3:   { 'CENTRO': 0.3808, 'ALDEOTA': 0.2739, 'MEIRELES': 0.1534, 'JACARECANGA': 0.1041, 'PRAIA DE IRACEMA': 0.0877 },
  80:  { 'TAUAPE': 0.21, 'FATIMA': 0.163, 'DIONISIO TORRES': 0.1505, 'VILA UNIAO': 0.1442, 'ALTO DA BALANCA': 0.1348, 'JOAQUIM TAVORA': 0.1066, 'AEROLANDIA': 0.0439, 'JOSE BONIFACIO': 0.0313, 'AEROPORTO': 0.0157 },
  82:  { 'CRISTO REDENTOR': 0.2215, 'MONTE CASTELO': 0.2123, 'CARLITO PAMPLONA': 0.1569, 'PIRAMBU': 0.1385, 'SAO GERARDO': 0.1323, 'ALVARO WEYNE': 0.0677, 'JACARECANGA': 0.0523, 'ELLERY': 0.0185 },
  83:  { 'HENRIQUE JORGE': 0.234, 'BELA VISTA': 0.1859, 'JOQUEI CLUBE': 0.1026, 'DEMOCRITO ROCHA': 0.0994, 'JOAO XXIII': 0.0962, 'PICI': 0.0962, 'PANAMERICANO': 0.0865, 'DOM LUSTOSA': 0.0545, 'ANTONIO BEZERRA': 0.0224, 'MONTESE': 0.0224 },
  85:  { 'CONJUNTO CEARA I': 0.5395, 'ANTONIO BEZERRA': 0.1649, 'AUTRAN NUNES': 0.1306, 'GENIBAU': 0.1203, 'DOM LUSTOSA': 0.0447 },
  93:  { 'PREFEITO JOSE WALTER': 0.5447, 'MONDUBIM': 0.2439, 'PLANALTO AYRTON SENNA': 0.2114 },
  94:  { 'VILA VELHA': 0.4034, 'QUINTINO CUNHA': 0.2216, 'ANTONIO BEZERRA': 0.1761, 'PADRE ANDRADE': 0.108, 'JARDIM GUANABARA': 0.0625, 'JARDIM IRACEMA': 0.0284 },
  95:  { 'JANGURUSSU': 0.3182, 'CONJUNTO PALMEIRAS': 0.2308, 'BARROSO': 0.1888, 'PARQUE SANTA MARIA': 0.1189, 'CAJAZEIRAS': 0.0734, 'PEDRAS': 0.0559, 'ANCURI': 0.014 },
  112: { 'EDSON QUEIROZ': 0.2874, 'ENGENHEIRO LUCIANO CAVALCANTE': 0.1916, 'JARDIM DAS OLIVEIRAS': 0.1677, 'CIDADE DOS FUNCIONARIOS': 0.1497, 'SAPIRANGA COITE': 0.1108, 'PARQUE MANIBURA': 0.0329, 'GUARARAPES': 0.0269, 'CAMBEBA': 0.021, 'SABIAGUABA': 0.012 },
  113: { 'MONTESE': 0.1615, 'PARQUELANDIA': 0.141, 'BENFICA': 0.1282, 'RODOLFO TEOFILO': 0.1205, 'BOM FUTURO': 0.0898, 'JARDIM AMERICA': 0.0846, 'JOSE BONIFACIO': 0.0769, 'FARIAS BRITO': 0.0538, 'CENTRO': 0.0436, 'DAMAS': 0.0385, 'AMADEU FURTADO': 0.0307, 'VILA UNIAO': 0.0206, 'SAO GERARDO': 0.0103 },
  114: { 'BARRA DO CEARA': 0.4364, 'ALVARO WEYNE': 0.1856, 'JARDIM IRACEMA': 0.1753, 'PRESIDENTE KENNEDY': 0.1203, 'FLORESTA': 0.055, 'CRISTO REDENTOR': 0.0275 },
  115: { 'PARANGABA': 0.3629, 'VILA PERI': 0.1571, 'ITAPERI': 0.1, 'MANOEL SATIRO': 0.1, 'SERRINHA': 0.0714, 'JARDIM CEARENSE': 0.0657, 'MARAPONGA': 0.0657, 'MONTESE': 0.0657, 'MONDUBIM': 0.0114 },
  116: { 'GRANJA PORTUGAL': 0.2809, 'GRANJA LISBOA': 0.2315, 'BONSUCESSO': 0.2253, 'BOM JARDIM': 0.1944, 'JOAO XXIII': 0.0401, 'CONJUNTO CEARA II': 0.0278 },
  117: { 'CONJUNTO ESPERANCA': 0.2305, 'SIQUEIRA': 0.1898, 'BOM JARDIM': 0.1763, 'CANINDEZINHO': 0.139, 'PARQUE PRESIDENTE VARGAS': 0.0915, 'MANOEL SATIRO': 0.078, 'PARQUE SAO JOSE': 0.0475, 'PARQUE SANTA ROSA': 0.0237, 'NOVO MONDUBIM': 0.0237 },
  118: { 'PASSARE': 0.3106, 'SERRINHA': 0.1679, 'PARQUE DOIS IRMAOS': 0.1679, 'MONDUBIM': 0.1286, 'BOA VISTA CASTELAO': 0.1036, 'DIAS MACEDO': 0.0929, 'ITAPERI': 0.0286 },
};

type CenarioType = 'conservador' | 'possivel' | 'arrojado';
type FiltroTipo = 'todos' | 'com_dobrada' | 'sem_dobrada' | 'parcerias';
type VisualizacaoMapa = 'municipio' | 'zona' | 'bairro';

type TipoParceria = 'ONG' | 'IGREJA' | 'ASSOCIACAO' | 'LIDERANCA' | 'ORGAO_POLITICO' | 'EMPRESA' | 'TRANSPORTE' | 'SINDICATO' | 'COOPERATIVA' | 'GRUPO_ORGANIZADO' | 'OUTRO';

const TIPO_PARCERIA_LABELS: Record<TipoParceria, string> = {
  ONG: 'ONG',
  IGREJA: 'Igreja',
  ASSOCIACAO: 'Associação',
  LIDERANCA: 'Liderança Comunitária',
  ORGAO_POLITICO: 'Órgão Político',
  EMPRESA: 'Empresa',
  TRANSPORTE: 'Transporte',
  SINDICATO: 'Sindicato',
  COOPERATIVA: 'Cooperativa',
  GRUPO_ORGANIZADO: 'Grupo Organizado',
  OUTRO: 'Outro'
};

interface Parceria {
  id?: string;
  projecaoMunicipioId: string;
  bairro?: string;
  municipio?: string;
  nome: string;
  tipo: TipoParceria;
  responsavel?: string;
  contato?: string;
  observacoes?: string;
  impactoEstimado: number;
  metaConservadora: number;
  metaPossivel: number;
  metaArrojada: number;
  ativa: boolean;
}

interface ParceriasStats {
  total: number;
  ativas: number;
  impactoTotal: number;
  metaConservadoraTotal: number;
  metaPossivelTotal: number;
  metaArrojadaTotal: number;
  porTipo: Record<string, number>;
  municipiosComParcerias: number;
}

interface CandidatoMultiplo {
  id: string;
  nome: string;
  nomeUrna: string;
  numero: number;
  partido: string;
  cargo: string;
  ano: number;
  totalVotos: number;
  municipioPrincipal: string;
  municipioCandidatura: string;
}

interface ProjecaoMunicipio {
  id?: string;
  municipio: string;
  votosBase: number;
  metaConservadora: number;
  metaPossivel: number;
  metaArrojada: number;
  observacoes?: string;
  prioridade?: string;
  dobradaAtiva?: boolean;
  dobradaNome?: string;
  dobradaPartido?: string;
  dobradaObservacoes?: string;
  parcerias?: Parceria[];
}

interface Projecao {
  id: string;
  candidatoNome: string;
  anoBase: number;
  anoProjecao: number;
  uf: string;
  cargo?: string;
  municipios: ProjecaoMunicipio[];
}

interface ElectoralData {
  candidatoId?: string;
  candidateName?: string;
  nome?: string;
  nomeUrna?: string;
  numero?: number;
  partido: string;
  cargo: string;
  totalVotos: number;
  uf: string;
  situacao?: string;
  votosPorMunicipio?: Record<string, number>;
  votosPorNomeMunicipio?: Record<string, number>;
  votosPorEstado?: Record<string, number>;
  zonas?: Array<{ municipio: string; zona: number; votos: number }>;
}

interface VotoZona {
  zona: number;
  votos: number;
}

interface BairroInfo {
  municipio: string;
  bairro: string;
  votos: number;
  zonas: number[];
  locais: Array<{
    nome: string;
    endereco: string;
    latitude: number | null;
    longitude: number | null;
  }>;
}

export default function MapaCampanhaPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const userRole = (session?.user as any)?.role;
  const userPermissions = (session?.user as any)?.permissions ?? [];
  const canAccess = hasPermission({ role: userRole, permissions: userPermissions }, PERMISSIONS.PROJETO_CAMPANHA);

  useEffect(() => {
    if (status === 'authenticated' && !canAccess) {
      router.push('/dashboard');
    }
  }, [status, canAccess, router]);

  // Search states
  const [candidateName, setCandidateName] = useState('');
  const [ano, setAno] = useState('2022');
  const [uf, setUf] = useState('SP');
  const [anoProjecao, setAnoProjecao] = useState('2026');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingParceria, setSavingParceria] = useState(false);

  // Data states
  const [electoralData, setElectoralData] = useState<ElectoralData | null>(null);
  const [projecao, setProjecao] = useState<Projecao | null>(null);
  const [projecoesSalvas, setProjecoesSalvas] = useState<Projecao[]>([]);
  const [formCollapsed, setFormCollapsed] = useState(false);

  const voltarParaPesquisa = () => {
    setElectoralData(null);
    setProjecao(null);
    setFormCollapsed(false);
  };

  // Cenário and filter states
  const [cenarioAtivo, setCenarioAtivo] = useState<CenarioType>('possivel');
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos');

  // Parcerias states
  const [parcerias, setParcerias] = useState<Parceria[]>([]);
  const [pendingParcerias, setPendingParcerias] = useState<Parceria[]>([]);
  const [parceriasStats, setParceriasStats] = useState<ParceriasStats | null>(null);
  const [showParceriaModal, setShowParceriaModal] = useState(false);
  const [confirmRemoveMun, setConfirmRemoveMun] = useState<string | null>(null);
  const [confirmDeleteParceria, setConfirmDeleteParceria] = useState<string | null>(null);
  const [includeParcerias, setIncludeParcerias] = useState(true); // Toggle para simulação
  const [selectedParceria, setSelectedParceria] = useState<Parceria | null>(null);
  const [parceriaForm, setParceriaForm] = useState<Partial<Parceria>>({
    nome: '',
    tipo: 'LIDERANCA',
    responsavel: '',
    contato: '',
    observacoes: '',
    impactoEstimado: 0,
    metaConservadora: 0,
    metaPossivel: 0,
    metaArrojada: 0,
    ativa: true
  });
  const [municipioParaParceria, setMunicipioParaParceria] = useState<string>('');
  const [bairroParaParceria, setBairroParaParceria] = useState<string>('');

  // View states
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<'historico' | 'projecao'>('historico');
  const [showModal, setShowModal] = useState(false);
  const [selectedMapMunicipio, setSelectedMapMunicipio] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchMunicipio, setSearchMunicipio] = useState('');
  const [selectedMunicipio, setSelectedMunicipio] = useState<{
    nome: string;
    votosBase: number;
    metaConservadora: number;
    metaPossivel: number;
    metaArrojada: number;
    dobradaAtiva?: boolean;
    dobradaNome?: string;
    dobradaPartido?: string;
    dobradaObservacoes?: string;
  } | null>(null);

  // Edit modal states
  const [metaConservadoraTemp, setMetaConservadoraTemp] = useState<number>(0);
  const [metaPossivelTemp, setMetaPossivelTemp] = useState<number>(0);
  const [metaArrojadaTemp, setMetaArrojadaTemp] = useState<number>(0);
  const [prioridadeTemp, setPrioridadeTemp] = useState<string>('MEDIA');
  const [dobradaAtivaTemp, setDobradaAtivaTemp] = useState<boolean>(false);
  const [dobradaNomeTemp, setDobradaNomeTemp] = useState<string>('');
  const [dobradaPartidoTemp, setDobradaPartidoTemp] = useState<string>('');
  const [dobradaObservacoesTemp, setDobradaObservacoesTemp] = useState<string>('');

  // Add new municipality states
  const [novoMunicipioNome, setNovoMunicipioNome] = useState('');
  const [novoMetaConservadora, setNovoMetaConservadora] = useState<number>(0);
  const [novoMetaPossivel, setNovoMetaPossivel] = useState<number>(0);
  const [novoMetaArrojada, setNovoMetaArrojada] = useState<number>(0);
  const [novoMunicipioPrioridade, setNovoMunicipioPrioridade] = useState('MEDIA');
  const [municipiosDisponiveis, setMunicipiosDisponiveis] = useState<string[]>([]);
  const [filtroMunicipios, setFiltroMunicipios] = useState('');

  // Modal de seleção de candidatos múltiplos
  const [showCandidatoModal, setShowCandidatoModal] = useState(false);
  const [candidatosMultiplos, setCandidatosMultiplos] = useState<CandidatoMultiplo[]>([]);
  const [mensagemMultiplos, setMensagemMultiplos] = useState('');

  // Modal — confirmação de exclusão de projeção
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [projecaoParaExcluir, setProjecaoParaExcluir] = useState<{ id: string; nome: string } | null>(null);

  // Modal — novo candidato sem histórico eleitoral
  const [showNovoCandidatoModal, setShowNovoCandidatoModal] = useState(false);
  const [novoCandidatoNome, setNovoCandidatoNome] = useState('');
  const [novoCandidatoPartido, setNovoCandidatoPartido] = useState('');
  const [novoCandidatoCargo, setNovoCandidatoCargo] = useState('DEPUTADO_FEDERAL');
  const [novoCandidatoUf, setNovoCandidatoUf] = useState('SP');
  const [novoCandidatoAnoProjecao, setNovoCandidatoAnoProjecao] = useState('2026');
  const [novoCandidatoMunicipio, setNovoCandidatoMunicipio] = useState('');
  const [novoCandidatoMunicipioFiltro, setNovoCandidatoMunicipioFiltro] = useState('');
  const [novoCandidatoMunicipioOpcoes, setNovoCandidatoMunicipioOpcoes] = useState<string[]>([]);

  // Visualização por zona eleitoral e bairro (para vereadores)
  const [visualizacaoMapa, setVisualizacaoMapa] = useState<VisualizacaoMapa>('municipio');
  const [votosPorZona, setVotosPorZona] = useState<Record<string, { total: number; zonas: VotoZona[] }>>({});
  // Dados de bairros para vereadores
  const [bairrosInfo, setBairrosInfo] = useState<BairroInfo[]>([]);
  const [mediaVotosBairro, setMediaVotosBairro] = useState<number>(0);
  const [selectedBairro, setSelectedBairro] = useState<BairroInfo | null>(null);
  const [showBairroModal, setShowBairroModal] = useState(false);
  const [municipioVereador, setMunicipioVereador] = useState<string>('');

  // Zonas eleitorais do DF
  const [dfZonas, setDfZonas] = useState<import('@/components/maps/zona-pins-map').ZonaPinData[]>([]);
  const [dfBounds, setDfBounds] = useState<{ minLat: number; maxLat: number; minLng: number; maxLng: number; centerLat: number; centerLng: number } | null>(null);
  const [selectedDfZona, setSelectedDfZona] = useState<number | null>(null);
  const [loadingDfZonas, setLoadingDfZonas] = useState(false);
  const dfZonasCandidatoRef = useRef<string | null>(null);

  // Regiões administrativas do DF
  const [selectedDfRegiao, setSelectedDfRegiao] = useState<string | null>(null);
  const [dfVisualizacao, setDfVisualizacao] = useState<'regioes' | 'zonas'>('regioes');
  const [dfRegioesVotes, setDfRegioesVotes] = useState<Record<string, number>>({});

  // Distritos municipais de São Paulo
  const [spVisualizacao, setSpVisualizacao] = useState<'municipios' | 'distritos'>('municipios');
  const [selectedSpDistrito, setSelectedSpDistrito] = useState<string | null>(null);
  const [spDistritosVotes, setSpDistritosVotes] = useState<Record<string, number>>({});

  // Bairros do Rio de Janeiro capital
  const [rjVisualizacao, setRjVisualizacao] = useState<'municipios' | 'bairros'>('municipios');
  const [selectedRjBairro, setSelectedRjBairro] = useState<string | null>(null);
  const [rjBairrosVotes, setRjBairrosVotes] = useState<Record<string, number>>({});

  // Bairros de Fortaleza (CE)
  const [ceVisualizacao, setCeVisualizacao] = useState<'municipios' | 'bairros'>('municipios');
  const [selectedCeBairro, setSelectedCeBairro] = useState<string | null>(null);
  const [ceBairrosVotes, setCeBairrosVotes] = useState<Record<string, number>>({});

  // Bairros de municípios de MG (IBGE CD2022)
  const [mgVisualizacao, setMgVisualizacao] = useState<'municipios' | 'bairros'>('municipios');
  const [mgBairrosMunicipio, setMgBairrosMunicipio] = useState<string>('');
  const [selectedMgBairro, setSelectedMgBairro] = useState<string | null>(null);
  const [mgBairrosVotes, setMgBairrosVotes] = useState<Record<string, number>>({});

  // Bairros genéricos via polígonos IBGE (todos os estados com GeoJSON exceto MG)
  const [genPoligonosMunicipio, setGenPoligonosMunicipio] = useState<string>('');
  const [genPoligonosUf, setGenPoligonosUf] = useState<string>('');
  const [selectedGenBairro, setSelectedGenBairro] = useState<string | null>(null);
  const [genBairrosApiVotes, setGenBairrosApiVotes] = useState<Record<string, number>>({});


  // Agrega votos por zona do candidato → Regiões Administrativas do DF
  useEffect(() => {
    if (uf !== 'DF' || !electoralData) { setDfRegioesVotes({}); return; }
    const zonas = electoralData.zonas ?? [];
    if (zonas.length === 0) { setDfRegioesVotes({}); return; }
    const raVotes: Record<string, number> = {};
    for (const z of zonas) {
      const raMap = DF_ZONA_RA_MAP[z.zona];
      if (!raMap || !z.votos) continue;
      for (const [ra, frac] of Object.entries(raMap)) {
        raVotes[ra] = (raVotes[ra] ?? 0) + Math.round(z.votos * frac);
      }
    }
    setDfRegioesVotes(raVotes);
  }, [uf, electoralData]);

  // Agrega votos por zona do candidato → Distritos Municipais de SP capital
  useEffect(() => {
    if (uf !== 'SP' || !electoralData) { setSpDistritosVotes({}); return; }
    const zonas = electoralData.zonas ?? [];
    if (zonas.length === 0) { setSpDistritosVotes({}); return; }
    const distVotes: Record<string, number> = {};
    for (const z of zonas) {
      if (z.municipio !== 'SAO PAULO') continue;
      const distMap = SP_ZONA_DISTRITO_MAP[z.zona];
      if (!distMap || !z.votos) continue;
      for (const [dist, frac] of Object.entries(distMap)) {
        distVotes[dist] = (distVotes[dist] ?? 0) + Math.round(z.votos * frac);
      }
    }
    setSpDistritosVotes(distVotes);
  }, [uf, electoralData]);

  // Agrega votos por zona do candidato → Bairros do Rio de Janeiro capital
  useEffect(() => {
    if (uf !== 'RJ' || !electoralData) { setRjBairrosVotes({}); return; }
    const zonas = electoralData.zonas ?? [];
    if (zonas.length === 0) { setRjBairrosVotes({}); return; }
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const bairroVotes: Record<string, number> = {};
    for (const z of zonas) {
      if (norm(z.municipio) !== 'RIO DE JANEIRO') continue;
      const bairroMap = RJ_ZONA_BAIRRO_MAP[z.zona];
      if (!bairroMap || !z.votos) continue;
      for (const [bairro, frac] of Object.entries(bairroMap)) {
        bairroVotes[bairro] = (bairroVotes[bairro] ?? 0) + Math.round(z.votos * frac);
      }
    }
    setRjBairrosVotes(bairroVotes);
  }, [uf, electoralData]);

  // Agrega votos de bairros de Fortaleza usando CE_ZONA_BAIRRO_MAP (igual ao mapa-eleitoral)
  useEffect(() => {
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (uf !== 'CE' || !electoralData?.zonas?.length) { setCeBairrosVotes({}); return; }
    const bairroVotes: Record<string, number> = {};
    for (const z of electoralData.zonas) {
      if (norm(z.municipio) !== 'FORTALEZA') continue;
      const bairroMap = CE_ZONA_BAIRRO_MAP[z.zona];
      if (!bairroMap || !z.votos) continue;
      for (const [bairro, frac] of Object.entries(bairroMap)) {
        bairroVotes[bairro] = (bairroVotes[bairro] ?? 0) + Math.round(z.votos * frac);
      }
    }
    setCeBairrosVotes(bairroVotes);
  }, [uf, electoralData]);

  // Carrega votos P-I-P para MgBairrosMap (fix: antes não populava mgBairrosVotes)
  useEffect(() => {
    if (uf !== 'MG' || !mgBairrosMunicipio) { setMgBairrosVotes({}); return; }
    const params = new URLSearchParams({ municipio: mgBairrosMunicipio, uf: 'MG' });
    if (['2018','2020','2022','2024'].includes(ano) && electoralData?.candidatoId) {
      params.set('candidatoId', electoralData.candidatoId);
      params.set('ano', ano);
    }
    fetch(`/api/tse/bairros-poligonos?${params}`)
      .then(r => r.json())
      .then(data => setMgBairrosVotes(data.bairroVotes ?? {}))
      .catch(() => setMgBairrosVotes({}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uf, mgBairrosMunicipio, electoralData, ano]);

  // Detecta municípios genéricos com polígonos (todos os estados exceto cidades com mapas específicos)
  useEffect(() => {
    const normMun = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const isVereadorPrefeito = ['VEREADOR','PREFEITO'].some(c => (electoralData?.cargo ?? '').toUpperCase().includes(c));
    if (!isVereadorPrefeito || !municipioVereador) {
      setGenPoligonosMunicipio('');
      setGenPoligonosUf('');
      return;
    }
    const munNorm = normMun(municipioVereador);
    // Excluir cidades com mapas específicos
    const isEspecial = (uf === 'SP' && munNorm === 'SAO PAULO') ||
                       (uf === 'RJ' && munNorm === 'RIO DE JANEIRO') ||
                       (uf === 'CE' && munNorm === 'FORTALEZA');
    if (isEspecial) { setGenPoligonosMunicipio(''); setGenPoligonosUf(''); return; }
    if (hasBairrosPoligonos(uf, municipioVereador)) {
      setGenPoligonosMunicipio(municipioVereador);
      setGenPoligonosUf(uf);
    } else {
      setGenPoligonosMunicipio('');
      setGenPoligonosUf('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uf, municipioVereador, electoralData]);

  // Sincroniza dfRegioesVotes em entradas DF_REGIAO_ já existentes na projeção
  useEffect(() => {
    if (!Object.keys(dfRegioesVotes).length) return;
    setProjecao(prev => {
      if (!prev) return prev;
      const temRegiao = prev.municipios.some(m => isDfRegiao(m.municipio));
      if (!temRegiao) return prev;
      return {
        ...prev,
        municipios: prev.municipios.map(m => {
          if (!isDfRegiao(m.municipio)) return m;
          const nome = getRegiaoNome(m.municipio);
          const votosBase = dfRegioesVotes[nome] ?? m.votosBase;
          if (m.votosBase === votosBase) return m;
          return {
            ...m,
            votosBase,
            metaConservadora: m.metaConservadora === m.votosBase ? votosBase : m.metaConservadora,
            metaPossivel: m.metaPossivel === m.votosBase ? votosBase : m.metaPossivel,
            metaArrojada: m.metaArrojada === m.votosBase ? votosBase : m.metaArrojada,
          };
        }),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dfRegioesVotes]);

  // Sincroniza rjBairrosVotes em entradas RJ_BAIRRO_ já existentes na projeção
  useEffect(() => {
    if (!Object.keys(rjBairrosVotes).length) return;
    setProjecao(prev => {
      if (!prev) return prev;
      const temBairro = prev.municipios.some(m => isRjBairro(m.municipio));
      if (!temBairro) return prev;
      return {
        ...prev,
        municipios: prev.municipios.map(m => {
          if (!isRjBairro(m.municipio)) return m;
          const nome = getRjBairroNome(m.municipio);
          const votosBase = rjBairrosVotes[nome] ?? m.votosBase;
          if (m.votosBase === votosBase) return m;
          return {
            ...m,
            votosBase,
            metaConservadora: m.metaConservadora === m.votosBase ? votosBase : m.metaConservadora,
            metaPossivel: m.metaPossivel === m.votosBase ? votosBase : m.metaPossivel,
            metaArrojada: m.metaArrojada === m.votosBase ? votosBase : m.metaArrojada,
          };
        }),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rjBairrosVotes]);

  // Sincroniza ceBairrosVotes em entradas CE_BAIRRO_ já existentes na projeção
  useEffect(() => {
    if (!Object.keys(ceBairrosVotes).length) return;
    setProjecao(prev => {
      if (!prev) return prev;
      const temBairro = prev.municipios.some(m => isCeBairro(m.municipio));
      if (!temBairro) return prev;
      return {
        ...prev,
        municipios: prev.municipios.map(m => {
          if (!isCeBairro(m.municipio)) return m;
          const nome = getCeBairroNome(m.municipio);
          const votosBase = ceBairrosVotes[nome] ?? m.votosBase;
          if (m.votosBase === votosBase) return m;
          return {
            ...m,
            votosBase,
            metaConservadora: m.metaConservadora === m.votosBase ? votosBase : m.metaConservadora,
            metaPossivel: m.metaPossivel === m.votosBase ? votosBase : m.metaPossivel,
            metaArrojada: m.metaArrojada === m.votosBase ? votosBase : m.metaArrojada,
          };
        }),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceBairrosVotes]);

  // Sincroniza spDistritosVotes em entradas SP_DISTRITO_ já existentes na projeção
  useEffect(() => {
    if (!Object.keys(spDistritosVotes).length) return;
    setProjecao(prev => {
      if (!prev) return prev;
      const temDistrito = prev.municipios.some(m => isSpDistrito(m.municipio));
      if (!temDistrito) return prev;
      return {
        ...prev,
        municipios: prev.municipios.map(m => {
          if (!isSpDistrito(m.municipio)) return m;
          const nome = getDistritoNome(m.municipio);
          const votosBase = spDistritosVotes[nome] ?? m.votosBase;
          if (m.votosBase === votosBase) return m;
          return {
            ...m,
            votosBase,
            metaConservadora: m.metaConservadora === m.votosBase ? votosBase : m.metaConservadora,
            metaPossivel: m.metaPossivel === m.votosBase ? votosBase : m.metaPossivel,
            metaArrojada: m.metaArrojada === m.votosBase ? votosBase : m.metaArrojada,
          };
        }),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spDistritosVotes]);

  // Calcula votos por bairro para o mapa (formato Record<string, number>)
  const getVotosPorBairroMapa = (): Record<string, number> => {
    const result: Record<string, number> = {};
    bairrosInfo.forEach(b => {
      // Usar nome do bairro em maiúsculas como chave
      result[b.bairro.toUpperCase()] = b.votos;
    });
    return result;
  };

  // Total de votos para cálculo de percentuais
  const getTotalVotosBairros = (): number => {
    return bairrosInfo.reduce((acc, b) => acc + b.votos, 0);
  };

  // Load saved projections
  useEffect(() => {
    const loadProjecoes = async () => {
      try {
        const res = await fetch('/api/projecoes');
        if (res.ok) {
          const data = await res.json();
          setProjecoesSalvas(data);
        }
      } catch (error) {
        console.error('Erro ao carregar projeções:', error);
      }
    };
    if (canAccess) {
      loadProjecoes();
    }
  }, [userRole]);

  // Força Leaflet a recalcular tamanho ao entrar/sair da tela cheia.
  // Dispara em sequencia para cobrir transicoes CSS e garantir que invalidateSize seja chamado.
  useEffect(() => {
    const interval = setInterval(() => window.dispatchEvent(new Event('resize')), 60);
    const stop = setTimeout(() => {
      clearInterval(interval);
      window.dispatchEvent(new Event('resize'));
    }, 500);
    return () => { clearInterval(interval); clearTimeout(stop); };
  }, [mapFullscreen]);

  // Carrega municípios do IBGE quando o modal de novo candidato muda cargo/UF
  useEffect(() => {
    if (!showNovoCandidatoModal) return;
    const cargoUp = novoCandidatoCargo.toUpperCase();
    if (cargoUp !== 'VEREADOR' && cargoUp !== 'PREFEITO') {
      setNovoCandidatoMunicipioOpcoes([]);
      setNovoCandidatoMunicipio('');
      setNovoCandidatoMunicipioFiltro('');
      return;
    }
    setNovoCandidatoMunicipio('');
    setNovoCandidatoMunicipioFiltro('');
    fetch(`/api/ibge/municipios?uf=${novoCandidatoUf}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: { nome: string }[]) =>
        setNovoCandidatoMunicipioOpcoes(data.map(m => m.nome).sort())
      )
      .catch(() => {});
  }, [novoCandidatoCargo, novoCandidatoUf, showNovoCandidatoModal]);

  const searchCandidate = async (candidatoIdParam?: string) => {
    if (!candidateName.trim() && !candidatoIdParam) return;
    setLoading(true);
    try {
      let url = `/api/tse/candidato?ano=${ano}&uf=${uf}`;
      if (candidatoIdParam) {
        url += `&candidatoId=${candidatoIdParam}`;
      } else {
        url += `&candidato=${encodeURIComponent(candidateName)}`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.error || 'Candidato não encontrado');
        setLoading(false);
        return;
      }

      // Se encontrou múltiplos candidatos, mostrar modal de seleção
      if (data?.multiplos) {
        const candidatos = data.candidatos || [];
        if (candidatos.length > 0) {
          setCandidatosMultiplos(candidatos);
          setMensagemMultiplos(data.mensagem || `Encontramos ${candidatos.length} candidatos. Selecione um:`);
          setShowCandidatoModal(true);
          setLoading(false);
        } else {
          toast.error('Nenhum candidato encontrado');
          setLoading(false);
        }
        return;
      }

      // Carregar dados do candidato selecionado
      await loadCandidatoData(data);
    } catch (error) {
      console.error('Erro na busca:', error);
      toast.error('Erro ao buscar candidato');
    } finally {
      setLoading(false);
    }
  };

  // Função para carregar dados do candidato após seleção
  const loadCandidatoData = async (data: any) => {
    setElectoralData(data);
    setFormCollapsed(true);
    setShowCandidatoModal(false);
    
    // Limpar dados anteriores
    setBairrosInfo([]);
    setMediaVotosBairro(0);
    setVotosPorZona({});
    setVisualizacaoMapa('municipio');
    setSpVisualizacao('municipios');
    setSelectedSpDistrito(null);
    setMunicipioVereador('');
    setDfZonas([]);
    setDfBounds(null);
    setSelectedDfZona(null);
    setCeVisualizacao('municipios');
    setSelectedCeBairro(null);
    setMgVisualizacao('municipios');
    setMgBairrosMunicipio('');
    setSelectedMgBairro(null);
    setMgBairrosVotes({});
    setGenPoligonosMunicipio('');
    setGenPoligonosUf('');
    setSelectedGenBairro(null);
    setGenBairrosApiVotes({});

    // Para candidatos do DF: sinaliza para o useEffect carregar as zonas
    if (uf === 'DF') {
      dfZonasCandidatoRef.current = null; // reseta para forçar re-trigger
    }

    // Para candidatos municipais (vereador ou prefeito): focar no município automaticamente
    const cargoUp = (data.cargo ?? '').toUpperCase();
    const isMunicipal = cargoUp.includes('VEREADOR') || cargoUp.includes('PREFEITO');

    // variável local para evitar leitura de estado stale nos fallbacks
    let municipioEncontrado = '';

    if (isMunicipal && data.candidatoId) {
      try {
        // Carregar votos por zona
        const resZona = await fetch(`/api/tse/votos-zona?candidatoId=${data.candidatoId}`);
        if (resZona.ok) {
          const zonasData = await resZona.json();
          setVotosPorZona(zonasData.votosPorMunicipio || {});
        }

        // Carregar votos por bairro
        const resBairro = await fetch(`/api/tse/votos-bairro?candidatoId=${data.candidatoId}`);
        if (resBairro.ok) {
          const bairrosData = await resBairro.json();
          setBairrosInfo(bairrosData.bairrosInfo || []);
          setMediaVotosBairro(bairrosData.mediaVotosBairro || 0);

          if (bairrosData.municipiosUnicos?.length > 0) {
            municipioEncontrado = bairrosData.municipiosUnicos[0];
          } else if (bairrosData.bairrosInfo?.length > 0) {
            municipioEncontrado = bairrosData.bairrosInfo[0].municipio;
          }
        }
      } catch (error) {
        console.error('Erro ao carregar dados de zona/bairro:', error);
      }
    }

    // Fallback: usar votosPorNomeMunicipio se a API de bairros não retornou município
    if (isMunicipal && !municipioEncontrado) {
      const munVotos = data.votosPorNomeMunicipio as Record<string, number> | undefined;
      if (munVotos && Object.keys(munVotos).length > 0) {
        municipioEncontrado = Object.entries(munVotos).sort((a, b) => b[1] - a[1])[0][0];
      }
    }

    if (isMunicipal && municipioEncontrado) {
      setMunicipioVereador(municipioEncontrado);
      setVisualizacaoMapa('municipio');
    }

    // Para candidatos estaduais/federais de CE: carregar votos de Fortaleza por bairro
    if (!isMunicipal && data.candidatoId && (uf === 'CE' || data.uf === 'CE')) {
      try {
        const resBairro = await fetch(`/api/tse/votos-bairro?candidatoId=${data.candidatoId}&municipio=FORTALEZA`);
        if (resBairro.ok) {
          const bairrosData = await resBairro.json();
          setBairrosInfo(bairrosData.bairrosInfo || []);
        }
      } catch (error) {
        console.error('Erro ao carregar votos por bairro CE:', error);
      }
    }

    const nomeCandidato = data.candidateName || data.nome;

    const existingProjecao = projecoesSalvas.find(
      p => p.candidatoNome === nomeCandidato && p.anoBase === parseInt(ano) && p.uf === uf
    );

    if (existingProjecao) {
      setProjecao(existingProjecao);
      // Carregar parcerias da projeção existente
      if (existingProjecao.id) {
        loadParcerias(existingProjecao.id);
      }
    } else {
      // Limpar parcerias para nova projeção
      setParcerias([]);
      setPendingParcerias([]);
      setParceriasStats(null);
      let municipiosData: Record<string, number> = {};
      municipiosData = data.votosPorNomeMunicipio || {};

      const municipios: ProjecaoMunicipio[] = Object.entries(municipiosData).map(
        ([municipio, votos]) => ({
          municipio,
          votosBase: votos as number,
          metaConservadora: votos as number,
          metaPossivel: votos as number,
          metaArrojada: votos as number,
          prioridade: 'MEDIA',
          dobradaAtiva: false
        })
      );

      setProjecao({
        id: '',
        candidatoNome: nomeCandidato,
        anoBase: parseInt(ano),
        anoProjecao: parseInt(anoProjecao),
        uf,
        cargo: data.cargo,
        municipios
      });
    }
  };

  // Função para selecionar candidato do modal
  const selectCandidato = async (candidato: CandidatoMultiplo) => {
    setShowCandidatoModal(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/tse/candidato?ano=${ano}&uf=${uf}&candidatoId=${candidato.id}`);
      const data = await res.json();
      if (res.ok) {
        await loadCandidatoData(data);
      } else {
        toast.error(data?.error || 'Erro ao carregar candidato');
      }
    } catch (error) {
      console.error('Erro ao selecionar candidato:', error);
      toast.error('Erro ao carregar dados do candidato');
    } finally {
      setLoading(false);
    }
  };

  const criarNovoCandidato = () => {
    if (!novoCandidatoNome.trim()) return;
    const cargoUp = novoCandidatoCargo.toUpperCase();
    const isMunicipal = cargoUp === 'VEREADOR' || cargoUp === 'PREFEITO';
    const cargoLabel: Record<string, string> = {
      DEPUTADO_FEDERAL: 'Deputado Federal', DEPUTADO_ESTADUAL: 'Deputado Estadual',
      VEREADOR: 'Vereador', PREFEITO: 'Prefeito',
      SENADOR: 'Senador', GOVERNADOR: 'Governador',
    };
    setElectoralData({
      nome: novoCandidatoNome.trim(),
      nomeUrna: novoCandidatoNome.trim().toUpperCase(),
      partido: novoCandidatoPartido.trim() || 'N/A',
      cargo: novoCandidatoCargo,
      totalVotos: 0,
      uf: novoCandidatoUf,
      votosPorMunicipio: {},
      votosPorNomeMunicipio: {},
      votosPorEstado: {},
    });
    const munNormalized = isMunicipal && novoCandidatoMunicipio ? normMunKey(novoCandidatoMunicipio) : '';
    setProjecao({
      id: '',
      candidatoNome: novoCandidatoNome.trim(),
      anoBase: Number(novoCandidatoAnoProjecao),
      anoProjecao: Number(novoCandidatoAnoProjecao),
      uf: novoCandidatoUf,
      cargo: cargoLabel[novoCandidatoCargo] ?? novoCandidatoCargo,
      municipios: munNormalized ? [{
        municipio: munNormalized,
        votosBase: 0,
        metaConservadora: 0,
        metaPossivel: 0,
        metaArrojada: 0,
        prioridade: 'MEDIA',
        dobradaAtiva: false,
      }] : [],
    });
    setUf(novoCandidatoUf);
    setAno(novoCandidatoAnoProjecao);
    setAnoProjecao(novoCandidatoAnoProjecao);
    setParcerias([]);
    setPendingParcerias([]);
    setParceriasStats(null);
    setActiveTab('projecao');
    setShowNovoCandidatoModal(false);

    // Configura visualização do mapa para candidatos municipais
    if (isMunicipal && novoCandidatoMunicipio) {
      setMunicipioVereador(munNormalized || novoCandidatoMunicipio);
      setVisualizacaoMapa('municipio');
      setBairrosInfo([]);
      setMediaVotosBairro(0);
      if (novoCandidatoUf === 'SP' && munNormalized === 'SAO PAULO') {
        setSpVisualizacao('distritos');
      } else if (novoCandidatoUf === 'RJ' && munNormalized === 'RIO DE JANEIRO') {
        setRjVisualizacao('bairros');
      } else if (novoCandidatoUf === 'CE' && munNormalized === 'FORTALEZA') {
        setCeVisualizacao('bairros');
      } else {
        setSpVisualizacao('municipios');
        setRjVisualizacao('municipios');
        setCeVisualizacao('municipios');
        setMgVisualizacao('municipios');
        setMgBairrosMunicipio('');
      }
    } else {
      setVisualizacaoMapa('municipio');
    }

    // reset form
    setNovoCandidatoNome('');
    setNovoCandidatoPartido('');
    setNovoCandidatoCargo('DEPUTADO_FEDERAL');
    setNovoCandidatoMunicipio('');
    setNovoCandidatoMunicipioFiltro('');
  };

  const saveProjecao = async () => {
    if (!projecao) return;
    setSaving(true);
    try {
      const res = await fetch('/api/projecoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...projecao,
          anoProjecao: parseInt(anoProjecao)
        })
      });
      if (res.ok) {
        const saved = await res.json();
        setProjecao(saved);
        setProjecoesSalvas(prev => {
          const idx = prev.findIndex(p => p.id === saved.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = saved;
            return updated;
          }
          return [...prev, saved];
        });

        // Salvar parcerias que estavam pendentes (buffered antes da projeção existir)
        if (pendingParcerias.length > 0) {
          const savedMunicipios: ProjecaoMunicipio[] = saved.municipios ?? [];
          for (const pending of pendingParcerias) {
            const munKey = normMunKey(pending.municipio || '');
            const munData = savedMunicipios.find(m => normMunKey(m.municipio) === munKey);
            if (!munData?.id) continue;
            try {
              await fetch('/api/parcerias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  projecaoMunicipioId: munData.id,
                  bairro: pending.bairro ?? null,
                  nome: pending.nome,
                  tipo: pending.tipo,
                  responsavel: pending.responsavel ?? null,
                  contato: pending.contato ?? null,
                  observacoes: pending.observacoes ?? null,
                  impactoEstimado: pending.impactoEstimado ?? 0,
                  metaConservadora: pending.metaConservadora ?? 0,
                  metaPossivel: pending.metaPossivel ?? 0,
                  metaArrojada: pending.metaArrojada ?? 0,
                }),
              });
            } catch { /* ignora erro individual — a projeção já foi salva */ }
          }
          setPendingParcerias([]);
          await loadParcerias(saved.id);
        }

        toast.success('Projeção salva com sucesso!');
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error((errData as any)?.error || 'Erro ao salvar projeção');
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar projeção');
    } finally {
      setSaving(false);
    }
  };

  const normMunKey = (s: string) =>
    s.toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[''`´''']/g, ' ')
      .replace(/\s+/g, ' ').trim();

  const updateMunicipioMetas = (
    municipio: string,
    metaConservadora: number,
    metaPossivel: number,
    metaArrojada: number,
    prioridade?: string,
    dobradaAtiva?: boolean,
    dobradaNome?: string,
    dobradaPartido?: string,
    dobradaObservacoes?: string
  ) => {
    if (!projecao) return;
    const munKey = normMunKey(municipio);
    setProjecao(prev => {
      if (!prev) return prev;
      const municipios = prev.municipios.map(m =>
        normMunKey(m.municipio) === munKey
          ? {
              ...m,
              metaConservadora,
              metaPossivel,
              metaArrojada,
              prioridade: prioridade || m.prioridade,
              dobradaAtiva: dobradaAtiva ?? m.dobradaAtiva,
              dobradaNome: dobradaNome ?? m.dobradaNome,
              dobradaPartido: dobradaPartido ?? m.dobradaPartido,
              dobradaObservacoes: dobradaObservacoes ?? m.dobradaObservacoes
            }
          : m
      );
      return { ...prev, municipios };
    });
  };

  // Meta base (sem parcerias)
  const getMetaBase = (mun: ProjecaoMunicipio): number => {
    switch (cenarioAtivo) {
      case 'conservador': return mun.metaConservadora;
      case 'possivel': return mun.metaPossivel;
      case 'arrojado': return mun.metaArrojada;
      default: return mun.metaPossivel;
    }
  };

  // Meta ativa (base + dobradas + parcerias se incluídas) - usada nos cálculos de totais
  const getMetaAtiva = (mun: ProjecaoMunicipio): number => {
    if (includeParcerias) {
      return getMetaFinalMunicipio(mun, cenarioAtivo);
    } else {
      // Sem parcerias - apenas meta base
      return getMetaBase(mun);
    }
  };

  const loadMunicipiosDisponiveis = async () => {
    try {
      const res = await fetch(`/api/ibge/municipios?uf=${uf}`);
      if (res.ok) {
        const data = await res.json();
        const nomes = data.map((m: { nome: string }) => m.nome).sort();
        setMunicipiosDisponiveis(nomes);
      }
    } catch (error) {
      console.error('Erro ao carregar municípios:', error);
    }
  };

  const openAddModal = () => {
    loadMunicipiosDisponiveis();
    setNovoMunicipioNome('');
    setNovoMetaConservadora(0);
    setNovoMetaPossivel(0);
    setNovoMetaArrojada(0);
    setNovoMunicipioPrioridade('MEDIA');
    setFiltroMunicipios('');
    setShowAddModal(true);
  };

  const addNovoMunicipio = () => {
    if (!projecao || !novoMunicipioNome.trim()) {
      toast.error('Selecione um município');
      return;
    }

    const exists = projecao.municipios.some(
      m => m.municipio.toUpperCase() === novoMunicipioNome.toUpperCase()
    );

    if (exists) {
      toast.error('Este município já está na lista de projeção');
      return;
    }

    const novoMunicipio: ProjecaoMunicipio = {
      municipio: novoMunicipioNome.toUpperCase(),
      votosBase: 0,
      metaConservadora: novoMetaConservadora,
      metaPossivel: novoMetaPossivel,
      metaArrojada: novoMetaArrojada,
      prioridade: novoMunicipioPrioridade,
      dobradaAtiva: false
    };

    setProjecao(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        municipios: [...prev.municipios, novoMunicipio]
      };
    });

    setShowAddModal(false);
  };

  const removeMunicipio = (municipio: string) => {
    if (!projecao) return;
    setConfirmRemoveMun(municipio);
  };

  const doRemoveMunicipio = () => {
    if (!confirmRemoveMun) return;
    const municipio = confirmRemoveMun;
    setConfirmRemoveMun(null);
    const munKey = normMunKey(municipio);
    setProjecao(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        municipios: prev.municipios.filter(m => normMunKey(m.municipio) !== munKey)
      };
    });
  };

  const normMun = (s: string) =>
    s.toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[''`´''']/g, ' ')                       // apóstrofo → espaço
      .replace(/\s+/g, ' ').trim();                     // espaços múltiplos

  const loadMunicipioData = (municipio: string) => {
    if (!projecao) return false;
    const munData = projecao.municipios.find(m => normMun(m.municipio) === normMun(municipio));
    if (!munData) return false;
    setSelectedMunicipio({
      nome: municipio,
      votosBase: munData.votosBase,
      metaConservadora: munData.metaConservadora,
      metaPossivel: munData.metaPossivel,
      metaArrojada: munData.metaArrojada,
      dobradaAtiva: munData.dobradaAtiva,
      dobradaNome: munData.dobradaNome,
      dobradaPartido: munData.dobradaPartido,
      dobradaObservacoes: munData.dobradaObservacoes
    });
    setMetaConservadoraTemp(munData.metaConservadora);
    setMetaPossivelTemp(munData.metaPossivel);
    setMetaArrojadaTemp(munData.metaArrojada);
    setPrioridadeTemp(munData.prioridade || 'MEDIA');
    setDobradaAtivaTemp(munData.dobradaAtiva || false);
    setDobradaNomeTemp(munData.dobradaNome || '');
    setDobradaPartidoTemp(munData.dobradaPartido || '');
    setDobradaObservacoesTemp(munData.dobradaObservacoes || '');
    return true;
  };

  // Clique no mapa OU na lista: destaca município e abre modal
  const handleMunicipioClick = (municipio: string, codigo?: string) => {
    void codigo;
    if (!projecao) return;
    setSelectedMapMunicipio(municipio);

    if (loadMunicipioData(municipio)) {
      setShowModal(true);
      return;
    }

    // Município ainda não está na projeção — pré-preencher com votos da última eleição
    const munNormLocal = normMunKey(municipio);
    const votosBase = electoralData?.votosPorNomeMunicipio
      ? (Object.entries(electoralData.votosPorNomeMunicipio).find(
          ([k]) => normMunKey(k) === munNormLocal
        )?.[1] ?? 0)
      : 0;
    const novoMun: ProjecaoMunicipio = {
      municipio,
      votosBase,
      metaConservadora: votosBase,
      metaPossivel: votosBase,
      metaArrojada: votosBase,
      prioridade: 'MEDIA',
      dobradaAtiva: false,
    };
    setProjecao(prev => prev ? { ...prev, municipios: [...prev.municipios, novoMun] } : prev);
    setSelectedMunicipio({ nome: municipio, votosBase, metaConservadora: votosBase, metaPossivel: votosBase, metaArrojada: votosBase, dobradaAtiva: false });
    setMetaConservadoraTemp(votosBase);
    setMetaPossivelTemp(votosBase);
    setMetaArrojadaTemp(votosBase);
    setPrioridadeTemp('MEDIA');
    setDobradaAtivaTemp(false);
    setDobradaNomeTemp('');
    setDobradaPartidoTemp('');
    setDobradaObservacoesTemp('');
    setShowModal(true);
  };

  // Carregar parcerias da projeção
  const loadParcerias = async (projecaoId: string) => {
    try {
      const res = await fetch(`/api/parcerias?projecaoId=${projecaoId}`);
      if (res.ok) {
        const data = await res.json();
        setParcerias(data.parcerias || []);
        setParceriasStats(data.stats || null);
      }
    } catch (error) {
      console.error('Erro ao carregar parcerias:', error);
    }
  };

  // Carregar dados de bairros para vereador (usado ao selecionar projeção salva)
  const loadBairrosVereador = async (candidatoNome: string, anoBase: number, ufState: string) => {
    try {
      // Primeiro buscar o candidato para obter o candidatoId
      const resCandidato = await fetch(`/api/tse/candidato?ano=${anoBase}&uf=${ufState}&candidato=${encodeURIComponent(candidatoNome)}`);
      if (!resCandidato.ok) return;
      
      const candidatoData = await resCandidato.json();
      
      // Se encontrou múltiplos candidatos, pegar o primeiro com cargo municipal
      let candidatoId = candidatoData.candidatoId;
      if (candidatoData.multiplos && candidatoData.candidatos) {
        const municipal = candidatoData.candidatos.find((c: any) => {
          const c2 = (c.cargo ?? '').toUpperCase();
          return c2.includes('VEREADOR') || c2.includes('PREFEITO');
        });
        if (municipal) candidatoId = municipal.id;
      }
      
      if (!candidatoId) return;

      // Buscar dados completos para popular zonas (necessário para spDistritosVotes)
      const resFullData = await fetch(`/api/tse/candidato?ano=${anoBase}&uf=${ufState}&candidatoId=${candidatoId}`);
      if (resFullData.ok) {
        const fullData = await resFullData.json();
        if (!fullData.multiplos) {
          setElectoralData((prev: ElectoralData | null) => prev ? {
            ...prev,
            zonas: fullData.zonas ?? prev.zonas,
            votosPorMunicipio: fullData.votosPorMunicipio ?? prev.votosPorMunicipio,
            votosPorNomeMunicipio: fullData.votosPorNomeMunicipio ?? prev.votosPorNomeMunicipio,
            totalVotos: fullData.totalVotos ?? prev.totalVotos,
            candidatoId: fullData.candidatoId ?? prev.candidatoId,
          } : prev);
        }
      }

      // Carregar votos por bairro
      const resBairro = await fetch(`/api/tse/votos-bairro?candidatoId=${candidatoId}`);
      if (resBairro.ok) {
        const bairrosData = await resBairro.json();
        setBairrosInfo(bairrosData.bairrosInfo || []);
        setMediaVotosBairro(bairrosData.mediaVotosBairro || 0);

        let municipioFound = '';
        if (bairrosData.municipiosUnicos && bairrosData.municipiosUnicos.length > 0) {
          municipioFound = bairrosData.municipiosUnicos[0];
        } else if (bairrosData.bairrosInfo && bairrosData.bairrosInfo.length > 0) {
          municipioFound = bairrosData.bairrosInfo[0].municipio;
        }

        if (municipioFound) {
          setMunicipioVereador(municipioFound);
          setVisualizacaoMapa('municipio');
        }
      }
      
      // Carregar votos por zona também
      const resZona = await fetch(`/api/tse/votos-zona?candidatoId=${candidatoId}`);
      if (resZona.ok) {
        const zonasData = await resZona.json();
        setVotosPorZona(zonasData.votosPorMunicipio || {});
      }
    } catch (error) {
      console.error('Erro ao carregar dados de bairros do vereador:', error);
    }
  };

  // Salvar parceria
  const saveParceria = async () => {
    if (savingParceria) return; // bloqueia clique duplo enquanto request em andamento
    if (!parceriaForm.nome || !parceriaForm.tipo) {
      toast.error('Nome e tipo são obrigatórios');
      return;
    }

    setSavingParceria(true);
    try {
      // Usa normMunKey pra casar nomes com acentos diferentes
      // (ex.: "São Paulo" vs "SAO PAULO" vs "São Paulo ")
      const munKey = normMunKey(municipioParaParceria);
      const munData = projecao?.municipios.find(m =>
        normMunKey(m.municipio) === munKey
      );

      if (!munData) {
        toast.error('Município não encontrado na projeção. Adicione-o antes.');
        return;
      }

      // Projeção ainda não salva → buffering local
      if (!munData.id) {
        const isPendingEdit = selectedParceria?.id?.startsWith('pending-');
        const pendingEntry: Parceria = {
          id: isPendingEdit ? selectedParceria!.id! : `pending-${Date.now()}`,
          municipio: municipioParaParceria,
          bairro: bairroParaParceria || null,
          projecaoMunicipioId: '',
          nome: parceriaForm.nome ?? '',
          tipo: (parceriaForm.tipo ?? 'LIDERANCA') as any,
          responsavel: parceriaForm.responsavel ?? null,
          contato: parceriaForm.contato ?? null,
          observacoes: parceriaForm.observacoes ?? null,
          impactoEstimado: parceriaForm.impactoEstimado ?? 0,
          metaConservadora: parceriaForm.metaConservadora ?? 0,
          metaPossivel: parceriaForm.metaPossivel ?? 0,
          metaArrojada: parceriaForm.metaArrojada ?? 0,
          ativa: parceriaForm.ativa ?? true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setPendingParcerias(prev =>
          isPendingEdit
            ? prev.map(p => p.id === selectedParceria!.id ? pendingEntry : p)
            : [...prev, pendingEntry]
        );
        setShowParceriaModal(false);
        setSelectedParceria(null);
        setParceriaForm({ nome: '', tipo: 'LIDERANCA', responsavel: '', contato: '', observacoes: '', impactoEstimado: 0, metaConservadora: 0, metaPossivel: 0, metaArrojada: 0, ativa: true });
        toast.success('Parceria adicionada — será salva junto com a projeção');
        setSavingParceria(false);
        return;
      }

      const payload = {
        ...parceriaForm,
        projecaoMunicipioId: munData.id,
        bairro: bairroParaParceria || null
      };

      const method = selectedParceria?.id && !selectedParceria.id.startsWith('pending-') ? 'PUT' : 'POST';
      if (method === 'PUT') {
        (payload as any).id = selectedParceria!.id;
      }

      const res = await fetch('/api/parcerias', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowParceriaModal(false);
        setSelectedParceria(null);
        setParceriaForm({
          nome: '',
          tipo: 'LIDERANCA',
          responsavel: '',
          contato: '',
          observacoes: '',
          impactoEstimado: 0,
          metaConservadora: 0,
          metaPossivel: 0,
          metaArrojada: 0,
          ativa: true
        });
        toast.success('Parceria salva com sucesso!');
        if (projecao?.id) {
          loadParcerias(projecao.id).catch(() => {});
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData?.error || 'Erro ao salvar parceria');
        console.error('Erro ao salvar parceria:', res.status, errData);
      }
    } catch (error) {
      console.error('Erro ao salvar parceria:', error);
      toast.error('Erro ao salvar parceria');
    } finally {
      setSavingParceria(false);
    }
  };

  // Deletar parceria
  const deleteParceria = (id: string) => setConfirmDeleteParceria(id);

  const doDeleteParceria = async () => {
    if (!confirmDeleteParceria) return;
    const id = confirmDeleteParceria;
    setConfirmDeleteParceria(null);

    // Parceria ainda não salva → remove apenas do estado local
    if (id.startsWith('pending-')) {
      setPendingParcerias(prev => prev.filter(p => p.id !== id));
      return;
    }

    try {
      const res = await fetch(`/api/parcerias?id=${id}`, { method: 'DELETE' });
      if (res.ok && projecao?.id) {
        await loadParcerias(projecao.id);
      }
    } catch (error) {
      console.error('Erro ao deletar parceria:', error);
    }
  };

  // Abrir modal de parceria
  const openParceriaModal = (municipio: string, bairro?: string) => {
    setMunicipioParaParceria(municipio);
    setBairroParaParceria(bairro || '');
    setParceriaForm({
      nome: '',
      tipo: 'LIDERANCA',
      responsavel: '',
      contato: '',
      observacoes: '',
      impactoEstimado: 0,
      metaConservadora: 0,
      metaPossivel: 0,
      metaArrojada: 0,
      ativa: true
    });
    setSelectedParceria(null);
    setShowParceriaModal(true);
  };

  // Verifica se uma parceria pertence a um bairro do município dado
  const parceriaBairroDestesMunicipio = (pMun: string, municipioNorm: string): boolean => {
    if (isMunBairro(pMun) && municipioVereador && normMunKey(municipioVereador) === municipioNorm) return true;
    if (isMgBairro(pMun) && mgBairrosMunicipio && normMunKey(mgBairrosMunicipio) === municipioNorm) return true;
    return false;
  };

  // Obter parcerias de um município (inclui parcerias de bairros pertencentes ao município)
  const getParceriasMunicipio = (municipio: string): Parceria[] => {
    const munUp = municipio.toUpperCase();
    const munNorm = normMunKey(municipio);
    const saved = parcerias.filter(p => {
      const pMun = p.municipio ?? '';
      return pMun.toUpperCase() === munUp || parceriaBairroDestesMunicipio(pMun, munNorm);
    });
    const pending = pendingParcerias.filter(p => {
      const pMun = p.municipio ?? '';
      return pMun.toUpperCase() === munUp || parceriaBairroDestesMunicipio(pMun, munNorm);
    });
    return [...saved, ...pending];
  };

  // Verificar se município tem parcerias (inclui bairros)
  const municipioTemParcerias = (municipio: string): boolean => {
    const munUp = municipio.toUpperCase();
    const munNorm = normMunKey(municipio);
    return parcerias.some(p => {
      const pMun = p.municipio ?? '';
      return pMun.toUpperCase() === munUp || parceriaBairroDestesMunicipio(pMun, munNorm);
    }) || pendingParcerias.some(p => {
      const pMun = p.municipio ?? '';
      return pMun.toUpperCase() === munUp || parceriaBairroDestesMunicipio(pMun, munNorm);
    });
  };

  // Calcular soma das metas de parcerias por município
  const getParceriasSumForMunicipio = (municipio: string): { conservadora: number; possivel: number; arrojada: number; impacto: number } => {
    const parceriasMun = getParceriasMunicipio(municipio);
    return {
      conservadora: parceriasMun.reduce((acc, p) => acc + (p.metaConservadora || 0), 0),
      possivel: parceriasMun.reduce((acc, p) => acc + (p.metaPossivel || 0), 0),
      arrojada: parceriasMun.reduce((acc, p) => acc + (p.metaArrojada || 0), 0),
      impacto: parceriasMun.reduce((acc, p) => acc + (p.impactoEstimado || 0), 0)
    };
  };

  // Soma o delta de projeções de bairros para um município (meta - votosBase de cada bairro)
  const getBairrosDeltaMunicipio = (municipio: string, cenario: CenarioType): number => {
    if (!projecao) return 0;
    const munNorm = normMunKey(municipio);
    const bairros = projecao.municipios.filter(m => {
      const mMun = m.municipio;
      if (isMunBairro(mMun) && municipioVereador && normMunKey(municipioVereador) === munNorm) return true;
      if (isMgBairro(mMun) && mgBairrosMunicipio && normMunKey(mgBairrosMunicipio) === munNorm) return true;
      return false;
    });
    return bairros.reduce((acc, m) => {
      const meta = cenario === 'conservador' ? m.metaConservadora
        : cenario === 'arrojado' ? m.metaArrojada
        : m.metaPossivel;
      return acc + Math.max(0, meta - m.votosBase);
    }, 0);
  };

  // Obter meta final (base + parcerias + delta de bairros) para um município
  const getMetaFinalMunicipio = (mun: ProjecaoMunicipio, cenario: CenarioType): number => {
    const parceriasSum = getParceriasSumForMunicipio(mun.municipio);
    const bairrosDelta = getBairrosDeltaMunicipio(mun.municipio, cenario);
    switch (cenario) {
      case 'conservador': return mun.metaConservadora + parceriasSum.conservadora + bairrosDelta;
      case 'possivel': return mun.metaPossivel + parceriasSum.possivel + bairrosDelta;
      case 'arrojado': return mun.metaArrojada + parceriasSum.arrojada + bairrosDelta;
      default: return mun.metaPossivel + parceriasSum.possivel + bairrosDelta;
    }
  };

  // Abrir modal para editar parceria existente
  const editParceria = (parceria: Parceria) => {
    setSelectedParceria(parceria);
    setMunicipioParaParceria(parceria.municipio || '');
    setBairroParaParceria(parceria.bairro || '');
    setParceriaForm({
      nome: parceria.nome,
      tipo: parceria.tipo,
      responsavel: parceria.responsavel || '',
      contato: parceria.contato || '',
      observacoes: parceria.observacoes || '',
      impactoEstimado: parceria.impactoEstimado,
      metaConservadora: parceria.metaConservadora,
      metaPossivel: parceria.metaPossivel,
      metaArrojada: parceria.metaArrojada,
      ativa: parceria.ativa
    });
    setShowParceriaModal(true);
  };

  // Filter municipalities
  const getFilteredMunicipios = () => {
    if (!projecao) return [];
    return projecao.municipios.filter(mun => {
      if (isDfZona(mun.municipio)) return false; // zonas do DF ficam na lista própria
      if (isDfRegiao(mun.municipio)) return false; // regiões do DF ficam na lista própria
      if (isSpDistrito(mun.municipio)) return false; // distritos SP ficam na lista própria
      if (isRjBairro(mun.municipio)) return false; // bairros RJ ficam na lista própria
      if (isCeBairro(mun.municipio)) return false; // bairros CE ficam na lista própria
      if (isMgBairro(mun.municipio)) return false; // bairros MG ficam na lista própria
      if (isMunBairro(mun.municipio)) return false; // bairros municipais ficam na lista própria
      const matchesSearch = searchMunicipio === '' ||
        mun.municipio.toLowerCase().includes(searchMunicipio.toLowerCase());

      if (filtroTipo === 'com_dobrada') {
        return matchesSearch && mun.dobradaAtiva;
      } else if (filtroTipo === 'sem_dobrada') {
        return matchesSearch && !mun.dobradaAtiva;
      } else if (filtroTipo === 'parcerias') {
        return matchesSearch && municipioTemParcerias(mun.municipio);
      }
      return matchesSearch;
    });
  };

  // Zonas do DF filtradas para a lista lateral
  const getFilteredDfZonas = () => {
    if (!projecao || uf !== 'DF') return [];
    const zonaEntries = projecao.municipios.filter(m => isDfZona(m.municipio));
    return zonaEntries
      .sort((a, b) => getZonaNumber(a.municipio) - getZonaNumber(b.municipio))
      .filter(m => searchMunicipio === '' || `zona ${getZonaNumber(m.municipio)}`.includes(searchMunicipio.toLowerCase()));
  };

  // Regiões administrativas do DF filtradas para a lista lateral
  const getFilteredDfRegioes = () => {
    if (!projecao || uf !== 'DF' || dfVisualizacao !== 'regioes') return [];
    return projecao.municipios
      .filter(m => isDfRegiao(m.municipio))
      .filter(m => searchMunicipio === '' || getRegiaoNome(m.municipio).toLowerCase().includes(searchMunicipio.toLowerCase()))
      .sort((a, b) => getRegiaoNome(a.municipio).localeCompare(getRegiaoNome(b.municipio), 'pt-BR'));
  };

  // Distritos de SP filtrados para a lista lateral
  const getFilteredSpDistritos = () => {
    if (!projecao || uf !== 'SP' || spVisualizacao !== 'distritos') return [];
    return projecao.municipios
      .filter(m => isSpDistrito(m.municipio))
      .filter(m => searchMunicipio === '' || getDistritoNome(m.municipio).toLowerCase().includes(searchMunicipio.toLowerCase()))
      .sort((a, b) => getDistritoNome(a.municipio).localeCompare(getDistritoNome(b.municipio), 'pt-BR'));
  };

  // Bairros RJ filtrados para a lista lateral
  const getFilteredRjBairros = () => {
    if (!projecao || uf !== 'RJ' || rjVisualizacao !== 'bairros') return [];
    return projecao.municipios
      .filter(m => isRjBairro(m.municipio))
      .filter(m => searchMunicipio === '' || getRjBairroNome(m.municipio).toLowerCase().includes(searchMunicipio.toLowerCase()))
      .sort((a, b) => getRjBairroNome(a.municipio).localeCompare(getRjBairroNome(b.municipio), 'pt-BR'));
  };

  // Bairros CE filtrados para a lista lateral
  const getFilteredCeBairros = () => {
    if (!projecao || uf !== 'CE' || ceVisualizacao !== 'bairros') return [];
    return projecao.municipios
      .filter(m => isCeBairro(m.municipio))
      .filter(m => searchMunicipio === '' || getCeBairroNome(m.municipio).toLowerCase().includes(searchMunicipio.toLowerCase()))
      .sort((a, b) => getCeBairroNome(a.municipio).localeCompare(getCeBairroNome(b.municipio), 'pt-BR'));
  };

  // Bairros MG filtrados para a lista lateral
  const getFilteredMgBairros = () => {
    if (!projecao || uf !== 'MG' || mgVisualizacao !== 'bairros') return [];
    return projecao.municipios
      .filter(m => isMgBairro(m.municipio))
      .filter(m => searchMunicipio === '' || getMgBairroNome(m.municipio).toLowerCase().includes(searchMunicipio.toLowerCase()))
      .sort((a, b) => getMgBairroNome(a.municipio).localeCompare(getMgBairroNome(b.municipio), 'pt-BR'));
  };

  // Bairros de municípios genéricos filtrados para a lista lateral
  const getFilteredMunBairros = () => {
    if (!projecao || visualizacaoMapa !== 'bairro') return [];
    return projecao.municipios
      .filter(m => isMunBairro(m.municipio))
      .filter(m => searchMunicipio === '' || getMunBairroNome(m.municipio).toLowerCase().includes(searchMunicipio.toLowerCase()))
      .sort((a, b) => getMunBairroNome(a.municipio).localeCompare(getMunBairroNome(b.municipio), 'pt-BR'));
  };

  // Municípios baseados no filtro (para lista e mapa)
  // Entradas especiais (zonas DF, regiões DF, distritos SP) ficam em listas próprias
  const getMunicipiosFiltrados = () => {
    if (!projecao) return [];
    const base = projecao.municipios.filter(m =>
      !isDfZona(m.municipio) && !isDfRegiao(m.municipio) && !isSpDistrito(m.municipio) && !isRjBairro(m.municipio) && !isCeBairro(m.municipio) && !isMgBairro(m.municipio) && !isMunBairro(m.municipio)
    );
    if (filtroTipo === 'com_dobrada') return base.filter(m => m.dobradaAtiva);
    if (filtroTipo === 'sem_dobrada') return base.filter(m => !m.dobradaAtiva);
    if (filtroTipo === 'parcerias') return base.filter(m => municipioTemParcerias(m.municipio));
    return base;
  };

  // Stats calculations - agora baseado no filtro ativo
  const getTotalVotosBase = () => {
    const municipios = getMunicipiosFiltrados();
    return municipios.reduce((acc, m) => acc + m.votosBase, 0);
  };

  const getTotalVotosMeta = () => {
    if (!projecao) return 0;
    const spDistritos = projecao.municipios.filter(m => isSpDistrito(m.municipio));
    if (spDistritos.length > 0) {
      // Replacement model: SAO PAULO city base minus tracked district bases, plus district metas.
      // Untracked districts implicitly stay at their historical vote share.
      const cityBase = projecao.municipios.find(m => m.municipio === 'SAO PAULO')?.votosBase ?? 0;
      const distritosBase = spDistritos.reduce((acc, m) => acc + m.votosBase, 0);
      const distribusMeta = spDistritos.reduce((acc, m) => acc + getMetaAtiva(m), 0);
      const outrosMeta = getMunicipiosFiltrados()
        .filter(m => m.municipio !== 'SAO PAULO')
        .reduce((acc, m) => acc + getMetaAtiva(m), 0);
      return (cityBase - distritosBase) + distribusMeta + outrosMeta;
    }
    return getMunicipiosFiltrados().reduce((acc, m) => acc + getMetaAtiva(m), 0);
  };

  const getCrescimento = () => {
    const base = getTotalVotosBase();
    const meta = getTotalVotosMeta();
    if (base === 0) return meta > 0 ? '100.0' : '0.0';
    return ((meta - base) / base * 100).toFixed(1);
  };

  const getMunicipiosCount = () => {
    return getMunicipiosFiltrados().length;
  };

  const getDobradasCount = () => {
    if (!projecao) return 0;
    return projecao.municipios.filter(m => m.dobradaAtiva).length;
  };

  const getVotosComDobrada = () => {
    if (!projecao) return 0;
    return projecao.municipios
      .filter(m => m.dobradaAtiva)
      .reduce((acc, m) => acc + getMetaAtiva(m), 0);
  };

  // Memoizados para evitar que o StateMap reinicialize o mapa a cada render
  const highlightedMunicipios = useMemo(() => {
    if (!projecao) return {};
    const result: Record<string, number> = {};
    projecao.municipios.forEach(m => {
      if (isDfZona(m.municipio)) return;
      if (isDfRegiao(m.municipio)) return;
      if (isSpDistrito(m.municipio)) return;
      if (isRjBairro(m.municipio)) return;
      if (isCeBairro(m.municipio)) return;
      if (isMunBairro(m.municipio)) return;
      result[m.municipio] = activeTab === 'historico' ? m.votosBase : getMetaAtiva(m);
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projecao, activeTab, cenarioAtivo, includeParcerias, parcerias]);

  // votesData para SpDistritosMap: em projeção, substitui o valor histórico pelo meta do cenário ativo
  const spDistritosVotesDisplay = useMemo(() => {
    if (activeTab === 'historico' || !projecao) return spDistritosVotes;
    const result = { ...spDistritosVotes };
    projecao.municipios.forEach(m => {
      if (!isSpDistrito(m.municipio)) return;
      const nome = getDistritoNome(m.municipio);
      result[nome] = getMetaAtiva(m);
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spDistritosVotes, projecao, activeTab, cenarioAtivo, includeParcerias, parcerias]);

  // votesData para RjBairrosMap: em projeção, usa meta do cenário ativo
  const rjBairrosVotesDisplay = useMemo(() => {
    const normBairro = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    // Base: votos zona-agregados
    const result: Record<string, number> = { ...rjBairrosVotes };
    // Suplementa com dados diretos de bairrosInfo (vereadores/prefeitos)
    bairrosInfo.forEach((b: BairroInfo) => {
      const k = normBairro(b.bairro);
      if (!result[k]) result[k] = b.votos;
    });
    if (activeTab === 'historico' || !projecao) return result;
    // Em aba projeção, sobrepõe com meta ativa para entradas salvas
    projecao.municipios.forEach(m => {
      if (!isRjBairro(m.municipio)) return;
      const nome = getRjBairroNome(m.municipio);
      result[nome] = getMetaAtiva(m);
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rjBairrosVotes, bairrosInfo, projecao, activeTab, cenarioAtivo, includeParcerias, parcerias]);

  const dfRegioesVotesDisplay = useMemo(() => {
    const result = { ...dfRegioesVotes };
    if (activeTab === 'historico' || !projecao) return result;
    projecao.municipios.forEach(m => {
      if (!isDfRegiao(m.municipio)) return;
      const nome = getRegiaoNome(m.municipio);
      result[nome] = getMetaAtiva(m);
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dfRegioesVotes, projecao, activeTab, cenarioAtivo, includeParcerias, parcerias]);

  const ceBairrosVotesDisplay = useMemo(() => {
    const result = { ...ceBairrosVotes };
    if (activeTab === 'historico' || !projecao) return result;
    projecao.municipios.forEach(m => {
      if (!isCeBairro(m.municipio)) return;
      const nome = getCeBairroNome(m.municipio);
      result[nome] = getMetaAtiva(m);
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceBairrosVotes, projecao, activeTab, cenarioAtivo, includeParcerias, parcerias]);

  const mgBairrosVotesDisplay = useMemo(() => {
    const result = { ...mgBairrosVotes };
    if (activeTab === 'historico' || !projecao) return result;
    projecao.municipios.forEach(m => {
      if (!isMgBairro(m.municipio)) return;
      const nome = getMgBairroNome(m.municipio);
      result[nome] = getMetaAtiva(m);
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mgBairrosVotes, projecao, activeTab, cenarioAtivo, includeParcerias, parcerias]);

  // votesData para BairrosPoligonosMap genérico: API + override de projeção (via MUN_BAIRRO_)
  const genBairrosVotesDisplay = useMemo(() => {
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const result: Record<string, number> = {};
    Object.entries(genBairrosApiVotes).forEach(([k, v]) => { result[norm(k)] = v; });
    if (activeTab === 'historico' || !projecao) return result;
    projecao.municipios.forEach(m => {
      if (!isMunBairro(m.municipio)) return;
      result[getMunBairroNome(m.municipio)] = getMetaAtiva(m);
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genBairrosApiVotes, projecao, activeTab, cenarioAtivo, includeParcerias, parcerias]);

  // votesData para MunicipioMap: em projeção, sobrepõe com meta ativa para bairros municipais
  const munBairrosVotesDisplay = useMemo(() => {
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const result: Record<string, number> = {};
    bairrosInfo.forEach(b => { result[norm(b.bairro)] = b.votos; });
    if (activeTab === 'historico' || !projecao) return result;
    projecao.municipios.forEach(m => {
      if (!isMunBairro(m.municipio)) return;
      result[getMunBairroNome(m.municipio)] = getMetaAtiva(m);
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bairrosInfo, projecao, activeTab, cenarioAtivo, includeParcerias, parcerias]);

  const filteredMunicipiosSet = useMemo((): Set<string> | null => {
    if (!projecao || filtroTipo === 'todos') return null;
    const filtered = getMunicipiosFiltrados();
    return new Set(filtered.map(m => m.municipio));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projecao, filtroTipo, parcerias]);

  const calcCrescimento = (votosBase: number, meta: number): string => {
    if (votosBase === 0) return meta > 0 ? '+100%' : '0%';
    const diff = ((meta - votosBase) / votosBase * 100).toFixed(1);
    return `${parseFloat(diff) >= 0 ? '+' : ''}${diff}%`;
  };

  // Função para categorizar bairro por votos
  const getBairroCategory = (votos: number): 'acima' | 'abaixo' | 'sem' => {
    if (votos === 0) return 'sem';
    if (votos >= mediaVotosBairro) return 'acima';
    return 'abaixo';
  };

  // Handler para click em bairro
  const handleBairroClick = (bairroNome: string, votos: number) => {
    if (!projecao) return;
    const nomeNorm = bairroNome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const key = munBairroKey(nomeNorm);
    const votosBase = votos;
    const munData = projecao.municipios.find(m => m.municipio === key);
    if (munData) {
      setSelectedMunicipio({
        nome: key,
        votosBase: munData.votosBase,
        metaConservadora: munData.metaConservadora,
        metaPossivel: munData.metaPossivel,
        metaArrojada: munData.metaArrojada,
        dobradaAtiva: munData.dobradaAtiva,
        dobradaNome: munData.dobradaNome,
        dobradaPartido: munData.dobradaPartido,
        dobradaObservacoes: munData.dobradaObservacoes,
      });
      setMetaConservadoraTemp(munData.metaConservadora);
      setMetaPossivelTemp(munData.metaPossivel);
      setMetaArrojadaTemp(munData.metaArrojada);
      setPrioridadeTemp(munData.prioridade || 'MEDIA');
      setDobradaAtivaTemp(munData.dobradaAtiva || false);
      setDobradaNomeTemp(munData.dobradaNome || '');
      setDobradaPartidoTemp(munData.dobradaPartido || '');
      setDobradaObservacoesTemp(munData.dobradaObservacoes || '');
    } else {
      const nova: ProjecaoMunicipio = {
        municipio: key,
        votosBase,
        metaConservadora: votosBase,
        metaPossivel: votosBase,
        metaArrojada: votosBase,
        prioridade: 'MEDIA',
        dobradaAtiva: false,
      };
      setProjecao(prev => prev ? { ...prev, municipios: [...prev.municipios, nova] } : prev);
      setSelectedMunicipio({ nome: key, votosBase, metaConservadora: votosBase, metaPossivel: votosBase, metaArrojada: votosBase, dobradaAtiva: false });
      setMetaConservadoraTemp(votosBase);
      setMetaPossivelTemp(votosBase);
      setMetaArrojadaTemp(votosBase);
      setPrioridadeTemp('MEDIA');
      setDobradaAtivaTemp(false);
      setDobradaNomeTemp('');
      setDobradaPartidoTemp('');
      setDobradaObservacoesTemp('');
    }
    setShowModal(true);
  };

  // Carregar zonas do DF a partir dos dados de electoralData
  const carregarDfZonas = async (eData?: ElectoralData | null, anoParam?: string) => {
    const ed = eData ?? electoralData;
    if (!ed) return;
    const anoUso = anoParam ?? ano;
    const cidId = ed.candidatoId;
    const nomeUrna = ed.nomeUrna || ed.candidateName || (ed as any).nome || '';
    if (!cidId && !nomeUrna) return;

    const fetchZonas = async (q: string) => {
      const r = await fetch(`/api/tse/zonas?municipio=BRAS%C3%8DLIA&uf=DF&ano=${anoUso}&${q}`);
      if (!r.ok) return null;
      const d = await r.json();
      return d?.locaisPorZona?.length > 0 ? d : null;
    };

    setLoadingDfZonas(true);
    try {
      // Tentar por candidatoId primeiro; fallback por nome se falhar
      let data = cidId ? await fetchZonas(`candidatoId=${encodeURIComponent(cidId)}`) : null;
      if (!data && nomeUrna) {
        data = await fetchZonas(`nome=${encodeURIComponent(nomeUrna)}`);
      }
      if (data) {
        setDfZonas(data.locaisPorZona);
        setDfBounds(data.bounds ?? null);
        // Popular projeção com as zonas ao carregar (substitui entrada genérica de Brasília)
        setProjecao(prev => {
          if (!prev) return prev;
          const jaTemZonas = prev.municipios.some((m: any) => m.municipio?.startsWith('DF_ZONA_'));
          if (jaTemZonas) return prev;
          const zonasMunicipios = data.locaisPorZona.map((z: any) => ({
            municipio: `DF_ZONA_${String(z.zona).padStart(2, '0')}`,
            votosBase: z.votos,
            metaConservadora: z.votos,
            metaPossivel: z.votos,
            metaArrojada: z.votos,
            prioridade: 'MEDIA',
            dobradaAtiva: false,
          }));
          const semBrasilia = prev.municipios.filter(
            (m: any) => !m.municipio?.startsWith('DF_ZONA_') && m.municipio !== 'BRASÍLIA'
          );
          return { ...prev, municipios: [...semBrasilia, ...zonasMunicipios] };
        });
      }
    } finally {
      setLoadingDfZonas(false);
    }
  };

  // Auto-carregar zonas do DF quando electoralData mudar para candidato do DF
  // (useEffect fica DEPOIS de carregarDfZonas para evitar forward reference)
  useEffect(() => {
    if (uf !== 'DF' || !electoralData || loadingDfZonas) return;
    const key = electoralData.candidatoId ?? electoralData.nomeUrna ?? electoralData.candidateName ?? '';
    if (!key || dfZonasCandidatoRef.current === key) return;
    dfZonasCandidatoRef.current = key;
    carregarDfZonas(electoralData, ano);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uf, electoralData]);

  // Handler para click em zona do DF
  const handleDfZonaClick = (zona: import('@/components/maps/zona-pins-map').ZonaPinData) => {
    if (!projecao) return;
    setSelectedDfZona(zona.zona);
    const key = dfZonaMunicipioKey(zona.zona);
    const munData = projecao.municipios.find(m => m.municipio === key);
    if (munData) {
      setSelectedMunicipio({
        nome: key,
        votosBase: munData.votosBase,
        metaConservadora: munData.metaConservadora,
        metaPossivel: munData.metaPossivel,
        metaArrojada: munData.metaArrojada,
        dobradaAtiva: munData.dobradaAtiva,
        dobradaNome: munData.dobradaNome,
        dobradaPartido: munData.dobradaPartido,
        dobradaObservacoes: munData.dobradaObservacoes,
      });
      setMetaConservadoraTemp(munData.metaConservadora);
      setMetaPossivelTemp(munData.metaPossivel);
      setMetaArrojadaTemp(munData.metaArrojada);
      setPrioridadeTemp(munData.prioridade || 'MEDIA');
      setDobradaAtivaTemp(munData.dobradaAtiva || false);
      setDobradaNomeTemp(munData.dobradaNome || '');
      setDobradaPartidoTemp(munData.dobradaPartido || '');
      setDobradaObservacoesTemp(munData.dobradaObservacoes || '');
    } else {
      // Zona sem projeção ainda — criar
      const nova: ProjecaoMunicipio = {
        municipio: key,
        votosBase: zona.votos,
        metaConservadora: zona.votos,
        metaPossivel: zona.votos,
        metaArrojada: zona.votos,
        prioridade: 'MEDIA',
        dobradaAtiva: false,
      };
      setProjecao(prev => prev ? { ...prev, municipios: [...prev.municipios, nova] } : prev);
      setSelectedMunicipio({ nome: key, votosBase: zona.votos, metaConservadora: zona.votos, metaPossivel: zona.votos, metaArrojada: zona.votos, dobradaAtiva: false });
      setMetaConservadoraTemp(zona.votos);
      setMetaPossivelTemp(zona.votos);
      setMetaArrojadaTemp(zona.votos);
      setPrioridadeTemp('MEDIA');
      setDobradaAtivaTemp(false);
      setDobradaNomeTemp('');
      setDobradaPartidoTemp('');
      setDobradaObservacoesTemp('');
    }
    setShowModal(true);
  };

  // Handler para click em região administrativa do DF
  const handleDfRegiaoClick = (nome: string) => {
    setSelectedDfRegiao(prev => prev === nome ? null : nome);
    if (!projecao) return;
    const key = dfRegiaoKey(nome);
    const votosBase = dfRegioesVotes[nome] ?? 0;
    const munData = projecao.municipios.find(m => m.municipio === key);
    if (munData) {
      setSelectedMunicipio({
        nome: key,
        votosBase: munData.votosBase,
        metaConservadora: munData.metaConservadora,
        metaPossivel: munData.metaPossivel,
        metaArrojada: munData.metaArrojada,
        dobradaAtiva: munData.dobradaAtiva,
        dobradaNome: munData.dobradaNome,
        dobradaPartido: munData.dobradaPartido,
        dobradaObservacoes: munData.dobradaObservacoes,
      });
      setMetaConservadoraTemp(munData.metaConservadora);
      setMetaPossivelTemp(munData.metaPossivel);
      setMetaArrojadaTemp(munData.metaArrojada);
      setPrioridadeTemp(munData.prioridade || 'MEDIA');
      setDobradaAtivaTemp(munData.dobradaAtiva || false);
      setDobradaNomeTemp(munData.dobradaNome || '');
      setDobradaPartidoTemp(munData.dobradaPartido || '');
      setDobradaObservacoesTemp(munData.dobradaObservacoes || '');
    } else {
      const nova: ProjecaoMunicipio = {
        municipio: key,
        votosBase,
        metaConservadora: votosBase,
        metaPossivel: votosBase,
        metaArrojada: votosBase,
        prioridade: 'MEDIA',
        dobradaAtiva: false,
      };
      setProjecao(prev => prev ? { ...prev, municipios: [...prev.municipios, nova] } : prev);
      setSelectedMunicipio({ nome: key, votosBase, metaConservadora: votosBase, metaPossivel: votosBase, metaArrojada: votosBase, dobradaAtiva: false });
      setMetaConservadoraTemp(votosBase);
      setMetaPossivelTemp(votosBase);
      setMetaArrojadaTemp(votosBase);
      setPrioridadeTemp('MEDIA');
      setDobradaAtivaTemp(false);
      setDobradaNomeTemp('');
      setDobradaPartidoTemp('');
      setDobradaObservacoesTemp('');
    }
    setShowModal(true);
  };

  // Handler para click em distrito municipal de SP
  const handleSpDistritoClick = (nome: string) => {
    setSelectedSpDistrito(prev => prev === nome ? null : nome);
    if (!projecao) return;
    const key = spDistritoKey(nome);
    const votosBase = spDistritosVotes[nome] ?? 0;
    const munData = projecao.municipios.find(m => m.municipio === key);
    if (munData) {
      setSelectedMunicipio({
        nome: key,
        votosBase: munData.votosBase,
        metaConservadora: munData.metaConservadora,
        metaPossivel: munData.metaPossivel,
        metaArrojada: munData.metaArrojada,
        dobradaAtiva: munData.dobradaAtiva,
        dobradaNome: munData.dobradaNome,
        dobradaPartido: munData.dobradaPartido,
        dobradaObservacoes: munData.dobradaObservacoes,
      });
      setMetaConservadoraTemp(munData.metaConservadora);
      setMetaPossivelTemp(munData.metaPossivel);
      setMetaArrojadaTemp(munData.metaArrojada);
      setPrioridadeTemp(munData.prioridade || 'MEDIA');
      setDobradaAtivaTemp(munData.dobradaAtiva || false);
      setDobradaNomeTemp(munData.dobradaNome || '');
      setDobradaPartidoTemp(munData.dobradaPartido || '');
      setDobradaObservacoesTemp(munData.dobradaObservacoes || '');
    } else {
      const nova: ProjecaoMunicipio = {
        municipio: key,
        votosBase,
        metaConservadora: votosBase,
        metaPossivel: votosBase,
        metaArrojada: votosBase,
        prioridade: 'MEDIA',
        dobradaAtiva: false,
      };
      setProjecao(prev => prev ? { ...prev, municipios: [...prev.municipios, nova] } : prev);
      setSelectedMunicipio({ nome: key, votosBase, metaConservadora: votosBase, metaPossivel: votosBase, metaArrojada: votosBase, dobradaAtiva: false });
      setMetaConservadoraTemp(votosBase);
      setMetaPossivelTemp(votosBase);
      setMetaArrojadaTemp(votosBase);
      setPrioridadeTemp('MEDIA');
      setDobradaAtivaTemp(false);
      setDobradaNomeTemp('');
      setDobradaPartidoTemp('');
      setDobradaObservacoesTemp('');
    }
    setShowModal(true);
  };

  // Handler para click em bairro do Rio de Janeiro
  const handleRjBairroClick = (nome: string) => {
    const nomeNorm = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    setSelectedRjBairro(prev => prev === nomeNorm ? null : nomeNorm);
    if (!projecao) return;
    const key = rjBairroKey(nomeNorm);
    const normB = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const votosBase =
      rjBairrosVotes[nomeNorm] ??
      bairrosInfo.find((b: BairroInfo) => normB(b.bairro) === nomeNorm)?.votos ??
      0;
    const munData = projecao.municipios.find(m => m.municipio === key);
    if (munData) {
      setSelectedMunicipio({
        nome: key,
        votosBase: munData.votosBase,
        metaConservadora: munData.metaConservadora,
        metaPossivel: munData.metaPossivel,
        metaArrojada: munData.metaArrojada,
        dobradaAtiva: munData.dobradaAtiva,
        dobradaNome: munData.dobradaNome,
        dobradaPartido: munData.dobradaPartido,
        dobradaObservacoes: munData.dobradaObservacoes,
      });
      setMetaConservadoraTemp(munData.metaConservadora);
      setMetaPossivelTemp(munData.metaPossivel);
      setMetaArrojadaTemp(munData.metaArrojada);
      setPrioridadeTemp(munData.prioridade || 'MEDIA');
      setDobradaAtivaTemp(munData.dobradaAtiva || false);
      setDobradaNomeTemp(munData.dobradaNome || '');
      setDobradaPartidoTemp(munData.dobradaPartido || '');
      setDobradaObservacoesTemp(munData.dobradaObservacoes || '');
    } else {
      const nova: ProjecaoMunicipio = {
        municipio: key,
        votosBase,
        metaConservadora: votosBase,
        metaPossivel: votosBase,
        metaArrojada: votosBase,
        prioridade: 'MEDIA',
        dobradaAtiva: false,
      };
      setProjecao(prev => prev ? { ...prev, municipios: [...prev.municipios, nova] } : prev);
      setSelectedMunicipio({ nome: key, votosBase, metaConservadora: votosBase, metaPossivel: votosBase, metaArrojada: votosBase, dobradaAtiva: false });
      setMetaConservadoraTemp(votosBase);
      setMetaPossivelTemp(votosBase);
      setMetaArrojadaTemp(votosBase);
      setPrioridadeTemp('MEDIA');
      setDobradaAtivaTemp(false);
      setDobradaNomeTemp('');
      setDobradaPartidoTemp('');
      setDobradaObservacoesTemp('');
    }
    setShowModal(true);
  };

  // Handler para click em bairro de Fortaleza (CE)
  const handleCeBairroClick = (nome: string) => {
    const nomeNorm = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    setSelectedCeBairro(prev => prev === nomeNorm ? null : nomeNorm);
    if (!projecao) return;
    const key = ceBairroKey(nomeNorm);
    const votosBase = ceBairrosVotes[nomeNorm] ?? 0;
    const munData = projecao.municipios.find(m => m.municipio === key);
    if (munData) {
      setSelectedMunicipio({
        nome: key,
        votosBase: munData.votosBase,
        metaConservadora: munData.metaConservadora,
        metaPossivel: munData.metaPossivel,
        metaArrojada: munData.metaArrojada,
        dobradaAtiva: munData.dobradaAtiva,
        dobradaNome: munData.dobradaNome,
        dobradaPartido: munData.dobradaPartido,
        dobradaObservacoes: munData.dobradaObservacoes,
      });
      setMetaConservadoraTemp(munData.metaConservadora);
      setMetaPossivelTemp(munData.metaPossivel);
      setMetaArrojadaTemp(munData.metaArrojada);
      setPrioridadeTemp(munData.prioridade || 'MEDIA');
      setDobradaAtivaTemp(munData.dobradaAtiva || false);
      setDobradaNomeTemp(munData.dobradaNome || '');
      setDobradaPartidoTemp(munData.dobradaPartido || '');
      setDobradaObservacoesTemp(munData.dobradaObservacoes || '');
    } else {
      const nova: ProjecaoMunicipio = {
        municipio: key,
        votosBase,
        metaConservadora: votosBase,
        metaPossivel: votosBase,
        metaArrojada: votosBase,
        prioridade: 'MEDIA',
        dobradaAtiva: false,
      };
      setProjecao(prev => prev ? { ...prev, municipios: [...prev.municipios, nova] } : prev);
      setSelectedMunicipio({ nome: key, votosBase, metaConservadora: votosBase, metaPossivel: votosBase, metaArrojada: votosBase, dobradaAtiva: false });
      setMetaConservadoraTemp(votosBase);
      setMetaPossivelTemp(votosBase);
      setMetaArrojadaTemp(votosBase);
      setPrioridadeTemp('MEDIA');
      setDobradaAtivaTemp(false);
      setDobradaNomeTemp('');
      setDobradaPartidoTemp('');
      setDobradaObservacoesTemp('');
    }
    setShowModal(true);
  };

  // Zonas do DF com dados de projeção sobrepostos para exibição no mapa
  const dfZonasDisplay = useMemo(() => {
    if (!dfZonas.length || !projecao) return dfZonas;
    return dfZonas.map(z => {
      const key = dfZonaMunicipioKey(z.zona);
      const munData = projecao.municipios.find(m => m.municipio === key);
      if (!munData || activeTab === 'historico') return z;
      const meta =
        cenarioAtivo === 'conservador' ? munData.metaConservadora :
        cenarioAtivo === 'arrojado' ? munData.metaArrojada :
        munData.metaPossivel;
      return { ...z, votos: meta };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dfZonas, projecao, activeTab, cenarioAtivo]);

  const filteredBairros = useMemo(() => {
    if (!bairrosInfo || bairrosInfo.length === 0) return [];
    if (searchMunicipio === '') return bairrosInfo;
    const q = searchMunicipio.toLowerCase();
    return bairrosInfo.filter(b =>
      b.bairro.toLowerCase().includes(q) || b.municipio.toLowerCase().includes(q)
    );
  }, [bairrosInfo, searchMunicipio]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg-card)]">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--brand-cobalt)]" />
      </div>
    );
  }

  if (!canAccess) {
    return null;
  }

  const anosOptions = [
    { value: '2024', label: '2024' },
    { value: '2022', label: '2022' },
    { value: '2020', label: '2020' },
    { value: '2018', label: '2018' }
  ];

  const anosProjecaoOptions = [
    { value: '2026', label: '2026' },
    { value: '2028', label: '2028' },
    { value: '2030', label: '2030' }
  ];

  const estadosOptions = ESTADOS_BRASIL.map(e => ({ value: e.sigla, label: e.nome }));

  const prioridadeOptions = [
    { value: 'ALTA', label: 'Alta Prioridade' },
    { value: 'MEDIA', label: 'Média Prioridade' },
    { value: 'BAIXA', label: 'Baixa Prioridade' }
  ];

  const cenarioConfig = {
    conservador: { label: 'Conservador', icon: Shield, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500', border: 'border-amber-500', hex: '#F59E0B', bgInactive: 'bg-amber-50 dark:bg-amber-500/20 border-amber-400/60', textInactive: 'text-amber-700 dark:text-amber-300' },
    possivel:    { label: 'Realista',    icon: Gauge,  color: 'text-cyan-600 dark:text-cyan-300',   bg: 'bg-cyan-500',    border: 'border-cyan-500',    hex: '#22D3EE', bgInactive: 'bg-cyan-50 dark:bg-cyan-500/20 border-cyan-400/60',    textInactive: 'text-cyan-700 dark:text-cyan-300'   },
    arrojado:    { label: 'Otimista',   icon: Rocket, color: 'text-[color:var(--success)]',         bg: 'bg-emerald-500', border: 'border-emerald-500', hex: '#10B981', bgInactive: 'bg-emerald-50 dark:bg-emerald-500/20 border-emerald-400/60', textInactive: 'text-emerald-700 dark:text-emerald-300' }
  };

  return (
    <div className="flex flex-col gap-2">
      {!(electoralData && projecao) && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-shrink-0"
        >
          <PageHeader
            icon={Target}
            title="Projeto de Campanha"
            subtitle="Planeje e projete seus votos para as próximas eleições"
          />
        </motion.div>
      )}

      {/* Search Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex-shrink-0"
      >
        <Card style={{ background: 'var(--bg-card)', border: '1px solid rgba(37,99,235,0.2)', backdropFilter: 'blur(8px)' }}>
          <CardContent className="px-4 py-0.5">

            {/* Modo colapsado: resumo + botão editar */}
            {formCollapsed && electoralData ? (
              <div className="flex items-center gap-4 flex-wrap">
                <Search className="h-4 w-4 flex-shrink-0" style={{ color: '#2563EB' }} />
                <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
                  <span className="text-[color:var(--text-primary)] font-semibold truncate">{candidateName || electoralData.nome}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(37,99,235,0.12)', color: 'var(--brand-cobalt-text)', border: '1px solid rgba(37,99,235,0.25)' }}>
                    {ESTADOS_BRASIL.find(e => e.sigla === uf)?.nome ?? uf}
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">{ano} → {anoProjecao}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    onClick={voltarParaPesquisa}
                    variant="outline"
                    className="border-[var(--border-default)] text-slate-700 dark:text-slate-300 hover:bg-[var(--bg-card-subtle)] text-xs h-6 px-2.5"
                  >
                    <ArrowLeft className="h-3 w-3 mr-1.5" />
                    Voltar
                  </Button>
                  <Button
                    onClick={() => setFormCollapsed(false)}
                    variant="outline"
                    className="border-[var(--border-default)] text-slate-700 dark:text-slate-300 hover:bg-[var(--bg-card-subtle)] text-xs h-6 px-2.5"
                  >
                    <Pencil className="h-3 w-3 mr-1.5" />
                    Editar busca
                  </Button>
                  <Button
                    onClick={() => setShowNovoCandidatoModal(true)}
                    variant="outline"
                    style={{ background: 'var(--brand-cobalt-soft)', borderColor: 'var(--brand-cobalt)', color: 'var(--brand-cobalt-text)' }}
                    className="whitespace-nowrap text-xs h-6 px-2.5 hover:brightness-110"
                  >
                    <Plus className="h-3 w-3 mr-1.5" />
                    Novo Candidato
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Cabeçalho do card */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4" style={{ color: '#2563EB' }} />
                    <span className="text-sm font-semibold tracking-wide" style={{ color: '#2563EB' }}>
                      Buscar Candidato
                    </span>
                  </div>
                  <Button
                    onClick={() => setShowNovoCandidatoModal(true)}
                    variant="outline"
                    style={{ background: 'var(--brand-cobalt-soft)', borderColor: 'var(--brand-cobalt)', color: 'var(--brand-cobalt-text)' }}
                    className="whitespace-nowrap text-sm h-8 px-3 hover:brightness-110"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Novo Candidato
                  </Button>
                </div>

                {/* Bloco 1 — identificação do candidato */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: '#6b82a0' }}>
                      NOME DO CANDIDATO
                    </label>
                    <Input
                      placeholder="Ex: João Silva, Tarcísio, Lula…"
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchCandidate()}
                      className="bg-[var(--bg-card-subtle)]/60 border-[var(--border-default)] text-[color:var(--text-primary)] placeholder:text-slate-600 dark:text-slate-500"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: '#6b82a0' }}>
                        ANO DA ELEIÇÃO
                      </label>
                      <Select
                        value={ano}
                        onChange={(e) => setAno(e.target.value)}
                        options={anosOptions}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: '#6b82a0' }}>
                        ESTADO
                      </label>
                      <Select
                        value={uf}
                        onChange={(e) => setUf(e.target.value)}
                        options={estadosOptions}
                      />
                    </div>
                  </div>
                </div>

                {/* Divisor — Projeção */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: 'var(--tint-06)' }} />
                  <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: '#6b82a0' }}>
                    Projeção
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'var(--tint-06)' }} />
                </div>

                {/* Bloco 2 — configuração de projeção + botão buscar */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: '#6b82a0' }}>
                      ANO ALVO DA PROJEÇÃO
                    </label>
                    <Select
                      value={anoProjecao}
                      onChange={(e) => setAnoProjecao(e.target.value)}
                      options={anosProjecaoOptions}
                    />
                  </div>
                  <Button
                    onClick={() => searchCandidate()}
                    loading={loading}
                    className="w-full font-semibold"
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Buscar Candidato
                  </Button>
                </div>
              </div>
            )}

          </CardContent>
        </Card>
      </motion.div>

      {electoralData && projecao && (
        <>
          {/* Compact top bar: candidate info + tabs + save */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <div
              className="flex items-center gap-4 px-4 py-1.5 rounded-2xl flex-wrap"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-06)' }}
            >
              {/* Nome + cargo */}
              {(() => {
                const nomeCandidato = projecao.candidatoNome || electoralData.nomeUrna || electoralData.candidateName || '';
                const cargo = projecao.cargo || electoralData.cargo || '';
                return (
                  <div className="flex-1 min-w-0">
                    <p className="text-[color:var(--text-primary)] font-bold text-xl truncate leading-tight">{nomeCandidato}</p>
                    {cargo && <p className="text-sm mt-0.5 truncate" style={{ color: '#6b82a0' }}>{cargo}</p>}
                  </div>
                );
              })()}

              <div className="hidden sm:block w-px h-10 self-center" style={{ background: 'var(--tint-08)' }} />
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: '#6b82a0' }}>Estado</span>
                <span className="text-base font-bold text-[color:var(--text-primary)]">
                  {ESTADOS_BRASIL.find(e => e.sigla === projecao.uf)?.nome ?? projecao.uf}
                </span>
              </div>
              <div className="hidden sm:block w-px h-10 self-center" style={{ background: 'var(--tint-08)' }} />
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: '#6b82a0' }}>Eleição</span>
                <span className="text-base font-bold" style={{ color: 'var(--acento-azul)' }}>{projecao.anoBase}</span>
              </div>
              <div className="hidden sm:block w-px h-10 self-center" style={{ background: 'var(--tint-08)' }} />
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: '#6b82a0' }}>Projeção</span>
                <span className="text-base font-bold" style={{ color: '#2563EB' }}>{projecao.anoProjecao}</span>
              </div>

              <div className="hidden sm:block w-px h-10 self-center" style={{ background: 'var(--tint-08)' }} />

              {/* Tabs inline */}
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-06)' }}>
                {electoralData?.candidatoId && (
                  <button
                    onClick={() => setActiveTab('historico')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                      activeTab === 'historico'
                        ? 'bg-cyan-500 text-white shadow'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <BarChart3 className="h-4 w-4" />
                    Dados {ano}
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('projecao')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                    activeTab === 'projecao'
                      ? `${cenarioConfig[cenarioAtivo].bg} text-white shadow`
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Target className="h-4 w-4" />
                  Projeção {anoProjecao}
                </button>
              </div>

              {/* Save button */}
              <Button
                onClick={saveProjecao}
                loading={saving}
                className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600"
              >
                <Save className="h-4 w-4 mr-2" />
                Salvar Projeção
              </Button>
            </div>
          </motion.div>

          {/* Main 12-column grid */}
          <div className={mapFullscreen
            ? 'fixed inset-0 z-[2000] bg-[var(--bg-card)] flex'
            : 'grid grid-cols-12 gap-4 items-start'
          }>
            {/* LEFT SIDEBAR — scenario + stats + municipality list */}
            {!mapFullscreen && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
                className="hidden md:flex md:col-span-4 lg:col-span-3 md:order-1 flex-col"
                style={{ height: 'calc(100vh - 160px)', minHeight: '340px' }}
              >
                {/* Scenario selector */}
                <Card className="flex-1 flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-06)' }}>
                  <CardContent className="p-4 flex flex-col h-full justify-between">
                    <p className="text-xs 2xl:text-sm font-semibold tracking-widest uppercase" style={{ color: '#6b82a0' }}>
                      Cenário de Projeção
                    </p>

                    {(['conservador', 'possivel', 'arrojado'] as CenarioType[]).map((cenario) => {
                      const config = cenarioConfig[cenario];
                      const Icon = config.icon;
                      const isActive = cenarioAtivo === cenario;
                      const desc: Record<CenarioType, string> = {
                        conservador: 'Meta alcançável e segura',
                        possivel: 'Crescimento equilibrado',
                        arrojado: 'Meta ambiciosa de expansão',
                      };
                      return (
                        <button
                          key={cenario}
                          onClick={() => setCenarioAtivo(cenario)}
                          className={`flex items-center gap-2.5 px-2 py-1.5 2xl:px-3 2xl:py-2.5 rounded-lg transition-all w-full text-left border ${
                            isActive
                              ? `${config.bg} text-white shadow-md border-transparent`
                              : `${config.bgInactive} ${config.textInactive} hover:opacity-90`
                          }`}
                        >
                          <div className={`p-1 rounded-md flex-shrink-0 ${isActive ? 'bg-white/20' : 'bg-[var(--bg-card-subtle)]'}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-xs 2xl:text-sm leading-tight">{config.label}</p>
                            <p className={`text-xs leading-tight mt-0.5 ${isActive ? 'opacity-80' : 'text-[color:var(--text-tertiary)]'}`}>
                              {desc[cenario]}
                            </p>
                          </div>
                          {isActive && <div className="w-1.5 h-1.5 rounded-full bg-white/80 flex-shrink-0" />}
                        </button>
                      );
                    })}

                    <div className="pt-3 border-t border-[var(--border-default)]">
                      <p className="text-[10px] font-semibold tracking-widest uppercase mb-0.5" style={{ color: '#6b82a0' }}>
                        Meta Total · {anoProjecao}
                      </p>
                      <p className={`text-base 2xl:text-lg font-bold ${cenarioConfig[cenarioAtivo].color}`}>
                        {getTotalVotosMeta().toLocaleString()}
                      </p>
                      {getTotalVotosBase() > 0 && (
                        <p className="text-[11px] mt-0.5 flex items-center gap-1.5" style={{ color: '#6b82a0' }}>
                          <span>Base {ano}: {getTotalVotosBase().toLocaleString()}</span>
                          <span>·</span>
                          <span className={parseFloat(getCrescimento() as string) >= 0 ? 'text-[color:var(--success)]' : 'text-red-400'}>
                            {parseFloat(getCrescimento() as string) >= 0 ? '+' : ''}{getCrescimento()}%
                          </span>
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

              </motion.div>
            )}

            {/* RIGHT SIDEBAR — municipality list */}
            {!mapFullscreen && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="hidden lg:flex lg:col-span-3 lg:order-3 flex-col"
                style={{ height: 'calc(100vh - 160px)', minHeight: '340px' }}
              >
                {/* Municipality List */}
                <Card className="bg-[var(--bg-card-subtle)]/50 border-[var(--border-default)] flex flex-col h-full">
                  <CardHeader className="border-b border-[var(--border-default)] py-3">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-[color:var(--text-primary)] text-sm flex items-center gap-2">
                        {visualizacaoMapa === 'bairro' && ['VEREADOR', 'PREFEITO'].some(c => (electoralData?.cargo ?? '').toUpperCase().includes(c)) ? (
                          <>
                            <Home className="h-4 w-4 text-[color:var(--success)]" />
                            {(electoralData?.cargo ?? '').toUpperCase().includes('PREFEITO')
                              ? 'Município'
                              : uf === 'SP' && normMunKey(municipioVereador) === 'SAO PAULO'
                                ? 'Distritos'
                                : 'Bairros'}
                          </>
                        ) : uf === 'DF' && getFilteredDfZonas().length > 0 ? (
                          <>
                            <Vote className="h-4 w-4 text-sky-400" />
                            Zonas Eleitorais
                          </>
                        ) : (
                          <>
                            <MapPin className="h-4 w-4 text-[color:var(--brand-cobalt)]" />
                            Municípios
                          </>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="info" className="text-xs">
                          {visualizacaoMapa === 'bairro' && ['VEREADOR', 'PREFEITO'].some(c => (electoralData?.cargo ?? '').toUpperCase().includes(c))
                            ? (uf === 'SP' && normMunKey(municipioVereador) === 'SAO PAULO' && Object.keys(spDistritosVotesDisplay).length > 0
                              ? Object.keys(spDistritosVotesDisplay).length
                              : filteredBairros.length)
                            : uf === 'DF' && getFilteredDfZonas().length > 0
                              ? getFilteredDfZonas().length
                              : getFilteredMunicipios().length}
                        </Badge>
                        {visualizacaoMapa !== 'bairro' && !(uf === 'DF' && getFilteredDfZonas().length > 0) && (
                          <button
                            onClick={openAddModal}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
                            title="Adicionar município"
                          >
                            <Plus className="h-4 w-4 text-[color:var(--text-primary)]" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600 dark:text-slate-400" />
                        <input
                          type="text"
                          placeholder={visualizacaoMapa === 'bairro' && ['VEREADOR', 'PREFEITO'].some(c => (electoralData?.cargo ?? '').toUpperCase().includes(c))
                            ? "Pesquisar bairro..."
                            : "Pesquisar município..."}
                          value={searchMunicipio}
                          onChange={(e) => {
                            setSearchMunicipio(e.target.value);
                            if (e.target.value && municipiosDisponiveis.length === 0) loadMunicipiosDisponiveis();
                          }}
                          className="w-full bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded-lg pl-9 pr-3 py-2 text-sm text-[color:var(--text-primary)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                        />
                      </div>
                      {/* Filtros - só mostrar para view de municípios */}
                      {!(visualizacaoMapa === 'bairro' && ['VEREADOR', 'PREFEITO'].some(c => (electoralData?.cargo ?? '').toUpperCase().includes(c))) && (
                      <div className="flex gap-1 flex-wrap">
                        <button
                          onClick={() => setFiltroTipo('todos')}
                          className={`flex-1 min-w-[60px] px-2 py-1.5 text-xs rounded-lg transition-colors ${
                            filtroTipo === 'todos'
                              ? 'bg-slate-600 text-white'
                              : 'bg-[var(--bg-card-subtle)]/50 text-slate-600 dark:text-slate-400 hover:bg-slate-600 hover:text-white'
                          }`}
                        >
                          Todos
                        </button>
                        <button
                          onClick={() => setFiltroTipo('com_dobrada')}
                          className={`flex-1 min-w-[70px] px-2 py-1.5 text-xs rounded-lg transition-colors flex items-center justify-center gap-1 ${
                            filtroTipo === 'com_dobrada'
                              ? 'bg-blue-600 text-white'
                              : 'bg-[var(--bg-card-subtle)]/50 text-slate-600 dark:text-slate-400 hover:bg-blue-600 hover:text-white'
                          }`}
                        >
                          <Handshake className="h-3 w-3" />
                          Dobrada
                        </button>
                        <button
                          onClick={() => setFiltroTipo('sem_dobrada')}
                          className={`flex-1 min-w-[80px] px-2 py-1.5 text-xs rounded-lg transition-colors ${
                            filtroTipo === 'sem_dobrada'
                              ? 'bg-slate-500 text-white'
                              : 'bg-[var(--bg-card-subtle)]/50 text-slate-600 dark:text-slate-400 hover:bg-slate-500 hover:text-white'
                          }`}
                        >
                          Sem Dobrada
                        </button>
                        <button
                          onClick={() => setFiltroTipo('parcerias')}
                          className={`flex-1 min-w-[80px] px-2 py-1.5 text-xs rounded-lg transition-colors flex items-center justify-center gap-1 ${
                            filtroTipo === 'parcerias'
                              ? 'bg-amber-600 text-white'
                              : 'bg-[var(--bg-card-subtle)]/50 text-slate-600 dark:text-slate-400 hover:bg-amber-600 hover:text-white'
                          }`}
                        >
                          <Users className="h-3 w-3" />
                          Parcerias
                        </button>
                      </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 overflow-y-auto">
                    {/* Lista municipality content — duplicated from old section below (which will be hidden) */}
                    {visualizacaoMapa === 'bairro' && ['VEREADOR', 'PREFEITO'].some(c => (electoralData?.cargo ?? '').toUpperCase().includes(c)) ? (
                      <div className="divide-y divide-[var(--border-default)]">
                        {uf === 'SP' && normMunKey(municipioVereador) === 'SAO PAULO' && Object.keys(spDistritosVotesDisplay).length > 0 ? (
                          // SP capital — lista de distritos municipais
                          (() => {
                            const allVotes = Object.values(spDistritosVotesDisplay);
                            const media = allVotes.length > 0 ? allVotes.reduce((s, v) => s + v, 0) / allVotes.length : 0;
                            const entries = Object.entries(spDistritosVotesDisplay)
                              .filter(([nome]) => !searchMunicipio || nome.toLowerCase().includes(searchMunicipio.toLowerCase()))
                              .sort(([, a], [, b]) => b - a);
                            if (entries.length === 0) return (
                              <div className="p-4 text-center text-slate-600 dark:text-slate-400 text-sm">Nenhum distrito encontrado</div>
                            );
                            return entries.map(([distrito, votos], idx) => {
                              const percentTotal = electoralData?.totalVotos
                                ? ((votos / electoralData.totalVotos) * 100).toFixed(1)
                                : '0';
                              const category = votos > media ? 'acima' : votos > 0 ? 'abaixo' : 'zero';
                              return (
                                <div
                                  key={idx}
                                  className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors ${
                                    category === 'acima' ? 'bg-emerald-900/10 border-l-2 border-emerald-500' :
                                    category === 'abaixo' ? 'bg-blue-900/10 border-l-2 border-blue-500' :
                                    'border-l-2 border-[var(--border-default)]'
                                  }`}
                                  onClick={() => handleSpDistritoClick(distrito)}
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <span className={`text-xs px-1 py-0.5 rounded ${
                                        category === 'acima' ? 'bg-emerald-600' :
                                        category === 'abaixo' ? 'bg-blue-600' : 'bg-slate-600'
                                      }`}>
                                        {category === 'acima' ? '🟢' : category === 'abaixo' ? '🔵' : '⚫'}
                                      </span>
                                      <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">{distrito}</span>
                                    </div>
                                    <Badge variant={category === 'acima' ? 'success' : category === 'abaixo' ? 'info' : 'default'} className="text-xs">
                                      {percentTotal}%
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className={`font-medium ${
                                      category === 'acima' ? 'text-[color:var(--success)]' :
                                      category === 'abaixo' ? 'text-blue-400' : 'text-slate-600 dark:text-slate-400'
                                    }`}>
                                      {votos.toLocaleString()} votos
                                    </span>
                                  </div>
                                </div>
                              );
                            });
                          })()
                        ) : (
                          <>
                            {filteredBairros
                              .sort((a, b) => b.votos - a.votos)
                              .map((bairro, idx) => {
                                const category = getBairroCategory(bairro.votos);
                                const percentTotal = electoralData?.totalVotos
                                  ? ((bairro.votos / electoralData.totalVotos) * 100).toFixed(1)
                                  : '0';
                                return (
                                  <div
                                    key={idx}
                                    className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors ${
                                      category === 'acima' ? 'bg-emerald-900/10 border-l-2 border-emerald-500' :
                                      category === 'abaixo' ? 'bg-blue-900/10 border-l-2 border-blue-500' :
                                      'border-l-2 border-[var(--border-default)]'
                                    }`}
                                    onClick={() => handleBairroClick(bairro.bairro, bairro.votos)}
                                  >
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span className={`text-xs px-1 py-0.5 rounded ${
                                          category === 'acima' ? 'bg-emerald-600' :
                                          category === 'abaixo' ? 'bg-blue-600' : 'bg-slate-600'
                                        }`}>
                                          {category === 'acima' ? '🟢' : category === 'abaixo' ? '🔵' : '⚫'}
                                        </span>
                                        <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">
                                          {bairro.bairro}
                                        </span>
                                      </div>
                                      <Badge variant={category === 'acima' ? 'success' : category === 'abaixo' ? 'info' : 'default'} className="text-xs">
                                        {percentTotal}%
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className={`font-medium ${
                                        category === 'acima' ? 'text-[color:var(--success)]' :
                                        category === 'abaixo' ? 'text-blue-400' : 'text-slate-600 dark:text-slate-400'
                                      }`}>
                                        {bairro.votos.toLocaleString()} votos
                                      </span>
                                      <span className="text-slate-600 dark:text-slate-500">•</span>
                                      <span className="text-slate-600 dark:text-slate-500">Zonas: {bairro.zonas.join(', ')}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            {filteredBairros.length === 0 && (
                              <div className="p-4 text-center text-slate-600 dark:text-slate-400 text-sm">
                                Nenhum bairro encontrado
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : uf === 'DF' && getFilteredDfZonas().length > 0 ? (
                      <div className="divide-y divide-[var(--border-default)]">
                        {getFilteredDfZonas().map((mun, idx) => {
                          const zonaNum = getZonaNumber(mun.municipio);
                          const metaAtiva = getMetaAtiva(mun);
                          const diff = metaAtiva - mun.votosBase;
                          const diffPercent = mun.votosBase > 0 ? ((diff / mun.votosBase) * 100).toFixed(0) : 0;
                          const isSelected = selectedDfZona === zonaNum;
                          return (
                            <div
                              key={idx}
                              className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors group ${
                                isSelected ? 'bg-sky-900/30 border-l-2 border-sky-400' :
                                mun.dobradaAtiva ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400 dark:border-blue-500' : ''
                              }`}
                              onClick={() => {
                                const zonaPin = dfZonasDisplay.find(z => z.zona === zonaNum);
                                if (zonaPin) handleDfZonaClick(zonaPin);
                              }}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <Vote className="h-3.5 w-3.5 text-sky-400 flex-shrink-0" />
                                  <span className="text-[color:var(--text-primary)] font-medium text-sm">
                                    Zona {zonaNum}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {mun.dobradaAtiva && (
                                    <Badge variant="info" className="text-xs bg-blue-600">
                                      DOBRADA
                                    </Badge>
                                  )}
                                  {mun.prioridade && mun.prioridade !== 'MEDIA' && (
                                    <Badge
                                      variant={mun.prioridade === 'ALTA' ? 'danger' : 'default'}
                                      className="text-xs"
                                    >
                                      {mun.prioridade === 'ALTA' ? '!' : '○'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600 dark:text-slate-400">
                                  {ano}: <span className="text-sky-600 dark:text-sky-400 font-medium">{mun.votosBase.toLocaleString()}</span>
                                </span>
                                <span className="text-slate-600 dark:text-slate-500">→</span>
                                <span className={cenarioConfig[cenarioAtivo].color}>
                                  {metaAtiva.toLocaleString()}
                                </span>
                                {diff !== 0 && (
                                  <span className={`ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>
                                    {diff > 0 ? '+' : ''}{diffPercent}%
                                  </span>
                                )}
                              </div>
                              {mun.dobradaAtiva && mun.dobradaNome && (
                                <div className="mt-1 text-xs text-blue-600 dark:text-blue-300">
                                  🤝 com {mun.dobradaNome}{mun.dobradaPartido ? ` (${mun.dobradaPartido})` : ''}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : uf === 'DF' && dfVisualizacao === 'regioes' && getFilteredDfRegioes().length > 0 ? (
                      <div className="divide-y divide-[var(--border-default)]">
                        {getFilteredDfRegioes().map((mun, idx) => {
                          const regiaoNome = getRegiaoNome(mun.municipio);
                          const metaAtiva = getMetaAtiva(mun);
                          const diff = metaAtiva - mun.votosBase;
                          const diffPercent = mun.votosBase > 0 ? ((diff / mun.votosBase) * 100).toFixed(0) : 0;
                          const isSelected = selectedDfRegiao === regiaoNome;
                          return (
                            <div
                              key={idx}
                              className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors group ${
                                isSelected ? 'bg-sky-900/30 border-l-2 border-sky-400' :
                                mun.dobradaAtiva ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400 dark:border-blue-500' : ''
                              }`}
                              onClick={() => handleDfRegiaoClick(regiaoNome)}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <MapPin className="h-3.5 w-3.5 text-[color:var(--brand-cobalt)] flex-shrink-0" />
                                  <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">
                                    {regiaoNome}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {mun.dobradaAtiva && (
                                    <Badge variant="info" className="text-xs bg-blue-600">DOBRADA</Badge>
                                  )}
                                  {mun.prioridade && mun.prioridade !== 'MEDIA' && (
                                    <Badge variant={mun.prioridade === 'ALTA' ? 'danger' : 'default'} className="text-xs">
                                      {mun.prioridade === 'ALTA' ? '!' : '○'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600 dark:text-slate-400">
                                  {ano}: <span className="text-sky-600 dark:text-sky-400 font-medium">{mun.votosBase.toLocaleString()}</span>
                                </span>
                                <span className="text-slate-600 dark:text-slate-500">→</span>
                                <span className={cenarioConfig[cenarioAtivo].color}>{metaAtiva.toLocaleString()}</span>
                                {diff !== 0 && (
                                  <span className={`ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>
                                    {diff > 0 ? '+' : ''}{diffPercent}%
                                  </span>
                                )}
                              </div>
                              {mun.dobradaAtiva && mun.dobradaNome && (
                                <div className="mt-1 text-xs text-blue-600 dark:text-blue-300">
                                  🤝 com {mun.dobradaNome}{mun.dobradaPartido ? ` (${mun.dobradaPartido})` : ''}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : uf === 'SP' && spVisualizacao === 'distritos' && getFilteredSpDistritos().length > 0 ? (
                      <div className="divide-y divide-[var(--border-default)]">
                        {getFilteredSpDistritos().map((mun, idx) => {
                          const distNome = getDistritoNome(mun.municipio);
                          const metaAtiva = getMetaAtiva(mun);
                          const diff = metaAtiva - mun.votosBase;
                          const diffPercent = mun.votosBase > 0 ? ((diff / mun.votosBase) * 100).toFixed(0) : 0;
                          const isSelected = selectedSpDistrito === distNome;
                          return (
                            <div
                              key={idx}
                              className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors group ${
                                isSelected ? 'bg-violet-900/30 border-l-2 border-violet-400' :
                                mun.dobradaAtiva ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400 dark:border-blue-500' : ''
                              }`}
                              onClick={() => handleSpDistritoClick(distNome)}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <MapPin className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
                                  <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">{distNome}</span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {mun.dobradaAtiva && <Badge variant="info" className="text-xs bg-blue-600">DOBRADA</Badge>}
                                  {mun.prioridade && mun.prioridade !== 'MEDIA' && (
                                    <Badge variant={mun.prioridade === 'ALTA' ? 'danger' : 'default'} className="text-xs">
                                      {mun.prioridade === 'ALTA' ? '!' : '○'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600 dark:text-slate-400">Meta: <span className="text-violet-400 font-medium">{mun.votosBase.toLocaleString()}</span></span>
                                <span className="text-slate-600 dark:text-slate-500">→</span>
                                <span className={cenarioConfig[cenarioAtivo].color}>{metaAtiva.toLocaleString()}</span>
                                {diff !== 0 && <span className={`ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>{diff > 0 ? '+' : ''}{diffPercent}%</span>}
                              </div>
                              {mun.dobradaAtiva && mun.dobradaNome && (
                                <div className="mt-1 text-xs text-blue-600 dark:text-blue-300">🤝 com {mun.dobradaNome}{mun.dobradaPartido ? ` (${mun.dobradaPartido})` : ''}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : uf === 'RJ' && rjVisualizacao === 'bairros' && getFilteredRjBairros().length > 0 ? (
                      <div className="divide-y divide-[var(--border-default)]">
                        {getFilteredRjBairros().map((mun, idx) => {
                          const bairroNome = getRjBairroNome(mun.municipio);
                          const metaAtiva = getMetaAtiva(mun);
                          const diff = metaAtiva - mun.votosBase;
                          const diffPercent = mun.votosBase > 0 ? ((diff / mun.votosBase) * 100).toFixed(0) : 0;
                          const isSelected = selectedRjBairro === bairroNome;
                          return (
                            <div
                              key={idx}
                              className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors group ${
                                isSelected ? 'bg-emerald-900/30 border-l-2 border-emerald-400' :
                                mun.dobradaAtiva ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400 dark:border-blue-500' : ''
                              }`}
                              onClick={() => handleRjBairroClick(bairroNome)}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <MapPin className="h-3.5 w-3.5 text-[color:var(--success)] flex-shrink-0" />
                                  <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">{bairroNome}</span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {mun.dobradaAtiva && <Badge variant="info" className="text-xs bg-blue-600">DOBRADA</Badge>}
                                  {mun.prioridade && mun.prioridade !== 'MEDIA' && (
                                    <Badge variant={mun.prioridade === 'ALTA' ? 'danger' : 'default'} className="text-xs">
                                      {mun.prioridade === 'ALTA' ? '!' : '○'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600 dark:text-slate-400">Meta: <span className="text-[color:var(--success)] font-medium">{mun.votosBase.toLocaleString()}</span></span>
                                <span className="text-slate-600 dark:text-slate-500">→</span>
                                <span className={cenarioConfig[cenarioAtivo].color}>{metaAtiva.toLocaleString()}</span>
                                {diff !== 0 && <span className={`ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>{diff > 0 ? '+' : ''}{diffPercent}%</span>}
                              </div>
                              {mun.dobradaAtiva && mun.dobradaNome && (
                                <div className="mt-1 text-xs text-blue-600 dark:text-blue-300">🤝 com {mun.dobradaNome}{mun.dobradaPartido ? ` (${mun.dobradaPartido})` : ''}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : uf === 'CE' && ceVisualizacao === 'bairros' && getFilteredCeBairros().length > 0 ? (
                      <div className="divide-y divide-[var(--border-default)]">
                        {getFilteredCeBairros().map((mun, idx) => {
                          const bairroNome = getCeBairroNome(mun.municipio);
                          const metaAtiva = getMetaAtiva(mun);
                          const diff = metaAtiva - mun.votosBase;
                          const diffPercent = mun.votosBase > 0 ? ((diff / mun.votosBase) * 100).toFixed(0) : 0;
                          const isSelected = selectedCeBairro === bairroNome;
                          return (
                            <div
                              key={idx}
                              className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors group ${
                                isSelected ? 'bg-orange-900/30 border-l-2 border-orange-400' :
                                mun.dobradaAtiva ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400 dark:border-blue-500' : ''
                              }`}
                              onClick={() => handleCeBairroClick(bairroNome)}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <MapPin className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
                                  <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">{bairroNome}</span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {mun.dobradaAtiva && <Badge variant="info" className="text-xs bg-blue-600">DOBRADA</Badge>}
                                  {mun.prioridade && mun.prioridade !== 'MEDIA' && (
                                    <Badge variant={mun.prioridade === 'ALTA' ? 'danger' : 'default'} className="text-xs">
                                      {mun.prioridade === 'ALTA' ? '!' : '○'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600 dark:text-slate-400">Meta: <span className="text-orange-400 font-medium">{mun.votosBase.toLocaleString()}</span></span>
                                <span className="text-slate-600 dark:text-slate-500">→</span>
                                <span className={cenarioConfig[cenarioAtivo].color}>{metaAtiva.toLocaleString()}</span>
                                {diff !== 0 && <span className={`ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>{diff > 0 ? '+' : ''}{diffPercent}%</span>}
                              </div>
                              {mun.dobradaAtiva && mun.dobradaNome && (
                                <div className="mt-1 text-xs text-blue-600 dark:text-blue-300">🤝 com {mun.dobradaNome}{mun.dobradaPartido ? ` (${mun.dobradaPartido})` : ''}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : uf === 'MG' && mgVisualizacao === 'bairros' && getFilteredMgBairros().length > 0 ? (
                      <div className="divide-y divide-[var(--border-default)]">
                        {getFilteredMgBairros().map((mun, idx) => {
                          const bairroNome = getMgBairroNome(mun.municipio);
                          const metaAtiva = getMetaAtiva(mun);
                          const diff = metaAtiva - mun.votosBase;
                          const diffPercent = mun.votosBase > 0 ? ((diff / mun.votosBase) * 100).toFixed(0) : 0;
                          const isSelected = selectedMgBairro === bairroNome;
                          return (
                            <div
                              key={idx}
                              className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors group ${
                                isSelected ? 'bg-violet-900/30 border-l-2 border-violet-400' :
                                mun.dobradaAtiva ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400 dark:border-blue-500' : ''
                              }`}
                              onClick={() => setSelectedMgBairro(prev => prev === bairroNome ? null : bairroNome)}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <MapPin className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
                                  <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">{bairroNome}</span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {mun.dobradaAtiva && <Badge variant="info" className="text-xs bg-blue-600">DOBRADA</Badge>}
                                  {mun.prioridade && mun.prioridade !== 'MEDIA' && (
                                    <Badge variant={mun.prioridade === 'ALTA' ? 'danger' : 'default'} className="text-xs">
                                      {mun.prioridade === 'ALTA' ? '!' : '○'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600 dark:text-slate-400">Meta: <span className="text-violet-400 font-medium">{mun.votosBase.toLocaleString()}</span></span>
                                <span className="text-slate-600 dark:text-slate-500">→</span>
                                <span className={cenarioConfig[cenarioAtivo].color}>{metaAtiva.toLocaleString()}</span>
                                {diff !== 0 && <span className={`ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>{diff > 0 ? '+' : ''}{diffPercent}%</span>}
                              </div>
                              {mun.dobradaAtiva && mun.dobradaNome && (
                                <div className="mt-1 text-xs text-blue-600 dark:text-blue-300">🤝 com {mun.dobradaNome}{mun.dobradaPartido ? ` (${mun.dobradaPartido})` : ''}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : visualizacaoMapa === 'bairro' && genPoligonosMunicipio && genPoligonosUf ? (
                      Object.keys(genBairrosApiVotes).length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600 dark:text-slate-400">
                          <MapPin className="h-8 w-8 text-sky-400 opacity-50" />
                          <span className="text-sm text-center px-4">Carregando bairros de {genPoligonosMunicipio}…</span>
                        </div>
                      ) : (
                        <div className="divide-y divide-[var(--border-default)]">
                          {(() => {
                            const normFn = (s: string) =>
                              s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
                            return Object.entries(genBairrosApiVotes)
                              .map(([nome, votosBase]) => {
                                const nomeNorm = normFn(nome);
                                const votosDisplay = genBairrosVotesDisplay[nomeNorm] ?? votosBase;
                                return { nome, votosBase, votosDisplay };
                              })
                              .sort((a, b) => b.votosDisplay - a.votosDisplay)
                              .map(({ nome, votosBase, votosDisplay }, idx) => {
                                const isSelected = selectedGenBairro ? normFn(nome) === normFn(selectedGenBairro) : false;
                                const diff = votosDisplay - votosBase;
                                const diffPercent = votosBase > 0 ? ((diff / votosBase) * 100).toFixed(0) : 0;
                                return (
                                  <div
                                    key={idx}
                                    className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors group ${
                                      isSelected ? 'bg-sky-900/30 border-l-2 border-sky-400' : ''
                                    }`}
                                    onClick={() => {
                                      setSelectedGenBairro(prev =>
                                        prev && normFn(prev) === normFn(nome) ? null : nome
                                      );
                                      handleBairroClick(nome, votosDisplay);
                                    }}
                                  >
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <MapPin className="h-3.5 w-3.5 text-sky-400 flex-shrink-0" />
                                        <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">{nome}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="text-slate-600 dark:text-slate-400">Votos: <span className="text-sky-400 font-medium">{votosBase.toLocaleString()}</span></span>
                                      {diff !== 0 && (
                                        <>
                                          <span className="text-slate-600 dark:text-slate-500">→</span>
                                          <span className={cenarioConfig[cenarioAtivo].color}>{votosDisplay.toLocaleString()}</span>
                                          <span className={`ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>{diff > 0 ? '+' : ''}{diffPercent}%</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              });
                          })()}
                        </div>
                      )
                    ) : visualizacaoMapa === 'bairro' && getFilteredMunBairros().length > 0 ? (
                      <div className="divide-y divide-[var(--border-default)]">
                        {getFilteredMunBairros().map((mun, idx) => {
                          const bairroNome = getMunBairroNome(mun.municipio);
                          const metaAtiva = getMetaAtiva(mun);
                          const diff = metaAtiva - mun.votosBase;
                          const diffPercent = mun.votosBase > 0 ? ((diff / mun.votosBase) * 100).toFixed(0) : 0;
                          return (
                            <div
                              key={idx}
                              className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors group ${
                                mun.dobradaAtiva ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400 dark:border-blue-500' : ''
                              }`}
                              onClick={() => handleBairroClick(bairroNome, mun.votosBase)}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <MapPin className="h-3.5 w-3.5 text-sky-400 flex-shrink-0" />
                                  <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">{bairroNome}</span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {mun.dobradaAtiva && <Badge variant="info" className="text-xs bg-blue-600">DOBRADA</Badge>}
                                  {mun.prioridade && mun.prioridade !== 'MEDIA' && (
                                    <Badge variant={mun.prioridade === 'ALTA' ? 'danger' : 'default'} className="text-xs">
                                      {mun.prioridade === 'ALTA' ? '!' : '○'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600 dark:text-slate-400">Base: <span className="text-sky-400 font-medium">{mun.votosBase.toLocaleString()}</span></span>
                                <span className="text-slate-600 dark:text-slate-500">→</span>
                                <span className={cenarioConfig[cenarioAtivo].color}>{metaAtiva.toLocaleString()}</span>
                                {diff !== 0 && <span className={`ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>{diff > 0 ? '+' : ''}{diffPercent}%</span>}
                              </div>
                              {mun.dobradaAtiva && mun.dobradaNome && (
                                <div className="mt-1 text-xs text-blue-600 dark:text-blue-300">🤝 com {mun.dobradaNome}{mun.dobradaPartido ? ` (${mun.dobradaPartido})` : ''}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--border-default)]">
                        {getFilteredMunicipios()
                          .sort((a, b) => b.votosBase - a.votosBase)
                          .map((mun, idx) => {
                            const metaAtiva = getMetaAtiva(mun);
                            const diff = metaAtiva - mun.votosBase;
                            const diffPercent = mun.votosBase > 0 ? ((diff / mun.votosBase) * 100).toFixed(0) : 0;
                            const isNew = mun.votosBase === 0;
                            const bairrosDelta = getBairrosDeltaMunicipio(mun.municipio, cenarioAtivo);
                            return (
                              <div
                                key={idx}
                                className={`px-3 py-2.5 hover:bg-[var(--bg-card-subtle)]/70 cursor-pointer transition-colors group border-b border-[var(--border-default)] ${
                                  isNew ? 'border-l-2 border-l-emerald-500' :
                                  mun.dobradaAtiva ? 'border-l-2 border-l-blue-400' : ''
                                }`}
                                onClick={() => handleMunicipioClick(mun.municipio)}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                    {mun.dobradaAtiva && <Handshake className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />}
                                    <span className="text-[color:var(--text-primary)] font-semibold text-sm truncate">
                                      {mun.municipio}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {isNew && <Badge variant="success" className="text-[10px] px-1 py-0">NOVO</Badge>}
                                    {mun.prioridade === 'ALTA' && <Badge variant="danger" className="text-[10px] px-1 py-0">!</Badge>}
                                    {bairrosDelta > 0 && <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'rgba(56,189,248,0.15)', color: 'var(--acento-azul)', border: '1px solid rgba(56,189,248,0.25)' }}>+{bairrosDelta.toLocaleString()} bairros</span>}
                                    {isNew && (
                                      <button onClick={(e) => { e.stopPropagation(); removeMunicipio(mun.municipio); }} className="p-0.5 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {isNew ? (
                                    <span className="text-[11px] text-slate-500 italic">Sem votos anteriores → <span className={cenarioConfig[cenarioAtivo].color}>{metaAtiva.toLocaleString()}</span></span>
                                  ) : (
                                    <>
                                      <span className="text-[11px]" style={{ color: '#6b82a0' }}>{ano}:</span>
                                      <span className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold">{mun.votosBase.toLocaleString()}</span>
                                      <span className="text-[11px] text-slate-400">→</span>
                                      <span className={`text-[11px] font-semibold ${cenarioConfig[cenarioAtivo].color}`}>{metaAtiva.toLocaleString()}</span>
                                      {diff !== 0 && <span className={`text-[10px] ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>{diff > 0 ? '+' : ''}{diffPercent}%</span>}
                                    </>
                                  )}
                                </div>
                                {mun.dobradaAtiva && mun.dobradaNome && (
                                  <div className="mt-1 text-xs text-blue-600 dark:text-blue-300">
                                    🤝 com {mun.dobradaNome}{mun.dobradaPartido ? ` (${mun.dobradaPartido})` : ''}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        {getFilteredMunicipios().length === 0 && (() => {
                          if (!searchMunicipio.trim()) {
                            return (
                              <div className="p-4 text-center text-slate-600 dark:text-slate-400 text-sm">
                                Nenhum município encontrado
                              </div>
                            );
                          }
                          const q = searchMunicipio.toLowerCase();
                          const sugestoes = municipiosDisponiveis
                            .filter(nome => nome.toLowerCase().includes(q))
                            .filter(nome => !projecao?.municipios.some(m => m.municipio.toUpperCase() === nome.toUpperCase()))
                            .slice(0, 8);
                          if (sugestoes.length === 0) {
                            return (
                              <div className="p-4 text-center text-slate-600 dark:text-slate-400 text-sm">
                                Nenhum município encontrado
                              </div>
                            );
                          }
                          return (
                            <div>
                              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                Adicionar à projeção
                              </p>
                              {sugestoes.map(nome => (
                                <div
                                  key={nome}
                                  className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-[var(--bg-card-subtle)]/70 cursor-pointer border-b border-[var(--border-default)]"
                                  onClick={() => {
                                    if (!projecao) return;
                                    setProjecao(prev => {
                                      if (!prev) return prev;
                                      return {
                                        ...prev,
                                        municipios: [...prev.municipios, {
                                          municipio: nome.toUpperCase(),
                                          votosBase: 0,
                                          metaConservadora: 0,
                                          metaPossivel: 0,
                                          metaArrojada: 0,
                                          prioridade: 'MEDIA',
                                          dobradaAtiva: false,
                                        }],
                                      };
                                    });
                                    setSearchMunicipio('');
                                    toast.success(`${nome} adicionado à projeção`);
                                  }}
                                >
                                  <span className="text-sm text-[color:var(--text-primary)] font-medium">{nome}</span>
                                  <span className="text-[10px] text-emerald-400 font-semibold flex-shrink-0">+ Adicionar</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </CardContent>
                </Card>

              </motion.div>
            )}

            {/* MAP — takes remaining space */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className={mapFullscreen ? 'flex-1 min-w-0 relative overflow-hidden' : 'col-span-12 md:col-span-8 lg:col-span-6 md:order-2 overflow-hidden order-1'}
            >
              <Card
                className={mapFullscreen ? 'h-full rounded-none border-0 bg-transparent overflow-hidden flex flex-col' : 'bg-[var(--bg-card-subtle)]/50 border-[var(--tint-06)] overflow-hidden flex flex-col pt-2'}
                style={!mapFullscreen ? { height: 'clamp(400px, calc(100vh - 160px), 900px)', minHeight: '400px' } : undefined}
              >
                <CardHeader className={`border-b border-[var(--tint-06)] py-0.5 px-3 ${mapFullscreen ? 'bg-[var(--bg-card)]/95' : ''}`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-sm 2xl:text-base text-[color:var(--text-primary)] flex items-center gap-2">
                      <Map className="h-4 w-4 2xl:h-5 2xl:w-5 text-[color:var(--brand-cobalt)]" />
                      {activeTab === 'historico' ? `Votos em ${ano}` : `Projeção ${cenarioConfig[cenarioAtivo].label} para ${anoProjecao}`}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {/* Indicador de Regiões para DF */}
                      {uf === 'DF' && (
                        <div className="flex bg-[var(--bg-card-subtle)] rounded-lg p-0.5">
                          <button
                            onClick={() => setDfVisualizacao('regioes')}
                            className={`px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1 ${
                              dfVisualizacao === 'regioes' ? 'bg-teal-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-white'
                            }`}
                          >
                            <Layers className="h-3 w-3" />
                            Regiões
                          </button>
                        </div>
                      )}
                      {/* Voltar para municípios SP ao sair do mapa de distritos */}
                      {uf === 'SP' && spVisualizacao === 'distritos' && (
                        <button
                          onClick={() => { setSpVisualizacao('municipios'); setSelectedSpDistrito(null); }}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md text-slate-700 dark:text-slate-300 hover:text-white transition-all"
                          style={{ background: 'rgba(74,158,222,0.12)', border: '1px solid rgba(74,158,222,0.3)' }}
                        >
                          ← São Paulo
                        </button>
                      )}
                      {uf === 'RJ' && rjVisualizacao === 'bairros' && (
                        <button
                          onClick={() => { setRjVisualizacao('municipios'); setSelectedRjBairro(null); }}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md text-slate-700 dark:text-slate-300 hover:text-white transition-all"
                          style={{ background: 'rgba(5,150,105,0.12)', border: '1px solid rgba(5,150,105,0.3)' }}
                        >
                          ← Rio de Janeiro
                        </button>
                      )}
                      {uf === 'CE' && ceVisualizacao === 'bairros' && (
                        <button
                          onClick={() => { setCeVisualizacao('municipios'); setSelectedCeBairro(null); }}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md text-slate-700 dark:text-slate-300 hover:text-white transition-all"
                          style={{ background: 'rgba(234,88,12,0.12)', border: '1px solid rgba(234,88,12,0.3)' }}
                        >
                          ← Ceará
                        </button>
                      )}
                      {uf === 'MG' && mgVisualizacao === 'bairros' && (
                        <button
                          onClick={() => { setMgVisualizacao('municipios'); setSelectedMgBairro(null); setMgBairrosMunicipio(''); }}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md text-slate-700 dark:text-slate-300 hover:text-white transition-all"
                          style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)' }}
                        >
                          ← Minas Gerais
                        </button>
                      )}
                      {uf === 'MG' && mgVisualizacao === 'bairros' && (
                        <select
                          value={mgBairrosMunicipio}
                          onChange={e => { setMgBairrosMunicipio(e.target.value); setSelectedMgBairro(null); }}
                          className="px-2 py-1 text-xs rounded-md text-slate-800 dark:text-slate-200 bg-[var(--bg-card-subtle)] border border-[var(--border-default)]"
                        >
                          <option value="">Selecione a cidade</option>
                          {[...MG_MUNICIPIOS_COM_BAIRROS].sort().map(c => (
                            <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
                          ))}
                        </select>
                      )}
                      {/* Alternância de visualização para vereadores */}
                      {(electoralData.cargo ?? '').toUpperCase().includes('VEREADOR') && (
                        <div className="flex bg-[var(--bg-card-subtle)] rounded-lg p-0.5">
                          <button
                            onClick={() => setVisualizacaoMapa('municipio')}
                            className={`px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1 ${
                              visualizacaoMapa === 'municipio'
                                ? 'bg-cyan-500 text-white'
                                : 'text-slate-600 dark:text-slate-400 hover:text-white'
                            }`}
                          >
                            <MapPin className="h-3 w-3" />
                            Município
                          </button>
                          <button
                            onClick={() => setVisualizacaoMapa('bairro')}
                            className={`px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1 ${
                              visualizacaoMapa === 'bairro'
                                ? 'bg-emerald-500 text-white'
                                : 'text-slate-600 dark:text-slate-400 hover:text-white'
                            }`}
                          >
                            <Home className="h-3 w-3" />
                            Bairros
                          </button>
                        </div>
                      )}
                      <Badge variant={activeTab === 'historico' ? 'info' : 'success'} className="hidden sm:inline-flex">
                        {electoralData.nomeUrna || electoralData.nome} - {electoralData.partido}
                      </Badge>
                    </div>
                  </div>
                  {/* Info de zonas e bairros para vereador */}
                  {(electoralData.cargo ?? '').toUpperCase().includes('VEREADOR') && (bairrosInfo.length > 0 || Object.keys(votosPorZona).length > 0) && (
                    <div className="mt-2 p-2 bg-purple-900/30 border border-purple-500/30 rounded-lg">
                      <div className="flex items-center gap-4 text-xs flex-wrap">
                        <div className="flex items-center gap-2 text-purple-300">
                          <Vote className="h-4 w-4" />
                          <span>
                            Vereador - {Object.values(votosPorZona).reduce((acc, m) => acc + m.zonas.length, 0)} zonas em{' '}
                            {Object.keys(votosPorZona).join(', ')}
                          </span>
                        </div>
                        {bairrosInfo.length > 0 && (
                          <div className="flex items-center gap-2 text-[color:var(--success)]">
                            <Home className="h-4 w-4" />
                            <span>{bairrosInfo.length} bairros com votos</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Legenda para visualização por bairros */}
                  {visualizacaoMapa === 'bairro' && bairrosInfo.length > 0 && (
                    <div className="mt-2 p-2 bg-[var(--bg-card-subtle)]/50 border border-[var(--border-default)] rounded-lg">
                      <div className="flex items-center gap-4 text-xs flex-wrap">
                        <span className="text-slate-600 dark:text-slate-400 font-medium">Legenda:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                          <span className="text-[color:var(--success)]">Acima da média ({mediaVotosBairro}+ votos)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                          <span className="text-blue-400">Abaixo da média</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full bg-gray-600"></span>
                          <span className="text-gray-400">Sem votos</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-0 flex-1 min-h-0 relative overflow-hidden">
                  {visualizacaoMapa === 'bairro' && municipioVereador && uf === 'SP' && normMunKey(municipioVereador) === 'SAO PAULO' ? (
                    // SP capital municipal (prefeito/vereador) — polígonos de distritos
                    <SpDistritosMap
                      votesData={spDistritosVotesDisplay}
                      selectedDistrito={selectedSpDistrito}
                      onDistritoClick={handleSpDistritoClick}
                      height="100%"
                    />
                  ) : visualizacaoMapa === 'bairro' && municipioVereador && uf === 'RJ' && normMunKey(municipioVereador) === 'RIO DE JANEIRO' ? (
                    // RJ capital municipal (prefeito/vereador) — polígonos de bairros
                    <RjBairrosMap
                      votesData={rjBairrosVotesDisplay}
                      selectedBairro={selectedRjBairro}
                      onBairroClick={handleRjBairroClick}
                      height="100%"
                    />
                  ) : visualizacaoMapa === 'bairro' && municipioVereador && uf === 'CE' && normMunKey(municipioVereador) === 'FORTALEZA' ? (
                    // CE capital municipal (prefeito/vereador) — polígonos de bairros
                    <CeBairrosMap
                      votesData={ceBairrosVotesDisplay}
                      selectedBairro={selectedCeBairro}
                      onBairroClick={handleCeBairroClick}
                      height="100%"
                    />
                  ) : visualizacaoMapa === 'bairro' && municipioVereador ? (
                    // Outros municípios — pins de bairros
                    // candidatoId só é passado se o ano tem dados TSE reais (histórico eleitoral).
                    // Para anos futuros (ex: 2026) o candidatoId do estado anterior causaria 400
                    // na API de bairros (validação impede ano inválido + candidato).
                    <MunicipioMap
                      municipio={municipioVereador}
                      uf={uf}
                      candidatoId={['2018','2020','2022','2024'].includes(ano) ? electoralData?.candidatoId : undefined}
                      nomeCandidato={['2018','2020','2022','2024'].includes(ano) && electoralData?.candidatoId ? (electoralData?.nomeUrna || electoralData?.nome) : undefined}
                      ano={ano}
                      votosPorBairro={munBairrosVotesDisplay}
                      totalVotos={getTotalVotosBairros() || electoralData?.totalVotos}
                      showLabels={true}
                      height="100%"
                      onBairroClick={(bairroNome, votos) => handleBairroClick(bairroNome, votos ?? 0)}
                    />
                  ) : uf === 'SP' && spVisualizacao === 'distritos' ? (
                    <SpDistritosMap
                      votesData={spDistritosVotesDisplay}
                      selectedDistrito={selectedSpDistrito}
                      onDistritoClick={handleSpDistritoClick}
                      height="100%"
                    />
                  ) : uf === 'DF' && dfVisualizacao === 'regioes' ? (
                    <DfRegioesMap
                      votesData={dfRegioesVotesDisplay}
                      selectedRegiao={selectedDfRegiao}
                      onRegiaoClick={handleDfRegiaoClick}
                      height="100%"
                    />
                  ) : uf === 'DF' && dfVisualizacao === 'zonas' && loadingDfZonas ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600 dark:text-slate-400">
                      <Loader2 className="h-8 w-8 animate-spin text-[color:var(--brand-cobalt)]" />
                      <span className="text-sm">Carregando zonas eleitorais do DF…</span>
                    </div>
                  ) : uf === 'DF' && dfVisualizacao === 'zonas' && dfZonasDisplay.length > 0 ? (
                    <ZonaPinsMap
                      municipio="BRASÍLIA"
                      zonas={dfZonasDisplay}
                      bounds={dfBounds}
                      selectedZona={selectedDfZona}
                      onZonaClick={handleDfZonaClick}
                    />
                  ) : uf === 'DF' && dfVisualizacao === 'zonas' ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600 dark:text-slate-400">
                      <Vote className="h-8 w-8 text-sky-500 opacity-50" />
                      <span className="text-sm">Busque um candidato para ver as zonas eleitorais</span>
                    </div>
                  ) : uf === 'RJ' && rjVisualizacao === 'bairros' ? (
                    <RjBairrosMap
                      votesData={rjBairrosVotesDisplay}
                      selectedBairro={selectedRjBairro}
                      onBairroClick={handleRjBairroClick}
                      height="100%"
                    />
                  ) : uf === 'CE' && ceVisualizacao === 'bairros' ? (
                    <CeBairrosMap
                      votesData={ceBairrosVotesDisplay}
                      selectedBairro={selectedCeBairro}
                      onBairroClick={handleCeBairroClick}
                      height="100%"
                    />
                  ) : uf === 'MG' && mgVisualizacao === 'bairros' && mgBairrosMunicipio ? (
                    <MgBairrosMap
                      municipio={mgBairrosMunicipio}
                      votesData={mgBairrosVotesDisplay}
                      selectedBairro={selectedMgBairro}
                      onBairroClick={(nome) => setSelectedMgBairro(prev => prev === nome ? null : nome)}
                      height="100%"
                    />
                  ) : uf === 'MG' && mgVisualizacao === 'bairros' && !mgBairrosMunicipio ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600 dark:text-slate-400">
                      <MapPin className="h-8 w-8 text-violet-400 opacity-50" />
                      <span className="text-sm">Selecione a cidade acima para ver os bairros</span>
                    </div>
                  ) : visualizacaoMapa === 'bairro' && genPoligonosMunicipio && genPoligonosUf ? (
                    // Municípios genéricos com polígonos IBGE (exceto SP/RJ/CE/MG)
                    <BairrosPoligonosMap
                      municipio={genPoligonosMunicipio}
                      uf={genPoligonosUf}
                      candidatoId={['2018','2020','2022','2024'].includes(ano) ? electoralData?.candidatoId : undefined}
                      nomeCandidato={['2018','2020','2022','2024'].includes(ano) && electoralData?.candidatoId ? (electoralData?.nomeUrna || electoralData?.nome) : undefined}
                      ano={['2018','2020','2022','2024'].includes(ano) ? ano : undefined}
                      votosPorBairro={genBairrosVotesDisplay}
                      selectedBairro={selectedGenBairro}
                      onBairroClick={(nome, votos) => {
                        setSelectedGenBairro(prev => prev === nome ? null : nome);
                        handleBairroClick(nome, votos ?? 0);
                      }}
                      onDataLoaded={(votes) => setGenBairrosApiVotes(votes)}
                      height="100%"
                    />
                  ) : (
                    // Vista de Municípios (padrão)
                    <StateMap
                      uf={uf}
                      stateName={ESTADOS_BRASIL.find(e => e.sigla === uf)?.nome || uf}
                      votesDataByName={highlightedMunicipios}
                      onMunicipioClick={(codigo, nome) => {
                        if (uf === 'DF') {
                          if (dfZonas.length === 0 && !loadingDfZonas) {
                            carregarDfZonas(electoralData, ano);
                          }
                          return;
                        }
                        handleMunicipioClick(nome, codigo);
                      }}
                      filteredMunicipios={filteredMunicipiosSet}
                      highlightColor={filtroTipo === 'com_dobrada' ? 'blue' : undefined}
                      disableSubdivisao={true}
                      highlightMunicipioNome={selectedMapMunicipio}
                    />
                  )}
                  {/* Botão tela cheia */}
                  <button
                    onClick={() => setMapFullscreen(f => !f)}
                    className="absolute top-3 right-3 z-[1000] bg-slate-800 border border-slate-600 rounded-lg p-2 text-slate-200 hover:bg-slate-700 hover:text-white hover:border-slate-400 transition-all shadow-lg"
                    title={mapFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                  >
                    {mapFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                </CardContent>
              </Card>
            </motion.div>

          </div>

          {/* Stats row — faixa horizontal abaixo das 3 colunas */}
          {!mapFullscreen && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">

              {/* Votos base */}
              {(!!electoralData?.candidatoId || getTotalVotosBase() > 0 || !!projecao) && (
                <Card style={{ background: 'var(--bg-card)', border: filtroTipo !== 'todos' ? '1px solid rgba(37,99,235,0.4)' : '1px solid var(--tint-06)' }}>
                  <CardContent className="!px-3 !py-2">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 flex-shrink-0" style={{ color: '#2563EB' }} />
                      <span className="text-xs font-semibold uppercase tracking-wide hidden 2xl:inline" style={{ color: '#6b82a0' }}>Votos {ano}</span>
                      <span className="ml-auto text-sm 2xl:text-base font-bold text-[color:var(--text-primary)] whitespace-nowrap">{getTotalVotosBase().toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Meta */}
              <Card style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border-default)', borderRight: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', borderLeft: `4px solid ${cenarioConfig[cenarioAtivo].hex}` }}>
                <CardContent className="!px-3 !py-2">
                  <div className="flex items-center gap-2">
                    <Target className={`h-4 w-4 flex-shrink-0 ${cenarioConfig[cenarioAtivo].color}`} />
                    <span className="text-xs font-semibold uppercase tracking-wide hidden 2xl:inline" style={{ color: '#6b82a0' }}>Meta {anoProjecao}</span>
                    <span className={`ml-auto text-sm 2xl:text-base font-bold whitespace-nowrap ${cenarioConfig[cenarioAtivo].color}`}>{getTotalVotosMeta().toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Crescimento */}
              {(!!electoralData?.candidatoId || getTotalVotosBase() > 0 || !!projecao) && (
                <Card style={{ background: 'var(--bg-card)', border: filtroTipo !== 'todos' ? '1px solid rgba(37,99,235,0.4)' : '1px solid var(--tint-06)' }}>
                  <CardContent className="!px-3 !py-2">
                    <div className="flex items-center gap-2">
                      {parseFloat(getCrescimento() as string) >= 0
                        ? <ArrowUp className="h-4 w-4 flex-shrink-0 text-[color:var(--success)]" />
                        : <ArrowDown className="h-4 w-4 flex-shrink-0 text-red-400" />
                      }
                      <span className="text-xs font-semibold uppercase tracking-wide hidden 2xl:inline" style={{ color: '#6b82a0' }}>Crescimento</span>
                      <span className={`ml-auto text-sm 2xl:text-base font-bold whitespace-nowrap ${parseFloat(getCrescimento() as string) >= 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>
                        {parseFloat(getCrescimento() as string) >= 0 ? '+' : ''}{getCrescimento()}%
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Municípios */}
              <Card style={{ background: 'var(--bg-card)', border: filtroTipo !== 'todos' ? '1px solid rgba(37,99,235,0.4)' : '1px solid var(--tint-06)' }}>
                <CardContent className="!px-3 !py-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 flex-shrink-0" style={{ color: '#2563EB' }} />
                    <span className="text-xs font-semibold uppercase tracking-wide hidden 2xl:inline" style={{ color: '#6b82a0' }}>Municípios</span>
                    <span className="ml-auto text-sm 2xl:text-base font-bold text-[color:var(--text-primary)] whitespace-nowrap">
                      {getMunicipiosCount()}
                      {filtroTipo !== 'todos' && <span className="text-xs font-normal ml-1" style={{ color: '#6b82a0' }}>/ {projecao.municipios.filter(m => !isDfZona(m.municipio) && !isDfRegiao(m.municipio) && !isSpDistrito(m.municipio) && !isRjBairro(m.municipio) && !isCeBairro(m.municipio) && !isMgBairro(m.municipio) && !isMunBairro(m.municipio)).length}</span>}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Dobradas */}
              <Card className={`bg-gradient-to-br from-blue-900/50 to-slate-800 ${filtroTipo === 'com_dobrada' ? 'border-blue-400 ring-2 ring-blue-400/30' : 'border-blue-500/30'}`}>
                <CardContent className="!px-3 !py-2">
                  <div className="flex items-center gap-2">
                    <Handshake className="h-4 w-4 flex-shrink-0 text-blue-400" />
                    <span className="text-xs font-semibold uppercase tracking-wide hidden 2xl:inline text-blue-300">Dobradas</span>
                    <div className="ml-auto text-right">
                      <span className="text-sm 2xl:text-base font-bold text-blue-400 whitespace-nowrap">{getDobradasCount()}</span>
                      {getVotosComDobrada() > 0 && <span className="text-[10px] text-slate-400 ml-1">+{getVotosComDobrada().toLocaleString()}v</span>}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Parcerias */}
              <Card className={`relative bg-gradient-to-br from-amber-900/50 to-slate-800 transition-all duration-300 ${
                filtroTipo === 'parcerias' ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-amber-500/30'
              } ${!includeParcerias ? 'opacity-60' : ''}`}>
                <CardContent className="!px-3 !py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIncludeParcerias(!includeParcerias)}
                      className={`p-0.5 rounded-full transition-all duration-200 flex-shrink-0 ${includeParcerias ? 'text-[color:var(--brand-cobalt)]' : 'text-slate-500'}`}
                      title={includeParcerias ? 'Ocultar parcerias da simulação' : 'Mostrar parcerias na simulação'}
                    >
                      {includeParcerias ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <span className={`text-xs font-semibold uppercase tracking-wide hidden 2xl:inline ${includeParcerias ? 'text-[color:var(--brand-cobalt-text)]' : 'text-slate-500'}`}>Parcerias</span>
                    <div className="ml-auto text-right">
                      <span className={`text-sm 2xl:text-base font-bold whitespace-nowrap ${includeParcerias ? 'text-sky-400' : 'text-slate-500'}`}>{parceriasStats?.total || 0}</span>
                      {includeParcerias && <span className={`text-[10px] ml-1 ${cenarioConfig[cenarioAtivo].color}`}>
                        +{((cenarioAtivo === 'conservador' ? parceriasStats?.metaConservadoraTotal : cenarioAtivo === 'possivel' ? parceriasStats?.metaPossivelTotal : parceriasStats?.metaArrojadaTotal) || 0).toLocaleString()}v
                      </span>}
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>
          )}
        </>
      )}

      {/* Edit Municipality Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setSelectedMapMunicipio(null); }}
        title={selectedMunicipio?.nome && isDfZona(selectedMunicipio.nome) ? `Editar Metas - Zona ${getZonaNumber(selectedMunicipio.nome)}` : selectedMunicipio?.nome && isDfRegiao(selectedMunicipio.nome) ? `Editar Metas - ${getRegiaoNome(selectedMunicipio.nome)}` : selectedMunicipio?.nome && isSpDistrito(selectedMunicipio.nome) ? `Editar Metas - ${getDistritoNome(selectedMunicipio.nome)}` : selectedMunicipio?.nome && isRjBairro(selectedMunicipio.nome) ? `Editar Metas - ${getRjBairroNome(selectedMunicipio.nome)}` : selectedMunicipio?.nome && isCeBairro(selectedMunicipio.nome) ? `Editar Metas - ${getCeBairroNome(selectedMunicipio.nome)}` : selectedMunicipio?.nome && isMunBairro(selectedMunicipio.nome) ? `Editar Metas - ${getMunBairroNome(selectedMunicipio.nome)}` : `Editar Metas - ${selectedMunicipio?.nome}`}
        size="lg"
        dark
      >
        {selectedMunicipio && (
          <div className="space-y-5">
            {/* Votos Base */}
            <div className="bg-[var(--bg-card-subtle)]/50 rounded-lg p-4 border border-[var(--border-default)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 dark:text-slate-400 text-sm">Votos em {ano}</p>
                  <p className="text-3xl font-bold text-[color:var(--brand-cobalt)]">
                    {selectedMunicipio.votosBase.toLocaleString()}
                  </p>
                </div>
                <BarChart3 className="h-10 w-10 text-[color:var(--brand-cobalt)]/50" />
              </div>
            </div>

            {/* Metas Grid */}
            {(() => {
              const parceriasSum = getParceriasSumForMunicipio(selectedMunicipio.nome);
              const bairrosDeltaC = getBairrosDeltaMunicipio(selectedMunicipio.nome, 'conservador');
              const bairrosDeltaP = getBairrosDeltaMunicipio(selectedMunicipio.nome, 'possivel');
              const bairrosDeltaA = getBairrosDeltaMunicipio(selectedMunicipio.nome, 'arrojado');
              const hasBairrosDelta = bairrosDeltaC > 0 || bairrosDeltaP > 0 || bairrosDeltaA > 0;
              const hasParceriasForMeta = parceriasSum.conservadora > 0 || parceriasSum.possivel > 0 || parceriasSum.arrojada > 0 || hasBairrosDelta;
              
              return (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {/* Meta Conservadora */}
                    <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 border border-amber-200 dark:border-amber-600/40">
                      <div className="flex items-center gap-1 mb-2">
                        <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-amber-700 dark:text-amber-400 text-xs font-medium">Conservadora</span>
                      </div>
                      <Input
                        type="number"
                        value={metaConservadoraTemp}
                        onChange={(e) => setMetaConservadoraTemp(parseInt(e.target.value) || 0)}
                        className="bg-[var(--bg-card)] border-[var(--border-default)] text-[color:var(--text-primary)] text-sm"
                      />
                      <p className={`text-xs mt-1 font-medium ${
                        metaConservadoraTemp > selectedMunicipio.votosBase ? 'text-[color:var(--success)]' :
                        metaConservadoraTemp < selectedMunicipio.votosBase ? 'text-red-400' : 'text-slate-600 dark:text-slate-400'
                      }`}>
                        {calcCrescimento(selectedMunicipio.votosBase, metaConservadoraTemp)}
                      </p>
                    </div>

                    {/* Meta Realista */}
                    <div className="bg-sky-50 dark:bg-sky-950/30 rounded-lg p-3 border border-sky-200 dark:border-sky-600/40">
                      <div className="flex items-center gap-1 mb-2">
                        <Gauge className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                        <span className="text-sky-700 dark:text-sky-400 text-xs font-medium">Realista</span>
                      </div>
                      <Input
                        type="number"
                        value={metaPossivelTemp}
                        onChange={(e) => setMetaPossivelTemp(parseInt(e.target.value) || 0)}
                        className="bg-[var(--bg-card)] border-[var(--border-default)] text-[color:var(--text-primary)] text-sm"
                      />
                      <p className={`text-xs mt-1 font-medium ${
                        metaPossivelTemp > selectedMunicipio.votosBase ? 'text-[color:var(--success)]' :
                        metaPossivelTemp < selectedMunicipio.votosBase ? 'text-red-400' : 'text-slate-600 dark:text-slate-400'
                      }`}>
                        {calcCrescimento(selectedMunicipio.votosBase, metaPossivelTemp)}
                      </p>
                    </div>

                    {/* Meta Arrojada */}
                    <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 border border-emerald-200 dark:border-emerald-600/40">
                      <div className="flex items-center gap-1 mb-2">
                        <Rocket className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Otimista</span>
                      </div>
                      <Input
                        type="number"
                        value={metaArrojadaTemp}
                        onChange={(e) => setMetaArrojadaTemp(parseInt(e.target.value) || 0)}
                        className="bg-[var(--bg-card)] border-[var(--border-default)] text-[color:var(--text-primary)] text-sm"
                      />
                      <p className={`text-xs mt-1 font-medium ${
                        metaArrojadaTemp > selectedMunicipio.votosBase ? 'text-[color:var(--success)]' :
                        metaArrojadaTemp < selectedMunicipio.votosBase ? 'text-red-400' : 'text-slate-600 dark:text-slate-400'
                      }`}>
                        {calcCrescimento(selectedMunicipio.votosBase, metaArrojadaTemp)}
                      </p>
                    </div>
                  </div>

                  {/* Resumo de Metas Finais com Parcerias */}
                  {hasParceriasForMeta && (
                    <div className="bg-[var(--bg-card-subtle)] rounded-lg p-4 border border-[var(--border-default)]">
                      <h4 className="text-[color:var(--text-primary)] font-medium mb-3 flex items-center gap-2">
                        <Users className="h-4 w-4 text-[color:var(--brand-cobalt)]" />
                        Composição das Metas Finais
                        <Badge variant="warning" className="text-xs ml-auto">{hasBairrosDelta ? 'Inclui Parcerias + Bairros' : 'Inclui Parcerias'}</Badge>
                      </h4>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        {/* Conservadora Final */}
                        <div className="bg-[var(--bg-card-subtle)]/50 rounded-lg p-2 border border-amber-200 dark:border-amber-500/20">
                          <p className="text-amber-700 dark:text-amber-400 mb-1 font-medium">Conservadora</p>
                          <div className="space-y-1">
                            <div className="flex justify-between text-slate-600 dark:text-slate-400">
                              <span>Meta Base:</span>
                              <span>{metaConservadoraTemp.toLocaleString()}</span>
                            </div>
                            {parceriasSum.conservadora > 0 && <div className="flex justify-between text-[color:var(--brand-cobalt-text)]">
                              <span>+ Parcerias:</span>
                              <span>+{parceriasSum.conservadora.toLocaleString()}</span>
                            </div>}
                            {bairrosDeltaC > 0 && <div className="flex justify-between" style={{ color: 'var(--acento-azul)' }}>
                              <span>+ Bairros:</span>
                              <span>+{bairrosDeltaC.toLocaleString()}</span>
                            </div>}
                            <div className="flex justify-between text-[color:var(--text-primary)] font-bold border-t border-[var(--border-default)] pt-1">
                              <span>= Final:</span>
                              <span>{(metaConservadoraTemp + parceriasSum.conservadora + bairrosDeltaC).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                        {/* Realista Final */}
                        <div className="bg-[var(--bg-card-subtle)]/50 rounded-lg p-2 border border-sky-200 dark:border-cyan-500/20">
                          <p className="text-sky-700 dark:text-sky-400 mb-1 font-medium">Realista</p>
                          <div className="space-y-1">
                            <div className="flex justify-between text-slate-600 dark:text-slate-400">
                              <span>Meta Base:</span>
                              <span>{metaPossivelTemp.toLocaleString()}</span>
                            </div>
                            {parceriasSum.possivel > 0 && <div className="flex justify-between text-[color:var(--brand-cobalt-text)]">
                              <span>+ Parcerias:</span>
                              <span>+{parceriasSum.possivel.toLocaleString()}</span>
                            </div>}
                            {bairrosDeltaP > 0 && <div className="flex justify-between" style={{ color: 'var(--acento-azul)' }}>
                              <span>+ Bairros:</span>
                              <span>+{bairrosDeltaP.toLocaleString()}</span>
                            </div>}
                            <div className="flex justify-between text-[color:var(--text-primary)] font-bold border-t border-[var(--border-default)] pt-1">
                              <span>= Final:</span>
                              <span>{(metaPossivelTemp + parceriasSum.possivel + bairrosDeltaP).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                        {/* Arrojada Final */}
                        <div className="bg-[var(--bg-card-subtle)]/50 rounded-lg p-2 border border-emerald-200 dark:border-emerald-500/20">
                          <p className="text-[color:var(--success)] mb-1 font-medium">Otimista</p>
                          <div className="space-y-1">
                            <div className="flex justify-between text-slate-600 dark:text-slate-400">
                              <span>Meta Base:</span>
                              <span>{metaArrojadaTemp.toLocaleString()}</span>
                            </div>
                            {parceriasSum.arrojada > 0 && <div className="flex justify-between text-[color:var(--brand-cobalt-text)]">
                              <span>+ Parcerias:</span>
                              <span>+{parceriasSum.arrojada.toLocaleString()}</span>
                            </div>}
                            {bairrosDeltaA > 0 && <div className="flex justify-between" style={{ color: 'var(--acento-azul)' }}>
                              <span>+ Bairros:</span>
                              <span>+{bairrosDeltaA.toLocaleString()}</span>
                            </div>}
                            <div className="flex justify-between text-[color:var(--text-primary)] font-bold border-t border-[var(--border-default)] pt-1">
                              <span>= Final:</span>
                              <span>{(metaArrojadaTemp + parceriasSum.arrojada + bairrosDeltaA).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {/* Prioridade */}
            <Select
              label="Prioridade"
              value={prioridadeTemp}
              onChange={(e) => setPrioridadeTemp(e.target.value)}
              options={prioridadeOptions}
              className="bg-[var(--bg-card-subtle)] border-[var(--border-default)] text-[color:var(--text-primary)]"
            />

            {/* Dobradinha Section */}
            <div className={`rounded-lg p-4 border transition-colors ${
              dobradaAtivaTemp 
                ? 'bg-[var(--brand-cobalt-soft)] border-[var(--brand-cobalt)]' 
                : 'bg-[var(--bg-card-subtle)]/30 border-[var(--border-default)]'
            }`}>
              <div className="flex items-center gap-3 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dobradaAtivaTemp}
                    onChange={(e) => setDobradaAtivaTemp(e.target.checked)}
                    className="w-5 h-5 rounded border-[var(--border-default)] bg-[var(--bg-card-subtle)] text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <Handshake className={`h-5 w-5 ${dobradaAtivaTemp ? 'text-blue-500 dark:text-blue-400' : 'text-slate-600 dark:text-slate-500'}`} />
                  <span className={`font-medium ${dobradaAtivaTemp ? 'text-blue-600 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400'}`}>
                    Dobrada com Deputado Federal
                  </span>
                </label>
              </div>

              {dobradaAtivaTemp && (
                <div className="space-y-3 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Nome do Deputado Federal"
                      placeholder="Ex: Marcos Pereira"
                      value={dobradaNomeTemp}
                      onChange={(e) => setDobradaNomeTemp(e.target.value)}
                      className="bg-[var(--bg-card-subtle)] border-[var(--border-default)] text-[color:var(--text-primary)]"
                    />
                    <Input
                      label="Partido (opcional)"
                      placeholder="Ex: REPUBLICANOS"
                      value={dobradaPartidoTemp}
                      onChange={(e) => setDobradaPartidoTemp(e.target.value)}
                      className="bg-[var(--bg-card-subtle)] border-[var(--border-default)] text-[color:var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="text-slate-600 dark:text-slate-400 text-sm mb-1 block">Observações (opcional)</label>
                    <textarea
                      placeholder="Anotações sobre a articulação política..."
                      value={dobradaObservacoesTemp}
                      onChange={(e) => setDobradaObservacoesTemp(e.target.value)}
                      rows={2}
                      className="w-full bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-sm text-[color:var(--text-primary)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Parcerias Section */}
            <div className="bg-[var(--bg-card-subtle)] rounded-lg p-4 border border-[var(--border-default)]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-[color:var(--brand-cobalt)]" />
                  <h4 className="text-[color:var(--text-primary)] font-medium">Parcerias</h4>
                  <Badge variant="warning" className="text-xs">
                    {getParceriasMunicipio(selectedMunicipio.nome).length}
                  </Badge>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    openParceriaModal(selectedMunicipio.nome);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-[color:var(--text-primary)] text-xs rounded-lg transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Adicionar
                </button>
              </div>

              {getParceriasMunicipio(selectedMunicipio.nome).length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {getParceriasMunicipio(selectedMunicipio.nome).map((parceria) => (
                    <div
                      key={parceria.id}
                      className={`p-3 bg-[var(--bg-card-subtle)]/50 rounded-lg border transition-colors ${parceria.id?.startsWith('pending-') ? 'border-amber-500/40 border-dashed hover:border-amber-500/70' : 'border-[var(--border-default)] hover:border-amber-500/50'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-600/50 text-amber-800 dark:text-[color:var(--brand-cobalt-text)] rounded">
                            {TIPO_PARCERIA_LABELS[parceria.tipo]}
                          </span>
                          {parceria.id?.startsWith('pending-') && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.3)' }}>
                              pendente
                            </span>
                          )}
                          {(() => {
                            const pMun = parceria.municipio ?? '';
                            const bairroNome = isMunBairro(pMun) ? getMunBairroNome(pMun)
                              : isMgBairro(pMun) ? getMgBairroNome(pMun)
                              : null;
                            return bairroNome ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={{ background: 'rgba(56,189,248,0.15)', color: 'var(--acento-azul)', border: '1px solid rgba(56,189,248,0.3)' }}>
                                bairro: {bairroNome}
                              </span>
                            ) : null;
                          })()}
                          <span className="text-[color:var(--text-primary)] text-sm font-medium truncate">{parceria.nome}</span>
                          {parceria.responsavel && (
                            <span className="text-slate-600 dark:text-slate-500 text-xs">({parceria.responsavel})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowModal(false);
                              editParceria(parceria);
                            }}
                            className="p-1.5 text-[color:var(--brand-cobalt)] hover:text-[color:var(--brand-cobalt-text)] hover:bg-cyan-900/30 rounded transition-colors"
                            title="Editar parceria"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteParceria(parceria.id!);
                            }}
                            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
                            title="Excluir parceria"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {/* Metas da parceria */}
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1">
                          <Shield className="h-3 w-3 text-[color:var(--brand-cobalt)]" />
                          <span className="text-slate-600 dark:text-slate-400">Cons:</span>
                          <span className="text-[color:var(--brand-cobalt)] font-medium">{parceria.metaConservadora.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Gauge className="h-3 w-3 text-[color:var(--brand-cobalt)]" />
                          <span className="text-slate-600 dark:text-slate-400">Poss:</span>
                          <span className="text-[color:var(--brand-cobalt)] font-medium">{parceria.metaPossivel.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Rocket className="h-3 w-3 text-[color:var(--success)]" />
                          <span className="text-slate-600 dark:text-slate-400">Arroj:</span>
                          <span className="text-[color:var(--success)] font-medium">{parceria.metaArrojada.toLocaleString()}</span>
                        </div>
                        {parceria.impactoEstimado > 0 && (
                          <div className="ml-auto text-slate-600 dark:text-slate-500">
                            Est: {parceria.impactoEstimado.toLocaleString()} votos
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-600 dark:text-slate-400 text-sm text-center py-2">
                  Nenhuma parceria cadastrada neste município
                </p>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => { setShowModal(false); setSelectedMapMunicipio(null); }}
                variant="outline"
                className="flex-1 border-[var(--border-default)] text-slate-700 dark:text-slate-300"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  updateMunicipioMetas(
                    selectedMunicipio.nome,
                    metaConservadoraTemp,
                    metaPossivelTemp,
                    metaArrojadaTemp,
                    prioridadeTemp,
                    dobradaAtivaTemp,
                    dobradaNomeTemp,
                    dobradaPartidoTemp,
                    dobradaObservacoesTemp
                  );
                  setShowModal(false);
                  setSelectedMapMunicipio(null);
                }}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-green-500"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Salvar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Municipality Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Adicionar Município"
        dark
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Adicione um município para projetar votos.
          </p>

          <div>
            <label className="text-slate-600 dark:text-slate-400 text-sm mb-2 block">Buscar Município</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600 dark:text-slate-400" />
              <input
                type="text"
                placeholder="Digite para filtrar..."
                value={filtroMunicipios}
                onChange={(e) => setFiltroMunicipios(e.target.value)}
                className="w-full bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded-lg pl-9 pr-3 py-2 text-sm text-[color:var(--text-primary)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="max-h-40 overflow-y-auto bg-[var(--bg-card-subtle)]/50 rounded-lg border border-[var(--border-default)]">
            {municipiosDisponiveis.length === 0 ? (
              <div className="p-4 text-center text-slate-600 dark:text-slate-400 text-sm">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Carregando municípios...
              </div>
            ) : (
              municipiosDisponiveis
                .filter(m =>
                  filtroMunicipios === '' ||
                  m.toLowerCase().includes(filtroMunicipios.toLowerCase())
                )
                .filter(m => {
                  if (!projecao) return true;
                  return !projecao.municipios.some(
                    pm => pm.municipio.toUpperCase() === m.toUpperCase()
                  );
                })
                .slice(0, 50)
                .map((mun) => (
                  <button
                    key={mun}
                    onClick={() => setNovoMunicipioNome(mun)}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      novoMunicipioNome === mun
                        ? 'bg-cyan-600 text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {mun}
                  </button>
                ))
            )}
          </div>

          {novoMunicipioNome && (
            <div className="bg-[var(--bg-card-subtle)]/50 rounded-lg p-3 border border-cyan-500/30">
              <p className="text-[color:var(--brand-cobalt)] text-sm font-medium">
                <MapPin className="h-4 w-4 inline mr-1" />
                Selecionado: {novoMunicipioNome}
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-amber-50 dark:bg-amber-500/20 rounded-lg p-3 border border-amber-400/70 dark:border-amber-400/50">
              <div className="flex items-center gap-1 mb-2">
                <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-amber-700 dark:text-amber-300 text-xs font-semibold">Conservadora</span>
              </div>
              <Input
                type="number"
                value={novoMetaConservadora}
                onChange={(e) => setNovoMetaConservadora(parseInt(e.target.value) || 0)}
                className="bg-white dark:bg-[var(--bg-card-subtle)] border-amber-400/60 text-[color:var(--text-primary)]"
              />
            </div>
            <div className="bg-cyan-50 dark:bg-cyan-500/20 rounded-lg p-3 border border-cyan-400/70 dark:border-cyan-400/50">
              <div className="flex items-center gap-1 mb-2">
                <Gauge className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                <span className="text-cyan-700 dark:text-cyan-300 text-xs font-semibold">Realista</span>
              </div>
              <Input
                type="number"
                value={novoMetaPossivel}
                onChange={(e) => setNovoMetaPossivel(parseInt(e.target.value) || 0)}
                className="bg-white dark:bg-[var(--bg-card-subtle)] border-cyan-400/60 text-[color:var(--text-primary)]"
              />
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-500/20 rounded-lg p-3 border border-emerald-400/70 dark:border-emerald-400/50">
              <div className="flex items-center gap-1 mb-2">
                <Rocket className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-700 dark:text-emerald-300 text-xs font-semibold">Otimista</span>
              </div>
              <Input
                type="number"
                value={novoMetaArrojada}
                onChange={(e) => setNovoMetaArrojada(parseInt(e.target.value) || 0)}
                className="bg-white dark:bg-[var(--bg-card-subtle)] border-emerald-400/60 text-[color:var(--text-primary)]"
              />
            </div>
          </div>

          <Select
            label="Prioridade"
            value={novoMunicipioPrioridade}
            onChange={(e) => setNovoMunicipioPrioridade(e.target.value)}
            options={prioridadeOptions}
            className="bg-[var(--bg-card-subtle)] border-[var(--border-default)] text-[color:var(--text-primary)]"
          />

          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => setShowAddModal(false)}
              variant="outline"
              className="flex-1 border-[var(--border-default)] text-slate-700 dark:text-slate-300"
            >
              Cancelar
            </Button>
            <Button
              onClick={addNovoMunicipio}
              disabled={!novoMunicipioNome}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-green-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de Seleção de Candidatos */}
      <Modal
        isOpen={showCandidatoModal}
        onClose={() => setShowCandidatoModal(false)}
        title="Selecione o Candidato"
        dark
        size="xl"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-amber-900/30 border border-amber-500/30 rounded-lg">
            <Users className="h-5 w-5 text-[color:var(--brand-cobalt)]" />
            <p className="text-[color:var(--brand-cobalt-text)] text-sm">{mensagemMultiplos}</p>
          </div>

          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {candidatosMultiplos.map((candidato) => (
              <div
                key={candidato.id}
                onClick={() => selectCandidato(candidato)}
                className="p-4 bg-[var(--bg-card-subtle)]/50 border border-[var(--border-default)] rounded-lg cursor-pointer hover:border-cyan-500 hover:bg-[var(--bg-card-subtle)] transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <UserCheck className="h-5 w-5 text-[color:var(--brand-cobalt)]" />
                      <span className="text-[color:var(--text-primary)] font-semibold">{candidato.nomeUrna}</span>
                      <Badge variant="info" className="text-xs">{candidato.numero}</Badge>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 text-sm mb-1">{candidato.nome}</p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="default" className="bg-slate-600">{candidato.partido}</Badge>
                      <Badge variant={(candidato.cargo ?? '').toUpperCase().includes('VEREADOR') ? 'warning' : 'success'}>
                        {candidato.cargo}
                      </Badge>
                      {(candidato.cargo ?? '').toUpperCase().includes('VEREADOR') && (
                        <Badge variant="info" className="bg-purple-600">
                          <MapPin className="h-3 w-3 mr-1" />
                          {candidato.municipioCandidatura}
                        </Badge>
                      )}
                      <Badge variant="default" className="bg-slate-500">{candidato.ano}</Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[color:var(--brand-cobalt)] font-bold text-lg">
                      {candidato.totalVotos.toLocaleString()}
                    </p>
                    <p className="text-slate-600 dark:text-slate-500 text-xs">votos</p>
                  </div>
                </div>
                {!(candidato.cargo ?? '').toUpperCase().includes('VEREADOR') && candidato.municipioPrincipal !== 'N/A' && (
                  <div className="mt-2 pt-2 border-t border-[var(--border-default)]">
                    <p className="text-slate-600 dark:text-slate-500 text-xs">
                      Maior votação em: <span className="text-slate-700 dark:text-slate-300">{candidato.municipioPrincipal}</span>
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => setShowCandidatoModal(false)}
              variant="outline"
              className="border-[var(--border-default)] text-slate-700 dark:text-slate-300"
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal — Novo Candidato sem histórico */}
      <Modal
        isOpen={showNovoCandidatoModal}
        onClose={() => setShowNovoCandidatoModal(false)}
        title="Novo Candidato (Sem Histórico Eleitoral)"
        size="md"
        dark
      >
        <div className="space-y-5">
          {/* Banner informativo */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.25)' }}>
            <UserCheck className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#2563EB' }} />
            <p className="text-sm leading-relaxed" style={{ color: '#c9b96a' }}>
              Cria uma projeção em branco para um candidato que ainda não disputou eleições.
              Os municípios e metas serão adicionados manualmente.
            </p>
          </div>

          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Nome do Candidato <span style={{ color: '#2563EB' }}>*</span></label>
            <input
              value={novoCandidatoNome}
              onChange={(e) => setNovoCandidatoNome(e.target.value)}
              placeholder="Nome completo"
              className="w-full rounded-xl px-3.5 py-2.5 text-sm text-[color:var(--text-primary)] outline-none transition-all"
              style={{ background: 'var(--bg-card)', border: '1.5px solid rgba(37,99,235,0.2)', color: 'var(--text-primary)' }}
              onFocus={e => { e.target.style.borderColor = 'rgba(37,99,235,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.08)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(37,99,235,0.2)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          {/* Partido + UF */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Partido</label>
              <input
                value={novoCandidatoPartido}
                onChange={(e) => setNovoCandidatoPartido(e.target.value)}
                placeholder="Ex: PSD, PT, MDB..."
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all"
                style={{ background: 'var(--bg-card)', border: '1.5px solid rgba(37,99,235,0.2)', color: 'var(--text-primary)' }}
                onFocus={e => { e.target.style.borderColor = 'rgba(37,99,235,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.08)'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(37,99,235,0.2)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase mb-1.5" style={{ color: 'var(--text-tertiary)' }}>UF <span style={{ color: '#2563EB' }}>*</span></label>
              <select
                value={novoCandidatoUf}
                onChange={(e) => setNovoCandidatoUf(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all"
                style={{ background: 'var(--bg-card)', border: '1.5px solid rgba(37,99,235,0.2)', color: 'var(--text-primary)' }}
              >
                {ESTADOS_BRASIL.map((e) => (
                  <option key={e.sigla} value={e.sigla} style={{ background: 'var(--bg-card)' }}>{e.sigla} — {e.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cargo + Ano */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Cargo <span style={{ color: '#2563EB' }}>*</span></label>
              <select
                value={novoCandidatoCargo}
                onChange={(e) => setNovoCandidatoCargo(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all"
                style={{ background: 'var(--bg-card)', border: '1.5px solid rgba(37,99,235,0.2)', color: 'var(--text-primary)' }}
              >
                {[
                  ['DEPUTADO_FEDERAL', 'Deputado Federal'],
                  ['DEPUTADO_ESTADUAL', 'Deputado Estadual'],
                  ['VEREADOR', 'Vereador'],
                  ['PREFEITO', 'Prefeito'],
                  ['SENADOR', 'Senador'],
                  ['GOVERNADOR', 'Governador'],
                ].map(([v, l]) => (
                  <option key={v} value={v} style={{ background: 'var(--bg-card)' }}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Ano da Projeção <span style={{ color: '#2563EB' }}>*</span></label>
              <select
                value={novoCandidatoAnoProjecao}
                onChange={(e) => setNovoCandidatoAnoProjecao(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all"
                style={{ background: 'var(--bg-card)', border: '1.5px solid rgba(37,99,235,0.2)', color: 'var(--text-primary)' }}
              >
                {['2024','2026','2028','2030'].map((a) => (
                  <option key={a} value={a} style={{ background: 'var(--bg-card)' }}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Município — apenas para Vereador / Prefeito */}
          {(novoCandidatoCargo === 'VEREADOR' || novoCandidatoCargo === 'PREFEITO') && (
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                Município <span style={{ color: '#2563EB' }}>*</span>
              </label>
              <div className="relative">
                <input
                  value={novoCandidatoMunicipioFiltro}
                  onChange={(e) => {
                    setNovoCandidatoMunicipioFiltro(e.target.value);
                    setNovoCandidatoMunicipio('');
                  }}
                  placeholder={novoCandidatoMunicipioOpcoes.length ? 'Buscar município...' : 'Carregando...'}
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all"
                  style={{ background: 'var(--bg-card)', border: `1.5px solid ${novoCandidatoMunicipio ? 'rgba(37,99,235,0.6)' : 'rgba(37,99,235,0.2)'}`, color: 'var(--text-primary)' }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(37,99,235,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.08)'; }}
                  onBlur={e => { e.target.style.borderColor = novoCandidatoMunicipio ? 'rgba(37,99,235,0.6)' : 'rgba(37,99,235,0.2)'; e.target.style.boxShadow = 'none'; }}
                />
                {novoCandidatoMunicipioFiltro && !novoCandidatoMunicipio && novoCandidatoMunicipioOpcoes.length > 0 && (
                  <div
                    className="absolute z-50 w-full mt-1 max-h-44 overflow-y-auto rounded-xl"
                    style={{ background: 'rgba(4,17,31,0.98)', border: '1px solid rgba(37,99,235,0.25)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                  >
                    {novoCandidatoMunicipioOpcoes
                      .filter(m => m.toLowerCase().includes(novoCandidatoMunicipioFiltro.toLowerCase()))
                      .slice(0, 25)
                      .map(m => (
                        <button
                          key={m}
                          type="button"
                          className="w-full text-left px-3.5 py-2 text-sm transition-colors"
                          style={{ color: 'var(--text-primary)' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(37,99,235,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#cbd5e1'; }}
                          onMouseDown={() => {
                            setNovoCandidatoMunicipio(m);
                            setNovoCandidatoMunicipioFiltro(m);
                          }}
                        >
                          {m}
                        </button>
                      ))}
                    {novoCandidatoMunicipioOpcoes.filter(m => m.toLowerCase().includes(novoCandidatoMunicipioFiltro.toLowerCase())).length === 0 && (
                      <p className="px-3.5 py-2.5 text-sm" style={{ color: '#64748b' }}>Nenhum município encontrado</p>
                    )}
                  </div>
                )}
              </div>
              {novoCandidatoMunicipio && (
                <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: '#2563EB' }}>
                  <CheckCircle className="w-3 h-3" /> {novoCandidatoMunicipio}
                </p>
              )}
            </div>
          )}

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--border-default)' }}>
            <button
              onClick={() => setShowNovoCandidatoModal(false)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
            >
              Cancelar
            </button>
            <button
              onClick={criarNovoCandidato}
              disabled={!novoCandidatoNome.trim() || ((novoCandidatoCargo === 'VEREADOR' || novoCandidatoCargo === 'PREFEITO') && !novoCandidatoMunicipio)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 hover:brightness-110"
              style={{ background: 'var(--brand-cobalt)', color: '#FFFFFF', border: 'none' }}
            >
              <Plus className="w-4 h-4" />
              Criar Projeção
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de Detalhes do Bairro */}
      <Modal
        isOpen={showBairroModal}
        onClose={() => setShowBairroModal(false)}
        title={selectedBairro ? `Análise - ${selectedBairro.bairro}` : 'Detalhes do Bairro'}
        dark
        size="lg"
      >
        {selectedBairro && (
          <div className="space-y-4">
            {/* Cabeçalho com categoria */}
            <div className={`p-4 rounded-lg border-2 ${
              getBairroCategory(selectedBairro.votos) === 'acima'
                ? 'bg-emerald-900/30 border-emerald-500/50'
                : getBairroCategory(selectedBairro.votos) === 'abaixo'
                  ? 'bg-[var(--brand-cobalt-soft)] border-[var(--brand-cobalt)]'
                  : 'bg-[var(--bg-card-subtle)]/50 border-[var(--border-default)]'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Home className={`h-6 w-6 ${
                    getBairroCategory(selectedBairro.votos) === 'acima' ? 'text-[color:var(--success)]' :
                    getBairroCategory(selectedBairro.votos) === 'abaixo' ? 'text-blue-400' : 'text-slate-600 dark:text-slate-400'
                  }`} />
                  <span className="text-lg font-semibold text-[color:var(--text-primary)]">{selectedBairro.bairro}</span>
                </div>
                <Badge variant={
                  getBairroCategory(selectedBairro.votos) === 'acima' ? 'success' :
                  getBairroCategory(selectedBairro.votos) === 'abaixo' ? 'info' : 'default'
                } className="text-sm">
                  {getBairroCategory(selectedBairro.votos) === 'acima' ? '🟢 Acima da média' :
                   getBairroCategory(selectedBairro.votos) === 'abaixo' ? '🔵 Abaixo da média' : '⚫ Sem votos'}
                </Badge>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                <MapPin className="h-4 w-4 inline mr-1" />
                {selectedBairro.municipio} • Zonas: {selectedBairro.zonas.join(', ')}
              </p>
            </div>

            {/* Estatísticas */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[var(--bg-card-subtle)]/50 rounded-lg p-4 border border-[var(--border-default)]">
                <div className="flex items-center gap-2 mb-2">
                  <Vote className="h-5 w-5 text-[color:var(--brand-cobalt)]" />
                  <span className="text-slate-600 dark:text-slate-400 text-sm">Votos Recebidos</span>
                </div>
                <p className="text-3xl font-bold text-[color:var(--brand-cobalt)]">
                  {selectedBairro.votos.toLocaleString()}
                </p>
              </div>
              <div className="bg-[var(--bg-card-subtle)]/50 rounded-lg p-4 border border-[var(--border-default)]">
                <div className="flex items-center gap-2 mb-2">
                  <Percent className="h-5 w-5 text-purple-400" />
                  <span className="text-slate-600 dark:text-slate-400 text-sm">% do Total</span>
                </div>
                <p className="text-3xl font-bold text-purple-400">
                  {electoralData?.totalVotos 
                    ? ((selectedBairro.votos / electoralData.totalVotos) * 100).toFixed(1) 
                    : '0'}%
                </p>
              </div>
            </div>

            {/* Metas Sugeridas */}
            <div className="bg-[var(--bg-card-subtle)]/50 rounded-lg p-4 border border-[var(--border-default)]">
              <h4 className="text-[color:var(--text-primary)] font-medium mb-3 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-[color:var(--success)]" />
                Projeções Sugeridas para {anoProjecao}
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-amber-900/20 rounded-lg border border-amber-500/30">
                  <Shield className="h-5 w-5 text-[color:var(--brand-cobalt)] mx-auto mb-1" />
                  <p className="text-[color:var(--brand-cobalt)] text-xs mb-1">Conservadora</p>
                  <p className="text-[color:var(--text-primary)] font-bold">
                    {Math.round(selectedBairro.votos * 1.05).toLocaleString()}
                  </p>
                  <p className="text-[color:var(--brand-cobalt)] text-xs">+5%</p>
                </div>
                <div className="text-center p-3 bg-cyan-900/20 rounded-lg border border-cyan-500/30">
                  <Gauge className="h-5 w-5 text-[color:var(--brand-cobalt)] mx-auto mb-1" />
                  <p className="text-[color:var(--brand-cobalt)] text-xs mb-1">Realista</p>
                  <p className="text-[color:var(--text-primary)] font-bold">
                    {Math.round(selectedBairro.votos * 1.15).toLocaleString()}
                  </p>
                  <p className="text-[color:var(--brand-cobalt)] text-xs">+15%</p>
                </div>
                <div className="text-center p-3 bg-emerald-900/20 rounded-lg border border-emerald-500/30">
                  <Rocket className="h-5 w-5 text-[color:var(--success)] mx-auto mb-1" />
                  <p className="text-[color:var(--success)] text-xs mb-1">Otimista</p>
                  <p className="text-[color:var(--text-primary)] font-bold">
                    {Math.round(selectedBairro.votos * 1.30).toLocaleString()}
                  </p>
                  <p className="text-emerald-500 text-xs">+30%</p>
                </div>
              </div>
            </div>

            {/* Locais de Votação */}
            {selectedBairro.locais && selectedBairro.locais.length > 0 && (
              <div className="bg-[var(--bg-card-subtle)]/50 rounded-lg p-4 border border-[var(--border-default)]">
                <h4 className="text-[color:var(--text-primary)] font-medium mb-3 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-400" />
                  Locais de Votação ({selectedBairro.locais.length})
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedBairro.locais.map((local, idx) => (
                    <div key={idx} className="p-2 bg-[var(--bg-card-subtle)]/50 rounded-lg text-sm">
                      <p className="text-[color:var(--text-primary)] font-medium">{local.nome}</p>
                      <p className="text-slate-600 dark:text-slate-400 text-xs">{local.endereco}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setShowBairroModal(false)}
                variant="outline"
                className="border-[var(--border-default)] text-slate-700 dark:text-slate-300"
              >
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Saved Projections */}
      {projecoesSalvas.length > 0 && !electoralData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-[var(--bg-card-subtle)]/50 border-[var(--border-default)]">
            <CardHeader>
              <CardTitle className="text-[color:var(--text-primary)]">Projeções Salvas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projecoesSalvas.map((proj) => (
                  <Card
                    key={proj.id}
                    className="bg-[var(--bg-card-subtle)]/50 border-[var(--border-default)] cursor-pointer hover:border-cyan-500 transition-colors relative group"
                    onClick={async () => {
                      setCandidateName(proj.candidatoNome);
                      setAno(proj.anoBase.toString());
                      setUf(proj.uf);
                      setAnoProjecao(proj.anoProjecao.toString());
                      setProjecao(proj);
                      const munBase = proj.municipios.filter((m: ProjecaoMunicipio) => !isDfZona(m.municipio) && !isDfRegiao(m.municipio) && !isSpDistrito(m.municipio) && !isRjBairro(m.municipio) && !isCeBairro(m.municipio) && !isMgBairro(m.municipio) && !isMunBairro(m.municipio));
                      const isEstreanteSalvo = munBase.reduce((s: number, m: ProjecaoMunicipio) => s + m.votosBase, 0) === 0;
                      if (isEstreanteSalvo) setActiveTab('projecao');
                      setElectoralData({
                        nome: proj.candidatoNome,
                        partido: '',
                        cargo: proj.cargo || '',
                        totalVotos: munBase.reduce((acc: number, m: ProjecaoMunicipio) => acc + m.votosBase, 0),
                        uf: proj.uf
                      });
                      setFormCollapsed(true);
                      setSelectedDfZona(null);
                      if (proj.id) loadParcerias(proj.id);
                      const cargoSalvo = (proj.cargo ?? '').toUpperCase();
                      const isMunicipalSalvo = cargoSalvo.includes('VEREADOR') || cargoSalvo.includes('PREFEITO');
                      if (isMunicipalSalvo) {
                        // Derivar município imediatamente a partir dos dados salvos
                        const munFromProj = munBase
                          .sort((a, b) => b.metaPossivel - a.metaPossivel || b.votosBase - a.votosBase)[0]?.municipio;
                        if (munFromProj) {
                          setMunicipioVereador(munFromProj);
                          setVisualizacaoMapa('municipio');
                        } else {
                          // Projeção com entradas de bairros (RJ/SP/CE) mas sem municípios diretos
                          const rjBairros = proj.municipios.filter((m: ProjecaoMunicipio) => isRjBairro(m.municipio));
                          const spDistritos = proj.municipios.filter((m: ProjecaoMunicipio) => isSpDistrito(m.municipio));
                          const ceBairros = proj.municipios.filter((m: ProjecaoMunicipio) => isCeBairro(m.municipio));
                          if (rjBairros.length > 0) {
                            setMunicipioVereador('RIO DE JANEIRO');
                            setVisualizacaoMapa('municipio');
                          } else if (spDistritos.length > 0) {
                            setMunicipioVereador('SAO PAULO');
                            setVisualizacaoMapa('municipio');
                          } else if (ceBairros.length > 0) {
                            setMunicipioVereador('FORTALEZA');
                            setVisualizacaoMapa('municipio');
                          }
                        }
                        // Estreantes não têm histórico no TSE: evitar chamada com ano futuro
                        // isEstreanteSalvo é recalculado incluindo entradas de bairros para não bloquear vereadores com projeção por bairro
                        const totalBase = proj.municipios.reduce((s: number, m: ProjecaoMunicipio) => s + m.votosBase, 0);
                        if (totalBase > 0) {
                          loadBairrosVereador(proj.candidatoNome, proj.anoBase, proj.uf);
                        }
                      } else {
                        setBairrosInfo([]);
                        setMediaVotosBairro(0);
                        setVisualizacaoMapa('municipio');
                      }
                      // CE: restaurar visualização de bairros se houver entradas CE_BAIRRO_
                      if (proj.uf === 'CE') {
                        const ceBairroEntries = proj.municipios.filter(m => isCeBairro(m.municipio));
                        if (ceBairroEntries.length > 0) {
                          setCeVisualizacao('bairros');
                        }
                      }
                      // Carregar zonas do DF se necessário
                      if (proj.uf === 'DF') {
                        const zonaEntries = proj.municipios.filter(m => isDfZona(m.municipio));
                        if (zonaEntries.length === 0) {
                          // Projeção salva sem zonas: buscar dados históricos
                          fetch(`/api/tse/zonas?municipio=BRAS%C3%8DLIA&uf=DF&ano=${proj.anoBase}&nome=${encodeURIComponent(proj.candidatoNome)}`)
                            .then(r => r.ok ? r.json() : null)
                            .then(d => {
                              if (d) {
                                setDfZonas(d.locaisPorZona || []);
                                setDfBounds(d.bounds || null);
                              }
                            })
                            .catch(() => {});
                        } else {
                          // Já tem zonas — reconstruir dfZonas a partir dos dados salvos
                          const zonas = zonaEntries.map(m => ({
                            zona: getZonaNumber(m.municipio),
                            latitude: 0,
                            longitude: 0,
                            votos: m.votosBase,
                            bairros: [],
                            locais: [],
                          }));
                          // Buscar coords reais
                          fetch(`/api/tse/zonas?municipio=BRAS%C3%8DLIA&uf=DF&ano=${proj.anoBase}&nome=${encodeURIComponent(proj.candidatoNome)}`)
                            .then(r => r.ok ? r.json() : null)
                            .then(d => {
                              if (d?.locaisPorZona) {
                                setDfZonas(d.locaisPorZona);
                                setDfBounds(d.bounds || null);
                              } else {
                                setDfZonas(zonas);
                              }
                            })
                            .catch(() => setDfZonas(zonas));
                        }
                      } else {
                        setDfZonas([]);
                        setDfBounds(null);
                        // SP: buscar zonas em background para popular spDistritosVotes
                        if (proj.uf === 'SP') {
                          fetch(`/api/tse/candidato?ano=${proj.anoBase}&uf=SP&candidato=${encodeURIComponent(proj.candidatoNome)}`)
                            .then(r => r.ok ? r.json() : null)
                            .then(d => {
                              if (d && !d.multiplos && d.zonas?.length) {
                                setElectoralData(prev => prev ? {
                                  ...prev,
                                  zonas: d.zonas,
                                  candidatoId: d.candidatoId ?? prev.candidatoId,
                                } : prev);
                              }
                            })
                            .catch(() => {});
                        }
                      }
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-5 w-5 text-[color:var(--brand-cobalt)]" />
                        <span className="text-[color:var(--text-primary)] font-medium flex-1">{proj.candidatoNome}</span>
                        <button
                          onClick={(e: MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            setProjecaoParaExcluir({ id: proj.id, nome: proj.candidatoNome });
                            setShowDeleteModal(true);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/20 text-slate-600 dark:text-slate-400 hover:text-red-400"
                          title="Excluir projeção"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {(() => {
                        const munBase = proj.municipios.filter(m =>
                          !isDfZona(m.municipio) && !isDfRegiao(m.municipio) &&
                          !isSpDistrito(m.municipio) && !isRjBairro(m.municipio) &&
                          !isCeBairro(m.municipio) && !isMgBairro(m.municipio) && !isMunBairro(m.municipio)
                        );
                        const isEstreante = munBase.reduce((s, m) => s + m.votosBase, 0) === 0;
                        return (
                          <div className="text-sm text-slate-600 dark:text-slate-400">
                            <p className="flex items-center gap-1 flex-wrap">
                              <span>{proj.uf}</span>
                              <span>•</span>
                              {isEstreante ? (
                                <span className="text-[color:var(--success)] font-medium flex items-center gap-0.5">
                                  <UserCheck className="h-3 w-3" />
                                  Estreante
                                </span>
                              ) : (
                                <span>{proj.anoBase}</span>
                              )}
                              <span>→</span>
                              <span>{proj.anoProjecao}</span>
                            </p>
                            <p>{munBase.length} municípios</p>
                            {proj.municipios.filter(m => m.dobradaAtiva).length > 0 && (
                              <p className="text-blue-400 flex items-center gap-1 mt-1">
                                <Handshake className="h-3 w-3" />
                                {proj.municipios.filter(m => m.dobradaAtiva).length} dobradas
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Modal de Parceria */}
      <Modal
        isOpen={showParceriaModal}
        dark
        onClose={() => {
          setShowParceriaModal(false);
          setSelectedParceria(null);
        }}
        title={`${selectedParceria ? 'Editar' : 'Nova'} Parceria - ${municipioParaParceria}${bairroParaParceria ? ` (${bairroParaParceria})` : ''}`}
        size="lg"
      >
        <div className="space-y-4">
          {/* Nome */}
          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Nome da Parceria *</label>
            <input
              type="text"
              value={parceriaForm.nome || ''}
              onChange={(e) => setParceriaForm(prev => ({ ...prev, nome: e.target.value }))}
              placeholder="Ex: Igreja São José, ONG Vida Nova..."
              className="w-full bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[color:var(--text-primary)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Tipo de Parceria *</label>
            <select
              value={parceriaForm.tipo || 'LIDERANCA'}
              onChange={(e) => setParceriaForm(prev => ({ ...prev, tipo: e.target.value as TipoParceria }))}
              className="w-full bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[color:var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {Object.entries(TIPO_PARCERIA_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Responsável e Contato */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Responsável</label>
              <input
                type="text"
                value={parceriaForm.responsavel || ''}
                onChange={(e) => setParceriaForm(prev => ({ ...prev, responsavel: e.target.value }))}
                placeholder="Nome do contato"
                className="w-full bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[color:var(--text-primary)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Contato</label>
              <input
                type="text"
                value={parceriaForm.contato || ''}
                onChange={(e) => setParceriaForm(prev => ({ ...prev, contato: e.target.value }))}
                placeholder="Telefone ou email"
                className="w-full bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[color:var(--text-primary)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Impacto Estimado */}
          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Impacto Estimado (votos)</label>
            <input
              type="number"
              value={parceriaForm.impactoEstimado || 0}
              onChange={(e) => setParceriaForm(prev => ({ ...prev, impactoEstimado: parseInt(e.target.value) || 0 }))}
              min={0}
              className="w-full bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[color:var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Metas */}
          <div className="bg-[var(--bg-card-subtle)]/50 rounded-lg p-4 border border-[var(--border-default)]">
            <h4 className="text-[color:var(--text-primary)] font-medium mb-3 flex items-center gap-2">
              <Target className="h-4 w-4 text-[color:var(--brand-cobalt)]" />
              Metas da Parceria
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="p-3 bg-[var(--bg-card-subtle)] rounded-lg border border-[var(--border-default)]">
                  <Shield className="h-5 w-5 text-slate-600 dark:text-slate-400 mx-auto mb-1" />
                  <p className="text-slate-600 dark:text-slate-400 text-xs mb-1">Conservadora</p>
                  <input
                    type="number"
                    value={parceriaForm.metaConservadora || 0}
                    onChange={(e) => setParceriaForm(prev => ({ ...prev, metaConservadora: parseInt(e.target.value) || 0 }))}
                    min={0}
                    className="w-full bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded px-2 py-1 text-[color:var(--text-primary)] text-center text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>
              <div className="text-center">
                <div className="p-3 bg-amber-900/30 rounded-lg border border-amber-500/50">
                  <Gauge className="h-5 w-5 text-[color:var(--brand-cobalt)] mx-auto mb-1" />
                  <p className="text-[color:var(--brand-cobalt)] text-xs mb-1">Realista</p>
                  <input
                    type="number"
                    value={parceriaForm.metaPossivel || 0}
                    onChange={(e) => setParceriaForm(prev => ({ ...prev, metaPossivel: parseInt(e.target.value) || 0 }))}
                    min={0}
                    className="w-full bg-[var(--bg-card-subtle)] border border-amber-500/50 rounded px-2 py-1 text-[color:var(--text-primary)] text-center text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>
              <div className="text-center">
                <div className="p-3 bg-[var(--bg-card-subtle)] rounded-lg border border-[var(--border-default)]">
                  <Rocket className="h-5 w-5 text-[color:var(--success)] mx-auto mb-1" />
                  <p className="text-[color:var(--success)] text-xs mb-1">Otimista</p>
                  <input
                    type="number"
                    value={parceriaForm.metaArrojada || 0}
                    onChange={(e) => setParceriaForm(prev => ({ ...prev, metaArrojada: parseInt(e.target.value) || 0 }))}
                    min={0}
                    className="w-full bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded px-2 py-1 text-[color:var(--text-primary)] text-center text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Observações</label>
            <textarea
              value={parceriaForm.observacoes || ''}
              onChange={(e) => setParceriaForm(prev => ({ ...prev, observacoes: e.target.value }))}
              placeholder="Notas sobre a parceria..."
              rows={3}
              className="w-full bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[color:var(--text-primary)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              onClick={() => setShowParceriaModal(false)}
              variant="outline"
              className="border-[var(--border-default)] text-slate-700 dark:text-slate-300"
            >
              Cancelar
            </Button>
            <Button
              onClick={saveParceria}
              disabled={savingParceria}
              loading={savingParceria}
              style={{ background: 'var(--brand-cobalt)', color: '#FFFFFF', border: 'none' }}
            >
              {!savingParceria && <CheckCircle className="h-4 w-4 mr-2" />}
              {savingParceria ? 'Salvando…' : 'Salvar Parceria'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal — Confirmação de Exclusão de Projeção */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setProjecaoParaExcluir(null); }}
        title="Excluir Projeção"
        size="sm"
        dark
      >
        <div className="flex flex-col items-center gap-5 py-2">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/15 border border-red-500/30">
            <Trash2 className="h-7 w-7 text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-[color:var(--text-primary)] font-medium text-base mb-1">
              Tem certeza que deseja excluir?
            </p>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Projeção de <span className="text-[color:var(--text-primary)] font-semibold">{projecaoParaExcluir?.nome}</span> será removida permanentemente.
            </p>
          </div>
          <div className="flex gap-3 w-full pt-1">
            <Button
              variant="outline"
              className="flex-1 border-[var(--border-default)] text-slate-700 dark:text-slate-300 hover:bg-[var(--bg-card-subtle)]"
              onClick={() => { setShowDeleteModal(false); setProjecaoParaExcluir(null); }}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-500 text-[color:var(--text-primary)]"
              onClick={async () => {
                if (!projecaoParaExcluir) return;
                const res = await fetch(`/api/projecoes?id=${projecaoParaExcluir.id}`, { method: 'DELETE' });
                if (res.ok) {
                  setProjecoesSalvas((prev: Projecao[]) => prev.filter((p: Projecao) => p.id !== projecaoParaExcluir.id));
                  if (projecao?.id === projecaoParaExcluir.id) setProjecao(null);
                  toast.success('Projeção excluída com sucesso!');
                } else {
                  const errData = await res.json().catch(() => ({}));
                  toast.error((errData as any)?.error || 'Erro ao excluir projeção');
                }
                setShowDeleteModal(false);
                setProjecaoParaExcluir(null);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmRemoveMun}
        title={`Remover ${confirmRemoveMun}?`}
        message="Este município será removido da projeção de campanha."
        confirmLabel="Sim, remover"
        variant="danger"
        onConfirm={doRemoveMunicipio}
        onCancel={() => setConfirmRemoveMun(null)}
      />

      <ConfirmDialog
        open={!!confirmDeleteParceria}
        title="Remover parceria?"
        message="Esta parceria será excluída permanentemente da projeção."
        confirmLabel="Sim, remover"
        variant="danger"
        onConfirm={doDeleteParceria}
        onCancel={() => setConfirmDeleteParceria(null)}
      />
    </div>
  );
}
