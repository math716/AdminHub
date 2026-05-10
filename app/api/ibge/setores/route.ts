import { NextRequest, NextResponse } from 'next/server';

// Cache para setores (24 horas)
const setoresCache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_DURATION = 24 * 60 * 60 * 1000;

// Douglas-Peucker para simplificação
function douglasPeucker(coords: [number, number][], epsilon: number): [number, number][] {
  if (coords.length <= 2) return coords;

  let maxDist = 0;
  let maxIdx = 0;
  
  const start = coords[0];
  const end = coords[coords.length - 1];
  
  for (let i = 1; i < coords.length - 1; i++) {
    const dist = perpendicularDistance(coords[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(coords.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(coords.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  
  return [start, end];
}

function perpendicularDistance(point: [number, number], lineStart: [number, number], lineEnd: [number, number]): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  
  if (dx === 0 && dy === 0) {
    return Math.sqrt(Math.pow(point[0] - lineStart[0], 2) + Math.pow(point[1] - lineStart[1], 2));
  }
  
  const t = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / (dx * dx + dy * dy);
  const closestX = lineStart[0] + t * dx;
  const closestY = lineStart[1] + t * dy;
  
  return Math.sqrt(Math.pow(point[0] - closestX, 2) + Math.pow(point[1] - closestY, 2));
}

function simplifyCoordinates(coords: [number, number][], tolerance: number = 0.0005): [number, number][] {
  if (coords.length <= 4) return coords;
  const simplified = douglasPeucker(coords, tolerance);
  if (simplified.length < 4) {
    const step = Math.floor(coords.length / 4);
    return [coords[0], coords[step], coords[step * 2], coords[step * 3], coords[0]];
  }
  return simplified;
}

function simplifyGeometry(geometry: any, tolerance: number): any {
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map((ring: [number, number][]) => 
        simplifyCoordinates(ring, tolerance)
      )
    };
  } else if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((polygon: [number, number][][]) =>
        polygon.map((ring: [number, number][]) => simplifyCoordinates(ring, tolerance))
      )
    };
  }
  return geometry;
}

function calculateCentroid(geometry: any): [number, number] | null {
  let coords: [number, number][] = [];
  
  if (geometry.type === 'Polygon') {
    coords = geometry.coordinates[0];
  } else if (geometry.type === 'MultiPolygon') {
    coords = geometry.coordinates[0][0];
  }
  
  if (coords.length === 0) return null;
  
  let sumLon = 0, sumLat = 0;
  for (const [lon, lat] of coords) {
    sumLon += lon;
    sumLat += lat;
  }
  return [sumLon / coords.length, sumLat / coords.length];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const codigoMunicipio = searchParams.get('codigo');
  const municipioNome = searchParams.get('municipio');
  const uf = searchParams.get('uf');

  if (!codigoMunicipio && (!municipioNome || !uf)) {
    return NextResponse.json({ 
      error: 'Parâmetro codigo ou (municipio + uf) é obrigatório' 
    }, { status: 400 });
  }

  const cacheKey = codigoMunicipio || `${municipioNome}-${uf}`;
  const cached = setoresCache[cacheKey];
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return NextResponse.json(cached.data);
  }

  try {
    let codMunicipio = codigoMunicipio;
    
    // Se não tem código, buscar pelo nome
    if (!codMunicipio && municipioNome && uf) {
      const UF_CODES: Record<string, string> = {
        'AC': '12', 'AL': '27', 'AP': '16', 'AM': '13', 'BA': '29', 'CE': '23', 'DF': '53',
        'ES': '32', 'GO': '52', 'MA': '21', 'MT': '51', 'MS': '50', 'MG': '31', 'PA': '15',
        'PB': '25', 'PR': '41', 'PE': '26', 'PI': '22', 'RJ': '33', 'RN': '24', 'RS': '43',
        'RO': '11', 'RR': '14', 'SC': '42', 'SP': '35', 'SE': '28', 'TO': '17'
      };
      
      const ufCode = UF_CODES[uf.toUpperCase()];
      if (!ufCode) {
        return NextResponse.json({ error: 'UF inválido' }, { status: 400 });
      }
      
      // Buscar código do município
      const municipiosRes = await fetch(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufCode}/municipios`
      );
      
      if (municipiosRes.ok) {
        const municipios = await municipiosRes.json();
        const found = municipios.find((m: any) => 
          m.nome.toUpperCase() === municipioNome.toUpperCase()
        );
        if (found) {
          codMunicipio = String(found.id);
        }
      }
    }
    
    if (!codMunicipio) {
      return NextResponse.json({ 
        setores: [], 
        geojson: null,
        message: 'Município não encontrado' 
      });
    }

    // Buscar malha de setores censitários do IBGE
    // API: https://servicodados.ibge.gov.br/api/v3/malhas/municipios/{codigo}?formato=application/vnd.geo+json&intrarregiao=setor
    const setoresUrl = `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${codMunicipio}?formato=application/vnd.geo+json&intrarregiao=setor`;
    
    const response = await fetch(setoresUrl, {
      headers: { 'Accept': 'application/geo+json' }
    });

    if (!response.ok) {
      // Tentar sem intrarregião (apenas limite do município)
      return NextResponse.json({ 
        setores: [], 
        geojson: null,
        hasPolygons: false,
        message: 'Setores censitários não disponíveis para este município' 
      });
    }

    const geojsonData = await response.json();
    
    if (!geojsonData.features || geojsonData.features.length === 0) {
      return NextResponse.json({ 
        setores: [], 
        geojson: null,
        hasPolygons: false,
        message: 'Nenhum setor encontrado' 
      });
    }

    // Processar e simplificar features
    const setoresFeatures = geojsonData.features.map((feature: any, index: number) => {
      const codigo = feature.properties?.codsetor || feature.properties?.CD_GEOCODI || `setor_${index + 1}`;
      const nome = `Setor ${String(codigo).slice(-4) || index + 1}`;
      
      // Simplificar geometria para performance
      const simplifiedGeometry = simplifyGeometry(feature.geometry, 0.0003);
      const centroid = calculateCentroid(simplifiedGeometry);
      
      return {
        type: 'Feature',
        properties: {
          nome,
          codigo,
          tipo: 'setor_censitario',
          centroid
        },
        geometry: simplifiedGeometry
      };
    });

    const geojson = {
      type: 'FeatureCollection',
      features: setoresFeatures
    };

    const result = { 
      setores: setoresFeatures.map((f: any) => ({
        nome: f.properties.nome,
        codigo: f.properties.codigo,
        centroid: f.properties.centroid
      })),
      geojson,
      total: setoresFeatures.length,
      hasPolygons: setoresFeatures.length > 0,
      source: 'IBGE Setores Censitários',
      codigoMunicipio: codMunicipio
    };

    setoresCache[cacheKey] = { data: result, timestamp: Date.now() };
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Erro ao buscar setores:', error);
    return NextResponse.json({ 
      setores: [], 
      geojson: null,
      hasPolygons: false,
      message: 'Erro ao buscar setores censitários' 
    });
  }
}
