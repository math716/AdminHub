#!/usr/bin/env bash
# Importa os votos por local de votação de um ano, estado por estado:
# baixa o ZIP de seção do TSE, extrai, gera os arquivos por município e apaga
# o bruto (SP sozinho tem 5 GB de CSV por ano). Depois, presidente (anos gerais).
#
#   bash scripts/tse/importar-secao.sh 2026 "AC AL ..."   # UFs opcionais
#
# Pastas: $TSE_DIR (padrão ~/Downloads/tse-downloads)/secao e /locais.
# No Windows, extrai com o tar do sistema (o do Git Bash não abre ZIP).
set -u
ANO="$1"
UFS="${2:-AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO}"
DIR="${TSE_DIR:-$HOME/Downloads/tse-downloads}"
CDN="https://cdn.tse.jus.br/estatistica/sead/odsele"
TAR="tar"; [ -x /c/Windows/System32/tar.exe ] && TAR=/c/Windows/System32/tar.exe
mkdir -p "$DIR/secao" "$DIR/locais"

# O CDN do TSE devolve 429 (muitos pedidos) em rajadas: espera cada vez mais.
baixar() { # url destino
  for t in 1 2 3 4 5 6; do curl -sS --fail --max-time 3600 -o "$2" "$1" && return 0; echo "  tentativa $t falhou: $1"; sleep $((30 * t * t)); done
  return 1
}

# Locais de votação do ano (coordenadas, bairro) — um ZIP com o país.
if ! ls "$DIR/locais/eleitorado_local_votacao_${ANO}"*.csv >/dev/null 2>&1; then
  echo "[$ANO] baixando locais de votação"
  baixar "$CDN/eleitorado_locais_votacao/eleitorado_local_votacao_${ANO}.zip" "$DIR/locais/l_${ANO}.zip" \
    && (cd "$DIR/locais" && "$TAR" -xf "l_${ANO}.zip" && rm -f "l_${ANO}.zip" leiame.pdf)
fi

for UF in $UFS; do
  # O DF não tem eleição municipal (não há arquivo de seção em 2020, 2024...).
  if [ "$UF" = DF ] && [ $(( (ANO - 2020) % 4 )) -eq 0 ]; then continue; fi
  ZIP="$DIR/secao/votacao_secao_${ANO}_${UF}.zip"
  echo "[$ANO $UF] baixando"
  if ! baixar "$CDN/votacao_secao/votacao_secao_${ANO}_${UF}.zip" "$ZIP"; then
    echo "[$ANO $UF] FALHOU o download — pulando"; continue
  fi
  (cd "$DIR/secao" && "$TAR" -xf "$(basename "$ZIP")") && rm -f "$ZIP" "$DIR/secao/leiame.pdf"
  NODE_OPTIONS=--max-old-space-size=12288 npx tsx scripts/tse/secao-to-json.ts --dir "$DIR" --ano "$ANO" --ufs "$UF" 2>&1 \
    | grep -E "→|arquivos|AVISO|SKIP|Error|rror"
  rm -f "$DIR/secao/votacao_secao_${ANO}_${UF}.csv"
done

# Presidente (só anos de eleição geral): arquivo nacional de seção.
if [ $(( (ANO - 2018) % 4 )) -eq 0 ]; then
  echo "[$ANO BR] presidente"
  if baixar "$CDN/votacao_secao/votacao_secao_${ANO}_BR.zip" "$DIR/secao/votacao_secao_${ANO}_BR.zip"; then
    (cd "$DIR/secao" && "$TAR" -xf "votacao_secao_${ANO}_BR.zip") && rm -f "$DIR/secao/votacao_secao_${ANO}_BR.zip"
    NODE_OPTIONS=--max-old-space-size=12288 npx tsx scripts/tse/secao-to-json.ts --dir "$DIR" --ano "$ANO" \
      --ufs "AC,AL,AP,AM,BA,CE,DF,ES,GO,MA,MT,MS,MG,PA,PB,PR,PE,PI,RJ,RN,RS,RO,RR,SC,SP,SE,TO" --presidente 2>&1 | grep -E "presidente|rror"
    rm -f "$DIR/secao/votacao_secao_${ANO}_BR.csv"
  fi
fi
echo "[$ANO] fim"
