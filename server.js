// server.js
require('dotenv').config(); // Carrega variáveis do arquivo .env se existir
const express = require('express');
const fetch = require('node-fetch');
const https = require('https');
const fs = require('fs').promises;
const crypto = require('crypto');
const path = require('path');

// --- Configuração de Criptografia (Mantida para legado/fallback) ---
const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY_HEX = process.env.UNIFI_CRYPTO_KEY || 'c1a7b3f2e5d609c8a1b3f4e5d609c8a1b3f2e5d609c8a1b3f2e5d609c8a1b3f2';
const IV_HEX = process.env.UNIFI_CRYPTO_IV || 'f0e1d2c3b4a5968778695a4b3c2d1e0f';

const CONFIG_FILE_PATH = path.join(__dirname, 'unifi_config.json');

// Funções de criptografia (usadas apenas se salvar em arquivo)
function encrypt(text) {
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(SECRET_KEY_HEX, 'hex'), Buffer.from(IV_HEX, 'hex'));
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

function decrypt(encryptedText) {
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(SECRET_KEY_HEX, 'hex'), Buffer.from(IV_HEX, 'hex'));
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

async function saveConfig(configData) {
    try {
        const dataToStore = {
            controllerUrl: configData.controllerUrl.replace(/\/+$/, ''),
            siteId: configData.siteId,
            username: configData.username,
            password: encrypt(configData.password)
        };
        await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(dataToStore, null, 2));
        console.log('Configuração salva com sucesso em:', CONFIG_FILE_PATH);
    } catch (error) {
        console.error('Erro ao salvar configuração:', error);
        throw new Error('Falha ao salvar o arquivo de configuração.');
    }
}

let currentConfig = null;
let isUsingEnvVars = false; // Flag para saber a origem da configuração

async function loadConfig() {
    // 1. Tenta carregar via Variáveis de Ambiente (Prioridade / Mais Seguro)
    if (process.env.UNIFI_CONTROLLER_URL && process.env.UNIFI_USERNAME && process.env.UNIFI_PASSWORD) {
        console.log('Carregando configurações via Variáveis de Ambiente (.env)...');
        currentConfig = {
            CONTROLLER_URL: process.env.UNIFI_CONTROLLER_URL.replace(/\/+$/, ''),
            SITE_ID: process.env.UNIFI_SITE_ID || 'default',
            USERNAME: process.env.UNIFI_USERNAME,
            PASSWORD: process.env.UNIFI_PASSWORD // Senha vem pura do .env (seguro pois está no ambiente)
        };
        isUsingEnvVars = true;
        console.log('Configuração via ambiente carregada com sucesso.');
        return currentConfig;
    }

    // 2. Fallback: Tenta carregar do arquivo JSON (Modo antigo)
    try {
        console.log('Variáveis de ambiente não encontradas. Tentando carregar unifi_config.json...');
        const fileContent = await fs.readFile(CONFIG_FILE_PATH, 'utf8');
        const parsedConfig = JSON.parse(fileContent);

        if (parsedConfig.password) {
            currentConfig = {
                CONTROLLER_URL: parsedConfig.controllerUrl,
                SITE_ID: parsedConfig.siteId,
                USERNAME: parsedConfig.username,
                PASSWORD: decrypt(parsedConfig.password)
            };
            isUsingEnvVars = false;
        } else {
            throw new Error('Arquivo de configuração inválido.');
        }

        console.log('Configuração via arquivo carregada com sucesso.');
        return currentConfig;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`Arquivo de configuração não encontrado e variáveis de ambiente ausentes.`);
        } else {
            console.error('Erro ao carregar configuração:', error.message);
        }
        currentConfig = null;
        return null;
    }
}

// =============================================
// === Servidor Principal ===
// =============================================
const mainApp = express();
const mainPort = 80;

mainApp.use(express.json());
mainApp.use(express.urlencoded({ extended: true }));
mainApp.use(express.static(path.join(__dirname, 'public')));

// Middleware de segurança para rotas de Admin
const adminGuard = (req, res, next) => {
    if (isUsingEnvVars) {
        return res.status(403).send('<h1>Acesso Negado</h1><p>A configuração está sendo gerenciada via variáveis de ambiente. A interface de administração está desativada por segurança.</p>');
    }
    next();
};

// Rotas de Admin (protegidas pelo adminGuard)
mainApp.get('/admin-config', adminGuard, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

mainApp.post('/api/save-config', adminGuard, async (req, res) => {
    const { controllerUrl, siteId, username, password } = req.body;
    if (!controllerUrl || !siteId || !username || !password) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }
    try {
        await saveConfig({ controllerUrl, siteId, username, password });
        await loadConfig();
        res.json({ message: 'Configurações salvas com sucesso!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

mainApp.post('/api/gerar-token', async (req, res) => {
    if (!currentConfig || !currentConfig.CONTROLLER_URL) {
        // Mensagem de erro adaptada dependendo do modo
        const msg = isUsingEnvVars 
            ? 'Erro de configuração no servidor (.env inválido).' 
            : 'O sistema não está configurado. Acesse /admin-config.';
        return res.status(503).json({ error: msg });
    }

    const { CONTROLLER_URL, SITE_ID, USERNAME, PASSWORD } = currentConfig;
    const { expiration } = req.body;

    if (!expiration) {
        return res.status(400).json({ error: 'Tempo de expiração não fornecido.' });
    }

    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    let cookie;

    try {
        // 1. Login
        const loginResponse = await fetch(`${CONTROLLER_URL}/api/login`, {
            method: 'POST',
            agent: httpsAgent,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
        });

        if (!loginResponse.ok) throw new Error(`Falha no login (status: ${loginResponse.status}).`);
        
        cookie = loginResponse.headers.get('set-cookie');
        if (!cookie) throw new Error('Sem cookie de sessão.');

        // 2. Criar Voucher
        const uniqueNote = 'token-' + Date.now();
        const createVoucherResponse = await fetch(`${CONTROLLER_URL}/api/s/${SITE_ID}/cmd/hotspot`, {
            method: 'POST',
            agent: httpsAgent,
            headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
            body: JSON.stringify({
                cmd: 'create-voucher',
                n: 1,
                expire: parseInt(expiration),
                note: uniqueNote,
            }),
        });

        if (!createVoucherResponse.ok) throw new Error('Falha ao criar comando de voucher.');
        
        // Pequeno delay para garantir processamento no controller
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 3. Buscar código do Voucher
        const vouchersResponse = await fetch(`${CONTROLLER_URL}/api/s/${SITE_ID}/stat/voucher`, {
            method: 'POST',
            agent: httpsAgent,
            headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
            body: JSON.stringify({}),
        });

        if (!vouchersResponse.ok) throw new Error('Falha ao listar vouchers.');

        const vouchersData = await vouchersResponse.json();
        const createdVoucher = vouchersData.data ? vouchersData.data.find(v => v.note === uniqueNote) : null;

        if (createdVoucher) {
            res.json({ token: createdVoucher.code });
        } else {
            throw new Error('Voucher criado mas não encontrado.');
        }

    } catch (error) {
        console.error('Erro:', error.message);
        res.status(500).json({ error: 'Erro ao comunicar com UniFi Controller.' });
    }
});

loadConfig().then(() => {
    mainApp.listen(mainPort, () => {
        console.log(`Servidor rodando em http://localhost:${mainPort}`);
        if (isUsingEnvVars) {
            console.log("🔒 Modo Seguro: Rota /admin-config desativada (usando .env).");
        } else {
            console.log("⚠️ Modo Legado: Rota /admin-config ativa.");
        }
    });
});