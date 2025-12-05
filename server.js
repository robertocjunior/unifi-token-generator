// server.js
require('dotenv').config(); 
const express = require('express');
const fetch = require('node-fetch');
const https = require('https');
const path = require('path');

// Verifica se as variáveis obrigatórias existem ao iniciar
if (!process.env.UNIFI_CONTROLLER_URL || !process.env.UNIFI_USERNAME || !process.env.UNIFI_PASSWORD) {
    console.error('ERRO CRÍTICO: Variáveis de ambiente não configuradas.');
    console.error('Crie um arquivo .env com: UNIFI_CONTROLLER_URL, UNIFI_SITE_ID, UNIFI_USERNAME e UNIFI_PASSWORD');
    process.exit(1); // Encerra o servidor se não houver config
}

// Carrega configurações da memória
const config = {
    CONTROLLER_URL: process.env.UNIFI_CONTROLLER_URL.replace(/\/+$/, ''),
    SITE_ID: process.env.UNIFI_SITE_ID || 'default',
    USERNAME: process.env.UNIFI_USERNAME,
    PASSWORD: process.env.UNIFI_PASSWORD
};

const app = express();
const port = 80;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rota única para gerar o token
app.post('/api/gerar-token', async (req, res) => {
    const { expiration } = req.body;

    if (!expiration) {
        return res.status(400).json({ error: 'Tempo de expiração não fornecido.' });
    }

    // Ignora erro de certificado SSL (comum em UniFi local)
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    
    try {
        // 1. Login
        const loginResponse = await fetch(`${config.CONTROLLER_URL}/api/login`, {
            method: 'POST',
            agent: httpsAgent,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: config.USERNAME, password: config.PASSWORD }),
        });

        if (!loginResponse.ok) throw new Error(`Falha no login (status: ${loginResponse.status})`);
        
        const cookie = loginResponse.headers.get('set-cookie');
        if (!cookie) throw new Error('Falha no login: Nenhum cookie retornado.');

        // 2. Criar Voucher
        const uniqueNote = 'token-' + Date.now();
        const createResponse = await fetch(`${config.CONTROLLER_URL}/api/s/${config.SITE_ID}/cmd/hotspot`, {
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

        if (!createResponse.ok) throw new Error('Erro ao solicitar criação do voucher.');
        
        // Pequena pausa para o controller processar
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 3. Buscar o código do voucher recém-criado
        const listResponse = await fetch(`${config.CONTROLLER_URL}/api/s/${config.SITE_ID}/stat/voucher`, {
            method: 'POST',
            agent: httpsAgent,
            headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
            body: JSON.stringify({}),
        });

        const data = await listResponse.json();
        const voucher = data.data ? data.data.find(v => v.note === uniqueNote) : null;

        if (voucher) {
            res.json({ token: voucher.code });
        } else {
            throw new Error('Voucher criado, mas código não encontrado.');
        }

    } catch (error) {
        console.error('Erro:', error.message);
        res.status(500).json({ error: 'Erro de comunicação com o UniFi Controller.' });
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});