# Gerador de Vouchers UniFi

Este projeto permite gerar vouchers para acesso à rede UniFi Controller de forma automatizada, expondo uma interface web simples para o usuário final.

## Instalação e Uso

### Opção 1: Usando Docker (Recomendado)

A maneira mais fácil de instalar e usar o gerador de vouchers é através do Docker. Você precisará ter o Docker e o Docker Compose instalados em sua máquina.

1.  **Crie um arquivo `docker-compose.yml`:**

    Crie um arquivo chamado `docker-compose.yml` em um diretório de sua escolha no seu computador com o seguinte conteúdo. Este arquivo instruirá o Docker Compose a baixar os arquivos diretamente do repositório:

    ```yaml
    services:
      unifi-portal:
        image: <IMAGEM_DO_REPOSITORIO>  # Substitua por sua imagem Docker, se aplicável
        build:
          context: https://github.com/robertocjunior/unifi-token-generator.git
        container_name: unifi_portal_service
        ports:
          - "80:80"
        restart: unless-stopped
        volumes:
          - ./unifi_config.json:/usr/src/app/unifi_config.json
        environment:
          - UNIFI_CRYPTO_KEY=${UNIFI_CRYPTO_KEY:-c1a7b3f2e5d609c8a1b3f4e5d609c8a1b3f2e5d609c8a1b3f2e5d609c8a1b3f2}
          - UNIFI_CRYPTO_IV=${UNIFI_CRYPTO_IV:-f0e1d2c3b4a5968778695a4b3c2d1e0f}
          # Adicione outras variáveis de ambiente necessárias
    ```
    _Substitua `<IMAGEM_DO_REPOSITORIO>` pelo nome da sua imagem Docker, se você já tiver uma publicada._ Caso contrário, o `build` irá construir a imagem localmente.

3.  **Inicie o serviço:**
    ```bash
    docker-compose up -d
    ```

4.  **Acesse a interface:**

    Abra seu navegador e vá para `http://localhost` (ou o IP da sua máquina se estiver acessando de outra rede).

5.  **Configure as credenciais do UniFi:**

    Acesse `http://localhost/admin-config` para inserir a URL, Site ID, usuário e senha do seu UniFi Controller. Estas informações serão armazenadas de forma criptografada.

6.  **Gere vouchers:**

    Na página principal (`http://localhost`), selecione o tempo de expiração desejado e clique em "Gerar Token".

### Opção 2: Execução Manual (Para desenvolvimento ou testes)

Se você quiser rodar o projeto diretamente com o Node.js (sem Docker):

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/robertocjunior/unifi-token-generator.git
    cd unifi-portal
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Crie o arquivo de configuração:**

    Na primeira execução, o sistema tentará criar um arquivo `unifi_config.json`. Se houver erros de permissão (o que é comum fora do contêiner Docker), você precisará criá-lo manualmente na raiz do projeto com o seguinte conteúdo (substituindo pelas suas informações):

    ```json
    {
      "controllerUrl": "https://<SEU_UNIFI_CONTROLLER>:8443",
      "siteId": "<SEU_SITE_ID>",
      "username": "<SEU_USUARIO>",
      "password": "<SUA_SENHA_CRIPTOGRAFADA>"
    }
    ```
    _**Importante:**_ A senha deve ser criptografada usando o mesmo algoritmo e chaves definidos no `server.js`. Se você não tiver um arquivo de configuração existente para copiar a senha criptografada, será necessário executar o servidor pelo menos uma vez (mesmo que falhe ao salvar as configurações devido à permissão de escrita), preencher o formulário de administração (`/admin-config`) e então copiar a senha criptografada do log do servidor para o `unifi_config.json` manual.  Alternativamente, você pode modificar o código temporariamente para exibir a senha criptografada no console ao salvar a configuração pela interface de administração (e depois remover essa modificação).

4.  **Inicie o servidor:**
    ```bash
    node server.js
    ```

5.  **Acesse e configure:**

    Abra o navegador e acesse `http://localhost:80` para usar o gerador ou `http://localhost:80/admin-config` para configurar.

## Variáveis de Ambiente (Opcional/Avançado)

Para uma configuração mais segura e flexível, você pode definir as chaves de criptografia como variáveis de ambiente em vez de usar os valores padrão no código. No seu sistema ou no ambiente do Docker Compose, defina:

*   `UNIFI_CRYPTO_KEY`: Uma chave hexadecimal de 64 caracteres (32 bytes).
*   `UNIFI_CRYPTO_IV`: Um IV hexadecimal de 32 caracteres (16 bytes).

Se essas variáveis estiverem definidas, o servidor as usará automaticamente. Caso contrário, os valores padrão no código serão utilizados.

## Segurança

*   O tráfego entre o servidor e o UniFi Controller (na porta 8443 por padrão) é feito via HTTPS.
*   A senha do UniFi Controller é armazenada criptografada no arquivo `unifi_config.json`.
*   **Aviso:** O projeto atualmente ignora a validação do certificado SSL do UniFi Controller (`rejectUnauthorized: false`). Para um ambiente de produção, é altamente recomendado obter um certificado válido para o seu Controller ou configurar o servidor para confiar em um certificado autoassinado.

## Problemas Comuns

*   **Erro de login (status 400):** Verifique cuidadosamente se a URL, o Site ID, o usuário e a senha do Controller estão corretos. A URL não deve ter uma barra "/" no final.
*   **"O sistema não está configurado":** Acesse `/admin-config` para inserir as credenciais do UniFi Controller.
*   **"Falha ao salvar o arquivo de configuração":** Verifique as permissões de escrita no diretório do projeto, especialmente se estiver executando fora do Docker. No Docker, certifique-se de que o volume para `unifi_config.json` esteja corretamente configurado no `docker-compose.yml`.

Se você encontrar outros erros, verifique os logs do servidor (ex: no terminal onde você o iniciou ou usando `docker-compose logs unifi-portal`).