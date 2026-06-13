#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

const NOMES_EN_PT = {
  "Mexico": "México",
  "South Africa": "África do Sul",
  "South Korea": "Coreia do Sul",
  "Czech Republic": "Tchéquia",
  "Canada": "Canadá",
  "Bosnia and Herzegovina": "Bósnia-Herz.",
  "United States": "Estados Unidos",
  "Paraguay": "Paraguai",
  "Australia": "Austrália",
  "Turkey": "Turquia",
  "Qatar": "Catar",
  "Switzerland": "Suíça",
  "Brazil": "Brasil",
  "Morocco": "Marrocos",
  "Haiti": "Haiti",
  "Scotland": "Escócia",
  "Germany": "Alemanha",
  "Curaçao": "Curaçao",
  "Netherlands": "Países Baixos",
  "Japan": "Japão",
  "Ivory Coast": "Costa do Marfim",
  "Ecuador": "Equador",
  "Sweden": "Suécia",
  "Tunisia": "Tunísia",
  "Spain": "Espanha",
  "Cape Verde": "Cabo Verde",
  "Belgium": "Bélgica",
  "Egypt": "Egito",
  "Saudi Arabia": "Arábia Saudita",
  "Uruguay": "Uruguai",
  "Iran": "Irã",
  "New Zealand": "Nova Zelândia",
  "France": "França",
  "Senegal": "Senegal",
  "Iraq": "Iraque",
  "Norway": "Noruega",
  "Argentina": "Argentina",
  "Algeria": "Argélia",
  "Austria": "Áustria",
  "Jordan": "Jordânia",
  "Portugal": "Portugal",
  "Democratic Republic of the Congo": "RD Congo",
  "England": "Inglaterra",
  "Croatia": "Croácia",
  "Ghana": "Gana",
  "Panama": "Panamá",
  "Uzbekistan": "Uzbequistão",
  "Colombia": "Colômbia",
};

/**
 * Fetch JSON from a URL with HTTPS
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Read local JSON file
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Write JSON to file with pretty formatting
 */
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Main logic
 */
async function main() {
  try {
    const dataDir = path.join(__dirname, '../data');
    const trackerFile = path.join(dataDir, 'next-game-id.json');
    const jogosFile = path.join(dataDir, 'jogos.json');
    const resultadosFile = path.join(dataDir, 'resultados.json');

    // 1. Read local data
    console.log(`[INIT] Iniciando busca de resultados...`);
    const jogosData = readJson(jogosFile);
    const jogosMapeados = jogosData.jogos;
    let resultados = readJson(resultadosFile);
    let tracker = readJson(trackerFile);

    // 2. Fetch ALL games from API
    console.log(`[API] Buscando todos os jogos da API...`);
    let apiGames = [];
    try {
      const apiResp = await fetchUrl('https://worldcup26.ir/get/games');
      apiGames = apiResp.games || [];
      console.log(`[API] Recebidos ${apiGames.length} jogos da API`);
    } catch (err) {
      console.log(`[ERROR] Falha ao buscar API: ${err.message}`);
      console.log(`[RETRY] Tentando novamente em próxima execução`);
      process.exit(0);
    }

    // 3. Build map of API games by team names (Portuguese)
    const apiGamesMap = {};
    for (const apiGame of apiGames) {
      if (apiGame.time_elapsed === 'notstarted') continue;

      const casaPT = NOMES_EN_PT[apiGame.home_team_name_en];
      const foraPT = NOMES_EN_PT[apiGame.away_team_name_en];

      if (!casaPT || !foraPT) {
        console.log(`[WARN] Times sem mapeamento: "${apiGame.home_team_name_en}" ou "${apiGame.away_team_name_en}"`);
        continue;
      }

      apiGamesMap[`${casaPT}|${foraPT}`] = {
        id: parseInt(apiGame.id, 10),
        gols_casa: parseInt(apiGame.home_score, 10),
        gols_fora: parseInt(apiGame.away_score, 10),
        time_elapsed: apiGame.time_elapsed,
      };
    }

    console.log(`[MAP] Criado mapa com ${Object.keys(apiGamesMap).length} jogos`);

    // 4. Find first game without result (or with updated result)
    let jogosProcessados = 0;
    let jogoAtualizado = null;

    for (const jogo of jogosMapeados) {
      const chave = `${jogo.casa}|${jogo.fora}`;
      const resultadoAtual = resultados.resultados[String(jogo.id)];
      const apiGame = apiGamesMap[chave];

      // Se o jogo não está na API (não começou ainda), skip
      if (!apiGame) {
        if (resultadoAtual) {
          console.log(`[OK] ID ${jogo.id} (${jogo.casa} vs ${jogo.fora}): já registrado`);
        }
        continue;
      }

      // Se o jogo está na API, verificar se resultado mudou
      const novoResultado = {
        gols_casa: apiGame.gols_casa,
        gols_fora: apiGame.gols_fora,
      };

      const mudou = !resultadoAtual ||
                    resultadoAtual.gols_casa !== novoResultado.gols_casa ||
                    resultadoAtual.gols_fora !== novoResultado.gols_fora;

      if (mudou) {
        console.log(`[UPDATE] ID ${jogo.id} (${jogo.casa} vs ${jogo.fora}): ${novoResultado.gols_casa}x${novoResultado.gols_fora}`);
        if (resultadoAtual) {
          console.log(`        [BEFORE] ${resultadoAtual.gols_casa}x${resultadoAtual.gols_fora}`);
        }
        resultados.resultados[String(jogo.id)] = novoResultado;
        jogoAtualizado = {
          id: jogo.id,
          casa: jogo.casa,
          fora: jogo.fora,
          resultado: novoResultado,
        };
        break; // Para no primeiro jogo com mudança
      } else if (resultadoAtual) {
        console.log(`[OK] ID ${jogo.id}: sem mudanças`);
      }
    }

    // 5. Save results if anything changed
    if (jogoAtualizado) {
      console.log(`[SAVE] Gravando resultados...`);
      writeJson(resultadosFile, resultados);
      tracker.last_processed_id = jogoAtualizado.id;
      tracker.last_updated = new Date().toISOString();
      writeJson(trackerFile, tracker);
      console.log(`[SUCCESS] Resultado do jogo ID ${jogoAtualizado.id} atualizado com sucesso!`);
      console.log(`[COMMIT] Será commitado com mensagem: [AUTO] Atualizar resultado do jogo ID ${jogoAtualizado.id}`);
    } else {
      console.log(`[NO-CHANGE] Nenhum resultado novo para processar`);
    }

  } catch (err) {
    console.error(`[FATAL] ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
