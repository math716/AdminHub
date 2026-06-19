'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import {
  Map,
  Search,
  Star,
  ArrowLeft,
  User,
  Calendar,
  Vote,
  MapPin,
  Loader2,
  ChevronRight,
  Globe,
  Building2,
  Home as HomeIcon,
  Layers,
  X,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ESTADOS_BRASIL } from '@/lib/types';
import { hasBairrosPoligonos } from '@/lib/geojson-manifest';
import type { FocusZonaRequest } from '@/components/maps/municipio-map';

// Mapeamento zona eleitoral → distrito municipal de SP
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

const BrazilMap = dynamic(() => import('@/components/maps/brazil-map'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center rounded-lg" style={{ background: 'var(--bg-card-subtle)' }}>
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#4a9ede' }} />
    </div>
  )
});

const StateMap = dynamic(() => import('@/components/maps/state-map'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center rounded-lg" style={{ background: 'var(--bg-card-subtle)' }}>
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#4a9ede' }} />
    </div>
  )
});

const MunicipioMap = dynamic(() => import('@/components/maps/municipio-map'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-[var(--bg-card-subtle)]/50 rounded-lg">
      <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
    </div>
  )
});

const DfRegioesMap = dynamic(() => import('@/components/maps/df-regioes-map'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center rounded-lg" style={{ background: 'var(--bg-card-subtle)' }}>
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#4a9ede' }} />
    </div>
  )
});

const SpDistritosMap = dynamic(() => import('@/components/maps/sp-distritos-map'), { ssr: false });
const RjBairrosMap   = dynamic(() => import('@/components/maps/rj-bairros-map'),   { ssr: false });
const CeBairrosMap   = dynamic(() => import('@/components/maps/ce-bairros-map'),   { ssr: false });
const BairrosPoligonosMap   = dynamic(() => import('@/components/maps/bairros-poligonos-map'),  { ssr: false });

// Fração de votos por zona eleitoral → Bairro do Rio de Janeiro
// Gerado via join espacial entre locais de votação TSE e GeoJSON IPP/Data.Rio
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

interface Favorite {
  id: string;
  candidateName: string;
  ano: number;
  cargo: string;
  uf: string;
}

interface ElectoralData {
  candidatoId?: string;
  candidateName: string;
  nomeUrna?: string;
  numero?: number;
  ano: number;
  cargo: string;
  partido: string;
  situacao?: string;
  uf: string;
  totalVotos: number;
  votosPorMunicipio?: Record<string, number>;
  votosPorNomeMunicipio?: Record<string, number>;
  votosPorEstado?: Record<string, number>;
  zonas?: Array<{ municipio: string; zona: number; votos: number }>;
  fonte?: string;
}

interface CandidatoHomonimo {
  id: string;
  nome: string;
  nomeUrna: string;
  partido: string;
  cargo: string;
  totalVotos: number;
  municipioPrincipal?: string;
}

export default function MapaPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const userRole = (session?.user as any)?.role;
  const userPermissions = (session?.user as any)?.permissions ?? [];
  const canAccess = hasPermission({ role: userRole, permissions: userPermissions }, PERMISSIONS.MAPA_ELEITORAL);

  // Hierarquia de navegação: brasil → estado → municipio
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [view, setView] = useState<'brasil' | 'estado' | 'municipio'>('brasil');
  const [selectedUf, setSelectedUf] = useState('');
  const [selectedStateName, setSelectedStateName] = useState('');
  const [selectedMunicipio, setSelectedMunicipio] = useState<{ codigo: string; nome: string } | null>(null);

  // Search
  const [candidateName, setCandidateName] = useState('');
  const [ano, setAno] = useState('2022');
  const [searchUf, setSearchUf] = useState('BR');
  const [searchEstado, setSearchEstado] = useState('');
  const [searching, setSearching] = useState(false);
  const [loadingVotes, setLoadingVotes] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Data
  const [electoralData, setElectoralData] = useState<ElectoralData | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [candidatosHomonimos, setCandidatosHomonimos] = useState<CandidatoHomonimo[]>([]);
  const [mensagemHomonimos, setMensagemHomonimos] = useState('');

  // Zonas eleitorais do município selecionado
  const [locaisPorZona, setLocaisPorZona] = useState<any[]>([]);
  const [loadingZonas, setLoadingZonas] = useState(false);
  const [zonasSortBy, setZonasSortBy] = useState<'votos' | 'numero'>('votos');
  const [focusZonaReq, setFocusZonaReq] = useState<FocusZonaRequest | null>(null);

  // SP Distritos (São Paulo município)
  const [spVisualizacao, setSpVisualizacao] = useState<'bairros' | 'distritos'>('distritos');
  const [selectedSpDistrito, setSelectedSpDistrito] = useState<string | null>(null);
  const [spDistritosVotes, setSpDistritosVotes] = useState<Record<string, number>>({});

  // RJ Bairros (Rio de Janeiro município)
  const [rjVisualizacao, setRjVisualizacao] = useState<'bairros' | 'zonas'>('bairros');
  const [selectedRjBairro, setSelectedRjBairro] = useState<string | null>(null);
  const [rjBairrosVotes, setRjBairrosVotes] = useState<Record<string, number>>({});

  // CE Bairros (Fortaleza município)
  const [ceVisualizacao, setCeVisualizacao] = useState<'bairros' | 'zonas'>('bairros');
  const [selectedCeBairro, setSelectedCeBairro] = useState<string | null>(null);
  const [ceBairrosVotes, setCeBairrosVotes] = useState<Record<string, number>>({});

  // Bairros polígonos genéricos — todas UFs com GeoJSON IBGE CD2022 (exceto SP-SP/RJ-RJ/CE-Fortaleza especiais)
  const [genVisualizacao, setGenVisualizacao] = useState<'bairros' | 'zonas'>('bairros');
  const [selectedGenBairro, setSelectedGenBairro] = useState<string | null>(null);
  const [genBairrosApiVotes, setGenBairrosApiVotes] = useState<Record<string, number>>({});

  // Região Administrativa do DF selecionada
  const [selectedDfRegiao, setSelectedDfRegiao] = useState<string | null>(null);
  const [dfVisualizacao, setDfVisualizacao] = useState<'bairros' | 'zonas'>('bairros');

  // Votos agregados por RA do DF (calculados via point-in-polygon nas zonas)
  const [dfRegioesVotes, setDfRegioesVotes] = useState<Record<string, number>>({});

  // Bairro selecionado (ao clicar no mapa de bairros)
  const [selectedBairro, setSelectedBairro] = useState<string | null>(null);
  const [selectedBairroVotos, setSelectedBairroVotos] = useState<number>(0);

  // Dados completos dos bairros expostos pelo MunicipioMap (inclui locais com zona)
  type BairroExposedData = { nome: string; votos: number; locais: { zona: number; codLocal: string }[] };
  const [bairrosData, setBairrosData] = useState<BairroExposedData[]>([]);
  const [bairrosLoaded, setBairrosLoaded] = useState(false);

  // votosPorBairro: alimenta as cores do mapa (vem dos dados do MunicipioMap via bairrosData)
  const votosPorBairro = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    bairrosData.forEach((b: BairroExposedData) => { map[b.nome.toUpperCase().trim()] = b.votos; });
    return map;
  }, [bairrosData]);

  // Zonas do bairro selecionado — usa locais do bairro + votos de locaisPorZona
  const zonasDoBairro = useMemo<{ zona: number; votos: number }[]>(() => {
    if (!selectedBairro) return [];

    // 1. Descobrir quais zonas estão neste bairro (via locais do TSE)
    const bairro = bairrosData.find(b => b.nome.toUpperCase().trim() === selectedBairro.toUpperCase().trim());
    let zonasNoBairro: Set<number>;

    if (bairro && bairro.locais.length > 0) {
      zonasNoBairro = new Set(bairro.locais.map((l: { zona: number }) => l.zona));
    } else {
      // Fallback: buscar via locaisPorZona (nome do bairro nos locais/bairros da zona)
      const bairroNorm = selectedBairro.toUpperCase().trim();
      zonasNoBairro = new Set<number>();
      locaisPorZona.forEach((zona: any) => {
        const temNosLocais = (zona.locais || []).some((l: any) => (l.bairro || '').toUpperCase().trim() === bairroNorm);
        const temNoBairros = (zona.bairros || []).some((b: string) => b.toUpperCase().trim() === bairroNorm);
        if (temNosLocais || temNoBairros) zonasNoBairro.add(zona.zona);
      });
    }

    // 2. Buscar os votos de cada zona em locaisPorZona
    const result: { zona: number; votos: number }[] = [];
    zonasNoBairro.forEach(zonaNum => {
      const zonaData = locaisPorZona.find((z: any) => z.zona === zonaNum);
      if (zonaData) result.push({ zona: zonaNum, votos: zonaData.votos });
    });

    return result.sort((a, b) => b.votos - a.votos);
  }, [selectedBairro, bairrosData, locaisPorZona]);

  const handleBairroDataLoaded = useCallback((bairros: BairroExposedData[]) => {
    setBairrosData(bairros);
    setBairrosLoaded(true);
  }, []);

  const handleBairroMapClick = useCallback((bairro: string, votos: number) => {
    setSelectedBairro(prev => prev === bairro ? null : bairro);
    setSelectedBairroVotos(votos);
  }, []);

  // Detecta se o município selecionado é São Paulo capital
  const isSaoPauloCapital = useMemo(() => {
    if (selectedUf !== 'SP' || !selectedMunicipio) return false;
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    return norm(selectedMunicipio.nome) === 'SAO PAULO';
  }, [selectedUf, selectedMunicipio]);

  // ── Auto-busca a partir dos parâmetros de URL (vindo dos Favoritos) ──
  const urlParams = useSearchParams();
  const autoSearchDone = useRef(false);

  useEffect(() => {
    const cp = urlParams.get('candidato');
    const ap = urlParams.get('ano');
    const up = urlParams.get('uf');

    if (!cp || autoSearchDone.current) return;
    autoSearchDone.current = true;

    setCandidateName(cp);
    if (ap) setAno(ap);
    if (up) setSearchEstado(up);

    const run = async () => {
      setSearching(true);
      setSearchError('');
      setCandidatosHomonimos([]);
      setMensagemHomonimos('');

      try {
        const efectiveUf = up || 'BR';
        const yearParam  = ap  || '2022';
        const res  = await fetch(`/api/tse/candidato?${new URLSearchParams({ candidato: cp, ano: yearParam, uf: efectiveUf })}`);
        const data = await res.json();

        if (!res.ok) { setSearchError(data?.error ?? 'Erro ao buscar dados'); return; }

        if (data?.multiplos) {
          setCandidatosHomonimos(data.candidatos ?? []);
          setMensagemHomonimos(data.mensagem ?? 'Selecione um candidato:');
          return;
        }

        let finalData = data;
        if (up) {
          try {
            const brRes = await fetch(`/api/tse/candidato?${new URLSearchParams({ candidato: cp, ano: yearParam, uf: 'BR' })}`);
            if (brRes.ok) {
              const brData = await brRes.json();
              if (!brData.multiplos && brData.votosPorEstado && Object.keys(brData.votosPorEstado).length > 1)
                finalData = { ...data, votosPorEstado: brData.votosPorEstado };
            }
          } catch {}
        }

        setElectoralData(finalData);
        const cargo = (finalData.cargo ?? '').toUpperCase();
        const isMunicipalCargo = cargo.includes('VEREADOR') || cargo.includes('PREFEITO');

        if (up) {
          setSelectedUf(up);
          const estado = ESTADOS_BRASIL?.find((e) => e?.sigla === up);
          setSelectedStateName(estado?.nome ?? up);
          if (isMunicipalCargo) {
            if (!navigateToMunicipio(finalData, up)) setView('estado');
          } else {
            setView('estado');
          }
        } else {
          setView('brasil');
        }
      } catch {
        setSearchError('Erro ao buscar dados eleitorais');
      } finally {
        setSearching(false);
      }
    };

    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Computa votos por distrito usando SP_ZONA_DISTRITO_MAP
  // Força Leaflet a recalcular tamanho ao entrar/sair da tela cheia
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    return () => clearTimeout(t);
  }, [mapFullscreen]);

  useEffect(() => {
    if (!isSaoPauloCapital || !electoralData?.zonas?.length) {
      setSpDistritosVotes({});
      return;
    }
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const distVotes: Record<string, number> = {};
    for (const z of electoralData.zonas) {
      if (norm(z.municipio) !== 'SAO PAULO') continue;
      const distMap = SP_ZONA_DISTRITO_MAP[z.zona];
      if (!distMap || !z.votos) continue;
      for (const [dist, frac] of Object.entries(distMap)) {
        distVotes[dist] = (distVotes[dist] ?? 0) + Math.round(z.votos * frac);
      }
    }
    setSpDistritosVotes(distVotes);
  }, [isSaoPauloCapital, electoralData]);

  const handleSpDistritoClick = useCallback((nome: string) => {
    setSelectedSpDistrito(prev => prev === nome ? null : nome);
  }, []);

  // Detecta se o município selecionado é Rio de Janeiro capital
  const isRioDeJaneiro = useMemo(() => {
    if (selectedUf !== 'RJ' || !selectedMunicipio) return false;
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    return norm(selectedMunicipio.nome) === 'RIO DE JANEIRO';
  }, [selectedUf, selectedMunicipio]);

  // Computa votos por bairro do Rio usando RJ_ZONA_BAIRRO_MAP
  useEffect(() => {
    if (!isRioDeJaneiro || !electoralData?.zonas?.length) {
      setRjBairrosVotes({});
      return;
    }
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const bairroVotes: Record<string, number> = {};
    for (const z of electoralData.zonas) {
      if (norm(z.municipio) !== 'RIO DE JANEIRO') continue;
      const bairroMap = RJ_ZONA_BAIRRO_MAP[z.zona];
      if (!bairroMap || !z.votos) continue;
      for (const [bairro, frac] of Object.entries(bairroMap)) {
        bairroVotes[bairro] = (bairroVotes[bairro] ?? 0) + Math.round(z.votos * frac);
      }
    }
    setRjBairrosVotes(bairroVotes);
  }, [isRioDeJaneiro, electoralData]);

  const handleRjBairroClick = useCallback((nome: string) => {
    setSelectedRjBairro(prev => prev === nome ? null : nome);
  }, []);

  // Detecta se o município selecionado é Fortaleza (CE)
  const isFortalezaCe = useMemo(() => {
    if (selectedUf !== 'CE' || !selectedMunicipio) return false;
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    return norm(selectedMunicipio.nome) === 'FORTALEZA';
  }, [selectedUf, selectedMunicipio]);

  // Computa votos por bairro de Fortaleza usando CE_ZONA_BAIRRO_MAP
  useEffect(() => {
    if (!isFortalezaCe || !electoralData?.zonas?.length) {
      setCeBairrosVotes({});
      return;
    }
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
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
  }, [isFortalezaCe, electoralData]);

  const handleCeBairroClick = useCallback((nome: string) => {
    setSelectedCeBairro(prev => prev === nome ? null : nome);
  }, []);

  // Detecta se o município selecionado tem polígonos IBGE genéricos (exceto SP-SP/RJ-RJ/CE-Fortaleza especiais)
  const isGenPoligonosMunicipio = useMemo(() => {
    if (!selectedMunicipio || !selectedUf) return false;
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const munNorm = norm(selectedMunicipio.nome);
    if (selectedUf === 'SP' && munNorm === 'SAO PAULO') return false;
    if (selectedUf === 'RJ' && munNorm === 'RIO DE JANEIRO') return false;
    if (selectedUf === 'CE' && munNorm === 'FORTALEZA') return false;
    return hasBairrosPoligonos(selectedUf, selectedMunicipio.nome);
  }, [selectedUf, selectedMunicipio]);

  const handleGenBairroClick = useCallback((nome: string) => {
    setSelectedGenBairro(prev => prev === nome ? null : nome);
  }, []);

  const selectedCeVotos = useMemo(() => {
    if (!selectedCeBairro) return 0;
    const normCe = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const key = normCe(selectedCeBairro);
    for (const [k, v] of Object.entries(ceBairrosVotes)) {
      if (normCe(k) === key) return v;
    }
    return 0;
  }, [selectedCeBairro, ceBairrosVotes]);

  useEffect(() => {
    if (status === 'authenticated' && !canAccess) {
      router.replace('/dashboard');
    }
  }, [status, canAccess, router]);

  useEffect(() => {
    const fetchFavorites = async () => {
      try {
        const res = await fetch('/api/favorites');
        if (res.ok) {
          const data = await res.json();
          setFavorites(data ?? []);
        }
      } catch {}
    };
    if (canAccess) fetchFavorites();
  }, [canAccess]);

  // Buscar zonas do município (chamado ao entrar na view 'municipio')
  const fetchZonasMunicipio = async (municipioNome: string, dataOverride?: ElectoralData, ufOverride?: string) => {
    const eData = dataOverride ?? electoralData;
    const uf = ufOverride ?? selectedUf;
    if (!eData) { setLocaisPorZona([]); return; }

    const norm = (s: string) =>
      s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

    const munNorm = norm(municipioNome);

    // 1. Tenta dados locais em eData.zonas
    const votosPorZona: Record<number, number> = {};
    for (const z of (eData.zonas ?? [])) {
      if (norm(z.municipio) === munNorm) {
        votosPorZona[z.zona] = (votosPorZona[z.zona] ?? 0) + z.votos;
      }
    }

    if (Object.keys(votosPorZona).length > 0) {
      const lista = Object.entries(votosPorZona)
        .map(([zona, votos]) => ({ zona: Number(zona), votos: Number(votos), bairros: [] as string[], locais: [], latitude: 0, longitude: 0 }))
        .sort((a, b) => b.votos - a.votos);
      setLocaisPorZona(lista);
      return;
    }

    // 2. Fallback: busca via API (candidatos nacionais ou sem match local)
    if (!uf) { setLocaisPorZona([]); return; }
    setLoadingZonas(true);
    try {
      const params = new URLSearchParams({
        municipio: municipioNome,
        uf,
        ano: String(eData.ano),
        // O candidatoId é idêntico nos arquivos BR e estaduais — usar sempre para evitar múltiplos
        ...(eData.candidatoId
          ? { candidatoId: eData.candidatoId }
          : { nome: eData.nomeUrna ?? eData.candidateName }),
      });
      const res = await fetch(`/api/tse/zonas?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLocaisPorZona(data.locaisPorZona ?? []);
      } else {
        setLocaisPorZona([]);
      }
    } catch { setLocaisPorZona([]); }
    finally { setLoadingZonas(false); }
  };

  // Navega direto para o município com mais votos (para cargos municipais)
  const navigateToMunicipio = (data: ElectoralData, uf: string): boolean => {
    const entries = Object.entries(data.votosPorNomeMunicipio ?? {});
    if (entries.length === 0) return false;
    entries.sort(([, a], [, b]) => (b as number) - (a as number));
    const nomeMunicipio = entries[0][0];
    const codigoMunicipio = Object.keys(data.votosPorMunicipio ?? {})[0] ?? '';
    if (!nomeMunicipio) return false;
    setSelectedMunicipio({ codigo: codigoMunicipio, nome: nomeMunicipio });
    setSelectedBairro(null);
    setBairrosLoaded(false);
    setBairrosData([]);
    setSelectedSpDistrito(null);
    setSpVisualizacao('distritos');
    setSelectedRjBairro(null);
    setRjVisualizacao('bairros');
    setSelectedCeBairro(null);
    setCeVisualizacao('bairros');
    setGenVisualizacao('bairros');
    setSelectedGenBairro(null);
    setGenBairrosApiVotes({});
    setView('municipio');
    fetchZonasMunicipio(nomeMunicipio, data, uf);
    return true;
  };

  // Mapeamento pré-calculado: zona eleitoral → { RA: fração_de_votos }
  // Gerado via PiP com os 612 locais de votação do DF (TSE 2022)
  const DF_ZONA_RA_MAP: Record<number, Record<string, number>> = {
    1:  { "Plano Piloto": 1 },
    2:  { "Paranoá": 0.5484, "Lago Norte": 0.2581, "Itapoã": 0.129, "Varjão": 0.0323, "Plano Piloto": 0.0323 },
    3:  { "Taguatinga": 1 },
    4:  { "Santa Maria": 0.9524, "Gama": 0.0476 },
    5:  { "Sobradinho": 0.6383, "Sobradinho II": 0.2766, "Fercal": 0.0638, "Planaltina": 0.0213 },
    6:  { "Planaltina": 1 },
    8:  { "Ceilândia": 1 },
    9:  { "Guará": 0.8485, "SCIA": 0.1515 },
    10: { "Riacho Fundo": 0.2647, "Riacho Fundo II": 0.2941, "Núcleo Bandeirante": 0.2647, "Candangolândia": 0.1471, "Park Way": 0.0294 },
    11: { "Cruzeiro": 0.5, "Sudoeste e Octogonal": 0.3125, "Plano Piloto": 0.125, "SCIA": 0.0625 },
    13: { "Samambaia": 0.9643, "Água Quente": 0.0357 },
    14: { "Plano Piloto": 1 },
    15: { "Taguatinga": 0.4688, "Águas Claras": 0.4375, "Arniqueira": 0.0938 },
    16: { "Brazlândia": 0.5357, "Ceilândia": 0.4107, "Sol Nascente/Pôr do Sol": 0.0536 },
    17: { "Gama": 1 },
    18: { "São Sebastião": 0.5556, "Lago Sul": 0.3056, "Paranoá": 0.0833, "Jardim Botânico": 0.0556 },
    19: { "Taguatinga": 0.6667, "Vicente Pires": 0.3333 },
    20: { "Ceilândia": 0.9444, "Sol Nascente/Pôr do Sol": 0.0556 },
    21: { "Recanto das Emas": 0.6897, "Samambaia": 0.2759 },
  };

  // Agrega votos por RA do DF usando o mapeamento pré-calculado + electoralData.zonas
  useEffect(() => {
    if (selectedUf !== 'DF' || !electoralData) { setDfRegioesVotes({}); return; }

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUf, electoralData]);

  // Popula genBairrosApiVotes via API P-I-P quando município genérico com polígonos é selecionado
  useEffect(() => {
    if (!isGenPoligonosMunicipio || !selectedMunicipio || !selectedUf) { setGenBairrosApiVotes({}); return; }
    const params = new URLSearchParams({ municipio: selectedMunicipio.nome, uf: selectedUf });
    if (electoralData?.candidatoId) {
      params.set('candidatoId', electoralData.candidatoId);
      params.set('ano', String(electoralData.ano));
    }
    fetch(`/api/tse/bairros-poligonos?${params}`)
      .then(r => r.json())
      .then(data => setGenBairrosApiVotes(data.bairroVotes ?? {}))
      .catch(() => setGenBairrosApiVotes({}));
  }, [isGenPoligonosMunicipio, selectedMunicipio, selectedUf, electoralData]);

  const handleStateClick = async (uf: string, name: string) => {
    setSelectedUf(uf);
    setSelectedStateName(name);
    setView('estado');
    setSelectedMunicipio(null);
    setSelectedBairro(null);
    setLocaisPorZona([]);
    setSelectedDfRegiao(null);
    setDfVisualizacao('bairros');
    setBairrosLoaded(false);
    setBairrosData([]);

    if (electoralData?.uf === 'BR' && electoralData?.candidatoId && electoralData?.ano) {
      setLoadingVotes(true);
      try {
        // O candidatoId do BR.json é idêntico nos arquivos estaduais — usar sempre o ID para evitar
        // busca por nome que pode retornar múltiplos resultados (ex: "LULA" em "CELULAR")
        const params = new URLSearchParams({
          uf,
          ano: String(electoralData.ano),
          candidatoId: electoralData.candidatoId,
        });
        const res = await fetch(`/api/tse/candidato?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (!data.multiplos) {
            setElectoralData(prev => prev ? {
              ...prev,
              votosPorMunicipio: data.votosPorMunicipio ?? {},
              votosPorNomeMunicipio: data.votosPorNomeMunicipio ?? {},
              zonas: data.zonas ?? prev.zonas,
            } : prev);
          }
        }
      } catch {}
      finally { setLoadingVotes(false); }
    }
  };

  const handleMunicipioClick = async (codigo: string, nome: string) => {
    if (!electoralData) return;
    setSelectedMunicipio({ codigo, nome });
    setSelectedBairro(null);
    setBairrosLoaded(false);
    setBairrosData([]);
    setSelectedSpDistrito(null);
    setSpVisualizacao('distritos');
    setSelectedRjBairro(null);
    setRjVisualizacao('bairros');
    setSelectedCeBairro(null);
    setCeVisualizacao('bairros');
    setGenVisualizacao('bairros');
    setSelectedGenBairro(null);
    setGenBairrosApiVotes({});
    setView('municipio');
    fetchZonasMunicipio(nome);
  };

  const handleSearch = async () => {
    if (!candidateName?.trim?.()) { setSearchError('Digite o nome do candidato'); return; }
    setSearching(true);
    setSearchError('');
    setCandidatosHomonimos([]);
    setMensagemHomonimos('');

    try {
      const efectiveUf = searchEstado || 'BR';
      const params = new URLSearchParams({ candidato: candidateName, ano, uf: efectiveUf });
      const res = await fetch(`/api/tse/candidato?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) { setSearchError(data?.error ?? 'Erro ao buscar dados'); return; }
      if (data?.multiplos) {
        setCandidatosHomonimos(data.candidatos ?? []);
        setMensagemHomonimos(data.mensagem ?? 'Selecione um candidato:');
        setElectoralData(null);
        return;
      }

      let finalData = data;

      // When a specific state was chosen, also fetch national votosPorEstado so the
      // Brasil view shows all states correctly when the user navigates back.
      if (searchEstado) {
        try {
          const brRes = await fetch(`/api/tse/candidato?${new URLSearchParams({ candidato: candidateName, ano, uf: 'BR' }).toString()}`);
          if (brRes.ok) {
            const brData = await brRes.json();
            if (!brData.multiplos && brData.votosPorEstado && Object.keys(brData.votosPorEstado).length > 1) {
              finalData = { ...data, votosPorEstado: brData.votosPorEstado };
            }
          }
        } catch {}
      }

      setElectoralData(finalData);
      const cargo = finalData.cargo?.toUpperCase() ?? '';
      const isMunicipalCargo = cargo.includes('VEREADOR') || cargo.includes('PREFEITO');

      if (searchEstado) {
        setSelectedUf(searchEstado);
        const estado = ESTADOS_BRASIL?.find?.((e) => e?.sigla === searchEstado);
        setSelectedStateName(estado?.nome ?? searchEstado);
        if (isMunicipalCargo) {
          if (!navigateToMunicipio(finalData, searchEstado)) setView('estado');
        } else {
          setView('estado');
        }
      } else {
        setView('brasil');
      }
    } catch { setSearchError('Erro ao buscar dados eleitorais'); }
    finally { setSearching(false); }
  };

  const handleSelectHomonimo = async (candidatoId: string) => {
    setSearching(true);
    setSearchError('');
    try {
      const efectiveUf = searchEstado || 'BR';
      const params = new URLSearchParams({ candidatoId, ano, uf: efectiveUf });
      const res = await fetch(`/api/tse/candidato?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) { setSearchError(data?.error ?? 'Erro ao buscar dados'); return; }
      setCandidatosHomonimos([]);
      setMensagemHomonimos('');

      let finalData = data;

      if (searchEstado) {
        try {
          const brRes = await fetch(`/api/tse/candidato?${new URLSearchParams({ candidato: candidateName, ano, uf: 'BR' }).toString()}`);
          if (brRes.ok) {
            const brData = await brRes.json();
            if (!brData.multiplos && brData.votosPorEstado && Object.keys(brData.votosPorEstado).length > 1) {
              finalData = { ...data, votosPorEstado: brData.votosPorEstado };
            }
          }
        } catch {}
      }

      setElectoralData(finalData);
      const cargoH = finalData.cargo?.toUpperCase() ?? '';
      const isMunicipalCargoH = cargoH.includes('VEREADOR') || cargoH.includes('PREFEITO');

      if (searchEstado) {
        setSelectedUf(searchEstado);
        const estado = ESTADOS_BRASIL?.find?.((e) => e?.sigla === searchEstado);
        setSelectedStateName(estado?.nome ?? searchEstado);
        if (isMunicipalCargoH) {
          if (!navigateToMunicipio(finalData, searchEstado)) setView('estado');
        } else {
          setView('estado');
        }
      } else {
        setView('brasil');
      }
    } catch { setSearchError('Erro ao buscar dados eleitorais'); }
    finally { setSearching(false); }
  };

  const handleFavoriteClick = async (fav: Favorite) => {
    setCandidateName(fav?.candidateName ?? '');
    setAno(String(fav?.ano ?? 2022));
    setSearchUf(fav?.uf ?? '');
    setSearching(true);
    setSearchError('');
    try {
      const params = new URLSearchParams({ candidato: fav?.candidateName ?? '', ano: String(fav?.ano ?? 2022), uf: fav?.uf ?? '' });
      const res = await fetch(`/api/tse/candidato?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setElectoralData(data);
        const favUf = fav?.uf ?? '';
        setSelectedUf(favUf);
        const estado = ESTADOS_BRASIL?.find?.((e) => e?.sigla === favUf);
        setSelectedStateName(estado?.nome ?? favUf);
        const cargoF = data.cargo?.toUpperCase() ?? '';
        const isMunicipalCargoF = cargoF.includes('VEREADOR') || cargoF.includes('PREFEITO');
        if (isMunicipalCargoF && favUf && favUf !== 'BR') {
          if (!navigateToMunicipio(data, favUf)) setView('estado');
        } else {
          setView('estado');
        }
      }
    } catch {}
    finally { setSearching(false); }
  };

  const handleAddFavorite = async () => {
    if (!electoralData) return;
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateName: electoralData?.candidateName,
          ano: electoralData?.ano,
          cargo: electoralData?.cargo,
          uf: electoralData?.uf ?? searchUf,
        })
      });
      if (res.ok) {
        const newFav = await res.json();
        setFavorites([...(favorites ?? []), newFav]);
      }
    } catch {}
  };

  const isFavorite = electoralData && favorites?.some?.(
    (f) => f?.candidateName === electoralData?.candidateName &&
           f?.ano === electoralData?.ano &&
           f?.uf === (electoralData?.uf ?? searchUf)
  );

  const anoOptions = [
    { value: '2024', label: '2024 - Municipal' },
    { value: '2022', label: '2022 - Federal/Estadual' },
    { value: '2020', label: '2020 - Municipal' },
    { value: '2018', label: '2018 - Federal/Estadual' },
  ];

  if (status === 'loading') return <div className="text-center py-12 text-slate-600 dark:text-slate-400">Carregando...</div>;
  if (!canAccess) return null;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3">
        <PageHeader
          icon={Map}
          title="Mapa Eleitoral"
          subtitle={
            electoralData
              ? `${electoralData.candidateName} — ${electoralData.ano}`
              : 'Busque um candidato para visualizar os votos no mapa'
          }
          actions={
            view !== 'brasil' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (view === 'municipio') {
                    setView('estado');
                    setSelectedMunicipio(null);
                    setSelectedBairro(null);
                    setLocaisPorZona([]);
                  } else {
                    setView('brasil');
                    setSelectedUf('');
                    setSelectedMunicipio(null);
                    setSelectedBairro(null);
                  }
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
            ) : undefined
          }
        />

        {/* Breadcrumb hierárquico */}
        <div className="flex items-center gap-1 text-sm rounded-xl px-4 py-2.5 w-fit flex-wrap"
          style={{ background: 'var(--bg-card)', border: '1px solid rgba(37,99,235,0.13)' }}>
          {/* Brasil */}
          <button
            onClick={() => { setView('brasil'); setSelectedUf(''); setSelectedMunicipio(null); setSelectedBairro(null); setLocaisPorZona([]); }}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all"
            style={view === 'brasil'
              ? { background: 'rgba(74,158,222,0.12)', color: '#4a9ede', fontWeight: 600 }
              : { color: 'var(--tint-45)' }}
          >
            <Globe className="h-3.5 w-3.5" />
            Brasil
          </button>

          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--tint-25)' }} />

          {/* Estado */}
          {view !== 'brasil' ? (
            <button
              onClick={() => { setView('estado'); setSelectedMunicipio(null); setSelectedBairro(null); setLocaisPorZona([]); }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all"
              style={view === 'estado'
                ? { background: 'rgba(74,158,222,0.12)', color: '#4a9ede', fontWeight: 600 }
                : { color: 'var(--tint-45)' }}
            >
              <Layers className="h-3.5 w-3.5" />
              {selectedStateName || 'Estado'}
            </button>
          ) : (
            <span className="flex items-center gap-1.5 px-2 py-1" style={{ color: 'var(--tint-25)' }}>
              <Layers className="h-3.5 w-3.5" />
              Estado
            </span>
          )}

          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--tint-25)' }} />

          {/* Município */}
          {selectedMunicipio ? (
            <button
              onClick={() => { setSelectedBairro(null); }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all"
              style={!selectedBairro
                ? { background: 'rgba(37,99,235,0.12)', color: '#2563EB', fontWeight: 600 }
                : { color: 'var(--tint-45)' }}
            >
              <Building2 className="h-3.5 w-3.5" />
              {selectedMunicipio.nome}
            </button>
          ) : (
            <span className="flex items-center gap-1.5 px-2 py-1" style={{ color: 'var(--tint-25)' }}>
              <Building2 className="h-3.5 w-3.5" />
              Município
            </span>
          )}

          {/* Bairro */}
          {selectedBairro && (
            <>
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--tint-25)' }} />
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg font-semibold"
                style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>
                <HomeIcon className="h-3.5 w-3.5" />
                {selectedBairro}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Sidebar */}
        <div className="lg:col-span-1 h-[750px] overflow-y-auto scrollbar-dark space-y-3">
          {/* Search */}
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--bg-card)', border: '1px solid rgba(74,158,222,0.15)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--tint-06)' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(74,158,222,0.12)', border: '1px solid rgba(74,158,222,0.25)' }}>
                <Search className="h-3.5 w-3.5 text-[#4a9ede]" />
              </div>
              <span className="text-sm font-semibold text-[color:var(--text-primary)]">Buscar Candidato</span>
            </div>

            <div className="space-y-0.5">
              <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#4a7a9b' }}>Nome</p>
              <Input
                placeholder="Ex: João Silva"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>

            <div className="space-y-0.5">
              <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#4a7a9b' }}>Eleição</p>
              <Select
                value={ano}
                onChange={(e) => setAno(e.target.value)}
                options={anoOptions}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#4a7a9b' }}>País</p>
                <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-sm"
                  style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-08)' }}>
                  <Globe className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#4a9ede' }} />
                  <span className="text-[color:var(--text-primary)] font-medium text-xs">Brasil</span>
                </div>
              </div>
              <div className="space-y-0.5">
                <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#4a7a9b' }}>Estado</p>
                <Select
                  value={searchEstado}
                  onChange={(e) => setSearchEstado(e.target.value)}
                  options={[
                    { value: '', label: 'Todos' },
                    ...(ESTADOS_BRASIL?.map?.((e) => ({ value: e?.sigla ?? '', label: e?.sigla ?? '' })) ?? []),
                  ]}
                />
              </div>
            </div>

            {searchError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <span>⚠</span> {searchError}
              </p>
            )}

            <Button className="w-full" onClick={handleSearch} loading={searching}>
              <Search className="h-4 w-4 mr-2" />
              Buscar
            </Button>
          </div>

          {/* Lista de Candidatos Homônimos */}
          <AnimatePresence>
            {candidatosHomonimos.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <User className="h-5 w-5 text-[#4a9ede]" />
                      Selecione o Candidato
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {mensagemHomonimos && <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{mensagemHomonimos}</p>}
                    <div className="max-h-[400px] overflow-y-auto scrollbar-dark space-y-2">
                      {candidatosHomonimos.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleSelectHomonimo(c.id)}
                          disabled={searching}
                          className="w-full text-left p-3 bg-[var(--bg-card-subtle)]/50 hover:bg-[var(--bg-card-subtle)] border border-[var(--border-default)] hover:border-cyan-500 rounded-lg transition-all disabled:opacity-50"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-semibold text-[color:var(--text-primary)]">{c.nomeUrna}</p>
                              <p className="text-xs text-slate-600 dark:text-slate-400">{c.nome}</p>
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                <Badge variant="info" className="text-xs">{c.partido}</Badge>
                                <Badge variant="default" className="text-xs">{c.cargo}</Badge>
                              </div>
                              {c.municipioPrincipal && (
                                <div className="flex items-center gap-1 mt-1 text-xs text-slate-600 dark:text-slate-400">
                                  <MapPin className="h-3 w-3" />
                                  <span>{c.municipioPrincipal}</span>
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-[#1D4ED8]">{c.totalVotos?.toLocaleString('pt-BR')}</p>
                              <p className="text-xs text-slate-600 dark:text-slate-400">votos</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Dados do candidato */}
          <AnimatePresence>
            {electoralData && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <User className="h-5 w-5 text-[#4a9ede]" />
                        Resultado
                      </span>
                      {!isFavorite && (
                        <Button variant="ghost" size="sm" onClick={handleAddFavorite}>
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-lg font-semibold text-[color:var(--text-primary)]">{electoralData?.candidateName}</p>
                      {electoralData?.nomeUrna && electoralData?.nomeUrna !== electoralData?.candidateName && (
                        <p className="text-sm text-slate-600 dark:text-slate-400">Nome de urna: {electoralData?.nomeUrna}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="info">{electoralData?.partido}</Badge>
                        {electoralData?.numero && <Badge variant="default">Nº {electoralData?.numero}</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <Calendar className="h-4 w-4" />
                      {electoralData?.ano} - {electoralData?.cargo}
                    </div>
                    {electoralData?.situacao && (
                      <div className="text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Situação: </span>
                        <span className="font-medium">{electoralData?.situacao}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Vote className="h-4 w-4 text-[#1D4ED8]" />
                      <span className="text-lg font-bold text-[#1D4ED8]">
                        {electoralData?.totalVotos?.toLocaleString?.('pt-BR')} votos
                      </span>
                    </div>
                    {(electoralData as any)?.aviso && (
                      <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                        ⚠️ {(electoralData as any)?.aviso}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Painel do distrito SP selecionado */}
          <AnimatePresence>
            {selectedSpDistrito && isSaoPauloCapital && spVisualizacao === 'distritos' && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
                <Card className="border-violet-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-violet-400" />
                        <span className="text-violet-300 truncate max-w-[150px]" title={selectedSpDistrito}>
                          {selectedSpDistrito}
                        </span>
                      </span>
                      <button
                        onClick={() => setSelectedSpDistrito(null)}
                        className="text-slate-600 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300 transition-colors flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-violet-500/10 rounded-lg border border-violet-500/20">
                      <span className="text-slate-600 dark:text-slate-400 text-xs">Votos no distrito</span>
                      <span className="text-violet-300 font-bold">
                        {(spDistritosVotes[selectedSpDistrito] ?? 0).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    {electoralData?.totalVotos && (spDistritosVotes[selectedSpDistrito] ?? 0) > 0 && (
                      <div className="flex items-center justify-between px-2 py-1">
                        <span className="text-slate-600 dark:text-slate-500 text-xs">% de São Paulo</span>
                        <span className="text-slate-700 dark:text-slate-300 text-xs font-medium">
                          {(((spDistritosVotes[selectedSpDistrito] ?? 0) / electoralData.totalVotos) * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                    <p className="text-slate-600 text-[10px] text-center pt-1">Distrito Municipal — GeoSampa</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Painel da Região Administrativa do DF selecionada */}
          <AnimatePresence>
            {selectedDfRegiao && selectedUf === 'DF' && dfVisualizacao === 'bairros' && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
                <Card className="border-sky-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-sky-400" />
                        <span className="text-sky-300 truncate max-w-[150px]" title={selectedDfRegiao}>
                          {selectedDfRegiao}
                        </span>
                      </span>
                      <button
                        onClick={() => setSelectedDfRegiao(null)}
                        className="text-slate-600 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300 transition-colors flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-sky-500/10 rounded-lg border border-sky-500/20">
                      <span className="text-slate-600 dark:text-slate-400 text-xs">Votos na Região</span>
                      <span className="text-sky-300 font-bold">
                        {(dfRegioesVotes[selectedDfRegiao] ?? 0).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    {electoralData?.totalVotos && (dfRegioesVotes[selectedDfRegiao] ?? 0) > 0 && (
                      <div className="flex items-center justify-between px-2 py-1">
                        <span className="text-slate-600 dark:text-slate-500 text-xs">% do DF</span>
                        <span className="text-slate-700 dark:text-slate-300 text-xs font-medium">
                          {(((dfRegioesVotes[selectedDfRegiao] ?? 0) / electoralData.totalVotos) * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                    <p className="text-slate-600 text-[10px] text-center pt-1">Região Administrativa — DF</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Painel do bairro RJ selecionado */}
          <AnimatePresence>
            {selectedRjBairro && isRioDeJaneiro && rjVisualizacao === 'bairros' && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
                <Card className="border-emerald-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-[color:var(--success)]" />
                        <span className="text-[color:var(--success)] truncate max-w-[150px]" title={selectedRjBairro}>
                          {selectedRjBairro}
                        </span>
                      </span>
                      <button
                        onClick={() => setSelectedRjBairro(null)}
                        className="text-slate-600 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300 transition-colors flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                      <span className="text-slate-600 dark:text-slate-400 text-xs">Votos no bairro</span>
                      <span className="text-[color:var(--success)] font-bold">
                        {(rjBairrosVotes[selectedRjBairro] ?? 0).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    {electoralData?.totalVotos && (rjBairrosVotes[selectedRjBairro] ?? 0) > 0 && (
                      <div className="flex items-center justify-between px-2 py-1">
                        <span className="text-slate-600 dark:text-slate-500 text-xs">% do Rio</span>
                        <span className="text-slate-700 dark:text-slate-300 text-xs font-medium">
                          {(((rjBairrosVotes[selectedRjBairro] ?? 0) / electoralData.totalVotos) * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                    <p className="text-slate-600 text-[10px] text-center pt-1">Bairro — Rio de Janeiro</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Painel do bairro CE selecionado */}
          <AnimatePresence>
            {selectedCeBairro && isFortalezaCe && ceVisualizacao === 'bairros' && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
                <Card className="border-orange-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-orange-400" />
                        <span className="text-orange-300 truncate max-w-[150px]" title={selectedCeBairro}>
                          {selectedCeBairro}
                        </span>
                      </span>
                      <button
                        onClick={() => setSelectedCeBairro(null)}
                        className="text-slate-600 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300 transition-colors flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-orange-500/10 rounded-lg border border-orange-500/20">
                      <span className="text-slate-600 dark:text-slate-400 text-xs">Votos no bairro</span>
                      <span className="text-orange-300 font-bold">
                        {(selectedCeVotos).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    {electoralData?.totalVotos && (selectedCeVotos) > 0 && (
                      <div className="flex items-center justify-between px-2 py-1">
                        <span className="text-slate-600 dark:text-slate-500 text-xs">% de Fortaleza</span>
                        <span className="text-slate-700 dark:text-slate-300 text-xs font-medium">
                          {(((selectedCeVotos) / electoralData.totalVotos) * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                    <p className="text-slate-600 text-[10px] text-center pt-1">Bairro — Fortaleza</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Painel de zonas do bairro selecionado */}
          <AnimatePresence>
            {selectedBairro && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
                <Card className="border-green-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <HomeIcon className="h-4 w-4 text-green-400" />
                        <span className="text-green-300 truncate max-w-[150px]" title={selectedBairro}>
                          {selectedBairro}
                        </span>
                      </span>
                      <button
                        onClick={() => setSelectedBairro(null)}
                        className="text-slate-600 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300 transition-colors flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {/* Total de votos do bairro */}
                    <div className="flex items-center justify-between p-2 bg-green-500/10 rounded-lg border border-green-500/20">
                      <span className="text-slate-600 dark:text-slate-400 text-xs">Total no bairro</span>
                      <span className="text-green-400 font-bold">
                        {selectedBairroVotos.toLocaleString('pt-BR')} votos
                      </span>
                    </div>

                    {/* Zonas do bairro */}
                    {loadingZonas ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-600 dark:text-slate-400 mr-2" />
                        <span className="text-slate-600 dark:text-slate-400 text-xs">Carregando zonas...</span>
                      </div>
                    ) : zonasDoBairro.length > 0 ? (
                      <>
                        <p className="text-xs text-slate-600 dark:text-slate-500 font-medium uppercase tracking-wide">
                          Zonas eleitorais ({zonasDoBairro.length})
                        </p>
                        <div className="space-y-1.5 max-h-[240px] overflow-y-auto scrollbar-dark">
                          {zonasDoBairro.map(({ zona, votos }) => (
                            <div
                              key={zona}
                              className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-card-subtle)]/60 rounded-lg border border-[var(--border-default)]"
                            >
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[color:var(--text-primary)] text-xs font-bold flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1a5fa8, #0f3d6e)' }}>
                                {zona}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-slate-600 dark:text-slate-400 text-[10px]">Zona {zona}</p>
                                <p className="text-[#4a9ede] font-bold text-sm leading-tight">
                                  {votos.toLocaleString('pt-BR')}
                                  <span className="text-slate-600 dark:text-slate-500 font-normal text-[10px] ml-1">votos</span>
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-slate-600 dark:text-slate-500 text-xs text-center py-3">
                        Sem dados de zonas para este bairro.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Favoritos */}
          {(favorites?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Star className="h-5 w-5 text-yellow-500" />
                  Favoritos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {favorites?.map?.((fav) => (
                    <div
                      key={fav?.id}
                      className="flex items-center gap-2 p-3 rounded-xl transition-colors"
                      style={{ background: 'rgba(12,42,79,0.5)', border: '1px solid rgba(37,99,235,0.18)' }}
                    >
                      <button
                        onClick={() => handleFavoriteClick(fav)}
                        className="flex-1 text-left min-w-0"
                      >
                        <p className="font-semibold text-[color:var(--text-primary)] text-sm truncate">{fav?.candidateName}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">{fav?.ano} - {fav?.uf}</p>
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await fetch(`/api/favorites/${fav.id}`, { method: 'DELETE' });
                            setFavorites((prev) => prev.filter((f) => f.id !== fav.id));
                          } catch {}
                        }}
                        title="Remover dos favoritos"
                        className="flex-shrink-0 text-slate-600 dark:text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Mapa principal */}
        <div className={mapFullscreen ? 'fixed inset-0 z-[2000] bg-[var(--bg-card)]' : 'lg:col-span-3'}>
          <Card noPadding className={mapFullscreen ? 'h-full rounded-none border-0' : 'h-[750px]'}>
            <CardContent className="h-full p-1.5 relative">
              {/* Botão tela cheia */}
              <button
                onClick={() => setMapFullscreen(f => !f)}
                className="absolute bottom-3 right-3 z-[1000] bg-[var(--bg-card)]/90 border border-[var(--tint-10)] rounded-lg p-2 text-slate-700 dark:text-slate-300 hover:text-white hover:border-[var(--tint-35)] transition-all shadow-lg"
                title={mapFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              >
                {mapFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              {/* Overlay de carregamento: cobre o mapa enquanto busca votos (BR→estado) */}
              {loadingVotes && (
                <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl"
                     style={{ background: 'var(--bg-card-raised)' }}>
                  <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#4a9ede' }} />
                </div>
              )}
              {view === 'brasil' && (
                <BrazilMap
                  onStateClick={handleStateClick}
                  highlightedStates={electoralData?.votosPorEstado}
                />
              )}

              {view === 'estado' && selectedUf === 'DF' ? (
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-[color:var(--brand-cobalt)]" />
                      <span className="text-[color:var(--brand-cobalt)] font-semibold text-sm">Distrito Federal</span>
                      {dfVisualizacao === 'zonas' && loadingZonas && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-600 dark:text-slate-400" />}
                    </div>
                    <div className="flex items-center bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded-lg p-0.5 text-xs">
                      <button
                        onClick={() => { setDfVisualizacao('bairros'); setSelectedBairro(null); }}
                        className={`px-2.5 py-1 rounded-md font-medium transition-all ${dfVisualizacao === 'bairros' ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'}`}
                        style={dfVisualizacao === 'bairros' ? { background: '#1a73e8' } : {}}
                      >
                        Bairros
                      </button>
                      <button
                        onClick={() => {
                          setDfVisualizacao('zonas');
                          setSelectedDfRegiao(null);
                          setBairrosLoaded(false);
                          setBairrosData([]);
                          fetchZonasMunicipio('BRASÍLIA', undefined, 'DF');
                        }}
                        className={`px-2.5 py-1 rounded-md font-medium transition-all ${dfVisualizacao === 'zonas' ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'}`}
                        style={dfVisualizacao === 'zonas' ? { background: '#1a73e8' } : {}}
                      >
                        Zonas
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0">
                    {dfVisualizacao === 'bairros' && (
                      <div className="h-full flex gap-3">
                        <div className="flex-1 min-w-0">
                          <DfRegioesMap
                            votesData={dfRegioesVotes}
                            selectedRegiao={selectedDfRegiao}
                            onRegiaoClick={(nome) => setSelectedDfRegiao(prev => prev === nome ? null : nome)}
                            height="100%"
                          />
                        </div>
                        <div className="w-48 flex flex-col rounded-xl overflow-hidden"
                          style={{ background: 'var(--bg-card)', border: '1px solid rgba(74,158,222,0.2)' }}>
                          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(74,158,222,0.15)' }}>
                            <Layers className="h-3.5 w-3.5" style={{ color: '#4a9ede' }} />
                            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#4a9ede' }}>Regiões Admin.</span>
                            {Object.keys(dfRegioesVotes).length > 0 && (
                              <span className="text-[10px]" style={{ color: 'var(--tint-35)' }}>{Object.keys(dfRegioesVotes).length}</span>
                            )}
                          </div>
                          <div className="flex-1 overflow-y-auto scrollbar-dark">
                            {Object.keys(dfRegioesVotes).length === 0 ? (
                              <p className="text-slate-600 text-xs text-center py-6 px-2">Sem dados de regiões</p>
                            ) : (
                              Object.entries(dfRegioesVotes)
                                .sort(([, a], [, b]) => b - a)
                                .map(([ra, votos]) => (
                                  <button
                                    key={ra}
                                    onClick={() => setSelectedDfRegiao(prev => prev === ra ? null : ra)}
                                    className="w-full text-left px-3 py-2 transition-colors cursor-pointer hover:bg-[var(--tint-06)]"
                                    style={{
                                      borderBottom: '1px solid rgba(74,158,222,0.1)',
                                      background: selectedDfRegiao === ra ? 'rgba(74,158,222,0.1)' : undefined,
                                    }}
                                  >
                                    <div className="text-[11px] font-semibold truncate"
                                      style={{ color: selectedDfRegiao === ra ? '#7dd3fc' : 'var(--tint-75)' }}>
                                      {ra}
                                    </div>
                                    <div className="font-bold text-sm leading-tight" style={{ color: '#4a9ede' }}>
                                      {(votos as number).toLocaleString('pt-BR')}
                                      <span className="font-normal ml-1 text-[9px]" style={{ color: 'var(--tint-35)' }}>votos</span>
                                    </div>
                                  </button>
                                ))
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {dfVisualizacao === 'zonas' && (
                      <div className="h-full flex gap-3">
                        {(!bairrosLoaded || bairrosData.length > 0) && (
                          <div className="flex-1 min-w-0">
                            <MunicipioMap
                              focusZona={focusZonaReq}
                              municipio="BRASÍLIA"
                              uf="DF"
                              candidatoId={electoralData?.candidatoId}
                              nomeCandidato={electoralData?.nomeUrna || electoralData?.candidateName}
                              ano={electoralData ? String(electoralData.ano) : undefined}
                              votosPorBairro={votosPorBairro}
                              totalVotos={electoralData?.totalVotos}
                              selectedBairro={selectedBairro}
                              showLabels={true}
                              height="100%"
                              onBairroClick={handleBairroMapClick}
                              onDataLoaded={handleBairroDataLoaded}
                            />
                          </div>
                        )}
                        <div className={`flex flex-col rounded-xl overflow-hidden ${(bairrosLoaded && bairrosData.length === 0) ? 'flex-1' : 'w-48'}`}
                          style={{ background: 'var(--bg-card)', border: '1px solid rgba(74,158,222,0.2)' }}>
                          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(74,158,222,0.15)' }}>
                            <Layers className="h-3.5 w-3.5" style={{ color: '#4a9ede' }} />
                            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#4a9ede' }}>Zonas Eleitorais</span>
                            {locaisPorZona.length > 0 && (
                              <span className="text-[10px]" style={{ color: 'var(--tint-35)' }}>{locaisPorZona.length}</span>
                            )}
                            {locaisPorZona.length > 0 && (
                              <button
                                onClick={() => setZonasSortBy(s => s === 'votos' ? 'numero' : 'votos')}
                                className="ml-auto text-[9px] px-1.5 py-0.5 rounded transition-colors"
                                style={{ border: '1px solid rgba(74,158,222,0.25)', color: 'var(--tint-45)' }}
                                title={zonasSortBy === 'votos' ? 'Ordenar por número' : 'Ordenar por votos'}
                              >
                                {zonasSortBy === 'votos' ? '# nº' : '↓ votos'}
                              </button>
                            )}
                          </div>
                          <div className="flex-1 overflow-y-auto scrollbar-dark">
                            {loadingZonas ? (
                              <div className="flex items-center justify-center h-full py-8">
                                <Loader2 className="h-4 w-4 animate-spin text-slate-600 dark:text-slate-500" />
                              </div>
                            ) : locaisPorZona.length === 0 ? (
                              <p className="text-slate-600 text-xs text-center py-6 px-2">Sem dados de zonas</p>
                            ) : bairrosLoaded && bairrosData.length === 0 ? (
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 p-3">
                                {[...locaisPorZona]
                                  .sort((a: any, b: any) => zonasSortBy === 'numero' ? a.zona - b.zona : b.votos - a.votos)
                                  .map((z: any) => (
                                    <button
                                      key={z.zona}
                                      onClick={() => setFocusZonaReq({ zona: z.zona, lat: z.latitude || undefined, lng: z.longitude || undefined, nonce: Date.now() })}
                                      className="rounded-lg px-3 py-2.5 text-center transition-colors cursor-pointer"
                                      style={{ background: 'rgba(74,158,222,0.08)', border: '1px solid rgba(74,158,222,0.2)' }}
                                      title={`Zoom na Zona ${z.zona}`}
                                    >
                                      <div className="text-[10px] mb-0.5" style={{ color: 'var(--tint-45)' }}>Zona {z.zona}</div>
                                      <div className="font-bold text-sm" style={{ color: '#4a9ede' }}>
                                        {(z.votos as number).toLocaleString('pt-BR')}
                                      </div>
                                      <div className="text-[9px]" style={{ color: 'var(--tint-35)' }}>votos</div>
                                    </button>
                                  ))}
                              </div>
                            ) : (
                              [...locaisPorZona]
                                .sort((a: any, b: any) => zonasSortBy === 'numero' ? a.zona - b.zona : b.votos - a.votos)
                                .map((z: any) => (
                                  <button
                                    key={z.zona}
                                    onClick={() => setFocusZonaReq({ zona: z.zona, lat: z.latitude || undefined, lng: z.longitude || undefined, nonce: Date.now() })}
                                    className="w-full text-left px-3 py-2 transition-colors cursor-pointer group hover:bg-[var(--tint-06)]"
                                    style={{ borderBottom: '1px solid rgba(74,158,222,0.1)' }}
                                    title={`Zoom na Zona ${z.zona}`}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="text-[11px] font-semibold transition-colors" style={{ color: 'var(--tint-75)' }}>Zona {z.zona}</span>
                                      <MapPin className="h-2.5 w-2.5 flex-shrink-0 transition-colors" style={{ color: 'rgba(74,158,222,0.4)' }} />
                                    </div>
                                    <div className="font-bold text-sm leading-tight" style={{ color: '#4a9ede' }}>
                                      {(z.votos as number).toLocaleString('pt-BR')}
                                      <span className="font-normal ml-1 text-[9px]" style={{ color: 'var(--tint-35)' }}>votos</span>
                                    </div>
                                  </button>
                                ))
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : view === 'estado' && (
                <StateMap
                  uf={selectedUf}
                  stateName={selectedStateName}
                  votesData={electoralData?.votosPorMunicipio}
                  votesDataByName={electoralData?.votosPorNomeMunicipio}
                  onMunicipioClick={handleMunicipioClick}
                />
              )}

              {view === 'municipio' && selectedMunicipio && (
                <div className="h-full flex flex-col">
                  {/* Subtítulo do município */}
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-[color:var(--brand-cobalt)]" />
                      <span className="text-[color:var(--brand-cobalt)] font-semibold text-sm">{selectedMunicipio.nome}</span>
                      {loadingZonas && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-600 dark:text-slate-400" />}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Toggle distritos/bairros — só para São Paulo */}
                      {isSaoPauloCapital && (
                        <div className="flex items-center bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded-lg p-0.5 text-xs">
                          <button
                            onClick={() => { setSpVisualizacao('distritos'); setSelectedBairro(null); }}
                            className={`px-2.5 py-1 rounded-md font-medium transition-all ${spVisualizacao === 'distritos' ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'}`}
                            style={spVisualizacao === 'distritos' ? { background: '#1a73e8' } : {}}
                          >
                            Bairros
                          </button>
                          <button
                            onClick={() => { setSpVisualizacao('bairros'); setSelectedSpDistrito(null); }}
                            className={`px-2.5 py-1 rounded-md font-medium transition-all ${spVisualizacao === 'bairros' ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'}`}
                            style={spVisualizacao === 'bairros' ? { background: '#1a73e8' } : {}}
                          >
                            Zonas
                          </button>
                        </div>
                      )}
                      {/* Toggle bairros/zonas — só para Rio de Janeiro */}
                      {isRioDeJaneiro && (
                        <div className="flex items-center bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded-lg p-0.5 text-xs">
                          <button
                            onClick={() => { setRjVisualizacao('bairros'); setSelectedBairro(null); }}
                            className={`px-2.5 py-1 rounded-md font-medium transition-all ${rjVisualizacao === 'bairros' ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'}`}
                            style={rjVisualizacao === 'bairros' ? { background: '#059669' } : {}}
                          >
                            Bairros
                          </button>
                          <button
                            onClick={() => { setRjVisualizacao('zonas'); setSelectedRjBairro(null); }}
                            className={`px-2.5 py-1 rounded-md font-medium transition-all ${rjVisualizacao === 'zonas' ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'}`}
                            style={rjVisualizacao === 'zonas' ? { background: '#059669' } : {}}
                          >
                            Zonas
                          </button>
                        </div>
                      )}
                      {/* Toggle bairros/zonas — só para Fortaleza (CE) */}
                      {isFortalezaCe && (
                        <div className="flex items-center bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded-lg p-0.5 text-xs">
                          <button
                            onClick={() => { setCeVisualizacao('bairros'); setSelectedBairro(null); }}
                            className={`px-2.5 py-1 rounded-md font-medium transition-all ${ceVisualizacao === 'bairros' ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'}`}
                            style={ceVisualizacao === 'bairros' ? { background: '#ea580c' } : {}}
                          >
                            Bairros
                          </button>
                          <button
                            onClick={() => { setCeVisualizacao('zonas'); setSelectedCeBairro(null); }}
                            className={`px-2.5 py-1 rounded-md font-medium transition-all ${ceVisualizacao === 'zonas' ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'}`}
                            style={ceVisualizacao === 'zonas' ? { background: '#ea580c' } : {}}
                          >
                            Zonas
                          </button>
                        </div>
                      )}
                      {/* Toggle bairros/zonas — municípios genéricos com GeoJSON IBGE CD2022 */}
                      {isGenPoligonosMunicipio && (
                        <div className="flex items-center bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded-lg p-0.5 text-xs">
                          <button
                            onClick={() => { setGenVisualizacao('bairros'); setSelectedBairro(null); }}
                            className={`px-2.5 py-1 rounded-md font-medium transition-all ${genVisualizacao === 'bairros' ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'}`}
                            style={genVisualizacao === 'bairros' ? { background: '#0284c7' } : {}}
                          >
                            Bairros
                          </button>
                          <button
                            onClick={() => { setGenVisualizacao('zonas'); setSelectedGenBairro(null); }}
                            className={`px-2.5 py-1 rounded-md font-medium transition-all ${genVisualizacao === 'zonas' ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'}`}
                            style={genVisualizacao === 'zonas' ? { background: '#0284c7' } : {}}
                          >
                            Zonas
                          </button>
                        </div>
                      )}
                      {selectedBairro && spVisualizacao === 'bairros' && (
                        <span className="text-xs text-slate-600 dark:text-slate-400">
                          Clique em outro bairro ou no &times; para limpar seleção
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 flex gap-3 min-h-0">
                    {/* Mapa de distritos SP — só para São Paulo capital */}
                    {isSaoPauloCapital && spVisualizacao === 'distritos' && (
                      <>
                        <div className="flex-1 min-w-0">
                          <SpDistritosMap
                            votesData={spDistritosVotes}
                            selectedDistrito={selectedSpDistrito}
                            onDistritoClick={handleSpDistritoClick}
                            height="100%"
                          />
                        </div>
                        <div className="w-48 flex flex-col rounded-xl overflow-hidden"
                          style={{ background: 'var(--bg-card)', border: '1px solid rgba(74,158,222,0.2)' }}>
                          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(74,158,222,0.15)' }}>
                            <Layers className="h-3.5 w-3.5" style={{ color: '#4a9ede' }} />
                            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#4a9ede' }}>Distritos</span>
                            {Object.keys(spDistritosVotes).length > 0 && (
                              <span className="text-[10px]" style={{ color: 'var(--tint-35)' }}>{Object.keys(spDistritosVotes).length}</span>
                            )}
                          </div>
                          <div className="flex-1 overflow-y-auto scrollbar-dark">
                            {Object.keys(spDistritosVotes).length === 0 ? (
                              <p className="text-slate-600 text-xs text-center py-6 px-2">Sem dados de distritos</p>
                            ) : (
                              Object.entries(spDistritosVotes)
                                .sort(([, a], [, b]) => b - a)
                                .map(([dist, votos]) => (
                                  <button
                                    key={dist}
                                    onClick={() => handleSpDistritoClick(dist)}
                                    className="w-full text-left px-3 py-2 transition-colors cursor-pointer hover:bg-[var(--tint-06)]"
                                    style={{
                                      borderBottom: '1px solid rgba(74,158,222,0.1)',
                                      background: selectedSpDistrito === dist ? 'rgba(74,158,222,0.1)' : undefined,
                                    }}
                                  >
                                    <div className="text-[11px] font-semibold truncate"
                                      style={{ color: selectedSpDistrito === dist ? '#7dd3fc' : 'var(--tint-75)' }}>
                                      {dist}
                                    </div>
                                    <div className="font-bold text-sm leading-tight" style={{ color: '#4a9ede' }}>
                                      {(votos as number).toLocaleString('pt-BR')}
                                      <span className="font-normal ml-1 text-[9px]" style={{ color: 'var(--tint-35)' }}>votos</span>
                                    </div>
                                  </button>
                                ))
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Mapa de bairros RJ — só para Rio de Janeiro capital no modo bairros */}
                    {isRioDeJaneiro && rjVisualizacao === 'bairros' && (
                      <>
                        <div className="flex-1 min-w-0">
                          <RjBairrosMap
                            votesData={rjBairrosVotes}
                            selectedBairro={selectedRjBairro}
                            onBairroClick={handleRjBairroClick}
                            height="100%"
                          />
                        </div>
                        <div className="w-48 flex flex-col rounded-xl overflow-hidden"
                          style={{ background: 'var(--bg-card)', border: '1px solid rgba(74,158,222,0.2)' }}>
                          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(74,158,222,0.15)' }}>
                            <MapPin className="h-3.5 w-3.5" style={{ color: '#4a9ede' }} />
                            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#4a9ede' }}>Bairros</span>
                            {Object.keys(rjBairrosVotes).length > 0 && (
                              <span className="text-[10px]" style={{ color: 'var(--tint-35)' }}>{Object.keys(rjBairrosVotes).length}</span>
                            )}
                          </div>
                          <div className="flex-1 overflow-y-auto scrollbar-dark">
                            {Object.keys(rjBairrosVotes).length === 0 ? (
                              <p className="text-slate-600 text-xs text-center py-6 px-2">Sem dados de bairros</p>
                            ) : (
                              Object.entries(rjBairrosVotes)
                                .sort(([, a], [, b]) => b - a)
                                .map(([bairro, votos]) => (
                                  <button
                                    key={bairro}
                                    onClick={() => handleRjBairroClick(bairro)}
                                    className="w-full text-left px-3 py-2 transition-colors cursor-pointer hover:bg-[var(--tint-06)]"
                                    style={{
                                      borderBottom: '1px solid rgba(74,158,222,0.1)',
                                      background: selectedRjBairro === bairro ? 'rgba(74,158,222,0.1)' : undefined,
                                    }}
                                  >
                                    <div className="text-[11px] font-semibold truncate"
                                      style={{ color: selectedRjBairro === bairro ? '#7dd3fc' : 'var(--tint-75)' }}>
                                      {bairro}
                                    </div>
                                    <div className="font-bold text-sm leading-tight" style={{ color: '#4a9ede' }}>
                                      {(votos as number).toLocaleString('pt-BR')}
                                      <span className="font-normal ml-1 text-[9px]" style={{ color: 'var(--tint-35)' }}>votos</span>
                                    </div>
                                  </button>
                                ))
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Mapa de bairros CE — só para Fortaleza no modo bairros */}
                    {isFortalezaCe && ceVisualizacao === 'bairros' && (
                      <>
                        <div className="flex-1 min-w-0">
                          <CeBairrosMap
                            votesData={ceBairrosVotes}
                            selectedBairro={selectedCeBairro}
                            onBairroClick={handleCeBairroClick}
                            height="100%"
                          />
                        </div>
                        <div className="w-48 flex flex-col rounded-xl overflow-hidden"
                          style={{ background: 'var(--bg-card)', border: '1px solid rgba(74,158,222,0.2)' }}>
                          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(74,158,222,0.15)' }}>
                            <MapPin className="h-3.5 w-3.5" style={{ color: '#fb923c' }} />
                            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#fb923c' }}>Bairros</span>
                            {Object.keys(ceBairrosVotes).length > 0 && (
                              <span className="text-[10px]" style={{ color: 'var(--tint-35)' }}>{Object.keys(ceBairrosVotes).length}</span>
                            )}
                          </div>
                          <div className="flex-1 overflow-y-auto scrollbar-dark">
                            {Object.keys(ceBairrosVotes).length === 0 ? (
                              <p className="text-slate-600 text-xs text-center py-6 px-2">Sem dados de bairros</p>
                            ) : (
                              Object.entries(ceBairrosVotes)
                                .sort(([, a], [, b]) => b - a)
                                .map(([bairro, votos]) => (
                                  <button
                                    key={bairro}
                                    onClick={() => handleCeBairroClick(bairro)}
                                    className="w-full text-left px-3 py-2 transition-colors cursor-pointer hover:bg-[var(--tint-06)]"
                                    style={{
                                      borderBottom: '1px solid rgba(74,158,222,0.1)',
                                      background: selectedCeBairro === bairro ? 'rgba(234,88,12,0.15)' : undefined,
                                    }}
                                  >
                                    <div className="text-[11px] font-semibold truncate"
                                      style={{ color: selectedCeBairro === bairro ? '#fb923c' : 'var(--tint-75)' }}>
                                      {bairro}
                                    </div>
                                    <div className="font-bold text-sm leading-tight" style={{ color: '#fb923c' }}>
                                      {(votos as number).toLocaleString('pt-BR')}
                                      <span className="font-normal ml-1 text-[9px]" style={{ color: 'var(--tint-35)' }}>votos</span>
                                    </div>
                                  </button>
                                ))
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Mapa de bairros polígonos genéricos — municípios com GeoJSON IBGE CD2022 (exceto SP-SP/RJ-RJ/CE-Fortaleza) */}
                    {isGenPoligonosMunicipio && genVisualizacao === 'bairros' && (
                      <>
                        <div className="flex-1 min-w-0">
                          <BairrosPoligonosMap
                            municipio={selectedMunicipio.nome}
                            uf={selectedUf}
                            candidatoId={electoralData?.candidatoId}
                            nomeCandidato={electoralData?.nomeUrna || electoralData?.candidateName}
                            ano={electoralData ? String(electoralData.ano) : undefined}
                            votosPorBairro={genBairrosApiVotes}
                            selectedBairro={selectedGenBairro}
                            onBairroClick={(nome) => handleGenBairroClick(nome)}
                            onDataLoaded={(votes) => setGenBairrosApiVotes(votes)}
                            height="100%"
                          />
                        </div>
                        <div className="w-48 flex flex-col rounded-xl overflow-hidden"
                          style={{ background: 'var(--bg-card)', border: '1px solid rgba(74,158,222,0.2)' }}>
                          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(74,158,222,0.15)' }}>
                            <MapPin className="h-3.5 w-3.5" style={{ color: '#38bdf8' }} />
                            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#38bdf8' }}>Bairros</span>
                            {Object.keys(genBairrosApiVotes).length > 0 && (
                              <span className="text-[10px]" style={{ color: 'var(--tint-35)' }}>{Object.keys(genBairrosApiVotes).length}</span>
                            )}
                          </div>
                          <div className="flex-1 overflow-y-auto scrollbar-dark">
                            {Object.keys(genBairrosApiVotes).length === 0 ? (
                              <p className="text-slate-600 text-xs text-center py-6 px-2">Carregando bairros…</p>
                            ) : (
                              Object.entries(genBairrosApiVotes)
                                .sort(([, a], [, b]) => b - a)
                                .map(([bairro, votos]) => {
                                  const norm = (s: string) =>
                                    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
                                  const isSelected = selectedGenBairro ? norm(bairro) === norm(selectedGenBairro) : false;
                                  return (
                                    <button
                                      key={bairro}
                                      onClick={() => handleGenBairroClick(bairro)}
                                      className="w-full text-left px-3 py-2 transition-colors cursor-pointer hover:bg-[var(--tint-06)]"
                                      style={{
                                        borderBottom: '1px solid rgba(74,158,222,0.1)',
                                        background: isSelected ? 'rgba(56,189,248,0.12)' : undefined,
                                      }}
                                    >
                                      <div className="text-[11px] font-semibold truncate"
                                        style={{ color: isSelected ? '#38bdf8' : 'var(--tint-75)' }}>
                                        {bairro}
                                      </div>
                                      <div className="font-bold text-sm leading-tight" style={{ color: '#38bdf8' }}>
                                        {(votos as number).toLocaleString('pt-BR')}
                                        <span className="font-normal ml-1 text-[9px]" style={{ color: 'var(--tint-35)' }}>votos</span>
                                      </div>
                                    </button>
                                  );
                                })
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Mapa de bairros (pins) — para outros municípios ou SP/RJ/CE/MG/gen no modo zonas */}
                    {(!isSaoPauloCapital || spVisualizacao === 'bairros') && (!isRioDeJaneiro || rjVisualizacao === 'zonas') && (!isFortalezaCe || ceVisualizacao === 'zonas') && (!isGenPoligonosMunicipio || genVisualizacao === 'zonas') && (!bairrosLoaded || bairrosData.length > 0) && (
                      <div className="flex-1 min-w-0">
                        <MunicipioMap
                          focusZona={focusZonaReq}
                          municipio={selectedMunicipio.nome}
                          uf={selectedUf || searchUf || electoralData?.uf || ''}
                          candidatoId={electoralData?.candidatoId}
                          nomeCandidato={electoralData?.nomeUrna || electoralData?.candidateName}
                          ano={electoralData ? String(electoralData.ano) : undefined}
                          votosPorBairro={votosPorBairro}
                          totalVotos={electoralData?.totalVotos}
                          selectedBairro={selectedBairro}
                          showLabels={true}
                          height="100%"
                          onBairroClick={handleBairroMapClick}
                          onDataLoaded={handleBairroDataLoaded}
                        />
                      </div>
                    )}

                    {/* Lista de zonas — oculta quando SP/RJ/CE/gen estão no modo bairros/distritos */}
                    {!(isSaoPauloCapital && spVisualizacao === 'distritos') && !(isRioDeJaneiro && rjVisualizacao === 'bairros') && !(isFortalezaCe && ceVisualizacao === 'bairros') && !(isGenPoligonosMunicipio && genVisualizacao === 'bairros') && <div className={`flex flex-col rounded-xl overflow-hidden ${(bairrosLoaded && bairrosData.length === 0 && !isSaoPauloCapital && !isRioDeJaneiro) ? 'flex-1' : 'w-48'}`}
                      style={{ background: 'var(--bg-card)', border: '1px solid rgba(74,158,222,0.2)' }}>
                      <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(74,158,222,0.15)' }}>
                        <Layers className="h-3.5 w-3.5" style={{ color: '#4a9ede' }} />
                        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#4a9ede' }}>Zonas Eleitorais</span>
                        {locaisPorZona.length > 0 && (
                          <span className="text-[10px]" style={{ color: 'var(--tint-35)' }}>{locaisPorZona.length}</span>
                        )}
                        {locaisPorZona.length > 0 && (
                          <button
                            onClick={() => setZonasSortBy(s => s === 'votos' ? 'numero' : 'votos')}
                            className="ml-auto text-[9px] px-1.5 py-0.5 rounded transition-colors"
                            style={{ border: '1px solid rgba(74,158,222,0.25)', color: 'var(--tint-45)' }}
                            title={zonasSortBy === 'votos' ? 'Ordenar por número' : 'Ordenar por votos'}
                          >
                            {zonasSortBy === 'votos' ? '# nº' : '↓ votos'}
                          </button>
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto scrollbar-dark">
                        {loadingZonas ? (
                          <div className="flex items-center justify-center h-full py-8">
                            <Loader2 className="h-4 w-4 animate-spin text-slate-600 dark:text-slate-500" />
                          </div>
                        ) : locaisPorZona.length === 0 ? (
                          <p className="text-slate-600 text-xs text-center py-6 px-2">Sem dados de zonas</p>
                        ) : bairrosLoaded && bairrosData.length === 0 ? (
                          /* Grid expandido quando não há mapa de bairros */
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 p-3">
                            {[...locaisPorZona]
                              .sort((a: any, b: any) => zonasSortBy === 'numero' ? a.zona - b.zona : b.votos - a.votos)
                              .map((z: any) => (
                                <button
                                  key={z.zona}
                                  onClick={() => setFocusZonaReq({ zona: z.zona, lat: z.latitude || undefined, lng: z.longitude || undefined, nonce: Date.now() })}
                                  className="rounded-lg px-3 py-2.5 text-center transition-colors cursor-pointer"
                                  style={{ background: 'rgba(74,158,222,0.08)', border: '1px solid rgba(74,158,222,0.2)' }}
                                  title={`Zoom na Zona ${z.zona}`}
                                >
                                  <div className="text-[10px] mb-0.5" style={{ color: 'var(--tint-45)' }}>Zona {z.zona}</div>
                                  <div className="font-bold text-sm" style={{ color: '#4a9ede' }}>
                                    {(z.votos as number).toLocaleString('pt-BR')}
                                  </div>
                                  <div className="text-[9px]" style={{ color: 'var(--tint-35)' }}>votos</div>
                                </button>
                              ))}
                          </div>
                        ) : (
                          [...locaisPorZona]
                            .sort((a: any, b: any) => zonasSortBy === 'numero' ? a.zona - b.zona : b.votos - a.votos)
                            .map((z: any) => (
                              <button
                                key={z.zona}
                                onClick={() => setFocusZonaReq({ zona: z.zona, lat: z.latitude || undefined, lng: z.longitude || undefined, nonce: Date.now() })}
                                className="w-full text-left px-3 py-2 transition-colors cursor-pointer group hover:bg-[var(--tint-06)]"
                              style={{ borderBottom: '1px solid rgba(74,158,222,0.1)' }}
                                title={`Zoom na Zona ${z.zona}`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[11px] font-semibold transition-colors" style={{ color: 'var(--tint-75)' }}>Zona {z.zona}</span>
                                  <MapPin className="h-2.5 w-2.5 flex-shrink-0 transition-colors" style={{ color: 'rgba(74,158,222,0.4)' }} />
                                </div>
                                <div className="font-bold text-sm leading-tight" style={{ color: '#4a9ede' }}>
                                  {(z.votos as number).toLocaleString('pt-BR')}
                                  <span className="font-normal ml-1 text-[9px]" style={{ color: 'var(--tint-35)' }}>votos</span>
                                </div>
                              </button>
                            ))
                        )}
                      </div>
                    </div>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
