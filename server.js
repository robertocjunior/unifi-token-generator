// server.js
const express = require('express');
const fetch = require('node-fetch');
const https = require('https');
const fs = require('fs').promises; // Usar a versão de promises do fs
const crypto = require('crypto');
const path = require('path');

// --- Configuração de Criptografia ---
const ALGORITHM = 'aes-256-cbc';
// IMPORTANTE: Em produção, use variáveis de ambiente para a chave e IV!
// Para gerar uma chave segura (32 bytes): crypto.randomBytes(32).toString('hex')
// Para gerar um IV seguro (16 bytes): crypto.randomBytes(16).toString('hex')
const SECRET_KEY_HEX = process.env.UNIFI_CRYPTO_KEY || 'c1a7b3f2e5d609c8a1b3f4e5d609c8a1b3f2e5d609c8a1b3f2e5d609c8a1b3f2'; // 64 chars hex
const IV_HEX = process.env.UNIFI_CRYPTO_IV || 'f0e1d2c3b4a5968778695a4b3c2d1e0f'; // 32 chars hex

const CONFIG_FILE_PATH = path.join(__dirname, 'unifi_config.json');

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
            controllerUrl: configData.controllerUrl.replace(/\/+$/, ''), // Remove uma ou mais barras finais
            siteId: configData.siteId,
            username: configData.username,
            // Criptografa apenas a senha para este exemplo, mas você pode criptografar mais campos
            password: encrypt(configData.password)
        };
        // Para criptografar o objeto inteiro:
        // const encryptedData = encrypt(JSON.stringify(configData));
        // await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify({ data: encryptedData }));
        await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(dataToStore, null, 2)); // Salva com a senha criptografada
        console.log('Configuração salva com sucesso em:', CONFIG_FILE_PATH);
    } catch (error) {
        console.error('Erro ao salvar configuração:', error);
        throw new Error('Falha ao salvar o arquivo de configuração.');
    }
}

let currentConfig = null;

async function loadConfig() {
    try {
        const fileContent = await fs.readFile(CONFIG_FILE_PATH, 'utf8');
        const parsedConfig = JSON.parse(fileContent);

        // Se você criptografou o objeto inteiro, use este bloco:
        // if (parsedConfig.data) {
        //     const decryptedData = decrypt(parsedConfig.data);
        //     currentConfig = JSON.parse(decryptedData);
        // } else { throw new Error('Formato de arquivo de configuração inválido (sem data).');}

        // Se criptografou apenas a senha:
        if (parsedConfig.password) {
            currentConfig = {
                ...parsedConfig,
                PASSWORD: decrypt(parsedConfig.password) // Renomeia para maiúsculas para consistência interna
            };
             // Renomeia para maiúsculas para consistência interna
            currentConfig.CONTROLLER_URL = parsedConfig.controllerUrl;
            currentConfig.SITE_ID = parsedConfig.siteId;
            currentConfig.USERNAME = parsedConfig.username;

        } else {
            throw new Error('Formato de arquivo de configuração inválido (sem senha criptografada).');
        }

        console.log('Configuração carregada com sucesso.');
        return currentConfig;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`Arquivo de configuração (${path.basename(CONFIG_FILE_PATH)}) não encontrado.`);
        } else {
            console.error('Erro ao carregar ou descriptografar configuração:', error.message);
        }
        currentConfig = null; // Garante que está nulo se houver falha
        return null;
    }
}

// =============================================
// === Servidor Principal de Voucher (Porta 80) ===
// =============================================
const mainApp = express();
const mainPort = 80;

// Middleware para parsear JSON e dados de formulário URL-encoded
mainApp.use(express.json());
mainApp.use(express.urlencoded({ extended: true })); // Adicionado para o formulário de admin

// Servir arquivos estáticos da pasta 'public' (incluindo index.html e admin.html)
mainApp.use(express.static(path.join(__dirname, 'public')));

// Rota para a página de configuração do admin
mainApp.get('/admin-config', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Rota para salvar as configurações (usada pela página de admin)
mainApp.post('/api/save-config', async (req, res) => {
    const { controllerUrl, siteId, username, password } = req.body;
    if (!controllerUrl || !siteId || !username || !password) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }
    try {
        await saveConfig({ controllerUrl, siteId, username, password });
        await loadConfig(); // Recarrega a configuração
        res.json({ message: 'Configurações salvas com sucesso!' });
    } catch (error) {
        console.error("Erro em /api/save-config:", error);
        res.status(500).json({ error: error.message || "Erro interno ao salvar configurações." });
    }
});

mainApp.post('/api/gerar-token', async (req, res) => {
    if (!currentConfig || !currentConfig.CONTROLLER_URL) { // Verifica se a config foi carregada
        return res.status(503).json({ error: 'O sistema não está configurado. Por favor, acesse a página de administração para configurar as credenciais do UniFi Controller.' });
    }

    // Usa as variáveis de currentConfig que foram carregadas e processadas
    const { CONTROLLER_URL, SITE_ID, USERNAME, PASSWORD } = currentConfig;
    const { expiration } = req.body;

    if (!expiration) {
        return res.status(400).json({ error: 'Tempo de expiração não fornecido.' });
    }

    const httpsAgent = new https.Agent({
        rejectUnauthorized: false, // CUIDADO: Ignora a validação do certificado SSL.
    });

    let cookie;

    try {
        const loginResponse = await fetch(`${CONTROLLER_URL}/api/login`, {
            method: 'POST',
            agent: httpsAgent,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
        });

        if (!loginResponse.ok) {
            const errorBody = await loginResponse.text();
            console.error(`Falha no login - Status: ${loginResponse.status}, Corpo: ${errorBody}`);
            throw new Error(`Falha no login no UniFi Controller (status: ${loginResponse.status}). Verifique as credenciais e a URL do controller.`);
        }
        
        cookie = loginResponse.headers.get('set-cookie');
        if (!cookie) {
            throw new Error('Falha no login: Nenhum cookie de sessão retornado. Verifique as credenciais.');
        }

        const uniqueNote = 'token-' + Date.now();
        const createVoucherResponse = await fetch(`${CONTROLLER_URL}/api/s/${SITE_ID}/cmd/hotspot`, {
            method: 'POST',
            agent: httpsAgent,
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookie,
            },
            body: JSON.stringify({
                cmd: 'create-voucher',
                n: 1,
                expire: parseInt(expiration),
                note: uniqueNote,
            }),
        });

        if (!createVoucherResponse.ok) {
            const errorBody = await createVoucherResponse.text();
            console.error(`Falha ao criar voucher - Status: ${createVoucherResponse.status}, Corpo: ${errorBody}`);
            throw new Error(`Falha ao criar voucher (status: ${createVoucherResponse.status}).`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1500));

        const vouchersResponse = await fetch(`${CONTROLLER_URL}/api/s/${SITE_ID}/stat/voucher`, {
            method: 'POST',
            agent: httpsAgent,
            headers: { 
                'Content-Type': 'application/json',
                'Cookie': cookie 
            },
            body: JSON.stringify({}),
        });

        if (!vouchersResponse.ok) {
            const errorBody = await vouchersResponse.text();
            console.error(`Falha ao buscar vouchers - Status: ${vouchersResponse.status}, Corpo: ${errorBody}`);
            throw new Error(`Falha ao buscar vouchers (status: ${vouchersResponse.status}).`);
        }

        const vouchersData = await vouchersResponse.json();
        if (!vouchersData || !vouchersData.data) {
            console.error('Resposta inesperada ao buscar vouchers:', vouchersData);
            throw new Error('Resposta inesperada do UniFi Controller ao buscar vouchers.');
        }

        const createdVoucher = vouchersData.data.find(v => v.note === uniqueNote);

        if (createdVoucher) {
            res.json({ token: createdVoucher.code });
        } else {
            console.warn('Voucher criado mas não encontrado na lista. Nota:', uniqueNote);
            throw new Error('Voucher criado, mas não encontrado na lista. Tente novamente.');
        }

    } catch (error) {
        console.error('Erro no processo de geração de token:', error.message);
        res.status(500).json({ error: error.message || 'Erro interno do servidor ao gerar token.' });
    } finally {
        if (cookie && CONTROLLER_URL) {
            try {
                await fetch(`${CONTROLLER_URL}/api/logout`, {
                    method: 'POST',
                    agent: httpsAgent,
                    headers: { 'Cookie': cookie },
                });
            } catch (logoutError) {
                console.error('Erro durante o logout (ignorado):', logoutError.message);
            }
        }
    }
});

// Carregar configuração ao iniciar o servidor principal
loadConfig().then(() => {
    mainApp.listen(mainPort, () => {
        // A mensagem "Configuração carregada com sucesso." é exibida pela função loadConfig() se bem-sucedida,
        // aparecendo antes das mensagens abaixo.
        console.log(`Servidor de voucher rodando em http://localhost:${mainPort}`);
        console.log(`Servidor de configuração rodando em http://localhost:${mainPort}/admin-config`);

        if (!currentConfig) {
            console.warn(`\nAVISO: As credenciais do UniFi Controller não estão configuradas ou não puderam ser carregadas.`);
            console.warn(`       Acesse http://localhost:${mainPort}/admin-config para configurar.`);
        }
    });
}).catch(err => {
    console.error("Falha crítica ao tentar carregar a configuração inicial:", err);
    mainApp.listen(mainPort, () => { // Tenta iniciar mesmo assim para a página de admin funcionar
        console.log(`Servidor de voucher rodando em http://localhost:${mainPort} (com erros de configuração).`);
        console.log(`Servidor de configuração rodando em http://localhost:${mainPort}/admin-config (disponível para correção).`);
        console.warn(`\nAVISO: Falha ao carregar configuração. Acesse http://localhost:${mainPort}/admin-config para configurar.`);
    });
});
